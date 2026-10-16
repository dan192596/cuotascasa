import { jsPDF } from 'jspdf';
import { autoTable, type CellDef, type RowInput } from 'jspdf-autotable';
import { EXPORT_FILE_TYPES, type ReportModel, type ReportWriter } from '../report-model.ts';
import { formatLocalDate } from '../model/format.ts';
import { type PdfRow, toPdfTableInput } from './table-input.ts';

/*
 * Estilo libreta (ADR-0012): títulos con serifa, números en monoespaciada, renglones finos. Solo fuentes estándar de
 * PDF (Times, Courier, Helvetica): jsPDF no lee woff2 y no se empaqueta ninguna fuente. Nada de html(), SVG ni red.
 */
const MARGIN = { top: 44, right: 28, bottom: 40, left: 28 } as const;
const INK: [number, number, number] = [30, 30, 30];
const MUTED: [number, number, number] = [95, 95, 95];
const RULE: [number, number, number] = [170, 170, 170];
const BAND: [number, number, number] = [238, 238, 238];
const TOTAL_BAND: [number, number, number] = [222, 222, 222];
const WIDE_COLUMNS = 6;

function rowStyles(role: PdfRow['role']): Partial<CellDef['styles']> {
  switch (role) {
    case 'data':
      return {};
    case 'subtotal':
      return { fontStyle: 'bold', fillColor: BAND };
    case 'total':
      return { fontStyle: 'bold', fillColor: TOTAL_BAND };
  }
}

/*
 * Las celdas de dinero no llevan símbolo de moneda a propósito: el rótulo ('Q' o 'US$') ya va en el encabezado de
 * cada columna y en la línea «Moneda». Los montos negativos conservan su signo.
 */
function toRows(rows: readonly PdfRow[]): RowInput[] {
  return rows.map((row) =>
    row.cells.map((cell): CellDef => ({
      content: cell.content,
      styles: { halign: cell.halign, ...rowStyles(row.role) },
    })),
  );
}

function render(model: ReportModel): Uint8Array {
  const wide = model.tables.some((table) => table.columns.length > WIDE_COLUMNS);
  const doc = new jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const usable = pageWidth - MARGIN.left - MARGIN.right;

  doc.setProperties({ title: model.title, creator: 'CuotasCasa' });
  doc.setFileId('00000000000000000000000000000000');
  // Salida determinista: jsPDF sellaría la fecha de creación con el reloj y la zona horaria locales.
  doc.setCreationDate(`D:${model.generatedOn.replaceAll('-', '')}000000+00'00'`);

  let y = MARGIN.top;
  doc.setTextColor(...INK);
  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  const titleLines = doc.splitTextToSize(model.title, usable);
  doc.text(titleLines, MARGIN.left, y);
  y += 18 + (titleLines.length - 1) * 20;

  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  for (const entry of model.meta) {
    const lines = doc.splitTextToSize(`${entry.label}: ${entry.value}`, usable);
    doc.text(lines, MARGIN.left, y);
    y += 12 * lines.length;
  }
  doc.text(`Moneda: ${model.currencyLabel}`, MARGIN.left, y);
  y += 12;
  doc.setDrawColor(...RULE);
  doc.line(MARGIN.left, y, MARGIN.left + usable, y);
  y += 14;

  for (const table of model.tables) {
    const input = toPdfTableInput(table);
    if (model.tables.length > 1) {
      doc.setFont('times', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...INK);
      doc.text(input.title, MARGIN.left, y);
      y += 10;
    }
    const totalChars = input.columnWidths.reduce((sum, width) => sum + width, 0);
    const columnStyles = Object.fromEntries(
      input.columnWidths.map((width, i) => [i, { cellWidth: (width / totalChars) * usable }]),
    );
    let bottom = y;
    autoTable(doc, {
      startY: y,
      margin: MARGIN,
      head: [
        input.head.map((header, i): CellDef => ({ content: header, styles: { halign: input.headAlign[i] ?? 'left' } })),
      ],
      body: toRows(input.body),
      columnStyles,
      theme: 'grid',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: 'courier',
        fontSize: 7,
        cellPadding: 2.5,
        textColor: INK,
        lineColor: RULE,
        lineWidth: 0.4,
        overflow: 'linebreak',
      },
      headStyles: { font: 'times', fontStyle: 'bold', fontSize: 8, fillColor: BAND, textColor: INK },
      didDrawPage: (data) => {
        bottom = data.cursor?.y ?? bottom;
      },
    });
    y = bottom + 20;
  }

  const pages = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generated = `Generado: ${formatLocalDate(model.generatedOn)}`;
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(generated, MARGIN.left, pageHeight - 20);
    doc.text(`Página ${page} de ${pages}`, MARGIN.left + usable, pageHeight - 20, { align: 'right' });
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

/** PDF de ADR-0013 §5: título, datos del préstamo, moneda, tablas con subtotales anuales, «Página x de y» y fecha. */
export const pdfWriter: ReportWriter = {
  format: 'pdf',
  mimeType: EXPORT_FILE_TYPES.pdf.mimeType,
  extension: EXPORT_FILE_TYPES.pdf.extension,
  write: (model) => Promise.resolve(render(model)),
};
