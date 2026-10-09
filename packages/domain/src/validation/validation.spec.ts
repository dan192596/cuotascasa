import { describe, expect, it } from 'vitest';
import { thrownBy } from '../../test/support/errors.ts';
import { createEngineContext } from '../engine-context.ts';
import * as api from '../index.ts';
import { moneyAdd, moneySub, parseMoney } from '../money/index.ts';
import { buildSchedule } from '../schedule/index.ts';
import { actualPayment, recordingContext, reported, shortTerms } from '../schedule/testing/builders.ts';
import type { EngineContext } from '../types/engine.ts';
import { InvalidInputError, type Money } from '../types/primitives.ts';
import type { TemplateValidationRequest } from '../types/schedule.ts';
import { loadValidationExampleCases } from './testing/examples.ts';
import { validateAgainstReportedBalance } from './index.ts';

/**
 * Contexto de prueba con un handler de `ReportedBalance` que re-ancla la apertura de k ([ALG.ANCHOR]) sin depender del
 * handler real (W2-03/04/05). `log` anota `<id>@<k>` de cada evento que llega a un handler.
 */
function anchoringContext(log: string[] = []): EngineContext {
  const recording = recordingContext(log, {
    ReportedBalance: (input) => {
      log.push(`${input.event.id}@${String(input.k)}`);
      return { state: { ...input.state, balance: input.event.balance } };
    },
  });
  return createEngineContext({ registry: recording.registry });
}

const cases = loadValidationExampleCases();

describe('ex12 validation examples, to the cent', () => {
  it.each(cases.map((item) => [item.id, item] as const))('%s', (_name, item) => {
    const request: TemplateValidationRequest = {
      terms: item.terms,
      realEvents: item.realEvents,
      reported: item.reported,
    };
    const { error } = item.expected;
    if (error !== undefined) {
      const thrown = thrownBy(() => validateAgainstReportedBalance(request, anchoringContext()));
      expect(thrown).toBeInstanceOf(InvalidInputError);
      const invalid = thrown as InvalidInputError;
      expect(invalid.name).toBe(error.type);
      expect(invalid.code).toBe('INSTALLMENT_OUT_OF_RANGE');
      expect(invalid.rule).toBe(error.rule);
      expect(invalid.details.k).toBe(error.k);
      return;
    }
    const result = validateAgainstReportedBalance(request, anchoringContext());
    expect(result).toEqual({
      k: item.expected.k,
      reported: item.expected.reported,
      modeled: item.expected.modeled,
      realDelta: item.expected.realDelta,
      status: item.expected.status,
      cause: item.expected.cause,
    });
  });

  it('covers all ten ex12 cases', () => {
    expect(cases).toHaveLength(10);
  });
});

describe('semaphore boundaries [ALG.VALIDATE]', () => {
  // 12 cuotas desde 2026-01-31; la cuota 5 vence el 2026-05-31.
  const terms = shortTerms();
  const ctx = createEngineContext();
  const k = 5;
  const modeledOpening = (): Money => (buildSchedule(terms, [], ctx).rows[k - 1] as { opening: Money }).opening;

  function run(delta: string, explicit: boolean, balanceOverride?: Money) {
    const modeled = modeledOpening();
    const balance =
      balanceOverride ??
      (delta.startsWith('-') ? moneySub(modeled, parseMoney(delta.slice(1))) : moneyAdd(modeled, parseMoney(delta)));
    return validateAgainstReportedBalance(
      { terms, realEvents: [], reported: reported('rb', '2026-05-20', balance, explicit ? k : undefined) },
      ctx,
    );
  }

  it.each([false, true])('GREEN up to |Δ| = 1.00 and AMBER from 1.01 (installmentNumber: %s)', (explicit) => {
    expect(run('0.00', explicit)).toMatchObject({ status: 'GREEN', cause: null, realDelta: '0.00', k });
    expect(run('1.00', explicit)).toMatchObject({ status: 'GREEN', cause: null, realDelta: '1.00' });
    expect(run('-1.00', explicit)).toMatchObject({ status: 'GREEN', cause: null, realDelta: '-1.00' });
    expect(run('1.01', explicit)).toMatchObject({ status: 'AMBER', cause: 'UNKNOWN' });
    expect(run('-1.01', explicit)).toMatchObject({ status: 'AMBER', cause: 'UNKNOWN' });
  });

  it.each([false, true])('AMBER limit is 50.00 for a low balance (installmentNumber: %s)', (explicit) => {
    expect(Number(modeledOpening())).toBeLessThan(250000);
    expect(run('50.00', explicit)).toMatchObject({ status: 'AMBER', cause: 'UNKNOWN' });
    expect(run('-50.00', explicit)).toMatchObject({ status: 'AMBER', cause: 'UNKNOWN' });
    expect(run('50.01', explicit)).toMatchObject({ status: 'RED', cause: 'UNKNOWN' });
    expect(run('-50.01', explicit)).toMatchObject({ status: 'RED', cause: 'UNKNOWN' });
  });

  // k = 1: la apertura modelada es el principal, así que el saldo reportado fija Δ exacto.
  const atFirstInstallment = (principal: string, balance: string) =>
    validateAgainstReportedBalance(
      {
        terms: shortTerms({ principal: parseMoney(principal) }),
        realEvents: [],
        reported: reported('rb', '2026-01-10', balance, 1),
      },
      ctx,
    );

  it.each([
    // [modeled, Br, status]: 0.0002 * Br = 50.00 exactly at Br = 250000.00
    ['249950.00', '250000.00', 'AMBER'],
    ['249950.00', '250000.01', 'RED'],
    ['249900.00', '249950.00', 'AMBER'],
    ['249900.00', '249950.01', 'RED'],
    // Br above 250000.00: the limit grows (0.0002 * 250150.02 = 50.030004, not rounded)
    ['250100.00', '250150.02', 'AMBER'],
    ['250100.00', '250150.04', 'RED'],
    ['250100.00', '250150.03', 'AMBER'],
    // Large balance: 0.0002 * 1000200.04 = 200.040008
    ['1000000.00', '1000200.04', 'AMBER'],
    ['1000000.00', '1000200.05', 'RED'],
  ])('modeled %s, reported %s is %s', (modeled, balance, status) => {
    expect(atFirstInstallment(modeled, balance)).toMatchObject({ k: 1, modeled, status });
  });

  it('negative differences use the same limits', () => {
    expect(atFirstInstallment('250100.00', '250049.98')).toMatchObject({ status: 'RED', realDelta: '-50.02' });
    expect(atFirstInstallment('250100.00', '250050.02')).toMatchObject({ status: 'AMBER', realDelta: '-49.98' });
  });
});

describe('k and range', () => {
  const terms = shortTerms();
  const ctx = createEngineContext();

  it('k comes from the date when installmentNumber is missing, and installmentNumber wins when present', () => {
    const modeled = buildSchedule(terms, [], ctx).rows;
    const byDate = validateAgainstReportedBalance(
      { terms, realEvents: [], reported: reported('rb', '2026-03-10', (modeled[2] as { opening: Money }).opening) },
      ctx,
    );
    expect(byDate.k).toBe(3);
    const explicit = validateAgainstReportedBalance(
      { terms, realEvents: [], reported: reported('rb', '2026-03-10', (modeled[6] as { opening: Money }).opening, 7) },
      ctx,
    );
    expect(explicit.k).toBe(7);
    expect(explicit.status).toBe('GREEN');
  });

  it('k = 1 is valid (opening is the principal) and the last installment is valid', () => {
    expect(
      validateAgainstReportedBalance({ terms, realEvents: [], reported: reported('rb', '2026-01-10', '1200.00') }, ctx),
    ).toMatchObject({ k: 1, status: 'GREEN', modeled: '1200.00' });
    const last = buildSchedule(terms, [], ctx).rows.at(-1) as { opening: Money; k: number };
    expect(
      validateAgainstReportedBalance(
        { terms, realEvents: [], reported: reported('rb', '2026-12-31', last.opening, 12) },
        ctx,
      ),
    ).toMatchObject({ k: 12, status: 'GREEN' });
  });

  it.each([
    ['after the last installment by number', reported('rb', '2026-12-31', '10.00', 13), 13],
    ['after the last installment by date', reported('rb', '2027-02-10', '10.00'), 14],
    ['installmentNumber 0', reported('rb', '2026-12-31', '10.00', 0), 0],
    ['negative installmentNumber', reported('rb', '2026-12-31', '10.00', -3), -3],
  ])('throws INSTALLMENT_OUT_OF_RANGE with details.k (%s)', (_name, event, expectedK) => {
    const thrown = thrownBy(() => validateAgainstReportedBalance({ terms, realEvents: [], reported: event }, ctx));
    expect(thrown).toBeInstanceOf(InvalidInputError);
    expect((thrown as InvalidInputError).code).toBe('INSTALLMENT_OUT_OF_RANGE');
    expect((thrown as InvalidInputError).rule).toBe('ALG.EVENTS.ANCHOR');
    expect((thrown as InvalidInputError).details.k).toBe(expectedK);
  });

  it('a non-integer installmentNumber is INVALID_EVENT', () => {
    const thrown = thrownBy(() =>
      validateAgainstReportedBalance(
        { terms, realEvents: [], reported: reported('rb', '2026-05-20', '10.00', 2.5) },
        ctx,
      ),
    );
    expect((thrown as InvalidInputError).code).toBe('INVALID_EVENT');
  });
});

describe('cause [ALG.VALIDATE]', () => {
  const terms = shortTerms();
  const ctx = createEngineContext();
  const rows = buildSchedule(terms, [], ctx).rows;
  const opening = (k: number): Money => (rows[k - 1] as { opening: Money }).opening;
  const validate = (k: number, balance: Money) =>
    validateAgainstReportedBalance({ terms, realEvents: [], reported: reported('rb', '2026-01-10', balance, k) }, ctx);

  it('INSTALLMENT_MISALIGNMENT when Br is within 1.00 of the opening of k-1 or k+1 (inclusive)', () => {
    expect(validate(5, moneyAdd(opening(4), parseMoney('1.00')))).toMatchObject({ cause: 'INSTALLMENT_MISALIGNMENT' });
    expect(validate(5, moneySub(opening(4), parseMoney('1.00')))).toMatchObject({ cause: 'INSTALLMENT_MISALIGNMENT' });
    expect(validate(5, moneyAdd(opening(6), parseMoney('1.00')))).toMatchObject({ cause: 'INSTALLMENT_MISALIGNMENT' });
    expect(validate(5, moneySub(opening(6), parseMoney('1.00')))).toMatchObject({ cause: 'INSTALLMENT_MISALIGNMENT' });
  });

  it('UNKNOWN when Br is further than 1.00 from both neighbours', () => {
    expect(validate(5, moneyAdd(opening(4), parseMoney('1.01')))).toMatchObject({ cause: 'UNKNOWN' });
    expect(validate(5, moneySub(opening(6), parseMoney('1.01')))).toMatchObject({ cause: 'UNKNOWN' });
  });

  it('no cause when GREEN, even if a neighbour is close', () => {
    expect(validate(5, opening(5))).toMatchObject({ status: 'GREEN', cause: null });
  });

  it('k = 1 has no previous opening and the last installment has no next one', () => {
    const lastK = rows.length;
    // Br en el cierre de la última cuota (0.00) no es "apertura de k+1": no existe.
    expect(validate(lastK, parseMoney('0.00'))).toMatchObject({ cause: 'UNKNOWN' });
    expect(validate(1, moneyAdd(opening(2), parseMoney('0.50')))).toMatchObject({ cause: 'INSTALLMENT_MISALIGNMENT' });
  });
});

describe("modeled path keeps only anchors with k' < k and inherits the other real events", () => {
  const terms = shortTerms();

  it('excludes anchors of the same k and later, keeps earlier ones and non-anchor events', () => {
    const log: string[] = [];
    const ctx = anchoringContext(log);
    const result = validateAgainstReportedBalance(
      {
        terms,
        realEvents: [
          reported('rb2', '2026-02-10', '1000.00'),
          reported('rb5', '2026-05-10', '700.00'),
          reported('rb5b', '2026-05-20', '650.00', 5),
          reported('rb8', '2026-08-10', '400.00'),
          actualPayment('ap1', '2026-02-15', 1),
        ],
        reported: reported('rb-v', '2026-05-25', '690.00'),
      },
      ctx,
    );
    expect(result.k).toBe(5);
    expect([...log].sort()).toEqual(['ap1@1', 'rb2@2'].sort());
  });

  it('modeled equals the opening of k in the re-anchored schedule and realDelta = reported - modeled', () => {
    const ctx = anchoringContext();
    const events = [reported('rb2', '2026-02-10', '1000.00')];
    const expectedModeled = (buildSchedule(terms, [], ctx, { inheritedEvents: events }).rows[4] as { opening: Money })
      .opening;
    const result = validateAgainstReportedBalance(
      { terms, realEvents: events, reported: reported('rb-v', '2026-05-25', '690.00') },
      ctx,
    );
    expect(result.modeled).toBe(expectedModeled);
    expect(result.realDelta).toBe(moneySub(parseMoney('690.00'), expectedModeled));
  });

  it('the anchor with k equal to the explicit installmentNumber of the reported one is excluded', () => {
    const log: string[] = [];
    validateAgainstReportedBalance(
      {
        terms,
        realEvents: [reported('rbDate', '2026-05-10', '700.00'), reported('rbEarly', '2026-02-10', '1000.00', 2)],
        reported: reported('rb-v', '2026-01-01', '690.00', 5),
      },
      anchoringContext(log),
    );
    expect(log).toEqual(['rbEarly@2']);
  });

  it('does not mutate the request', () => {
    const events = [reported('rb2', '2026-02-10', '1000.00'), reported('rb9', '2026-09-10', '100.00')];
    const request: TemplateValidationRequest = {
      terms,
      realEvents: events,
      reported: reported('rb-v', '2026-05-25', '690.00'),
    };
    const snapshot = JSON.stringify(request);
    validateAgainstReportedBalance(request, anchoringContext());
    expect(JSON.stringify(request)).toBe(snapshot);
  });
});

describe('public API', () => {
  it('forwards validateAgainstReportedBalance', () => {
    const terms = shortTerms();
    const request: TemplateValidationRequest = {
      terms,
      realEvents: [],
      reported: reported('rb', '2026-01-10', '1200.00'),
    };
    expect(api.validateAgainstReportedBalance(request)).toEqual(
      validateAgainstReportedBalance(request, createEngineContext()),
    );
  });
});
