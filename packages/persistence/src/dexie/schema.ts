import type { EntityKey } from '@cuotascasa/schema';

/** Name of the production IndexedDB database. */
export const DEXIE_DB_NAME = 'cuotascasa';

/** Version 1 of the database (ADR-0006 decision 3). A later change needs a new version plus a migration. */
export const DEXIE_DB_VERSION = 1;

/**
 * Version 1 stores: one table per entity plus `meta` and `snapshots`, with the Dexie index syntax. The first name is
 * the primary key. `[createdAt+id]` gives the (createdAt, id) listing order; `[loanId+createdAt+id]` serves
 * listByLoan in that same order. e2e seeding helpers read this constant instead of repeating table names.
 */
export const DEXIE_SCHEMA_V1 = {
  loans: 'id, [createdAt+id]',
  events: 'id, [createdAt+id], [loanId+createdAt+id]',
  reportedBalances: 'id, [createdAt+id], [loanId+createdAt+id]',
  payments: 'id, [createdAt+id], [loanId+createdAt+id]',
  scenarios: 'id, [createdAt+id], [loanId+createdAt+id]',
  settings: 'id, [createdAt+id]',
  meta: 'key',
  snapshots: 'id',
} as const satisfies Record<EntityKey | 'meta' | 'snapshots', string>;

export type DexieTableName = keyof typeof DEXIE_SCHEMA_V1;

/** Keys of the `meta` table (rows are `{ key, value }`). */
export const META_KEYS = {
  deviceId: 'deviceId',
  stampFloor: 'stampFloor',
  lastSyncAt: 'lastSyncAt',
  lastBackupAt: 'lastBackupAt',
  pending: 'pending',
  sinceBackup: 'sinceBackup',
  snapshotCounter: 'snapshotCounter',
} as const;
