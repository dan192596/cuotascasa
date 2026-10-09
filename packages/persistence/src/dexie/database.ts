import { Dexie } from 'dexie';
import { DEXIE_DB_NAME, DEXIE_SCHEMA_V1 } from './schema.ts';

/** Hook that declares versions after v1 (migrations). Production has none yet; tests pass a synthetic v2. */
export type DeclareLaterVersions = (db: Dexie) => void;

/**
 * Opens (creating if needed) the CuotasCasa database. `indexedDB` defaults to the global factory; tests pass a
 * fake-indexeddb IDBFactory to get an isolated database.
 */
export async function openDatabase(
  name: string = DEXIE_DB_NAME,
  indexedDB?: IDBFactory,
  declareLaterVersions?: DeclareLaterVersions,
): Promise<Dexie> {
  const db = new Dexie(name, indexedDB === undefined ? undefined : { indexedDB });
  db.version(1).stores(DEXIE_SCHEMA_V1);
  declareLaterVersions?.(db);
  await db.open();
  return db;
}
