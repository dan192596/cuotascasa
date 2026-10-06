/**
 * Contrato congelado de W0-03: modelo de reporte único y escritores por formato (ADR-0013).
 * Los montos viajan como `Money` (string decimal); solo el escritor de Excel (W4-10) los convierte a `number`.
 */
import type { Currency, LocalDate, Money } from '@cuotascasa/domain';

/** Formatos de exportación; cada uno vive en su subpath `@cuotascasa/export/<formato>`. */
export const EXPORT_FORMATS = ['csv', 'excel', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Tipo MIME y extensión de archivo de cada formato. */
export const EXPORT_FILE_TYPES = {
  csv: { mimeType: 'text/csv;charset=utf-8', extension: 'csv' },
  excel: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' },
  pdf: { mimeType: 'application/pdf', extension: 'pdf' },
} as const satisfies { readonly [F in ExportFormat]: { readonly mimeType: string; readonly extension: string } };

/** Clase de valor de una columna. Decide el formato de celda en cada escritor. */
export type ReportCellKind = 'text' | 'money' | 'integer' | 'date';

/** Una celda tipada. `empty` deja la celda en blanco (p. ej. el número de cuota en una fila de subtotal). */
export type ReportCell =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'money'; readonly value: Money }
  | { readonly kind: 'integer'; readonly value: number }
  | { readonly kind: 'date'; readonly value: LocalDate }
  | { readonly kind: 'empty' };

/** Columna de una tabla: clave estable, encabezado en español (p. ej. 'Interés') y ancho sugerido en caracteres. */
export interface ReportColumn {
  readonly key: string;
  readonly header: string;
  readonly kind: ReportCellKind;
  readonly width: number;
}

/** Papel de una fila: dato, subtotal anual ([ALG.YEARLY], de `yearlySubtotals`) o total. */
export type ReportRowRole = 'data' | 'subtotal' | 'total';

/** Una fila: una celda por columna, en el mismo orden que `columns`. */
export interface ReportRow {
  readonly role: ReportRowRole;
  readonly cells: readonly ReportCell[];
}

/** Una tabla; en Excel es una hoja ('Tabla' o 'Comparación'). */
export interface ReportTable {
  readonly sheetName: string;
  readonly title: string;
  readonly columns: readonly ReportColumn[];
  readonly rows: readonly ReportRow[];
}

/** Un dato del encabezado del reporte (p. ej. { label: 'Moneda', value: 'GTQ' }). */
export interface ReportMetaEntry {
  readonly label: string;
  readonly value: string;
}

/** Modelo de reporte que comparten CSV, Excel y PDF; lo arman `buildScheduleReport` y `buildComparisonReport`. */
export interface ReportModel {
  readonly kind: 'schedule' | 'comparison';
  /** Título en español, p. ej. 'Tabla de amortización'. */
  readonly title: string;
  readonly currency: Currency;
  /** Rótulo de moneda para encabezados: 'Q' o 'US$'. */
  readonly currencyLabel: string;
  /** Fecha de generación; la inyecta quien llama (el dominio y este paquete no leen «hoy»). */
  readonly generatedOn: LocalDate;
  readonly meta: readonly ReportMetaEntry[];
  readonly tables: readonly ReportTable[];
}

/** Escritor de un formato. No usa red ni `eval` y no tiene efectos al importarse. */
export interface ReportWriter {
  readonly format: ExportFormat;
  readonly mimeType: string;
  readonly extension: string;
  /** Bytes del archivo: CSV con BOM UTF-8, XLSX (empieza con 'PK') o PDF (empieza con '%PDF-'). */
  write(model: ReportModel): Promise<Uint8Array>;
}
