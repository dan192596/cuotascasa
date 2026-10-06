import { describe, expect, it } from 'vitest';
import {
  DRIVE_FILES_URL,
  DRIVE_UPLOAD_URL,
  type DriveErrorResponse,
  type DriveFile,
  type DriveFileList,
} from '../ports.ts';
import { createDriveFake, type DriveFake } from './drive-fake.ts';

const AUTH = { Authorization: 'Bearer token-1' };
const CONTENT = '{"synthetic":"contenido de prueba"}';
const LIST_FIELDS = 'files(id,name,mimeType,modifiedTime,version,parents)';
const FILE_FIELDS = 'id,name,mimeType,modifiedTime,version,parents';

function steppingClock(): () => string {
  let current = Date.parse('2026-10-04T15:00:00.000Z');
  return () => {
    current += 1_000;
    return new Date(current).toISOString();
  };
}

function multipart(metadata: object, content: string): { body: string; headers: Record<string, string> } {
  const boundary = 'cuotascasa-boundary';
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    content,
    `--${boundary}--`,
  ].join('\r\n');
  return { body, headers: { ...AUTH, 'Content-Type': `multipart/related; boundary=${boundary}` } };
}

function listUrl(query: string | null, fields: string | null = LIST_FIELDS, spaces = 'appDataFolder'): string {
  const params = new URLSearchParams({ spaces });
  if (query !== null) {
    params.set('q', query);
  }
  if (fields !== null) {
    params.set('fields', fields);
  }
  return `${DRIVE_FILES_URL}?${params.toString()}`;
}

async function create(drive: DriveFake, name: string, content = CONTENT): Promise<DriveFile> {
  const { body, headers } = multipart({ name, parents: ['appDataFolder'] }, content);
  const response = await drive.fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=${FILE_FIELDS}`, {
    method: 'POST',
    headers,
    body,
  });
  expect(response.status).toBe(200);
  return (await response.json()) as DriveFile;
}

async function errorOf(response: Response): Promise<DriveErrorResponse['error']> {
  return ((await response.json()) as DriveErrorResponse).error;
}

describe('drive-fake: files.list (spaces=appDataFolder, name query)', () => {
  it('lists only matching files with the requested fields', async () => {
    const drive = createDriveFake({ now: steppingClock() });
    await create(drive, 'cuotascasa.json');
    await create(drive, 'cuotascasa.prev.json');
    const response = await drive.fetch(listUrl("name = 'cuotascasa.json'"), { headers: AUTH });
    expect(response.status).toBe(200);
    const list = (await response.json()) as DriveFileList;
    expect(list.files).toEqual([
      {
        id: 'fake-file-1',
        name: 'cuotascasa.json',
        mimeType: 'application/json',
        modifiedTime: '2026-10-04T15:00:01.000Z',
        version: '1',
        parents: ['appDataFolder'],
      },
    ]);
  });

  it("accepts the trashed = false clause and returns Drive's default fields without `fields`", async () => {
    const drive = createDriveFake();
    await create(drive, 'cuotascasa.json');
    const response = await drive.fetch(listUrl("name='cuotascasa.json' and trashed = false", null), { headers: AUTH });
    expect(((await response.json()) as DriveFileList).files).toEqual([
      { kind: 'drive#file', id: 'fake-file-1', name: 'cuotascasa.json', mimeType: 'application/json' },
    ]);
  });

  it('returns an empty list when nothing matches and every file without q', async () => {
    const drive = createDriveFake();
    await create(drive, 'cuotascasa.json');
    const none = await drive.fetch(listUrl("name = 'otro.json'"), { headers: AUTH });
    expect(((await none.json()) as DriveFileList).files).toEqual([]);
    const all = await drive.fetch(listUrl(null), { headers: AUTH });
    expect(((await all.json()) as DriveFileList).files).toHaveLength(1);
  });

  it('rejects another space with 403 and an unsupported query or field with 400', async () => {
    const drive = createDriveFake();
    const otherSpace = await drive.fetch(listUrl(null, LIST_FIELDS, 'drive'), { headers: AUTH });
    expect(otherSpace.status).toBe(403);
    expect((await errorOf(otherSpace)).errors[0]?.reason).toBe('insufficientScopes');
    const badQuery = await drive.fetch(listUrl("mimeType = 'application/json'"), { headers: AUTH });
    expect(badQuery.status).toBe(400);
    expect((await errorOf(badQuery)).errors[0]?.reason).toBe('invalidQuery');
    const badField = await drive.fetch(listUrl(null, 'files(id,owners)'), { headers: AUTH });
    expect(badField.status).toBe(400);
    const noFilesSelector = await drive.fetch(listUrl(null, 'nextPageToken'), { headers: AUTH });
    expect(noFilesSelector.status).toBe(400);
  });
});

describe('drive-fake: files.get with alt=media', () => {
  it('downloads the content with its mime type', async () => {
    const drive = createDriveFake();
    const file = await create(drive, 'cuotascasa.json');
    const response = await drive.fetch(`${DRIVE_FILES_URL}/${file.id}?alt=media`, { headers: AUTH });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(await response.text()).toBe(CONTENT);
  });

  it('answers 404 notFound for an unknown id', async () => {
    const drive = createDriveFake();
    const response = await drive.fetch(`${DRIVE_FILES_URL}/missing?alt=media`, { headers: AUTH });
    expect(response.status).toBe(404);
    expect((await errorOf(response)).errors[0]?.reason).toBe('notFound');
  });
});

describe('drive-fake: files.create with uploadType=multipart', () => {
  it('stores the file in appDataFolder and returns the requested fields', async () => {
    const drive = createDriveFake({ now: steppingClock() });
    const file = await create(drive, 'cuotascasa.json');
    expect(file).toEqual({
      id: 'fake-file-1',
      name: 'cuotascasa.json',
      mimeType: 'application/json',
      modifiedTime: '2026-10-04T15:00:01.000Z',
      version: '1',
      parents: ['appDataFolder'],
    });
    expect(drive.fileByName('cuotascasa.json')?.content).toBe(CONTENT);
  });

  it('rejects a parent other than appDataFolder with 403, a missing name and a non-multipart body with 400', async () => {
    const drive = createDriveFake();
    const outside = multipart({ name: 'cuotascasa.json', parents: ['root'] }, CONTENT);
    expect((await drive.fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, { method: 'POST', ...outside })).status).toBe(
      403,
    );
    const unnamed = multipart({ parents: ['appDataFolder'] }, CONTENT);
    expect((await drive.fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, { method: 'POST', ...unnamed })).status).toBe(
      400,
    );
    const plain = await drive.fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: CONTENT,
    });
    expect(plain.status).toBe(400);
    expect(drive.files()).toEqual([]);
  });
});

describe('drive-fake: files.update with uploadType=multipart', () => {
  it('replaces the content, bumps version and modifiedTime, keeps the name with empty metadata', async () => {
    const drive = createDriveFake({ now: steppingClock() });
    const file = await create(drive, 'cuotascasa.json');
    const { body, headers } = multipart({}, '{"synthetic":"versión 2"}');
    const response = await drive.fetch(`${DRIVE_UPLOAD_URL}/${file.id}?uploadType=multipart&fields=${FILE_FIELDS}`, {
      method: 'PATCH',
      headers,
      body,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: file.id,
      name: 'cuotascasa.json',
      version: '2',
      modifiedTime: '2026-10-04T15:00:02.000Z',
    });
    expect(drive.fileByName('cuotascasa.json')?.content).toBe('{"synthetic":"versión 2"}');
  });

  it('applies two overlapping updates one after the other: versions 2 and 3, and 3 in the end', async () => {
    const drive = createDriveFake({ now: steppingClock() });
    const file = await create(drive, 'cuotascasa.json');
    const url = `${DRIVE_UPLOAD_URL}/${file.id}?uploadType=multipart&fields=${FILE_FIELDS}`;
    const responses = await Promise.all([
      drive.fetch(url, { method: 'PATCH', ...multipart({}, '{"synthetic":"A"}') }),
      drive.fetch(url, { method: 'PATCH', ...multipart({}, '{"synthetic":"B"}') }),
    ]);
    const versions = await Promise.all(
      responses.map(async (response) => ((await response.json()) as DriveFile).version),
    );
    expect(versions.sort()).toEqual(['2', '3']);
    expect(drive.fileByName('cuotascasa.json')?.version).toBe('3');
  });

  it('answers 404 for an unknown id and 403 when metadata tries to move the file', async () => {
    const drive = createDriveFake();
    const file = await create(drive, 'cuotascasa.json');
    const missing = multipart({}, CONTENT);
    expect(
      (await drive.fetch(`${DRIVE_UPLOAD_URL}/missing?uploadType=multipart`, { method: 'PATCH', ...missing })).status,
    ).toBe(404);
    const move = multipart({ parents: ['root'] }, CONTENT);
    expect(
      (await drive.fetch(`${DRIVE_UPLOAD_URL}/${file.id}?uploadType=multipart`, { method: 'PATCH', ...move })).status,
    ).toBe(403);
  });
});

describe('drive-fake: an invalid fields is rejected before anything is written', () => {
  it.each(['create', 'update', 'copy'] as const)(
    '%s answers 400 invalidParameter and leaves the store unchanged',
    async (operation) => {
      const drive = createDriveFake({ now: steppingClock() });
      const seeded = drive.seed({ name: 'cuotascasa.json', content: CONTENT });
      const before = drive.files();
      const jsonHeaders = { ...AUTH, 'Content-Type': 'application/json' };
      const requests = {
        create: () =>
          drive.fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=owners`, {
            method: 'POST',
            ...multipart({ name: 'cuotascasa.prev.json', parents: ['appDataFolder'] }, CONTENT),
          }),
        update: () =>
          drive.fetch(`${DRIVE_UPLOAD_URL}/${seeded.id}?uploadType=multipart&fields=owners`, {
            method: 'PATCH',
            ...multipart({}, '{"synthetic":"versión 2"}'),
          }),
        copy: () =>
          drive.fetch(`${DRIVE_FILES_URL}/${seeded.id}/copy?fields=owners`, {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({ name: 'cuotascasa.prev.json', parents: ['appDataFolder'] }),
          }),
      };
      const response = await requests[operation]();
      expect(response.status).toBe(400);
      expect((await errorOf(response)).errors[0]?.reason).toBe('invalidParameter');
      expect(drive.files()).toEqual(before);
    },
  );
});

describe('drive-fake: files.copy', () => {
  it('copies the content to a new id and name inside appDataFolder', async () => {
    const drive = createDriveFake({ now: steppingClock() });
    const file = await create(drive, 'cuotascasa.json');
    const response = await drive.fetch(`${DRIVE_FILES_URL}/${file.id}/copy?fields=${FILE_FIELDS}`, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'cuotascasa.prev.json', parents: ['appDataFolder'] }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: 'fake-file-2',
      name: 'cuotascasa.prev.json',
      version: '1',
      parents: ['appDataFolder'],
    });
    expect(drive.fileByName('cuotascasa.prev.json')?.content).toBe(CONTENT);
    expect(drive.files()).toHaveLength(2);
  });

  it('answers 404 for an unknown id and 403 for a parent outside appDataFolder', async () => {
    const drive = createDriveFake();
    const file = await create(drive, 'cuotascasa.json');
    const init = { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' } };
    expect((await drive.fetch(`${DRIVE_FILES_URL}/missing/copy`, { ...init, body: '{}' })).status).toBe(404);
    expect(
      (
        await drive.fetch(`${DRIVE_FILES_URL}/${file.id}/copy`, {
          ...init,
          body: JSON.stringify({ parents: ['root'] }),
        })
      ).status,
    ).toBe(403);
  });
});

describe('drive-fake: multipart bodies', () => {
  const upload = `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=${FILE_FIELDS}`;
  const headers = { ...AUTH, 'Content-Type': 'multipart/related; boundary=b' };

  it('takes mimeType from the metadata, else from the media part, else application/octet-stream', async () => {
    const drive = createDriveFake();
    const typed = multipart({ name: 'a.json', parents: ['appDataFolder'], mimeType: 'text/plain' }, CONTENT);
    expect(await (await drive.fetch(upload, { method: 'POST', ...typed })).json()).toMatchObject({
      mimeType: 'text/plain',
    });
    const untypedMedia = [
      '--b',
      'Content-Type: application/json',
      '',
      JSON.stringify({ name: 'b.json', parents: ['appDataFolder'] }),
      '--b',
      '',
      CONTENT,
      '--b--',
    ].join('\r\n');
    expect(await (await drive.fetch(upload, { method: 'POST', headers, body: untypedMedia })).json()).toMatchObject({
      mimeType: 'application/octet-stream',
    });
  });

  it('updates name and mimeType from metadata, keeps the old mime type when the media part has none, and leaves other files alone', async () => {
    const drive = createDriveFake();
    const first = await create(drive, 'cuotascasa.json');
    await create(drive, 'cuotascasa.prev.json');
    const renamed = multipart({ name: 'renombrado.json', mimeType: 'text/plain' }, CONTENT);
    const response = await drive.fetch(`${DRIVE_UPLOAD_URL}/${first.id}?uploadType=multipart&fields=${FILE_FIELDS}`, {
      method: 'PATCH',
      ...renamed,
    });
    expect(await response.json()).toMatchObject({ name: 'renombrado.json', mimeType: 'text/plain' });
    const untypedMedia = ['--b', 'Content-Type: application/json', '', '{}', '--b', '', CONTENT, '--b--'].join('\r\n');
    const kept = await drive.fetch(`${DRIVE_UPLOAD_URL}/${first.id}?uploadType=multipart&fields=${FILE_FIELDS}`, {
      method: 'PATCH',
      headers,
      body: untypedMedia,
    });
    expect(await kept.json()).toMatchObject({ mimeType: 'text/plain', version: '3' });
    expect(drive.fileByName('cuotascasa.prev.json')?.version).toBe('1');
  });

  it.each([
    ['one part only', ['--b', 'Content-Type: application/json', '', '{}', '--b--'].join('\r\n')],
    [
      'a part without a blank line',
      [
        '--b',
        'Content-Type: application/json',
        '{}',
        '--b',
        'Content-Type: application/json',
        '',
        CONTENT,
        '--b--',
      ].join('\r\n'),
    ],
    [
      'metadata that is not JSON',
      ['--b', 'Content-Type: application/json', '', 'not json', '--b', '', CONTENT, '--b--'].join('\r\n'),
    ],
    [
      'metadata that is a JSON array',
      ['--b', 'Content-Type: application/json', '', '[]', '--b', '', CONTENT, '--b--'].join('\r\n'),
    ],
  ])('rejects %s with 400', async (_label, body) => {
    const drive = createDriveFake();
    expect((await drive.fetch(upload, { method: 'POST', headers, body })).status).toBe(400);
  });

  it.each(['null', '[]', '7', '"texto"', 'true'])(
    'rejects the copy body %s, valid JSON but not an object, with 400',
    async (text) => {
      const drive = createDriveFake();
      const file = await create(drive, 'cuotascasa.json');
      const init = { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' } };
      const response = await drive.fetch(`${DRIVE_FILES_URL}/${file.id}/copy`, { ...init, body: text });
      expect(response.status).toBe(400);
      expect(await errorOf(response)).toMatchObject({
        errors: [{ reason: 'parseError', message: 'Body is not a JSON object' }],
      });
      expect(drive.files()).toHaveLength(1);
    },
  );

  it('rejects a copy body that is not JSON with 400 and copies with a default name when the body is empty', async () => {
    const drive = createDriveFake();
    const file = await create(drive, 'cuotascasa.json');
    const init = { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' } };
    expect((await drive.fetch(`${DRIVE_FILES_URL}/${file.id}/copy`, { ...init, body: 'not json' })).status).toBe(400);
    const copied = await drive.fetch(`${DRIVE_FILES_URL}/${file.id}/copy?fields=id,name`, {
      method: 'POST',
      headers: AUTH,
    });
    expect(await copied.json()).toEqual({ id: 'fake-file-2', name: 'Copy of cuotascasa.json' });
  });
});

describe('drive-fake: auth and failure injection', () => {
  it('answers 401 authError without a bearer token or with a token the validator rejects', async () => {
    const drive = createDriveFake({ isTokenValid: (token) => token === 'token-1' });
    const missing = await drive.fetch(listUrl(null));
    expect(missing.status).toBe(401);
    expect((await errorOf(missing)).errors[0]).toMatchObject({ reason: 'authError', location: 'Authorization' });
    const expired = await drive.fetch(listUrl(null), { headers: { Authorization: 'Bearer token-expired' } });
    expect(expired.status).toBe(401);
  });

  it.each([
    [401, 'authError'],
    [403, 'rateLimitExceeded'],
    [429, 'rateLimitExceeded'],
    [500, 'backendError'],
    [502, 'backendError'],
    [503, 'backendError'],
  ] as const)('injects a %i with reason %s once, then recovers', async (status, reason) => {
    const drive = createDriveFake();
    drive.failNext({ kind: 'status', status });
    const failed = await drive.fetch(listUrl(null), { headers: AUTH });
    expect(failed.status).toBe(status);
    expect(await errorOf(failed)).toMatchObject({ code: status, errors: [{ reason }] });
    expect((await drive.fetch(listUrl(null), { headers: AUTH })).status).toBe(200);
  });

  it('honours a custom 403 reason, an operation filter and a repeat count', async () => {
    const drive = createDriveFake();
    const file = await create(drive, 'cuotascasa.json');
    drive.failNext(
      { kind: 'status', status: 403, reason: 'insufficientFilePermissions' },
      { operation: 'files.get.media', times: 2 },
    );
    expect((await drive.fetch(listUrl(null), { headers: AUTH })).status).toBe(200);
    const first = await drive.fetch(`${DRIVE_FILES_URL}/${file.id}?alt=media`, { headers: AUTH });
    expect((await errorOf(first)).errors[0]?.reason).toBe('insufficientFilePermissions');
    expect((await drive.fetch(`${DRIVE_FILES_URL}/${file.id}?alt=media`, { headers: AUTH })).status).toBe(403);
    expect((await drive.fetch(`${DRIVE_FILES_URL}/${file.id}?alt=media`, { headers: AUTH })).status).toBe(200);
  });

  it('simulates a network failure by rejecting like fetch and logs status 0', async () => {
    const drive = createDriveFake();
    drive.failNext({ kind: 'network' });
    await expect(drive.fetch(listUrl(null), { headers: AUTH })).rejects.toBeInstanceOf(TypeError);
    expect(drive.requests.at(-1)).toMatchObject({ operation: 'files.list', status: 0 });
  });

  it('answers 400 notInDriveApiSubset for calls outside the subset and logs them', async () => {
    const drive = createDriveFake();
    const response = await drive.fetch(`${DRIVE_FILES_URL}/some-id`, { method: 'DELETE', headers: AUTH });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).errors[0]?.reason).toBe('notInDriveApiSubset');
    expect((await drive.fetch('https://example.invalid/drive/v3/files', { headers: AUTH })).status).toBe(400);
    expect(drive.requests.map((entry) => entry.operation)).toEqual(['unsupported', 'unsupported']);
  });
});

describe('drive-fake: inspectable store', () => {
  it('seeds, lists, finds, handles Request objects and resets', async () => {
    const drive = createDriveFake({ now: steppingClock() });
    const seeded = drive.seed({ name: 'cuotascasa.json', content: CONTENT });
    expect(seeded).toMatchObject({ id: 'fake-file-1', parents: ['appDataFolder'], version: '1' });
    const response = await drive.handle(new Request(`${DRIVE_FILES_URL}/${seeded.id}?alt=media`, { headers: AUTH }));
    expect(await response.text()).toBe(CONTENT);
    expect(drive.files()).toHaveLength(1);
    expect(drive.requests).toEqual([
      { method: 'GET', url: `${DRIVE_FILES_URL}/${seeded.id}?alt=media`, operation: 'files.get.media', status: 200 },
    ]);
    drive.reset();
    expect(drive.files()).toEqual([]);
    expect(drive.requests).toEqual([]);
    expect(drive.fileByName('cuotascasa.json')).toBeUndefined();
  });

  it('seed returns a copy: changing it leaves the store unchanged', () => {
    const drive = createDriveFake();
    const seeded = drive.seed({ name: 'cuotascasa.json', content: CONTENT });
    (seeded.parents as string[]).push('root');
    (seeded as { name: string }).name = 'otro.json';
    expect(drive.fileByName('cuotascasa.json')).toMatchObject({ parents: ['appDataFolder'] });
    expect(drive.files()).toMatchObject([{ name: 'cuotascasa.json', parents: ['appDataFolder'] }]);
  });
});
