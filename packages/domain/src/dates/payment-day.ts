import {
  type DayOfMonth,
  END_OF_MONTH,
  InvalidInputError,
  type LocalDate,
  type PaymentDay,
} from '../types/primitives.ts';
import {
  compareLocalDate,
  daysInMonth,
  fromMonthIndex,
  localDateParts,
  makeLocalDate,
  monthIndex,
} from './local-date.ts';

/** Valida un día de pago: entero 1–31 o 'END_OF_MONTH' ([ALG.TERMS]). */
export function parsePaymentDay(input: unknown): PaymentDay {
  if (input === END_OF_MONTH) {
    return END_OF_MONTH;
  }
  if (typeof input !== 'number' || !Number.isInteger(input) || input < 1 || input > 31) {
    throw new InvalidInputError('INVALID_PAYMENT_DAY', 'Expected an integer 1-31 or END_OF_MONTH');
  }
  return input as DayOfMonth;
}

/** [ALG.DATES] Día de vencimiento en un mes: el último día con END_OF_MONTH; si no, min(d, días del mes). */
export function dueDayOfMonth(year: number, month: number, paymentDay: PaymentDay): number {
  const lastDay = daysInMonth(year, month);
  return paymentDay === END_OF_MONTH ? lastDay : Math.min(paymentDay, lastDay);
}

/** Misma fecha, con el día re-derivado según `paymentDay` (W4-07: END_OF_MONTH lleva 2027-03-15 a 2027-03-31). */
export function alignToPaymentDay(date: LocalDate, paymentDay: PaymentDay): LocalDate {
  const { year, month } = localDateParts(date);
  return makeLocalDate(year, month, dueDayOfMonth(year, month, paymentDay));
}

/** [ALG.DATES] Consistencia: el día de `firstDueDate` cumple la regla de `paymentDay` en su propio mes. */
export function isFirstDueDateConsistent(firstDueDate: LocalDate, paymentDay: PaymentDay): boolean {
  return alignToPaymentDay(firstDueDate, paymentDay) === firstDueDate;
}

/** [ALG.DATES] / [ALG.ERRORS] Lanza `InvalidInputError('FIRST_DUE_DATE_MISMATCH')` ante un par inválido. */
export function assertFirstDueDateConsistent(firstDueDate: LocalDate, paymentDay: PaymentDay): void {
  if (!isFirstDueDateConsistent(firstDueDate, paymentDay)) {
    throw new InvalidInputError('FIRST_DUE_DATE_MISMATCH', 'firstDueDate does not match the paymentDay rule', {
      firstDueDate,
      paymentDay,
    });
  }
}

function assertInstallmentNumber(k: number): void {
  if (!Number.isSafeInteger(k) || k < 1) {
    throw new InvalidInputError('INSTALLMENT_OUT_OF_RANGE', 'Installment numbers start at 1', { k });
  }
}

/** [ALG.DATES] Vencimiento de la cuota k (1-indexada): mes de `firstDueDate` + (k − 1), día según `paymentDay`. */
export function dueDateFor(firstDueDate: LocalDate, paymentDay: PaymentDay, k: number): LocalDate {
  assertInstallmentNumber(k);
  const { year, month } = fromMonthIndex(monthIndex(firstDueDate) + (k - 1));
  return makeLocalDate(year, month, dueDayOfMonth(year, month, paymentDay));
}

/** [ALG.DATES] Vencimientos de las cuotas 1 … count. */
export function dueDates(firstDueDate: LocalDate, paymentDay: PaymentDay, count: number): LocalDate[] {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new InvalidInputError('INVALID_INTEGER', 'count must be a non-negative safe integer');
  }
  return Array.from({ length: count }, (_, index) => dueDateFor(firstDueDate, paymentDay, index + 1));
}

/**
 * [ALG.EVENTS.ANCHOR] regla 2: la primera cuota k ≥ 1 cuyo vencimiento es ≥ `date`.
 * No conoce el calendario: quien llama valida que k no pase de su última cuota (regla 3), salvo en eventos heredados.
 */
export function installmentOnOrAfter(firstDueDate: LocalDate, paymentDay: PaymentDay, date: LocalDate): number {
  const k = monthIndex(date) - monthIndex(firstDueDate) + 1;
  if (k < 1) {
    return 1;
  }
  return compareLocalDate(dueDateFor(firstDueDate, paymentDay, k), date) >= 0 ? k : k + 1;
}
