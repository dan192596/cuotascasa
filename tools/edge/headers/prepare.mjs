// @ts-check
// Shared by check-headers.mjs and smoke-csp.mjs: picks the assets directory to serve, generating hashes into a
// temporary copy when the build's _headers still has hash slots.
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from './generate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * @param {string | undefined} assets
 * @returns {{ dir: string, cleanup: () => void }}
 */
export function prepareAssets(assets) {
  const dist = assets ? resolve(assets) : resolve(ROOT, 'dist/apps/web/browser');
  if (!existsSync(dist)) throw new Error(`Build output not found at ${dist}: run "pnpm build" first`);
  const headersFile = join(dist, '_headers');
  if (existsSync(headersFile) && !readFileSync(headersFile, 'utf8').includes('{{hashes:')) {
    return { dir: dist, cleanup: () => {} };
  }
  const dir = mkdtempSync(join(tmpdir(), 'cuotascasa-headers-'));
  cpSync(dist, dir, { recursive: true });
  generate({ dist: dir });
  console.error('headers: build _headers has no hashes yet; serving a generated temporary copy');
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
