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
import type { CryptoModuleShape, DriveModuleShape, SyncOptions } from './sync-options.ts';
import { syncStatusText } from './sync-status-text.ts';

/**
 * Drive sync service (ADR-0008, ADR-0009, ADR-0024). Everything that touches Google is created on demand:
 * - Construction and reading `status()` / `statusText()` load nothing and contact no one.
 * - `prepare()` imports the Drive module, the crypto and the session, builds the provider and loads the GIS script.
 *   It contacts Google, so the UI calls it ONLY after an explicit user action to connect (never on screen load); the
 *   connect screen then offers a second button that calls `connect()`.
 * - `connect()` is gesture-safe (the consent popup opens inside the click) only after `prepare()` resolved.
 * - The access token lives in the provider's closure; the passphrase is never stored (only the non-extractable key).
 */

const DEFAULT_APP_VERSION = '1.0.0';
const PASSPHRASE_RETRIES = 3;
const BUSY_TEXT = 'Otro dispositivo está sincronizando; inténtalo de nuevo';
const OFFLINE_TEXT = 'Sin conexión con Drive';

interface Runtime {
  readonly provider: SyncProvider;
  readonly keys: KeyStore;
  readonly session: SyncSession;
  readonly crypto: CryptoModuleShape;
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
  readonly loadCryptoModule: () => Promise<CryptoModuleShape>;
}

/** The remote kept changing under a passphrase change; shown with its own text, not as 'offline'. */
class RemoteBusyError extends Error {}

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
  private readonly notice = signal<string | null>(null);
  private readonly deps: DriveSyncDeps;
  private runtime: Runtime | null = null;
  private runtimeLoad: Promise<Runtime> | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private destroyed = false;
  /** True between a successful connect() and disconnect(). */
  private connected = false;
  /** Bumped by disconnect(): session emissions of an older generation are ignored. */
  private generation = 0;
  private sessionGeneration = -1;

  constructor(deps: DriveSyncDeps) {
    this.deps = deps;
    const isConfigured = deps.clientId !== '';
    this.configured = signal(isConfigured).asReadonly();
    this.mutableStatus = signal<SyncStatus>(isConfigured ? { state: 'disconnected' } : { state: 'not-configured' });
    this.status = this.mutableStatus.asReadonly();
    this.statusText = computed(() => this.notice() ?? syncStatusText(this.mutableStatus()));
    if (isConfigured) {
      void this.restoreIntent();
    }
  }

  /** Releases the DataStore subscription. */
  destroy(): void {
    this.destroyed = true;
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
  }

  /**
   * Loads the Drive module and the GIS script ahead of the connect click, so connect() reaches requestAccessToken
   * inside the gesture. Contacts Google: call it only after the user explicitly chose to connect. Does nothing when
   * sync is not configured. Never rejects: a failed preload is retried by connect().
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

  /**
   * Consent popup. Gesture-safe only after prepare() resolved: with a prepared runtime nothing is awaited before
   * requestAccessToken, so the popup opens inside the user's click. A token still valid skips the consent prompt.
   */
  async connect(): Promise<void> {
    this.requireConfigured();
    const gen = this.generation;
    const previous = this.mutableStatus();
    let runtime: Runtime;
    try {
      runtime = this.runtime ?? (await this.ensureRuntime());
      if (!runtime.provider.isAuthorized()) {
        await runtime.provider.connect();
      }
    } catch (error) {
      if (!this.connected && error instanceof SyncError && error.code === 'NetworkError') {
        // Not connected: 'offline' would claim pending changes of a session that never started. Keep the state.
        this.setStatusIf(gen, previous, OFFLINE_TEXT);
        return;
      }
      await this.applyFailure(error, gen);
      return;
    }
    if (gen !== this.generation) {
      return; // disconnect() ran while the popup was pending: stay disconnected.
    }
    this.connected = true;
    await this.setIntent(true);
    await this.afterAuthorized(runtime, gen);
  }

  async setPassphrase(passphrase: string): Promise<void> {
    const runtime = this.requireConnected();
    this.requirePassphrase(passphrase);
    const gen = this.generation;
    const previous = this.mutableStatus();
    const authorizing = this.authorizeIfNeeded(runtime);
    try {
      await authorizing;
      await this.deps.locks.request(SYNC_LOCK_NAME, () => this.deriveForRemote(runtime, passphrase));
    } catch (error) {
      if (
        error instanceof SyncError &&
        error.code === 'WrongPassphraseOrTamper' &&
        previous.state !== 'needs-passphrase' &&
        (await this.hasKey(runtime))
      ) {
        // The device was not waiting for a passphrase and already has a working key: a mistyped one changes nothing.
        // (In 'needs-passphrase' the failure is reported, so the user sees that the new passphrase was wrong.)
        this.setStatusIf(gen, previous);
        return;
      }
      await this.applyFailure(error, gen);
      return;
    }
    await this.refreshIdle(gen);
  }

  async changePassphrase(passphrase: string): Promise<void> {
    const runtime = this.requireConnected();
    this.requirePassphrase(passphrase);
    const gen = this.generation;
    const previous = this.mutableStatus();
    const authorizing = this.authorizeIfNeeded(runtime);
    try {
      await authorizing;
      await this.deps.locks.request(SYNC_LOCK_NAME, () => this.rotateKey(runtime, passphrase));
    } catch (error) {
      if (error instanceof RemoteBusyError) {
        // Nothing changed locally or remotely: keep what the user was seeing and explain.
        this.setStatusIf(gen, previous, BUSY_TEXT);
        return;
      }
      await this.applyFailure(error, gen);
      return;
    }
    await this.refreshIdle(gen);
  }

  async sync(): Promise<void> {
    const runtime = this.requireConnected();
    const gen = this.generation;
    // A renewed token needs a popup, so it is requested here, before any other await, inside the user's click.
    const authorizing = this.authorizeIfNeeded(runtime);
    try {
      await authorizing;
    } catch (error) {
      await this.applyFailure(error, gen);
      return;
    }
    await this.runSession(runtime);
  }

  async disconnect(): Promise<void> {
    const runtime = this.runtime;
    // Bump first, then publish the final state once and synchronously: every in-flight operation holds an older
    // generation, so nothing it does after an await can overwrite it.
    this.generation += 1;
    this.connected = false;
    this.setStatus({ state: 'disconnected' });
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

  /** The runtime of a connected service; otherwise the status is left as it is and the call is rejected. */
  private requireConnected(): Runtime {
    this.requireConfigured();
    if (this.runtime === null || !this.connected) {
      throw new DataError('VALIDATION', 'SYNC_NOT_CONNECTED');
    }
    return this.runtime;
  }

  private requirePassphrase(passphrase: string): void {
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      throw new DataError('VALIDATION', 'PASSPHRASE_EMPTY');
    }
  }

  private setStatus(next: SyncStatus, notice: string | null = null): void {
    this.notice.set(notice);
    this.mutableStatus.set(next);
  }

  /** Every status write that follows an await goes through here: a disconnect() in between wins. */
  private setStatusIf(gen: number, next: SyncStatus, notice: string | null = null): void {
    if (gen === this.generation) {
      this.setStatus(next, notice);
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
    const { options, clientId, store, clock, locks, loadDriveModule, loadCryptoModule } = this.deps;
    let modules: readonly [DriveModuleShape, CryptoModuleShape, typeof import('@cuotascasa/sync/session')];
    try {
      modules = await Promise.all([loadDriveModule(), loadCryptoModule(), import('@cuotascasa/sync/session')]);
    } catch {
      throw new SyncError('NetworkError');
    }
    const [drive, crypto, sessionModule] = modules;
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
      if (this.connected && this.sessionGeneration === this.generation) {
        this.setStatus(next);
      }
    });
    const runtime: Runtime = { provider, keys, session, crypto, loadGis };
    this.runtime = runtime;
    store.then(
      (opened) => {
        if (this.destroyed) {
          return;
        }
        this.unsubscribeStore = opened.subscribe(() => {
          void this.refreshPending();
        });
      },
      () => undefined,
    );
    return runtime;
  }

  /** Starts the authorization popup when the token is missing or expired; a no-op while it is valid. */
  private authorizeIfNeeded(runtime: Runtime): Promise<void> {
    return runtime.provider.isAuthorized() ? Promise.resolve() : runtime.provider.authorize();
  }

  private async hasKey(runtime: Runtime): Promise<boolean> {
    try {
      return (await runtime.keys.load()) !== null;
    } catch {
      return false;
    }
  }

  /* ---------- status ---------- */

  private async afterAuthorized(runtime: Runtime, gen: number): Promise<void> {
    try {
      const key = await runtime.keys.load();
      if (key === null) {
        this.setStatusIf(gen, { state: 'needs-passphrase', reason: 'no-key' });
        return;
      }
    } catch (error) {
      throw this.storageError(error);
    }
    await this.refreshIdle(gen);
  }

  private async refreshIdle(gen: number): Promise<void> {
    const meta = await createLocalDataset(this.deps.store).getSyncMeta();
    this.setStatusIf(gen, { state: 'idle', pendingChanges: meta.pendingChanges, lastSyncAt: meta.lastSyncAt });
  }

  /** Keeps the pending-changes count of 'idle' and 'offline' current while the user edits. */
  private async refreshPending(): Promise<void> {
    const current = this.mutableStatus();
    if (current.state !== 'idle' && current.state !== 'offline') {
      return;
    }
    const gen = this.generation;
    try {
      const meta = await createLocalDataset(this.deps.store).getSyncMeta();
      if (gen !== this.generation) {
        return;
      }
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
  private async applyFailure(error: unknown, gen: number): Promise<void> {
    if (!(error instanceof SyncError)) {
      throw this.storageError(error);
    }
    switch (error.code) {
      case 'NetworkError': {
        const meta = await createLocalDataset(this.deps.store).getSyncMeta();
        this.setStatusIf(gen, { state: 'offline', pendingChanges: meta.pendingChanges });
        return;
      }
      case 'AuthError':
        this.setStatusIf(gen, { state: 'needs-auth' });
        return;
      case 'KeyMismatch':
      case 'WrongPassphraseOrTamper':
        this.setStatusIf(gen, { state: 'needs-passphrase', reason: error.code });
        return;
      case 'UnsupportedVersion':
      case 'WeakParams':
      case 'InvalidRemote':
        this.setStatusIf(gen, { state: 'error', code: error.code });
        return;
    }
  }

  private storageError(error: unknown): DataError {
    return error instanceof DataError ? error : new DataError('STORAGE', 'SYNC_STORAGE_FAILURE');
  }

  /* ---------- sync ---------- */

  private async runSession(runtime: Runtime): Promise<void> {
    this.sessionGeneration = this.generation;
    const before = this.mutableStatus();
    try {
      await runtime.session.sync();
    } catch (error) {
      // The session restores ITS previous status, which is not ours: put back what the user was seeing.
      if (this.connected && this.sessionGeneration === this.generation) {
        this.setStatus(before);
      }
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

  /** True when the current remote file opens with `key` (used to resolve an ambiguous upload). */
  private async remoteOpensWith(runtime: Runtime, key: StoredKey): Promise<boolean> {
    try {
      const file = await runtime.provider.findFile(REMOTE_FILE_NAME);
      if (file === null) {
        return false;
      }
      const envelope = runtime.crypto.parseEnvelope(await runtime.provider.downloadFile(file));
      await runtime.crypto.decrypt(key, envelope, { minIterations: this.minIterations });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * ADR-0009 decision 6 and D25. Decrypts the remote with the current key, re-encrypts with a key from the new
   * passphrase and a new salt, uploads (previous remote kept as cuotascasa.prev.json) and only then saves the new key.
   * If the remote changed while the key was derived, the pass repeats (3 passes at most, then RemoteBusyError).
   * - A NetworkError from the upload is ambiguous: the remote is re-read once with findFile. If rotated.key opens it,
   *   the new key is saved; otherwise (including when that re-read fails too, the device being offline) the old key
   *   stays, and if the upload did land the next sync() reports KeyMismatch and asks for the new passphrase.
   * - A keys.save failure after the upload is retried once, and only if the remote opens with the new key; a second
   *   failure rejects and leaves the old key, with the same KeyMismatch outcome on the next sync().
   * Without a remote file there is nothing to re-encrypt.
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
      try {
        await provider.copyFile(file, REMOTE_PREV_FILE_NAME);
        await provider.updateFile(file, crypto.serializeEnvelope(rotated.envelope));
      } catch (error) {
        if (
          error instanceof SyncError &&
          error.code === 'NetworkError' &&
          (await this.remoteOpensWith(runtime, rotated.key))
        ) {
          await keys.save(rotated.key);
          return;
        }
        throw error;
      }
      try {
        await keys.save(rotated.key);
      } catch (error) {
        if (await this.remoteOpensWith(runtime, rotated.key)) {
          await keys.save(rotated.key);
          return;
        }
        throw error;
      }
      return;
    }
    throw new RemoteBusyError();
  }

  /* ---------- intent (driveSyncEnabled, device-local) ---------- */

  /** After a reload the token is gone: a device that had Drive on shows 'needs-auth' without contacting Google. */
  private async restoreIntent(): Promise<void> {
    const gen = this.generation;
    try {
      const device = await (await this.deps.store).settings.getDevice();
      if (device?.driveSyncEnabled === true && this.mutableStatus().state === 'disconnected') {
        this.setStatusIf(gen, { state: 'needs-auth' });
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
