import {
  type ComponentRealDelta,
  localDateParts,
  type Schedule,
  type ScheduleRow,
  type YearlySubtotal,
} from '@cuotascasa/domain';
import type { AnchorDelta } from '../../data/api.ts';
import { formatLocalDate, formatMoneyPlain } from '../../ui/format/format.ts';
import type { LedgerColumn, LedgerRow } from '../../ui/ledger-table/ledger-table.types.ts';
import type { AbonoSlot } from './scenario-abono.ts';

/** The three paths of the table (HU-07): original plan, real path and the active scenario. */
export type ScheduleView = 'original' | 'real' | 'scenario';

export const SCHEDULE_VIEWS: readonly { readonly id: ScheduleView; readonly label: string }[] = [
  { id: 'original', label: 'Plan original' },
  { id: 'real', label: 'Real' },
  { id: 'scenario', label: 'Escenario' },
];

const LIGHTS: Readonly<Record<AnchorDelta['status'], { readonly icon: string; readonly label: string }>> = {
  GREEN: { icon: '●', label: 'Coincide' },
  AMBER: { icon: '▲', label: 'Diferencia pequeña' },
  RED: { icon: '■', label: 'Diferencia grande' },
  UNVALIDATED: { icon: '○', label: 'Sin validar' },
};

const BASE_COLUMNS: readonly LedgerColumn[] = [
  { key: 'k', header: '#', align: 'end', width: '5.5rem' },
  { key: 'due', header: 'Vence', width: '6.5rem' },
  { key: 'opening', header: 'Saldo inicial', align: 'end', width: '9rem' },
  { key: 'interest', header: 'Interés', align: 'end', width: '7rem' },
  { key: 'insurance', header: 'Seguro', align: 'end', width: '7rem' },
  { key: 'capital', header: 'Capital', align: 'end', width: '8rem' },
  { key: 'fixed', header: 'Fijos', align: 'end', width: '6.5rem' },
  { key: 'total', header: 'Total', align: 'end', width: '8rem' },
  { key: 'closing', header: 'Saldo final', align: 'end', width: '9rem' },
  { key: 'prepayment', header: 'Abono', align: 'end', width: '9.5rem', editable: true },
  { key: 'paid', header: 'Pagada', width: '5rem' },
  { key: 'delta', header: 'Real Δ', align: 'end', width: '17rem' },
];

const COMPONENT_COLUMNS: readonly LedgerColumn[] = [
  { key: 'dCapital', header: 'Δ Capital', align: 'end', width: '7.5rem' },
  { key: 'dInterest', header: 'Δ Interés', align: 'end', width: '7.5rem' },
  { key: 'dInsurance', header: 'Δ Seguro', align: 'end', width: '7.5rem' },
  { key: 'dFixed', header: 'Δ Fijos', align: 'end', width: '7.5rem' },
];

export interface LedgerInput {
  readonly view: ScheduleView;
  readonly schedule: Schedule;
  /** [ALG.YEARLY] subtotals of the same path, straight from the facade. */
  readonly subtotals: readonly YearlySubtotal[];
  /** [ALG.PATHS.CUTOFF]: rows with k ≤ cutoffK never accept an abono. */
  readonly cutoffK: number;
  /** k of LoanProjection.currentInstallment, or null when there is none. */
  readonly currentK: number | null;
  readonly paid: ReadonlySet<number>;
  readonly anchors: readonly AnchorDelta[];
  readonly components: readonly ComponentRealDelta[];
  /** State of the abono cell of installment k in the active scenario. */
  readonly slotAt: (k: number) => AbonoSlot;
  /** The scenario view is showing the real rows because the scenario has no computed path. */
  readonly fallback?: boolean;
}

export interface LedgerModel {
  readonly columns: readonly LedgerColumn[];
  readonly rows: readonly LedgerRow[];
}

const money = (value: string): string => formatMoneyPlain(value);
const nonZero = (value: string): string => (value === '0.00' ? '' : money(value));

function deltaText(anchors: readonly AnchorDelta[]): string {
  return anchors
    .map((anchor) => {
      const light = LIGHTS[anchor.status];
      return `${money(anchor.realDelta)} ${light.icon} ${light.label}`;
    })
    .join('; ');
}

function dataRow(
  row: ScheduleRow,
  input: LedgerInput,
  byAnchor: Map<number, AnchorDelta[]>,
  byPayment: Map<number, ComponentRealDelta>,
): LedgerRow {
  const { view, slotAt, cutoffK } = input;
  const original = view === 'original';
  const slot = slotAt(row.k);
  const paid = !original && (row.paid || input.paid.has(row.k));
  const editable = !original && row.k > cutoffK && slot.kind !== 'locked';
  const applied = nonZero(row.prepayment);
  // A scenario prepayment that the displayed rows do not include (real view, scenario fallback): show it, marked.
  const pendingEsc = slot.kind === 'single' && !original && (view === 'real' || input.fallback === true);
  const prepayment =
    slot.kind === 'locked'
      ? `${applied} *`.trim()
      : pendingEsc && slot.kind === 'single'
        ? `${money(slot.event.amount)} (esc.)`
        : applied;
  const anchors = original ? undefined : byAnchor.get(row.k);
  const component = original ? undefined : byPayment.get(row.k);
  const spoken = [`Cuota ${row.k}`];
  if (paid) spoken.push('pagada');
  if (pendingEsc) spoken.push('abono del escenario, aún no aplicado a esta vista');
  if (slot.kind === 'locked') spoken.push('abono con varios eventos hipotéticos: edítalo en Proyecciones');
  return {
    key: `k-${row.k}`,
    label: spoken.join(', '),
    cells: {
      k: String(row.k),
      due: formatLocalDate(row.dueDate),
      opening: money(row.opening),
      interest: money(row.interest),
      insurance: money(row.insurance),
      capital: money(row.capital),
      fixed: money(row.fixedCharges),
      total: money(row.total),
      closing: money(row.closingAfterPrepayment),
      prepayment,
      paid: paid ? '✓' : '',
      delta: anchors === undefined ? '' : deltaText(anchors),
      dCapital: component === undefined ? '' : money(component.capital),
      dInterest: component === undefined ? '' : money(component.interest),
      dInsurance: component === undefined ? '' : money(component.insurance),
      dFixed: component === undefined ? '' : money(component.fixedCharges),
    },
    ...(slot.kind === 'single' ? { editValues: { prepayment: slot.event.amount } } : {}),
    editable,
    current: input.currentK === row.k,
  };
}

function subtotalRow(subtotal: YearlySubtotal): LedgerRow {
  return {
    key: `sub-${subtotal.year}`,
    kind: 'subtotal',
    label: `Subtotal ${subtotal.year}`,
    cells: {
      k: 'Subtotal',
      due: String(subtotal.year),
      interest: money(subtotal.interest),
      insurance: money(subtotal.insurance),
      capital: money(subtotal.capital),
      fixed: money(subtotal.fixedCharges),
      total: money(subtotal.total),
      prepayment: nonZero(subtotal.prepayments),
    },
  };
}

/**
 * Columns and rows of the amortization ledger for one path. Every figure is formatted from the facade values; nothing
 * is recomputed here. A subtotal row follows the last installment of each calendar year ([ALG.YEARLY]).
 */
export function buildLedger(input: LedgerInput): LedgerModel {
  const byAnchor = new Map<number, AnchorDelta[]>();
  for (const anchor of input.anchors) byAnchor.set(anchor.k, [...(byAnchor.get(anchor.k) ?? []), anchor]);
  const byPayment = new Map<number, ComponentRealDelta>();
  for (const component of input.components) if (!byPayment.has(component.k)) byPayment.set(component.k, component);
  const subtotals = new Map(input.subtotals.map((subtotal) => [subtotal.year, subtotal]));

  const rows: LedgerRow[] = [];
  const source = input.schedule.rows;
  source.forEach((row, index) => {
    rows.push(dataRow(row, input, byAnchor, byPayment));
    const year = localDateParts(row.dueDate).year;
    const next = source[index + 1];
    if (next !== undefined && localDateParts(next.dueDate).year === year) return;
    const subtotal = subtotals.get(year);
    if (subtotal !== undefined) rows.push(subtotalRow(subtotal));
  });

  const showComponents = input.view !== 'original' && input.components.length > 0;
  return { columns: showComponents ? [...BASE_COLUMNS, ...COMPONENT_COLUMNS] : BASE_COLUMNS, rows };
}
