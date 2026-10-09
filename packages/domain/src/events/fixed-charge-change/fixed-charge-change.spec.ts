import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '../../dates/index.ts';
import { createEngineContext } from '../../engine-context.ts';
import { parseMoney, parseRate } from '../../money/index.ts';
import { buildSchedule } from '../../schedule/index.ts';
import { shortTerms } from '../../schedule/testing/builders.ts';
import type { PeriodState } from '../../types/engine.ts';
import type { FixedChargeChangeEvent } from '../../types/events.ts';
import type { ScheduleRow } from '../../types/schedule.ts';
import { eventHandlers } from '../registry.ts';
import { loadEventExampleCases } from '../rate-change/testing/examples.ts';
import { fixedChargeChangeHandler } from './index.ts';

const ctx = createEngineContext();
const d = parseLocalDate;
const m = parseMoney;

describe('ex05b FixedChargeChange reproduces to the cent', () => {
  const [item] = loadEventExampleCases().filter((candidate) => candidate.file.startsWith('ex05b'));

  it('main', () => {
    expect(item).toBeDefined();
    if (item?.expected == null) {
      throw new Error('missing ex05b main case');
    }
    const schedule = buildSchedule(item.terms, item.events, ctx);
    const { expected } = item;
    expect(schedule.installmentCount).toBe(expected.installmentCount);
    expect(schedule.endDate).toBe(expected.endDate);
    expect(schedule.totals).toEqual(expected.totals);
    for (const row of expected.rows) {
      const actual = schedule.rows[row.k - 1] as ScheduleRow;
      expect(Object.fromEntries(Object.keys(row).map((key) => [key, actual[key as keyof ScheduleRow]]))).toEqual(row);
    }
  });

  it('balances never change: closings equal the same loan without the event', () => {
    if (item === undefined) {
      throw new Error('missing ex05b main case');
    }
    const withEvent = buildSchedule(item.terms, item.events, ctx);
    const without = buildSchedule(item.terms, [], ctx);
    expect(withEvent.rows.map((row) => row.closing)).toEqual(without.rows.map((row) => row.closing));
    expect(withEvent.totals.total).not.toBe(without.totals.total);
  });
});

describe('fixedChargeChangeHandler', () => {
  const terms = shortTerms();
  const state: PeriodState = {
    balance: m('900.00'),
    interestRate: parseRate('0.12'),
    insuranceRates: [parseRate('0.01')],
    level: m('106.00'),
    roundingProfile: 'FHA_GT_V1',
    k: 3,
    termMode: 'FIXED',
    term: 12,
  };
  const event = (lines: FixedChargeChangeEvent['fixedCharges']): FixedChargeChangeEvent => ({
    type: 'FixedChargeChange',
    id: 'c1',
    date: d('2026-04-30'),
    fixedCharges: lines,
  });
  const previous = [{ label: 'Old', amount: m('5.00'), effectiveFrom: d('2026-09-30') }];
  const run = (lines: FixedChargeChangeEvent['fixedCharges'], k = 4) =>
    fixedChargeChangeHandler({
      ctx,
      terms,
      event: event(lines),
      k,
      state,
      projectedOpening: state.balance,
      fixedCharges: previous,
      row: null,
    });

  it('is registered in the frozen registry', () => {
    expect(eventHandlers.FixedChargeChange).toBe(fixedChargeChangeHandler);
  });

  it('replaces the complete list, dating each charge from the due date of k', () => {
    const result = run([
      { label: 'IUSI', amount: m('20.00') },
      { label: 'Seguro', amount: m('3.50') },
    ]);
    expect(result.fixedCharges).toEqual([
      { label: 'IUSI', amount: '20.00', effectiveFrom: '2026-04-30' },
      { label: 'Seguro', amount: '3.50', effectiveFrom: '2026-04-30' },
    ]);
  });

  it('an empty list removes every charge, including a future-dated one', () => {
    expect(run([]).fixedCharges).toEqual([]);
  });

  it('leaves the state (balance, level, rates, term) untouched', () => {
    expect(run([{ label: 'IUSI', amount: m('20.00') }]).state).toBe(state);
  });

  it('uses the due date of k for charges, honoring the payment day rules', () => {
    expect(run([{ label: 'IUSI', amount: m('20.00') }], 2).fixedCharges?.[0]?.effectiveFrom).toBe('2026-02-28');
  });
});

describe('FixedChargeChange in the schedule', () => {
  it('a charge removed by the list stops from k and a future-dated one never starts', () => {
    const terms = shortTerms({
      fixedCharges: [
        { label: 'A', amount: m('10.00'), effectiveFrom: d('2026-01-31') },
        { label: 'Future', amount: m('7.00'), effectiveFrom: d('2026-09-30') },
      ],
    });
    const change: FixedChargeChangeEvent = {
      type: 'FixedChargeChange',
      id: 'c1',
      date: d('2026-04-30'),
      fixedCharges: [{ label: 'B', amount: m('4.00') }],
    };
    const schedule = buildSchedule(terms, [change], ctx);
    expect(schedule.rows.map((row) => row.fixedCharges)).toEqual([
      '10.00',
      '10.00',
      '10.00',
      '4.00',
      '4.00',
      '4.00',
      '4.00',
      '4.00',
      '4.00',
      '4.00',
      '4.00',
      '4.00',
    ]);
  });
});
