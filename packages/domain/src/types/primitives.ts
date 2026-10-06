/**
 * Contrato congelado de W0-03: primitivas del dominio y errores tipados.
 * Dinero y tasas son strings decimales marcados y las fechas son `LocalDate` ([ALG.CONV]).
 * Los errores siguen la tabla [ALG.ERRORS] de docs/algorithm.md.
 * Cambiarlo exige una micro-tarjeta de Opus (docs/plan/README.md, sección 5).
 */

declare const brand: unique symbol;

/** Marca nominal: un `string`, un `number` o un `Date` no son asignables a un tipo marcado. */
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };

/** Monto con exactamente 2 decimales y sin exponente ('500000.00', '-12.34'). Se obtiene solo con `money/`. */
export type Money = Brand<string, 'Money'>;

/** Tasa como fracción decimal ≥ 0, sin exponente y sin ceros finales ('0.07' = 7 %). Se obtiene solo con `money/`. */
export type Rate = Brand<string, 'Rate'>;

/** Fecha de calendario 'AAAA-MM-DD', sin hora ni zona ([ALG.CONV]). Se obtiene solo con `dates/`. */
export type LocalDate = Brand<string, 'LocalDate'>;

/** [ALG.TERMS] Monedas de v1. Nunca se mezclan en un cálculo. */
export const CURRENCIES = ['GTQ', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** [ALG.TERMS] Perfiles de redondeo. */
export const ROUNDING_PROFILES = ['FHA_GT_V1', 'SIMPLE'] as const;
export type RoundingProfile = (typeof ROUNDING_PROFILES)[number];

/** [ALG.TERMS] Tipo de tasa. Informativo: el motor lo ignora. */
export const RATE_TYPES = ['FIXED', 'VARIABLE'] as const;
export type RateType = (typeof RATE_TYPES)[number];

/** Día del mes de un vencimiento ([ALG.DATES]). */
export type DayOfMonth =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30
  | 31;

/** [ALG.TERMS] Día de pago: un día del mes o el último día del mes. */
export const END_OF_MONTH = 'END_OF_MONTH';
export type PaymentDay = DayOfMonth | typeof END_OF_MONTH;

/** Id de una tarjeta del plan, p. ej. 'W1-01'. */
export type CardId = `W${number}-${string}`;

/** Discriminante de la jerarquía de errores del dominio. */
export type DomainErrorKind =
  'NotImplemented' | 'InvalidInput' | 'NegativeAmortization' | 'CurrencyMismatch' | 'InfeasibleGoal';

/**
 * [ALG.ERRORS] Ids de regla, sin corchetes, que lleva un error tipado: el `rule` del `{type, rule, k}` con que los
 * ejemplos de docs/specs/algorithm-examples registran un error esperado.
 */
export const ERROR_RULES = [
  'ALG.CONV',
  'ALG.TERMS',
  'ALG.TERM',
  'ALG.DATES',
  'ALG.EVENTS',
  'ALG.EVENTS.ANCHOR',
  'ALG.RATE.KEEP_INSTALLMENT',
  'ALG.RATE.BANK_INSTALLMENT',
  'ALG.PATHS.CUTOFF',
  'ALG.GOAL',
  'ALG.TEMPLATES',
  'ALG.TEMPLATES.FIXED',
] as const;
export type ErrorRule = (typeof ERROR_RULES)[number];

/**
 * Raíz de los errores tipados del dominio. `name`, `rule` y `k` forman el `{type, rule, k}` de [ALG.ERRORS]; los
 * ejemplos omiten `k` cuando aquí vale `null`. La UI decide el texto en español a partir de `kind` y `code`.
 */
export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;
  /** [ALG.ERRORS] Regla que exige el error; `null` solo en `NotImplementedError`. */
  abstract readonly rule: ErrorRule | null;
  /** [ALG.ERRORS] Cuota a la que se refiere el error, o `null` si la regla no nombra una. */
  abstract readonly k: number | null;
}

/** Lo lanza todo stub de un directorio cuya tarjeta dueña aún no llegó. No es un error de [ALG.ERRORS]. */
export class NotImplementedError extends DomainError {
  readonly kind = 'NotImplemented';
  readonly rule = null;
  readonly k = null;
  readonly cardId: CardId;

  constructor(cardId: CardId) {
    super(`Not implemented yet: owned by card ${cardId}`);
    this.name = 'NotImplementedError';
    this.cardId = cardId;
  }
}

/** Códigos cerrados de `InvalidInputError`: los «errores de validación tipados» de docs/algorithm.md. */
export const INVALID_INPUT_CODES = [
  'INVALID_DECIMAL',
  'INVALID_MONEY',
  'INVALID_RATE',
  'INVALID_PERCENT',
  'INVALID_DATE',
  'INVALID_PAYMENT_DAY',
  'INVALID_INTEGER',
  'ZERO_DIVISOR',
  'FIRST_DUE_DATE_MISMATCH',
  'INVALID_TERMS',
  'INVALID_EVENT',
  'INSTALLMENT_OUT_OF_RANGE',
  'MISSING_INSTALLMENT_NUMBER',
  'HYPOTHETICAL_BEFORE_CUTOFF',
  'NEGATIVE_FIXED_CHARGES',
  'UNKNOWN_TEMPLATE',
] as const;
export type InvalidInputCode = (typeof INVALID_INPUT_CODES)[number];

/**
 * [ALG.ERRORS] Regla de cada código de `InvalidInputError`, por fila de la tabla:
 * `FIRST_DUE_DATE_MISMATCH` ([ALG.DATES]); `INSTALLMENT_OUT_OF_RANGE` (k < 1, o k después de la última cuota del
 * calendario) y `MISSING_INSTALLMENT_NUMBER` (el `ActualPayment` sin `installmentNumber`) ([ALG.EVENTS.ANCHOR]);
 * `HYPOTHETICAL_BEFORE_CUTOFF` ([ALG.PATHS.CUTOFF]). Los demás códigos son la fila de entradas mal formadas en una
 * frontera ([ALG.CONV], [ALG.TERMS], [ALG.EVENTS], [ALG.TEMPLATES], [ALG.TEMPLATES.FIXED]).
 */
export const INVALID_INPUT_RULES = {
  INVALID_DECIMAL: 'ALG.CONV',
  INVALID_MONEY: 'ALG.CONV',
  INVALID_RATE: 'ALG.CONV',
  INVALID_PERCENT: 'ALG.CONV',
  INVALID_DATE: 'ALG.CONV',
  INVALID_PAYMENT_DAY: 'ALG.TERMS',
  INVALID_INTEGER: 'ALG.CONV',
  ZERO_DIVISOR: 'ALG.CONV',
  FIRST_DUE_DATE_MISMATCH: 'ALG.DATES',
  INVALID_TERMS: 'ALG.TERMS',
  INVALID_EVENT: 'ALG.EVENTS',
  INSTALLMENT_OUT_OF_RANGE: 'ALG.EVENTS.ANCHOR',
  MISSING_INSTALLMENT_NUMBER: 'ALG.EVENTS.ANCHOR',
  HYPOTHETICAL_BEFORE_CUTOFF: 'ALG.PATHS.CUTOFF',
  NEGATIVE_FIXED_CHARGES: 'ALG.TEMPLATES.FIXED',
  UNKNOWN_TEMPLATE: 'ALG.TEMPLATES',
} as const satisfies { readonly [C in InvalidInputCode]: ErrorRule };
export type InvalidInputRule = (typeof INVALID_INPUT_RULES)[InvalidInputCode];

/**
 * Datos para interpolar el mensaje de la UI de `InvalidInputError` e `InfeasibleGoalError`. `k` es la cuota de
 * [ALG.ERRORS] cuando la regla nombra una (p. ej. `{ k: 0, max: 240 }`). Nunca datos personales.
 */
export interface ErrorDetails {
  readonly k?: number;
  readonly [key: string]: string | number | undefined;
}

/** Entrada inválida o regla de validación incumplida ([ALG.ERRORS]). `rule` sale de `INVALID_INPUT_RULES[code]`. */
export class InvalidInputError extends DomainError {
  readonly kind = 'InvalidInput';
  readonly code: InvalidInputCode;
  readonly rule: InvalidInputRule;
  readonly k: number | null;
  readonly details: ErrorDetails;

  constructor(code: InvalidInputCode, message: string, details: ErrorDetails = {}) {
    super(message);
    this.name = 'InvalidInputError';
    this.code = code;
    this.rule = INVALID_INPUT_RULES[code];
    this.k = details.k ?? null;
    this.details = details;
  }
}

/** [ALG.ERRORS] Reglas que exigen `NegativeAmortizationError`. */
export const NEGATIVE_AMORTIZATION_RULES = [
  'ALG.RATE.KEEP_INSTALLMENT',
  'ALG.RATE.BANK_INSTALLMENT',
  'ALG.TERM',
] as const;
export type NegativeAmortizationRule = (typeof NEGATIVE_AMORTIZATION_RULES)[number];

/**
 * [ALG.ERRORS] La cuota nivelada no cubre el cargo financiero: `level − financialCharge ≤ 0`, con el `financialCharge`
 * del perfil ([ALG.LAST]: `charge` en FHA_GT_V1, `interest + Σ insuranceⱼ` en SIMPLE). En la cuota k de un cambio de
 * tasa se calcula con el saldo B de k y las tasas nuevas ([ALG.RATE.KEEP_INSTALLMENT], [ALG.RATE.BANK_INSTALLMENT]);
 * en cualquier otra cuota de plazo derivado, la regla es [ALG.TERM].
 */
export class NegativeAmortizationError extends DomainError {
  readonly kind = 'NegativeAmortization';
  readonly rule: NegativeAmortizationRule;
  readonly k: number;
  readonly level: Money;
  readonly financialCharge: Money;

  constructor(rule: NegativeAmortizationRule, k: number, level: Money, financialCharge: Money) {
    super(
      `Level ${level} does not cover the financial charge ${financialCharge} at installment ${String(k)} (${rule})`,
    );
    this.name = 'NegativeAmortizationError';
    this.rule = rule;
    this.k = k;
    this.level = level;
    this.financialCharge = financialCharge;
  }
}

/** [ALG.ERRORS] / R27: comparar calendarios de monedas distintas ([ALG.TERMS]). */
export class CurrencyMismatchError extends DomainError {
  readonly kind = 'CurrencyMismatch';
  readonly rule = 'ALG.TERMS';
  readonly k = null;
  readonly expected: Currency;
  readonly actual: Currency;

  constructor(expected: Currency, actual: Currency) {
    super(`Currency mismatch: expected ${expected}, got ${actual}`);
    this.name = 'CurrencyMismatchError';
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Códigos cerrados de `InfeasibleGoalError`: entradas inválidas de la búsqueda por meta ([ALG.GOAL], [ALG.ERRORS]).
 * `PREPAYMENT_NOT_AFTER_CUTOFF`: la cuota k del abono no es mayor que `cutoffK` (lleva `details.k`).
 * `PREPAYMENT_AFTER_END`: la cuota k del abono pasa de la última cuota del camino base (lleva `details.k`).
 * `INVALID_GOAL_AMOUNT`: el monto de `MAX_INSTALLMENT` es negativo (sin `k`; `0.00` es válido).
 * `SCENARIO_PATH_MISSING`: `basePath` es `'SCENARIO'` y los `Paths` no traen escenario (sin `k`).
 */
export const INFEASIBLE_GOAL_CODES = [
  'PREPAYMENT_NOT_AFTER_CUTOFF',
  'PREPAYMENT_AFTER_END',
  'INVALID_GOAL_AMOUNT',
  'SCENARIO_PATH_MISSING',
] as const;
export type InfeasibleGoalCode = (typeof INFEASIBLE_GOAL_CODES)[number];

/**
 * [ALG.ERRORS] Reservado para entradas inválidas de la búsqueda por meta: abono con k ≤ cutoffK o después de la última
 * cuota del camino base (con `k`), escenario faltante o `MAX_INSTALLMENT` negativo (sin `k`).
 * Una meta inalcanzable NO lanza: devuelve `GoalSeekResult` con `kind: 'INFEASIBLE'`.
 */
export class InfeasibleGoalError extends DomainError {
  readonly kind = 'InfeasibleGoal';
  readonly rule = 'ALG.GOAL';
  readonly code: InfeasibleGoalCode;
  readonly k: number | null;
  readonly details: ErrorDetails;

  constructor(code: InfeasibleGoalCode, message: string, details: ErrorDetails = {}) {
    super(message);
    this.name = 'InfeasibleGoalError';
    this.code = code;
    this.k = details.k ?? null;
    this.details = details;
  }
}
