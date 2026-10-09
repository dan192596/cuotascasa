import { describe, expect, it } from 'vitest';
import { thrownBy } from '../../test/support/errors.ts';
import { createEngineContext } from '../engine-context.ts';
import { moneySub, moneySum, parseMoney } from '../money/index.ts';
import { buildSchedule } from '../schedule/index.ts';
import { prepayment, shortTerms } from '../schedule/testing/builders.ts';
import { CurrencyMismatchError } from '../types/primitives.ts';
import type { Schedule } from '../types/schedule.ts';
import { compareSchedules } from './index.ts';
import { withTestHandlers } from './testing/handlers.ts';

const m = parseMoney;
const ctx = withTestHandlers(createEngineContext());

describe('compareSchedules ([ALG.METRICS])', () => {
  const terms = shortTerms({
    fixedCharges: [{ label: 'IUSI', amount: m('10.00'), effectiveFrom: shortTerms().firstDueDate }],
  });
  const base = buildSchedule(terms, [], ctx);
  const scenario = buildSchedule(terms, [prepayment('p', '2026-03-31', '300.00')], ctx);

  it('compares a schedule with itself: nothing saved', () => {
    expect(compareSchedules(base, base)).toEqual({
      currency: 'GTQ',
      interestSaved: '0.00',
      monthsSaved: 0,
      baseEndDate: base.endDate,
      endDate: base.endDate,
      baseTotalPaid: base.totals.totalPaid,
      totalPaid: base.totals.totalPaid,
      netSaving: '0.00',
    });
  });

  it('interestSaved sums interest and insurance, monthsSaved counts installments, endDate is the last due date', () => {
    const metrics = compareSchedules(base, scenario);
    expect(metrics.interestSaved).toBe(expectedInterestSaved(base, scenario));
    expect(metrics.monthsSaved).toBe(base.installmentCount - scenario.installmentCount);
    expect(metrics.monthsSaved).toBeGreaterThan(0);
    expect(metrics.baseEndDate).toBe(base.endDate);
    expect(metrics.endDate).toBe(scenario.endDate);
    expect(metrics.currency).toBe('GTQ');
  });

  it('netSaving = base totalPaid - scenario totalPaid, with totalPaid including fixed charges and prepayments', () => {
    const metrics = compareSchedules(base, scenario);
    expect(metrics.baseTotalPaid).toBe(base.totals.totalPaid);
    expect(metrics.totalPaid).toBe(scenario.totals.totalPaid);
    expect(metrics.netSaving).toBe(moneySub(base.totals.totalPaid, scenario.totals.totalPaid));
    expect(scenario.totals.fixedCharges).not.toBe(base.totals.fixedCharges);
    expect(scenario.totals.prepayments).toBe('300.00');
  });

  it('commissions lower the net saving and not the interest saved', () => {
    const withCommission: Schedule = {
      ...scenario,
      totals: {
        ...scenario.totals,
        commissions: m('25.00'),
        totalPaid: moneySub(scenario.totals.totalPaid, m('-25.00')),
      },
    };
    const plain = compareSchedules(base, scenario);
    const charged = compareSchedules(base, withCommission);
    expect(charged.interestSaved).toBe(plain.interestSaved);
    expect(charged.netSaving).toBe(moneySub(plain.netSaving, m('25.00')));
  });

  it('can be negative: a longer scenario saves negative months and interest', () => {
    const metrics = compareSchedules(scenario, base);
    expect(metrics.monthsSaved).toBe(scenario.installmentCount - base.installmentCount);
    expect(metrics.interestSaved.startsWith('-')).toBe(true);
  });

  it('throws CurrencyMismatchError for schedules of different currencies', () => {
    const usd = buildSchedule(shortTerms({ currency: 'USD' }), [], ctx);
    const error = thrownBy(() => compareSchedules(base, usd));
    expect(error).toBeInstanceOf(CurrencyMismatchError);
    expect(error).toMatchObject({ expected: 'GTQ', actual: 'USD' });
  });
});

/** Independent check: Σ(interest + insurance) row by row, base minus scenario. */
function expectedInterestSaved(base: Schedule, scenario: Schedule): string {
  const cost = (schedule: Schedule) => moneySum(schedule.rows.flatMap((row) => [row.interest, row.insurance]));
  return moneySub(cost(base), cost(scenario));
}
