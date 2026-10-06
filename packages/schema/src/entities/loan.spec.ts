import { describe, expect, it } from 'vitest';
import { loanExample } from '../__examples__/loan.example.ts';
import { withField, withoutField } from '../test-support/with-field.ts';
import { isLoanCurrencyLocked, loanSchema, type LoanChildren } from './loan.ts';

describe('loanSchema', () => {
  it('parses its synthetic example, which includes rateType', () => {
    expect(loanSchema.parse(loanExample)).toEqual(loanExample);
    expect(loanExample.rateType).toBe('VARIABLE');
  });

  it('rejects a number-typed money field and a Date-typed date field', () => {
    expect(loanSchema.safeParse(withField(loanExample, ['principal'], 500000)).success).toBe(false);
    expect(loanSchema.safeParse(withField(loanExample, ['fixedCharges', 0, 'amount'], 350)).success).toBe(false);
    expect(
      loanSchema.safeParse(withField(loanExample, ['firstDueDate'], new Date('2025-02-28T00:00:00Z'))).success,
    ).toBe(false);
    expect(
      loanSchema.safeParse(withField(loanExample, ['disbursementDate'], new Date('2025-01-31T00:00:00Z'))).success,
    ).toBe(false);
  });

  it('rejects a missing rateType or a value other than FIXED | VARIABLE', () => {
    expect(loanSchema.safeParse(withoutField(loanExample, ['rateType'])).success).toBe(false);
    expect(loanSchema.safeParse(withField(loanExample, ['rateType'], 'MIXED')).success).toBe(false);
    expect(loanSchema.safeParse(withField(loanExample, ['rateType'], 'fixed')).success).toBe(false);
    expect(loanSchema.safeParse(withField(loanExample, ['rateType'], 'FIXED')).success).toBe(true);
  });

  it('accepts status active | paid | archived only', () => {
    for (const status of ['active', 'paid', 'archived']) {
      expect(loanSchema.safeParse(withField(loanExample, ['status'], status)).success).toBe(true);
    }
    expect(loanSchema.safeParse(withField(loanExample, ['status'], 'closed')).success).toBe(false);
  });

  it('accepts paymentDay 1..31 or END_OF_MONTH and currency GTQ | USD', () => {
    expect(loanSchema.safeParse(withField(loanExample, ['paymentDay'], 15)).success).toBe(true);
    expect(loanSchema.safeParse(withField(loanExample, ['paymentDay'], 0)).success).toBe(false);
    expect(loanSchema.safeParse(withField(loanExample, ['paymentDay'], 32)).success).toBe(false);
    expect(loanSchema.safeParse(withField(loanExample, ['paymentDay'], 'LAST')).success).toBe(false);
    expect(loanSchema.safeParse(withField(loanExample, ['currency'], 'USD')).success).toBe(true);
    expect(loanSchema.safeParse(withField(loanExample, ['currency'], 'EUR')).success).toBe(false);
  });

  it('keeps templateRef plus the copied template values', () => {
    expect(loanSchema.safeParse(withoutField(loanExample, ['templateRef'])).success).toBe(false);
    expect(loanSchema.safeParse(withField(loanExample, ['templateRef', 'version'], 0)).success).toBe(false);
  });

  it('rejects unknown keys and a zero principal', () => {
    expect(loanSchema.safeParse(withField(loanExample, ['loanNumber'], '123')).success).toBe(false);
    expect(loanSchema.safeParse(withField(loanExample, ['principal'], '0.00')).success).toBe(false);
  });
});

describe('isLoanCurrencyLocked', () => {
  const loanId = loanExample.id;
  const none: LoanChildren = { events: [], reportedBalances: [], payments: [], scenarios: [] };
  const live = { loanId, deletedAt: null };
  const deleted = { loanId, deletedAt: '2026-10-05T15:00:00.000Z' };
  const otherLoan = { loanId: 'a0000000-0000-4000-8000-000000000099', deletedAt: null };

  it('is unlocked without children, with only deleted children or with children of another loan', () => {
    expect(isLoanCurrencyLocked(loanId, none)).toBe(false);
    expect(isLoanCurrencyLocked(loanId, { ...none, events: [deleted], payments: [deleted] })).toBe(false);
    expect(isLoanCurrencyLocked(loanId, { ...none, scenarios: [otherLoan] })).toBe(false);
  });

  it.each(['events', 'reportedBalances', 'payments', 'scenarios'] as const)(
    'is locked by one non-deleted child in %s',
    (key) => {
      expect(isLoanCurrencyLocked(loanId, { ...none, [key]: [live] })).toBe(true);
    },
  );
});
