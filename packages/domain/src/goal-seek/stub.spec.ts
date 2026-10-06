import { describe, it } from 'vitest';
import { expectNotImplemented } from '../../test/support/not-implemented.ts';
import { syntheticSchedule, syntheticTerms } from '../../test/support/synthetic.ts';
import { parseLocalDate } from '../dates/index.ts';
import { createEngineContext } from '../engine-context.ts';
import * as api from '../index.ts';
import type { GoalSeekRequest, Paths } from '../types/schedule.ts';
import { goalSeek } from './index.ts';

describe('goal-seek/ stub (owned by W3-03)', () => {
  const schedule = syntheticSchedule();
  const paths: Paths = {
    input: { terms: syntheticTerms(), realEvents: [], scenarioEvents: null },
    original: schedule,
    real: schedule,
    scenario: null,
    cutoffK: 0,
    realDelta: { perAnchor: [], perComponent: [] },
  };
  const request: GoalSeekRequest = {
    basePath: 'REAL',
    prepaymentDate: parseLocalDate('2026-01-15'),
    goal: { kind: 'FINISH_BY', date: parseLocalDate('2043-05-31') },
  };

  it('goalSeek throws NotImplementedError naming W3-03', () => {
    expectNotImplemented(() => goalSeek(paths, request, createEngineContext()), 'W3-03');
  });

  it('the public API forwards to this stub', () => {
    expectNotImplemented(() => api.goalSeek(paths, request), 'W3-03');
  });
});
