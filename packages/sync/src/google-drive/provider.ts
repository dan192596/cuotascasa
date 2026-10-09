import {
  DRIVE_APPDATA_FOLDER,
  DRIVE_APPDATA_SCOPE,
  DRIVE_FILES_URL,
  DRIVE_UPLOAD_URL,
  SyncError,
  type DriveErrorResponse,
  type DriveFile,
  type DriveFileList,
  type GisOAuth2,
  type GisTokenClient,
  type GisTokenResponse,
  type RemoteFile,
  type RemoteFileName,
  type SyncProvider,
} from '../ports.ts';

export interface GoogleDriveProviderOptions {
  /** Build-time OAuth client id (W3-17); empty means sync is not configured. */
  readonly clientId: string;
  /** Loads GIS on connect() only and returns google.accounts.oauth2 (ADR-0021 method). */
  readonly loadGis: () => Promise<GisOAuth2>;
  /** fetch implementation; tests pass driveFake.fetch. */
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** Millisecond clock for token expiry. */
  readonly now: () => number;
}

const FIELDS = 'id,name,modifiedTime,version';
const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded']);
/** The token is treated as expired this long before GIS says so, so a call never starts with a dying token. */
const EXPIRY_MARGIN_MS = 60_000;

interface Token {
  readonly value: string;
  readonly expiresAt: number;
}

async function failureOf(response: Response): Promise<SyncError> {
  if (response.status === 401) {
    return new SyncError('AuthError');
  }
  if (response.status === 403) {
    let reason: string | undefined;
    try {
      reason = ((await response.json()) as DriveErrorResponse).error.errors[0]?.reason;
    } catch {
      reason = undefined;
    }
    return new SyncError(reason !== undefined && RATE_LIMIT_REASONS.has(reason) ? 'NetworkError' : 'AuthError');
  }
  return new SyncError('NetworkError');
}

function multipart(metadata: object, content: string): { body: string; contentType: string } {
  const metadataJson = JSON.stringify(metadata);
  let counter = 0;
  let boundary = 'cuotascasa-part-0';
  while (content.includes(boundary) || metadataJson.includes(boundary)) {
    counter += 1;
    boundary = `cuotascasa-part-${String(counter)}`;
  }
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadataJson,
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

function toRemote(file: DriveFile): RemoteFile {
  return {
    id: file.id,
    name: file.name as RemoteFileName,
    modifiedTime: file.modifiedTime ?? '',
    version: file.version ?? '',
  };
}

/**
 * Drive v3 appDataFolder provider on the GIS token model (ADR-0008, docs/specs/drive-api-subset.md). The access token
 * lives in a closure variable only: never in localStorage, sessionStorage, IndexedDB or cookies. A token popup opens
 * only from connect() and authorize(); data calls never open one.
 */
export function createGoogleDriveProvider(options: GoogleDriveProviderOptions): SyncProvider {
  let token: Token | null = null;
  let oauth2: GisOAuth2 | null = null;
  let pendingRequest: Promise<void> | null = null;

  function liveToken(): string {
    if (token === null || options.now() >= token.expiresAt - EXPIRY_MARGIN_MS) {
      throw new SyncError('AuthError');
    }
    return token.value;
  }

  function isAuthorized(): boolean {
    return token !== null && options.now() < token.expiresAt - EXPIRY_MARGIN_MS;
  }

  async function ensureOAuth2(): Promise<GisOAuth2> {
    if (oauth2 === null) {
      try {
        oauth2 = await options.loadGis();
      } catch (error) {
        throw error instanceof SyncError ? error : new SyncError('NetworkError');
      }
    }
    return oauth2;
  }

  function requestToken(prompt: 'consent' | ''): Promise<void> {
    if (pendingRequest !== null) {
      return pendingRequest;
    }
    const attempt = (async () => {
      const gis = await ensureOAuth2();
      const response = await new Promise<GisTokenResponse>((resolve, reject) => {
        let client: GisTokenClient;
        try {
          client = gis.initTokenClient({
            client_id: options.clientId,
            scope: DRIVE_APPDATA_SCOPE,
            callback: resolve,
            error_callback: () => {
              reject(new SyncError('AuthError'));
            },
          });
          client.requestAccessToken({ prompt });
        } catch {
          reject(new SyncError('AuthError'));
        }
      });
      if (!('access_token' in response) || response.access_token === '') {
        throw new SyncError('AuthError');
      }
      const seconds = Number(response.expires_in);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new SyncError('AuthError');
      }
      token = { value: response.access_token, expiresAt: options.now() + seconds * 1000 };
    })();
    pendingRequest = attempt;
    const clear = () => {
      pendingRequest = null;
    };
    attempt.then(clear, clear);
    return attempt;
  }

  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    const bearer = liveToken();
    let response: Response;
    try {
      response = await options.fetch(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${bearer}` },
      });
    } catch {
      throw new SyncError('NetworkError');
    }
    if (!response.ok) {
      if (response.status === 401) {
        token = null;
      }
      throw await failureOf(response);
    }
    return response;
  }

  async function json<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch {
      throw new SyncError('NetworkError');
    }
  }

  async function text(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      throw new SyncError('NetworkError');
    }
  }

  async function findFile(name: RemoteFileName): Promise<RemoteFile | null> {
    const q = encodeURIComponent(`name = '${name}'`);
    const response = await call(
      `${DRIVE_FILES_URL}?spaces=${DRIVE_APPDATA_FOLDER}&q=${q}&fields=${encodeURIComponent(`files(${FIELDS})`)}`,
    );
    const list = await json<DriveFileList>(response);
    const [first] = [...list.files].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return first === undefined ? null : toRemote(first);
  }

  async function downloadFile(file: RemoteFile): Promise<string> {
    return text(await call(`${DRIVE_FILES_URL}/${encodeURIComponent(file.id)}?alt=media`));
  }

  async function createFile(name: RemoteFileName, content: string): Promise<RemoteFile> {
    const { body, contentType } = multipart({ name, parents: [DRIVE_APPDATA_FOLDER] }, content);
    const response = await call(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=${FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    });
    return toRemote(await json<DriveFile>(response));
  }

  async function updateFile(file: RemoteFile, content: string): Promise<RemoteFile> {
    const { body, contentType } = multipart({}, content);
    const response = await call(
      `${DRIVE_UPLOAD_URL}/${encodeURIComponent(file.id)}?uploadType=multipart&fields=${FIELDS}`,
      { method: 'PATCH', headers: { 'Content-Type': contentType }, body },
    );
    return toRemote(await json<DriveFile>(response));
  }

  async function copyFile(file: RemoteFile, name: RemoteFileName): Promise<RemoteFile> {
    const existing = await findFile(name);
    if (existing !== null) {
      return updateFile(existing, await downloadFile(file));
    }
    const response = await call(`${DRIVE_FILES_URL}/${encodeURIComponent(file.id)}/copy?fields=${FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [DRIVE_APPDATA_FOLDER] }),
    });
    return toRemote(await json<DriveFile>(response));
  }

  async function disconnect(): Promise<void> {
    const held = token;
    token = null;
    if (held === null || oauth2 === null) {
      return;
    }
    const gis = oauth2;
    await new Promise<void>((resolve) => {
      gis.revoke(held.value, () => {
        resolve();
      });
    });
  }

  return {
    connect: () => requestToken('consent'),
    isAuthorized,
    authorize: () => requestToken(''),
    disconnect,
    findFile,
    downloadFile,
    createFile,
    updateFile,
    copyFile,
  };
}
