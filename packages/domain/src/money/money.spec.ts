import { describe, expect, it } from 'vitest';
import { invalidInputCode } from '../../test/support/errors.ts';
import type { Money } from '../types/primitives.ts';
import { DomainDecimal } from './decimal-config.ts';
import { dec, decInt, halfUp2, isMoney, parseMoney, toMoney, toPlainString } from './money.ts';

const m = (value: string): Money => parseMoney(value);

describe('parseMoney', () => {
  it('returns the canonical 2-decimal string', () => {
    expect(parseMoney('500000.00')).toBe('500000.00');
    expect(parseMoney('1234.5')).toBe('1234.50');
    expect(parseMoney('1234')).toBe('1234.00');
    expect(parseMoney('007.10')).toBe('7.10');
    expect(parseMoney('-12.34')).toBe('-12.34');
    expect(parseMoney('-0')).toBe('0.00');
    expect(parseMoney('-0.00')).toBe('0.00');
  });

  it('rejects JS numbers and other non-strings', () => {
    expect(invalidInputCode(() => parseMoney(500000))).toBe('INVALID_MONEY');
    expect(invalidInputCode(() => parseMoney(12.5))).toBe('INVALID_MONEY');
    expect(invalidInputCode(() => parseMoney(null))).toBe('INVALID_MONEY');
    expect(invalidInputCode(() => parseMoney(undefined))).toBe('INVALID_MONEY');
  });

  it('rejects exponent notation', () => {
    expect(invalidInputCode(() => parseMoney('1e3'))).toBe('INVALID_MONEY');
    expect(invalidInputCode(() => parseMoney('1.5E2'))).toBe('INVALID_MONEY');
    expect(invalidInputCode(() => parseMoney('5e-1'))).toBe('INVALID_MONEY');
  });

  it('rejects more than 2 decimals', () => {
    expect(invalidInputCode(() => parseMoney('0.005'))).toBe('INVALID_MONEY');
    expect(invalidInputCode(() => parseMoney('1234.567'))).toBe('INVALID_MONEY');
  });

  it('rejects malformed strings', () => {
    for (const input of ['', ' 1.00', '1.00 ', '+1.00', '1,234.00', '.50', '5.', 'Q100.00', 'NaN', 'Infinity', '--1']) {
      expect(invalidInputCode(() => parseMoney(input))).toBe('INVALID_MONEY');
    }
  });
});

describe('isMoney', () => {
  it('accepts only canonical Money strings', () => {
    expect(isMoney('1234.50')).toBe(true);
    expect(isMoney('-12.34')).toBe(true);
    expect(isMoney('1234.5')).toBe(false);
    expect(isMoney('007.00')).toBe(false);
    expect(isMoney('abc')).toBe(false);
    expect(isMoney(1234.5)).toBe(false);
  });
});

describe('dec / decInt / toMoney', () => {
  it('builds exact decimals in the [ALG.CONV] context', () => {
    expect(
      dec(m('0.10'))
        .plus(dec(m('0.20')))
        .toFixed(),
    ).toBe('0.3');
    expect(decInt(12).toFixed()).toBe('12');
  });

  it('decInt rejects non-integers and unsafe integers', () => {
    expect(invalidInputCode(() => decInt(1.5))).toBe('INVALID_INTEGER');
    expect(invalidInputCode(() => decInt(Number.MAX_SAFE_INTEGER + 1))).toBe('INVALID_INTEGER');
  });

  it('toMoney accepts exact amounts and rejects anything that would need rounding', () => {
    expect(toMoney(new DomainDecimal('821.8'))).toBe('821.80');
    expect(toMoney(new DomainDecimal('-3'))).toBe('-3.00');
    expect(invalidInputCode(() => toMoney(new DomainDecimal('0.001')))).toBe('INVALID_MONEY');
    expect(invalidInputCode(() => toMoney(new DomainDecimal(1).div(0)))).toBe('INVALID_MONEY');
  });
});

describe('[ALG.CONV] halfUp2', () => {
  it('rounds x.xx5 away from zero', () => {
    expect(halfUp2(new DomainDecimal('0.005'))).toBe('0.01');
    expect(halfUp2(new DomainDecimal('2.675'))).toBe('2.68');
    expect(halfUp2(new DomainDecimal('1234.565'))).toBe('1234.57');
    expect(halfUp2(new DomainDecimal('0.125'))).toBe('0.13');
  });

  it('rounds negative halves away from zero', () => {
    expect(halfUp2(new DomainDecimal('-0.005'))).toBe('-0.01');
    expect(halfUp2(new DomainDecimal('-2.675'))).toBe('-2.68');
    expect(halfUp2(new DomainDecimal('-0.125'))).toBe('-0.13');
  });

  it('rounds below the half towards zero and never yields -0.00', () => {
    expect(halfUp2(new DomainDecimal('1.0049999999'))).toBe('1.00');
    expect(halfUp2(new DomainDecimal('0.004'))).toBe('0.00');
    expect(halfUp2(new DomainDecimal('-0.004'))).toBe('0.00');
    expect(halfUp2(new DomainDecimal('-1.0049999999'))).toBe('-1.00');
  });

  it('keeps exact cents and pads to 2 decimals', () => {
    expect(halfUp2(new DomainDecimal('4263.47'))).toBe('4263.47');
    expect(halfUp2(new DomainDecimal('7'))).toBe('7.00');
  });

  it('evaluates the FHA_GT_V1 charge as (B · (i + f)) / 12, never B times a rounded r ([ALG.CONV])', () => {
    const charge = (balance: string, annualRate: string): Money =>
      halfUp2(new DomainDecimal(balance).times(new DomainDecimal(annualRate)).div(12));
    expect(charge('500000.00', '0.0826')).toBe('3441.67');
    expect(charge('1506.00', '0.07')).toBe('8.79');
    // The forbidden reading B · r, with r = (i + f) / 12 already rounded to 34 digits, loses the tie: 8.78.
    expect(halfUp2(new DomainDecimal('1506.00').times(new DomainDecimal('0.07').div(12)))).toBe('8.78');
  });

  it('rejects non-finite values', () => {
    expect(invalidInputCode(() => halfUp2(new DomainDecimal(1).div(0)))).toBe('INVALID_DECIMAL');
  });
});

describe('toPlainString', () => {
  it('never uses exponent notation and drops trailing zeros', () => {
    expect(toPlainString(new DomainDecimal('1e-8'))).toBe('0.00000001');
    expect(toPlainString(new DomainDecimal('0.0700'))).toBe('0.07');
    expect(toPlainString(new DomainDecimal('-0'))).toBe('0');
    expect(toPlainString(new DomainDecimal('1.5e21'))).toBe('1500000000000000000000');
  });

  it('rejects non-finite values', () => {
    expect(invalidInputCode(() => toPlainString(new DomainDecimal(1).div(0)))).toBe('INVALID_DECIMAL');
  });
});
