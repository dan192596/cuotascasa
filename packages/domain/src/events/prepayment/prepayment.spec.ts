import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '../../dates/index.ts';
import { createEngineContext } from '../../engine-context.ts';
import { moneySub, moneySum, parseMoney, parseRate, periodicRate } from '../../money/index.ts';
import { buildSchedule, levelPayment, remainingTerm } from '../../schedule/index.ts';
import { prepayment, shortTerms } from '../../schedule/testing/builders.ts';
import type { HandlerInput, PeriodState } from '../../types/engine.ts';
import type { PrepaymentEvent } from '../../types/events.ts';
import { prepaymentHandler } from './index.ts';

const m = parseMoney;
const d = parseLocalDate;
const ctx = createEngineContext();

function withOptions(base: PrepaymentEvent, extra: Partial<PrepaymentEvent>): PrepaymentEvent {
  return { ...base, ...extra };
}

function stateAfter(k: number, balance: string, overrides: Partial<PeriodState> = {}): PeriodState {
  const terms = shortTerms();
  const rate = periodicRate(terms.interestRate, terms.insuranceRates);
  return {
    balance: m(balance),
    interestRate: terms.interestRate,
    insuranceRates: terms.insuranceRates,
    level: levelPayment(terms.principal, rate, terms.termMonths),
    roundingProfile: 'FHA_GT_V1',
    k,
    termMode: 'FIXED',
    term: terms.termMonths,
    ...overrides,
  };
}

function input(event: PrepaymentEvent, state: PeriodState): HandlerInput<PrepaymentEvent> {
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

describe('[ALG.EVENTS.ANCHOR] prepayment k', () => {
  const dayFifteen = shortTerms({ paymentDay: 15, firstDueDate: d('2026-01-15') });

  function appliedK(terms: ReturnType<typeof shortTerms>, date: string): number | undefined {
    const schedule = buildSchedule(terms, [prepayment('p1', date, '50.00')], ctx);
    return schedule.rows.find((row) => row.prepayment !== '0.00')?.k;
  }

  it('paymentDay 15: a prepayment dated the 15th applies after that month installment', () => {
    expect(appliedK(dayFifteen, '2026-03-15')).toBe(3);
  });

  it('paymentDay 15: a prepayment dated the 20th applies after the NEXT month installment', () => {
    expect(appliedK(dayFifteen, '2026-03-20')).toBe(4);
  });

  it('paymentDay 15: a prepayment dated the 14th applies after that month installment', () => {
    expect(appliedK(dayFifteen, '2026-03-14')).toBe(3);
  });

  it('crosses a month boundary: dated the 16th applies after the next month installment', () => {
    expect(appliedK(dayFifteen, '2026-02-16')).toBe(3);
    expect(appliedK(dayFifteen, '2026-04-01')).toBe(4);
  });

  it('crosses a year boundary: dated 2026-12-16 applies after installment 13 (2027-01-15)', () => {
    const long = shortTerms({ paymentDay: 15, firstDueDate: d('2026-01-15'), termMonths: 24, principal: m('2400.00') });
    expect(appliedK(long, '2026-12-16')).toBe(13);
    expect(appliedK(long, '2026-12-15')).toBe(12);
  });

  it('END_OF_MONTH: the last day applies to that month, the next day to the following one', () => {
    expect(appliedK(shortTerms(), '2026-03-31')).toBe(3);
    expect(appliedK(shortTerms(), '2026-03-30')).toBe(3);
    expect(appliedK(shortTerms(), '2026-04-01')).toBe(4);
  });

  it('END_OF_MONTH across a leap February', () => {
    const leap = shortTerms({ firstDueDate: d('2028-01-31'), disbursementDate: d('2027-12-31') });
    expect(appliedK(leap, '2028-02-29')).toBe(2);
    expect(appliedK(leap, '2028-02-28')).toBe(2);
    expect(appliedK(leap, '2028-03-01')).toBe(3);
    const plain = shortTerms({ firstDueDate: d('2027-01-31'), disbursementDate: d('2026-12-31') });
    expect(appliedK(plain, '2027-02-28')).toBe(2);
    expect(appliedK(plain, '2027-03-01')).toBe(3);
  });

  it('paymentDay 31 in a short month uses the last day', () => {
    const day31 = shortTerms({ paymentDay: 31, firstDueDate: d('2026-01-31') });
    expect(appliedK(day31, '2026-02-28')).toBe(2);
    expect(appliedK(day31, '2026-03-01')).toBe(3);
  });
});

describe('[ALG.PREPAY] modes', () => {
  it('REDUCE_TERM keeps level, turns the term into derived mode and shortens the schedule', () => {
    const base = buildSchedule(shortTerms(), [], ctx);
    const schedule = buildSchedule(shortTerms(), [prepayment('p1', '2026-03-31', '300.00')], ctx);
    expect(schedule.installmentCount).toBeLessThan(base.installmentCount);
    const row = schedule.rows[2];
    expect(row?.prepayment).toBe('300.00');
    expect(schedule.rows[3]?.level).toBe(base.rows[3]?.level);
    expect(schedule.rows[3]?.opening).toBe(row?.closingAfterPrepayment);
  });

  it('REDUCE_TERM handler: derived mode and term = k + remainingTerm', () => {
    const state = stateAfter(3, '900.00');
    const event = prepayment('p1', '2026-03-31', '300.00');
    const { state: next, rowEffect } = prepaymentHandler(input(event, state));
    expect(next).toMatchObject({ balance: '600.00', termMode: 'DERIVED', level: state.level, k: 3 });
    expect(next.term).toBe(3 + remainingTerm(next));
    expect(rowEffect).toEqual({ prepayment: '300.00', commission: '0.00', payoff: false });
  });

  it('REDUCE_INSTALLMENT handler (fixed term): level over B and term - k, term stays fixed', () => {
    const state = stateAfter(3, '900.00');
    const event = withOptions(prepayment('p1', '2026-03-31', '300.00'), { mode: 'REDUCE_INSTALLMENT' });
    const { state: next } = prepaymentHandler(input(event, state));
    const rate = periodicRate(state.interestRate, state.insuranceRates);
    expect(next).toMatchObject({ balance: '600.00', termMode: 'FIXED', term: 12, k: 3 });
    expect(next.level).toBe(levelPayment(m('600.00'), rate, 12 - 3));
  });

  it('REDUCE_INSTALLMENT handler (derived term): m = k + remainingTerm(state before the payment) - k', () => {
    const derived = stateAfter(3, '900.00', { termMode: 'DERIVED', term: 3 + 9 });
    const expectedTerm = 3 + remainingTerm(derived);
    const event = withOptions(prepayment('p1', '2026-03-31', '300.00'), { mode: 'REDUCE_INSTALLMENT' });
    const { state: next } = prepaymentHandler(input(event, derived));
    const rate = periodicRate(derived.interestRate, derived.insuranceRates);
    expect(next.termMode).toBe('FIXED');
    expect(next.term).toBe(expectedTerm);
    expect(next.level).toBe(levelPayment(m('600.00'), rate, expectedTerm - 3));
  });

  it('REDUCE_INSTALLMENT in a schedule keeps the installment count at the fixed term', () => {
    const event = withOptions(prepayment('p1', '2026-03-31', '300.00'), { mode: 'REDUCE_INSTALLMENT' });
    const schedule = buildSchedule(shortTerms(), [event], ctx);
    expect(schedule.installmentCount).toBe(12);
    expect(schedule.rows[3]?.level).not.toBe(schedule.rows[2]?.level);
  });
});

describe('[ALG.PREPAY.REDUCE_TERM] monthsSaved = -1', () => {
  it('a tiny REDUCE_TERM on a fixed schedule with a larger last installment ends one installment later', () => {
    const terms = shortTerms({
      principal: m('500000.00'),
      termMonths: 240,
      firstDueDate: d('2025-02-28'),
      disbursementDate: d('2025-01-31'),
      interestRate: parseRate('0.0725'),
      insuranceRates: [parseRate('0.01'), parseRate('0.0026')],
    });
    const base = buildSchedule(terms, [], ctx);
    const last = base.rows[base.rows.length - 1];
    expect(last?.capital).not.toBe(base.rows[base.rows.length - 2]?.capital);
    const schedule = buildSchedule(terms, [prepayment('p1', '2026-01-15', '0.01')], ctx);
    expect(schedule.installmentCount).toBe(base.installmentCount + 1);
  });
});

describe('[ALG.PREPAY.COMMISSION]', () => {
  it('FLAT commission appears in the row, counts in totalPaid and does not reduce principal', () => {
    const event = withOptions(prepayment('p1', '2026-03-31', '300.00'), {
      commission: { kind: 'FLAT', amount: m('12.34') },
    });
    const schedule = buildSchedule(shortTerms(), [event], ctx);
    const row = schedule.rows[2];
    expect(row?.commission).toBe('12.34');
    expect(row?.closingAfterPrepayment).toBe(moneySub(row?.closing ?? m('0.00'), m('300.00')));
    expect(schedule.totals.commissions).toBe('12.34');
    expect(schedule.totals.totalPaid).toBe(moneySum([schedule.totals.total, m('300.00'), m('12.34')]));
    expect(moneySum([schedule.totals.capital, schedule.totals.prepayments])).toBe('1200.00');
  });

  it('PERCENT commission is HALF_UP_2 of the applied amount (tie goes up)', () => {
    const event = withOptions(prepayment('p1', '2026-03-31', '123.50'), {
      commission: { kind: 'PERCENT', rate: parseRate('0.01') },
    });
    const { rowEffect } = prepaymentHandler(input(event, stateAfter(3, '900.00')));
    expect(rowEffect?.commission).toBe('1.24');
  });

  it('PERCENT commission applies to the capped amount, not the requested one', () => {
    const event = withOptions(prepayment('p1', '2026-03-31', '5000.00'), {
      commission: { kind: 'PERCENT', rate: parseRate('0.02') },
    });
    const { rowEffect } = prepaymentHandler(input(event, stateAfter(3, '900.00')));
    expect(rowEffect).toEqual({ prepayment: '900.00', commission: '18.00', payoff: true });
  });
});

describe('[ALG.PREPAY.CAP]', () => {
  it('an amount >= balance is capped to payoff, the row shows the capped amount and the schedule ends there', () => {
    const event = withOptions(prepayment('p1', '2026-03-31', '99999.00'), {
      commission: { kind: 'FLAT', amount: m('5.00') },
    });
    const schedule = buildSchedule(shortTerms(), [event], ctx);
    const row = schedule.rows[2];
    expect(schedule.installmentCount).toBe(3);
    expect(row).toMatchObject({ payoff: true, isLast: false, closingAfterPrepayment: '0.00', commission: '5.00' });
    expect(row?.prepayment).toBe(row?.closing);
    expect(schedule.endDate).toBe(row?.dueDate);
  });

  it('an amount exactly equal to the balance is a payoff', () => {
    const state = stateAfter(3, '900.00');
    const { state: next, rowEffect } = prepaymentHandler(input(prepayment('p1', '2026-03-31', '900.00'), state));
    expect(rowEffect?.payoff).toBe(true);
    expect(next.balance).toBe('0.00');
  });

  it('a prepayment on a balance of 0.00 applies 0.00 and charges no commission', () => {
    const event = withOptions(prepayment('p1', '2026-03-31', '50.00'), {
      commission: { kind: 'FLAT', amount: m('5.00') },
    });
    const state = stateAfter(3, '0.00');
    const { state: next, rowEffect } = prepaymentHandler(input(event, state));
    expect(next).toBe(state);
    expect(rowEffect).toEqual({ prepayment: '0.00', commission: '0.00', payoff: false });
  });

  it('a second prepayment in the same k after a payoff applies 0.00', () => {
    const events = [
      withOptions(prepayment('p1', '2026-03-30', '99999.00'), {}),
      withOptions(prepayment('p2', '2026-03-31', '10.00'), { commission: { kind: 'FLAT', amount: m('5.00') } }),
    ];
    const schedule = buildSchedule(shortTerms(), events, ctx);
    expect(schedule.rows[2]?.commission).toBe('0.00');
    expect(schedule.totals.commissions).toBe('0.00');
  });

  it('several prepayments in one k accumulate against the remaining balance', () => {
    const events = [prepayment('p1', '2026-03-30', '400.00'), prepayment('p2', '2026-03-31', '100.00')];
    const schedule = buildSchedule(shortTerms(), events, ctx);
    expect(schedule.rows[2]?.prepayment).toBe('500.00');
  });
});
