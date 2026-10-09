/** base64url without padding (RFC 4648 §5), strict: decoding accepts only the canonical encoding. */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VALID = /^[A-Za-z0-9_-]*$/;

const LOOKUP = new Map<string, number>([...ALPHABET].map((char, index) => [char, index]));

export function encodeBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const chunk = (a << 16) | (b << 8) | c;
    const remaining = bytes.length - i;
    out += ALPHABET[(chunk >> 18) & 63];
    out += ALPHABET[(chunk >> 12) & 63];
    if (remaining > 1) {
      out += ALPHABET[(chunk >> 6) & 63];
    }
    if (remaining > 2) {
      out += ALPHABET[chunk & 63];
    }
  }
  return out;
}

/** The decoded bytes, or null when `text` is not the canonical unpadded base64url encoding of some bytes. */
export function decodeBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!VALID.test(text) || text.length % 4 === 1) {
    return null;
  }
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of text) {
    buffer = ((buffer << 6) | (LOOKUP.get(char) ?? 0)) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }
  // Leftover bits must be zero, otherwise two strings would decode to the same bytes.
  if ((buffer & ((1 << bits) - 1)) !== 0) {
    return null;
  }
  return bytes;
}
