import {
  expectNoA11yViolations,
  expectNoClientStorage,
  expectNoConsoleErrors,
  expectNoCspViolations,
  expectNoExternalRequests,
} from '../support/expectations.ts';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../support/test.ts';

/** HU-01 / R1: the landing is prerendered, works without JS, and never touches network or storage. */

/** The example figures generated from the engine (example-summary.generated.ts). */
const COUNTERS = ['240', 'Q 50,000.00', '35', 'Q 102,206.82'];
const PREPAID_COUNT = 205;

/** Scrolls the board into view and waits for its lazy behaviour. */
async function board(page: Page): Promise<Locator> {
  const host = page.locator('cc-landing-board');
  await host.scrollIntoViewIfNeeded();
  await expect(host).toHaveAttribute('data-ready', '');
  return host;
}

test.describe('landing /', () => {
  test('hydrates, makes no external requests, keeps no storage and is axe clean', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Calcula tus cuotas, mes a mes.');
    await page.waitForLoadState('networkidle');
    expectNoConsoleErrors(page);
    expectNoCspViolations(page);
    expectNoExternalRequests(page);
    await expectNoClientStorage(page);
    await expectNoA11yViolations(page);
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`axe clean in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      await expect(page.getByTestId('page-landing')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expectNoA11yViolations(page);
    });
  }

  test('links lead to /app and /privacidad', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav.getByRole('link', { name: 'Privacidad' })).toHaveAttribute('href', '/privacidad');
    await expect(nav.getByRole('link', { name: 'Abrir la app' })).toHaveAttribute('href', '/app');
  });

  test('«Cómo funciona» scrolls to the cards and moves focus there, without leaving /', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Cómo funciona' }).click();
    await expect(page.locator('#como')).toBeFocused();
    await expect(page.locator('#como h2')).toBeInViewport();
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('«Calcular mi cuota» scrolls to the simulator and moves focus there', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Calcular mi cuota' }).click();
    await expect(page.locator('#simulador')).toBeFocused();
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('the board moves with the keyboard: End shows «Cuota 240 de 240», Home goes back to 1', async ({ page }) => {
    await page.goto('/');
    const host = await board(page);
    const slider = host.getByRole('slider', { name: 'Cuota' });
    await slider.focus();
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuenow', '240');
    await expect(host.locator('.readout')).toContainText('Cuota 240 de 240');
    await expect(host.locator('.readout')).toContainText('Q 0.00');
    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuenow', '1');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '13');
    await expect(host.locator('[aria-live="polite"]')).toContainText('Cuota 13 de 240');
    expectNoConsoleErrors(page);
    expectNoExternalRequests(page);
    await expectNoClientStorage(page);
  });

  test('the scenario switch shows the installments the prepayment saves', async ({ page }) => {
    await page.goto('/');
    const host = await board(page);
    const prepaid = host.getByRole('button', { name: '+ Q 50,000.00 en la cuota 60' });
    await prepaid.click();
    await expect(prepaid).toHaveAttribute('aria-pressed', 'true');
    await expect(host.getByRole('button', { name: 'Sin abono' })).toHaveAttribute('aria-pressed', 'false');
    await expect(host.locator('.tiles i.gone')).toHaveCount(240 - PREPAID_COUNT);
    await expect(host.locator('.saved')).toContainText('35 cuotas');
    await host.getByRole('slider', { name: 'Cuota' }).focus();
    await page.keyboard.press('End');
    await expect(host.locator('.readout')).toContainText(`Pagado en la cuota ${String(PREPAID_COUNT)}`);
  });

  test('a mouse drag on the track moves the knob', async ({ page }) => {
    await page.goto('/');
    const host = await board(page);
    const box = await host.locator('.track').boundingBox();
    if (box === null) throw new Error('no track');
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, y, { steps: 5 });
    await page.mouse.move(box.x + box.width - 1, y, { steps: 5 });
    await page.mouse.up();
    await expect(host.getByRole('slider', { name: 'Cuota' })).toHaveAttribute('aria-valuenow', '240');
  });

  test('the footer carries the disclaimer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('contentinfo')).toContainText(
      'Cifras estimadas; el banco tiene la última palabra. No es asesoría financiera.',
    );
  });

  test('the mosaic lands on load, and a custom cursor follows a fine pointer', async ({ page }) => {
    await page.goto('/');
    const blocks = page.getByTestId('mosaic-block');
    await expect(blocks).toHaveCount(6);
    expect(await blocks.first().evaluate((el) => getComputedStyle(el).animationName)).toContain('land');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Calcula tus cuotas, mes a mes.');
    await page.mouse.move(200, 200);
    await expect(page.locator('.cursor')).toHaveCount(1);
    await expect(page.locator('.cursor')).toHaveAttribute('aria-hidden', 'true');
  });

  test('the headline never scrambles: it reads the final text through hydration and the first 800 ms', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'commit' });
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeAttached();
    const samples: (string | null)[] = [];
    const start = Date.now();
    while (Date.now() - start < 800) {
      samples.push(await h1.textContent());
      await page.waitForTimeout(40);
    }
    expect(samples.length).toBeGreaterThan(5);
    expect(new Set(samples)).toEqual(new Set(['Calcula tus cuotas, mes a mes.']));
  });

  test('the custom cursor and its class go away when leaving the landing', async ({ page }) => {
    await page.goto('/');
    await page.mouse.move(200, 200);
    await expect(page.locator('.cursor')).toHaveCount(1);
    await page.getByRole('link', { name: 'Abrir la app' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator('.cursor')).toHaveCount(0);
  });
});

test.describe('landing / with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('shows the final headline and counters at once, with no cursor and no animation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('page-landing')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.mouse.move(200, 200);
    const counters = page.locator('[data-odometer]');
    for (let i = 0; i < 5; i++) {
      expect(await page.getByRole('heading', { level: 1 }).textContent()).toBe('Calcula tus cuotas, mes a mes.');
      expect(await counters.allTextContents()).toEqual(COUNTERS);
      await page.waitForTimeout(60);
    }
    await expect(page.locator('.cursor')).toHaveCount(0);
    const slider = (await board(page)).getByRole('slider', { name: 'Cuota' });
    for (let i = 0; i < 5; i++) {
      await expect(slider).toHaveAttribute('aria-valuenow', '60');
      await page.waitForTimeout(100);
    }
    const running = await page.evaluate(
      () => document.getAnimations().filter((animation) => animation.playState === 'running').length,
    );
    expect(running).toBe(0);
    expect(
      await page
        .getByTestId('mosaic-block')
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe('none');
  });
});

test.describe('landing / on a touch screen', () => {
  test.use({ hasTouch: true });

  test('a tap on the track moves the knob there', async ({ page }) => {
    await page.goto('/');
    const host = await board(page);
    const box = await host.locator('.track').boundingBox();
    if (box === null) throw new Error('no track');
    expect(await host.locator('.track').evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');
    await page.touchscreen.tap(box.x + box.width - 1, box.y + box.height / 2);
    await expect(host.getByRole('slider', { name: 'Cuota' })).toHaveAttribute('aria-valuenow', '240');
  });

  test('a finger drag on the track moves the knob (Chromium touch events)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Playwright drives multi-step touch only through the Chromium protocol');
    await page.goto('/');
    const host = await board(page);
    const box = await host.locator('.track').boundingBox();
    if (box === null) throw new Error('no track');
    const y = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', box.x + 2);
    for (const f of [0.25, 0.5, 0.75]) await touch('touchMove', box.x + box.width * f);
    await expect(host.getByRole('slider', { name: 'Cuota' })).toHaveAttribute('aria-valuenow', '180');
    await touch('touchEnd', 0);
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
  });

  test('has no custom cursor', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Calcula tus cuotas, mes a mes.');
    await page.waitForLoadState('networkidle');
    await page.mouse.move(200, 200);
    await expect(page.locator('.cursor')).toHaveCount(0);
  });
});

test.describe('landing / without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('renders the headline, the «Sin cuenta» promise, the counters and the disclaimer from the prerender', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Calcula tus cuotas, mes a mes.');
    await expect(page.getByText('Sin cuenta. Tus números se quedan en tu navegador.')).toBeVisible();
    await expect(page.locator('[data-odometer]')).toHaveText(COUNTERS);
    await expect(page.getByRole('link', { name: 'Abrir la app' })).toHaveAttribute('href', '/app');
    await expect(page.getByRole('contentinfo')).toContainText('No es asesoría financiera.');
    await expect(page.locator('cc-landing-board .tiles i')).toHaveCount(240);
    await expect(page.locator('cc-landing-board .readout')).toContainText('Cuota 60 de 240');
    await expect(page.getByRole('slider', { name: 'Cuota' })).toHaveAttribute('aria-valuenow', '60');
  });
});
