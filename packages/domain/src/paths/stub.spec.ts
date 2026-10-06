import { describe, it } from 'vitest';
import { expectNotImplemented } from '../../test/support/not-implemented.ts';
import { syntheticSchedule, syntheticTerms } from '../../test/support/synthetic.ts';
import { createEngineContext } from '../engine-context.ts';
import * as api from '../index.ts';
import type { PathsInput } from '../types/schedule.ts';
import { buildPaths, compareSchedules } from './index.ts';

describe('paths/ stub (owned by W2-05)', () => {
  const input: PathsInput = { terms: syntheticTerms(), realEvents: [], scenarioEvents: null };

  it('every export throws NotImplementedError naming W2-05', () => {
    expectNotImplemented(() => buildPaths(input, createEngineContext()), 'W2-05');
    expectNotImplemented(() => compareSchedules(syntheticSchedule(), syntheticSchedule()), 'W2-05');
  });

  it('the public API forwards to this stub', () => {
    expectNotImplemented(() => api.buildPaths(input), 'W2-05');
    expectNotImplemented(() => api.compareSchedules(syntheticSchedule(), syntheticSchedule()), 'W2-05');
  });
});
