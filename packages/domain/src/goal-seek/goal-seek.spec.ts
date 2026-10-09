import { describe, expect, it } from 'vitest';
import { thrownBy } from '../../test/support/errors.ts';
import { parseLocalDate } from '../dates/index.ts';
import { createEngineContext } from '../engine-context.ts';
import { compareMoney, moneySub, parseMoney } from '../money/index.ts';
import { buildPaths } from '../paths/index.ts';
import { buildSchedule } from '../schedule/index.ts';
import type { DomainEvent, HypotheticalEvent, PrepaymentEvent } from '../types/events.ts';
import { InfeasibleGoalError } from '../types/primitives.ts';
import type { GoalSeekRequest, Paths } from '../types/schedule.ts';
import { goalSeek } from './index.ts';
import { loadGoalExampleCases } from './testing/examples.ts';

const ctx = createEngineContext();
const cases = loadGoalExampleCases();
const m = parseMoney;
const d = parseLocalDate;

describe('ex11 goal-seek examples, to the cent', () => {
  for (const item of cases) {
    it(item.id, () => {
      const run = () =>
        goalSeek(
          buildPaths({ terms: item.terms, realEvents: item.realEvents, scenarioEvents: item.scenarioEvents }, ctx),
          item.request,
          ctx,
        );
      const { expected } = item;
      if (expected.error !== undefined) {
        const error = thrownBy(run);
        expect(error).toBeInstanceOf(InfeasibleGoalError);
        expect(error).toMatchObject({ name: expected.error.type, rule: expected.error.rule });
        if (expected.error.k !== undefined) {
          expect((error as InfeasibleGoalError).details.k).toBe(expected.error.k);
        }
        return;
      }
      expect(run()).toEqual(expected);
    });
  }
});

describe('input errors carry codes', () => {
  const [base] = cases;
  const input = { terms: base!.terms, realEvents: [], scenarioEvents: null };
  const paths = buildPaths(input, ctx);
  const code = (request: GoalSeekRequest, p: Paths = paths) =>
    (thrownBy(() => goalSeek(p, request, ctx)) as InfeasibleGoalError).code;

  it('maps each invalid input to its code', () => {
    const finish = { kind: 'FINISH_BY', date: d('2040-12-31') } as const;
    expect(code({ basePath: 'SCENARIO', prepaymentDate: d('2026-01-15'), goal: finish })).toBe('SCENARIO_PATH_MISSING');
    expect(
      code({
        basePath: 'REAL',
        prepaymentDate: d('2026-01-15'),
        goal: { kind: 'MAX_INSTALLMENT', amount: m('-0.01') },
      }),
    ).toBe('INVALID_GOAL_AMOUNT');
    expect(code({ basePath: 'REAL', prepaymentDate: d('2045-02-15'), goal: finish })).toBe('PREPAYMENT_AFTER_END');
    const anchored = buildPaths(
      {
        terms: base!.terms,
        realEvents: [{ id: 'p', type: 'Prepayment', date: d('2026-01-15'), amount: m('1000.00'), mode: 'REDUCE_TERM' }],
        scenarioEvents: null,
      },
      ctx,
    );
    expect(code({ basePath: 'REAL', prepaymentDate: d('2026-01-15'), goal: finish }, anchored)).toBe(
      'PREPAYMENT_NOT_AFTER_CUTOFF',
    );
  });

  it('MAX_INSTALLMENT of 0.00 is valid and ends in a payoff', () => {
    const result = goalSeek(
      paths,
      { basePath: 'REAL', prepaymentDate: d('2026-01-15'), goal: { kind: 'MAX_INSTALLMENT', amount: m('0.00') } },
      ctx,
    );
    expect(result).toMatchObject({ kind: 'FOUND', isPayoff: true, amount: '489756.31' });
  });
});

describe('same-date base events (trial goes after them)', () => {
  const [item] = cases;
  const terms = item!.terms;
  const advance: HypotheticalEvent = { id: 'adv', type: 'AdvanceInstallments', date: d('2026-01-15'), count: 2 };
  const later: HypotheticalEvent = {
    id: 'later',
    type: 'Prepayment',
    date: d('2026-01-20'),
    amount: m('50000.00'),
    mode: 'REDUCE_TERM',
  };
  const goal = { kind: 'FINISH_BY', date: d('2026-02-15') } as const;
  const request: GoalSeekRequest = { basePath: 'SCENARIO', prepaymentDate: d('2026-01-15'), goal };

  function scenarioPaths(events: readonly HypotheticalEvent[]): Paths {
    return buildPaths({ terms, realEvents: [], scenarioEvents: events }, ctx);
  }

  it('payoff amount is closing_k minus the same-date AdvanceInstallments, which goes before the trial', () => {
    const paths = scenarioPaths([advance]);
    const row = paths.scenario!.rows[11]!;
    const applied = row.prepayment;
    expect(compareMoney(applied, m('0.00'))).toBe(1);
    const result = goalSeek(paths, request, ctx);
    expect(result).toMatchObject({ kind: 'FOUND', isPayoff: true, amount: row.closingAfterPrepayment });
    // La prueba aplicada sobre el adelanto liquida en k: la fila terminal suma adelanto + prueba.
    const found = result as Extract<ReturnType<typeof goalSeek>, { kind: 'FOUND' }>;
    const trial: PrepaymentEvent = {
      id: 'trial',
      type: 'Prepayment',
      date: d('2026-01-15'),
      amount: found.amount,
      mode: 'REDUCE_TERM',
    };
    const schedule = buildSchedule(terms, [], ctx, { inheritedEvents: [advance], goalPrepayment: trial });
    expect(schedule.rows).toHaveLength(12);
    expect(schedule.rows[11]).toMatchObject({ payoff: true, closingAfterPrepayment: '0.00' });
  });

  it('a later base Prepayment of the same k is ordered after the trial: closing_k ignores it, so it pays the rest', () => {
    const paths = scenarioPaths([later]);
    const closing = paths.scenario!.rows[11]!.closing;
    // La prueba va primero y el abono posterior (50 000.00) liquida el resto: basta closing_k − 50 000.00.
    expect(goalSeek(paths, request, ctx)).toMatchObject({
      kind: 'FOUND',
      isPayoff: false,
      amount: moneySub(closing, m('50000.00')),
    });
  });

  it('a base that already pays off at k with an earlier event is ALREADY_MET for MAX_INSTALLMENT', () => {
    const big: HypotheticalEvent = {
      id: 'big',
      type: 'Prepayment',
      date: d('2026-01-10'),
      amount: m('900000.00'),
      mode: 'REDUCE_TERM',
    };
    const paths = scenarioPaths([big]);
    const result = goalSeek(
      paths,
      { basePath: 'SCENARIO', prepaymentDate: d('2026-01-15'), goal: { kind: 'MAX_INSTALLMENT', amount: m('0.00') } },
      ctx,
    );
    expect(result).toEqual({ kind: 'ALREADY_MET' });
    const infeasible = goalSeek(
      paths,
      { basePath: 'SCENARIO', prepaymentDate: d('2026-01-15'), goal: { kind: 'FINISH_BY', date: d('2025-12-31') } },
      ctx,
    );
    expect(infeasible).toEqual({ kind: 'INFEASIBLE', payoffAmount: '0.00', reason: 'GOAL_DATE_BEFORE_PREPAYMENT' });
  });
});

declare const performance: { now(): number };

describe('bench', () => {
  it('finishes a 360-month loan in under 200 ms (with a CI tolerance factor)', () => {
    const [item] = cases;
    const terms = { ...item!.terms, principal: m('800000.00'), termMonths: 360 };
    const paths = buildPaths({ terms, realEvents: [] as DomainEvent[], scenarioEvents: null }, ctx);
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const factor = env?.['CI'] === undefined ? 1 : 5;
    const started = performance.now();
    const result = goalSeek(
      paths,
      { basePath: 'REAL', prepaymentDate: d('2026-01-15'), goal: { kind: 'FINISH_BY', date: d('2045-12-31') } },
      ctx,
    );
    const elapsed = performance.now() - started;
    expect(result.kind).toBe('FOUND');
    expect(elapsed).toBeLessThan(200 * factor);
  });
});
