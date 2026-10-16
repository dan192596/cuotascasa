import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseLocalDate, parseMoney, PathKind } from '@cuotascasa/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildComparisonReport } from '../model/comparison-report.ts';
import { buildScheduleReport } from '../model/schedule-report.ts';
import { syntheticGtqSchedule, syntheticUsdSchedule } from '../model/synthetic.ts';
import type { ReportModel, ReportRow } from '../report-model.ts';
import { pdfWriter } from './index.ts';
import { formatPdfMoney, toPdfTableInput } from './table-input.ts';

// pdfjs-dist es solo de pruebas.
const FONTS = `${join(dirname(fileURLToPath(import.meta.url)), '../../node_modules/pdfjs-dist/standard_fonts')}/`;

/** Texto de cada página, con las líneas unidas por saltos de línea. */
export async function extractPages(bytes: Uint8Array): Promise<string[]> {
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false, standardFontDataUrl: FONTS });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
        .join('')
        .replace(/ +/g, ' '),
    );
  }
  await task.destroy();
  return pages;
}

export async function extractText(bytes: Uint8Array): Promise<string> {
  return (await extractPages(bytes)).join('\n');
}

const generatedOn = parseLocalDate('2026-10-16');

const gtq = buildScheduleReport({
  schedule: syntheticGtqSchedule(),
  pathKind: PathKind.ORIGINAL,
  loanLabel: 'Casa de prueba',
  generatedOn,
});
const usd = buildScheduleReport({
  schedule: syntheticUsdSchedule(),
  pathKind: PathKind.ORIGINAL,
  loanLabel: 'Casa en dólares',
  generatedOn,
});

/** Reporte sintético con una columna «Año» (el modelo de calendario no la trae) y n filas de datos. */
function bigModel(rowCount: number): ReportModel {
  const rows: ReportRow[] = Array.from({ length: rowCount }, (_, i) => ({
    role: 'data',
    cells: [
      { kind: 'integer', value: 2026 + Math.floor(i / 12) },
      { kind: 'integer', value: i + 1 },
      { kind: 'money', value: parseMoney(`${1000 + i}.50`) },
    ],
  }));
  rows.push({
    role: 'subtotal',
    cells: [
      { kind: 'text', value: 'Subtotal 2026' },
      { kind: 'empty' },
      { kind: 'money', value: parseMoney('12345.60') },
    ],
  });
  rows.push({
    role: 'total',
    cells: [{ kind: 'text', value: 'Total' }, { kind: 'empty' }, { kind: 'money', value: parseMoney('1234567.89') }],
  });
  return {
    kind: 'schedule',
    title: 'Tabla de amortización',
    currency: 'GTQ',
    currencyLabel: 'Q',
    generatedOn,
    meta: [{ label: 'Moneda', value: 'GTQ' }],
    tables: [
      {
        sheetName: 'Tabla',
        title: 'Tabla de amortización',
        columns: [
          { key: 'year', header: 'Año', kind: 'integer', width: 8 },
          { key: 'k', header: 'Cuota', kind: 'integer', width: 8 },
          { key: 'interest', header: 'Interés (Q)', kind: 'money', width: 16 },
        ],
        rows,
      },
    ],
  };
}

describe('formatPdfMoney', () => {
  it.each([
    ['0.00', '0.00'],
    ['5.00', '5.00'],
    ['1234.56', '1,234.56'],
    ['1234567.89', '1,234,567.89'],
    ['-1234.50', '-1,234.50'],
    ['100', '100'],
  ])('%s -> %s', (input, expected) => {
    expect(formatPdfMoney(input as never)).toBe(expected);
  });
});

describe('toPdfTableInput', () => {
  it('snapshot: calendario sintético en quetzales', () => {
    expect(toPdfTableInput(gtq.tables[0]!)).toMatchSnapshot();
  });
  it('snapshot: calendario sintético en dólares', () => {
    expect(toPdfTableInput(usd.tables[0]!)).toMatchSnapshot();
  });
  it('despacha por cell.kind: el texto de subtotal en la columna de fecha no se formatea como fecha', () => {
    const body = toPdfTableInput(gtq.tables[0]!).body;
    const subtotal = body.find((row) => row.role === 'subtotal');
    expect(subtotal?.cells[1]?.content).toBe('Subtotal 2026');
    expect(subtotal?.cells[0]?.content).toBe('');
  });
});

describe('pdfWriter', () => {
  it('declara formato, tipo MIME y extensión', () => {
    expect(pdfWriter.format).toBe('pdf');
    expect(pdfWriter.mimeType).toBe('application/pdf');
    expect(pdfWriter.extension).toBe('pdf');
  });

  it('empieza con %PDF-', async () => {
    const bytes = await pdfWriter.write(gtq);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('el texto extraído con pdfjs trae acentos, encabezados, subtotal, total y fecha', async () => {
    const text = await extractText(await pdfWriter.write(gtq));
    expect(text).toContain('Tabla de amortización');
    expect(text).toContain('Interés');
    expect(text).toContain('Casa de prueba');
    expect(text).toContain('Subtotal 2026');
    expect(text).toContain('Subtotal 2027');
    expect(text).toContain('Total');
    expect(text).toContain('16/10/2026');
    expect(text).toContain('Página 1 de 1');
    expect(text).toContain('1,000.00');
  });

  it('encabezado «Año» con su acento correcto', async () => {
    const text = await extractText(await pdfWriter.write(bigModel(3)));
    expect(text).toContain('Año');
    expect(text).toContain('Interés');
  });

  it('360 filas paginan igual que el pie «Página x de y», con encabezado repetido', async () => {
    const pages = await extractPages(await pdfWriter.write(bigModel(360)));
    // 362 renglones (360 + subtotal + total) a unos 52 por página vertical carta.
    expect(pages.length).toBe(7);
    pages.forEach((page, i) => {
      expect(page).toContain(`Página ${i + 1} de ${pages.length}`);
      expect(page).toContain('Interés');
    });
    expect(pages.at(-1)).toContain('1,234,567.89');
  });

  it('produce una tabla por ReportTable (comparación)', async () => {
    const comparison = buildComparisonReport({
      base: { label: 'Plan original', schedule: syntheticGtqSchedule() },
      scenarios: [],
      loanLabel: 'Casa de prueba',
      generatedOn,
    });
    const text = await extractText(await pdfWriter.write(comparison));
    expect(text).toContain('Comparación de escenarios');
    expect(text).toContain('Plan original');
  });
});

async function maxRightEdge(bytes: Uint8Array): Promise<number> {
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false, standardFontDataUrl: FONTS });
  const doc = await task.promise;
  let max = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    for (const item of content.items) {
      if ('str' in item) max = Math.max(max, item.transform[4] + item.width);
    }
  }
  await task.destroy();
  return max;
}

describe('determinismo y maquetación', () => {
  afterEach(() => vi.useRealTimers());

  it('el mismo modelo da los mismos bytes aunque pase el tiempo', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    const first = await pdfWriter.write(gtq);
    vi.setSystemTime(new Date('2026-10-16T12:00:05Z'));
    const second = await pdfWriter.write(gtq);
    expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true);
    expect(new TextDecoder('latin1').decode(first)).toContain("/CreationDate (D:20261016000000+00'00')");
  });

  it('un monto negativo conserva el signo y no lleva símbolo de moneda', async () => {
    const model = bigModel(1);
    const table = model.tables[0]!;
    const withNegative: ReportModel = {
      ...model,
      tables: [
        {
          ...table,
          rows: [
            {
              role: 'data',
              cells: [
                { kind: 'integer', value: 2026 },
                { kind: 'integer', value: 1 },
                { kind: 'money', value: parseMoney('-1234.50') },
              ],
            },
          ],
        },
      ],
    };
    const text = await extractText(await pdfWriter.write(withNegative));
    expect(text).toContain('-1,234.50');
    expect(text).not.toContain('Q -1,234.50');
  });

  it('el título y los datos largos se parten dentro del ancho útil', async () => {
    const long = 'palabra '.repeat(60).trim();
    const model: ReportModel = {
      ...bigModel(1),
      title: `Título ${long}`,
      meta: [{ label: 'Préstamo', value: long }],
    };
    const right = await maxRightEdge(await pdfWriter.write(model));
    expect(right).toBeLessThanOrEqual(612 - 28 + 1);
  });
});

describe('escaneo estático (ADR-0013 §8, ADR-0021)', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const sources = readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map((f) => ({ f, code: readFileSync(join(dir, f), 'utf8') }));

  it('hay fuentes que escanear', () => {
    expect(sources.length).toBeGreaterThan(1);
  });

  it.each([
    ['eval', /\beval\s*\(/],
    ['new Function', /\bnew\s+Function\b|\bFunction\s*\(/],
    ['setTimeout con cadena', /set(Timeout|Interval)\s*\(\s*['"`]/],
    ['fetch', /\bfetch\s*\(/],
    ['XMLHttpRequest', /XMLHttpRequest/],
    ['WebSocket/sendBeacon', /WebSocket|sendBeacon|EventSource/],
    ['URL remota', /https?:\/\//],
    [
      'sumideros del DOM',
      /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\.html\s*\(|addHTML|addSvgAsImage|\.svg\s*\(/,
    ],
    ['importación dinámica', /\bimport\s*\(/],
  ])('sin %s', (_name, pattern) => {
    for (const { f, code } of sources) {
      expect(pattern.test(code), `${f} coincide con ${String(pattern)}`).toBe(false);
    }
  });
});
