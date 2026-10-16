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
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tu casa se va llenando');
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
    await expect(page.getByRole('link', { name: 'Cómo cuidamos tus datos' })).toHaveAttribute('href', '/privacidad');
    await expect(page.getByRole('link', { name: 'Empezar en la app' })).toHaveAttribute('href', '/app');
  });

  test('the footer carries the disclaimer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('contentinfo')).toContainText(
      'Cifras estimadas; el banco tiene la última palabra. No es asesoría financiera.',
    );
  });

  test('the hero animation runs normally and is off under prefers-reduced-motion', async ({ page }) => {
    await page.goto('/');
    const animationName = (): Promise<string> =>
      page.locator('.house .fill').evaluate((el) => getComputedStyle(el).animationName);
    expect(await animationName()).toContain('fill-in');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await animationName()).toBe('none');
  });
});

test.describe('landing / without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('renders the hero, privacy CTA and disclaimer from the prerender', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tu casa se va llenando, cuota a cuota.');
    await expect(page.getByText('Tus datos se quedan en tu navegador')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toContainText('No es asesoría financiera.');
  });
});
