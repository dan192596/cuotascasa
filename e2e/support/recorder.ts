import type { Page } from '@playwright/test';

export interface CspViolation {
  readonly directive: string;
  readonly blockedUri: string;
  readonly sourceFile: string;
  readonly disposition: string;
}

export interface ConsoleError {
  readonly text: string;
  /** URL the message points at (the failing resource for "Failed to load resource"), '' when unknown. */
  readonly url: string;
}

interface Recorder {
  readonly origin: string;
  readonly requests: string[];
  readonly consoleErrors: ConsoleError[];
  readonly csp: CspViolation[];
}

const recorders = new WeakMap<Page, Recorder>();

/** Requests that never leave the browser. */
const LOCAL_SCHEMES = new Set(['data:', 'blob:', 'about:']);

export function isExternal(url: string, origin: string): boolean {
  const parsed = new URL(url);
  return !LOCAL_SCHEMES.has(parsed.protocol) && parsed.origin !== origin;
}

/**
 * Starts recording requests, console errors and CSP violations of `page` (enforced and report-only). The `test`
 * fixture of support/test.ts does this for every page before the first navigation; call it yourself only on pages
 * you create by hand. `origin` is the app origin: anything else counts as external.
 */
export async function startRecording(page: Page, origin: string): Promise<void> {
  if (recorders.has(page)) return;
  const recorder: Recorder = { origin, requests: [], consoleErrors: [], csp: [] };
  recorders.set(page, recorder);
  page.on('request', (request) => recorder.requests.push(request.url()));
  page.on('console', (message) => {
    if (message.type() === 'error') recorder.consoleErrors.push({ text: message.text(), url: message.location().url });
  });
  page.on('pageerror', (error) => recorder.consoleErrors.push({ text: `pageerror: ${error.message}`, url: '' }));
  await page.exposeFunction('__ccCspReport', (violation: CspViolation) => {
    recorder.csp.push(violation);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { __ccCspReport?: (violation: CspViolation) => void }).__ccCspReport;
      report?.({
        directive: event.violatedDirective,
        blockedUri: event.blockedURI,
        sourceFile: event.sourceFile,
        disposition: event.disposition,
      });
    });
  });
}

export function recorderOf(page: Page): Recorder {
  const recorder = recorders.get(page);
  if (recorder === undefined) {
    throw new Error('Page is not being recorded: use `test` from support/test.ts or call startRecording(page, origin)');
  }
  return recorder;
}
