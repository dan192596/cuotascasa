import { Decimal } from 'decimal.js';

/** [ALG.CONV] Precisión del contexto decimal: 34 dígitos significativos (igual que Python `decimal` con prec = 34). */
export const DECIMAL_PRECISION = 34;

/** [ALG.CONV] Redondeo intermedio ROUND_HALF_EVEN (código 6 de decimal.js). */
export const DECIMAL_ROUNDING: Decimal.Rounding = Decimal.ROUND_HALF_EVEN;

/**
 * Constructor aislado de decimal.js con el contexto de [ALG.CONV].
 * Es un clon: la configuración global de decimal.js nunca se toca (prohibido `Decimal.set`), y `defaults: true` hace
 * que tampoco herede de ella `toExpNeg`, `toExpPos`, `maxE`, `minE`, `modulo` ni `crypto` al cargarse.
 * Todo el dominio crea sus decimales con este constructor (vía `dec`/`decInt` de `money/`).
 */
export const DomainDecimal: Decimal.Constructor = Decimal.clone({
  defaults: true,
  precision: DECIMAL_PRECISION,
  rounding: DECIMAL_ROUNDING,
});

/** Instancia decimal del dominio. */
export type Dec = Decimal;
