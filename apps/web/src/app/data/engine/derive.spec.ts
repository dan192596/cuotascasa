import { CurrencyMismatchError, type LocalDate, type Money, type ScheduleRow } from '@cuotascasa/domain';
import { describe, expect, it } from 'vitest';
import { CurrencyTotalsAccumulator, currentInstallmentOf, latestAnchorOf, percentPaidOf } from './derive.ts';

const money = (value: string): Money => value as Money;
const date = (value: string): LocalDate => value as LocalDate;

function row(k: number, dueDate: string): ScheduleRow {
  return { k, dueDate: date(dueDate), opening: money('100.00') } as ScheduleRow;
}

describe('percentPaidOf (spec §9: HALF_UP to 1 decimal, clamped 0-100)', () => {
  it('is 0.0 when nothing was paid and 100.0 when the balance is 0.00', () => {
    expect(percentPaidOf(money('500000.00'), money('500000.00'))).toBe('0.0');
    expect(percentPaidOf(money('500000.00'), money('0.00'))).toBe('100.0');
  });

  it('rounds half up to one decimal', () => {
    expect(percentPaidOf(money('10000.00'), money('9975.00'))).toBe('0.3');
    expect(percentPaidOf(money('10000.00'), money('9965.00'))).toBe('0.4');
    expect(percentPaidOf(money('10000.00'), money('9976.00'))).toBe('0.2');
    expect(percentPaidOf(money('1000.00'), money('999.95'))).toBe('0.0');
    expect(percentPaidOf(money('1000.00'), money('999.50'))).toBe('0.1');
  });

  it('clamps a balance above the principal to 0.0 and a negative balance to 100.0', () => {
    expect(percentPaidOf(money('1000.00'), money('1200.00'))).toBe('0.0');
    expect(percentPaidOf(money('1000.00'), money('-5.00'))).toBe('100.0');
  });

  it('always has exactly one decimal', () => {
    expect(percentPaidOf(money('500000.00'), money('250000.00'))).toBe('50.0');
  });
});

describe('currentInstallmentOf (first row with dueDate >= asOf)', () => {
  const rows = [row(1, '2025-02-28'), row(2, '2025-03-31'), row(3, '2025-04-30')];

  it('takes the first row due on or after asOf', () => {
    expect(currentInstallmentOf(rows, date('2025-03-01'))?.k).toBe(2);
    expect(currentInstallmentOf(rows, date('2025-03-31'))?.k).toBe(2);
    expect(currentInstallmentOf(rows, date('2024-01-01'))?.k).toBe(1);
  });

  it('is null when asOf is after the last due date', () => {
    expect(currentInstallmentOf(rows, date('2025-05-01'))).toBeNull();
    expect(currentInstallmentOf([], date('2025-05-01'))).toBeNull();
  });
});

describe('latestAnchorOf (max k; tie: later date, then greater id)', () => {
  const anchors = [
    { id: 'a', k: 3, date: date('2025-04-01') },
    { id: 'b', k: 5, date: date('2025-06-01') },
    { id: 'c', k: 5, date: date('2025-06-15') },
    { id: 'd', k: 5, date: date('2025-06-15') },
    { id: 'e', k: 4, date: date('2025-12-31') },
  ];

  it('picks the highest k, then the later date, then the greater id', () => {
    expect(latestAnchorOf(anchors)?.id).toBe('d');
    expect(latestAnchorOf(anchors.slice(0, 3))?.id).toBe('c');
    expect(latestAnchorOf(anchors.slice(0, 2))?.id).toBe('b');
    expect(latestAnchorOf([...anchors].reverse())?.id).toBe('d');
  });

  it('is null without anchors', () => {
    expect(latestAnchorOf([])).toBeNull();
  });
});

describe('CurrencyTotalsAccumulator', () => {
  it('adds balance and next installment of loans of its currency', () => {
    const totals = new CurrencyTotalsAccumulator('GTQ');
    totals.add('GTQ', money('1000.00'), money('100.00'));
    totals.add('GTQ', money('250.50'), null);
    expect(totals.toTotals()).toEqual({
      currency: 'GTQ',
      loanCount: 2,
      balance: '1250.50',
      nextInstallmentTotal: '100.00',
    });
  });

  it('throws CurrencyMismatchError when handed a loan of another currency', () => {
    const totals = new CurrencyTotalsAccumulator('GTQ');
    expect(() => totals.add('USD', money('1.00'), null)).toThrow(CurrencyMismatchError);
    expect(totals.toTotals().loanCount).toBe(0);
  });
});
