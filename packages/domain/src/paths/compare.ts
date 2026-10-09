import { moneyAdd, moneySub } from '../money/index.ts';
import type { CompareSchedulesFn } from '../types/engine.ts';
import { CurrencyMismatchError } from '../types/primitives.ts';
import type { Schedule } from '../types/schedule.ts';

/** [ALG.METRICS] Σ(interest + seguros) de un calendario. */
function financialCost(schedule: Schedule): ReturnType<typeof moneyAdd> {
  return moneyAdd(schedule.totals.interest, schedule.totals.insurance);
}

/**
 * [ALG.METRICS] Métricas de un escenario contra su base: `interestSaved` (interés + seguros), `monthsSaved` (cuotas),
 * `endDate` (vencimiento de la última cuota, la terminal `isLast || payoff`), `totalPaid` y
 * `netSaving = totalPaid(base) − totalPaid(escenario)`. Calendarios de monedas distintas lanzan `CurrencyMismatchError`
 * ([ALG.TERMS], R27): no se mezclan monedas.
 */
export const compareSchedules: CompareSchedulesFn = (base, scenario) => {
  if (base.currency !== scenario.currency) {
    throw new CurrencyMismatchError(base.currency, scenario.currency);
  }
  return {
    currency: base.currency,
    interestSaved: moneySub(financialCost(base), financialCost(scenario)),
    monthsSaved: base.installmentCount - scenario.installmentCount,
    baseEndDate: base.endDate,
    endDate: scenario.endDate,
    baseTotalPaid: base.totals.totalPaid,
    totalPaid: scenario.totals.totalPaid,
    netSaving: moneySub(base.totals.totalPaid, scenario.totals.totalPaid),
  };
};
