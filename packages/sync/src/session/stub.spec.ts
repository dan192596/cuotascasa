import { NotImplementedError } from '@cuotascasa/schema';
import { describe, expect, it } from 'vitest';
import type { SyncSessionDeps } from '../ports.ts';
import { createSyncSession } from './index.ts';

describe('session stub (owned by W2-08, deleted when implemented)', () => {
  it('createSyncSession throws NotImplementedError naming W2-08', () => {
    const deps = {} as SyncSessionDeps;
    expect(() => createSyncSession(deps)).toThrow(NotImplementedError);
    expect(() => createSyncSession(deps)).toThrow(/W2-08/);
  });
});
