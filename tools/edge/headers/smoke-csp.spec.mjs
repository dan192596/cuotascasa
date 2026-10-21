import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isExternal } from './smoke-csp.mjs';

const SCRIPT = resolve(import.meta.dirname, 'smoke-csp.mjs');

describe('isExternal', () => {
  const origin = 'http://127.0.0.1:8797';

  it('keeps same-origin requests', () => {
    expect(isExternal('http://127.0.0.1:8797/main.js', origin)).toBe(false);
  });

  it('flags another host, another port and another scheme as external', () => {
    expect(isExternal('https://accounts.google.com/gsi/client', origin)).toBe(true);
    expect(isExternal('http://127.0.0.1:9/x.png', origin)).toBe(true);
    expect(isExternal('https://127.0.0.1:8797/', origin)).toBe(true);
  });

  it('ignores non-http schemes (data:, blob:)', () => {
    expect(isExternal('data:,', origin)).toBe(false);
    expect(isExternal('blob:http://127.0.0.1:8797/abc', origin)).toBe(false);
  });
});

describe('smoke-csp --base-url (local stub server, no wrangler, no network)', () => {
  /** @type {import('node:http').Server | undefined} */
  let server;
  afterEach(() => new Promise((done) => (server ? server.close(() => done(undefined)) : done(undefined))));

  it('navigates to the given origin and reports requests to any other origin as external', async () => {
    server = createServer((request, response) => {
      const path = request.url ?? '/';
      // Same host, other port: a different origin that the old 127.0.0.1 regex would have let through.
      const extra = path === '/privacidad' ? '<img src="http://127.0.0.1:9/pixel.png" alt="">' : '';
      response.writeHead(path === '/nope' ? 404 : 200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        `<!doctype html><html><head><link rel="icon" href="data:,"></head><body><p>stub ${path}</p>${extra}</body></html>`,
      );
    });
    await new Promise((done) => server?.listen(0, '127.0.0.1', () => done(undefined)));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const child = spawn(process.execPath, [SCRIPT, '--base-url', `${baseUrl}/`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += String(chunk)));
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    const code = await new Promise((done) => child.on('close', done));

    expect(stderr).not.toMatch(/^edge:/m);
    expect(stdout).toContain('ok   /\n');
    expect(stdout).toContain('ok   /app\n');
    expect(stdout).toContain('ok   /nope\n');
    expect(stdout).toContain('FAIL /privacidad\n');
    expect(stderr).toContain('external request: http://127.0.0.1:9/pixel.png');
    expect(code).toBe(1);
  }, 60_000);
});
