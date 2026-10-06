import { describe, expect, it, vi } from 'vitest';
import { DRIVE_APPDATA_SCOPE, DRIVE_FILES_URL, type GisClientError, type GisTokenResponse } from '../ports.ts';
import { createDriveFake } from './drive-fake.ts';
import { createGisFake, type GisFake } from './gis-fake.ts';

interface Outcome {
  readonly response?: GisTokenResponse;
  readonly error?: GisClientError;
}

function requestToken(gis: GisFake, prompt?: '' | 'consent'): Promise<Outcome> {
  return new Promise((resolve) => {
    const client = gis.oauth2.initTokenClient({
      client_id: 'cliente-sintetico.apps.googleusercontent.com',
      scope: DRIVE_APPDATA_SCOPE,
      callback: (response) => {
        resolve({ response });
      },
      error_callback: (error) => {
        resolve({ error });
      },
    });
    client.requestAccessToken(prompt === undefined ? undefined : { prompt });
  });
}

function accessToken(outcome: Outcome): string {
  const response = outcome.response;
  if (response === undefined || !('access_token' in response)) {
    throw new Error('Expected a token');
  }
  return response.access_token;
}

describe('gis-fake: initTokenClient and requestAccessToken', () => {
  it('approves by default: the callback gets a Bearer token valid for 3599 s with the requested scope', async () => {
    const gis = createGisFake();
    const outcome = await requestToken(gis);
    expect(outcome.response).toEqual({
      access_token: 'gis-fake-token-1',
      expires_in: 3599,
      scope: DRIVE_APPDATA_SCOPE,
      token_type: 'Bearer',
    });
    expect(gis.requests).toEqual([
      {
        clientId: 'cliente-sintetico.apps.googleusercontent.com',
        scope: DRIVE_APPDATA_SCOPE,
        prompt: undefined,
        consentScreen: true,
        action: 'approve',
      },
    ]);
    expect(gis.isTokenValid('gis-fake-token-1')).toBe(true);
  });

  it("records prompt '' on a re-request after consent, without a consent screen", async () => {
    const gis = createGisFake();
    await requestToken(gis);
    const again = await requestToken(gis, '');
    expect(accessToken(again)).toBe('gis-fake-token-2');
    expect(gis.requests[1]).toMatchObject({ prompt: '', consentScreen: false });
    expect(gis.issuedTokens).toEqual(['gis-fake-token-1', 'gis-fake-token-2']);
  });

  it('calls back asynchronously, never inside requestAccessToken', () => {
    const gis = createGisFake();
    const callback = vi.fn();
    gis.oauth2.initTokenClient({ client_id: 'c', scope: DRIVE_APPDATA_SCOPE, callback }).requestAccessToken();
    expect(callback).not.toHaveBeenCalled();
  });

  it('delivers access_denied through the callback when the user denies', async () => {
    const gis = createGisFake();
    gis.queueUserActions('deny');
    const outcome = await requestToken(gis);
    expect(outcome.response).toEqual({ error: 'access_denied', error_description: 'The user denied the request' });
    expect(gis.issuedTokens).toEqual([]);
  });

  it('runs error_callback when the popup is closed or blocked', async () => {
    const gis = createGisFake();
    gis.queueUserActions('close-popup', 'block-popup');
    expect((await requestToken(gis)).error).toEqual({ type: 'popup_closed', message: 'Popup window closed' });
    expect((await requestToken(gis)).error).toEqual({
      type: 'popup_failed_to_open',
      message: 'Failed to open popup window',
    });
    expect(gis.requests.map((entry) => entry.action)).toEqual(['close-popup', 'block-popup']);
  });
});

describe('gis-fake: expiry and revoke', () => {
  it('expires a token exactly after its lifetime on the injected clock', async () => {
    let now = Date.parse('2026-10-04T15:00:00.000Z');
    const gis = createGisFake({ now: () => now, tokenLifetimeSeconds: 60 });
    const token = accessToken(await requestToken(gis));
    now += 59_999;
    expect(gis.isTokenValid(token)).toBe(true);
    now += 1;
    expect(gis.isTokenValid(token)).toBe(false);
    expect(gis.isTokenValid('never-issued')).toBe(false);
  });

  it('revoke invalidates the token, calls done and requires consent again', async () => {
    const gis = createGisFake();
    const token = accessToken(await requestToken(gis));
    await new Promise<void>((resolve) => {
      gis.oauth2.revoke(token, resolve);
    });
    expect(gis.isTokenValid(token)).toBe(false);
    expect(gis.revokedTokens).toEqual([token]);
    await requestToken(gis, '');
    expect(gis.requests[1]?.consentScreen).toBe(true);
  });

  it('revoke of an unknown token still calls done and changes nothing', async () => {
    const gis = createGisFake();
    const done = vi.fn();
    gis.oauth2.revoke('unknown', done);
    await vi.waitFor(() => {
      expect(done).toHaveBeenCalledTimes(1);
    });
    expect(gis.revokedTokens).toEqual([]);
  });
});

describe('gis-fake: wiring', () => {
  it('installs itself as google.accounts.oauth2 on a target', () => {
    const gis = createGisFake();
    const target: { google?: unknown } = {};
    gis.install(target);
    expect(target.google).toEqual({ accounts: { oauth2: gis.oauth2 } });
  });

  it('installs itself on globalThis, as the e2e mock does on window (gisFake.install(window))', () => {
    const gis = createGisFake();
    gis.install(globalThis);
    try {
      const installed = (globalThis as { google?: { accounts?: { oauth2?: unknown } } }).google;
      expect(installed?.accounts?.oauth2).toBe(gis.oauth2);
    } finally {
      delete (globalThis as { google?: unknown }).google;
    }
  });

  it('shares token validity with the drive fake: a live token lists, an expired one gets 401', async () => {
    let now = Date.parse('2026-10-04T15:00:00.000Z');
    const gis = createGisFake({ now: () => now });
    const drive = createDriveFake({ isTokenValid: (token) => gis.isTokenValid(token) });
    const token = accessToken(await requestToken(gis));
    const url = `${DRIVE_FILES_URL}?spaces=appDataFolder`;
    expect((await drive.fetch(url, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
    now += 3_599_000;
    expect((await drive.fetch(url, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401);
  });

  it('reset forgets tokens, requests, revocations and queued actions', async () => {
    const gis = createGisFake();
    gis.queueUserActions('deny', 'deny');
    await requestToken(gis);
    gis.reset();
    const outcome = await requestToken(gis);
    expect(accessToken(outcome)).toBe('gis-fake-token-1');
    expect(gis.requests).toHaveLength(1);
    expect(gis.revokedTokens).toEqual([]);
  });
});
