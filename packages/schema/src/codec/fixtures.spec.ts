import { describe, expect, it } from 'vitest';
import { LATEST_VERSION, backupDocumentSchema } from '../backup/types.ts';
import { deepFreeze } from '../testing/deep-freeze.ts';
import { parseBackup, serializeBackup } from './index.ts';

declare global {
  interface ImportMeta {
    glob(pattern: string, options: { eager: true; query: '?raw'; import: 'default' }): Record<string, string>;
  }
}

const files = import.meta.glob('../../fixtures/**/*', { eager: true, query: '?raw', import: 'default' });
const entries = Object.entries(files);

describe('committed backup fixtures', () => {
  it('finds the fixtures', () => {
    expect(entries.length).toBeGreaterThanOrEqual(3);
  });

  it.each(entries)('%s is named backup-v<N>-<case>.json inside fixtures/backup/v<N>/', (path) => {
    expect(path).toMatch(/\/fixtures\/backup\/v(\d+)\/backup-v\1-[a-z0-9]+(-[a-z0-9]+)*\.json$/);
  });

  it.each(entries)('%s has synthetic: true and parses to the latest version', (path, text) => {
    const raw = JSON.parse(text) as { synthetic?: unknown; version: number };
    expect(raw.synthetic).toBe(true);
    const version = Number(/backup-v(\d+)-/.exec(path)?.[1]);
    expect(raw.version).toBe(version);

    const frozen = deepFreeze(JSON.parse(text) as unknown);
    const result = parseBackup(frozen);
    expect(result.ok, JSON.stringify(!result.ok && result.error)).toBe(true);
    if (result.ok) {
      expect(result.value.migratedFrom).toBe(version);
      expect(result.value.document.version).toBe(LATEST_VERSION);
      expect(result.value.document).not.toHaveProperty('synthetic');
      expect(backupDocumentSchema.safeParse(result.value.document).success).toBe(true);
      expect(serializeBackup(result.value.document)).not.toContain('synthetic');
    }
    expect(frozen).toEqual(JSON.parse(text));
  });

  it('keeps the tombstones fixture counting its deleted records', () => {
    const entry = entries.find(([path]) => path.endsWith('backup-v1-tombstones.json'));
    const result = parseBackup(entry?.[1]);
    expect(result.ok && result.value.preview.counts).toMatchObject({
      events: { active: 0, tombstoned: 1 },
      payments: { active: 0, tombstoned: 1 },
      loans: { active: 1, tombstoned: 0 },
    });
  });
});
