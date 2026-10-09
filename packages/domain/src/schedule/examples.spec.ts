import { describe, expect, it } from 'vitest';
import { thrownBy } from '../../test/support/errors.ts';
import { createEngineContext } from '../engine-context.ts';
import { InvalidInputError } from '../types/primitives.ts';
import type { ScheduleRow } from '../types/schedule.ts';
import { buildSchedule, yearlySubtotals } from './index.ts';
import { type ExampleCase, loadCoreExampleCases } from './testing/examples.ts';

const cases = loadCoreExampleCases();
const ctx = createEngineContext();

function columns(row: ScheduleRow, expectedKeys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(expectedKeys.map((key) => [key, row[key as keyof ScheduleRow]]));
}

describe('core algorithm examples (no events), every column to the cent', () => {
  it('finds every core example file', () => {
    expect(new Set(cases.map((item) => item.file))).toEqual(
      new Set([
        'ex00-base-fha.json',
        'ex01-simple-two-components.json',
        'ex02-payment-days.json',
        'ex05a-fixed-charge-effective-from.json',
        'ex13a-yearly-subtotals.json',
        'ex14-zero-rates.json',
        'ex15-due-date-consistency.json',
        'ex17-fha-half-cent-tie.json',
      ]),
    );
  });

  const expectingSchedule = cases.filter(
    (item): item is ExampleCase & { expected: NonNullable<ExampleCase['expected']> } => item.expected !== null,
  );
  const expectingError = cases.filter((item) => item.error !== null);

  it.each(expectingSchedule.map((item) => [`${item.file} / ${item.id}`, item] as const))('%s', (_name, item) => {
    const schedule = buildSchedule(item.terms, [], ctx);
    const { expected } = item;
    expect(schedule.currency).toBe(item.terms.currency);
    expect(schedule.roundingProfile).toBe(item.terms.roundingProfile);
    expect(schedule.installmentCount).toBe(expected.installmentCount);
    expect(schedule.rows).toHaveLength(expected.installmentCount);
    expect(schedule.endDate).toBe(expected.endDate);
    expect(schedule.totals).toEqual(expected.totals);
    for (const expectedRow of expected.rows) {
      const actual = schedule.rows[expectedRow.k - 1];
      expect(actual).toBeDefined();
      expect(columns(actual as ScheduleRow, Object.keys(expectedRow))).toEqual(expectedRow);
    }
    const last = schedule.rows[schedule.rows.length - 1] as ScheduleRow;
    expect(last.isLast).toBe(true);
    expect(last.closing).toBe('0.00');
    expect(schedule.rows.filter((row) => row.isLast)).toHaveLength(1);
    if (expected.yearly !== undefined) {
      expect(yearlySubtotals(schedule)).toEqual(expected.yearly);
    }
  });

  it.each(expectingError.map((item) => [`${item.file} / ${item.id}`, item] as const))('%s throws', (_name, item) => {
    const error = thrownBy(() => buildSchedule(item.terms, [], ctx));
    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error).toMatchObject({ name: item.error?.type, rule: item.error?.rule });
  });
});
