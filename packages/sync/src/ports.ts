import type { BackupData, BaseRecord, IsoInstant, Uuid } from '@cuotascasa/schema';

/**
 * Frozen sync contracts (ADR-0008, ADR-0009, ADR-0024). Implementations: merge/ (W1-06), crypto/ (W1-07),
 * session/ (W2-08), google-drive/ (W2-09). The Google fakes in testing/ implement the Drive and GIS subsets below.
 */

/* ---------- Dataset and local side ---------- */

/**
 * What is merged and saved locally: the backup `data` shape, tombstones included. The uploaded plaintext wraps it in a
 * BackupDocument (see SyncSession).
 */
export type SyncDataset = BackupData;

export interface LocalSyncMeta {
  readonly deviceId: Uuid;
  /** Previous successful sync, read at session start (ADR-0008 decision 4); null before the first one. */
  readonly lastSyncAt: IsoInstant | null;
  readonly pendingChanges: number;
}

/** The local store as the session sees it; data/ adapts DataStore to it (W4-09). */
export interface LocalDataset {
  /** DataStore.exportAll(). */
  read(): Promise<SyncDataset>;
  /** DataStore.replaceAll(dataset, { pending: 'keep', backedUpAt: 'keep' }). */
  save(dataset: SyncDataset): Promise<void>;
  getSyncMeta(): Promise<LocalSyncMeta>;
  /** DataStore.markSynced(at); called only after a successful upload. */
  markSynced(at: IsoInstant): Promise<void>;
}

/* ---------- Merge order, merge and purge ---------- */

/**
 * Total order of two versions of one record (ADR-0024): later updatedAt wins; equal updatedAt -> greater
 * updatedByDevice wins; full tie -> the tombstone wins; still tied -> greater canonical JSON wins.
 */
export interface RecordOrderKey {
  readonly updatedAt: IsoInstant;
  readonly updatedByDevice: Uuid;
  readonly isTombstone: boolean;
}

export function recordOrderKey(record: BaseRecord): RecordOrderKey {
  return {
    updatedAt: record.updatedAt,
    updatedByDevice: record.updatedByDevice,
    isTombstone: record.deletedAt !== null,
  };
}

/** JSON with object keys sorted recursively; the last tie-break of the record order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function compareStrings(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** < 0 when `a` loses to `b`, > 0 when `a` wins, 0 only for identical versions. Pure, total and antisymmetric. */
export function compareRecordOrder(a: BaseRecord, b: BaseRecord): number {
  const byTime = compareStrings(a.updatedAt, b.updatedAt);
  if (byTime !== 0) {
    return byTime;
  }
  const byDevice = compareStrings(a.updatedByDevice, b.updatedByDevice);
  if (byDevice !== 0) {
    return byDevice;
  }
  const aTombstone = a.deletedAt !== null;
  const bTombstone = b.deletedAt !== null;
  if (aTombstone !== bTombstone) {
    return aTombstone ? 1 : -1;
  }
  return compareStrings(canonicalJson(a), canonicalJson(b));
}

export interface MergeStats {
  /** Records whose merged version is the local one (local-only, local wins or identical versions). */
  readonly fromLocal: number;
  /** Records whose merged version is the remote one and differs from local (remote-only or remote wins). */
  readonly fromRemote: number;
  /** Merged records with deletedAt !== null. */
  readonly tombstones: number;
}

export interface MergeResult {
  readonly merged: SyncDataset;
  readonly stats: MergeStats;
}

/**
 * Pure LWW merge per record with compareRecordOrder (W1-06): for each collection and id, `merged` holds the greatest
 * version, so it is commutative, idempotent and associative, with no duplicate ids. The synced settings record merges
 * like any record. Device settings records are dropped from both inputs and never appear in `merged`; the local one
 * survives because DataStore.replaceAll keeps it (ADR-0024).
 */
export type MergeDatasets = (local: SyncDataset, remote: SyncDataset) => MergeResult;

/** 90 days in milliseconds: 90 × 86 400 000 (ADR-0008 decision 4). */
export const TOMBSTONE_RETENTION_MS = 90 * 86_400_000;

export interface PurgeResult {
  readonly dataset: SyncDataset;
  readonly purged: number;
}

/**
 * Pure purge with the single rule of ADR-0008 decision 4, applied after merging and before saving and uploading.
 * It removes whole tombstoned records only and never edits a record's content (Scenario.events[].deletedAt stay):
 * content changed without a new stamp would break ADR-0024's order.
 */
export type PurgeTombstones = (dataset: SyncDataset, lastSyncAt: IsoInstant | null) => PurgeResult;

/* ---------- Errors and status ---------- */

export const SYNC_ERROR_CODES = [
  'NetworkError',
  'AuthError',
  'KeyMismatch',
  'WrongPassphraseOrTamper',
  'UnsupportedVersion',
  'WeakParams',
  'InvalidRemote',
] as const;
export type SyncErrorCode = (typeof SYNC_ERROR_CODES)[number];

/** Typed sync failure. The message is the code unless a caller passes a fixed English sentence; never plaintext data. */
export class SyncError extends Error {
  readonly code: SyncErrorCode;

  constructor(code: SyncErrorCode, message: string = code) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
  }
}

/** UI state of sync (ADR-0008 decision 6); data/sync (W4-09) maps it to Spanish text. */
export type SyncStatus =
  | { readonly state: 'not-configured' }
  | { readonly state: 'disconnected' }
  | { readonly state: 'idle'; readonly pendingChanges: number; readonly lastSyncAt: IsoInstant | null }
  | { readonly state: 'syncing' }
  | { readonly state: 'offline'; readonly pendingChanges: number }
  | { readonly state: 'needs-auth' }
  | { readonly state: 'needs-passphrase'; readonly reason: 'no-key' | 'KeyMismatch' | 'WrongPassphraseOrTamper' }
  | { readonly state: 'error'; readonly code: 'UnsupportedVersion' | 'WeakParams' | 'InvalidRemote' };

/* ---------- Encryption (ADR-0009) ---------- */

export const ENVELOPE_FORMAT = 'cuotascasa-enc';
/** Production PBKDF2 iteration count; envelopes below it are rejected before decrypting (WeakParams). */
export const PBKDF2_ITERATIONS = 600_000;

/** Encrypted envelope v1. Binary fields are base64url; the header is bound as AAD (W1-07). No other field exists. */
export interface EncryptedEnvelopeV1 {
  readonly format: typeof ENVELOPE_FORMAT;
  readonly v: 1;
  readonly kdf: { readonly name: 'PBKDF2-SHA256'; readonly iterations: number; readonly salt: string };
  readonly cipher: { readonly name: 'AES-256-GCM'; readonly iv: string };
  readonly ct: string;
}

/** Non-extractable AES-GCM key derived on this device, with the base64url salt it came from. */
export interface StoredKey {
  readonly key: CryptoKey;
  readonly saltId: string;
  readonly iterations: number;
}

/** IndexedDB key store (W1-07). Never persists the passphrase or raw key bytes. */
export interface KeyStore {
  load(): Promise<StoredKey | null>;
  save(entry: StoredKey): Promise<void>;
  clear(): Promise<void>;
}

/* ---------- Remote side ---------- */

export const REMOTE_FILE_NAME = 'cuotascasa.json';
export const REMOTE_PREV_FILE_NAME = 'cuotascasa.prev.json';
export type RemoteFileName = typeof REMOTE_FILE_NAME | typeof REMOTE_PREV_FILE_NAME;

export interface RemoteFile {
  readonly id: string;
  readonly name: RemoteFileName;
  readonly modifiedTime: string;
  readonly version: string;
}

/**
 * Cloud storage port; v1 has one implementation, Google Drive appDataFolder (W2-09).
 * Every method rejects with SyncError('AuthError') on 401, on a 403 other than a rate limit, or without a live token,
 * and with SyncError('NetworkError') on a fetch failure, a 5xx, a 429, a 403 rateLimitExceeded/userRateLimitExceeded,
 * or any other non-2xx answer (400, 404, …), so the next user-initiated sync starts over.
 */
export interface SyncProvider {
  /** First authorization with the consent popup; call only from a user gesture. */
  connect(): Promise<void>;
  /** True while an unexpired access token is held in memory. */
  isAuthorized(): boolean;
  /** Re-requests a token with prompt '' when it expired; call only inside a user-initiated sync. */
  authorize(): Promise<void>;
  /** Revokes the token with google.accounts.oauth2.revoke and forgets it. */
  disconnect(): Promise<void>;
  /**
   * Returns the file named `name` in appDataFolder, or null; when several share the name, the one with the smallest id
   * (string order), so every device converges on one file.
   */
  findFile(name: RemoteFileName): Promise<RemoteFile | null>;
  downloadFile(file: RemoteFile): Promise<string>;
  createFile(name: RemoteFileName, content: string): Promise<RemoteFile>;
  updateFile(file: RemoteFile, content: string): Promise<RemoteFile>;
  /**
   * Leaves exactly one file named `name` with `file`'s content: files.update on an existing one, else files.copy
   * (drive-api-subset.md §5).
   */
  copyFile(file: RemoteFile, name: RemoteFileName): Promise<RemoteFile>;
}

/* ---------- Session (W2-08) ---------- */

export const SYNC_LOCK_NAME = 'cuotascasa-sync';

/** The subset of the Web Locks API the session uses; tests pass a fake. */
export interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export interface SyncClock {
  now(): IsoInstant;
}

export interface SyncSessionDeps {
  readonly provider: SyncProvider;
  readonly local: LocalDataset;
  readonly keys: KeyStore;
  readonly clock: SyncClock;
  readonly locks: LockManagerLike;
}

export interface SyncOutcome {
  readonly status: SyncStatus;
  readonly stats: MergeStats | null;
  readonly purged: number;
}

/**
 * One user-initiated run (ADR-0008 decision 4): download -> decrypt -> merge -> purge -> save -> encrypt -> upload
 * (previous remote kept as cuotascasa.prev.json) -> markSynced. Concurrent calls coalesce into one run, also across
 * tabs (SYNC_LOCK_NAME).
 * - sync() resolves with the outcome, failures included (offline, needs-auth, needs-passphrase, error); it rejects
 *   only on a programming error.
 * - The envelope's plaintext is serializeBackup(BackupDocument) whose data is the merged, purged dataset. A download
 *   goes through parseBackup (validation and migrations): FUTURE_VERSION gives { state: 'error', code:
 *   'UnsupportedVersion' }; a remote file that is not an envelope, or any other parseBackup failure, gives
 *   { state: 'error', code: 'InvalidRemote' }. Decrypt and parse failures end the run before saving: nothing is saved
 *   or uploaded. A failed upload skips markSynced (ADR-0008 decision 4).
 * - Without a remote file the remote side is the empty dataset (mergeDatasets(local, empty)), so device settings never
 *   leave the device (ADR-0024, decision 4).
 * - LocalDataset.read() runs after download and decrypt, right before merging, and save() right after purging, with
 *   no network call in between.
 * - Right before uploading, the run re-reads the remote file's version (ADR-0008 decision 5, best effort): if it
 *   changed since the download, the run starts over from the download once; on the second pass it uploads.
 */
export interface SyncSession {
  sync(): Promise<SyncOutcome>;
  getStatus(): SyncStatus;
  subscribe(listener: (status: SyncStatus) => void): () => void;
}

/* ---------- Google subsets (docs/specs/drive-api-subset.md) ---------- */

export const DRIVE_API_ORIGIN = 'https://www.googleapis.com';
export const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
export const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const DRIVE_APPDATA_FOLDER = 'appDataFolder';

export type DriveOperation =
  'files.list' | 'files.get.media' | 'files.create.multipart' | 'files.update.multipart' | 'files.copy';

/** Drive v3 File resource, limited to the fields this app requests with `fields`. */
export interface DriveFile {
  readonly kind?: 'drive#file';
  readonly id: string;
  readonly name: string;
  readonly mimeType?: string;
  readonly modifiedTime?: string;
  readonly version?: string;
  readonly parents?: readonly string[];
}

export interface DriveFileList {
  readonly kind?: 'drive#fileList';
  readonly files: readonly DriveFile[];
  readonly nextPageToken?: string;
}

/** First part of a multipart create. */
export interface DriveCreateMetadata {
  readonly name: string;
  readonly parents: readonly ['appDataFolder'];
  readonly mimeType?: string;
}

/** First part of a multipart update (may be empty). */
export interface DriveUpdateMetadata {
  readonly name?: string;
  readonly mimeType?: string;
}

/** JSON body of files.copy. */
export interface DriveCopyRequest {
  readonly name?: string;
  readonly parents?: readonly ['appDataFolder'];
}

export interface DriveErrorDetail {
  readonly domain: string;
  readonly reason: string;
  readonly message: string;
  readonly location?: string;
  readonly locationType?: string;
}

export interface DriveErrorResponse {
  readonly error: { readonly code: number; readonly message: string; readonly errors: readonly DriveErrorDetail[] };
}

export interface GisTokenSuccess {
  readonly access_token: string;
  /** Seconds. GIS sends a number; @types/google.accounts declares string, so providers coerce with Number(). */
  readonly expires_in: number;
  readonly scope: string;
  readonly token_type: 'Bearer';
}

export interface GisTokenFailure {
  readonly error: string;
  readonly error_description?: string;
}

export type GisTokenResponse = GisTokenSuccess | GisTokenFailure;

export interface GisClientError {
  readonly type: 'unknown' | 'popup_closed' | 'popup_failed_to_open';
  readonly message: string;
}

export interface GisTokenClientConfig {
  readonly client_id: string;
  readonly scope: string;
  readonly callback: (response: GisTokenResponse) => void;
  readonly error_callback?: (error: GisClientError) => void;
  readonly prompt?: '' | 'none' | 'consent' | 'select_account';
}

export interface GisOverridableConfig {
  readonly prompt?: '' | 'none' | 'consent' | 'select_account';
  readonly scope?: string;
}

export interface GisTokenClient {
  requestAccessToken(overrides?: GisOverridableConfig): void;
}

/** google.accounts.oauth2, token model subset. */
export interface GisOAuth2 {
  initTokenClient(config: GisTokenClientConfig): GisTokenClient;
  revoke(accessToken: string, done?: () => void): void;
}
