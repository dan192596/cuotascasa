import { describe, expect, it } from 'vitest';
import { syntheticInitialState, syntheticTerms } from '../../test/support/synthetic.ts';
import { thrownBy } from '../../test/support/errors.ts';
import { createEngineContext } from '../engine-context.ts';
import { moneySub, moneySum, parseMoney } from '../money/index.ts';
import type { PeriodState } from '../types/engine.ts';
import { type Money, NegativeAmortizationError } from '../types/primitives.ts';
import { buildSchedule, projectCapital, remainingTerm } from './index.ts';

const m = parseMoney;

/** Estado tras pagar la cuota k de [ALG.EXAMPLE], sin abono (plazo fijo de 240). */
function stateAfter(k: number): PeriodState {
  const row = buildSchedule(syntheticTerms(), [], createEngineContext()).rows[k - 1];
  if (row === undefined) {
    throw new Error('row out of range');
  }
  return { ...syntheticInitialState(), balance: row.closingAfterPrepayment, k };
}

/** Estado tras el abono REDUCE_TERM de 20000.00 en k = 12 de [ALG.EXAMPLE]: saldo 469756.31, plazo derivado. */
function afterReduceTermPrepayment(): PeriodState {
  return { ...stateAfter(12), balance: m('469756.31'), termMode: 'DERIVED', term: 220 };
}

describe('[ALG.TERM] remainingTerm', () => {
  it('REDUCE_TERM prepayment at k = 12 leaves 208 installments (term = 12 + 208 = 220)', () => {
    const state = afterReduceTermPrepayment();
    expect(remainingTerm(state)).toBe(208);
    expect(state.k + remainingTerm(state)).toBe(220);
  });

  it('fixed term counts k + 1 … term', () => {
    expect(remainingTerm(stateAfter(12))).toBe(228);
    expect(remainingTerm(syntheticInitialState())).toBe(240);
  });

  it('fixed term settles earlier when level - financialCharge >= B', () => {
    expect(remainingTerm({ ...stateAfter(12), balance: m('3000.00') })).toBe(1);
  });

  it('a state without balance has no installments left', () => {
    expect(remainingTerm({ ...stateAfter(12), balance: m('0.00') })).toBe(0);
  });

  it('derived term with level - financialCharge <= 0 throws NegativeAmortizationError(ALG.TERM) with its k', () => {
    const state: PeriodState = { ...afterReduceTermPrepayment(), level: m('1000.00') };
    const error = thrownBy(() => remainingTerm(state));
    expect(error).toBeInstanceOf(NegativeAmortizationError);
    expect(error).toMatchObject({ rule: 'ALG.TERM', k: 13, level: '1000.00' });
  });
});

describe('[ALG.TERM] projectCapital', () => {
  it('after k = 12 with no prepayment, the capital of installments 13-18 is 5446.87', () => {
    expect(projectCapital(stateAfter(12), 6)).toBe('5446.87');
  });

  it('equals the capital of the schedule rows and the opening balance gap between k + 1 and k + n + 1', () => {
    const schedule = buildSchedule(syntheticTerms(), [], createEngineContext());
    const projected = projectCapital(stateAfter(12), 6);
    expect(projected).toBe(moneySum(schedule.rows.slice(12, 18).map((row) => row.capital)));
    expect(schedule.rows[18]?.opening).toBe(moneySub(schedule.rows[12]?.opening as Money, projected));
  });

  it('sums only the installments that exist when the schedule ends first', () => {
    const schedule = buildSchedule(syntheticTerms(), [], createEngineContext());
    expect(projectCapital(stateAfter(238), 6)).toBe(moneySum(schedule.rows.slice(238).map((row) => row.capital)));
  });

  it('n = 0 and an empty state project nothing', () => {
    expect(projectCapital(stateAfter(12), 0)).toBe('0.00');
    expect(projectCapital({ ...stateAfter(12), balance: m('0.00') }, 6)).toBe('0.00');
  });

  it('uses the same simulation as remainingTerm in derived term', () => {
    const state = afterReduceTermPrepayment();
    expect(projectCapital(state, 208)).toBe('469756.31');
    expect(projectCapital(state, 500)).toBe('469756.31');
  });

  it('rejects a negative or non-integer n with INVALID_INTEGER', () => {
    for (const n of [-1, 1.5, Number.NaN]) {
      expect(thrownBy(() => projectCapital(stateAfter(12), n))).toMatchObject({ code: 'INVALID_INTEGER' });
    }
  });
});
