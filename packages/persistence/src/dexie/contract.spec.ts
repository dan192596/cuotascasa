import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { runDataStoreContract } from '../contract/run.ts';
import { createDexieDataStore } from './index.ts';

// A fresh IDBFactory per call gives every contract case its own empty database (card W1-05, Notas).
runDataStoreContract('dexie', (deps) => createDexieDataStore(deps, new IDBFactory()));
