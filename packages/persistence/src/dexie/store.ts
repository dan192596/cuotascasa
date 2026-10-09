import { Dexie, type Table } from 'dexie';
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
  type DataStoreTransaction,
  type GetOptions,
  type IdGenerator,
  type ListOptions,
  type ReplaceAllOptions,
  type SnapshotId,
  type Unsubscribe,
} from '../ports.ts';
import { META_KEYS } from './schema.ts';

type StoredRecord = BaseRecord & { readonly [field: string]: unknown };
type Mode = 'r' | 'rw';

/** Upper bound for string key parts: createdAt and id are ASCII, so nothing sorts above it. */
const KEY_MAX = '\uffff';

interface MetaRow {
  readonly key: string;
  readonly value: unknown;
}

interface SnapshotRow {
  readonly id: SnapshotId;
  readonly records: Readonly<Record<EntityKey, readonly StoredRecord[]>>;
  readonly pending: readonly string[];
  readonly sinceBackup: readonly string[];
  readonly lastSyncAt: IsoInstant | null;
  readonly lastBackupAt: IsoInstant | null;
}

interface Counters {
  pending: Set<string>;
  sinceBackup: Set<string>;
}

type Exec = <R>(mode: Mode, op: (scope: TxScope) => Promise<R>) => Promise<R>;

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

function validate(entity: EntityKey, schema: SchemaLike, candidate: unknown): StoredRecord {
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    throw new RecordValidationError(entity, issuesOf(parsed.error));
  }
  return candidate as StoredRecord;
}

function isDeviceSettings(entity: EntityKey, record: StoredRecord): boolean {
  return entity === 'settings' && record['scope'] === 'device';
}

function changeKey(entity: EntityKey, id: string): string {
  return `${entity}:${id}`;
}

function closedError(): PersistenceError {
  return new PersistenceError('CLOSED', 'DataStore is closed');
}

/**
 * State of one Dexie transaction: which collections were touched, the monotonic stamp floor and the change counters.
 * The floor and the counters are read lazily inside the transaction and written back before it commits, so they
 * commit or roll back together with the records.
 */
class TxScope {
  readonly touched = new Set<EntityKey>();
  origin: ChangeOrigin = 'write';
  /** Set once the Dexie transaction settled; the transaction's repositories then reject. */
  done = false;
  /** The Dexie transaction this scope runs in, to recognise store-level calls made from inside it. */
  tx: unknown;
  private floor: number | undefined;
  private floorDirty = false;
  private counterState: Counters | undefined;
  private counterDirty = false;

  readonly db: Dexie;
  private readonly clock: Clock;

  constructor(db: Dexie, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  table(name: string): Table<StoredRecord, string> {
    return this.db.table<StoredRecord, string>(name);
  }

  async readMeta(key: string): Promise<unknown> {
    const row = await this.db.table<MetaRow, string>('meta').get(key);
    return row?.value;
  }

  async writeMeta(key: string, value: unknown): Promise<void> {
    await this.db.table<MetaRow, string>('meta').put({ key, value });
  }

  /** Strictly above the persisted floor and above the record's current updatedAt, +1 ms when the clock lags. */
  async stamp(previous?: IsoInstant): Promise<IsoInstant> {
    if (this.floor === undefined) {
      const stored = await this.readMeta(META_KEYS.stampFloor);
      this.floor = typeof stored === 'number' ? stored : Number.NEGATIVE_INFINITY;
    }
    let floor = this.floor;
    if (previous !== undefined) {
      floor = Math.max(floor, Date.parse(previous));
    }
    const now = Date.parse(this.clock.now());
    const value = now > floor ? now : floor + 1;
    this.floor = value;
    this.floorDirty = true;
    return new Date(value).toISOString();
  }

  /** The counters, loaded once; callers that take them intend to change them. */
  async counters(): Promise<Counters> {
    if (this.counterState === undefined) {
      const pending = await this.readMeta(META_KEYS.pending);
      const sinceBackup = await this.readMeta(META_KEYS.sinceBackup);
      this.counterState = {
        pending: new Set(Array.isArray(pending) ? (pending as string[]) : []),
        sinceBackup: new Set(Array.isArray(sinceBackup) ? (sinceBackup as string[]) : []),
      };
    }
    this.counterDirty = true;
    return this.counterState;
  }

  setCounters(counters: Counters): void {
    this.counterState = counters;
    this.counterDirty = true;
  }

  async markChanged(entity: EntityKey, record: StoredRecord): Promise<void> {
    this.touched.add(entity);
    if (!isDeviceSettings(entity, record)) {
      const counters = await this.counters();
      counters.pending.add(changeKey(entity, record.id));
      counters.sinceBackup.add(changeKey(entity, record.id));
    }
    await this.flush();
  }

  /**
   * Writes the stamp floor and the counters that changed. Called right after every record write, so whatever prefix
   * IndexedDB commits keeps records, counters and floor consistent.
   */
  async flush(): Promise<void> {
    if (this.floorDirty && this.floor !== undefined) {
      this.floorDirty = false;
      await this.writeMeta(META_KEYS.stampFloor, this.floor);
    }
    if (this.counterState !== undefined && this.counterDirty) {
      this.counterDirty = false;
      await this.writeMeta(META_KEYS.pending, [...this.counterState.pending]);
      await this.writeMeta(META_KEYS.sinceBackup, [...this.counterState.sinceBackup]);
    }
  }
}

let nextFactoryToken = 0;
const factoryTokens = new WeakMap<IDBFactory, number>();

/** Instances on the global factory share a channel across tabs; an isolated factory gets a channel of its own. */
function channelName(name: string, factory: IDBFactory | undefined): string {
  if (factory === undefined) {
    return `cuotascasa:${name}`;
  }
  let token = factoryTokens.get(factory);
  if (token === undefined) {
    nextFactoryToken += 1;
    token = nextFactoryToken;
    factoryTokens.set(factory, token);
  }
  return `cuotascasa:${name}:${String(token)}`;
}

/** DataStore over Dexie (ADR-0006). Writes and transactions run one at a time, each in one Dexie transaction. */
export class DexieDataStore implements DataStore {
  readonly loans;
  readonly events;
  readonly reportedBalances;
  readonly payments;
  readonly scenarios;
  readonly settings;

  readonly db: Dexie;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;
  private readonly deviceId: Uuid;
  private closed = false;
  private active: TxScope | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<ChangeListener>();
  private readonly channel: BroadcastChannel | undefined;

  private constructor(db: Dexie, clock: Clock, ids: IdGenerator, deviceId: Uuid, channelId: string) {
    this.db = db;
    this.clock = clock;
    this.ids = ids;
    this.deviceId = deviceId;
    const repositories = this.repositories((mode, op) => this.run(mode, op));
    this.loans = repositories.loans;
    this.events = repositories.events;
    this.reportedBalances = repositories.reportedBalances;
    this.payments = repositories.payments;
    this.scenarios = repositories.scenarios;
    this.settings = repositories.settings;
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(channelId);
      this.channel.onmessage = (message: MessageEvent<ChangeEvent>): void => {
        if (!this.closed) {
          this.dispatch(message.data);
        }
      };
    }
  }

  /** Wraps an open database. Draws the device id (one IdGenerator.newId call) only over an empty database. */
  static async attach(
    deps: DataStoreDeps,
    db: Dexie,
    name: string,
    factory: IDBFactory | undefined,
  ): Promise<DexieDataStore> {
    const meta = db.table<MetaRow, string>('meta');
    const deviceId = await db.transaction('rw', meta, async () => {
      const row = await meta.get(META_KEYS.deviceId);
      if (row !== undefined) {
        return row.value as Uuid;
      }
      const created = deps.ids.newId();
      await meta.put({ key: META_KEYS.deviceId, value: created });
      return created;
    });
    return new DexieDataStore(db, deps.clock, deps.ids, deviceId, channelName(name, factory));
  }

  transaction<R>(work: (tx: DataStoreTransaction) => Promise<R>): Promise<R> {
    return this.run('rw', (scope) =>
      work(
        this.repositories((_mode, op) =>
          scope.done ? Promise.reject(new PersistenceError('CLOSED', 'The transaction has ended')) : op(scope),
        ),
      ),
    );
  }

  exportAll(): Promise<BackupData> {
    return this.run('r', async (scope) => {
      const data: Record<string, StoredRecord[]> = {};
      for (const key of ENTITY_KEYS) {
        data[key] = await scope.table(key).orderBy('[createdAt+id]').toArray();
      }
      return data as unknown as BackupData;
    });
  }

  replaceAll(data: BackupData, options: ReplaceAllOptions): Promise<void> {
    if (this.closed) {
      return Promise.reject(closedError());
    }
    let copy: BackupData;
    try {
      // Cloned at call time so later edits of the caller's object never reach the store.
      copy = structuredClone(data);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return this.run('rw', async (scope) => {
      const parsed = backupDataSchema.safeParse(copy);
      if (!parsed.success) {
        throw new RecordValidationError('dataset', issuesOf(parsed.error));
      }
      const valid = parsed.data as unknown as Readonly<Record<EntityKey, readonly StoredRecord[]>>;
      const localDevice = await scope.table('settings').get(DEVICE_SETTINGS_ID);
      const counted: string[] = [];
      for (const key of ENTITY_KEYS) {
        const incoming = valid[key].filter((record) => !isDeviceSettings(key, record));
        const table = scope.table(key);
        await table.clear();
        await table.bulkPut(incoming);
        if (key === 'settings' && localDevice !== undefined) {
          await table.put(localDevice);
        }
        counted.push(...incoming.map((record) => changeKey(key, record.id)));
      }
      const current = await scope.counters();
      const backedUp = options.backedUpAt !== 'keep';
      scope.setCounters({
        pending: options.pending === 'all' ? new Set(counted) : current.pending,
        sinceBackup: backedUp ? new Set() : current.sinceBackup,
      });
      if (options.backedUpAt !== 'keep') {
        await scope.writeMeta(META_KEYS.lastBackupAt, options.backedUpAt);
      }
      ENTITY_KEYS.forEach((key) => scope.touched.add(key));
      scope.origin = 'replaceAll';
    });
  }

  createSnapshot(): Promise<SnapshotId> {
    return this.run('rw', async (scope) => {
      const stored = await scope.readMeta(META_KEYS.snapshotCounter);
      const counter = (typeof stored === 'number' ? stored : 0) + 1;
      await scope.writeMeta(META_KEYS.snapshotCounter, counter);
      const records: Record<string, StoredRecord[]> = {};
      for (const key of ENTITY_KEYS) {
        records[key] = await scope.table(key).toArray();
      }
      const pending = await scope.readMeta(META_KEYS.pending);
      const sinceBackup = await scope.readMeta(META_KEYS.sinceBackup);
      const row: SnapshotRow = {
        id: `snapshot-${String(counter)}`,
        records: records as unknown as SnapshotRow['records'],
        pending: Array.isArray(pending) ? (pending as string[]) : [],
        sinceBackup: Array.isArray(sinceBackup) ? (sinceBackup as string[]) : [],
        lastSyncAt: ((await scope.readMeta(META_KEYS.lastSyncAt)) as IsoInstant | undefined) ?? null,
        lastBackupAt: ((await scope.readMeta(META_KEYS.lastBackupAt)) as IsoInstant | undefined) ?? null,
      };
      await this.db.table<SnapshotRow, string>('snapshots').put(row);
      return row.id;
    });
  }

  restoreSnapshot(id: SnapshotId): Promise<void> {
    return this.run('rw', async (scope) => {
      const snapshots = this.db.table<SnapshotRow, string>('snapshots');
      const row = await snapshots.get(id);
      if (row === undefined) {
        throw new SnapshotNotFoundError(id);
      }
      for (const key of ENTITY_KEYS) {
        const table = scope.table(key);
        await table.clear();
        await table.bulkPut([...row.records[key]]);
      }
      scope.setCounters({ pending: new Set(row.pending), sinceBackup: new Set(row.sinceBackup) });
      await scope.writeMeta(META_KEYS.lastSyncAt, row.lastSyncAt);
      await scope.writeMeta(META_KEYS.lastBackupAt, row.lastBackupAt);
      await snapshots.delete(id);
      ENTITY_KEYS.forEach((key) => scope.touched.add(key));
      scope.origin = 'restoreSnapshot';
    });
  }

  discardSnapshot(id: SnapshotId): Promise<void> {
    return this.run('rw', async () => {
      await this.db.table<SnapshotRow, string>('snapshots').delete(id);
    });
  }

  subscribe(listener: ChangeListener): Unsubscribe {
    if (this.closed) {
      throw closedError();
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  pendingChanges(): Promise<number> {
    return this.run('r', async (scope) => {
      const stored = await scope.readMeta(META_KEYS.pending);
      return Array.isArray(stored) ? stored.length : 0;
    });
  }

  markSynced(at: IsoInstant): Promise<void> {
    return this.run('rw', async (scope) => {
      await scope.writeMeta(META_KEYS.pending, []);
      await scope.writeMeta(META_KEYS.lastSyncAt, at);
    });
  }

  changesSinceBackup(): Promise<number> {
    return this.run('r', async (scope) => {
      const stored = await scope.readMeta(META_KEYS.sinceBackup);
      return Array.isArray(stored) ? stored.length : 0;
    });
  }

  markBackedUp(at: IsoInstant): Promise<void> {
    return this.run('rw', async (scope) => {
      await scope.writeMeta(META_KEYS.sinceBackup, []);
      await scope.writeMeta(META_KEYS.lastBackupAt, at);
    });
  }

  getMeta(): Promise<DataStoreMeta> {
    return this.run('r', async (scope) => ({
      deviceId: this.deviceId,
      lastSyncAt: ((await scope.readMeta(META_KEYS.lastSyncAt)) as IsoInstant | undefined) ?? null,
      lastBackupAt: ((await scope.readMeta(META_KEYS.lastBackupAt)) as IsoInstant | undefined) ?? null,
    }));
  }

  async close(): Promise<void> {
    if (this.closed) {
      await this.queue;
      return;
    }
    this.closed = true;
    this.listeners.clear();
    await this.queue;
    this.channel?.close();
    this.db.close();
  }

  /** Queues one Dexie transaction; the next one starts when it commits or fails. Notifies after the commit. */
  private run<R>(mode: Mode, op: (scope: TxScope) => Promise<R>): Promise<R> {
    if (this.closed) {
      return Promise.reject(closedError());
    }
    if (this.active !== undefined && !this.active.done && Dexie.currentTransaction === this.active.tx) {
      return Promise.reject(
        new PersistenceError('CLOSED', 'Store-level call inside a transaction; use the tx repositories'),
      );
    }
    const task = this.queue.then(async () => {
      const scope = new TxScope(this.db, this.clock);
      this.active = scope;
      try {
        const result = await this.db.transaction(mode, this.db.tables, async () => {
          scope.tx = Dexie.currentTransaction;
          const value = await op(scope);
          if (mode === 'rw') {
            await scope.flush();
          }
          return value;
        });
        this.publish(scope);
        return result;
      } finally {
        scope.done = true;
        this.active = undefined;
      }
    });
    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private publish(scope: TxScope): void {
    if (scope.touched.size === 0) {
      return;
    }
    const event: ChangeEvent = {
      entities: ENTITY_KEYS.filter((key) => scope.touched.has(key)),
      origin: scope.origin,
    };
    this.channel?.postMessage(event);
    this.dispatch(event);
  }

  /** Listeners always run in a later task, never inside the write that caused the event. */
  private dispatch(event: ChangeEvent): void {
    const targets = [...this.listeners];
    setTimeout(() => {
      for (const listener of targets) {
        if (this.closed || !this.listeners.has(listener)) {
          continue;
        }
        try {
          listener(event);
        } catch (error) {
          queueMicrotask(() => {
            throw error;
          });
        }
      }
    }, 0);
  }

  private repositories(exec: Exec): DataStoreRepositories {
    const visible = (record: StoredRecord, includeDeleted: boolean | undefined): boolean =>
      includeDeleted === true || record.deletedAt === null;

    const repository = (entity: Exclude<EntityKey, 'settings'>): object => ({
      get: (id: Uuid, options?: GetOptions) =>
        exec('r', async (scope) => {
          const record = await scope.table(entity).get(id);
          return record !== undefined && visible(record, options?.includeDeleted) ? record : undefined;
        }),
      list: (options?: ListOptions) =>
        exec('r', (scope) =>
          scope
            .table(entity)
            .orderBy('[createdAt+id]')
            .filter((record) => visible(record, options?.includeDeleted))
            .toArray(),
        ),
      ...(entity === 'loans'
        ? {}
        : {
            listByLoan: (loanId: Uuid, options?: ListOptions) =>
              exec('r', (scope) =>
                scope
                  .table(entity)
                  .where('[loanId+createdAt+id]')
                  .between([loanId, '', ''], [loanId, KEY_MAX, KEY_MAX], true, true)
                  .filter((record) => visible(record, options?.includeDeleted))
                  .toArray(),
              ),
          }),
      create: (input: object) =>
        exec('rw', async (scope) => {
          const stamp = await scope.stamp();
          const candidate = validate(entity, ENTITY_SCHEMAS[entity], {
            ...structuredClone(input),
            id: this.ids.newId(),
            createdAt: stamp,
            updatedAt: stamp,
            updatedByDevice: this.deviceId,
            deletedAt: null,
          });
          await scope.table(entity).put(candidate);
          await scope.markChanged(entity, candidate);
          return structuredClone(candidate);
        }),
      update: (input: { readonly id: Uuid }) =>
        exec('rw', async (scope) => {
          const existing = await scope.table(entity).get(input.id);
          if (existing === undefined || existing.deletedAt !== null) {
            throw new RecordNotFoundError(entity, input.id);
          }
          const candidate = validate(entity, ENTITY_SCHEMAS[entity], {
            ...structuredClone(input),
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: await scope.stamp(existing.updatedAt),
            updatedByDevice: this.deviceId,
            deletedAt: null,
          });
          await scope.table(entity).put(candidate);
          await scope.markChanged(entity, candidate);
          return structuredClone(candidate);
        }),
      delete: (id: Uuid) =>
        exec('rw', async (scope) => {
          const existing = await scope.table(entity).get(id);
          if (existing === undefined) {
            throw new RecordNotFoundError(entity, id);
          }
          if (existing.deletedAt !== null) {
            return existing;
          }
          const stamp = await scope.stamp(existing.updatedAt);
          const tombstone: StoredRecord = {
            ...existing,
            updatedAt: stamp,
            updatedByDevice: this.deviceId,
            deletedAt: stamp,
          };
          await scope.table(entity).put(tombstone);
          await scope.markChanged(entity, tombstone);
          return structuredClone(tombstone);
        }),
    });

    const saveSettings = (id: Uuid, scopeName: 'synced' | 'device', values: object) =>
      exec('rw', async (scope) => {
        const existing = await scope.table('settings').get(id);
        const stamp = await scope.stamp(existing?.updatedAt);
        const candidate = validate('settings', ENTITY_SCHEMAS.settings, {
          ...structuredClone(values),
          id,
          scope: scopeName,
          createdAt: existing?.createdAt ?? stamp,
          updatedAt: stamp,
          updatedByDevice: this.deviceId,
          deletedAt: null,
        });
        await scope.table('settings').put(candidate);
        await scope.markChanged('settings', candidate);
        return structuredClone(candidate);
      });

    const getSettings = (id: Uuid) =>
      exec('r', async (scope) => {
        const record = await scope.table('settings').get(id);
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
