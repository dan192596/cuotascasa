import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Run after `pnpm build` with `pnpm exec ng test --configuration=dist --no-watch` (cwd = repo root). */
const DIST = 'dist/apps/web';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

describe('self-hosted fonts in dist (ADR-0012 §8)', () => {
  it('has the build output', () => {
    expect(existsSync(DIST)).toBe(true);
  });

  it('references no external font or CDN URL in HTML or CSS', () => {
    const offenders = files(DIST)
      .filter((file) => /\.(html|css)$/.test(file))
      .filter((file) =>
        /https?:\/\/[^\s"')]*(fonts\.(googleapis|gstatic)\.com|cdn\.|jsdelivr|unpkg|cdnjs|typekit|bunny\.net)/i.test(
          readFileSync(file, 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
  });

  it('ships the two families as same-origin woff2 files', () => {
    const names = files(DIST).map((file) => file.toLowerCase());
    expect(names.some((n) => n.includes('source-serif-4') && n.endsWith('.woff2'))).toBe(true);
    expect(names.some((n) => n.includes('jetbrains-mono') && n.endsWith('.woff2'))).toBe(true);
    const css = files(DIST)
      .filter((file) => file.endsWith('.css'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(css).toMatch(/font-family:\s*["']?Source Serif 4/);
    expect(css).toMatch(/font-family:\s*["']?JetBrains Mono/);
  });
});
