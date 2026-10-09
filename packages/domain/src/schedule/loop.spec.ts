import { describe, expect, it } from 'vitest';
import { invalidInputCode, thrownBy } from '../../test/support/errors.ts';
import { expectNotImplemented } from '../../test/support/not-implemented.ts';
import { parseLocalDate } from '../dates/index.ts';
import { createEngineContext } from '../engine-context.ts';
import { eventHandlers } from '../events/registry.ts';
import { moneyAdd, moneySub, parseMoney, parseRate } from '../money/index.ts';
import { isStubHandler, stubHandler } from '../stub.ts';
import type { EngineContext, EventHandlerRegistry, HandlerInput, PeriodState } from '../types/engine.ts';
import { DOMAIN_EVENT_TYPES, type DomainEvent } from '../types/events.ts';
import { type FixedCharge } from '../types/loan.ts';
import { InvalidInputError, type Money } from '../types/primitives.ts';
import { buildSchedule, runSchedule } from './index.ts';
import {
  actualPayment,
  advance,
  fixedChange,
  prepayment,
  rateChange,
  recordingContext,
  reported,
  shortTerms,
} from './testing/builders.ts';

const m = parseMoney;
const d = parseLocalDate;

describe('runSchedule without events', () => {
  it('builds the schedule, empty real deltas, and buildSchedule is its schedule', () => {
    const ctx = createEngineContext();
    const run = runSchedule(shortTerms(), [], ctx);
    expect(run.realDelta).toEqual({ perAnchor: [], perComponent: [] });
    expect(buildSchedule(shortTerms(), [], ctx)).toEqual(run.schedule);
    expect(run.schedule.installmentCount).toBe(12);
    expect(run.schedule.endDate).toBe('2026-12-31');
    expect(run.schedule.currency).toBe('GTQ');
    expect(run.schedule.rows.map((row) => row.k)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(run.schedule.rows.filter((row) => row.isLast).map((row) => row.k)).toEqual([12]);
  });

  it('chains balances: opening(k + 1) = closing(k) and closing = opening - capital', () => {
    const { rows } = buildSchedule(shortTerms(), [], createEngineContext());
    rows.forEach((row, index) => {
      expect(row.closing).toBe(moneySub(row.opening, row.capital));
      expect(row.closingAfterPrepayment).toBe(row.closing);
      expect(rows[index + 1]?.opening ?? '0.00').toBe(row.closingAfterPrepayment);
    });
  });

  it('takes the initial level from ctx.levelPayment (the single implementation of [ALG.LEVEL])', () => {
    const calls: unknown[][] = [];
    const ctx = createEngineContext({
      levelPayment: (...args) => {
        calls.push(args);
        return m('150.00');
      },
    });
    const { rows } = buildSchedule(shortTerms(), [], ctx);
    expect(calls).toEqual([[m('1200.00'), parseRate('0.01083333333333333333333333333333333'), 12]]);
    expect(rows[0]?.level).toBe('150.00');
  });

  it('the schedule currency follows the loan', () => {
    expect(buildSchedule(shortTerms({ currency: 'USD' }), [], createEngineContext()).currency).toBe('USD');
  });
});

describe('terms validation', () => {
  const ctx = createEngineContext();
  const run = (terms: ReturnType<typeof shortTerms>) => () => runSchedule(terms, [], ctx);

  it('rejects a principal that is not positive and a term that is not an integer >= 1', () => {
    expect(invalidInputCode(run(shortTerms({ principal: m('0.00') })))).toBe('INVALID_TERMS');
    expect(invalidInputCode(run(shortTerms({ principal: m('-5.00') })))).toBe('INVALID_TERMS');
    expect(invalidInputCode(run(shortTerms({ termMonths: 0 })))).toBe('INVALID_TERMS');
    expect(invalidInputCode(run(shortTerms({ termMonths: 2.5 })))).toBe('INVALID_TERMS');
  });

  it('rejects an unknown currency or rounding profile', () => {
    const wrongCurrency = { ...shortTerms(), currency: 'EUR' } as unknown as ReturnType<typeof shortTerms>;
    const wrongProfile = { ...shortTerms(), roundingProfile: 'OTHER' } as unknown as ReturnType<typeof shortTerms>;
    expect(invalidInputCode(run(wrongCurrency))).toBe('INVALID_TERMS');
    expect(invalidInputCode(run(wrongProfile))).toBe('INVALID_TERMS');
  });

  it('[ALG.DATES] rejects a firstDueDate that does not match paymentDay and accepts a valid leap-February pair', () => {
    expect(invalidInputCode(run(shortTerms({ firstDueDate: d('2027-03-15'), paymentDay: 'END_OF_MONTH' })))).toBe(
      'FIRST_DUE_DATE_MISMATCH',
    );
    expect(invalidInputCode(run(shortTerms({ firstDueDate: d('2027-03-10'), paymentDay: 15 })))).toBe(
      'FIRST_DUE_DATE_MISMATCH',
    );
    const leap = runSchedule(shortTerms({ firstDueDate: d('2028-02-29'), paymentDay: 31 }), [], ctx);
    expect(leap.schedule.rows.slice(0, 3).map((row) => row.dueDate)).toEqual([
      '2028-02-29',
      '2028-03-31',
      '2028-04-30',
    ]);
  });
});

describe('[ALG.FIXED] fixed charges', () => {
  const charge = (amount: string, effectiveFrom: string): FixedCharge => ({
    label: 'IUSI',
    amount: m(amount),
    effectiveFrom: d(effectiveFrom),
  });
  const ctx = createEngineContext();

  it('add to the total from the first due date on or after effectiveFrom, and never change balances', () => {
    const plain = buildSchedule(shortTerms(), [], ctx);
    const withCharges = buildSchedule(
      shortTerms({ fixedCharges: [charge('10.00', '2026-01-31'), charge('5.50', '2026-03-15')] }),
      [],
      ctx,
    );
    expect(withCharges.rows.map((row) => row.fixedCharges)).toEqual([
      '10.00',
      '10.00',
      ...Array<string>(10).fill('15.50'),
    ]);
    withCharges.rows.forEach((row, index) => {
      const base = plain.rows[index];
      expect(row.opening).toBe(base?.opening);
      expect(row.closing).toBe(base?.closing);
      expect(row.interest).toBe(base?.interest);
      expect(row.level).toBe(base?.level);
      expect(row.total).toBe(moneyAdd(base?.total as Money, row.fixedCharges));
    });
    expect(withCharges.totals.fixedCharges).toBe('175.00');
    expect(withCharges.totals.total).toBe(moneyAdd(plain.totals.total, m('175.00')));
  });

  it('a charge dated after the last due date never applies', () => {
    const schedule = buildSchedule(shortTerms({ fixedCharges: [charge('10.00', '2030-01-01')] }), [], ctx);
    expect(schedule.totals.fixedCharges).toBe('0.00');
  });
});

describe('[ALG.EVENTS.ORDER] dispatch order', () => {
  it('runs injected handlers in the total order key (k, phase, date, typeRank, id) however the input is ordered', () => {
    const events: DomainEvent[] = [
      actualPayment('ap', '2026-02-28', 2),
      prepayment('p-late', '2026-02-20'),
      advance('adv', '2026-02-05'),
      prepayment('p-tie', '2026-02-05'),
      fixedChange('fc', '2026-02-10'),
      reported('rb-k5', '2026-05-31', '800.00'),
      prepayment('p-early', '2026-02-05'),
      rateChange('rc', '2026-02-10'),
      reported('rb', '2026-02-28', '1000.00', 2),
      prepayment('p-k1', '2026-01-15'),
    ];
    const log: string[] = [];
    runSchedule(shortTerms(), events, recordingContext(log), {});
    expect(log).toEqual([
      'p-k1@1',
      'rb@2',
      'rc@2',
      'fc@2',
      'p-early@2',
      'p-tie@2',
      'adv@2',
      'p-late@2',
      'ap@2',
      'rb-k5@5',
    ]);
  });

  it('uses the explicit installmentNumber over the date and the first due date >= date otherwise', () => {
    const log: string[] = [];
    const events = [reported('explicit', '2026-01-10', '900.00', 7), reported('by-date', '2026-04-01', '900.00')];
    runSchedule(shortTerms(), events, recordingContext(log));
    expect(log).toEqual(['by-date@4', 'explicit@7']);
  });

  it('gives handlers the documented state: k - 1 and no row before the installment, k and the row after it', () => {
    const seen: HandlerInput<DomainEvent>[] = [];
    const registry: Partial<EventHandlerRegistry> = {
      ReportedBalance: (input) => {
        seen.push(input);
        return { state: input.state };
      },
      Prepayment: (input) => {
        seen.push(input);
        return { state: input.state };
      },
    };
    const ctx = recordingContext([], registry);
    const run = runSchedule(
      shortTerms(),
      [reported('rb', '2026-02-28', '1000.00', 2), prepayment('pp', '2026-02-28')],
      ctx,
    );
    const [anchor, prepaid] = seen;
    const row1 = run.schedule.rows[0];
    const row2 = run.schedule.rows[1];
    expect(anchor?.k).toBe(2);
    expect(anchor?.state.k).toBe(1);
    expect(anchor?.state.balance).toBe(row1?.closingAfterPrepayment);
    expect(anchor?.projectedOpening).toBe(row2?.opening);
    expect(anchor?.row).toBeNull();
    expect(prepaid?.state.k).toBe(2);
    expect(prepaid?.state.balance).toBe(row2?.closing);
    expect(prepaid?.row).toEqual(row2);
    expect(prepaid?.projectedOpening).toBe(row2?.opening);
    expect(prepaid?.terms).toEqual(shortTerms());
    expect(prepaid?.ctx).toBe(ctx);
  });
});

describe('handler results', () => {
  it('a phase-0 handler re-anchors the opening and reports its delta; a phase-1 handler changes level and rate', () => {
    const registry: Partial<EventHandlerRegistry> = {
      ReportedBalance: (input) => ({
        state: { ...input.state, balance: m('1000.00') },
        anchorDelta: {
          eventId: input.event.id,
          k: input.k,
          reported: m('1000.00'),
          projected: input.projectedOpening,
          realDelta: moneySub(m('1000.00'), input.projectedOpening),
        },
      }),
      RateChange: (input) => ({ state: { ...input.state, level: m('200.00'), interestRate: parseRate('0') } }),
    };
    const run = runSchedule(
      shortTerms(),
      [rateChange('rc', '2026-03-31'), reported('rb', '2026-03-31', '1000.00', 3)],
      recordingContext([], registry),
    );
    const plain = buildSchedule(shortTerms(), [], createEngineContext());
    expect(run.schedule.rows[2]?.opening).toBe('1000.00');
    expect(run.schedule.rows[2]?.level).toBe('200.00');
    expect(run.schedule.rows[2]?.interest).toBe('0.00');
    expect(run.schedule.rows[1]?.level).toBe(plain.rows[1]?.level);
    expect(run.realDelta.perAnchor).toEqual([
      {
        eventId: 'rb',
        k: 3,
        reported: '1000.00',
        projected: plain.rows[2]?.opening,
        realDelta: moneySub(m('1000.00'), plain.rows[2]?.opening as Money),
      },
    ]);
  });

  it('[ALG.FIXEDCHANGE] a FixedChargeChange list replaces the charges in force for the next installments', () => {
    const seenCharges: (readonly FixedCharge[])[] = [];
    const registry: Partial<EventHandlerRegistry> = {
      FixedChargeChange: (input) => ({
        state: input.state,
        fixedCharges: [{ label: 'IUSI', amount: m('20.00'), effectiveFrom: d('2026-03-31') }],
      }),
      Prepayment: (input) => {
        seenCharges.push(input.fixedCharges);
        return { state: input.state };
      },
    };
    const terms = shortTerms({ fixedCharges: [{ label: 'Old', amount: m('5.00'), effectiveFrom: d('2026-01-31') }] });
    const run = runSchedule(
      terms,
      [fixedChange('fc', '2026-03-31'), prepayment('pp', '2026-03-31')],
      recordingContext([], registry),
    );
    expect(run.schedule.rows.slice(0, 4).map((row) => row.fixedCharges)).toEqual(['5.00', '5.00', '20.00', '20.00']);
    expect(seenCharges).toEqual([[{ label: 'IUSI', amount: '20.00', effectiveFrom: '2026-03-31' }]]);
  });

  it('[ALG.PREPAY] prepayment effects accumulate in the row and totals, and the handler state carries the balance', () => {
    const registry: Partial<EventHandlerRegistry> = {
      Prepayment: (input) => ({
        state: { ...input.state, balance: moneySub(input.state.balance, input.event.amount) },
        rowEffect: { prepayment: input.event.amount, commission: m('1.50') },
      }),
    };
    const ctx = recordingContext([], registry);
    const events = [prepayment('a', '2026-02-28', '100.00'), prepayment('b', '2026-02-28', '50.00')];
    const { schedule } = runSchedule(shortTerms(), events, ctx);
    const row = schedule.rows[1];
    expect(row?.prepayment).toBe('150.00');
    expect(row?.commission).toBe('3.00');
    expect(row?.closingAfterPrepayment).toBe(moneySub(row?.closing as Money, m('150.00')));
    expect(schedule.rows[2]?.opening).toBe(row?.closingAfterPrepayment);
    expect(schedule.totals.prepayments).toBe('150.00');
    expect(schedule.totals.commissions).toBe('3.00');
    expect(schedule.totals.totalPaid).toBe(moneyAdd(moneyAdd(schedule.totals.total, m('150.00')), m('3.00')));
  });

  it('[ALG.PREPAY.CAP] a prepayment that settles the balance ends the schedule at k with payoff = true', () => {
    const registry: Partial<EventHandlerRegistry> = {
      Prepayment: (input) => ({
        state: { ...input.state, balance: m('0.00') },
        rowEffect: { prepayment: (input.row as NonNullable<typeof input.row>).closing, payoff: true },
      }),
    };
    const { schedule } = runSchedule(
      shortTerms(),
      [prepayment('pay-off', '2026-03-31')],
      recordingContext([], registry),
    );
    expect(schedule.installmentCount).toBe(3);
    expect(schedule.endDate).toBe('2026-03-31');
    const last = schedule.rows[2];
    expect(last).toMatchObject({ payoff: true, isLast: false, closingAfterPrepayment: '0.00' });
  });

  it('[ALG.ACTUAL] marks the row as paid and collects component deltas without altering the path', () => {
    const registry: Partial<EventHandlerRegistry> = {
      ActualPayment: (input) => ({
        state: input.state,
        rowEffect: { paid: true },
        componentDelta: {
          eventId: input.event.id,
          k: input.k,
          capital: m('1.00'),
          interest: m('-1.00'),
          insurance: m('0.00'),
          fixedCharges: m('0.00'),
        },
      }),
    };
    const run = runSchedule(shortTerms(), [actualPayment('ap', '2026-02-28', 2)], recordingContext([], registry));
    const plain = buildSchedule(shortTerms(), [], createEngineContext());
    expect(run.schedule.rows.map((row) => row.paid)).toEqual([false, true, ...Array<boolean>(10).fill(false)]);
    expect(run.schedule.rows.map((row) => row.closing)).toEqual(plain.rows.map((row) => row.closing));
    expect(run.realDelta.perComponent).toHaveLength(1);
    expect(run.realDelta.perComponent[0]).toMatchObject({ eventId: 'ap', k: 2, capital: '1.00' });
  });

  it('a handler that returns no effect leaves the row untouched', () => {
    const { schedule } = runSchedule(shortTerms(), [prepayment('noop', '2026-02-28')], recordingContext([]));
    expect(schedule.rows[1]).toMatchObject({ prepayment: '0.00', commission: '0.00', payoff: false, paid: false });
  });

  it('handlers run for events on the last installment too, and the loop then stops', () => {
    const log: string[] = [];
    const { schedule } = runSchedule(shortTerms(), [prepayment('on-last', '2026-12-31')], recordingContext(log));
    expect(log).toEqual(['on-last@12']);
    expect(schedule.installmentCount).toBe(12);
  });
});

describe('stub handlers', () => {
  const stubs: EventHandlerRegistry = {
    ReportedBalance: stubHandler<'ReportedBalance'>('W9-01'),
    RateChange: stubHandler<'RateChange'>('W9-02'),
    FixedChargeChange: stubHandler<'FixedChargeChange'>('W9-03'),
    Prepayment: stubHandler<'Prepayment'>('W9-04'),
    AdvanceInstallments: stubHandler<'AdvanceInstallments'>('W9-05'),
    ActualPayment: stubHandler<'ActualPayment'>('W9-06'),
  };
  const events: Record<(typeof DOMAIN_EVENT_TYPES)[number], DomainEvent> = {
    ReportedBalance: reported('e1', '2026-02-28', '1000.00'),
    RateChange: rateChange('e2', '2026-02-28'),
    FixedChargeChange: fixedChange('e3', '2026-02-28'),
    Prepayment: prepayment('e4', '2026-02-28'),
    AdvanceInstallments: advance('e5', '2026-02-28'),
    ActualPayment: actualPayment('e6', '2026-02-28', 2),
  };

  it('propagates the NotImplementedError of an injected stub, unchanged', () => {
    const ctx = createEngineContext({ registry: stubs });
    expectNotImplemented(() => runSchedule(shortTerms(), [events.ReportedBalance], ctx), 'W9-01');
    expectNotImplemented(() => runSchedule(shortTerms(), [events.RateChange], ctx), 'W9-02');
    expectNotImplemented(() => runSchedule(shortTerms(), [events.FixedChargeChange], ctx), 'W9-03');
    expectNotImplemented(() => runSchedule(shortTerms(), [events.Prepayment], ctx), 'W9-04');
    expectNotImplemented(() => runSchedule(shortTerms(), [events.AdvanceInstallments], ctx), 'W9-05');
    expectNotImplemented(() => runSchedule(shortTerms(), [events.ActualPayment], ctx), 'W9-06');
  });

  it('propagates a stub error from an inherited event and from the goal prepayment too', () => {
    const ctx = createEngineContext({ registry: stubs });
    expectNotImplemented(() => runSchedule(shortTerms(), [], ctx, { inheritedEvents: [events.Prepayment] }), 'W9-04');
    expectNotImplemented(
      () => runSchedule(shortTerms(), [], ctx, { goalPrepayment: prepayment('goal', '2026-02-28') }),
      'W9-04',
    );
  });

  it('the frozen registry throws the stub NotImplementedError of each type whose card has not landed', () => {
    const ctx = createEngineContext();
    for (const type of DOMAIN_EVENT_TYPES) {
      const handler = ctx.registry[type];
      if (isStubHandler(handler)) {
        const thrown = thrownBy(() => runSchedule(shortTerms(), [events[type]], ctx));
        expect(thrown).toMatchObject({ name: 'NotImplementedError', cardId: handler.stubOwner });
      }
    }
    expect(ctx.registry).toBe(eventHandlers);
  });

  it('a handler error other than NotImplementedError also propagates', () => {
    const boom = new Error('boom');
    const ctx = recordingContext([], {
      Prepayment: () => {
        throw boom;
      },
    });
    expect(thrownBy(() => runSchedule(shortTerms(), [events.Prepayment], ctx))).toBe(boom);
  });
});

describe('[ALG.EVENTS.ANCHOR] own events (rules 1 and 3)', () => {
  const ctx = recordingContext([]);
  const range = (events: readonly DomainEvent[]): InvalidInputError => {
    const error = thrownBy(() => runSchedule(shortTerms(), events, ctx));
    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error).toMatchObject({ code: 'INSTALLMENT_OUT_OF_RANGE', rule: 'ALG.EVENTS.ANCHOR' });
    return error as InvalidInputError;
  };

  it('an explicit installmentNumber after the last installment throws with the smallest k', () => {
    const error = range([
      reported('far', '2026-02-28', '1.00', 40),
      reported('near', '2026-02-28', '1.00', 13),
      reported('ok', '2026-02-28', '1.00', 12),
    ]);
    expect(error.k).toBe(13);
    expect(error.details).toMatchObject({ k: 13, max: 12 });
  });

  it('a date after the last due date throws with its k', () => {
    expect(range([prepayment('late', '2027-03-15'), prepayment('later', '2027-06-30')]).k).toBe(15);
    expect(range([prepayment('late', '2027-02-01')]).k).toBe(14);
  });

  it('mixes explicit and date-based events and reports the smallest k', () => {
    expect(range([prepayment('date', '2027-06-30'), reported('number', '2026-02-28', '1.00', 99)]).k).toBe(18);
  });

  it('an installmentNumber below 1 throws with the smallest such k', () => {
    expect(range([reported('zero', '2026-02-28', '1.00', 0), reported('negative', '2026-02-28', '1.00', -3)]).k).toBe(
      -3,
    );
    expect(range([reported('zero', '2026-02-28', '1.00', 0)]).k).toBe(0);
  });

  it('the last installment is the one of the final calendar, so a payoff earlier makes later events out of range', () => {
    const registry: Partial<EventHandlerRegistry> = {
      Prepayment: (input) => ({
        state: { ...input.state, balance: m('0.00') },
        rowEffect: { prepayment: (input.row as NonNullable<typeof input.row>).closing, payoff: true },
      }),
    };
    const payoffCtx = recordingContext([], registry);
    const error = thrownBy(() =>
      runSchedule(
        shortTerms(),
        [prepayment('payoff', '2026-02-28'), reported('after', '2026-06-30', '1.00', 6)],
        payoffCtx,
      ),
    );
    expect(error).toMatchObject({ code: 'INSTALLMENT_OUT_OF_RANGE', k: 6 });
  });

  it('an ActualPayment without installmentNumber throws MISSING_INSTALLMENT_NUMBER', () => {
    const missing = {
      type: 'ActualPayment',
      id: 'x',
      date: d('2026-02-28'),
      total: m('1.00'),
    } as unknown as DomainEvent;
    expect(invalidInputCode(() => runSchedule(shortTerms(), [missing], ctx))).toBe('MISSING_INSTALLMENT_NUMBER');
  });

  it('an inherited ActualPayment without installmentNumber is skipped, never thrown', () => {
    const log: string[] = [];
    const missing = {
      type: 'ActualPayment',
      id: 'x',
      date: d('2026-02-28'),
      total: m('1.00'),
    } as unknown as DomainEvent;
    const { schedule } = runSchedule(shortTerms(), [], recordingContext(log), { inheritedEvents: [missing] });
    expect(log).toEqual([]);
    expect(schedule.installmentCount).toBe(12);
  });

  it('the final row has exactly one of isLast or payoff, and no earlier row has either', () => {
    const payoffCtx = recordingContext([], {
      Prepayment: (input) => ({
        state: { ...input.state, balance: m('0.00') },
        rowEffect: { prepayment: (input.row as NonNullable<typeof input.row>).closing, payoff: true },
      }),
    });
    const schedules = [
      buildSchedule(shortTerms(), [], createEngineContext()),
      buildSchedule(shortTerms(), [prepayment('pay-off', '2026-03-31')], payoffCtx),
    ];
    for (const schedule of schedules) {
      const last = schedule.rows[schedule.rows.length - 1];
      expect(Number(last?.isLast) + Number(last?.payoff)).toBe(1);
      for (const row of schedule.rows.slice(0, -1)) {
        expect(row.isLast || row.payoff).toBe(false);
      }
    }
  });

  it('an installmentNumber that is not an integer is a malformed event', () => {
    expect(invalidInputCode(() => runSchedule(shortTerms(), [reported('x', '2026-02-28', '1.00', 2.5)], ctx))).toBe(
      'INVALID_EVENT',
    );
  });
});

describe('ScheduleOptions', () => {
  it('skips an inherited event after the last installment without error and never calls its handler', () => {
    const log: string[] = [];
    const ctx = recordingContext(log);
    const inherited = [
      prepayment('inh-late', '2027-06-30'),
      reported('inh-number', '2026-02-28', '1.00', 99),
      reported('inh-zero', '2026-02-28', '1.00', 0),
      reported('inh-fraction', '2026-02-28', '1.00', 1.5),
      prepayment('inh-ok', '2026-02-28'),
    ];
    const { schedule } = runSchedule(shortTerms(), [], ctx, { inheritedEvents: inherited });
    expect(schedule.installmentCount).toBe(12);
    expect(log).toEqual(['inh-ok@2']);
  });

  it('applies inherited events in the same total order as own ones', () => {
    const log: string[] = [];
    runSchedule(shortTerms(), [prepayment('own', '2026-02-20')], recordingContext(log), {
      inheritedEvents: [prepayment('inherited-a', '2026-02-10'), prepayment('inherited-z', '2026-02-28')],
    });
    expect(log).toEqual(['inherited-a@2', 'own@2', 'inherited-z@2']);
  });

  it('a clean own event beside inherited ones is still range-checked', () => {
    const ctx = recordingContext([]);
    expect(
      invalidInputCode(() =>
        runSchedule(shortTerms(), [prepayment('own-late', '2027-06-30')], ctx, {
          inheritedEvents: [prepayment('inh', '2026-02-28')],
        }),
      ),
    ).toBe('INSTALLMENT_OUT_OF_RANGE');
  });

  it('[ALG.GOAL] goalPrepayment runs after the phase-3 events of its k whose date is <= its own, same-date AdvanceInstallments included', () => {
    const log: string[] = [];
    const goal = prepayment('goal', '2026-02-20');
    runSchedule(
      shortTerms(),
      [
        prepayment('base-after', '2026-02-25'),
        advance('base-advance-same', '2026-02-20'),
        prepayment('base-z-same', '2026-02-20'),
        prepayment('base-a-same', '2026-02-20'),
        prepayment('base-before', '2026-02-10'),
        prepayment('base-next-k', '2026-03-15'),
      ],
      recordingContext(log),
      { goalPrepayment: goal },
    );
    expect(log).toEqual([
      'base-before@2',
      'base-a-same@2',
      'base-z-same@2',
      'base-advance-same@2',
      'goal@2',
      'base-after@2',
      'base-next-k@3',
    ]);
  });

  it('goalPrepayment is also placed after inherited phase-3 events of the same date', () => {
    const log: string[] = [];
    runSchedule(shortTerms(), [], recordingContext(log), {
      inheritedEvents: [prepayment('inh', '2026-02-20'), advance('inh-adv', '2026-02-20')],
      goalPrepayment: prepayment('goal', '2026-02-20'),
    });
    expect(log).toEqual(['inh@2', 'inh-adv@2', 'goal@2']);
  });

  it('goalPrepayment after the last installment is skipped without error', () => {
    const log: string[] = [];
    const { schedule } = runSchedule(shortTerms(), [], recordingContext(log), {
      goalPrepayment: prepayment('goal', '2027-12-31'),
    });
    expect(log).toEqual([]);
    expect(schedule.installmentCount).toBe(12);
  });
});

describe('state handed to handlers', () => {
  it('starts at k = 0 with the principal, the original rates and a fixed term of termMonths', () => {
    const states: PeriodState[] = [];
    const ctx: EngineContext = recordingContext([], {
      RateChange: (input) => {
        states.push(input.state);
        return { state: input.state };
      },
    });
    runSchedule(shortTerms(), [rateChange('rc', '2026-01-31')], ctx);
    expect(states).toEqual([
      {
        balance: '1200.00',
        interestRate: '0.12',
        insuranceRates: ['0.01'],
        level: states[0]?.level,
        roundingProfile: 'FHA_GT_V1',
        k: 0,
        termMode: 'FIXED',
        term: 12,
      },
    ]);
  });
});
