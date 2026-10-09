import { test as base, expect } from '@playwright/test';
import { installGoogleMock, type GoogleMock } from './google-mock.ts';
import { startRecording } from './recorder.ts';

interface Fixtures {
  /** The Google mock installed on this test's context before any navigation. Nothing real is ever contacted. */
  googleMock: GoogleMock;
}

/**
 * `test` for every spec. Its `page` records requests, console errors and CSP violations from the first navigation,
 * so the helpers of support/expectations.ts can be called at the end of any test. The origin is the project's
 * `baseURL`. Every http(s) request to another origin is aborted (blockedbyclient) before it leaves the machine,
 * unless the Google mock serves it.
 */
export const test = base.extend<Fixtures>({
  // Registered first, so the Google mock's more specific routes (registered later) win for the URLs they serve.
  context: async ({ context, baseURL }, use) => {
    if (baseURL === undefined) throw new Error('playwright.config.ts must define use.baseURL');
    const origin = new URL(baseURL).origin;
    await context.route('**', (route) => {
      const url = new URL(route.request().url());
      const web = url.protocol === 'http:' || url.protocol === 'https:';
      return web && url.origin !== origin ? route.abort('blockedbyclient') : route.fallback();
    });
    await use(context);
  },
  page: async ({ page, baseURL }, use) => {
    if (baseURL === undefined) throw new Error('playwright.config.ts must define use.baseURL');
    await startRecording(page, new URL(baseURL).origin);
    await use(page);
  },
  googleMock: async ({ context }, use) => {
    await use(await installGoogleMock(context));
  },
});

export { expect };
