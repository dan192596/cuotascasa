import { type EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import { DataError, type DeviceDataService, type SyncService } from '../api.ts';
import { DATA_STORE } from '../data-layer.tokens.ts';
import { DEVICE_DATA_SERVICE, SYNC_SERVICE } from '../tokens.ts';

export interface DeviceDataOptions {
  /** IndexedDB factory; defaults to the global one. Tests pass an isolated fake. */
  readonly indexedDb?: IDBFactory;
}

/** States in which Drive was authorized or is being used; disconnect() revokes the token and forgets the intent. */
function driveInUse(sync: SyncService): boolean {
  const state = sync.status().state;
  return state !== 'disconnected' && state !== 'not-configured';
}

/** Deletes one database. A missing database resolves; a blocked or failed deletion rejects with STORAGE. */
function deleteDatabase(factory: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = (): void => reject(new DataError('STORAGE', 'DEVICE_DELETE_FAILED'));
    let request: IDBOpenDBRequest;
    try {
      request = factory.deleteDatabase(name);
    } catch {
      fail();
      return;
    }
    request.onsuccess = () => resolve();
    request.onerror = fail;
    request.onblocked = fail;
  });
}

class IndexedDbDeviceDataService implements DeviceDataService {
  private readonly sync = inject(SYNC_SERVICE);
  private readonly store = inject(DATA_STORE);

  private readonly options: DeviceDataOptions;

  constructor(options: DeviceDataOptions) {
    this.options = options;
  }

  async clearAll(): Promise<void> {
    const factory = this.options.indexedDb ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (factory === undefined) {
      throw new DataError('STORAGE', 'DEVICE_DELETE_FAILED');
    }
    try {
      // 1. Revoke the Drive token first (the only Google call; the Drive copy is never touched).
      if (driveInUse(this.sync)) {
        await this.sync.disconnect();
      }
      // 2. Release this tab's connection to the data store; the key store opens and closes one per operation.
      await (await this.store).close();
    } catch {
      throw new DataError('STORAGE', 'DEVICE_DELETE_FAILED');
    }
    // Names are loaded on demand so the Dexie and crypto modules stay out of the first paint of /app.
    const [{ DEXIE_DB_NAME }, { KEY_STORE_DATABASE }] = await Promise.all([
      import('@cuotascasa/persistence/dexie'),
      import('@cuotascasa/sync/crypto'),
    ]);
    await Promise.all([deleteDatabase(factory, DEXIE_DB_NAME), deleteDatabase(factory, KEY_STORE_DATABASE)]);
  }
}

/** W7-04: «Borrar datos de este dispositivo». Never reads, writes or deletes the Drive copy. */
export function provideDeviceData(options: DeviceDataOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: DEVICE_DATA_SERVICE, useFactory: (): DeviceDataService => new IndexedDbDeviceDataService(options) },
  ]);
}
