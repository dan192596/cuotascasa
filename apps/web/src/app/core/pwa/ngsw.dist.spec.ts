import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Run after `pnpm build` with `pnpm exec ng test --configuration=dist --no-watch` (cwd = repository root). */
const BROWSER = join('dist', 'apps', 'web', 'browser');

interface Ngsw {
  index: string;
  assetGroups: { name: string; urls: string[] }[];
  dataGroups?: unknown[];
  hashTable: Record<string, string>;
}

const ngsw = JSON.parse(readFileSync(join(BROWSER, 'ngsw.json'), 'utf8')) as Ngsw;

describe('ngsw.json of the production build (ADR-0023, R20)', () => {
  it('hashes every cached file with the sha1 of its final bytes in dist', () => {
    const entries = Object.entries(ngsw.hashTable);
    expect(entries.length).toBeGreaterThan(0);
    const wrong = entries
      .filter(([url, hash]) => {
        const path = join(BROWSER, url);
        return !existsSync(path) || createHash('sha1').update(readFileSync(path)).digest('hex') !== hash;
      })
      .map(([url]) => url);
    expect(wrong).toEqual([]);
  });

  it('prefetches the app shell, lazy chunks and styles', () => {
    const shell = ngsw.assetGroups.find((group) => group.name === 'app-shell');
    expect(shell?.urls).toContain('/index.csr.html');
    expect(shell?.urls.some((url) => /^\/main-.*\.js$/.test(url))).toBe(true);
    expect(shell?.urls.some((url) => /^\/chunk-.*\.js$/.test(url))).toBe(true);
    expect(shell?.urls.some((url) => /^\/styles-.*\.css$/.test(url))).toBe(true);
  });

  it('has no dataGroups and no Google URL anywhere, so Google responses are never cached', () => {
    expect(ngsw.dataGroups ?? []).toEqual([]);
    const serialized = JSON.stringify(ngsw);
    expect(serialized).not.toContain('accounts.google.com');
    expect(serialized).not.toContain('googleapis');
    expect(serialized).not.toContain('gstatic');
  });

  it('never caches the worker scripts nor any public document', () => {
    const cached = [...ngsw.assetGroups.flatMap((group) => group.urls), ...Object.keys(ngsw.hashTable)];
    const forbidden = [
      '/ngsw-worker.js',
      '/safety-worker.js',
      '/ngsw.json',
      '/index.html',
      '/privacidad/index.html',
      '/404.html',
      '/404/index.html',
      '/_headers',
      '/_redirects',
    ];
    expect(cached.filter((url) => forbidden.includes(url))).toEqual([]);
  });

  it('ships the manifest icons it declares and caches them lazily', () => {
    const manifest = JSON.parse(readFileSync(join(BROWSER, 'manifest.webmanifest'), 'utf8')) as {
      start_url: string;
      icons: { src: string; purpose: string; sizes: string }[];
    };
    expect(manifest.start_url).toBe('/app');
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable' && icon.sizes === '512x512')).toBe(true);
    expect(manifest.icons.filter((icon) => !existsSync(join(BROWSER, icon.src)))).toEqual([]);
    const lazy = ngsw.assetGroups.find((group) => group.name === 'app-static');
    expect(lazy?.urls).toContain('/manifest.webmanifest');
    expect(lazy?.urls).toContain('/icons/icon.svg');
  });
});
