import { expect, test } from './test.ts';
import { openHarness } from './harness.ts';
import {
  collectCspViolations,
  expectNoA11yViolations,
  expectNoClientStorage,
  expectNoCspViolations,
  expectNoExternalRequests,
  readClientStorage,
} from './expectations.ts';
import { readStore, seedFromBackup } from './seed.ts';
import { syntheticBackupDocument } from './synthetic.ts';

test.describe('expectNoClientStorage', () => {
  test('passes on a page that stores nothing', async ({ page }) => {
    await openHarness(page);
    await expectNoClientStorage(page);
  });

  for (const [label, write] of [
    ['localStorage', () => localStorage.setItem('x', '1')],
    ['sessionStorage', () => sessionStorage.setItem('x', '1')],
    ['cookies', () => void (document.cookie = 'x=1; path=/')],
    ['CacheStorage', async () => void (await caches.open('x'))],
    [
      'indexedDB',
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('x');
          open.onsuccess = () => {
            open.result.close();
            resolve();
          };
          open.onerror = () => reject(open.error ?? new Error('open failed'));
        }),
    ],
  ] as const) {
    test(`fails when the page writes ${label}`, async ({ page }) => {
      await openHarness(page);
      await page.evaluate(write);
      await expect(expectNoClientStorage(page)).rejects.toThrow();
    });
  }

  test('fails when a service worker is registered', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => navigator.serviceWorker.register('/__e2e__/worker.js'));
    await expect(expectNoClientStorage(page)).rejects.toThrow();
    expect((await readClientStorage(page)).serviceWorkers.length).toBeGreaterThan(0);
  });
});

test.describe('expectNoExternalRequests', () => {
  test('passes on same-origin, data: and blob: requests', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(async () => {
      await fetch('/manifest.webmanifest');
      await fetch('data:text/plain,hola');
      await fetch(URL.createObjectURL(new Blob(['hola'])));
    });
    expectNoExternalRequests(page);
  });

  test('fails when the page fetches an external URL', async ({ page, context }) => {
    await context.route('https://example.invalid/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
    await openHarness(page);
    await page.evaluate(() => fetch('https://example.invalid/ping', { mode: 'no-cors' }));
    expect(() => expectNoExternalRequests(page)).toThrow();
  });
});

test.describe('expectNoExternalRequests blind spots', () => {
  test('fails when the page opens an external websocket', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => {
      const socket = new WebSocket('wss://example.invalid/socket');
      socket.onerror = () => undefined;
    });
    await expect
      .poll(() => {
        try {
          expectNoExternalRequests(page);
          return 'clean';
        } catch (error) {
          return String(error);
        }
      })
      .toMatch(/example\.invalid/);
  });

  test('passes for a same-origin websocket URL', async ({ page, baseURL }) => {
    await openHarness(page);
    const target = `ws://${new URL(baseURL ?? '').host}/socket`;
    await page.evaluate((url) => {
      const socket = new WebSocket(url);
      socket.onerror = () => undefined;
    }, target);
    expectNoExternalRequests(page);
  });

  test('fails when a popup in the same context requests an external URL', async ({ page, context }) => {
    await openHarness(page);
    const popup = context.waitForEvent('page');
    await page.evaluate(() => window.open('/__e2e__/blank.html'));
    const opened = await popup;
    await opened.evaluate(() => fetch('https://example.invalid/popup').catch(() => undefined));
    expect(() => expectNoExternalRequests(page)).toThrow(/example\.invalid\/popup/);
  });

  test('fails when a service worker requests an external URL', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit does not report service worker network events to Playwright');
    await openHarness(page);
    // Registered after the harness's inert worker route, so it wins (last registered runs first).
    await context.route('**/__e2e__/worker.js', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: "self.addEventListener('activate', () => fetch('https://example.invalid/from-sw').catch(() => undefined));",
      }),
    );
    await page.evaluate(() => navigator.serviceWorker.register('/__e2e__/worker.js'));
    await expect
      .poll(() => {
        try {
          expectNoExternalRequests(page);
          return 'clean';
        } catch (error) {
          return String(error);
        }
      })
      .toMatch(/from-sw/);
  });
});

test.describe('CSP probes on a real page under the final CSP', () => {
  test('a clean real page has no violations', async ({ page }) => {
    await page.goto('/privacidad');
    await expect(page.getByTestId('page-privacy')).toBeVisible();
    expectNoCspViolations(page);
  });

  test('a Trusted Types sink assignment is reported and fails expectNoCspViolations', async ({ page }) => {
    await page.goto('/privacidad');
    await page.evaluate(() => {
      try {
        document.createElement('div').innerHTML = '<b>sink</b>';
      } catch {
        // Enforced Trusted Types throws; the violation is reported either way.
      }
    });
    await expect.poll(() => collectCspViolations(page).length).toBeGreaterThan(0);
    expect(collectCspViolations(page).map((violation) => violation.directive)).toContain('require-trusted-types-for');
    expect(() => expectNoCspViolations(page)).toThrow();
  });

  test('an external fetch is reported as a connect-src violation', async ({ page }) => {
    await page.goto('/privacidad');
    await page.evaluate(() => fetch('https://example.invalid/ping').catch(() => undefined));
    await expect.poll(() => collectCspViolations(page).length).toBeGreaterThan(0);
    expect(collectCspViolations(page).map((violation) => violation.directive)).toContain('connect-src');
    expect(() => expectNoCspViolations(page)).toThrow();
  });
});

test.describe('expectNoA11yViolations', () => {
  test('passes on a clean page and fails on a serious violation', async ({ page }) => {
    await openHarness(page);
    await expectNoA11yViolations(page);
    await page.evaluate(() => {
      const img = document.createElement('img');
      img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
      document.body.append(img);
      const button = document.createElement('button');
      document.body.append(button);
    });
    await expect(expectNoA11yViolations(page)).rejects.toThrow();
  });
});

test.describe('seedFromBackup', () => {
  test('round-trips a synthetic v1 document with the layout of the Dexie database', async ({ page }) => {
    await openHarness(page);
    const document = syntheticBackupDocument();
    await seedFromBackup(page, document);

    expect(await readStore(page, 'loans')).toEqual(document.data.loans);
    expect(await readStore(page, 'events')).toEqual(document.data.events);
    expect(await readStore(page, 'settings')).toEqual(document.data.settings);

    const layout = await page.evaluate(
      () =>
        new Promise<{
          version: number;
          stores: Record<string, { keyPath: unknown; indexes: Record<string, unknown> }>;
        }>((resolve, reject) => {
          const open = indexedDB.open('cuotascasa');
          open.onerror = () => reject(open.error ?? new Error('open failed'));
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction([...db.objectStoreNames], 'readonly');
            const stores: Record<string, { keyPath: unknown; indexes: Record<string, unknown> }> = {};
            for (const name of db.objectStoreNames) {
              const store = tx.objectStore(name);
              stores[name] = {
                keyPath: store.keyPath,
                indexes: Object.fromEntries([...store.indexNames].map((n) => [n, store.index(n).keyPath])),
              };
            }
            const version = db.version;
            db.close();
            resolve({ version, stores });
          };
        }),
    );
    // Dexie 4 opens declared version 1 as native version 10; loans use id + [createdAt+id].
    expect(layout.version).toBe(10);
    expect(layout.stores['loans']).toEqual({ keyPath: 'id', indexes: { '[createdAt+id]': ['createdAt', 'id'] } });
    expect(layout.stores['meta']).toEqual({ keyPath: 'key', indexes: {} });
    expect(Object.keys(layout.stores).sort()).toEqual(
      ['events', 'loans', 'meta', 'payments', 'reportedBalances', 'scenarios', 'settings', 'snapshots'].sort(),
    );
  });
});
