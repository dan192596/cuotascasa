import { readFileSync } from 'node:fs';
import {
  expectNoA11yViolations,
  expectNoClientStorage,
  expectNoConsoleErrors,
  expectNoCspViolations,
  expectNoExternalRequests,
} from '../support/expectations.ts';
import { expect, test } from '../support/test.ts';

// Required headings come from the frozen spec (cwd = repository root when the suite runs).
const DOC = readFileSync(new URL('../../docs/specs/privacy-requirements.md', import.meta.url), 'utf8');
const SECTION = DOC.split('## Encabezados obligatorios')[1]?.split('\n## ')[0] ?? '';
const HEADINGS = [...SECTION.matchAll(/^- `([^`]+)`/gm)].map((match) => match[1] ?? '');

test('/privacidad shows every required section, makes no external request and is accessible', async ({ page }) => {
  const response = await page.goto('/privacidad');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Política de privacidad' })).toBeVisible();
  expect(HEADINGS.length).toBe(11);
  for (const heading of HEADINGS) {
    await expect(page.getByRole('heading', { level: 2, name: heading, exact: true }), heading).toBeVisible();
  }
  await expect(page.getByTestId('privacy-updated')).toContainText(/\d{2}\/\d{2}\/\d{4}/);
  expect(await page.locator('main').count()).toBe(1);
  expect(await page.content()).not.toMatch(/mailto:|[\w.+-]+@[\w-]+\.[\w.]+/);
  await page.waitForLoadState('networkidle');

  expectNoConsoleErrors(page);
  expectNoCspViolations(page);
  expectNoExternalRequests(page);
  await expectNoClientStorage(page);
  await expectNoA11yViolations(page);
});

test('/nope answers 404 with the libreta not-found page and offers a way home', async ({ page }) => {
  const response = await page.goto('/nope');
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId('page-not-found')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/');
  await page.waitForLoadState('networkidle');

  expectNoConsoleErrors(page, { expectFailedDocument: true });
  expectNoCspViolations(page);
  expectNoExternalRequests(page);
  await expectNoClientStorage(page);
  await expectNoA11yViolations(page);
});
