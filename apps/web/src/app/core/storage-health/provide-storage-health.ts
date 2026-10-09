import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { STORAGE_HEALTH } from '../../data/tokens.ts';
import { StorageHealthService } from './storage-health.service.ts';

/** StorageHealthService for /app only; public pages never provide it, so they never touch navigator.storage. */
export function provideStorageHealth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    StorageHealthService,
    { provide: STORAGE_HEALTH, useExisting: StorageHealthService },
  ]);
}
