import { NotImplementedError } from '@cuotascasa/schema';
import type { MergeDatasets, PurgeTombstones } from '../ports.ts';

/** Stub owned by W1-06: pure record-level LWW merge with compareRecordOrder. */
export const mergeDatasets: MergeDatasets = (local, remote) => {
  void local;
  void remote;
  throw new NotImplementedError('W1-06');
};

/** Stub owned by W1-06: the purge rule of ADR-0008 decision 4 over a merged dataset. */
export const purgeTombstones: PurgeTombstones = (dataset, lastSyncAt) => {
  void dataset;
  void lastSyncAt;
  throw new NotImplementedError('W1-06');
};
