import { describe, expect, it } from 'vitest';
import { createEngineContext } from '../../engine-context.ts';
import { buildSchedule } from '../../schedule/index.ts';
import type { ScheduleRow } from '../../types/schedule.ts';
import { loadPrepaymentExampleCases } from './testing/event-examples.ts';

const cases = loadPrepaymentExampleCases();
const ctx = createEngineContext();

describe('Prepayment and AdvanceInstallments algorithm examples, every column to the cent', () => {
  it('finds every example case', () => {
    expect(cases.map((item) => `${item.file} / ${item.id}`)).toEqual([
      'ex00-base-prepayments.json / reduce-term',
      'ex00-base-prepayments.json / reduce-installment',
      'ex00-base-prepayments.json / advance-6',
      'ex00-base-prepayments.json / advance-6-fixed-term',
      'ex06-commissions-payoff.json / flat',
      'ex06-commissions-payoff.json / percent',
      'ex06-commissions-payoff.json / payoff',
      'ex06-commissions-payoff.json / reduce-installment-tiny-balance',
      'ex06-commissions-payoff.json / flat-after-payoff',
    ]);
  });

  it.each(cases.map((item) => [`${item.file} / ${item.id}`, item] as const))('%s', (_name, item) => {
    const schedule = buildSchedule(item.terms, item.events, ctx);
    expect(schedule.installmentCount).toBe(item.expected.installmentCount);
    expect(schedule.rows).toHaveLength(item.expected.installmentCount);
    expect(schedule.endDate).toBe(item.expected.endDate);
    expect(schedule.totals).toEqual(item.expected.totals);
    for (const expectedRow of item.expected.rows) {
      const actual = schedule.rows[Number(expectedRow['k']) - 1] as ScheduleRow;
      const picked = Object.fromEntries(Object.keys(expectedRow).map((key) => [key, actual[key as keyof ScheduleRow]]));
      expect(picked).toEqual(expectedRow);
    }
  });
});
