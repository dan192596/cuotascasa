import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { readClientStorage } from '../../support/expectations.ts';
import { expect, test } from '../../support/test.ts';

/** The production build the edge serves (the e2e web server builds it before the first test). */
const DIST = fileURLToPath(new URL('../../../dist/apps/web/browser/', import.meta.url));

/** Markers of the inert W0-05 stubs; none may survive into what users download. */
const STUB_MARKERS = ['CC_STUB', 'data-cc-stub', 'NOT_IMPLEMENTED', 'NotImplementedError'] as const;
const TEXT_FILE = /\.(?:js|mjs|css|html|json|txt|webmanifest|svg|xml|map)$|^_headers$|^_redirects$/;

async function distFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? distFiles(`${directory}${entry.name}/`) : Promise.resolve([`${directory}${entry.name}`]),
    ),
  );
  return nested.flat();
}

/**
 * Stubs that Opus registered with a still-open card (docs/plan/plan.json); the card removes its entry when it replaces
 * the stub. A chunk carrying one of these exact markers may also carry CC_STUB and NOT_IMPLEMENTED (the stub rejects
 * with DataError('NOT_IMPLEMENTED')); every other marker still fails there. An entry whose marker is no longer in dist
 * fails too, so the allowance cannot outlive its stub. The release (W7-01) requires this list to be empty.
 */
const PENDING_STUBS: readonly string[] = [];
const PENDING_STUB_MARKERS: ReadonlySet<string> = new Set(['CC_STUB', 'NOT_IMPLEMENTED']);

test('no stub marker anywhere in the production dist', async () => {
  const files = (await distFiles(DIST)).filter((file) => TEXT_FILE.test(file.slice(file.lastIndexOf('/') + 1)));
  // Guards the guard: an empty or wrong directory would pass vacuously.
  expect(files.length, 'text files scanned in dist').toBeGreaterThan(20);
  expect(files.some((file) => file.endsWith('index.html'))).toBe(true);
  const hits: string[] = [];
  const pendingSeen = new Set<string>();
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const pending = PENDING_STUBS.filter((marker) => content.includes(marker));
    for (const marker of pending) pendingSeen.add(marker);
    for (const marker of STUB_MARKERS) {
      if (pending.length > 0 && PENDING_STUB_MARKERS.has(marker)) continue;
      if (content.includes(marker)) hits.push(`${file.slice(DIST.length)}: ${marker}`);
    }
  }
  expect(hits).toEqual([]);
  const stale = PENDING_STUBS.filter((marker) => !pendingSeen.has(marker));
  expect(stale, 'pending stubs no longer in dist: remove them from PENDING_STUBS').toEqual([]);
});

const registrations = (page: Page): Promise<string[]> =>
  page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope));

test.describe('public pages in a fresh context (ADR-0017, ADR-0023)', () => {
  test('visiting every public page registers no worker and creates no CacheStorage or storage', async ({ page }) => {
    for (const route of ['/', '/privacidad', '/no-existe', '/privacidad', '/']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      // Give a late registration every chance to appear.
      await page.waitForTimeout(400);
      expect(await registrations(page), route).toEqual([]);
      const storage = await readClientStorage(page);
      expect(storage, route).toEqual({
        localStorage: [],
        sessionStorage: [],
        indexedDB: [],
        cookies: [],
        cacheStorage: [],
        serviceWorkers: [],
      });
    }
  });
});

test.describe('after using /app', () => {
  test('one worker scoped to / is registered and it never keeps the HTML of / or /privacidad', async ({
    page,
    baseURL,
  }) => {
    // Wait for the worker on the first /app page, before any other full load: WebKit cancels a registration whose
    // download a navigation interrupts (core/pwa/provide-app-pwa.ts), and waiting only after the loop could hang (W9-14).
    await page.goto('/app');
    await expect(page.getByTestId('page-app')).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    const routes = [
      '/app/prestamos/nuevo',
      '/app/prestamos/no-existe',
      '/app/prestamos/no-existe/tabla',
      '/app/prestamos/no-existe/datos-reales',
      '/app/prestamos/no-existe/proyecciones',
      '/app/ajustes',
    ];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByTestId('page-app')).toBeVisible();
    }
    await expect.poll(async () => (await readClientStorage(page)).cacheStorage.length).toBeGreaterThan(0);
    expect(await registrations(page)).toEqual([`${baseURL ?? ''}/`]);

    const cachedUrls = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) urls.push(new URL(request.url).pathname);
      }
      return urls;
    });
    // ADR-0017 decision 2: ngsw-config never stores public HTML.
    expect(cachedUrls.filter((path) => path === '/' || path === '/privacidad' || path === '/privacidad/')).toEqual([]);
  });
});
