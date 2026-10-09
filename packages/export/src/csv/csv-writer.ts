import { EXPORT_FILE_TYPES, type ReportCell, type ReportModel, type ReportWriter } from '../report-model.ts';
import { formatLocalDate } from '../model/format.ts';

const BOM = '﻿';
const EOL = '\r\n';
/** ADR-0013: solo estas celdas se escriben tal cual (montos con 2 decimales o enteros, también negativos). */
const NUMERIC = /^-?\d+(\.\d{2})?$/;
/**
 * Celdas de texto que una hoja de cálculo podría interpretar como fórmula: `= + - @`, tab, CR y LF, también tras
 * espacios iniciales (incluidos NBSP y el espacio ideográfico). Los caracteres de ancho completo (p. ej. `＝`) no se
 * neutralizan a propósito: las hojas de cálculo no los tratan como fórmula.
 */
const FORMULA_START = /^[\s\u00A0\u3000]*[=+\-@\t\r\n]/;

/** RFC 4180: entrecomilla si hay coma, comilla, CR o LF, y duplica las comillas. */
function quote(field: string): string {
  return /[",\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
}

function neutralizedText(value: string): string {
  return quote(FORMULA_START.test(value) ? `'${value}` : value);
}

function cellToField(cell: ReportCell): string {
  switch (cell.kind) {
    case 'empty':
      return '';
    case 'text':
      return neutralizedText(cell.value);
    case 'date':
      return formatLocalDate(cell.value);
    case 'money':
    case 'integer': {
      const value = String(cell.value);
      return NUMERIC.test(value) ? value : neutralizedText(value);
    }
  }
}

const record = (fields: readonly string[]): string => fields.join(',') + EOL;
const textRecord = (values: readonly string[]): string => record(values.map(neutralizedText));

function toCsv(model: ReportModel): string {
  let out = BOM + textRecord([model.title]);
  for (const entry of model.meta) {
    out += textRecord([entry.label, entry.value]);
  }
  for (const table of model.tables) {
    out += EOL;
    out += textRecord([table.title]);
    out += textRecord(table.columns.map((column) => column.header));
    for (const row of table.rows) {
      out += record(row.cells.map(cellToField));
    }
  }
  return out;
}

/** CSV de ADR-0013: BOM UTF-8, CRLF, RFC 4180, montos exactos, fechas dd/mm/aaaa y celdas de texto sin fórmulas. */
export const csvWriter: ReportWriter = {
  format: 'csv',
  mimeType: EXPORT_FILE_TYPES.csv.mimeType,
  extension: EXPORT_FILE_TYPES.csv.extension,
  write: (model) => Promise.resolve(new TextEncoder().encode(toCsv(model))),
};
