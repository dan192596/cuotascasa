import { DestroyRef, type EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import type { LockManagerLike } from '@cuotascasa/sync';
import { GOOGLE_OAUTH_CLIENT_ID } from '../../../environments/build-constants.ts';
import type { SyncService } from '../api.ts';
import { CLOCK, DATA_STORE } from '../data-layer.tokens.ts';
import { SYNC_SERVICE } from '../tokens.ts';
import { DriveSyncService } from './drive-sync-service.ts';
import { SYNC_OPTIONS, type SyncOptions } from './sync-options.ts';

/** Same-tab fallback when Web Locks are missing: runs are queued, never overlapped. */
function inProcessLocks(): LockManagerLike {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request<T>(_name: string, callback: () => Promise<T>): Promise<T> {
      const run = tail.then(callback, callback);
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

function browserLocks(): LockManagerLike {
  const manager = (globalThis.navigator as Navigator | undefined)?.locks;
  return manager === undefined ? inProcessLocks() : { request: (name, callback) => manager.request(name, callback) };
}

/**
 * W4-09: SYNC_SERVICE. Nothing here touches Google: the Drive module (the only importer of GIS and Drive code) is a
 * dynamic import that runs on prepare() or connect(), so '/' and the first paint of '/app' carry no Google code.
 * `options` are test seams; production calls provideSync() with none.
 */
export function provideSync(options: SyncOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: SYNC_OPTIONS, useValue: options },
    {
      provide: SYNC_SERVICE,
      useFactory: (): SyncService => {
        const settings = inject(SYNC_OPTIONS);
        const service = new DriveSyncService({
          options: settings,
          clientId: settings.clientId ?? GOOGLE_OAUTH_CLIENT_ID,
          store: inject(DATA_STORE),
          clock: inject(CLOCK),
          locks: settings.locks ?? browserLocks(),
          loadDriveModule: settings.loadDriveModule ?? (() => import('@cuotascasa/sync/google-drive')),
          loadCryptoModule: settings.loadCryptoModule ?? (() => import('@cuotascasa/sync/crypto')),
        });
        inject(DestroyRef).onDestroy(() => {
          service.destroy();
        });
        return service;
      },
    },
  ]);
}
