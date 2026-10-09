/** @cuotascasa/sync/crypto: the encrypted envelope v1 and the per-device key store (ADR-0009, W1-07). */
export {
  changePassphrase,
  decrypt,
  deriveKey,
  deriveStoredKey,
  encrypt,
  generateSalt,
  type ChangePassphraseOptions,
  type ChangePassphraseResult,
  type DecryptOptions,
  type DeriveStoredKeyOptions,
} from './cipher.ts';
export { IV_BYTES, SALT_BYTES, parseEnvelope, serializeEnvelope } from './envelope.ts';
export { KEY_STORE_DATABASE, createIndexedDbKeyStore, type IndexedDbKeyStoreOptions } from './key-store.ts';
