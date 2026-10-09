import { ENVELOPE_FORMAT, PBKDF2_ITERATIONS, SyncError, type EncryptedEnvelopeV1, type StoredKey } from '../ports.ts';
import { decodeBase64Url, encodeBase64Url } from './base64url.ts';
import { CIPHER_NAME, IV_BYTES, KDF_NAME, SALT_BYTES, checkEnvelope, headerAad } from './envelope.ts';

/**
 * ADR-0009: PBKDF2-SHA256 to a non-extractable AES-256-GCM key, a fresh random 96-bit IV per encryption and the
 * envelope header bound as AAD. WebCrypto only. Errors carry fixed messages: never plaintext, passphrase or key bytes.
 */

export interface DecryptOptions {
  /** Test seam (D25): lowest accepted iteration count. Defaults to PBKDF2_ITERATIONS; only tests pass less. */
  readonly minIterations?: number;
}

export interface DeriveStoredKeyOptions {
  /** base64url salt to reuse, e.g. a remote envelope's kdf.salt; a fresh random salt when absent. */
  readonly saltId?: string | undefined;
  /** Defaults to PBKDF2_ITERATIONS; only tests pass less. */
  readonly iterations?: number;
}

export interface ChangePassphraseOptions {
  /** Iterations of the new key; defaults to PBKDF2_ITERATIONS. */
  readonly iterations?: number;
  /** Passed to decrypt for the current envelope; defaults to PBKDF2_ITERATIONS. */
  readonly minIterations?: number;
}

export interface ChangePassphraseResult {
  readonly key: StoredKey;
  readonly envelope: EncryptedEnvelopeV1;
}

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

function assertIterations(iterations: number): void {
  if (!Number.isSafeInteger(iterations) || iterations < 1) {
    throw new RangeError('PBKDF2 iterations must be a positive integer');
  }
}

function decodeSaltId(saltId: string): Uint8Array<ArrayBuffer> {
  const salt = decodeBase64Url(saltId);
  if (salt === null || salt.length < SALT_BYTES) {
    throw new RangeError('The salt id must be canonical base64url of at least 16 bytes');
  }
  return salt;
}

/** 16 random bytes from crypto.getRandomValues. */
export function generateSalt(): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

/**
 * PBKDF2-SHA256 over the NFC-normalized UTF-8 passphrase to an AES-GCM 256 key with extractable false and usages
 * exactly encrypt and decrypt.
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new RangeError('The passphrase must be a non-empty string');
  }
  if (!(salt instanceof Uint8Array) || salt.length < SALT_BYTES) {
    throw new RangeError('The salt must be at least 16 bytes');
  }
  assertIterations(iterations);
  const secret = new TextEncoder().encode(passphrase.normalize('NFC'));
  try {
    const base = await subtle().importKey('raw', secret, 'PBKDF2', false, ['deriveKey']);
    return await subtle().deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  } finally {
    secret.fill(0);
  }
}

/** deriveKey plus the base64url salt id and iteration count the KeyStore and the envelope need. */
export async function deriveStoredKey(passphrase: string, options: DeriveStoredKeyOptions = {}): Promise<StoredKey> {
  const iterations = options.iterations ?? PBKDF2_ITERATIONS;
  const salt = options.saltId === undefined ? generateSalt() : decodeSaltId(options.saltId);
  const key = await deriveKey(passphrase, salt, iterations);
  return { key, saltId: encodeBase64Url(salt), iterations };
}

/** AES-256-GCM with a fresh random 96-bit IV; the header (format, v, kdf, cipher) is the AAD. */
export async function encrypt(key: StoredKey, plaintext: string): Promise<EncryptedEnvelopeV1> {
  decodeSaltId(key.saltId);
  assertIterations(key.iterations);
  if (!plaintext.isWellFormed()) {
    throw new TypeError('The plaintext is not well-formed Unicode');
  }
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const header = {
    format: ENVELOPE_FORMAT,
    v: 1,
    kdf: { name: KDF_NAME, iterations: key.iterations, salt: key.saltId },
    cipher: { name: CIPHER_NAME, iv: encodeBase64Url(iv) },
  } as const;
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: headerAad(header), tagLength: 128 },
    key.key,
    new TextEncoder().encode(plaintext),
  );
  return { ...header, ct: encodeBase64Url(new Uint8Array(ct)) };
}

/**
 * Validates the envelope before any decryption attempt (InvalidRemote, UnsupportedVersion, WrongPassphraseOrTamper
 * for malformed fields, WeakParams below the floor), then KeyMismatch when its salt differs from the key's, then
 * AES-GCM: a wrong passphrase or any tampering gives WrongPassphraseOrTamper.
 */
export async function decrypt(
  key: StoredKey,
  envelope: EncryptedEnvelopeV1,
  options: DecryptOptions = {},
): Promise<string> {
  const minIterations = options.minIterations ?? PBKDF2_ITERATIONS;
  assertIterations(minIterations);
  const checked = checkEnvelope(envelope, minIterations);
  if (checked.envelope.kdf.salt !== key.saltId) {
    throw new SyncError('KeyMismatch');
  }
  try {
    const plain = await subtle().decrypt(
      { name: 'AES-GCM', iv: checked.iv, additionalData: headerAad(checked.envelope), tagLength: 128 },
      key.key,
      checked.ct,
    );
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(plain);
  } catch {
    throw new SyncError('WrongPassphraseOrTamper');
  }
}

/**
 * Decrypts with the current key, derives a new key from `newPassphrase` and a new salt, and re-encrypts. It does not
 * touch the KeyStore: the caller saves the new key only after the upload succeeds (W4-09).
 */
export async function changePassphrase(
  current: StoredKey,
  envelope: EncryptedEnvelopeV1,
  newPassphrase: string,
  options: ChangePassphraseOptions = {},
): Promise<ChangePassphraseResult> {
  const plaintext = await decrypt(current, envelope, { minIterations: options.minIterations ?? PBKDF2_ITERATIONS });
  let salt = generateSalt();
  while (encodeBase64Url(salt) === current.saltId) {
    salt = generateSalt();
  }
  const iterations = options.iterations ?? PBKDF2_ITERATIONS;
  const key: StoredKey = {
    key: await deriveKey(newPassphrase, salt, iterations),
    saltId: encodeBase64Url(salt),
    iterations,
  };
  return { key, envelope: await encrypt(key, plaintext) };
}
