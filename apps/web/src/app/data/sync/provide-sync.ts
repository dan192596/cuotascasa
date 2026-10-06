import { type EnvironmentProviders, makeEnvironmentProviders, signal } from '@angular/core';
import type { SyncStatus } from '@cuotascasa/sync';
import { DataError, type SyncService } from '../api.ts';
import { SYNC_SERVICE } from '../tokens.ts';

/** Inert W0-05 stub; W4-09 replaces this file (same export) and deletes stub.spec.ts. */
export const CC_STUB = 'CC_STUB:W4-09';

class InertSyncService implements SyncService {
  readonly ccStub = CC_STUB;
  readonly configured = signal(false).asReadonly();
  readonly status = signal<SyncStatus>({ state: 'not-configured' }).asReadonly();
  readonly statusText = signal('No configurado').asReadonly();
  connect(): Promise<never> {
    return Promise.reject(new DataError('NOT_IMPLEMENTED', CC_STUB));
  }
  setPassphrase(): Promise<never> {
    return Promise.reject(new DataError('NOT_IMPLEMENTED', CC_STUB));
  }
  changePassphrase(): Promise<never> {
    return Promise.reject(new DataError('NOT_IMPLEMENTED', CC_STUB));
  }
  sync(): Promise<never> {
    return Promise.reject(new DataError('NOT_IMPLEMENTED', CC_STUB));
  }
  disconnect(): Promise<never> {
    return Promise.reject(new DataError('NOT_IMPLEMENTED', CC_STUB));
  }
}

/** W4-09: Drive sync service (lazy provider, passphrase, Spanish status). The stub stays 'no configurado'. */
export function provideSync(): EnvironmentProviders {
  const service: SyncService = new InertSyncService();
  return makeEnvironmentProviders([{ provide: SYNC_SERVICE, useValue: service }]);
}
