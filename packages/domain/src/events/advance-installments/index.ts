import { compareMoney, moneySub, minMoney, maxMoney, ZERO_MONEY } from '../../money/index.ts';
import type { EventHandler, PeriodState } from '../../types/engine.ts';
import { InvalidInputError } from '../../types/primitives.ts';

/**
 * [ALG.ADVANCE] Adelantar N cuotas. Monto = `ctx.projectCapital(state, N)` (capital de las cuotas k+1 … k+N del
 * calendario vigente justo antes del evento), recortado como [ALG.PREPAY.CAP]. `level` y el modo del plazo no cambian:
 * con plazo fijo, `term` baja en N; con plazo derivado, `term = k + remainingTerm` del nuevo estado. Sin comisión.
 */
export const advanceInstallmentsHandler: EventHandler<'AdvanceInstallments'> = ({ ctx, event, state }) => {
  const { count } = event;
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new InvalidInputError('INVALID_EVENT', 'AdvanceInstallments needs an integer count >= 1', {
      eventId: event.id,
    });
  }
  // [ALG.PREPAY.CAP] closing_k − abonos ya aplicados en k = state.balance.
  if (compareMoney(state.balance, ZERO_MONEY) <= 0) {
    return { state, rowEffect: { prepayment: ZERO_MONEY, commission: ZERO_MONEY, payoff: false } };
  }
  // Dictamen A de Opus (provisional, pendiente de [ALG.ADVANCE]): con proyección negativa (solo si level < charge,
  // p. ej. tras un ancla al alza) el abono aplicado se acota a 0.00 y, en plazo fijo, `term` baja igualmente en N.
  const applied = maxMoney(ZERO_MONEY, minMoney(ctx.projectCapital(state, count), state.balance));
  const balance = moneySub(state.balance, applied);
  const payoff = compareMoney(balance, ZERO_MONEY) <= 0;
  const reduced: PeriodState = { ...state, balance };
  const term = payoff
    ? state.term
    : state.termMode === 'FIXED'
      ? state.term - count
      : state.k + ctx.remainingTerm(reduced);
  return {
    state: { ...reduced, term },
    rowEffect: { prepayment: applied, commission: ZERO_MONEY, payoff },
  };
};
