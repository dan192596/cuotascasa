import type { ComparisonMetrics, Money, Schedule, ScheduleRow } from '@cuotascasa/domain';
import type { ScenarioComparison, ScenarioComparisonEntry } from '../../../../data/api.ts';

/** Synthetic comparison data for the specs of this folder (no real loan: invented round numbers). */

const money = (value: string): Money => value as Money;

export interface ScheduleSpec {
  readonly firstYear: number;
  /** Closing balances after prepayment, one per installment, as decimal strings. */
  readonly closings: readonly string[];
  readonly opening: string;
  readonly totalPaid: string;
}

function dueDate(firstYear: number, index: number): string {
  const month = (index % 12) + 1;
  const year = firstYear + Math.floor(index / 12);
  return `${String(year)}-${String(month).padStart(2, '0')}-28`;
}

export function makeSchedule(spec: ScheduleSpec): Schedule {
  const rows = spec.closings.map((closing, index) => {
    const row: Partial<ScheduleRow> = {
      k: index + 1,
      dueDate: dueDate(spec.firstYear, index) as ScheduleRow['dueDate'],
      opening: money(index === 0 ? spec.opening : (spec.closings[index - 1] ?? '0.00')),
      closingAfterPrepayment: money(closing),
    };
    return row as ScheduleRow;
  });
  const last = rows[rows.length - 1];
  return {
    currency: 'GTQ',
    roundingProfile: 'FHA_GT_V1',
    rows,
    totals: { totalPaid: money(spec.totalPaid) },
    endDate: (last?.dueDate ?? '2030-01-28') as Schedule['endDate'],
    installmentCount: rows.length,
  } as unknown as Schedule;
}

export function makeMetrics(over: Partial<ComparisonMetrics> = {}): ComparisonMetrics {
  return {
    currency: 'GTQ',
    interestSaved: money('1500.25'),
    monthsSaved: 2,
    baseEndDate: '2027-02-28',
    endDate: '2026-12-28',
    baseTotalPaid: money('30000.00'),
    totalPaid: money('28000.00'),
    netSaving: money('2000.00'),
    ...over,
  } as ComparisonMetrics;
}

export const ORIGINAL = makeSchedule({
  firstYear: 2026,
  opening: '1200.00',
  closings: Array.from({ length: 26 }, (_, i) => `${String(1200 - (i + 1) * 40)}.00`),
  totalPaid: '31000.00',
});
export const REAL = makeSchedule({
  firstYear: 2026,
  opening: '1200.00',
  closings: Array.from({ length: 24 }, (_, i) => `${String(1200 - (i + 1) * 50)}.00`),
  totalPaid: '30000.00',
});

export function entry(id: string, name: string, over: Partial<ComparisonMetrics> = {}): ScenarioComparisonEntry {
  return {
    scenarioId: id,
    name,
    schedule: makeSchedule({
      firstYear: 2026,
      opening: '1200.00',
      closings: Array.from({ length: 22 }, (_, i) => `${String(Math.max(0, 1200 - (i + 1) * 60))}.00`),
      totalPaid: '28000.00',
    }),
    metrics: makeMetrics(over),
  } as ScenarioComparisonEntry;
}

export function comparison(
  scenarios: readonly ScenarioComparisonEntry[],
  failed: ScenarioComparison['failed'] = [],
): ScenarioComparison {
  return { original: ORIGINAL, real: REAL, scenarios, failed };
}
