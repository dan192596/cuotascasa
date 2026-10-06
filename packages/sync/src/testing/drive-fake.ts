import {
  DRIVE_API_ORIGIN,
  DRIVE_APPDATA_FOLDER,
  type DriveErrorDetail,
  type DriveErrorResponse,
  type DriveFile,
  type DriveOperation,
} from '../ports.ts';

/**
 * Frozen in-memory Google Drive v3 appDataFolder (docs/specs/drive-api-subset.md). The provider tests (W2-09),
 * the session tests (W2-08) and the e2e Google mock (W2-11) all use this fake unchanged.
 */
export interface DriveFakeFile {
  readonly id: string;
  readonly name: string;
  readonly parents: readonly string[];
  readonly mimeType: string;
  readonly content: string;
  readonly modifiedTime: string;
  readonly version: string;
}

export type DriveFailure =
  | { readonly kind: 'status'; readonly status: 401 | 403 | 429 | 500 | 502 | 503; readonly reason?: string }
  | { readonly kind: 'network' };

export interface DriveFailureOptions {
  /** Only requests of this operation consume the failure; default: the next request of any operation. */
  readonly operation?: DriveOperation;
  /** How many matching requests fail; default 1. */
  readonly times?: number;
}

export interface DriveRequestLog {
  readonly method: string;
  readonly url: string;
  readonly operation: DriveOperation | 'unsupported';
  /** HTTP status returned, or 0 for an injected network failure. */
  readonly status: number;
}

export interface DriveFakeOptions {
  /** Instant source for modifiedTime; default real time. */
  readonly now?: () => string;
  /** Bearer-token check shared with the GIS fake (gisFake.isTokenValid); default: any non-empty token. */
  readonly isTokenValid?: (token: string) => boolean;
}

export interface DriveFake {
  /** Drop-in replacement for fetch(); rejects with TypeError('Failed to fetch') on an injected network failure. */
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  /** Same behaviour for an already built Request (Playwright route handlers, W2-11). */
  handle(request: Request): Promise<Response>;
  failNext(failure: DriveFailure, options?: DriveFailureOptions): void;
  /** Adds a file directly to appDataFolder, bypassing auth and failures; returns a copy, like fileByName(). */
  seed(file: { readonly name: string; readonly content: string; readonly mimeType?: string }): DriveFakeFile;
  files(): readonly DriveFakeFile[];
  fileByName(name: string): DriveFakeFile | undefined;
  readonly requests: readonly DriveRequestLog[];
  reset(): void;
}

type Route =
  | { readonly operation: 'files.list' | 'files.create.multipart' }
  | { readonly operation: 'files.get.media' | 'files.update.multipart' | 'files.copy'; readonly fileId: string };

interface PendingFailure {
  readonly failure: DriveFailure;
  readonly operation: DriveOperation | undefined;
  remaining: number;
}

const DEFAULT_FIELDS = ['kind', 'id', 'name', 'mimeType'] as const;
const KNOWN_FIELDS = new Set(['kind', 'id', 'name', 'mimeType', 'modifiedTime', 'version', 'parents']);

class DriveHttpError extends Error {
  readonly status: number;
  readonly detail: DriveErrorDetail;

  constructor(status: number, detail: DriveErrorDetail) {
    super(detail.message);
    this.status = status;
    this.detail = detail;
  }
}

function errorResponse(status: number, detail: DriveErrorDetail): Response {
  const body: DriveErrorResponse = { error: { code: status, message: detail.message, errors: [detail] } };
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
}

function injectedDetail(status: 401 | 403 | 429 | 500 | 502 | 503, reason: string | undefined): DriveErrorDetail {
  if (status === 401) {
    return {
      domain: 'global',
      reason: reason ?? 'authError',
      message: 'Invalid Credentials',
      locationType: 'header',
      location: 'Authorization',
    };
  }
  if (status === 403 || status === 429) {
    return { domain: 'usageLimits', reason: reason ?? 'rateLimitExceeded', message: 'Rate Limit Exceeded' };
  }
  const messages = { 500: 'Backend Error', 502: 'Bad Gateway', 503: 'Service Unavailable' } as const;
  return { domain: 'global', reason: reason ?? 'backendError', message: messages[status] };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
  });
}

/** Parses `fields`: 'files(id,name)', 'nextPageToken,files(id,name)' for lists, 'id,name' for one file. */
function selectedFields(raw: string | null, list: boolean): readonly string[] {
  if (raw === null) {
    return DEFAULT_FIELDS;
  }
  const inner = list ? /files\(([^)]*)\)/.exec(raw)?.[1] : raw;
  if (inner === undefined) {
    throw new DriveHttpError(400, {
      domain: 'global',
      reason: 'invalidParameter',
      message: 'Invalid field selection',
      location: 'fields',
      locationType: 'parameter',
    });
  }
  const fields = inner
    .split(',')
    .map((field) => field.trim())
    .filter((field) => field.length > 0);
  if (fields.some((field) => !KNOWN_FIELDS.has(field))) {
    throw new DriveHttpError(400, {
      domain: 'global',
      reason: 'invalidParameter',
      message: 'Invalid field selection',
      location: 'fields',
      locationType: 'parameter',
    });
  }
  return fields;
}

function project(file: DriveFakeFile, fields: readonly string[]): DriveFile {
  const full: Record<string, unknown> = {
    kind: 'drive#file',
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    version: file.version,
    parents: [...file.parents],
  };
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    result[field] = full[field];
  }
  return result as unknown as DriveFile;
}

/** Supports exactly: name = '<value>' optionally followed by: and trashed = false. */
function parseNameQuery(q: string | null): string | undefined {
  if (q === null) {
    return undefined;
  }
  const match = /^\s*name\s*=\s*'((?:[^'\\]|\\.)*)'\s*(?:and\s+trashed\s*=\s*false\s*)?$/.exec(q);
  if (match === null) {
    throw new DriveHttpError(400, {
      domain: 'global',
      reason: 'invalidQuery',
      message: 'Invalid Value',
      location: 'q',
      locationType: 'parameter',
    });
  }
  return String(match[1]).replace(/\\(.)/g, '$1');
}

interface MultipartBody {
  readonly metadata: Record<string, unknown>;
  readonly mediaType: string | undefined;
  readonly media: string;
}

interface MultipartPart {
  readonly headers: string;
  readonly content: string;
}

function splitPart(part: string): MultipartPart {
  const headerless = /^\r?\n/.exec(part);
  if (headerless !== null) {
    return { headers: '', content: part.slice(headerless[0].length) };
  }
  const separator = /\r?\n\r?\n/.exec(part);
  if (separator === null) {
    throw new DriveHttpError(400, {
      domain: 'global',
      reason: 'badContent',
      message: 'Each part needs headers and a blank line',
    });
  }
  return { headers: part.slice(0, separator.index), content: part.slice(separator.index + separator[0].length) };
}

function parseMultipart(contentType: string | null, body: string): MultipartBody {
  const boundary =
    contentType === null ? undefined : /^multipart\/related;.*boundary="?([^";]+)"?/i.exec(contentType)?.[1];
  if (boundary === undefined) {
    throw new DriveHttpError(400, {
      domain: 'global',
      reason: 'badContent',
      message: 'Expected multipart/related with a boundary',
    });
  }
  const parts = body
    .split(`--${boundary}`)
    .slice(1, -1)
    .map((part) => part.replace(/^\r?\n/, '').replace(/\r?\n$/, ''));
  if (parts.length !== 2) {
    throw new DriveHttpError(400, { domain: 'global', reason: 'badContent', message: 'Expected exactly two parts' });
  }
  const [metadataPart, mediaPart] = parts.map(splitPart) as [MultipartPart, MultipartPart];
  let metadata: unknown;
  try {
    metadata = JSON.parse(metadataPart.content);
  } catch {
    throw new DriveHttpError(400, { domain: 'global', reason: 'parseError', message: 'Metadata part is not JSON' });
  }
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new DriveHttpError(400, {
      domain: 'global',
      reason: 'parseError',
      message: 'Metadata part is not a JSON object',
    });
  }
  const mediaType = /content-type:\s*([^\r\n;]+)/i.exec(mediaPart.headers)?.[1];
  return { metadata: metadata as Record<string, unknown>, mediaType, media: mediaPart.content };
}

function isAppDataParents(value: unknown): boolean {
  return Array.isArray(value) && value.length === 1 && value[0] === DRIVE_APPDATA_FOLDER;
}

const FORBIDDEN_OUTSIDE_APPDATA: DriveErrorDetail = {
  domain: 'global',
  reason: 'insufficientScopes',
  message: 'The granted scopes do not give access to all of the requested spaces.',
};

export function createDriveFake(options: DriveFakeOptions = {}): DriveFake {
  const now = options.now ?? (() => new Date().toISOString());
  const isTokenValid = options.isTokenValid ?? ((token: string) => token.length > 0);
  let files: DriveFakeFile[] = [];
  let failures: PendingFailure[] = [];
  let requests: DriveRequestLog[] = [];
  let counter = 0;

  function nextId(): string {
    counter += 1;
    return `fake-file-${String(counter)}`;
  }

  function findById(id: string): DriveFakeFile {
    const file = files.find((candidate) => candidate.id === id);
    if (file === undefined) {
      throw new DriveHttpError(404, {
        domain: 'global',
        reason: 'notFound',
        message: `File not found: ${id}.`,
        location: 'fileId',
        locationType: 'parameter',
      });
    }
    return file;
  }

  function replace(updated: DriveFakeFile): void {
    files = files.map((file) => (file.id === updated.id ? updated : file));
  }

  function classify(method: string, url: URL): Route | undefined {
    const path = url.pathname;
    if (url.origin !== DRIVE_API_ORIGIN) {
      return undefined;
    }
    if (method === 'GET' && path === '/drive/v3/files') {
      return { operation: 'files.list' };
    }
    const media = /^\/drive\/v3\/files\/([^/]+)$/.exec(path)?.[1];
    if (method === 'GET' && media !== undefined && url.searchParams.get('alt') === 'media') {
      return { operation: 'files.get.media', fileId: decodeURIComponent(media) };
    }
    if (method === 'POST' && path === '/upload/drive/v3/files' && url.searchParams.get('uploadType') === 'multipart') {
      return { operation: 'files.create.multipart' };
    }
    const update = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(path)?.[1];
    if (method === 'PATCH' && update !== undefined && url.searchParams.get('uploadType') === 'multipart') {
      return { operation: 'files.update.multipart', fileId: decodeURIComponent(update) };
    }
    const copy = /^\/drive\/v3\/files\/([^/]+)\/copy$/.exec(path)?.[1];
    if (method === 'POST' && copy !== undefined) {
      return { operation: 'files.copy', fileId: decodeURIComponent(copy) };
    }
    return undefined;
  }

  function takeFailure(operation: DriveOperation): DriveFailure | undefined {
    const pending = failures.find(
      (candidate) => candidate.operation === undefined || candidate.operation === operation,
    );
    if (pending === undefined) {
      return undefined;
    }
    pending.remaining -= 1;
    if (pending.remaining <= 0) {
      failures = failures.filter((candidate) => candidate !== pending);
    }
    return pending.failure;
  }

  async function perform(route: Route, url: URL, request: Request): Promise<Response> {
    switch (route.operation) {
      case 'files.list': {
        if (url.searchParams.get('spaces') !== DRIVE_APPDATA_FOLDER) {
          throw new DriveHttpError(403, FORBIDDEN_OUTSIDE_APPDATA);
        }
        const name = parseNameQuery(url.searchParams.get('q'));
        const fields = selectedFields(url.searchParams.get('fields'), true);
        const matching = files.filter((file) => name === undefined || file.name === name);
        return jsonResponse({ kind: 'drive#fileList', files: matching.map((file) => project(file, fields)) });
      }
      case 'files.get.media': {
        const file = findById(route.fileId);
        return new Response(file.content, { status: 200, headers: { 'Content-Type': file.mimeType } });
      }
      case 'files.create.multipart': {
        const body = parseMultipart(request.headers.get('Content-Type'), await request.text());
        if (typeof body.metadata['name'] !== 'string' || body.metadata['name'].length === 0) {
          throw new DriveHttpError(400, {
            domain: 'global',
            reason: 'required',
            message: 'Required: name',
            location: 'name',
            locationType: 'other',
          });
        }
        if (!isAppDataParents(body.metadata['parents'])) {
          throw new DriveHttpError(403, FORBIDDEN_OUTSIDE_APPDATA);
        }
        const fields = selectedFields(url.searchParams.get('fields'), false);
        const metadataType = body.metadata['mimeType'];
        const created: DriveFakeFile = {
          id: nextId(),
          name: body.metadata['name'],
          parents: [DRIVE_APPDATA_FOLDER],
          mimeType: typeof metadataType === 'string' ? metadataType : (body.mediaType ?? 'application/octet-stream'),
          content: body.media,
          modifiedTime: now(),
          version: '1',
        };
        files = [...files, created];
        return jsonResponse(project(created, fields));
      }
      case 'files.update.multipart': {
        // Read the body first: from the lookup to replace() nothing awaits, so overlapping updates apply one after the
        // other.
        const text = await request.text();
        const existing = findById(route.fileId);
        const body = parseMultipart(request.headers.get('Content-Type'), text);
        if ('parents' in body.metadata) {
          throw new DriveHttpError(403, {
            domain: 'global',
            reason: 'fieldNotWritable',
            message: 'The resource body includes fields which are not directly writable.',
          });
        }
        const fields = selectedFields(url.searchParams.get('fields'), false);
        const name = body.metadata['name'];
        const metadataType = body.metadata['mimeType'];
        const updated: DriveFakeFile = {
          ...existing,
          name: typeof name === 'string' ? name : existing.name,
          mimeType: typeof metadataType === 'string' ? metadataType : (body.mediaType ?? existing.mimeType),
          content: body.media,
          modifiedTime: now(),
          version: String(Number.parseInt(existing.version, 10) + 1),
        };
        replace(updated);
        return jsonResponse(project(updated, fields));
      }
      case 'files.copy': {
        // Read the body first: from the lookup to the write nothing awaits, so a copy never takes stale content.
        const text = await request.text();
        const source = findById(route.fileId);
        let requested: Record<string, unknown> = {};
        if (text.length > 0) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            throw new DriveHttpError(400, { domain: 'global', reason: 'parseError', message: 'Body is not JSON' });
          }
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new DriveHttpError(400, {
              domain: 'global',
              reason: 'parseError',
              message: 'Body is not a JSON object',
            });
          }
          requested = parsed as Record<string, unknown>;
        }
        if ('parents' in requested && !isAppDataParents(requested['parents'])) {
          throw new DriveHttpError(403, FORBIDDEN_OUTSIDE_APPDATA);
        }
        const fields = selectedFields(url.searchParams.get('fields'), false);
        const name = requested['name'];
        const copied: DriveFakeFile = {
          ...source,
          id: nextId(),
          name: typeof name === 'string' ? name : `Copy of ${source.name}`,
          modifiedTime: now(),
          version: '1',
        };
        files = [...files, copied];
        return jsonResponse(project(copied, fields));
      }
    }
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = classify(request.method, url);
    const log = (operation: DriveOperation | 'unsupported', status: number): void => {
      requests = [...requests, { method: request.method, url: request.url, operation, status }];
    };
    if (route === undefined) {
      log('unsupported', 400);
      return errorResponse(400, {
        domain: 'global',
        reason: 'notInDriveApiSubset',
        message: `Not in docs/specs/drive-api-subset.md: ${request.method} ${url.pathname}`,
      });
    }
    const failure = takeFailure(route.operation);
    if (failure?.kind === 'network') {
      log(route.operation, 0);
      throw new TypeError('Failed to fetch');
    }
    if (failure?.kind === 'status') {
      log(route.operation, failure.status);
      return errorResponse(failure.status, injectedDetail(failure.status, failure.reason));
    }
    const token = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
    if (token === undefined || !isTokenValid(token)) {
      log(route.operation, 401);
      return errorResponse(401, injectedDetail(401, undefined));
    }
    try {
      const response = await perform(route, url, request);
      log(route.operation, response.status);
      return response;
    } catch (error) {
      if (error instanceof DriveHttpError) {
        log(route.operation, error.status);
        return errorResponse(error.status, error.detail);
      }
      throw error;
    }
  }

  return {
    fetch: (input, init) => handle(new Request(input, init)),
    handle,
    failNext(failure, failureOptions = {}) {
      failures = [...failures, { failure, operation: failureOptions.operation, remaining: failureOptions.times ?? 1 }];
    },
    seed(file) {
      const seeded: DriveFakeFile = {
        id: nextId(),
        name: file.name,
        parents: [DRIVE_APPDATA_FOLDER],
        mimeType: file.mimeType ?? 'application/json',
        content: file.content,
        modifiedTime: now(),
        version: '1',
      };
      files = [...files, seeded];
      return { ...seeded, parents: [...seeded.parents] };
    },
    files: () => files.map((file) => ({ ...file, parents: [...file.parents] })),
    fileByName: (name) => {
      const file = files.find((candidate) => candidate.name === name);
      return file === undefined ? undefined : { ...file, parents: [...file.parents] };
    },
    get requests() {
      return requests;
    },
    reset() {
      files = [];
      failures = [];
      requests = [];
      counter = 0;
    },
  };
}
