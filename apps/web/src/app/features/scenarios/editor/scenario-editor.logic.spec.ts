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
  amountError,
  countError,
  dateError,
  describeEvent,
  domainErrorText,
  dryRun,
  duplicateName,
  type GoalInput,
  goalPrepayment,
  installmentFor,
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
