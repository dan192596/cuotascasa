import { describe, expect, it } from 'vitest';
import { loanEventExample } from '../__examples__/loan-event.example.ts';
import { withField, withoutField } from '../test-support/with-field.ts';
import { loanEventSchema } from './loan-event.ts';

const base = {
  id: 'b0000000-0000-4000-8000-000000000002',
  createdAt: '2026-10-04T15:00:00.000Z',
  updatedAt: '2026-10-04T15:00:00.000Z',
  updatedByDevice: 'd0000000-0000-4000-8000-000000000001',
  deletedAt: null,
  loanId: 'a0000000-0000-4000-8000-000000000001',
  date: '2026-02-15',
};

describe('loanEventSchema', () => {
  it('parses its synthetic example', () => {
    expect(loanEventSchema.parse(loanEventExample)).toEqual(loanEventExample);
  });

  it('rejects a number-typed money field and a Date-typed date field', () => {
    expect(loanEventSchema.safeParse(withField(loanEventExample, ['amount'], 20000)).success).toBe(false);
    expect(
      loanEventSchema.safeParse(withField(loanEventExample, ['date'], new Date('2026-01-15T00:00:00Z'))).success,
    ).toBe(false);
  });

  it('uses the field name date and an optional note', () => {
    expect(loanEventSchema.safeParse(withoutField(loanEventExample, ['note'])).success).toBe(true);
    expect(loanEventSchema.safeParse(withoutField(loanEventExample, ['date'])).success).toBe(false);
    const renamed = withField(withoutField(loanEventExample, ['date']), ['eventDate'], '2026-01-15');
    expect(loanEventSchema.safeParse(renamed).success).toBe(false);
  });

  it('accepts each RateChange policy with its rules', () => {
    const recalc = { ...base, type: 'RateChange', policy: 'RECALC_INSTALLMENT_KEEP_TERM', interestRate: '0.065' };
    const keep = {
      ...base,
      type: 'RateChange',
      policy: 'KEEP_INSTALLMENT_ADJUST_TERM',
      insuranceRates: ['0.01', '0.0026'],
    };
    const bank = {
      ...base,
      type: 'RateChange',
      policy: 'BANK_INSTALLMENT',
      interestRate: '0.075',
      bankInstallment: '4300.00',
    };
    expect(loanEventSchema.safeParse(recalc).success).toBe(true);
    expect(loanEventSchema.safeParse(keep).success).toBe(true);
    expect(loanEventSchema.safeParse(bank).success).toBe(true);
    expect(loanEventSchema.safeParse({ ...recalc, interestRate: undefined }).success).toBe(false);
    expect(loanEventSchema.safeParse({ ...bank, bankInstallment: undefined }).success).toBe(false);
    expect(loanEventSchema.safeParse({ ...recalc, bankInstallment: '4300.00' }).success).toBe(false);
    expect(loanEventSchema.safeParse({ ...recalc, policy: 'GUESS' }).success).toBe(false);
  });

  it('accepts FixedChargeChange with the complete list, even empty', () => {
    const change = { ...base, type: 'FixedChargeChange', fixedCharges: [{ label: 'IUSI', amount: '350.00' }] };
    expect(loanEventSchema.safeParse(change).success).toBe(true);
    expect(loanEventSchema.safeParse({ ...change, fixedCharges: [] }).success).toBe(true);
    expect(loanEventSchema.safeParse({ ...change, fixedCharges: [{ label: 'IUSI', amount: 350 }] }).success).toBe(
      false,
    );
  });

  it('accepts Prepayment with optional FLAT or PERCENT commission', () => {
    const prepay = { ...base, type: 'Prepayment', amount: '20000.00', mode: 'REDUCE_INSTALLMENT' };
    expect(loanEventSchema.safeParse({ ...prepay, commission: { kind: 'FLAT', amount: '500.00' } }).success).toBe(true);
    expect(loanEventSchema.safeParse({ ...prepay, commission: { kind: 'PERCENT', rate: '0.02' } }).success).toBe(true);
    expect(loanEventSchema.safeParse({ ...prepay, commission: { kind: 'PERCENT', amount: '500.00' } }).success).toBe(
      false,
    );
    expect(loanEventSchema.safeParse({ ...prepay, amount: '0.00' }).success).toBe(false);
    expect(loanEventSchema.safeParse({ ...prepay, mode: 'REDUCE_BOTH' }).success).toBe(false);
  });

  it('accepts AdvanceInstallments with a positive integer count', () => {
    const advance = { ...base, type: 'AdvanceInstallments', count: 6 };
    expect(loanEventSchema.safeParse(advance).success).toBe(true);
    expect(loanEventSchema.safeParse({ ...advance, count: 0 }).success).toBe(false);
    expect(loanEventSchema.safeParse({ ...advance, count: 1.5 }).success).toBe(false);
  });

  it('rejects ReportedBalance and ActualPayment types, which are separate entities', () => {
    expect(loanEventSchema.safeParse({ ...base, type: 'ReportedBalance', balance: '1.00' }).success).toBe(false);
    expect(loanEventSchema.safeParse({ ...base, type: 'ActualPayment', total: '1.00' }).success).toBe(false);
  });
});
