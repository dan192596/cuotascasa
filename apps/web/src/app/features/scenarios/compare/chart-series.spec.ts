import { describe, expect, it } from 'vitest';
import { comparison, entry, ORIGINAL, REAL } from './testing/compare-fixtures.ts';
import { buildChartSeries, formatAxisValue } from './chart-series.ts';

describe('buildChartSeries', () => {
  const series = buildChartSeries(comparison([entry('s1', 'Abono A'), entry('s2', 'Abono B')]));

  it('has original, real and one series per scenario, in that order, with the labels of the table', () => {
    expect(series.map((s) => s.label)).toEqual(['Original', 'Real', 'Abono A', 'Abono B']);
    expect(series.map((s) => s.key)).toEqual(['original', 'real', 's1', 's2']);
  });

  it('starts every series at installment 0 with the opening balance and then one point per installment', () => {
    const real = series[1];
    expect(real?.points).toHaveLength(REAL.rows.length + 1);
    expect(real?.points[0]).toEqual({ x: 0, y: 1200, raw: '1200.00' });
    expect(real?.points[1]).toEqual({ x: 1, y: 1150, raw: '1150.00' });
    expect(series[0]?.points).toHaveLength(ORIGINAL.rows.length + 1);
  });

  it('keeps the original money string next to each number for the tooltip', () => {
    for (const s of series) {
      for (const point of s.points) expect(Number(point.raw)).toBe(point.y);
    }
  });

  it('uses only ink, ink-muted, accent and saving, and tells every series apart by dash or marker', () => {
    expect(new Set(series.map((s) => s.role))).toEqual(new Set(['ink', 'ink-muted', 'accent', 'saving']));
    const many = buildChartSeries(comparison([entry('a', 'A'), entry('b', 'B'), entry('c', 'C')]));
    expect(many.slice(2).map((s) => s.role)).toEqual(['accent', 'saving', 'ink']);
    const signatures = series.map((s) => `${s.dash.join(',')}|${s.marker}`);
    expect(new Set(signatures).size).toBe(series.length);
  });

  it('draws only 3 scenario series at most', () => {
    const many = buildChartSeries(comparison([entry('a', 'A'), entry('b', 'B'), entry('c', 'C'), entry('d', 'D')]));
    expect(many).toHaveLength(2 + 3);
    expect(new Set(many.map((s) => `${s.dash.join(',')}|${s.marker}`)).size).toBe(many.length);
  });

  it('formats axis values grouped and rounded in es-GT without a currency symbol', () => {
    expect(formatAxisValue(0)).toBe('0');
    expect(formatAxisValue(1500.4).replace(/\D/g, '')).toBe('1500');
    expect(formatAxisValue(1500)).not.toMatch(/Q|US\$/);
  });
});
