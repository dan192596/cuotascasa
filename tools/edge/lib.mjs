// @ts-check
// Pure helpers and the expectation table of the edge-routing check (W1-09, ADR-0022).
import { cpSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_PORT = 8799;

/** Headers every response must carry, 404s included (`/*` rule of `_headers`). */
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': /camera=\(\)/,
  'content-security-policy': "frame-ancestors 'none'",
  'content-security-policy-report-only': /^default-src 'self'/,
};
const NO_CACHE = { 'cache-control': 'no-cache' };
const HTML = { 'content-type': /^text\/html/ };
/** The CSR shell is the only document with these markers; the prerendered pages carry `nghm` instead. */
const CSR_SHELL = ['<cc-root>', 'ngcm'];
const NOT_FOUND_TITLE = 'Página no encontrada';

/**
 * @typedef {object} Route
 * @property {string} path
 * @property {number} status
 * @property {string} [location]            expected Location header (redirects are not followed)
 * @property {string[]} [bodyIncludes]
 * @property {string[]} [bodyExcludes]
 * @property {Record<string, string | RegExp>} [headers]
 * @property {string} [note]                what the row documents (ADR-0022)
 */

/**
 * Status/body/header expectations. Paths are exact; `{asset}` rows are appended by `discoverAssets`.
 * @type {Route[]}
 */
export const ROUTES = [
  {
    path: '/',
    status: 200,
    bodyIncludes: ['<title>CuotasCasa</title>', 'nghm'],
    bodyExcludes: ['ngcm'],
    headers: { ...SECURITY_HEADERS, ...NO_CACHE, ...HTML },
    note: 'prerendered landing',
  },
  {
    path: '/privacidad',
    status: 200,
    bodyIncludes: ['<title>Privacidad · CuotasCasa</title>'],
    bodyExcludes: ['ngcm'],
    headers: { ...SECURITY_HEADERS, ...NO_CACHE, ...HTML },
    note: 'prerendered page, html_handling drop-trailing-slash',
  },
  {
    path: '/privacidad/',
    status: 307,
    location: '/privacidad',
    headers: SECURITY_HEADERS,
    note: 'drop-trailing-slash redirects the slash form',
  },
  {
    path: '/app',
    status: 200,
    bodyIncludes: CSR_SHELL,
    headers: { ...SECURITY_HEADERS, ...NO_CACHE, ...HTML },
    note: 'scoped rewrite to the CSR shell',
  },
  {
    path: '/app/',
    status: 200,
    bodyIncludes: CSR_SHELL,
    headers: { ...SECURITY_HEADERS, ...NO_CACHE, ...HTML },
    note: 'trailing slash under /app is rewritten, not redirected',
  },
  {
    path: '/app/prestamos/x/tabla',
    status: 200,
    bodyIncludes: CSR_SHELL,
    headers: { ...SECURITY_HEADERS, ...NO_CACHE, ...HTML },
    note: 'deep client route',
  },
  {
    path: '/app/missing.js',
    status: 200,
    bodyIncludes: CSR_SHELL,
    headers: { ...SECURITY_HEADERS, ...NO_CACHE, 'content-type': /^text\/html/ },
    note: 'asset-like path under /app is NOT a 404: it gets the HTML shell (documented in ADR-0022)',
  },
  {
    path: '/index.csr',
    status: 200,
    bodyIncludes: CSR_SHELL,
    headers: { ...SECURITY_HEADERS, ...HTML },
    note: 'rewrite target; reachable directly',
  },
  {
    path: '/index.csr.html',
    status: 307,
    location: '/index.csr',
    headers: SECURITY_HEADERS,
    note: 'html_handling strips .html, so a rewrite to /index.csr.html would redirect',
  },
  {
    path: '/application',
    status: 404,
    bodyIncludes: [NOT_FOUND_TITLE],
    headers: { ...SECURITY_HEADERS, ...HTML },
    note: '/app prefix lookalike is not captured',
  },
  {
    path: '/nope',
    status: 404,
    bodyIncludes: [NOT_FOUND_TITLE],
    headers: { ...SECURITY_HEADERS, ...HTML },
    note: 'unknown route: real 404 with the 404 page',
  },
  { path: '/ngsw.json', status: 200, headers: { ...SECURITY_HEADERS, ...NO_CACHE }, note: 'service worker manifest' },
  {
    path: '/manifest.webmanifest',
    status: 200,
    headers: { ...SECURITY_HEADERS, ...NO_CACHE },
    note: 'web app manifest',
  },
];

/** @type {Record<string, string | RegExp>} */
const IMMUTABLE = { ...SECURITY_HEADERS, 'cache-control': /^public, max-age=31536000, immutable$/ };

/**
 * Hashed build files referenced by the CSR shell (entry script and stylesheet).
 * @param {string} html
 * @returns {string[]} absolute paths
 */
export function discoverAssets(html) {
  const found = new Set();
  for (const match of html.matchAll(/(?:src|href)="((?:main|styles|polyfills)-[A-Za-z0-9_-]+\.(?:js|css))"/g)) {
    found.add(`/${match[1]}`);
  }
  return [...found].sort();
}

/**
 * @param {string[]} argv
 * @returns {{ baseUrl: string | undefined, port: number, assets: string | undefined, help: boolean }}
 */
export function parseArgs(argv) {
  /** @type {{ baseUrl: string | undefined, port: number, assets: string | undefined, help: boolean }} */
  const out = { baseUrl: undefined, port: DEFAULT_PORT, assets: undefined, help: false };
  for (let i = 0; i < argv.length; i++) {
    const [name, inline] = splitFlag(String(argv[i]));
    if (name === '--help' || name === '-h') {
      out.help = true;
      continue;
    }
    if (name !== '--base-url' && name !== '--port' && name !== '--assets') {
      throw new Error(`Unknown argument: ${String(argv[i])}`);
    }
    let value = inline;
    if (value === undefined) {
      value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`);
    }
    if (name === '--base-url') {
      try {
        new URL(value);
      } catch {
        throw new Error(`--base-url must be an absolute URL, got "${value}"`);
      }
      out.baseUrl = value.replace(/\/+$/, '');
    } else if (name === '--port') {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid --port "${value}"`);
      out.port = port;
    } else {
      out.assets = value;
    }
  }
  return out;
}

/**
 * @param {string} arg
 * @returns {[string, string | undefined]}
 */
function splitFlag(arg) {
  const eq = arg.indexOf('=');
  return arg.startsWith('--') && eq !== -1 ? [arg.slice(0, eq), arg.slice(eq + 1)] : [arg, undefined];
}

/**
 * @param {Route} route
 * @param {{ status: number, body: string, headers: Headers }} response
 * @returns {string[]} human-readable failures (empty when the response matches)
 */
export function evaluateRoute(route, response) {
  /** @type {string[]} */
  const failures = [];
  if (response.status !== route.status) failures.push(`status ${response.status}, expected ${route.status}`);
  for (const text of route.bodyIncludes ?? []) {
    if (!response.body.includes(text)) failures.push(`body missing "${text}"`);
  }
  for (const text of route.bodyExcludes ?? []) {
    if (response.body.includes(text)) failures.push(`body must not contain "${text}"`);
  }
  for (const [name, expected] of Object.entries(route.headers ?? {})) {
    const actual = response.headers.get(name);
    if (actual === null) failures.push(`header ${name} absent, expected ${String(expected)}`);
    else if (!(expected instanceof RegExp ? expected.test(actual) : actual === expected)) {
      failures.push(`header ${name} is "${actual}", expected ${String(expected)}`);
    }
  }
  if (route.location !== undefined) {
    const actual = response.headers.get('location');
    if (actual !== route.location) failures.push(`header location is "${actual}", expected "${route.location}"`);
  }
  return failures;
}

/**
 * @param {string} baseUrl
 * @param {string} path
 */
async function get(baseUrl, path) {
  const res = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
  return { status: res.status, body: await res.text(), headers: res.headers };
}

/**
 * Runs the whole table (plus the hashed assets found in the CSR shell) against `baseUrl`.
 * @param {string} baseUrl no trailing slash
 * @returns {Promise<{ ok: boolean, failures: string[], checked: number }>}
 */
export async function runChecks(baseUrl) {
  /** @type {string[]} */
  const failures = [];
  /** @type {Route[]} */
  const routes = [...ROUTES];
  let shell = '';
  try {
    shell = (await get(baseUrl, '/index.csr')).body;
  } catch {
    // Unreachable origin: every row below reports it.
  }
  const assets = discoverAssets(shell);
  if (assets.length === 0) failures.push('/index.csr exposes no hashed main-/styles- asset to check');
  for (const path of assets) {
    routes.push({ path, status: 200, headers: IMMUTABLE, note: 'hashed build output is immutable' });
  }
  for (const route of routes) {
    try {
      for (const failure of evaluateRoute(route, await get(baseUrl, route.path))) {
        failures.push(`${route.path} ${failure}`);
      }
    } catch (error) {
      failures.push(`${route.path} request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: failures.length === 0, failures, checked: routes.length };
}

const STAND_IN_404 =
  '<!doctype html><html lang="es-GT"><head><meta charset="utf-8">' +
  '<title>Página no encontrada · CuotasCasa</title></head><body><h1>Página no encontrada</h1></body></html>';

/**
 * Cloudflare's `404-page` looks for `404.html`. Until the build emits it (W2-02 action in ADR-0022),
 * serve a copy of the build with the 404 page added so the rest of the table is still exercised.
 * The build output itself is never modified.
 * @param {string} buildDir
 * @returns {{ dir: string, staged: boolean, note: string }}
 */
export function stageAssets(buildDir) {
  if (!existsSync(buildDir)) throw new Error(`Build output not found at ${buildDir}: run "pnpm build" first`);
  if (existsSync(join(buildDir, '404.html'))) {
    return { dir: buildDir, staged: false, note: 'build already emits 404.html' };
  }
  const dir = mkdtempSync(join(tmpdir(), 'cuotascasa-edge-'));
  cpSync(buildDir, dir, { recursive: true });
  const prerendered = join(buildDir, '404', 'index.html');
  if (existsSync(prerendered)) {
    cpSync(prerendered, join(dir, '404.html'));
    return { dir, staged: true, note: 'promoted 404/index.html to 404.html in a temporary copy' };
  }
  writeFileSync(join(dir, '404.html'), STAND_IN_404);
  return {
    dir,
    staged: true,
    note: 'build has no 404 page: serving a stand-in 404.html from a temporary copy (see ADR-0022, W2-02)',
  };
}
