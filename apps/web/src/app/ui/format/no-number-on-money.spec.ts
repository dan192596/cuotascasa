import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Acceptance: no Number(), parseFloat or unary + in the production code of ui/format and ui/money-input. */
const DIRS = ['apps/web/src/app/ui/format', 'apps/web/src/app/ui/money-input'];
const FORBIDDEN: readonly [string, RegExp][] = [
  ['Number(', /\bNumber\s*\(/],
  ['Number.parse*', /\bNumber\s*\.\s*parse(Float|Int)\b/],
  ['parseFloat', /\bparseFloat\b/],
  ['parseInt', /\bparseInt\b/],
  ['unary +', /(^|[=(,:?&|!*/%<>[{]|return)\s*\+\s*[A-Za-z_$(]/m],
];

function sources(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
    .map((name) => join(dir, name));
}

describe('money never goes through JS numbers in the owned directories', () => {
  const files = DIRS.flatMap(sources);

  it('finds production sources to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const [label, pattern] of FORBIDDEN) {
    it(`has no ${label}`, () => {
      const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')));
      expect(offenders).toEqual([]);
    });
  }
});
