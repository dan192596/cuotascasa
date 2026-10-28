import type { Page } from '@playwright/test';
import { expectNoA11yViolations, expectNoConsoleErrors } from '../support/expectations.ts';
import { seedFromBackup, type SeedDocument } from '../support/seed.ts';
import { syntheticBackupDocument } from '../support/synthetic.ts';
import { expect, test } from '../support/test.ts';

const SECOND_LOAN_ID = 'a0000000-0000-4000-8000-000000000002';

/** The synthetic backup plus a second invented loan, so the page must show the alias of the right one. */
function twoLoanDocument(): SeedDocument {
  const base = syntheticBackupDocument();
  const loans = base.data['loans'] as Record<string, unknown>[];
  const first = loans[0] as Record<string, unknown>;
  const second = { ...first, id: SECOND_LOAN_ID, name: 'Casa B', fixedCharges: [] };
  return { ...base, data: { ...base.data, loans: [first, second] } };
}

async function seed(page: Page): Promise<void> {
  await page.goto('/app');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await seedFromBackup(page, twoLoanDocument());
}

test.afterEach(({ page }) => {
  expectNoConsoleErrors(page);
});

for (const [route, testId, heading, title] of [
  ['datos-reales', 'page-real-data', 'Datos reales · Casa B', 'Datos reales · Casa B'],
  ['proyecciones', 'page-scenarios', 'Proyecciones · Casa B', 'Proyecciones · Casa B'],
  ['tabla', 'page-schedule', 'Tabla de amortización · Casa B', 'Tabla de amortización · Casa B'],
] as const) {
  test(`${route} of the second loan opened by URL names its loan and links back`, async ({ page }) => {
    await seed(page);
    await page.goto(`/app/prestamos/${SECOND_LOAN_ID}/${route}`);
    await expect(page.getByTestId(testId)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page).toHaveTitle(new RegExp(title));
    const back = page.getByTestId('back-to-loan');
    await expect(back).toHaveText('← Volver al préstamo');
    await expect(back).toHaveAttribute('href', `/app/prestamos/${SECOND_LOAN_ID}`);
    await expectNoA11yViolations(page);
  });
}
