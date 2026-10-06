import { describe, expect, it } from 'vitest';
import { invalidInputCode } from '../../test/support/errors.ts';
import type { Rate } from '../types/primitives.ts';
import { isRate, MAX_PERCENT_DECIMALS, parseRate, percentToRate, periodicRate, rateToPercent } from './rate.ts';

const rate = (value: string): Rate => parseRate(value);

describe('parseRate', () => {
  it('returns the canonical fraction string', () => {
    expect(parseRate('0.07')).toBe('0.07');
    expect(parseRate('0.0700')).toBe('0.07');
    expect(parseRate('00.0126')).toBe('0.0126');
    expect(parseRate('0')).toBe('0');
    expect(parseRate('1')).toBe('1');
    expect(parseRate('0.006883333333333333333333333333333333')).toBe('0.006883333333333333333333333333333333');
  });

  it('rejects numbers, negatives, exponents and malformed strings', () => {
    for (const input of [0.07, -0.07, '-0.07', '7e-2', '0.07 ', '', '.07', '7.', '+0.07', '7%']) {
      expect(invalidInputCode(() => parseRate(input))).toBe('INVALID_RATE');
    }
  });

  it('isRate accepts only canonical rates', () => {
    expect(isRate('0.0126')).toBe(true);
    expect(isRate('0.0700')).toBe(false);
    expect(isRate('-1')).toBe(false);
    expect(isRate(0.07)).toBe(false);
  });
});

describe('[ALG.TERMS] periodicRate', () => {
  it('computes the r of [ALG.LEVEL], (i + Σ fⱼ) / 12 with 34 significant digits, for [ALG.EXAMPLE]', () => {
    expect(periodicRate(rate('0.07'), [rate('0.01'), rate('0.0026')])).toBe('0.006883333333333333333333333333333333');
  });

  it('adds f = Σ fⱼ first and then i + f, as [ALG.TERMS] writes it (each operation rounded to 34 digits)', () => {
    const tiny = rate('0.0000000000000000000000000000000005');
    expect(periodicRate(rate('1'), [tiny, tiny])).toBe('0.08333333333333333333333333333333342');
  });

  it('handles a single interest component and the all-zero case of [ALG.ZERO]', () => {
    expect(periodicRate(rate('0.06'), [])).toBe('0.005');
    expect(periodicRate(rate('0'), [rate('0')])).toBe('0');
  });
});

describe('percentToRate / rateToPercent', () => {
  it('shifts the decimal point exactly', () => {
    expect(percentToRate('7.25')).toBe('0.0725');
    expect(percentToRate('7')).toBe('0.07');
    expect(percentToRate('7.00')).toBe('0.07');
    expect(percentToRate('1.00')).toBe('0.01');
    expect(percentToRate('0.26')).toBe('0.0026');
    expect(percentToRate('1.26')).toBe('0.0126');
    expect(percentToRate('0.0001')).toBe('0.000001');
    expect(percentToRate('0')).toBe('0');
    expect(percentToRate('100')).toBe('1');
  });

  it('percentToRate rejects more than 4 decimals, exponents, negatives and JS numbers', () => {
    expect(MAX_PERCENT_DECIMALS).toBe(4);
    for (const input of ['7.12345', '0.00001', '7e-2', '7E2', '-7', '7.', '.5', ' 7', '7 %', '', 7.25, 7]) {
      expect(invalidInputCode(() => percentToRate(input))).toBe('INVALID_PERCENT');
    }
  });

  it('rateToPercent inverts percentToRate', () => {
    expect(rateToPercent(rate('0.0126'))).toBe('1.26');
    expect(rateToPercent(rate('0.0725'))).toBe('7.25');
    expect(rateToPercent(rate('0.07'))).toBe('7');
    expect(rateToPercent(rate('0.000001'))).toBe('0.0001');
    expect(rateToPercent(rate('0'))).toBe('0');
    for (const percent of ['7.25', '0.26', '1', '99.9999', '0.0001']) {
      expect(rateToPercent(percentToRate(percent))).toBe(percent);
    }
  });

  it('rateToPercent rejects rates with more than 4 percent decimals and forged values', () => {
    expect(invalidInputCode(() => rateToPercent(rate('0.0000001')))).toBe('INVALID_PERCENT');
    expect(invalidInputCode(() => rateToPercent(rate('0.006883333333333333333333333333333333')))).toBe(
      'INVALID_PERCENT',
    );
    expect(invalidInputCode(() => rateToPercent('7e-2' as Rate))).toBe('INVALID_RATE');
  });
});
