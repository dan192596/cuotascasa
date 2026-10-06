import { type EnvironmentProviders, makeEnvironmentProviders, signal } from '@angular/core';
import type { StorageEstimateView, StorageHealth } from '../../data/api.ts';
import { STORAGE_HEALTH } from '../../data/tokens.ts';

/** Inert W0-05 stub; W3-13 replaces this file (same export) and deletes stub.spec.ts. */
export const CC_STUB = 'CC_STUB:W3-13';

class InertStorageHealth implements StorageHealth {
  readonly ccStub = CC_STUB;
  readonly persisted = signal<boolean | null>(null).asReadonly();
  readonly estimate = signal<StorageEstimateView | null>(null).asReadonly();
  readonly safariNonStandalone = signal(false).asReadonly();
  requestPersist(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

/** W3-13: StorageHealthService (persisted, estimate, requestPersist) for /app. The stub never calls navigator.storage. */
export function provideStorageHealth(): EnvironmentProviders {
  const health: StorageHealth = new InertStorageHealth();
  return makeEnvironmentProviders([{ provide: STORAGE_HEALTH, useValue: health }]);
}
