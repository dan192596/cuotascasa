import { describe, expect, it } from 'vitest';
import { DataError, type PendingImport } from '../../../data/api.ts';
import {
  countRows,
  dataErrorText,
  formatBytes,
  importErrorText,
  lastBackupText,
  PlainExportSession,
} from './backup-model.ts';

type ImportPreview = PendingImport['preview'];

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-16T12:00:00.000Z');

describe('lastBackupText', () => {
  it('says there is no backup yet', () => {
    expect(lastBackupText(null, NOW)).toBe('Aún no has hecho un respaldo');
  });
  it('counts whole days', () => {
    expect(lastBackupText('2026-10-16T08:00:00.000Z', NOW)).toBe('Último respaldo: hoy');
    expect(lastBackupText('2026-10-15T11:00:00.000Z', NOW)).toBe('Último respaldo: hace 1 día');
    expect(lastBackupText(new Date(NOW - 31 * DAY).toISOString(), NOW)).toBe('Último respaldo: hace 31 días');
  });
  it('tolerates an unreadable or future date', () => {
    expect(lastBackupText('basura', NOW)).toBe('Fecha del último respaldo no disponible');
    expect(lastBackupText('2026-11-01T00:00:00.000Z', NOW)).toBe('Último respaldo: hoy');
  });
});

describe('importErrorText', () => {
  it('maps every code to fixed Spanish text', () => {
    for (const code of [
      'INVALID_JSON',
      'FOREIGN_FORMAT',
      'UNSUPPORTED_VERSION',
      'FUTURE_VERSION',
      'VALIDATION',
      'PASSPHRASE_REQUIRED',
      'WRONG_PASSPHRASE',
    ] as const) {
      expect(importErrorText(code)).toMatch(/[a-záéíóú]{4,}/i);
    }
    expect(importErrorText('WRONG_PASSPHRASE')).toContain('frase');
  });
});

describe('dataErrorText', () => {
  it('explains an expired preview and a lost undo without echoing the error message', () => {
    expect(dataErrorText(new DataError('NOT_FOUND', 'secret 123.45'), 'confirm')).toContain('venció');
    expect(dataErrorText(new DataError('NOT_FOUND', 'secret'), 'undo')).toBe(
      'Ya no se puede deshacer porque hubo cambios después.',
    );
    expect(dataErrorText(new DataError('STORAGE', 'secret 123.45'), 'confirm')).not.toContain('123.45');
    expect(dataErrorText(new DataError('VALIDATION'), 'confirm')).toContain('dañado');
    expect(dataErrorText(new DataError('VALIDATION'), 'export')).toContain('frase');
    expect(dataErrorText(new Error('boom 9.99'), 'export')).not.toContain('9.99');
  });
});

describe('countRows', () => {
  it('lists the six entities with active and deleted counts', () => {
    const preview = {
      sourceVersion: 1,
      exportedAt: '2026-10-04T16:00:00.000Z',
      appVersion: '1.0.0',
      counts: {
        loans: { active: 1, tombstoned: 0 },
        events: { active: 3, tombstoned: 1 },
        reportedBalances: { active: 2, tombstoned: 0 },
        payments: { active: 0, tombstoned: 0 },
        scenarios: { active: 1, tombstoned: 2 },
        settings: { active: 1, tombstoned: 0 },
      },
    } as unknown as ImportPreview;
    expect(countRows(preview)).toEqual([
      { key: 'loans', label: 'Préstamos', active: 1, tombstoned: 0 },
      { key: 'events', label: 'Eventos', active: 3, tombstoned: 1 },
      { key: 'reportedBalances', label: 'Saldos reportados', active: 2, tombstoned: 0 },
      { key: 'payments', label: 'Pagos reales', active: 0, tombstoned: 0 },
      { key: 'scenarios', label: 'Escenarios', active: 1, tombstoned: 2 },
      { key: 'settings', label: 'Ajustes', active: 1, tombstoned: 0 },
    ]);
  });
});

describe('formatBytes', () => {
  it('uses binary units with one decimal', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB');
  });
});

describe('PlainExportSession', () => {
  it('asks for the warning once per session', () => {
    const session = new PlainExportSession();
    expect(session.warned()).toBe(false);
    session.markWarned();
    expect(session.warned()).toBe(true);
  });
});
