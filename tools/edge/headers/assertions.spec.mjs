import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { checkResponse, externalOrigins, runHeaderChecks } from './assertions.mjs';
import { hashSource } from './generate.mjs';
import { expectedPolicy } from './policies.mjs';

const BASE = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'strict-transport-security': 'max-age=31536000',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=()',
};
const html = (inline) => `<html><script>${inline}</script></html>`;
const response = (status, body, csp, extra = {}) => ({
  status,
  body,
  headers: new Headers({ ...BASE, 'content-security-policy': csp, ...extra }),
});

describe('externalOrigins', () => {
  it('lists the http(s) sources of a policy and ignores keywords, schemes and hashes', () => {
    expect(externalOrigins(expectedPolicy('public', ["'sha256-A='"]))).toEqual([]);
    expect(externalOrigins(expectedPolicy('app', [])).sort()).toEqual(
      [
        'https://accounts.google.com/gsi/client',
        'https://oauth2.googleapis.com/revoke',
        'https://www.googleapis.com/drive/v3/',
        'https://www.googleapis.com/upload/drive/v3/',
      ].sort(),
    );
  });
});

describe('checkResponse', () => {
  const body = html('landing()');
  const csp = expectedPolicy('public', [hashSource('landing()')]);
  const route = { path: '/', status: 200, kind: 'public' };

  it('passes the exact policy of the served document', () => {
    expect(checkResponse(route, response(200, body, csp), [hashSource('landing()')])).toEqual([]);
  });

  it('reports a policy that is not the literal one', () => {
    const failures = checkResponse(route, response(200, body, csp.replace("base-uri 'self'", "base-uri 'none'")), [
      hashSource('landing()'),
    ]);
    expect(failures.join('\n')).toMatch(/content-security-policy is not the ADR-0021 public policy/);
  });

  it('reports a missing hash (the app would not boot)', () => {
    const failures = checkResponse(route, response(200, body, expectedPolicy('public', [])), [hashSource('landing()')]);
    expect(failures.join('\n')).toMatch(/content-security-policy/);
  });

  it('reports a leftover report-only header and a comma-joined (duplicated) policy', () => {
    const report = checkResponse(
      route,
      response(200, body, csp, { 'content-security-policy-report-only': "default-src 'self'" }),
      [hashSource('landing()')],
    );
    expect(report.join('\n')).toMatch(/report-only/i);
    const dup = checkResponse(route, response(200, body, `${csp}, frame-ancestors 'none'`), [hashSource('landing()')]);
    expect(dup.join('\n')).toMatch(/content-security-policy/);
  });

  it('reports absent baseline headers', () => {
    const bare = { status: 200, body, headers: new Headers({ 'content-security-policy': csp }) };
    const failures = checkResponse(route, bare, [hashSource('landing()')]).join('\n');
    for (const name of [
      'strict-transport-security',
      'x-content-type-options',
      'referrer-policy',
      'permissions-policy',
    ]) {
      expect(failures).toContain(name);
    }
  });

  it('reports a wrong status', () => {
    expect(checkResponse(route, response(404, body, csp), [hashSource('landing()')]).join('\n')).toMatch(/status 404/);
  });

  it('checks the worker policy without hashes', () => {
    const worker = { path: '/ngsw-worker.js', status: 200, kind: 'worker' };
    expect(checkResponse(worker, response(200, '', expectedPolicy('worker', [])), [])).toEqual([]);
  });
});

describe('runHeaderChecks against a fake origin', () => {
  let server;
  afterEach(() => server?.close());

  it('fails every row when the origin serves no CSP', async () => {
    server = createServer((_req, res) => res.end('x'));
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const result = await runHeaderChecks(`http://127.0.0.1:${server.address().port}`);
    expect(result.ok).toBe(false);
    expect(result.checked).toBeGreaterThan(8);
  });
});
