import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** ADR-0012 §5: no hard-coded colours outside apps/web/src/styles/. cwd = repo root. */
const ROOT = 'apps/web/src';
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

describe('no hard-coded colours outside styles/', () => {
  it('finds none in app sources, templates or stylesheets', () => {
    const offenders = files(ROOT)
      .filter((file) => /\.(ts|html|scss|css)$/.test(file))
      .filter((file) => !file.startsWith(join(ROOT, 'styles')))
      .filter((file) => !/\.(spec|test-d)\.ts$/.test(file) && !file.startsWith(join(ROOT, 'testing')))
      .filter((file) => COLOR.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
