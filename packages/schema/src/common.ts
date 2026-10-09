import { z } from 'zod';

// Strict CSP with Trusted Types (ADR-0021): zod's JIT probes `new Function`, and even though zod catches the error the
// browser reports a securitypolicyviolation. Every schema module imports this file, so the switch is set before any parse.
z.config({ jitless: true });

/** UUID string (RFC 9562), as produced by crypto.randomUUID(). */
export type Uuid = string;
/** Business date 'YYYY-MM-DD' with no time or zone ([ALG.CONV]). */
export type LocalDate = string;
/** Instant in ISO 8601 UTC with milliseconds, exactly Date.prototype.toISOString() output. */
export type IsoInstant = string;
/** Non-negative amount with exactly two decimals, e.g. '500000.00' ([ALG.CONV]). */
export type MoneyString = string;
/** Possibly negative amount with exactly two decimals, e.g. '-12.50' (differences only). */
export type SignedMoneyString = string;
/**
 * Non-negative annual rate as a decimal fraction with at most 6 decimals (the ones rateToPercent round-trips, D24),
 * e.g. '0.07' = 7 % ([ALG.CONV]).
 */
export type RateString = string;

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MONEY_PATTERN = /^(0|[1-9]\d{0,12})\.\d{2}$/;
const SIGNED_MONEY_PATTERN = /^-?(0|[1-9]\d{0,12})\.\d{2}$/;
const RATE_PATTERN = /^(0|[1-9])(\.\d{1,6})?$/;
const ZERO_RATE_PATTERN = /^0(\.0+)?$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** True when `value` is a real calendar date written as 'YYYY-MM-DD' (year 0001-9999). */
export function isValidLocalDate(value: string): boolean {
  if (!LOCAL_DATE_PATTERN.test(value)) {
    return false;
  }
  const year = Number.parseInt(value.slice(0, 4), 10);
  const month = Number.parseInt(value.slice(5, 7), 10);
  const day = Number.parseInt(value.slice(8, 10), 10);
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  return day <= daysInMonth(year, month);
}

/** True when `value` is exactly what Date.prototype.toISOString() prints for a real instant. */
export function isValidIsoInstant(value: string): boolean {
  if (!INSTANT_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

/** True when a rate string is zero ('0', '0.0', '0.0000'). */
export function isZeroRate(value: RateString): boolean {
  return ZERO_RATE_PATTERN.test(value);
}

export const uuidSchema = z.uuid();

export const localDateSchema = z.string().refine(isValidLocalDate, { message: 'Expected a calendar date YYYY-MM-DD' });

export const isoInstantSchema = z
  .string()
  .refine(isValidIsoInstant, { message: 'Expected an ISO 8601 UTC instant YYYY-MM-DDTHH:mm:ss.sssZ' });

export const moneySchema = z
  .string()
  .regex(MONEY_PATTERN, { message: 'Expected a non-negative decimal string with exactly 2 decimals' });

export const positiveMoneySchema = moneySchema.refine((value) => value !== '0.00', {
  message: 'Expected an amount greater than 0.00',
});

export const signedMoneySchema = z
  .string()
  .regex(SIGNED_MONEY_PATTERN, { message: 'Expected a decimal string with exactly 2 decimals' })
  .refine((value) => value !== '-0.00', { message: 'Negative zero is not allowed' });

export const rateSchema = z
  .string()
  .regex(RATE_PATTERN, { message: 'Expected a non-negative decimal fraction with at most 6 decimals, such as 0.07' });

export const positiveRateSchema = rateSchema.refine((value) => !isZeroRate(value), {
  message: 'Expected a rate greater than 0',
});

export const CURRENCIES = ['GTQ', 'USD'] as const;
export const currencySchema = z.enum(CURRENCIES);
export type Currency = z.infer<typeof currencySchema>;

/** Installment number k, 1-indexed ([ALG.EVENTS.ANCHOR]). */
export const installmentNumberSchema = z.int().min(1).max(1200);

/** Free text without leading or trailing whitespace. */
export function textSchema(maxLength: number) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value.trim() === value, { message: 'No leading or trailing whitespace' });
}

/** Optional free-text note on ReportedBalance, ActualPayment and LoanEvent (glossary: «Nota»). */
export const noteSchema = textSchema(500);

/**
 * Fields every persisted entity carries (ADR-0005 decision 2).
 * updatedAt is monotonic per device; deletedAt is the tombstone instant or null.
 */
export const baseRecordShape = {
  id: uuidSchema,
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
  updatedByDevice: uuidSchema,
  deletedAt: isoInstantSchema.nullable(),
} as const;

export const baseRecordSchema = z.strictObject(baseRecordShape);
export type BaseRecord = z.infer<typeof baseRecordSchema>;
