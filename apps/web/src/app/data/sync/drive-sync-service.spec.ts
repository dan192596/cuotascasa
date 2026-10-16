import { IDBFactory } from 'fake-indexeddb';
import type { DataStore } from '@cuotascasa/persistence';
import { createManualClock, sampleLoan } from '@cuotascasa/persistence/contract';
import { createInMemoryDataStore } from '@cuotascasa/persistence/memory';
import type { Uuid } from '@cuotascasa/schema';
import {
  PBKDF2_ITERATIONS,
  REMOTE_FILE_NAME,
  REMOTE_PREV_FILE_NAME,
  SYNC_LOCK_NAME,
  type GisOAuth2,
  type LockManagerLike,
} from '@cuotascasa/sync';
import {
  createIndexedDbKeyStore,
  deriveStoredKey,
  encrypt,
  parseEnvelope,
  serializeEnvelope,
} from '@cuotascasa/sync/crypto';
import { createDriveFake, createGisFake, type DriveFake, type GisFake } from '@cuotascasa/sync/testing';
import { describe, expect, it, vi } from 'vitest';
import { DataError } from '../api.ts';
import { DriveSyncService } from './drive-sync-service.ts';
import type { SyncOptions } from './sync-options.ts';

const CLIENT_ID = 'cuotascasa-test-client';
const PASSPHRASE = 'frase sintetica de prueba';
const TEST_ITERATIONS = 1_000;
const T0 = Date.parse('2026-10-04T15:00:00.000Z');

function deviceUuid(device: number, n: number): Uuid {
  return `${String(device)}0000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

/** One Drive account shared by the devices of a test: the frozen Google fakes, never the network. */
interface World {
  readonly gis: GisFake;
  readonly drive: DriveFake;
  now: number;
  gisLoads: number;
}

function createWorld(): World {
  const world = { now: T0, gisLoads: 0 } as World & { gis: GisFake; drive: DriveFake };
  const gis = createGisFake({ now: () => world.now });
  const drive = createDriveFake({ isTokenValid: (token) => gis.isTokenValid(token) });
  Object.assign(world, { gis, drive });
  return world;
}

/** Locks that run callbacks one after another, like navigator.locks within a single tab. */
function serialLocks(): LockManagerLike & { readonly names: string[] } {
  let tail: Promise<unknown> = Promise.resolve();
  const names: string[] = [];
  return {
    names,
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      names.push(name);
      const run = tail.then(callback, callback);
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

interface Device {
  readonly service: DriveSyncService;
  readonly store: DataStore;
  readonly indexedDb: IDBFactory;
  readonly locks: ReturnType<typeof serialLocks>;
  readonly loadDriveModule: ReturnType<typeof vi.fn>;
  readonly clock: ReturnType<typeof createManualClock>;
}

async function createDevice(
  world: World,
  number: number,
  overrides: Partial<SyncOptions> = {},
  existing?: { readonly store: DataStore; readonly indexedDb: IDBFactory; readonly clock: Device['clock'] },
): Promise<Device> {
  const clock = existing?.clock ?? createManualClock(new Date(T0 + number * 1000).toISOString());
  let counter = 0;
  const store =
    existing?.store ??
    (await createInMemoryDataStore({
      clock,
      ids: {
        newId: () => {
          counter += 1;
          return deviceUuid(number, counter);
        },
      },
    }));
  const indexedDb = existing?.indexedDb ?? new IDBFactory();
  const locks = serialLocks();
  const loadDriveModule = vi.fn(() => import('@cuotascasa/sync/google-drive'));
  const loadGis = (): Promise<GisOAuth2> => {
    world.gisLoads += 1;
    return Promise.resolve(world.gis.oauth2);
  };
  const options: SyncOptions = {
    clientId: CLIENT_ID,
    loadDriveModule,
    loadGis,
    fetch: (input, init) => world.drive.fetch(input, init),
    nowMs: () => world.now,
    locks,
    indexedDb,
    iterations: TEST_ITERATIONS,
    minIterations: TEST_ITERATIONS,
    ...overrides,
  };
  const service = new DriveSyncService({
    options,
    clientId: options.clientId ?? '',
    store: Promise.resolve(store),
    clock,
    locks: options.locks ?? locks,
    loadDriveModule: options.loadDriveModule ?? loadDriveModule,
  });
  return { service, store, indexedDb, locks, loadDriveModule, clock };
}

async function addLoan(device: Device, name: string): Promise<void> {
  device.clock.advance(1000);
  await device.store.loans.create({ ...sampleLoan(), name });
}

async function loanNames(device: Device): Promise<string[]> {
  return (await device.store.loans.list()).map((loan) => loan.name).sort();
}

/** connect -> setPassphrase on a device. */
async function enroll(device: Device, passphrase: string = PASSPHRASE): Promise<void> {
  await device.service.connect();
  await device.service.setPassphrase(passphrase);
}

describe('DriveSyncService', () => {
  describe('not configured (empty client ID)', () => {
    it("reads 'No configurado', disables connect() and never loads the Drive module", async () => {
      const world = createWorld();
      const device = await createDevice(world, 1, { clientId: '' });
      expect(device.service.configured()).toBe(false);
      expect(device.service.status()).toEqual({ state: 'not-configured' });
      expect(device.service.statusText()).toBe('No configurado');
      await expect(device.service.connect()).rejects.toBeInstanceOf(DataError);
      await expect(device.service.sync()).rejects.toBeInstanceOf(DataError);
      await device.service.prepare();
      expect(device.loadDriveModule).not.toHaveBeenCalled();
      expect(world.gisLoads).toBe(0);
    });
  });

  describe('Google is contacted only after the user connects', () => {
    it('loads neither the Drive module, nor GIS, nor the network before connect()', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      expect(device.service.configured()).toBe(true);
      expect(device.service.statusText()).toBe('Drive desconectado');
      await addLoan(device, 'Casa A');
      await device.service.disconnect();
      expect(device.loadDriveModule).not.toHaveBeenCalled();
      expect(world.gisLoads).toBe(0);
      expect(world.drive.requests).toEqual([]);
      expect(world.gis.requests).toEqual([]);
      expect(world.gis.revokedTokens).toEqual([]);
    });

    it('loads the Drive module on connect() and only then', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await device.service.connect();
      expect(device.loadDriveModule).toHaveBeenCalledTimes(1);
      expect(world.gisLoads).toBe(1);
    });

    it('prepare() loads the module and GIS ahead of the click; the click then reaches requestAccessToken in microtasks only', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await device.service.prepare();
      expect(device.loadDriveModule).toHaveBeenCalledTimes(1);
      expect(world.gisLoads).toBe(1);
      expect(world.gis.requests).toEqual([]);

      let macrotaskRan = false;
      setTimeout(() => {
        macrotaskRan = true;
      }, 0);
      const connecting = device.service.connect();
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve();
      }
      // Inside the click's task: no timer, import or network wait between the click and the consent popup.
      expect(macrotaskRan).toBe(false);
      expect(world.gis.requests).toHaveLength(1);
      await connecting;
      expect(device.loadDriveModule).toHaveBeenCalledTimes(1);
      expect(world.gisLoads).toBe(1);
    });

    it('prepare() on a failing GIS load resolves and connect() reports the failure as offline', async () => {
      const world = createWorld();
      const failing = vi.fn(() => Promise.reject(new Error('blocked')));
      const device = await createDevice(world, 1, { loadGis: failing });
      await expect(device.service.prepare()).resolves.toBeUndefined();
      await device.service.connect();
      expect(device.service.status()).toEqual({ state: 'offline', pendingChanges: 0 });
    });
  });

  describe('privacy promises', () => {
    it('requests only the drive.appdata scope and keeps the token out of every browser store', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await enroll(device);
      await addLoan(device, 'Casa A');
      await device.service.sync();

      expect(world.gis.requests.map((request) => request.scope)).toEqual([
        'https://www.googleapis.com/auth/drive.appdata',
      ]);
      const token = world.gis.issuedTokens[0] ?? '';
      expect(token).not.toBe('');

      const haystacks: string[] = [];
      for (const area of [globalThis.localStorage, globalThis.sessionStorage] as (Storage | undefined)[]) {
        if (area === undefined) continue;
        for (let index = 0; index < area.length; index += 1) {
          const key = area.key(index) ?? '';
          haystacks.push(key, area.getItem(key) ?? '');
        }
      }
      haystacks.push(globalThis.document?.cookie ?? '');
      // The only persistent store this service writes is the key store: one record, no token, no passphrase.
      const dump = await dumpDatabases(device.indexedDb);
      haystacks.push(JSON.stringify(dump.shape));
      for (const text of haystacks) {
        expect(text).not.toContain(token);
        expect(text).not.toContain(PASSPHRASE);
      }
      expect(dump.names).toEqual(['cuotascasa-keys']);
      expect(dump.shape).toEqual([
        { keys: ['iterations', 'key', 'saltId'], extractable: false, usages: ['decrypt', 'encrypt'] },
      ]);
    });

    it('uploads AES-256-GCM / PBKDF2-SHA256 with 600 000 iterations and a non-extractable per-device key (production parameters)', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1, {
        iterations: undefined,
        minIterations: undefined,
      } as Partial<SyncOptions>);
      await enroll(device);
      await addLoan(device, 'Casa A');
      await device.service.sync();

      expect(PBKDF2_ITERATIONS).toBe(600_000);
      const stored = await createIndexedDbKeyStore({ indexedDB: device.indexedDb }).load();
      expect(stored?.key.extractable).toBe(false);
      expect(stored?.iterations).toBe(600_000);

      const remote = world.drive.fileByName(REMOTE_FILE_NAME);
      expect(remote).toBeDefined();
      const envelope = parseEnvelope(remote?.content ?? '');
      expect(envelope.format).toBe('cuotascasa-enc');
      expect(envelope.kdf).toMatchObject({ name: 'PBKDF2-SHA256', iterations: 600_000 });
      expect(envelope.cipher.name).toBe('AES-256-GCM');
      expect(remote?.content).not.toContain('Casa A');
      expect(remote?.parents).toEqual(['appDataFolder']);
    }, 30_000);

    it('disconnect() revokes the token, forgets it and the next sync starts a new authorization', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await enroll(device);
      const token = world.gis.issuedTokens[0] ?? '';
      await device.service.disconnect();
      expect(world.gis.revokedTokens).toEqual([token]);
      expect(world.gis.isTokenValid(token)).toBe(false);
      expect(device.service.status()).toEqual({ state: 'disconnected' });
      expect(device.service.statusText()).toBe('Drive desconectado');

      await device.service.sync();
      expect(world.gis.requests).toHaveLength(2);
      expect(world.gis.issuedTokens).toHaveLength(2);
    });

    it('the Drive file names are cuotascasa.json and cuotascasa.prev.json, in appDataFolder', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await enroll(device);
      await addLoan(device, 'Casa A');
      await device.service.sync();
      await addLoan(device, 'Casa B');
      await device.service.sync();
      expect(
        world.drive
          .files()
          .map((file) => file.name)
          .sort(),
      ).toEqual(['cuotascasa.json', 'cuotascasa.prev.json']);
      expect(world.drive.files().every((file) => file.parents.join() === 'appDataFolder')).toBe(true);
      expect(REMOTE_PREV_FILE_NAME).toBe('cuotascasa.prev.json');
    });
  });

  describe('connect -> setPassphrase -> sync', () => {
    it('asks for a passphrase after connecting, then uploads an envelope', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await device.service.connect();
      expect(device.service.status()).toEqual({ state: 'needs-passphrase', reason: 'no-key' });
      expect(device.service.statusText()).toBe('Falta la frase de cifrado');

      await device.service.setPassphrase(PASSPHRASE);
      expect(device.service.status()).toEqual({ state: 'idle', pendingChanges: 0, lastSyncAt: null });

      await addLoan(device, 'Casa A');
      await device.service.sync();
      expect(device.service.status().state).toBe('idle');
      expect(device.service.statusText()).toBe('Sincronizado');
      const remote = world.drive.fileByName(REMOTE_FILE_NAME);
      expect(parseEnvelope(remote?.content ?? '').format).toBe('cuotascasa-enc');
    });

    it('rejects an empty passphrase and a setPassphrase before connecting with DataError', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await expect(device.service.setPassphrase(PASSPHRASE)).rejects.toMatchObject({ code: 'VALIDATION' });
      await device.service.connect();
      await expect(device.service.setPassphrase('')).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(device.service.changePassphrase('')).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('a second device with the same passphrase takes the salt from the remote envelope and merges', async () => {
      const world = createWorld();
      const first = await createDevice(world, 1);
      await enroll(first);
      await addLoan(first, 'Casa A');
      await first.service.sync();

      const second = await createDevice(world, 2);
      await enroll(second);
      const salt = parseEnvelope(world.drive.fileByName(REMOTE_FILE_NAME)?.content ?? '').kdf.salt;
      expect((await createIndexedDbKeyStore({ indexedDB: second.indexedDb }).load())?.saltId).toBe(salt);

      await addLoan(second, 'Casa B');
      await second.service.sync();
      expect(await loanNames(second)).toEqual(['Casa A', 'Casa B']);

      await first.service.sync();
      expect(await loanNames(first)).toEqual(['Casa A', 'Casa B']);
      expect(second.service.statusText()).toBe('Sincronizado');
    });

    it('a wrong passphrase on a second device keeps the key out of the store and asks again', async () => {
      const world = createWorld();
      const first = await createDevice(world, 1);
      await enroll(first);
      await addLoan(first, 'Casa A');
      await first.service.sync();

      const second = await createDevice(world, 2);
      await enroll(second, 'otra frase distinta');
      expect(second.service.status()).toEqual({ state: 'needs-passphrase', reason: 'WrongPassphraseOrTamper' });
      expect(second.service.statusText()).toBe(
        'La frase no coincide con la copia de Drive: revísala e inténtalo de nuevo',
      );
      expect(await createIndexedDbKeyStore({ indexedDB: second.indexedDb }).load()).toBeNull();
      expect(await loanNames(second)).toEqual([]);
    });

    it('sets the device flag on connect and restores needs-auth after a reload without contacting Google', async () => {
      const world = createWorld();
      const first = await createDevice(world, 1);
      await enroll(first);
      expect((await first.store.settings.getDevice())?.driveSyncEnabled).toBe(true);

      const reloaded = await createDevice(world, 1, {}, first);
      await vi.waitFor(() => {
        expect(reloaded.service.status()).toEqual({ state: 'needs-auth' });
      });
      expect(reloaded.loadDriveModule).not.toHaveBeenCalled();
      expect(reloaded.service.statusText()).toBe('Falta autorizar Drive');

      await reloaded.service.disconnect();
      expect((await first.store.settings.getDevice())?.driveSyncEnabled).toBe(false);
      expect(reloaded.service.status()).toEqual({ state: 'disconnected' });
    });
  });

  describe('change passphrase (ADR-0009 decision 6, D25)', () => {
    it('re-encrypts the remote under the lock, keeps the previous copy and only then saves the new key', async () => {
      const world = createWorld();
      const first = await createDevice(world, 1);
      await enroll(first);
      await addLoan(first, 'Casa A');
      await first.service.sync();
      const before = world.drive.fileByName(REMOTE_FILE_NAME)?.content ?? '';
      const oldSalt = parseEnvelope(before).kdf.salt;
      first.locks.names.length = 0;

      await first.service.changePassphrase('frase nueva de prueba');

      expect(first.locks.names).toEqual([SYNC_LOCK_NAME]);
      const after = parseEnvelope(world.drive.fileByName(REMOTE_FILE_NAME)?.content ?? '');
      expect(after.kdf.salt).not.toBe(oldSalt);
      expect(world.drive.fileByName(REMOTE_PREV_FILE_NAME)?.content).toBe(before);
      expect((await createIndexedDbKeyStore({ indexedDB: first.indexedDb }).load())?.saltId).toBe(after.kdf.salt);
      // The same device keeps syncing without KeyMismatch.
      await addLoan(first, 'Casa B');
      await first.service.sync();
      expect(first.service.status().state).toBe('idle');
    });

    it('another device gets KeyMismatch, asks for the passphrase and recovers with the new one', async () => {
      const world = createWorld();
      const first = await createDevice(world, 1);
      const second = await createDevice(world, 2);
      await enroll(first);
      await addLoan(first, 'Casa A');
      await first.service.sync();
      await enroll(second);
      await second.service.sync();

      await first.service.changePassphrase('frase nueva de prueba');
      await second.service.sync();
      expect(second.service.status()).toEqual({ state: 'needs-passphrase', reason: 'KeyMismatch' });
      expect(second.service.statusText()).toBe('La frase cambió en otro dispositivo: ingrésala de nuevo');

      await second.service.setPassphrase('frase nueva de prueba');
      await second.service.sync();
      expect(second.service.status().state).toBe('idle');
      expect(await loanNames(second)).toEqual(['Casa A']);
    });

    it('keeps the old key when the upload fails, so the next sync does not hit KeyMismatch', async () => {
      const world = createWorld();
      const first = await createDevice(world, 1);
      await enroll(first);
      await addLoan(first, 'Casa A');
      await first.service.sync();
      const oldKey = await createIndexedDbKeyStore({ indexedDB: first.indexedDb }).load();
      const remoteBefore = world.drive.fileByName(REMOTE_FILE_NAME)?.content;

      world.drive.failNext({ kind: 'network' }, { operation: 'files.update.multipart' });
      await first.service.changePassphrase('frase nueva de prueba');

      expect(first.service.status().state).toBe('offline');
      expect((await createIndexedDbKeyStore({ indexedDB: first.indexedDb }).load())?.saltId).toBe(oldKey?.saltId);
      expect(world.drive.fileByName(REMOTE_FILE_NAME)?.content).toBe(remoteBefore);
      await first.service.sync();
      expect(first.service.status().state).toBe('idle');
    });

    it('without a remote file it only replaces the key; without a key it asks for the passphrase', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await device.service.connect();
      await device.service.changePassphrase('frase nueva de prueba');
      expect(device.service.status()).toEqual({ state: 'needs-passphrase', reason: 'KeyMismatch' });

      await device.service.setPassphrase(PASSPHRASE);
      const oldSalt = (await createIndexedDbKeyStore({ indexedDB: device.indexedDb }).load())?.saltId;
      await device.service.changePassphrase('frase nueva de prueba');
      expect((await createIndexedDbKeyStore({ indexedDB: device.indexedDb }).load())?.saltId).not.toBe(oldSalt);
      expect(device.service.status().state).toBe('idle');
    });
  });

  describe('status', () => {
    it("offline reads 'Cambios sin sincronizar (n)' with n = pendingChanges", async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await enroll(device);
      await addLoan(device, 'Casa A');
      await addLoan(device, 'Casa B');
      world.drive.failNext({ kind: 'network' });
      await device.service.sync();
      expect(device.service.status()).toEqual({ state: 'offline', pendingChanges: 2 });
      expect(device.service.statusText()).toBe('Cambios sin sincronizar (2)');
    });

    it('follows local edits while idle', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await enroll(device);
      await addLoan(device, 'Casa A');
      await vi.waitFor(() => {
        expect(device.service.statusText()).toBe('Cambios sin sincronizar (1)');
      });
      await device.service.sync();
      expect(device.service.statusText()).toBe('Sincronizado');
    });

    it('an expired token is renewed inside the sync() call itself (user gesture), before any other await', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await enroll(device);
      world.now += 2 * 3600 * 1000;
      const syncing = device.service.sync();
      await Promise.resolve();
      await Promise.resolve();
      expect(world.gis.requests).toHaveLength(2);
      expect(world.gis.requests[1]?.prompt).toBe('');
      await syncing;
      expect(device.service.status().state).toBe('idle');
    });

    it('an authorization popup closed during sync() reads needs-auth', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await enroll(device);
      world.now += 2 * 3600 * 1000;
      world.gis.queueUserActions('close-popup');
      await device.service.sync();
      expect(device.service.status()).toEqual({ state: 'needs-auth' });
    });

    it('a denied connect reads needs-auth and does not save the intent', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      world.gis.queueUserActions('deny');
      await device.service.connect();
      expect(device.service.status()).toEqual({ state: 'needs-auth' });
      expect((await device.store.settings.getDevice())?.driveSyncEnabled).not.toBe(true);
    });
  });

  describe('unreadable Drive copy', () => {
    async function seededDevice(content: (key: Awaited<ReturnType<typeof deriveStoredKey>>) => Promise<string>) {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await enroll(device);
      await addLoan(device, 'Casa A');
      const key = await createIndexedDbKeyStore({ indexedDB: device.indexedDb }).load();
      if (key === null) throw new Error('no key');
      world.drive.seed({ name: REMOTE_FILE_NAME, content: await content(key) });
      return { world, device };
    }

    it('InvalidRemote: says the copy cannot be read and local data did not change; nothing is uploaded', async () => {
      const { world, device } = await seededDevice(async (key) =>
        serializeEnvelope(await encrypt(key, JSON.stringify({ not: 'a backup' }))),
      );
      const localBefore = JSON.stringify(await device.store.exportAll());
      const remoteBefore = world.drive.fileByName(REMOTE_FILE_NAME)?.content;

      await device.service.sync();

      expect(device.service.status()).toEqual({ state: 'error', code: 'InvalidRemote' });
      expect(device.service.statusText()).toBe('No se puede leer la copia de Drive. Tus datos locales no cambiaron.');
      expect(JSON.stringify(await device.store.exportAll())).toBe(localBefore);
      expect(world.drive.fileByName(REMOTE_FILE_NAME)?.content).toBe(remoteBefore);
    });

    it('a remote file that is not an envelope is InvalidRemote too, also when setting the passphrase', async () => {
      const { device } = await seededDevice(() => Promise.resolve('esto no es un sobre'));
      await device.service.sync();
      expect(device.service.status()).toEqual({ state: 'error', code: 'InvalidRemote' });

      const world = createWorld();
      world.drive.seed({ name: REMOTE_FILE_NAME, content: '{"hola":1}' });
      const fresh = await createDevice(world, 2);
      await enroll(fresh);
      expect(fresh.service.status()).toEqual({ state: 'error', code: 'InvalidRemote' });
      expect(await createIndexedDbKeyStore({ indexedDB: fresh.indexedDb }).load()).toBeNull();
    });

    it('never derives a key with the iterations of a weak or hostile remote envelope (WeakParams)', async () => {
      for (const iterations of [1_000, 10_000_000_000]) {
        const world = createWorld();
        const key = await deriveStoredKey(PASSPHRASE, { iterations: TEST_ITERATIONS });
        const envelope = await encrypt(key, 'x');
        world.drive.seed({
          name: REMOTE_FILE_NAME,
          content: JSON.stringify({ ...envelope, kdf: { ...envelope.kdf, iterations } }),
        });
        const device = await createDevice(world, 1, { minIterations: 600_000 });
        const started = Date.now();
        await enroll(device);
        expect(device.service.status()).toEqual({ state: 'error', code: 'WeakParams' });
        expect(Date.now() - started).toBeLessThan(5_000);
        expect(await createIndexedDbKeyStore({ indexedDB: device.indexedDb }).load()).toBeNull();
      }
    });
  });
});

/** Opens every database of the factory and describes its records without serializing keys. */
async function dumpDatabases(factory: IDBFactory): Promise<{
  names: string[];
  shape: { keys: string[]; extractable: boolean; usages: string[] }[];
}> {
  const databases = await factory.databases();
  const names = databases.map((database) => database.name ?? '').sort();
  const shape: { keys: string[]; extractable: boolean; usages: string[] }[] = [];
  for (const name of names) {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = factory.open(name);
      open.onsuccess = () => {
        resolve(open.result);
      };
      open.onerror = () => {
        reject(new Error('open'));
      };
    });
    for (const storeName of Array.from(db.objectStoreNames)) {
      const values = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        request.onsuccess = () => {
          resolve(request.result as unknown[]);
        };
        request.onerror = () => {
          reject(new Error('getAll'));
        };
      });
      for (const value of values) {
        const record = value as { key: CryptoKey };
        shape.push({
          keys: Object.keys(value as object).sort(),
          extractable: record.key.extractable,
          usages: [...record.key.usages].sort(),
        });
      }
    }
    db.close();
  }
  return { names, shape };
}
