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
function serialLocks(): LockManagerLike & { readonly names: string[]; readonly held: boolean } {
  let tail: Promise<unknown> = Promise.resolve();
  const names: string[] = [];
  let held = false;
  const guarded = async <T>(callback: () => Promise<T>): Promise<T> => {
    held = true;
    try {
      return await callback();
    } finally {
      held = false;
    }
  };
  return {
    names,
    get held() {
      return held;
    },
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      names.push(name);
      const run = tail.then(
        () => guarded(callback),
        () => guarded(callback),
      );
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
  readonly hooks: Hooks;
}

/** Fault and race injection at the fetch boundary of one device (the Drive fake itself stays frozen). */
interface Hooks {
  /** Rejects PATCH requests of the main file before they reach Drive. */
  failMainUpdate: boolean;
  /** Lets the PATCH of the main file succeed on Drive, then fails the response (ambiguous upload). */
  ambiguousMainUpdate: boolean;
  /** Runs after every download of the main file, before the response is returned (another device writes). */
  onMainDownload: (() => Promise<void>) | null;
  mainDownloads: number;
  /** Whether the sync lock was held at each Drive request. */
  heldAtRequest: boolean[];
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
  const hooks: Hooks = {
    failMainUpdate: false,
    ambiguousMainUpdate: false,
    onMainDownload: null,
    mainDownloads: 0,
    heldAtRequest: [],
  };
  const hookedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    hooks.heldAtRequest.push(locks.held);
    const main = world.drive.fileByName(REMOTE_FILE_NAME);
    const isMain = main !== undefined && url.includes(`/${main.id}`);
    if (method === 'PATCH' && isMain && hooks.failMainUpdate) {
      throw new TypeError('Failed to fetch');
    }
    const response = await world.drive.fetch(input, init);
    if (method === 'PATCH' && isMain && hooks.ambiguousMainUpdate) {
      throw new TypeError('Failed to fetch');
    }
    if (method === 'GET' && isMain && url.includes('alt=media')) {
      hooks.mainDownloads += 1;
      await hooks.onMainDownload?.();
    }
    return response;
  };
  const loadDriveModule = vi.fn(() => import('@cuotascasa/sync/google-drive'));
  const loadGis = (): Promise<GisOAuth2> => {
    world.gisLoads += 1;
    return Promise.resolve(world.gis.oauth2);
  };
  const options: SyncOptions = {
    clientId: CLIENT_ID,
    loadDriveModule,
    loadGis,
    fetch: hookedFetch,
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
    loadCryptoModule: options.loadCryptoModule ?? (() => import('@cuotascasa/sync/crypto')),
  });
  return { service, store, indexedDb, locks, loadDriveModule, clock, hooks };
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
      haystacks.push(JSON.stringify(await device.store.exportAll()));
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

    it('disconnect() revokes the token and forgets it; sync() is then rejected and reconnecting asks for consent again', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await enroll(device);
      const token = world.gis.issuedTokens[0] ?? '';
      await device.service.disconnect();
      expect(world.gis.revokedTokens).toEqual([token]);
      expect(world.gis.isTokenValid(token)).toBe(false);
      expect(device.service.status()).toEqual({ state: 'disconnected' });
      expect(device.service.statusText()).toBe('Drive desconectado');

      for (const call of [
        () => device.service.sync(),
        () => device.service.setPassphrase(PASSPHRASE),
        () => device.service.changePassphrase(PASSPHRASE),
      ]) {
        await expect(call()).rejects.toMatchObject({ code: 'VALIDATION' });
        expect(device.service.status()).toEqual({ state: 'disconnected' });
      }
      expect(world.gis.requests).toHaveLength(1);

      await device.service.connect();
      expect(world.gis.requests).toHaveLength(2);
      expect(world.gis.requests[1]?.prompt).toBe('consent');
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

const NEW_PASSPHRASE = 'frase nueva de prueba';
const BUSY_TEXT = 'Otro dispositivo está sincronizando; inténtalo de nuevo';

async function realCrypto() {
  return import('@cuotascasa/sync/crypto');
}

async function remoteKeySalt(world: World): Promise<string> {
  return parseEnvelope(world.drive.fileByName(REMOTE_FILE_NAME)?.content ?? '').kdf.salt;
}

async function localKeySalt(device: Device): Promise<string | undefined> {
  return (await createIndexedDbKeyStore({ indexedDB: device.indexedDb }).load())?.saltId;
}

/** Two enrolled devices that share a passphrase, the first one already synced. */
async function pair(world: World, overrides: Partial<SyncOptions> = {}) {
  const first = await createDevice(world, 1, overrides);
  await enroll(first);
  await addLoan(first, 'Casa A');
  await first.service.sync();
  const second = await createDevice(world, 2, overrides);
  await enroll(second);
  return { first, second };
}

describe('DriveSyncService: review fixes', () => {
  describe('lazy loading and the connect gesture', () => {
    it('constructing the service and reading status()/statusText() never loads GIS, the Drive module or crypto', async () => {
      const world = createWorld();
      const loadCryptoModule = vi.fn(realCrypto);
      const device = await createDevice(world, 1, { loadCryptoModule });
      void device.service.status();
      void device.service.statusText();
      void device.service.configured();
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(device.loadDriveModule).not.toHaveBeenCalled();
      expect(loadCryptoModule).not.toHaveBeenCalled();
      expect(world.gisLoads).toBe(0);
      expect(world.drive.requests).toEqual([]);
    });

    it('sync() without a runtime (after a reload, needs-auth) neither connects nor changes the status', async () => {
      const world = createWorld();
      const first = await createDevice(world, 1);
      await enroll(first);
      const reloaded = await createDevice(world, 1, {}, first);
      await vi.waitFor(() => {
        expect(reloaded.service.status()).toEqual({ state: 'needs-auth' });
      });
      await expect(reloaded.service.sync()).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(reloaded.service.status()).toEqual({ state: 'needs-auth' });
      expect(reloaded.loadDriveModule).not.toHaveBeenCalled();
      expect(world.gis.requests).toHaveLength(1);
    });

    it('a prepared but not connected service rejects sync(), setPassphrase() and changePassphrase()', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await device.service.prepare();
      for (const call of [
        () => device.service.sync(),
        () => device.service.setPassphrase(PASSPHRASE),
        () => device.service.changePassphrase(PASSPHRASE),
      ]) {
        await expect(call()).rejects.toMatchObject({ code: 'VALIDATION' });
      }
      expect(device.service.status()).toEqual({ state: 'disconnected' });
      expect(world.gis.requests).toEqual([]);
    });

    it('a failed dynamic import reads offline and no raw error escapes connect()', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1, { loadDriveModule: () => Promise.reject(new Error('chunk failed')) });
      await expect(device.service.connect()).resolves.toBeUndefined();
      expect(device.service.status()).toEqual({ state: 'offline', pendingChanges: 0 });
    });

    it('connect() skips the consent prompt while the token is still valid', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await device.service.connect();
      await device.service.connect();
      expect(world.gis.requests).toHaveLength(1);
      expect(device.service.status()).toEqual({ state: 'needs-passphrase', reason: 'no-key' });
    });
  });

  describe('disconnect during a sync', () => {
    it('leaves the final state disconnected: later session emissions are ignored', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await enroll(device);
      await addLoan(device, 'Casa A');
      await device.service.sync();
      await addLoan(device, 'Casa B');
      device.hooks.onMainDownload = async () => {
        device.hooks.onMainDownload = null;
        await device.service.disconnect();
      };
      await device.service.sync();
      expect(device.service.status()).toEqual({ state: 'disconnected' });
      expect(device.service.statusText()).toBe('Drive desconectado');
    });
  });

  describe('crypto guards and the sync lock', () => {
    it('never derives a key when the remote iterations are below the minimum (WeakParams)', async () => {
      const world = createWorld();
      const crypto = await realCrypto();
      const weak = await crypto.deriveStoredKey(PASSPHRASE, { iterations: 1_000 });
      world.drive.seed({ name: REMOTE_FILE_NAME, content: serializeEnvelope(await crypto.encrypt(weak, 'x')) });
      const derive = vi.fn(crypto.deriveStoredKey);
      const device = await createDevice(world, 1, {
        minIterations: 5_000,
        loadCryptoModule: () => Promise.resolve({ ...crypto, deriveStoredKey: derive }),
      });
      await enroll(device);
      expect(device.service.status()).toEqual({ state: 'error', code: 'WeakParams' });
      expect(derive).not.toHaveBeenCalled();
    });

    it('holds SYNC_LOCK_NAME during every Drive request of setPassphrase and changePassphrase', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await device.service.connect();
      await device.service.setPassphrase(PASSPHRASE);
      await addLoan(device, 'Casa A');
      await device.service.sync();
      expect(device.locks.names).toContain(SYNC_LOCK_NAME);

      device.hooks.heldAtRequest.length = 0;
      device.locks.names.length = 0;
      await device.service.setPassphrase(PASSPHRASE);
      expect(device.locks.names).toEqual([SYNC_LOCK_NAME]);
      expect(device.hooks.heldAtRequest.length).toBeGreaterThan(0);
      expect(device.hooks.heldAtRequest.every(Boolean)).toBe(true);

      device.hooks.heldAtRequest.length = 0;
      await device.service.changePassphrase(NEW_PASSPHRASE);
      expect(device.hooks.heldAtRequest.length).toBeGreaterThan(0);
      expect(device.hooks.heldAtRequest.every(Boolean)).toBe(true);
    });

    it('a mistyped passphrase on a device that already has a working key restores the previous status', async () => {
      const world = createWorld();
      const device = await createDevice(world, 1);
      await enroll(device);
      await addLoan(device, 'Casa A');
      await device.service.sync();
      const before = device.service.status();
      const salt = await localKeySalt(device);
      await device.service.setPassphrase('otra frase distinta');
      expect(device.service.status()).toEqual(before);
      expect(await localKeySalt(device)).toBe(salt);
    });
  });

  describe('changePassphrase under races and ambiguous uploads', () => {
    it('another device uploads between download and upload: the pass repeats and its data is kept', async () => {
      const world = createWorld();
      const { first, second } = await pair(world);
      await addLoan(second, 'Casa B');
      first.hooks.mainDownloads = 0;
      first.hooks.onMainDownload = async () => {
        first.hooks.onMainDownload = null;
        await second.service.sync();
      };

      await first.service.changePassphrase(NEW_PASSPHRASE);

      expect(first.hooks.mainDownloads).toBeGreaterThanOrEqual(2);
      expect(first.service.status().state).toBe('idle');
      await first.service.sync();
      expect(await loanNames(first)).toEqual(['Casa A', 'Casa B']);
      expect(await localKeySalt(first)).toBe(await remoteKeySalt(world));
    });

    it('when the remote keeps changing it gives up with its own text and keeps the old key', async () => {
      const world = createWorld();
      const { first, second } = await pair(world);
      const salt = await localKeySalt(first);
      first.hooks.onMainDownload = async () => {
        await second.service.sync();
      };
      await first.service.changePassphrase(NEW_PASSPHRASE);
      expect(first.service.statusText()).toBe(BUSY_TEXT);
      expect(first.service.status().state).toBe('offline');
      expect(await localKeySalt(first)).toBe(salt);
      expect(await remoteKeySalt(world)).toBe(salt);
    });

    it('an upload whose answer was lost but reached Drive: the new key is saved because it opens the remote', async () => {
      const world = createWorld();
      const { first, second } = await pair(world);
      first.hooks.ambiguousMainUpdate = true;
      await first.service.changePassphrase(NEW_PASSPHRASE);
      first.hooks.ambiguousMainUpdate = false;
      expect(await localKeySalt(first)).toBe(await remoteKeySalt(world));
      expect(first.service.status().state).toBe('idle');
      await first.service.sync();
      expect(first.service.status().state).toBe('idle');
      await second.service.setPassphrase(NEW_PASSPHRASE);
      expect(second.service.status().state).toBe('idle');
    });

    it('an upload that never reached Drive keeps the old key', async () => {
      const world = createWorld();
      const { first } = await pair(world);
      const salt = await localKeySalt(first);
      const remote = world.drive.fileByName(REMOTE_FILE_NAME)?.content;
      first.hooks.failMainUpdate = true;
      await first.service.changePassphrase(NEW_PASSPHRASE);
      first.hooks.failMainUpdate = false;
      expect(await localKeySalt(first)).toBe(salt);
      expect(world.drive.fileByName(REMOTE_FILE_NAME)?.content).toBe(remote);
      await first.service.sync();
      expect(first.service.status().state).toBe('idle');
    });

    it('a key save that fails after the upload is retried once the remote is seen to open with the new key', async () => {
      const world = createWorld();
      let failSave = false;
      const crypto = await realCrypto();
      const { first } = await pair(world, {
        loadCryptoModule: () =>
          Promise.resolve({
            ...crypto,
            createIndexedDbKeyStore: (options) => {
              const real = crypto.createIndexedDbKeyStore(options);
              return {
                ...real,
                save: (entry) => {
                  if (failSave) {
                    failSave = false;
                    return Promise.reject(new Error('quota'));
                  }
                  return real.save(entry);
                },
              };
            },
          }),
      });
      failSave = true;
      await first.service.changePassphrase(NEW_PASSPHRASE);
      expect(await localKeySalt(first)).toBe(await remoteKeySalt(world));
      expect(first.service.status().state).toBe('idle');
    });

    it('with a stale local key the remote, the previous copy and the key stay as they were', async () => {
      const world = createWorld();
      const { first, second } = await pair(world);
      await first.service.changePassphrase(NEW_PASSPHRASE);
      const main = world.drive.fileByName(REMOTE_FILE_NAME)?.content;
      const prev = world.drive.fileByName(REMOTE_PREV_FILE_NAME)?.content;
      const salt = await localKeySalt(second);

      await second.service.changePassphrase('otra frase todavia mas nueva');

      expect(second.service.status()).toEqual({ state: 'needs-passphrase', reason: 'KeyMismatch' });
      expect(world.drive.fileByName(REMOTE_FILE_NAME)?.content).toBe(main);
      expect(world.drive.fileByName(REMOTE_PREV_FILE_NAME)?.content).toBe(prev);
      expect(await localKeySalt(second)).toBe(salt);
    });
  });

  describe('data is preserved when a sync cannot finish', () => {
    it('a failed upload leaves the remote files, pendingChanges and lastSyncAt alone and keeps the merged local data', async () => {
      const world = createWorld();
      const { first, second } = await pair(world);
      await addLoan(first, 'Casa A2');
      await first.service.sync();
      await addLoan(second, 'Casa C');
      await second.service.sync();
      await addLoan(first, 'Casa B');
      const lastSyncAt = (await first.store.getMeta()).lastSyncAt;
      const main = world.drive.fileByName(REMOTE_FILE_NAME)?.content;

      first.hooks.failMainUpdate = true;
      await first.service.sync();

      expect(first.service.status()).toEqual({ state: 'offline', pendingChanges: 1 });
      expect(first.service.statusText()).toBe('Cambios sin sincronizar (1)');
      expect(world.drive.fileByName(REMOTE_FILE_NAME)?.content).toBe(main);
      expect(world.drive.fileByName(REMOTE_PREV_FILE_NAME)?.content).toBe(main);
      expect(await first.store.pendingChanges()).toBe(1);
      expect((await first.store.getMeta()).lastSyncAt).toBe(lastSyncAt);
      expect(await loanNames(first)).toEqual(['Casa A', 'Casa A2', 'Casa B', 'Casa C']);
    });

    it.each(['KeyMismatch', 'WrongPassphraseOrTamper', 'WeakParams'] as const)(
      '%s during sync() changes neither the local data nor the remote file',
      async (code) => {
        const world = createWorld();
        const crypto = await realCrypto();
        const device = await createDevice(world, 1, code === 'WeakParams' ? { minIterations: 5_000 } : {});
        await enroll(device);
        await addLoan(device, 'Casa A');
        const key = await createIndexedDbKeyStore({ indexedDB: device.indexedDb }).load();
        if (key === null) throw new Error('no key');
        const foreign =
          code === 'KeyMismatch'
            ? await crypto.deriveStoredKey('frase ajena', { iterations: TEST_ITERATIONS })
            : await crypto.deriveStoredKey(code === 'WeakParams' ? PASSPHRASE : 'frase ajena', {
                saltId: key.saltId,
                iterations: code === 'WeakParams' ? 1_000 : TEST_ITERATIONS,
              });
        // WeakParams: the device accepts >= 5 000 iterations, the file says 1 000; the others use the test iterations.
        world.drive.seed({ name: REMOTE_FILE_NAME, content: serializeEnvelope(await crypto.encrypt(foreign, 'x')) });
        const localBefore = JSON.stringify(await device.store.exportAll());
        const remoteBefore = world.drive.fileByName(REMOTE_FILE_NAME)?.content;

        await device.service.sync();

        const expected = code === 'WeakParams' ? { state: 'error', code } : { state: 'needs-passphrase', reason: code };
        expect(device.service.status()).toEqual(expected);
        expect(JSON.stringify(await device.store.exportAll())).toBe(localBefore);
        expect(world.drive.fileByName(REMOTE_FILE_NAME)?.content).toBe(remoteBefore);
      },
    );

    it('a replaceAll that rejects makes sync() reject with DataError(STORAGE) and restores the previous status', async () => {
      const world = createWorld();
      const clock = createManualClock(new Date(T0 + 1000).toISOString());
      const real = await createInMemoryDataStore({
        clock,
        ids: {
          newId: (() => {
            let n = 0;
            return () => deviceUuid(1, (n += 1));
          })(),
        },
      });
      const failing = new Proxy(real, {
        get(target, property) {
          if (property === 'replaceAll') {
            return () => Promise.reject(new Error('disk full'));
          }
          const value: unknown = Reflect.get(target, property);
          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
        },
      });
      const device = await createDevice(world, 1, {}, { store: failing, indexedDb: new IDBFactory(), clock });
      await enroll(device);
      await real.loans.create({ ...sampleLoan(), name: 'Casa A' });
      await vi.waitFor(() => {
        expect(device.service.statusText()).toBe('Cambios sin sincronizar (1)');
      });
      const before = device.service.status();

      await expect(device.service.sync()).rejects.toBeInstanceOf(DataError);
      await expect(device.service.sync()).rejects.toMatchObject({ code: 'STORAGE' });
      expect(device.service.status()).toEqual(before);
    });
  });

  describe('subscription lifecycle', () => {
    it('does not subscribe to the DataStore when the service was destroyed before the store resolved', async () => {
      const world = createWorld();
      const clock = createManualClock();
      const real = await createInMemoryDataStore({ clock, ids: { newId: () => deviceUuid(1, 1) } });
      const subscribe = vi.spyOn(real, 'subscribe');
      let resolveStore: (store: DataStore) => void = () => undefined;
      const store = new Promise<DataStore>((resolve) => {
        resolveStore = resolve;
      });
      const service = new DriveSyncService({
        options: { clientId: CLIENT_ID, loadGis: () => Promise.resolve(world.gis.oauth2) },
        clientId: CLIENT_ID,
        store,
        clock,
        locks: serialLocks(),
        loadDriveModule: () => import('@cuotascasa/sync/google-drive'),
        loadCryptoModule: realCrypto,
      });
      await service.prepare();
      service.destroy();
      resolveStore(real);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(subscribe).not.toHaveBeenCalled();
    });

    it('a rejecting DataStore promise leaves no unhandled rejection', async () => {
      const world = createWorld();
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      const service = new DriveSyncService({
        options: { clientId: CLIENT_ID, loadGis: () => Promise.resolve(world.gis.oauth2) },
        clientId: CLIENT_ID,
        store: Promise.reject(new Error('no storage')),
        clock: createManualClock(),
        locks: serialLocks(),
        loadDriveModule: () => import('@cuotascasa/sync/google-drive'),
        loadCryptoModule: realCrypto,
      });
      await service.prepare();
      await new Promise((resolve) => setTimeout(resolve, 10));
      process.off('unhandledRejection', unhandled);
      expect(unhandled).not.toHaveBeenCalled();
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
