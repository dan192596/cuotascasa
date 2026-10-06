import { InvalidInputError, type Money } from '../types/primitives.ts';
import { DomainDecimal } from './decimal-config.ts';
import { dec, toMoney } from './money.ts';

/*
 * «Exacto» en este archivo: cada operación corre en el contexto de [ALG.CONV] (34 dígitos significativos) y no redondea
 * mientras el resultado tenga a lo sumo 32 dígitos enteros. Los montos de las fronteras (esquemas de W0-04) tienen a lo
 * sumo 13, así que un calendario nunca se acerca a ese límite.
 */

/** a + b, exacto. */
export function moneyAdd(a: Money, b: Money): Money {
  return toMoney(dec(a).plus(dec(b)));
}

/** a − b, exacto. */
export function moneySub(a: Money, b: Money): Money {
  return toMoney(dec(a).minus(dec(b)));
}

/** Σ values, exacto; '0.00' para una lista vacía. */
export function moneySum(values: readonly Money[]): Money {
  return toMoney(values.reduce((total, value) => total.plus(dec(value)), new DomainDecimal(0)));
}

/** −a. */
export function moneyNegate(value: Money): Money {
  return toMoney(dec(value).negated());
}

/** |a|. */
export function moneyAbs(value: Money): Money {
  return toMoney(dec(value).abs());
}

/** −1 si a < b, 0 si a = b, 1 si a > b. */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  const order = dec(a).comparedTo(dec(b));
  return order < 0 ? -1 : order > 0 ? 1 : 0;
}

/** El menor de dos montos (p. ej. el tope min(amount, closing_k − abonos ya aplicados en k) de [ALG.PREPAY.CAP]). */
export function minMoney(a: Money, b: Money): Money {
  return compareMoney(a, b) <= 0 ? a : b;
}

/** El mayor de dos montos. */
export function maxMoney(a: Money, b: Money): Money {
  return compareMoney(a, b) >= 0 ? a : b;
}

/** Verdadero si el monto es 0.00. */
export function moneyIsZero(value: Money): boolean {
  return dec(value).isZero();
}

/** Verdadero si el monto es menor que 0.00. */
export function moneyIsNegative(value: Money): boolean {
  return dec(value).lessThan(0);
}

/**
 * [ALG.GOAL] Punto medio de la bisección sobre centavos enteros: ⌊(a + b) / 2⌋ al centavo, exacto y sin `number`.
 * Es aritmética de índices de la búsqueda, no un redondeo de montos de [ALG.CONV].
 */
export function moneyMidpoint(a: Money, b: Money): Money {
  return toMoney(dec(a).plus(dec(b)).div(2).toDecimalPlaces(2, DomainDecimal.ROUND_FLOOR));
}

/**
 * part / whole × 100 en el contexto [ALG.CONV], redondeado mitad hacia arriba a `decimals` decimales.
 * Es para presentación en `data/` (p. ej. `percentPaid`); no es una regla de docs/algorithm.md.
 */
export function percentOf(part: Money, whole: Money, decimals: number): string {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 20) {
    throw new InvalidInputError('INVALID_INTEGER', 'decimals must be an integer between 0 and 20');
  }
  if (moneyIsZero(whole)) {
    throw new InvalidInputError('ZERO_DIVISOR', 'Cannot compute a percentage of zero');
  }
  return dec(part).div(dec(whole)).times(100).toDecimalPlaces(decimals, DomainDecimal.ROUND_HALF_UP).toFixed(decimals);
}
