import { describe, expect, it } from 'vitest';
import { invalidInputCode } from '../../test/support/errors.ts';
import type { Money } from '../types/primitives.ts';
import {
  compareMoney,
  maxMoney,
  minMoney,
  moneyAbs,
  moneyAdd,
  moneyIsNegative,
  moneyIsZero,
  moneyMidpoint,
  moneyNegate,
  moneySub,
  moneySum,
  percentOf,
} from './arithmetic.ts';
import { parseMoney, ZERO_MONEY } from './money.ts';

const m = (value: string): Money => parseMoney(value);

describe('money arithmetic', () => {
  it('adds, subtracts, sums, negates and takes absolute values exactly', () => {
    expect(moneyAdd(m('0.10'), m('0.20'))).toBe('0.30');
    expect(moneySub(m('500000.00'), m('821.80'))).toBe('499178.20');
    expect(moneySum([m('2916.67'), m('525.00'), m('821.80'), m('395.00')])).toBe('4658.47');
    expect(moneySum([])).toBe(ZERO_MONEY);
    expect(moneyNegate(m('12.34'))).toBe('-12.34');
    expect(moneyNegate(m('0.00'))).toBe('0.00');
    expect(moneyAbs(m('-12.34'))).toBe('12.34');
  });
});

describe('money comparisons', () => {
  it('compares by value, not by string', () => {
    expect(compareMoney(m('9.99'), m('10.00'))).toBe(-1);
    expect(compareMoney(m('10.00'), m('9.99'))).toBe(1);
    expect(compareMoney(m('10.00'), m('10'))).toBe(0);
  });

  it('min and max pick by value', () => {
    expect(minMoney(m('20000.00'), m('469756.31'))).toBe('20000.00');
    expect(minMoney(m('500000.00'), m('469756.31'))).toBe('469756.31');
    expect(maxMoney(m('1.00'), m('2.00'))).toBe('2.00');
    expect(maxMoney(m('3.00'), m('2.00'))).toBe('3.00');
  });

  it('detects zero and negatives', () => {
    expect(moneyIsZero(m('0.00'))).toBe(true);
    expect(moneyIsZero(m('0.01'))).toBe(false);
    expect(moneyIsNegative(m('-0.01'))).toBe(true);
    expect(moneyIsNegative(m('0.00'))).toBe(false);
    expect(moneyIsNegative(m('0.01'))).toBe(false);
  });
});

describe('[ALG.GOAL] bisection midpoint', () => {
  it('floors (a + b) / 2 to the cent without converting money to number', () => {
    expect(moneyMidpoint(m('0.01'), m('469756.31'))).toBe('234878.16');
    expect(moneyMidpoint(m('0.01'), m('0.04'))).toBe('0.02');
    expect(moneyMidpoint(m('-0.03'), m('0.00'))).toBe('-0.02');
  });

  it('stays within [a, b] and reaches a for adjacent cents', () => {
    expect(moneyMidpoint(m('489756.30'), m('489756.31'))).toBe('489756.30');
    expect(moneyMidpoint(m('20000.00'), m('20000.00'))).toBe('20000.00');
  });
});

describe('percentOf', () => {
  it('computes part/whole × 100 rounded half up', () => {
    expect(percentOf(m('30243.69'), m('500000.00'), 1)).toBe('6.0');
    expect(percentOf(m('1.00'), m('8.00'), 1)).toBe('12.5');
    expect(percentOf(m('1.00'), m('16.00'), 1)).toBe('6.3');
    expect(percentOf(m('1.00'), m('3.00'), 2)).toBe('33.33');
    expect(percentOf(m('500000.00'), m('500000.00'), 0)).toBe('100');
    expect(percentOf(m('-0.01'), m('1000000.00'), 1)).toBe('0.0');
  });

  it('rejects a zero whole and invalid decimal counts', () => {
    expect(invalidInputCode(() => percentOf(m('1.00'), m('0.00'), 1))).toBe('ZERO_DIVISOR');
    expect(invalidInputCode(() => percentOf(m('1.00'), m('2.00'), 1.5))).toBe('INVALID_INTEGER');
    expect(invalidInputCode(() => percentOf(m('1.00'), m('2.00'), -1))).toBe('INVALID_INTEGER');
    expect(invalidInputCode(() => percentOf(m('1.00'), m('2.00'), 21))).toBe('INVALID_INTEGER');
  });
});
