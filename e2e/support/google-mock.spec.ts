import type { Page } from '@playwright/test';
import { expectNoConsoleErrors, expectNoCspViolations, expectNoExternalRequests } from './expectations.ts';
import { loadGisScript } from './google-mock.ts';
import { expect, test } from './test.ts';
import { openHarness } from './harness.ts';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

interface TokenOutcome {
  readonly token?: string;
  readonly error?: string;
}

interface GisWindow {
  readonly google: {
    readonly accounts: {
      readonly oauth2: {
        initTokenClient(config: {
          client_id: string;
          scope: string;
          callback: (response: { access_token?: string; error?: string }) => void;
          error_callback: (error: { type: string }) => void;
        }): { requestAccessToken(): void };
      };
    };
  };
}

/** Loads the (mocked) GIS script like the app does and asks for a token. */
async function requestToken(page: Page): Promise<TokenOutcome> {
  await loadGisScript(page);
  return page.evaluate(
    (scope) =>
      new Promise<{ token?: string; error?: string }>((resolve) => {
        const client = (window as unknown as GisWindow).google.accounts.oauth2.initTokenClient({
          client_id: 'synthetic-client-id.apps.example',
          scope,
          callback: (response) =>
            resolve(response.error === undefined ? { token: response.access_token } : { error: response.error }),
          error_callback: (error) => resolve({ error: error.type }),
        });
        client.requestAccessToken();
      }),
    SCOPE,
  );
}

async function listFiles(page: Page, token: string | undefined): Promise<{ status: number; names: string[] }> {
  return page.evaluate(async (bearer) => {
    const response = await fetch(
      'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)',
      bearer === undefined ? {} : { headers: { Authorization: `Bearer ${bearer}` } },
    );
    const body = (await response.json()) as { files?: { name: string }[] };
    return { status: response.status, names: (body.files ?? []).map((file) => file.name) };
  }, token);
}

test.describe('Google mock', () => {
  test('serves the GIS script and Drive v3 from the frozen fakes, inspectable from the test', async ({
    page,
    googleMock,
  }) => {
    await openHarness(page);
    googleMock.drive.seed({ name: 'cuotascasa-sync.json', content: '{"synthetic":true}' });

    const outcome = await requestToken(page);
    expect(outcome.token).toMatch(/^gis-fake-token-/);
    expect(googleMock.gis.issuedTokens).toEqual([outcome.token]);
    expect(googleMock.gis.requests).toHaveLength(1);
    expect(googleMock.gis.requests[0]).toMatchObject({ scope: SCOPE, consentScreen: true, action: 'approve' });

    expect(await listFiles(page, outcome.token)).toEqual({ status: 200, names: ['cuotascasa-sync.json'] });
    expect((await listFiles(page, undefined)).status).toBe(401);
    expect(googleMock.drive.requests.map((request) => request.operation)).toContain('files.list');
  });

  test('queued user actions and injected Drive failures reach the page', async ({ page, googleMock }) => {
    await openHarness(page);
    googleMock.gis.queueUserActions('deny', 'close-popup', 'approve');
    expect((await requestToken(page)).error).toBe('access_denied');
    expect((await requestToken(page)).error).toBe('popup_closed');
    const approved = await requestToken(page);
    expect(approved.token).toBeDefined();

    googleMock.drive.failNext({ kind: 'status', status: 503 });
    expect((await listFiles(page, approved.token)).status).toBe(503);
    googleMock.drive.failNext({ kind: 'network' });
    await expect(listFiles(page, approved.token)).rejects.toThrow();
  });

  test('a Google URL the mock does not serve is blocked, not sent', async ({ page, googleMock }) => {
    await openHarness(page);
    await requestToken(page);
    expect(googleMock.gis.requests).toHaveLength(1);
    const failures: string[] = [];
    page
      .context()
      .on('requestfailed', (request) => failures.push(`${request.url()} ${request.failure()?.errorText ?? ''}`));
    await expect(page.evaluate(() => fetch('https://oauth2.googleapis.com/x'))).rejects.toThrow();
    await expect.poll(() => failures.length).toBeGreaterThan(0);
    expect(failures.join('\n')).toMatch(/oauth2\.googleapis\.com\/x .*(BLOCKED_BY_CLIENT|blocked)/i);
    // Served-by-mock hosts are still flagged as external, which is what tests of the real app must never see.
    expect(() => expectNoExternalRequests(page)).toThrow(/accounts\.google\.com/);
  });

  test('loads GIS and talks to Drive on a real /app page under the final CSP with zero violations', async ({
    page,
    googleMock,
  }) => {
    googleMock.drive.seed({ name: 'cuotascasa-sync.json', content: '{"synthetic":true}' });
    await page.goto('/app');
    await expect(page.getByTestId('page-dashboard')).toBeVisible();

    const outcome = await requestToken(page);
    expect(outcome.token).toMatch(/^gis-fake-token-/);
    expect(await listFiles(page, outcome.token)).toEqual({ status: 200, names: ['cuotascasa-sync.json'] });
    await page.waitForLoadState('networkidle');

    expectNoCspViolations(page);
    expectNoConsoleErrors(page);
    // Only the two Google hosts, both answered by the mock.
    expect(() => expectNoExternalRequests(page)).toThrow(/accounts\.google\.com/);
  });
});
