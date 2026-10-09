import { DestroyRef, inject, Injectable, type Signal, signal } from '@angular/core';
import {
  type ChangeEvent,
  type DataStore,
  type EntityName,
  PersistenceError,
  type RecordUpdate,
} from '@cuotascasa/persistence';
import type {
  ActualPayment,
  BaseRecord,
  DeviceSettingsValues,
  Loan,
  LoanEvent,
  ReportedBalance,
  Scenario,
  SyncedSettings,
} from '@cuotascasa/schema';
import { DataError } from '../api.ts';
import { DATA_STORE } from '../data-layer.tokens.ts';
import { STORAGE_HEALTH } from '../tokens.ts';

export const DEFAULT_DEVICE_VALUES: DeviceSettingsValues = { theme: 'system', driveSyncEnabled: false };

const ALL_ENTITIES: readonly EntityName[] = [
  'loans',
  'events',
  'reportedBalances',
  'payments',
  'scenarios',
  'settings',
];
const STAMP_FIELDS = ['createdAt', 'updatedAt', 'updatedByDevice', 'deletedAt'] as const;

/** Maps any failure to the typed rejection of the stores. The message is the code: it never carries entity values. */
export function toDataError(error: unknown): DataError {
  if (error instanceof DataError) {
    return error;
  }
  if (error instanceof PersistenceError) {
    if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION') {
      return new DataError(error.code);
    }
  }
  return new DataError('STORAGE');
}

/** Copy of `record` without `key`. */
export function withoutKey<V>(record: Readonly<Record<string, V>>, key: string): Record<string, V> {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

/** A stored record as the input of Repository.update: same user fields, no stamps. */
export function toUpdate<T extends BaseRecord>(record: T, changes: Partial<T> = {}): RecordUpdate<T> {
  const copy: Record<string, unknown> = { ...record, ...changes };
  for (const field of STAMP_FIELDS) {
    delete copy[field];
  }
  return copy as unknown as RecordUpdate<T>;
}

/**
 * State and write queue shared by every store (W3-11). It owns the only subscription to the DataStore.
 * Writes and reloads (the first load, the refresh after a write and the reload on a change notification, also from
 * other tabs) all run through one queue, so a reload can never read in the middle of a write and regress the state
 * (D27). State changes only after a write succeeded. Persistence is requested once, after the first successful write.
 */
@Injectable()
export class StoresRuntime {
  private readonly dataStore = inject(DATA_STORE, { optional: true });
  private readonly health = inject(STORAGE_HEALTH);
  private tail: Promise<unknown> = Promise.resolve();
  private persistRequested = false;
  private reloadScheduled = false;
  private readonly pendingReload = new Set<EntityName>();
  private unsubscribe: (() => void) | undefined;

  private readonly loansState = signal<readonly Loan[]>([]);
  private readonly eventsState = signal<readonly LoanEvent[]>([]);
  private readonly balancesState = signal<readonly ReportedBalance[]>([]);
  private readonly paymentsState = signal<readonly ActualPayment[]>([]);
  private readonly scenariosState = signal<readonly Scenario[]>([]);
  private readonly syncedState = signal<SyncedSettings | undefined>(undefined);
  private readonly deviceState = signal<DeviceSettingsValues>(DEFAULT_DEVICE_VALUES);
  private readonly readyState = signal(false);

  readonly ready: Signal<boolean> = this.readyState.asReadonly();
  readonly loans: Signal<readonly Loan[]> = this.loansState.asReadonly();
  readonly events: Signal<readonly LoanEvent[]> = this.eventsState.asReadonly();
  readonly reportedBalances: Signal<readonly ReportedBalance[]> = this.balancesState.asReadonly();
  readonly payments: Signal<readonly ActualPayment[]> = this.paymentsState.asReadonly();
  readonly scenarios: Signal<readonly Scenario[]> = this.scenariosState.asReadonly();
  readonly synced: Signal<SyncedSettings | undefined> = this.syncedState.asReadonly();
  readonly device: Signal<DeviceSettingsValues> = this.deviceState.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.unsubscribe?.());
    this.enqueue(() => this.start()).catch(() => undefined);
  }

  /**
   * Runs `work` on the DataStore in the queue, refreshes the touched collections and, on success, requests persistence
   * once. `work` must not call store-level DataStore methods from inside `transaction` (only the `tx` it receives).
   */
  write<R>(touched: readonly EntityName[], work: (store: DataStore) => Promise<R>): Promise<R> {
    return this.enqueue(async () => {
      const store = await this.requireStore();
      let result: R;
      try {
        result = await work(store);
      } catch (error) {
        throw toDataError(error);
      }
      await this.refresh(store, touched).catch(() => undefined);
      this.requestPersistOnce();
      return result;
    });
  }

  private enqueue<R>(task: () => Promise<R>): Promise<R> {
    const run = this.tail.then(task);
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async requireStore(): Promise<DataStore> {
    if (!this.dataStore) {
      throw new DataError('STORAGE');
    }
    try {
      return await this.dataStore;
    } catch {
      throw new DataError('STORAGE');
    }
  }

  private async start(): Promise<void> {
    if (!this.dataStore) {
      return;
    }
    const store = await this.dataStore;
    this.unsubscribe = store.subscribe((event) => this.onChange(event));
    await this.refresh(store, ALL_ENTITIES);
    this.readyState.set(true);
  }

  /** Coalesces notifications that arrive while a reload is still waiting in the queue. */
  private onChange(event: ChangeEvent): void {
    for (const entity of event.entities) {
      this.pendingReload.add(entity);
    }
    if (this.reloadScheduled) {
      return;
    }
    this.reloadScheduled = true;
    this.enqueue(async () => {
      this.reloadScheduled = false;
      const entities = [...this.pendingReload];
      this.pendingReload.clear();
      await this.refresh(await this.requireStore(), entities);
    }).catch(() => undefined);
  }

  private requestPersistOnce(): void {
    if (this.persistRequested) {
      return;
    }
    this.persistRequested = true;
    this.health.requestPersist().catch(() => undefined);
  }

  /** Reads the collections first and publishes them together, so a failed read leaves the state untouched. */
  private async refresh(store: DataStore, entities: readonly EntityName[]): Promise<void> {
    const wanted = new Set(entities);
    const [loans, events, balances, payments, scenarios, settings] = await Promise.all([
      wanted.has('loans') ? store.loans.list() : undefined,
      wanted.has('events') ? store.events.list() : undefined,
      wanted.has('reportedBalances') ? store.reportedBalances.list() : undefined,
      wanted.has('payments') ? store.payments.list() : undefined,
      wanted.has('scenarios') ? store.scenarios.list() : undefined,
      wanted.has('settings') ? Promise.all([store.settings.getSynced(), store.settings.getDevice()]) : undefined,
    ]);
    if (loans) this.loansState.set(loans);
    if (events) this.eventsState.set(events);
    if (balances) this.balancesState.set(balances);
    if (payments) this.paymentsState.set(payments);
    if (scenarios) this.scenariosState.set(scenarios);
    if (settings) {
      const [synced, device] = settings;
      this.syncedState.set(synced);
      this.deviceState.set(
        device ? { theme: device.theme, driveSyncEnabled: device.driveSyncEnabled } : DEFAULT_DEVICE_VALUES,
      );
    }
  }
}
