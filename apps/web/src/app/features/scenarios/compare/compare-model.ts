import {
  CurrencyMismatchError,
  type Currency,
  type DomainError,
  InvalidInputError,
  type LocalDate,
  localDateParts,
  type Money,
  moneyIsNegative,
  NegativeAmortizationError,
} from '@cuotascasa/domain';
import type { Uuid } from '@cuotascasa/schema';
import type { ScenarioComparison } from '../../../data/api.ts';

/** Most scenarios compared at once (spec §9 «Proyecciones», HU-16). */
export const MAX_COMPARED = 3;

export interface Selection {
  readonly ids: readonly Uuid[];
  /** True when a check was refused because the limit was already reached. */
  readonly blocked: boolean;
}

/** Applies a check or uncheck to the selection. A 4th scenario is refused and the selection stays as it was. */
export function toggleScenario(selected: readonly Uuid[], id: Uuid, checked: boolean): Selection {
  if (!checked) return { ids: selected.filter((candidate) => candidate !== id), blocked: false };
  if (selected.includes(id)) return { ids: selected, blocked: false };
  if (selected.length >= MAX_COMPARED) return { ids: selected, blocked: true };
  return { ids: [...selected, id], blocked: false };
}

export function monthsText(months: number): string {
  return `${String(months)} ${Math.abs(months) === 1 ? 'mes' : 'meses'}`;
}

/* ---------- Metrics table ([ALG.METRICS]) ---------- */

export type MetricCell =
  | { readonly type: 'none' }
  | { readonly type: 'money'; readonly value: string; readonly negative: boolean }
  | { readonly type: 'months'; readonly value: number; readonly negative: boolean }
  | { readonly type: 'date'; readonly value: string };

export interface MetricsColumn {
  readonly key: string;
  readonly heading: string;
}

export interface MetricsRow {
  readonly label: string;
  readonly cells: readonly MetricCell[];
}

export interface MetricsTable {
  readonly currency: Currency;
  readonly columns: readonly MetricsColumn[];
  readonly rows: readonly MetricsRow[];
}

const NONE: MetricCell = { type: 'none' };
const moneyCell = (value: Money): MetricCell => ({ type: 'money', value, negative: moneyIsNegative(value) });
const dateCell = (value: LocalDate): MetricCell => ({ type: 'date', value });

/**
 * Side-by-side metrics. Scenario cells are the `compareSchedules(real, scenario)` outputs, verbatim; original and
 * real only have the figures of their own schedule. Nothing is computed here.
 */
export function metricsTable(comparison: ScenarioComparison): MetricsTable {
  const { original, real, scenarios } = comparison;
  const columns: MetricsColumn[] = [
    { key: 'original', heading: 'Original' },
    { key: 'real', heading: 'Real (base)' },
    ...scenarios.map((entry) => ({ key: entry.scenarioId, heading: entry.name })),
  ];
  return {
    currency: real.currency,
    columns,
    rows: [
      {
        label: 'Interés ahorrado',
        cells: [NONE, NONE, ...scenarios.map((entry) => moneyCell(entry.metrics.interestSaved))],
      },
      {
        label: 'Meses ahorrados',
        cells: [
          NONE,
          NONE,
          ...scenarios.map((entry): MetricCell => ({
            type: 'months',
            value: entry.metrics.monthsSaved,
            negative: entry.metrics.monthsSaved < 0,
          })),
        ],
      },
      { label: 'Ahorro neto', cells: [NONE, NONE, ...scenarios.map((entry) => moneyCell(entry.metrics.netSaving))] },
      {
        label: 'Fecha de fin',
        cells: [
          dateCell(original.endDate),
          dateCell(real.endDate),
          ...scenarios.map((entry) => dateCell(entry.metrics.endDate)),
        ],
      },
      {
        label: 'Total pagado',
        cells: [
          moneyCell(original.totals.totalPaid),
          moneyCell(real.totals.totalPaid),
          ...scenarios.map((entry) => moneyCell(entry.metrics.totalPaid)),
        ],
      },
    ],
  };
}

/* ---------- Data table alternative to the chart ---------- */

export interface YearlyBalanceRow {
  readonly year: number;
  /** One money string per heading; null when the path has no data for that year. */
  readonly balances: readonly (string | null)[];
}

export interface YearlyBalanceTable {
  readonly headings: readonly string[];
  readonly rows: readonly YearlyBalanceRow[];
}

type PathSchedule = ScenarioComparison['real'];

/** Closing balance after prepayment of the last installment of each calendar year; '0.00' once the path ended. */
function balancesByYear(schedule: PathSchedule): Map<number, string> {
  const byYear = new Map<number, string>();
  for (const row of schedule.rows) {
    byYear.set(localDateParts(row.dueDate).year, row.closingAfterPrepayment);
  }
  return byYear;
}

/** The chart's data as strings: the same balances, one row per year, for people who cannot read the canvas. */
export function yearlyBalanceTable(comparison: ScenarioComparison): YearlyBalanceTable {
  const paths: readonly { readonly heading: string; readonly schedule: PathSchedule }[] = [
    { heading: 'Original', schedule: comparison.original },
    { heading: 'Real', schedule: comparison.real },
    ...comparison.scenarios.map((entry) => ({ heading: entry.name, schedule: entry.schedule })),
  ];
  const perPath = paths.map((path) => balancesByYear(path.schedule));
  const years = [...new Set(perPath.flatMap((byYear) => [...byYear.keys()]))].sort((a, b) => a - b);
  const lastYears = perPath.map((byYear) => Math.max(...byYear.keys()));
  return {
    headings: paths.map((path) => path.heading),
    rows: years.map((year) => ({
      year,
      balances: perPath.map((byYear, index) => {
        const known = byYear.get(year);
        if (known !== undefined) return known;
        return year > (lastYears[index] ?? year) ? '0.00' : null;
      }),
    })),
  };
}

/* ---------- Failed scenarios (D27) ---------- */

/** Spanish text of an engine error, from its type and code only: the message can carry amounts. */
export function describeFailure(error: DomainError): string {
  if (error instanceof InvalidInputError) {
    if (error.code === 'HYPOTHETICAL_BEFORE_CUTOFF') {
      return error.k === null
        ? 'Tiene un evento en una cuota que ya tiene datos reales. Muévelo o quítalo.'
        : `Tiene un evento en la cuota ${String(error.k)}, que ya tiene datos reales. Muévelo a una cuota posterior o quítalo.`;
    }
    if (error.code === 'INSTALLMENT_OUT_OF_RANGE') {
      return 'Tiene un evento fuera del plazo del préstamo. Revisa su fecha.';
    }
    return 'Sus eventos no son válidos. Revísalos en el editor de escenarios.';
  }
  if (error instanceof NegativeAmortizationError) {
    return `La cuota nivelada no alcanza a cubrir los intereses y seguros desde la cuota ${String(error.k)}. Revisa sus cambios de tasa o de plazo.`;
  }
  if (error instanceof CurrencyMismatchError) {
    return 'Usa una moneda distinta a la del préstamo.';
  }
  return 'No se pudo calcular este escenario. Revisa sus eventos.';
}
