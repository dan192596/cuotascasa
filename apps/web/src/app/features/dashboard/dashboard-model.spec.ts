import { describe, expect, it } from 'vitest';
import type { LoansStore } from '../../data/api.ts';
import {
  backupDateText,
  DASHBOARD_FILTERS,
  errorMessage,
  filterLoans,
  FILTER_LABELS,
  STATUS_LABELS,
} from './dashboard-model.ts';

type Loan = ReturnType<LoansStore['loans']>[number];
const loan = (id: string, status: Loan['status']): Loan => ({ id, status }) as Loan;

describe('filterLoans', () => {
  const all = [loan('a', 'active'), loan('p', 'paid'), loan('r', 'archived'), loan('b', 'active')];

  it('keeps only the loans of the chosen status, preserving order', () => {
    expect(filterLoans(all, 'active').map((l) => l.id)).toEqual(['a', 'b']);
    expect(filterLoans(all, 'paid').map((l) => l.id)).toEqual(['p']);
    expect(filterLoans(all, 'archived').map((l) => l.id)).toEqual(['r']);
  });

  it('has Spanish labels for every filter and status', () => {
    expect(DASHBOARD_FILTERS).toEqual(['active', 'paid', 'archived']);
    expect(FILTER_LABELS).toEqual({ active: 'Activos', paid: 'Pagados', archived: 'Archivados' });
    expect(STATUS_LABELS).toEqual({ active: 'Activo', paid: 'Pagado', archived: 'Archivado' });
  });
});

describe('errorMessage', () => {
  it('maps by kind and never echoes the error message', () => {
    const secret = 'monto 123456.78';
    const error = (kind: string) => ({ kind, message: secret, rule: null, k: null }) as never;
    for (const kind of [
      'NegativeAmortization',
      'InvalidInput',
      'CurrencyMismatch',
      'InfeasibleGoal',
      'NotImplemented',
    ]) {
      const text = errorMessage(error(kind));
      expect(text).not.toContain(secret);
      expect(text.length).toBeGreaterThan(10);
    }
    expect(errorMessage(error('NegativeAmortization'))).toContain('cuota');
  });
});

describe('backupDateText', () => {
  it('shows the stored date as dd/mm/aaaa or a fixed text without a backup', () => {
    expect(backupDateText('2026-10-04T15:00:00.000Z')).toBe('04/10/2026');
    expect(backupDateText(null)).toBe('Aún sin respaldo');
  });
});
