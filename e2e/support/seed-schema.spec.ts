import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { DB_NAME, DB_VERSION, SCHEMA_V1, parseStoreSpec } from './seed.ts';

/**
 * seed.ts mirrors the Dexie v1 layout because e2e may not import @cuotascasa/persistence (ADR-0010 §5). This reads
 * the source of packages/persistence/src/dexie/schema.ts as text and fails if the mirror drifts.
 */
const source = readFileSync(new URL('../../packages/persistence/src/dexie/schema.ts', import.meta.url), 'utf8');

test.describe('seed.ts mirrors DEXIE_SCHEMA_V1', () => {
  test('database name and version', () => {
    expect(/DEXIE_DB_NAME = '([^']+)'/.exec(source)?.[1]).toBe(DB_NAME);
    expect(Number(/DEXIE_DB_VERSION = (\d+)/.exec(source)?.[1])).toBe(DB_VERSION);
  });

  test('every store and index spec', () => {
    const block = /DEXIE_SCHEMA_V1 = \{([^}]*)\}/s.exec(source)?.[1] ?? '';
    const declared = Object.fromEntries([...block.matchAll(/^\s*(\w+): '([^']+)',?$/gm)].map((m) => [m[1], m[2]]));
    expect(Object.keys(declared).length).toBeGreaterThan(0);
    expect(SCHEMA_V1).toEqual(declared);
  });

  test('parseStoreSpec understands the Dexie syntax it mirrors and rejects the rest', () => {
    expect(parseStoreSpec('id, [loanId+createdAt+id]')).toEqual({
      keyPath: 'id',
      indexes: [{ name: '[loanId+createdAt+id]', keyPath: ['loanId', 'createdAt', 'id'] }],
    });
    expect(parseStoreSpec('key')).toEqual({ keyPath: 'key', indexes: [] });
    expect(() => parseStoreSpec('++id')).toThrow();
    expect(() => parseStoreSpec('id, *tags')).toThrow();
  });
});
