import type { DataStore } from '@cuotascasa/persistence';
import type { LocalDataset } from '@cuotascasa/sync';

/**
 * Adapts the DataStore to the LocalDataset port of SyncSession (packages/sync/src/ports.ts). `save` keeps the pending
 * set and the backup counters: the session's merge result is not a user edit and not a backup (ADR-0008 decision 4).
 * `store` is awaited per call because DATA_STORE opens asynchronously.
 */
export function createLocalDataset(store: Promise<DataStore>): LocalDataset {
  return {
    read: async () => (await store).exportAll(),
    save: async (dataset) => (await store).replaceAll(dataset, { pending: 'keep', backedUpAt: 'keep' }),
    getSyncMeta: async () => {
      const opened = await store;
      const [meta, pendingChanges] = await Promise.all([opened.getMeta(), opened.pendingChanges()]);
      return { deviceId: meta.deviceId, lastSyncAt: meta.lastSyncAt, pendingChanges };
    },
    markSynced: async (at) => (await store).markSynced(at),
  };
}
