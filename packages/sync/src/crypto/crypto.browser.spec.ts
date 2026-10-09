import { afterEach, describe, expect, it } from 'vitest';
import { PBKDF2_ITERATIONS, SyncError, type StoredKey } from '../ports.ts';
import { decodeBase64Url } from './base64url.ts';
import { decrypt, deriveKey, deriveStoredKey, encrypt, generateSalt } from './index.ts';
import { KEY_STORE_RECORD, KEY_STORE_STORE, createIndexedDbKeyStore } from './key-store.ts';

/**
 * Real WebCrypto and IndexedDB on Chromium and WebKit (Vitest project `sync-browser`): the non-extractable CryptoKey
 * must survive structured clone into IndexedDB and back, and nothing but the opaque key and its salt id is persisted.
 */

const TEST_ITERATIONS = 1_000;
const TEST_FLOOR = { minIterations: TEST_ITERATIONS } as const;
const PASSPHRASE = 'frase sintética del navegador ñandú';
const PLAINTEXT = JSON.stringify({ synthetic: true, note: 'respaldo sintético del navegador' });

const databases: string[] = [];

function databaseName(): string {
  const name = `cuotascasa-keys-test-${crypto.randomUUID()}`;
  databases.push(name);
  return name;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('IndexedDB request failed'));
  });
}

async function openRaw(name: string): Promise<IDBDatabase> {
  return request(indexedDB.open(name));
}

/** Every value stored in every object store of the database. */
async function dumpDatabase(name: string): Promise<{ stores: string[]; values: unknown[] }> {
  const db = await openRaw(name);
  try {
    const stores = [...db.objectStoreNames];
    const values: unknown[] = [];
    for (const store of stores) {
      values.push(...(await request(db.transaction(store, 'readonly').objectStore(store).getAll())));
    }
    return { stores, values };
  } finally {
    db.close();
  }
}

/** Walks a structured-clone value and lists every string and every binary buffer it contains. */
function walk(value: unknown, strings: string[], binaries: unknown[]): void {
  if (typeof value === 'string') {
    strings.push(value);
  } else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value) || value instanceof Blob) {
    binaries.push(value);
  } else if (value instanceof CryptoKey) {
    // Opaque by design: its algorithm and usages are metadata, not key bytes.
  } else if (value !== null && typeof value === 'object') {
    for (const [field, item] of Object.entries(value)) {
      strings.push(field);
      walk(item, strings, binaries);
    }
  }
}

function expectDeviceKey(key: CryptoKey): void {
  expect(key).toBeInstanceOf(CryptoKey);
  expect(key.extractable).toBe(false);
  expect(key.type).toBe('secret');
  expect(key.algorithm).toEqual({ name: 'AES-GCM', length: 256 });
  expect([...key.usages].sort()).toEqual(['decrypt', 'encrypt']);
}

afterEach(async () => {
  for (const name of databases.splice(0)) {
    await request(indexedDB.deleteDatabase(name));
  }
});

describe('WebCrypto in this engine', () => {
  it('derives a non-extractable AES-GCM 256 key with usages exactly encrypt and decrypt', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt(), TEST_ITERATIONS);
    expectDeviceKey(key);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    await expect(crypto.subtle.exportKey('jwk', key)).rejects.toThrow();
  });

  it('derives with the production 600000 iterations and decrypts under the production floor', async () => {
    const stored = await deriveStoredKey(PASSPHRASE);
    expect(stored.iterations).toBe(PBKDF2_ITERATIONS);
    const sealed = await encrypt(stored, PLAINTEXT);
    expect(sealed.kdf.iterations).toBe(600_000);
    await expect(decrypt(stored, sealed)).resolves.toBe(PLAINTEXT);
  });

  it('round-trips UTF-8 and rejects a wrong passphrase or a tampered ct with the typed error', async () => {
    const key = await deriveStoredKey(PASSPHRASE, { iterations: TEST_ITERATIONS });
    const payload = 'ñ á é 漢字 🔐 \u0000 fin';
    const sealed = await encrypt(key, payload);
    expect(decodeBase64Url(sealed.cipher.iv)).toHaveLength(12);
    await expect(decrypt(key, sealed, TEST_FLOOR)).resolves.toBe(payload);

    const wrong = await deriveStoredKey('otra frase sintética', { saltId: key.saltId, iterations: TEST_ITERATIONS });
    const error: unknown = await decrypt(wrong, sealed, TEST_FLOOR).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(SyncError);
    expect((error as SyncError).code).toBe('WrongPassphraseOrTamper');
    expect(String(error)).not.toContain('漢字');

    const ct = sealed.ct.startsWith('A') ? `B${sealed.ct.slice(1)}` : `A${sealed.ct.slice(1)}`;
    await expect(decrypt(key, { ...sealed, ct }, TEST_FLOOR)).rejects.toMatchObject({
      code: 'WrongPassphraseOrTamper',
    });
  });
});

describe('IndexedDB KeyStore in this engine', () => {
  it('round-trips the non-extractable CryptoKey through IndexedDB and it still decrypts', async () => {
    const name = databaseName();
    const entry = await deriveStoredKey(PASSPHRASE, { iterations: TEST_ITERATIONS });
    const sealed = await encrypt(entry, PLAINTEXT);

    await createIndexedDbKeyStore({ databaseName: name }).save(entry);
    const loaded = await createIndexedDbKeyStore({ databaseName: name }).load();

    expect(loaded).not.toBeNull();
    const key = loaded as StoredKey;
    expect(key.saltId).toBe(entry.saltId);
    expect(key.iterations).toBe(TEST_ITERATIONS);
    expectDeviceKey(key.key);
    await expect(crypto.subtle.exportKey('raw', key.key)).rejects.toThrow();
    await expect(decrypt(key, sealed, TEST_FLOOR)).resolves.toBe(PLAINTEXT);
    // And the loaded key encrypts for the original one.
    await expect(decrypt(entry, await encrypt(key, 'de vuelta'), TEST_FLOOR)).resolves.toBe('de vuelta');

    await createIndexedDbKeyStore({ databaseName: name }).clear();
    await expect(createIndexedDbKeyStore({ databaseName: name }).load()).resolves.toBeNull();
  });

  it('IndexedDB content inspection: no passphrase and no raw key bytes are persisted', async () => {
    const name = databaseName();
    const entry = await deriveStoredKey(PASSPHRASE, { iterations: TEST_ITERATIONS });
    await createIndexedDbKeyStore({ databaseName: name }).save(entry);

    const { stores, values } = await dumpDatabase(name);
    expect(stores).toEqual([KEY_STORE_STORE]);
    expect(values).toHaveLength(1);

    const record = values[0] as Record<string, unknown>;
    expect(Object.keys(record).sort()).toEqual(['iterations', 'key', 'saltId']);
    expect(record['iterations']).toBe(TEST_ITERATIONS);
    expect(record['saltId']).toBe(entry.saltId);
    expectDeviceKey(record['key'] as CryptoKey);
    await expect(crypto.subtle.exportKey('raw', record['key'] as CryptoKey)).rejects.toThrow();

    const strings: string[] = [];
    const binaries: unknown[] = [];
    walk(record, strings, binaries);
    expect(binaries).toEqual([]);
    expect(strings.sort()).toEqual(['iterations', 'key', 'saltId', entry.saltId].sort());
    for (const text of strings) {
      expect(text).not.toContain(PASSPHRASE);
      expect(text.normalize('NFC')).not.toContain(PASSPHRASE.normalize('NFC'));
    }

    // The record key is a fixed label, not derived from any secret.
    const db = await openRaw(name);
    try {
      const keys = await request(db.transaction(KEY_STORE_STORE, 'readonly').objectStore(KEY_STORE_STORE).getAllKeys());
      expect(keys).toEqual([KEY_STORE_RECORD]);
    } finally {
      db.close();
    }
  });
});
