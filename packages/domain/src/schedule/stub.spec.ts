import { describe, it } from 'vitest';
import { expectNotImplemented } from '../../test/support/not-implemented.ts';
import { syntheticInitialState, syntheticSchedule, syntheticTerms } from '../../test/support/synthetic.ts';
import { createEngineContext } from '../engine-context.ts';
import * as api from '../index.ts';
import { parseRate } from '../money/index.ts';
import { buildSchedule, levelPayment, projectCapital, remainingTerm, runSchedule, yearlySubtotals } from './index.ts';

describe('schedule/ stub (owned by W1-01)', () => {
  it('every export throws NotImplementedError naming W1-01', () => {
    const terms = syntheticTerms();
    const ctx = createEngineContext();
    expectNotImplemented(() => runSchedule(terms, [], ctx), 'W1-01');
    expectNotImplemented(() => buildSchedule(terms, [], ctx), 'W1-01');
    expectNotImplemented(
      () => levelPayment(terms.principal, parseRate('0.006883333333333333333333333333333333'), 240),
      'W1-01',
    );
    expectNotImplemented(() => remainingTerm(syntheticInitialState()), 'W1-01');
    expectNotImplemented(() => projectCapital(syntheticInitialState(), 6), 'W1-01');
    expectNotImplemented(() => yearlySubtotals(syntheticSchedule()), 'W1-01');
  });

  it('the public API forwards to this stub', () => {
    const terms = syntheticTerms();
    expectNotImplemented(() => api.buildSchedule(terms), 'W1-01');
    expectNotImplemented(() => api.runSchedule(terms), 'W1-01');
    expectNotImplemented(
      () => api.levelPayment(terms.principal, parseRate('0.006883333333333333333333333333333333'), 240),
      'W1-01',
    );
    expectNotImplemented(() => api.yearlySubtotals(syntheticSchedule()), 'W1-01');
  });
});
