import { z } from 'zod';
import {
  baseRecordShape,
  currencySchema,
  localDateSchema,
  moneySchema,
  positiveMoneySchema,
  rateSchema,
  textSchema,
} from '../common.ts';

export const LOAN_STATUSES = ['active', 'paid', 'archived'] as const;
export const loanStatusSchema = z.enum(LOAN_STATUSES);
export type LoanStatus = z.infer<typeof loanStatusSchema>;

/** Informative only: the engine ignores it ([ALG.TERMS]). */
export const RATE_TYPES = ['FIXED', 'VARIABLE'] as const;
export const rateTypeSchema = z.enum(RATE_TYPES);
export type RateType = z.infer<typeof rateTypeSchema>;

export const ROUNDING_PROFILES = ['FHA_GT_V1', 'SIMPLE'] as const;
export const roundingProfileSchema = z.enum(ROUNDING_PROFILES);
export type RoundingProfile = z.infer<typeof roundingProfileSchema>;

/** Day of month 1-31 or 'END_OF_MONTH' ([ALG.DATES]). */
export const paymentDaySchema = z.union([z.int().min(1).max(31), z.literal('END_OF_MONTH')]);
export type PaymentDay = z.infer<typeof paymentDaySchema>;

/** Monthly fixed charge (IUSI, seguro de daños…) applied from `effectiveFrom` ([ALG.FIXED]). */
export const fixedChargeSchema = z.strictObject({
  label: textSchema(60),
  amount: moneySchema,
  effectiveFrom: localDateSchema,
});
export type FixedCharge = z.infer<typeof fixedChargeSchema>;

/** Template the loan was copied from, e.g. {id: 'fha-gt', version: 1} ([ALG.TEMPLATES]). */
export const templateRefSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  version: z.int().min(1),
});
export type TemplateRef = z.infer<typeof templateRefSchema>;

/**
 * The original conditions of [ALG.TERMS] that the engine reads. Shared verbatim by the
 * Loan entity and by the oracle fixture `inputs.terms` (tools/oracle/FORMAT.md).
 * insuranceRates are the annual components f1…fm in array order.
 */
export const loanTermsShape = {
  principal: positiveMoneySchema,
  termMonths: z.int().min(1).max(1200),
  disbursementDate: localDateSchema,
  firstDueDate: localDateSchema,
  paymentDay: paymentDaySchema,
  currency: currencySchema,
  interestRate: rateSchema,
  insuranceRates: z.array(rateSchema).max(10),
  fixedCharges: z.array(fixedChargeSchema).max(20),
  roundingProfile: roundingProfileSchema,
} as const;

/**
 * Loan (ADR-0005 decision 3). Field names here are the single source for the spec, the UI and the backup.
 * - name: «Alias» in the UI; bank: «Banco», free text with no preloaded list (ADR-0015).
 * - interestRate is the original contract rate at disbursement; later changes are RateChange events.
 * - templateRef plus a copy of the template values: editing the template never alters the loan.
 * - currency may be corrected only while the loan has no non-deleted LoanEvent, ReportedBalance,
 *   ActualPayment or Scenario (see isLoanCurrencyLocked); from the first one it is immutable (W3-11).
 */
export const loanSchema = z.strictObject({
  ...baseRecordShape,
  name: textSchema(80),
  bank: z.string().max(80),
  ...loanTermsShape,
  rateType: rateTypeSchema,
  templateRef: templateRefSchema,
  status: loanStatusSchema,
});
export type Loan = z.infer<typeof loanSchema>;

interface LoanChildLike {
  readonly loanId: string;
  readonly deletedAt: string | null;
}

/** The four child collections that lock a loan's currency (ADR-0005, spec §7). */
export interface LoanChildren {
  readonly events: readonly LoanChildLike[];
  readonly reportedBalances: readonly LoanChildLike[];
  readonly payments: readonly LoanChildLike[];
  readonly scenarios: readonly LoanChildLike[];
}

/**
 * True while any non-deleted LoanEvent, ReportedBalance, ActualPayment or Scenario of the loan exists.
 * W3-11 uses it to reject a currency change with a typed error.
 */
export function isLoanCurrencyLocked(loanId: string, children: LoanChildren): boolean {
  const collections = [children.events, children.reportedBalances, children.payments, children.scenarios];
  return collections.some((records) => records.some((record) => record.loanId === loanId && record.deletedAt === null));
}
