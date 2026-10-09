import type { Page } from '@playwright/test';
import { expectNoExternalRequests } from './expectations.ts';
import { loadGisScript } from './google-mock.ts';
import { expect, test } from './test.ts';

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
    await page.goto('/privacidad');
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
    await page.goto('/privacidad');
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

  test('a mocked page still reaches no real host', async ({ page, googleMock }) => {
    await page.goto('/privacidad');
    await requestToken(page);
    expect(googleMock.gis.requests).toHaveLength(1);
    // Google hosts are the only external origins, and both are answered by the mock (never the network).
    expect(() => expectNoExternalRequests(page)).toThrow(/accounts\.google\.com/);
  });
});
