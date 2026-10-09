import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DRIVE_APPDATA_SCOPE,
  SyncError,
  type GisOAuth2,
  type GisTokenClientConfig,
  type GisTokenResponse,
  type RemoteFile,
  type RemoteFileName,
} from '../ports.ts';
import { createDriveFake, createGisFake } from '../testing/index.ts';
import { createGoogleDriveProvider, type GoogleDriveProviderOptions } from './index.ts';

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await rejection(promise);
  expect(error).toBeInstanceOf(SyncError);
  expect((error as SyncError).code).toBe(code);
}

type Fetch = GoogleDriveProviderOptions['fetch'];

/** Real fakes plus a clock; `fetch` can be replaced to craft odd answers. */
async function connected(overrides: Partial<GoogleDriveProviderOptions> = {}) {
  let clock = 1_000_000;
  const now = () => clock;
  const gis = createGisFake({ now });
  const drive = createDriveFake({ isTokenValid: gis.isTokenValid });
  const provider = createGoogleDriveProvider({
    clientId: 'cliente-sintetico',
    loadGis: () => Promise.resolve(gis.oauth2),
    fetch: drive.fetch,
    now,
    ...overrides,
  });
  await provider.connect();
  return {
    gis,
    drive,
    provider,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

/** A GIS stub that answers every token request with `respond`'s result (or never, when it returns null). */
function stubGis(respond: (config: GisTokenClientConfig) => GisTokenResponse | null): {
  oauth2: GisOAuth2;
  revoked: string[];
} {
  const revoked: string[] = [];
  return {
    revoked,
    oauth2: {
      initTokenClient: (config) => ({
        requestAccessToken: () => {
          const response = respond(config);
          if (response !== null) {
            setTimeout(() => {
              config.callback(response);
            }, 0);
          }
        },
      }),
      revoke: (token, done) => {
        revoked.push(token);
        done?.();
      },
    },
  };
}

function providerWith(oauth2: GisOAuth2, extra: Partial<GoogleDriveProviderOptions> = {}) {
  return createGoogleDriveProvider({
    clientId: 'c',
    loadGis: () => Promise.resolve(oauth2),
    fetch: createDriveFake().fetch,
    now: () => 0,
    ...extra,
  });
}

const goodToken = (extra: Partial<{ expires_in: unknown; scope: string }> = {}): GisTokenResponse =>
  ({
    access_token: 't',
    expires_in: 3599,
    scope: DRIVE_APPDATA_SCOPE,
    token_type: 'Bearer',
    ...extra,
  }) as GisTokenResponse;

afterEach(() => {
  vi.useRealTimers();
});

describe('disconnect while a token request is pending', () => {
  it('revokes the late token, rejects connect() with AuthError and stays unauthorized', async () => {
    const gis = createGisFake();
    const provider = providerWith(gis.oauth2);
    const pending = provider.connect();
    await provider.disconnect();
    await expectCode(pending, 'AuthError');
    expect(provider.isAuthorized()).toBe(false);
    expect(gis.issuedTokens).toHaveLength(1);
    expect(gis.revokedTokens).toEqual(gis.issuedTokens);
  });

  it('with the popup already open: the token that arrives is revoked', async () => {
    const gis = createGisFake();
    const provider = createGoogleDriveProvider({
      clientId: 'c',
      loadGis: () => Promise.resolve(gis.oauth2),
      fetch: createDriveFake().fetch,
      now: () => Date.now(),
    });
    const pending = provider.connect();
    await Promise.resolve();
    await Promise.resolve();
    await provider.disconnect();
    await expectCode(pending, 'AuthError');
    expect(provider.isAuthorized()).toBe(false);
    expect(gis.revokedTokens).toEqual(gis.issuedTokens);
  });

  it('a new connect() after disconnect() works', async () => {
    const gis = createGisFake();
    const provider = providerWith(gis.oauth2, { now: () => Date.now() });
    const first = provider.connect();
    await provider.disconnect();
    await rejection(first);
    await provider.connect();
    expect(provider.isAuthorized()).toBe(true);
  });
});

describe('stale 401', () => {
  it('a late 401 from an old token does not drop the new token', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const gatedFetch: Fetch = async () => {
      calls += 1;
      await gate;
      return new Response('{}', { status: 401 });
    };
    const env = await connected({ fetch: gatedFetch });
    const inFlight = env.provider.findFile('cuotascasa.json');
    await env.provider.authorize();
    release();
    await expectCode(inFlight, 'AuthError');
    expect(calls).toBe(1);
    expect(env.provider.isAuthorized()).toBe(true);
  });
});

describe('expiry margin', () => {
  it('stays authorized until 60 s before expires_in, exactly', async () => {
    const env = await connected();
    env.advance(3_539_000 - 1);
    expect(env.provider.isAuthorized()).toBe(true);
    env.advance(1);
    expect(env.provider.isAuthorized()).toBe(false);
  });
});

describe('findFile query escaping', () => {
  it('escapes quotes and backslashes in the name', async () => {
    const urls: string[] = [];
    const env = await connected({
      fetch: (input) => {
        urls.push(String(input));
        return Promise.resolve(new Response('{"files":[]}', { status: 200 }));
      },
    });
    await env.provider.findFile("a'b\\c" as RemoteFileName);
    const q = new URL(urls[0] ?? '').searchParams.get('q');
    expect(q).toBe("name = 'a\\'b\\\\c'");
  });
});

describe('scope check', () => {
  it('rejects a token that lacks the appdata scope (granular consent)', async () => {
    const { oauth2 } = stubGis(() => goodToken({ scope: 'openid email' }));
    await expectCode(providerWith(oauth2).connect(), 'AuthError');
  });

  it('accepts the scope among several', async () => {
    const { oauth2 } = stubGis(() => goodToken({ scope: `openid ${DRIVE_APPDATA_SCOPE}` }));
    const provider = providerWith(oauth2);
    await provider.connect();
    expect(provider.isAuthorized()).toBe(true);
  });
});

describe('token response validation', () => {
  it.each([0, Number.NaN, 'abc', -5])('expires_in %s -> AuthError', async (value) => {
    const { oauth2 } = stubGis(() => goodToken({ expires_in: value }));
    await expectCode(providerWith(oauth2).connect(), 'AuthError');
  });

  it('a response without a string scope -> AuthError, not a TypeError', async () => {
    const { oauth2 } = stubGis(() => ({ access_token: 't', expires_in: 3599, token_type: 'Bearer' }) as never);
    await expectCode(providerWith(oauth2).connect(), 'AuthError');
  });

  it('an empty access_token -> AuthError', async () => {
    const { oauth2 } = stubGis(() => ({ ...goodToken(), access_token: '' }));
    await expectCode(providerWith(oauth2).connect(), 'AuthError');
  });

  it('initTokenClient throwing -> AuthError', async () => {
    const oauth2: GisOAuth2 = {
      initTokenClient: () => {
        throw new Error('boom');
      },
      revoke: () => undefined,
    };
    await expectCode(providerWith(oauth2).connect(), 'AuthError');
  });

  it('loadGis rejecting with a plain Error -> NetworkError', async () => {
    const provider = createGoogleDriveProvider({
      clientId: 'c',
      loadGis: () => Promise.reject(new Error('plain')),
      fetch: createDriveFake().fetch,
      now: () => 0,
    });
    await expectCode(provider.connect(), 'NetworkError');
  });
});

describe('odd Drive answers', () => {
  it('403 with a non-JSON body -> AuthError', async () => {
    const env = await connected({ fetch: () => Promise.resolve(new Response('nope', { status: 403 })) });
    await expectCode(env.provider.findFile('cuotascasa.json'), 'AuthError');
  });

  it('200 with invalid JSON -> NetworkError', async () => {
    const env = await connected({ fetch: () => Promise.resolve(new Response('not json', { status: 200 })) });
    await expectCode(env.provider.findFile('cuotascasa.json'), 'NetworkError');
  });

  it('a body that cannot be read -> NetworkError', async () => {
    const broken = { ok: true, status: 200, text: () => Promise.reject(new Error('cut')) } as unknown as Response;
    const env = await connected({ fetch: () => Promise.resolve(broken) });
    const file: RemoteFile = { id: 'a', name: 'cuotascasa.json', modifiedTime: '', version: '1' };
    await expectCode(env.provider.downloadFile(file), 'NetworkError');
  });

  it('a file without modifiedTime or version maps to empty strings; duplicates pick the smallest id', async () => {
    const list = {
      files: [
        { id: 'b', name: 'cuotascasa.json' },
        { id: 'c', name: 'cuotascasa.json' },
        { id: 'a', name: 'cuotascasa.json' },
        { id: 'a', name: 'cuotascasa.json' },
      ],
    };
    const env = await connected({
      fetch: () => Promise.resolve(new Response(JSON.stringify(list), { status: 200 })),
    });
    expect(await env.provider.findFile('cuotascasa.json')).toEqual({
      id: 'a',
      name: 'cuotascasa.json',
      modifiedTime: '',
      version: '',
    });
  });

  it('content containing the first boundary candidate still round-trips', async () => {
    const env = await connected();
    const content = 'x\r\n--cuotascasa-part-0\r\ny --cuotascasa-part-1 z';
    const file = await env.provider.createFile('cuotascasa.json', content);
    expect(await env.provider.downloadFile(file)).toBe(content);
  });
});

describe('late token after a timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is revoked, not installed', async () => {
    vi.useFakeTimers();
    const gis = createGisFake();
    let deliver: () => void = () => undefined;
    const oauth2: GisOAuth2 = {
      initTokenClient: (config) => ({
        requestAccessToken: () => {
          deliver = () => {
            gis.oauth2.initTokenClient({ ...config, callback: config.callback }).requestAccessToken();
          };
        },
      }),
      revoke: gis.oauth2.revoke,
    };
    const provider = providerWith(oauth2, { tokenTimeoutMs: 1_000 });
    const pending = expectCode(provider.connect(), 'AuthError');
    await vi.advanceTimersByTimeAsync(1_000);
    await pending;
    deliver();
    await vi.advanceTimersByTimeAsync(10);
    expect(gis.issuedTokens).toHaveLength(1);
    expect(gis.revokedTokens).toEqual(gis.issuedTokens);
    expect(provider.isAuthorized()).toBe(false);
  });
});

describe('late error after a timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is ignored (nothing to revoke)', async () => {
    vi.useFakeTimers();
    const revoked: string[] = [];
    let late: () => void = () => undefined;
    const oauth2: GisOAuth2 = {
      initTokenClient: (config) => ({
        requestAccessToken: () => {
          late = () => {
            config.callback({ error: 'access_denied' });
          };
        },
      }),
      revoke: (token) => revoked.push(token),
    };
    const provider = providerWith(oauth2, { tokenTimeoutMs: 10 });
    const pending = expectCode(provider.connect(), 'AuthError');
    await vi.advanceTimersByTimeAsync(10);
    await pending;
    late();
    expect(revoked).toEqual([]);
    expect(provider.isAuthorized()).toBe(false);
  });
});

describe('timeouts', () => {
  it('connect() rejects with AuthError when GIS never answers, then can retry', async () => {
    vi.useFakeTimers();
    let answer = false;
    const { oauth2 } = stubGis(() => (answer ? goodToken() : null));
    const provider = providerWith(oauth2);
    const pending = expectCode(provider.connect(), 'AuthError');
    await vi.advanceTimersByTimeAsync(120_000);
    await pending;
    answer = true;
    const retry = provider.connect();
    await vi.advanceTimersByTimeAsync(1);
    await retry;
    expect(provider.isAuthorized()).toBe(true);
  });

  it('honours an injected token timeout', async () => {
    vi.useFakeTimers();
    const { oauth2 } = stubGis(() => null);
    const provider = providerWith(oauth2, { tokenTimeoutMs: 500 });
    const pending = expectCode(provider.authorize(), 'AuthError');
    await vi.advanceTimersByTimeAsync(499);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
  });

  it('disconnect() forgets the token at once and stops waiting for revoke after the cap', async () => {
    vi.useFakeTimers();
    const revoked: string[] = [];
    const oauth2: GisOAuth2 = {
      initTokenClient: (config) => ({
        requestAccessToken: () => {
          setTimeout(() => {
            config.callback(goodToken());
          }, 0);
        },
      }),
      revoke: (token) => {
        revoked.push(token);
      },
    };
    const provider = providerWith(oauth2, { revokeTimeoutMs: 2_000 });
    const connecting = provider.connect();
    await vi.advanceTimersByTimeAsync(1);
    await connecting;
    expect(provider.isAuthorized()).toBe(true);
    let settled = false;
    const closing = provider.disconnect().then(() => {
      settled = true;
    });
    expect(provider.isAuthorized()).toBe(false);
    expect(revoked).toEqual(['t']);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await closing;
    expect(settled).toBe(true);
  });
});
