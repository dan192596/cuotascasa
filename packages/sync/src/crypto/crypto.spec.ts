import fc from 'fast-check';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ENVELOPE_FORMAT,
  PBKDF2_ITERATIONS,
  SyncError,
  type EncryptedEnvelopeV1,
  type StoredKey,
  type SyncErrorCode,
} from '../ports.ts';
import { decodeBase64Url, encodeBase64Url } from './base64url.ts';
import { MAX_PBKDF2_ITERATIONS } from './envelope.ts';
import {
  SALT_BYTES,
  changePassphrase,
  decrypt,
  deriveKey,
  deriveStoredKey,
  encrypt,
  generateSalt,
  parseEnvelope,
  serializeEnvelope,
} from './index.ts';

/** Test-only reduced cost; production code always defaults to PBKDF2_ITERATIONS. */
const TEST_ITERATIONS = 1_000;
const TEST_FLOOR = { minIterations: TEST_ITERATIONS } as const;
const PASSPHRASE = 'frase sintética de prueba ñandú 🔐';
const OTHER_PASSPHRASE = 'otra frase sintética de prueba';
const PLAINTEXT = JSON.stringify({ synthetic: true, note: 'respaldo sintético de prueba' });

async function testKey(passphrase: string = PASSPHRASE, saltId?: string): Promise<StoredKey> {
  return deriveStoredKey(passphrase, { saltId, iterations: TEST_ITERATIONS });
}

async function expectSyncError(promise: Promise<unknown>, code: SyncErrorCode): Promise<SyncError> {
  const error: unknown = await promise.then(
    () => {
      throw new Error('expected a SyncError rejection');
    },
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(SyncError);
  const syncError = error as SyncError;
  expect(syncError.code).toBe(code);
  expect(syncError.message).toBe(code);
  expect(syncError.cause).toBeUndefined();
  return syncError;
}

function expectNoSecrets(error: unknown, ...secrets: string[]): void {
  const rendered = [
    String(error),
    error instanceof Error ? (error.stack ?? '') : '',
    JSON.stringify(error, Object.getOwnPropertyNames(error as object)),
  ].join('\n');
  for (const secret of secrets) {
    expect(rendered).not.toContain(secret);
  }
}

function without(envelope: EncryptedEnvelopeV1, field: keyof EncryptedEnvelopeV1): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...envelope };
  delete copy[field];
  return copy;
}

function flipByte(field: string, index: number): string {
  const bytes = decodeBase64Url(field);
  if (bytes === null) {
    throw new Error('test helper: invalid base64url');
  }
  bytes[index] = (bytes[index] ?? 0) ^ 0x01;
  return encodeBase64Url(bytes);
}

let key: StoredKey;
let envelope: EncryptedEnvelopeV1;

beforeAll(async () => {
  key = await testKey();
  envelope = await encrypt(key, PLAINTEXT);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('production parameters', () => {
  it('pins the production PBKDF2 iteration count at exactly 600000', () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });

  it('deriveKey and deriveStoredKey default to 600000 iterations', async () => {
    const salt = generateSalt();
    const explicit = await deriveKey(PASSPHRASE, salt, 600_000);
    const byDefault = await deriveKey(PASSPHRASE, salt);
    const saltId = encodeBase64Url(salt);
    const sealed = await encrypt({ key: explicit, saltId, iterations: 600_000 }, PLAINTEXT);
    expect(sealed.kdf.iterations).toBe(600_000);
    await expect(decrypt({ key: byDefault, saltId, iterations: 600_000 }, sealed)).resolves.toBe(PLAINTEXT);

    const stored = await deriveStoredKey(PASSPHRASE, { saltId });
    expect(stored.iterations).toBe(600_000);
    await expect(decrypt(stored, sealed)).resolves.toBe(PLAINTEXT);
  });

  it('decrypt rejects test-strength envelopes when no lower floor is passed', async () => {
    await expectSyncError(decrypt(key, envelope), 'WeakParams');
  });
});

describe('deriveKey', () => {
  it('gives a non-extractable AES-GCM 256 key usable only to encrypt and decrypt', async () => {
    const derived = await deriveKey(PASSPHRASE, generateSalt(), TEST_ITERATIONS);
    expect(derived.extractable).toBe(false);
    expect(derived.type).toBe('secret');
    expect(derived.algorithm).toEqual({ name: 'AES-GCM', length: 256 });
    expect([...derived.usages].sort()).toEqual(['decrypt', 'encrypt']);
    await expect(crypto.subtle.exportKey('raw', derived)).rejects.toThrow();
  });

  it('is deterministic for the same passphrase, salt and iterations', async () => {
    const saltId = key.saltId;
    const again = await testKey(PASSPHRASE, saltId);
    await expect(decrypt(again, envelope, TEST_FLOOR)).resolves.toBe(PLAINTEXT);
  });

  it('normalizes the passphrase to NFC so composed and decomposed input derive the same key', async () => {
    const composed = 'contraseña';
    const decomposed = 'contraseña';
    expect(composed).not.toBe(decomposed);
    const a = await testKey(composed);
    const b = await testKey(decomposed, a.saltId);
    await expect(decrypt(b, await encrypt(a, PLAINTEXT), TEST_FLOOR)).resolves.toBe(PLAINTEXT);
  });

  it.each([
    ['an empty passphrase', () => deriveKey('', generateSalt(), TEST_ITERATIONS)],
    ['a salt shorter than 16 bytes', () => deriveKey(PASSPHRASE, new Uint8Array(15), TEST_ITERATIONS)],
    ['zero iterations', () => deriveKey(PASSPHRASE, generateSalt(), 0)],
    ['fractional iterations', () => deriveKey(PASSPHRASE, generateSalt(), 1000.5)],
    ['iterations above the cap', () => deriveKey(PASSPHRASE, generateSalt(), 10_000_001)],
    ['deriveStoredKey above the cap', () => deriveStoredKey(PASSPHRASE, { iterations: 10_000_001 })],
    [
      'changePassphrase above the cap',
      () => changePassphrase(key, envelope, PASSPHRASE, { iterations: 10_000_001, minIterations: TEST_ITERATIONS }),
    ],
  ])('rejects %s without echoing the passphrase', async (_label, call) => {
    const error: unknown = await call().then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(RangeError);
    expectNoSecrets(error, PASSPHRASE);
  });

  it('caps PBKDF2 iterations at exactly 10,000,000', async () => {
    expect(MAX_PBKDF2_ITERATIONS).toBe(10_000_000);
    const atCap = vi.spyOn(crypto.subtle, 'deriveKey').mockRejectedValue(new Error('stop before deriving'));
    await expect(deriveKey(PASSPHRASE, generateSalt(), MAX_PBKDF2_ITERATIONS)).rejects.toThrow('stop before deriving');
    expect(atCap).toHaveBeenCalledTimes(1);
  });

  it('deriveStoredKey rejects a saltId that is not canonical base64url', async () => {
    await expect(deriveStoredKey(PASSPHRASE, { saltId: 'not base64!', iterations: TEST_ITERATIONS })).rejects.toThrow(
      RangeError,
    );
  });
});

describe('generateSalt', () => {
  it('returns 16 fresh random bytes', () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(SALT_BYTES).toBe(16);
    expect(a).toHaveLength(16);
    expect(a).not.toEqual(b);
  });
});

describe('encrypt', () => {
  it('produces an envelope v1 with exactly the ADR-0009 fields', () => {
    expect(Object.keys(envelope).sort()).toEqual(['cipher', 'ct', 'format', 'kdf', 'v']);
    expect(envelope.format).toBe(ENVELOPE_FORMAT);
    expect(envelope.v).toBe(1);
    expect(envelope.kdf).toEqual({ name: 'PBKDF2-SHA256', iterations: TEST_ITERATIONS, salt: key.saltId });
    expect(Object.keys(envelope.cipher).sort()).toEqual(['iv', 'name']);
    expect(envelope.cipher.name).toBe('AES-256-GCM');
    expect(decodeBase64Url(envelope.cipher.iv)).toHaveLength(12);
    expect(decodeBase64Url(envelope.kdf.salt)).toHaveLength(16);
    // AES-GCM ciphertext = plaintext length + 16-byte tag.
    expect(decodeBase64Url(envelope.ct)).toHaveLength(new TextEncoder().encode(PLAINTEXT).length + 16);
  });

  it('never leaves the plaintext or the passphrase in the envelope', () => {
    const text = serializeEnvelope(envelope);
    expect(text).not.toContain('sintético');
    expect(text).not.toContain(PASSPHRASE);
  });

  it('10,000 encryptions produce 10,000 distinct 12-byte IVs', async () => {
    const ivs = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) {
      const sealed = await encrypt(key, 'x');
      expect(decodeBase64Url(sealed.cipher.iv)).toHaveLength(12);
      ivs.add(sealed.cipher.iv);
    }
    expect(ivs.size).toBe(10_000);
  });

  it('draws every IV from crypto.getRandomValues', async () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');
    await encrypt(key, 'x');
    expect(spy).toHaveBeenCalledTimes(1);
    const [buffer] = spy.mock.calls[0] ?? [];
    expect(buffer).toBeInstanceOf(Uint8Array);
    expect((buffer as Uint8Array).byteLength).toBe(12);
  });

  it('rejects plaintext that is not well-formed Unicode without echoing it', async () => {
    const error: unknown = await encrypt(key, 'abc\uD800def').then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(TypeError);
    expectNoSecrets(error, 'abc', 'def');
  });

  it.each([
    ['a non-canonical saltId', { saltId: 'AAAAAAAAAAAAAAAAAAAAAB' }],
    ['a saltId shorter than 16 bytes', { saltId: 'AAAA' }],
    ['non-integer iterations', { iterations: 1.5 }],
  ])('rejects a StoredKey with %s', async (_label, patch) => {
    await expect(encrypt({ ...key, ...patch }, PLAINTEXT)).rejects.toThrow(RangeError);
  });
});

describe('round trip', () => {
  it('decrypts arbitrary well-formed UTF-8 payloads back to the same string', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ unit: 'binary', maxLength: 200 }), async (payload) => {
        const sealed = await encrypt(key, payload);
        await expect(decrypt(key, sealed, TEST_FLOOR)).resolves.toBe(payload);
      }),
      { numRuns: 200 },
    );
  });

  it('round-trips through serializeEnvelope and parseEnvelope', async () => {
    const parsed = parseEnvelope(serializeEnvelope(envelope));
    expect(parsed).toEqual(envelope);
    await expect(decrypt(key, parsed, TEST_FLOOR)).resolves.toBe(PLAINTEXT);
  });

  it('works for arbitrary passphrases', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ unit: 'binary', minLength: 1, maxLength: 40 }), async (passphrase) => {
        const k = await testKey(passphrase);
        await expect(decrypt(k, await encrypt(k, PLAINTEXT), TEST_FLOOR)).resolves.toBe(PLAINTEXT);
      }),
      { numRuns: 20 },
    );
  });
});

describe('decrypt failures', () => {
  it('a wrong passphrase gives WrongPassphraseOrTamper without plaintext or passphrase in the error', async () => {
    const wrong = await testKey(OTHER_PASSPHRASE, key.saltId);
    const error = await expectSyncError(decrypt(wrong, envelope, TEST_FLOOR), 'WrongPassphraseOrTamper');
    expectNoSecrets(error, PLAINTEXT, 'sintético', PASSPHRASE, OTHER_PASSPHRASE);
  });

  it('flipping any byte of ct gives WrongPassphraseOrTamper', async () => {
    const length = decodeBase64Url(envelope.ct)?.length ?? 0;
    expect(length).toBeGreaterThan(16);
    for (let i = 0; i < length; i += 1) {
      const error = await expectSyncError(
        decrypt(key, { ...envelope, ct: flipByte(envelope.ct, i) }, TEST_FLOOR),
        'WrongPassphraseOrTamper',
      );
      expectNoSecrets(error, PLAINTEXT, 'sintético');
    }
  });

  it('flipping any byte of the iv gives WrongPassphraseOrTamper', async () => {
    for (let i = 0; i < 12; i += 1) {
      const tampered = { ...envelope, cipher: { ...envelope.cipher, iv: flipByte(envelope.cipher.iv, i) } };
      await expectSyncError(decrypt(key, tampered, TEST_FLOOR), 'WrongPassphraseOrTamper');
    }
  });

  it('flipping any byte of the salt gives KeyMismatch, the typed error for a salt that differs', async () => {
    for (let i = 0; i < 16; i += 1) {
      const tampered = { ...envelope, kdf: { ...envelope.kdf, salt: flipByte(envelope.kdf.salt, i) } };
      await expectSyncError(decrypt(key, tampered, TEST_FLOOR), 'KeyMismatch');
    }
  });

  it('a salt tampered on both the envelope and the key is still caught by the AAD binding', async () => {
    const salt = flipByte(envelope.kdf.salt, 0);
    const tampered = { ...envelope, kdf: { ...envelope.kdf, salt } };
    await expectSyncError(decrypt({ ...key, saltId: salt }, tampered, TEST_FLOOR), 'WrongPassphraseOrTamper');
  });

  it('tampering the iteration count (bound as AAD) gives WrongPassphraseOrTamper', async () => {
    const tampered = { ...envelope, kdf: { ...envelope.kdf, iterations: TEST_ITERATIONS + 1 } };
    await expectSyncError(decrypt(key, tampered, TEST_FLOOR), 'WrongPassphraseOrTamper');
  });

  it('flipping any byte of the serialized envelope (header included) gives a typed SyncError', async () => {
    const text = serializeEnvelope(envelope);
    const accepted: SyncErrorCode[] = [
      'InvalidRemote',
      'UnsupportedVersion',
      'WeakParams',
      'KeyMismatch',
      'WrongPassphraseOrTamper',
    ];
    for (let i = 0; i < text.length; i += 1) {
      const flipped = text.slice(0, i) + String.fromCharCode(text.charCodeAt(i) ^ 0x01) + text.slice(i + 1);
      const error: unknown = await (async () => decrypt(key, parseEnvelope(flipped), TEST_FLOOR))().then(
        () => null,
        (reason: unknown) => reason,
      );
      expect(error, `byte ${i} was accepted`).toBeInstanceOf(SyncError);
      expect(accepted).toContain((error as SyncError).code);
      expectNoSecrets(error, PLAINTEXT, 'sintético', PASSPHRASE);
    }
  });
});

describe('rejection before any decryption attempt', () => {
  const cases: [string, (e: EncryptedEnvelopeV1) => unknown, SyncErrorCode][] = [
    ['v: 2', (e) => ({ ...e, v: 2 }), 'UnsupportedVersion'],
    ['v: 0', (e) => ({ ...e, v: 0 }), 'UnsupportedVersion'],
    ['v as a string', (e) => ({ ...e, v: '1' }), 'UnsupportedVersion'],
    ['missing v', (e) => without(e, 'v'), 'UnsupportedVersion'],
    ['an unknown KDF', (e) => ({ ...e, kdf: { ...e.kdf, name: 'PBKDF2-SHA1' } }), 'UnsupportedVersion'],
    ['an unknown cipher', (e) => ({ ...e, cipher: { ...e.cipher, name: 'AES-128-GCM' } }), 'UnsupportedVersion'],
    ['iterations 599999', (e) => ({ ...e, kdf: { ...e.kdf, iterations: 599_999 } }), 'WeakParams'],
    ['iterations 1', (e) => ({ ...e, kdf: { ...e.kdf, iterations: 1 } }), 'WeakParams'],
    ['iterations 0', (e) => ({ ...e, kdf: { ...e.kdf, iterations: 0 } }), 'WeakParams'],
    ['negative iterations', (e) => ({ ...e, kdf: { ...e.kdf, iterations: -600_000 } }), 'WeakParams'],
    ['iterations above the cap', (e) => ({ ...e, kdf: { ...e.kdf, iterations: 10_000_001 } }), 'WeakParams'],
    [
      'iterations at Number.MAX_SAFE_INTEGER',
      (e) => ({ ...e, kdf: { ...e.kdf, iterations: Number.MAX_SAFE_INTEGER } }),
      'WeakParams',
    ],
    [
      'a salt longer than 64 base64url characters',
      (e) => ({ ...e, kdf: { ...e.kdf, salt: encodeBase64Url(new Uint8Array(51)) } }),
      'WeakParams',
    ],
    [
      'a 65-character salt that is not even base64url',
      (e) => ({ ...e, kdf: { ...e.kdf, salt: 'A'.repeat(65) } }),
      'WeakParams',
    ],
    ['a salt of 8 bytes', (e) => ({ ...e, kdf: { ...e.kdf, salt: encodeBase64Url(new Uint8Array(8)) } }), 'WeakParams'],
    ['not an object', () => 'cuotascasa-enc', 'InvalidRemote'],
    ['null', () => null, 'InvalidRemote'],
    ['an array', () => [], 'InvalidRemote'],
    ['another format', (e) => ({ ...e, format: 'other-enc' }), 'InvalidRemote'],
    ['an extra top-level field', (e) => ({ ...e, synthetic: true }), 'WrongPassphraseOrTamper'],
    ['an extra kdf field', (e) => ({ ...e, kdf: { ...e.kdf, hash: 'SHA-256' } }), 'WrongPassphraseOrTamper'],
    ['an extra cipher field', (e) => ({ ...e, cipher: { ...e.cipher, tagLength: 96 } }), 'WrongPassphraseOrTamper'],
    ['a missing ct', (e) => without(e, 'ct'), 'WrongPassphraseOrTamper'],
    ['kdf not an object', (e) => ({ ...e, kdf: 'PBKDF2-SHA256' }), 'WrongPassphraseOrTamper'],
    ['cipher null', (e) => ({ ...e, cipher: null }), 'WrongPassphraseOrTamper'],
    ['iterations as a string', (e) => ({ ...e, kdf: { ...e.kdf, iterations: '600000' } }), 'WrongPassphraseOrTamper'],
    ['fractional iterations', (e) => ({ ...e, kdf: { ...e.kdf, iterations: 600_000.5 } }), 'WrongPassphraseOrTamper'],
    ['a ct that is not base64url', (e) => ({ ...e, ct: `${e.ct}=` }), 'WrongPassphraseOrTamper'],
    ['a non-string ct', (e) => ({ ...e, ct: 42 }), 'WrongPassphraseOrTamper'],
    ['an iv that is not base64url', (e) => ({ ...e, cipher: { ...e.cipher, iv: '+++' } }), 'WrongPassphraseOrTamper'],
    [
      'an iv of 16 bytes',
      (e) => ({ ...e, cipher: { ...e.cipher, iv: encodeBase64Url(new Uint8Array(16)) } }),
      'WrongPassphraseOrTamper',
    ],
    ['a salt that is not base64url', (e) => ({ ...e, kdf: { ...e.kdf, salt: 'ab+/' } }), 'WrongPassphraseOrTamper'],
  ];

  it.each(cases)(
    'an envelope with %s is rejected and crypto.subtle.decrypt is never called',
    async (_l, mutate, code) => {
      const spy = vi.spyOn(crypto.subtle, 'decrypt');
      const strong = { ...envelope, kdf: { ...envelope.kdf, iterations: PBKDF2_ITERATIONS } };
      await expectSyncError(decrypt(key, mutate(strong) as EncryptedEnvelopeV1), code);
      expect(spy).not.toHaveBeenCalled();
    },
  );

  it('a 64-character salt (48 bytes) passes the length check and reaches KeyMismatch', async () => {
    const salt = encodeBase64Url(new Uint8Array(48));
    expect(salt).toHaveLength(64);
    const strong = { ...envelope, kdf: { ...envelope.kdf, iterations: PBKDF2_ITERATIONS, salt } };
    await expectSyncError(decrypt(key, strong), 'KeyMismatch');
  });

  it('an envelope at exactly the cap passes the iteration check', async () => {
    const atCap = { ...envelope, kdf: { ...envelope.kdf, iterations: MAX_PBKDF2_ITERATIONS } };
    await expectSyncError(decrypt(key, atCap), 'WrongPassphraseOrTamper');
  });

  it('a different salt gives KeyMismatch before decrypting', async () => {
    const spy = vi.spyOn(crypto.subtle, 'decrypt');
    const other = await testKey(PASSPHRASE);
    await expectSyncError(decrypt(other, envelope, TEST_FLOOR), 'KeyMismatch');
    expect(spy).not.toHaveBeenCalled();
  });

  it('WeakParams wins over KeyMismatch: the KDF floor is checked first', async () => {
    const other = await testKey(PASSPHRASE);
    await expectSyncError(decrypt(other, envelope), 'WeakParams');
  });

  it('a lower test floor never lets an envelope below it through', async () => {
    await expectSyncError(decrypt(key, envelope, { minIterations: TEST_ITERATIONS + 1 }), 'WeakParams');
  });
});

describe('parseEnvelope and serializeEnvelope', () => {
  it('serializes deterministically with no whitespace', () => {
    const text = serializeEnvelope(envelope);
    expect(text).toBe(serializeEnvelope(JSON.parse(text) as EncryptedEnvelopeV1));
    expect(text).not.toMatch(/\s/);
  });

  it.each([
    ['text that is not JSON', 'not json'],
    ['a JSON value that is not an envelope', '{"synthetic":true,"version":1}'],
    ['a JSON array', '[]'],
  ])('rejects %s with InvalidRemote', (_label, text) => {
    expect(() => parseEnvelope(text)).toThrow(SyncError);
    try {
      parseEnvelope(text);
    } catch (error) {
      expect((error as SyncError).code).toBe('InvalidRemote');
      expect((error as SyncError).message).toBe('InvalidRemote');
    }
  });

  it('rejects an unknown version with UnsupportedVersion', () => {
    const text = serializeEnvelope(envelope).replace('"v":1', '"v":2');
    expect(() => parseEnvelope(text)).toThrow(expect.objectContaining({ code: 'UnsupportedVersion' }));
  });

  it('rejects a structurally broken v1 envelope with WrongPassphraseOrTamper', () => {
    const text = JSON.stringify({ ...envelope, extra: 1 });
    expect(() => parseEnvelope(text)).toThrow(expect.objectContaining({ code: 'WrongPassphraseOrTamper' }));
  });

  it('serializeEnvelope only writes the ADR-0009 fields', () => {
    const withExtra = { ...envelope, passphrase: PASSPHRASE } as EncryptedEnvelopeV1;
    expect(serializeEnvelope(withExtra)).not.toContain(PASSPHRASE);
  });
});

describe('changePassphrase', () => {
  it('uses a new salt, re-derives and re-encrypts the same plaintext', async () => {
    const result = await changePassphrase(key, envelope, OTHER_PASSPHRASE, {
      iterations: TEST_ITERATIONS,
      minIterations: TEST_ITERATIONS,
    });
    expect(result.key.saltId).not.toBe(key.saltId);
    expect(result.key.iterations).toBe(TEST_ITERATIONS);
    expect(result.key.key.extractable).toBe(false);
    expect(result.envelope.kdf.salt).toBe(result.key.saltId);
    expect(result.envelope.cipher.iv).not.toBe(envelope.cipher.iv);
    await expect(decrypt(result.key, result.envelope, TEST_FLOOR)).resolves.toBe(PLAINTEXT);

    // The new passphrase alone re-derives the key from the new envelope's salt (another device's path).
    const elsewhere = await testKey(OTHER_PASSPHRASE, result.envelope.kdf.salt);
    await expect(decrypt(elsewhere, result.envelope, TEST_FLOOR)).resolves.toBe(PLAINTEXT);

    // A device still holding the old key detects KeyMismatch.
    await expectSyncError(decrypt(key, result.envelope, TEST_FLOOR), 'KeyMismatch');
  });

  it('draws a new salt even if the random source repeats the old one', async () => {
    const old = decodeBase64Url(key.saltId) ?? new Uint8Array(16);
    vi.spyOn(crypto, 'getRandomValues').mockImplementationOnce((array) => {
      if (array instanceof Uint8Array) {
        array.set(old);
      }
      return array;
    });
    const result = await changePassphrase(key, envelope, OTHER_PASSPHRASE, {
      iterations: TEST_ITERATIONS,
      minIterations: TEST_ITERATIONS,
    });
    expect(result.key.saltId).not.toBe(key.saltId);
  });

  it('defaults the new key to 600000 iterations', async () => {
    const result = await changePassphrase(key, envelope, OTHER_PASSPHRASE, { minIterations: TEST_ITERATIONS });
    expect(result.key.iterations).toBe(600_000);
    expect(result.envelope.kdf.iterations).toBe(600_000);
    await expect(decrypt(result.key, result.envelope)).resolves.toBe(PLAINTEXT);
  });

  it('fails with the typed error when the current key cannot open the envelope', async () => {
    const wrong = await testKey(OTHER_PASSPHRASE, key.saltId);
    await expectSyncError(
      changePassphrase(wrong, envelope, 'nueva frase', { iterations: TEST_ITERATIONS, minIterations: TEST_ITERATIONS }),
      'WrongPassphraseOrTamper',
    );
  });
});
