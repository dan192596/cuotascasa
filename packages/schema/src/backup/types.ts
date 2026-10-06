import type { z } from 'zod';
import type { IsoInstant } from '../common.ts';
import type { EntityKey } from '../entities/registry.ts';
import { backupDataV1Schema, backupDocumentV1Schema, type BackupDataV1, type BackupDocumentV1 } from './v1.ts';

export const BACKUP_FORMAT = 'cuotascasa';

/** Highest backup version this build reads and writes. A higher version is rejected (FUTURE_VERSION). */
export const LATEST_VERSION = 1;

/** Zod schema of every registered version; the codec (W1-03) validates each step of the chain with it. */
export const BACKUP_SCHEMAS_BY_VERSION: { readonly [version: number]: z.ZodType } = {
  1: backupDocumentV1Schema,
};

/** Aliases of the latest version; a new version re-points them in an Opus contract micro-card. */
export const backupDocumentSchema = backupDocumentV1Schema;
export const backupDataSchema = backupDataV1Schema;
export type BackupDocument = BackupDocumentV1;
export type BackupData = BackupDataV1;

export type BackupEntityKey = EntityKey;

export interface EntityCounts {
  readonly active: number;
  readonly tombstoned: number;
}

/** What the import screen shows before confirming (ADR-0007 decision 5). */
export interface ImportPreview {
  readonly sourceVersion: number;
  readonly exportedAt: IsoInstant;
  readonly appVersion: string;
  readonly counts: { readonly [K in BackupEntityKey]: EntityCounts };
}

export const BACKUP_ERROR_CODES = [
  'INVALID_JSON',
  'FOREIGN_FORMAT',
  'UNSUPPORTED_VERSION',
  'FUTURE_VERSION',
  'VALIDATION',
] as const;
export type BackupErrorCode = (typeof BACKUP_ERROR_CODES)[number];

/** Typed failure of parseBackup; `path` locates the first validation issue (empty otherwise). */
export interface BackupError {
  readonly code: BackupErrorCode;
  readonly message: string;
  readonly path: readonly (string | number)[];
  readonly version?: number;
}

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export interface ParsedBackup {
  readonly document: BackupDocument;
  readonly migratedFrom: number;
  readonly preview: ImportPreview;
}

/** One pure step of the migration chain vN -> vN+1; it never mutates its input (ADR-0007 decision 2). */
export interface BackupMigration {
  readonly from: number;
  readonly to: number;
  migrate(input: unknown): unknown;
}
