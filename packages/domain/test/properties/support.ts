/** Utilidades de las pruebas de propiedades (W3-02): ejecución tolerante a errores tipados e invariantes de filas. */
import { expect } from 'vitest';
import {
  buildSchedule,
  compareMoney,
  type DomainEvent,
  InvalidInputError,
  type LoanTerms,
  moneyAdd,
  moneySub,
  moneySum,
  NegativeAmortizationError,
  type Schedule,
  ZERO_MONEY,
} from '../../src/index.ts';

export type Attempt =
  | { readonly kind: 'ok'; readonly schedule: Schedule }
  | { readonly kind: 'negative-amortization'; readonly error: NegativeAmortizationError }
  | { readonly kind: 'out-of-range'; readonly error: InvalidInputError };

/**
 * Construye el calendario. Los errores tipados que la regla [ALG.*] prevé para entradas generadas al azar se devuelven
 * como resultado (la propiedad decide qué hacer); cualquier otro error se propaga y falla la propiedad.
 */
export function attempt(terms: LoanTerms, events: readonly DomainEvent[]): Attempt {
  try {
    return { kind: 'ok', schedule: buildSchedule(terms, events) };
  } catch (error) {
    if (error instanceof NegativeAmortizationError) {
      return { kind: 'negative-amortization', error };
    }
    // [ALG.EVENTS.ANCHOR] regla 3: un evento propio que cae después de la última cuota (p. ej. tras una liquidación).
    if (error instanceof InvalidInputError && error.code === 'INSTALLMENT_OUT_OF_RANGE') {
      return { kind: 'out-of-range', error };
    }
    throw error;
  }
}

/** Congela en profundidad un valor para que cualquier mutación del motor lance en modo estricto. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

/** Invariantes de fila válidos para todo calendario, con o sin eventos ([ALG.PERIOD], [ALG.LAST], [ALG.PREPAY.CAP]). */
export function expectRowConsistency(schedule: Schedule, terms: LoanTerms): void {
  const { rows, totals } = schedule;
  expect(rows.length).toBeGreaterThanOrEqual(1);
  expect(schedule.installmentCount).toBe(rows.length);
  expect(schedule.currency).toBe(terms.currency);
  expect(schedule.roundingProfile).toBe(terms.roundingProfile);
  expect(schedule.endDate).toBe(rows[rows.length - 1]?.dueDate);
  rows.forEach((row, index) => {
    expect(row.k).toBe(index + 1);
    const isTerminal = index === rows.length - 1;
    expect(row.isLast || row.payoff).toBe(isTerminal);
    expect(row.closing).toBe(moneySub(row.opening, row.capital));
    expect(row.closingAfterPrepayment).toBe(moneySub(row.closing, row.prepayment));
    expect(row.insurance).toBe(moneySum(row.insuranceComponents));
    expect(row.total).toBe(moneySum([row.capital, row.interest, row.insurance, row.fixedCharges]));
    expect(compareMoney(row.prepayment, ZERO_MONEY)).toBeGreaterThanOrEqual(0);
    expect(compareMoney(row.commission, ZERO_MONEY)).toBeGreaterThanOrEqual(0);
    if (index > 0) {
      expect(row.opening).toBe(rows[index - 1]?.closingAfterPrepayment);
    }
  });
  expect(rows[rows.length - 1]?.closingAfterPrepayment).toBe(ZERO_MONEY);
  const sum = (pick: (row: Schedule['rows'][number]) => ReturnType<typeof moneySum>) => moneySum(rows.map(pick));
  expect(totals.capital).toBe(sum((row) => row.capital));
  expect(totals.interest).toBe(sum((row) => row.interest));
  expect(totals.insurance).toBe(sum((row) => row.insurance));
  expect(totals.fixedCharges).toBe(sum((row) => row.fixedCharges));
  expect(totals.prepayments).toBe(sum((row) => row.prepayment));
  expect(totals.commissions).toBe(sum((row) => row.commission));
  expect(totals.total).toBe(sum((row) => row.total));
  expect(totals.totalPaid).toBe(moneyAdd(moneyAdd(totals.total, totals.prepayments), totals.commissions));
}
