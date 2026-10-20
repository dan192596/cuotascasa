import type { Page } from '@playwright/test';
import { seedFromBackup } from '../../support/seed.ts';
import { SYNTHETIC_LOAN_ID, syntheticBackupDocument } from '../../support/synthetic.ts';
import { expect } from '../../support/test.ts';

export type Theme = 'light' | 'dark';
export const THEMES: readonly Theme[] = ['light', 'dark'];

/** One screen state of the sweep. `ready` drives the page into the state, after `prepare` seeded data if needed. */
export interface SweepCase {
  /** Unique, human readable id: it is the test title and what a fixme cites. */
  readonly id: string;
  readonly path: string;
  /** Public pages promise zero network and zero storage (R14). */
  readonly publicPage: boolean;
  /** Seeds the synthetic loan (visits /app first so the origin and the database exist). */
  readonly seeded: boolean;
  /** Test id that proves the state is on screen. */
  readonly marker: string;
  /** Drives the page into a state with errors visible (runs after the marker is visible). */
  readonly provoke?: (page: Page) => Promise<void>;
  /** Status the document answers with (404 for unknown public paths). */
  readonly status?: number;
  /** The page renders hundreds of cells (the 240-row ledger): axe takes ~15 s alone, so the test gets triple time. */
  readonly heavy?: boolean;
}

const LOAN = `/app/prestamos/${SYNTHETIC_LOAN_ID}`;

async function provokeWizardStep1(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Siguiente/ }).click();
  await expect(page.getByRole('heading', { level: 2 })).toContainText('Paso 1 de 4');
  await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
}

async function provokeRealData(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Agregar saldo reportado' }).click();
  const field = page.getByLabel('Fecha del saldo', { exact: true });
  await field.fill('31/02/2025');
  await field.blur();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
}

async function provokeBadImport(page: Page): Promise<void> {
  await page.getByTestId('import-file').setInputFiles({
    name: 'respaldo.json',
    mimeType: 'application/json',
    buffer: Buffer.from('esto no es un respaldo'),
  });
  await expect(page.getByTestId('notice-alert')).toBeVisible();
}

export const SWEEP_CASES: readonly SweepCase[] = [
  { id: 'landing', path: '/', publicPage: true, seeded: false, marker: 'page-landing' },
  { id: 'privacy', path: '/privacidad', publicPage: true, seeded: false, marker: 'page-privacy' },
  { id: 'not-found', path: '/no-existe', publicPage: true, seeded: false, marker: 'page-not-found', status: 404 },
  { id: 'dashboard-empty', path: '/app', publicPage: false, seeded: false, marker: 'page-dashboard' },
  { id: 'dashboard-loan', path: '/app', publicPage: false, seeded: true, marker: 'loan-card' },
  { id: 'wizard-step1', path: '/app/prestamos/nuevo', publicPage: false, seeded: false, marker: 'page-loan-new' },
  {
    id: 'wizard-step1-errors',
    path: '/app/prestamos/nuevo',
    publicPage: false,
    seeded: false,
    marker: 'page-loan-new',
    provoke: provokeWizardStep1,
  },
  { id: 'loan-detail', path: LOAN, publicPage: false, seeded: true, marker: 'page-loan-detail' },
  {
    id: 'loan-detail-unknown',
    path: '/app/prestamos/no-existe',
    publicPage: false,
    seeded: true,
    marker: 'page-loan-detail',
  },
  { id: 'schedule', path: `${LOAN}/tabla`, publicPage: false, seeded: true, marker: 'page-schedule', heavy: true },
  {
    id: 'schedule-unknown',
    path: '/app/prestamos/no-existe/tabla',
    publicPage: false,
    seeded: true,
    marker: 'page-schedule',
  },
  { id: 'real-data', path: `${LOAN}/datos-reales`, publicPage: false, seeded: true, marker: 'page-real-data' },
  {
    id: 'real-data-errors',
    path: `${LOAN}/datos-reales`,
    publicPage: false,
    seeded: true,
    marker: 'page-real-data',
    provoke: provokeRealData,
  },
  { id: 'scenarios', path: `${LOAN}/proyecciones`, publicPage: false, seeded: true, marker: 'page-scenarios' },
  {
    id: 'scenarios-unknown',
    path: '/app/prestamos/no-existe/proyecciones',
    publicPage: false,
    seeded: true,
    marker: 'page-scenarios',
  },
  { id: 'settings', path: '/app/ajustes', publicPage: false, seeded: true, marker: 'page-settings' },
  {
    id: 'settings-import-error',
    path: '/app/ajustes',
    publicPage: false,
    seeded: true,
    marker: 'page-settings',
    provoke: provokeBadImport,
  },
];

/**
 * Opens the state of `sweepCase` in `theme`. The theme is applied twice on purpose: as the browser preference
 * (what «Sistema» follows) and as the explicit `data-theme` attribute (what the toggle sets), so both token paths run.
 */
export async function openCase(page: Page, sweepCase: SweepCase, theme: Theme): Promise<void> {
  // Reduced motion: no theme-switch transition can leave axe measuring a half-faded color.
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  if (sweepCase.seeded) {
    await page.goto('/app');
    await expect(page.getByTestId('page-dashboard')).toBeVisible();
    // Registering the worker in flight and navigating at once makes WebKit report a TypeError.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await seedFromBackup(page, syntheticBackupDocument());
  }
  const response = await page.goto(sweepCase.path);
  expect(response?.status()).toBe(sweepCase.status ?? 200);
  await expect(page.getByTestId(sweepCase.marker).first()).toBeVisible();
  if (sweepCase.provoke !== undefined) await sweepCase.provoke(page);
  await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
  await page.waitForLoadState('networkidle');
  // Let every running CSS transition/animation finish and two frames paint, so colors are final before any probe.
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  // The theme really took effect: a dark page paints a dark canvas, a light page a light one.
  const luminance = await page.evaluate(() => {
    const match = /\d+(\.\d+)?/g;
    const channels = (getComputedStyle(document.body).backgroundColor.match(match) ?? []).slice(0, 3).map(Number);
    return channels.reduce((sum, value) => sum + value, 0) / 3;
  });
  if (theme === 'dark') expect(luminance, 'dark theme paints a dark background').toBeLessThan(110);
  else expect(luminance, 'light theme paints a light background').toBeGreaterThan(150);
}
