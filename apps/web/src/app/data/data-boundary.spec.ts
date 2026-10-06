import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** data/api.ts and data/tokens.ts take only types from the packages (ADR-0010 §5, CLAUDE.md). cwd = repo root. */
const FILES = ['apps/web/src/app/data/api.ts', 'apps/web/src/app/data/tokens.ts'] as const;
const STATEMENT = /^(import|export)\b[^;]*?\bfrom\s+'([^']+)';/gms;

function packageStatements(path: string): string[] {
  const source = readFileSync(path, 'utf8');
  return [...source.matchAll(STATEMENT)]
    .filter((match) => match[2]?.startsWith('@cuotascasa/'))
    .map((match) => match[0]);
}

describe('data contract boundary', () => {
  it.each(FILES)('%s imports and re-exports packages only with `import type`', (path) => {
    const statements = packageStatements(path);
    const offending = statements.filter((statement) => !/^(import|export) type\s/.test(statement));
    expect(offending).toEqual([]);
  });

  it.each(FILES)('%s never loads a package dynamically', (path) => {
    expect(readFileSync(path, 'utf8')).not.toMatch(/import\(\s*'@cuotascasa\//);
  });

  it('api.ts takes types from domain, schema, persistence and sync', () => {
    const modules = packageStatements(FILES[0]).map((statement) => /from\s+'([^']+)'/.exec(statement)?.[1]);
    expect(modules.sort()).toEqual([
      '@cuotascasa/domain',
      '@cuotascasa/persistence',
      '@cuotascasa/schema',
      '@cuotascasa/sync',
    ]);
  });
});
