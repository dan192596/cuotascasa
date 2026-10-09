import type { z } from 'zod';
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMAS_BY_VERSION,
  LATEST_VERSION,
  type BackupDocument,
  type BackupError,
  type BackupMigration,
  type EntityCounts,
  type ImportPreview,
  type ParsedBackup,
  type Result,
} from '../backup/types.ts';
import { ENTITY_KEYS, type EntityKey } from '../entities/registry.ts';
import { applyMigrations, backupMigrations, hasMigrationPath } from '../migrations/index.ts';

/** What parseBackup needs to know about the version chain; production uses the registered one. */
export interface CodecConfig {
  readonly latestVersion: number;
  readonly schemas: { readonly [version: number]: z.ZodType };
  readonly migrations: readonly BackupMigration[];
}

const PRODUCTION_CONFIG: CodecConfig = {
  latestVersion: LATEST_VERSION,
  schemas: BACKUP_SCHEMAS_BY_VERSION,
  migrations: backupMigrations,
};

function fail(error: BackupError): Result<never, BackupError> {
  return { ok: false, error };
}

function validationError(error: z.ZodError, version?: number): BackupError {
  const issue = error.issues[0];
  const path = (issue?.path ?? []).filter((key): key is string | number => typeof key !== 'symbol');
  const message = issue?.message ?? 'Invalid backup';
  return version === undefined ? { code: 'VALIDATION', message, path } : { code: 'VALIDATION', message, path, version };
}

function countRecords(records: readonly { readonly deletedAt: string | null }[]): EntityCounts {
  const tombstoned = records.filter((record) => record.deletedAt !== null).length;
  return { active: records.length - tombstoned, tombstoned };
}

function buildPreview(document: BackupDocument, sourceVersion: number): ImportPreview {
  const counts = Object.fromEntries(ENTITY_KEYS.map((key) => [key, countRecords(document.data[key])])) as {
    [K in EntityKey]: EntityCounts;
  };
  return { sourceVersion, exportedAt: document.exportedAt, appVersion: document.appVersion, counts };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Same as parseBackup with an explicit version chain; exists so tests can prove migrations with a test-only chain. */
export function parseBackupWith(input: unknown, config: CodecConfig): Result<ParsedBackup, BackupError> {
  try {
    let raw: unknown = input;
    if (typeof input === 'string') {
      try {
        raw = JSON.parse(input.charCodeAt(0) === 0xfeff ? input.slice(1) : input);
      } catch (cause) {
        return fail({
          code: 'INVALID_JSON',
          message: cause instanceof Error ? cause.message : 'Invalid JSON',
          path: [],
        });
      }
    }
    if (!isRecord(raw) || raw['format'] !== BACKUP_FORMAT) {
      return fail({ code: 'FOREIGN_FORMAT', message: `Not a ${BACKUP_FORMAT} backup`, path: [] });
    }

    const version = raw['version'];
    if (typeof version !== 'number' || !Number.isInteger(version)) {
      return fail({ code: 'VALIDATION', message: 'Expected an integer version', path: ['version'] });
    }
    if (version > config.latestVersion) {
      return fail({
        code: 'FUTURE_VERSION',
        message: `Backup version ${String(version)} is newer than the supported ${String(config.latestVersion)}`,
        path: [],
        version,
      });
    }
    const sourceSchema = config.schemas[version];
    if (sourceSchema === undefined || !hasMigrationPath(version, config.latestVersion, config.migrations)) {
      return fail({
        code: 'UNSUPPORTED_VERSION',
        message: `Backup version ${String(version)} is not supported`,
        path: [],
        version,
      });
    }

    // The fixtures-only flag is dropped before anything else, so it never reaches the migrated document.
    const { synthetic, ...rest } = raw;
    const candidate = synthetic === true ? rest : raw;

    const source = sourceSchema.safeParse(candidate);
    if (!source.success) {
      return fail(validationError(source.error, version));
    }
    const migrated =
      version === config.latestVersion
        ? source.data
        : applyMigrations(source.data, version, config.latestVersion, config.migrations);
    const latestSchema = config.schemas[config.latestVersion];
    if (latestSchema === undefined) {
      return fail({ code: 'UNSUPPORTED_VERSION', message: 'No schema for the latest version', path: [] });
    }
    const latest = latestSchema.safeParse(migrated);
    if (!latest.success) {
      return fail(validationError(latest.error, version));
    }
    const document = latest.data as BackupDocument;
    return { ok: true, value: { document, migratedFrom: version, preview: buildPreview(document, version) } };
  } catch (cause) {
    // Total by contract (ADR-0007): a defect in a migration or a hostile input becomes a typed error.
    return fail({
      code: 'VALIDATION',
      message: cause instanceof Error ? cause.message : 'Unexpected failure while reading the backup',
      path: [],
    });
  }
}

/**
 * Reads a backup from JSON text or an already parsed value: checks the format, detects the version, runs the pure
 * migration chain to LATEST_VERSION and validates. Never throws; failures are typed BackupError values.
 */
export function parseBackup(input: unknown): Result<ParsedBackup, BackupError> {
  return parseBackupWith(input, PRODUCTION_CONFIG);
}
