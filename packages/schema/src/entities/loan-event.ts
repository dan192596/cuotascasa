import { z } from 'zod';
import {
  baseRecordShape,
  localDateSchema,
  moneySchema,
  noteSchema,
  positiveMoneySchema,
  positiveRateSchema,
  rateSchema,
  textSchema,
  uuidSchema,
} from '../common.ts';

export const RATE_CHANGE_POLICIES = [
  'RECALC_INSTALLMENT_KEEP_TERM',
  'KEEP_INSTALLMENT_ADJUST_TERM',
  'BANK_INSTALLMENT',
] as const;
export const rateChangePolicySchema = z.enum(RATE_CHANGE_POLICIES);
export type RateChangePolicy = z.infer<typeof rateChangePolicySchema>;

export const PREPAYMENT_MODES = ['REDUCE_TERM', 'REDUCE_INSTALLMENT'] as const;
export const prepaymentModeSchema = z.enum(PREPAYMENT_MODES);
export type PrepaymentMode = z.infer<typeof prepaymentModeSchema>;

export const COMMISSION_KINDS = ['FLAT', 'PERCENT'] as const;

/** Optional prepayment commission ([ALG.PREPAY.COMMISSION]); PERCENT.rate is a fraction ('0.02' = 2 %). */
export const commissionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('FLAT'), amount: positiveMoneySchema }),
  z.strictObject({ kind: z.literal('PERCENT'), rate: positiveRateSchema }),
]);
export type Commission = z.infer<typeof commissionSchema>;

/** One item of the complete fixed-charge list carried by a FixedChargeChange ([ALG.FIXEDCHANGE]). */
export const chargeItemSchema = z.strictObject({
  label: textSchema(60),
  amount: moneySchema,
});
export type ChargeItem = z.infer<typeof chargeItemSchema>;

export const EVENT_TYPES = ['RateChange', 'FixedChargeChange', 'Prepayment', 'AdvanceInstallments'] as const;
export type LoanEventType = (typeof EVENT_TYPES)[number];

/**
 * Payload shapes shared by real LoanEvent records, Scenario events and oracle fixture events.
 * RateChange: new i and/or new insurance components from k; bankInstallment only with BANK_INSTALLMENT ([ALG.RATE]).
 */
export const rateChangePayloadShape = {
  type: z.literal('RateChange'),
  policy: rateChangePolicySchema,
  interestRate: rateSchema.optional(),
  insuranceRates: z.array(rateSchema).max(10).optional(),
  bankInstallment: positiveMoneySchema.optional(),
} as const;

export const fixedChargeChangePayloadShape = {
  type: z.literal('FixedChargeChange'),
  fixedCharges: z.array(chargeItemSchema).max(20),
} as const;

export const prepaymentPayloadShape = {
  type: z.literal('Prepayment'),
  amount: positiveMoneySchema,
  mode: prepaymentModeSchema,
  commission: commissionSchema.optional(),
} as const;

export const advanceInstallmentsPayloadShape = {
  type: z.literal('AdvanceInstallments'),
  count: z.int().min(1).max(1200),
} as const;

interface RateChangeLike {
  readonly policy: RateChangePolicy;
  readonly interestRate?: string | undefined;
  readonly insuranceRates?: readonly string[] | undefined;
  readonly bankInstallment?: string | undefined;
}

/** Cross-field rules of a RateChange, reused by every schema that embeds rateChangePayloadShape. */
export function checkRateChange(value: RateChangeLike, ctx: z.RefinementCtx): void {
  if (value.interestRate === undefined && value.insuranceRates === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'A RateChange needs interestRate and/or insuranceRates',
      path: ['interestRate'],
    });
  }
  const isBank = value.policy === 'BANK_INSTALLMENT';
  if (isBank && value.bankInstallment === undefined) {
    ctx.addIssue({ code: 'custom', message: 'BANK_INSTALLMENT requires bankInstallment', path: ['bankInstallment'] });
  }
  if (!isBank && value.bankInstallment !== undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'bankInstallment is only allowed with BANK_INSTALLMENT',
      path: ['bankInstallment'],
    });
  }
}

const loanEventCommonShape = {
  ...baseRecordShape,
  loanId: uuidSchema,
  date: localDateSchema,
  note: noteSchema.optional(),
} as const;

export const rateChangeEventSchema = z
  .strictObject({ ...loanEventCommonShape, ...rateChangePayloadShape })
  .superRefine(checkRateChange);
export const fixedChargeChangeEventSchema = z.strictObject({
  ...loanEventCommonShape,
  ...fixedChargeChangePayloadShape,
});
export const prepaymentEventSchema = z.strictObject({ ...loanEventCommonShape, ...prepaymentPayloadShape });
export const advanceInstallmentsEventSchema = z.strictObject({
  ...loanEventCommonShape,
  ...advanceInstallmentsPayloadShape,
});

/**
 * Real events of a loan (ADR-0005): associated to installment k by `date` ([ALG.EVENTS.ANCHOR]).
 * Hypothetical events live inside Scenario.events, never here.
 */
export const loanEventSchema = z.discriminatedUnion('type', [
  rateChangeEventSchema,
  fixedChargeChangeEventSchema,
  prepaymentEventSchema,
  advanceInstallmentsEventSchema,
]);
export type LoanEvent = z.infer<typeof loanEventSchema>;
