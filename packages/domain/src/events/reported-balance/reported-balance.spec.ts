import { describe, expect, it } from 'vitest';
import { thrownBy } from '../../../test/support/errors.ts';
import { parseMoney, parseRate } from '../../money/index.ts';
import { reported, shortTerms } from '../../schedule/testing/builders.ts';
import { createEngineContext } from '../../engine-context.ts';
import { buildSchedule, runSchedule } from '../../schedule/index.ts';
import type { HandlerInput, PeriodState } from '../../types/engine.ts';
import { InvalidInputError } from '../../types/primitives.ts';
import { reportedBalanceHandler } from './index.ts';

const m = parseMoney;
const ctx = createEngineContext();

describe('reportedBalanceHandler ([ALG.ANCHOR], phase 0)', () => {
  const state: PeriodState = {
    balance: m('900.00'),
    interestRate: parseRate('0.12'),
    insuranceRates: [parseRate('0.01')],
    level: m('107.00'),
    roundingProfile: 'FHA_GT_V1',
    k: 3,
    termMode: 'FIXED',
    term: 12,
  };

  function input(balance: string, projectedOpening: string): HandlerInput<ReturnType<typeof reported>> {
    return {
      ctx,
      terms: shortTerms(),
      event: reported('rb', '2026-05-31', balance),
      k: 4,
      state,
      projectedOpening: m(projectedOpening),
      fixedCharges: [],
      row: null,
    };
  }

  it('re-anchors the opening balance and leaves level, term and term mode untouched', () => {
    const result = reportedBalanceHandler(input('880.00', '900.00'));
    expect(result.state).toEqual({ ...state, balance: m('880.00') });
  });

  it('reports realDelta = reported - projected opening, positive when the bank balance is higher', () => {
    expect(reportedBalanceHandler(input('880.00', '900.00')).anchorDelta).toEqual({
      eventId: 'rb',
      k: 4,
      reported: '880.00',
      projected: '900.00',
      realDelta: '-20.00',
    });
    expect(reportedBalanceHandler(input('910.50', '900.00')).anchorDelta?.realDelta).toBe('10.50');
  });

  it('computes the delta against the projected opening, not against the already re-anchored state balance', () => {
    const reAnchored = { ...input('880.00', '900.00'), state: { ...state, balance: m('700.00') } };
    expect(reportedBalanceHandler(reAnchored).anchorDelta).toMatchObject({ projected: '900.00', realDelta: '-20.00' });
  });
});

describe('ReportedBalance inside the period loop', () => {
  const terms = shortTerms();
  const plain = buildSchedule(terms, [], ctx);

  it('re-anchors row k and exposes the delta against the projected opening of the real path', () => {
    const run = runSchedule(terms, [reported('rb', '2026-04-30', '800.00')], ctx);
    const row4 = run.schedule.rows[3];
    expect(row4?.k).toBe(4);
    expect(row4?.opening).toBe('800.00');
    expect(run.schedule.rows.slice(0, 3)).toEqual(plain.rows.slice(0, 3));
    expect(run.realDelta.perAnchor).toEqual([
      {
        eventId: 'rb',
        k: 4,
        reported: '800.00',
        projected: plain.rows[3]?.opening,
        realDelta: expect.stringMatching(/^-?\d+\.\d{2}$/),
      },
    ]);
    // level is kept, so the later rows still use the original level
    expect(run.schedule.rows[4]?.level).toBe(plain.rows[4]?.level);
  });

  it('an anchor equal to the projection has a zero delta', () => {
    const run = runSchedule(terms, [reported('rb', '2026-04-30', plain.rows[3]?.opening ?? '0.00')], ctx);
    expect(run.realDelta.perAnchor[0]?.realDelta).toBe('0.00');
    expect(run.schedule.rows).toEqual(plain.rows);
  });

  it('two anchors in the same k both report against the same projected opening; the latest date re-anchors', () => {
    const run = runSchedule(
      terms,
      [reported('rb-late', '2026-04-30', '700.00'), reported('rb-early', '2026-04-10', '800.00')],
      ctx,
    );
    expect(run.realDelta.perAnchor.map((d) => [d.eventId, d.reported])).toEqual([
      ['rb-early', '800.00'],
      ['rb-late', '700.00'],
    ]);
    const projected = plain.rows[3]?.opening;
    expect(run.realDelta.perAnchor.map((d) => d.projected)).toEqual([projected, projected]);
    expect(run.schedule.rows[3]?.opening).toBe('700.00');
  });

  it('on the same date the greater id re-anchors', () => {
    const run = runSchedule(
      terms,
      [reported('rb-b', '2026-04-20', '700.00'), reported('rb-a', '2026-04-20', '800.00')],
      ctx,
    );
    expect(run.realDelta.perAnchor.map((d) => d.eventId)).toEqual(['rb-a', 'rb-b']);
    expect(run.schedule.rows[3]?.opening).toBe('700.00');
  });

  it('an explicit installmentNumber wins over the installment of its date', () => {
    const run = runSchedule(terms, [reported('rb', '2026-04-30', '800.00', 7)], ctx);
    expect(run.realDelta.perAnchor[0]?.k).toBe(7);
    expect(run.schedule.rows[6]?.opening).toBe('800.00');
    expect(run.schedule.rows[3]).toEqual(plain.rows[3]);
  });

  it('without installmentNumber the anchor goes to the first installment due on or after its date', () => {
    const run = runSchedule(terms, [reported('rb', '2026-04-01', '800.00')], ctx);
    expect(run.realDelta.perAnchor[0]?.k).toBe(4);
    const exact = runSchedule(terms, [reported('rb', '2026-04-30', '800.00')], ctx);
    expect(exact.realDelta.perAnchor[0]?.k).toBe(4);
  });

  it('installmentNumber below 1 or after the last installment throws InvalidInputError with the k', () => {
    for (const [number, code] of [
      [0, 'INSTALLMENT_OUT_OF_RANGE'],
      [13, 'INSTALLMENT_OUT_OF_RANGE'],
    ] as const) {
      const error = thrownBy(() => buildSchedule(terms, [reported('rb', '2026-04-30', '800.00', number)], ctx));
      expect(error).toBeInstanceOf(InvalidInputError);
      expect(error).toMatchObject({ code, k: number });
    }
  });

  it('a date after the last installment, without installmentNumber, throws', () => {
    const error = thrownBy(() => buildSchedule(terms, [reported('rb', '2027-03-15', '800.00')], ctx));
    expect(error).toMatchObject({ code: 'INSTALLMENT_OUT_OF_RANGE', k: 15 });
  });

  it('inherited anchors are not re-checked: an out-of-range one is simply not applied', () => {
    const out = reported('rb', '2027-03-15', '800.00');
    const schedule = buildSchedule(terms, [], ctx, { inheritedEvents: [out] });
    expect(schedule).toEqual(plain);
    const outNumber = reported('rb2', '2026-04-30', '800.00', 99);
    expect(buildSchedule(terms, [], ctx, { inheritedEvents: [outNumber] })).toEqual(plain);
  });

  it('a lower balance with fixed term settles early on the row computed by [ALG.LAST]', () => {
    const run = runSchedule(terms, [reported('rb', '2026-04-30', '100.00')], ctx);
    expect(run.schedule.installmentCount).toBeLessThan(12);
    expect(run.schedule.rows.at(-1)?.closing).toBe('0.00');
  });
});
