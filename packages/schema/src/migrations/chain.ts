import type { BackupMigration } from '../backup/types.ts';

/** Steps that lead from `fromVersion` to `latestVersion` in order, or undefined when the chain has a gap. */
function findChain(
  fromVersion: number,
  latestVersion: number,
  migrations: readonly BackupMigration[],
): readonly BackupMigration[] | undefined {
  const steps: BackupMigration[] = [];
  let version = fromVersion;
  while (version < latestVersion) {
    const step = migrations.find((migration) => migration.from === version && migration.to > version);
    if (step === undefined) {
      return undefined;
    }
    steps.push(step);
    version = step.to;
  }
  return version === latestVersion ? steps : undefined;
}

/** True when a chain of `migrations` leads from `fromVersion` to `latestVersion` without gaps. */
export function hasMigrationPath(
  fromVersion: number,
  latestVersion: number,
  migrations: readonly BackupMigration[],
): boolean {
  return findChain(fromVersion, latestVersion, migrations) !== undefined;
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
  const chain = findChain(fromVersion, latestVersion, migrations);
  if (chain === undefined) {
    throw new Error(`No migration path from version ${String(fromVersion)} to ${String(latestVersion)}`);
  }
  return chain.reduce<unknown>((current, step) => step.migrate(current), input);
}
