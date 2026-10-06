import { InvalidInputError, type Rate } from '../types/primitives.ts';
import { DomainDecimal } from './decimal-config.ts';
import { dec, toPlainString } from './money.ts';

/** Tasa aceptada por `parseRate`: fracción decimal ≥ 0, sin signo ni exponente. */
const RATE_INPUT = /^\d+(?:\.\d+)?$/;

/** Porcentaje aceptado por `percentToRate`: ≥ 0, con hasta 4 decimales, sin signo ni exponente. */
const PERCENT_INPUT = /^\d+(?:\.\d{1,4})?$/;

/** Decimales máximos de un porcentaje (W3-06 y W4-07 escriben tasas en porcentaje con hasta 4 decimales). */
export const MAX_PERCENT_DECIMALS = 4;

/** Valida una tasa anual o periódica en string decimal y la devuelve en forma canónica ('0.0700' → '0.07'). */
export function parseRate(input: unknown): Rate {
  if (typeof input !== 'string' || !RATE_INPUT.test(input)) {
    throw new InvalidInputError('INVALID_RATE', 'Expected a non-negative decimal string without exponent');
  }
  return toPlainString(new DomainDecimal(input)) as Rate;
}

/** Verdadero si `input` ya es un `Rate` canónico. */
export function isRate(input: unknown): input is Rate {
  return typeof input === 'string' && RATE_INPUT.test(input) && parseRate(input) === input;
}

/**
 * [ALG.TERMS] r = (i + f) / 12 con f = Σ fⱼ (primero la suma de seguros, en orden de arreglo), sin HALF_UP_2: queda en
 * el contexto de 34 dígitos. Solo alimenta [ALG.LEVEL]; el cargo de FHA_GT_V1 es HALF_UP_2((B · (i + f)) / 12), nunca B
 * por esta r ya redondeada ([ALG.CONV]).
 */
export function periodicRate(interestRate: Rate, insuranceRates: readonly Rate[]): Rate {
  const insurance = insuranceRates.reduce((total, rate) => total.plus(dec(rate)), new DomainDecimal(0));
  return toPlainString(dec(interestRate).plus(insurance).div(12)) as Rate;
}

/**
 * Porcentaje → fracción por corrimiento decimal exacto, sin pasar por `number` ('7.25' → '0.0725', '1.26' → '0.0126').
 * Rechaza `number` de JavaScript, exponentes, negativos y más de 4 decimales.
 */
export function percentToRate(percent: unknown): Rate {
  if (typeof percent !== 'string' || !PERCENT_INPUT.test(percent)) {
    throw new InvalidInputError('INVALID_PERCENT', 'Expected a non-negative percent string with at most 4 decimals');
  }
  return toPlainString(new DomainDecimal(`${percent}e-2`)) as Rate;
}

/**
 * Fracción → porcentaje por corrimiento decimal exacto ('0.0126' → '1.26', '0.07' → '7').
 * Lanza si el porcentaje resultante tendría más de 4 decimales.
 */
export function rateToPercent(rate: Rate): string {
  const percent = new DomainDecimal(`${parseRate(rate)}e2`);
  if (percent.decimalPlaces() > MAX_PERCENT_DECIMALS) {
    throw new InvalidInputError('INVALID_PERCENT', 'Rate has more than 4 decimals as a percent');
  }
  return toPlainString(percent);
}
