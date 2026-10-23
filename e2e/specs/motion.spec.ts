import type { Page } from '@playwright/test';
import {
  expectNoA11yViolations,
  expectNoConsoleErrors,
  expectNoCspViolations,
  expectNoExternalRequests,
} from '../support/expectations.ts';
import { seedFromBackup } from '../support/seed.ts';
import { SYNTHETIC_LOAN_ID, syntheticBackupDocument } from '../support/synthetic.ts';
import { expect, test } from '../support/test.ts';

/**
 * W8-05: motion of the wizard, the table and the comparison. With reduced motion nothing is left running after
 * navigating; without it the wizard step has an entry animation. Axe passes in light and dark on the touched screens.
 */
test.afterEach(({ page }) => {
  expectNoConsoleErrors(page);
  expectNoCspViolations(page);
  expectNoExternalRequests(page);
});

const SCENARIO = {
  id: 'b0000000-0000-4000-8000-000000000001',
  createdAt: '2026-10-04T15:00:00.000Z',
  updatedAt: '2026-10-04T15:00:00.000Z',
  updatedByDevice: 'd0000000-0000-4000-8000-000000000001',
  deletedAt: null,
  loanId: SYNTHETIC_LOAN_ID,
  name: 'Abono grande',
  events: [
    {
      id: 'c0000000-0000-4000-8000-000000000001',
      date: '2027-01-31',
      type: 'Prepayment',
      amount: '50000.00',
      mode: 'REDUCE_TERM',
      deletedAt: null,
    },
  ],
};

async function seed(page: Page): Promise<void> {
  await page.goto('/app');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  const document = syntheticBackupDocument();
  await seedFromBackup(page, { ...document, data: { ...document.data, scenarios: [SCENARIO] } });
}

const running = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.playState === 'running')
      .map((animation) => (animation as CSSAnimation).animationName ?? animation.id),
  );

async function toNextWizardStep(page: Page): Promise<void> {
  await page.goto('/app/prestamos/nuevo');
  await page.getByLabel('Alias', { exact: true }).fill('Casa de prueba');
  await page.getByRole('button', { name: /Siguiente/ }).click();
  await expect(page.getByRole('heading', { level: 2 })).toContainText('Paso 2 de 4');
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('leaves no running animation in the wizard, the table or the comparison', async ({ page }) => {
    await seed(page);
    await toNextWizardStep(page);
    await expect.poll(() => running(page)).toEqual([]);

    await page.goto(`/app/prestamos/${SYNTHETIC_LOAN_ID}/tabla`);
    await expect(page.getByRole('grid')).toBeVisible();
    await expect.poll(() => running(page)).toEqual([]);

    await page.goto(`/app/prestamos/${SYNTHETIC_LOAN_ID}/proyecciones`);
    await expect(page.getByTestId('compare-metrics')).toBeVisible();
    await page.getByTestId('chart-placeholder').scrollIntoViewIfNeeded();
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => running(page)).toEqual([]);
  });
});

test.describe('with motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('the wizard step enters with an animation, direction aware', async ({ page }) => {
    await page.goto('/app/prestamos/nuevo');
    await page.getByLabel('Alias', { exact: true }).fill('Casa de prueba');
    const step = page.getByTestId('wizard-step');
    await page.getByRole('button', { name: /Siguiente/ }).click();
    await expect(step).toHaveAttribute('data-direction', 'forward');
    const names = await step
      .locator('> form')
      .evaluate((form) => form.getAnimations().map((a) => (a as CSSAnimation).animationName));
    expect(names).toContain('cc-wiz-in-forward');
    await page.getByRole('button', { name: /Atrás/ }).click();
    await expect(step).toHaveAttribute('data-direction', 'back');
  });
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`axe passes on the wizard, the table and the comparison in ${colorScheme} mode`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme });
    await seed(page);
    await toNextWizardStep(page);
    await expectNoA11yViolations(page);
    await page.goto(`/app/prestamos/${SYNTHETIC_LOAN_ID}/tabla`);
    await expect(page.getByRole('grid')).toBeVisible();
    await expectNoA11yViolations(page);
    await page.goto(`/app/prestamos/${SYNTHETIC_LOAN_ID}/proyecciones`);
    await expect(page.getByTestId('compare-metrics')).toBeVisible();
    await expectNoA11yViolations(page);
  });
}
