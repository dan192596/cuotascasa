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
 * `baseURL`.
 */
export const test = base.extend<Fixtures>({
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
