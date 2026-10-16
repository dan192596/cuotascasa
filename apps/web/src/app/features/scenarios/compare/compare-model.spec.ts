import { CurrencyMismatchError, InvalidInputError, NegativeAmortizationError, type Money } from '@cuotascasa/domain';
import { describe, expect, it } from 'vitest';
import { comparison, entry } from './testing/compare-fixtures.ts';
import {
  describeFailure,
  MAX_COMPARED,
  metricsTable,
  monthsText,
  toggleScenario,
  yearlyBalanceTable,
} from './compare-model.ts';

describe('toggleScenario', () => {
  it('adds and removes ids and never passes the limit', () => {
    expect(MAX_COMPARED).toBe(3);
    expect(toggleScenario([], 'a', true)).toEqual({ ids: ['a'], blocked: false });
    expect(toggleScenario(['a', 'b'], 'b', false)).toEqual({ ids: ['a'], blocked: false });
    expect(toggleScenario(['a', 'b', 'c'], 'd', true)).toEqual({ ids: ['a', 'b', 'c'], blocked: true });
    expect(toggleScenario(['a', 'b', 'c'], 'c', false)).toEqual({ ids: ['a', 'b'], blocked: false });
    expect(toggleScenario(['a'], 'a', true)).toEqual({ ids: ['a'], blocked: false });
  });
});

describe('monthsText', () => {
  it('pluralises and keeps the sign', () => {
    expect(monthsText(0)).toBe('0 meses');
    expect(monthsText(1)).toBe('1 mes');
    expect(monthsText(22)).toBe('22 meses');
    expect(monthsText(-1)).toBe('-1 mes');
    expect(monthsText(-3)).toBe('-3 meses');
  });
});

describe('metricsTable', () => {
  const table = metricsTable(
    comparison([entry('s1', 'Abono A'), entry('s2', 'Abono B', { interestSaved: '-10.00' as Money })]),
  );

  it('has the concept column, original, real and one column per scenario', () => {
    expect(table.columns.map((c) => c.heading)).toEqual(['Original', 'Real (base)', 'Abono A', 'Abono B']);
    expect(table.currency).toBe('GTQ');
  });

  it('lists the [ALG.METRICS] rows with the glossary names', () => {
    expect(table.rows.map((r) => r.label)).toEqual([
      'Interés ahorrado',
      'Meses ahorrados',
      'Ahorro neto',
      'Fecha de fin',
      'Total pagado',
    ]);
  });

  it('takes the scenario cells verbatim from the metrics and leaves the base columns without savings', () => {
    const net = table.rows.find((r) => r.label === 'Ahorro neto');
    expect(net?.cells).toEqual([
      { type: 'none' },
      { type: 'none' },
      { type: 'money', value: '2000.00', negative: false },
      { type: 'money', value: '2000.00', negative: false },
    ]);
    const end = table.rows.find((r) => r.label === 'Fecha de fin');
    expect(end?.cells[2]).toEqual({ type: 'date', value: '2026-12-28' });
    const paid = table.rows.find((r) => r.label === 'Total pagado');
    expect(paid?.cells[0]).toEqual({ type: 'money', value: '31000.00', negative: false });
    expect(paid?.cells[1]).toEqual({ type: 'money', value: '30000.00', negative: false });
    expect(paid?.cells[2]).toEqual({ type: 'money', value: '28000.00', negative: false });
  });

  it('keeps a negative figure with its sign and flags it', () => {
    const interest = table.rows.find((r) => r.label === 'Interés ahorrado');
    expect(interest?.cells[3]).toEqual({ type: 'money', value: '-10.00', negative: true });
  });

  it('flags negative months', () => {
    const t = metricsTable(comparison([entry('s1', 'A', { monthsSaved: -1 })]));
    const months = t.rows.find((r) => r.label === 'Meses ahorrados');
    expect(months?.cells[2]).toEqual({ type: 'months', value: -1, negative: true });
  });
});

describe('yearlyBalanceTable', () => {
  const table = yearlyBalanceTable(comparison([entry('s1', 'Abono A')]));

  it('has a heading per series and one row per calendar year of the longest path', () => {
    expect(table.headings).toEqual(['Original', 'Real', 'Abono A']);
    expect(table.rows.map((r) => r.year)).toEqual([2026, 2027, 2028]);
  });

  it('uses the closing balance of the last installment of each year, as the original string', () => {
    // Real: 24 rows, 12 in 2026 (k=12 → 600.00) and 12 in 2027 (k=24 → 0.00).
    expect(table.rows[0]?.balances[1]).toBe('600.00');
    expect(table.rows[1]?.balances[1]).toBe('0.00');
  });

  it('shows 0.00 for a path that already ended', () => {
    expect(table.rows[2]?.balances[1]).toBe('0.00');
    expect(table.rows[2]?.balances[2]).toBe('0.00');
  });
});

describe('yearlyBalanceTable with an empty schedule', () => {
  it('shows a dash for a path without installments instead of zeros', () => {
    const base = comparison([entry('s1', 'A')]);
    const empty = { ...base, original: { ...base.original, rows: [] } };
    const table = yearlyBalanceTable(empty);
    expect(table.rows.every((r) => r.balances[0] === null)).toBe(true);
    expect(table.rows[0]?.balances[1]).not.toBeNull();
  });
});

describe('describeFailure', () => {
  it('maps by type and code and never shows the message', () => {
    const early = describeFailure(new InvalidInputError('HYPOTHETICAL_BEFORE_CUTOFF', 'SECRET 123.45', { k: 7 }));
    expect(early).toContain('cuota 7');
    expect(early).not.toContain('SECRET');
    const neg = describeFailure(new NegativeAmortizationError('ALG.TERM', 9, '1.00' as Money, '2.00' as Money));
    expect(neg).toContain('cuota 9');
    expect(neg).not.toMatch(/\d\.\d\d/);
    expect(describeFailure(new CurrencyMismatchError('GTQ', 'USD'))).toMatch(/moneda/i);
    expect(describeFailure(new InvalidInputError('INVALID_EVENT', 'boom 999.99'))).not.toContain('999.99');
  });
});
