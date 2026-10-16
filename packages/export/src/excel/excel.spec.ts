import { parseLocalDate, parseMoney, PathKind } from '@cuotascasa/domain';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildComparisonReport, buildScheduleReport } from '../model/index.ts';
import { syntheticGtqSchedule, syntheticUsdSchedule } from '../model/synthetic.ts';
import type { ReportCell, ReportModel } from '../report-model.ts';
import { excelWriter } from './index.ts';

const generatedOn = parseLocalDate('2026-10-09');

type Files = Record<string, Uint8Array>;
const unzip = (bytes: Uint8Array): Files => unzipSync(bytes);
const xml = (files: Files, path: string): string => {
  const file = files[path];
  if (file === undefined) throw new Error(`missing ${path}`);
  return strFromU8(file);
};

const unescapeXml = (s: string): string =>
  s
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');

interface ParsedCell {
  readonly ref: string;
  readonly type: string | undefined;
  readonly style: string | undefined;
  readonly formula: boolean;
  /** Raw `<v>` text, or the resolved string for string cells. */
  readonly value: string | undefined;
}

function sharedStrings(files: Files): string[] {
  const path = 'xl/sharedStrings.xml';
  if (files[path] === undefined) return [];
  return [...xml(files, path).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unescapeXml([...(m[1] ?? '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  );
}

function readSheet(files: Files, sheetPath: string): ParsedCell[][] {
  const strings = sharedStrings(files);
  const sheet = xml(files, sheetPath);
  return [...sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((row) =>
    [...(row[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c): ParsedCell => {
      const attrs = c[1] ?? '';
      const body = c[2] ?? '';
      const type = /\bt="([^"]*)"/.exec(attrs)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1];
      let value = raw;
      if (type === 's' && raw !== undefined) value = strings[Number(raw)];
      if (type === 'inlineStr' && inline !== undefined) value = unescapeXml(inline);
      return {
        ref: /\br="([^"]*)"/.exec(attrs)?.[1] ?? '',
        type,
        style: /\bs="([^"]*)"/.exec(attrs)?.[1],
        formula: /<f[ >/]/.test(body),
        value,
      };
    }),
  );
}

const byRef = (rows: ParsedCell[][], ref: string): ParsedCell | undefined =>
  rows.flat().find((cell) => cell.ref === ref);

function sheetNames(files: Files): string[] {
  return [...xml(files, 'xl/workbook.xml').matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) =>
    unescapeXml(m[1] ?? ''),
  );
}

function modelWith(cells: readonly ReportCell[], title = 'Tabla de amortización'): ReportModel {
  return {
    kind: 'schedule',
    title,
    currency: 'GTQ',
    currencyLabel: 'Q',
    generatedOn,
    meta: [{ label: 'Moneda', value: 'GTQ' }],
    tables: [
      {
        sheetName: 'Tabla',
        title,
        columns: cells.map((_, i) => ({ key: `c${i}`, header: `C${i}`, kind: 'text' as const, width: 12 })),
        rows: [{ role: 'data', cells }],
      },
    ],
  };
}

async function sheet1(model: ReportModel): Promise<{ files: Files; rows: ParsedCell[][] }> {
  const files = unzip(await excelWriter.write(model));
  return { files, rows: readSheet(files, 'xl/worksheets/sheet1.xml') };
}

describe('excelWriter', () => {
  it('declares format, MIME type and extension', () => {
    expect([excelWriter.format, excelWriter.mimeType, excelWriter.extension]).toEqual([
      'excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'xlsx',
    ]);
  });

  it('produces a zip (PK) containing [Content_Types].xml', async () => {
    const bytes = await excelWriter.write(
      buildScheduleReport({
        schedule: syntheticGtqSchedule(),
        pathKind: PathKind.ORIGINAL,
        loanLabel: 'Préstamo de prueba',
        generatedOn,
      }),
    );
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    expect(Object.keys(unzip(bytes))).toContain('[Content_Types].xml');
  });

  it('names the sheets after the report tables', async () => {
    const schedule = buildScheduleReport({
      schedule: syntheticGtqSchedule(),
      pathKind: PathKind.ORIGINAL,
      loanLabel: 'Préstamo de prueba',
      generatedOn,
    });
    expect(sheetNames(unzip(await excelWriter.write(schedule)))).toEqual(['Tabla']);
    const comparison = buildComparisonReport({
      base: { label: 'Base', schedule: syntheticGtqSchedule() },
      scenarios: [],
      loanLabel: 'Préstamo de prueba',
      generatedOn,
    });
    expect(sheetNames(unzip(await excelWriter.write(comparison)))).toEqual(['Comparación']);
  });

  it('freezes the title and header rows and sets column widths', async () => {
    const { files } = await sheet1(
      buildScheduleReport({
        schedule: syntheticGtqSchedule(),
        pathKind: PathKind.ORIGINAL,
        loanLabel: 'Préstamo de prueba',
        generatedOn,
      }),
    );
    const sheet = xml(files, 'xl/worksheets/sheet1.xml');
    expect(sheet).toMatch(/<pane\b[^>]*ySplit="2"/);
    expect(sheet).toMatch(/<pane\b[^>]*state="frozen"/);
    expect(sheet).toMatch(/<col\b[^>]*width="18"/);
  });

  it('writes the title row and the headers (with the currency label) as text', async () => {
    const model = buildScheduleReport({
      schedule: syntheticGtqSchedule(),
      pathKind: PathKind.ORIGINAL,
      loanLabel: 'Préstamo de prueba',
      generatedOn,
    });
    const { rows } = await sheet1(model);
    expect(rows[0]?.[0]?.value).toBe('Tabla de amortización');
    expect(rows[1]?.map((c) => c.value)).toEqual(model.tables[0]?.columns.map((c) => c.header));
    expect(rows[1]?.[2]?.value).toContain('(Q)');
  });

  it('writes money as numeric cells that round-trip to the original 2-decimal string, negatives included', async () => {
    const amounts = ['0.00', '1.05', '-12.34', '1234567.89', '0.10', '99999999999.99'];
    const { files, rows } = await sheet1(
      modelWith(amounts.map((a): ReportCell => ({ kind: 'money', value: parseMoney(a) }))),
    );
    const cells = rows[2] ?? [];
    expect(cells).toHaveLength(amounts.length);
    cells.forEach((cell, i) => {
      expect(cell.formula).toBe(false);
      expect(cell.type === undefined || cell.type === 'n').toBe(true);
      expect(Number(cell.value).toFixed(2)).toBe(amounts[i]);
    });
    const styles = xml(files, 'xl/styles.xml');
    expect(styles).toContain('#,##0.00');
  });

  it('round-trips every money cell of the synthetic reports', async () => {
    for (const schedule of [syntheticGtqSchedule(), syntheticUsdSchedule()]) {
      const model = buildScheduleReport({
        schedule,
        pathKind: PathKind.ORIGINAL,
        loanLabel: 'Préstamo de prueba',
        generatedOn,
      });
      const { rows } = await sheet1(model);
      const table = model.tables[0];
      let checked = 0;
      table?.rows.forEach((row, r) => {
        row.cells.forEach((cell, c) => {
          if (cell.kind !== 'money') return;
          const parsed = byRef(rows, `${String.fromCharCode(65 + c)}${r + 3}`);
          expect(Number(parsed?.value).toFixed(2)).toBe(cell.value);
          checked += 1;
        });
      });
      expect(checked).toBeGreaterThan(10);
    }
  });

  it('writes dates as date cells with a dd/mm/yyyy format and integers as numbers', async () => {
    const { files, rows } = await sheet1(
      modelWith([
        { kind: 'date', value: parseLocalDate('2026-03-05') },
        { kind: 'integer', value: 7 },
      ]),
    );
    const [date, integer] = rows[2] ?? [];
    // 2026-03-05 as an Excel serial day number.
    expect(Number(date?.value)).toBe(46086);
    expect(date?.style).toBeDefined();
    expect(xml(files, 'xl/styles.xml').toLowerCase()).toContain('dd/mm/yyyy');
    expect(integer?.value).toBe('7');
    expect(integer?.type === undefined || integer.type === 'n').toBe(true);
  });

  it('keeps text in a date column as text (dispatch by cell.kind)', async () => {
    const { rows } = await sheet1(modelWith([{ kind: 'text', value: 'Total' }, { kind: 'empty' }]));
    expect(rows[2]?.[0]?.value).toBe('Total');
    expect(rows[2]?.[0]?.type === 's' || rows[2]?.[0]?.type === 'inlineStr').toBe(true);
  });

  it('never writes text as a formula, including after whitespace, NBSP and U+3000', async () => {
    const hostile = [
      '=1+1',
      '+SUM(A1)',
      '-2+3',
      '@cmd',
      '\t=1',
      ' =1',
      ' =1',
      '　@x',
      '\n=1',
      '=HYPERLINK("http://x")',
    ];
    const { files, rows } = await sheet1(modelWith(hostile.map((value): ReportCell => ({ kind: 'text', value }))));
    const cells = rows[2] ?? [];
    expect(cells).toHaveLength(hostile.length);
    cells.forEach((cell, i) => {
      expect(cell.formula).toBe(false);
      expect(cell.type === 's' || cell.type === 'inlineStr').toBe(true);
      expect(cell.value).toBe(hostile[i]);
    });
    expect(xml(files, 'xl/worksheets/sheet1.xml')).not.toContain('<f>');
  });

  it('writes a non-conforming money value as text, never as a number or formula', async () => {
    const { rows } = await sheet1(
      modelWith([
        { kind: 'money', value: '=2+2' as never },
        { kind: 'money', value: '1e5' as never },
      ]),
    );
    for (const cell of rows[2] ?? []) {
      expect(cell.formula).toBe(false);
      expect(cell.type === 's' || cell.type === 'inlineStr').toBe(true);
    }
  });

  it('leaves empty cells blank', async () => {
    const { rows } = await sheet1(modelWith([{ kind: 'empty' }, { kind: 'text', value: 'x' }]));
    expect(byRef(rows, 'A3')?.value).toBeUndefined();
    expect(byRef(rows, 'B3')?.value).toBe('x');
  });

  it('matches the snapshot of the sheet data for two synthetic reports', async () => {
    const reports = [
      buildScheduleReport({
        schedule: syntheticGtqSchedule(),
        pathKind: PathKind.ORIGINAL,
        loanLabel: 'Préstamo A',
        generatedOn,
      }),
      buildComparisonReport({
        base: { label: 'Base', schedule: syntheticUsdSchedule() },
        scenarios: [],
        loanLabel: 'Préstamo B',
        generatedOn,
      }),
    ];
    const out = [];
    for (const report of reports) {
      const files = unzip(await excelWriter.write(report));
      out.push({
        sheets: sheetNames(files),
        rows: readSheet(files, 'xl/worksheets/sheet1.xml').map((row) =>
          row.map((c) => [c.ref, c.type ?? 'n', c.value]),
        ),
      });
    }
    expect(out).toMatchSnapshot();
  });
});
