import { describe, expect, it } from 'vitest';
import { reportedBalanceExample } from '../__examples__/reported-balance.example.ts';
import { withField, withoutField } from '../test-support/with-field.ts';
import { reportedBalanceSchema } from './reported-balance.ts';

describe('reportedBalanceSchema', () => {
  it('parses its synthetic example', () => {
    expect(reportedBalanceSchema.parse(reportedBalanceExample)).toEqual(reportedBalanceExample);
  });

  it('rejects a number-typed money field and a Date-typed date field', () => {
    expect(reportedBalanceSchema.safeParse(withField(reportedBalanceExample, ['balance'], 499178.2)).success).toBe(
      false,
    );
    expect(
      reportedBalanceSchema.safeParse(withField(reportedBalanceExample, ['date'], new Date('2025-03-05T00:00:00Z')))
        .success,
    ).toBe(false);
  });

  it('uses the field name date, an optional installmentNumber and an optional note', () => {
    expect(reportedBalanceSchema.safeParse(withoutField(reportedBalanceExample, ['installmentNumber'])).success).toBe(
      true,
    );
    expect(reportedBalanceSchema.safeParse(withoutField(reportedBalanceExample, ['note'])).success).toBe(true);
    expect(reportedBalanceSchema.safeParse(withoutField(reportedBalanceExample, ['date'])).success).toBe(false);
    expect(reportedBalanceSchema.safeParse(withField(reportedBalanceExample, ['installmentNumber'], 0)).success).toBe(
      false,
    );
  });

  it('accepts the informative totalInstallment and reportedRate, and a zero balance', () => {
    const informative = withField(
      withField(reportedBalanceExample, ['totalInstallment'], '4658.47'),
      ['reportedRate'],
      '0.0826',
    );
    expect(reportedBalanceSchema.safeParse(informative).success).toBe(true);
    expect(reportedBalanceSchema.safeParse(withField(reportedBalanceExample, ['balance'], '0.00')).success).toBe(true);
    expect(reportedBalanceSchema.safeParse(withField(reportedBalanceExample, ['source'], 'PHONE')).success).toBe(false);
  });
});
