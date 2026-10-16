import { Injectable, signal } from '@angular/core';
import { DataError, type BackupImportErrorCode, type PendingImport } from '../../../data/api.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** «Último respaldo: hace N días» (HU-20). Whole days, never negative; null means no backup yet. */
export function lastBackupText(lastBackupAt: string | null, nowMs: number): string {
  if (lastBackupAt === null) return 'Aún no has hecho un respaldo';
  const at = Date.parse(lastBackupAt);
  if (Number.isNaN(at)) return 'Fecha del último respaldo no disponible';
  const days = Math.max(0, Math.floor((nowMs - at) / DAY_MS));
  if (days === 0) return 'Último respaldo: hoy';
  return days === 1 ? 'Último respaldo: hace 1 día' : `Último respaldo: hace ${String(days)} días`;
}

const IMPORT_ERRORS: Readonly<Record<BackupImportErrorCode, string>> = {
  INVALID_JSON: 'El archivo no es un respaldo válido: no se pudo leer su contenido.',
  FOREIGN_FORMAT: 'El archivo no es un respaldo de CuotasCasa.',
  UNSUPPORTED_VERSION: 'Este respaldo usa una versión que esta aplicación no puede leer.',
  FUTURE_VERSION:
    'Este respaldo fue creado con una versión más nueva de CuotasCasa. Actualiza la aplicación para importarlo.',
  VALIDATION: 'El respaldo está dañado o incompleto, así que no se importó nada.',
  PASSPHRASE_REQUIRED: 'Este respaldo está cifrado. Escribe la frase con la que se cifró.',
  WRONG_PASSPHRASE: 'La frase es incorrecta o el archivo fue alterado. No se cambió nada.',
};

/** Fixed Spanish text of a failed preview. The service message is never shown: it could echo file content. */
export function importErrorText(code: BackupImportErrorCode): string {
  return IMPORT_ERRORS[code];
}

export type BackupAction = 'export' | 'confirm' | 'undo';

/** Fixed Spanish text of a rejected service call, by code and action; the error message is never shown. */
export function dataErrorText(error: unknown, action: BackupAction): string {
  const code = error instanceof DataError ? error.code : 'STORAGE';
  if (code === 'NOT_FOUND') {
    return action === 'undo'
      ? 'Ya no se puede deshacer porque hubo cambios después.'
      : 'La vista previa venció (dura 10 minutos). Selecciona el archivo otra vez.';
  }
  if (code === 'VALIDATION') {
    return action === 'export'
      ? 'Escribe una frase para cifrar el respaldo.'
      : 'El respaldo está dañado o incompleto, así que no se importó nada.';
  }
  return action === 'export'
    ? 'No se pudo preparar el respaldo. Tus datos no cambiaron; intenta de nuevo.'
    : action === 'undo'
      ? 'No se pudo deshacer la importación. Intenta de nuevo.'
      : 'No se pudo guardar la importación. Tus datos anteriores siguen igual.';
}

const ENTITY_LABELS = [
  ['loans', 'Préstamos'],
  ['events', 'Eventos'],
  ['reportedBalances', 'Saldos reportados'],
  ['payments', 'Pagos reales'],
  ['scenarios', 'Escenarios'],
  ['settings', 'Ajustes'],
] as const satisfies readonly (readonly [keyof PendingImport['preview']['counts'], string])[];

export interface CountRow {
  readonly key: keyof PendingImport['preview']['counts'];
  readonly label: string;
  readonly active: number;
  readonly tombstoned: number;
}

/** Rows of the preview table: active and deleted records per entity (ADR-0007 decision 5). */
export function countRows(preview: PendingImport['preview']): readonly CountRow[] {
  return ENTITY_LABELS.map(([key, label]) => ({ key, label, ...preview.counts[key] }));
}

/** Storage sizes for the persistence status. These are bytes, not money. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(Math.round(bytes))} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit] ?? 'GB'}`;
}

/** Remembers, for the page session, that the unencrypted-JSON warning was already shown (HU-19). */
@Injectable({ providedIn: 'root' })
export class PlainExportSession {
  private readonly shown = signal(false);
  readonly warned = this.shown.asReadonly();

  markWarned(): void {
    this.shown.set(true);
  }
}
