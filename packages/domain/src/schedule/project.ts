import { compareMoney, moneySub, moneySum, ZERO_MONEY } from '../money/index.ts';
import type { PeriodState, ProjectCapitalFn, RemainingTermFn } from '../types/engine.ts';
import { InvalidInputError, type Money } from '../types/primitives.ts';
import { calculateInstallment } from './amounts.ts';

/**
 * [ALG.TERM] Simula las cuotas k+1 … última del calendario vigente desde `state`, con `level` fijo, e invoca `visit`
 * con el capital de cada una. `visit` devuelve `false` para detener la simulación. Un estado sin saldo no tiene cuotas.
 */
function simulate(state: PeriodState, visit: (capital: Money) => boolean): void {
  let opening = state.balance;
  for (let k = state.k + 1; compareMoney(opening, ZERO_MONEY) > 0; k += 1) {
    const installment = calculateInstallment({
      k,
      opening,
      level: state.level,
      interestRate: state.interestRate,
      insuranceRates: state.insuranceRates,
      roundingProfile: state.roundingProfile,
      termMode: state.termMode,
      term: state.term,
    });
    if (!visit(installment.capital) || installment.isLast) {
      return;
    }
    opening = moneySub(opening, installment.capital);
  }
}

/**
 * [ALG.TERM] Número de cuotas k+1 … última, contado por simulación. En plazo derivado, `term = k + remainingTerm`.
 * Una cuota simulada de plazo derivado con `level − financialCharge ≤ 0` lanza `NegativeAmortizationError`.
 */
export const remainingTerm: RemainingTermFn = (state) => {
  let count = 0;
  simulate(state, () => {
    count += 1;
    return true;
  });
  return count;
};

/**
 * [ALG.TERM] Σ capital de las cuotas k+1 … k+n del calendario vigente, por la misma simulación. Si el calendario
 * termina antes de k+n, suma las cuotas que existen.
 */
export const projectCapital: ProjectCapitalFn = (state, n) => {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new InvalidInputError('INVALID_INTEGER', 'n must be an integer >= 0', { n });
  }
  const capitals: Money[] = [];
  if (n >= 1) {
    simulate(state, (capital) => {
      capitals.push(capital);
      return capitals.length < n;
    });
  }
  return moneySum(capitals);
};
