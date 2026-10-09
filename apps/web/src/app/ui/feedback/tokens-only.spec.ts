import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIRS = ['apps/web/src/app/ui/house-meter', 'apps/web/src/app/ui/feedback'];
const files = DIRS.flatMap((dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
    .map((name) => `${dir}/${name}`),
);

describe('ui house-meter and feedback use design tokens only (ADR-0012 decision 5)', () => {
  it('finds the component sources', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it.each(files)('%s has no hard-coded colours and only frozen token names', (file) => {
    const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(source, 'hex colour').not.toMatch(/#[0-9a-fA-F]{3,8}\b(?![\w-])(?=[\s;,)'"`])/);
    expect(source, 'colour function').not.toMatch(/\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/);
    expect(source, 'named colour').not.toMatch(
      /(?:color|background|fill|stroke|border[a-z-]*)\s*:\s*(?:white|black|red|green|blue|gray|grey|orange|yellow)\b/,
    );
    const frozen = JSON.parse(readFileSync('apps/web/src/design-contract/token-names.json', 'utf8')) as {
      themed: string[];
      shared: string[];
    };
    const allowed = new Set([...frozen.themed, ...frozen.shared]);
    for (const [, name] of source.matchAll(/var\((--cc-[a-z0-9-]+)/g)) {
      expect(allowed.has(name ?? ''), `${name} in ${file}`).toBe(true);
    }
  });

  it.each(files)('%s keeps component styles under 8 kB', (file) => {
    const styles = readFileSync(file, 'utf8').match(/styles:\s*`([\s\S]*?)`/)?.[1] ?? '';
    expect(styles.length).toBeLessThan(8 * 1024);
  });
});
