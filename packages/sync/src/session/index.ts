import {
  LATEST_VERSION,
  parseBackup,
  serializeBackup,
  type BackupData,
  type BackupDocument,
  type IsoInstant,
} from '@cuotascasa/schema';
import { decrypt, encrypt, parseEnvelope, serializeEnvelope } from '../crypto/index.ts';
import { mergeDatasets, purgeTombstones } from '../merge/index.ts';
import {
  REMOTE_FILE_NAME,
  REMOTE_PREV_FILE_NAME,
  SYNC_LOCK_NAME,
  SyncError,
  type MergeStats,
  type RemoteFile,
  type StoredKey,
  type SyncOutcome,
  type SyncSession,
  type SyncSessionDeps,
  type SyncStatus,
} from '../ports.ts';

/*
 * Sync session orchestrator (ADR-0008 decision 4, ADR-0009, ADR-0024). It only sequences the frozen ports; every piece
 * of logic (merge, purge, crypto, codec) lives in its own module. Errors and statuses never carry backup content.
 */

export interface SyncSessionOptions {
  /** Written into the uploaded BackupDocument. */
  readonly appVersion: string;
  /** W1-07's test seam: lowest PBKDF2 iteration count accepted from a remote envelope. Only tests pass less. */
  readonly minIterations?: number;
}

const EMPTY_DATASET: BackupData = {
  loans: [],
  events: [],
  reportedBalances: [],
  payments: [],
  scenarios: [],
  settings: [],
};

/** A run that ended with a status instead of an upload. */
class Stop extends Error {
  readonly status: SyncStatus;

  constructor(status: SyncStatus) {
    super('stop');
    this.status = status;
  }
}

/** One pass either finished or asks to start over from the download. */
interface Done {
  readonly kind: 'done';
  readonly stats: MergeStats;
  readonly purged: number;
}
interface Restart {
  readonly kind: 'restart';
}

function sameVersion(a: RemoteFile | null, b: RemoteFile | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.id === b.id && a.version === b.version;
}

export function createSyncSession(deps: SyncSessionDeps, options: SyncSessionOptions): SyncSession {
  const { provider, local, keys, clock, locks } = deps;
  const minIterations = options.minIterations;
  const decryptOptions = minIterations === undefined ? {} : { minIterations };

  let status: SyncStatus = { state: 'disconnected' };
  let inflight: Promise<SyncOutcome> | null = null;
  const listeners = new Set<(next: SyncStatus) => void>();

  function setStatus(next: SyncStatus): void {
    status = next;
    for (const listener of [...listeners]) {
      try {
        listener(next);
      } catch {
        // A faulty listener must not break the run.
      }
    }
  }

  /** Downloads and opens the remote file; throws Stop for decrypt and parse failures. */
  async function readRemote(file: RemoteFile, key: StoredKey): Promise<BackupData> {
    const text = await provider.downloadFile(file);
    const envelope = parseEnvelope(text);
    const plaintext = await decrypt(key, envelope, decryptOptions);
    const parsed = parseBackup(plaintext);
    if (!parsed.ok) {
      const code = parsed.error.code === 'FUTURE_VERSION' ? 'UnsupportedVersion' : 'InvalidRemote';
      throw new SyncError(code);
    }
    return parsed.value.document.data;
  }

  function pass(key: StoredKey, allowRestart: true): Promise<Done | Restart>;
  function pass(key: StoredKey, allowRestart: false): Promise<Done>;
  async function pass(key: StoredKey, allowRestart: boolean): Promise<Done | Restart> {
    const meta = await local.getSyncMeta();
    const lastSyncAt = meta.lastSyncAt;

    const file = await provider.findFile(REMOTE_FILE_NAME);
    const remote = file === null ? EMPTY_DATASET : await readRemote(file, key);

    const current = await local.read();
    const { merged, stats } = mergeDatasets(current, remote);
    const { dataset, purged } = purgeTombstones(merged, lastSyncAt);
    await local.save(dataset);

    const document: BackupDocument = {
      format: 'cuotascasa',
      version: LATEST_VERSION,
      exportedAt: clock.now(),
      deviceId: meta.deviceId,
      appVersion: options.appVersion,
      data: dataset,
    };
    const text = serializeEnvelope(await encrypt(key, serializeBackup(document)));

    if (allowRestart && !sameVersion(file, await provider.findFile(REMOTE_FILE_NAME))) {
      return { kind: 'restart' };
    }
    if (file === null) {
      await provider.createFile(REMOTE_FILE_NAME, text);
    } else {
      await provider.copyFile(file, REMOTE_PREV_FILE_NAME);
      await provider.updateFile(file, text);
    }
    return { kind: 'done', stats, purged };
  }

  async function failureStatus(error: unknown): Promise<SyncStatus | null> {
    if (error instanceof Stop) {
      return error.status;
    }
    if (!(error instanceof SyncError)) {
      return null;
    }
    switch (error.code) {
      case 'NetworkError':
        return { state: 'offline', pendingChanges: (await local.getSyncMeta()).pendingChanges };
      case 'AuthError':
        return { state: 'needs-auth' };
      case 'KeyMismatch':
      case 'WrongPassphraseOrTamper':
        return { state: 'needs-passphrase', reason: error.code };
      case 'UnsupportedVersion':
      case 'WeakParams':
      case 'InvalidRemote':
        return { state: 'error', code: error.code };
    }
  }

  /**
   * One run under the lock. Sync failures resolve as statuses. Storage failures from the local DataStore (read, save,
   * markSynced) are not SyncErrors and reject sync(), because the frozen SyncStatus has no code for them; the status
   * is restored and the single-flight guard released first. Opus will decide on a code later.
   */
  async function run(): Promise<SyncOutcome> {
    try {
      const key = await keys.load();
      if (key === null) {
        throw new Stop({ state: 'needs-passphrase', reason: 'no-key' });
      }
      if (!provider.isAuthorized()) {
        await provider.authorize();
      }
      const first = await pass(key, true);
      const result = first.kind === 'restart' ? await pass(key, false) : first;
      const at: IsoInstant = clock.now();
      await local.markSynced(at);
      const meta = await local.getSyncMeta();
      const done: SyncStatus = { state: 'idle', pendingChanges: meta.pendingChanges, lastSyncAt: meta.lastSyncAt };
      return { status: done, stats: result.stats, purged: result.purged };
    } catch (error) {
      const failed = await failureStatus(error);
      if (failed === null) {
        throw error;
      }
      return { status: failed, stats: null, purged: 0 };
    }
  }

  /**
   * Runs under the cross-tab lock. Runs never overlap across tabs and are never joined: a tab that waited for the
   * lock runs its own full pass after the other finished (idempotent, and it sees that tab's upload). No clock is
   * compared, so a backwards clock or a same-millisecond request can never turn a sync into a no-op.
   */
  function locked(): Promise<SyncOutcome> {
    return locks.request(SYNC_LOCK_NAME, run);
  }

  return {
    /** Resolves with the outcome of every sync failure; rejects on storage failures (see run). */
    sync(): Promise<SyncOutcome> {
      if (inflight !== null) {
        return inflight;
      }
      const previous = status;
      setStatus({ state: 'syncing' });
      const started = locked().then(
        (outcome) => {
          inflight = null;
          setStatus(outcome.status);
          return outcome;
        },
        (error: unknown) => {
          inflight = null;
          setStatus(previous);
          throw error;
        },
      );
      inflight = started;
      return started;
    },
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
