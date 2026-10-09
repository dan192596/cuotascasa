import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncError, type RemoteFile } from '../ports.ts';
import { createDriveFake, createGisFake } from '../testing/index.ts';
import { createGoogleDriveProvider } from './index.ts';

const ALLOWED_PREFIXES = ['https://www.googleapis.com/drive/v3/', 'https://www.googleapis.com/upload/drive/v3/'];

async function setup(options: { startAuthorized?: boolean } = {}) {
  let clock = 1_000_000;
  const now = () => clock;
  const gis = createGisFake({ now });
  const drive = createDriveFake({ isTokenValid: gis.isTokenValid });
  const loadGis = vi.fn(() => Promise.resolve(gis.oauth2));
  const urls: string[] = [];
  const headers: string[] = [];
  const fetchSpy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    headers.push(new Headers(init?.headers).get('Authorization') ?? '');
    return drive.fetch(input, init);
  });
  const provider = createGoogleDriveProvider({ clientId: 'cliente-sintetico', loadGis, fetch: fetchSpy, now });
  if (options.startAuthorized !== false) {
    await provider.connect();
  }
  return {
    gis,
    drive,
    provider,
    loadGis,
    fetchSpy,
    urls,
    headers,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connect and token lifecycle', () => {
  it('loads GIS only on connect() and holds an unexpired token afterwards', async () => {
    const env = await setup({ startAuthorized: false });
    expect(env.loadGis).not.toHaveBeenCalled();
    expect(env.provider.isAuthorized()).toBe(false);
    await env.provider.connect();
    expect(env.loadGis).toHaveBeenCalledTimes(1);
    expect(env.provider.isAuthorized()).toBe(true);
    expect(env.gis.requests).toHaveLength(1);
    expect(env.gis.requests[0]).toMatchObject({
      clientId: 'cliente-sintetico',
      scope: 'https://www.googleapis.com/auth/drive.appdata',
      prompt: 'consent',
    });
  });

  it('maps a denied consent, a closed popup and a blocked popup to AuthError', async () => {
    for (const action of ['deny', 'close-popup', 'block-popup'] as const) {
      const env = await setup({ startAuthorized: false });
      env.gis.queueUserActions(action);
      await expectCode(env.provider.connect(), 'AuthError');
      expect(env.provider.isAuthorized()).toBe(false);
    }
  });

  it('maps a GIS load failure to NetworkError', async () => {
    const env = await setup({ startAuthorized: false });
    const failing = createGoogleDriveProvider({
      clientId: 'x',
      loadGis: () => Promise.reject(new SyncError('NetworkError')),
      fetch: env.drive.fetch,
      now: () => 0,
    });
    await expectCode(failing.connect(), 'NetworkError');
  });

  it('expires the token before GIS does and refuses calls without a live token (no popup, no fetch)', async () => {
    const env = await setup();
    env.advance(3_599_000);
    expect(env.provider.isAuthorized()).toBe(false);
    await expectCode(env.provider.findFile('cuotascasa.json'), 'AuthError');
    expect(env.fetchSpy).not.toHaveBeenCalled();
    expect(env.gis.requests).toHaveLength(1);
  });

  it('re-requests the token with prompt "" only on authorize()', async () => {
    const env = await setup();
    env.advance(3_599_000);
    await env.provider.authorize();
    expect(env.provider.isAuthorized()).toBe(true);
    expect(env.gis.requests).toHaveLength(2);
    expect(env.gis.requests[1]?.prompt).toBe('');
    expect(env.gis.requests[1]?.consentScreen).toBe(false);
    expect(await env.provider.findFile('cuotascasa.json')).toBeNull();
  });

  it('authorize() without a prior connect() loads GIS and asks with prompt ""', async () => {
    const env = await setup({ startAuthorized: false });
    await env.provider.authorize();
    expect(env.loadGis).toHaveBeenCalledTimes(1);
    expect(env.gis.requests[0]?.prompt).toBe('');
    expect(env.provider.isAuthorized()).toBe(true);
  });

  it('coalesces concurrent authorize() calls into one popup', async () => {
    const env = await setup({ startAuthorized: false });
    await Promise.all([env.provider.authorize(), env.provider.authorize()]);
    expect(env.gis.requests).toHaveLength(1);
  });

  it('a failed authorize() can be retried', async () => {
    const env = await setup({ startAuthorized: false });
    env.gis.queueUserActions('close-popup');
    await expectCode(env.provider.authorize(), 'AuthError');
    await env.provider.authorize();
    expect(env.provider.isAuthorized()).toBe(true);
  });

  it('disconnect() revokes the token with GIS and forgets it', async () => {
    const env = await setup();
    const token = env.gis.issuedTokens[0];
    await env.provider.disconnect();
    expect(env.gis.revokedTokens).toEqual([token]);
    expect(env.provider.isAuthorized()).toBe(false);
    await expectCode(env.provider.findFile('cuotascasa.json'), 'AuthError');
  });

  it('disconnect() without a token is a no-op that does not load GIS', async () => {
    const env = await setup({ startAuthorized: false });
    await env.provider.disconnect();
    expect(env.loadGis).not.toHaveBeenCalled();
    expect(env.gis.revokedTokens).toEqual([]);
  });
});

describe('Drive v3 subset against the frozen fake', () => {
  it('exercises every call, with the bearer token, on allowed URLs only', async () => {
    const env = await setup();
    const token = env.gis.issuedTokens[0] ?? '';
    expect(await env.provider.findFile('cuotascasa.json')).toBeNull();
    const created = await env.provider.createFile('cuotascasa.json', '{"a":1}');
    expect(created).toMatchObject({ name: 'cuotascasa.json', version: '1' });
    expect(created.id).not.toBe('');
    expect(created.modifiedTime).not.toBe('');
    const found = await env.provider.findFile('cuotascasa.json');
    expect(found).toEqual(created);
    expect(await env.provider.downloadFile(created)).toBe('{"a":1}');
    const updated = await env.provider.updateFile(created, '{"a":2}');
    expect(updated.id).toBe(created.id);
    expect(updated.version).toBe('2');
    expect(await env.provider.downloadFile(updated)).toBe('{"a":2}');
    const prev = await env.provider.copyFile(updated, 'cuotascasa.prev.json');
    expect(prev).toMatchObject({ name: 'cuotascasa.prev.json' });
    expect(env.drive.fileByName('cuotascasa.prev.json')?.content).toBe('{"a":2}');

    const operations = new Set(env.drive.requests.map((request) => request.operation));
    expect(operations).toEqual(
      new Set(['files.list', 'files.get.media', 'files.create.multipart', 'files.update.multipart', 'files.copy']),
    );
    expect(env.drive.requests.every((request) => request.status === 200)).toBe(true);
    expect(env.urls.every((url) => ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix)))).toBe(true);
    expect(env.headers.every((header) => header === `Bearer ${token}`)).toBe(true);
  });

  it('copyFile overwrites an existing target instead of creating a duplicate', async () => {
    const env = await setup();
    const current = await env.provider.createFile('cuotascasa.json', 'nuevo');
    await env.provider.createFile('cuotascasa.prev.json', 'viejo');
    const prev = await env.provider.copyFile(current, 'cuotascasa.prev.json');
    expect(env.drive.files().filter((file) => file.name === 'cuotascasa.prev.json')).toHaveLength(1);
    expect(env.drive.fileByName('cuotascasa.prev.json')?.content).toBe('nuevo');
    expect(prev.version).toBe('2');
    expect(env.drive.requests.some((request) => request.operation === 'files.copy')).toBe(false);
  });

  it('findFile picks the smallest id among duplicates', async () => {
    const env = await setup();
    const a = env.drive.seed({ name: 'cuotascasa.json', content: 'a' });
    const b = env.drive.seed({ name: 'cuotascasa.json', content: 'b' });
    const expected = a.id < b.id ? a : b;
    expect((await env.provider.findFile('cuotascasa.json'))?.id).toBe(expected.id);
  });

  it('preserves content with non-ASCII text and multipart-looking lines', async () => {
    const env = await setup();
    const content = '{"nota":"cuota — ñandú\\n--cuotascasa-boundary"}';
    const file = await env.provider.createFile('cuotascasa.json', content);
    expect(await env.provider.downloadFile(file)).toBe(content);
  });
});

describe('error mapping', () => {
  const find = (provider: Awaited<ReturnType<typeof setup>>['provider']) => provider.findFile('cuotascasa.json');

  it('401 -> AuthError and the token is dropped', async () => {
    const env = await setup();
    env.drive.failNext({ kind: 'status', status: 401 });
    await expectCode(find(env.provider), 'AuthError');
    expect(env.provider.isAuthorized()).toBe(false);
  });

  it('403 with a non-rate-limit reason -> AuthError', async () => {
    const env = await setup();
    env.drive.failNext({ kind: 'status', status: 403, reason: 'insufficientFilePermissions' });
    await expectCode(find(env.provider), 'AuthError');
  });

  it('403 rateLimitExceeded and userRateLimitExceeded, 429 and 5xx -> NetworkError', async () => {
    const env = await setup();
    const failures = [
      { kind: 'status', status: 403, reason: 'rateLimitExceeded' },
      { kind: 'status', status: 403, reason: 'userRateLimitExceeded' },
      { kind: 'status', status: 429 },
      { kind: 'status', status: 500 },
      { kind: 'status', status: 502 },
      { kind: 'status', status: 503 },
    ] as const;
    for (const failure of failures) {
      env.drive.failNext(failure);
      await expectCode(find(env.provider), 'NetworkError');
    }
    expect(env.provider.isAuthorized()).toBe(true);
  });

  it('a fetch failure -> NetworkError', async () => {
    const env = await setup();
    env.drive.failNext({ kind: 'network' });
    await expectCode(find(env.provider), 'NetworkError');
  });

  it('other non-2xx answers (404) -> NetworkError', async () => {
    const env = await setup();
    const ghost: RemoteFile = { id: 'no-existe', name: 'cuotascasa.json', modifiedTime: '', version: '1' };
    await expectCode(env.provider.downloadFile(ghost), 'NetworkError');
    await expectCode(env.provider.updateFile(ghost, 'x'), 'NetworkError');
    await expectCode(env.provider.copyFile(ghost, 'cuotascasa.prev.json'), 'NetworkError');
  });

  it('applies the mapping to every operation', async () => {
    const env = await setup();
    const file = await env.provider.createFile('cuotascasa.json', 'x');
    env.drive.failNext({ kind: 'network' }, { operation: 'files.get.media' });
    await expectCode(env.provider.downloadFile(file), 'NetworkError');
    env.drive.failNext({ kind: 'status', status: 503 }, { operation: 'files.create.multipart' });
    await expectCode(env.provider.createFile('cuotascasa.prev.json', 'x'), 'NetworkError');
    env.drive.failNext({ kind: 'status', status: 500 }, { operation: 'files.update.multipart' });
    await expectCode(env.provider.updateFile(file, 'y'), 'NetworkError');
    env.drive.failNext({ kind: 'status', status: 503 }, { operation: 'files.copy' });
    await expectCode(env.provider.copyFile(file, 'cuotascasa.prev.json'), 'NetworkError');
  });
});

describe('token storage', () => {
  it('never touches localStorage, sessionStorage, IndexedDB or cookies', async () => {
    const touched: string[] = [];
    const trap = (name: string) =>
      new Proxy(
        {},
        {
          get(_target, property) {
            touched.push(`${name}.${String(property)}`);
            return undefined;
          },
          set(_target, property) {
            touched.push(`${name}.${String(property)}=`);
            return true;
          },
        },
      );
    vi.stubGlobal('localStorage', trap('localStorage'));
    vi.stubGlobal('sessionStorage', trap('sessionStorage'));
    vi.stubGlobal('indexedDB', trap('indexedDB'));
    vi.stubGlobal('document', trap('document'));
    const env = await setup();
    const file = await env.provider.createFile('cuotascasa.json', 'x');
    await env.provider.updateFile(file, 'y');
    env.advance(3_600_000);
    await env.provider.authorize();
    await env.provider.disconnect();
    expect(touched).toEqual([]);
  });
});
