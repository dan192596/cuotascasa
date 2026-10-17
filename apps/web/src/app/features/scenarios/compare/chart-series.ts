import type { ScenarioComparison } from '../../../data/api.ts';

/**
 * The ONLY place where money becomes a JS number (ADR-0003 §6, amended in W5): the y-values of the balance chart.
 * Display only: the numbers never go back to the domain or to persistence, every point keeps its original decimal
 * string in `raw` for the tooltip, and the accessible table next to the chart shows the strings themselves.
 */

/** Chart colours are design-token roles (ink, ink-muted, accent), resolved from the DOM by the chart component. */
export type SeriesRole = 'ink' | 'ink-muted' | 'accent';
export type MarkerShape = 'rectRot' | 'circle' | 'triangle' | 'rect' | 'crossRot';

export interface ChartPoint {
  /** Installment number (0 = opening balance). */
  readonly x: number;
  readonly y: number;
  /** The money string the y-value came from. */
  readonly raw: string;
}

export interface ChartSeries {
  readonly key: string;
  readonly label: string;
  readonly role: SeriesRole;
  /** Line dash pattern; empty = solid. Together with `marker` it tells series apart without colour (D26). */
  readonly dash: readonly number[];
  readonly marker: MarkerShape;
  readonly points: readonly ChartPoint[];
}

interface Look {
  readonly role: SeriesRole;
  readonly dash: readonly number[];
  readonly marker: MarkerShape;
}

const ORIGINAL_LOOK: Look = { role: 'ink-muted', dash: [6, 4], marker: 'rectRot' };
const REAL_LOOK: Look = { role: 'ink', dash: [], marker: 'circle' };
const SCENARIO_LOOKS: readonly Look[] = [
  { role: 'accent', dash: [], marker: 'triangle' },
  { role: 'accent', dash: [2, 3], marker: 'rect' },
  { role: 'accent', dash: [10, 3, 2, 3], marker: 'crossRot' },
];

type SchedulePoints = ScenarioComparison['real'];

function pointsOf(schedule: SchedulePoints): readonly ChartPoint[] {
  const first = schedule.rows[0];
  if (first === undefined) return [];
  const opening: ChartPoint = { x: 0, y: Number(first.opening), raw: first.opening };
  return [
    opening,
    ...schedule.rows.map((row) => ({
      x: row.k,
      y: Number(row.closingAfterPrepayment),
      raw: row.closingAfterPrepayment,
    })),
  ];
}

/** Original, real and up to 3 scenarios, as plain numbers for Chart.js. */
export function buildChartSeries(comparison: ScenarioComparison): readonly ChartSeries[] {
  return [
    { key: 'original', label: 'Original', ...ORIGINAL_LOOK, points: pointsOf(comparison.original) },
    { key: 'real', label: 'Real', ...REAL_LOOK, points: pointsOf(comparison.real) },
    ...comparison.scenarios.slice(0, SCENARIO_LOOKS.length).map((entry, index) => ({
      key: entry.scenarioId,
      label: entry.name,
      ...(SCENARIO_LOOKS[index] ?? REAL_LOOK),
      points: pointsOf(entry.schedule),
    })),
  ];
}

const AXIS_FORMAT = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 });

/** Y-axis tick text, grouped and rounded to whole units. A display value only; exact amounts appear in the tooltip and the table. */
export function formatAxisValue(value: number): string {
  return AXIS_FORMAT.format(value);
}
