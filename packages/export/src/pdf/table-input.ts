import type { Money } from '@cuotascasa/domain';
import { formatLocalDate } from '../model/format.ts';
import type { ReportCell, ReportCellKind, ReportRowRole, ReportTable } from '../report-model.ts';

export type PdfAlign = 'left' | 'right' | 'center';

export interface PdfCell {
  readonly content: string;
  readonly halign: PdfAlign;
}

export interface PdfRow {
  readonly role: ReportRowRole;
  readonly cells: readonly PdfCell[];
}

/** Entrada neutra para la tabla del PDF: texto ya formateado, sin tocar jsPDF (se prueba con instantáneas). */
export interface PdfTableInput {
  readonly title: string;
  readonly head: readonly string[];
  /** Ancho sugerido de cada columna, en caracteres; el escritor lo reparte sobre el ancho útil de la página. */
  readonly columnWidths: readonly number[];
  readonly headAlign: readonly PdfAlign[];
  readonly body: readonly PdfRow[];
}

/** `1234.5` -> `1,234.50` sin pasar por `number`: solo agrupa los miles de la parte entera del string decimal. */
export function formatPdfMoney(value: Money): string {
  const text = String(value);
  const negative = text.startsWith('-');
  const [integer = '', fraction] = (negative ? text.slice(1) : text).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction === undefined ? '' : `.${fraction}`}`;
}

const KIND_ALIGN: Record<ReportCellKind, PdfAlign> = {
  text: 'left',
  money: 'right',
  integer: 'right',
  date: 'center',
};

/** ADR-0013 (enmienda W3): se despacha por `cell.kind`, nunca por `column.kind`. */
function toCell(cell: ReportCell): PdfCell {
  switch (cell.kind) {
    case 'empty':
      return { content: '', halign: 'left' };
    case 'text':
      return { content: cell.value, halign: 'left' };
    case 'date':
      return { content: formatLocalDate(cell.value), halign: KIND_ALIGN.date };
    case 'money':
      return { content: formatPdfMoney(cell.value), halign: KIND_ALIGN.money };
    case 'integer':
      return { content: String(cell.value), halign: KIND_ALIGN.integer };
  }
}

export function toPdfTableInput(table: ReportTable): PdfTableInput {
  return {
    title: table.title,
    head: table.columns.map((column) => column.header),
    columnWidths: table.columns.map((column) => column.width),
    headAlign: table.columns.map((column) => KIND_ALIGN[column.kind]),
    body: table.rows.map((row) => ({ role: row.role, cells: row.cells.map(toCell) })),
  };
}
