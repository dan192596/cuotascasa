import type { IsoInstant } from '@cuotascasa/schema';
import {
  SyncError,
  type KeyStore,
  type LocalDataset,
  type LocalSyncMeta,
  type LockManagerLike,
  type RemoteFile,
  type RemoteFileName,
  type StoredKey,
  type SyncClock,
  type SyncDataset,
  type SyncErrorCode,
  type SyncProvider,
} from '../../ports.ts';

/** Test-only fakes for the session: in-memory provider, local dataset, key store, lock manager and clock. */

export type ProviderMethod = 'authorize' | 'findFile' | 'downloadFile' | 'createFile' | 'updateFile' | 'copyFile';

interface StoredRemote {
  id: string;
  name: RemoteFileName;
  content: string;
  version: number;
}

export interface FakeProvider extends SyncProvider {
  /** Every provider call, in order, as `method` or `method:name`. */
  readonly calls: string[];
  /** Makes the next call of `method` reject with a SyncError of `code`. */
  failNext(method: ProviderMethod, code: SyncErrorCode): void;
  /** Runs after each downloadFile, before it returns (simulates another device writing). */
  onDownload: (() => void) | null;
  content(name: RemoteFileName): string | undefined;
  /** Writes a file as another device would, bumping its version. */
  writeRemote(name: RemoteFileName, content: string): void;
  setAuthorized(value: boolean): void;
}

export function createFakeProvider(
  options: { readonly authorized?: boolean; readonly log?: string[] } = {},
): FakeProvider {
  const files = new Map<RemoteFileName, StoredRemote>();
  const failures = new Map<ProviderMethod, SyncErrorCode>();
  const calls = options.log ?? [];
  let authorized = options.authorized ?? true;
  let nextId = 1;

  const toRemote = (file: StoredRemote): RemoteFile => ({
    id: file.id,
    name: file.name,
    modifiedTime: '2026-10-01T00:00:00.000Z',
    version: String(file.version),
  });
  const enter = (method: ProviderMethod, detail?: string): void => {
    calls.push(detail === undefined ? method : `${method}:${detail}`);
    const code = failures.get(method);
    if (code !== undefined) {
      failures.delete(method);
      throw new SyncError(code);
    }
  };
  const write = (name: RemoteFileName, content: string): StoredRemote => {
    const existing = files.get(name);
    if (existing === undefined) {
      const created = { id: `file-${String(nextId++).padStart(3, '0')}`, name, content, version: 1 };
      files.set(name, created);
      return created;
    }
    existing.content = content;
    existing.version += 1;
    return existing;
  };

  const provider: FakeProvider = {
    calls,
    onDownload: null,
    failNext: (method, code) => void failures.set(method, code),
    content: (name) => files.get(name)?.content,
    writeRemote: (name, content) => void write(name, content),
    setAuthorized: (value) => {
      authorized = value;
    },
    connect: () => Promise.resolve(),
    isAuthorized: () => authorized,
    authorize: () => {
      try {
        enter('authorize');
      } catch (error) {
        return Promise.reject(error as Error);
      }
      authorized = true;
      return Promise.resolve();
    },
    disconnect: () => Promise.resolve(),
    findFile: (name) => {
      try {
        enter('findFile', name);
      } catch (error) {
        return Promise.reject(error as Error);
      }
      const file = files.get(name);
      return Promise.resolve(file === undefined ? null : toRemote(file));
    },
    downloadFile: (file) => {
      try {
        enter('downloadFile', file.name);
      } catch (error) {
        return Promise.reject(error as Error);
      }
      const content = files.get(file.name)?.content ?? '';
      provider.onDownload?.();
      return Promise.resolve(content);
    },
    // Leniencies fixed to mirror Drive: createFile never overwrites an existing name, and updating or copying a file
    // that is not there rejects like a Drive 404 (NetworkError). The copy target is overwritten on purpose: it models
    // SyncProvider.copyFile ("leaves exactly one file named `name`").
    createFile: (name, content) => {
      try {
        enter('createFile', name);
        if (files.has(name)) {
          throw new Error(`fake provider: createFile would overwrite ${name}`);
        }
      } catch (error) {
        return Promise.reject(error as Error);
      }
      return Promise.resolve(toRemote(write(name, content)));
    },
    updateFile: (file, content) => {
      try {
        enter('updateFile', file.name);
        if (!files.has(file.name)) {
          throw new SyncError('NetworkError');
        }
      } catch (error) {
        return Promise.reject(error as Error);
      }
      return Promise.resolve(toRemote(write(file.name, content)));
    },
    copyFile: (file, name) => {
      try {
        enter('copyFile', name);
        if (!files.has(file.name)) {
          throw new SyncError('NetworkError');
        }
      } catch (error) {
        return Promise.reject(error as Error);
      }
      return Promise.resolve(toRemote(write(name, files.get(file.name)?.content ?? '')));
    },
  };
  return provider;
}

export interface FakeLocal extends LocalDataset {
  dataset: SyncDataset;
  meta: LocalSyncMeta;
  readonly log: string[];
  /** Number of save() calls. */
  saves: number;
  /** Number of read() calls. */
  reads: number;
  syncedAt: IsoInstant[];
}

export function createFakeLocal(dataset: SyncDataset, meta: LocalSyncMeta, log: string[] = []): FakeLocal {
  const local: FakeLocal = {
    dataset,
    meta,
    log,
    saves: 0,
    reads: 0,
    syncedAt: [],
    read: () => {
      local.reads += 1;
      log.push('local.read');
      return Promise.resolve(local.dataset);
    },
    save: (next) => {
      local.saves += 1;
      log.push('local.save');
      local.dataset = next;
      return Promise.resolve();
    },
    getSyncMeta: () => Promise.resolve(local.meta),
    markSynced: (at) => {
      log.push('local.markSynced');
      local.syncedAt.push(at);
      local.meta = { ...local.meta, lastSyncAt: at, pendingChanges: 0 };
      return Promise.resolve();
    },
  };
  return local;
}

export function createMemoryKeyStore(initial: StoredKey | null = null): KeyStore & { current: StoredKey | null } {
  const store = {
    current: initial,
    load: () => Promise.resolve(store.current),
    save: (entry: StoredKey) => {
      store.current = entry;
      return Promise.resolve();
    },
    clear: () => {
      store.current = null;
      return Promise.resolve();
    },
  };
  return store;
}

/** Mutex per name, shared by every session that receives the same instance (two "tabs"). */
export function createFakeLocks(): LockManagerLike & { readonly requests: string[] } {
  const tails = new Map<string, Promise<unknown>>();
  const requests: string[] = [];
  return {
    requests,
    request: <T>(name: string, callback: () => Promise<T>): Promise<T> => {
      requests.push(name);
      const previous = tails.get(name) ?? Promise.resolve();
      const run = previous.then(callback, callback);
      tails.set(
        name,
        run.catch(() => undefined),
      );
      return run;
    },
  };
}

export function createFakeClock(start: IsoInstant): SyncClock & { current: IsoInstant } {
  const clock = {
    current: start,
    now: () => clock.current,
  };
  return clock;
}
