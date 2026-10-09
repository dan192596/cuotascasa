import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareLocalDate, installmentOnOrAfter, parseLocalDate } from '../dates/index.ts';
import { createEngineContext } from '../engine-context.ts';
import { compareMoney, moneySub, parseMoney, parseRate } from '../money/index.ts';
import { buildPaths } from '../paths/index.ts';
import { buildSchedule } from '../schedule/index.ts';
import type { EngineContext } from '../types/engine.ts';
import type { PrepaymentEvent } from '../types/events.ts';
import type { LoanTerms } from '../types/loan.ts';
import type { DayOfMonth } from '../types/primitives.ts';
import type { Goal, GoalSeekRequest, Schedule } from '../types/schedule.ts';
import { goalSeek } from './index.ts';
import { loadGoalExampleCases } from './testing/examples.ts';

const ctx = createEngineContext();
const m = parseMoney;
const sample = loadGoalExampleCases()[0]!.terms;

/** Evaluador independiente de [ALG.GOAL]: reconstruye el calendario con el abono de la prueba. */
function meets(terms: LoanTerms, goal: Goal, k: number, date: string, amount: string, engine: EngineContext): boolean {
  const trial: PrepaymentEvent = {
    id: 'check',
    type: 'Prepayment',
    date: parseLocalDate(date),
    amount: m(amount),
    mode: goal.kind === 'FINISH_BY' ? 'REDUCE_TERM' : 'REDUCE_INSTALLMENT',
  };
  const schedule: Schedule = buildSchedule(terms, [], engine, { goalPrepayment: trial });
  if (goal.kind === 'FINISH_BY') {
    return compareLocalDate(schedule.endDate, goal.date) <= 0;
  }
  const next = schedule.rows[k];
  return next === undefined || compareMoney(next.total, goal.amount) <= 0;
}

const loan = fc.record({
  cents: fc.integer({ min: 100_000, max: 200_000_000 }),
  termMonths: fc.integer({ min: 6, max: 120 }),
  basisPoints: fc.integer({ min: 0, max: 2_000 }),
  insurance: fc.array(fc.integer({ min: 0, max: 200 }), { maxLength: 2 }),
  fixedCents: fc.integer({ min: 0, max: 100_000 }),
  profile: fc.constantFrom<'FHA_GT_V1' | 'SIMPLE'>('FHA_GT_V1', 'SIMPLE'),
  day: fc.integer({ min: 1, max: 27 }),
  kTarget: fc.integer({ min: 1, max: 5 }),
  finishIndex: fc.integer({ min: 1, max: 120 }),
  maxInstallmentCents: fc.integer({ min: 0, max: 5_000_000 }),
  kind: fc.constantFrom<'FINISH_BY' | 'MAX_INSTALLMENT'>('FINISH_BY', 'MAX_INSTALLMENT'),
});

function money(cents: number): ReturnType<typeof m> {
  return m((cents / 100).toFixed(2));
}

describe('goal-seek properties (synthetic loans)', () => {
  it('the result satisfies the goal and result − 0.01 does not; ALREADY_MET and INFEASIBLE are consistent', () => {
    fc.assert(
      fc.property(loan, (input) => {
        const terms: LoanTerms = {
          ...sample,
          principal: money(input.cents),
          termMonths: input.termMonths,
          interestRate: parseRate((input.basisPoints / 10_000).toFixed(4)),
          insuranceRates: input.insurance.map((bp) => parseRate((bp / 10_000).toFixed(4))),
          fixedCharges:
            input.fixedCents === 0
              ? []
              : [{ label: 'Cargo', amount: money(input.fixedCents), effectiveFrom: sample.firstDueDate }],
          roundingProfile: input.profile,
          paymentDay: input.day as DayOfMonth,
          disbursementDate: parseLocalDate('2025-01-01'),
          firstDueDate: parseLocalDate(`2025-02-${String(input.day).padStart(2, '0')}`),
        };
        const paths = buildPaths({ terms, realEvents: [], scenarioEvents: null }, ctx);
        const k = Math.min(input.kTarget, paths.real.installmentCount);
        const row = paths.real.rows[k - 1]!;
        const date = row.dueDate;
        const finishAt = paths.real.rows[Math.min(input.finishIndex, input.termMonths) - 1]?.dueDate ?? date;
        const goal: Goal =
          input.kind === 'FINISH_BY'
            ? { kind: 'FINISH_BY', date: finishAt }
            : { kind: 'MAX_INSTALLMENT', amount: money(input.maxInstallmentCents) };
        const request: GoalSeekRequest = { basePath: 'REAL', prepaymentDate: date, goal };
        expect(installmentOnOrAfter(terms.firstDueDate, terms.paymentDay, date)).toBe(k);
        const result = goalSeek(paths, request, ctx);
        if (result.kind === 'ALREADY_MET') {
          return;
        }
        if (result.kind === 'INFEASIBLE') {
          expect(goal.kind).toBe('FINISH_BY');
          expect(result.payoffAmount).toBe(row.closing);
          expect(compareLocalDate(row.dueDate, goal.kind === 'FINISH_BY' ? goal.date : row.dueDate)).toBe(1);
          return;
        }
        expect(meets(terms, goal, k, date, result.amount, ctx)).toBe(true);
        if (compareMoney(result.amount, '0.01' as never) > 0) {
          expect(meets(terms, goal, k, date, moneySub(result.amount, m('0.01')), ctx)).toBe(false);
        }
        expect(result.isPayoff).toBe(result.amount === row.closing);
      }),
      { numRuns: 250 },
    );
  }, 120_000);
});

describe('number of schedule builds', () => {
  it('stays within the documented bound: 12 + ceil(log2 N) + 2', () => {
    let builds = 0;
    const counting = createEngineContext({
      registry: {
        ...ctx.registry,
        Prepayment: (input) => {
          builds += 1;
          return ctx.registry.Prepayment(input);
        },
      },
    });
    for (const kind of ['FINISH_BY', 'MAX_INSTALLMENT'] as const) {
      const terms: LoanTerms = { ...sample, termMonths: 360 };
      const paths = buildPaths({ terms, realEvents: [], scenarioEvents: null }, counting);
      const goal: Goal =
        kind === 'FINISH_BY' ? { kind, date: parseLocalDate('2040-12-31') } : { kind, amount: m('4000.00') };
      builds = 0;
      const result = goalSeek(
        paths,
        { basePath: 'REAL', prepaymentDate: parseLocalDate('2026-01-15'), goal },
        counting,
      );
      expect(result.kind).toBe('FOUND');
      // N = 50 000 000 centavos de closing_k como máximo: ⌈log2 N⌉ = 26: peor caso 12 + 26 + 2.
      expect(builds).toBeLessThanOrEqual(40);
      expect(builds).toBeLessThanOrEqual(14);
    }
  });
});
