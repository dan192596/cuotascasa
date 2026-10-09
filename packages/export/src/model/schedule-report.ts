import { localDateParts, PathKind, type ScheduleRow, yearlySubtotals } from '@cuotascasa/domain';
import type { ReportCell, ReportColumn, ReportMetaEntry, ReportRow } from '../report-model.ts';
import { currencyLabelOf, formatLocalDate } from './format.ts';
import type { BuildScheduleReportFn } from './types.ts';

const PATH_LABELS = {
  [PathKind.ORIGINAL]: 'Plan original',
  [PathKind.REAL]: 'Camino real',
  [PathKind.SCENARIO]: 'Escenario',
} as const satisfies Record<PathKind, string>;

const EMPTY: ReportCell = { kind: 'empty' };
const text = (value: string): ReportCell => ({ kind: 'text', value });

function columns(label: string): readonly ReportColumn[] {
  return [
    { key: 'k', header: 'Cuota', kind: 'integer', width: 8 },
    { key: 'dueDate', header: 'Vencimiento', kind: 'date', width: 14 },
    { key: 'opening', header: `Saldo inicial (${label})`, kind: 'money', width: 18 },
    { key: 'capital', header: `Capital (${label})`, kind: 'money', width: 16 },
    { key: 'interest', header: `Interés (${label})`, kind: 'money', width: 16 },
    { key: 'insurance', header: `Seguros (${label})`, kind: 'money', width: 16 },
    { key: 'fixedCharges', header: `Cargos fijos (${label})`, kind: 'money', width: 18 },
    { key: 'total', header: `Cuota total (${label})`, kind: 'money', width: 18 },
    { key: 'prepayment', header: `Abono (${label})`, kind: 'money', width: 16 },
    { key: 'commission', header: `Comisión (${label})`, kind: 'money', width: 16 },
    { key: 'closing', header: `Saldo final (${label})`, kind: 'money', width: 18 },
  ];
}

function dataRow(row: ScheduleRow): ReportRow {
  return {
    role: 'data',
    cells: [
      { kind: 'integer', value: row.k },
      { kind: 'date', value: row.dueDate },
      { kind: 'money', value: row.opening },
      { kind: 'money', value: row.capital },
      { kind: 'money', value: row.interest },
      { kind: 'money', value: row.insurance },
      { kind: 'money', value: row.fixedCharges },
      { kind: 'money', value: row.total },
      { kind: 'money', value: row.prepayment },
      { kind: 'money', value: row.commission },
      { kind: 'money', value: row.closingAfterPrepayment },
    ],
  };
}

/** [ALG.YEARLY] Arma el reporte de una tabla de amortización; los subtotales salen de `yearlySubtotals`. */
export const buildScheduleReport: BuildScheduleReportFn = ({ schedule, pathKind, loanLabel, generatedOn }) => {
  const label = currencyLabelOf(schedule.currency);
  const subtotals = new Map(yearlySubtotals(schedule).map((subtotal) => [subtotal.year, subtotal]));

  const rows: ReportRow[] = [];
  schedule.rows.forEach((row, index) => {
    rows.push(dataRow(row));
    const { year } = localDateParts(row.dueDate);
    const next = schedule.rows[index + 1];
    if (next !== undefined && localDateParts(next.dueDate).year === year) {
      return;
    }
    const subtotal = subtotals.get(year);
    if (subtotal === undefined) {
      return;
    }
    // Los escritores deben despachar por `cell.kind`, nunca por `column.kind`: aquí una celda de la columna de fecha
    // es texto ('Subtotal AAAA') y las de cuota y saldo van vacías.
    rows.push({
      role: 'subtotal',
      cells: [
        EMPTY,
        text(`Subtotal ${year}`),
        EMPTY,
        { kind: 'money', value: subtotal.capital },
        { kind: 'money', value: subtotal.interest },
        { kind: 'money', value: subtotal.insurance },
        { kind: 'money', value: subtotal.fixedCharges },
        { kind: 'money', value: subtotal.total },
        { kind: 'money', value: subtotal.prepayments },
        { kind: 'money', value: subtotal.commissions },
        EMPTY,
      ],
    });
  });

  const { totals } = schedule;
  // Igual que en los subtotales: despachar por `cell.kind`, nunca por `column.kind`.
  rows.push({
    role: 'total',
    cells: [
      EMPTY,
      text('Total'),
      EMPTY,
      { kind: 'money', value: totals.capital },
      { kind: 'money', value: totals.interest },
      { kind: 'money', value: totals.insurance },
      { kind: 'money', value: totals.fixedCharges },
      { kind: 'money', value: totals.total },
      { kind: 'money', value: totals.prepayments },
      { kind: 'money', value: totals.commissions },
      EMPTY,
    ],
  });

  const meta: ReportMetaEntry[] = [
    { label: 'Préstamo', value: loanLabel },
    { label: 'Moneda', value: schedule.currency },
    { label: 'Camino', value: PATH_LABELS[pathKind] },
    { label: 'Cuotas', value: String(schedule.installmentCount) },
    { label: 'Fecha de fin', value: formatLocalDate(schedule.endDate) },
  ];
  if (schedule.rows.some((row) => row.payoff)) {
    meta.push({ label: 'Liquidación anticipada', value: 'Sí' });
  }
  meta.push({ label: 'Generado', value: formatLocalDate(generatedOn) });

  return {
    kind: 'schedule',
    title: 'Tabla de amortización',
    currency: schedule.currency,
    currencyLabel: label,
    generatedOn,
    meta,
    tables: [{ sheetName: 'Tabla', title: 'Tabla de amortización', columns: columns(label), rows }],
  };
};
