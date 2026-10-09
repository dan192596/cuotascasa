import type { DataStore, DataStoreDeps } from '../ports.ts';
import { openDatabase } from './database.ts';
import { DexieDataStore } from './store.ts';
import { DEXIE_DB_NAME } from './schema.ts';

export { DEXIE_DB_NAME, DEXIE_DB_VERSION, DEXIE_SCHEMA_V1, type DexieTableName } from './schema.ts';

/**
 * The Dexie 4.4 DataStore (database 'cuotascasa' v1). `target` is optional: a database name, or an IDBFactory to open
 * the default name on an isolated factory (tests build a fresh one per call). Dexie is imported only in this directory.
 */
export async function createDexieDataStore(deps: DataStoreDeps, target?: string | IDBFactory): Promise<DataStore> {
  const name = typeof target === 'string' ? target : DEXIE_DB_NAME;
  const factory = typeof target === 'string' ? undefined : target;
  const db = await openDatabase(name, factory);
  return DexieDataStore.attach(deps, db, name, factory);
}
