import { NotImplementedError } from '@cuotascasa/schema';
import { describe, expect, it } from 'vitest';
import { createManualClock, createSequentialIds } from '../contract/fakes.ts';
import { createInMemoryDataStore } from './index.ts';

describe('memory stub (owned by W1-04, deleted when implemented)', () => {
  it('createInMemoryDataStore throws NotImplementedError naming W1-04', () => {
    const deps = { clock: createManualClock(), ids: createSequentialIds() };
    expect(() => createInMemoryDataStore(deps)).toThrow(NotImplementedError);
    expect(() => createInMemoryDataStore(deps)).toThrow(/W1-04/);
  });
});
