import { describe, expect, it } from 'vitest';
import * as schema from './index.ts';

describe('@cuotascasa/schema public entry point', () => {
  it('exposes the frozen contract names', () => {
    const expected = [
      'NotImplementedError',
      'uuidSchema',
      'localDateSchema',
      'isoInstantSchema',
      'moneySchema',
      'rateSchema',
      'loanSchema',
      'loanEventSchema',
      'reportedBalanceSchema',
      'actualPaymentSchema',
      'scenarioSchema',
      'settingsSchema',
      'isLoanCurrencyLocked',
      'ENTITY_KEYS',
      'ENTITY_SCHEMAS',
      'backupDocumentV1Schema',
      'backupDocumentSchema',
      'backupDataSchema',
      'LATEST_VERSION',
      'fixtureSchema',
      'fixtureInputsSchema',
      'manifestSchema',
      'FEATURE_TAGS',
      'TRAIT_TAGS',
      'TRAIT_GROUPS',
      'EXPECTED_CSV_HEADER',
      'parseBackup',
      'serializeBackup',
      'migrateToLatest',
    ];
    for (const name of expected) {
      expect(schema, name).toHaveProperty(name);
    }
  });
});
