import { describe, expect, it } from 'vitest';
import { invalidInputCode, thrownBy } from '../../test/support/errors.ts';
import type { LocalDate } from '../types/primitives.ts';
import { parseLocalDate } from './local-date.ts';
import {
  alignToPaymentDay,
  assertFirstDueDateConsistent,
  dueDateFor,
  dueDates,
  dueDayOfMonth,
  installmentOnOrAfter,
  isFirstDueDateConsistent,
  parsePaymentDay,
} from './payment-day.ts';

const d = (value: string): LocalDate => parseLocalDate(value);

describe('parsePaymentDay', () => {
  it('accepts 1–31 and END_OF_MONTH', () => {
    expect(parsePaymentDay(1)).toBe(1);
    expect(parsePaymentDay(31)).toBe(31);
    expect(parsePaymentDay('END_OF_MONTH')).toBe('END_OF_MONTH');
  });

  it('rejects anything else', () => {
    for (const input of [0, 32, 15.5, '15', 'end_of_month', null]) {
      expect(invalidInputCode(() => parsePaymentDay(input))).toBe('INVALID_PAYMENT_DAY');
    }
  });
});

describe('[ALG.DATES] due day of a month', () => {
  it('END_OF_MONTH is the last day, leap years included', () => {
    expect(dueDayOfMonth(2028, 2, 'END_OF_MONTH')).toBe(29);
    expect(dueDayOfMonth(2027, 2, 'END_OF_MONTH')).toBe(28);
    expect(dueDayOfMonth(2027, 4, 'END_OF_MONTH')).toBe(30);
  });

  it('paymentDay d gives min(d, days in month): 31 in 30-day months and in February', () => {
    expect(dueDayOfMonth(2027, 4, 31)).toBe(30);
    expect(dueDayOfMonth(2027, 2, 31)).toBe(28);
    expect(dueDayOfMonth(2028, 2, 30)).toBe(29);
    expect(dueDayOfMonth(2027, 5, 31)).toBe(31);
    expect(dueDayOfMonth(2027, 3, 15)).toBe(15);
  });

  it('alignToPaymentDay re-derives the day within the same month (W4-07)', () => {
    expect(alignToPaymentDay(d('2027-03-15'), 'END_OF_MONTH')).toBe('2027-03-31');
    expect(alignToPaymentDay(d('2027-03-31'), 15)).toBe('2027-03-15');
    expect(alignToPaymentDay(d('2028-02-10'), 31)).toBe('2028-02-29');
  });
});

describe('[ALG.DATES] firstDueDate / paymentDay consistency', () => {
  it('rejects the invalid pairs of the spec', () => {
    expect(isFirstDueDateConsistent(d('2027-03-15'), 'END_OF_MONTH')).toBe(false);
    expect(isFirstDueDateConsistent(d('2027-03-10'), 15)).toBe(false);
    expect(invalidInputCode(() => assertFirstDueDateConsistent(d('2027-03-15'), 'END_OF_MONTH'))).toBe(
      'FIRST_DUE_DATE_MISMATCH',
    );
  });

  it('accepts valid pairs in leap and non-leap Februaries', () => {
    expect(isFirstDueDateConsistent(d('2028-02-29'), 'END_OF_MONTH')).toBe(true);
    expect(isFirstDueDateConsistent(d('2028-02-29'), 31)).toBe(true);
    expect(isFirstDueDateConsistent(d('2027-02-28'), 29)).toBe(true);
    expect(isFirstDueDateConsistent(d('2028-02-28'), 28)).toBe(true);
    expect(isFirstDueDateConsistent(d('2028-02-28'), 'END_OF_MONTH')).toBe(false);
    expect(invalidInputCode(() => assertFirstDueDateConsistent(d('2025-02-28'), 'END_OF_MONTH'))).toBe('NO_ERROR');
  });
});

describe('[ALG.DATES] due-date sequence', () => {
  const first = d('2025-02-28');

  it('reproduces the due dates of [ALG.EXAMPLE] (END_OF_MONTH)', () => {
    expect(dueDateFor(first, 'END_OF_MONTH', 1)).toBe('2025-02-28');
    expect(dueDateFor(first, 'END_OF_MONTH', 2)).toBe('2025-03-31');
    expect(dueDateFor(first, 'END_OF_MONTH', 3)).toBe('2025-04-30');
    expect(dueDateFor(first, 'END_OF_MONTH', 6)).toBe('2025-07-31');
    expect(dueDateFor(first, 'END_OF_MONTH', 12)).toBe('2026-01-31');
    expect(dueDateFor(first, 'END_OF_MONTH', 220)).toBe('2043-05-31');
    expect(dueDateFor(first, 'END_OF_MONTH', 234)).toBe('2044-07-31');
    expect(dueDateFor(first, 'END_OF_MONTH', 240)).toBe('2045-01-31');
  });

  it('crosses leap and non-leap Februaries with paymentDay 30 and 31', () => {
    expect(dueDates(d('2027-12-31'), 31, 4)).toEqual(['2027-12-31', '2028-01-31', '2028-02-29', '2028-03-31']);
    expect(dueDates(d('2026-12-30'), 30, 4)).toEqual(['2026-12-30', '2027-01-30', '2027-02-28', '2027-03-30']);
    expect(dueDates(d('2027-03-31'), 31, 3)).toEqual(['2027-03-31', '2027-04-30', '2027-05-31']);
    expect(dueDates(d('2027-12-31'), 'END_OF_MONTH', 3)).toEqual(['2027-12-31', '2028-01-31', '2028-02-29']);
    expect(dueDates(d('2027-03-15'), 15, 2)).toEqual(['2027-03-15', '2027-04-15']);
    expect(dueDates(first, 'END_OF_MONTH', 0)).toEqual([]);
  });

  it('rejects installment numbers below 1 and invalid counts', () => {
    expect(invalidInputCode(() => dueDateFor(first, 'END_OF_MONTH', 0))).toBe('INSTALLMENT_OUT_OF_RANGE');
    expect(invalidInputCode(() => dueDateFor(first, 'END_OF_MONTH', 1.5))).toBe('INSTALLMENT_OUT_OF_RANGE');
    expect(invalidInputCode(() => dueDates(first, 'END_OF_MONTH', -1))).toBe('INVALID_INTEGER');
    expect(invalidInputCode(() => dueDates(first, 'END_OF_MONTH', 2.5))).toBe('INVALID_INTEGER');
  });

  it('[ALG.ERRORS] the date validations carry the rule and k of the table', () => {
    expect(thrownBy(() => assertFirstDueDateConsistent(d('2027-03-15'), 'END_OF_MONTH'))).toMatchObject({
      name: 'InvalidInputError',
      rule: 'ALG.DATES',
      k: null,
    });
    expect(thrownBy(() => dueDateFor(first, 'END_OF_MONTH', 0))).toMatchObject({
      name: 'InvalidInputError',
      rule: 'ALG.EVENTS.ANCHOR',
      k: 0,
    });
  });
});

describe('[ALG.EVENTS.ANCHOR] installmentOnOrAfter', () => {
  it('maps an event date to the first installment due on or after it', () => {
    expect(installmentOnOrAfter(d('2025-02-28'), 'END_OF_MONTH', d('2026-01-15'))).toBe(12);
    expect(installmentOnOrAfter(d('2025-02-28'), 'END_OF_MONTH', d('2026-01-31'))).toBe(12);
    expect(installmentOnOrAfter(d('2025-02-28'), 'END_OF_MONTH', d('2026-02-01'))).toBe(13);
  });

  it('with paymentDay 15, the 20th maps to the next month and the 15th to the same month', () => {
    expect(installmentOnOrAfter(d('2027-03-15'), 15, d('2027-05-20'))).toBe(4);
    expect(installmentOnOrAfter(d('2027-03-15'), 15, d('2027-05-15'))).toBe(3);
  });

  it('dates before the first due date map to installment 1', () => {
    expect(installmentOnOrAfter(d('2027-03-15'), 15, d('2027-03-01'))).toBe(1);
    expect(installmentOnOrAfter(d('2027-03-15'), 15, d('2026-11-30'))).toBe(1);
  });
});
