import {
  expectNoA11yViolations,
  expectNoClientStorage,
  expectNoConsoleErrors,
  expectNoCspViolations,
  expectNoExternalRequests,
} from '../support/expectations.ts';
import { expect, test } from '../support/test.ts';

interface RouteCase {
  readonly path: string;
  readonly status: number;
  /** data-testid values that must be present (route ids, docs/specs section 9). */
  readonly testIds: readonly string[];
  /** Public pages promise zero storage (R14); /app is allowed to keep data. */
  readonly publicPage: boolean;
}

const ROUTES: readonly RouteCase[] = [
  { path: '/', status: 200, testIds: ['page-landing'], publicPage: true },
  { path: '/privacidad', status: 200, testIds: ['page-privacy'], publicPage: true },
  { path: '/app', status: 200, testIds: ['page-app', 'page-dashboard'], publicPage: false },
  { path: '/app/prestamos', status: 200, testIds: ['page-app', 'page-dashboard'], publicPage: false },
  { path: '/app/prestamos/nuevo', status: 200, testIds: ['page-app', 'page-loan-new'], publicPage: false },
  { path: '/app/prestamos/loan-1', status: 200, testIds: ['page-app', 'page-loan-detail'], publicPage: false },
  { path: '/app/prestamos/loan-1/tabla', status: 200, testIds: ['page-app', 'page-schedule'], publicPage: false },
  {
    path: '/app/prestamos/loan-1/datos-reales',
    status: 200,
    testIds: ['page-app', 'page-real-data'],
    publicPage: false,
  },
  {
    path: '/app/prestamos/loan-1/proyecciones',
    status: 200,
    testIds: ['page-app', 'page-scenarios'],
    publicPage: false,
  },
  { path: '/app/ajustes', status: 200, testIds: ['page-app', 'page-settings'], publicPage: false },
  { path: '/no-existe', status: 404, testIds: ['page-not-found'], publicPage: true },
];

for (const route of ROUTES) {
  test(`${route.path} renders ${route.testIds.join(' + ')} cleanly`, async ({ page }) => {
    const response = await page.goto(route.path);
    expect(response?.status()).toBe(route.status);
    for (const testId of route.testIds) {
      await expect(page.getByTestId(testId), testId).toBeVisible();
    }
    // Let lazy chunks, the service worker and late console output settle.
    await page.waitForLoadState('networkidle');

    expectNoConsoleErrors(page, { expectFailedDocument: route.status >= 400 });
    expectNoCspViolations(page);
    expectNoExternalRequests(page);
    if (route.publicPage) await expectNoClientStorage(page);
    await expectNoA11yViolations(page);
  });
}
