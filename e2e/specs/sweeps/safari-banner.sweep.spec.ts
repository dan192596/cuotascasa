import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { readClientStorage } from '../../support/expectations.ts';
import { expect, test } from '../../support/test.ts';

/**
 * Safari banner (ADR-0017 decision 6, D26): the app shell hosts it, only Safari in a normal tab shows it, it folds for
 * the session without writing anything, and public pages never have it.
 */
const BANNER = (page: Page) => page.locator('cc-safari-banner').getByTestId('safari-banner');
const APP_ROUTES = ['/app', '/app/prestamos/nuevo', '/app/ajustes'] as const;

/** Pretends the app was installed to the home screen (display-mode and iOS navigator.standalone). */
async function emulateStandalone(page: Page, kind: 'display-mode' | 'navigator'): Promise<void> {
  await page.addInitScript((mode) => {
    if (mode === 'navigator') {
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
      return;
    }
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string): MediaQueryList => {
      const real = original(query);
      if (!query.includes('display-mode: standalone')) return real;
      return new Proxy(real, {
        get: (target, prop) => {
          if (prop === 'matches') return true;
          const value = Reflect.get(target, prop) as unknown;
          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
        },
      });
    };
  }, kind);
}

test.describe('WebKit in a normal tab', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'webkit', 'Only Safari/WebKit shows the banner');
  });

  test('is shown once, with its text, on every /app route', async ({ page }) => {
    for (const route of APP_ROUTES) {
      await page.goto(route);
      await expect(page.getByTestId('page-app')).toBeVisible();
      await expect(BANNER(page), route).toBeVisible();
      await expect(page.getByTestId('safari-banner'), `${route} has exactly one banner`).toHaveCount(1);
      await expect(page.getByTestId('safari-banner-body')).toContainText('Safari puede borrar los datos');
      await expect(page.getByTestId('safari-banner-body').getByRole('link')).toHaveAttribute('href', '/app/ajustes');
    }
  });

  test('is absent from the public pages', async ({ page }) => {
    for (const route of ['/', '/privacidad', '/no-existe']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('cc-safari-banner'), route).toHaveCount(0);
      await expect(page.getByTestId('safari-banner'), route).toHaveCount(0);
    }
  });

  test('folds for the session without storage and comes back on the next visit', async ({ page }) => {
    await page.goto('/app');
    const toggle = page.getByTestId('safari-banner-toggle');
    const body = page.getByTestId('safari-banner-body');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(body).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveText('Mostrar aviso de Safari');
    await expect(body).toBeHidden();

    // Moving inside the app keeps it folded (same session)...
    await page
      .getByRole('link', { name: /Ajustes/ })
      .first()
      .click();
    await expect(page.getByTestId('page-settings')).toBeVisible();
    await expect(page.getByTestId('safari-banner-toggle')).toHaveAttribute('aria-expanded', 'false');

    // ...and it never persists the fold (nothing in localStorage or sessionStorage).
    const storage = await readClientStorage(page);
    expect(storage.localStorage).toEqual([]);
    expect(storage.sessionStorage).toEqual([]);

    // A new visit shows it open again.
    await page.goto('/app');
    await expect(page.getByTestId('safari-banner-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('safari-banner-body')).toBeVisible();
  });

  test('is operable with the keyboard and passes axe open and folded, in both themes', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/app');
      const toggle = page.getByTestId('safari-banner-toggle');
      await expect(toggle).toBeVisible();
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press('Space');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      for (const folded of [false, true]) {
        if (folded) await page.keyboard.press('Enter');
        const { violations } = await new AxeBuilder({ page }).include('cc-safari-banner').analyze();
        expect(
          violations.map((violation) => `${violation.id} (${violation.impact ?? '?'})`),
          `${scheme}, folded=${String(folded)}`,
        ).toEqual([]);
      }
    }
  });

  for (const kind of ['display-mode', 'navigator'] as const) {
    test(`is absent when the app runs standalone (${kind})`, async ({ page }) => {
      await emulateStandalone(page, kind);
      await page.goto('/app');
      await expect(page.getByTestId('page-app')).toBeVisible();
      await page.waitForLoadState('networkidle');
      // The emulation really reaches the app: it sees the install signal it is supposed to react to.
      const installed = await page.evaluate(
        () =>
          matchMedia('(display-mode: standalone)').matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true,
      );
      expect(installed).toBe(true);
      await expect(page.getByTestId('safari-banner')).toHaveCount(0);
      await page.goto('/app/ajustes');
      await expect(page.getByTestId('page-settings')).toBeVisible();
      await expect(page.getByTestId('safari-banner')).toHaveCount(0);
    });
  }
});

test.describe('Chromium', () => {
  test('never shows the banner', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Chromium only');
    for (const route of APP_ROUTES) {
      await page.goto(route);
      await expect(page.getByTestId('page-app')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('safari-banner'), route).toHaveCount(0);
    }
  });
});
