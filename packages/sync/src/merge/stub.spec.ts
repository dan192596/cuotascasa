import { NotImplementedError, type BackupData } from '@cuotascasa/schema';
import { describe, expect, it } from 'vitest';
import { mergeDatasets, purgeTombstones } from './index.ts';

const empty: BackupData = { loans: [], events: [], reportedBalances: [], payments: [], scenarios: [], settings: [] };

describe('merge stub (owned by W1-06, deleted when implemented)', () => {
  it('mergeDatasets throws NotImplementedError naming W1-06', () => {
    expect(() => mergeDatasets(empty, empty)).toThrow(NotImplementedError);
    expect(() => mergeDatasets(empty, empty)).toThrow(/W1-06/);
  });

  it('purgeTombstones throws NotImplementedError naming W1-06', () => {
    expect(() => purgeTombstones(empty, null)).toThrow(NotImplementedError);
    expect(() => purgeTombstones(empty, null)).toThrow(/W1-06/);
  });
});
