import {
  DEVICE_SETTINGS_ID,
  ENTITY_KEYS,
  ENTITY_SCHEMAS,
  SYNCED_SETTINGS_ID,
  backupDataSchema,
  type BackupData,
  type BaseRecord,
  type DeviceSettingsValues,
  type EntityKey,
  type IsoInstant,
  type SyncedSettingsValues,
  type Uuid,
} from '@cuotascasa/schema';
import {
  PersistenceError,
  RecordNotFoundError,
  RecordValidationError,
  SnapshotNotFoundError,
  type ChangeEvent,
  type ChangeListener,
  type ChangeOrigin,
  type Clock,
  type DataStore,
  type DataStoreDeps,
  type DataStoreMeta,
  type DataStoreRepositories,
  type GetOptions,
  type IdGenerator,
  type ListOptions,
  type ReplaceAllOptions,
  type SettingsRepository,
  type SnapshotId,
  type Unsubscribe,
  type ValidationIssue,
} from '../ports.ts';

type StoredRecord = BaseRecord & { readonly [field: string]: unknown };
type ChildEntity = Exclude<EntityKey, 'settings'>;

/** Everything a snapshot has to capture and a transaction has to be able to discard. */
interface State {
  records: { [K in EntityKey]: Map<Uuid, StoredRecord> };
  /** `${entity}:${id}` of records written since the last markSynced / markBackedUp. */
  pending: Set<string>;
  sinceBackup: Set<string>;
  lastSyncAt: IsoInstant | null;
  lastBackupAt: IsoInstant | null;
}

/** A unit of work: a private copy of the state plus the collections it touched. */
interface Scope {
  readonly state: State;
  readonly touched: Set<EntityKey>;
}

/** Structural view of a zod schema, so this package never imports zod (ADR-0010 §5). */
interface SchemaLike {
  safeParse(value: unknown): {
    readonly success: boolean;
    readonly error?: { readonly issues: readonly ValidationIssue[] };
  };
}

function emptyState(): State {
  return {
    records: {
      loans: new Map(),
      events: new Map(),
      reportedBalances: new Map(),
      payments: new Map(),
      scenarios: new Map(),
      settings: new Map(),
    },
    pending: new Set(),
    sinceBackup: new Set(),
    lastSyncAt: null,
    lastBackupAt: null,
  };
}

/** Order of list(): createdAt ascending, then id ascending. */
function byCreation(a: StoredRecord, b: StoredRecord): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
}

function isDeviceSettings(entity: EntityKey, record: StoredRecord): boolean {
  return entity === 'settings' && record['scope'] === 'device';
}

function isVisible(record: StoredRecord, options?: { readonly includeDeleted?: boolean }): boolean {
  return options?.includeDeleted === true || record.deletedAt === null;
}

class InMemoryDataStore implements DataStore {
  readonly loans;
  readonly events;
  readonly reportedBalances;
  readonly payments;
  readonly scenarios;
  readonly settings;

  private readonly clock: Clock;
  private readonly ids: IdGenerator;
  private readonly deviceId: Uuid;
  private state: State = emptyState();
  /** Millisecond value of the last stamp issued by this device; keeps stamps strictly increasing. */
  private lastStamp = Number.NEGATIVE_INFINITY;
  private closed = false;
  /** Tail of the serialization queue: writes and transactions run one at a time. */
  private tail: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<ChangeListener>();
  private readonly snapshots = new Map<SnapshotId, State>();
  private snapshotCounter = 0;

  constructor(deps: DataStoreDeps) {
    this.clock = deps.clock;
    this.ids = deps.ids;
    // First id ever drawn: the device identity (ports.ts, DataStoreMeta.deviceId).
    this.deviceId = deps.ids.newId();
    const repositories = this.buildRepositories(
      (reader) => this.read(reader),
      (writer) => this.enqueue(() => this.runInScope(writer)),
    );
    this.loans = repositories.loans;
    this.events = repositories.events;
    this.reportedBalances = repositories.reportedBalances;
    this.payments = repositories.payments;
    this.scenarios = repositories.scenarios;
    this.settings = repositories.settings;
  }

  transaction<R>(work: (tx: DataStoreRepositories) => Promise<R>): Promise<R> {
    return this.enqueue(async () => {
      const scope = this.openScope();
      // The transaction's repositories read and write the scope's private copy, so they see their own writes.
      const tx = this.buildRepositories(
        (reader) => Promise.resolve(structuredClone(reader(scope.state))),
        (writer) => Promise.resolve(structuredClone(writer(scope))),
      );
      const result = await work(tx);
      this.commit(scope, 'write');
      return result;
    });
  }

  exportAll(): Promise<BackupData> {
    return this.read((state) => {
      const data: Record<string, StoredRecord[]> = {};
      for (const key of ENTITY_KEYS) {
        data[key] = [...state.records[key].values()].sort(byCreation);
      }
      return data as unknown as BackupData;
    });
  }

  replaceAll(data: BackupData, options: ReplaceAllOptions): Promise<void> {
    return this.enqueue(() => {
      const parsed = backupDataSchema.safeParse(data);
      if (!parsed.success) {
        throw new RecordValidationError(
          'dataset',
          parsed.error.issues.map((issue) => ({ path: [...issue.path], message: issue.message })),
        );
      }
      const next = emptyState();
      for (const key of ENTITY_KEYS) {
        for (const record of structuredClone(data[key]) as readonly StoredRecord[]) {
          // Incoming device settings are ignored: the local record (if any) is kept below.
          if (!isDeviceSettings(key, record)) {
            next.records[key].set(record.id, record);
          }
        }
      }
      const localDevice = this.state.records.settings.get(DEVICE_SETTINGS_ID);
      if (localDevice !== undefined) {
        next.records.settings.set(DEVICE_SETTINGS_ID, localDevice);
      }
      next.pending =
        options.pending === 'all'
          ? new Set(
              ENTITY_KEYS.flatMap((key) =>
                [...next.records[key].values()]
                  .filter((record) => !isDeviceSettings(key, record))
                  .map((record) => `${key}:${record.id}`),
              ),
            )
          : this.state.pending;
      next.sinceBackup = options.backedUpAt === 'keep' ? this.state.sinceBackup : new Set();
      next.lastBackupAt = options.backedUpAt === 'keep' ? this.state.lastBackupAt : options.backedUpAt;
      next.lastSyncAt = this.state.lastSyncAt;
      this.state = next;
      this.notify({ entities: [...ENTITY_KEYS], origin: 'replaceAll' });
    });
  }

  createSnapshot(): Promise<SnapshotId> {
    return this.enqueue(() => {
      this.snapshotCounter += 1;
      const id = `snapshot-${String(this.snapshotCounter)}`;
      this.snapshots.set(id, structuredClone(this.state));
      return id;
    });
  }

  restoreSnapshot(id: SnapshotId): Promise<void> {
    return this.enqueue(() => {
      const snapshot = this.snapshots.get(id);
      if (snapshot === undefined) {
        throw new SnapshotNotFoundError(id);
      }
      this.state = structuredClone(snapshot);
      this.snapshots.delete(id);
      this.notify({ entities: [...ENTITY_KEYS], origin: 'restoreSnapshot' });
    });
  }

  discardSnapshot(id: SnapshotId): Promise<void> {
    return this.enqueue(() => {
      this.snapshots.delete(id);
    });
  }

  subscribe(listener: ChangeListener): Unsubscribe {
    this.ensureOpen();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  pendingChanges(): Promise<number> {
    return this.read((state) => state.pending.size);
  }

  markSynced(at: IsoInstant): Promise<void> {
    return this.enqueue(() => {
      this.state.pending = new Set();
      this.state.lastSyncAt = at;
    });
  }

  changesSinceBackup(): Promise<number> {
    return this.read((state) => state.sinceBackup.size);
  }

  markBackedUp(at: IsoInstant): Promise<void> {
    return this.enqueue(() => {
      this.state.sinceBackup = new Set();
      this.state.lastBackupAt = at;
    });
  }

  getMeta(): Promise<DataStoreMeta> {
    return this.read((state) => ({
      deviceId: this.deviceId,
      lastSyncAt: state.lastSyncAt,
      lastBackupAt: state.lastBackupAt,
    }));
  }

  close(): Promise<void> {
    this.closed = true;
    this.listeners.clear();
    return Promise.resolve();
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new PersistenceError('CLOSED', 'DataStore is closed');
    }
  }

  /** Reads committed state asynchronously and hands back a deep copy. */
  private async read<R>(reader: (state: State) => R): Promise<R> {
    await Promise.resolve();
    this.ensureOpen();
    return structuredClone(reader(this.state));
  }

  /** Appends a task to the serialization queue; a failure does not poison later tasks. */
  private enqueue<R>(task: () => R | Promise<R>): Promise<R> {
    const run = this.tail.then(() => {
      this.ensureOpen();
      return task();
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  private openScope(): Scope {
    return { state: structuredClone(this.state), touched: new Set() };
  }

  /** One store-level write: it is its own transaction, committed only when `writer` does not throw. */
  private runInScope<R>(writer: (scope: Scope) => R): R {
    const scope = this.openScope();
    const result = writer(scope);
    this.commit(scope, 'write');
    return structuredClone(result);
  }

  private commit(scope: Scope, origin: ChangeOrigin): void {
    this.state = scope.state;
    if (scope.touched.size > 0) {
      this.notify({ entities: ENTITY_KEYS.filter((key) => scope.touched.has(key)), origin });
    }
  }

  /** Listeners run after the commit, asynchronously, so a listener can never interleave with a write. */
  private notify(event: ChangeEvent): void {
    const targets = [...this.listeners];
    setTimeout(() => {
      for (const listener of targets) {
        listener(event);
      }
    }, 0);
  }

  /**
   * Next stamp: the clock's instant, unless that is not strictly greater than the device's previous stamp or than
   * `previous` (the written record's current updatedAt), in which case the larger of those plus one millisecond.
   */
  private stamp(previous?: IsoInstant): IsoInstant {
    const now = Date.parse(this.clock.now());
    const floor = previous === undefined ? this.lastStamp : Math.max(this.lastStamp, Date.parse(previous));
    this.lastStamp = now > floor ? now : floor + 1;
    return new Date(this.lastStamp).toISOString();
  }

  private validate(entity: EntityKey, candidate: StoredRecord): StoredRecord {
    const schema: SchemaLike = ENTITY_SCHEMAS[entity];
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      const issues = parsed.error?.issues ?? [];
      throw new RecordValidationError(
        entity,
        issues.map((issue) => ({ path: [...issue.path], message: issue.message })),
      );
    }
    return candidate;
  }

  /** Stores a written record and registers it as changed (device settings never count). */
  private put(scope: Scope, entity: EntityKey, record: StoredRecord): StoredRecord {
    scope.state.records[entity].set(record.id, record);
    scope.touched.add(entity);
    if (!isDeviceSettings(entity, record)) {
      const key = `${entity}:${record.id}`;
      scope.state.pending.add(key);
      scope.state.sinceBackup.add(key);
    }
    return record;
  }

  private buildRepositories(
    read: <R>(reader: (state: State) => R) => Promise<R>,
    write: <R>(writer: (scope: Scope) => R) => Promise<R>,
  ): DataStoreRepositories {
    const collection = (entity: ChildEntity): object => ({
      get: (id: Uuid, options?: GetOptions) =>
        read((state) => {
          const record = state.records[entity].get(id);
          return record !== undefined && isVisible(record, options) ? record : undefined;
        }),
      list: (options?: ListOptions) =>
        read((state) =>
          [...state.records[entity].values()].filter((record) => isVisible(record, options)).sort(byCreation),
        ),
      listByLoan: (loanId: Uuid, options?: ListOptions) =>
        read((state) =>
          [...state.records[entity].values()]
            .filter((record) => record['loanId'] === loanId && isVisible(record, options))
            .sort(byCreation),
        ),
      create: (input: object) =>
        write((scope) => {
          const stamp = this.stamp();
          const record = this.validate(entity, {
            ...structuredClone(input),
            id: this.ids.newId(),
            createdAt: stamp,
            updatedAt: stamp,
            updatedByDevice: this.deviceId,
            deletedAt: null,
          } as StoredRecord);
          return this.put(scope, entity, record);
        }),
      update: (input: { readonly id: Uuid }) =>
        write((scope) => {
          const existing = scope.state.records[entity].get(input.id);
          if (existing === undefined || existing.deletedAt !== null) {
            throw new RecordNotFoundError(entity, input.id);
          }
          const record = this.validate(entity, {
            ...structuredClone(input),
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: this.stamp(existing.updatedAt),
            updatedByDevice: this.deviceId,
            deletedAt: null,
          } as StoredRecord);
          return this.put(scope, entity, record);
        }),
      delete: (id: Uuid) =>
        write((scope) => {
          const existing = scope.state.records[entity].get(id);
          if (existing === undefined) {
            throw new RecordNotFoundError(entity, id);
          }
          if (existing.deletedAt !== null) {
            return existing;
          }
          const stamp = this.stamp(existing.updatedAt);
          return this.put(scope, entity, {
            ...existing,
            updatedAt: stamp,
            updatedByDevice: this.deviceId,
            deletedAt: stamp,
          });
        }),
    });

    const getSettings = (id: Uuid) =>
      read((state) => {
        const record = state.records.settings.get(id);
        return record !== undefined && record.deletedAt === null ? record : undefined;
      });

    const saveSettings = (id: Uuid, scopeName: 'synced' | 'device', values: object) =>
      write((scope) => {
        const existing = scope.state.records.settings.get(id);
        const stamp = this.stamp(existing?.updatedAt);
        const record = this.validate('settings', {
          ...structuredClone(values),
          id,
          scope: scopeName,
          createdAt: existing?.createdAt ?? stamp,
          updatedAt: stamp,
          updatedByDevice: this.deviceId,
          deletedAt: null,
        } as StoredRecord);
        return this.put(scope, 'settings', record);
      });

    const settings = {
      getSynced: () => getSettings(SYNCED_SETTINGS_ID),
      saveSynced: (values: SyncedSettingsValues) => saveSettings(SYNCED_SETTINGS_ID, 'synced', values),
      getDevice: () => getSettings(DEVICE_SETTINGS_ID),
      saveDevice: (values: DeviceSettingsValues) => saveSettings(DEVICE_SETTINGS_ID, 'device', values),
    } as unknown as SettingsRepository;

    return {
      loans: collection('loans'),
      events: collection('events'),
      reportedBalances: collection('reportedBalances'),
      payments: collection('payments'),
      scenarios: collection('scenarios'),
      settings,
    } as unknown as DataStoreRepositories;
  }
}

export function createStore(deps: DataStoreDeps): Promise<DataStore> {
  return Promise.resolve(new InMemoryDataStore(deps));
}
