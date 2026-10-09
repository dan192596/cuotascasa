import type { Page } from '@playwright/test';

/**
 * Version 1 of the production IndexedDB database. This is a VERBATIM mirror of DEXIE_SCHEMA_V1, DEXIE_DB_NAME and
 * DEXIE_DB_VERSION of packages/persistence/src/dexie/schema.ts: the e2e area may not import @cuotascasa/persistence
 * (ADR-0010 §5), so support/seed-schema.spec.ts fails if the two ever drift apart.
 */
export const DB_NAME = 'cuotascasa';
export const DB_VERSION = 1;
export const SCHEMA_V1: Readonly<Record<string, string>> = {
  loans: 'id, [createdAt+id]',
  events: 'id, [createdAt+id], [loanId+createdAt+id]',
  reportedBalances: 'id, [createdAt+id], [loanId+createdAt+id]',
  payments: 'id, [createdAt+id], [loanId+createdAt+id]',
  scenarios: 'id, [createdAt+id], [loanId+createdAt+id]',
  settings: 'id, [createdAt+id]',
  meta: 'key',
  snapshots: 'id',
};

/** Dexie multiplies the declared version by 10 to get the native IndexedDB version. */
const NATIVE_VERSION = DB_VERSION * 10;

/** Entity collections of a v1 backup document, each written to the object store of the same name. */
export const BACKUP_COLLECTIONS = ['loans', 'events', 'reportedBalances', 'payments', 'scenarios', 'settings'] as const;

export interface SeedDocument {
  readonly format: 'cuotascasa';
  readonly version: 1;
  readonly data: { readonly [K in (typeof BACKUP_COLLECTIONS)[number]]: readonly object[] };
}

/** Dexie index syntax -> native IndexedDB definition. Only the forms used by SCHEMA_V1 are supported. */
export function parseStoreSpec(spec: string): {
  keyPath: string;
  indexes: { name: string; keyPath: string | string[] }[];
} {
  const [primary, ...rest] = spec.split(',').map((part) => part.trim());
  if (primary === undefined || primary === '' || /[&*+[\]]/.test(primary)) {
    throw new Error(`Unsupported primary key in store spec "${spec}"`);
  }
  const indexes = rest.map((index) => {
    const compound = /^\[([A-Za-z]+(?:\+[A-Za-z]+)+)\]$/.exec(index);
    if (compound?.[1] !== undefined) return { name: index, keyPath: compound[1].split('+') };
    if (/^[A-Za-z]+$/.test(index)) return { name: index, keyPath: index };
    throw new Error(`Unsupported index "${index}" in store spec "${spec}"`);
  });
  return { keyPath: primary, indexes };
}

/**
 * Writes a v1 document straight into the IndexedDB database the Dexie adapter opens, creating it with the exact
 * v1 layout (native version 10) when it does not exist. The page must already be on the app origin. Records are
 * stored as they are, like the adapter does. Existing records with the same id are overwritten.
 */
export async function seedFromBackup(page: Page, document: SeedDocument): Promise<void> {
  const stores = Object.entries(SCHEMA_V1).map(([name, spec]) => ({ name, ...parseStoreSpec(spec) }));
  const rows = Object.fromEntries(BACKUP_COLLECTIONS.map((name) => [name, document.data[name]]));
  await page.evaluate(
    async ({ name, version, stores: layout, rows: records }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(name, version);
        open.onupgradeneeded = () => {
          for (const store of layout) {
            if (open.result.objectStoreNames.contains(store.name)) continue;
            const created = open.result.createObjectStore(store.name, { keyPath: store.keyPath });
            for (const index of store.indexes) created.createIndex(index.name, index.keyPath);
          }
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error ?? new Error('indexedDB.open failed'));
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(Object.keys(records), 'readwrite');
          for (const [store, items] of Object.entries(records)) {
            for (const item of items) tx.objectStore(store).put(item);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('seed transaction failed'));
          tx.onabort = () => reject(tx.error ?? new Error('seed transaction aborted'));
        });
      } finally {
        db.close();
      }
    },
    { name: DB_NAME, version: NATIVE_VERSION, stores, rows },
  );
}

/** Reads one object store back through the native API (names and rows only; for self-tests and assertions). */
export async function readStore(page: Page, store: string): Promise<unknown[]> {
  return page.evaluate(
    async ({ name, store: storeName }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error ?? new Error('indexedDB.open failed'));
      });
      try {
        return await new Promise<unknown[]>((resolve, reject) => {
          const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
          request.onsuccess = () => resolve(request.result as unknown[]);
          request.onerror = () => reject(request.error ?? new Error('getAll failed'));
        });
      } finally {
        db.close();
      }
    },
    { name: DB_NAME, store },
  );
}
