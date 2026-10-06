import type { BackupMigration } from '../backup/types.ts';
import { NotImplementedError } from '../errors.ts';

/** Registered pure migrations vN -> vN+1 (W1-03). With only v1 there is none. */
export const backupMigrations: readonly BackupMigration[] = [];

/** Stub owned by W1-03: applies the chain from `fromVersion` up to LATEST_VERSION without mutating `input`. */
export function migrateToLatest(input: unknown, fromVersion: number): unknown {
  void input;
  void fromVersion;
  throw new NotImplementedError('W1-03');
}
