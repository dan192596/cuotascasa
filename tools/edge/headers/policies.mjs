// @ts-check
// The exact Content-Security-Policy per route class, copied literally from ADR-0021 section 7.
// `{{hashes:<document>}}` marks where the sha256 sources of that served document go (see generate.mjs).

const GOOGLE_CONNECT = [
  'https://www.googleapis.com/drive/v3/',
  'https://www.googleapis.com/upload/drive/v3/',
  'https://oauth2.googleapis.com/revoke',
];
const GIS = 'https://accounts.google.com/gsi/client';

/** Paths served by the service worker scripts (ADR-0021 section 7, "Worker"). */
export const WORKER_PATHS = ['/ngsw-worker.js', '/safety-worker.js', '/worker-basic.min.js'];

/**
 * Which policy each `_headers` rule gets (ADR-0021 section 8). `/*` carries the public policy of 404.html.
 * @type {{ paths: string[], kind: 'public' | 'app' | 'worker', doc?: string }[]}
 */
export const ROUTE_POLICIES = [
  { paths: ['/'], kind: 'public', doc: 'index.html' },
  { paths: ['/privacidad'], kind: 'public', doc: 'privacidad/index.html' },
  { paths: ['/app', '/app/*', '/index.csr', '/index.csr.html'], kind: 'app', doc: 'index.csr.html' },
  { paths: WORKER_PATHS, kind: 'worker' },
];

/** Document that provides the hashes of the policy on `/*` (the only rule the 404 page receives). */
export const NOT_FOUND_DOC = '404.html';

/**
 * @param {string} kind
 * @param {string} [doc] document whose inline-script hashes go into `script-src`
 * @returns {string} the policy with a `{{hashes:<doc>}}` slot
 */
export function policyTemplate(kind, doc) {
  const slot = `{{hashes:${doc}}}`;
  if (kind === 'public') {
    return [
      "default-src 'self'",
      `script-src 'self' ${slot}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-src 'none'",
      "manifest-src 'self'",
      "worker-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "require-trusted-types-for 'script'",
      'trusted-types angular angular#bundler',
    ].join('; ');
  }
  if (kind === 'app') {
    return [
      "default-src 'self'",
      `script-src 'self' ${slot} ${GIS}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      `connect-src 'self' ${GOOGLE_CONNECT.join(' ')}`,
      "frame-src 'none'",
      "manifest-src 'self'",
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "require-trusted-types-for 'script'",
      'trusted-types angular angular#bundler cc-gis-loader cc-sw-loader',
    ].join('; ');
  }
  if (kind === 'worker') {
    return [
      "default-src 'self'",
      `connect-src 'self' ${GIS} ${GOOGLE_CONNECT.join(' ')}`,
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join('; ');
  }
  throw new Error(`Unknown policy kind "${kind}"`);
}

/**
 * The policy as it must be served, given the hash sources of the document.
 * @param {string} kind
 * @param {string[]} hashes CSP sources such as `'sha256-...='`
 */
export function expectedPolicy(kind, hashes) {
  return policyTemplate(kind, 'x').replace(' {{hashes:x}}', hashes.map((hash) => ` ${hash}`).join(''));
}

/**
 * @param {string} policy
 * @returns {Map<string, string[]>} directive name to its source list
 */
export function cspDirectives(policy) {
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const part of policy.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out.set(name, values);
  }
  return out;
}
