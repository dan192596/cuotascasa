// @ts-check
// Post-build step of ADR-0021: hashes the executable inline scripts of every served document and writes the
// final `_headers` into the build output. Hashes go only there, never into JS or a <meta>.
// Usage: node tools/edge/headers/generate.mjs [--dist <dir>] [--template <file>]
// Run it after `pnpm build` (the template is apps/web/public/_headers; the build copies it, this overwrites the copy).
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEFAULT_DIST = resolve(ROOT, 'dist/apps/web/browser');
const DEFAULT_TEMPLATE = resolve(ROOT, 'apps/web/public/_headers');
// Script types the browser executes: empty, `module` and the JavaScript MIME types of the HTML spec.
const EXECUTABLE_TYPES = new Set([
  '',
  'module',
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
]);

/**
 * @param {string} text exact script text
 * @returns {string} CSP hash source
 */
export function hashSource(text) {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

/**
 * Executable inline scripts of a document: no `src`, not a data block (`application/json`, ...), not empty.
 * The parser assumes Angular-shaped HTML: no scripts inside comments and no `>` inside quoted attributes.
 * @param {string} html
 * @returns {string[]} unique script texts in document order
 */
export function extractInlineScripts(html) {
  /** @type {string[]} */
  const found = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attributes = match[1] ?? '';
    const text = match[2] ?? '';
    if (/(?:^|\s)src\s*=/i.test(attributes) || text === '') continue;
    const raw = /(?:^|\s)type\s*=\s*["']?([^"'\s>;]+)/i.exec(attributes)?.[1] ?? '';
    const type = raw.split(';')[0]?.trim().toLowerCase() ?? '';
    if (EXECUTABLE_TYPES.has(type) && !found.includes(text)) found.push(text);
  }
  return found;
}

/**
 * @param {string} template text with ` {{hashes:<document>}}` slots
 * @param {Map<string, string[]>} hashesByDoc
 */
export function renderHeaders(template, hashesByDoc) {
  return template.replace(/ ?\{\{hashes:([^}]+)\}\}/g, (_slot, doc) => {
    const hashes = hashesByDoc.get(doc);
    if (hashes === undefined) throw new Error(`No hashes computed for document "${doc}"`);
    return hashes.map((hash) => ` ${hash}`).join('');
  });
}

/**
 * Cloudflare's `404-page` needs `/404.html` at the root; the prerender writes `404/index.html` (ADR-0022).
 * @param {string} dist
 * @returns {boolean} whether something was moved
 */
export function promote404(dist) {
  const prerendered = join(dist, '404', 'index.html');
  if (!existsSync(prerendered)) return false;
  cpSync(prerendered, join(dist, '404.html'));
  rmSync(join(dist, '404'), { recursive: true, force: true });
  return true;
}

/**
 * @param {{ dist?: string, template?: string }} [options]
 * @returns {{ headers: string, hashes: Map<string, string[]> }}
 */
export function generate({ dist = DEFAULT_DIST, template = DEFAULT_TEMPLATE } = {}) {
  if (!existsSync(dist)) throw new Error(`Build output not found at ${dist}: run "pnpm build" first`);
  promote404(dist);
  const docs = [
    ...new Set(
      readFileSync(template, 'utf8')
        .matchAll(/\{\{hashes:([^}]+)\}\}/g)
        .map((m) => m[1] ?? ''),
    ),
  ];
  /** @type {Map<string, string[]>} */
  const hashes = new Map();
  for (const doc of docs) {
    const path = join(dist, doc);
    if (!existsSync(path)) throw new Error(`Served document ${doc} not found in ${dist} (404 page missing?)`);
    hashes.set(doc, extractInlineScripts(readFileSync(path, 'utf8')).map(hashSource));
  }
  const headers = renderHeaders(readFileSync(template, 'utf8'), hashes);
  writeFileSync(join(dist, '_headers'), headers);
  return { headers, hashes };
}

/**
 * @param {string[]} argv
 * @returns {{ dist: string, template: string }}
 */
export function parseArgs(argv) {
  const out = { dist: DEFAULT_DIST, template: DEFAULT_TEMPLATE };
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i]);
    const eq = arg.indexOf('=');
    const name = arg.startsWith('--') && eq !== -1 ? arg.slice(0, eq) : arg;
    if (name !== '--dist' && name !== '--template') throw new Error(`Unknown argument: ${arg}`);
    const value = eq !== -1 ? arg.slice(eq + 1) : argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`);
    out[name === '--dist' ? 'dist' : 'template'] = resolve(value);
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const { hashes } = generate(options);
    const total = [...hashes.values()].reduce((sum, list) => sum + list.length, 0);
    console.log(`headers: wrote ${join(options.dist, '_headers')} (${hashes.size} documents, ${total} script hashes)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
