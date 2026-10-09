import { LATEST_VERSION, type BackupMigration } from '../backup/types.ts';
import { applyMigrations } from './chain.ts';

/** Registered pure migrations vN -> vN+1. With only v1 there is none; the next one is added with its v(N+1) schema. */
export const backupMigrations: readonly BackupMigration[] = [];

/** Applies the registered chain from `fromVersion` up to LATEST_VERSION without mutating `input`. */
export function migrateToLatest(input: unknown, fromVersion: number): unknown {
  return applyMigrations(input, fromVersion, LATEST_VERSION, backupMigrations);
}
