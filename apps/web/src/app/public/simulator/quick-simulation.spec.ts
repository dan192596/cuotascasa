import { describe, expect, it } from 'vitest';
import { InvalidInputError, makeLocalDate, parseMoney, percentToRate } from '@cuotascasa/domain';
import { firstDueDateAfter, simulate, type SimulationInput } from './quick-simulation.ts';

const TODAY = makeLocalDate(2026, 1, 15);

function input(overrides: Partial<SimulationInput> = {}): SimulationInput {
  return {
    principal: parseMoney('500000.00'),
    annualRate: percentToRate('7'),
    termMonths: 240,
    today: TODAY,
    prepayment: null,
    ...overrides,
  };
}

describe('firstDueDateAfter', () => {
  it.each([
    ['2026-01-15', '2026-02-28'],
    ['2026-12-31', '2027-01-31'],
    ['2027-12-01', '2028-01-31'],
    ['2028-01-31', '2028-02-29'],
  ])('%s -> %s', (today, expected) => {
    const [year = 0, month = 0, day = 0] = today.split('-').map(Number);
    expect(firstDueDateAfter(makeLocalDate(year, month, day))).toBe(expected);
  });
});

describe('simulate ([ALG.EXAMPLE])', () => {
  it('gives the level installment, the installment 1 breakdown and the base totals', () => {
    const result = simulate(input());
    expect(result.level).toBe('4263.47');
    expect(result.firstInstallment).toEqual({ interest: '2916.67', insurance: '525.00', capital: '821.80' });
    expect(result.totalInterestAndInsurance).toBe('523231.11');
    expect(result.installmentCount).toBe(240);
    expect(result.endDate).toBe('2046-01-31');
    expect(result.prepayment).toBeNull();
  });

  it('REDUCE_TERM after installment 12: 220 installments and interestSaved 69172.80', () => {
    const result = simulate(
      input({ prepayment: { amount: parseMoney('20000.00'), afterInstallment: 12, mode: 'REDUCE_TERM' } }),
    );
    expect(result.prepayment).toMatchObject({ installmentCount: 220, monthsSaved: 20, interestSaved: '69172.80' });
    expect(result.prepayment?.newLevel).toBeNull();
    expect(result.prepayment?.endDate).toBe('2044-05-31');
  });

  it('REDUCE_INSTALLMENT after installment 12: new level 4089.36 and the same term', () => {
    const result = simulate(
      input({ prepayment: { amount: parseMoney('20000.00'), afterInstallment: 12, mode: 'REDUCE_INSTALLMENT' } }),
    );
    expect(result.prepayment).toMatchObject({ installmentCount: 240, monthsSaved: 0, interestSaved: '19694.91' });
    expect(result.prepayment?.newLevel).toBe('4089.36');
  });

  it('throws a typed domain error when k is out of range', () => {
    const attempt = () =>
      simulate(input({ prepayment: { amount: parseMoney('100.00'), afterInstallment: 240, mode: 'REDUCE_TERM' } }));
    expect(attempt).toThrow(InvalidInputError);
  });
});
