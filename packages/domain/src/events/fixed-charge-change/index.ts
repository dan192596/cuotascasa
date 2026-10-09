import { dueDateFor } from '../../dates/index.ts';
import type { EventHandler } from '../../types/engine.ts';

/**
 * [ALG.FIXEDCHANGE] Cambio de cargos fijos (fase 1 de [ALG.EVENTS.ORDER]). La lista del evento es COMPLETA: reemplaza
 * todos los cargos en vigor, incluidos los de `effectiveFrom` futuro, y rige desde el vencimiento de la cuota `k`.
 * No toca el saldo, la cuota nivelada ni el plazo ([ALG.FIXED]).
 */
export const fixedChargeChangeHandler: EventHandler<'FixedChargeChange'> = ({ terms, event, k, state }) => {
  const effectiveFrom = dueDateFor(terms.firstDueDate, terms.paymentDay, k);
  return {
    state,
    fixedCharges: event.fixedCharges.map((line) => ({ label: line.label, amount: line.amount, effectiveFrom })),
  };
};
