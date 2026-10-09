import { DestroyRef, type EnvironmentProviders, inject, isDevMode, makeEnvironmentProviders } from '@angular/core';
import type { Clock, DataStore, IdGenerator } from '@cuotascasa/persistence';
import type { IsoInstant, LocalDate, Uuid } from '@cuotascasa/schema';
import { CLOCK, DATA_STORE, ID_GENERATOR } from '../data-layer.tokens.ts';

export type DataStoreAdapter = 'memory' | 'dexie';

export interface DataStoresOptions {
  /** Defaults to the build-time flag (D26): 'memory' when isDevMode() (dev server, ng test), 'dexie' in production. */
  readonly adapter?: DataStoreAdapter;
  /** IndexedDB factory for the Dexie adapter; defaults to the global one. Tests pass an isolated fake. */
  readonly indexedDb?: IDBFactory;
}

const pad = (value: number): string => String(value).padStart(2, '0');

const systemClock: Clock = {
  now: (): IsoInstant => new Date().toISOString(),
  today: (): LocalDate => {
    const date = new Date();
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  },
};

const randomIds: IdGenerator = { newId: (): Uuid => crypto.randomUUID() };

/**
 * DATA_STORE, CLOCK and ID_GENERATOR (ADR-0005, ADR-0006). The adapters are loaded on demand when the store is first
 * injected, so neither enters the graph of '/'. The deviceId is drawn once by the adapter and persisted in the store meta.
 */
export function provideDataStores(options: DataStoresOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: CLOCK, useValue: systemClock },
    { provide: ID_GENERATOR, useValue: randomIds },
    {
      provide: DATA_STORE,
      useFactory: (): Promise<DataStore> => {
        const deps = { clock: inject(CLOCK), ids: inject(ID_GENERATOR) };
        const adapter = options.adapter ?? (isDevMode() ? 'memory' : 'dexie');
        const opened = open(adapter, deps, options.indexedDb);
        inject(DestroyRef).onDestroy(() => {
          void opened.then((store) => store.close()).catch(() => undefined);
        });
        return opened;
      },
    },
  ]);
}

async function open(
  adapter: DataStoreAdapter,
  deps: { readonly clock: Clock; readonly ids: IdGenerator },
  indexedDb: IDBFactory | undefined,
): Promise<DataStore> {
  if (adapter === 'memory') {
    const { createInMemoryDataStore } = await import('@cuotascasa/persistence/memory');
    return createInMemoryDataStore(deps);
  }
  const { createDexieDataStore } = await import('@cuotascasa/persistence/dexie');
  return createDexieDataStore(deps, indexedDb);
}
