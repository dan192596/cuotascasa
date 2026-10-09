import { describe, expect, it } from 'vitest';
import { thrownBy } from '../../test/support/errors.ts';
import { parseMoney, parseRate, periodicRate } from '../money/index.ts';
import { InvalidInputError } from '../types/primitives.ts';
import { levelPayment } from './index.ts';

const m = parseMoney;
const r = parseRate;

describe('[ALG.LEVEL] levelPayment', () => {
  it('reproduces level = 4263.47 of [ALG.EXAMPLE]', () => {
    const rate = periodicRate(r('0.07'), [r('0.01'), r('0.0026')]);
    expect(levelPayment(m('500000.00'), rate, 240)).toBe('4263.47');
  });

  it('applies HALF_UP_2((B * r) / (1 - 1/P)) with P = (1 + r)^m', () => {
    expect(levelPayment(m('1000.00'), periodicRate(r('0.085'), [r('0.0035'), r('0.0015')]), 12)).toBe('87.45');
  });

  it('[ALG.ZERO] r = 0 gives HALF_UP_2(B / m) without dividing by zero', () => {
    expect(levelPayment(m('100.01'), r('0'), 3)).toBe('33.34');
    expect(levelPayment(m('100000.00'), r('0'), 7)).toBe('14285.71');
    expect(levelPayment(m('0.00'), r('0'), 4)).toBe('0.00');
  });

  it('a single installment pays the balance plus one period of charge', () => {
    expect(levelPayment(m('1200.00'), r('0.01'), 1)).toBe('1212.00');
  });

  it('rejects a number of installments that is not an integer >= 1', () => {
    for (const months of [0, -1, 1.5, Number.NaN]) {
      const error = thrownBy(() => levelPayment(m('100.00'), r('0.01'), months));
      expect(error).toBeInstanceOf(InvalidInputError);
      expect(error).toMatchObject({ code: 'INVALID_INTEGER' });
    }
  });
});
