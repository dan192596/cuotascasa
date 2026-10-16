import { localDateParts } from '@cuotascasa/domain';
import writeExcelFile, { type Cell, type SheetData } from 'write-excel-file/universal';
import {
  EXPORT_FILE_TYPES,
  type ReportCell,
  type ReportModel,
  type ReportTable,
  type ReportWriter,
} from '../report-model.ts';

/** ADR-0013: solo los montos con 2 decimales (o enteros, también negativos) se escriben como celdas numéricas. */
const NUMERIC = /^-?\d+(\.\d{2})?$/;
const MONEY_FORMAT = '#,##0.00';
const INTEGER_FORMAT = '0';
const DATE_FORMAT = 'dd/mm/yyyy';

/**
 * Único punto del paquete donde un monto decimal pasa a `number` (ADR-0013). `Number('-12.34')` es el doble más
 * cercano al decimal escrito, sin aritmética: Excel lo muestra con 2 decimales y `toFixed(2)` devuelve el texto
 * original (lo verifica la prueba de ida y vuelta). Los montos nunca se suman ni se multiplican como `number`.
 */
function moneyToNumber(value: string): number | undefined {
  if (!NUMERIC.test(value)) return undefined;
  const converted = Number(value);
  return Number.isSafeInteger(Math.trunc(converted)) ? converted : undefined;
}

/**
 * Los textos se escriben siempre con `type: String`: la biblioteca los guarda como cadenas (nunca `<f>`), así que
 * `=`, `+`, `-`, `@`, tab, CR o LF iniciales (también tras espacios, NBSP o U+3000) no se evalúan como fórmula.
 */
function textCell(value: string): Cell {
  return { type: String, value };
}

function toCell(cell: ReportCell): Cell {
  switch (cell.kind) {
    case 'empty':
      return null;
    case 'text':
      return textCell(cell.value);
    case 'date': {
      const { year, month, day } = localDateParts(cell.value);
      return { type: Date, value: new Date(Date.UTC(year, month - 1, day)), format: DATE_FORMAT };
    }
    case 'money': {
      const converted = moneyToNumber(String(cell.value));
      return converted === undefined
        ? textCell(String(cell.value))
        : { type: Number, value: converted, format: MONEY_FORMAT };
    }
    case 'integer':
      return Number.isSafeInteger(cell.value)
        ? { type: Number, value: cell.value, format: INTEGER_FORMAT }
        : textCell(String(cell.value));
  }
}

const bold = (value: string): Cell => ({ type: String, value, fontWeight: 'bold' });

/** Fila 1: título; fila 2: encabezados (congeladas); luego los datos. Los subtotales y totales van en negrita. */
function toSheetData(table: ReportTable): SheetData {
  return [
    [bold(table.title)],
    table.columns.map((column) => bold(column.header)),
    ...table.rows.map((row) =>
      row.cells.map((cell) => {
        const converted = toCell(cell);
        return row.role !== 'data' && converted !== null && typeof converted === 'object'
          ? { ...converted, fontWeight: 'bold' as const }
          : converted;
      }),
    ),
  ];
}

const DISPLAY_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Valor de «Datos»: una fecha `dd/mm/aaaa` válida es celda de fecha; todo lo demás, texto (nunca fórmula). */
function metaValueCell(value: string): Cell {
  const match = DISPLAY_DATE.exec(value);
  if (match !== null) {
    const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return { type: Date, value: date, format: DATE_FORMAT };
    }
  }
  return textCell(value);
}

/** Hoja «Datos»: `Campo` y `Valor`, una fila por entrada de `meta`, en el mismo orden que el CSV. */
function metaSheet(model: ReportModel) {
  return {
    data: [
      [bold('Campo'), bold('Valor')],
      ...model.meta.map((entry): SheetData[number] => [textCell(entry.label), metaValueCell(entry.value)]),
    ] satisfies SheetData,
    sheet: 'Datos',
    columns: [{ width: 28 }, { width: 36 }],
  };
}

async function toXlsx(model: ReportModel): Promise<Uint8Array> {
  const tableSheets = model.tables.map((table) => ({
    data: toSheetData(table),
    sheet: table.sheetName,
    columns: table.columns.map((column) => ({ width: column.width })),
    stickyRowsCount: 2,
  }));
  const blob = await writeExcelFile([metaSheet(model), ...tableSheets]).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}

/** Excel de ADR-0013: hoja por tabla, encabezado fijo, anchos, celdas numéricas `#,##0.00` y fechas `dd/mm/yyyy`. */
export const excelWriter: ReportWriter = {
  format: 'excel',
  mimeType: EXPORT_FILE_TYPES.excel.mimeType,
  extension: EXPORT_FILE_TYPES.excel.extension,
  write: toXlsx,
};
