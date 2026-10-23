import {
  expectNoA11yViolations,
  expectNoClientStorage,
  expectNoConsoleErrors,
  expectNoCspViolations,
  expectNoExternalRequests,
} from '../support/expectations.ts';
import { expect, test } from '../support/test.ts';

test('the quick simulator on / computes with zero external requests, zero storage and zero fetch/XHR', async ({
  page,
}) => {
  const dynamicRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') dynamicRequests.push(request.url());
  });

  await page.goto('/');
  // The interactive form is a lazy chunk that loads when the placeholder nears the viewport. Since the Mercado landing
  // (W8-06) the simulator sits below the mosaic, the board and the cards, so scroll down to it first.
  await page.getByTestId('sim-placeholder').scrollIntoViewIfNeeded();
  await expect(page.locator('cc-quick-simulator-form')).toBeVisible();
  await expect(page.getByTestId('sim-results')).toHaveCount(0);

  await page.locator('#sim-principal').fill('500000');
  await page.locator('#sim-rate').fill('7');
  await page.locator('#sim-years').fill('20');
  await expect(page.getByTestId('sim-level')).toContainText('4,263.47');
  await expect(page.getByTestId('sim-first-interest')).toContainText('2,916.67');
  await expect(page.getByTestId('sim-first-insurance')).toContainText('525.00');
  await expect(page.getByTestId('sim-first-capital')).toContainText('821.80');
  await expect(page.getByTestId('sim-count')).toHaveText('240');
  await expect(page.getByTestId('sim-disclaimer')).toContainText('No es asesoría financiera.');

  await page.locator('#sim-prepay-toggle').check();
  await page.locator('#sim-prepay-amount').fill('20000');
  await page.locator('#sim-prepay-k').fill('12');
  await expect(page.getByTestId('sim-saved')).toContainText('Q');
  await expect(page.getByTestId('sim-new-count')).toHaveText('220');
  await page.locator('#sim-mode-installment').check();
  await expect(page.getByTestId('sim-new-level')).toContainText('4,089.36');

  await page.locator('#sim-years').fill('31');
  await page.locator('#sim-years').blur();
  await expect(page.locator('#sim-years-errors')).toContainText('entre 1 y 30');
  await expect(page.getByTestId('sim-results')).toHaveCount(0);
  await page.locator('#sim-years').fill('20');
  await expect(page.getByTestId('sim-results')).toBeVisible();

  await page.waitForLoadState('networkidle');
  expect(dynamicRequests, 'fetch/XHR requests').toEqual([]);
  expectNoExternalRequests(page);
  expectNoConsoleErrors(page);
  expectNoCspViolations(page);
  await expectNoClientStorage(page);
  await expectNoA11yViolations(page);
});
