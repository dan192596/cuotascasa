import fc from 'fast-check';
import type { BackupData, BackupDocument } from '../backup/types.ts';
import { type EntityKey, type EntityRecordMap } from '../entities/registry.ts';
import {
  actualPaymentArb,
  deviceSettingsArb,
  loanArb,
  loanEventArb,
  reportedBalanceArb,
  scenarioArb,
  settingsArb,
  syncedSettingsArb,
} from './entities.ts';
import { isoInstantArb, textArb, uuidArb } from './primitives.ts';

function collection<T extends { readonly id: string }>(record: fc.Arbitrary<T>): fc.Arbitrary<T[]> {
  return fc.uniqueArray(record, { selector: (item) => item.id, maxLength: 4 });
}

/** At most one record per scope (the schema allows up to two records). */
const settingsCollectionArb = fc
  .tuple(fc.option(syncedSettingsArb, { nil: undefined }), fc.option(deviceSettingsArb, { nil: undefined }))
  .map(([synced, device]) => [synced, device].filter((record) => record !== undefined));

export const backupDataArb: fc.Arbitrary<BackupData> = fc.record({
  loans: collection(loanArb),
  events: collection(loanEventArb),
  reportedBalances: collection(reportedBalanceArb),
  payments: collection(actualPaymentArb),
  scenarios: collection(scenarioArb),
  settings: settingsCollectionArb,
});

/** Whole latest-version documents; never carries the fixtures-only `synthetic` flag. */
export const backupDocumentArb: fc.Arbitrary<BackupDocument> = fc.record({
  format: fc.constant('cuotascasa' as const),
  version: fc.constant(1 as const),
  exportedAt: isoInstantArb,
  deviceId: uuidArb,
  appVersion: textArb(64),
  data: backupDataArb,
});

export type EntityArbitraries = { readonly [K in EntityKey]: fc.Arbitrary<EntityRecordMap[K]> } & {
  readonly backupData: fc.Arbitrary<BackupData>;
  readonly backupDocument: fc.Arbitrary<BackupDocument>;
};

/** One arbitrary per entity collection key (same keys as ENTITY_KEYS) plus whole backup data and documents. */
export function entityArbitraries(): EntityArbitraries {
  return {
    loans: loanArb,
    events: loanEventArb,
    reportedBalances: reportedBalanceArb,
    payments: actualPaymentArb,
    scenarios: scenarioArb,
    settings: settingsArb,
    backupData: backupDataArb,
    backupDocument: backupDocumentArb,
  };
}
