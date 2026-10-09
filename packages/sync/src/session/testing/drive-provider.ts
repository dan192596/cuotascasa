import {
  DRIVE_APPDATA_FOLDER,
  DRIVE_FILES_URL,
  DRIVE_UPLOAD_URL,
  SyncError,
  type DriveErrorResponse,
  type DriveFile,
  type DriveFileList,
  type RemoteFile,
  type RemoteFileName,
  type SyncProvider,
} from '../../ports.ts';
import type { DriveFake } from '../../testing/index.ts';

/**
 * Test-only SyncProvider over the frozen DriveFake's fetch (the stand-in for W2-09's provider): it speaks the Drive v3
 * subset of docs/specs/drive-api-subset.md and maps failures as ports.ts documents. It exists so the session tests run
 * against the frozen fake unchanged.
 */

const FIELDS = 'id,name,modifiedTime,version';
const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded']);
const BOUNDARY = 'cuotascasa-test-boundary';

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
  const body = [
    `--${BOUNDARY}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${BOUNDARY}`,
    'Content-Type: application/json',
    '',
    content,
    `--${BOUNDARY}--`,
    '',
  ].join('\r\n');
  return { body, contentType: `multipart/related; boundary=${BOUNDARY}` };
}

function toRemote(file: DriveFile): RemoteFile {
  return {
    id: file.id,
    name: file.name as RemoteFileName,
    modifiedTime: file.modifiedTime ?? '',
    version: file.version ?? '',
  };
}

export function createDriveProvider(fake: DriveFake, options: { authorized?: boolean } = {}): SyncProvider {
  let authorized = options.authorized ?? true;

  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
      response = await fake.fetch(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), Authorization: 'Bearer test-token' },
      });
    } catch {
      throw new SyncError('NetworkError');
    }
    if (!response.ok) {
      throw await failureOf(response);
    }
    return response;
  }

  async function findFile(name: RemoteFileName): Promise<RemoteFile | null> {
    const q = encodeURIComponent(`name = '${name}'`);
    const response = await call(
      `${DRIVE_FILES_URL}?spaces=${DRIVE_APPDATA_FOLDER}&q=${q}&fields=${encodeURIComponent(`files(${FIELDS})`)}`,
    );
    const list = (await response.json()) as DriveFileList;
    const [first] = [...list.files].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return first === undefined ? null : toRemote(first);
  }

  async function downloadFile(file: RemoteFile): Promise<string> {
    return (await call(`${DRIVE_FILES_URL}/${encodeURIComponent(file.id)}?alt=media`)).text();
  }

  async function createFile(name: RemoteFileName, content: string): Promise<RemoteFile> {
    const { body, contentType } = multipart({ name, parents: [DRIVE_APPDATA_FOLDER] }, content);
    const response = await call(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=${FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    });
    return toRemote((await response.json()) as DriveFile);
  }

  async function updateFile(file: RemoteFile, content: string): Promise<RemoteFile> {
    const { body, contentType } = multipart({}, content);
    const response = await call(
      `${DRIVE_UPLOAD_URL}/${encodeURIComponent(file.id)}?uploadType=multipart&fields=${FIELDS}`,
      { method: 'PATCH', headers: { 'Content-Type': contentType }, body },
    );
    return toRemote((await response.json()) as DriveFile);
  }

  return {
    connect: () => Promise.resolve(),
    isAuthorized: () => authorized,
    authorize: () => {
      authorized = true;
      return Promise.resolve();
    },
    disconnect: () => {
      authorized = false;
      return Promise.resolve();
    },
    findFile,
    downloadFile,
    createFile,
    updateFile,
    async copyFile(file, name) {
      const existing = await findFile(name);
      if (existing !== null) {
        return updateFile(existing, await downloadFile(file));
      }
      const response = await call(`${DRIVE_FILES_URL}/${encodeURIComponent(file.id)}/copy?fields=${FIELDS}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parents: [DRIVE_APPDATA_FOLDER] }),
      });
      return toRemote((await response.json()) as DriveFile);
    },
  };
}
