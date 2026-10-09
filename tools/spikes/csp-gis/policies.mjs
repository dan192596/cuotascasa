// @ts-check
// Throwaway spike code (W1-08, retired in W7-01). Pure helpers: candidate CSP headers per route class and the
// checks that run on them. Nothing here decides the policy: ADR-0021 (W2-02) does.
import { createHash } from 'node:crypto';

export const ROUTE_CLASSES = /** @type {const} */ (['root', 'privacy', 'notfound', 'app']);
export const ANGULAR_TT_POLICIES = ['angular', 'angular#bundler', 'angular#unsafe-bypass'];

/** @param {string} text CSP source expression for an inline block */
export function sha256Source(text) {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

/**
 * Executable inline scripts (json data blocks do not execute) and inline styles of an HTML document.
 * @param {string} html
 * @returns {{ scripts: string[], styles: string[] }}
 */
export function extractInline(html) {
  const scripts = [];
  const styles = [];
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attributes = match[1] ?? '';
    if (/\bsrc\s*=/.test(attributes) || /type\s*=\s*["']application\/json["']/.test(attributes)) continue;
    scripts.push(match[2] ?? '');
  }
  for (const match of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) styles.push(match[1] ?? '');
  return { scripts, styles };
}

/**
 * @param {string} pathname
 * @returns {'root' | 'privacy' | 'notfound' | 'app'}
 */
export function classifyRoute(pathname) {
  if (pathname === '/') return 'root';
  if (/^\/privacidad\/?$/.test(pathname)) return 'privacy';
  if (pathname === '/app' || pathname.startsWith('/app/')) return 'app';
  return 'notfound';
}

/**
 * @param {string} header
 * @returns {Map<string, string[]>}
 */
export function parseCsp(header) {
  /** @type {Map<string, string[]>} */
  const directives = new Map();
  for (const part of header.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives.set(name, sources);
  }
  return directives;
}

/** @param {Map<string, string[]>} policy */
export function forbiddenScriptSources(policy) {
  const found = [];
  for (const [name, sources] of policy) {
    if (!name.startsWith('script-src') && name !== 'default-src') continue;
    for (const source of sources) if (source === "'unsafe-inline'" || source === "'unsafe-eval'") found.push(source);
  }
  return found;
}

/**
 * Sources that name an origin (scheme, host or wildcard) in any fetch directive. Keywords, hashes, nonces and the
 * data: and blob: schemes do not. Directives that are not source lists (Trusted Types, sandbox) are skipped.
 * @param {Map<string, string[]>} policy
 */
export function externalSources(policy) {
  const found = [];
  for (const [name, sources] of policy) {
    if (name === 'trusted-types' || name === 'require-trusted-types-for' || name === 'sandbox') continue;
    for (const source of sources) {
      if (source.startsWith("'") || source === 'data:' || source === 'blob:') continue;
      found.push(source);
    }
  }
  return found;
}

/**
 * @typedef {'autocsp' | 'header-hashes' | 'post-build'} Strategy
 * @typedef {'enforced' | 'report-only' | 'off'} TrustedTypesMode
 * @typedef {{ script: string[], connect: string[], frame: string[], style: string[] }} GoogleSources
 */

/**
 * Candidate headers of one route class. Trusted Types goes to the enforced header, to the report-only header, or
 * nowhere.
 * @param {{
 *   route: 'root' | 'privacy' | 'notfound' | 'app',
 *   strategy: Strategy,
 *   tt: TrustedTypesMode,
 *   hashes: { scripts: string[], styles: string[] },
 *   google?: GoogleSources,
 *   baseUri?: string,
 *   unsafeInlineStyle?: boolean,
 *   gisPolicies?: string[],
 * }} options
 * @returns {Record<string, string>}
 */
export function buildHeaders({
  route,
  strategy,
  tt,
  hashes,
  google,
  baseUri = 'self',
  gisPolicies = [],
  unsafeInlineStyle = false,
}) {
  const isApp = route === 'app';
  const sources = isApp && google ? google : { script: [], connect: [], frame: [], style: [] };
  const scriptSrc = strategy === 'autocsp' ? ["'strict-dynamic'"] : ["'self'"];
  scriptSrc.push(...hashes.scripts);
  // strict-dynamic makes browsers ignore host sources; they stay listed for engines that do not implement it.
  scriptSrc.push(...sources.script);
  const directives = [
    ['default-src', ["'self'"]],
    ['script-src', scriptSrc],
    [
      'style-src',
      unsafeInlineStyle
        ? ["'self'", "'unsafe-inline'", ...sources.style]
        : ["'self'", ...hashes.styles, ...sources.style],
    ],
    ['img-src', ["'self'", 'data:']],
    ['font-src', ["'self'"]],
    ['connect-src', ["'self'", ...sources.connect]],
    ['frame-src', sources.frame.length > 0 ? sources.frame : ["'none'"]],
    ['manifest-src', ["'self'"]],
    ['worker-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', [`'${baseUri}'`]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];
  const serialise = (/** @type {(readonly [string, string[]])[]} */ list) =>
    list.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
  const trustedTypes = /** @type {(readonly [string, string[]])[]} */ ([
    ['require-trusted-types-for', ["'script'"]],
    [
      'trusted-types',
      isApp ? [...ANGULAR_TT_POLICIES, 'cc-gis-loader', 'default', ...gisPolicies] : ANGULAR_TT_POLICIES,
    ],
  ]);
  /** @type {Record<string, string>} */
  const headers = {};
  if (tt === 'enforced') {
    headers['content-security-policy'] = serialise(/** @type {any} */ ([...directives, ...trustedTypes]));
  } else {
    headers['content-security-policy'] = serialise(/** @type {any} */ (directives));
    if (tt === 'report-only') headers['content-security-policy-report-only'] = serialise(trustedTypes);
  }
  return headers;
}
