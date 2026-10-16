import { expect, type Locator, type Page } from '@playwright/test';

/** Synthetic conditions of a loan typed into step 2 (dd/mm/aaaa dates, percent rates). */
export interface ConditionsInput {
  readonly principal: string;
  readonly termMonths: string;
  /** Percent, e.g. '7'. */
  readonly interestRate: string;
  readonly firstDueDate: string;
  readonly disbursementDate: string;
}

export interface AnchorInput {
  readonly balance: string;
  readonly installment: string;
  readonly source?: 'BANK_EMAIL' | 'ONLINE_BANKING' | 'BANK_SCHEDULE' | 'OTHER';
}

/** Page object of /app/prestamos/nuevo (W4-07). Fields are found by their visible labels, like a user would. */
export class LoanWizardPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/prestamos/nuevo');
    await expect(this.page.getByTestId('page-loan-new')).toBeVisible();
  }

  /** The step heading, e.g. «Paso 2 de 4 · Condiciones originales». */
  get stepHeading(): Locator {
    return this.page.getByRole('heading', { level: 2 });
  }

  field(label: string): Locator {
    return this.page.getByLabel(label, { exact: true });
  }

  /** Types into a text field and leaves it, so its rules run. */
  async type(label: string, text: string): Promise<void> {
    const field = this.field(label);
    await field.fill(text);
    await field.blur();
  }

  async completeTemplateStep(options: { readonly alias: string; readonly currency?: 'GTQ' | 'USD' }): Promise<void> {
    await this.type('Alias', options.alias);
    if (options.currency !== undefined) await this.field('Moneda').selectOption(options.currency);
    await this.next();
    await expect(this.stepHeading).toContainText('Paso 2 de 4');
  }

  async completeConditionsStep(input: ConditionsInput): Promise<void> {
    await this.type('Monto del préstamo', input.principal);
    await this.type('Plazo (meses)', input.termMonths);
    await this.type('Tasa de interés original del contrato', input.interestRate);
    await this.type('Fecha de la primera cuota', input.firstDueDate);
    await this.type('Fecha de desembolso (informativa)', input.disbursementDate);
    await this.next();
    await expect(this.stepHeading).toContainText('Paso 3 de 4');
  }

  async skipFixedChargesStep(): Promise<void> {
    await this.next();
    await expect(this.stepHeading).toContainText('Paso 4 de 4');
  }

  async enterAnchor(input: AnchorInput): Promise<void> {
    await this.type('Saldo que informa el banco', input.balance);
    await this.type('Cuota a la que corresponde (saldo antes de pagarla)', input.installment);
    if (input.source !== undefined) await this.field('Dónde leíste el saldo').selectOption(input.source);
  }

  async next(): Promise<void> {
    await this.page.getByRole('button', { name: /Siguiente/ }).click();
  }

  async back(): Promise<void> {
    await this.page.getByRole('button', { name: /Atrás/ }).click();
  }

  async save(): Promise<void> {
    await this.page.getByRole('button', { name: 'Guardar préstamo' }).click();
  }

  /** Text of the traffic-light chip of step 4, e.g. «Coincide». */
  get chip(): Locator {
    return this.page.getByTestId('chip-status').getByTestId('chip-label');
  }

  get cause(): Locator {
    return this.page.getByTestId('anchor-cause');
  }

  get level(): Locator {
    return this.page.getByTestId('level');
  }

  /** After saving, the app redirects to /app/prestamos/:id and shows the detail shell. */
  async expectRedirectedToDetail(): Promise<string> {
    await expect(this.page).toHaveURL(/\/app\/prestamos\/[0-9a-f-]{36}$/);
    await expect(this.page.getByTestId('page-loan-detail')).toBeVisible();
    return new URL(this.page.url()).pathname.split('/').pop() ?? '';
  }
}
