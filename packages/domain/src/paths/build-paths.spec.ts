import { describe, expect, it } from 'vitest';
import { thrownBy } from '../../test/support/errors.ts';
import { createEngineContext } from '../engine-context.ts';
import { buildSchedule, runSchedule } from '../schedule/index.ts';
import { actualPayment, advance, prepayment, rateChange, reported, shortTerms } from '../schedule/testing/builders.ts';
import { InvalidInputError } from '../types/primitives.ts';
import type { ActualPaymentBreakdown, DomainEvent, HypotheticalEvent, ReportedBalanceEvent } from '../types/events.ts';
import { PathKind, type ScheduleRow } from '../types/schedule.ts';
import { buildPaths, compareSchedules } from './index.ts';
import { withTestHandlers } from './testing/handlers.ts';

const ctx = withTestHandlers(createEngineContext());
const terms = shortTerms();
const plain = buildSchedule(terms, [], ctx);

describe('buildPaths ([ALG.PATHS])', () => {
  it('without real data the cutoff is 0 and without scenario events the scenario is null', () => {
    const paths = buildPaths({ terms, realEvents: [], scenarioEvents: null }, ctx);
    expect(paths.cutoffK).toBe(0);
    expect(paths.scenario).toBeNull();
    expect(paths.original).toEqual(plain);
    expect(paths.real).toEqual(plain);
    expect(paths.realDelta).toEqual({ perAnchor: [], perComponent: [] });
  });

  it('keeps the input it was built from (goalSeek reads it)', () => {
    const input = { terms, realEvents: [], scenarioEvents: [] };
    expect(buildPaths(input, ctx).input).toBe(input);
  });

  it('an empty scenario is still a scenario, equal to the real path', () => {
    const paths = buildPaths({ terms, realEvents: [], scenarioEvents: [] }, ctx);
    expect(paths.scenario).toEqual(paths.real);
  });

  it('the original path ignores every real event', () => {
    const real = [reported('rb', '2026-04-30', '800.00'), prepayment('p', '2026-06-30')];
    const paths = buildPaths({ terms, realEvents: real, scenarioEvents: null }, ctx);
    expect(paths.original).toEqual(plain);
    expect(paths.real).not.toEqual(plain);
    expect(paths.real).toEqual(buildSchedule(terms, real, ctx));
  });

  it('the real path exposes realDelta per anchor and per component, and the paid flag per row', () => {
    const real: DomainEvent[] = [
      reported('rb', '2026-04-30', '800.00'),
      { ...actualPayment('ap', '2026-06-02', 5), breakdown: breakdownOf(plain.rows[4]) },
    ];
    const paths = buildPaths({ terms, realEvents: real, scenarioEvents: null }, ctx);
    const run = runSchedule(terms, real, ctx);
    expect(paths.realDelta).toEqual(run.realDelta);
    expect(paths.realDelta.perAnchor).toHaveLength(1);
    expect(paths.realDelta.perComponent).toHaveLength(1);
    expect(paths.real.rows.filter((row) => row.paid).map((row) => row.k)).toEqual([5]);
    expect(paths.original.rows.some((row) => row.paid)).toBe(false);
  });

  describe('cutoffK ([ALG.PATHS.CUTOFF])', () => {
    // W2-04 owns the AdvanceInstallments handler: a no-op test handler is enough to place the event.
    const advanceContext = createEngineContext({
      registry: { ...ctx.registry, AdvanceInstallments: ({ state }) => ({ state }) },
    });
    const cutoffOf = (realEvents: readonly DomainEvent[], engine = ctx) =>
      buildPaths({ terms, realEvents, scenarioEvents: null }, engine).cutoffK;

    it('is the max k among real anchors, payments, prepayments and advances', () => {
      expect(cutoffOf([reported('rb', '2026-03-31', '900.00')])).toBe(3);
      expect(cutoffOf([actualPayment('ap', '2026-05-01', 5)])).toBe(5);
      expect(cutoffOf([prepayment('p', '2026-02-28')])).toBe(2);
      expect(cutoffOf([advance('a', '2026-06-30', 1)], advanceContext)).toBe(6);
      expect(
        cutoffOf([
          reported('rb', '2026-03-31', '900.00'),
          actualPayment('ap', '2026-05-01', 5),
          prepayment('p', '2026-02-28'),
        ]),
      ).toBe(5);
    });

    it('real RateChange and FixedChargeChange events do not move it, even when dated in the future', () => {
      expect(cutoffOf([rateChange('r', '2026-09-30')])).toBe(0);
      expect(cutoffOf([rateChange('r', '2026-09-30'), reported('rb', '2026-02-28', '1100.00')])).toBe(2);
    });

    it('uses the installment number, not the date', () => {
      const anchor: ReportedBalanceEvent = reported('rb', '2026-02-10', '900.00', 6);
      expect(cutoffOf([anchor])).toBe(6);
    });
  });

  describe('scenario', () => {
    it('is the real path plus the hypothetical events, which are applied with k above the cutoff', () => {
      const real = [reported('rb', '2026-03-31', '900.00')];
      const hypothetical: HypotheticalEvent[] = [prepayment('hyp', '2026-06-30', '200.00')];
      const paths = buildPaths({ terms, realEvents: real, scenarioEvents: hypothetical }, ctx);
      expect(paths.scenario).toEqual(buildSchedule(terms, [...real, ...hypothetical], ctx));
      expect(paths.scenario?.rows[5]?.prepayment).toBe('200.00');
      expect(paths.real.totals.prepayments).toBe('0.00');
      expect(paths.scenario?.rows[2]?.opening).toBe('900.00');
    });

    it('accepts a hypothetical event at cutoffK + 1 and rejects one at cutoffK or before', () => {
      const real = [reported('rb', '2026-03-31', '900.00')];
      const at = (date: string) =>
        buildPaths({ terms, realEvents: real, scenarioEvents: [prepayment('hyp', date)] }, ctx);
      expect(() => at('2026-04-30')).not.toThrow();
      for (const date of ['2026-03-31', '2026-03-01', '2026-01-31']) {
        const error = thrownBy(() => at(date));
        expect(error).toBeInstanceOf(InvalidInputError);
        expect(error).toMatchObject({ code: 'HYPOTHETICAL_BEFORE_CUTOFF', rule: 'ALG.PATHS.CUTOFF' });
      }
    });

    it('reports the smallest offending k', () => {
      const real = [reported('rb', '2026-05-31', '800.00')];
      const error = thrownBy(() =>
        buildPaths(
          { terms, realEvents: real, scenarioEvents: [prepayment('h1', '2026-05-15'), prepayment('h2', '2026-02-20')] },
          ctx,
        ),
      );
      expect(error).toMatchObject({ code: 'HYPOTHETICAL_BEFORE_CUTOFF', k: 2 });
    });

    it('compares by installment number, not by date: an early-dated anchor on a late installment still blocks', () => {
      const real = [reported('rb', '2026-02-10', '900.00', 6)];
      const error = thrownBy(() =>
        buildPaths({ terms, realEvents: real, scenarioEvents: [prepayment('hyp', '2026-04-15')] }, ctx),
      );
      expect(error).toMatchObject({ code: 'HYPOTHETICAL_BEFORE_CUTOFF', k: 4 });
    });

    it('any hypothetical is allowed at k = 1 when there is no real data', () => {
      expect(() =>
        buildPaths({ terms, realEvents: [], scenarioEvents: [prepayment('hyp', '2026-01-31')] }, ctx),
      ).not.toThrow();
    });

    it('a real future RateChange does not block earlier hypotheticals and is inherited by the scenario', () => {
      const real = [rateChange('r', '2026-09-30')];
      const paths = buildPaths({ terms, realEvents: real, scenarioEvents: [prepayment('hyp', '2026-03-31')] }, ctx);
      expect(paths.cutoffK).toBe(0);
      expect(paths.scenario?.rows[7]?.level).toBe(plain.rows[7]?.level);
      expect(paths.scenario?.rows[8]?.level).not.toBe(plain.rows[8]?.level);
    });

    it('inherits the real events: a scenario that settles before a future real event does not throw', () => {
      const real = [reported('rb', '2026-02-28', '1100.00'), rateChange('r', '2026-11-30')];
      const payoff = prepayment('hyp', '2026-03-31', '999999.00');
      const paths = buildPaths({ terms, realEvents: real, scenarioEvents: [payoff] }, ctx);
      expect(paths.scenario?.installmentCount).toBe(3);
      expect(paths.scenario?.rows.at(-1)?.payoff).toBe(true);
      const metrics = compareSchedules(paths.real, paths.scenario ?? plain);
      expect(metrics.monthsSaved).toBe(paths.real.installmentCount - 3);
    });

    it('still validates the range of its own events', () => {
      const error = thrownBy(() =>
        buildPaths({ terms, realEvents: [], scenarioEvents: [prepayment('hyp', '2027-06-30')] }, ctx),
      );
      expect(error).toMatchObject({ code: 'INSTALLMENT_OUT_OF_RANGE' });
    });

    it('rejects a non-hypothetical event in the scenario', () => {
      const bad = [reported('rb', '2026-04-30', '800.00')] as unknown as HypotheticalEvent[];
      const error = thrownBy(() => buildPaths({ terms, realEvents: [], scenarioEvents: bad }, ctx));
      expect(error).toMatchObject({ code: 'INVALID_EVENT' });
    });
  });

  it('exposes the path kinds of the glossary for the callers', () => {
    expect(Object.values(PathKind)).toEqual(['ORIGINAL', 'REAL', 'SCENARIO']);
  });
});

function breakdownOf(row: ScheduleRow | undefined): ActualPaymentBreakdown {
  if (row === undefined) {
    throw new Error('row missing');
  }
  const { capital, interest, insurance, fixedCharges } = row;
  return { capital, interest, insurance, fixedCharges };
}
