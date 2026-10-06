import { describe, expect, it } from 'vitest';
import { actualPaymentExample } from '../__examples__/actual-payment.example.ts';
import { withField, withoutField } from '../test-support/with-field.ts';
import { actualPaymentSchema } from './actual-payment.ts';

describe('actualPaymentSchema', () => {
  it('parses its synthetic example', () => {
    expect(actualPaymentSchema.parse(actualPaymentExample)).toEqual(actualPaymentExample);
  });

  it('rejects a number-typed money field and a Date-typed date field', () => {
    expect(actualPaymentSchema.safeParse(withField(actualPaymentExample, ['total'], 4658.47)).success).toBe(false);
    expect(
      actualPaymentSchema.safeParse(withField(actualPaymentExample, ['breakdown', 'capital'], 821.8)).success,
    ).toBe(false);
    expect(
      actualPaymentSchema.safeParse(withField(actualPaymentExample, ['paidDate'], new Date('2025-02-27T00:00:00Z')))
        .success,
    ).toBe(false);
  });

  it('uses the field name paidDate, a required installmentNumber and an optional note', () => {
    expect(actualPaymentSchema.safeParse(withoutField(actualPaymentExample, ['note'])).success).toBe(true);
    expect(actualPaymentSchema.safeParse(withoutField(actualPaymentExample, ['installmentNumber'])).success).toBe(
      false,
    );
    expect(actualPaymentSchema.safeParse(withoutField(actualPaymentExample, ['paidDate'])).success).toBe(false);
    const renamed = withField(withoutField(actualPaymentExample, ['paidDate']), ['date'], '2025-02-27');
    expect(actualPaymentSchema.safeParse(renamed).success).toBe(false);
  });

  it('accepts a payment without breakdown', () => {
    expect(actualPaymentSchema.safeParse(withoutField(actualPaymentExample, ['breakdown'])).success).toBe(true);
  });
});
