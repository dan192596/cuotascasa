// @ts-check
// Serves the production build exactly as Cloudflare Workers static assets would, fully offline:
// `wrangler dev --local` (no login, no deploy, no Cloudflare API). Used by `edge:check` and, later, by e2e.
// Usage: node tools/edge/serve.mjs [--port 8799] [--assets <dir>]
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT, parseArgs, stageAssets } from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD_DIR = resolve(ROOT, 'dist/apps/web/browser');
const READY_TIMEOUT_MS = 60_000;

/**
 * @param {string} baseUrl
 * @param {import('node:child_process').ChildProcess} child
 */
async function waitUntilReady(baseUrl, child) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`wrangler exited early with code ${child.exitCode}`);
    try {
      await fetch(`${baseUrl}/`, { redirect: 'manual' });
      return;
    } catch {
      await new Promise((done) => setTimeout(done, 250));
    }
  }
  throw new Error(`wrangler did not answer on ${baseUrl} within ${READY_TIMEOUT_MS / 1000}s`);
}

/**
 * @param {{ port?: number, assets?: string, log?: (line: string) => void }} [options]
 * @returns {Promise<{ baseUrl: string, stop: () => void }>}
 */
export async function startEdge({ port = DEFAULT_PORT, assets, log = console.error } = {}) {
  const staged = stageAssets(assets ? resolve(assets) : BUILD_DIR);
  log(`edge: ${staged.note}`);
  const args = ['dev', '--local', '--ip', '127.0.0.1', '--port', String(port)];
  if (staged.staged || assets) args.push('--assets', staged.dir);
  const child = spawn(resolve(ROOT, 'node_modules/.bin/wrangler'), args, {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', DO_NOT_TRACK: '1', CI: '1' },
  });
  /** @type {string[]} */
  const stderr = [];
  child.stderr?.on('data', (chunk) => stderr.push(String(chunk)));

  const stop = () => {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
    if (staged.staged) rmSync(staged.dir, { recursive: true, force: true });
  };
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitUntilReady(baseUrl, child);
  } catch (error) {
    stop();
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${stderr.join('').slice(-2000)}`, {
      cause: error,
    });
  }
  return { baseUrl, stop };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { port, assets } = parseArgs(process.argv.slice(2));
    const { baseUrl, stop } = await startEdge({ port, assets });
    console.error(`edge: serving ${baseUrl} (Ctrl+C to stop)`);
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => {
        stop();
        process.exit(0);
      });
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
