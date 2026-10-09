import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { backupDataV1Schema, backupDocumentV1Schema } from '../backup/v1.ts';
import { BACKUP_SCHEMAS_BY_VERSION, LATEST_VERSION, type BackupMigration } from '../backup/types.ts';
import { deepFreeze } from '../testing/deep-freeze.ts';
import { applyMigrations, hasMigrationPath } from './chain.ts';
import { backupMigrations, migrateToLatest } from './index.ts';
import { preV1Document, preV1ToV1 } from './test-only-pre-v1.ts';

describe('migration registry', () => {
  it('has one chain per registered version that ends at LATEST_VERSION', () => {
    const versions = Object.keys(BACKUP_SCHEMAS_BY_VERSION).map(Number);
    expect(Math.max(...versions)).toBe(LATEST_VERSION);
    for (const version of versions) {
      expect(hasMigrationPath(version, LATEST_VERSION, backupMigrations), `v${String(version)}`).toBe(true);
    }
  });

  it('starts empty because v1 is the only version', () => {
    expect(backupMigrations).toEqual([]);
  });

  it('migrateToLatest returns the input untouched when it is already the latest version', () => {
    const input = deepFreeze({ format: 'cuotascasa', version: LATEST_VERSION });
    expect(migrateToLatest(input, LATEST_VERSION)).toBe(input);
  });

  it('migrateToLatest throws for a version with no chain (callers check hasMigrationPath)', () => {
    expect(() => migrateToLatest({}, 0)).toThrow(/No migration path/);
  });
});

describe('migration chain (proven with a test-only pre-v1 step that is never registered)', () => {
  const chain: readonly BackupMigration[] = [preV1ToV1];

  it('leaves a deep-frozen input unchanged and the output validates against v1', () => {
    const input = deepFreeze(structuredClone(preV1Document));
    const snapshot = structuredClone(preV1Document);
    const output = applyMigrations(input, 0, 1, chain);
    expect(input).toEqual(snapshot);
    expect(backupDocumentV1Schema.safeParse(output).success).toBe(true);
    expect(output).not.toBe(input);
  });

  it('chains several steps in order', () => {
    const bump = (from: number): BackupMigration => ({
      from,
      to: from + 1,
      migrate: (input) => ({ ...(input as object), trail: [...((input as { trail?: number[] }).trail ?? []), from] }),
    });
    expect(applyMigrations({}, 3, 6, [bump(5), bump(3), bump(4)])).toEqual({ trail: [3, 4, 5] });
  });

  it('reports gaps and unreachable versions', () => {
    expect(hasMigrationPath(0, 1, chain)).toBe(true);
    expect(hasMigrationPath(1, 1, [])).toBe(true);
    expect(hasMigrationPath(0, 1, [])).toBe(false);
    expect(hasMigrationPath(0, 2, chain)).toBe(false);
    const overshoot: BackupMigration = { from: 0, to: 3, migrate: (input) => input };
    expect(hasMigrationPath(0, 2, [overshoot])).toBe(false);
    expect(() => applyMigrations({}, 0, 2, chain)).toThrow(/No migration path/);
  });

  it('the pre-v1 data schema is not the v1 one (guards the test fixture itself)', () => {
    expect(z.object({ settings: z.array(z.unknown()) }).safeParse(preV1Document.data).success).toBe(false);
    expect(backupDataV1Schema.safeParse(preV1Document.data).success).toBe(false);
  });
});
