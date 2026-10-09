import { ENVELOPE_FORMAT, SyncError, canonicalJson, type EncryptedEnvelopeV1 } from '../ports.ts';
import { decodeBase64Url } from './base64url.ts';

/** Envelope v1 format, validation and AAD (ADR-0009 decisions 2 and 3). */

export const KDF_NAME = 'PBKDF2-SHA256';
export const CIPHER_NAME = 'AES-256-GCM';
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
/**
 * Highest accepted PBKDF2 iteration count. An envelope's iterations may come from a hostile Drive file, and an
 * uncapped value would hang the tab while deriving; above it the envelope is WeakParams and deriveKey a RangeError.
 */
export const MAX_PBKDF2_ITERATIONS = 10_000_000;
/** Longest accepted salt field: 64 base64url characters (48 bytes), checked before decoding. */
export const MAX_SALT_CHARS = 64;

type Header = Omit<EncryptedEnvelopeV1, 'ct'>;

export interface CheckedEnvelope {
  readonly envelope: EncryptedEnvelopeV1;
  readonly iv: Uint8Array<ArrayBuffer>;
  readonly ct: Uint8Array<ArrayBuffer>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  const own = Object.keys(value).sort();
  return own.length === keys.length && own.every((key, index) => key === keys[index]);
}

/**
 * Validates an untrusted value as an envelope v1 without touching any key. Order: not an envelope (InvalidRemote),
 * unknown version or algorithm (UnsupportedVersion), malformed v1 fields (WrongPassphraseOrTamper), then KDF strength
 * (WeakParams): iterations below `minIterations` or above MAX_PBKDF2_ITERATIONS, a salt field longer than 64
 * characters (checked before decoding) or a salt shorter than 16 bytes.
 */
export function checkEnvelope(value: unknown, minIterations: number): CheckedEnvelope {
  if (!isRecord(value) || value['format'] !== ENVELOPE_FORMAT) {
    throw new SyncError('InvalidRemote');
  }
  if (value['v'] !== 1) {
    throw new SyncError('UnsupportedVersion');
  }
  const { kdf, cipher, ct } = value;
  if (
    !hasExactKeys(value, ['cipher', 'ct', 'format', 'kdf', 'v']) ||
    !hasExactKeys(kdf, ['iterations', 'name', 'salt']) ||
    !hasExactKeys(cipher, ['iv', 'name']) ||
    typeof kdf['name'] !== 'string' ||
    typeof kdf['salt'] !== 'string' ||
    typeof kdf['iterations'] !== 'number' ||
    !Number.isSafeInteger(kdf['iterations']) ||
    typeof cipher['name'] !== 'string' ||
    typeof cipher['iv'] !== 'string' ||
    typeof ct !== 'string'
  ) {
    throw new SyncError('WrongPassphraseOrTamper');
  }
  if (kdf['name'] !== KDF_NAME || cipher['name'] !== CIPHER_NAME) {
    throw new SyncError('UnsupportedVersion');
  }
  const iterations = kdf['iterations'];
  if (iterations < minIterations || iterations > MAX_PBKDF2_ITERATIONS || kdf['salt'].length > MAX_SALT_CHARS) {
    throw new SyncError('WeakParams');
  }
  const salt = decodeBase64Url(kdf['salt']);
  if (salt === null) {
    throw new SyncError('WrongPassphraseOrTamper');
  }
  if (salt.length < SALT_BYTES) {
    throw new SyncError('WeakParams');
  }
  const iv = decodeBase64Url(cipher['iv']);
  const ctBytes = decodeBase64Url(ct);
  if (iv === null || iv.length !== IV_BYTES || ctBytes === null) {
    throw new SyncError('WrongPassphraseOrTamper');
  }
  return {
    envelope: {
      format: ENVELOPE_FORMAT,
      v: 1,
      kdf: { name: KDF_NAME, iterations, salt: kdf['salt'] },
      cipher: { name: CIPHER_NAME, iv: cipher['iv'] },
      ct,
    },
    iv,
    ct: ctBytes,
  };
}

/** The header (every field but ct) as canonical JSON bytes: the AES-GCM additional authenticated data. */
export function headerAad(header: Header): Uint8Array<ArrayBuffer> {
  const { format, v, kdf, cipher } = header;
  return new TextEncoder().encode(
    canonicalJson({
      format,
      v,
      kdf: { name: kdf.name, iterations: kdf.iterations, salt: kdf.salt },
      cipher: { name: cipher.name, iv: cipher.iv },
    }),
  );
}

/** Compact JSON with only the ADR-0009 fields, in a fixed order. */
export function serializeEnvelope(envelope: EncryptedEnvelopeV1): string {
  const { format, v, kdf, cipher, ct } = envelope;
  return JSON.stringify({
    format,
    v,
    kdf: { name: kdf.name, iterations: kdf.iterations, salt: kdf.salt },
    cipher: { name: cipher.name, iv: cipher.iv },
    ct,
  });
}

/**
 * Parses text (a Drive file or an encrypted export) into an envelope v1. Text that is not JSON or not an envelope gives
 * SyncError('InvalidRemote'); an unknown version gives 'UnsupportedVersion'; a malformed v1 envelope gives
 * 'WrongPassphraseOrTamper'. The production KDF floor is enforced by decrypt.
 */
export function parseEnvelope(text: string): EncryptedEnvelopeV1 {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SyncError('InvalidRemote');
  }
  return checkEnvelope(value, 1).envelope;
}
