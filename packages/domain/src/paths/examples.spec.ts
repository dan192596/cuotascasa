import { describe, expect, it } from 'vitest';
import { thrownBy } from '../../test/support/errors.ts';
import { createEngineContext } from '../engine-context.ts';
import { buildSchedule, runSchedule, yearlySubtotals } from '../schedule/index.ts';
import { isStubHandler } from '../stub.ts';
import type { EngineContext } from '../types/engine.ts';
import type { HypotheticalEvent } from '../types/events.ts';
import { DomainError, InvalidInputError, NegativeAmortizationError } from '../types/primitives.ts';
import type { Schedule, ScheduleRow } from '../types/schedule.ts';
import { buildPaths, compareSchedules } from './index.ts';
import { type EventExampleCase, loadEventExampleCases, type RawExpected } from './testing/examples.ts';
import { withTestHandlers } from './testing/handlers.ts';

const realContext = createEngineContext();
const ctx = withTestHandlers(realContext);
const cases = loadEventExampleCases();

/**
 * Un caso se ejecuta si cada evento tiene handler real o, si aún es stub de W2-03/W2-04, uno de prueba que cubra su
 * forma (abono `REDUCE_TERM`, cambio de tasa `RECALC_INSTALLMENT_KEEP_TERM`). Si no, se omite hasta que
 * esas tarjetas se fusionen.
 */
function runnable(item: EventExampleCase): boolean {
  const events = [...item.events, ...item.realEvents, ...(item.scenarioEvents ?? [])];
  return events.every((event) => {
    if (!isStubHandler(realContext.registry[event.type])) {
      return true;
    }
    if (event.type === 'Prepayment') {
      return event.mode === 'REDUCE_TERM';
    }
    return event.type === 'RateChange' && event.policy === 'RECALC_INSTALLMENT_KEEP_TERM';
  });
}

function subset(row: ScheduleRow, expectedRow: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(expectedRow).map((key) => [key, row[key as keyof ScheduleRow]]));
}

function expectSchedule(actual: Schedule, expected: RawExpected): void {
  expect(actual.installmentCount).toBe(expected.installmentCount);
  expect(actual.rows).toHaveLength(expected.installmentCount ?? -1);
  expect(actual.endDate).toBe(expected.endDate);
  expect(actual.totals).toEqual(expected.totals);
  for (const expectedRow of expected.rows ?? []) {
    const row = actual.rows[(expectedRow['k'] as number) - 1];
    expect(row).toBeDefined();
    expect(subset(row as ScheduleRow, expectedRow)).toEqual(expectedRow);
  }
  if (expected.yearly !== undefined) {
    expect(yearlySubtotals(actual)).toEqual(expected.yearly);
  }
}

function expectError(error: unknown, expected: NonNullable<RawExpected['error']>): void {
  expect(error).toBeInstanceOf(DomainError);
  expect(error).toMatchObject({ name: expected.type, rule: expected.rule });
  if (expected.k !== undefined) {
    const k = error instanceof NegativeAmortizationError ? error.k : (error as InvalidInputError).details.k;
    expect(k).toBe(expected.k);
  }
}

function checkSchedule(item: EventExampleCase, engine: EngineContext): void {
  const { expected } = item;
  if (expected.error !== undefined) {
    expectError(
      thrownBy(() => buildSchedule(item.terms, item.events, engine)),
      expected.error,
    );
    return;
  }
  const run = runSchedule(item.terms, item.events, engine);
  expectSchedule(run.schedule, expected);
  if (expected.realDelta !== undefined) {
    expect(run.realDelta).toEqual(expected.realDelta);
  }
  if (expected.comparedToNoEvents !== undefined) {
    const withoutEvents = buildSchedule(item.terms, [], engine);
    expect(compareSchedules(withoutEvents, run.schedule)).toEqual(expected.comparedToNoEvents);
  }
}

function checkPaths(item: EventExampleCase, engine: EngineContext): void {
  const { expected } = item;
  const input = {
    terms: item.terms,
    realEvents: item.realEvents,
    scenarioEvents: item.scenarioEvents as readonly HypotheticalEvent[] | null,
  };
  if (expected.error !== undefined) {
    expectError(
      thrownBy(() => buildPaths(input, engine)),
      expected.error,
    );
    return;
  }
  const paths = buildPaths(input, engine);
  expect(paths.cutoffK).toBe(expected.cutoffK);
  expectSchedule(paths.original, expected.original ?? {});
  expectSchedule(paths.real, expected.real ?? {});
  expect(paths.scenario).not.toBeNull();
  expectSchedule(paths.scenario as Schedule, expected.scenario ?? {});
  expect(paths.realDelta).toEqual(expected.realDelta);
  expect(compareSchedules(paths.real, paths.scenario as Schedule)).toEqual(expected.metrics);
}

describe('anchor, actual payment, cutoff and metrics examples (docs/specs/algorithm-examples), to the cent', () => {
  it('loads every case of the card families', () => {
    expect(new Set(cases.map((item) => item.file)).size).toBe(7);
    expect(cases.length).toBeGreaterThanOrEqual(18);
  });

  for (const item of cases) {
    const name = `${item.file} / ${item.id}`;
    const test = runnable(item) ? it : it.skip;
    test(name, () => {
      if (item.operation === 'buildSchedule') {
        checkSchedule(item, ctx);
      } else {
        checkPaths(item, ctx);
      }
    });
  }
});

describe('example coverage guard', () => {
  it('no example case is skipped once no stubs remain', () => {
    const stubs = Object.values(realContext.registry).some(isStubHandler);
    if (!stubs) {
      expect(cases.filter((item) => !runnable(item)).map((item) => item.id)).toEqual([]);
    }
  });
});

describe('own error behavior of the example cases', () => {
  it('the late-payment case marks rows 4 and 5 as paid and nothing else', () => {
    const late = cases.find((item) => item.id === 'late-payment');
    const schedule = buildSchedule(late?.terms as never, late?.events ?? [], ctx);
    expect(schedule.rows.filter((row) => row.paid).map((row) => row.k)).toEqual([4, 5]);
  });

  it('an ActualPayment without installmentNumber is a typed validation error', () => {
    const missing = cases.find((item) => item.id === 'missing-installment-number');
    const error = thrownBy(() => buildSchedule(missing?.terms as never, missing?.events ?? [], ctx));
    expect(error).toBeInstanceOf(InvalidInputError);
  });
});
