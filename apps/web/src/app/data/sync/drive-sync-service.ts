import { computed, signal, type Signal } from '@angular/core';
import type { DataStore } from '@cuotascasa/persistence';
import {
  PBKDF2_ITERATIONS,
  REMOTE_FILE_NAME,
  REMOTE_PREV_FILE_NAME,
  SYNC_LOCK_NAME,
  SyncError,
  type GisOAuth2,
  type KeyStore,
  type LockManagerLike,
  type StoredKey,
  type SyncClock,
  type SyncProvider,
  type SyncSession,
  type SyncStatus,
} from '@cuotascasa/sync';
import { DataError, type SyncService } from '../api.ts';
import { createLocalDataset } from './local-dataset.ts';
import type { DriveModuleShape, SyncOptions } from './sync-options.ts';
import { syncStatusText } from './sync-status-text.ts';

/**
 * Drive sync service (ADR-0008, ADR-0009, ADR-0024). Everything that touches Google is created on demand:
 * - `ensureRuntime()` imports the Drive module, the crypto and the session and builds the provider. It contacts no one.
 * - `prepare()` additionally loads the GIS script, so a later `connect()` click only has to call requestAccessToken
 *   (WebKit opens the consent popup only inside the user gesture). The connect screen calls it when it becomes visible.
 * - The access token lives in the provider's closure; the passphrase is never stored (only the non-extractable key).
 */

const DEFAULT_APP_VERSION = '1.0.0';
const PASSPHRASE_RETRIES = 3;

interface Runtime {
  readonly provider: SyncProvider;
  readonly keys: KeyStore;
  readonly session: SyncSession;
  readonly crypto: typeof import('@cuotascasa/sync/crypto');
  /** The memoized GIS loader the provider uses, so a preload and the provider share one script load. */
  readonly loadGis: () => Promise<GisOAuth2>;
}

export interface DriveSyncDeps {
  readonly options: SyncOptions;
  readonly clientId: string;
  readonly store: Promise<DataStore>;
  readonly clock: SyncClock;
  readonly locks: LockManagerLike;
  readonly loadDriveModule: () => Promise<DriveModuleShape>;
}

function memoize<T>(load: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;
  return () => {
    if (cached === null) {
      const attempt = load();
      cached = attempt;
      attempt.catch(() => {
        cached = null;
      });
    }
    return cached;
  };
}

export class DriveSyncService implements SyncService {
  readonly configured: Signal<boolean>;
  readonly status: Signal<SyncStatus>;
  readonly statusText: Signal<string>;

  private readonly mutableStatus: ReturnType<typeof signal<SyncStatus>>;
  private readonly deps: DriveSyncDeps;
  private runtime: Runtime | null = null;
  private runtimeLoad: Promise<Runtime> | null = null;
  private unsubscribeStore: (() => void) | null = null;

  constructor(deps: DriveSyncDeps) {
    this.deps = deps;
    const isConfigured = deps.clientId !== '';
    this.configured = signal(isConfigured).asReadonly();
    this.mutableStatus = signal<SyncStatus>(isConfigured ? { state: 'disconnected' } : { state: 'not-configured' });
    this.status = this.mutableStatus.asReadonly();
    this.statusText = computed(() => syncStatusText(this.mutableStatus()));
    if (isConfigured) {
      void this.restoreIntent();
    }
  }

  /** Releases the DataStore subscription. */
  destroy(): void {
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
  }

  /**
   * Called when the connect screen becomes visible: loads the Drive module and the GIS script ahead of the click so
   * that connect() reaches requestAccessToken inside the gesture. Does nothing when sync is not configured. Never
   * rejects: a failed preload is retried by connect().
   */
  async prepare(): Promise<void> {
    if (!this.configured()) {
      return;
    }
    try {
      const runtime = await this.ensureRuntime();
      await runtime.loadGis();
    } catch {
      // connect() retries and reports the failure.
    }
  }

  async connect(): Promise<void> {
    this.requireConfigured();
    // With a prepared runtime nothing is awaited before provider.connect(): the popup opens inside the user gesture.
    const runtime = this.runtime ?? (await this.ensureRuntime());
    try {
      await runtime.provider.connect();
    } catch (error) {
      await this.applyFailure(error);
      return;
    }
    await this.setIntent(true);
    await this.afterAuthorized(runtime);
  }

  async setPassphrase(passphrase: string): Promise<void> {
    const runtime = this.requireConnected();
    this.requirePassphrase(passphrase);
    const authorizing = this.authorizeIfNeeded(runtime);
    try {
      await authorizing;
      await this.deps.locks.request(SYNC_LOCK_NAME, () => this.deriveForRemote(runtime, passphrase));
    } catch (error) {
      await this.applyFailure(error);
      return;
    }
    await this.refreshIdle();
  }

  async changePassphrase(passphrase: string): Promise<void> {
    const runtime = this.requireConnected();
    this.requirePassphrase(passphrase);
    const authorizing = this.authorizeIfNeeded(runtime);
    try {
      await authorizing;
      await this.deps.locks.request(SYNC_LOCK_NAME, () => this.rotateKey(runtime, passphrase));
    } catch (error) {
      await this.applyFailure(error);
      return;
    }
    await this.refreshIdle();
  }

  async sync(): Promise<void> {
    this.requireConfigured();
    const runtime = this.runtime;
    if (runtime === null) {
      // Nothing connected in this page load (for example after a reload): connect first.
      await this.connect();
      if (this.runtime === null || this.mutableStatus().state !== 'idle') {
        return;
      }
      await this.runSession(this.runtime);
      return;
    }
    // A renewed token needs a popup, so it is requested here, before any other await, inside the user's click.
    const authorizing = this.authorizeIfNeeded(runtime);
    try {
      await authorizing;
    } catch (error) {
      await this.applyFailure(error);
      return;
    }
    await this.runSession(runtime);
  }

  async disconnect(): Promise<void> {
    const runtime = this.runtime;
    this.mutableStatus.set({ state: 'disconnected' });
    if (runtime !== null) {
      await runtime.provider.disconnect();
    }
    await this.setIntent(false);
  }

  /* ---------- runtime ---------- */

  private requireConfigured(): void {
    if (!this.configured()) {
      throw new DataError('VALIDATION', 'SYNC_NOT_CONFIGURED');
    }
  }

  private requireConnected(): Runtime {
    this.requireConfigured();
    if (this.runtime === null) {
      throw new DataError('VALIDATION', 'SYNC_NOT_CONNECTED');
    }
    return this.runtime;
  }

  private requirePassphrase(passphrase: string): void {
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      throw new DataError('VALIDATION', 'PASSPHRASE_EMPTY');
    }
  }

  private ensureRuntime(): Promise<Runtime> {
    if (this.runtimeLoad === null) {
      const attempt = this.createRuntime();
      this.runtimeLoad = attempt;
      attempt.catch(() => {
        this.runtimeLoad = null;
      });
    }
    return this.runtimeLoad;
  }

  private async createRuntime(): Promise<Runtime> {
    const { options, clientId, store, clock, locks, loadDriveModule } = this.deps;
    const [drive, crypto, sessionModule] = await Promise.all([
      loadDriveModule(),
      import('@cuotascasa/sync/crypto'),
      import('@cuotascasa/sync/session'),
    ]);
    const loadGis = memoize(options.loadGis ?? drive.createGisLoader());
    const provider = drive.createGoogleDriveProvider({
      clientId,
      loadGis,
      fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
      now: options.nowMs ?? (() => Date.now()),
    });
    const keys = crypto.createIndexedDbKeyStore({ indexedDB: options.indexedDb });
    const session = sessionModule.createSyncSession(
      { provider, local: createLocalDataset(store), keys, clock, locks },
      {
        appVersion: options.appVersion ?? DEFAULT_APP_VERSION,
        ...(options.minIterations === undefined ? {} : { minIterations: options.minIterations }),
      },
    );
    session.subscribe((next) => {
      this.mutableStatus.set(next);
    });
    const runtime: Runtime = { provider, keys, session, crypto, loadGis };
    this.runtime = runtime;
    void store.then((opened) => {
      this.unsubscribeStore = opened.subscribe(() => {
        void this.refreshPending();
      });
    });
    return runtime;
  }

  /** Starts the authorization popup when the token is missing or expired; a no-op while it is valid. */
  private authorizeIfNeeded(runtime: Runtime): Promise<void> {
    return runtime.provider.isAuthorized() ? Promise.resolve() : runtime.provider.authorize();
  }

  /* ---------- status ---------- */

  private async afterAuthorized(runtime: Runtime): Promise<void> {
    try {
      const key = await runtime.keys.load();
      if (key === null) {
        this.mutableStatus.set({ state: 'needs-passphrase', reason: 'no-key' });
        return;
      }
    } catch (error) {
      throw this.storageError(error);
    }
    await this.refreshIdle();
  }

  private async refreshIdle(): Promise<void> {
    const meta = await createLocalDataset(this.deps.store).getSyncMeta();
    this.mutableStatus.set({ state: 'idle', pendingChanges: meta.pendingChanges, lastSyncAt: meta.lastSyncAt });
  }

  /** Keeps the pending-changes count of 'idle' and 'offline' current while the user edits. */
  private async refreshPending(): Promise<void> {
    const current = this.mutableStatus();
    if (current.state !== 'idle' && current.state !== 'offline') {
      return;
    }
    try {
      const meta = await createLocalDataset(this.deps.store).getSyncMeta();
      const latest = this.mutableStatus();
      if (latest.state === 'idle') {
        this.mutableStatus.set({ ...latest, pendingChanges: meta.pendingChanges });
      } else if (latest.state === 'offline') {
        this.mutableStatus.set({ state: 'offline', pendingChanges: meta.pendingChanges });
      }
    } catch {
      // The count is cosmetic; the next sync reports storage failures.
    }
  }

  /** SyncErrors become statuses (the session does the same); anything else is a storage failure. */
  private async applyFailure(error: unknown): Promise<void> {
    if (!(error instanceof SyncError)) {
      throw this.storageError(error);
    }
    switch (error.code) {
      case 'NetworkError': {
        const meta = await createLocalDataset(this.deps.store).getSyncMeta();
        this.mutableStatus.set({ state: 'offline', pendingChanges: meta.pendingChanges });
        return;
      }
      case 'AuthError':
        this.mutableStatus.set({ state: 'needs-auth' });
        return;
      case 'KeyMismatch':
      case 'WrongPassphraseOrTamper':
        this.mutableStatus.set({ state: 'needs-passphrase', reason: error.code });
        return;
      case 'UnsupportedVersion':
      case 'WeakParams':
      case 'InvalidRemote':
        this.mutableStatus.set({ state: 'error', code: error.code });
        return;
    }
  }

  private storageError(error: unknown): DataError {
    return error instanceof DataError ? error : new DataError('STORAGE', 'SYNC_STORAGE_FAILURE');
  }

  /* ---------- sync ---------- */

  private async runSession(runtime: Runtime): Promise<void> {
    try {
      await runtime.session.sync();
    } catch (error) {
      throw this.storageError(error);
    }
  }

  /* ---------- passphrase ---------- */

  private get minIterations(): number {
    return this.deps.options.minIterations ?? PBKDF2_ITERATIONS;
  }

  private get newIterations(): number {
    return this.deps.options.iterations ?? PBKDF2_ITERATIONS;
  }

  /**
   * First passphrase on this device. With a remote file the key must use the envelope's salt and iterations, and the
   * passphrase is proven by opening the file before the key is saved; without one the salt is new.
   */
  private async deriveForRemote(runtime: Runtime, passphrase: string): Promise<void> {
    const { provider, keys, crypto } = runtime;
    const file = await provider.findFile(REMOTE_FILE_NAME);
    let stored: StoredKey;
    if (file === null) {
      stored = await crypto.deriveStoredKey(passphrase, { iterations: this.newIterations });
    } else {
      const envelope = crypto.parseEnvelope(await provider.downloadFile(file));
      if (envelope.kdf.iterations < this.minIterations) {
        throw new SyncError('WeakParams');
      }
      stored = await crypto.deriveStoredKey(passphrase, {
        saltId: envelope.kdf.salt,
        iterations: envelope.kdf.iterations,
      });
      await crypto.decrypt(stored, envelope, { minIterations: this.minIterations });
    }
    await keys.save(stored);
  }

  /**
   * ADR-0009 decision 6 and D25. Decrypts the remote with the current key, re-encrypts with a key from the new
   * passphrase and a new salt, uploads (previous remote kept as cuotascasa.prev.json) and only then saves the new key.
   * If the remote changed while the key was derived, the pass repeats. Without a remote file there is nothing to
   * re-encrypt: the new key is saved directly.
   */
  private async rotateKey(runtime: Runtime, passphrase: string): Promise<void> {
    const { provider, keys, crypto } = runtime;
    const current = await keys.load();
    if (current === null) {
      throw new SyncError('KeyMismatch');
    }
    for (let attempt = 0; attempt < PASSPHRASE_RETRIES; attempt += 1) {
      const file = await provider.findFile(REMOTE_FILE_NAME);
      if (file === null) {
        await keys.save(await crypto.deriveStoredKey(passphrase, { iterations: this.newIterations }));
        return;
      }
      const envelope = crypto.parseEnvelope(await provider.downloadFile(file));
      const rotated = await crypto.changePassphrase(current, envelope, passphrase, {
        iterations: this.newIterations,
        minIterations: this.minIterations,
      });
      const latest = await provider.findFile(REMOTE_FILE_NAME);
      if (latest === null || latest.id !== file.id || latest.version !== file.version) {
        continue;
      }
      await provider.copyFile(file, REMOTE_PREV_FILE_NAME);
      await provider.updateFile(file, crypto.serializeEnvelope(rotated.envelope));
      await keys.save(rotated.key);
      return;
    }
    throw new SyncError('NetworkError');
  }

  /* ---------- intent (driveSyncEnabled, device-local) ---------- */

  /** After a reload the token is gone: a device that had Drive on shows 'needs-auth' without contacting Google. */
  private async restoreIntent(): Promise<void> {
    try {
      const device = await (await this.deps.store).settings.getDevice();
      if (device?.driveSyncEnabled === true && this.mutableStatus().state === 'disconnected') {
        this.mutableStatus.set({ state: 'needs-auth' });
      }
    } catch {
      // Leave 'disconnected'.
    }
  }

  private async setIntent(enabled: boolean): Promise<void> {
    try {
      const store = await this.deps.store;
      await store.transaction(async (tx) => {
        const current = await tx.settings.getDevice();
        if (current?.driveSyncEnabled === enabled) {
          return;
        }
        await tx.settings.saveDevice({ theme: current?.theme ?? 'system', driveSyncEnabled: enabled });
      });
    } catch {
      // The flag only seeds the status after a reload; a failed write never blocks connecting.
    }
  }
}
