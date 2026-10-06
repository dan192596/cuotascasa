import { NotImplementedError } from '@cuotascasa/schema';
import { describe, expect, it } from 'vitest';
import { createManualClock, createSequentialIds } from '../contract/fakes.ts';
import { createDexieDataStore } from './index.ts';

describe('dexie stub (owned by W1-05, deleted when implemented)', () => {
  it('createDexieDataStore throws NotImplementedError naming W1-05', () => {
    const deps = { clock: createManualClock(), ids: createSequentialIds() };
    expect(() => createDexieDataStore(deps)).toThrow(NotImplementedError);
    expect(() => createDexieDataStore(deps)).toThrow(/W1-05/);
  });
});
