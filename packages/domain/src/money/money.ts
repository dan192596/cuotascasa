import { InvalidInputError, type Money, type Rate } from '../types/primitives.ts';
import { type Dec, DomainDecimal } from './decimal-config.ts';

/** Entrada de `parseMoney`: signo opcional, dígitos y 0–2 decimales. Sin exponente, espacios ni separadores. */
const MONEY_INPUT = /^-?\d+(?:\.\d{1,2})?$/;

/** '0.00' como `Money`. */
export const ZERO_MONEY = '0.00' as Money;

/** Crea un decimal del contexto [ALG.CONV] a partir de un `Money` o un `Rate` (construcción exacta, sin redondeo). */
export function dec(value: Money | Rate): Dec {
  return new DomainDecimal(value);
}

/** Crea un decimal a partir de un entero seguro (número de cuotas, meses, el divisor 12). */
export function decInt(value: number): Dec {
  if (!Number.isSafeInteger(value)) {
    throw new InvalidInputError('INVALID_INTEGER', 'Expected a safe integer');
  }
  return new DomainDecimal(value);
}

/**
 * Valida un monto en string decimal y lo devuelve en forma canónica con 2 decimales ('1234.5' → '1234.50').
 * Rechaza `number` de JavaScript, exponentes, más de 2 decimales, espacios y separadores de miles. No acota la
 * magnitud: la aritmética de `money/` es exacta hasta 32 dígitos enteros ([ALG.CONV]).
 */
export function parseMoney(input: unknown): Money {
  if (typeof input !== 'string' || !MONEY_INPUT.test(input)) {
    throw new InvalidInputError('INVALID_MONEY', 'Expected a decimal string with at most 2 decimals');
  }
  return new DomainDecimal(input).toFixed(2) as Money;
}

/** Verdadero si `input` ya es un `Money` canónico (2 decimales, sin ceros a la izquierda ni '-0.00'). */
export function isMoney(input: unknown): input is Money {
  return typeof input === 'string' && MONEY_INPUT.test(input) && parseMoney(input) === input;
}

/** Decimal con a lo sumo 2 decimales → `Money`, sin redondear. Si haría falta redondear, lanza. */
export function toMoney(value: Dec): Money {
  if (!value.isFinite() || value.decimalPlaces() > 2) {
    throw new InvalidInputError('INVALID_MONEY', 'Value is not an exact amount with at most 2 decimals');
  }
  return value.toFixed(2) as Money;
}

/**
 * [ALG.CONV] HALF_UP_2: redondeo a 2 decimales, mitad lejos de cero (0.005 → 0.01, −0.005 → −0.01).
 * Es el ÚNICO redondeo a centavos del dominio y solo se usa donde docs/algorithm.md escribe HALF_UP_2.
 */
export function halfUp2(value: Dec): Money {
  if (!value.isFinite()) {
    throw new InvalidInputError('INVALID_DECIMAL', 'Cannot round a non-finite value');
  }
  return value.toDecimalPlaces(2, DomainDecimal.ROUND_HALF_UP).toFixed(2) as Money;
}

/** Decimal → string plano: sin exponente, sin ceros finales y sin '-0' ('1e-8' → '0.00000001'). */
export function toPlainString(value: Dec): string {
  if (!value.isFinite()) {
    throw new InvalidInputError('INVALID_DECIMAL', 'Cannot format a non-finite value');
  }
  return value.toFixed();
}
