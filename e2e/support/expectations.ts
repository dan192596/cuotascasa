import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { isExternal, recorderOf, type CspViolation } from './recorder.ts';

/** Fails if the page requested anything outside its own origin (data:, blob: and about: do not count). */
export function expectNoExternalRequests(page: Page): void {
  const { requests, origin } = recorderOf(page);
  const external = requests.filter((url) => isExternal(url, origin));
  expect(external, `external requests: ${external.join(', ')}`).toEqual([]);
}

/**
 * Console errors and uncaught page errors seen since the page was created. `expectFailedDocument: true` tolerates the
 * browser's own "Failed to load resource" line for the page URL itself, for pages that must answer 404.
 */
export function expectNoConsoleErrors(page: Page, options: { readonly expectFailedDocument?: boolean } = {}): void {
  const documentUrl = page.url();
  const errors = recorderOf(page)
    .consoleErrors.filter((error) => !(options.expectFailedDocument === true && error.url === documentUrl))
    .map((error) => error.text);
  expect(errors).toEqual([]);
}

/** CSP violations (enforced and report-only) seen since the page was created. */
export function collectCspViolations(page: Page): readonly CspViolation[] {
  return [...recorderOf(page).csp];
}

/**
 * Fails on any CSP violation, enforced or report-only (ADR-0021 removed the provisional report-only header).
 * `includeReportOnly: false` counts only enforced ones.
 */
export function expectNoCspViolations(page: Page, options: { readonly includeReportOnly?: boolean } = {}): void {
  const counted = collectCspViolations(page).filter(
    (violation) => options.includeReportOnly !== false || violation.disposition === 'enforce',
  );
  expect(counted).toEqual([]);
}

export interface ClientStorageSnapshot {
  readonly localStorage: readonly string[];
  readonly sessionStorage: readonly string[];
  readonly indexedDB: readonly string[];
  readonly cookies: readonly string[];
  readonly cacheStorage: readonly string[];
  readonly serviceWorkers: readonly string[];
}

/** Everything the origin keeps on the device. Names only: values never reach test output. */
export async function readClientStorage(page: Page): Promise<ClientStorageSnapshot> {
  const inPage = await page.evaluate(async () => {
    const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
    const registrations = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
    return {
      localStorage: Object.keys(localStorage),
      sessionStorage: Object.keys(sessionStorage),
      indexedDB: databases.map((database) => database.name ?? '(unnamed)'),
      cacheStorage: typeof caches === 'undefined' ? [] : await caches.keys(),
      serviceWorkers: registrations.map((registration) => registration.scope),
    };
  });
  const cookies = (await page.context().cookies()).map((cookie) => cookie.name);
  return { ...inPage, cookies };
}

/** localStorage, sessionStorage, indexedDB.databases(), cookies, CacheStorage and SW registrations are all empty. */
export async function expectNoClientStorage(page: Page): Promise<void> {
  const snapshot = await readClientStorage(page);
  expect(snapshot, 'client storage must be empty').toEqual({
    localStorage: [],
    sessionStorage: [],
    indexedDB: [],
    cookies: [],
    cacheStorage: [],
    serviceWorkers: [],
  });
}

/**
 * Waits until every running animation and transition with a finite end has finished (CSS animations, CSS
 * transitions and view-transition pseudo-elements alike); infinite ones (spinners) are ignored. Two frames first, so
 * a style change the test just made (for example `emulateMedia({ colorScheme })`) has started its transitions.
 */
export async function waitForMotionToSettle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    // A finished animation can start another one (for example a staggered list), so a few passes.
    for (let pass = 0; pass < 10; pass += 1) {
      const finite = document.getAnimations().filter((animation) => {
        const end = animation.effect?.getComputedTiming().endTime;
        return animation.playState === 'running' && typeof end === 'number' && Number.isFinite(end);
      });
      if (finite.length === 0) return;
      await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
    }
  });
}

/**
 * Fails on any axe violation with impact serious or critical. Axe reads the page at rest: it first waits for motion
 * to settle, because a colour sampled mid-transition (the active nav pill right after a theme switch, W8-08) is a
 * blend no user reads, and would make the result depend on machine load.
 */
export async function expectNoA11yViolations(page: Page): Promise<void> {
  await waitForMotionToSettle(page);
  const { violations } = await new AxeBuilder({ page }).analyze();
  const blocking = violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(
    blocking.map((violation) => `${violation.impact ?? '?'} ${violation.id}: ${violation.nodes.length} node(s)`),
    'axe violations',
  ).toEqual([]);
}
