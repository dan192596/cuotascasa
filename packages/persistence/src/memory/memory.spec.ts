import { afterEach, describe, expect, it, vi } from 'vitest';
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
