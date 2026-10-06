import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { DECIMAL_PRECISION, DECIMAL_ROUNDING, DomainDecimal } from './decimal-config.ts';

describe('[ALG.CONV] decimal context', () => {
  it('equals the algorithm.md values: 34 significant digits and ROUND_HALF_EVEN', () => {
    expect(DECIMAL_PRECISION).toBe(34);
    expect(DECIMAL_ROUNDING).toBe(Decimal.ROUND_HALF_EVEN);
    expect(DomainDecimal.precision).toBe(34);
    expect(DomainDecimal.rounding).toBe(6);
  });

  it('rounds intermediate results to 34 significant digits', () => {
    expect(new DomainDecimal(1).div(3).toFixed()).toBe('0.3333333333333333333333333333333333');
    expect(new DomainDecimal('0.0826').div(12).toFixed()).toBe('0.006883333333333333333333333333333333');
  });

  it('breaks exact ties to the even digit, unlike ROUND_HALF_UP', () => {
    const tie = '0.0000000000000000000000000000000005';
    expect(new DomainDecimal('1.000000000000000000000000000000002').plus(tie).toFixed()).toBe(
      '1.000000000000000000000000000000002',
    );
    expect(new DomainDecimal('1.000000000000000000000000000000001').plus(tie).toFixed()).toBe(
      '1.000000000000000000000000000000002',
    );
  });

  it('is an isolated clone: the global decimal.js configuration keeps its defaults', () => {
    expect(DomainDecimal).not.toBe(Decimal);
    expect(Decimal.precision).toBe(20);
    expect(Decimal.rounding).toBe(Decimal.ROUND_HALF_UP);
  });
});
