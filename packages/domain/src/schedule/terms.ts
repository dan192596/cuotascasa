import { assertFirstDueDateConsistent } from '../dates/index.ts';
import { compareMoney, ZERO_MONEY } from '../money/index.ts';
import type { LoanTerms } from '../types/loan.ts';
import { CURRENCIES, InvalidInputError, ROUNDING_PROFILES } from '../types/primitives.ts';

/**
 * [ALG.TERMS] / [ALG.DATES] Valida las condiciones antes de calcular: principal > 0, plazo entero ≥ 1, moneda y perfil
 * conocidos, y la consistencia de `firstDueDate` con `paymentDay`. Lanza `InvalidInputError`.
 */
export function validateTerms(terms: LoanTerms): void {
  if (compareMoney(terms.principal, ZERO_MONEY) <= 0) {
    throw new InvalidInputError('INVALID_TERMS', 'principal must be greater than zero');
  }
  if (!Number.isSafeInteger(terms.termMonths) || terms.termMonths < 1) {
    throw new InvalidInputError('INVALID_TERMS', 'termMonths must be an integer >= 1', {
      termMonths: terms.termMonths,
    });
  }
  if (!CURRENCIES.includes(terms.currency)) {
    throw new InvalidInputError('INVALID_TERMS', 'currency must be GTQ or USD');
  }
  if (!ROUNDING_PROFILES.includes(terms.roundingProfile)) {
    throw new InvalidInputError('INVALID_TERMS', 'roundingProfile must be FHA_GT_V1 or SIMPLE');
  }
  assertFirstDueDateConsistent(terms.firstDueDate, terms.paymentDay);
}
