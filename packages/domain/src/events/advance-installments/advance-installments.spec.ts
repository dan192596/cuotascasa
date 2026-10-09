import { describe, expect, it } from 'vitest';
import { createEngineContext } from '../../engine-context.ts';
import { moneySum, parseMoney, periodicRate } from '../../money/index.ts';
import { buildSchedule, levelPayment, projectCapital, remainingTerm } from '../../schedule/index.ts';
import { advance, shortTerms } from '../../schedule/testing/builders.ts';
import type { HandlerInput, PeriodState } from '../../types/engine.ts';
import type { AdvanceInstallmentsEvent } from '../../types/events.ts';
import { InvalidInputError } from '../../types/primitives.ts';
import { advanceInstallmentsHandler } from './index.ts';

const m = parseMoney;
const ctx = createEngineContext();

function stateAfter(k: number, balance: string, overrides: Partial<PeriodState> = {}): PeriodState {
  const terms = shortTerms();
  return {
    balance: m(balance),
    interestRate: terms.interestRate,
    insuranceRates: terms.insuranceRates,
    level: levelPayment(terms.principal, periodicRate(terms.interestRate, terms.insuranceRates), terms.termMonths),
    roundingProfile: 'FHA_GT_V1',
    k,
    termMode: 'FIXED',
    term: terms.termMonths,
    ...overrides,
  };
}

function input(event: AdvanceInstallmentsEvent, state: PeriodState): HandlerInput<AdvanceInstallmentsEvent> {
  return {
    ctx,
    terms: shortTerms(),
    event,
    k: state.k,
    state,
    projectedOpening: state.balance,
    fixedCharges: [],
    row: null,
  };
}

describe('[ALG.ADVANCE] AdvanceInstallments(n)', () => {
  const base = buildSchedule(shortTerms(), [], ctx);

  it('prepays exactly the sum of capital of the next n installments', () => {
    const schedule = buildSchedule(shortTerms(), [advance('a1', '2026-03-31', 3)], ctx);
    const expected = moneySum(base.rows.slice(3, 6).map((row) => row.capital));
    expect(schedule.rows[2]?.prepayment).toBe(expected);
    expect(schedule.rows[2]?.commission).toBe('0.00');
  });

  it('shrinks the term by exactly n and keeps the rest of the schedule from k+n+1', () => {
    const schedule = buildSchedule(shortTerms(), [advance('a1', '2026-03-31', 3)], ctx);
    expect(schedule.installmentCount).toBe(base.installmentCount - 3);
    expect(schedule.rows[3]?.opening).toBe(base.rows[6]?.opening);
    expect(schedule.rows[3]?.level).toBe(base.rows[3]?.level);
  });

  it('handler with fixed term: level unchanged, term - n, mode stays FIXED', () => {
    const state = stateAfter(3, '900.00');
    const { state: next, rowEffect } = advanceInstallmentsHandler(input(advance('a1', '2026-03-31', 2), state));
    expect(next).toMatchObject({ level: state.level, termMode: 'FIXED', term: 10, k: 3 });
    expect(rowEffect?.prepayment).toBe(projectCapital(state, 2));
    expect(rowEffect?.commission).toBe('0.00');
    expect(rowEffect?.payoff).toBe(false);
  });

  it('handler with derived term: stays DERIVED and the term shrinks by exactly n', () => {
    const state = stateAfter(3, '900.00', { termMode: 'DERIVED', term: 3 + 9 });
    const before = remainingTerm(state);
    const { state: next } = advanceInstallmentsHandler(input(advance('a1', '2026-03-31', 2), state));
    expect(next.termMode).toBe('DERIVED');
    expect(next.level).toBe(state.level);
    expect(remainingTerm(next)).toBe(before - 2);
    expect(next.term).toBe(3 + remainingTerm(next));
  });

  it('is capped to payoff when n reaches the last installment', () => {
    const state = stateAfter(3, '900.00');
    const { state: next, rowEffect } = advanceInstallmentsHandler(input(advance('a1', '2026-03-31', 50), state));
    expect(rowEffect).toEqual({ prepayment: '900.00', commission: '0.00', payoff: true });
    expect(next.balance).toBe('0.00');
  });

  it('still shortens a FIXED term by n when the projected capital is 0.00 on a positive balance', () => {
    const state = stateAfter(3, '900.00', { level: m('0.00') });
    const { state: next, rowEffect } = advanceInstallmentsHandler(input(advance('a1', '2026-03-31', 2), state));
    expect(next.term).toBe(10);
    expect(next.balance).toBe('900.00');
    expect(rowEffect).toEqual({ prepayment: '0.00', commission: '0.00', payoff: false });
  });

  it('applies 0.00 on a balance of 0.00', () => {
    const state = stateAfter(3, '0.00');
    const { state: next, rowEffect } = advanceInstallmentsHandler(input(advance('a1', '2026-03-31', 2), state));
    expect(next).toBe(state);
    expect(rowEffect).toEqual({ prepayment: '0.00', commission: '0.00', payoff: false });
  });

  it('rejects a count that is not an integer >= 1', () => {
    for (const count of [0, -1, 1.5, Number.NaN]) {
      expect(() =>
        advanceInstallmentsHandler(input(advance('a1', '2026-03-31', count), stateAfter(3, '900.00'))),
      ).toThrow(InvalidInputError);
    }
  });

  it('takes its amount from the context projectCapital helper and counts with remainingTerm (no private simulation)', () => {
    const calls: { balance: string; k: number; n: number }[] = [];
    const spyCtx = createEngineContext({
      projectCapital: (state, n) => {
        calls.push({ balance: state.balance, k: state.k, n });
        return m('111.11');
      },
    });
    const state = stateAfter(3, '900.00');
    const result = advanceInstallmentsHandler({ ...input(advance('a1', '2026-03-31', 4), state), ctx: spyCtx });
    expect(calls).toEqual([{ balance: '900.00', k: 3, n: 4 }]);
    expect(result.rowEffect?.prepayment).toBe('111.11');
    expect(result.state.balance).toBe('788.89');
  });
});
