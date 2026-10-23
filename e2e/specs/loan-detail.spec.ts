import { type Page } from '@playwright/test';
import { LoanWizardPage } from '../page-objects/loan-wizard.po.ts';
import {
  expectNoA11yViolations,
  expectNoConsoleErrors,
  expectNoCspViolations,
  expectNoExternalRequests,
} from '../support/expectations.ts';
import { readStore } from '../support/seed.ts';
import { expect, test } from '../support/test.ts';

/** Synthetic conditions only: a made-up loan with round figures. */
const CONDITIONS = {
  principal: '500000',
  termMonths: '240',
  interestRate: '7',
  firstDueDate: '31/01/2027',
  disbursementDate: '15/12/2026',
} as const;

interface StoredLoan {
  readonly id: string;
  readonly name: string;
  readonly principal: string;
  readonly status: string;
  readonly deletedAt: string | null;
}

test.afterEach(({ page }) => {
  expectNoConsoleErrors(page);
  expectNoCspViolations(page);
  expectNoExternalRequests(page);
});

/** Creates a synthetic loan through the wizard page object and lands on its detail page. */
async function createLoan(page: Page, alias: string): Promise<string> {
  const wizard = new LoanWizardPage(page);
  await wizard.goto();
  await wizard.completeTemplateStep({ alias });
  await wizard.completeConditionsStep(CONDITIONS);
  await wizard.skipFixedChargesStep();
  await wizard.save();
  return wizard.expectRedirectedToDetail();
}

const storedLoans = async (page: Page): Promise<StoredLoan[]> => (await readStore(page, 'loans')) as StoredLoan[];

test('the detail shows the summary, and editing the principal updates the stored loan and the metrics', async ({
  page,
}) => {
  await createLoan(page, 'Casa detalle');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Casa detalle');
  await expect(page.getByTestId('loan-status')).toHaveText('Activo');
  await expect(page.getByTestId('term-principal')).toHaveText('Q 500,000.00');
  await expect(page.getByTestId('term-template')).toContainText('FHA');
  await expect(page.getByTestId('chip-label')).toHaveText('Sin validar');
  await expect(page.getByTestId('summary-balance')).toContainText('Q ');
  const totalBefore = await page.getByTestId('metric-total').innerText();
  await expect(page.getByRole('link', { name: 'Tabla de amortización' })).toHaveAttribute('href', /\/tabla$/);
  await expect(page.getByRole('link', { name: 'Datos reales' })).toHaveAttribute('href', /\/datos-reales$/);
  await expect(page.getByRole('link', { name: 'Proyecciones' })).toHaveAttribute('href', /\/proyecciones$/);
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page);

  await page.getByRole('button', { name: 'Editar condiciones' }).click();
  await expect(page.getByTestId('loan-edit-form')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Editar condiciones' })).toBeFocused();
  await expectNoA11yViolations(page);
  const principal = page.getByLabel('Monto del préstamo', { exact: true });
  await principal.fill('600000');
  await principal.blur();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(page.getByTestId('loan-edit-form')).toHaveCount(0);
  await expect(page.getByTestId('term-principal')).toHaveText('Q 600,000.00');
  await expect(page.getByTestId('metric-total')).not.toHaveText(totalBefore);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  const loans = await storedLoans(page);
  expect(loans).toHaveLength(1);
  expect(loans[0]).toMatchObject({ name: 'Casa detalle', principal: '600000.00', status: 'active' });
  await expectNoA11yViolations(page);
});

test('an archived loan is hidden from the default dashboard filter and visible under «Archivados»', async ({
  page,
}) => {
  await createLoan(page, 'Casa archivable');
  await page.getByRole('button', { name: 'Archivar' }).click();
  await expect(page.getByTestId('loan-status')).toHaveText('Archivado');
  await expect(page.getByRole('button', { name: 'Desarchivar' })).toBeVisible();
  expect((await storedLoans(page))[0]?.status).toBe('archived');
  await expectNoA11yViolations(page);

  await page
    .getByRole('main')
    .getByRole('link', { name: /Mis préstamos/ })
    .click();
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
  await expect(page.getByTestId('loan-card')).toHaveCount(0);
  await page.getByTestId('status-filter').selectOption('archived');
  await expect(page.getByTestId('loan-card')).toContainText('Casa archivable');
  await expectNoA11yViolations(page);

  await page
    .getByTestId('loan-card')
    .getByRole('link', { name: /Casa archivable/ })
    .click();
  await page.getByRole('button', { name: 'Desarchivar' }).click();
  await expect(page.getByTestId('loan-status')).toHaveText('Activo');
  await page
    .getByRole('main')
    .getByRole('link', { name: /Mis préstamos/ })
    .click();
  await expect(page.getByTestId('loan-card')).toContainText('Casa archivable');
});

test('marking a loan as paid asks for confirmation and moves it out of the active filter', async ({ page }) => {
  await createLoan(page, 'Casa pagada');
  await page.getByRole('button', { name: 'Marcar como pagado' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expectNoA11yViolations(page);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);
  expect((await storedLoans(page))[0]?.status).toBe('active');

  await page.getByRole('button', { name: 'Marcar como pagado' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sí, marcar como pagado' }).click();
  await expect(page.getByTestId('loan-status')).toHaveText('Pagado');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  expect((await storedLoans(page))[0]?.status).toBe('paid');
});

test('deleting needs the typed alias, tombstones the loan and redirects to /app', async ({ page }) => {
  await createLoan(page, 'Casa borrable');
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Eliminar préstamo' });
  await expect(confirm).toBeDisabled();
  await expectNoA11yViolations(page);
  await dialog.getByLabel(/Para confirmar/).fill('Casa borrable');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
  await expect(page.getByTestId('loan-card')).toHaveCount(0);
  const loans = await storedLoans(page);
  expect(loans).toHaveLength(1);
  expect(loans[0]?.deletedAt).not.toBeNull();
});

test('the detail header carries the shared transition name of its dashboard card', async ({ page }) => {
  const id = await createLoan(page, 'Casa nombre');
  const name = await page.locator('.cc-det-head').evaluate((el) => getComputedStyle(el).viewTransitionName);
  expect(name).toBe(`cc-loan-${id}`);
});
