import { describe, expect, it } from 'vitest';
import { thrownBy } from '../../../test/support/errors.ts';
import { createEngineContext } from '../../engine-context.ts';
import { moneyAdd, parseMoney, parseRate } from '../../money/index.ts';
import { buildSchedule, runSchedule } from '../../schedule/index.ts';
import { actualPayment, reported, shortTerms } from '../../schedule/testing/builders.ts';
import type { HandlerInput, PeriodState } from '../../types/engine.ts';
import type { ActualPaymentEvent } from '../../types/events.ts';
import { InvalidInputError } from '../../types/primitives.ts';
import type { ScheduleRow } from '../../types/schedule.ts';
import { actualPaymentHandler } from './index.ts';

const m = parseMoney;
const ctx = createEngineContext();
const terms = shortTerms();
const plain = buildSchedule(terms, [], ctx);

const moneyPlus = (value: string, delta: string): string => moneyAdd(m(value), m(delta));

const withBreakdown = (id: string, k: number, date: string, parts: readonly [string, string, string, string]) =>
  ({
    ...actualPayment(id, date, k),
    breakdown: { capital: m(parts[0]), interest: m(parts[1]), insurance: m(parts[2]), fixedCharges: m(parts[3]) },
  }) satisfies ActualPaymentEvent;

describe('actualPaymentHandler ([ALG.ACTUAL], phase 4)', () => {
  const row = plain.rows[2] as ScheduleRow;
  const state: PeriodState = {
    balance: row.closingAfterPrepayment,
    interestRate: parseRate('0.12'),
    insuranceRates: [parseRate('0.01')],
    level: row.level,
    roundingProfile: 'FHA_GT_V1',
    k: 3,
    termMode: 'FIXED',
    term: 12,
  };
  const input = (event: ActualPaymentEvent, current: ScheduleRow | null = row): HandlerInput<ActualPaymentEvent> => ({
    ctx,
    terms,
    event,
    k: 3,
    state,
    projectedOpening: row.opening,
    fixedCharges: [],
    row: current,
  });

  it('marks the row as paid, leaves the state alone and reports no delta without a breakdown', () => {
    const result = actualPaymentHandler(input(actualPayment('ap', '2026-03-31', 3)));
    expect(result.state).toBe(state);
    expect(result.rowEffect).toEqual({ paid: true });
    expect(result.componentDelta).toBeUndefined();
    expect(result.anchorDelta).toBeUndefined();
  });

  it('reports real - projected for the four components of row k', () => {
    const event = withBreakdown('ap', 3, '2026-03-31', [
      moneyPlus(row.capital, '0.05'),
      moneyPlus(row.interest, '-0.02'),
      row.insurance,
      moneyPlus(row.fixedCharges, '7.00'),
    ]);
    const result = actualPaymentHandler(input(event));
    expect(result.componentDelta).toEqual({
      eventId: 'ap',
      k: 3,
      capital: '0.05',
      interest: '-0.02',
      insurance: '0.00',
      fixedCharges: '7.00',
    });
  });

  it('rejects a call without the computed row (phases 3-4 always carry it)', () => {
    expect(thrownBy(() => actualPaymentHandler(input(actualPayment('ap', '2026-03-31', 3), null)))).toBeInstanceOf(
      InvalidInputError,
    );
  });
});

describe('ActualPayment inside the period loop', () => {
  it('marks only the rows with a payment as paid; the schedule is otherwise unchanged', () => {
    const run = runSchedule(terms, [actualPayment('a', '2026-02-28', 2), actualPayment('b', '2026-04-30', 4)], ctx);
    expect(run.schedule.rows.map((r) => r.paid)).toEqual(plain.rows.map((r) => r.k === 2 || r.k === 4));
    expect(run.schedule.rows.map((r) => ({ ...r, paid: false }))).toEqual(plain.rows);
    expect(run.schedule.totals).toEqual(plain.totals);
    expect(run.realDelta).toEqual({ perAnchor: [], perComponent: [] });
  });

  it('a late payment lands on its installmentNumber whatever its paid date', () => {
    const run = runSchedule(terms, [actualPayment('late', '2026-06-20', 4)], ctx);
    expect(run.schedule.rows.filter((r) => r.paid).map((r) => r.k)).toEqual([4]);
  });

  it('two payments on the same installment keep paid = true and emit one delta each in id order', () => {
    const a = withBreakdown('b', 2, '2026-03-05', ['0.00', '0.00', '0.00', '0.00']);
    const b = withBreakdown('a', 2, '2026-03-05', ['0.00', '0.00', '0.00', '0.00']);
    const run = runSchedule(terms, [a, b], ctx);
    expect(run.schedule.rows[1]?.paid).toBe(true);
    expect(run.realDelta.perComponent.map((d) => d.eventId)).toEqual(['a', 'b']);
  });

  it('delta is relative to the row after a real anchor re-anchored it', () => {
    const anchor = reported('rb', '2026-03-31', '1000.00');
    const run = runSchedule(
      terms,
      [anchor, withBreakdown('ap', 3, '2026-03-31', ['0.00', '0.00', '0.00', '0.00'])],
      ctx,
    );
    const row3 = run.schedule.rows[2] as ScheduleRow;
    expect(row3.opening).toBe('1000.00');
    expect(run.realDelta.perComponent[0]).toMatchObject({ capital: `-${row3.capital}`, interest: `-${row3.interest}` });
  });

  it('installmentNumber below 1 or after the last installment throws; without it throws MISSING_INSTALLMENT_NUMBER', () => {
    expect(thrownBy(() => buildSchedule(terms, [actualPayment('a', '2026-02-28', 0)], ctx))).toMatchObject({
      code: 'INSTALLMENT_OUT_OF_RANGE',
      k: 0,
    });
    expect(thrownBy(() => buildSchedule(terms, [actualPayment('a', '2026-02-28', 13)], ctx))).toMatchObject({
      code: 'INSTALLMENT_OUT_OF_RANGE',
      k: 13,
    });
    const { installmentNumber: _omitted, ...withoutNumber } = actualPayment('a', '2026-02-28', 2);
    const bad = withoutNumber as unknown as ActualPaymentEvent;
    expect(thrownBy(() => buildSchedule(terms, [bad], ctx))).toMatchObject({ code: 'MISSING_INSTALLMENT_NUMBER' });
  });

  it('inherited payments are not re-checked: out of range or without a number they are skipped', () => {
    const { installmentNumber: _omitted, ...withoutNumber } = actualPayment('b', '2026-02-28', 2);
    const inherited = [actualPayment('a', '2026-02-28', 99), withoutNumber as unknown as ActualPaymentEvent];
    expect(buildSchedule(terms, [], ctx, { inheritedEvents: inherited })).toEqual(plain);
  });

  it('an inherited payment marks the paid flag in the derived schedule', () => {
    const schedule = buildSchedule(terms, [], ctx, { inheritedEvents: [actualPayment('a', '2026-02-28', 2)] });
    expect(schedule.rows[1]?.paid).toBe(true);
  });
});
