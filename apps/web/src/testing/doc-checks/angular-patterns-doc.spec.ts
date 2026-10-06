import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** docs/specs/angular-patterns.md explains every golden pattern and names only real files (cwd = repo root). */
const DOC = readFileSync('docs/specs/angular-patterns.md', 'utf8');
const PATTERNS = [
  'apps/web/src/app/_patterns/signal-forms-control/digits-input.component.ts',
  'apps/web/src/app/_patterns/two-step-form/two-step-form.component.ts',
  'apps/web/src/app/_patterns/zoneless-component/installment-counter.component.ts',
  'apps/web/src/app/_patterns/signal-store/notes-store.ts',
];

describe('docs/specs/angular-patterns.md', () => {
  it('explains the four golden patterns, each with its spec next to it', () => {
    for (const path of PATTERNS) {
      expect(DOC, path).toContain(`\`${path}\``);
      expect(existsSync(path.replace(/\.ts$/, '.spec.ts')), path).toBe(true);
    }
  });

  it('names only files that exist', () => {
    const paths = [...DOC.matchAll(/`(apps\/web\/[^`\s]+\.ts)`/g)].map((match) => match[1] ?? '');
    expect(paths.filter((path) => !existsSync(path))).toEqual([]);
  });
});
