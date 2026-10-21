import {
  DestroyRef,
  DOCUMENT,
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
} from '@angular/core';
import type { DataStore } from '@cuotascasa/persistence';
import { SYNC_LOCK_NAME, type LockManagerLike } from '@cuotascasa/sync';
import { DataError, type DeviceDataService, type SyncService } from '../api.ts';
import { DATA_STORE } from '../data-layer.tokens.ts';
import { DEVICE_DATA_SERVICE, SYNC_SERVICE } from '../tokens.ts';

/** DataError message of a failure before anything changed (preload). Every other STORAGE message means «partial». */
export const DEVICE_NOTHING_CHANGED = 'DEVICE_NOTHING_CHANGED';
export const DEVICE_PARTIAL = 'DEVICE_PARTIAL';
export const DEVICE_CHANNEL_NAME = 'cuotascasa-device';
const CLEARED = 'cleared';
const BLOCKED_TIMEOUT_MS = 5000;

/** The part of BroadcastChannel this service uses. */
export interface DeviceChannel {
  postMessage(message: unknown): void;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  close(): void;
}

export interface DeviceDataOptions {
  /** IndexedDB factory; defaults to the global one. Tests pass an isolated fake. */
  readonly indexedDb?: IDBFactory;
  /** Opens the cross-tab channel; null when unsupported. Defaults to BroadcastChannel. */
  readonly channel?: () => DeviceChannel | null;
  /** Lock manager; null runs without. Defaults to navigator.locks. */
  readonly locks?: LockManagerLike | null;
  /** How long a blocked deletion waits for the blocking connections to close. */
  readonly blockedTimeoutMs?: number;
  /** Loads the two database names (dynamic imports). Test seam; defaults to the real modules. */
  readonly loadNames?: () => Promise<{ readonly data: string; readonly keys: string }>;
  /** What another tab does when this one cleared the device: a full load of /app. */
  readonly reload?: () => void;
}

/** States in which Drive was authorized or is being used; disconnect() revokes the token and forgets the intent. */
function driveInUse(sync: SyncService): boolean {
  const state = sync.status().state;
  return state !== 'disconnected' && state !== 'not-configured';
}

/**
 * Deletes one database. A missing database resolves. A blocked deletion stays queued: it waits for the blocking
 * connections to close (success) and only gives up after the timeout.
 */
function deleteDatabase(factory: IDBFactory, name: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = (): void => {
      clearTimeout(timer);
      reject(new DataError('STORAGE', DEVICE_PARTIAL));
    };
    let request: IDBOpenDBRequest;
    try {
      request = factory.deleteDatabase(name);
    } catch {
      fail();
      return;
    }
    request.onsuccess = () => {
      clearTimeout(timer);
      resolve();
    };
    request.onerror = fail;
    request.onblocked = () => {
      timer ??= setTimeout(fail, timeoutMs);
    };
  });
}

async function loadNames(): Promise<{ readonly data: string; readonly keys: string }> {
  const [{ DEXIE_DB_NAME }, { KEY_STORE_DATABASE }] = await Promise.all([
    import('@cuotascasa/persistence/dexie'),
    import('@cuotascasa/sync/crypto'),
  ]);
  return { data: DEXIE_DB_NAME, keys: KEY_STORE_DATABASE };
}

function defaultChannel(): DeviceChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : (new BroadcastChannel(DEVICE_CHANNEL_NAME) as DeviceChannel);
}

function defaultLocks(): LockManagerLike | null {
  const manager = (globalThis.navigator as Navigator | undefined)?.locks;
  return manager === undefined ? null : { request: (name, callback) => manager.request(name, callback) };
}

class IndexedDbDeviceDataService implements DeviceDataService {
  private readonly sync = inject(SYNC_SERVICE);
  private readonly store = inject(DATA_STORE);
  private readonly document = inject(DOCUMENT);
  private readonly options: DeviceDataOptions;
  private channel: DeviceChannel | null | undefined;

  constructor(options: DeviceDataOptions) {
    this.options = options;
  }

  /** Other tabs: when one clears this device, this tab's state is dead and it loads /app again. */
  listen(): () => void {
    const channel = this.openChannel();
    if (channel === null) return () => undefined;
    channel.onmessage = (event) => {
      if (event.data === CLEARED) {
        (this.options.reload ?? (() => this.document.defaultView?.location.replace('/app')))();
      }
    };
    return () => {
      channel.onmessage = null;
      channel.close();
      this.channel = undefined;
    };
  }

  private openChannel(): DeviceChannel | null {
    if (this.channel === undefined) {
      try {
        this.channel = (this.options.channel ?? defaultChannel)();
      } catch {
        this.channel = null;
      }
    }
    return this.channel;
  }

  async clearAll(): Promise<void> {
    const factory = this.options.indexedDb ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    // 1. Everything that can fail without side effects: names are loaded before anything is changed.
    let names: { readonly data: string; readonly keys: string };
    try {
      if (factory === undefined) throw new Error('IndexedDB is not available');
      names = await (this.options.loadNames ?? loadNames)();
    } catch {
      throw new DataError('STORAGE', DEVICE_NOTHING_CHANGED);
    }
    // 2. From here on the state of this tab is dead whatever happens: failures say «partial».
    try {
      if (driveInUse(this.sync)) {
        await this.sync.disconnect(); // revokes the token: the only Google call
      }
      let opened: DataStore | null = null;
      try {
        opened = await this.store;
      } catch {
        // The store never opened (corrupt or incompatible database): nothing to close, the deletion still applies.
      }
      await opened?.close();
      this.openChannel()?.postMessage(CLEARED); // other tabs release their connections before the deletes
      const timeout = this.options.blockedTimeoutMs ?? BLOCKED_TIMEOUT_MS;
      const locks = 'locks' in this.options ? this.options.locks : defaultLocks();
      const work = async (): Promise<void> => {
        // The key store first: a sync or passphrase change cannot recreate it while the lock is held.
        await deleteDatabase(factory as IDBFactory, names.keys, timeout);
        await deleteDatabase(factory as IDBFactory, names.data, timeout);
      };
      await (locks ? locks.request(SYNC_LOCK_NAME, work) : work());
    } catch {
      throw new DataError('STORAGE', DEVICE_PARTIAL);
    }
  }
}

/** W7-04: «Borrar datos de este dispositivo». Never reads, writes or deletes the Drive copy. */
export function provideDeviceData(options: DeviceDataOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: DEVICE_DATA_SERVICE, useFactory: (): DeviceDataService => new IndexedDbDeviceDataService(options) },
    provideEnvironmentInitializer(() => {
      const stop = (inject(DEVICE_DATA_SERVICE) as IndexedDbDeviceDataService).listen();
      inject(DestroyRef).onDestroy(stop);
    }),
  ]);
}
