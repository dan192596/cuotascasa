import { createManualClock, createSequentialIds, sampleLoan } from '@cuotascasa/persistence/contract';
import { createInMemoryDataStore } from '@cuotascasa/persistence/memory';
import { describe, expect, it } from 'vitest';
import { createLocalDataset } from './local-dataset.ts';

describe('createLocalDataset (DataStore -> LocalDataset)', () => {
  async function setup() {
    const store = await createInMemoryDataStore({ clock: createManualClock(), ids: createSequentialIds() });
    return { store, local: createLocalDataset(Promise.resolve(store)) };
  }

  it('reads the full dataset and reports the sync meta with the pending count', async () => {
    const { store, local } = await setup();
    await store.loans.create(sampleLoan());
    const meta = await local.getSyncMeta();
    expect(meta).toEqual({ deviceId: (await store.getMeta()).deviceId, lastSyncAt: null, pendingChanges: 1 });
    expect((await local.read()).loans).toHaveLength(1);
  });

  it("saves with pending 'keep' and backedUpAt 'keep': a merge is neither a user edit nor a backup", async () => {
    const { store, local } = await setup();
    await store.loans.create(sampleLoan());
    await store.markBackedUp('2026-10-04T16:00:00.000Z');
    await store.markSynced('2026-10-04T16:00:00.000Z');
    await store.loans.create({ ...sampleLoan(), name: 'Casa B' });
    const dataset = await local.read();

    await local.save(dataset);

    expect(await store.pendingChanges()).toBe(1);
    expect(await store.changesSinceBackup()).toBe(1);
    expect((await store.getMeta()).lastBackupAt).toBe('2026-10-04T16:00:00.000Z');
  });

  it('markSynced zeroes the pending set and stores lastSyncAt', async () => {
    const { store, local } = await setup();
    await store.loans.create(sampleLoan());
    await local.markSynced('2026-10-04T17:00:00.000Z');
    expect(await local.getSyncMeta()).toMatchObject({ lastSyncAt: '2026-10-04T17:00:00.000Z', pendingChanges: 0 });
  });
});
