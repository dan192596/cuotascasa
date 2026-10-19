import type { Page } from '@playwright/test';
import {
  expectNoA11yViolations,
  expectNoConsoleErrors,
  expectNoCspViolations,
  expectNoExternalRequests,
} from '../../support/expectations.ts';
import { seedFromBackup } from '../../support/seed.ts';
import { SYNTHETIC_LOAN_ID, syntheticBackupDocument } from '../../support/synthetic.ts';
import { expect, test } from '../../support/test.ts';
import { exportAs, expectExportBytes, mouseDriver, openFromDetail, pinClock, type Format } from './journey-kit.ts';

/** Exports of the table (three views) and of the comparison, checked byte by byte under the production headers. */

const FORMATS: readonly Format[] = ['csv', 'excel', 'pdf'];
const SCENARIO_ID = 'b0000000-0000-4000-8000-000000000001';

const STAMPS = {
  createdAt: '2026-10-04T15:00:00.000Z',
  updatedAt: '2026-10-04T15:00:00.000Z',
  updatedByDevice: 'd0000000-0000-4000-8000-000000000001',
  deletedAt: null,
} as const;

/** Opens the detail of the synthetic loan (with one scenario) through a real navigation, and returns its response headers. */
async function openDetail(page: Page): Promise<Record<string, string>> {
  await pinClock(page);
  await page.goto('/app');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  const document = syntheticBackupDocument();
  await seedFromBackup(page, {
    ...document,
    data: {
      ...document.data,
      scenarios: [
        {
          id: SCENARIO_ID,
          ...STAMPS,
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
        },
      ],
    },
  });
  const response = await page.goto(`/app/prestamos/${SYNTHETIC_LOAN_ID}`);
  await expect(page.getByTestId('page-loan-detail')).toBeVisible();
  return (await response?.allHeaders()) ?? {};
}

test.afterEach(({ page }) => {
  expectNoConsoleErrors(page);
  expectNoCspViolations(page);
  expectNoExternalRequests(page);
});

test.beforeEach((_fixtures, testInfo) => {
  testInfo.setTimeout(120_000);
});

test('the app is served with the production CSP and Trusted Types, and every export runs under them', async ({
  page,
}) => {
  const headers = await openDetail(page);
  const csp = headers['content-security-policy'] ?? '';
  expect(csp, 'enforced Content-Security-Policy on the app document').toContain("require-trusted-types-for 'script'");
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toMatch(/trusted-types [^;]*angular/);
  expect(headers['content-security-policy-report-only']).toBeUndefined();

  await openFromDetail(page, mouseDriver, 'Tabla de amortización', 'page-schedule');
  await expect(page.getByRole('grid')).toBeVisible();
  const schedule = page.locator('cc-schedule-page');
  // The writers are lazy chunks: they arrive on demand, after the notice is accepted.
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  for (const format of FORMATS) {
    const exported = await exportAs(page, mouseDriver, schedule, format, { firstOfSession: format === 'csv' });
    expectExportBytes(exported, { format, kind: 'tabla', view: 'real' });
  }
  expect(
    requested.some((url) => /\.js(\?|$)/.test(url)),
    'the writers arrive as lazy chunks, on demand',
  ).toBe(true);
});

test('table: the three views export in the three formats with the naming convention', async ({ page }) => {
  await openDetail(page);
  await openFromDetail(page, mouseDriver, 'Tabla de amortización', 'page-schedule');
  const schedule = page.locator('cc-schedule-page');
  await expect(page.getByRole('grid')).toBeVisible();
  await schedule.getByTestId('scenario-select').selectOption(SCENARIO_ID);

  let firstOfSession = true;
  for (const [radio, view] of [
    ['view-original', 'original'],
    ['view-real', 'real'],
    ['view-scenario', 'escenario'],
  ] as const) {
    await schedule.getByTestId(radio).check();
    await expect(schedule.getByTestId(radio)).toBeChecked();
    for (const format of FORMATS) {
      const exported = await exportAs(page, mouseDriver, schedule, format, { firstOfSession });
      firstOfSession = false;
      expectExportBytes(exported, { format, kind: 'tabla', view });
    }
  }
});

test('the CSV carries the schedule of the displayed view: installment rows, amounts and a BOM', async ({ page }) => {
  await openDetail(page);
  await openFromDetail(page, mouseDriver, 'Tabla de amortización', 'page-schedule');
  await expect(page.getByRole('grid')).toBeVisible();
  const schedule = page.locator('cc-schedule-page');
  const exported = await exportAs(page, mouseDriver, schedule, 'csv', { firstOfSession: true });
  expectExportBytes(exported, { format: 'csv', kind: 'tabla', view: 'real' });
  const text = new TextDecoder('utf-8').decode(exported.bytes.slice(3));
  // The synthetic loan has 240 installments (one is ended early by its real prepayment): hundreds of lines, with decimals.
  expect(text.split(/\r?\n/).length).toBeGreaterThan(100);
  expect(text).toMatch(/\d+\.\d{2}/);
  // Nothing from outside the synthetic data leaks into the file.
  expect(text).not.toContain('undefined');
  expect(text).not.toContain('NaN');
});

test('comparison: the three formats export under the same session notice', async ({ page }) => {
  await openDetail(page);
  await openFromDetail(page, mouseDriver, 'Proyecciones', 'page-scenarios');
  const compare = page.locator('cc-scenario-compare');
  await expect(compare.getByTestId('compare-metrics')).toBeVisible();
  let firstOfSession = true;
  for (const format of FORMATS) {
    const exported = await exportAs(page, mouseDriver, compare, format, { firstOfSession });
    firstOfSession = false;
    expectExportBytes(exported, { format, kind: 'comparacion', view: 'escenarios' });
  }
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page);
});

test('declining the notice downloads nothing and keeps the menu usable', async ({ page }) => {
  await openDetail(page);
  await openFromDetail(page, mouseDriver, 'Proyecciones', 'page-scenarios');
  const menu = page.locator('cc-scenario-compare cc-export-menu');
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await menu.getByTestId('export-trigger').click();
  await menu.getByTestId('format-pdf').click();
  await expect(menu.getByTestId('export-warning')).toBeVisible();
  await menu.getByTestId('warning-cancel').click();
  await expect(menu.getByTestId('export-warning')).toHaveCount(0);
  await expect(menu.getByTestId('export-trigger')).toBeFocused();
  await page.waitForTimeout(500);
  expect(downloads).toEqual([]);
  // The notice still comes first the next time, because nothing was accepted.
  await menu.getByTestId('export-trigger').click();
  await menu.getByTestId('format-csv').click();
  await expect(menu.getByTestId('export-warning')).toBeVisible();
});

test.describe('the byte checks fail on a wrong file (they are not vacuous)', () => {
  const body = (length: number, head: readonly number[]): Uint8Array => {
    const bytes = new Uint8Array(length).fill(0x41);
    bytes.set(head);
    return bytes;
  };

  test('a CSV without BOM, an Excel that is not a ZIP and a PDF without signature are rejected', () => {
    const name = (extension: string): string => `cuotascasa-tabla-real-2027-03-15.${extension}`;
    expect(() =>
      expectExportBytes(
        { fileName: name('csv'), bytes: body(400, [0x31, 0x2c]) },
        { format: 'csv', kind: 'tabla', view: 'real' },
      ),
    ).toThrow();
    expect(() =>
      expectExportBytes(
        { fileName: name('xlsx'), bytes: body(400, [0x4d, 0x5a]) },
        { format: 'excel', kind: 'tabla', view: 'real' },
      ),
    ).toThrow();
    expect(() =>
      expectExportBytes(
        { fileName: name('pdf'), bytes: body(400, [0x50, 0x4b]) },
        { format: 'pdf', kind: 'tabla', view: 'real' },
      ),
    ).toThrow();
    expect(() =>
      expectExportBytes(
        { fileName: 'tabla.csv', bytes: body(400, [0xef, 0xbb, 0xbf]) },
        { format: 'csv', kind: 'tabla', view: 'real' },
      ),
    ).toThrow();
  });
});
