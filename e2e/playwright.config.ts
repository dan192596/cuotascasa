import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the production build served exactly as Cloudflare would (ADR-0014, ADR-0022): `ng build`, then
 * tools/edge/serve.mjs (`wrangler dev --local`, fully offline), so every test sees the real `_headers`/`_redirects`
 * of whatever the build contains. Chromium and WebKit. Traces and screenshots are kept only on failure.
 */
/** 8799 by default; parallel local runs (one per worktree) pass their own E2E_PORT so they never share a server. */
const PORT = Number(process.env['E2E_PORT'] ?? '8799');
/** Synthetic, e2e-only Google client ID (never a real one). */
export const E2E_GOOGLE_CLIENT_ID = 'cuotascasa-e2e-synthetic-client';
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
    // Always starts a fresh build and server, so a stale or foreign server on the port can never be tested by accident.
    // Set E2E_REUSE=1 to reuse a server you started yourself (e.g. `node tools/edge/serve.mjs` after `pnpm build`).
    // Build first (the edge serves dist/apps/web/browser), then serve it. Stopping this process stops wrangler.
    // Same as `pnpm build`, plus a SYNTHETIC Google client ID so the Drive flows run against the Google mock (W5-08).
    // It is not a real ID and does not match the shape the dist spec and gitleaks look for.
    command:
      `pnpm exec ng build --define "GOOGLE_CLIENT_ID='${E2E_GOOGLE_CLIENT_ID}'" && ` +
      `node tools/edge/headers/generate.mjs && node tools/edge/serve.mjs --port ${String(PORT)}`,
    cwd: '..',
    url: `${BASE_URL}/`,
    reuseExistingServer: process.env['E2E_REUSE'] === '1',
    timeout: 240_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    env: { WRANGLER_SEND_METRICS: 'false', DO_NOT_TRACK: '1' },
  },
});
