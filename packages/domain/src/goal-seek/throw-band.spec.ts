import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '../dates/index.ts';
import { createEngineContext } from '../engine-context.ts';
import { compareMoney, parseMoney, parseRate } from '../money/index.ts';
import { buildPaths } from '../paths/index.ts';
import type { RateChangeEvent } from '../types/events.ts';
import type { Goal, GoalSeekRequest } from '../types/schedule.ts';
import { goalSeek } from './index.ts';
import { loadGoalExampleCases } from './testing/examples.ts';

const ctx = createEngineContext();
const m = parseMoney;
const d = parseLocalDate;
const terms = loadGoalExampleCases()[0]!.terms;
const keepInstallment = (policy: RateChangeEvent['policy']): RateChangeEvent =>
  ({
    id: 'rc-future',
    type: 'RateChange',
    date: d('2027-01-31'),
    interestRate: parseRate('0.0701'),
    policy,
  }) as RateChangeEvent;

function seek(goal: Goal, policy: RateChangeEvent['policy'] = 'KEEP_INSTALLMENT_ADJUST_TERM') {
  const paths = buildPaths({ terms, realEvents: [keepInstallment(policy)], scenarioEvents: null }, ctx);
  const request: GoalSeekRequest = { basePath: 'REAL', prepaymentDate: d('2026-01-15'), goal };
  return goalSeek(paths, request, ctx);
}

describe('trials that throw NegativeAmortizationError near closing_k (Opus ruling 1)', () => {
  for (const amount of ['0.00', '300.00', '394.99']) {
    it(`MAX_INSTALLMENT ${amount} with a future KEEP_INSTALLMENT_ADJUST_TERM change does not throw`, () => {
      const result = seek({ kind: 'MAX_INSTALLMENT', amount: m(amount) });
      expect(result.kind).toBe('FOUND');
    });
  }

  it('0.00 resolves to the payoff when the throw band hides every other amount', () => {
    const result = seek({ kind: 'MAX_INSTALLMENT', amount: m('0.00') });
    expect(result).toMatchObject({ kind: 'FOUND', isPayoff: true, amount: '489756.31' });
  });

  it('a goal whose minimum lies below the throw band is a normal FOUND', () => {
    const result = seek({ kind: 'MAX_INSTALLMENT', amount: m('4500.00') });
    expect(result).toMatchObject({ kind: 'FOUND', isPayoff: false });
    if (result.kind === 'FOUND') {
      expect(compareMoney(result.amount, m('489756.31'))).toBe(-1);
    }
  });

  it('FINISH_BY with the same change does not throw (REDUCE_TERM keeps the level)', () => {
    const result = seek({ kind: 'FINISH_BY', date: d('2040-12-31') }, 'KEEP_INSTALLMENT_ADJUST_TERM');
    expect(result.kind).toBe('FOUND');
  });
});
