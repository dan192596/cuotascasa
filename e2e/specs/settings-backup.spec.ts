import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Browser, BrowserContext, Download, Page } from '@playwright/test';
import { LoanWizardPage } from '../page-objects/loan-wizard.po.ts';
import {
  expectNoA11yViolations,
  expectNoConsoleErrors,
  expectNoCspViolations,
  expectNoExternalRequests,
} from '../support/expectations.ts';
import { startRecording } from '../support/recorder.ts';
import { readStore, seedFromBackup } from '../support/seed.ts';
import { syntheticBackupDocument } from '../support/synthetic.ts';
import { expect, test } from '../support/test.ts';

const FIXTURE = fileURLToPath(new URL('../fixtures/backups/backup-v1-casa-b.json', import.meta.url));

/** Synthetic conditions only: a made-up loan with round figures. */
const CONDITIONS = {
  principal: '500000',
  termMonths: '240',
  interestRate: '7',
  firstDueDate: '31/01/2027',
  disbursementDate: '15/12/2026',
} as const;

/** The encrypted variant is generated here with a made-up passphrase and never versioned (ADR-0007, ADR-0009). */
const PASSPHRASE = 'frase-sintetica-de-prueba';

interface StoredLoan {
  readonly name: string;
}

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
  return { context, page };
}

async function createLoan(page: Page, alias: string): Promise<void> {
  const wizard = new LoanWizardPage(page);
  await wizard.goto();
  await wizard.completeTemplateStep({ alias });
  await wizard.completeConditionsStep(CONDITIONS);
  await wizard.skipFixedChargesStep();
  await wizard.save();
  await wizard.expectRedirectedToDetail();
}

async function savedDownload(trigger: Promise<Download>): Promise<{ path: string; text: string }> {
  const download = await trigger;
  const path = await download.path();
  return { path, text: await readFile(path, 'utf8') };
}

test.afterEach(({ page }) => {
  expectNoConsoleErrors(page);
  expectNoCspViolations(page);
  expectNoExternalRequests(page);
});

test('plain round trip: create loan, export, import in a new browser context, dashboard shows the loan', async ({
  page,
  browser,
  baseURL,
}) => {
  await createLoan(page, 'Casa de ida y vuelta');
  await page.goto('/app/ajustes');
  await expect(page.getByTestId('settings-backup')).toBeVisible();

  // First plain download of the session: the warning comes first.
  await page.getByTestId('export-plain').click();
  await expect(page.getByTestId('plain-warning')).toContainText(
    'el respaldo JSON no va cifrado y contiene datos financieros',
  );
  await expectNoA11yViolations(page);
  const { path, text } = await savedDownload(
    Promise.all([page.waitForEvent('download'), page.getByTestId('warning-continue').click()]).then(([d]) => d),
  );
  expect(JSON.parse(text)).toMatchObject({ format: 'cuotascasa', version: 1 });
  await expect(page.getByTestId('backup-status')).toHaveText('Último respaldo: hoy');

  if (baseURL === undefined) throw new Error('baseURL is required');
  const other = await freshProfile(browser, baseURL);
  try {
    await other.page.goto('/app/ajustes');
    await other.page.getByTestId('import-file').setInputFiles(path);
    const preview = other.page.getByTestId('import-preview');
    await expect(preview).toBeVisible();
    await expect(other.page.getByTestId('preview-row-loans')).toContainText('1');
    await expectNoA11yViolations(other.page);
    expect(await readStore(other.page, 'loans')).toHaveLength(0);

    await other.page.getByTestId('import-confirm').click();
    await expect(other.page.getByTestId('undo')).toBeVisible();
    await other.page.goto('/app');
    await expect(other.page.getByTestId('loan-card')).toContainText('Casa de ida y vuelta');
    expectNoConsoleErrors(other.page);
    expectNoCspViolations(other.page);
    expectNoExternalRequests(other.page);
  } finally {
    await other.context.close();
  }
});

test('encrypted round trip: the import asks for the passphrase and a wrong one changes nothing', async ({
  page,
  browser,
  baseURL,
}) => {
  await createLoan(page, 'Casa cifrada');
  await page.goto('/app/ajustes');

  const field = page.getByTestId('passphrase');
  await expect(field).toHaveAttribute('type', 'password');
  await field.fill(PASSPHRASE);
  await page.getByTestId('passphrase-confirm').fill(PASSPHRASE);
  await page.getByTestId('passphrase-toggle').click();
  await expect(field).toHaveAttribute('type', 'text');
  const { path, text } = await savedDownload(
    Promise.all([page.waitForEvent('download'), page.getByTestId('export-encrypted').click()]).then(([d]) => d),
  );
  expect(JSON.parse(text)).toMatchObject({ format: 'cuotascasa-enc' });
  expect(text).not.toContain('Casa cifrada');
  await expect(field).toHaveValue('');

  if (baseURL === undefined) throw new Error('baseURL is required');
  const other = await freshProfile(browser, baseURL);
  try {
    await other.page.goto('/app/ajustes');
    await other.page.getByTestId('import-file').setInputFiles(path);
    await expect(other.page.getByTestId('import-preview')).toHaveCount(0);
    await expect(other.page.getByTestId('import-passphrase')).toBeVisible();

    await other.page.getByTestId('import-passphrase').fill('frase-equivocada');
    await other.page.getByTestId('import-decrypt').click();
    await expect(other.page.getByTestId('notice-alert')).toContainText('La frase es incorrecta');
    await expect(other.page.getByTestId('import-preview')).toHaveCount(0);
    expect(await readStore(other.page, 'loans')).toHaveLength(0);

    await other.page.getByTestId('import-passphrase').fill(PASSPHRASE);
    await other.page.getByTestId('import-decrypt').click();
    await expect(other.page.getByTestId('import-preview')).toBeVisible();
    await expectNoA11yViolations(other.page);
    await other.page.getByTestId('import-confirm').click();
    await expect(other.page.getByTestId('undo')).toBeVisible();
    await other.page.goto('/app');
    await expect(other.page.getByTestId('loan-card')).toContainText('Casa cifrada');
  } finally {
    await other.context.close();
  }
});

test('undo after an import restores the previous data; cancel leaves it untouched', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await seedFromBackup(page, syntheticBackupDocument());
  await page.goto('/app/ajustes');

  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('import-preview')).toBeVisible();
  await page.getByTestId('import-cancel').click();
  await expect(page.getByTestId('import-preview')).toHaveCount(0);
  expect(((await readStore(page, 'loans')) as StoredLoan[]).map((l) => l.name)).toEqual(['Casa A']);

  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('undo')).toBeVisible();
  await expect
    .poll(async () => ((await readStore(page, 'loans')) as StoredLoan[]).map((l) => l.name))
    .toEqual(['Casa B']);

  await page.getByTestId('undo').click();
  await expect(page.getByTestId('notice-status')).toContainText('Se restauraron');
  expect(((await readStore(page, 'loans')) as StoredLoan[]).map((l) => l.name)).toEqual(['Casa A']);
  await page.goto('/app');
  await expect(page.getByTestId('loan-card')).toContainText('Casa A');
});

test('persistence status follows persisted() and the request button; the page has no axe violations', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let granted = false;
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: () => Promise.resolve(granted),
        persist: () => {
          granted = true;
          return Promise.resolve(true);
        },
        estimate: () => Promise.resolve({ usage: 2048, quota: 1048576 }),
      },
    });
  });
  await page.goto('/app/ajustes');
  await expect(page.getByTestId('persist-status')).toContainText('No concedido');
  await expect(page.getByTestId('persist-estimate')).toContainText('de 1.0 MB');
  await expectNoA11yViolations(page);
  await page.getByTestId('persist-request').click();
  await expect(page.getByTestId('persist-status')).toContainText('Concedido');
  await expect(page.getByTestId('persist-request')).toHaveCount(0);
  await expectNoA11yViolations(page);
});
