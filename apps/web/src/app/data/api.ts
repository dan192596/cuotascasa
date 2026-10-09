/**
 * Frozen contract between the app (features/, core/) and the data layer (data/) — card W0-05.
 * Only `import type` from the packages (ADR-0010 §5): this file never pulls adapters into a bundle.
 * Implementations: stores W3-11, engine facade W3-12, backup W4-08, sync W4-09, storage health W3-13.
 * Changing it takes an Opus contract micro-card (docs/plan/README.md §5).
 */
import type { Signal } from '@angular/core';
import type {
  AnchorRealDelta,
  ComparisonMetrics,
  ComponentRealDelta,
  Currency,
  DeltaCause,
  DomainError,
  LoanTerms,
  LocalDate,
  Money,
  Paths,
  Schedule,
  ScheduleRow,
  ValidationStatus,
  YearlySubtotal,
} from '@cuotascasa/domain';
import type { NewRecord, RecordUpdate } from '@cuotascasa/persistence';
import type {
  ActualPayment,
  BackupErrorCode,
  DeviceSettingsValues,
  ImportPreview,
  IsoInstant,
  Loan,
  LoanEvent,
  LoanStatus,
  ReportedBalance,
  Result,
  Scenario,
  ThemePreference,
  Uuid,
} from '@cuotascasa/schema';
import type { SyncStatus } from '@cuotascasa/sync';

/* ---------- Errors ---------- */

export const DATA_ERROR_CODES = ['NOT_FOUND', 'VALIDATION', 'CURRENCY_LOCKED', 'STORAGE', 'NOT_IMPLEMENTED'] as const;
export type DataErrorCode = (typeof DATA_ERROR_CODES)[number];

/**
 * Typed rejection of every store write. The UI maps `code` to Spanish text; `message` never carries entity values.
 * NOT_IMPLEMENTED is reserved for the inert W0-05 stubs (their message is the CC_STUB marker).
 */
export class DataError extends Error {
  override readonly name = 'DataError';
  readonly code: DataErrorCode;

  constructor(code: DataErrorCode, message: string = code) {
    super(message);
    this.code = code;
  }
}

/* ---------- Drafts and updates (spec §7; field names from @cuotascasa/schema) ---------- */

export type LoanDraft = NewRecord<Loan>;
export type LoanUpdate = RecordUpdate<Loan>;
export type LoanEventDraft = NewRecord<LoanEvent>;
export type LoanEventUpdate = RecordUpdate<LoanEvent>;
export type ReportedBalanceDraft = NewRecord<ReportedBalance>;
export type ReportedBalanceUpdate = RecordUpdate<ReportedBalance>;
export type ActualPaymentDraft = NewRecord<ActualPayment>;
export type ActualPaymentUpdate = RecordUpdate<ActualPayment>;
export type ScenarioDraft = NewRecord<Scenario>;
export type ScenarioUpdate = RecordUpdate<Scenario>;
/** Anchor of createWithAnchor: the ReportedBalance without loanId (the store fills in the new loan's id). */
export type AnchorDraft = Omit<ReportedBalanceDraft, 'loanId'>;

/* ---------- Stores (W3-11) ---------- */

/** CRUD of one child collection of a loan. Reads are live signals; writes reject with DataError. */
export interface LoanChildStore<T, TDraft, TUpdate> {
  /** False until the first read from the DataStore finished. */
  readonly ready: Signal<boolean>;
  /** Non-deleted records of the loan, ordered by (createdAt, id). */
  listByLoan(loanId: Uuid): Signal<readonly T[]>;
  create(draft: TDraft): Promise<T>;
  update(update: TUpdate): Promise<T>;
  /** Tombstone (deletedAt). */
  delete(id: Uuid): Promise<void>;
}

export interface LoansStore {
  readonly ready: Signal<boolean>;
  /** Non-deleted loans of every status, ordered by (createdAt, id). */
  readonly loans: Signal<readonly Loan[]>;
  /** The non-deleted loan, or undefined. */
  loan(id: Uuid): Signal<Loan | undefined>;
  /** Spec §9 «Asistente»: step 4 left empty creates the loan without a ReportedBalance. */
  create(draft: LoanDraft): Promise<Loan>;
  /** Loan plus its anchor ReportedBalance in one transaction: both records or neither (ADR-0005). */
  createWithAnchor(
    draft: LoanDraft,
    anchor: AnchorDraft,
  ): Promise<{ readonly loan: Loan; readonly anchor: ReportedBalance }>;
  /** Rejects with DataError('CURRENCY_LOCKED') when the currency changes while isCurrencyLocked(id) is true. */
  update(update: LoanUpdate): Promise<Loan>;
  setStatus(id: Uuid, status: LoanStatus): Promise<Loan>;
  /** Tombstones the loan and all its events, reported balances, payments and scenarios in one transaction. */
  delete(id: Uuid): Promise<void>;
  /** True while any non-deleted LoanEvent, ReportedBalance, ActualPayment or Scenario of the loan exists (spec §7). */
  isCurrencyLocked(id: Uuid): Signal<boolean>;
}

export type LoanEventsStore = LoanChildStore<LoanEvent, LoanEventDraft, LoanEventUpdate>;
export type ReportedBalancesStore = LoanChildStore<ReportedBalance, ReportedBalanceDraft, ReportedBalanceUpdate>;
export type PaymentsStore = LoanChildStore<ActualPayment, ActualPaymentDraft, ActualPaymentUpdate>;

export interface ScenariosStore extends LoanChildStore<Scenario, ScenarioDraft, ScenarioUpdate> {
  /** Active scenario of the loan (SyncedSettings.activeScenarioByLoan), or null. */
  activeScenarioId(loanId: Uuid): Signal<Uuid | null>;
  /** Sets the active scenario of the loan, or clears it with null. */
  setActiveScenario(loanId: Uuid, scenarioId: Uuid | null): Promise<void>;
}

export interface SettingsStore {
  readonly ready: Signal<boolean>;
  /** Device-local settings; DEFAULT_DEVICE_SETTINGS_VALUES until the first save. */
  readonly device: Signal<DeviceSettingsValues>;
  saveDevice(values: DeviceSettingsValues): Promise<void>;
  /** device().theme. */
  readonly theme: Signal<ThemePreference>;
  setTheme(theme: ThemePreference): Promise<void>;
}

/* ---------- Engine facade (W3-12): spec §9 «Valores derivados» ---------- */

/** Decimal string with exactly one decimal between '0.0' and '100.0' (spec §9 percentPaid). */
export type PercentString = string;

/** Spec §9 «Estado de validación», applied to the latest ReportedBalance (max k; tie: date, then id). */
export interface LoanValidation {
  /** 'UNVALIDATED' when the loan has no non-deleted ReportedBalance. */
  readonly status: ValidationStatus;
  readonly reportedBalanceId: Uuid | null;
  readonly k: number | null;
  readonly realDelta: Money | null;
  readonly cause: DeltaCause | null;
}

/** Spec §9 «Real Δ por ancla»: the domain AnchorRealDelta plus its traffic light and cause ([ALG.VALIDATE]). */
export interface AnchorDelta extends AnchorRealDelta {
  /** UNVALIDATED (cause null) when the modeled path of [ALG.VALIDATE] does not amortize (Opus ruling, W3-01). */
  readonly status: ValidationStatus;
  readonly cause: DeltaCause | null;
}

/** [ALG.METRICS] metrics of one loan. */
export interface LoanMetrics {
  /** compareSchedules(original, real): what the real events changed (loan detail, W5-01). */
  readonly realVsOriginal: ComparisonMetrics;
  /** compareSchedules(real, scenario) of the active scenario when it has events; otherwise null. */
  readonly activeScenarioVsReal: ComparisonMetrics | null;
}

/** [ALG.YEARLY] subtotals of each path. */
export interface PathYearlySubtotals {
  readonly original: readonly YearlySubtotal[];
  readonly real: readonly YearlySubtotal[];
  readonly scenario: readonly YearlySubtotal[] | null;
}

/**
 * Memoized projection of one loan. Engine errors never throw into templates: they surface in `error`.
 * An error caused only by the active scenario (e.g. one of its events at k ≤ cutoffK, [ALG.PATHS.CUTOFF]) keeps
 * every original and real value: paths() holds original and real with scenario = null, and only
 * activeScenarioEndDate, metrics().activeScenarioVsReal and yearlySubtotals().scenario are null.
 * Any other engine error makes every nullable value null. Values are also null while the stores are not ready.
 * While loading, and after an engine error that is not scenario-only, the non-nullable members keep the inert values
 * (validation { status: 'UNVALIDATED', reportedBalanceId: null, k: null, realDelta: null, cause: null },
 * suggestedPaid false, cutoffK 0, paidInstallments empty, realDeltaPerAnchor and realDeltaPerComponent []);
 * templates read error() first.
 */
export interface LoanProjection {
  readonly loanId: Uuid;
  /** Typed domain error of the last computation (e.g. NegativeAmortizationError), or null. */
  readonly error: Signal<DomainError | null>;
  /** buildPaths output (scenario = the active scenario when it has live events, else null), or null. */
  readonly paths: Signal<Paths | null>;
  readonly metrics: Signal<LoanMetrics | null>;
  readonly yearlySubtotals: Signal<PathYearlySubtotals | null>;
  /** Spec §9 asOf = Clock.today(). */
  readonly asOf: Signal<LocalDate>;
  /** First real-path row with dueDate ≥ asOf; null when there is none (asOf after realEndDate). */
  readonly currentInstallment: Signal<ScheduleRow | null>;
  /** Opening balance of the current installment; '0.00' without current installment; null on error or loading. */
  readonly balance: Signal<Money | null>;
  /** (principal − balance) / principal × 100, HALF_UP to 1 decimal, clamped to 0–100; null on error or loading. */
  readonly percentPaid: Signal<PercentString | null>;
  /** `total` of the current installment (fixed charges included); null without current installment. */
  readonly nextInstallmentTotal: Signal<Money | null>;
  /** endDate of the real path ([ALG.METRICS]). */
  readonly realEndDate: Signal<LocalDate | null>;
  /** endDate of the active scenario when it has events; never replaces realEndDate. */
  readonly activeScenarioEndDate: Signal<LocalDate | null>;
  readonly validation: Signal<LoanValidation>;
  /** asOf > realEndDate, or the latest ReportedBalance is '0.00'. Only a suggestion: the user changes the status. */
  readonly suggestedPaid: Signal<boolean>;
  /** [ALG.PATHS.CUTOFF] over the non-deleted real records; 0 without any. Rows with k ≤ cutoffK are read-only. */
  readonly cutoffK: Signal<number>;
  /** Per-row paid flags: the k of every real-path row with paid = true ([ALG.ACTUAL]). */
  readonly paidInstallments: Signal<ReadonlySet<number>>;
  /** Spec §9 «Real Δ por ancla», one entry per non-deleted ReportedBalance. */
  readonly realDeltaPerAnchor: Signal<readonly AnchorDelta[]>;
  /** Spec §9 «Real Δ por componente», one entry per ActualPayment with breakdown. */
  readonly realDeltaPerComponent: Signal<readonly ComponentRealDelta[]>;
}

/**
 * Spec §9 «Totales por moneda»: over non-deleted active loans; GTQ and USD are never added together. A loan whose
 * balance is null (engine error or loading) is left out of loanCount and of both sums; a null nextInstallmentTotal
 * (no current installment) adds nothing.
 */
export interface CurrencyTotals {
  readonly currency: Currency;
  readonly loanCount: number;
  /** Σ balance. */
  readonly balance: Money;
  /** Σ nextInstallmentTotal. */
  readonly nextInstallmentTotal: Money;
}

/** One compared scenario (W5-05). */
export interface ScenarioComparisonEntry {
  readonly scenarioId: Uuid;
  readonly name: string;
  readonly schedule: Schedule;
  /** compareSchedules(real, scenario). */
  readonly metrics: ComparisonMetrics;
}

/** Original, real and up to 3 scenarios of one loan (spec §9 «Proyecciones»). */
export interface ScenarioComparison {
  readonly original: Schedule;
  readonly real: Schedule;
  readonly scenarios: readonly ScenarioComparisonEntry[];
  /** Compared scenarios whose events no longer compute (e.g. an event at k ≤ cutoffK); they are not in scenarios. */
  readonly failed: readonly { readonly scenarioId: Uuid; readonly error: DomainError }[];
}

/** A real-data record about to be written: new (draft) or a new version of an existing one (update, with its id). */
export type RealRecordWrite =
  | { readonly entity: 'ReportedBalance'; readonly record: ReportedBalanceDraft | ReportedBalanceUpdate }
  | { readonly entity: 'ActualPayment'; readonly record: ActualPaymentDraft | ActualPaymentUpdate }
  | { readonly entity: 'LoanEvent'; readonly record: LoanEventDraft | LoanEventUpdate };

export interface LoanProjectionService {
  /** Clock.today() as LocalDate. */
  readonly asOf: Signal<LocalDate>;
  /** Memoized per loan id: the same id returns the same LoanProjection. */
  forLoan(loanId: Uuid): LoanProjection;
  /** One entry per currency present among the active loans, GTQ first. */
  readonly totalsByCurrency: Signal<readonly CurrencyTotals[]>;
  /**
   * At most 3 scenario ids; null only while loading or when original/real fail; a scenario whose events no longer
   * compute goes to failed.
   */
  compareScenarios(loanId: Uuid, scenarioIds: readonly Uuid[]): Signal<ScenarioComparison | null>;
  /**
   * Dry run before a real-data write (HU-10: a RateChange that leaves the installment below the financial charge is
   * shown and not saved): the typed engine error the real path would raise with `write` applied (an update replaces the
   * record with its id), or null. Never writes and never changes forLoan()'s values.
   */
  checkRealWrite(loanId: Uuid, write: RealRecordWrite): DomainError | null;
  /**
   * The facade's entity → domain mapping, for previews of an unsaved loan (wizard steps 3 and 4, W4-07). Throws the
   * domain's InvalidInputError for an invalid draft: callers validate first or catch.
   */
  toLoanTerms(loan: LoanDraft): LoanTerms;
}

/* ---------- Backup (W4-08, ADR-0007) ---------- */

export interface BackupFile {
  /** cuotascasa-respaldo-YYYY-MM-DD.json */
  readonly fileName: string;
  readonly blob: Blob;
  readonly encrypted: boolean;
}

export type BackupImportErrorCode = BackupErrorCode | 'PASSPHRASE_REQUIRED' | 'WRONG_PASSPHRASE';

export interface BackupImportError {
  readonly code: BackupImportErrorCode;
  readonly message: string;
}

/** A parsed, migrated and validated file waiting for confirmation. Nothing has been written yet. */
export interface PendingImport {
  readonly id: string;
  readonly preview: ImportPreview;
  readonly encrypted: boolean;
}

export interface ImportReceipt {
  /** Restores the pre-import snapshot until the next write or 10 minutes, whichever comes first. */
  readonly undoToken: string;
}

export interface BackupService {
  readonly lastBackupAt: Signal<IsoInstant | null>;
  readonly changesSinceBackup: Signal<number>;
  /** Single source of the reminder rule (ADR-0007): > 30 days since lastBackupAt or > 20 changes since backup. */
  readonly reminderDue: Signal<boolean>;
  /** Plain JSON, or the encrypted envelope when a passphrase is given; marks the backup. */
  exportJson(options?: { readonly passphrase?: string }): Promise<BackupFile>;
  /** parse → migrate → validate → preview. Never writes. */
  previewImport(
    file: Blob,
    options?: { readonly passphrase?: string },
  ): Promise<Result<PendingImport, BackupImportError>>;
  /** snapshot → replaceAll in one transaction. */
  confirmImport(pendingId: string): Promise<ImportReceipt>;
  cancelImport(pendingId: string): void;
  undoImport(undoToken: string): Promise<void>;
}

/* ---------- Sync (W4-09, ADR-0008) ---------- */

export interface SyncService {
  /** False when the build-time Google client ID is empty: status is then { state: 'not-configured' }. */
  readonly configured: Signal<boolean>;
  readonly status: Signal<SyncStatus>;
  /** Spanish status text, e.g. 'No configurado' or 'Cambios sin sincronizar (3)'. */
  readonly statusText: Signal<string>;
  /** Consent popup; call only from a user gesture. Loads the Drive module on demand. */
  connect(): Promise<void>;
  /** First passphrase on this device (salt from the remote envelope when it exists). */
  setPassphrase(passphrase: string): Promise<void>;
  changePassphrase(passphrase: string): Promise<void>;
  /** User-initiated sync session. */
  sync(): Promise<void>;
  /** Revokes the token and forgets it. */
  disconnect(): Promise<void>;
}

/* ---------- Storage health (W3-13, ADR-0017) ---------- */

export interface StorageEstimateView {
  readonly usageBytes: number;
  readonly quotaBytes: number;
}

export interface StorageHealth {
  /** navigator.storage.persisted(); null while unknown or unsupported. */
  readonly persisted: Signal<boolean | null>;
  readonly estimate: Signal<StorageEstimateView | null>;
  /** Safari running in a tab, not as an installed app (ITP can erase data). */
  readonly safariNonStandalone: Signal<boolean>;
  /** The single entry point to navigator.storage.persist(); at most once per session. Resolves with the result. */
  requestPersist(): Promise<boolean>;
}
