// @ts-check
// Header assertions of ADR-0021 (final CSP per route, Trusted Types) and the baseline of ADR-0022.
import { extractInlineScripts, hashSource } from './generate.mjs';
import { WORKER_PATHS, cspDirectives, expectedPolicy } from './policies.mjs';

/** Present on every response, redirects and 404s included. */
const BASELINE = {
  'x-content-type-options': /^nosniff$/,
  'x-frame-options': /^DENY$/,
  'strict-transport-security': /^max-age=31536000$/,
  'referrer-policy': /^strict-origin-when-cross-origin$/,
  'permissions-policy': /camera=\(\)/,
};

/**
 * @typedef {object} HeaderRoute
 * @property {string} path
 * @property {number} status
 * @property {'public' | 'app' | 'worker'} kind
 * @property {string | string[]} [hashFrom] path(s) whose bodies provide the script hashes, as a union in order
 *   (default: the route itself)
 */

/** The `/*` policy serves the landing and the 404 page: the union of their hashes (apps/web/public/_headers). */
const STAR_HASH_FROM = ['/', '/nope'];

/** @type {HeaderRoute[]} */
export const HEADER_ROUTES = [
  { path: '/', status: 200, kind: 'public', hashFrom: STAR_HASH_FROM },
  { path: '/privacidad', status: 200, kind: 'public' },
  { path: '/nope', status: 404, kind: 'public', hashFrom: STAR_HASH_FROM },
  { path: '/application', status: 404, kind: 'public', hashFrom: STAR_HASH_FROM },
  { path: '/app', status: 200, kind: 'app' },
  { path: '/app/', status: 200, kind: 'app', hashFrom: '/app' },
  { path: '/app/prestamos/x/tabla', status: 200, kind: 'app', hashFrom: '/app' },
  { path: '/index.csr', status: 200, kind: 'app', hashFrom: '/app' },
  { path: '/index.csr.html', status: 307, kind: 'app', hashFrom: '/app' },
  ...WORKER_PATHS.map((path) => ({ path, status: 200, kind: /** @type {const} */ ('worker') })),
];

/**
 * @param {string} policy
 * @returns {string[]} every http(s) source of the policy
 */
export function externalOrigins(policy) {
  const found = new Set();
  for (const values of cspDirectives(policy).values()) {
    for (const value of values) if (/^https?:/i.test(value)) found.add(value);
  }
  return [...found];
}

/**
 * @param {HeaderRoute} route
 * @param {{ status: number, body: string, headers: Headers }} response
 * @param {string[]} hashes script hash sources of the document this route serves (ignored for workers)
 * @returns {string[]} failures
 */
export function checkResponse(route, response, hashes) {
  /** @type {string[]} */
  const failures = [];
  if (response.status !== route.status) failures.push(`status ${response.status}, expected ${route.status}`);
  for (const [name, pattern] of Object.entries(BASELINE)) {
    const actual = response.headers.get(name);
    if (actual === null) failures.push(`header ${name} absent`);
    else if (!pattern.test(actual)) failures.push(`header ${name} is "${actual}"`);
  }
  if (response.headers.get('content-security-policy-report-only') !== null) {
    failures.push('content-security-policy-report-only must not be set (ADR-0021)');
  }
  const actual = response.headers.get('content-security-policy');
  const expected = expectedPolicy(route.kind, route.kind === 'worker' ? [] : hashes);
  if (actual !== expected) {
    failures.push(
      `content-security-policy is not the ADR-0021 ${route.kind} policy: got "${actual}", want "${expected}"`,
    );
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
 * @param {string} baseUrl no trailing slash
 * @returns {Promise<{ ok: boolean, failures: string[], checked: number }>}
 */
export async function runHeaderChecks(baseUrl) {
  /** @type {string[]} */
  const failures = [];
  for (const route of HEADER_ROUTES) {
    try {
      const response = await get(baseUrl, route.path);
      const sources = route.hashFrom === undefined ? [route.path] : [route.hashFrom].flat();
      /** @type {string[]} */
      const hashes = [];
      for (const path of sources) {
        const { body } = path === route.path ? response : await get(baseUrl, path);
        for (const hash of extractInlineScripts(body).map(hashSource)) if (!hashes.includes(hash)) hashes.push(hash);
      }
      for (const failure of checkResponse(route, response, hashes)) failures.push(`${route.path} ${failure}`);
    } catch (error) {
      failures.push(`${route.path} request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: failures.length === 0, failures, checked: HEADER_ROUTES.length };
}
