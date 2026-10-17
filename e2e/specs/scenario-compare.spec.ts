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

/** Invented scenarios of the synthetic loan. The real prepayment sits at k = 14, so every event here is after it. */
const STAMPS = {
  createdAt: '2026-10-04T15:00:00.000Z',
  updatedAt: '2026-10-04T15:00:00.000Z',
  updatedByDevice: 'd0000000-0000-4000-8000-000000000001',
  deletedAt: null,
} as const;

function scenario(n: number, name: string, date: string, amount: string, mode: 'REDUCE_TERM' | 'REDUCE_INSTALLMENT') {
  const suffix = String(n).padStart(12, '0');
  return {
    id: `b0000000-0000-4000-8000-${suffix}`,
    ...STAMPS,
    loanId: SYNTHETIC_LOAN_ID,
    name,
    events: [
      {
        id: `c0000000-0000-4000-8000-${suffix}`,
        date,
        type: 'Prepayment',
        amount,
        mode,
        deletedAt: null,
      },
    ],
  };
}

const SCENARIOS = [
  scenario(1, 'Abono grande', '2027-01-31', '50000.00', 'REDUCE_TERM'),
  scenario(2, 'Abono a la cuota', '2027-06-30', '30000.00', 'REDUCE_INSTALLMENT'),
  scenario(3, 'Abono chico', '2027-03-31', '5000.00', 'REDUCE_TERM'),
  scenario(4, 'Abono tardío', '2028-01-31', '20000.00', 'REDUCE_TERM'),
  // k = 5 is not after the real prepayment (k = 14): the engine rejects it and the comparison must say so.
  scenario(5, 'Abono antiguo', '2025-06-30', '1000.00', 'REDUCE_TERM'),
];

async function openComparison(page: Page): Promise<void> {
  await page.goto('/app');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  const document = syntheticBackupDocument();
  await seedFromBackup(page, { ...document, data: { ...document.data, scenarios: SCENARIOS } });
  await page.goto(`/app/prestamos/${SYNTHETIC_LOAN_ID}/proyecciones`);
  await expect(page.getByTestId('compare-metrics')).toBeVisible();
}

const options = (page: Page) => page.getByTestId('scenario-option');
const chartScripts = (urls: readonly string[]) => urls.filter((url) => /\.js(\?|$)/.test(url));

test.describe('scenario comparison', () => {
  test.use({ viewport: { width: 1280, height: 500 } });

  test('shows the metrics of the first three scenarios side by side', async ({ page }) => {
    await openComparison(page);
    await expect(options(page)).toHaveCount(5);
    const headings = page.getByTestId('compare-metrics').locator('thead th');
    await expect(headings).toHaveText([
      'Concepto',
      'Original',
      'Real (base)',
      'Abono grande',
      'Abono a la cuota',
      'Abono chico',
    ]);
    const net = page
      .getByTestId('compare-metrics')
      .locator('tbody tr', { has: page.getByRole('rowheader', { name: 'Ahorro neto' }) });
    await expect(net.locator('td').nth(2)).toContainText('Q ');
    await expect(page.getByTestId('compare-status')).toContainText('Comparando 3 escenarios');
  });

  test('blocks a 4th scenario with a message and accepts it after one is removed', async ({ page }) => {
    await openComparison(page);
    await options(page).nth(3).click();
    await expect(options(page).nth(3)).not.toBeChecked();
    await expect(page.getByTestId('compare-status')).toContainText('hasta 3 escenarios');
    await options(page).nth(0).uncheck();
    await options(page).nth(3).check();
    await expect(options(page).nth(3)).toBeChecked();
    await expect(
      page.getByTestId('compare-metrics').locator('thead th').filter({ hasText: 'Abono tardío' }),
    ).toHaveCount(1);
  });

  test('keeps the comparison and names a scenario the engine cannot compute', async ({ page }) => {
    await openComparison(page);
    await options(page).nth(2).uncheck();
    await options(page).nth(4).check();
    const failed = page.getByTestId('compare-failed');
    await expect(failed).toContainText('Abono antiguo');
    await expect(failed).toContainText('cuota');
    await expect(page.getByTestId('compare-metrics')).toBeVisible();
  });

  test('loads the chart chunk only when the chart scrolls into view', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (request) => scripts.push(request.url()));
    await openComparison(page);
    const placeholder = page.getByTestId('chart-placeholder');
    await expect(placeholder).toBeAttached();
    await expect(placeholder).not.toBeInViewport();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('canvas')).toHaveCount(0);
    const before = new Set(chartScripts(scripts));

    await placeholder.scrollIntoViewIfNeeded();
    await expect(page.locator('canvas')).toBeVisible();
    const added = chartScripts(scripts).filter((url) => !before.has(url));
    expect(added.length, 'new script chunks after the chart became visible').toBeGreaterThan(0);
    const bodies = await Promise.all(added.map(async (url) => (await page.request.get(url)).text()));
    // Minified, so look for strings that survive: Chart.js's canvas sizing and our own axis title.
    const isChart = (body: string): boolean => body.includes('devicePixelRatio') && body.includes('Número de cuota');
    expect(bodies.some(isChart), 'the chart chunk is the one that arrived').toBe(true);
    const initial = await Promise.all([...before].map(async (url) => (await page.request.get(url)).text()));
    expect(initial.some((body) => body.includes('devicePixelRatio') || body.includes('Número de cuota'))).toBe(false);

    await page.waitForLoadState('networkidle');
    expectNoConsoleErrors(page);
    expectNoCspViolations(page);
    expectNoExternalRequests(page);
    await expectNoA11yViolations(page);
  });

  test('offers the chart data as a table reachable with the keyboard', async ({ page }) => {
    await openComparison(page);
    const details = page.getByTestId('chart-data-details');
    const summary = details.locator('summary');
    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(details).toHaveJSProperty('open', true);
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('chart-data-region')).toBeFocused();
    await expect(page.getByTestId('chart-data-region').locator('tbody tr').first()).toContainText('Q ');
    await expectNoA11yViolations(page);
  });
});
