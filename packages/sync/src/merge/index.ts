import { ENTITY_KEYS, type BackupData, type BaseRecord, type IsoInstant } from '@cuotascasa/schema';
import { TOMBSTONE_RETENTION_MS, compareRecordOrder, type MergeDatasets, type PurgeTombstones } from '../ports.ts';

/*
 * Pure sync merge and tombstone purge (ADR-0024, ADR-0008 decision 4). No I/O, no clock, no mutation of inputs.
 */

type Collection = readonly BaseRecord[];

/** Device-local settings never travel (ADR-0024 decision 4). */
function isDeviceSettings(record: BaseRecord): boolean {
  return (record as { readonly scope?: unknown }).scope === 'device';
}

/** Greatest version per id inside one input (inputs are unique per id, but stay safe), device settings dropped. */
function indexById<T extends BaseRecord>(records: readonly T[]): Map<string, T> {
  const byId = new Map<string, T>();
  for (const record of records) {
    if (isDeviceSettings(record)) {
      continue;
    }
    const current = byId.get(record.id);
    if (current === undefined || compareRecordOrder(record, current) > 0) {
      byId.set(record.id, record);
    }
  }
  return byId;
}

interface CollectionMerge<T extends BaseRecord> {
  readonly records: T[];
  fromLocal: number;
  fromRemote: number;
  tombstones: number;
}

function mergeCollection<T extends BaseRecord>(local: readonly T[], remote: readonly T[]): CollectionMerge<T> {
  const localById = indexById(local);
  const remoteById = indexById(remote);
  const ids = [...new Set([...localById.keys(), ...remoteById.keys()])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const result: CollectionMerge<T> = { records: [], fromLocal: 0, fromRemote: 0, tombstones: 0 };
  for (const id of ids) {
    const l = localById.get(id);
    const r = remoteById.get(id);
    let chosen: T;
    if (l !== undefined && (r === undefined || compareRecordOrder(l, r) >= 0)) {
      chosen = l;
      result.fromLocal += 1;
    } else {
      chosen = r as T;
      result.fromRemote += 1;
    }
    if (chosen.deletedAt !== null) {
      result.tombstones += 1;
    }
    result.records.push(chosen);
  }
  return result;
}

export const mergeDatasets: MergeDatasets = (local, remote) => {
  const merged: { -readonly [K in keyof BackupData]: BackupData[K] } = {
    loans: [],
    events: [],
    reportedBalances: [],
    payments: [],
    scenarios: [],
    settings: [],
  };
  let fromLocal = 0;
  let fromRemote = 0;
  let tombstones = 0;
  for (const key of ENTITY_KEYS) {
    const part = mergeCollection<BaseRecord>(local[key], remote[key]);
    (merged as Record<string, Collection>)[key] = part.records;
    fromLocal += part.fromLocal;
    fromRemote += part.fromRemote;
    tombstones += part.tombstones;
  }
  return { merged, stats: { fromLocal, fromRemote, tombstones } };
};

export const purgeTombstones: PurgeTombstones = (dataset, lastSyncAt: IsoInstant | null) => {
  if (lastSyncAt === null) {
    return { dataset, purged: 0 };
  }
  const threshold = Date.parse(lastSyncAt) - TOMBSTONE_RETENTION_MS;
  let purged = 0;
  const kept: { -readonly [K in keyof BackupData]: BackupData[K] } = { ...dataset };
  for (const key of ENTITY_KEYS) {
    const survivors = (dataset[key] as Collection).filter((record) => {
      const expired = record.deletedAt !== null && Date.parse(record.deletedAt) < threshold;
      if (expired) {
        purged += 1;
      }
      return !expired;
    });
    (kept as Record<string, Collection>)[key] = survivors;
  }
  return { dataset: kept, purged };
};
