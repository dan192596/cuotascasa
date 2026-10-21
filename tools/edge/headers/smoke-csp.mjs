// @ts-check
/* global document, window -- the evaluate() callbacks run in the page */
// Chromium smoke (W2-10): loads the built pages behind the real headers and fails on any CSP or Trusted Types
// violation. Not part of edge:check (the name does not match check*.mjs): run it after `pnpm build`.
// Usage: node tools/edge/headers/smoke-csp.mjs [--port 8799] [--assets <dir>] [--base-url <origin>]
// Without --base-url it serves the local build through wrangler; with it, it sweeps that origin as is (W7-01).
// Requests to any origin other than the swept one are aborted and reported.
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { DEFAULT_PORT, parseArgs } from '../lib.mjs';
import { startEdge } from '../serve.mjs';
import { prepareAssets } from './prepare.mjs';

const PAGES = ['/', '/privacidad', '/app', '/app/prestamos/x/tabla', '/nope'];
// Not 8799: edge:check and the W2-11 e2e use it.
const SMOKE_PORT = 8797;
const SETTLE_MS = 1500;

/**
 * Whether a request leaves the swept origin. Only http(s) counts: data: and blob: URLs never hit the network.
 * @param {string} url
 * @param {string} origin
 */
export function isExternal(url, origin) {
  const parsed = new URL(url);
  return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin !== origin;
}

/** @param {string} baseUrl */
async function sweep(baseUrl) {
  const origin = new URL(baseUrl).origin;
  let exitCode;
  const browser = await chromium.launch();
  try {
    for (const path of PAGES) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      /** @type {string[]} */
      const problems = [];
      await page.route(
        (url) => isExternal(url.href, origin),
        (route) => {
          problems.push(`external request: ${route.request().url()}`);
          return route.abort();
        },
      );
      page.on('console', (message) => {
        // The 404 page itself is a failed resource load by design.
        if (message.type() === 'error' && message.location().url !== `${baseUrl}${path}`)
          problems.push(`console error: ${message.text()}`);
      });
      page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          // @ts-expect-error scratch channel read back through evaluate
          (window.__violations ??= []).push(`${event.violatedDirective} blocked ${event.blockedURI || 'inline'}`);
        });
      });
      await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(SETTLE_MS);
      const violations = /** @type {string[]} */ (
        // @ts-expect-error set by the init script
        await page.evaluate(() => window.__violations ?? [])
      );
      const rendered = await page.evaluate(() => (document.body?.innerText ?? '').trim().length > 0);
      for (const violation of violations) problems.push(`CSP violation: ${violation}`);
      if (!rendered) problems.push('page rendered no text');
      console.log(`${problems.length === 0 ? 'ok  ' : 'FAIL'} ${path}`);
      for (const problem of problems) console.error(`  - ${problem}`);
      if (problems.length > 0) exitCode = 1;
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return exitCode;
}

async function main() {
  /** @type {{ stop: () => void } | undefined} */
  let edge;
  let cleanup = () => {};
  let exitCode;
  try {
    const args = parseArgs(process.argv.slice(2));
    let baseUrl = args.baseUrl;
    if (baseUrl === undefined) {
      const prepared = prepareAssets(args.assets);
      cleanup = prepared.cleanup;
      const started = await startEdge({
        port: args.port === DEFAULT_PORT ? SMOKE_PORT : args.port,
        assets: prepared.dir,
      });
      edge = started;
      baseUrl = started.baseUrl;
    }
    exitCode = await sweep(baseUrl);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    exitCode = 2;
  } finally {
    edge?.stop();
    cleanup();
  }
  process.exit(exitCode);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
