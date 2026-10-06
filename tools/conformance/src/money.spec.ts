import { describe, expect, it } from 'vitest';
import { centsToMoney, moneyToCents } from './money.ts';

describe('money helpers (exact cents, never a JS number)', () => {
  it('reads two-decimal strings as integer cents', () => {
    expect(moneyToCents('1234.56')).toBe(123456n);
    expect(moneyToCents('-0.01')).toBe(-1n);
    expect(moneyToCents('0.00')).toBe(0n);
  });

  it('rejects anything that is not a two-decimal string', () => {
    for (const value of ['1234.5', '1,234.56', '1e3', ' 1.00', '1.000', '']) {
      expect(moneyToCents(value), value).toBeNull();
    }
  });

  it('writes cents back with two decimals', () => {
    expect(centsToMoney(123456n)).toBe('1234.56');
    expect(centsToMoney(5n)).toBe('0.05');
    expect(centsToMoney(-120n)).toBe('-1.20');
    expect(centsToMoney(0n)).toBe('0.00');
  });
});
