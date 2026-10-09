import { type EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import {
  LOAN_EVENTS_STORE,
  LOANS_STORE,
  PAYMENTS_STORE,
  REPORTED_BALANCES_STORE,
  SCENARIOS_STORE,
  SETTINGS_STORE,
} from '../tokens.ts';
import { ChildStore } from './child-store.ts';
import { LoansStoreImpl } from './loans-store.ts';
import { ScenariosStoreImpl } from './scenarios-store.ts';
import { SettingsStoreImpl } from './settings-store.ts';
import { StoresRuntime } from './store-runtime.ts';

/**
 * W3-11: signal stores over the DataStore (DATA_STORE from provideDataStores()). Needs STORAGE_HEALTH
 * (provideStorageHealth(), core/storage-health) for the single requestPersist() after the first successful write.
 * Without DATA_STORE the stores stay not ready and every write rejects with DataError('STORAGE').
 */
export function provideStores(): EnvironmentProviders {
  return makeEnvironmentProviders([
    StoresRuntime,
    { provide: LOANS_STORE, useFactory: () => new LoansStoreImpl(inject(StoresRuntime)) },
    {
      provide: LOAN_EVENTS_STORE,
      useFactory: () => {
        const runtime = inject(StoresRuntime);
        return new ChildStore(runtime, 'events', runtime.events, (repositories) => repositories.events);
      },
    },
    {
      provide: REPORTED_BALANCES_STORE,
      useFactory: () => {
        const runtime = inject(StoresRuntime);
        return new ChildStore(
          runtime,
          'reportedBalances',
          runtime.reportedBalances,
          (repositories) => repositories.reportedBalances,
        );
      },
    },
    {
      provide: PAYMENTS_STORE,
      useFactory: () => {
        const runtime = inject(StoresRuntime);
        return new ChildStore(runtime, 'payments', runtime.payments, (repositories) => repositories.payments);
      },
    },
    { provide: SCENARIOS_STORE, useFactory: () => new ScenariosStoreImpl(inject(StoresRuntime)) },
    { provide: SETTINGS_STORE, useFactory: () => new SettingsStoreImpl(inject(StoresRuntime)) },
  ]);
}
