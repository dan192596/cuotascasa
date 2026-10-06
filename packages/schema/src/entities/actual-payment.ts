import { z } from 'zod';
import {
  baseRecordShape,
  installmentNumberSchema,
  localDateSchema,
  moneySchema,
  noteSchema,
  positiveMoneySchema,
  uuidSchema,
} from '../common.ts';

/** Optional breakdown used for Real Δ per component (capital, interest, insurance, fixed charges; [ALG.ACTUAL]). */
export const paymentBreakdownSchema = z.strictObject({
  capital: moneySchema,
  interest: moneySchema,
  insurance: moneySchema,
  fixedCharges: moneySchema,
});
export type PaymentBreakdown = z.infer<typeof paymentBreakdownSchema>;

/**
 * A payment the user made. installmentNumber is required ([ALG.EVENTS.ANCHOR]); the UI suggests it from
 * paidDate and the user may change it, which covers late payments. It only compares ([ALG.ACTUAL]).
 */
export const actualPaymentSchema = z.strictObject({
  ...baseRecordShape,
  loanId: uuidSchema,
  paidDate: localDateSchema,
  installmentNumber: installmentNumberSchema,
  total: positiveMoneySchema,
  breakdown: paymentBreakdownSchema.optional(),
  note: noteSchema.optional(),
});
export type ActualPayment = z.infer<typeof actualPaymentSchema>;
