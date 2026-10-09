import { describe, expect, it } from 'vitest';
import { thrownBy } from '../../test/support/errors.ts';
import { parseMoney, parseRate } from '../money/index.ts';
import { NegativeAmortizationError, type RoundingProfile } from '../types/primitives.ts';
import type { TermMode } from '../types/engine.ts';
import { calculateInstallment, type InstallmentInput } from './amounts.ts';

const m = parseMoney;
const r = parseRate;

function input(
  overrides: Omit<Partial<InstallmentInput>, 'opening' | 'level'> & { opening: string; level: string },
): InstallmentInput {
  const { opening, level, ...rest } = overrides;
  return {
    k: 1,
    opening: m(opening),
    level: m(level),
    interestRate: r('0.085'),
    insuranceRates: [r('0.0035'), r('0.0015')],
    roundingProfile: 'FHA_GT_V1' as RoundingProfile,
    termMode: 'FIXED' as TermMode,
    term: 12,
    ...rest,
  };
}

describe('[ALG.PERIOD.FHA_GT_V1] normal installment', () => {
  it('splits HALF_UP_2((B * (i + f)) / 12) into interest and insurance, then insurance per component', () => {
    const result = calculateInstallment(input({ opening: '1012.33', level: '1019.00' }));
    expect(result).toEqual({
      interest: '7.17',
      insurance: '0.42',
      insuranceComponents: ['0.29', '0.13'],
      capital: '1011.41',
      isLast: false,
    });
  });

  it('[ALG.PERIOD.SPLIT] the last component takes the residue', () => {
    const result = calculateInstallment(
      input({
        opening: '777.77',
        level: '100.00',
        interestRate: r('0.09'),
        insuranceRates: [r('0.003'), r('0.0045'), r('0.0025')],
      }),
    );
    expect(result.interest).toBe('5.83');
    expect(result.insuranceComponents).toEqual(['0.20', '0.29', '0.16']);
    expect(result.insurance).toBe('0.65');
  });

  it('[ALG.ZERO] f = 0 gives interest = charge and no split', () => {
    const result = calculateInstallment(
      input({ opening: '1000.00', level: '100.00', insuranceRates: [r('0'), r('0')] }),
    );
    expect(result).toMatchObject({ interest: '7.08', insurance: '0.00', insuranceComponents: ['0.00', '0.00'] });
    expect(calculateInstallment(input({ opening: '1000.00', level: '100.00', insuranceRates: [] }))).toMatchObject({
      interest: '7.08',
      insurance: '0.00',
      insuranceComponents: [],
    });
  });

  it('[ALG.ZERO] i = 0 with f > 0 gives interest = 0 and insurance = charge', () => {
    const result = calculateInstallment(input({ opening: '1000.00', level: '100.00', interestRate: r('0') }));
    expect(result).toMatchObject({ interest: '0.00', insurance: '0.42', insuranceComponents: ['0.29', '0.13'] });
  });

  it('[ALG.ZERO] r = 0 gives no charge at all and capital = level', () => {
    const result = calculateInstallment(
      input({ opening: '1000.00', level: '100.00', interestRate: r('0'), insuranceRates: [r('0')] }),
    );
    expect(result).toEqual({
      interest: '0.00',
      insurance: '0.00',
      insuranceComponents: ['0.00'],
      capital: '100.00',
      isLast: false,
    });
  });

  it('[ALG.CONV] a half-cent tie rounds away from zero', () => {
    const result = calculateInstallment(
      input({ opening: '1506.00', level: '100.00', interestRate: r('0.06'), insuranceRates: [r('0.01')] }),
    );
    expect(result).toMatchObject({
      interest: '7.53',
      insurance: '1.26',
      insuranceComponents: ['1.26'],
      capital: '91.21',
    });
  });
});

describe('[ALG.PERIOD.SIMPLE] normal installment', () => {
  it('rounds interest and each insurance component separately; capital = level - interest - sum(insurance)', () => {
    const result = calculateInstallment(input({ opening: '1012.33', level: '1019.00', roundingProfile: 'SIMPLE' }));
    expect(result).toEqual({
      interest: '7.17',
      insurance: '0.43',
      insuranceComponents: ['0.30', '0.13'],
      capital: '1011.40',
      isLast: false,
    });
  });

  it('[ALG.ZERO] r = 0 gives capital = level and zero components', () => {
    const result = calculateInstallment(
      input({
        opening: '300.00',
        level: '100.00',
        roundingProfile: 'SIMPLE',
        interestRate: r('0'),
        insuranceRates: [r('0'), r('0')],
      }),
    );
    expect(result).toEqual({
      interest: '0.00',
      insurance: '0.00',
      insuranceComponents: ['0.00', '0.00'],
      capital: '100.00',
      isLast: false,
    });
  });
});

describe('[ALG.LAST] last installment', () => {
  it('FHA_GT_V1: capital = B, interest = HALF_UP_2(B * i / 12), insurance = HALF_UP_2(B * f / 12) split by [ALG.PERIOD.SPLIT]', () => {
    const result = calculateInstallment(input({ opening: '1012.33', level: '1100.00' }));
    expect(result).toEqual({
      interest: '7.17',
      insurance: '0.42',
      insuranceComponents: ['0.29', '0.13'],
      capital: '1012.33',
      isLast: true,
    });
  });

  it('SIMPLE: each insurance component is HALF_UP_2(B * fj / 12)', () => {
    const result = calculateInstallment(input({ opening: '1012.33', level: '1100.00', roundingProfile: 'SIMPLE' }));
    expect(result).toEqual({
      interest: '7.17',
      insurance: '0.43',
      insuranceComponents: ['0.30', '0.13'],
      capital: '1012.33',
      isLast: true,
    });
  });

  it('[ALG.ZERO] FHA_GT_V1 last row with f = 0 has no insurance and no split', () => {
    const result = calculateInstallment(input({ opening: '50.00', level: '100.00', insuranceRates: [] }));
    expect(result).toMatchObject({ insurance: '0.00', insuranceComponents: [], interest: '0.35', isLast: true });
  });

  it('[ALG.LAST.FIXED_TERM] the installment numbered term is the last one', () => {
    expect(calculateInstallment(input({ k: 12, opening: '1012.33', level: '200.00' })).isLast).toBe(true);
    expect(calculateInstallment(input({ k: 11, opening: '1012.33', level: '200.00' })).isLast).toBe(false);
  });

  it('[ALG.LAST.FIXED_TERM] settles early when level - financialCharge >= B, using the charge of the profile', () => {
    // B = 1012.33: FHA charge = 7.59, SIMPLE interest + insurance = 7.17 + 0.30 + 0.13 = 7.60.
    const fha = (level: string) => calculateInstallment(input({ opening: '1012.33', level })).isLast;
    const simple = (level: string) =>
      calculateInstallment(input({ opening: '1012.33', level, roundingProfile: 'SIMPLE' })).isLast;
    expect(fha('1019.92')).toBe(true);
    expect(fha('1019.91')).toBe(false);
    expect(simple('1019.93')).toBe(true);
    expect(simple('1019.92')).toBe(false);
  });

  it('[ALG.LAST.DERIVED_TERM] is the first installment where level - financialCharge >= B, with any k', () => {
    const derived = (level: string, k: number) =>
      calculateInstallment(input({ k, opening: '1012.33', level, termMode: 'DERIVED', term: 1 })).isLast;
    expect(derived('1019.91', 500)).toBe(false);
    expect(derived('1019.92', 1)).toBe(true);
    const simple = calculateInstallment(
      input({ opening: '1012.33', level: '1019.93', roundingProfile: 'SIMPLE', termMode: 'DERIVED' }),
    );
    expect(simple.isLast).toBe(true);
  });
});

describe('[ALG.TERM] negative amortization', () => {
  it('derived term with level - financialCharge <= 0 throws NegativeAmortizationError(ALG.TERM, k)', () => {
    const error = thrownBy(() =>
      calculateInstallment(input({ k: 7, opening: '1000.00', level: '7.50', termMode: 'DERIVED' })),
    );
    expect(error).toBeInstanceOf(NegativeAmortizationError);
    expect(error).toMatchObject({ rule: 'ALG.TERM', k: 7, level: '7.50', financialCharge: '7.50' });
  });

  it('uses the financialCharge of SIMPLE: interest plus every insurance component', () => {
    const error = thrownBy(() =>
      calculateInstallment(
        input({ k: 2, opening: '1012.33', level: '7.60', roundingProfile: 'SIMPLE', termMode: 'DERIVED' }),
      ),
    );
    expect(error).toMatchObject({ rule: 'ALG.TERM', k: 2, financialCharge: '7.60' });
  });

  it('fixed term is not validated: capital goes to zero or below', () => {
    expect(calculateInstallment(input({ opening: '1000.00', level: '7.50' })).capital).toBe('0.00');
    expect(calculateInstallment(input({ opening: '1000.00', level: '5.00' })).capital).toBe('-2.50');
  });
});
