import { describe, expect, it } from 'vitest';
import { NotImplementedError } from '../errors.ts';
import { backupMigrations, migrateToLatest } from './index.ts';

describe('migrations stub (owned by W1-03, deleted when implemented)', () => {
  it('migrateToLatest throws NotImplementedError naming W1-03', () => {
    expect(() => migrateToLatest({}, 1)).toThrow(NotImplementedError);
    expect(() => migrateToLatest({}, 1)).toThrow(/W1-03/);
  });

  it('starts with an empty registry', () => {
    expect(backupMigrations).toEqual([]);
  });
});
