import { DestroyRef, type EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import { type Clock, type DataStore, type IdGenerator, PersistenceError } from '@cuotascasa/persistence';
import {
  type BackupDocument,
  type BackupData,
  LATEST_VERSION,
  type IsoInstant,
  parseBackup,
  type Result,
  serializeBackup,
} from '@cuotascasa/schema';
import { PBKDF2_ITERATIONS, SyncError } from '@cuotascasa/sync';
import {
  type BackupFile,
  type BackupImportError,
  type BackupImportErrorCode,
  type BackupService,
  DataError,
  type ImportReceipt,
  type PendingImport,
} from '../api.ts';
import { CLOCK, DATA_STORE, ID_GENERATOR } from '../data-layer.tokens.ts';
import { BACKUP_SERVICE } from '../tokens.ts';
import { BACKUP_IMPORT_MESSAGES } from './backup-messages.ts';
import { BackupState } from './backup-state.ts';

/** Version written to the `appVersion` field of a backup (informational). */
export const APP_VERSION = '1.0.0';
/** ADR-0007 decision 5: the snapshot is discarded after 10 minutes. */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;
/** A previewed import (it holds the decrypted data) is forgotten after this long. */
export const PENDING_WINDOW_MS = 10 * 60 * 1000;

export interface BackupOptions {
  /** Test seam: PBKDF2 iterations of an encrypted export. Defaults to PBKDF2_ITERATIONS (600000). */
  readonly kdfIterations?: number;
  /** Test seam: lowest iteration count accepted when decrypting. Defaults to PBKDF2_ITERATIONS. Only tests lower it. */
  readonly minIterations?: number;
  readonly appVersion?: string;
  readonly undoWindowMs?: number;
  readonly pendingWindowMs?: number;
}

interface PendingEntry {
  readonly id: string;
  readonly data: BackupData;
  readonly exportedAt: IsoInstant;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** The store state right after our replaceAll; any other value at undo time means someone else wrote since. */
interface Fingerprint {
  readonly lastBackupAt: IsoInstant | null;
  readonly lastSyncAt: IsoInstant | null;
  readonly changesSinceBackup: number;
  readonly pendingChanges: number;
  /** SHA-256 of the canonical exportAll (device settings included): catches writes that move no counter. */
  readonly digest: string;
}

interface UndoEntry {
  readonly token: string;
  readonly snapshotId: string;
  readonly fingerprint: Fingerprint;
  readonly timer: ReturnType<typeof setTimeout>;
}

function importError(code: BackupImportErrorCode): { readonly ok: false; readonly error: BackupImportError } {
  return { ok: false, error: { code, message: BACKUP_IMPORT_MESSAGES[code] } };
}

function toDataError(error: unknown): DataError {
  if (error instanceof DataError) {
    return error;
  }
  const code = (error as { readonly code?: unknown } | null)?.code;
  return new DataError(code === 'VALIDATION' ? 'VALIDATION' : code === 'NOT_FOUND' ? 'NOT_FOUND' : 'STORAGE');
}

function looksLikeEnvelope(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && (value as { format?: unknown }).format === 'cuotascasa-enc';
  } catch {
    return false;
  }
}

function sameFingerprint(a: Fingerprint, b: Fingerprint): boolean {
  return (
    a.lastBackupAt === b.lastBackupAt &&
    a.lastSyncAt === b.lastSyncAt &&
    a.changesSinceBackup === b.changesSinceBackup &&
    a.pendingChanges === b.pendingChanges &&
    a.digest === b.digest
  );
}

class BackupServiceImpl extends BackupState implements BackupService {
  private pending: PendingEntry | undefined;
  private undo: UndoEntry | undefined;
  private unsubscribe: (() => void) | undefined;
  private ownReplaceNotifications = 0;
  private confirmTail: Promise<unknown> = Promise.resolve();
  /** True while a confirm is running; a foreign notification then means a write may have slipped in. */
  private importing = false;
  private writeDuringImport = false;
  private restoring = false;
  /** Counts notifications, to notice a write that lands while an export runs. */
  private notifications = 0;
  private removeVisibility: (() => void) | undefined;

  private readonly ids: IdGenerator;
  private readonly options: BackupOptions;

  constructor(
    dataStore: Promise<DataStore>,
    clock: Clock,
    ids: IdGenerator,
    options: BackupOptions,
    destroyRef: DestroyRef,
  ) {
    super(dataStore, clock);
    this.ids = ids;
    this.options = options;
    destroyRef.onDestroy(() => {
      this.unsubscribe?.();
      this.removeVisibility?.();
      this.discardUndo();
      this.dropPending();
    });
    if (typeof document !== 'undefined') {
      const onVisible = (): void => {
        if (document.visibilityState === 'visible') {
          void this.refresh();
        }
      };
      document.addEventListener('visibilitychange', onVisible);
      this.removeVisibility = () => document.removeEventListener('visibilitychange', onVisible);
    }
    void this.start().then((unsubscribe) => {
      this.unsubscribe = unsubscribe;
    });
  }

  private async start(): Promise<() => void> {
    try {
      const store = await this.source;
      const unsubscribe = store.subscribe((event) => {
        this.notifications += 1;
        // Exactly one own replaceAll keeps the undo alive. Anything else (a write, a sync save, another tab's import or
        // undo) means the data moved on, so undoing would overwrite it. A stale notification from before the import
        // lands here too: that only costs the undo, the safe side.
        if (event.origin === 'replaceAll' && this.ownReplaceNotifications > 0) {
          this.ownReplaceNotifications -= 1;
        } else {
          if (this.importing) {
            this.writeDuringImport = true;
          }
          this.discardUndo();
        }
        void this.refresh();
      });
      await this.refresh();
      return unsubscribe;
    } catch {
      return () => undefined;
    }
  }

  async exportJson(options: { readonly passphrase?: string } = {}): Promise<BackupFile> {
    const passphrase = options.passphrase;
    if (passphrase !== undefined && passphrase.length === 0) {
      throw new DataError('VALIDATION');
    }
    try {
      const store = await this.source;
      const exportedAt = this.clockNow();
      const seen = this.notifications;
      const [data, meta] = await Promise.all([store.exportAll(), store.getMeta()]);
      const document: BackupDocument = {
        format: 'cuotascasa',
        version: LATEST_VERSION,
        exportedAt,
        deviceId: meta.deviceId,
        appVersion: this.options.appVersion ?? APP_VERSION,
        data,
      };
      const text = serializeBackup(document);
      let body = text;
      if (passphrase !== undefined) {
        // Crypto loads on demand so it stays out of the /app initial chunks (ADR-0025).
        const { deriveStoredKey, encrypt, serializeEnvelope } = await import('@cuotascasa/sync/crypto');
        const key = await deriveStoredKey(passphrase, { iterations: this.options.kdfIterations ?? PBKDF2_ITERATIONS });
        body = serializeEnvelope(await encrypt(key, text));
      }
      // A write that committed after exportAll is not in the file, so marking the backup would hide it. We only see it
      // here once its notification arrived; a commit whose notification is still in flight can still slip through.
      if (this.notifications === seen) {
        await store.markBackedUp(exportedAt);
      }
      await this.refresh();
      return {
        fileName: `cuotascasa-respaldo-${this.clockToday()}.json`,
        blob: new Blob([body], { type: 'application/json' }),
        encrypted: passphrase !== undefined,
      };
    } catch (error) {
      throw toDataError(error);
    }
  }

  async previewImport(
    file: Blob,
    options: { readonly passphrase?: string } = {},
  ): Promise<Result<PendingImport, BackupImportError>> {
    let text: string;
    try {
      text = await file.text();
    } catch {
      return importError('INVALID_JSON');
    }
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
    const encrypted = looksLikeEnvelope(text);
    if (encrypted) {
      const opened = await this.openEnvelope(text, options.passphrase);
      if (!opened.ok) {
        return opened;
      }
      text = opened.value;
    }
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      return importError(parsed.error.code);
    }
    const id = this.ids.newId();
    this.dropPending();
    const timer = setTimeout(() => {
      if (this.pending?.id === id) {
        this.pending = undefined;
      }
    }, this.options.pendingWindowMs ?? PENDING_WINDOW_MS);
    this.pending = { id, data: parsed.value.document.data, exportedAt: parsed.value.document.exportedAt, timer };
    return { ok: true, value: { id, preview: parsed.value.preview, encrypted } };
  }

  private async openEnvelope(text: string, passphrase: string | undefined): Promise<Result<string, BackupImportError>> {
    if (passphrase === undefined || passphrase.length === 0) {
      return importError('PASSPHRASE_REQUIRED');
    }
    const minIterations = this.options.minIterations ?? PBKDF2_ITERATIONS;
    try {
      const { deriveStoredKey, decrypt, parseEnvelope } = await import('@cuotascasa/sync/crypto');
      // parseEnvelope already caps the iterations and the salt, so a hostile file cannot make the derivation hang.
      const envelope = parseEnvelope(text);
      if (envelope.kdf.iterations < minIterations) {
        return importError('VALIDATION');
      }
      const key = await deriveStoredKey(passphrase, { saltId: envelope.kdf.salt, iterations: envelope.kdf.iterations });
      return { ok: true, value: await decrypt(key, envelope, { minIterations }) };
    } catch (error) {
      if (error instanceof SyncError) {
        if (error.code === 'WrongPassphraseOrTamper') return importError('WRONG_PASSPHRASE');
        if (error.code === 'UnsupportedVersion') return importError('UNSUPPORTED_VERSION');
      }
      return importError('VALIDATION');
    }
  }

  confirmImport(pendingId: string): Promise<ImportReceipt> {
    const entry = this.pending;
    if (!entry || entry.id !== pendingId) {
      return Promise.reject(new DataError('NOT_FOUND'));
    }
    this.dropPending();
    // One confirm at a time, so two imports never interleave their snapshots and timers.
    const run = this.confirmTail.then(() => this.runConfirm(entry));
    this.confirmTail = run.catch(() => undefined);
    return run;
  }

  private async runConfirm(entry: PendingEntry): Promise<ImportReceipt> {
    this.importing = true;
    this.writeDuringImport = false;
    let snapshotId: string | undefined;
    try {
      const store = await this.source;
      this.discardUndo();
      snapshotId = await store.createSnapshot();
      this.ownReplaceNotifications += 1;
      try {
        await store.replaceAll(entry.data, { pending: 'all', backedUpAt: entry.exportedAt });
      } catch (error) {
        this.ownReplaceNotifications -= 1;
        throw error;
      }
      const fingerprint = await this.fingerprint(store);
      const token = this.ids.newId();
      if (this.writeDuringImport) {
        // Something else wrote around our snapshot: undoing would drop it, so no undo is offered.
        await this.discardSnapshot(snapshotId);
      } else {
        const timer = setTimeout(() => {
          if (this.undo?.token === token) {
            this.discardUndo();
          }
        }, this.options.undoWindowMs ?? UNDO_WINDOW_MS);
        this.undo = { token, snapshotId, fingerprint, timer };
      }
      await this.refresh();
      return { undoToken: token };
    } catch (error) {
      if (snapshotId !== undefined && this.undo?.snapshotId !== snapshotId) {
        await this.discardSnapshot(snapshotId);
      }
      throw toDataError(error);
    } finally {
      this.importing = false;
    }
  }

  cancelImport(pendingId: string): void {
    if (this.pending?.id === pendingId) {
      this.dropPending();
    }
  }

  async undoImport(undoToken: string): Promise<void> {
    const undo = this.undo;
    if (!undo || undo.token !== undoToken || this.restoring) {
      throw new DataError('NOT_FOUND');
    }
    this.restoring = true;
    try {
      const store = await this.source;
      const now = await this.fingerprint(store);
      if (this.undo !== undo || !sameFingerprint(now, undo.fingerprint)) {
        this.discardUndo();
        throw new DataError('NOT_FOUND');
      }
      // Residual risk: a commit between the check above and restoreSnapshot is overwritten. The port has no conditional
      // restore; an atomic one is tracked as a separate contract card.
      await store.restoreSnapshot(undo.snapshotId);
      if (this.undo === undo) {
        this.dropUndo();
      }
    } catch (error) {
      if (error instanceof PersistenceError && error.code === 'SNAPSHOT_NOT_FOUND') {
        this.dropUndo();
        throw new DataError('NOT_FOUND');
      }
      throw toDataError(error);
    } finally {
      this.restoring = false;
    }
    await this.refresh();
  }

  private async fingerprint(store: DataStore): Promise<Fingerprint> {
    const [meta, changesSinceBackup, pendingChanges, data] = await Promise.all([
      store.getMeta(),
      store.changesSinceBackup(),
      store.pendingChanges(),
      store.exportAll(),
    ]);
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const digest = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return {
      lastBackupAt: meta.lastBackupAt,
      lastSyncAt: meta.lastSyncAt,
      changesSinceBackup,
      pendingChanges,
      digest,
    };
  }

  private dropPending(): void {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending = undefined;
    }
  }

  /** Forgets the undo entry and releases its snapshot. */
  private discardUndo(): void {
    const undo = this.undo;
    if (!undo) {
      return;
    }
    this.dropUndo();
    void this.discardSnapshot(undo.snapshotId);
  }

  private dropUndo(): void {
    if (this.undo) {
      clearTimeout(this.undo.timer);
      this.undo = undefined;
    }
  }

  private async discardSnapshot(snapshotId: string): Promise<void> {
    try {
      await (await this.source).discardSnapshot(snapshotId);
    } catch {
      // Nothing to release.
    }
  }
}

/**
 * W4-08: export/import with migrations, preview, snapshot, undo and encryption. Needs DATA_STORE, CLOCK and ID_GENERATOR
 * (provideDataStores()). Imports go through the DataStore, so the stores reload from its change notification.
 */
export function provideBackup(options: BackupOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: BACKUP_SERVICE,
      useFactory: (): BackupService =>
        new BackupServiceImpl(inject(DATA_STORE), inject(CLOCK), inject(ID_GENERATOR), options, inject(DestroyRef)),
    },
  ]);
}
