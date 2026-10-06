import { describe, expect, it } from 'vitest';
import { invalidInputCode } from '../../test/support/errors.ts';
import type { LocalDate } from '../types/primitives.ts';
import {
  addMonths,
  compareLocalDate,
  daysInMonth,
  endOfMonth,
  fromMonthIndex,
  isLeapYear,
  isLocalDate,
  localDateParts,
  makeLocalDate,
  monthIndex,
  parseLocalDate,
} from './local-date.ts';

const d = (value: string): LocalDate => parseLocalDate(value);

describe('isLeapYear / daysInMonth', () => {
  it('follows the Gregorian rules', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it('counts the days of every kind of month', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2025, 4)).toBe(30);
    expect(daysInMonth(2025, 6)).toBe(30);
    expect(daysInMonth(2025, 9)).toBe(30);
    expect(daysInMonth(2025, 11)).toBe(30);
    expect(daysInMonth(2025, 1)).toBe(31);
    expect(daysInMonth(2025, 12)).toBe(31);
  });

  it('rejects months outside 1–12', () => {
    expect(invalidInputCode(() => daysInMonth(2025, 0))).toBe('INVALID_DATE');
    expect(invalidInputCode(() => daysInMonth(2025, 13))).toBe('INVALID_DATE');
    expect(invalidInputCode(() => daysInMonth(2025, 1.5))).toBe('INVALID_DATE');
  });
});

describe('parseLocalDate / makeLocalDate', () => {
  it('accepts real calendar dates, including leap days', () => {
    expect(parseLocalDate('2025-02-28')).toBe('2025-02-28');
    expect(parseLocalDate('2024-02-29')).toBe('2024-02-29');
    expect(parseLocalDate('0001-01-01')).toBe('0001-01-01');
    expect(parseLocalDate('9999-12-31')).toBe('9999-12-31');
    expect(makeLocalDate(2027, 3, 5)).toBe('2027-03-05');
  });

  it('rejects impossible dates, other formats and non-strings', () => {
    for (const input of [
      '2025-02-29',
      '2027-02-31',
      '2025-04-31',
      '2025-13-01',
      '2025-00-10',
      '2025-01-00',
      '0000-01-01',
      '2025-4-1',
      '25-04-01',
      '2025/04/01',
      '01/04/2025',
      '2025-04-01T00:00:00Z',
      ' 2025-04-01',
      '',
      20250401,
      null,
    ]) {
      expect(invalidInputCode(() => parseLocalDate(input))).toBe('INVALID_DATE');
    }
  });

  it('makeLocalDate validates every part', () => {
    expect(invalidInputCode(() => makeLocalDate(2025.5, 1, 1))).toBe('INVALID_DATE');
    expect(invalidInputCode(() => makeLocalDate(0, 1, 1))).toBe('INVALID_DATE');
    expect(invalidInputCode(() => makeLocalDate(10000, 1, 1))).toBe('INVALID_DATE');
    expect(invalidInputCode(() => makeLocalDate(2025, 1, 1.5))).toBe('INVALID_DATE');
    expect(invalidInputCode(() => makeLocalDate(2025, 1, 0))).toBe('INVALID_DATE');
    expect(invalidInputCode(() => makeLocalDate(2025, 2, 29))).toBe('INVALID_DATE');
  });

  it('isLocalDate reports validity without throwing', () => {
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('2027-02-29')).toBe(false);
    expect(isLocalDate(20280229)).toBe(false);
  });
});

describe('parts, comparison and month index', () => {
  it('splits a date into numeric parts', () => {
    expect(localDateParts(d('2045-01-31'))).toEqual({ year: 2045, month: 1, day: 31 });
  });

  it('compares in calendar order', () => {
    expect(compareLocalDate(d('2025-02-28'), d('2025-03-01'))).toBe(-1);
    expect(compareLocalDate(d('2026-01-01'), d('2025-12-31'))).toBe(1);
    expect(compareLocalDate(d('2026-01-31'), d('2026-01-31'))).toBe(0);
  });

  it('counts whole months with the 30/360 month index', () => {
    expect(monthIndex(d('2025-02-28'))).toBe(2025 * 12 + 1);
    expect(monthIndex(d('2045-01-31')) - monthIndex(d('2025-02-28'))).toBe(239);
  });

  it('inverts the month index', () => {
    expect(fromMonthIndex(monthIndex(d('2045-01-31')))).toEqual({ year: 2045, month: 1 });
    expect(fromMonthIndex(2025 * 12 + 11)).toEqual({ year: 2025, month: 12 });
  });

  it('finds the last day of the month', () => {
    expect(endOfMonth(d('2028-02-10'))).toBe('2028-02-29');
    expect(endOfMonth(d('2027-04-01'))).toBe('2027-04-30');
  });
});

describe('addMonths', () => {
  it('clamps to the end of shorter months: Jan-31 + 1 = Feb-28/29', () => {
    expect(addMonths(d('2025-01-31'), 1)).toBe('2025-02-28');
    expect(addMonths(d('2024-01-31'), 1)).toBe('2024-02-29');
    expect(addMonths(d('2025-03-31'), 1)).toBe('2025-04-30');
    expect(addMonths(d('2025-01-31'), 2)).toBe('2025-03-31');
  });

  it('crosses year boundaries in both directions', () => {
    expect(addMonths(d('2025-02-28'), 11)).toBe('2026-01-28');
    expect(addMonths(d('2025-12-15'), 1)).toBe('2026-01-15');
    expect(addMonths(d('2025-03-31'), -1)).toBe('2025-02-28');
    expect(addMonths(d('2025-01-15'), -1)).toBe('2024-12-15');
    expect(addMonths(d('2025-01-15'), 0)).toBe('2025-01-15');
  });

  it('rejects non-integer offsets and results outside years 1–9999', () => {
    expect(invalidInputCode(() => addMonths(d('2025-01-15'), 1.5))).toBe('INVALID_INTEGER');
    expect(invalidInputCode(() => addMonths(d('9999-12-01'), 1))).toBe('INVALID_DATE');
    expect(invalidInputCode(() => addMonths(d('0001-01-01'), -1))).toBe('INVALID_DATE');
  });
});
