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
  readonly currency: string;
  readonly principal: string;
  readonly interestRate: string;
  readonly insuranceRates: readonly string[];
  readonly firstDueDate: string;
  readonly templateRef: { readonly id: string; readonly version: number };
}

interface StoredBalance {
  readonly loanId: string;
  readonly balance: string;
  readonly installmentNumber: number;
  readonly source: string;
}

test.afterEach(({ page }) => {
  expectNoConsoleErrors(page);
  expectNoCspViolations(page);
  expectNoExternalRequests(page);
});

test('a synthetic GTQ loan with a matching balance shows GREEN, saves both records and redirects', async ({ page }) => {
  const wizard = new LoanWizardPage(page);
  await wizard.goto();
  await expectNoA11yViolations(page);
  await wizard.completeTemplateStep({ alias: 'Casa de prueba' });
  await expectNoA11yViolations(page);
  await wizard.completeConditionsStep(CONDITIONS);
  await wizard.skipFixedChargesStep();
  // Installment 1 opens with the principal, so the same figure matches the modeled balance exactly.
  await wizard.enterAnchor({ balance: '500000', installment: '1', source: 'BANK_EMAIL' });
  await expect(wizard.chip).toHaveText('Coincide');
  await expect(page.getByTestId('anchor-modeled')).toHaveText('Q 500,000.00');
  await expect(wizard.cause).toHaveCount(0);
  await expectNoA11yViolations(page);

  await wizard.save();
  const id = await wizard.expectRedirectedToDetail();

  const loans = (await readStore(page, 'loans')) as StoredLoan[];
  expect(loans).toHaveLength(1);
  expect(loans[0]).toMatchObject({
    id,
    name: 'Casa de prueba',
    currency: 'GTQ',
    principal: '500000.00',
    interestRate: '0.07',
    insuranceRates: ['0.01', '0.0026'],
    firstDueDate: '2027-01-31',
    templateRef: { id: 'fha-gt', version: 1 },
  });
  const balances = (await readStore(page, 'reportedBalances')) as StoredBalance[];
  expect(balances).toHaveLength(1);
  expect(balances[0]).toMatchObject({ loanId: id, balance: '500000.00', installmentNumber: 1, source: 'BANK_EMAIL' });
});

test('a mismatching balance shows RED with its cause, does not block saving and still redirects', async ({ page }) => {
  const wizard = new LoanWizardPage(page);
  await wizard.goto();
  await wizard.completeTemplateStep({ alias: 'Casa con diferencia' });
  await wizard.completeConditionsStep(CONDITIONS);
  await wizard.skipFixedChargesStep();
  await wizard.enterAnchor({ balance: '650000', installment: '1' });
  await expect(wizard.chip).toHaveText('Diferencia grande');
  await expect(wizard.cause).toHaveText('Diferencia sin causa identificada: revisa tasa, seguros o cargos');
  await wizard.save();
  await wizard.expectRedirectedToDetail();
  expect(await readStore(page, 'reportedBalances')).toHaveLength(1);
});

test('a balance that matches the previous installment suggests the misalignment cause', async ({ page }) => {
  const wizard = new LoanWizardPage(page);
  await wizard.goto();
  await wizard.completeTemplateStep({ alias: 'Casa desfasada' });
  await wizard.completeConditionsStep(CONDITIONS);
  await wizard.skipFixedChargesStep();
  await wizard.enterAnchor({ balance: '500000', installment: '2' });
  await expect(wizard.chip).toHaveText('Diferencia grande');
  await expect(wizard.cause).toHaveText('El saldo parece corresponder a otra cuota (¿la anterior o la siguiente?)');
});

test('a USD loan displays US$ amounts', async ({ page }) => {
  const wizard = new LoanWizardPage(page);
  await wizard.goto();
  await wizard.completeTemplateStep({ alias: 'Casa en dólares', currency: 'USD' });
  await wizard.completeConditionsStep({ ...CONDITIONS, principal: '100000', termMonths: '120' });
  await expect(wizard.level).toContainText('US$');
  await wizard.skipFixedChargesStep();
  await wizard.enterAnchor({ balance: '100000', installment: '1' });
  await expect(page.getByTestId('anchor-modeled')).toHaveText('US$ 100,000.00');
  await wizard.save();
  await wizard.expectRedirectedToDetail();
  const loans = (await readStore(page, 'loans')) as StoredLoan[];
  expect(loans[0]?.currency).toBe('USD');
});

test('step 4 is optional: no balance saves the loan alone, with «Sin validar»', async ({ page }) => {
  const wizard = new LoanWizardPage(page);
  await wizard.goto();
  await wizard.completeTemplateStep({ alias: 'Casa sin saldo' });
  await wizard.completeConditionsStep(CONDITIONS);
  await wizard.skipFixedChargesStep();
  await expect(wizard.chip).toHaveText('Sin validar');
  await wizard.save();
  await wizard.expectRedirectedToDetail();
  expect(await readStore(page, 'loans')).toHaveLength(1);
  expect(await readStore(page, 'reportedBalances')).toHaveLength(0);
});

test('an invalid step blocks advancing with Spanish messages and going back keeps the values', async ({ page }) => {
  const wizard = new LoanWizardPage(page);
  await wizard.goto();
  await wizard.next();
  await expect(wizard.stepHeading).toContainText('Paso 1 de 4');
  await expect(page.getByText('Escribe un alias para identificar el préstamo.')).toBeVisible();
  await wizard.type('Alias', 'Casa de prueba');
  await wizard.next();
  await expect(wizard.stepHeading).toContainText('Paso 2 de 4');
  await wizard.type('Monto del préstamo', '0');
  await wizard.next();
  await expect(wizard.stepHeading).toContainText('Paso 2 de 4');
  await expect(page.getByText('El monto del préstamo debe ser mayor que cero.')).toBeVisible();
  await wizard.back();
  await expect(wizard.field('Alias')).toHaveValue('Casa de prueba');
});
