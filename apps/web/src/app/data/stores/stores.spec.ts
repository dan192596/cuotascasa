import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TestBed } from '@angular/core/testing';
import type { DataStore } from '@cuotascasa/persistence';
import { createInMemoryDataStore } from '@cuotascasa/persistence/memory';
import {
  createManualClock,
  createSequentialIds,
  sampleEvent,
  sampleLoan,
  samplePayment,
  sampleReportedBalance,
  sampleScenario,
} from '@cuotascasa/persistence/contract';
import type { Uuid } from '@cuotascasa/schema';
import { describe, expect, it, vi } from 'vitest';
import { type AnchorDraft, DataError, type StorageHealth } from '../api.ts';
import { DATA_STORE } from '../data-layer.tokens.ts';
import {
  LOAN_EVENTS_STORE,
  LOANS_STORE,
  PAYMENTS_STORE,
  REPORTED_BALANCES_STORE,
  SCENARIOS_STORE,
  SETTINGS_STORE,
  STORAGE_HEALTH,
} from '../tokens.ts';
import { provideStores } from './provide-stores.ts';
import { StoresRuntime } from './store-runtime.ts';

/**
 * Records the members used through a store, to compare with the members declared in data/api.ts: a method counts only
 * when it is invoked, a signal member when it is read.
 */
const touched = new Set<string>();
function track<T extends object>(name: string, store: T): T {
  return new Proxy(store, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof property !== 'string') return value;
      if (typeof value !== 'function') {
        touched.add(`${name}.${property}`);
        return value;
      }
      return (...args: unknown[]) => {
        touched.add(`${name}.${property}`);
        return (value as (...args: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

async function setup(options: { readonly failPersist?: boolean } = {}) {
  const dataStore = await createInMemoryDataStore({ clock: createManualClock(), ids: createSequentialIds() });
  const requestPersist = vi.fn(() => (options.failPersist ? Promise.reject(new Error('x')) : Promise.resolve(true)));
  const health: StorageHealth = {
    persisted: (() => null) as unknown as StorageHealth['persisted'],
    estimate: (() => null) as unknown as StorageHealth['estimate'],
    safariNonStandalone: (() => false) as unknown as StorageHealth['safariNonStandalone'],
    requestPersist,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideStores(),
      { provide: DATA_STORE, useValue: Promise.resolve(dataStore) },
      { provide: STORAGE_HEALTH, useValue: health },
    ],
  });
  const stores = {
    dataStore,
    requestPersist,
    loans: track('LoansStore', TestBed.inject(LOANS_STORE)),
    events: track('LoanChildStore', TestBed.inject(LOAN_EVENTS_STORE)),
    balances: track('LoanChildStore', TestBed.inject(REPORTED_BALANCES_STORE)),
    payments: track('LoanChildStore', TestBed.inject(PAYMENTS_STORE)),
    scenarios: track('ScenariosStore', TestBed.inject(SCENARIOS_STORE)),
    settings: track('SettingsStore', TestBed.inject(SETTINGS_STORE)),
  };
  await vi.waitFor(() => expect(stores.loans.ready()).toBe(true));
  return stores;
}

function anchorDraft(): AnchorDraft {
  const { date, installmentNumber, balance, source } = sampleReportedBalance('00000000-0000-4000-8000-000000000001');
  return { date, installmentNumber, balance, source };
}

async function expectDataError(promise: Promise<unknown>, code: DataError['code']): Promise<void> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(DataError);
  expect((error as DataError).code).toBe(code);
}

describe('LoansStore', () => {
  it('starts not ready, then ready with the existing loans, ordered by creation', async () => {
    const dataStore = await createInMemoryDataStore({ clock: createManualClock(), ids: createSequentialIds() });
    const first = await dataStore.loans.create({ ...sampleLoan(), name: 'Primera' });
    const second = await dataStore.loans.create({ ...sampleLoan(), name: 'Segunda' });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideStores(),
        { provide: DATA_STORE, useValue: Promise.resolve(dataStore) },
        { provide: STORAGE_HEALTH, useValue: { requestPersist: () => Promise.resolve(true) } },
      ],
    });
    const loans = TestBed.inject(LOANS_STORE);
    expect(loans.ready()).toBe(false);
    await vi.waitFor(() => expect(loans.ready()).toBe(true));
    expect(loans.loans().map((loan) => loan.id)).toEqual([first.id, second.id]);
  });

  it('create adds the loan to loans() and loan(id)', async () => {
    const { loans } = await setup();
    const created = await loans.create(sampleLoan());
    expect(loans.loans()).toEqual([created]);
    expect(loans.loan(created.id)()).toEqual(created);
    expect(loans.loan('00000000-0000-4000-8000-0000000000ff')()).toBeUndefined();
  });

  it('create rejects an invalid draft with VALIDATION and leaves the state unchanged', async () => {
    const { loans } = await setup();
    await expectDataError(loans.create({ ...sampleLoan(), name: '' }), 'VALIDATION');
    expect(loans.loans()).toEqual([]);
  });

  it('createWithAnchor writes the loan and its anchor in one transaction', async () => {
    const { loans, balances } = await setup();
    const { loan, anchor } = await loans.createWithAnchor(sampleLoan(), {
      date: '2025-03-05',
      installmentNumber: 2,
      balance: '499178.20',
      source: 'BANK_EMAIL',
    });
    expect(anchor.loanId).toBe(loan.id);
    expect(loans.loans()).toEqual([loan]);
    expect(balances.listByLoan(loan.id)()).toEqual([anchor]);
  });

  it('createWithAnchor writes neither record when the anchor fails', async () => {
    const { loans, balances, dataStore } = await setup();
    const anchor = anchorDraft();
    await expectDataError(loans.createWithAnchor(sampleLoan(), { ...anchor, balance: 'not-money' }), 'VALIDATION');
    expect(await dataStore.loans.list({ includeDeleted: true })).toEqual([]);
    expect(await dataStore.reportedBalances.list({ includeDeleted: true })).toEqual([]);
    expect(loans.loans()).toEqual([]);
    expect(balances.listByLoan('00000000-0000-4000-8000-000000000001')()).toEqual([]);
  });

  it('createWithAnchor writes neither record when the transaction fails after the loan', async () => {
    const { loans, dataStore } = await setup();
    const original = dataStore.transaction.bind(dataStore);
    vi.spyOn(dataStore, 'transaction').mockImplementation((work) =>
      original(async (tx) => {
        const patched = {
          ...tx,
          reportedBalances: {
            ...tx.reportedBalances,
            create: () => Promise.reject(new Error('disk full')),
          },
        };
        return work(patched as typeof tx);
      }),
    );
    const anchor = anchorDraft();
    await expectDataError(loans.createWithAnchor(sampleLoan(), anchor), 'STORAGE');
    expect(await dataStore.loans.list({ includeDeleted: true })).toEqual([]);
    expect(loans.loans()).toEqual([]);
  });

  it('update replaces the user fields; a missing loan is NOT_FOUND', async () => {
    const { loans } = await setup();
    const created = await loans.create(sampleLoan());
    const { id, name, createdAt, updatedAt, updatedByDevice, deletedAt, ...fields } = created;
    void [name, createdAt, updatedAt, updatedByDevice, deletedAt];
    const updated = await loans.update({ ...fields, id, name: 'Renombrada' });
    expect(updated.name).toBe('Renombrada');
    expect(loans.loan(id)()?.name).toBe('Renombrada');
    await expectDataError(
      loans.update({ ...fields, id: '00000000-0000-4000-8000-0000000000ff', name: 'X' }),
      'NOT_FOUND',
    );
  });

  it('setStatus moves the loan between active, paid and archived and keeps it listed', async () => {
    const { loans } = await setup();
    const created = await loans.create(sampleLoan());
    expect((await loans.setStatus(created.id, 'paid')).status).toBe('paid');
    expect((await loans.setStatus(created.id, 'archived')).status).toBe('archived');
    expect(loans.loans().map((loan) => loan.status)).toEqual(['archived']);
    await expectDataError(loans.setStatus('00000000-0000-4000-8000-0000000000ff', 'paid'), 'NOT_FOUND');
  });

  it('delete tombstones the loan with its events, balances, payments and scenarios, and nothing else', async () => {
    const { loans, events, balances, payments, scenarios, dataStore } = await setup();
    const doomed = await loans.create(sampleLoan());
    const kept = await loans.create({ ...sampleLoan(), name: 'Otra' });
    for (const id of [doomed.id, kept.id]) {
      await events.create(sampleEvent(id));
      await balances.create(sampleReportedBalance(id));
      await payments.create(samplePayment(id));
      await scenarios.create(sampleScenario(id));
    }
    await loans.delete(doomed.id);
    expect(loans.loans().map((loan) => loan.id)).toEqual([kept.id]);
    expect(loans.loan(doomed.id)()).toBeUndefined();
    for (const store of [events, balances, payments, scenarios]) {
      expect(store.listByLoan(doomed.id)()).toEqual([]);
      expect(store.listByLoan(kept.id)()).toHaveLength(1);
    }
    const tombstoned = (records: readonly { loanId?: Uuid; deletedAt: string | null }[], loanId: Uuid) =>
      records.filter((record) => record.loanId === loanId).every((record) => record.deletedAt !== null);
    expect(tombstoned(await dataStore.events.list({ includeDeleted: true }), doomed.id)).toBe(true);
    expect(tombstoned(await dataStore.reportedBalances.list({ includeDeleted: true }), doomed.id)).toBe(true);
    expect(tombstoned(await dataStore.payments.list({ includeDeleted: true }), doomed.id)).toBe(true);
    expect(tombstoned(await dataStore.scenarios.list({ includeDeleted: true }), doomed.id)).toBe(true);
    expect((await dataStore.loans.get(doomed.id, { includeDeleted: true }))?.deletedAt).not.toBeNull();
    expect((await dataStore.events.list()).map((record) => record.loanId)).toEqual([kept.id]);
    await expectDataError(loans.delete('00000000-0000-4000-8000-0000000000ff'), 'NOT_FOUND');
  });

  it('delete rolls back the loan tombstone when a child tombstone fails', async () => {
    const { loans, events, dataStore } = await setup();
    const loan = await loans.create(sampleLoan());
    await events.create(sampleEvent(loan.id));
    const original = dataStore.transaction.bind(dataStore);
    vi.spyOn(dataStore, 'transaction').mockImplementation((work) =>
      original((tx) =>
        work({ ...tx, events: { ...tx.events, delete: () => Promise.reject(new Error('disk full')) } } as typeof tx),
      ),
    );
    await expectDataError(loans.delete(loan.id), 'STORAGE');
    expect((await dataStore.loans.get(loan.id))?.deletedAt).toBeNull();
    expect(loans.loan(loan.id)()).toBeDefined();
    expect(events.listByLoan(loan.id)()).toHaveLength(1);
  });

  const CHILDREN = [
    ['LoanEvent', (s: Awaited<ReturnType<typeof setup>>) => s.events, sampleEvent],
    ['ReportedBalance', (s: Awaited<ReturnType<typeof setup>>) => s.balances, sampleReportedBalance],
    ['ActualPayment', (s: Awaited<ReturnType<typeof setup>>) => s.payments, samplePayment],
    ['Scenario', (s: Awaited<ReturnType<typeof setup>>) => s.scenarios, sampleScenario],
  ] as const;

  it.each(CHILDREN)('locks the currency while a non-deleted %s exists', async (_name, pick, sample) => {
    const stores = await setup();
    const { loans } = stores;
    const created = await loans.create(sampleLoan());
    const { id, createdAt, updatedAt, updatedByDevice, deletedAt, ...fields } = created;
    void [createdAt, updatedAt, updatedByDevice, deletedAt];
    const usd = { ...fields, id, currency: 'USD' as const };
    expect(loans.isCurrencyLocked(id)()).toBe(false);
    const child = await (pick(stores) as { create(draft: unknown): Promise<{ id: Uuid }> }).create(sample(id));
    expect(loans.isCurrencyLocked(id)()).toBe(true);
    await expectDataError(loans.update(usd), 'CURRENCY_LOCKED');
    expect(loans.loan(id)()?.currency).toBe('GTQ');
    // Same currency stays editable while locked.
    await loans.update({ ...fields, id, name: 'Sigue editable' });
    await (pick(stores) as { delete(id: Uuid): Promise<void> }).delete(child.id);
    expect(loans.isCurrencyLocked(id)()).toBe(false);
    expect((await loans.update(usd)).currency).toBe('USD');
  });

  it('allows a currency change when the loan has no children', async () => {
    const { loans } = await setup();
    const created = await loans.create(sampleLoan());
    const { id, createdAt, updatedAt, updatedByDevice, deletedAt, ...fields } = created;
    void [createdAt, updatedAt, updatedByDevice, deletedAt];
    expect((await loans.update({ ...fields, id, currency: 'USD' })).currency).toBe('USD');
  });
});

describe('child stores', () => {
  const CASES = [
    ['events', sampleEvent],
    ['balances', sampleReportedBalance],
    ['payments', samplePayment],
    ['scenarios', sampleScenario],
  ] as const;

  it.each(CASES)('%s: create, listByLoan, update and delete', async (key, sample) => {
    const stores = await setup();
    const store = stores[key] as unknown as {
      ready(): boolean;
      listByLoan(loanId: Uuid): () => readonly { id: Uuid; loanId: Uuid }[];
      create(draft: unknown): Promise<{ id: Uuid; loanId: Uuid }>;
      update(update: unknown): Promise<{ id: Uuid }>;
      delete(id: Uuid): Promise<void>;
    };
    const loanA = (await stores.loans.create(sampleLoan())).id;
    const loanB = (await stores.loans.create(sampleLoan())).id;
    expect(store.ready()).toBe(true);
    const first = await store.create(sample(loanA));
    const second = await store.create(sample(loanA));
    const other = await store.create(sample(loanB));
    expect(
      store
        .listByLoan(loanA)()
        .map((record) => record.id),
    ).toEqual([first.id, second.id]);
    expect(
      store
        .listByLoan(loanB)()
        .map((record) => record.id),
    ).toEqual([other.id]);

    const { id, createdAt, updatedAt, updatedByDevice, deletedAt, ...fields } = first as unknown as Record<
      string,
      unknown
    > & { id: Uuid };
    void [createdAt, updatedAt, updatedByDevice, deletedAt];
    const changes = {
      events: { amount: '1.00' },
      balances: { balance: '1.00' },
      payments: { total: '1.00' },
      scenarios: { name: 'Otro nombre' },
    } as const;
    const updatedRecord = await store.update({ ...fields, id, ...changes[key] });
    expect(updatedRecord.id).toBe(id);
    expect(
      store
        .listByLoan(loanA)()
        .find((record) => record.id === id),
    ).toEqual(updatedRecord);

    await store.delete(first.id);
    expect(
      store
        .listByLoan(loanA)()
        .map((record) => record.id),
    ).toEqual([second.id]);
    await expectDataError(store.update({ ...fields, id }), 'NOT_FOUND');
    await expectDataError(store.delete('00000000-0000-4000-8000-0000000000ff'), 'NOT_FOUND');
    await expectDataError(store.create({ ...sample(loanA), loanId: 'not-a-uuid' }), 'VALIDATION');
  });

  it.each(CASES)('%s: create needs a live loan; loanId is immutable', async (key, sample) => {
    const stores = await setup();
    const store = stores[key] as unknown as {
      create(draft: unknown): Promise<{ id: Uuid }>;
      update(update: unknown): Promise<unknown>;
    };
    const gone = '00000000-0000-4000-8000-0000000000ff';
    await expectDataError(store.create(sample(gone)), 'VALIDATION');
    const doomed = (await stores.loans.create(sampleLoan())).id;
    await stores.loans.delete(doomed);
    await expectDataError(store.create(sample(doomed)), 'VALIDATION');
    const repositories = {
      events: stores.dataStore.events,
      balances: stores.dataStore.reportedBalances,
      payments: stores.dataStore.payments,
      scenarios: stores.dataStore.scenarios,
    };
    expect(await repositories[key].list({ includeDeleted: true })).toEqual([]);

    const loanA = (await stores.loans.create(sampleLoan())).id;
    const loanB = (await stores.loans.create(sampleLoan())).id;
    const created = await store.create(sample(loanA));
    const { createdAt, updatedAt, updatedByDevice, deletedAt, ...fields } = created as unknown as Record<
      string,
      unknown
    >;
    void [createdAt, updatedAt, updatedByDevice, deletedAt];
    await expectDataError(store.update({ ...fields, loanId: loanB }), 'VALIDATION');
    // The currency of loan B stays editable: nothing moved there.
    expect(stores.loans.isCurrencyLocked(loanB)()).toBe(false);
    expect(stores.loans.isCurrencyLocked(loanA)()).toBe(true);
  });
});

describe('ScenariosStore active scenario', () => {
  it('sets, reads and clears the active scenario per loan', async () => {
    const { loans, scenarios, dataStore } = await setup();
    const loanA = (await loans.create(sampleLoan())).id;
    const loanB = (await loans.create(sampleLoan())).id;
    const scenario = await scenarios.create(sampleScenario(loanA));
    expect(scenarios.activeScenarioId(loanA)()).toBeNull();
    await scenarios.setActiveScenario(loanA, scenario.id);
    expect(scenarios.activeScenarioId(loanA)()).toBe(scenario.id);
    expect(scenarios.activeScenarioId(loanB)()).toBeNull();
    expect((await dataStore.settings.getSynced())?.activeScenarioByLoan).toEqual({ [loanA]: scenario.id });
    await scenarios.setActiveScenario(loanA, null);
    expect(scenarios.activeScenarioId(loanA)()).toBeNull();
  });

  it('is a no-op (no write, no persist request) when the pointer would not change', async () => {
    const { loans, scenarios, dataStore, requestPersist } = await setup();
    const loanA = (await loans.create(sampleLoan())).id;
    const scenario = await scenarios.create(sampleScenario(loanA));
    requestPersist.mockClear();
    const before = await dataStore.settings.getSynced();
    await scenarios.setActiveScenario(loanA, null);
    expect(await dataStore.settings.getSynced()).toEqual(before);
    await scenarios.setActiveScenario(loanA, scenario.id);
    const afterFirst = await dataStore.settings.getSynced();
    await scenarios.setActiveScenario(loanA, scenario.id);
    expect(await dataStore.settings.getSynced()).toEqual(afterFirst);
  });

  it('reads null unless the pointed scenario is live and belongs to that loan', async () => {
    const { loans, scenarios, dataStore } = await setup();
    const loanA = (await loans.create(sampleLoan())).id;
    const loanB = (await loans.create(sampleLoan())).id;
    const foreign = await scenarios.create(sampleScenario(loanB));
    await dataStore.settings.saveSynced({ activeScenarioByLoan: { [loanA]: foreign.id } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(scenarios.activeScenarioId(loanA)()).toBeNull();
    const own = await scenarios.create(sampleScenario(loanA));
    await dataStore.settings.saveSynced({ activeScenarioByLoan: { [loanA]: own.id } });
    await vi.waitFor(() => expect(scenarios.activeScenarioId(loanA)()).toBe(own.id));
    await dataStore.scenarios.delete(own.id);
    await vi.waitFor(() => expect(scenarios.activeScenarioId(loanA)()).toBeNull());
  });

  it('rejects a scenario that is missing or belongs to another loan', async () => {
    const { loans, scenarios } = await setup();
    const loanA = (await loans.create(sampleLoan())).id;
    const loanB = (await loans.create(sampleLoan())).id;
    const foreign = await scenarios.create(sampleScenario(loanB));
    await expectDataError(scenarios.setActiveScenario(loanA, foreign.id), 'VALIDATION');
    await expectDataError(scenarios.setActiveScenario(loanA, '00000000-0000-4000-8000-0000000000ff'), 'VALIDATION');
  });

  it('clears the pointer when the active scenario or its loan is deleted', async () => {
    const { loans, scenarios } = await setup();
    const loanA = (await loans.create(sampleLoan())).id;
    const first = await scenarios.create(sampleScenario(loanA));
    await scenarios.setActiveScenario(loanA, first.id);
    await scenarios.delete(first.id);
    expect(scenarios.activeScenarioId(loanA)()).toBeNull();
    const second = await scenarios.create(sampleScenario(loanA));
    await scenarios.setActiveScenario(loanA, second.id);
    await loans.delete(loanA);
    expect(scenarios.activeScenarioId(loanA)()).toBeNull();
  });
});

describe('SettingsStore', () => {
  it('starts with the device defaults and saves device settings', async () => {
    const { settings, dataStore } = await setup();
    expect(settings.ready()).toBe(true);
    expect(settings.device()).toEqual({ theme: 'system', driveSyncEnabled: false });
    expect(settings.theme()).toBe('system');
    await settings.saveDevice({ theme: 'dark', driveSyncEnabled: true });
    expect(settings.device()).toEqual({ theme: 'dark', driveSyncEnabled: true });
    expect(settings.theme()).toBe('dark');
    const stored = await dataStore.settings.getDevice();
    expect([stored?.theme, stored?.driveSyncEnabled]).toEqual(['dark', true]);
  });

  it('setTheme changes only the theme', async () => {
    const { settings } = await setup();
    await settings.saveDevice({ theme: 'light', driveSyncEnabled: true });
    await settings.setTheme('dark');
    expect(settings.device()).toEqual({ theme: 'dark', driveSyncEnabled: true });
  });

  it('setTheme and saveDevice fired together do not lose an update', async () => {
    const { settings } = await setup();
    await Promise.all([settings.saveDevice({ theme: 'dark', driveSyncEnabled: true }), settings.setTheme('light')]);
    expect(settings.device()).toEqual({ theme: 'light', driveSyncEnabled: true });
  });

  it('rejects an invalid theme with VALIDATION', async () => {
    const { settings } = await setup();
    await expectDataError(settings.setTheme('neon' as never), 'VALIDATION');
    expect(settings.theme()).toBe('system');
  });
});

describe('persist and change counters', () => {
  it('calls requestPersist exactly once, after the first successful write', async () => {
    const { loans, requestPersist } = await setup();
    expect(requestPersist).not.toHaveBeenCalled();
    await expectDataError(loans.create({ ...sampleLoan(), name: '' }), 'VALIDATION');
    expect(requestPersist).not.toHaveBeenCalled();
    await loans.create(sampleLoan());
    expect(requestPersist).toHaveBeenCalledTimes(1);
    await loans.create(sampleLoan());
    await loans.setStatus((await loans.create(sampleLoan())).id, 'paid');
    expect(requestPersist).toHaveBeenCalledTimes(1);
  });

  it('does not fail the write when requestPersist rejects', async () => {
    const { loans, requestPersist } = await setup({ failPersist: true });
    await loans.create(sampleLoan());
    expect(requestPersist).toHaveBeenCalledTimes(1);
  });

  it('moves pendingChanges and changesSinceBackup on writes, not on device settings', async () => {
    const { loans, settings, dataStore } = await setup();
    expect(await dataStore.pendingChanges()).toBe(0);
    await settings.setTheme('dark');
    expect(await dataStore.pendingChanges()).toBe(0);
    const loan = await loans.create(sampleLoan());
    expect([await dataStore.pendingChanges(), await dataStore.changesSinceBackup()]).toEqual([1, 1]);
    await loans.setStatus(loan.id, 'paid');
    expect([await dataStore.pendingChanges(), await dataStore.changesSinceBackup()]).toEqual([1, 1]);
    await loans.create(sampleLoan());
    expect([await dataStore.pendingChanges(), await dataStore.changesSinceBackup()]).toEqual([2, 2]);
  });
});

describe('reloading', () => {
  it('reflects writes made to the DataStore by someone else (other tab, sync, import)', async () => {
    const { loans, dataStore } = await setup();
    const external = await dataStore.loans.create({ ...sampleLoan(), name: 'Externa' });
    await vi.waitFor(() => expect(loans.loans().map((loan) => loan.id)).toEqual([external.id]));
    await dataStore.loans.delete(external.id);
    await vi.waitFor(() => expect(loans.loans()).toEqual([]));
    const backup = await dataStore.exportAll();
    await dataStore.replaceAll(
      {
        ...backup,
        loans: [{ ...(await dataStore.loans.get(external.id, { includeDeleted: true }))!, deletedAt: null }],
      },
      { pending: 'keep', backedUpAt: 'keep' },
    );
    await vi.waitFor(() => expect(loans.loans().map((loan) => loan.id)).toEqual([external.id]));
  });

  it('never reads from the DataStore while one of its own writes is in flight', async () => {
    const { loans, dataStore } = await setup();
    let writing = 0;
    const readsDuringWrites: number[] = [];
    const repo = dataStore.loans as { create: DataStore['loans']['create']; list: DataStore['loans']['list'] };
    const create = repo.create.bind(repo);
    const list = repo.list.bind(repo);
    repo.create = async (input) => {
      writing += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      try {
        return await create(input);
      } finally {
        writing -= 1;
      }
    };
    repo.list = (options) => {
      readsDuringWrites.push(writing);
      return list(options);
    };
    await Promise.all([loans.create(sampleLoan()), loans.create(sampleLoan()), loans.create(sampleLoan())]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(loans.loans()).toHaveLength(3);
    expect(readsDuringWrites.length).toBeGreaterThan(0);
    expect(readsDuringWrites.every((count) => count === 0)).toBe(true);
  });

  it('keeps state coherent when writes and external changes interleave', async () => {
    const { loans, dataStore } = await setup();
    const ownWrites = [loans.create(sampleLoan()), loans.create(sampleLoan())];
    const external = dataStore.loans.create({ ...sampleLoan(), name: 'Externa' });
    await Promise.all([...ownWrites, external]);
    await vi.waitFor(() => expect(loans.loans()).toHaveLength(3));
  });
});

describe('reload edge cases', () => {
  it('retries the entities of a failed reload on the next notification', async () => {
    const { loans, dataStore } = await setup();
    const repo = dataStore.loans as { list: DataStore['loans']['list'] };
    const list = repo.list.bind(repo);
    let failNext = true;
    repo.list = (options) => {
      if (failNext) {
        failNext = false;
        return Promise.reject(new Error('read failed'));
      }
      return list(options);
    };
    const external = await dataStore.loans.create({ ...sampleLoan(), name: 'Externa' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(loans.loans()).toEqual([]);
    await dataStore.events.create(sampleEvent(external.id));
    await vi.waitFor(() => expect(loans.loans().map((loan) => loan.id)).toEqual([external.id]));
  });

  it('re-arms when a notification arrives while a reload is running', async () => {
    const { loans, dataStore } = await setup();
    const repo = dataStore.loans as { list: DataStore['loans']['list'] };
    const list = repo.list.bind(repo);
    repo.list = async (options) => {
      const snapshot = await list(options);
      await new Promise((resolve) => setTimeout(resolve, 25));
      return snapshot;
    };
    await dataStore.loans.create({ ...sampleLoan(), name: 'Primera' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await dataStore.loans.create({ ...sampleLoan(), name: 'Segunda' });
    await vi.waitFor(() => expect(loans.loans()).toHaveLength(2));
  });

  function lazyStore(dataStore: DataStore): { open(): void } {
    let open: () => void = () => undefined;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideStores(),
        { provide: DATA_STORE, useValue: new Promise<DataStore>((resolve) => (open = () => resolve(dataStore))) },
        { provide: STORAGE_HEALTH, useValue: { requestPersist: () => Promise.resolve(true) } },
      ],
    });
    return { open: () => open() };
  }

  it('never subscribes when destroyed before the DataStore opened', async () => {
    const dataStore = await createInMemoryDataStore({ clock: createManualClock(), ids: createSequentialIds() });
    const subscribe = vi.spyOn(dataStore, 'subscribe');
    const gate = lazyStore(dataStore);
    const loans = TestBed.inject(LOANS_STORE);
    TestBed.resetTestingModule();
    gate.open();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(subscribe).not.toHaveBeenCalled();
    expect(loans.ready()).toBe(false);
  });

  it('unsubscribes when destroyed while the first load is still reading', async () => {
    const dataStore = await createInMemoryDataStore({ clock: createManualClock(), ids: createSequentialIds() });
    const unsubscribe = vi.fn();
    const subscribe = vi.spyOn(dataStore, 'subscribe').mockReturnValue(unsubscribe);
    const repo = dataStore.loans as { list: DataStore['loans']['list'] };
    const list = repo.list.bind(repo);
    repo.list = async (options) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return list(options);
    };
    const gate = lazyStore(dataStore);
    const loans = TestBed.inject(LOANS_STORE);
    gate.open();
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalled());
    TestBed.resetTestingModule();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(unsubscribe).toHaveBeenCalled();
    expect(loans.ready()).toBe(false);
  });

  it('exposes a failed load through loadError', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideStores(),
        { provide: DATA_STORE, useValue: Promise.reject(new Error('cannot open')) },
        { provide: STORAGE_HEALTH, useValue: { requestPersist: () => Promise.resolve(true) } },
      ],
    });
    const runtime = TestBed.inject(StoresRuntime);
    expect(runtime.loadError()).toBeNull();
    await vi.waitFor(() => expect(runtime.loadError()?.code).toBe('STORAGE'));
    expect(runtime.ready()).toBe(false);
  });
});

describe('DATA_STORE is required', () => {
  it('fails fast at injection when no DataStore is provided (W3 close: provideDataStores of W3-10 always provides it)', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideStores(),
        { provide: STORAGE_HEALTH, useValue: { requestPersist: () => Promise.resolve(true) } },
      ],
    });
    expect(() => TestBed.inject(LOANS_STORE)).toThrow(/DATA_STORE|No provider/);
  });
});

/** Members declared in `interface <name> { ... }` of data/api.ts (own members only). */
function declaredMembers(source: string, name: string): string[] {
  const open = source.indexOf('{', source.indexOf(`export interface ${name}`));
  const body = source.slice(open + 1, source.indexOf('\n}', open));
  return [...body.matchAll(/^ {2}(?:readonly )?(\w+)\s*[(:<]/gm)].map((match) => `${name}.${match[1]}`);
}

describe('meta-test: coverage of data/api.ts', () => {
  it('invokes every method and reads every signal member declared in data/api.ts', () => {
    const api = readFileSync(join(import.meta.dirname, '..', 'api.ts'), 'utf8');
    const declared = [
      ...declaredMembers(api, 'LoansStore'),
      ...declaredMembers(api, 'LoanChildStore'),
      ...declaredMembers(api, 'ScenariosStore'),
      ...declaredMembers(api, 'SettingsStore'),
    ];
    expect(declared.length).toBeGreaterThanOrEqual(20);
    const missing = declared.filter((member) => !touched.has(member));
    expect(missing).toEqual([]);
  });
});
