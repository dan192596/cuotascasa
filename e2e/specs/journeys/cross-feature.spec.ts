import type { Browser, BrowserContext, Page } from '@playwright/test';
import {
  expectNoA11yViolations,
  expectNoConsoleErrors,
  expectNoCspViolations,
  expectNoExternalRequests,
} from '../../support/expectations.ts';
import { startRecording } from '../../support/recorder.ts';
import { readStore } from '../../support/seed.ts';
import { expect, test } from '../../support/test.ts';
import {
  backToDetail,
  CONDITIONS,
  countPointerPresses,
  createLoanThroughWizard,
  createScenarioWithAbono,
  exportAs,
  expectExportBytes,
  keyboardDriver,
  mouseDriver,
  openFromDetail,
  pinClock,
  reportBalance,
  type Driver,
  type Format,
} from './journey-kit.ts';

const FORMATS: readonly Format[] = ['csv', 'excel', 'pdf'];

test.afterEach(({ page }) => {
  // Zero CSP and Trusted Types violations (enforced and report-only) and no console errors in every step of the journey.
  expectNoConsoleErrors(page);
  expectNoCspViolations(page);
  expectNoExternalRequests(page);
});

/** A second, empty browser profile on the same origin, with the same guards as the `test` fixtures. */
async function freshProfile(browser: Browser, baseURL: string): Promise<{ context: BrowserContext; page: Page }> {
  const origin = new URL(baseURL).origin;
  const context = await browser.newContext({ baseURL, locale: 'es-GT' });
  await context.route('**', (route) => {
    const url = new URL(route.request().url());
    const web = url.protocol === 'http:' || url.protocol === 'https:';
    return web && url.origin !== origin ? route.abort('blockedbyclient') : route.fallback();
  });
  const page = await context.newPage();
  await startRecording(page, origin);
  await pinClock(page);
  return { context, page };
}

const ledgerRow = (page: Page, k: number) =>
  page
    .getByRole('grid')
    .locator('[role="row"]', { has: page.locator('[data-c="0"]', { hasText: new RegExp(`^\\s*${String(k)}\\s*$`) }) });

/**
 * The whole product in one pass: create a loan, report a balance, see the Real Δ in real data and in the table, plan a
 * scenario with an abono, compare, export (table and comparison) and move everything to another browser through a backup.
 */
async function runJourney(
  page: Page,
  browser: Browser,
  baseURL: string,
  driver: Driver,
  pointerPresses: () => number,
): Promise<void> {
  await pinClock(page);
  await createLoanThroughWizard(page, driver);
  const detail = page.url();

  // 1. Reported balance -> Real Δ in real data.
  await openFromDetail(page, driver, 'Datos reales', 'page-real-data');
  await reportBalance(page, driver);
  await expectNoA11yViolations(page);
  await backToDetail(page);

  // 2. The same Real Δ is visible in the table (view Real), and the table exports in the three formats. The first
  //    download of the session shows the notice; the next ones do not.
  await openFromDetail(page, driver, 'Tabla de amortización', 'page-schedule');
  await expect(page.getByRole('grid')).toBeVisible();
  const first = ledgerRow(page, 1);
  await expect(first.locator('[data-c="11"]')).toContainText('-1,000.00');
  const schedule = page.locator('cc-schedule-page');
  let firstOfSession = true;
  for (const format of FORMATS) {
    const exported = await exportAs(page, driver, schedule, format, { firstOfSession });
    firstOfSession = false;
    expectExportBytes(exported, { format, kind: 'tabla', view: 'real' });
  }
  await backToDetail(page);

  // 3. Scenario with an abono, and the comparison with its three exports (no notice again: same session).
  await openFromDetail(page, driver, 'Proyecciones', 'page-scenarios');
  await createScenarioWithAbono(page, driver);
  const compare = page.locator('cc-scenario-compare');
  await expect(compare.getByTestId('compare-metrics')).toBeVisible();
  for (const format of FORMATS) {
    const exported = await exportAs(page, driver, compare, format, { firstOfSession: false });
    expectExportBytes(exported, { format, kind: 'comparacion', view: 'escenarios' });
  }
  await expectNoA11yViolations(page);
  await backToDetail(page);

  // 4. The table now has an active scenario: its view exports with the scenario name in the file.
  await openFromDetail(page, driver, 'Tabla de amortización', 'page-schedule');
  await expect(page.getByRole('grid')).toBeVisible();
  await driver.check(page.locator('cc-schedule-page').getByTestId('view-scenario'));
  await expect(page.getByTestId('scenario-summary')).toContainText('Fin con el escenario:');
  expectExportBytes(await exportAs(page, driver, schedule, 'csv', { firstOfSession: false }), {
    format: 'csv',
    kind: 'tabla',
    view: 'escenario',
  });

  // 5. Backup round trip: export the plain JSON (notice first) and import it in an empty browser profile.
  await page.goto('/app/ajustes');
  const backup = page.locator('cc-settings-backup');
  await expect(backup.getByTestId('settings-backup')).toBeVisible();
  await driver.press(backup.getByTestId('export-plain'));
  await expect(backup.getByTestId('plain-warning')).toContainText('el respaldo JSON no va cifrado');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    driver.press(backup.getByTestId('warning-continue')),
  ]);
  const path = await download.path();
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.json$/);

  const other = await freshProfile(browser, baseURL);
  try {
    await other.page.goto('/app/ajustes');
    const importing = other.page.locator('cc-settings-backup');
    await importing.getByTestId('import-file').setInputFiles(path);
    await expect(importing.getByTestId('import-preview')).toBeVisible();
    await expect(importing.getByTestId('preview-row-loans')).toContainText('1');
    await expect(importing.getByTestId('preview-row-scenarios')).toContainText('1');
    await driver.press(importing.getByTestId('import-confirm'));
    await expect(importing.getByTestId('undo')).toBeVisible();

    // The imported data is the same: the loan, its reported balance (Real Δ) and its scenario.
    expect(await readStore(other.page, 'reportedBalances')).toHaveLength(1);
    await other.page.goto('/app');
    await expect(other.page.getByTestId('loan-card')).toContainText(CONDITIONS.alias);
    await other.page.goto(detail.replace(new URL(detail).origin, ''));
    await openFromDetail(other.page, driver, 'Datos reales', 'page-real-data');
    await expect(other.page.getByTestId('real-delta')).toHaveText('Real Δ: -Q 1,000.00');
    expectNoConsoleErrors(other.page);
    expectNoCspViolations(other.page);
    expectNoExternalRequests(other.page);
  } finally {
    await other.context.close();
  }

  if (driver.name === 'keyboard') expect(pointerPresses(), 'pointer presses in a keyboard-only journey').toBe(0);
}

test.describe('cross-feature journeys', () => {
  test.describe.configure({ timeout: 180_000 });

  test('journey 1: loan, reported balance, Real Δ, scenario, comparison, exports and backup round trip', async ({
    page,
    browser,
    baseURL,
  }) => {
    if (baseURL === undefined) throw new Error('baseURL is required');
    await runJourney(page, browser, baseURL, mouseDriver, () => 0);
  });

  test('journey 2: the same journey with the keyboard only (no pointer press)', async ({ page, browser, baseURL }) => {
    if (baseURL === undefined) throw new Error('baseURL is required');
    const pointerPresses = await countPointerPresses(page);
    await runJourney(page, browser, baseURL, keyboardDriver, pointerPresses);
  });
});
