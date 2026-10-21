import type { Page } from '@playwright/test';
import { expectNoA11yViolations, expectNoCspViolations } from '../support/expectations.ts';
import type { GoogleMock } from '../support/google-mock.ts';
import { isExternal, recorderOf } from '../support/recorder.ts';
import { seedFromBackup } from '../support/seed.ts';
import { syntheticBackupDocument } from '../support/synthetic.ts';
import { expect, test } from '../support/test.ts';

/**
 * Settings → «Borrar datos de este dispositivo» (W7-04, R18, R2, R12) against the production build and the frozen
 * Google fakes. Nothing reaches Google: the GIS script and Drive v3 are answered by installGoogleMock.
 */

// WebKit's context.route does not see requests the app's service worker re-issues (see google-mock.spec.ts).
test.use({ serviceWorkers: 'block' });
// PBKDF2 with the production 600 000 iterations runs once.
test.setTimeout(90_000);

const PHRASE = 'frase sintetica de prueba 2031';
const DATA_DB = 'cuotascasa';
const KEY_DB = 'cuotascasa-keys';

const sync = (page: Page) => page.locator('cc-settings-sync');
const device = (page: Page) => page.locator('cc-settings-device');

interface DbSummary {
  readonly exists: boolean;
  /** Rows per object store; the data store's `meta` (device id) is reported separately. */
  readonly rows: Readonly<Record<string, number>>;
}

/** Reads one database through the native API without creating it. */
async function summarize(page: Page, name: string): Promise<DbSummary> {
  return page.evaluate(async (dbName): Promise<DbSummary> => {
    const known = (await indexedDB.databases()).some((info) => info.name === dbName);
    if (!known) return { exists: false, rows: {} };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(dbName);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error('open failed'));
    });
    try {
      const rows: Record<string, number> = {};
      for (const store of Array.from(db.objectStoreNames)) {
        rows[store] = await new Promise<number>((resolve, reject) => {
          const count = db.transaction(store, 'readonly').objectStore(store).count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => reject(count.error ?? new Error('count failed'));
        });
      }
      return { exists: true, rows };
    } finally {
      db.close();
    }
  }, name);
}

async function deviceId(page: Page): Promise<string | null> {
  return page.evaluate(async (): Promise<string | null> => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('cuotascasa');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error('open failed'));
    });
    try {
      const row = await new Promise<{ value?: unknown } | undefined>((resolve, reject) => {
        const get = db.transaction('meta', 'readonly').objectStore('meta').get('deviceId');
        get.onsuccess = () => resolve(get.result as { value?: unknown } | undefined);
        get.onerror = () => reject(get.error ?? new Error('get failed'));
      });
      return typeof row?.value === 'string' ? row.value : null;
    } finally {
      db.close();
    }
  });
}

async function metaKeys(page: Page): Promise<string[]> {
  return page.evaluate(async (): Promise<string[]> => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('cuotascasa');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error('open failed'));
    });
    try {
      return await new Promise<string[]>((resolve, reject) => {
        const keys = db.transaction('meta', 'readonly').objectStore('meta').getAllKeys();
        keys.onsuccess = () => resolve((keys.result as IDBValidKey[]).map(String).sort());
        keys.onerror = () => reject(keys.error ?? new Error('keys failed'));
      });
    } finally {
      db.close();
    }
  });
}

/** Seeds the synthetic loan, connects Drive, sets the passphrase and syncs: the key store and the Drive copy exist. */
async function connectedAndSynced(page: Page, mock: GoogleMock): Promise<void> {
  await page.goto('/app');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await seedFromBackup(page, syntheticBackupDocument());
  await page.goto('/app/ajustes');
  await sync(page).getByTestId('drive-connect').click();
  await sync(page).getByTestId('drive-continue').click();
  await expect.poll(() => mock.gis.requests.length).toBe(1);
  await sync(page).getByTestId('passphrase-input').fill(PHRASE);
  await sync(page).getByTestId('passphrase-confirm').fill(PHRASE);
  await sync(page).getByTestId('passphrase-submit').click();
  await expect(sync(page).getByTestId('drive-sync')).toBeFocused();
  await sync(page).getByTestId('drive-sync').click();
  await expect(sync(page).getByTestId('drive-status')).toHaveText('Sincronizado');
}

test.afterEach(({ page }) => {
  expectNoCspViolations(page);
  const { requests, origin } = recorderOf(page);
  const others = requests.filter(
    (url) => isExternal(url, origin) && !/(^|\.)google(apis)?\.com$/.test(new URL(url).hostname),
  );
  expect(others, `non-Google external requests: ${others.join(', ')}`).toEqual([]);
});

test('the section explains what is erased and the Drive copy steps; the action starts closed', async ({ page }) => {
  await page.goto('/app/ajustes');
  await expect(device(page).getByTestId('device-title')).toHaveText('Borrar datos de este dispositivo');
  await expect(device(page).getByTestId('device-erases')).toContainText('clave de cifrado');
  await expect(device(page).getByTestId('device-keeps')).toContainText('Borrar datos ocultos de la aplicación');
  await expect(device(page).getByTestId('device-dialog')).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the confirmation is armed only by BORRAR, Escape cancels, and axe is clean [${scheme}]`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/app/ajustes');
    await device(page).getByTestId('device-open').click();
    await expect(device(page).getByTestId('device-dialog')).toBeVisible();
    await expect(device(page).getByTestId('device-confirm-input')).toBeFocused();
    await expect(device(page).getByTestId('device-confirm')).toBeDisabled();
    await device(page).getByTestId('device-confirm-input').fill('borrar');
    await expect(device(page).getByTestId('device-confirm')).toBeDisabled();
    await expectNoA11yViolations(page);
    await device(page).getByTestId('device-confirm-input').fill('BORRAR');
    await expect(device(page).getByTestId('device-confirm')).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(device(page).getByTestId('device-dialog')).toHaveCount(0);
    await expect(device(page).getByTestId('device-open')).toBeFocused();
  });
}

test('erases both databases, revokes the Drive token, leaves the Drive copy untouched and shows the empty dashboard', async ({
  page,
  googleMock,
}) => {
  await connectedAndSynced(page, googleMock);
  const before = await summarize(page, DATA_DB);
  expect(before.rows['loans']).toBeGreaterThan(0);
  expect((await summarize(page, KEY_DB)).rows['keys']).toBe(1);
  const oldDeviceId = await deviceId(page);
  expect(oldDeviceId).not.toBeNull();

  const copy = googleMock.drive.fileByName('cuotascasa.json')?.content;
  // A previous copy next to the current one (a second upload would leave it): it must stay byte for byte.
  googleMock.drive.seed({ name: 'cuotascasa.prev.json', content: '{"synthetic":"previous copy"}' });
  const prev = googleMock.drive.fileByName('cuotascasa.prev.json')?.content;
  expect(copy).toBeDefined();
  expect(prev).toBe('{"synthetic":"previous copy"}');
  const filesBefore = googleMock.drive.files().map((file) => ({ name: file.name, content: file.content }));
  const token = googleMock.gis.issuedTokens.at(-1);
  expect(token).toBeDefined();
  expect(googleMock.gis.revokedTokens).toEqual([]);
  const driveRequests = googleMock.drive.requests.length;

  await device(page).getByTestId('device-open').click();
  await device(page).getByTestId('device-confirm-input').fill('BORRAR');
  await device(page).getByTestId('device-confirm').click();

  // Full load of /app, which shows the empty dashboard.
  await page.waitForURL((url) => url.pathname === '/app');
  await expect(page.getByTestId('empty-state')).toBeVisible();

  // The Google side: only the revocation; the Drive copy is byte for byte the same and was not requested again.
  expect(googleMock.gis.revokedTokens).toContain(token);
  expect(googleMock.drive.requests.length).toBe(driveRequests);
  expect(googleMock.drive.fileByName('cuotascasa.json')?.content).toBe(copy);
  expect(googleMock.drive.fileByName('cuotascasa.prev.json')?.content).toBe(prev);
  expect(googleMock.drive.files().map((file) => ({ name: file.name, content: file.content }))).toEqual(filesBefore);

  // Both databases are empty: the key store is gone, and the reload may have recreated an empty data store.
  const keys = await summarize(page, KEY_DB);
  expect(keys.exists ? keys.rows['keys'] : 0).toBe(0);
  const data = await summarize(page, DATA_DB);
  for (const [store, rows] of Object.entries(data.rows)) {
    if (store !== 'meta') expect(rows, `rows in ${store}`).toBe(0);
  }
  // The reload created an empty store: its meta holds only the new device id, nothing about syncs or backups.
  expect(await metaKeys(page)).toEqual(['deviceId']);
  const newDeviceId = await deviceId(page);
  expect(newDeviceId).not.toBeNull();
  expect(newDeviceId).not.toBe(oldDeviceId);

  // Drive is no longer connected on this device.
  await page.goto('/app/ajustes');
  await expect(sync(page).getByTestId('drive-connect')).toBeVisible();
  await expect(sync(page).getByTestId('drive-sync')).toHaveCount(0);
});
