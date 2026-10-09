import fc from 'fast-check';
import type { IsoInstant, LocalDate, MoneyString, RateString, Uuid } from '../common.ts';

const TEXT_UNITS = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ñáéíóú-_.,'];

const pad = (value: number, length: number): string => String(value).padStart(length, '0');

export const uuidArb: fc.Arbitrary<Uuid> = fc.uuid({ version: 4 });

/** Real calendar dates (day 1-28 keeps every month valid) between 2000 and 2060. */
export const localDateArb: fc.Arbitrary<LocalDate> = fc
  .tuple(fc.integer({ min: 2000, max: 2060 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
  .map(([year, month, day]) => `${String(year)}-${pad(month, 2)}-${pad(day, 2)}`);

export const isoInstantArb: fc.Arbitrary<IsoInstant> = fc
  .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2100, 0, 1) })
  .map((millis) => new Date(millis).toISOString());

const moneyOf = (units: number, cents: number): MoneyString => `${String(units)}.${pad(cents, 2)}`;

/** Non-negative amounts with exactly two decimals, up to 999,999,999.99. */
export const moneyArb: fc.Arbitrary<MoneyString> = fc
  .tuple(fc.integer({ min: 0, max: 999_999_999 }), fc.integer({ min: 0, max: 99 }))
  .map(([units, cents]) => moneyOf(units, cents));

/** Amounts greater than 0.00. */
export const positiveMoneyArb: fc.Arbitrary<MoneyString> = fc
  .tuple(fc.integer({ min: 0, max: 999_999_999 }), fc.integer({ min: 0, max: 99 }))
  .filter(([units, cents]) => units + cents > 0)
  .map(([units, cents]) => moneyOf(units, cents));

const rateOf = (micros: number): RateString => `0.${pad(micros, 6)}`;

/** Fractions with up to 6 decimals, 0.000000 to 0.999999. */
export const rateArb: fc.Arbitrary<RateString> = fc.integer({ min: 0, max: 999_999 }).map(rateOf);

/** Rates greater than zero. */
export const positiveRateArb: fc.Arbitrary<RateString> = fc.integer({ min: 1, max: 999_999 }).map(rateOf);

/** Free text with no leading or trailing whitespace and 1..maxLength characters. */
export function textArb(maxLength: number): fc.Arbitrary<string> {
  return fc
    .string({ unit: fc.constantFrom(...TEXT_UNITS), minLength: 1, maxLength })
    .filter((value) => value.trim() === value);
}

export const installmentArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 1200 });

/**
 * An object whose optional keys are absent, never `undefined`, so JSON round trips deep-equal.
 * `T` is the entity type the caller vouches for; the schema property tests prove it.
 */
export function recordWithOptionals<T>(
  required: Record<string, fc.Arbitrary<unknown>>,
  optional: Record<string, fc.Arbitrary<unknown>> = {},
): fc.Arbitrary<T> {
  return fc.record({ ...required, ...optional }, { requiredKeys: Object.keys(required) }) as fc.Arbitrary<T>;
}
