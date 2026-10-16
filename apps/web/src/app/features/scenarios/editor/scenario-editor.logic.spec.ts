import {
  buildPaths,
  compareLocalDate,
  compareMoney,
  type DomainEvent,
  goalSeek,
  InfeasibleGoalError,
  InvalidInputError,
  type LoanTerms,
  type Money,
  NegativeAmortizationError,
  parseLocalDate,
  parseMoney,
  parsePaymentDay,
  parseRate,
  type Paths,
} from '@cuotascasa/domain';
import { type ScenarioEvent, scenarioEventSchema } from '@cuotascasa/schema';
import { describe, expect, it } from 'vitest';
import {
  advanceEvent,
  appliedMeetsGoal,
  amountError,
  countError,
  dateError,
  decideApply,
  describeEvent,
  domainErrorText,
  dryRun,
  duplicateName,
  type GoalInput,
  eventExtra,
  goalPrepayment,
  hasSamePhase3Event,
  installmentFor,
  planApply,
  type LoanFacts,
  prepaymentEvent,
  seekGoal,
  toDomainScenarioEvents,
} from './scenario-editor.logic.ts';

/** Synthetic loan of docs/algorithm.md [ALG.EXAMPLE]: no real data. */
const TERMS: LoanTerms = {
  principal: parseMoney('500000.00'),
  termMonths: 240,
  disbursementDate: parseLocalDate('2025-01-15'),
  firstDueDate: parseLocalDate('2025-02-28'),
  paymentDay: parsePaymentDay('END_OF_MONTH'),
  currency: 'GTQ',
  interestRate: parseRate('0.07'),
  insuranceRates: [parseRate('0.01'), parseRate('0.0026')],
  fixedCharges: [
    { label: 'IUSI', amount: parseMoney('350.00'), effectiveFrom: parseLocalDate('2025-02-28') },
    { label: 'Seguro de danos', amount: parseMoney('45.00'), effectiveFrom: parseLocalDate('2025-02-28') },
  ],
  roundingProfile: 'FHA_GT_V1',
  rateType: 'VARIABLE',
};

const FACTS: LoanFacts = {
  firstDueDate: '2025-02-28',
  paymentDay: 'END_OF_MONTH',
  disbursementDate: '2025-01-15',
  currency: 'GTQ',
};

const ID = (n: number): string => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

const REAL_PREPAYMENT: DomainEvent = {
  type: 'Prepayment',
  id: ID(900),
  date: parseLocalDate('2025-06-30'),
  amount: parseMoney('10000.00'),
  mode: 'REDUCE_TERM',
};

function paths(scenario: readonly ScenarioEvent[] | null, real: readonly DomainEvent[] = []): Paths {
  const events = scenario === null ? null : toDomainScenarioEvents(scenario);
  return buildPaths({
    terms: TERMS,
    realEvents: real,
    scenarioEvents: events === null || events.length === 0 ? null : events,
  });
}

function prepayment(n: number, date: string, amount: string): ScenarioEvent {
  return prepaymentEvent(ID(n), {
    date,
    amount,
    mode: 'REDUCE_TERM',
    commissionKind: 'NONE',
    commissionAmount: '',
    commissionRate: '',
  });
}

describe('installmentFor ([ALG.EVENTS.ANCHOR] rule 2)', () => {
  it('is the first installment due on or after the date', () => {
    expect(installmentFor(FACTS, '2025-04-15')).toBe(3);
    expect(installmentFor(FACTS, '2025-04-30')).toBe(3);
    expect(installmentFor(FACTS, '2025-05-01')).toBe(4);
  });
});

describe('dryRun: the domain judges the scenario before anything is saved', () => {
  const real = paths(null, [REAL_PREPAYMENT]);

  it('rejects an event at k <= cutoffK with the domain typed error, and the Spanish text names the installment', () => {
    expect(real.cutoffK).toBe(5);
    const error = dryRun(real, [prepayment(1, '2025-05-31', '1000.00')]);
    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error).toMatchObject({ code: 'HYPOTHETICAL_BEFORE_CUTOFF', k: 4 });
    const text = domainErrorText(error!);
    expect(text).toContain('cuota 4');
    expect(text).toMatch(/datos reales/);
    expect(text).not.toContain(error!.message);
  });

  it('rejects the event of the cutoff installment itself', () => {
    expect(dryRun(real, [prepayment(1, '2025-06-30', '1000.00')])).toMatchObject({ k: 5 });
  });

  it('accepts an event after the cutoff', () => {
    expect(dryRun(real, [prepayment(1, '2025-07-31', '1000.00')])).toBeNull();
  });

  it('rejects an event after the last installment as out of range', () => {
    const error = dryRun(paths(null), [prepayment(1, '2046-03-31', '1000.00')]);
    expect(error).toMatchObject({ code: 'INSTALLMENT_OUT_OF_RANGE' });
    expect(domainErrorText(error!)).toMatch(/última cuota/);
  });

  it('judges the existing events together with the new one', () => {
    const existing = prepayment(1, '2025-09-30', '20000.00');
    expect(dryRun(real, [existing, prepayment(2, '2025-10-31', '5000.00')])).toBeNull();
    expect(dryRun(real, [existing, prepayment(2, '2025-04-30', '5000.00')])).toMatchObject({ k: 3 });
  });
});

describe('domainErrorText never shows the raw error', () => {
  it('maps every kind to Spanish text without the message', () => {
    const negative = new NegativeAmortizationError(
      'ALG.TERM',
      7,
      parseMoney('123.45') as Money,
      parseMoney('999.99') as Money,
    );
    const text = domainErrorText(negative);
    expect(text).toMatch(/cuota/);
    expect(text).not.toMatch(/123\.45|999\.99/);
    for (const code of [
      'PREPAYMENT_NOT_AFTER_CUTOFF',
      'PREPAYMENT_AFTER_END',
      'INVALID_GOAL_AMOUNT',
      'SCENARIO_PATH_MISSING',
    ] as const) {
      const goal = new InfeasibleGoalError(code, 'English detail 1234.56', { k: 3 });
      const goalText = domainErrorText(goal);
      expect(goalText).not.toContain('English');
      expect(goalText).toMatch(/[áéíóúñ]|[a-z]/);
    }
    expect(domainErrorText(new InvalidInputError('INVALID_EVENT', 'x 99.99'))).not.toContain('99.99');
  });
});

describe('seekGoal ([ALG.GOAL]) on the active scenario', () => {
  const goalDate = '2040-12-31';
  const finishBy: GoalInput = { prepaymentDate: '2026-03-31', goal: { kind: 'FINISH_BY', date: goalDate } };

  it('FOUND equals the domain goalSeek amount (REAL base when the scenario has no events)', () => {
    const base = paths(null);
    const outcome = seekGoal(base, finishBy);
    const direct = goalSeek(base, {
      basePath: 'REAL',
      prepaymentDate: parseLocalDate('2026-03-31'),
      goal: { kind: 'FINISH_BY', date: parseLocalDate(goalDate) },
    });
    expect(direct.kind).toBe('FOUND');
    expect(outcome.kind).toBe('FOUND');
    if (outcome.kind === 'FOUND' && direct.kind === 'FOUND') {
      expect(outcome.amount).toBe(direct.amount);
      expect(outcome.metrics).toEqual(direct.metrics);
      expect(outcome.isPayoff).toBe(direct.isPayoff);
      expect(outcome.mode).toBe('REDUCE_TERM');
    }
  });

  it('uses the SCENARIO base when the scenario has events', () => {
    const existing = [prepayment(1, '2025-09-30', '20000.00')];
    const base = paths(existing);
    expect(base.scenario).not.toBeNull();
    const outcome = seekGoal(base, finishBy);
    const direct = goalSeek(base, {
      basePath: 'SCENARIO',
      prepaymentDate: parseLocalDate('2026-03-31'),
      goal: { kind: 'FINISH_BY', date: parseLocalDate(goalDate) },
    });
    expect(outcome.kind).toBe('FOUND');
    if (outcome.kind === 'FOUND' && direct.kind === 'FOUND') {
      expect(outcome.amount).toBe(direct.amount);
    }
  });

  it('applying a FINISH_BY result makes the scenario end on or before the target, and a cent less does not', () => {
    const existing = [prepayment(1, '2025-09-30', '20000.00')];
    const base = paths(existing);
    const outcome = seekGoal(base, finishBy);
    expect(outcome.kind).toBe('FOUND');
    if (outcome.kind !== 'FOUND') return;
    const applied = paths([...existing, goalPrepayment(ID(2), '2026-03-31', outcome)]);
    expect(compareLocalDate(applied.scenario!.endDate, parseLocalDate(goalDate))).toBeLessThanOrEqual(0);
    const cents = BigInt(outcome.amount.replace('.', '')) - 1n;
    const lessText = `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
    const less = paths([...existing, prepayment(2, '2026-03-31', lessText)]);
    expect(compareLocalDate(less.scenario!.endDate, parseLocalDate(goalDate))).toBeGreaterThan(0);
  });

  it('applying a MAX_INSTALLMENT result brings the next installment total to the target or settles the loan', () => {
    const base = paths(null);
    const target = '4200.00';
    const outcome = seekGoal(base, {
      prepaymentDate: '2026-03-31',
      goal: { kind: 'MAX_INSTALLMENT', amount: target },
    });
    expect(outcome.kind).toBe('FOUND');
    if (outcome.kind !== 'FOUND') return;
    expect(outcome.mode).toBe('REDUCE_INSTALLMENT');
    const applied = paths([goalPrepayment(ID(2), '2026-03-31', outcome)]);
    const k = installmentFor(FACTS, '2026-03-31');
    const next = applied.scenario!.rows.find((row) => row.k === k + 1);
    if (next === undefined) {
      expect(outcome.isPayoff).toBe(true);
    } else {
      expect(compareMoney(next.total, parseMoney(target))).toBeLessThanOrEqual(0);
    }
  });

  it('reports ALREADY_MET when the goal already holds', () => {
    expect(
      seekGoal(paths(null), { prepaymentDate: '2026-03-31', goal: { kind: 'FINISH_BY', date: '2045-01-31' } }),
    ).toEqual({ kind: 'ALREADY_MET' });
  });

  it('reports INFEASIBLE with the payoff amount when the date is before the prepayment', () => {
    const outcome = seekGoal(paths(null), {
      prepaymentDate: '2026-03-31',
      goal: { kind: 'FINISH_BY', date: '2026-01-31' },
    });
    expect(outcome.kind).toBe('INFEASIBLE');
    if (outcome.kind === 'INFEASIBLE') {
      expect(compareMoney(outcome.payoffAmount, parseMoney('0.00'))).toBeGreaterThan(0);
    }
  });

  it('turns the domain input errors into an ERROR outcome with the typed error', () => {
    const outcome = seekGoal(paths(null, [REAL_PREPAYMENT]), {
      prepaymentDate: '2025-05-31',
      goal: { kind: 'FINISH_BY', date: goalDate },
    });
    expect(outcome.kind).toBe('ERROR');
    if (outcome.kind === 'ERROR') {
      expect(outcome.error).toBeInstanceOf(InfeasibleGoalError);
      expect(domainErrorText(outcome.error)).toMatch(/datos reales/);
    }
  });
});

describe('event builders', () => {
  it('builds a prepayment that parses with the entity schema, with and without commission', () => {
    const plain = prepayment(1, '2026-03-31', '5000.00');
    expect(scenarioEventSchema.safeParse(plain).success).toBe(true);
    const flat = prepaymentEvent(ID(2), {
      date: '2026-03-31',
      amount: '5000.00',
      mode: 'REDUCE_INSTALLMENT',
      commissionKind: 'FLAT',
      commissionAmount: '25.00',
      commissionRate: '',
    });
    expect(flat).toMatchObject({
      type: 'Prepayment',
      mode: 'REDUCE_INSTALLMENT',
      commission: { kind: 'FLAT', amount: '25.00' },
    });
    expect(scenarioEventSchema.safeParse(flat).success).toBe(true);
    const percent = prepaymentEvent(ID(3), {
      date: '2026-03-31',
      amount: '5000.00',
      mode: 'REDUCE_TERM',
      commissionKind: 'PERCENT',
      commissionAmount: '',
      commissionRate: '0.02',
    });
    expect(percent).toMatchObject({ commission: { kind: 'PERCENT', rate: '0.02' } });
    expect(scenarioEventSchema.safeParse(percent).success).toBe(true);
  });

  it('builds an advance event and a goal prepayment with no commission', () => {
    const advance = advanceEvent(ID(4), { date: '2026-03-31', count: '6' });
    expect(advance).toMatchObject({ type: 'AdvanceInstallments', count: 6, deletedAt: null });
    expect(scenarioEventSchema.safeParse(advance).success).toBe(true);
    const outcome = seekGoal(paths(null), {
      prepaymentDate: '2026-03-31',
      goal: { kind: 'FINISH_BY', date: '2040-12-31' },
    });
    if (outcome.kind !== 'FOUND') throw new Error('expected FOUND');
    const event = goalPrepayment(ID(5), '2026-03-31', outcome);
    expect(event).toMatchObject({
      type: 'Prepayment',
      amount: outcome.amount,
      mode: 'REDUCE_TERM',
      date: '2026-03-31',
    });
    expect(event).not.toHaveProperty('commission');
    expect(scenarioEventSchema.safeParse(event).success).toBe(true);
  });
});

describe('field rules (es-GT)', () => {
  it('validates dates against the disbursement', () => {
    expect(dateError('', FACTS)).toBe('Escribe la fecha.');
    expect(dateError('nope', FACTS)).toMatch(/dd\/mm\/aaaa/);
    expect(dateError('2024-12-31', FACTS)).toMatch(/desembolso/);
    expect(dateError('2026-03-31', FACTS)).toBeUndefined();
  });

  it('validates amounts without turning them into numbers', () => {
    expect(amountError('')).toBe('Escribe un monto.');
    expect(amountError('-5.00')).toMatch(/negativo/);
    expect(amountError('0.00')).toMatch(/mayor que cero/);
    expect(amountError('abc')).toMatch(/válido/);
    expect(amountError('1500.00')).toBeUndefined();
    expect(amountError('0.00', { allowZero: true })).toBeUndefined();
  });

  it('validates the installment count', () => {
    expect(countError('')).toBe('Escribe un número entero.');
    expect(countError('1.5')).toMatch(/sin decimales/);
    expect(countError('0')).toMatch(/entre 1 y/);
    expect(countError('6')).toBeUndefined();
  });
});

describe('describeEvent and duplicateName', () => {
  it('describes hypothetical events in Spanish with the installment', () => {
    const text = describeEvent(prepayment(1, '2026-03-31', '5000.00'), FACTS);
    expect(text).toContain('Q 5,000.00');
    expect(text).toContain('31/03/2026');
    expect(text).toContain('cuota 14');
    expect(text).toMatch(/plazo/);
    expect(describeEvent(advanceEvent(ID(2), { date: '2026-03-31', count: '6' }), FACTS)).toMatch(/Adelantar 6 cuotas/);
  });

  it('names a copy within the 60 character limit', () => {
    expect(duplicateName('Plan A')).toBe('Copia de Plan A');
    const long = 'x'.repeat(60);
    expect(duplicateName(long).length).toBeLessThanOrEqual(60);
    expect(duplicateName(long).startsWith('Copia de ')).toBe(true);
  });
});

describe('OUT_OF_RANGE names the installment of the event that falls outside', () => {
  it('says the cuota k of the event, not the abono date', () => {
    const error = dryRun(paths(null), [prepayment(1, '2046-03-31', '1000.00')])!;
    expect(error.k).not.toBeNull();
    expect(domainErrorText(error)).toContain(`cuota ${error.k}`);
  });
});

describe('planApply: own events that would fall after the new end (Opus C1)', () => {
  const finish: GoalInput = { prepaymentDate: '2026-03-31', goal: { kind: 'FINISH_BY', date: '2035-12-31' } };

  it('lists a 2042 own abono as removed, and the plan meets the goal', () => {
    const own = [prepayment(1, '2042-03-31', '1000.00')];
    const base = paths(own);
    const outcome = seekGoal(base, finish);
    if (outcome.kind !== 'FOUND') throw new Error('expected FOUND');
    const goal = goalPrepayment(ID(2), finish.prepaymentDate, outcome);
    const plan = planApply(base, own, goal, FACTS);
    expect(plan.kind).toBe('ok');
    if (plan.kind !== 'ok') return;
    expect(plan.removed.map((item) => item.event.id)).toEqual([ID(1)]);
    expect(plan.removed[0]!.k).toBe(installmentFor(FACTS, '2042-03-31'));
    expect(plan.events.map((event) => event.id)).toEqual([ID(2)]);
    expect(compareLocalDate(plan.candidate.scenario!.endDate, parseLocalDate('2035-12-31'))).toBeLessThanOrEqual(0);
    expect(appliedMeetsGoal(plan.candidate, finish)).toBe(true);
  });

  it('removes nothing when every own event stays inside the new schedule', () => {
    const own = [prepayment(1, '2025-09-30', '20000.00')];
    const base = paths(own);
    const outcome = seekGoal(base, finish);
    if (outcome.kind !== 'FOUND') throw new Error('expected FOUND');
    const plan = planApply(base, own, goalPrepayment(ID(2), finish.prepaymentDate, outcome), FACTS);
    expect(plan).toMatchObject({ kind: 'ok', removed: [] });
  });
});

describe('same-date ties (Opus C2)', () => {
  it('detects a prepayment or advance of the scenario on the goal date, and only those', () => {
    const events = [prepayment(1, '2026-03-31', '1000.00'), advanceEvent(ID(2), { date: '2026-04-30', count: '2' })];
    expect(hasSamePhase3Event(events, '2026-03-31')).toBe(true);
    expect(hasSamePhase3Event(events, '2026-04-30')).toBe(true);
    expect(hasSamePhase3Event(events, '2026-05-31')).toBe(false);
    expect(hasSamePhase3Event([{ ...events[0]!, deletedAt: '2026-01-01T00:00:00.000Z' }], '2026-03-31')).toBe(false);
  });

  it('safety net: a same-day REDUCE_INSTALLMENT base with FINISH_BY, applied before the base event, misses the goal', () => {
    const base = paths([
      {
        ...prepaymentEvent(ID(999), {
          date: '2026-03-31',
          amount: '30000.00',
          mode: 'REDUCE_INSTALLMENT',
          commissionKind: 'NONE',
          commissionAmount: '',
          commissionRate: '',
        }),
      },
    ]);
    const input: GoalInput = { prepaymentDate: '2026-03-31', goal: { kind: 'FINISH_BY', date: '2036-12-31' } };
    const outcome = seekGoal(base, input);
    if (outcome.kind !== 'FOUND') throw new Error('expected FOUND');
    const scenario = [
      prepaymentEvent(ID(999), {
        date: '2026-03-31',
        amount: '30000.00',
        mode: 'REDUCE_INSTALLMENT',
        commissionKind: 'NONE',
        commissionAmount: '',
        commissionRate: '',
      }),
    ];
    const plan = planApply(base, scenario, goalPrepayment(ID(1), input.prepaymentDate, outcome), FACTS);
    if (plan.kind !== 'ok') throw new Error('expected a plan');
    expect(appliedMeetsGoal(plan.candidate, input)).toBe(false);
  });

  it('safety net: a same-day advance base with MAX_INSTALLMENT misses the goal when applied first', () => {
    const scenario = [advanceEvent(ID(999), { date: '2026-03-31', count: '6' })];
    const base = paths(scenario);
    const input: GoalInput = { prepaymentDate: '2026-03-31', goal: { kind: 'MAX_INSTALLMENT', amount: '3500.00' } };
    const outcome = seekGoal(base, input);
    if (outcome.kind !== 'FOUND') throw new Error('expected FOUND');
    const plan = planApply(base, scenario, goalPrepayment(ID(1), input.prepaymentDate, outcome), FACTS);
    if (plan.kind !== 'ok') throw new Error('expected a plan');
    expect(appliedMeetsGoal(plan.candidate, input)).toBe(false);
  });

  it('a normal result passes the safety net', () => {
    const base = paths(null);
    const input: GoalInput = { prepaymentDate: '2026-03-31', goal: { kind: 'FINISH_BY', date: '2038-12-31' } };
    const outcome = seekGoal(base, input);
    if (outcome.kind !== 'FOUND') throw new Error('expected FOUND');
    const plan = planApply(base, [], goalPrepayment(ID(1), input.prepaymentDate, outcome), FACTS);
    if (plan.kind !== 'ok') throw new Error('expected a plan');
    expect(appliedMeetsGoal(plan.candidate, input)).toBe(true);
  });
});

describe('goal base and extra figures (I7, I8)', () => {
  it('FOUND carries the base path it was computed on', () => {
    const input: GoalInput = { prepaymentDate: '2026-03-31', goal: { kind: 'FINISH_BY', date: '2038-12-31' } };
    expect(seekGoal(paths(null), input)).toMatchObject({ kind: 'FOUND', basePath: 'REAL' });
    expect(seekGoal(paths([prepayment(1, '2025-09-30', '1000.00')]), input)).toMatchObject({
      kind: 'FOUND',
      basePath: 'SCENARIO',
    });
  });

  it('an advance event shows the amount to pay when it is the only phase-3 event of its installment', () => {
    const advance = advanceEvent(ID(2), { date: '2026-03-31', count: '6' });
    const base = paths([advance]);
    const extra = eventExtra(base, FACTS, advance, [advance]);
    const row = base.scenario!.rows.find((item) => item.k === installmentFor(FACTS, '2026-03-31'))!;
    expect(extra).toEqual({ label: 'Monto a pagar', amount: row.prepayment });
    const other = prepayment(3, '2026-03-31', '1000.00');
    expect(eventExtra(paths([advance, other]), FACTS, advance, [advance, other])).toBeNull();
  });

  it('a REDUCE_INSTALLMENT abono shows the new level installment of the next row', () => {
    const event = prepaymentEvent(ID(2), {
      date: '2026-03-31',
      amount: '30000.00',
      mode: 'REDUCE_INSTALLMENT',
      commissionKind: 'NONE',
      commissionAmount: '',
      commissionRate: '',
    });
    const base = paths([event]);
    const next = base.scenario!.rows.find((item) => item.k === installmentFor(FACTS, '2026-03-31') + 1)!;
    expect(eventExtra(base, FACTS, event, [event])).toEqual({ label: 'Nueva cuota nivelada', amount: next.level });
    expect(
      eventExtra(paths([prepayment(3, '2026-03-31', '1000.00')]), FACTS, prepayment(3, '2026-03-31', '1000.00'), []),
    ).toBeNull();
  });
});

describe('M6: the minimum trial throws', () => {
  it('FOUND with isPayoff when a MAX_INSTALLMENT of zero meets a future KEEP_INSTALLMENT_ADJUST_TERM change', () => {
    const rateChange: DomainEvent = {
      type: 'RateChange',
      id: 'rc-future',
      date: parseLocalDate('2027-01-31'),
      interestRate: parseRate('0.0701'),
      policy: 'KEEP_INSTALLMENT_ADJUST_TERM',
    };
    const outcome = seekGoal(paths(null, [rateChange]), {
      prepaymentDate: '2026-01-15',
      goal: { kind: 'MAX_INSTALLMENT', amount: '0.00' },
    });
    expect(outcome).toMatchObject({ kind: 'FOUND', isPayoff: true, mode: 'REDUCE_INSTALLMENT' });
  });
});

describe('decideApply: plan plus safety net, decided before anything is asked or saved', () => {
  const input: GoalInput = { prepaymentDate: '2026-03-31', goal: { kind: 'FINISH_BY', date: '2036-12-31' } };

  function found(base: Paths): Extract<ReturnType<typeof seekGoal>, { kind: 'FOUND' }> {
    const outcome = seekGoal(base, input);
    if (outcome.kind !== 'FOUND') throw new Error('expected FOUND');
    return outcome;
  }

  it('case B (same-day REDUCE_INSTALLMENT base, goal id sorted first) is stale, even without rule 1', () => {
    const own = [
      prepaymentEvent(ID(999), {
        date: '2026-03-31',
        amount: '30000.00',
        mode: 'REDUCE_INSTALLMENT',
        commissionKind: 'NONE',
        commissionAmount: '',
        commissionRate: '',
      }),
    ];
    const base = paths(own);
    const goal = goalPrepayment(ID(1), input.prepaymentDate, found(base));
    expect(decideApply(base, own, goal, input, FACTS, false)).toEqual({ kind: 'stale' });
    expect(decideApply(base, own, goal, input, FACTS, true)).toEqual({ kind: 'stale' });
  });

  it('asks only for a result that meets the goal, and saves it once confirmed', () => {
    const own = [prepayment(1, '2042-03-31', '1000.00')];
    const base = paths(own);
    const goal = goalPrepayment(ID(2), input.prepaymentDate, found(base));
    const ask = decideApply(base, own, goal, input, FACTS, false);
    expect(ask.kind).toBe('confirm');
    const save = decideApply(base, own, goal, input, FACTS, true);
    expect(save.kind).toBe('save');
  });

  it('saves a normal result at once and reports a domain error', () => {
    const base = paths(null);
    const goal = goalPrepayment(ID(2), input.prepaymentDate, found(base));
    expect(decideApply(base, [], goal, input, FACTS, false).kind).toBe('save');
    const real = paths(null, [REAL_PREPAYMENT]);
    const early = goalPrepayment(ID(2), '2025-05-31', found(base));
    expect(decideApply(real, [], early, input, FACTS, false).kind).toBe('error');
  });
});
