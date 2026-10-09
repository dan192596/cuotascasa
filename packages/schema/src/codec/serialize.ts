import type { BackupDocument } from '../backup/types.ts';
import { ENTITY_KEYS } from '../entities/registry.ts';

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortKeys(record[key])]),
    );
  }
  return value;
}

/**
 * Canonical JSON of a backup: fixed root and collection order, alphabetically sorted record keys, two-space
 * indentation and a final newline. Collections keep their array order. The optional root `synthetic` flag
 * (fixtures only, ADR-0007) is never emitted.
 */
export function serializeBackup(document: BackupDocument): string {
  const data = Object.fromEntries(ENTITY_KEYS.map((key) => [key, sortKeys(document.data[key])]));
  const canonical = {
    format: document.format,
    version: document.version,
    exportedAt: document.exportedAt,
    deviceId: document.deviceId,
    appVersion: document.appVersion,
    data,
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}
