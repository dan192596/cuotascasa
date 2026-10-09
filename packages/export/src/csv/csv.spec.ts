import { parseLocalDate, parseMoney } from '@cuotascasa/domain';
import { describe, expect, it } from 'vitest';
import { buildScheduleReport } from '../model/index.ts';
import { syntheticGtqSchedule, syntheticUsdSchedule } from '../model/synthetic.ts';
import type { ReportModel } from '../report-model.ts';
import { csvWriter } from './index.ts';

const generatedOn = parseLocalDate('2026-10-09');

function textOf(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
}

function modelWith(rows: ReportModel['tables'][number]['rows']): ReportModel {
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
        title: 'Tabla',
        columns: [
          { key: 'a', header: 'A', kind: 'text', width: 10 },
          { key: 'b', header: 'B', kind: 'money', width: 10 },
        ],
        rows,
      },
    ],
  };
}

async function lines(model: ReportModel): Promise<string[]> {
  return textOf(await csvWriter.write(model)).split('\r\n');
}

describe('csvWriter', () => {
  it('declares format, MIME type and extension', () => {
    expect([csvWriter.format, csvWriter.mimeType, csvWriter.extension]).toEqual([
      'csv',
      'text/csv;charset=utf-8',
      'csv',
    ]);
  });

  it('starts with the UTF-8 BOM and uses CRLF, ending with a CRLF', async () => {
    const bytes = await csvWriter.write(modelWith([]));
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = textOf(bytes);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('keeps accents as UTF-8', async () => {
    const text = textOf(await csvWriter.write(modelWith([])));
    expect(text).toContain('Tabla de amortización');
  });

  it('quotes cells per RFC 4180', async () => {
    const out = await lines(
      modelWith([
        {
          role: 'data',
          cells: [
            { kind: 'text', value: 'a,b' },
            { kind: 'text', value: 'dice "hola"\nlinea' },
          ],
        },
      ]),
    );
    expect(out).toContain('"a,b","dice ""hola""\nlinea"');
  });

  it('neutralizes text cells starting with = + - @ tab or CR', async () => {
    const cases: [string, string][] = [
      ['=SUM(A1)', "'=SUM(A1)"],
      ['+1', "'+1"],
      ['-cmd', "'-cmd"],
      ['@x', "'@x"],
      ['\tx', "'\tx"],
      ['-12.34', "'-12.34"],
    ];
    for (const [input, expected] of cases) {
      const out = await lines(
        modelWith([{ role: 'data', cells: [{ kind: 'text', value: input }, { kind: 'empty' }] }]),
      );
      expect(out).toContain(`${expected},`);
    }
    const cr = textOf(
      await csvWriter.write(modelWith([{ role: 'data', cells: [{ kind: 'text', value: '\rx' }, { kind: 'empty' }] }])),
    );
    expect(cr).toContain('"\'\rx",');
  });

  it('neutralizes a formula character hidden behind leading whitespace', async () => {
    const cases: [string, string][] = [
      [' =1+1', "' =1+1,"],
      ['  +cmd', "'  +cmd,"],
      ['\u00A0@x', "'\u00A0@x,"],
      ['\u3000-1', "'\u3000-1,"],
    ];
    for (const [input, expected] of cases) {
      const out = await lines(
        modelWith([{ role: 'data', cells: [{ kind: 'text', value: input }, { kind: 'empty' }] }]),
      );
      expect(out).toContain(expected);
    }
  });

  it('neutralizes a leading line feed inside a quoted cell', async () => {
    const text = textOf(
      await csvWriter.write(
        modelWith([{ role: 'data', cells: [{ kind: 'text', value: '\n=1+1' }, { kind: 'empty' }] }]),
      ),
    );
    expect(text).toContain('"\'\n=1+1",');
  });

  it('leaves a full-width formula character unchanged (spreadsheets do not evaluate it)', async () => {
    const out = await lines(
      modelWith([{ role: 'data', cells: [{ kind: 'text', value: '＝1+1' }, { kind: 'empty' }] }]),
    );
    expect(out).toContain('＝1+1,');
  });

  it('leaves a safe text cell untouched', async () => {
    const out = await lines(
      modelWith([{ role: 'data', cells: [{ kind: 'text', value: 'Casa = A' }, { kind: 'empty' }] }]),
    );
    expect(out).toContain('Casa = A,');
  });

  it('writes negative amounts and integers unchanged', async () => {
    const out = await lines(
      modelWith([
        {
          role: 'data',
          cells: [
            { kind: 'integer', value: -3 },
            { kind: 'money', value: parseMoney('-12.34') },
          ],
        },
        {
          role: 'data',
          cells: [
            { kind: 'money', value: parseMoney('1234.50') },
            { kind: 'money', value: parseMoney('0.00') },
          ],
        },
      ]),
    );
    expect(out).toContain('-3,-12.34');
    expect(out).toContain('1234.50,0.00');
  });

  it('neutralizes a money-kind cell whose value is not a plain number', async () => {
    const out = await lines(
      modelWith([{ role: 'data', cells: [{ kind: 'money', value: '=1+1' as never }, { kind: 'empty' }] }]),
    );
    expect(out).toContain("'=1+1,");
  });

  it('writes dates as dd/mm/yyyy and empty cells as blanks', async () => {
    const out = await lines(
      modelWith([{ role: 'data', cells: [{ kind: 'date', value: parseLocalDate('2027-02-05') }, { kind: 'empty' }] }]),
    );
    expect(out).toContain('05/02/2027,');
  });

  it('writes title, metadata, a blank line and a header row for each table', async () => {
    const out = await lines(modelWith([]));
    expect(out.slice(0, 6)).toEqual(['\uFEFFTabla de amortización', 'Moneda,GTQ', '', 'Tabla', 'A,B', '']);
  });

  it('separates several tables with a blank line', async () => {
    const model = modelWith([]);
    const two: ReportModel = { ...model, tables: [...model.tables, { ...model.tables[0]!, title: 'Otra' }] };
    const out = await lines(two);
    expect(out.filter((l) => l === 'Otra')).toHaveLength(1);
    expect(out[out.indexOf('Otra') - 1]).toBe('');
  });

  it('is deterministic', async () => {
    const model = buildScheduleReport({
      schedule: syntheticGtqSchedule(),
      pathKind: 'REAL',
      loanLabel: 'Casa A',
      generatedOn,
    });
    expect(await csvWriter.write(model)).toEqual(await csvWriter.write(model));
  });

  it('matches the snapshot of a synthetic GTQ loan', async () => {
    const model = buildScheduleReport({
      schedule: syntheticGtqSchedule(),
      pathKind: 'REAL',
      loanLabel: 'Casa A',
      generatedOn,
    });
    expect(textOf(await csvWriter.write(model))).toMatchSnapshot();
  });

  it('matches the snapshot of a synthetic USD loan', async () => {
    const model = buildScheduleReport({
      schedule: syntheticUsdSchedule(),
      pathKind: 'ORIGINAL',
      loanLabel: 'Casa B',
      generatedOn,
    });
    expect(textOf(await csvWriter.write(model))).toMatchSnapshot();
  });

  it('has no import side effects: the module only exports the writer', async () => {
    const mod = await import('./index.ts');
    expect(Object.keys(mod)).toEqual(['csvWriter']);
  });
});
