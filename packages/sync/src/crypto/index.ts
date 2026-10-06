import { NotImplementedError } from '@cuotascasa/schema';
import { PBKDF2_ITERATIONS, type EncryptedEnvelopeV1, type KeyStore, type StoredKey } from '../ports.ts';

/** Stub owned by W1-07: PBKDF2-SHA256 to a non-extractable AES-256-GCM key. */
export function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  void passphrase;
  void salt;
  void iterations;
  throw new NotImplementedError('W1-07');
}

/** Stub owned by W1-07: AES-256-GCM with a fresh 96-bit IV and the header bound as AAD. */
export function encrypt(key: StoredKey, plaintext: string): Promise<EncryptedEnvelopeV1> {
  void key;
  void plaintext;
  throw new NotImplementedError('W1-07');
}

/** Stub owned by W1-07: typed SyncError on KeyMismatch, WrongPassphraseOrTamper, UnsupportedVersion or WeakParams. */
export function decrypt(key: StoredKey, envelope: EncryptedEnvelopeV1): Promise<string> {
  void key;
  void envelope;
  throw new NotImplementedError('W1-07');
}

/** Stub owned by W1-07: IndexedDB KeyStore that never persists the passphrase or raw key bytes. */
export function createIndexedDbKeyStore(): KeyStore {
  throw new NotImplementedError('W1-07');
}
