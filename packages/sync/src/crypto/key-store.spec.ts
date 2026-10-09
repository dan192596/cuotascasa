import { IDBDatabase as FakeIDBDatabase, IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoredKey } from '../ports.ts';
import { decrypt, deriveStoredKey, encrypt } from './index.ts';
import { KEY_STORE_DATABASE, KEY_STORE_RECORD, KEY_STORE_STORE, createIndexedDbKeyStore } from './key-store.ts';

const TEST_ITERATIONS = 1_000;
const PASSPHRASE = 'frase sintética del almacén de claves';

async function testKey(): Promise<StoredKey> {
  return deriveStoredKey(PASSPHRASE, { iterations: TEST_ITERATIONS });
}

function readRaw(factory: IDBFactory, database: string = KEY_STORE_DATABASE): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const open = factory.open(database);
    open.onerror = () => reject(new Error('open failed'));
    open.onsuccess = () => {
      const db = open.result;
      const request = db.transaction(KEY_STORE_STORE, 'readonly').objectStore(KEY_STORE_STORE).get(KEY_STORE_RECORD);
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
      request.onerror = () => reject(new Error('get failed'));
    };
  });
}

function writeRaw(factory: IDBFactory, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = factory.open(KEY_STORE_DATABASE);
    open.onerror = () => reject(new Error('open failed'));
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(KEY_STORE_STORE, 'readwrite');
      tx.objectStore(KEY_STORE_STORE).put(value, KEY_STORE_RECORD);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(new Error('put failed'));
    };
  });
}

describe('IndexedDB KeyStore (node, fake-indexeddb)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts empty', async () => {
    const store = createIndexedDbKeyStore({ indexedDB: new IDBFactory() });
    await expect(store.load()).resolves.toBeNull();
  });

  it('round-trips a non-extractable key that still decrypts', async () => {
    const factory = new IDBFactory();
    const entry = await testKey();
    const sealed = await encrypt(entry, 'payload sintético');
    await createIndexedDbKeyStore({ indexedDB: factory }).save(entry);

    const loaded = await createIndexedDbKeyStore({ indexedDB: factory }).load();
    expect(loaded).not.toBeNull();
    expect(loaded?.saltId).toBe(entry.saltId);
    expect(loaded?.iterations).toBe(TEST_ITERATIONS);
    expect(loaded?.key.extractable).toBe(false);
    await expect(decrypt(loaded as StoredKey, sealed, { minIterations: TEST_ITERATIONS })).resolves.toBe(
      'payload sintético',
    );
  });

  it('persists exactly key, saltId and iterations, even if the caller passes extra fields', async () => {
    const factory = new IDBFactory();
    const entry = { ...(await testKey()), passphrase: PASSPHRASE } as StoredKey;
    await createIndexedDbKeyStore({ indexedDB: factory }).save(entry);
    const raw = (await readRaw(factory)) as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual(['iterations', 'key', 'saltId']);
    expect(JSON.stringify(raw)).not.toContain(PASSPHRASE);
  });

  it('save replaces the previous key and clear removes it', async () => {
    const store = createIndexedDbKeyStore({ indexedDB: new IDBFactory() });
    const first = await testKey();
    const second = await testKey();
    await store.save(first);
    await store.save(second);
    expect((await store.load())?.saltId).toBe(second.saltId);
    await store.clear();
    await expect(store.load()).resolves.toBeNull();
  });

  it('uses a separate database when given another name', async () => {
    const factory = new IDBFactory();
    await createIndexedDbKeyStore({ indexedDB: factory, databaseName: 'otra-base' }).save(await testKey());
    await expect(createIndexedDbKeyStore({ indexedDB: factory }).load()).resolves.toBeNull();
    await expect(readRaw(factory, 'otra-base')).resolves.toBeTruthy();
  });

  describe('refuses to persist anything but a non-extractable AES-GCM-256 encrypt/decrypt key', () => {
    const cases: [string, () => Promise<StoredKey>][] = [
      [
        'an extractable key',
        async () => ({
          ...(await testKey()),
          key: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']),
        }),
      ],
      [
        'an AES-GCM 128 key',
        async () => ({
          ...(await testKey()),
          key: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 128 }, false, ['encrypt', 'decrypt']),
        }),
      ],
      [
        'a key with extra usages',
        async () => ({
          ...(await testKey()),
          key: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
            'encrypt',
            'decrypt',
            'wrapKey',
          ]),
        }),
      ],
      [
        'a key with only encrypt',
        async () => ({
          ...(await testKey()),
          key: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']),
        }),
      ],
      [
        'an AES-CBC key',
        async () => ({
          ...(await testKey()),
          key: await crypto.subtle.generateKey({ name: 'AES-CBC', length: 256 }, false, ['encrypt', 'decrypt']),
        }),
      ],
      ['a non-CryptoKey', async () => ({ ...(await testKey()), key: {} as CryptoKey })],
      ['a bad saltId', async () => ({ ...(await testKey()), saltId: 'AAAA' })],
      ['bad iterations', async () => ({ ...(await testKey()), iterations: 0 })],
    ];

    it.each(cases)('%s', async (_label, make) => {
      const factory = new IDBFactory();
      const store = createIndexedDbKeyStore({ indexedDB: factory });
      await expect(store.save(await make())).rejects.toThrow(TypeError);
      await expect(store.load()).resolves.toBeNull();
    });
  });

  describe('load ignores a corrupt record', () => {
    const cases: [string, () => Promise<unknown>][] = [
      ['a string', async () => 'clave'],
      ['null', async () => null],
      ['a non-string saltId', async () => ({ ...(await testKey()), saltId: 42 })],
      ['missing key', async () => ({ saltId: (await testKey()).saltId, iterations: TEST_ITERATIONS })],
      ['raw key bytes', async () => ({ ...(await testKey()), key: new Uint8Array(32) })],
      ['an extra field', async () => ({ ...(await testKey()), passphrase: 'x' })],
      [
        'an extractable key',
        async () => ({
          ...(await testKey()),
          key: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']),
        }),
      ],
    ];

    it.each(cases)('%s', async (_label, make) => {
      const factory = new IDBFactory();
      const store = createIndexedDbKeyStore({ indexedDB: factory });
      await store.clear();
      await writeRaw(factory, await make());
      await expect(store.load()).resolves.toBeNull();
    });
  });

  it('rejects with a fixed message when IndexedDB is unavailable', async () => {
    expect('indexedDB' in globalThis).toBe(false);
    await expect(createIndexedDbKeyStore().load()).rejects.toThrow('IndexedDB is not available');
  });

  it('defaults to globalThis.indexedDB', async () => {
    const factory = new IDBFactory();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    Object.defineProperty(globalThis, 'indexedDB', { value: factory, configurable: true, writable: true });
    try {
      const entry = await testKey();
      await createIndexedDbKeyStore().save(entry);
      expect(((await readRaw(factory)) as StoredKey).saltId).toBe(entry.saltId);
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(globalThis, 'indexedDB');
      } else {
        Object.defineProperty(globalThis, 'indexedDB', original);
      }
    }
  });

  it('surfaces an open failure as a rejection with a fixed message', async () => {
    const failing = {
      open: () => {
        const request = {
          onerror: null as null | (() => void),
          error: new DOMException('boom'),
        } as unknown as IDBOpenDBRequest;
        queueMicrotask(() => (request.onerror as unknown as () => void)());
        return request;
      },
    } as unknown as IDBFactory;
    await expect(createIndexedDbKeyStore({ indexedDB: failing }).load()).rejects.toThrow(
      'Could not open the key store',
    );
  });

  it('rejects with a fixed message when the database exists without the keys store', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const open = factory.open(KEY_STORE_DATABASE, 1);
      open.onupgradeneeded = () => open.result.createObjectStore('otra');
      open.onsuccess = () => {
        open.result.close();
        resolve();
      };
      open.onerror = () => reject(new Error('open failed'));
    });
    const store = createIndexedDbKeyStore({ indexedDB: factory });
    for (const call of [() => store.load(), () => store.clear()]) {
      const error: unknown = await call().then(
        () => null,
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(DOMException);
      expect((error as Error).message).toBe('Key store transaction failed');
    }
  });

  it('rejects with a fixed message when the transaction aborts', async () => {
    const factory = new IDBFactory();
    const store = createIndexedDbKeyStore({ indexedDB: factory });
    await store.clear();
    const prototype = FakeIDBDatabase.prototype as IDBDatabase;
    const original = prototype.transaction;
    vi.spyOn(prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase['transaction']>
    ) {
      const tx = original.apply(this, args);
      queueMicrotask(() => tx.abort());
      return tx;
    });
    await expect(store.save(await testKey())).rejects.toThrow('Key store transaction failed');
    vi.restoreAllMocks();
    await expect(store.load()).resolves.toBeNull();
  });
});
