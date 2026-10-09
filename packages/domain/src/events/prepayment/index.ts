import { compareMoney, halfUp2, dec, minMoney, moneySub, periodicRate, ZERO_MONEY } from '../../money/index.ts';
import type { EventHandler, PeriodState } from '../../types/engine.ts';
import type { Commission } from '../../types/events.ts';
import type { Money } from '../../types/primitives.ts';

/** [ALG.PREPAY.COMMISSION] FLAT: monto fijo. PERCENT: HALF_UP_2(abono aplicado · tasa). No reduce el saldo. */
function commissionOf(commission: Commission | undefined, applied: Money): Money {
  if (commission === undefined) {
    return ZERO_MONEY;
  }
  return commission.kind === 'FLAT' ? commission.amount : halfUp2(dec(applied).times(dec(commission.rate)));
}

/**
 * [ALG.PREPAY] Abono a capital, justo después de pagar la cuota k (fase 3).
 * - [ALG.PREPAY.CAP]: se aplica `min(amount, state.balance)`; `state.balance` ya descuenta los abonos anteriores de k.
 *   Con saldo 0.00 se aplica 0.00 y no hay comisión. Si iguala el saldo, el rowEffect marca `payoff`.
 * - [ALG.PREPAY.REDUCE_TERM]: `level` igual y plazo derivado (`term = k + remainingTerm`).
 * - [ALG.PREPAY.REDUCE_INSTALLMENT]: `level` según [ALG.LEVEL] con B' y m = term − k; plazo fijo. Con plazo derivado,
 *   `term = k + remainingTerm` del estado antes de restar el abono ([ALG.TERM]).
 */
export const prepaymentHandler: EventHandler<'Prepayment'> = ({ ctx, event, state }) => {
  if (compareMoney(state.balance, ZERO_MONEY) <= 0) {
    return { state, rowEffect: { prepayment: ZERO_MONEY, commission: ZERO_MONEY, payoff: false } };
  }
  const applied = minMoney(event.amount, state.balance);
  const balance = moneySub(state.balance, applied);
  const rowEffect = {
    prepayment: applied,
    commission: commissionOf(event.commission, applied),
    payoff: compareMoney(balance, ZERO_MONEY) <= 0,
  };
  if (rowEffect.payoff) {
    return { state: { ...state, balance }, rowEffect };
  }
  let next: PeriodState;
  if (event.mode === 'REDUCE_TERM') {
    const derived: PeriodState = { ...state, balance, termMode: 'DERIVED' };
    next = { ...derived, term: state.k + ctx.remainingTerm(derived) };
  } else {
    const term = state.termMode === 'FIXED' ? state.term : state.k + ctx.remainingTerm(state);
    const rate = periodicRate(state.interestRate, state.insuranceRates);
    next = {
      ...state,
      balance,
      termMode: 'FIXED',
      term,
      level: ctx.levelPayment(balance, rate, term - state.k),
    };
  }
  return { state: next, rowEffect };
};
