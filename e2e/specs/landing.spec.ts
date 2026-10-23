import {
  expectNoA11yViolations,
  expectNoClientStorage,
  expectNoConsoleErrors,
  expectNoCspViolations,
  expectNoExternalRequests,
} from '../support/expectations.ts';
import { expect, test } from '../support/test.ts';

/** HU-01 / R1: the landing is prerendered, works without JS, and never touches network or storage. */

test.describe('landing /', () => {
  test('hydrates, makes no external requests, keeps no storage and is axe clean', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Calcula tus cuotas, mes a mes.');
    await page.waitForLoadState('networkidle');
    expectNoConsoleErrors(page);
    expectNoCspViolations(page);
    expectNoExternalRequests(page);
    await expectNoClientStorage(page);
    await expectNoA11yViolations(page);
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`axe clean in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      await expect(page.getByTestId('page-landing')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expectNoA11yViolations(page);
    });
  }

  test('links lead to /app and /privacidad', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav.getByRole('link', { name: 'Privacidad' })).toHaveAttribute('href', '/privacidad');
    await expect(nav.getByRole('link', { name: 'Abrir la app' })).toHaveAttribute('href', '/app');
  });

  test('«Cómo funciona» scrolls to the cards and moves focus there, without leaving /', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Cómo funciona' }).click();
    await expect(page.locator('#como')).toBeFocused();
    await expect(page.locator('#como h2')).toBeInViewport();
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('the footer carries the disclaimer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('contentinfo')).toContainText(
      'Cifras estimadas; el banco tiene la última palabra. No es asesoría financiera.',
    );
  });

  test('the mosaic lands on load, and a custom cursor follows a fine pointer', async ({ page }) => {
    await page.goto('/');
    const blocks = page.getByTestId('mosaic-block');
    await expect(blocks).toHaveCount(6);
    expect(await blocks.first().evaluate((el) => getComputedStyle(el).animationName)).toContain('land');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Calcula tus cuotas, mes a mes.');
    await page.mouse.move(200, 200);
    await expect(page.locator('.cursor')).toHaveCount(1);
    await expect(page.locator('.cursor')).toHaveAttribute('aria-hidden', 'true');
  });

  test('the custom cursor and its class go away when leaving the landing', async ({ page }) => {
    await page.goto('/');
    await page.mouse.move(200, 200);
    await expect(page.locator('.cursor')).toHaveCount(1);
    await page.getByRole('link', { name: 'Abrir la app' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator('.cursor')).toHaveCount(0);
  });
});

test.describe('landing / with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('shows the final headline and counters at once, with no cursor and no animation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('page-landing')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.mouse.move(200, 200);
    const counters = page.locator('[data-odometer]');
    for (let i = 0; i < 5; i++) {
      expect(await page.getByRole('heading', { level: 1 }).textContent()).toBe('Calcula tus cuotas, mes a mes.');
      expect(await counters.allTextContents()).toEqual(['240', 'Q 50,000', '35', 'Q 102,207']);
      await page.waitForTimeout(60);
    }
    await expect(page.locator('.cursor')).toHaveCount(0);
    const running = await page.evaluate(
      () => document.getAnimations().filter((animation) => animation.playState === 'running').length,
    );
    expect(running).toBe(0);
    expect(
      await page
        .getByTestId('mosaic-block')
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe('none');
  });
});

test.describe('landing / on a touch screen', () => {
  test.use({ hasTouch: true });

  test('has no custom cursor', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Calcula tus cuotas, mes a mes.');
    await page.waitForLoadState('networkidle');
    await page.mouse.move(200, 200);
    await expect(page.locator('.cursor')).toHaveCount(0);
  });
});

test.describe('landing / without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('renders the headline, the «Sin cuenta» promise, the counters and the disclaimer from the prerender', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Calcula tus cuotas, mes a mes.');
    await expect(page.getByText('Sin cuenta. Tus números se quedan en tu navegador.')).toBeVisible();
    await expect(page.locator('[data-odometer]')).toHaveText(['240', 'Q 50,000', '35', 'Q 102,207']);
    await expect(page.getByRole('link', { name: 'Abrir la app' })).toHaveAttribute('href', '/app');
    await expect(page.getByRole('contentinfo')).toContainText('No es asesoría financiera.');
  });
});
