import { readFile } from 'node:fs/promises';
import type { Download, Locator, Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { expect } from '../../support/test.ts';

/**
 * Shared kit of the W6-01 journeys. Not a spec (Playwright only runs `*.spec.ts`). Everything here is synthetic: a made-up
 * loan with round figures, a made-up passphrase and a fixed clock.
 */

/** Fixed wall clock of every journey, so file names and «hoy» never depend on the day the suite runs (UTC noon). */
export const JOURNEY_NOW = new Date('2027-03-15T18:00:00.000Z');
/** File-name date that the fixed clock produces (`generatedOn` = today of the app, `Clock.today()`). */
export const JOURNEY_TODAY = '2027-03-15';

export const CONDITIONS = {
  alias: 'Casa del recorrido',
  principal: '500000',
  termMonths: '240',
  interestRate: '7',
  firstDueDate: '31/01/2027',
  disbursementDate: '15/12/2026',
} as const;

/**
 * How the journey drives the page. `mouse` is the usual Playwright way. `keyboard` never produces a pointer event: it
 * focuses the control and presses Enter or Space, and types with the keyboard.
 */
export interface Driver {
  readonly name: 'mouse' | 'keyboard';
  /** Activates a button or a link. */
  press(target: Locator): Promise<void>;
  /** Types into a text field and leaves it, so its rules run. */
  write(field: Locator, text: string): Promise<void>;
  /** Checks a radio button or a checkbox. */
  check(target: Locator): Promise<void>;
}

export const mouseDriver: Driver = {
  name: 'mouse',
  press: (target) => target.click(),
  write: async (field, text) => {
    await field.fill(text);
    await field.blur();
  },
  check: (target) => target.check(),
};

export const keyboardDriver: Driver = {
  name: 'keyboard',
  press: async (target) => {
    await target.focus();
    await expect(target).toBeFocused();
    await target.page().keyboard.press('Enter');
  },
  write: async (field, text) => {
    await field.focus();
    await expect(field).toBeFocused();
    await field.selectText().catch(() => undefined);
    await field.page().keyboard.type(text);
    await field.page().keyboard.press('Tab');
  },
  check: async (target) => {
    await target.focus();
    await expect(target).toBeFocused();
    await target.page().keyboard.press('Space');
    await expect(target).toBeChecked();
  },
};

/**
 * Counts pointer presses of the page, across navigations. A keyboard journey asserts the count is zero: a click made by
 * the keyboard (Enter or Space) fires `click` but never `pointerdown` or `mousedown`.
 */
export async function countPointerPresses(page: Page): Promise<() => number> {
  let count = 0;
  await page.exposeFunction('__ccPointerPress', () => {
    count += 1;
  });
  await page.addInitScript(() => {
    const report = (): void => {
      (window as unknown as { __ccPointerPress?: () => void }).__ccPointerPress?.();
    };
    document.addEventListener('pointerdown', report, true);
    document.addEventListener('mousedown', report, true);
  });
  return () => count;
}

/** Pins `Date` (not timers) before the first navigation. */
export async function pinClock(page: Page): Promise<void> {
  await page.clock.setFixedTime(JOURNEY_NOW);
}

// ---------------------------------------------------------------------------------------------------------------------
// Steps of the loan: wizard, real data, scenario.
// ---------------------------------------------------------------------------------------------------------------------

const label = (page: Page, text: string): Locator => page.getByLabel(text, { exact: true });

/** Wizard of /app/prestamos/nuevo, up to the detail page. Returns the loan id. */
export async function createLoanThroughWizard(page: Page, driver: Driver): Promise<string> {
  await page.goto('/app/prestamos/nuevo');
  await expect(page.getByTestId('page-loan-new')).toBeVisible();
  const heading = page.getByRole('heading', { level: 2 });
  const next = page.getByRole('button', { name: /Siguiente/ });

  await driver.write(label(page, 'Alias'), CONDITIONS.alias);
  await driver.press(next);
  await expect(heading).toContainText('Paso 2 de 4');

  await driver.write(label(page, 'Monto del préstamo'), CONDITIONS.principal);
  await driver.write(label(page, 'Plazo (meses)'), CONDITIONS.termMonths);
  await driver.write(label(page, 'Tasa de interés original del contrato'), CONDITIONS.interestRate);
  await driver.write(label(page, 'Fecha de la primera cuota'), CONDITIONS.firstDueDate);
  await driver.write(label(page, 'Fecha de desembolso (informativa)'), CONDITIONS.disbursementDate);
  await driver.press(next);
  await expect(heading).toContainText('Paso 3 de 4');

  await driver.press(next);
  await expect(heading).toContainText('Paso 4 de 4');
  await driver.press(page.getByRole('button', { name: 'Guardar préstamo' }));

  await expect(page).toHaveURL(/\/app\/prestamos\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('page-loan-detail')).toBeVisible();
  return new URL(page.url()).pathname.split('/').pop() ?? '';
}

/** Follows a link of the loan detail (SPA navigation, so the session keeps its state). */
export async function openFromDetail(
  page: Page,
  driver: Driver,
  link: 'Tabla de amortización' | 'Datos reales' | 'Proyecciones',
  testId: string,
): Promise<void> {
  await driver.press(page.locator('cc-loan-detail-page').getByRole('link', { name: link, exact: true }));
  await expect(page.getByTestId(testId)).toBeVisible();
}

/** Back to the loan detail with the browser history (SPA navigation). */
export async function backToDetail(page: Page): Promise<void> {
  await page.goBack();
  await expect(page.getByTestId('page-loan-detail')).toBeVisible();
}

/** Reports a balance of Q 499,000.00 for installment 1: Q 1,000.00 below the model (opening = principal). */
export async function reportBalance(page: Page, driver: Driver): Promise<void> {
  const root = page.getByTestId('page-real-data');
  await driver.press(root.getByRole('button', { name: 'Agregar saldo reportado' }));
  await expect(label(page, 'Fecha del saldo')).toBeFocused();
  await driver.write(label(page, 'Fecha del saldo'), '31/01/2027');
  await driver.write(label(page, 'Saldo informado por el banco (Q)'), '499000');
  await driver.write(label(page, 'Cuota a la que aplica (opcional)'), '1');
  await root.getByLabel('Origen del saldo', { exact: true }).selectOption('BANK_EMAIL');
  await driver.press(root.getByRole('button', { name: 'Guardar' }));
  const entry = root.getByTestId('timeline-entry').filter({ hasText: 'Saldo reportado' });
  await expect(entry).toBeVisible();
  await expect(entry.getByTestId('projected-balance')).toHaveText('Saldo proyectado: Q 500,000.00');
  await expect(entry.getByTestId('real-delta')).toHaveText('Real Δ: -Q 1,000.00');
}

/** Creates the scenario «Plan A» with one abono of Q 20,000.00 on 30/06/2027 (installment 6). */
export async function createScenarioWithAbono(page: Page, driver: Driver): Promise<void> {
  const root = page.getByTestId('page-scenarios');
  await driver.write(label(page, 'Nombre del nuevo escenario'), 'Plan A');
  await driver.press(root.getByRole('button', { name: 'Crear escenario' }));
  await expect(root.getByTestId('scenario-row').filter({ hasText: 'Plan A' })).toBeVisible();
  const abono = root.getByTestId('abono-form');
  await driver.write(abono.getByLabel('Fecha del abono'), '30/06/2027');
  await driver.write(abono.getByLabel('Monto del abono'), '20000');
  await driver.press(abono.getByRole('button', { name: 'Agregar al escenario' }));
  await expect(root.getByTestId('event-row')).toContainText('Abono de Q 20,000.00');
  await expect(root.getByTestId('metrics')).toBeVisible();
}

// ---------------------------------------------------------------------------------------------------------------------
// Exports.
// ---------------------------------------------------------------------------------------------------------------------

export type Format = 'excel' | 'csv' | 'pdf';

export interface Exported {
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

/**
 * Chooses `format` in the export menu inside `host` and returns the downloaded file. With `firstOfSession` the notice for
 * unencrypted files must appear first, and the download starts only after accepting it. Otherwise no notice may appear.
 *
 * The writers run after an `await` (dynamic import, then the writer), outside the user gesture: waiting for the browser's
 * `download` event proves the file really arrives in that browser (WebKit included), not just that the anchor was clicked.
 */
export async function exportAs(
  page: Page,
  driver: Driver,
  host: Locator,
  format: Format,
  options: { readonly firstOfSession: boolean },
): Promise<Exported> {
  const menu = host.locator('cc-export-menu');
  await driver.press(menu.getByTestId('export-trigger'));
  await expect(menu.getByTestId('export-list')).toBeVisible();
  const warning = menu.getByTestId('export-warning');
  let download: Download;
  if (options.firstOfSession) {
    await driver.press(menu.getByTestId(`format-${format}`));
    await expect(warning).toContainText('no va cifrado y contiene datos financieros');
    // The notice comes before any download: nothing has been requested yet.
    await expect(menu.getByTestId('export-progress')).toHaveCount(0);
    await expect(menu.getByTestId('warning-confirm')).toBeFocused();
    [download] = await Promise.all([page.waitForEvent('download'), driver.press(menu.getByTestId('warning-confirm'))]);
  } else {
    [download] = await Promise.all([page.waitForEvent('download'), driver.press(menu.getByTestId(`format-${format}`))]);
    await expect(warning).toHaveCount(0);
  }
  // `path()` resolves only when the download finished; `failure()` is null for a complete one.
  const path = await download.path();
  expect(await download.failure()).toBeNull();
  await expect(menu.getByTestId('export-error')).toHaveCount(0);
  await expect(menu.getByTestId('export-progress')).toHaveCount(0);
  return { fileName: download.suggestedFilename(), bytes: new Uint8Array(await readFile(path)) };
}

const startsWith = (bytes: Uint8Array, prefix: readonly number[]): boolean =>
  prefix.every((byte, index) => bytes[index] === byte);

/** Byte-level checks of one export: signature, structure and the file name convention. */
export function expectExportBytes(
  exported: Exported,
  expected: { readonly format: Format; readonly kind: 'tabla' | 'comparacion'; readonly view: string },
): void {
  const { fileName, bytes } = exported;
  const extension = { excel: 'xlsx', csv: 'csv', pdf: 'pdf' }[expected.format];
  expect(fileName).toBe(`cuotascasa-${expected.kind}-${expected.view}-${JOURNEY_TODAY}.${extension}`);
  expect(bytes.byteLength, 'file is not empty').toBeGreaterThan(200);
  if (expected.format === 'csv') {
    // UTF-8 BOM, so Excel opens accents and «Q» correctly.
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder('utf-8').decode(bytes.slice(3));
    expect(text.split(/\r?\n/).filter((line) => line.length > 0).length, 'CSV rows').toBeGreaterThan(3);
  } else if (expected.format === 'excel') {
    // 'PK' is the ZIP signature of every .xlsx; the container must really open and hold a workbook and a sheet.
    expect(startsWith(bytes, [0x50, 0x4b])).toBe(true);
    const names = Object.keys(unzipSync(bytes));
    expect(names).toContain('[Content_Types].xml');
    expect(names.some((name) => name.startsWith('xl/worksheets/'))).toBe(true);
  } else {
    expect(new TextDecoder('latin1').decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(new TextDecoder('latin1').decode(bytes.slice(-1024))).toContain('%%EOF');
  }
}
