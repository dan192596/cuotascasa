import { describe, expect, it } from 'vitest';
import { actualPaymentExample } from '../__examples__/actual-payment.example.ts';
import { loanExample } from '../__examples__/loan.example.ts';
import { loanEventExample } from '../__examples__/loan-event.example.ts';
import { reportedBalanceExample } from '../__examples__/reported-balance.example.ts';
import { scenarioExample } from '../__examples__/scenario.example.ts';
import { deviceSettingsExample, syncedSettingsExample } from '../__examples__/settings.example.ts';
import { withField, withoutField } from '../test-support/with-field.ts';
import {
  BACKUP_ERROR_CODES,
  BACKUP_FORMAT,
  BACKUP_SCHEMAS_BY_VERSION,
  LATEST_VERSION,
  backupDataSchema,
  backupDocumentSchema,
} from './types.ts';
import { backupDocumentV1Schema } from './v1.ts';

const documentV1 = {
  format: 'cuotascasa',
  version: 1,
  exportedAt: '2026-10-04T16:00:00.000Z',
  deviceId: 'd0000000-0000-4000-8000-000000000001',
  appVersion: '1.0.0',
  data: {
    loans: [loanExample],
    events: [loanEventExample],
    reportedBalances: [reportedBalanceExample],
    payments: [actualPaymentExample],
    scenarios: [scenarioExample],
    settings: [syncedSettingsExample, deviceSettingsExample],
  },
};

describe('BackupDocument v1', () => {
  it('parses without a root synthetic flag', () => {
    expect(backupDocumentV1Schema.parse(documentV1)).toEqual(documentV1);
  });

  it('parses with a root synthetic: true', () => {
    const fixture = { ...documentV1, synthetic: true };
    expect(backupDocumentV1Schema.parse(fixture)).toEqual(fixture);
  });

  it('rejects synthetic: false', () => {
    expect(backupDocumentV1Schema.safeParse({ ...documentV1, synthetic: false }).success).toBe(false);
  });

  it('rejects a foreign format, another version or a missing collection', () => {
    expect(backupDocumentV1Schema.safeParse({ ...documentV1, format: 'otra-app' }).success).toBe(false);
    expect(backupDocumentV1Schema.safeParse({ ...documentV1, version: 2 }).success).toBe(false);
    expect(backupDocumentV1Schema.safeParse(withoutField(documentV1, ['data', 'payments'])).success).toBe(false);
  });

  it('keeps tombstones and rejects duplicate ids in a collection', () => {
    const tombstoned = withField(documentV1, ['data', 'loans', 0, 'deletedAt'], '2026-10-05T15:00:00.000Z');
    expect(backupDocumentV1Schema.safeParse(tombstoned).success).toBe(true);
    const duplicated = withField(documentV1, ['data', 'loans'], [loanExample, loanExample]);
    const result = backupDocumentV1Schema.safeParse(duplicated);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['data', 'loans', 1, 'id']);
  });

  it('rejects a number-typed money field inside data with a precise path', () => {
    const result = backupDocumentV1Schema.safeParse(withField(documentV1, ['data', 'loans', 0, 'principal'], 500000));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['data', 'loans', 0, 'principal']);
  });

  it('allows at most one settings record per scope', () => {
    const twoSynced = withField(documentV1, ['data', 'settings'], [syncedSettingsExample, syncedSettingsExample]);
    expect(backupDocumentV1Schema.safeParse(twoSynced).success).toBe(false);
  });
});

describe('backup registry', () => {
  it('declares v1 as the latest version and aliases its schemas', () => {
    expect(BACKUP_FORMAT).toBe('cuotascasa');
    expect(LATEST_VERSION).toBe(1);
    expect(BACKUP_SCHEMAS_BY_VERSION[1]).toBe(backupDocumentV1Schema);
    expect(backupDocumentSchema).toBe(backupDocumentV1Schema);
    expect(backupDataSchema.safeParse(documentV1.data).success).toBe(true);
  });

  it('lists the typed BackupError codes', () => {
    expect(BACKUP_ERROR_CODES).toEqual([
      'INVALID_JSON',
      'FOREIGN_FORMAT',
      'UNSUPPORTED_VERSION',
      'FUTURE_VERSION',
      'VALIDATION',
    ]);
  });
});
