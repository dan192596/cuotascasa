import { afterEach, describe, expect, it, vi } from 'vitest';
import { PersistenceError, RecordValidationError, type DataStore, type DataStoreTransaction } from '../ports.ts';
import { createManualClock, createSequentialIds, runDataStoreContract, sampleLoan } from '../contract/index.ts';
import { createInMemoryDataStore } from './index.ts';

runDataStoreContract('memory', createInMemoryDataStore);

describe('memory adapter: monotonic per-device stamps', () => {
  it('updatedAt strictly increases when the clock repeats or goes backwards', async () => {
    const clock = createManualClock('2026-10-04T15:00:00.000Z');
    const store = await createInMemoryDataStore({ clock, ids: createSequentialIds() });
    const loan = await store.loans.create(sampleLoan());
    const stamps = [loan.updatedAt];

    // The clock repeats.
    stamps.push((await store.loans.update({ ...sampleLoan(), id: loan.id })).updatedAt);
    // The clock goes backwards.
    clock.set('2026-10-04T14:00:00.000Z');
    stamps.push((await store.loans.update({ ...sampleLoan(), id: loan.id })).updatedAt);
    stamps.push((await store.loans.create(sampleLoan())).updatedAt);
    stamps.push((await store.loans.delete(loan.id)).updatedAt);

    const millis = stamps.map((stamp) => Date.parse(stamp));
    for (let i = 1; i < millis.length; i += 1) {
      expect(millis[i]).toBeGreaterThan(millis[i - 1] ?? Number.POSITIVE_INFINITY);
    }
    await store.close();
  });
});

describe('memory adapter: no browser storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('works end to end while every browser storage API throws on use', async () => {
    const trap = (name: string): object =>
      new Proxy(
        {},
        {
          get: () => {
            throw new Error(`${name} must not be used`);
          },
        },
      );
    vi.stubGlobal('indexedDB', trap('indexedDB'));
    vi.stubGlobal('localStorage', trap('localStorage'));
    vi.stubGlobal('sessionStorage', trap('sessionStorage'));
    const store = await createInMemoryDataStore({ clock: createManualClock(), ids: createSequentialIds() });
    await store.loans.create(sampleLoan());
    expect((await store.exportAll()).loans).toHaveLength(1);
    await store.close();
  });
});

const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 20);
  });

async function fresh(): Promise<DataStore> {
  return createInMemoryDataStore({ clock: createManualClock(), ids: createSequentialIds() });
}

describe('memory adapter: fix round 1', () => {
  it('tx writes reject asynchronously instead of throwing synchronously', async () => {
    const store = await fresh();
    await store.transaction(async (tx) => {
      let pending: Promise<unknown> | undefined;
      expect(() => {
        pending = tx.loans.create({ ...sampleLoan(), principal: 500000 } as never);
      }).not.toThrow();
      await expect(pending).rejects.toBeInstanceOf(RecordValidationError);
    });
    await store.close();
  });

  it('a throwing listener does not stop the others', async () => {
    const store = await fresh();
    const seen: string[] = [];
    store.subscribe(() => {
      throw new Error('boom');
    });
    store.subscribe(() => seen.push('second'));
    await store.loans.create(sampleLoan());
    await settle();
    expect(seen).toEqual(['second']);
    await store.close();
  });

  it('a listener unsubscribed after the commit is not called', async () => {
    const store = await fresh();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await store.loans.create(sampleLoan());
    unsubscribe();
    await settle();
    expect(listener).not.toHaveBeenCalled();
    await store.close();
  });

  it('close() right after a commit suppresses the pending notification', async () => {
    const store = await fresh();
    const listener = vi.fn();
    store.subscribe(listener);
    await store.loans.create(sampleLoan());
    await store.close();
    await settle();
    expect(listener).not.toHaveBeenCalled();
  });

  it('transaction repositories reject once the transaction has ended', async () => {
    const store = await fresh();
    let leaked: DataStoreTransaction | undefined;
    await store.transaction((tx) => {
      leaked = tx;
      return Promise.resolve();
    });
    await expect(leaked?.loans.create(sampleLoan())).rejects.toThrow(/ended/);
    await expect(leaked?.loans.list()).rejects.toBeInstanceOf(PersistenceError);
    await store.close();
  });

  it('transaction repositories reject with CLOSED after close', async () => {
    const store = await fresh();
    let leaked: DataStoreTransaction | undefined;
    await store.transaction((tx) => {
      leaked = tx;
      return Promise.resolve();
    });
    await store.close();
    await expect(leaked?.loans.list()).rejects.toMatchObject({ code: 'CLOSED' });
  });

  it('close() waits for queued writes to finish', async () => {
    const store = await fresh();
    let finished = false;
    const write = store.loans.create(sampleLoan()).then(() => {
      finished = true;
    });
    await store.close();
    expect(finished).toBe(true);
    await write;
  });
});
