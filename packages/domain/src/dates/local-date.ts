import { InvalidInputError, type LocalDate } from '../types/primitives.ts';

/** 'AAAA-MM-DD' exacto: sin hora, zona ni espacios ([ALG.CONV]). */
const LOCAL_DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;

/** Partes numéricas de una `LocalDate`. `month` va de 1 a 12. */
export interface LocalDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function invalidDate(): InvalidInputError {
  return new InvalidInputError('INVALID_DATE', 'Expected a valid calendar date YYYY-MM-DD');
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** Año bisiesto gregoriano. */
export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Días del mes `month` (1–12) del año `year`. */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw invalidDate();
  }
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** Construye una `LocalDate` validando año 1–9999, mes 1–12 y día dentro del mes. */
export function makeLocalDate(year: number, month: number, day: number): LocalDate {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(day) || day < 1) {
    throw invalidDate();
  }
  if (day > daysInMonth(year, month)) {
    throw invalidDate();
  }
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as LocalDate;
}

/** Valida 'AAAA-MM-DD' (fecha de calendario real) y devuelve la `LocalDate`. Rechaza `Date`, números y horas. */
export function parseLocalDate(input: unknown): LocalDate {
  if (typeof input !== 'string' || !LOCAL_DATE_INPUT.test(input)) {
    throw invalidDate();
  }
  const { year, month, day } = localDateParts(input as LocalDate);
  return makeLocalDate(year, month, day);
}

/** Verdadero si `input` es una `LocalDate` válida. */
export function isLocalDate(input: unknown): input is LocalDate {
  try {
    parseLocalDate(input);
    return true;
  } catch {
    return false;
  }
}

/** Año, mes (1–12) y día de una `LocalDate`. */
export function localDateParts(date: LocalDate): LocalDateParts {
  return {
    year: Number.parseInt(date.slice(0, 4), 10),
    month: Number.parseInt(date.slice(5, 7), 10),
    day: Number.parseInt(date.slice(8, 10), 10),
  };
}

/** −1 si a < b, 0 si son iguales, 1 si a > b (orden de calendario). */
export function compareLocalDate(a: LocalDate, b: LocalDate): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Índice de mes 30/360 ([ALG.CONV]): año × 12 + (mes − 1). La diferencia de índices cuenta meses enteros. */
export function monthIndex(date: LocalDate): number {
  const { year, month } = localDateParts(date);
  return year * 12 + (month - 1);
}

/** Inverso de `monthIndex`: año y mes (1–12) de un índice de mes. */
export function fromMonthIndex(index: number): { readonly year: number; readonly month: number } {
  const year = Math.floor(index / 12);
  return { year, month: index - year * 12 + 1 };
}

/** Último día del mes de `date`. */
export function endOfMonth(date: LocalDate): LocalDate {
  const { year, month } = localDateParts(date);
  return makeLocalDate(year, month, daysInMonth(year, month));
}

/**
 * Suma `months` meses enteros (puede ser negativo). Si el día no existe en el mes destino, se acota al último día:
 * 2025-01-31 + 1 = 2025-02-28 y 2024-01-31 + 1 = 2024-02-29.
 */
export function addMonths(date: LocalDate, months: number): LocalDate {
  if (!Number.isSafeInteger(months)) {
    throw new InvalidInputError('INVALID_INTEGER', 'months must be a safe integer');
  }
  const { day } = localDateParts(date);
  const { year, month } = fromMonthIndex(monthIndex(date) + months);
  return makeLocalDate(year, month, Math.min(day, daysInMonth(year, month)));
}
