import { compareMoney, minMoney, moneySub, periodicRate, ZERO_MONEY } from '../../money/index.ts';
import { isStubHandler } from '../../stub.ts';
import type { EngineContext, EventHandler, EventHandlerRegistry } from '../../types/engine.ts';
import type { DomainEventType } from '../../types/events.ts';
import { InvalidInputError } from '../../types/primitives.ts';

/**
 * Handler de PRUEBA de un `Prepayment` `REDUCE_TERM` sin comisión ([ALG.PREPAY.CAP], [ALG.PREPAY.REDUCE_TERM]).
 * Existe solo para que las pruebas de W2-05 no dependan del código de W2-04: no es el handler del producto.
 */
export const testPrepaymentHandler: EventHandler<'Prepayment'> = ({ ctx, event, state, row }) => {
  if (row === null || event.mode !== 'REDUCE_TERM' || event.commission !== undefined) {
    throw new InvalidInputError(
      'INVALID_EVENT',
      'The test prepayment handler only supports REDUCE_TERM without commission',
    );
  }
  const applied = minMoney(event.amount, moneySub(row.closing, row.prepayment));
  const balance = moneySub(state.balance, applied);
  const payoff = compareMoney(balance, ZERO_MONEY) <= 0;
  const reduced = { ...state, balance, termMode: 'DERIVED' as const };
  return {
    state: payoff ? reduced : { ...reduced, term: state.k + ctx.remainingTerm(reduced) },
    rowEffect: { prepayment: applied, payoff },
  };
};

/**
 * Handler de PRUEBA de un `RateChange` `RECALC_INSTALLMENT_KEEP_TERM` ([ALG.RATE.RECALC_KEEP_TERM]), solo para las
 * pruebas de W2-05. El plazo vigente de un plazo derivado es `(k − 1) + remainingTerm` ([ALG.TERM]).
 */
export const testRateChangeHandler: EventHandler<'RateChange'> = ({ ctx, event, k, state }) => {
  if (event.policy !== 'RECALC_INSTALLMENT_KEEP_TERM') {
    throw new InvalidInputError('INVALID_EVENT', 'The test rate handler only supports RECALC_INSTALLMENT_KEEP_TERM');
  }
  const interestRate = event.interestRate ?? state.interestRate;
  const insuranceRates = event.insuranceRates ?? state.insuranceRates;
  const term = state.termMode === 'DERIVED' ? state.k + ctx.remainingTerm(state) : state.term;
  return {
    state: {
      ...state,
      interestRate,
      insuranceRates,
      termMode: 'FIXED',
      term,
      level: ctx.levelPayment(state.balance, periodicRate(interestRate, insuranceRates), term - (k - 1)),
    },
  };
};

/**
 * Contexto de prueba: conserva los handlers reales del registro y sustituye solo los que aún son stubs de otra tarjeta
 * (W2-03, W2-04) por los de este archivo. Cuando esas tarjetas se fusionan, las mismas pruebas usan el código real.
 */
export function withTestHandlers(base: EngineContext): EngineContext {
  const registry: EventHandlerRegistry = {
    ...base.registry,
    ...(isStubHandler(base.registry.Prepayment) ? { Prepayment: testPrepaymentHandler } : {}),
    ...(isStubHandler(base.registry.RateChange) ? { RateChange: testRateChangeHandler } : {}),
  };
  return { ...base, registry };
}

/** Verdadero si el handler del tipo en `ctx` es real o de prueba, no un stub de otra tarjeta. */
export function isRunnable(ctx: EngineContext, type: DomainEventType): boolean {
  return !isStubHandler(ctx.registry[type]);
}
