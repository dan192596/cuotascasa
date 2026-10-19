import type { Page } from '@playwright/test';
import {
  expectNoA11yViolations,
  expectNoConsoleErrors,
  expectNoCspViolations,
  expectNoExternalRequests,
} from '../support/expectations.ts';
import { readStore, seedFromBackup } from '../support/seed.ts';
import { SYNTHETIC_LOAN_ID, syntheticBackupDocument } from '../support/synthetic.ts';
import { expect, test } from '../support/test.ts';

/** Column order of the ledger: # · Vence · Saldo inicial · Interés · Seguro · Capital · Fijos · Total · Saldo final · Abono. */
const ABONO_COLUMN = 9;

test.afterEach(({ page }) => {
  expectNoConsoleErrors(page);
  expectNoCspViolations(page);
  expectNoExternalRequests(page);
});

async function seedAndOpen(page: Page): Promise<void> {
  await page.goto('/app');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await seedFromBackup(page, syntheticBackupDocument());
  await page.goto(`/app/prestamos/${SYNTHETIC_LOAN_ID}/tabla`);
  await expect(page.getByRole('grid')).toBeVisible();
}

/** First text of the focused row and the focused column index, read from the DOM. */
async function focusedCell(page: Page): Promise<{ readonly row: string; readonly column: number } | null> {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const cell = active?.closest<HTMLElement>('[role="gridcell"], [role="columnheader"]');
    if (!cell || !cell.closest('[role="grid"]')) return null;
    const row = cell.closest('[role="row"]')?.querySelector('[data-c="0"]')?.textContent?.trim() ?? '';
    return { row, column: Number(cell.dataset['c'] ?? '-1') };
  });
}

/** Due date (dd/mm/aaaa) of the last installment row of the displayed table. */
async function lastDueDate(page: Page): Promise<string> {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role="grid"] [role="row"]')].filter((row) =>
      /^\d+$/.test(row.querySelector('[data-c="0"]')?.textContent?.trim() ?? ''),
    );
    return rows.at(-1)?.querySelector('[data-c="1"]')?.textContent?.trim() ?? '';
  });
}

test('keyboard only: type an abono in the table, it lands in a new «Borrador» scenario and no real data changes', async ({
  page,
}) => {
  // axe walks the whole 240-row grid (about 8 s per run), twice.
  // axe walks the whole 240-row grid twice; under parallel load each pass can take well over 20 s.
  test.setTimeout(300_000);
  await seedAndOpen(page);
  await expectNoA11yViolations(page);

  const readReal = async () => ({
    events: await readStore(page, 'events'),
    reportedBalances: await readStore(page, 'reportedBalances'),
    payments: await readStore(page, 'payments'),
  });
  const realBefore = await readReal();
  expect(realBefore.events).toHaveLength(1);
  expect(realBefore.reportedBalances).toHaveLength(0);
  expect(realBefore.payments).toHaveLength(0);
  expect(await readStore(page, 'scenarios')).toHaveLength(0);
  await expect(page.getByTestId('scenario-summary')).toHaveCount(0);
  const realEnd = await lastDueDate(page);
  expect(realEnd).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);

  // Tab into the grid (roving tabindex), then move with the arrow keys to the Abono cell of installment 15.
  // The seed has one real prepayment at installment 14, so 15 is the first editable row.
  for (let presses = 0; presses < 30 && (await focusedCell(page)) === null; presses += 1) {
    await page.keyboard.press('Tab');
  }
  expect(await focusedCell(page)).not.toBeNull();
  for (let presses = 0; presses < ABONO_COLUMN; presses += 1) await page.keyboard.press('ArrowRight');
  for (let presses = 0; presses < 40 && (await focusedCell(page))?.row !== '15'; presses += 1) {
    await page.keyboard.press('ArrowDown');
  }
  expect(await focusedCell(page)).toEqual({ row: '15', column: ABONO_COLUMN });

  await page.keyboard.press('Enter');
  // The in-cell editor mounts after Enter; typing before it has focus loses the digits (flaky under load).
  await expect(page.locator('cc-ledger-table input:focus')).toBeVisible();
  await page.keyboard.type('20000');
  await page.keyboard.press('Enter');

  // No active scenario: the app offers «Borrador». Focus starts on the safe action; the accept button is reached with
  // Tab on Chromium. Safari's default Tab order skips buttons, so focus it directly and activate it with the keyboard.
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Borrador');
  await expect(page.getByTestId('confirm-cancel')).toBeFocused();
  await page.getByTestId('confirm-ok').focus();
  await page.keyboard.press('Enter');

  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('view-scenario')).toBeChecked();
  await expect(page.getByTestId('schedule-status')).toContainText('Borrador');
  const summary = page.getByTestId('scenario-summary');
  await expect(summary).toContainText('Fin con el escenario:');
  await expect(summary).toContainText(`camino real: ${realEnd}`);
  const scenarioEnd = /Fin con el escenario: (\d{2}\/\d{2}\/\d{4})/.exec((await summary.textContent()) ?? '')?.[1];
  expect(scenarioEnd).toBeDefined();
  expect(scenarioEnd).not.toBe(realEnd);
  expect(await lastDueDate(page)).toBe(scenarioEnd);

  // Exactly one scenario with exactly one Prepayment; the real collections did not change.
  const scenarios = (await readStore(page, 'scenarios')) as { name: string; events: Record<string, unknown>[] }[];
  expect(scenarios).toHaveLength(1);
  expect(scenarios[0]?.name).toBe('Borrador');
  expect(scenarios[0]?.events).toHaveLength(1);
  expect(scenarios[0]?.events[0]).toMatchObject({
    type: 'Prepayment',
    amount: '20000.00',
    date: '2026-04-30',
    mode: 'REDUCE_TERM',
    deletedAt: null,
  });
  expect(scenarios[0]?.events[0]).not.toHaveProperty('commission');
  // The full real records, stamps included, are untouched.
  expect(await readReal()).toEqual(realBefore);

  // The edited cell shows the applied abono, and the keyboard is back on the grid.
  const edited = page.locator('[role="row"]', { has: page.locator('[data-c="0"]', { hasText: /^\s*15\s*$/ }) });
  await expect(edited.locator(`[data-c="${String(ABONO_COLUMN)}"]`)).toHaveText('20,000.00');
  expect(await focusedCell(page)).toEqual({ row: '15', column: ABONO_COLUMN });
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page);
});

test('rows up to the cutoff and the original plan do not accept an abono', async ({ page }) => {
  await seedAndOpen(page);
  const row14 = page.locator('[role="row"]', { has: page.locator('[data-c="0"]', { hasText: /^\s*14\s*$/ }) });
  await expect(row14.locator(`[data-c="${String(ABONO_COLUMN)}"]`)).not.toHaveAttribute('data-editable', 'true');
  const row15 = page.locator('[role="row"]', { has: page.locator('[data-c="0"]', { hasText: /^\s*15\s*$/ }) });
  await expect(row15.locator(`[data-c="${String(ABONO_COLUMN)}"]`)).toHaveAttribute('data-editable', 'true');

  await page.getByTestId('view-original').check();
  await expect(row15.locator(`[data-c="${String(ABONO_COLUMN)}"]`)).not.toHaveAttribute('data-editable', 'true');
});
