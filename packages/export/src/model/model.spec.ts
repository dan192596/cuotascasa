/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CurrencyMismatchError,
  compareSchedules,
  type Money,
  parseLocalDate,
  parseMoney,
  type Schedule,
  yearlySubtotals,
} from '@cuotascasa/domain';
import { describe, expect, it } from 'vitest';
import type { ReportCell } from '../report-model.ts';
import { buildComparisonReport, buildScheduleReport, formatLocalDate } from './index.ts';
import { syntheticGtqSchedule, syntheticUsdSchedule } from './synthetic.ts';

const generatedOn = parseLocalDate('2026-10-09');

function cellValue(cell: ReportCell | undefined): string | number | undefined {
  if (cell === undefined || cell.kind === 'empty') return undefined;
  return cell.value;
}

describe('formatLocalDate', () => {
  it('writes dd/mm/yyyy', () => {
    expect(formatLocalDate(parseLocalDate('2027-02-05'))).toBe('05/02/2027');
  });
});

describe('buildScheduleReport', () => {
  it('builds a Spanish-headed GTQ report with the currency label in money columns', () => {
    const model = buildScheduleReport({
      schedule: syntheticGtqSchedule(),
      pathKind: 'REAL',
      loanLabel: 'Casa A',
      generatedOn,
    });
    expect(model.kind).toBe('schedule');
    expect(model.title).toBe('Tabla de amortización');
    expect(model.currency).toBe('GTQ');
    expect(model.currencyLabel).toBe('Q');
    expect(model.generatedOn).toBe(generatedOn);
    const table = model.tables[0];
    expect(model.tables).toHaveLength(1);
    expect(table?.sheetName).toBe('Tabla');
    expect(table?.columns.map((c) => c.header)).toEqual([
      'Cuota',
      'Vencimiento',
      'Saldo inicial (Q)',
      'Capital (Q)',
      'Interés (Q)',
      'Seguros (Q)',
      'Cargos fijos (Q)',
      'Cuota total (Q)',
      'Abono (Q)',
      'Comisión (Q)',
      'Saldo final (Q)',
    ]);
    expect(model.meta).toEqual([
      { label: 'Préstamo', value: 'Casa A' },
      { label: 'Moneda', value: 'GTQ' },
      { label: 'Camino', value: 'Camino real' },
      { label: 'Cuotas', value: '4' },
      { label: 'Fecha de fin', value: '15/02/2027' },
      { label: 'Generado', value: '09/10/2026' },
    ]);
  });

  it('uses the US$ label for a USD loan and never mixes currencies', () => {
    const model = buildScheduleReport({
      schedule: syntheticUsdSchedule(),
      pathKind: 'ORIGINAL',
      loanLabel: 'Casa B',
      generatedOn,
    });
    expect(model.currency).toBe('USD');
    expect(model.currencyLabel).toBe('US$');
    expect(model.tables[0]?.columns[3]?.header).toBe('Capital (US$)');
    expect(model.meta.find((m) => m.label === 'Camino')?.value).toBe('Plan original');
  });

  it('labels the scenario path', () => {
    const model = buildScheduleReport({
      schedule: syntheticUsdSchedule(),
      pathKind: 'SCENARIO',
      loanLabel: 'x',
      generatedOn,
    });
    expect(model.meta.find((m) => m.label === 'Camino')?.value).toBe('Escenario');
  });

  it('emits data rows, a yearly subtotal after each year and a final total', () => {
    const schedule = syntheticGtqSchedule();
    const rows = buildScheduleReport({ schedule, pathKind: 'REAL', loanLabel: 'Casa A', generatedOn }).tables[0]!.rows;
    expect(rows.map((r) => r.role)).toEqual(['data', 'data', 'subtotal', 'data', 'data', 'subtotal', 'total']);
    const first = rows[0]!;
    expect(first.cells.map(cellValue)).toEqual([
      1,
      '2026-11-15',
      '1000.00',
      '200.00',
      '8.00',
      '1.50',
      '5.00',
      '214.50',
      '0.00',
      '0.00',
      '800.00',
    ]);
    expect(first.cells[0]?.kind).toBe('integer');
    expect(first.cells[1]?.kind).toBe('date');
    expect(first.cells[2]?.kind).toBe('money');
  });

  it('takes subtotals verbatim from domain yearlySubtotals and totals from schedule.totals', () => {
    for (const schedule of [syntheticGtqSchedule(), syntheticUsdSchedule()]) {
      const rows = buildScheduleReport({ schedule, pathKind: 'REAL', loanLabel: 'x', generatedOn }).tables[0]!.rows;
      const subtotalRows = rows.filter((r) => r.role === 'subtotal');
      const expected = yearlySubtotals(schedule);
      expect(subtotalRows).toHaveLength(expected.length);
      subtotalRows.forEach((row, i) => {
        const y = expected[i]!;
        expect(cellValue(row.cells[0])).toBeUndefined();
        expect(cellValue(row.cells[1])).toBe(`Subtotal ${y.year}`);
        expect(row.cells[1]?.kind).toBe('text');
        expect(row.cells.slice(2, 3).map((c) => c.kind)).toEqual(['empty']);
        expect(row.cells.slice(3).map(cellValue)).toEqual([
          y.capital,
          y.interest,
          y.insurance,
          y.fixedCharges,
          y.total,
          y.prepayments,
          y.commissions,
          undefined,
        ] as (Money | undefined)[]);
      });
      const total = rows.at(-1)!;
      expect(total.role).toBe('total');
      expect(cellValue(total.cells[1])).toBe('Total');
      expect(total.cells.slice(3).map(cellValue)).toEqual([
        schedule.totals.capital,
        schedule.totals.interest,
        schedule.totals.insurance,
        schedule.totals.fixedCharges,
        schedule.totals.total,
        schedule.totals.prepayments,
        schedule.totals.commissions,
        undefined,
      ]);
    }
  });

  it('every row has one cell per column', () => {
    const model = buildScheduleReport({
      schedule: syntheticGtqSchedule(),
      pathKind: 'REAL',
      loanLabel: 'x',
      generatedOn,
    });
    const table = model.tables[0]!;
    for (const row of table.rows) expect(row.cells).toHaveLength(table.columns.length);
  });

  it('flags an early payoff in the meta', () => {
    const schedule = syntheticGtqSchedule();
    const rows = schedule.rows.map((r, i) => (i === 2 ? { ...r, payoff: true } : r)).slice(0, 3);
    const early: Schedule = { ...schedule, rows, installmentCount: 3, endDate: parseLocalDate('2027-01-15') };
    const model = buildScheduleReport({ schedule: early, pathKind: 'REAL', loanLabel: 'x', generatedOn });
    expect(model.meta.find((m) => m.label === 'Liquidación anticipada')?.value).toBe('Sí');
    expect(model.meta.find((m) => m.label === 'Fecha de fin')?.value).toBe('15/01/2027');
  });

  it('handles an empty schedule', () => {
    const schedule: Schedule = { ...syntheticGtqSchedule(), rows: [], installmentCount: 0 };
    const rows = buildScheduleReport({ schedule, pathKind: 'REAL', loanLabel: 'x', generatedOn }).tables[0]!.rows;
    expect(rows.map((r) => r.role)).toEqual(['total']);
  });
});

describe('buildComparisonReport', () => {
  function build() {
    const base = syntheticGtqSchedule();
    const scenario: Schedule = {
      ...syntheticGtqSchedule(),
      rows: syntheticGtqSchedule().rows.slice(0, 3),
      installmentCount: 3,
    };
    return buildComparisonReport({
      base: { label: 'Real', schedule: base },
      scenarios: [{ label: 'Abono extra', schedule: scenario, metrics: compareSchedules(base, scenario) }],
      loanLabel: 'Casa A',
      generatedOn,
    });
  }

  it('builds one Comparación table with the base first and the scenario metrics', () => {
    const model = build();
    expect(model.kind).toBe('comparison');
    expect(model.title).toBe('Comparación de escenarios');
    expect(model.currencyLabel).toBe('Q');
    const table = model.tables[0]!;
    expect(table.sheetName).toBe('Comparación');
    expect(table.columns.map((c) => c.header)).toEqual([
      'Escenario',
      'Cuotas',
      'Fecha de fin',
      'Total pagado (Q)',
      'Interés ahorrado (Q)',
      'Meses ahorrados',
      'Ahorro neto (Q)',
    ]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.cells.map(cellValue)).toEqual([
      'Real',
      4,
      '2027-02-15',
      syntheticGtqSchedule().totals.totalPaid,
      undefined,
      undefined,
      undefined,
    ]);
    const metrics = compareSchedules(syntheticGtqSchedule(), {
      ...syntheticGtqSchedule(),
      rows: syntheticGtqSchedule().rows.slice(0, 3),
      installmentCount: 3,
    });
    expect(table.rows[1]?.cells.map(cellValue)).toEqual([
      'Abono extra',
      3,
      metrics.endDate,
      metrics.totalPaid,
      metrics.interestSaved,
      metrics.monthsSaved,
      metrics.netSaving,
    ]);
    expect(model.meta.map((m) => m.label)).toEqual(['Préstamo', 'Moneda', 'Base', 'Generado']);
  });

  it('keeps negative savings as negative amounts', () => {
    const base = syntheticGtqSchedule();
    const metrics = { ...compareSchedules(base, base), netSaving: parseMoney('-12.34') };
    const model = buildComparisonReport({
      base: { label: 'Real', schedule: base },
      scenarios: [{ label: 'Peor', schedule: base, metrics }],
      loanLabel: 'x',
      generatedOn,
    });
    expect(cellValue(model.tables[0]!.rows[1]!.cells[6])).toBe('-12.34');
  });

  it('rejects a scenario in another currency (R27)', () => {
    const base = syntheticGtqSchedule();
    const usd = syntheticUsdSchedule();
    expect(() =>
      buildComparisonReport({
        base: { label: 'Real', schedule: base },
        scenarios: [{ label: 'USD', schedule: usd, metrics: compareSchedules(base, base) }],
        loanLabel: 'x',
        generatedOn,
      }),
    ).toThrow(CurrencyMismatchError);
  });
});

describe('no own subtotal logic', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const files = ['index.ts', 'format.ts', 'schedule-report.ts', 'comparison-report.ts'];
  const source = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');

  it('delegates subtotals to yearlySubtotals', () => {
    expect(source).toContain('yearlySubtotals');
  });

  it('never sums or does arithmetic on money itself', () => {
    expect(source).not.toMatch(/\bmoney(Sum|Add|Sub)\b|\.plus\(|\.reduce\(|Number\(|parseFloat/);
  });
});
