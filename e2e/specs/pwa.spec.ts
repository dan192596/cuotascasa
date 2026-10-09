import type { Page } from '@playwright/test';
import {
  expectNoClientStorage,
  expectNoConsoleErrors,
  expectNoCspViolations,
  readClientStorage,
} from '../support/expectations.ts';
import { expect, test } from '../support/test.ts';

/** ADR-0023: scope `/`, manual registration only after the first NavigationEnd into /app, Trusted Types policy. */

async function registrationScopes(page: Page): Promise<string[]> {
  return page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).map((registration) => registration.scope),
  );
}

/** Waits until the worker is active, controls the page and has finished installing its caches. */
async function waitForWorkerReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Angular's worker claims the clients on activation; a reload makes control certain.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect
    .poll(async () => (await readClientStorage(page)).cacheStorage.length, { message: 'ngsw caches' })
    .toBeGreaterThan(0);
  // Prefetch of the shell and lazy chunks happens during install; the data cache appears once it is done.
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const names = await caches.keys();
          const assets = names.find((name) => name.includes(':assets:'));
          return assets === undefined ? 0 : (await (await caches.open(assets)).keys()).length;
        }),
      { message: 'prefetched assets' },
    )
    .toBeGreaterThan(0);
}

test.describe('public pages never get a service worker (ADR-0017, ADR-0023)', () => {
  for (const path of ['/', '/privacidad']) {
    test(`${path} in a fresh context: no registration and no CacheStorage`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      // Give a late registration every chance to appear.
      await page.waitForTimeout(500);
      expect(await registrationScopes(page)).toEqual([]);
      await expectNoClientStorage(page);
      expectNoConsoleErrors(page);
      expectNoCspViolations(page);
    });
  }

  test('visiting / then /privacidad one after the other still registers nothing', async ({ page }) => {
    await page.goto('/');
    await page.goto('/privacidad');
    await expect(page.getByTestId('page-privacy')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await registrationScopes(page)).toEqual([]);
    await expectNoClientStorage(page);
  });
});

test.describe('/app registers the worker by hand with scope / and works offline', () => {
  test('after /app there is exactly one registration, scoped to /, with no CSP or Trusted Types error', async ({
    page,
    baseURL,
  }) => {
    await page.goto('/app');
    await expect(page.getByTestId('page-dashboard')).toBeVisible();
    await waitForWorkerReady(page);
    expect(await registrationScopes(page)).toEqual([`${baseURL ?? ''}/`]);
    expectNoConsoleErrors(page);
    expectNoCspViolations(page);
  });

  test('Chromium: after one online visit, /app, /app/ and a deep route render without network', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'offline navigation is measured on Chromium (ADR-0023); WebKit is manual');
    await page.goto('/app');
    await expect(page.getByTestId('page-dashboard')).toBeVisible();
    await waitForWorkerReady(page);
    // The worker must control the document it serves offline, so reload once while still online.
    await page.reload();
    await waitForWorkerReady(page);

    await context.setOffline(true);
    for (const [path, testId] of [
      ['/app/prestamos/nuevo', 'page-loan-new'],
      ['/app', 'page-dashboard'],
      ['/app/', 'page-dashboard'],
      ['/app/ajustes', 'page-settings'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByTestId('page-app'), path).toBeVisible();
      await expect(page.getByTestId(testId), path).toBeVisible();
    }
    expectNoCspViolations(page);
    await context.setOffline(false);
  });

  test('once the worker controls the page, / and /privacidad still load from the network', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'offline navigation is measured on Chromium (ADR-0023)');
    await page.goto('/app');
    await waitForWorkerReady(page);
    await page.goto('/privacidad');
    await expect(page.getByTestId('page-privacy')).toBeVisible();
    // Public documents are not in navigationUrls and are never cached: offline they fail like without a worker.
    await context.setOffline(true);
    const outcome = await page.goto('/privacidad').then(
      (response) => response?.ok() === true,
      () => false,
    );
    expect(outcome).toBe(false);
    await context.setOffline(false);
  });
});
