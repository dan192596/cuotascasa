import { NotImplementedError } from '@cuotascasa/schema';
import type { DataStore, DataStoreDeps } from '../ports.ts';

/** Stub owned by W1-05: the Dexie 4.4 DataStore (database 'cuotascasa' v1). Dexie is imported only in this directory. */
export function createDexieDataStore(deps: DataStoreDeps): Promise<DataStore> {
  void deps;
  throw new NotImplementedError('W1-05');
}
