import type { DataStore, DataStoreDeps } from '../ports.ts';
import { createStore } from './in-memory-data-store.ts';

/** The in-memory DataStore: default adapter for development, unit tests and worktrees (ADR-0006). */
export function createInMemoryDataStore(deps: DataStoreDeps): Promise<DataStore> {
  return createStore(deps);
}
