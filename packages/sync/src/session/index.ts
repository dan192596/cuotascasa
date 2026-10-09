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
type Pass =
  { readonly kind: 'done'; readonly stats: MergeStats; readonly purged: number } | { readonly kind: 'restart' };

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

  async function pass(key: StoredKey, allowRestart: boolean): Promise<Pass> {
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

  async function run(): Promise<SyncOutcome> {
    try {
      const key = await keys.load();
      if (key === null) {
        throw new Stop({ state: 'needs-passphrase', reason: 'no-key' });
      }
      if (!provider.isAuthorized()) {
        await provider.authorize();
      }
      let result = await pass(key, true);
      if (result.kind === 'restart') {
        result = await pass(key, false);
      }
      if (result.kind === 'restart') {
        throw new Error('unreachable: the second pass never restarts');
      }
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
   * Runs under the cross-tab lock. A tab that waited for the lock while another tab finished a successful run (its
   * lastSyncAt is at or after this request) joins that run instead of repeating it.
   */
  async function locked(requestedAt: IsoInstant): Promise<SyncOutcome> {
    return locks.request(SYNC_LOCK_NAME, async () => {
      const meta = await local.getSyncMeta();
      if (meta.lastSyncAt !== null && meta.lastSyncAt >= requestedAt) {
        const joined: SyncStatus = { state: 'idle', pendingChanges: meta.pendingChanges, lastSyncAt: meta.lastSyncAt };
        return { status: joined, stats: null, purged: 0 };
      }
      return run();
    });
  }

  return {
    sync(): Promise<SyncOutcome> {
      if (inflight !== null) {
        return inflight;
      }
      const previous = status;
      setStatus({ state: 'syncing' });
      const started = locked(clock.now()).then(
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
