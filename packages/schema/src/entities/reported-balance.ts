import { z } from 'zod';
import {
  baseRecordShape,
  installmentNumberSchema,
  localDateSchema,
  moneySchema,
  noteSchema,
  positiveMoneySchema,
  rateSchema,
  uuidSchema,
} from '../common.ts';

/** Where the user read the balance (spec §3). Informative. */
export const REPORTED_BALANCE_SOURCES = ['BANK_EMAIL', 'ONLINE_BANKING', 'BANK_SCHEDULE', 'OTHER'] as const;
export const reportedBalanceSourceSchema = z.enum(REPORTED_BALANCE_SOURCES);
export type ReportedBalanceSource = z.infer<typeof reportedBalanceSourceSchema>;

/**
 * Balance reported by the bank as the opening balance of installment k, before paying it ([ALG.ANCHOR]).
 * installmentNumber is optional: without it k is the first installment due on or after `date` ([ALG.EVENTS.ANCHOR]).
 * totalInstallment and reportedRate are informative; the engine never reads them.
 */
export const reportedBalanceSchema = z.strictObject({
  ...baseRecordShape,
  loanId: uuidSchema,
  date: localDateSchema,
  installmentNumber: installmentNumberSchema.optional(),
  balance: moneySchema,
  totalInstallment: positiveMoneySchema.optional(),
  reportedRate: rateSchema.optional(),
  source: reportedBalanceSourceSchema,
  note: noteSchema.optional(),
});
export type ReportedBalance = z.infer<typeof reportedBalanceSchema>;
