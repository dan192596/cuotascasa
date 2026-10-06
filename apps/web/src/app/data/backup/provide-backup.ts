import { type EnvironmentProviders, makeEnvironmentProviders, signal } from '@angular/core';
import type { IsoInstant } from '@cuotascasa/schema';
import { type BackupService, DataError } from '../api.ts';
import { BACKUP_SERVICE } from '../tokens.ts';

/** Inert W0-05 stub; W4-08 replaces this file (same export) and deletes stub.spec.ts. */
export const CC_STUB = 'CC_STUB:W4-08';

class InertBackupService implements BackupService {
  readonly ccStub = CC_STUB;
  readonly lastBackupAt = signal<IsoInstant | null>(null).asReadonly();
  readonly changesSinceBackup = signal(0).asReadonly();
  readonly reminderDue = signal(false).asReadonly();
  exportJson(): Promise<never> {
    return Promise.reject(new DataError('NOT_IMPLEMENTED', CC_STUB));
  }
  previewImport(): Promise<never> {
    return Promise.reject(new DataError('NOT_IMPLEMENTED', CC_STUB));
  }
  confirmImport(): Promise<never> {
    return Promise.reject(new DataError('NOT_IMPLEMENTED', CC_STUB));
  }
  cancelImport(): void {
    // Nothing is pending in the stub.
  }
  undoImport(): Promise<never> {
    return Promise.reject(new DataError('NOT_IMPLEMENTED', CC_STUB));
  }
}

/** W4-08: export/import with migrations, preview, snapshot, undo and encryption. The stub never writes. */
export function provideBackup(): EnvironmentProviders {
  const service: BackupService = new InertBackupService();
  return makeEnvironmentProviders([{ provide: BACKUP_SERVICE, useValue: service }]);
}
