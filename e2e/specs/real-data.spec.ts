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

/** Seeds the synthetic loan of support/synthetic.ts and opens its real-data screen. */
async function openRealData(page: Page): Promise<void> {
  await page.goto('/app');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await seedFromBackup(page, syntheticBackupDocument());
  await page.goto(`/app/prestamos/${SYNTHETIC_LOAN_ID}/datos-reales`);
  await expect(page.getByTestId('page-real-data')).toBeVisible();
  await expect(page.getByTestId('real-end-date')).toBeVisible();
}

/** Types into a labelled field and leaves it, so its rules run. */
async function fill(page: Page, label: string, text: string): Promise<void> {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(text);
  await field.blur();
}

/** 'Fin proyectado con tus datos reales: dd/mm/aaaa' → 'aaaammdd' as a number, to compare dates. */
async function projectedEnd(page: Page): Promise<number> {
  const text = (await page.getByTestId('real-end-date').textContent()) ?? '';
  const match = /(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
  if (match === null) throw new Error(`No date in «${text}»`);
  return Number(`${match[3] ?? ''}${match[2] ?? ''}${match[1] ?? ''}`);
}

test.afterEach(({ page }) => {
  expectNoConsoleErrors(page);
  expectNoCspViolations(page);
  expectNoExternalRequests(page);
});

test('a reported balance shows its Real Δ and traffic-light chip', async ({ page }) => {
  await openRealData(page);
  // The seed has one real event (a prepayment) and no balance yet.
  await expect(page.getByTestId('timeline-entry')).toHaveCount(1);
  await expectNoA11yViolations(page);

  await page.getByRole('button', { name: 'Agregar saldo reportado' }).click();
  await expect(page.getByLabel('Fecha del saldo', { exact: true })).toBeFocused();
  await fill(page, 'Fecha del saldo', '28/02/2025');
  await fill(page, 'Saldo informado por el banco (Q)', '499000');
  await fill(page, 'Cuota a la que aplica (opcional)', '1');
  await page.getByLabel('Origen del saldo', { exact: true }).selectOption('BANK_EMAIL');
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Guardar' }).click();

  const entry = page.getByTestId('timeline-entry').filter({ hasText: 'Saldo reportado' });
  await expect(entry).toBeVisible();
  // Installment 1 opens with the whole principal, so the bank's figure is Q 1,000.00 below the model.
  await expect(entry.getByTestId('modeled-balance')).toHaveText('Saldo modelado: Q 500,000.00');
  await expect(entry.getByTestId('real-delta')).toHaveText('Real Δ: -Q 1,000.00');
  await expect(entry.getByTestId('chip-label')).toHaveText(/Coincide|Diferencia pequeña|Diferencia grande/);
  await expect(page.getByRole('button', { name: /Editar saldo reportado del 28\/02\/2025/ })).toBeFocused();
  await expectNoA11yViolations(page);

  const stored = (await readStore(page, 'reportedBalances')) as { balance: string; installmentNumber: number }[];
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ balance: '499000.00', installmentNumber: 1 });
});

test('a real prepayment moves the projected end date, and deleting it restores the date', async ({ page }) => {
  await openRealData(page);
  const before = await projectedEnd(page);

  await page.getByRole('button', { name: 'Agregar abono a capital' }).click();
  await fill(page, 'Fecha del abono', '15/09/2026');
  await fill(page, 'Monto del abono (Q)', '50000');
  await page.getByLabel('¿Qué reduce el abono?', { exact: true }).selectOption('REDUCE_TERM');
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.getByTestId('timeline-entry')).toHaveCount(2);
  await expect.poll(() => projectedEnd(page)).toBeLessThan(before);
  const after = await projectedEnd(page);
  expect(after).not.toBe(before);
  await expectNoA11yViolations(page);

  await page.getByRole('button', { name: /Eliminar abono a capital del 15\/09\/2026/ }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('timeline-entry')).toHaveCount(1);
  await expect.poll(() => projectedEnd(page)).toBe(before);
});

test('a payment marks its installment as paid', async ({ page }) => {
  await openRealData(page);
  await page.getByRole('button', { name: 'Agregar pago real' }).click();
  await fill(page, 'Fecha de pago', '28/02/2025');
  await expect(page.getByLabel('Cuota a la que aplica', { exact: true })).toHaveValue('1');
  await fill(page, 'Monto pagado (Q)', '4658.47');
  await page.getByRole('button', { name: 'Guardar' }).click();

  const entry = page.getByTestId('timeline-entry').filter({ hasText: 'Pago real' });
  await expect(entry.getByTestId('paid-mark')).toHaveText('Cuota 1 pagada');
});

test('a rate change that cannot be afforded is explained inline and is not saved', async ({ page }) => {
  await openRealData(page);
  await page.getByRole('button', { name: 'Agregar cambio de tasa' }).click();
  await fill(page, 'Fecha de vigencia de la nueva tasa', '31/03/2025');
  await fill(page, 'Nueva tasa de interés anual', '90');
  await page.getByLabel('Mantener la cuota y ajustar el plazo').check();
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.getByTestId('write-error')).toContainText(/amortización negativa/i);
  await expect(page.getByTestId('timeline-entry')).toHaveCount(1);
  expect(await readStore(page, 'events')).toHaveLength(1);
  await expectNoA11yViolations(page);
});
