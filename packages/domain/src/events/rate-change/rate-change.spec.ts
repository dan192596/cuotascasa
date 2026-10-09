import { describe, expect, it } from 'vitest';
import { thrownBy } from '../../../test/support/errors.ts';
import { parseLocalDate } from '../../dates/index.ts';
import { createEngineContext } from '../../engine-context.ts';
import { parseMoney, parseRate, periodicRate } from '../../money/index.ts';
import { buildSchedule } from '../../schedule/index.ts';
import { recordingContext, shortTerms } from '../../schedule/testing/builders.ts';
import type { PeriodState } from '../../types/engine.ts';
import type { RateChangeEvent } from '../../types/events.ts';
import { NegativeAmortizationError } from '../../types/primitives.ts';
import type { ScheduleRow } from '../../types/schedule.ts';
import { eventHandlers } from '../registry.ts';
import { rateChangeHandler } from './index.ts';
import { loadEventExampleCases } from './testing/examples.ts';

const ctx = createEngineContext();
const cases = loadEventExampleCases().filter((item) => item.file.startsWith('ex03'));

function columns(row: ScheduleRow, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, row[key as keyof ScheduleRow]]));
}

describe('ex03 RateChange policies reproduce to the cent', () => {
  const ok = cases.filter((item) => item.expected !== null);
  const failing = cases.filter((item) => item.error !== null);

  it('loads the five ex03 cases', () => {
    expect(cases.map((item) => item.id)).toEqual([
      'recalc-keep-term',
      'keep-installment',
      'bank-installment',
      'keep-installment-negative',
      'bank-installment-negative',
    ]);
  });

  it.each(ok.map((item) => [item.id, item] as const))('%s', (_name, item) => {
    const schedule = buildSchedule(item.terms, item.events, ctx);
    const expected = item.expected;
    expect(expected).not.toBeNull();
    if (expected === null) {
      return;
    }
    expect(schedule.installmentCount).toBe(expected.installmentCount);
    expect(schedule.endDate).toBe(expected.endDate);
    expect(schedule.totals).toEqual(expected.totals);
    for (const expectedRow of expected.rows) {
      const actual = schedule.rows[expectedRow.k - 1] as ScheduleRow;
      expect(columns(actual, Object.keys(expectedRow))).toEqual(expectedRow);
    }
  });

  it.each(failing.map((item) => [item.id, item] as const))('%s throws NegativeAmortizationError', (_name, item) => {
    const error = thrownBy(() => buildSchedule(item.terms, item.events, ctx));
    expect(error).toBeInstanceOf(NegativeAmortizationError);
    expect(error).toMatchObject({ name: item.error?.type, rule: item.error?.rule, k: item.error?.k });
  });

  it('KEEP_INSTALLMENT_ADJUST_TERM ends with a short final row', () => {
    const item = cases.find((candidate) => candidate.id === 'keep-installment');
    if (item === undefined) {
      throw new Error('missing case');
    }
    const schedule = buildSchedule(item.terms, item.events, ctx);
    const last = schedule.rows[schedule.rows.length - 1] as ScheduleRow;
    expect(last.isLast).toBe(true);
    expect(last.closing).toBe('0.00');
    expect(parseMoney(last.capital) <= parseMoney(last.level)).toBe(true);
  });
});

describe('rateChangeHandler', () => {
  const terms = shortTerms();
  const k = 4;
  const state: PeriodState = {
    balance: parseMoney('900.00'),
    interestRate: parseRate('0.12'),
    insuranceRates: [parseRate('0.01')],
    level: parseMoney('106.00'),
    roundingProfile: 'FHA_GT_V1',
    k: 3,
    termMode: 'FIXED',
    term: 12,
  };
  const base = { ctx, terms, k, state, projectedOpening: state.balance, fixedCharges: [], row: null } as const;
  const event = (extra: Partial<RateChangeEvent> & Pick<RateChangeEvent, 'policy'>): RateChangeEvent =>
    ({ type: 'RateChange', id: 'r1', date: parseLocalDate('2026-04-30'), ...extra }) as RateChangeEvent;

  it('is registered in the frozen registry', () => {
    expect(eventHandlers.RateChange).toBe(rateChangeHandler);
  });

  it('RECALC keeps the term fixed and recomputes level over term - (k - 1) installments', () => {
    const next = rateChangeHandler({
      ...base,
      event: event({ policy: 'RECALC_INSTALLMENT_KEEP_TERM', interestRate: parseRate('0.2') }),
    }).state;
    expect(next.termMode).toBe('FIXED');
    expect(next.term).toBe(12);
    expect(next.interestRate).toBe('0.2');
    expect(next.insuranceRates).toEqual(state.insuranceRates);
    expect(next.level).toBe(ctx.levelPayment(state.balance, periodicRate(parseRate('0.2'), state.insuranceRates), 9));
  });

  it('omitted rates keep the current ones', () => {
    const next = rateChangeHandler({
      ...base,
      event: event({ policy: 'RECALC_INSTALLMENT_KEEP_TERM', insuranceRates: [parseRate('0.02')] }),
    }).state;
    expect(next.interestRate).toBe(state.interestRate);
    expect(next.insuranceRates).toEqual(['0.02']);
  });

  it('RECALC in derived-term mode uses (k - 1) + remainingTerm as the current term', () => {
    const derived: PeriodState = { ...state, termMode: 'DERIVED', term: 999 };
    const remaining = ctx.remainingTerm(derived);
    const next = rateChangeHandler({
      ...base,
      state: derived,
      event: event({ policy: 'RECALC_INSTALLMENT_KEEP_TERM', interestRate: parseRate('0.2') }),
    }).state;
    expect(next.termMode).toBe('FIXED');
    expect(next.term).toBe(derived.k + remaining);
  });

  it('KEEP_INSTALLMENT_ADJUST_TERM keeps level and derives the term', () => {
    const next = rateChangeHandler({
      ...base,
      event: event({ policy: 'KEEP_INSTALLMENT_ADJUST_TERM', interestRate: parseRate('0.2') }),
    }).state;
    expect(next.level).toBe(state.level);
    expect(next.termMode).toBe('DERIVED');
    expect(next.term).toBe(state.k + ctx.remainingTerm(next));
  });

  it('BANK_INSTALLMENT takes the informed level and derives the term', () => {
    const next = rateChangeHandler({
      ...base,
      event: event({
        policy: 'BANK_INSTALLMENT',
        interestRate: parseRate('0.2'),
        bankInstallment: parseMoney('120.00'),
      }),
    }).state;
    expect(next.level).toBe('120.00');
    expect(next.termMode).toBe('DERIVED');
    expect(next.term).toBe(state.k + ctx.remainingTerm(next));
  });

  it.each([
    ['KEEP_INSTALLMENT_ADJUST_TERM', 'ALG.RATE.KEEP_INSTALLMENT'],
    ['BANK_INSTALLMENT', 'ALG.RATE.BANK_INSTALLMENT'],
  ] as const)('%s negative amortization at k is reported with the policy rule', (policy, rule) => {
    const bad = event(
      policy === 'BANK_INSTALLMENT'
        ? { policy, interestRate: parseRate('2.00'), bankInstallment: parseMoney('50.00') }
        : { policy, interestRate: parseRate('2.00') },
    );
    const error = thrownBy(() => rateChangeHandler({ ...base, event: bad }));
    expect(error).toBeInstanceOf(NegativeAmortizationError);
    expect(error).toMatchObject({ rule, k });
  });

  it('negative amortization at a later installment keeps the [ALG.TERM] rule', () => {
    const lateFailure = createEngineContext({
      remainingTerm: () => {
        throw new NegativeAmortizationError('ALG.TERM', k + 2, state.level, parseMoney('200.00'));
      },
    });
    const error = thrownBy(() =>
      rateChangeHandler({
        ...base,
        ctx: lateFailure,
        event: event({ policy: 'KEEP_INSTALLMENT_ADJUST_TERM', interestRate: parseRate('0.2') }),
      }),
    );
    expect(error).toMatchObject({ rule: 'ALG.TERM', k: k + 2 });
  });

  it('propagates errors that are not negative amortization untouched', () => {
    const boom = new Error('boom');
    const failing = createEngineContext({
      remainingTerm: () => {
        throw boom;
      },
    });
    expect(
      thrownBy(() =>
        rateChangeHandler({
          ...base,
          ctx: failing,
          event: event({ policy: 'KEEP_INSTALLMENT_ADJUST_TERM', interestRate: parseRate('0.2') }),
        }),
      ),
    ).toBe(boom);
  });

  it('does not change fixed charges', () => {
    const result = rateChangeHandler({
      ...base,
      event: event({ policy: 'RECALC_INSTALLMENT_KEEP_TERM', interestRate: parseRate('0.2') }),
    });
    expect(result.fixedCharges).toBeUndefined();
  });
});

describe('[ALG.EVENTS.ORDER] phase 1', () => {
  it('RateChange (typeRank 0) runs before FixedChargeChange (typeRank 1) at the same k and date, before the installment', () => {
    const log: string[] = [];
    const recording = recordingContext(log, {
      RateChange: (input) => {
        log.push(`rate@${String(input.k)}:${String(input.state.k)}`);
        return eventHandlers.RateChange(input);
      },
      FixedChargeChange: (input) => {
        log.push(`fixed@${String(input.k)}:${String(input.state.k)}`);
        return eventHandlers.FixedChargeChange(input);
      },
    });
    const date = parseLocalDate('2026-03-31');
    const events = [
      {
        type: 'FixedChargeChange',
        id: 'a-fixed',
        date,
        fixedCharges: [{ label: 'IUSI', amount: parseMoney('10.00') }],
      },
      {
        type: 'RateChange',
        id: 'z-rate',
        date,
        interestRate: parseRate('0.10'),
        policy: 'RECALC_INSTALLMENT_KEEP_TERM',
      },
    ] as const;
    const schedule = buildSchedule(shortTerms(), events, recording);
    expect(log).toEqual(['rate@3:2', 'fixed@3:2']);
    const row = schedule.rows[2] as ScheduleRow;
    expect(row.fixedCharges).toBe('10.00');
    expect(schedule.rows[1]?.fixedCharges).toBe('0.00');
  });
});
