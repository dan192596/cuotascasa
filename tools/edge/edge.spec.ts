import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ROUTES, discoverAssets, evaluateRoute, parseArgs, runChecks, stageAssets } from './lib.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf8');
const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

describe('wrangler.jsonc', () => {
  const text = read('wrangler.jsonc');
  const config = JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1')) as {
    assets: { directory: string; html_handling: string; not_found_handling: string };
    compatibility_date: string;
  } & Record<string, unknown>;

  it('is an assets-only Worker over the Angular browser output', () => {
    expect(config.assets).toEqual({
      directory: './dist/apps/web/browser',
      html_handling: 'drop-trailing-slash',
      not_found_handling: '404-page',
    });
    expect(config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(config).not.toHaveProperty('main');
  });

  it('carries no account id, zone, route or domain (set at deploy time)', () => {
    for (const key of ['account_id', 'routes', 'route', 'zone_id', 'workers_dev', 'env']) {
      expect(config).not.toHaveProperty(key);
    }
  });
});

describe('_redirects', () => {
  it('has only scoped /app rewrites with status 200 and never a /* wildcard', () => {
    expect(lines(read('apps/web/public/_redirects'))).toEqual(['/app /index.csr 200', '/app/* /index.csr 200']);
  });
});

describe('_headers', () => {
  const text = read('apps/web/public/_headers');

  it('sets the baseline security headers on every path', () => {
    const star = text.slice(text.indexOf('\n/*\n'), text.indexOf('\n\n', text.indexOf('\n/*\n')));
    for (const header of [
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy:',
      'Permissions-Policy:',
      'Strict-Transport-Security: max-age=31536000',
      // The exact per-route policy belongs to ADR-0021 (W2-10 asserts it); this baseline only pins frame-ancestors.
      "frame-ancestors 'none'",
    ]) {
      expect(star).toContain(header);
    }
  });

  it('never sets Cache-Control on /* (rules are merged, not overridden)', () => {
    const star = text.slice(text.indexOf('\n/*\n'), text.indexOf('\n\n', text.indexOf('\n/*\n')));
    expect(star).not.toContain('Cache-Control');
  });
});

describe('parseArgs', () => {
  it('defaults to a local server on 8799', () => {
    expect(parseArgs([])).toEqual({ baseUrl: undefined, port: 8799, assets: undefined, help: false });
  });

  it('reads --base-url (both forms), --port and --assets', () => {
    expect(parseArgs(['--base-url', 'https://x.example/']).baseUrl).toBe('https://x.example');
    expect(parseArgs(['--base-url=https://x.example']).baseUrl).toBe('https://x.example');
    expect(parseArgs(['--port', '9001']).port).toBe(9001);
    expect(parseArgs(['--assets', 'out']).assets).toBe('out');
  });

  it('rejects unknown flags, a missing value and a bad port', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/unknown/i);
    expect(() => parseArgs(['--base-url'])).toThrow(/requires a value/i);
    expect(() => parseArgs(['--port', 'abc'])).toThrow(/port/i);
    expect(() => parseArgs(['--base-url', 'not a url'])).toThrow(/base-url/i);
  });
});

describe('evaluateRoute', () => {
  const route = {
    path: '/x',
    status: 200,
    bodyIncludes: ['hello'],
    bodyExcludes: ['bye'],
    headers: { 'cache-control': 'no-cache', 'content-type': /^text\/html/ },
    location: undefined,
  };
  const ok = {
    status: 200,
    body: 'hello world',
    headers: new Headers({ 'cache-control': 'no-cache', 'content-type': 'text/html; charset=utf-8' }),
  };

  it('passes a matching response', () => {
    expect(evaluateRoute(route, ok)).toEqual([]);
  });

  it('reports status, body, forbidden body, header (string and regex) and location mismatches', () => {
    const failures = evaluateRoute(
      { ...route, location: '/y' },
      {
        status: 307,
        body: 'bye',
        headers: new Headers({ 'cache-control': 'max-age=1', 'content-type': 'application/json', location: '/z' }),
      },
    );
    expect(failures.join('\n')).toMatch(/status/);
    expect(failures.join('\n')).toMatch(/missing "hello"/);
    expect(failures.join('\n')).toMatch(/must not contain "bye"/);
    expect(failures.join('\n')).toMatch(/cache-control/);
    expect(failures.join('\n')).toMatch(/content-type/);
    expect(failures.join('\n')).toMatch(/location/);
  });

  it('reports an absent header', () => {
    expect(evaluateRoute(route, { ...ok, headers: new Headers() }).join('\n')).toMatch(/cache-control.*absent/);
  });
});

describe('discoverAssets', () => {
  it('finds the hashed entry script and stylesheet in the CSR shell', () => {
    const html =
      '<link rel="stylesheet" href="styles-ABC123.css"><script src="main-XYZ789.js" type="module"></script>' +
      '<script src="ngsw-worker.js"></script>';
    expect(discoverAssets(html)).toEqual(['/main-XYZ789.js', '/styles-ABC123.css']);
  });

  it('returns nothing when the page has no hashed assets', () => {
    expect(discoverAssets('<html></html>')).toEqual([]);
  });
});

describe('ROUTES table', () => {
  it('covers every path the card names', () => {
    const paths = ROUTES.map((r: { path: string }) => r.path);
    for (const p of [
      '/',
      '/privacidad',
      '/app',
      '/app/prestamos/x/tabla',
      '/application',
      '/nope',
      '/app/missing.js',
    ]) {
      expect(paths).toContain(p);
    }
  });

  it('expects 404 for lookalikes of /app and 200 only under /app', () => {
    const byPath = new Map(ROUTES.map((r: { path: string; status: number }) => [r.path, r.status]));
    expect(byPath.get('/application')).toBe(404);
    expect(byPath.get('/nope')).toBe(404);
    expect(byPath.get('/app')).toBe(200);
  });
});

describe('runChecks against a fake origin', () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.close();
    server = undefined;
  });

  async function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
    server = createServer(handler);
    await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it('reports every failure when the origin answers 418 for everything', async () => {
    const base = await listen((_req, res) => {
      res.statusCode = 418;
      res.end('teapot');
    });
    const result = await runChecks(base);
    expect(result.ok).toBe(false);
    expect(result.failures.length).toBeGreaterThan(ROUTES.length);
  });

  it('does not follow redirects, so a 307 is observed as a 307', async () => {
    const base = await listen((req, res) => {
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('x-frame-options', 'DENY');
      res.setHeader('strict-transport-security', 'max-age=31536000');
      res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
      res.setHeader('permissions-policy', 'camera=()');
      res.setHeader('content-security-policy', "frame-ancestors 'none'");
      res.setHeader('content-security-policy-report-only', "default-src 'self'");
      if (req.url === '/privacidad/') {
        res.statusCode = 307;
        res.setHeader('location', '/privacidad');
        res.end();
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    const result = await runChecks(base);
    expect(result.failures.some((f: string) => f.startsWith('/privacidad/ '))).toBe(false);
  });
});

describe('stageAssets', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const scratch = (): string => {
    const d = mkdtempSync(join(tmpdir(), 'edge-spec-'));
    dirs.push(d);
    return d;
  };

  it('uses the build as-is when it already has 404.html', () => {
    const dir = scratch();
    writeFileSync(join(dir, '404.html'), 'x');
    expect(stageAssets(dir)).toEqual({ dir, staged: false, note: expect.stringContaining('404.html') });
  });

  it('promotes 404/index.html to 404.html in a copy, leaving the build untouched', () => {
    const dir = scratch();
    mkdirSync(join(dir, '404'));
    writeFileSync(join(dir, '404', 'index.html'), 'prerendered 404');
    const out = stageAssets(dir);
    dirs.push(out.dir);
    expect(out.staged).toBe(true);
    expect(readFileSync(join(out.dir, '404.html'), 'utf8')).toBe('prerendered 404');
    expect(() => readFileSync(join(dir, '404.html'))).toThrow();
  });

  it('writes a stand-in 404.html in a copy when the build has no 404 page yet', () => {
    const dir = scratch();
    writeFileSync(join(dir, 'index.html'), 'x');
    const out = stageAssets(dir);
    dirs.push(out.dir);
    expect(out.staged).toBe(true);
    expect(readFileSync(join(out.dir, '404.html'), 'utf8')).toContain('Página no encontrada');
    expect(out.note).toMatch(/stand-in/);
  });

  it('fails clearly when the build output is missing', () => {
    expect(() => stageAssets(join(scratch(), 'missing'))).toThrow(/pnpm build/);
  });
});
