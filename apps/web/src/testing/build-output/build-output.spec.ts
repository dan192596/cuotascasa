import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Run after `pnpm build` with `pnpm exec ng test --configuration=dist --no-watch` (cwd = repository root). */
const DIST = 'dist/apps/web';
const BROWSER = join(DIST, 'browser');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function browserFiles(dir: string = BROWSER): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? browserFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

describe('pnpm build output (ADR-0011 decision 3)', () => {
  it('prerenders / with the landing page and the manifest link', () => {
    const html = read(join(BROWSER, 'index.html'));
    expect(html).toContain('data-testid="page-landing"');
    expect(html).toContain('ng-server-context="ssg"');
    expect(html).toContain('<link rel="manifest" href="manifest.webmanifest">');
    expect(html).toContain('<html lang="es-GT">');
    expect(existsSync(join(BROWSER, 'manifest.webmanifest'))).toBe(true);
  });

  it('prerenders /privacidad', () => {
    const html = read(join(BROWSER, 'privacidad', 'index.html'));
    expect(html).toContain('data-testid="page-privacy"');
    expect(html).toContain('ng-server-context="ssg"');
  });

  it('emits index.csr.html for app/** with an empty root component', () => {
    const html = read(join(BROWSER, 'index.csr.html'));
    expect(html).toContain('<cc-root></cc-root>');
    expect(html).not.toContain('ng-server-context');
  });

  it('prerenders only public routes', () => {
    const { routes } = JSON.parse(read(join(DIST, 'prerendered-routes.json'))) as { routes: Record<string, unknown> };
    expect(Object.keys(routes)).toEqual(expect.arrayContaining(['/', '/privacidad']));
    expect(Object.keys(routes).filter((route) => route.startsWith('/app'))).toEqual([]);
  });

  it('emits the production stats JSON (esbuild metafile)', () => {
    const stats = JSON.parse(read(join(DIST, 'browser-stats.json'))) as { inputs: object; outputs: object };
    expect(Object.keys(stats.outputs).length).toBeGreaterThan(0);
    expect(Object.keys(stats.inputs).length).toBeGreaterThan(0);
  });

  it('ships no zone.js (zoneless, ADR-0011 decision 2)', () => {
    const files = browserFiles();
    expect(files.filter((file) => /polyfills/.test(file))).toEqual([]);
    const withZone = files
      .filter((file) => /\.(js|html)$/.test(file))
      .filter((file) => /zone\.js|__zone_symbol__/.test(read(file)));
    expect(withZone).toEqual([]);
  });

  it('limits the service worker navigation fallback to /app (ADR-0023)', () => {
    const ngsw = JSON.parse(read(join(BROWSER, 'ngsw.json'))) as {
      index: string;
      navigationUrls: { positive: boolean; regex: string }[];
    };
    expect(ngsw.index).toBe('/index.csr.html');
    const positive = ngsw.navigationUrls.filter((url) => url.positive).map((url) => url.regex);
    expect(positive.length).toBeGreaterThan(0);
    expect(positive.filter((regex) => !regex.startsWith('^\\/app'))).toEqual([]);
  });
});
