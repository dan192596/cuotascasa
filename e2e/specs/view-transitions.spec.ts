import type { Page } from '@playwright/test';
import { expectNoConsoleErrors, expectNoCspViolations, expectNoExternalRequests } from '../support/expectations.ts';
import { seedFromBackup } from '../support/seed.ts';
import { SYNTHETIC_LOAN_ID, syntheticBackupDocument } from '../support/synthetic.ts';
import { expect, test } from '../support/test.ts';

/**
 * W8-02: route View Transitions. Navigating fast while a transition runs (back before it ends, or two clicks in a row)
 * must leave the right URL and content and no console errors, with and without reduced motion. A browser without
 * document.startViewTransition navigates the same: the router simply skips the transition.
 */
const DETAIL_URL = new RegExp(`/app/prestamos/${SYNTHETIC_LOAN_ID}$`);
const DASHBOARD_URL = /\/app$/;

/** Counts document.startViewTransition calls, so the spec can tell the router really used it where supported. */
async function countViewTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const counter = window as unknown as { ccViewTransitions: number };
    counter.ccViewTransitions = 0;
    const original = Document.prototype.startViewTransition as Document['startViewTransition'] | undefined;
    if (original === undefined) return;
    Document.prototype.startViewTransition = function (this: Document, ...args) {
      counter.ccViewTransitions += 1;
      return original.apply(this, args);
    } as Document['startViewTransition'];
  });
}

async function openSeededDashboard(page: Page): Promise<void> {
  await countViewTransitions(page);
  await page.goto('/app');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await seedFromBackup(page, syntheticBackupDocument());
  await page.reload();
  await expect(page.getByTestId('loan-card')).toBeVisible();
}

const cardLink = (page: Page) => page.getByTestId('loan-card').getByRole('link', { name: 'Casa A' });

async function expectOnDetail(page: Page): Promise<void> {
  await expect(page).toHaveURL(DETAIL_URL);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Casa A');
}

async function expectTransitionsUsedWhereSupported(page: Page): Promise<void> {
  const { supported, count } = await page.evaluate(() => ({
    supported: 'startViewTransition' in document,
    count: (window as unknown as { ccViewTransitions: number }).ccViewTransitions,
  }));
  if (supported) expect(count).toBeGreaterThan(0);
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test.describe(`prefers-reduced-motion: ${reducedMotion}`, () => {
    test.use({ reducedMotion });

    test.afterEach(({ page }) => {
      expectNoConsoleErrors(page);
      expectNoCspViolations(page);
      expectNoExternalRequests(page);
    });

    test('card click, immediate back and another click end on the loan detail', async ({ page }) => {
      await openSeededDashboard(page);

      await cardLink(page).click();
      // Back as soon as the URL commits, while the transition (if any) is still running.
      await page.waitForURL(DETAIL_URL, { waitUntil: 'commit' });
      await page.goBack();
      await expect(page).toHaveURL(DASHBOARD_URL);
      await expect(page.getByTestId('loan-card')).toBeVisible();

      await cardLink(page).click();
      await expectOnDetail(page);
      await expectTransitionsUsedWhereSupported(page);
    });

    test('two clicks in a row on the card end on the loan detail', async ({ page }) => {
      await openSeededDashboard(page);

      // A double click fires two clicks back to back: the second lands while the first navigation is in flight.
      await cardLink(page).dblclick();
      await expectOnDetail(page);
    });
  });
}
