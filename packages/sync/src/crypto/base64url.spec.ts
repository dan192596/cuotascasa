import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeBase64Url, encodeBase64Url } from './base64url.ts';

const bytes = (...values: number[]): Uint8Array<ArrayBuffer> => new Uint8Array(values);

describe('base64url (RFC 4648 §5, no padding)', () => {
  it('encodes the RFC 4648 test vectors without padding', () => {
    const vectors: [string, string][] = [
      ['', ''],
      ['f', 'Zg'],
      ['fo', 'Zm8'],
      ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg'],
      ['fooba', 'Zm9vYmE'],
      ['foobar', 'Zm9vYmFy'],
    ];
    for (const [plain, encoded] of vectors) {
      expect(encodeBase64Url(new TextEncoder().encode(plain))).toBe(encoded);
      expect(decodeBase64Url(encoded)).toEqual(new TextEncoder().encode(plain));
    }
  });

  it('uses the URL-safe alphabet (- and _ instead of + and /)', () => {
    expect(encodeBase64Url(bytes(0xfb, 0xff, 0xbf))).toBe('-_-_');
    expect(decodeBase64Url('-_-_')).toEqual(bytes(0xfb, 0xff, 0xbf));
  });

  it('round-trips arbitrary bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (input) => {
        const copy = new Uint8Array(input);
        expect(decodeBase64Url(encodeBase64Url(copy))).toEqual(copy);
      }),
    );
  });

  it.each([
    ['standard alphabet +', 'ab+c'],
    ['standard alphabet /', 'ab/c'],
    ['padding', 'Zg=='],
    ['whitespace', 'Zm9 v'],
    ['impossible length', 'Zm9vY'],
    ['non-ASCII', 'Zm9ñ'],
  ])('rejects %s', (_label, input) => {
    expect(decodeBase64Url(input)).toBeNull();
  });

  it('rejects non-canonical encodings whose unused trailing bits are set', () => {
    // 'Zg' is the canonical encoding of 'f'; 'Zh' decodes to the same byte with a non-zero padding bit.
    expect(decodeBase64Url('Zh')).toBeNull();
    expect(decodeBase64Url('Zm9')).toBeNull();
    expect(decodeBase64Url('Zm8')).toEqual(new TextEncoder().encode('fo'));
  });
});
