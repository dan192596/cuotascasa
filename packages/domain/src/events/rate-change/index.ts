import { periodicRate } from '../../money/index.ts';
import type { EngineContext, EventHandler, HandlerResult, PeriodState } from '../../types/engine.ts';
import type { RateChangeEvent } from '../../types/events.ts';
import { NegativeAmortizationError, type NegativeAmortizationRule } from '../../types/primitives.ts';

/**
 * [ALG.RATE.KEEP_INSTALLMENT] / [ALG.RATE.BANK_INSTALLMENT] Plazo derivado con la `level` y las tasas nuevas. La
 * simulación de `ctx.remainingTerm` ([ALG.TERM]) detecta la amortización nula o negativa; si ocurre en la cuota `k` del
 * cambio, se reporta con la regla de la política. En cualquier otra cuota queda la regla [ALG.TERM].
 */
function deriveTerm(ctx: EngineContext, next: PeriodState, k: number, rule: NegativeAmortizationRule): PeriodState {
  const derived: PeriodState = { ...next, termMode: 'DERIVED' };
  try {
    return { ...derived, term: derived.k + ctx.remainingTerm(derived) };
  } catch (error) {
    if (error instanceof NegativeAmortizationError && error.k === k) {
      throw new NegativeAmortizationError(rule, k, error.level, error.financialCharge);
    }
    throw error;
  }
}

/**
 * [ALG.RATE] Cambio de tasa (fase 1 de [ALG.EVENTS.ORDER]): `state` es el estado tras la cuota `k − 1` con la
 * apertura de `k` ya anclada. Las tasas omitidas no cambian. La fórmula de `level` y el plazo derivado viven en los
 * helpers de `ctx` ([ALG.LEVEL], [ALG.TERM]); este handler no los reimplementa.
 */
export const rateChangeHandler: EventHandler<'RateChange'> = ({ ctx, event, k, state }): HandlerResult => {
  const interestRate = event.interestRate ?? state.interestRate;
  const insuranceRates = event.insuranceRates ?? state.insuranceRates;
  const next: PeriodState = { ...state, interestRate, insuranceRates };
  return { state: applyPolicy(ctx, event, k, state, next) };
};

function applyPolicy(
  ctx: EngineContext,
  event: RateChangeEvent,
  k: number,
  previous: PeriodState,
  next: PeriodState,
): PeriodState {
  switch (event.policy) {
    case 'RECALC_INSTALLMENT_KEEP_TERM': {
      // [ALG.TERM]: con plazo derivado, el `term` vigente es (k − 1) + remainingTerm del estado previo.
      const term = previous.termMode === 'DERIVED' ? previous.k + ctx.remainingTerm(previous) : previous.term;
      const level = ctx.levelPayment(
        next.balance,
        periodicRate(next.interestRate, next.insuranceRates),
        term - previous.k,
      );
      return { ...next, level, termMode: 'FIXED', term };
    }
    case 'KEEP_INSTALLMENT_ADJUST_TERM':
      return deriveTerm(ctx, next, k, 'ALG.RATE.KEEP_INSTALLMENT');
    case 'BANK_INSTALLMENT':
      return deriveTerm(ctx, { ...next, level: event.bankInstallment }, k, 'ALG.RATE.BANK_INSTALLMENT');
  }
}
