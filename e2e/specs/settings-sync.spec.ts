import type { Browser, BrowserContext, Page } from '@playwright/test';
import { LoanWizardPage } from '../page-objects/loan-wizard.po.ts';
import { expectNoA11yViolations, expectNoCspViolations } from '../support/expectations.ts';
import { installGoogleMock, type GoogleMock } from '../support/google-mock.ts';
import { isExternal, recorderOf, startRecording } from '../support/recorder.ts';
import { seedFromBackup } from '../support/seed.ts';
import { syntheticBackupDocument } from '../support/synthetic.ts';
import { expect, test } from '../support/test.ts';

/**
 * Settings → Google Drive (W5-08, HU-21, HU-22, R12) against the production build and the frozen Google fakes.
 * Nothing reaches Google: accounts.google.com/gsi/client and Drive v3 are answered by installGoogleMock.
 *
 * The e2e build injects a synthetic Google client ID, so the connect screen is always available.
 */

// WebKit's context.route does not see requests the app's service worker re-issues (see google-mock.spec.ts).
test.use({ serviceWorkers: 'block' });
// PBKDF2 with the production 600 000 iterations runs a few times per test.
test.setTimeout(90_000);

const PHRASE = 'frase sintetica de prueba 2031';
const OTHER_PHRASE = 'otra frase sintetica distinta 4417';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

const isGoogle = (url: string): boolean => /(^|\.)google(apis)?\.com$/.test(new URL(url).hostname);

/** The Drive section: Ajustes also hosts the backup section, which has fields with similar test ids. */
const drive = (page: Page) => page.locator('cc-settings-sync');

/** Opens Ajustes with the synthetic loan seeded in IndexedDB. */
async function openSettingsSeeded(page: Page): Promise<void> {
  await page.goto('/app');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await seedFromBackup(page, syntheticBackupDocument());
  await page.goto('/app/ajustes');
  await expect(drive(page).getByTestId('drive-status')).toBeVisible();
}

/** The two clicks of the connection; the popup of the mock is approved by default. */
async function connectDrive(page: Page, mock: GoogleMock): Promise<void> {
  const before = mock.gis.requests.length;
  await drive(page).getByTestId('drive-connect').click();
  await drive(page).getByTestId('drive-continue').click();
  await expect.poll(() => mock.gis.requests.length).toBe(before + 1);
}

async function setPassphrase(page: Page, phrase: string, confirm = true): Promise<void> {
  await drive(page).getByTestId('passphrase-input').fill(phrase);
  if (confirm) await drive(page).getByTestId('passphrase-confirm').fill(phrase);
  await drive(page).getByTestId('passphrase-submit').click();
}

/** Sets the first passphrase of a device and, in a second click of the owner, runs the sync. */
async function setPassphraseAndSync(page: Page, phrase: string, confirm = true): Promise<void> {
  await setPassphrase(page, phrase, confirm);
  await expect(drive(page).getByTestId('passphrase-done')).toContainText('sincronizar');
  await expect(drive(page).getByTestId('drive-sync')).toBeFocused();
  await drive(page).getByTestId('drive-sync').click();
}

/** A second device: its own context, IndexedDB and Google mock. */
async function newDevice(browser: Browser, baseURL: string): Promise<{ page: Page; mock: GoogleMock }> {
  const context: BrowserContext = await browser.newContext({ baseURL, locale: 'es-GT', serviceWorkers: 'block' });
  const origin = new URL(baseURL).origin;
  await context.route('**', (route) => {
    const url = new URL(route.request().url());
    const web = url.protocol === 'http:' || url.protocol === 'https:';
    return web && url.origin !== origin ? route.abort('blockedbyclient') : route.fallback();
  });
  const mock = await installGoogleMock(context);
  const page = await context.newPage();
  await startRecording(page, origin);
  return { page, mock };
}

/** Makes `to` see the same appDataFolder as `from` (each mock is its own in-memory Drive). */
function shareDrive(from: GoogleMock, to: GoogleMock): void {
  to.drive.reset();
  for (const file of from.drive.files()) to.drive.seed({ name: file.name, content: file.content });
}

/** Only Google (served by the mock) may be requested besides the app's own origin. */
function expectOnlyGoogleExternally(page: Page): void {
  const { requests, origin } = recorderOf(page);
  const others = requests.filter((url) => isExternal(url, origin) && !isGoogle(url));
  expect(others, `non-Google external requests: ${others.join(', ')}`).toEqual([]);
}

/** Set by the test that injects a dropped connection: the browser then logs one «Failed to load resource» line. */
let droppedConnectionInjected = false;

function expectNoUnexpectedConsoleErrors(page: Page): void {
  const errors = recorderOf(page)
    .consoleErrors.map((error) => error.text)
    .filter((text) => !(droppedConnectionInjected && /^Failed to load resource/.test(text)));
  expect(errors).toEqual([]);
}

test.beforeEach(() => {
  droppedConnectionInjected = false;
});

test.afterEach(({ page }) => {
  expectNoUnexpectedConsoleErrors(page);
  expectNoCspViolations(page);
  expectOnlyGoogleExternally(page);
});

test('visiting Ajustes makes zero requests to Google and offers only «Conectar Drive»', async ({
  page,
  googleMock,
}) => {
  const google: string[] = [];
  page.on('request', (request) => {
    if (isGoogle(request.url())) google.push(request.url());
  });
  await page.goto('/app/ajustes');
  await expect(page.getByTestId('page-settings')).toBeVisible();
  await expect(drive(page).getByTestId('drive-status')).toBeVisible();
  await page.waitForLoadState('networkidle');

  expect(google).toEqual([]);
  expect(googleMock.gis.requests).toEqual([]);
  expect(googleMock.drive.requests).toEqual([]);
  await expectNoA11yViolations(page);
});

test('the privacy link and the scope explanation are shown before connecting', async ({ page }) => {
  await page.goto('/app/ajustes');
  await expect(drive(page).getByTestId('drive-scope')).toContainText('drive.appdata');
  await expect(drive(page).getByTestId('drive-privacy-link')).toHaveAttribute('href', '/privacidad');
  await expect(drive(page).getByTestId('drive-connect')).toHaveText('Conectar Drive');
  await expect(drive(page).getByTestId('drive-continue')).toHaveCount(0);
});

test('connect in two steps, set the passphrase and leave an encrypted copy; a second device reads it', async ({
  page,
  googleMock,
  browser,
  baseURL,
}) => {
  await openSettingsSeeded(page);
  const gsi: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://accounts.google.com/gsi/client')) gsi.push(request.url());
  });

  // Step 1: the explicit intent loads the GIS script, but no consent popup yet.
  await drive(page).getByTestId('drive-connect').click();
  await expect(drive(page).getByTestId('drive-continue')).toBeVisible();
  expect(gsi).toHaveLength(1);
  expect(googleMock.gis.requests).toEqual([]);
  // Step 2: the second click opens the consent popup inside the gesture.
  await drive(page).getByTestId('drive-continue').click();
  await expect.poll(() => googleMock.gis.requests.length).toBe(1);
  expect(googleMock.gis.requests[0]).toMatchObject({ scope: SCOPE, consentScreen: true, action: 'approve' });

  await expect(drive(page).getByTestId('drive-status')).toHaveText('Falta la frase de cifrado');
  await expect(drive(page).getByTestId('passphrase-warning')).toContainText('no se puede recuperar');
  await expectNoA11yViolations(page);
  await setPassphraseAndSync(page, PHRASE);
  await expect(drive(page).getByTestId('drive-status')).toHaveText('Sincronizado');
  await expect(drive(page).getByTestId('drive-last-sync')).toContainText('Última sincronización');
  await expect(drive(page).getByTestId('passphrase-form')).toHaveCount(0);

  // The copy in Drive is an envelope: no plaintext alias, no amounts.
  const remote = googleMock.drive.fileByName('cuotascasa.json');
  expect(remote).toBeDefined();
  expect(JSON.parse(remote?.content ?? '{}')).toMatchObject({ format: 'cuotascasa-enc', v: 1 });
  expect(remote?.content).not.toContain('Casa A');
  expect(remote?.content).not.toContain('500000');
  await expectNoA11yViolations(page);

  // Second device, same passphrase: first a wrong one, with its own text, then the right one.
  const device = await newDevice(browser, baseURL ?? '');
  shareDrive(googleMock, device.mock);
  await device.page.goto('/app/ajustes');
  await connectDrive(device.page, device.mock);
  await expect(drive(device.page).getByTestId('drive-status')).toHaveText('Falta la frase de cifrado');
  await setPassphrase(device.page, OTHER_PHRASE);
  await expect(drive(device.page).getByTestId('drive-status')).toHaveText(
    'La frase no coincide con la copia de Drive: revísala e inténtalo de nuevo',
  );
  await setPassphraseAndSync(device.page, PHRASE, false);
  await expect(drive(device.page).getByTestId('drive-status')).toHaveText('Sincronizado');
  await device.page.getByRole('link', { name: 'CuotasCasa' }).click();
  await expect(device.page.getByTestId('loan-card')).toContainText('Casa A');
  await device.page.context().close();
});

test('after a reload the status is «Falta autorizar Drive» and the screen routes through prepare and connect again', async ({
  page,
  googleMock,
}) => {
  await openSettingsSeeded(page);
  await connectDrive(page, googleMock);
  await setPassphraseAndSync(page, PHRASE);
  await expect(drive(page).getByTestId('drive-status')).toHaveText('Sincronizado');

  await page.reload();
  await expect(drive(page).getByTestId('drive-status')).toHaveText('Falta autorizar Drive');
  await expect(drive(page).getByTestId('drive-sync')).toHaveCount(0);
  await expect(drive(page).getByTestId('drive-connect')).toBeVisible();
  await connectDrive(page, googleMock);
  // The key of this device survived the reload: no passphrase is asked again.
  await expect(drive(page).getByTestId('drive-status')).toHaveText('Sincronizado');
  await expect(drive(page).getByTestId('passphrase-form')).toHaveCount(0);
});

test('offline edits show «Sin conexión con Drive · Cambios sin sincronizar (n)»; syncing again clears them and keeps the previous copy', async ({
  page,
  googleMock,
}) => {
  await openSettingsSeeded(page);
  await connectDrive(page, googleMock);
  await setPassphraseAndSync(page, PHRASE);
  await expect(drive(page).getByTestId('drive-status')).toHaveText('Sincronizado');

  // Edit inside the app (client-side navigation keeps the connection): a second loan.
  await page.getByRole('link', { name: 'CuotasCasa' }).click();
  await page.getByRole('link', { name: 'Nuevo préstamo' }).click();
  const wizard = new LoanWizardPage(page);
  await expect(page.getByTestId('page-loan-new')).toBeVisible();
  await wizard.completeTemplateStep({ alias: 'Casa B' });
  await wizard.completeConditionsStep({
    principal: '300000',
    termMonths: '120',
    interestRate: '6',
    firstDueDate: '31/01/2027',
    disbursementDate: '15/12/2026',
  });
  await wizard.skipFixedChargesStep();
  await wizard.enterAnchor({ balance: '300000', installment: '1' });
  await wizard.save();
  await wizard.expectRedirectedToDetail();
  await page.getByRole('link', { name: 'Ajustes', exact: true }).click();
  await expect(drive(page).getByTestId('drive-status')).toHaveText(/^Cambios sin sincronizar \(\d+\)$/);

  // Dropped connection: the sync fails, the changes stay pending.
  droppedConnectionInjected = true;
  googleMock.drive.failNext({ kind: 'network' });
  await drive(page).getByTestId('drive-sync').click();
  await expect.poll(() => googleMock.drive.requests.some((request) => request.status === 0)).toBe(true);
  await expect(drive(page).getByTestId('drive-status')).toHaveText(
    /^Sin conexión con Drive · Cambios sin sincronizar \(\d+\)$/,
  );

  // Back online: the next sync uploads, clears the counter and leaves the previous copy next to the current one.
  await drive(page).getByTestId('drive-sync').click();
  await expect(drive(page).getByTestId('drive-status')).toHaveText('Sincronizado');
  expect(googleMock.drive.fileByName('cuotascasa.prev.json')).toBeDefined();
  expect(googleMock.drive.fileByName('cuotascasa.json')?.content).not.toContain('Casa B');
});

test('changing the passphrase makes the other device ask for the new one', async ({
  page,
  googleMock,
  browser,
  baseURL,
}) => {
  await openSettingsSeeded(page);
  await connectDrive(page, googleMock);
  await setPassphraseAndSync(page, PHRASE);
  await expect(drive(page).getByTestId('drive-status')).toHaveText('Sincronizado');

  const device = await newDevice(browser, baseURL ?? '');
  shareDrive(googleMock, device.mock);
  await device.page.goto('/app/ajustes');
  await connectDrive(device.page, device.mock);
  await setPassphraseAndSync(device.page, PHRASE);
  await expect(drive(device.page).getByTestId('drive-status')).toHaveText('Sincronizado');

  // Change on the first device.
  await drive(page).getByTestId('passphrase-change-open').click();
  await expect(drive(page).getByTestId('passphrase-other-devices')).toContainText('otros dispositivos');
  await expect(drive(page).getByTestId('passphrase-warning')).toContainText('no se puede recuperar');
  await expectNoA11yViolations(page);
  const toggle = drive(page).getByTestId('passphrase-toggle');
  await toggle.click();
  await expect(drive(page).getByTestId('passphrase-input')).toHaveAttribute('type', 'text');
  await setPassphrase(page, OTHER_PHRASE);
  await expect(drive(page).getByTestId('passphrase-done')).toContainText('Frase cambiada');
  await expect(drive(page).getByTestId('passphrase-form')).toHaveCount(0);
  expect(googleMock.drive.fileByName('cuotascasa.prev.json')).toBeDefined();

  // The other device sees the new copy and asks for the new phrase.
  shareDrive(googleMock, device.mock);
  await drive(device.page).getByTestId('drive-sync').click();
  await expect(drive(device.page).getByTestId('drive-status')).toHaveText(
    'La frase cambió en otro dispositivo: ingrésala de nuevo',
  );
  await setPassphraseAndSync(device.page, OTHER_PHRASE, false);
  await expect(drive(device.page).getByTestId('drive-status')).toHaveText('Sincronizado');
  await device.page.context().close();
});

test('«Desconectar Drive» revokes the token and keeps the local data', async ({ page, googleMock }) => {
  await openSettingsSeeded(page);
  await connectDrive(page, googleMock);
  await setPassphraseAndSync(page, PHRASE);
  await expect(drive(page).getByTestId('drive-status')).toHaveText('Sincronizado');
  const token = googleMock.gis.issuedTokens[0];
  expect(googleMock.gis.revokedTokens).toEqual([]);

  await drive(page).getByTestId('drive-disconnect').click();
  await expect(drive(page).getByTestId('drive-status')).toHaveText('Drive desconectado');
  await expect.poll(() => googleMock.gis.revokedTokens).toEqual([token]);
  await expect(drive(page).getByTestId('drive-connect')).toBeVisible();

  // Reloading does not bring the connection back, and the loan is still here.
  await page.reload();
  await expect(drive(page).getByTestId('drive-status')).toHaveText('Drive desconectado');
  await page.getByRole('link', { name: 'CuotasCasa' }).click();
  await expect(page.getByTestId('loan-card')).toContainText('Casa A');
});
