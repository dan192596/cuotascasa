import type {
  ActualPayment,
  BackupData,
  BaseRecord,
  DeviceSettings,
  DeviceSettingsValues,
  EntityKey,
  IsoInstant,
  Loan,
  LoanEvent,
  LocalDate,
  ReportedBalance,
  Scenario,
  SyncedSettings,
  SyncedSettingsValues,
  Uuid,
} from '@cuotascasa/schema';

/**
 * Frozen persistence ports (ADR-0006). Adapters (memory W1-04, Dexie W1-05) implement DataStore and must pass
 * runDataStoreContract unchanged. Every behaviour below is pinned by a case in contract/cases.ts.
 */

/** Injectable time source. The domain never reads it; data/ uses today() as asOf (spec §9). */
export interface Clock {
  /** Current instant, exactly Date.prototype.toISOString() format (ISO 8601 UTC with milliseconds). */
  now(): IsoInstant;
  /** Today's date in the device's local time zone, 'YYYY-MM-DD'. Persistence never calls it. */
  today(): LocalDate;
}

/** Injectable id source; production uses crypto.randomUUID() (W3-10). */
export interface IdGenerator {
  newId(): Uuid;
}

/** Fields the store owns: callers never send them on create, and only send `id` on update. */
export type StampField = 'id' | 'createdAt' | 'updatedAt' | 'updatedByDevice' | 'deletedAt';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Input of Repository.create: the record without id and stamps. */
export type NewRecord<T extends BaseRecord> = DistributiveOmit<T, StampField>;

/** Input of Repository.update: the full user fields plus the id of an existing, non-deleted record. */
export type RecordUpdate<T extends BaseRecord> = DistributiveOmit<T, Exclude<StampField, 'id'>>;

export interface GetOptions {
  /** Return the record even when it is a tombstone. Default false. */
  readonly includeDeleted?: boolean;
}

export interface ListOptions {
  /** Include tombstones. Default false. */
  readonly includeDeleted?: boolean;
}

/**
 * CRUD over one entity collection. Writes validate the stamped record with its @cuotascasa/schema schema
 * and reject with RecordValidationError without writing. Reads return copies and writes copy their input: no object
 * that crosses the port, at any depth, is shared with the store. get() of a missing id resolves undefined.
 * list() order is (createdAt ascending, then id ascending).
 */
export interface Repository<T extends BaseRecord> {
  get(id: Uuid, options?: GetOptions): Promise<T | undefined>;
  list(options?: ListOptions): Promise<T[]>;
  /** Assigns id = IdGenerator.newId(), createdAt = updatedAt = stamp, updatedByDevice = deviceId, deletedAt = null. */
  create(input: NewRecord<T>): Promise<T>;
  /** Replaces the user fields; keeps id and createdAt; new stamp; RecordNotFoundError when missing or deleted. */
  update(input: RecordUpdate<T>): Promise<T>;
  /** Tombstone: deletedAt = updatedAt = new stamp. Missing id: RecordNotFoundError. Already deleted: no-op. */
  delete(id: Uuid): Promise<T>;
}

/** Repository of a loan's child collection (events, reported balances, payments, scenarios). */
export interface LoanChildRepository<T extends BaseRecord & { readonly loanId: Uuid }> extends Repository<T> {
  /** Records of one loan, same order and tombstone rule as list(). */
  listByLoan(loanId: Uuid, options?: ListOptions): Promise<T[]>;
}

export type LoanRepository = Repository<Loan>;
export type LoanEventRepository = LoanChildRepository<LoanEvent>;
export type ReportedBalanceRepository = LoanChildRepository<ReportedBalance>;
export type ActualPaymentRepository = LoanChildRepository<ActualPayment>;
export type ScenarioRepository = LoanChildRepository<Scenario>;

/**
 * The two settings records have fixed ids (SYNCED_SETTINGS_ID, DEVICE_SETTINGS_ID).
 * Synced writes count as changes; device writes never count in pendingChanges or changesSinceBackup.
 */
export interface SettingsRepository {
  getSynced(): Promise<SyncedSettings | undefined>;
  /** Creates the synced record on first save, then updates it in place (createdAt kept, new stamp). */
  saveSynced(values: SyncedSettingsValues): Promise<SyncedSettings>;
  getDevice(): Promise<DeviceSettings | undefined>;
  /** Creates the device record on first save, then updates it in place (createdAt kept, new stamp). */
  saveDevice(values: DeviceSettingsValues): Promise<DeviceSettings>;
}

export interface DataStoreRepositories {
  readonly loans: LoanRepository;
  readonly events: LoanEventRepository;
  readonly reportedBalances: ReportedBalanceRepository;
  readonly payments: ActualPaymentRepository;
  readonly scenarios: ScenarioRepository;
  readonly settings: SettingsRepository;
}

/**
 * Repositories bound to one transaction. Inside `work`, await only calls on `tx`
 * (Dexie commits a transaction when it awaits anything else). They follow every rule of the store-level repositories
 * (validation, stamps, tombstones, ordering, copies, settings) and see the transaction's own writes.
 */
export type DataStoreTransaction = DataStoreRepositories;

export type EntityName = EntityKey;

export interface DataStoreMeta {
  /**
   * Drawn with IdGenerator.newId() when the store is created over an empty database, before any other id; stable for
   * the life of the store; stamps updatedByDevice.
   */
  readonly deviceId: Uuid;
  /** Instant of the last successful sync (markSynced), or null. */
  readonly lastSyncAt: IsoInstant | null;
  /** Instant of the last backup (markBackedUp or replaceAll backedUpAt), or null. */
  readonly lastBackupAt: IsoInstant | null;
}

export type ChangeOrigin = 'write' | 'replaceAll' | 'restoreSnapshot';

export interface ChangeEvent {
  /** Touched collections, deduplicated, in ENTITY_KEYS order. */
  readonly entities: readonly EntityName[];
  readonly origin: ChangeOrigin;
}

export type ChangeListener = (event: ChangeEvent) => void;
export type Unsubscribe = () => void;

/** Opaque snapshot handle. */
export type SnapshotId = string;

export interface ReplaceAllOptions {
  /** 'all': every replaced record (except device settings) becomes pending; 'keep': pending set unchanged. */
  readonly pending: 'all' | 'keep';
  /** An instant: lastBackupAt = it and changesSinceBackup = 0; 'keep': both unchanged. */
  readonly backedUpAt: IsoInstant | 'keep';
}

/**
 * The persistence port. Stamps are monotonic per device: each write's stamp is strictly greater than the
 * device's previous stamp and than the written record's current updatedAt, even when the clock repeats or
 * goes backwards (+1 ms). Listeners run asynchronously, once per committed write or transaction, never on failure.
 * Writes and transactions are serialized: a transaction never interleaves with another write or transaction, so
 * concurrent calls lose nothing.
 */
export interface DataStore extends DataStoreRepositories {
  /** Runs `work` atomically: all writes commit together or none; one notification after commit; returns work's result. */
  transaction<R>(work: (tx: DataStoreTransaction) => Promise<R>): Promise<R>;
  /** Every record of every collection, tombstones and device settings included, each ordered by (createdAt, id). */
  exportAll(): Promise<BackupData>;
  /**
   * Replaces all records in one transaction keeping their stamps intact (ADR-0007 decision 6). Validates with
   * backupDataSchema first (RecordValidationError, nothing written). Incoming device settings are ignored and
   * the local device settings record is kept. Counters follow `options`; lastSyncAt never changes.
   */
  replaceAll(data: BackupData, options: ReplaceAllOptions): Promise<void>;
  /** Captures every record, the pending and since-backup sets, lastSyncAt and lastBackupAt. */
  createSnapshot(): Promise<SnapshotId>;
  /** Restores exactly what createSnapshot captured, in one transaction, then deletes the snapshot. Unknown id: SnapshotNotFoundError. */
  restoreSnapshot(id: SnapshotId): Promise<void>;
  /** Deletes a snapshot; unknown id is a no-op. */
  discardSnapshot(id: SnapshotId): Promise<void>;
  subscribe(listener: ChangeListener): Unsubscribe;
  /** Number of distinct records (device settings excluded) written since the last markSynced. */
  pendingChanges(): Promise<number>;
  /** lastSyncAt = at and pendingChanges = 0. */
  markSynced(at: IsoInstant): Promise<void>;
  /** Number of distinct records (device settings excluded) written since the last markBackedUp. */
  changesSinceBackup(): Promise<number>;
  /** lastBackupAt = at and changesSinceBackup = 0. */
  markBackedUp(at: IsoInstant): Promise<void>;
  getMeta(): Promise<DataStoreMeta>;
  /** Releases resources; afterwards every call rejects with PersistenceError code 'CLOSED'. */
  close(): Promise<void>;
}

export interface DataStoreDeps {
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/** How the contract suite and data/providers (W3-10) build a store. */
export type DataStoreFactory = (deps: DataStoreDeps) => Promise<DataStore>;

export type PersistenceErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'SNAPSHOT_NOT_FOUND' | 'CLOSED';

export interface ValidationIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;

  constructor(code: PersistenceErrorCode, message: string) {
    super(message);
    this.name = 'PersistenceError';
    this.code = code;
  }
}

export class RecordNotFoundError extends PersistenceError {
  readonly entity: EntityName;
  readonly id: string;

  constructor(entity: EntityName, id: string) {
    super('NOT_FOUND', `No live record ${id} in ${entity}`);
    this.name = 'RecordNotFoundError';
    this.entity = entity;
    this.id = id;
  }
}

export class RecordValidationError extends PersistenceError {
  readonly target: EntityName | 'dataset';
  readonly issues: readonly ValidationIssue[];

  constructor(target: EntityName | 'dataset', issues: readonly ValidationIssue[]) {
    super('VALIDATION', `Invalid ${target}: ${issues.map((issue) => issue.path.map(String).join('.')).join(', ')}`);
    this.name = 'RecordValidationError';
    this.target = target;
    this.issues = issues;
  }
}

export class SnapshotNotFoundError extends PersistenceError {
  readonly snapshotId: SnapshotId;

  constructor(snapshotId: SnapshotId) {
    super('SNAPSHOT_NOT_FOUND', `No snapshot ${snapshotId}`);
    this.name = 'SnapshotNotFoundError';
    this.snapshotId = snapshotId;
  }
}
