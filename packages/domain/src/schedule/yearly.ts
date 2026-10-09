import { localDateParts } from '../dates/index.ts';
import { moneySum } from '../money/index.ts';
import type { YearlySubtotalsFn } from '../types/engine.ts';
import type { ScheduleRow, YearlySubtotal } from '../types/schedule.ts';

/** [ALG.YEARLY] Subtotales por año calendario del vencimiento; un año sin cuotas no aparece. */
export const yearlySubtotals: YearlySubtotalsFn = (schedule) => {
  const byYear = new Map<number, ScheduleRow[]>();
  for (const row of schedule.rows) {
    const { year } = localDateParts(row.dueDate);
    byYear.set(year, [...(byYear.get(year) ?? []), row]);
  }
  const subtotals: YearlySubtotal[] = [];
  for (const [year, rows] of byYear) {
    subtotals.push({
      year,
      capital: moneySum(rows.map((row) => row.capital)),
      interest: moneySum(rows.map((row) => row.interest)),
      insurance: moneySum(rows.map((row) => row.insurance)),
      fixedCharges: moneySum(rows.map((row) => row.fixedCharges)),
      prepayments: moneySum(rows.map((row) => row.prepayment)),
      commissions: moneySum(rows.map((row) => row.commission)),
      total: moneySum(rows.map((row) => row.total)),
    });
  }
  return subtotals.sort((a, b) => a.year - b.year);
};
