import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareLocalDate, installmentOnOrAfter, parseLocalDate } from '../dates/index.ts';
import { createEngineContext } from '../engine-context.ts';
import { compareMoney, moneyAdd, moneySub, parseMoney, parseRate } from '../money/index.ts';
import { buildPaths } from '../paths/index.ts';
import { buildSchedule } from '../schedule/index.ts';
import type { EngineContext } from '../types/engine.ts';
import type { DomainEvent, HypotheticalEvent, PrepaymentEvent } from '../types/events.ts';
import type { LoanTerms } from '../types/loan.ts';
import {
  DomainError,
  type DayOfMonth,
  InfeasibleGoalError,
  type LocalDate,
  type Money,
  NegativeAmortizationError,
} from '../types/primitives.ts';
import type { Goal, GoalSeekRequest, Paths, Schedule } from '../types/schedule.ts';
import { goalSeek } from './index.ts';
import { loadGoalExampleCases } from './testing/examples.ts';

const ctx = createEngineContext();
const m = parseMoney;
const CENT = m('0.01');
const sample = loadGoalExampleCases()[0]!.terms;

function money(cents: number): Money {
  return m((cents / 100).toFixed(2));
}

function rate(basisPoints: number) {
  return parseRate((basisPoints / 10_000).toFixed(4));
}

/** Descripción generada de un evento; se materializa contra las fechas del préstamo. */
const eventSpec = fc.record({
  kind: fc.constantFrom('RATE_RECALC', 'RATE_KEEP', 'RATE_BANK', 'PREPAY_TERM', 'PREPAY_INST', 'ADVANCE', 'FIXED'),
  month: fc.integer({ min: 0, max: 35 }),
  day: fc.integer({ min: 1, max: 28 }),
  basisPoints: fc.integer({ min: 0, max: 2_000 }),
  cents: fc.integer({ min: 1, max: 5_000 }),
  count: fc.integer({ min: 1, max: 3 }),
});
type EventSpec = typeof eventSpec extends fc.Arbitrary<infer T> ? T : never;

const loan = fc.record({
  cents: fc.integer({ min: 100_000, max: 200_000_000 }),
  termMonths: fc.integer({ min: 6, max: 120 }),
  basisPoints: fc.integer({ min: 0, max: 2_000 }),
  insurance: fc.array(fc.integer({ min: 0, max: 200 }), { maxLength: 2 }),
  fixedCents: fc.integer({ min: 0, max: 100_000 }),
  profile: fc.constantFrom<'FHA_GT_V1' | 'SIMPLE'>('FHA_GT_V1', 'SIMPLE'),
  day: fc.integer({ min: 1, max: 27 }),
  real: fc.array(eventSpec, { maxLength: 3 }),
  scenario: fc.array(eventSpec, { maxLength: 2 }),
  useScenario: fc.boolean(),
  kTarget: fc.integer({ min: 1, max: 24 }),
  dateDay: fc.integer({ min: 1, max: 28 }),
  finishIndex: fc.integer({ min: 1, max: 120 }),
  maxInstallmentCents: fc.integer({ min: 0, max: 5_000_000 }),
  kind: fc.constantFrom<'FINISH_BY' | 'MAX_INSTALLMENT'>('FINISH_BY', 'MAX_INSTALLMENT'),
});
type LoanSpec = typeof loan extends fc.Arbitrary<infer T> ? T : never;

function dateIn(firstDue: LocalDate, monthOffset: number, day: number): LocalDate {
  const [year, month] = firstDue.split('-').map(Number) as [number, number];
  const index = year * 12 + (month - 1) + monthOffset;
  const y = Math.floor(index / 12);
  const mo = (index % 12) + 1;
  return parseLocalDate(`${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}

function materialize(spec: EventSpec, id: string, firstDue: LocalDate, monthLimit: number): DomainEvent {
  const date = dateIn(firstDue, spec.month % monthLimit, spec.day);
  switch (spec.kind) {
    case 'RATE_RECALC':
      return {
        id,
        type: 'RateChange',
        date,
        interestRate: rate(spec.basisPoints),
        policy: 'RECALC_INSTALLMENT_KEEP_TERM',
      };
    case 'RATE_KEEP':
      return {
        id,
        type: 'RateChange',
        date,
        interestRate: rate(spec.basisPoints),
        policy: 'KEEP_INSTALLMENT_ADJUST_TERM',
      };
    case 'RATE_BANK':
      return {
        id,
        type: 'RateChange',
        date,
        interestRate: rate(spec.basisPoints),
        policy: 'BANK_INSTALLMENT',
        bankInstallment: money(spec.cents),
      };
    case 'PREPAY_TERM':
      return { id, type: 'Prepayment', date, amount: money(spec.cents), mode: 'REDUCE_TERM' };
    case 'PREPAY_INST':
      return { id, type: 'Prepayment', date, amount: money(spec.cents), mode: 'REDUCE_INSTALLMENT' };
    case 'ADVANCE':
      return { id, type: 'AdvanceInstallments', date, count: spec.count };
    default:
      return { id, type: 'FixedChargeChange', date, fixedCharges: [{ label: 'Cargo', amount: money(spec.cents) }] };
  }
}

function termsOf(input: LoanSpec): LoanTerms {
  return {
    ...sample,
    principal: money(input.cents),
    termMonths: input.termMonths,
    interestRate: rate(input.basisPoints),
    insuranceRates: input.insurance.map(rate),
    fixedCharges:
      input.fixedCents === 0
        ? []
        : [{ label: 'Cargo', amount: money(input.fixedCents), effectiveFrom: parseLocalDate('2025-02-28') }],
    roundingProfile: input.profile,
    paymentDay: input.day as DayOfMonth,
    disbursementDate: parseLocalDate('2025-01-01'),
    firstDueDate: parseLocalDate(`2025-02-${String(input.day).padStart(2, '0')}`),
  };
}

/** Evaluador independiente de [ALG.GOAL]. */
function meets(schedule: Schedule, goal: Goal, k: number): boolean {
  if (goal.kind === 'FINISH_BY') {
    return compareLocalDate(schedule.endDate, goal.date) <= 0;
  }
  const next = schedule.rows[k];
  return next === undefined || compareMoney(next.total, goal.amount) <= 0;
}

/** Predicado ruled (Opus ruling 1): la prueba cumple la meta o lanza `NegativeAmortizationError`. */
function ruled(
  terms: LoanTerms,
  baseEvents: readonly DomainEvent[],
  goal: Goal,
  k: number,
  date: LocalDate,
  amount: Money,
  engine: EngineContext,
): { holds: boolean; threw: boolean } {
  const trial: PrepaymentEvent = {
    id: 'check',
    type: 'Prepayment',
    date,
    amount,
    mode: goal.kind === 'FINISH_BY' ? 'REDUCE_TERM' : 'REDUCE_INSTALLMENT',
  };
  try {
    const schedule = buildSchedule(terms, [], engine, { inheritedEvents: baseEvents, goalPrepayment: trial });
    return { holds: meets(schedule, goal, k), threw: false };
  } catch (error) {
    if (error instanceof NegativeAmortizationError) {
      return { holds: true, threw: true };
    }
    throw error;
  }
}

interface Outcome {
  readonly exercised: boolean;
  readonly foundKinds: string;
}

/** Ejecuta un caso generado. Devuelve `exercised: false` si la entrada generada no es un préstamo válido. */
function check(input: LoanSpec, globalScan: boolean): Outcome {
  const terms = termsOf(input);
  const real = input.real.map((spec, i) => materialize(spec, `r${i}`, terms.firstDueDate, input.termMonths));
  const scenarioRaw = input.useScenario
    ? input.scenario.map((spec, i) => materialize(spec, `s${i}`, terms.firstDueDate, input.termMonths))
    : null;
  const scenario = scenarioRaw?.filter((event) => event.type !== 'ReportedBalance' && event.type !== 'ActualPayment');
  let paths: Paths;
  try {
    paths = buildPaths(
      { terms, realEvents: real, scenarioEvents: (scenario ?? null) as HypotheticalEvent[] | null },
      ctx,
    );
  } catch (error) {
    if (error instanceof DomainError) {
      return { exercised: false, foundKinds: 'invalid-paths' };
    }
    throw error;
  }
  const basePath = scenario === null || scenario === undefined ? 'REAL' : 'SCENARIO';
  const base = basePath === 'REAL' ? paths.real : (paths.scenario as Schedule);
  const baseEvents = basePath === 'REAL' ? real : [...real, ...(scenario ?? [])];
  const date = dateIn(terms.firstDueDate, input.kTarget - 1, input.dateDay);
  const k = installmentOnOrAfter(terms.firstDueDate, terms.paymentDay, date);
  const finish = base.rows[Math.min(input.finishIndex, base.rows.length) - 1]?.dueDate ?? date;
  const goal: Goal =
    input.kind === 'FINISH_BY'
      ? { kind: 'FINISH_BY', date: finish }
      : { kind: 'MAX_INSTALLMENT', amount: money(input.maxInstallmentCents) };
  const request: GoalSeekRequest = { basePath, prepaymentDate: date, goal };

  let result;
  try {
    result = goalSeek(paths, request, ctx);
  } catch (error) {
    if (error instanceof InfeasibleGoalError) {
      expect(['PREPAYMENT_NOT_AFTER_CUTOFF', 'PREPAYMENT_AFTER_END']).toContain(error.code);
      expect(k <= paths.cutoffK || k > base.installmentCount).toBe(true);
      return { exercised: true, foundKinds: error.code };
    }
    if (error instanceof DomainError) {
      // Otro error de dominio de una prueba o de la base heredada se propaga tal cual.
      return { exercised: false, foundKinds: 'propagated' };
    }
    throw error;
  }

  if (result.kind === 'ALREADY_MET') {
    expect(meets(base, goal, k)).toBe(true);
    return { exercised: true, foundKinds: 'ALREADY_MET' };
  }
  expect(meets(base, goal, k)).toBe(false);
  if (result.kind === 'INFEASIBLE') {
    expect(goal.kind).toBe('FINISH_BY');
    const payoff = ruled(terms, baseEvents, goal, k, date, result.payoffAmount, ctx);
    expect(payoff.threw ? false : payoff.holds).toBe(false);
    return { exercised: true, foundKinds: 'INFEASIBLE' };
  }

  const at = ruled(terms, baseEvents, goal, k, date, result.amount, ctx);
  expect(at.holds).toBe(true);
  if (!result.isPayoff && compareMoney(result.amount, CENT) > 0) {
    // Minimalidad local (fuera de la liquidación, que puede ir tras la banda que lanza): un centavo menos ya no cumple.
    expect(ruled(terms, baseEvents, goal, k, date, moneySub(result.amount, CENT), ctx).holds).toBe(false);
  }
  if (at.threw) {
    // Solo la liquidación puede quedar tras la banda que lanza.
    expect(result.isPayoff).toBe(true);
  }
  if (globalScan) {
    // Minimalidad global: el primer centavo que cumple el predicado ruled decide el resultado.
    let first = CENT;
    while (!ruled(terms, baseEvents, goal, k, date, first, ctx).holds && compareMoney(first, result.amount) < 0) {
      first = moneyAdd(first, CENT);
    }
    const firstTrial = ruled(terms, baseEvents, goal, k, date, first, ctx);
    if (firstTrial.threw) {
      expect(result.isPayoff).toBe(true);
    } else {
      expect(result.amount).toBe(first);
    }
  }
  return { exercised: true, foundKinds: result.isPayoff ? 'FOUND-payoff' : 'FOUND' };
}

describe('goal-seek properties (synthetic loans, random future events)', () => {
  it('the result satisfies the goal and result − 0.01 does not, under the ruled predicate', () => {
    const seen: Record<string, number> = {};
    fc.assert(
      fc.property(loan, (input) => {
        const outcome = check(input, false);
        seen[outcome.foundKinds] = (seen[outcome.foundKinds] ?? 0) + 1;
      }),
      { numRuns: 250 },
    );
    expect(seen['FOUND'] ?? 0).toBeGreaterThan(10);
    expect(seen['ALREADY_MET'] ?? 0).toBeGreaterThan(0);
  }, 120_000);

  it('on small principals the result is the global minimum over every cent', () => {
    const small = loan.map((input) => {
      const termMonths = 6 + (input.termMonths % 19);
      const tame = (event: EventSpec): EventSpec => ({ ...event, cents: 1 + (event.cents % 200) });
      return {
        ...input,
        cents: 300 + (input.cents % 700),
        termMonths,
        kTarget: 1 + (input.kTarget % (termMonths - 2)),
        real: input.real.slice(0, 2).map(tame),
        scenario: input.scenario.map(tame),
        maxInstallmentCents: input.maxInstallmentCents % 300,
      };
    });
    const seen: Record<string, number> = {};
    fc.assert(
      fc.property(small, (input) => {
        const outcome = check(input, true);
        seen[outcome.foundKinds] = (seen[outcome.foundKinds] ?? 0) + 1;
      }),
      { numRuns: 400 },
    );
    expect((seen['FOUND'] ?? 0) + (seen['FOUND-payoff'] ?? 0)).toBeGreaterThan(20);
  }, 120_000);
});

describe('number of schedule builds', () => {
  it('stays within the documented bound: 12 + ceil(log2 N) + 2', () => {
    let trials = 0;
    const counting = createEngineContext({
      registry: {
        ...ctx.registry,
        // Sin eventos en el camino base, cada llamada al handler de Prepayment es una prueba (un calendario).
        Prepayment: (input) => {
          trials += 1;
          return ctx.registry.Prepayment(input);
        },
      },
    });
    for (const kind of ['FINISH_BY', 'MAX_INSTALLMENT'] as const) {
      const terms: LoanTerms = { ...sample, termMonths: 360 };
      const paths = buildPaths({ terms, realEvents: [], scenarioEvents: null }, counting);
      const goal: Goal =
        kind === 'FINISH_BY' ? { kind, date: parseLocalDate('2040-12-31') } : { kind, amount: m('4000.00') };
      trials = 0;
      const result = goalSeek(
        paths,
        { basePath: 'REAL', prepaymentDate: parseLocalDate('2026-01-15'), goal },
        counting,
      );
      expect(result.kind).toBe('FOUND');
      // N = 50 000 000 centavos como máximo: ⌈log2 N⌉ = 26, peor caso 12 + 26 + 2 = 40; en la práctica, menos de 15.
      expect(trials).toBeLessThanOrEqual(14);
    }
  });
});
