import type { KeyStore, StoredKey } from '../ports.ts';
import { decodeBase64Url } from './base64url.ts';
import { SALT_BYTES } from './envelope.ts';

/**
 * Per-device key store (ADR-0009 decision 5): one IndexedDB record holding the non-extractable CryptoKey (persisted by
 * structured clone, so its bytes never reach JavaScript), its base64url salt id and iteration count. The passphrase is
 * never given to the store, and save() copies only those three fields after checking the key cannot be exported.
 */

export const KEY_STORE_DATABASE = 'cuotascasa-keys';
export const KEY_STORE_STORE = 'keys';
export const KEY_STORE_RECORD = 'device';

export interface IndexedDbKeyStoreOptions {
  /** Defaults to globalThis.indexedDB, resolved on each call. */
  readonly indexedDB?: IDBFactory | undefined;
  /** Defaults to KEY_STORE_DATABASE. */
  readonly databaseName?: string;
}

function isDeviceKey(key: unknown): key is CryptoKey {
  if (!(key instanceof CryptoKey)) {
    return false;
  }
  const algorithm = key.algorithm as Partial<AesKeyAlgorithm>;
  const usages = [...key.usages].sort();
  return (
    key.extractable === false &&
    key.type === 'secret' &&
    algorithm.name === 'AES-GCM' &&
    algorithm.length === 256 &&
    usages.length === 2 &&
    usages[0] === 'decrypt' &&
    usages[1] === 'encrypt'
  );
}

function isStoredKey(value: unknown): value is StoredKey {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const salt = typeof record['saltId'] === 'string' ? decodeBase64Url(record['saltId']) : null;
  return (
    keys.length === 3 &&
    keys[0] === 'iterations' &&
    keys[1] === 'key' &&
    keys[2] === 'saltId' &&
    isDeviceKey(record['key']) &&
    salt !== null &&
    salt.length >= SALT_BYTES &&
    Number.isSafeInteger(record['iterations']) &&
    (record['iterations'] as number) >= 1
  );
}

export function createIndexedDbKeyStore(options: IndexedDbKeyStoreOptions = {}): KeyStore {
  const databaseName = options.databaseName ?? KEY_STORE_DATABASE;

  function open(): Promise<IDBDatabase> {
    const factory = options.indexedDB ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (factory === undefined) {
      return Promise.reject(new Error('IndexedDB is not available'));
    }
    return new Promise((resolve, reject) => {
      const request = factory.open(databaseName, 1);
      // Version 1 is the only schema: an upgrade only ever starts from an empty database.
      request.onupgradeneeded = () => request.result.createObjectStore(KEY_STORE_STORE);
      // Every operation closes its connection when done, so no connection blocks another tab's open.
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Could not open the key store'));
    });
  }

  async function run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const fail = (): void => reject(new Error('Key store transaction failed'));
        let tx: IDBTransaction;
        let request: IDBRequest<T>;
        try {
          // Throws NotFoundError when a database with this name exists without the keys store.
          tx = db.transaction(KEY_STORE_STORE, mode);
          request = operation(tx.objectStore(KEY_STORE_STORE));
        } catch {
          fail();
          return;
        }
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = fail;
        tx.onabort = fail;
      });
    } finally {
      db.close();
    }
  }

  return {
    async load(): Promise<StoredKey | null> {
      const value: unknown = await run('readonly', (store) => store.get(KEY_STORE_RECORD));
      if (!isStoredKey(value)) {
        return null;
      }
      return { key: value.key, saltId: value.saltId, iterations: value.iterations };
    },

    async save(entry: StoredKey): Promise<void> {
      const record = { key: entry.key, saltId: entry.saltId, iterations: entry.iterations };
      if (!isStoredKey(record)) {
        throw new TypeError(
          'Only a non-extractable AES-GCM 256 encrypt/decrypt key with a valid salt id and iterations can be stored',
        );
      }
      await run('readwrite', (store) => store.put(record, KEY_STORE_RECORD));
    },

    async clear(): Promise<void> {
      await run('readwrite', (store) => store.delete(KEY_STORE_RECORD));
    },
  };
}
