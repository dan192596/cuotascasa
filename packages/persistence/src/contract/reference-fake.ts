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
  type DataStoreFactory,
  type DataStoreMeta,
  type DataStoreRepositories,
  type GetOptions,
  type IdGenerator,
  type ListOptions,
  type ReplaceAllOptions,
  type SnapshotId,
  type Unsubscribe,
} from '../ports.ts';

/*
 * Throwaway reference DataStore that exists only to prove the contract suite is satisfiable
 * (contract.spec.ts). It is not the production memory adapter (W1-04 writes that one) and is never exported.
 */
type StoredRecord = BaseRecord & { readonly [field: string]: unknown };

interface State {
  readonly records: { readonly [K in EntityKey]: Map<Uuid, StoredRecord> };
  readonly pending: Set<string>;
  readonly sinceBackup: Set<string>;
  readonly lastSyncAt: IsoInstant | null;
  readonly lastBackupAt: IsoInstant | null;
}

interface Scope {
  state: State;
  readonly touched: Set<EntityKey>;
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

function compareRecords(a: StoredRecord, b: StoredRecord): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

function isDeviceSettings(entity: EntityKey, record: StoredRecord): boolean {
  return entity === 'settings' && record['scope'] === 'device';
}

interface SchemaIssueLike {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/** Structural view of a zod schema, so this package never imports zod (ADR-0010 §5). */
interface SchemaLike {
  safeParse(
    value: unknown,
  ):
    | { readonly success: true }
    | { readonly success: false; readonly error: { readonly issues: readonly SchemaIssueLike[] } };
}

function issuesOf(error: { readonly issues: readonly SchemaIssueLike[] }): { path: PropertyKey[]; message: string }[] {
  return error.issues.map((issue) => ({ path: [...issue.path], message: issue.message }));
}

function orderedEntities(touched: ReadonlySet<EntityKey>): EntityKey[] {
  return ENTITY_KEYS.filter((key) => touched.has(key));
}

class ReferenceDataStore implements DataStore {
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
  private lastStamp: number | null = null;
  private closed = false;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<ChangeListener>();
  private readonly snapshots = new Map<SnapshotId, State>();
  private snapshotCounter = 0;

  constructor(deps: DataStoreDeps) {
    this.clock = deps.clock;
    this.ids = deps.ids;
    this.deviceId = deps.ids.newId();
    const repositories = this.repositories(
      (read) => this.read(read),
      (write) => this.enqueue(() => this.commitScope(write)),
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
      const scope: Scope = { state: structuredClone(this.state), touched: new Set() };
      const tx = this.repositories(
        async (read) => structuredClone(read(scope.state)),
        async (write) => structuredClone(write(scope)),
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
        data[key] = [...state.records[key].values()].sort(compareRecords);
      }
      return data as unknown as BackupData;
    });
  }

  replaceAll(data: BackupData, options: ReplaceAllOptions): Promise<void> {
    return this.enqueue(() => {
      const parsed = backupDataSchema.safeParse(data);
      if (!parsed.success) {
        throw new RecordValidationError('dataset', issuesOf(parsed.error));
      }
      const next = emptyState();
      for (const key of ENTITY_KEYS) {
        const incoming = structuredClone(data[key]) as readonly StoredRecord[];
        for (const record of incoming) {
          if (!isDeviceSettings(key, record)) {
            next.records[key].set(record.id, record);
          }
        }
      }
      const localDevice = this.state.records.settings.get(DEVICE_SETTINGS_ID);
      if (localDevice !== undefined) {
        next.records.settings.set(DEVICE_SETTINGS_ID, structuredClone(localDevice));
      }
      const pending = new Set(options.pending === 'all' ? this.allCountedKeys(next) : this.state.pending);
      const backedUp = options.backedUpAt !== 'keep';
      this.state = {
        records: next.records,
        pending,
        sinceBackup: backedUp ? new Set() : new Set(this.state.sinceBackup),
        lastSyncAt: this.state.lastSyncAt,
        lastBackupAt: options.backedUpAt === 'keep' ? this.state.lastBackupAt : options.backedUpAt,
      };
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
      this.state = { ...this.state, pending: new Set(), lastSyncAt: at };
    });
  }

  changesSinceBackup(): Promise<number> {
    return this.read((state) => state.sinceBackup.size);
  }

  markBackedUp(at: IsoInstant): Promise<void> {
    return this.enqueue(() => {
      this.state = { ...this.state, sinceBackup: new Set(), lastBackupAt: at };
    });
  }

  getMeta(): Promise<DataStoreMeta> {
    return this.read((state) => ({
      deviceId: this.deviceId,
      lastSyncAt: state.lastSyncAt,
      lastBackupAt: state.lastBackupAt,
    }));
  }

  async close(): Promise<void> {
    this.closed = true;
    this.listeners.clear();
    await Promise.resolve();
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new PersistenceError('CLOSED', 'DataStore is closed');
    }
  }

  private async read<R>(reader: (state: State) => R): Promise<R> {
    await Promise.resolve();
    this.ensureOpen();
    return structuredClone(reader(this.state));
  }

  private enqueue<R>(task: () => R | Promise<R>): Promise<R> {
    const run = this.queue.then(() => {
      this.ensureOpen();
      return task();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private commitScope<R>(write: (scope: Scope) => R): R {
    const scope: Scope = { state: structuredClone(this.state), touched: new Set() };
    const result = write(scope);
    this.commit(scope, 'write');
    return structuredClone(result);
  }

  private commit(scope: Scope, origin: ChangeOrigin): void {
    this.state = scope.state;
    if (scope.touched.size > 0) {
      this.notify({ entities: orderedEntities(scope.touched), origin });
    }
  }

  private notify(event: ChangeEvent): void {
    const targets = [...this.listeners];
    setTimeout(() => {
      for (const listener of targets) {
        listener(event);
      }
    }, 0);
  }

  private stamp(previous?: IsoInstant): IsoInstant {
    const now = Date.parse(this.clock.now());
    let floor = this.lastStamp ?? Number.NEGATIVE_INFINITY;
    if (previous !== undefined) {
      floor = Math.max(floor, Date.parse(previous));
    }
    const value = now > floor ? now : floor + 1;
    this.lastStamp = value;
    return new Date(value).toISOString();
  }

  private allCountedKeys(state: State): string[] {
    return ENTITY_KEYS.flatMap((key) =>
      [...state.records[key].values()]
        .filter((record) => !isDeviceSettings(key, record))
        .map((record) => `${key}:${record.id}`),
    );
  }

  private markChanged(scope: Scope, entity: EntityKey, record: StoredRecord): void {
    scope.touched.add(entity);
    if (!isDeviceSettings(entity, record)) {
      scope.state.pending.add(`${entity}:${record.id}`);
      scope.state.sinceBackup.add(`${entity}:${record.id}`);
    }
  }

  private validate(entity: EntityKey, schema: SchemaLike, candidate: unknown): StoredRecord {
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      throw new RecordValidationError(entity, issuesOf(parsed.error));
    }
    return candidate as StoredRecord;
  }

  private repositories(
    read: <R>(reader: (state: State) => R) => Promise<R>,
    write: <R>(writer: (scope: Scope) => R) => Promise<R>,
  ): DataStoreRepositories {
    const repository = (entity: Exclude<EntityKey, 'settings'>): object => ({
      get: (id: Uuid, options?: GetOptions) =>
        read((state) => {
          const record = state.records[entity].get(id);
          return record !== undefined && (options?.includeDeleted === true || record.deletedAt === null)
            ? record
            : undefined;
        }),
      list: (options?: ListOptions) =>
        read((state) =>
          [...state.records[entity].values()]
            .filter((record) => options?.includeDeleted === true || record.deletedAt === null)
            .sort(compareRecords),
        ),
      listByLoan: (loanId: Uuid, options?: ListOptions) =>
        read((state) =>
          [...state.records[entity].values()]
            .filter((record) => record['loanId'] === loanId)
            .filter((record) => options?.includeDeleted === true || record.deletedAt === null)
            .sort(compareRecords),
        ),
      create: (input: object) =>
        write((scope) => {
          const stamp = this.stamp();
          const candidate = this.validate(entity, ENTITY_SCHEMAS[entity], {
            ...structuredClone(input),
            id: this.ids.newId(),
            createdAt: stamp,
            updatedAt: stamp,
            updatedByDevice: this.deviceId,
            deletedAt: null,
          });
          scope.state.records[entity].set(candidate.id, candidate);
          this.markChanged(scope, entity, candidate);
          return candidate;
        }),
      update: (input: { readonly id: Uuid }) =>
        write((scope) => {
          const existing = scope.state.records[entity].get(input.id);
          if (existing === undefined || existing.deletedAt !== null) {
            throw new RecordNotFoundError(entity, input.id);
          }
          const candidate = this.validate(entity, ENTITY_SCHEMAS[entity], {
            ...structuredClone(input),
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: this.stamp(existing.updatedAt),
            updatedByDevice: this.deviceId,
            deletedAt: null,
          });
          scope.state.records[entity].set(candidate.id, candidate);
          this.markChanged(scope, entity, candidate);
          return candidate;
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
          const tombstone: StoredRecord = {
            ...existing,
            updatedAt: stamp,
            updatedByDevice: this.deviceId,
            deletedAt: stamp,
          };
          scope.state.records[entity].set(id, tombstone);
          this.markChanged(scope, entity, tombstone);
          return tombstone;
        }),
    });

    const saveSettings = (id: Uuid, scopeName: 'synced' | 'device', values: object) =>
      write((scope) => {
        const existing = scope.state.records.settings.get(id);
        const stamp = this.stamp(existing?.updatedAt);
        const candidate = this.validate('settings', ENTITY_SCHEMAS.settings, {
          ...structuredClone(values),
          id,
          scope: scopeName,
          createdAt: existing?.createdAt ?? stamp,
          updatedAt: stamp,
          updatedByDevice: this.deviceId,
          deletedAt: null,
        });
        scope.state.records.settings.set(id, candidate);
        this.markChanged(scope, 'settings', candidate);
        return candidate;
      });

    const getSettings = (id: Uuid) =>
      read((state) => {
        const record = state.records.settings.get(id);
        return record !== undefined && record.deletedAt === null ? record : undefined;
      });

    const settings = {
      getSynced: () => getSettings(SYNCED_SETTINGS_ID),
      saveSynced: (values: SyncedSettingsValues) => saveSettings(SYNCED_SETTINGS_ID, 'synced', values),
      getDevice: () => getSettings(DEVICE_SETTINGS_ID),
      saveDevice: (values: DeviceSettingsValues) => saveSettings(DEVICE_SETTINGS_ID, 'device', values),
    };

    return {
      loans: repository('loans'),
      events: repository('events'),
      reportedBalances: repository('reportedBalances'),
      payments: repository('payments'),
      scenarios: repository('scenarios'),
      settings,
    } as unknown as DataStoreRepositories;
  }
}

export const createReferenceDataStore: DataStoreFactory = async (deps) => {
  await Promise.resolve();
  return new ReferenceDataStore(deps);
};
