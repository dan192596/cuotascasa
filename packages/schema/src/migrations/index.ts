import { LATEST_VERSION, type BackupMigration } from '../backup/types.ts';

/** Registered pure migrations vN -> vN+1. With only v1 there is none; the next one is added with its v(N+1) schema. */
export const backupMigrations: readonly BackupMigration[] = [];

/** True when a chain of `migrations` leads from `fromVersion` to `latestVersion` without gaps. */
export function hasMigrationPath(
  fromVersion: number,
  latestVersion: number,
  migrations: readonly BackupMigration[],
): boolean {
  let version = fromVersion;
  while (version < latestVersion) {
    const step = migrations.find((migration) => migration.from === version && migration.to > version);
    if (step === undefined) {
      return false;
    }
    version = step.to;
  }
  return version === latestVersion;
}

/**
 * Applies `migrations` in order from `fromVersion` up to `latestVersion`. Each step is pure, so `input` is never
 * mutated. Throws a plain Error when the chain has a gap; callers check hasMigrationPath first.
 */
export function applyMigrations(
  input: unknown,
  fromVersion: number,
  latestVersion: number,
  migrations: readonly BackupMigration[],
): unknown {
  if (!hasMigrationPath(fromVersion, latestVersion, migrations)) {
    throw new Error(`No migration path from version ${String(fromVersion)} to ${String(latestVersion)}`);
  }
  let current = input;
  let version = fromVersion;
  while (version < latestVersion) {
    const step = migrations.find((migration) => migration.from === version && migration.to > version);
    if (step === undefined) {
      throw new Error(`No migration from version ${String(version)}`);
    }
    current = step.migrate(current);
    version = step.to;
  }
  return current;
}

/** Applies the registered chain from `fromVersion` up to LATEST_VERSION without mutating `input`. */
export function migrateToLatest(input: unknown, fromVersion: number): unknown {
  return applyMigrations(input, fromVersion, LATEST_VERSION, backupMigrations);
}
