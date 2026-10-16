import { DestroyRef, type EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import type { Clock, DataStore, IdGenerator } from '@cuotascasa/persistence';
import {
  type BackupDocument,
  type BackupData,
  LATEST_VERSION,
  type IsoInstant,
  parseBackup,
  type Result,
  serializeBackup,
} from '@cuotascasa/schema';
import { deriveStoredKey, decrypt, encrypt, parseEnvelope, serializeEnvelope } from '@cuotascasa/sync/crypto';
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

export interface BackupOptions {
  /** Test seam: PBKDF2 iterations of an encrypted export. Defaults to PBKDF2_ITERATIONS (600000). */
  readonly kdfIterations?: number;
  /** Test seam: lowest iteration count accepted when decrypting. Defaults to PBKDF2_ITERATIONS. Only tests lower it. */
  readonly minIterations?: number;
  readonly appVersion?: string;
  readonly undoWindowMs?: number;
}

interface PendingEntry {
  readonly data: BackupData;
  readonly exportedAt: IsoInstant;
}

interface UndoEntry {
  readonly token: string;
  readonly snapshotId: string;
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
    const value: unknown = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    return typeof value === 'object' && value !== null && (value as { format?: unknown }).format === 'cuotascasa-enc';
  } catch {
    return false;
  }
}

class BackupServiceImpl extends BackupState implements BackupService {
  private readonly pending = new Map<string, PendingEntry>();
  private undo: UndoEntry | undefined;
  private unsubscribe: (() => void) | undefined;
  private ownReplaceNotifications = 0;

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
      this.dropUndo();
    });
    void this.start().then((unsubscribe) => {
      this.unsubscribe = unsubscribe;
    });
  }

  private async start(): Promise<() => void> {
    try {
      const store = await this.source;
      const unsubscribe = store.subscribe((event) => {
        // Notifications arrive in commit order. Until our own replaceAll one is consumed, a 'write' belongs to a commit
        // that came before the import, so it must not discard the snapshot.
        if (event.origin === 'replaceAll' && this.ownReplaceNotifications > 0) {
          this.ownReplaceNotifications -= 1;
        } else if (event.origin === 'write' && this.ownReplaceNotifications === 0) {
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
        const key = await deriveStoredKey(passphrase, { iterations: this.options.kdfIterations ?? PBKDF2_ITERATIONS });
        body = serializeEnvelope(await encrypt(key, text));
      }
      await store.markBackedUp(exportedAt);
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
    this.pending.set(id, { data: parsed.value.document.data, exportedAt: parsed.value.document.exportedAt });
    return { ok: true, value: { id, preview: parsed.value.preview, encrypted } };
  }

  private async openEnvelope(text: string, passphrase: string | undefined): Promise<Result<string, BackupImportError>> {
    if (passphrase === undefined || passphrase.length === 0) {
      return importError('PASSPHRASE_REQUIRED');
    }
    const minIterations = this.options.minIterations ?? PBKDF2_ITERATIONS;
    try {
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

  async confirmImport(pendingId: string): Promise<ImportReceipt> {
    const entry = this.pending.get(pendingId);
    if (!entry) {
      throw new DataError('NOT_FOUND');
    }
    this.pending.delete(pendingId);
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
    } catch (error) {
      if (snapshotId !== undefined) {
        await this.discardSnapshot(snapshotId);
      }
      throw toDataError(error);
    }
    const token = this.ids.newId();
    const timer = setTimeout(() => this.discardUndo(), this.options.undoWindowMs ?? UNDO_WINDOW_MS);
    this.undo = { token, snapshotId, timer };
    await this.refresh();
    return { undoToken: token };
  }

  cancelImport(pendingId: string): void {
    this.pending.delete(pendingId);
  }

  async undoImport(undoToken: string): Promise<void> {
    const undo = this.undo;
    if (!undo || undo.token !== undoToken) {
      throw new DataError('NOT_FOUND');
    }
    this.dropUndo();
    try {
      const store = await this.source;
      await store.restoreSnapshot(undo.snapshotId);
    } catch (error) {
      throw toDataError(error);
    }
    await this.refresh();
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
