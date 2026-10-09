import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the production build served exactly as Cloudflare would (ADR-0014, ADR-0022): `ng build`, then
 * tools/edge/serve.mjs (`wrangler dev --local`, fully offline), so every test sees the real `_headers`/`_redirects`
 * of whatever the build contains. Chromium and WebKit. Traces and screenshots are kept only on failure.
 */
const PORT = 8799;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;

export default defineConfig({
  testDir: '.',
  testMatch: ['specs/**/*.spec.ts', 'support/**/*.spec.ts'],
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] !== undefined ? 1 : 0,
  reporter: process.env['CI'] !== undefined ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 7_500 },
  use: {
    baseURL: BASE_URL,
    locale: 'es-GT',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    // Build first (the edge serves dist/apps/web/browser), then serve it. Stopping this process stops wrangler.
    command: `pnpm build && node tools/edge/serve.mjs --port ${String(PORT)}`,
    cwd: '..',
    url: `${BASE_URL}/`,
    reuseExistingServer: process.env['CI'] === undefined,
    timeout: 240_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    env: { WRANGLER_SEND_METRICS: 'false', DO_NOT_TRACK: '1' },
  },
});
