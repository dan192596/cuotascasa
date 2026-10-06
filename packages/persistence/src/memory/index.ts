import { NotImplementedError } from '@cuotascasa/schema';
import type { DataStore, DataStoreDeps } from '../ports.ts';

/** Stub owned by W1-04: the in-memory DataStore used in development, unit tests and worktrees. */
export function createInMemoryDataStore(deps: DataStoreDeps): Promise<DataStore> {
  void deps;
  throw new NotImplementedError('W1-04');
}
