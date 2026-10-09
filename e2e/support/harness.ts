import type { Page } from '@playwright/test';

/**
 * A neutral page on the app origin for the self-tests of the probes, the network block and the Google mock.
 *
 * The real pages carry the final ADR-0021 CSP with Trusted Types enforced, which (rightly) refuses the scripts,
 * data:/blob: fetches, websockets and service workers those self-tests inject. The harness is answered by
 * `context.route`, so it has the same origin as the app (same-origin semantics, same storage) but NO CSP header at
 * all: it is a test double, never a product page. Tests of real CSP behavior use real routes instead.
 */
export const HARNESS_PATH = '/__e2e__/blank.html';
/** An inert service worker script inside the harness scope (/__e2e__/). Tests can override it with their own route. */
export const HARNESS_WORKER_PATH = '/__e2e__/worker.js';

const PAGE = `<!doctype html>
<html lang="es-GT">
  <head><meta charset="utf-8"><title>Harness e2e</title></head>
  <body><main><h1>Harness e2e</h1></main></body>
</html>
`;

/** Navigates `page` to the harness. Register overrides (for example a worker body) before calling it. */
export async function openHarness(page: Page): Promise<void> {
  const context = page.context();
  await context.route(`**${HARNESS_PATH}`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE }),
  );
  await context.route(`**${HARNESS_WORKER_PATH}`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '// inert' }),
  );
  await page.goto(HARNESS_PATH);
}
