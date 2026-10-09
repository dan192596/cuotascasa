// @ts-check
// Throwaway spike code (W1-08, retired in W7-01). Static harness server for a build output directory that sends
// the candidate headers per route class, the way Cloudflare `_headers` and `_redirects` would (ADR-0022).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { classifyRoute } from './policies.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

export const PROBE_PATH = '/app/__probe/';
const PAGE_DIR = new URL('./page/', import.meta.url);

/** The inline bootstrap used by the autocsp strategy: same shape as the loader Angular's autoCsp emits. */
export const PROBE_INLINE_LOADER = `(() => {
  const s = document.createElement('script');
  s.src = '${PROBE_PATH}probe.js';
  document.lastElementChild.appendChild(s);
})();`;

/**
 * @param {{ load: string, loader: 'external' | 'inline' }} options
 */
export function probeHtml({ load, loader }) {
  const template = readFileSync(new URL('probe.html', PAGE_DIR), 'utf8');
  const script =
    loader === 'inline'
      ? `<script>${PROBE_INLINE_LOADER}</script>`
      : `<script type="module" src="${PROBE_PATH}probe.js"></script>`;
  const staticGis = load === 'static' ? '<script async src="https://accounts.google.com/gsi/client"></script>' : '';
  return template.replace('<!--STATIC_GIS-->', staticGis).replace('<!--PROBE_SCRIPT-->', script);
}

/**
 * @param {{
 *   root: string,
 *   resolveHeaders: (request: { pathname: string, route: ReturnType<typeof classifyRoute>, search: URLSearchParams }) => Record<string, string>,
 * }} options
 * @returns {Promise<{ origin: string, close: () => Promise<void> }>}
 */
export async function startServer({ root, resolveHeaders }) {
  const fallback = existsSync(join(root, 'index.csr.html')) ? 'index.csr.html' : 'index.html';
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://harness.local');
    const pathname = decodeURIComponent(url.pathname);
    const route = classifyRoute(pathname);
    const send = (
      /** @type {number} */ status,
      /** @type {string | Buffer} */ body,
      /** @type {string} */ type,
      /** @type {Record<string, string>} */ headers = {},
    ) => {
      response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers });
      response.end(body);
    };
    if (pathname === `${PROBE_PATH}probe.js`) {
      send(200, readFileSync(new URL('probe.js', PAGE_DIR)), MIME['.js']);
      return;
    }
    if (pathname === PROBE_PATH) {
      const load = url.searchParams.get('load') ?? 'direct';
      const loader = url.searchParams.get('loader') === 'inline' ? 'inline' : 'external';
      send(
        200,
        probeHtml({ load, loader }),
        MIME['.html'],
        resolveHeaders({ pathname, route, search: url.searchParams }),
      );
      return;
    }
    const relative = normalize(pathname).replace(/^\/+/, '');
    const candidate = join(root, relative);
    if (candidate.startsWith(root) && existsSync(candidate)) {
      const file = statSync(candidate).isDirectory() ? join(candidate, 'index.html') : candidate;
      if (existsSync(file)) {
        const type = MIME[/** @type {keyof typeof MIME} */ (extname(file))] ?? 'application/octet-stream';
        const isHtml = type === MIME['.html'];
        send(
          200,
          readFileSync(file),
          type,
          isHtml ? resolveHeaders({ pathname, route, search: url.searchParams }) : {},
        );
        return;
      }
    }
    // `/app/**` is a rewrite to the CSR shell with status 200; anything else unknown is a 404 that still renders it.
    const status = route === 'app' ? 200 : 404;
    send(
      status,
      readFileSync(join(root, fallback)),
      MIME['.html'],
      resolveHeaders({ pathname, route, search: url.searchParams }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve(undefined))),
  };
}
