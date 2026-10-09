import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import type { ChangeEvent, DataStoreDeps, DataStoreTransaction } from '../ports.ts';
import { SnapshotNotFoundError } from '../ports.ts';
import {
  createManualClock,
  createSequentialIds,
  sequentialUuid,
  type ManualClock,
  type SequentialIds,
} from '../contract/fakes.ts';
import { samplePayment, sampleLoan } from '../contract/samples.ts';
import { openDatabase } from './database.ts';
import { createDexieDataStore, DEXIE_DB_NAME, DEXIE_DB_VERSION, DEXIE_SCHEMA_V1 } from './index.ts';
import { DexieDataStore } from './store.ts';

interface Harness extends DataStoreDeps {
  readonly clock: ManualClock;
  readonly ids: SequentialIds;
}

function harness(): Harness {
  return { clock: createManualClock(), ids: createSequentialIds() };
}

function collect(events: ChangeEvent[]): (event: ChangeEvent) => void {
  return (event) => {
    events.push(event);
  };
}

const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 25);
  });

describe('Dexie schema (DEXIE_SCHEMA_V1)', () => {
  it('names the database cuotascasa at version 1 with one table per entity plus meta and snapshots', async () => {
    expect(DEXIE_DB_NAME).toBe('cuotascasa');
    expect(DEXIE_DB_VERSION).toBe(1);
    expect(Object.keys(DEXIE_SCHEMA_V1).sort()).toEqual(
      ['events', 'loans', 'meta', 'payments', 'reportedBalances', 'scenarios', 'settings', 'snapshots'].sort(),
    );
    const factory = new IDBFactory();
    const db = await openDatabase(undefined, factory);
    expect(db.name).toBe('cuotascasa');
    expect(db.verno).toBe(1);
    expect(db.tables.map((table) => table.name).sort()).toEqual(Object.keys(DEXIE_SCHEMA_V1).sort());
    expect(db.table('payments').schema.indexes.map((index) => index.name)).toEqual([
      '[createdAt+id]',
      '[loanId+createdAt+id]',
    ]);
    db.close();
  });

  it('accepts a database name as the second argument', async () => {
    const store = await createDexieDataStore(harness(), 'cuotascasa-named-test');
    expect(await indexedDB.databases().then((all) => all.map((entry) => entry.name))).toContain(
      'cuotascasa-named-test',
    );
    await store.close();
  });
});

describe('Dexie persistence across close and reopen (ADR-0005)', () => {
  it('keeps the device id, the data, the counters and the sync instants; the id is drawn only once', async () => {
    const factory = new IDBFactory();
    const first = harness();
    const store = await createDexieDataStore(first, factory);
    const meta = await store.getMeta();
    const loan = await store.loans.create(sampleLoan());
    await store.markSynced('2026-10-04T18:00:00.000Z');
    await store.loans.update({ ...sampleLoan(), id: loan.id, name: 'Casa B' });
    await store.close();

    const second = harness();
    const reopened = await createDexieDataStore(second, factory);
    expect(second.ids.issued).toEqual([]);
    expect(await reopened.getMeta()).toEqual({
      deviceId: meta.deviceId,
      lastSyncAt: '2026-10-04T18:00:00.000Z',
      lastBackupAt: null,
    });
    expect((await reopened.loans.get(loan.id))?.name).toBe('Casa B');
    expect(await reopened.pendingChanges()).toBe(1);
    expect(await reopened.changesSinceBackup()).toBe(1);
    await reopened.close();
  });

  it('keeps stamps monotonic after reopening even when the clock went backwards', async () => {
    const factory = new IDBFactory();
    const first = harness();
    const store = await createDexieDataStore(first, factory);
    first.clock.set('2026-10-04T15:00:00.000Z');
    const a = await store.loans.create(sampleLoan());
    const b = await store.loans.update({ ...sampleLoan(), id: a.id, name: 'Casa B' });
    expect(b.updatedAt).toBe('2026-10-04T15:00:00.001Z');
    await store.close();

    const second = harness();
    second.clock.set('2026-10-04T14:00:00.000Z');
    const reopened = await createDexieDataStore(second, factory);
    const c = await reopened.loans.create({ ...sampleLoan(), name: 'Casa C' });
    expect(c.createdAt).toBe('2026-10-04T15:00:00.002Z');
    await reopened.close();
  });
});

describe('Dexie version upgrade', () => {
  it('opens a database created at v1 under a test-only v2 migration and preserves the data', async () => {
    const factory = new IDBFactory();
    const first = harness();
    const v1 = await createDexieDataStore(first, factory);
    const loan = await v1.loans.create(sampleLoan());
    await v1.payments.create(samplePayment(loan.id));
    const before = await v1.exportAll();
    const { deviceId } = await v1.getMeta();
    await v1.close();

    const upgraded = vi.fn();
    const db = await openDatabase(DEXIE_DB_NAME, factory, (database) => {
      database
        .version(2)
        .stores({ ...DEXIE_SCHEMA_V1, extras: 'id' })
        .upgrade(async (tx) => {
          upgraded();
          await tx.table('extras').add({ id: 'migrated' });
        });
    });
    expect(db.verno).toBe(2);
    const second = harness();
    const v2 = await DexieDataStore.attach(second, db, DEXIE_DB_NAME, factory);
    expect(upgraded).toHaveBeenCalledOnce();
    expect(second.ids.issued).toEqual([]);
    expect(await v2.exportAll()).toEqual(before);
    expect((await v2.getMeta()).deviceId).toBe(deviceId);
    expect(await db.table('extras').toArray()).toEqual([{ id: 'migrated' }]);
    await v2.close();
  });
});

describe('Dexie atomicity', () => {
  it('replaceAll runs in one transaction: a failure after the first collection leaves data and counters unchanged', async () => {
    const factory = new IDBFactory();
    const deps = harness();
    const db = await openDatabase(DEXIE_DB_NAME, factory);
    const store = await DexieDataStore.attach(deps, db, DEXIE_DB_NAME, factory);
    const loan = await store.loans.create(sampleLoan());
    await store.markBackedUp('2026-10-04T18:00:00.000Z');
    const incoming = await store.exportAll();
    await store.loans.delete(loan.id);
    const beforeData = await store.exportAll();
    const beforeMeta = await store.getMeta();
    const beforePending = await store.pendingChanges();
    const beforeBackup = await store.changesSinceBackup();
    const events: ChangeEvent[] = [];
    store.subscribe(collect(events));

    const failure = new Error('injected mid-way failure');
    const spy = vi.spyOn(db.table('payments'), 'bulkPut').mockRejectedValueOnce(failure);
    await expect(store.replaceAll(incoming, { pending: 'all', backedUpAt: '2026-10-05T10:00:00.000Z' })).rejects.toBe(
      failure,
    );
    spy.mockRestore();

    expect(await store.exportAll()).toEqual(beforeData);
    expect(await store.getMeta()).toEqual(beforeMeta);
    expect(await store.pendingChanges()).toBe(beforePending);
    expect(await store.changesSinceBackup()).toBe(beforeBackup);
    await settle();
    expect(events).toEqual([]);
    await store.close();
  });

  it('restoreSnapshot runs in one transaction: a mid-way failure keeps the data and the snapshot', async () => {
    const factory = new IDBFactory();
    const deps = harness();
    const db = await openDatabase(DEXIE_DB_NAME, factory);
    const store = await DexieDataStore.attach(deps, db, DEXIE_DB_NAME, factory);
    const loan = await store.loans.create(sampleLoan());
    const snapshot = await store.createSnapshot();
    await store.loans.update({ ...sampleLoan(), id: loan.id, name: 'Casa B' });
    const after = await store.exportAll();

    const failure = new Error('injected restore failure');
    const spy = vi.spyOn(db.table('scenarios'), 'bulkPut').mockRejectedValueOnce(failure);
    await expect(store.restoreSnapshot(snapshot)).rejects.toBe(failure);
    spy.mockRestore();
    expect(await store.exportAll()).toEqual(after);

    await store.restoreSnapshot(snapshot);
    expect((await store.loans.get(loan.id))?.name).toBe(sampleLoan().name);
    await expect(store.restoreSnapshot(snapshot)).rejects.toBeInstanceOf(SnapshotNotFoundError);
    await store.close();
  });

  it('createSnapshot and the snapshot counter commit together: a failed capture burns no id', async () => {
    const factory = new IDBFactory();
    const db = await openDatabase(DEXIE_DB_NAME, factory);
    const store = await DexieDataStore.attach(harness(), db, DEXIE_DB_NAME, factory);
    const spy = vi.spyOn(db.table('snapshots'), 'put').mockRejectedValueOnce(new Error('injected'));
    await expect(store.createSnapshot()).rejects.toThrow('injected');
    spy.mockRestore();
    expect(await store.createSnapshot()).toBe('snapshot-1');
    await store.close();
  });

  it('a rolled back transaction does not advance the persisted stamp floor', async () => {
    const factory = new IDBFactory();
    const deps = harness();
    const store = await createDexieDataStore(deps, factory);
    await expect(
      store.transaction(async (tx) => {
        await tx.loans.create(sampleLoan());
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    const loan = await store.loans.create(sampleLoan());
    expect(loan.createdAt).toBe('2026-10-04T15:00:00.000Z');
    await store.close();
  });
});

describe('Dexie notifications across instances', () => {
  it('delivers to another instance of the same database only after the commit', async () => {
    const factory = new IDBFactory();
    const writer = await createDexieDataStore(harness(), factory);
    const reader = await createDexieDataStore(harness(), factory);
    const seen: ChangeEvent[] = [];
    reader.subscribe(collect(seen));

    const seenBeforeCommit: number[] = [];
    await writer.transaction(async (tx) => {
      const loan = await tx.loans.create(sampleLoan());
      await tx.payments.create(samplePayment(loan.id));
      // Keep the transaction open across many event-loop turns (awaiting only tx calls), then look at the reader.
      for (let turn = 0; turn < 30; turn += 1) {
        await tx.loans.get(loan.id);
      }
      seenBeforeCommit.push(seen.length);
    });
    expect(seenBeforeCommit).toEqual([0]);
    await vi.waitFor(() => {
      expect(seen).toEqual([{ entities: ['loans', 'payments'], origin: 'write' }]);
    });
    await writer.close();
    await reader.close();
  });

  it('does not notify across instances when the transaction fails, and stops after close', async () => {
    const factory = new IDBFactory();
    const writer = await createDexieDataStore(harness(), factory);
    const reader = await createDexieDataStore(harness(), factory);
    const seen: ChangeEvent[] = [];
    reader.subscribe(collect(seen));
    await expect(
      writer.transaction(async (tx) => {
        await tx.loans.create(sampleLoan());
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    await settle();
    expect(seen).toEqual([]);

    await reader.close();
    await writer.loans.create(sampleLoan());
    await settle();
    expect(seen).toEqual([]);
    await writer.close();
  });

  it('two instances of one database serialize their writes and see each other data', async () => {
    const factory = new IDBFactory();
    const a = await createDexieDataStore(harness(), factory);
    const b = await createDexieDataStore(harness(), factory);
    const [one, two] = await Promise.all([
      a.loans.create(sampleLoan()),
      b.loans.create({ ...sampleLoan(), name: 'B' }),
    ]);
    expect(one.updatedAt).not.toBe(two.updatedAt);
    expect(await a.loans.list()).toHaveLength(2);
    expect(await b.loans.list()).toHaveLength(2);
    await a.close();
    await b.close();
  });
});

describe('Dexie transaction repositories after the transaction ended', () => {
  const ended = { code: 'CLOSED', message: 'The transaction has ended' };

  async function capture(store: DexieDataStore, fail: boolean): Promise<DataStoreTransaction> {
    let captured: DataStoreTransaction | undefined;
    const work = store.transaction(async (tx) => {
      captured = tx;
      await tx.loans.get(sequentialUuid(500));
      if (fail) {
        throw new Error('abort');
      }
    });
    await (fail ? expect(work).rejects.toThrow('abort') : work);
    if (captured === undefined) {
      throw new Error('transaction repositories were not captured');
    }
    return captured;
  }

  async function open(): Promise<{ store: DexieDataStore }> {
    const factory = new IDBFactory();
    const db = await openDatabase(DEXIE_DB_NAME, factory);
    return { store: await DexieDataStore.attach(harness(), db, DEXIE_DB_NAME, factory) };
  }

  it('reject after commit, write nothing, count nothing and notify nobody', async () => {
    const { store } = await open();
    const events: ChangeEvent[] = [];
    store.subscribe(collect(events));
    const tx = await capture(store, false);
    await expect(tx.loans.create(sampleLoan())).rejects.toMatchObject(ended);
    await expect(tx.loans.list()).rejects.toMatchObject(ended);
    await expect(tx.settings.saveSynced({ activeScenarioByLoan: {} })).rejects.toMatchObject(ended);
    expect(await store.loans.list({ includeDeleted: true })).toEqual([]);
    expect(await store.pendingChanges()).toBe(0);
    await settle();
    expect(events).toEqual([]);
    await store.close();
  });

  it('reject after rollback', async () => {
    const { store } = await open();
    const tx = await capture(store, true);
    await expect(tx.loans.create(sampleLoan())).rejects.toMatchObject(ended);
    await store.close();
  });

  it('reject with the typed error after the store closed, not a raw Dexie error', async () => {
    const { store } = await open();
    const tx = await capture(store, false);
    await store.close();
    await expect(tx.loans.create(sampleLoan())).rejects.toMatchObject(ended);
    await expect(tx.loans.get(sequentialUuid(1))).rejects.toMatchObject(ended);
  });
});

describe('Dexie partial commits', () => {
  it('keep records, counters and the stamp floor consistent when work awaits something that is not a tx call', async () => {
    const factory = new IDBFactory();
    const db = await openDatabase(DEXIE_DB_NAME, factory);
    const store = await DexieDataStore.attach(harness(), db, DEXIE_DB_NAME, factory);
    let first: { updatedAt: string } | undefined;
    await expect(
      store.transaction(async (tx) => {
        first = await tx.loans.create(sampleLoan());
        await new Promise((resolve) => {
          setTimeout(resolve, 5);
        });
        await tx.loans.create({ ...sampleLoan(), name: 'Casa B' });
      }),
    ).rejects.toBeInstanceOf(Error);
    const committed = await store.loans.list({ includeDeleted: true });
    expect(committed).toHaveLength(1);
    expect(await store.pendingChanges()).toBe(committed.length);
    expect(await store.changesSinceBackup()).toBe(committed.length);
    const floor = (await db.table('meta').get('stampFloor')) as { value: number };
    expect(floor.value).toBeGreaterThanOrEqual(Date.parse(first?.updatedAt ?? ''));
    await store.close();
  });
});

describe('Dexie re-entrancy', () => {
  it('rejects a store-level call made inside transaction(work) and does not hang the queue', async () => {
    const store = await createDexieDataStore(harness(), new IDBFactory());
    const outcome: unknown[] = [];
    const result = await store.transaction(async (tx) => {
      await store.loans.list().then(
        () => outcome.push('resolved'),
        (error: unknown) => outcome.push(error),
      );
      await tx.loans.create(sampleLoan());
      return 'finished';
    });
    expect(result).toBe('finished');
    expect(outcome).toHaveLength(1);
    expect(outcome[0]).toMatchObject({
      code: 'CLOSED',
      message: 'Store-level call inside a transaction; use the tx repositories',
    });
    expect(await store.loans.list()).toHaveLength(1);
    await store.close();
  });
});

describe('Dexie listeners', () => {
  it('skip a listener removed after the commit but before the notification runs', async () => {
    const store = await createDexieDataStore(harness(), new IDBFactory());
    const events: ChangeEvent[] = [];
    const unsubscribe = store.subscribe(collect(events));
    await store.loans.create(sampleLoan());
    unsubscribe();
    await settle();
    expect(events).toEqual([]);
    await store.close();
  });

  it('skip every listener when the store closes before the notification runs', async () => {
    const store = await createDexieDataStore(harness(), new IDBFactory());
    const events: ChangeEvent[] = [];
    store.subscribe(collect(events));
    await store.loans.create(sampleLoan());
    await store.close();
    await settle();
    expect(events).toEqual([]);
  });
});

describe('Dexie replaceAll input handling', () => {
  it('always rejects: CLOSED on a closed store, the clone error for uncloneable data', async () => {
    const store = await createDexieDataStore(harness(), new IDBFactory());
    const data = await store.exportAll();
    const uncloneable = { ...data, loans: [() => 1] } as unknown as typeof data;
    let call: Promise<void> | undefined;
    expect(() => {
      call = store.replaceAll(uncloneable, { pending: 'keep', backedUpAt: 'keep' });
    }).not.toThrow();
    await expect(call).rejects.toMatchObject({ name: 'DataCloneError' });
    await store.close();
    let closedCall: Promise<void> | undefined;
    expect(() => {
      closedCall = store.replaceAll(uncloneable, { pending: 'keep', backedUpAt: 'keep' });
    }).not.toThrow();
    await expect(closedCall).rejects.toMatchObject({ code: 'CLOSED' });
  });
});
