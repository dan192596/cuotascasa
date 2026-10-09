import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { extractInlineScripts, generate, hashSource, parseArgs, promote404, renderHeaders } from './generate.mjs';
import { ROUTE_POLICIES, WORKER_PATHS, cspDirectives, expectedPolicy, policyTemplate } from './policies.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const TEMPLATE = resolve(ROOT, 'apps/web/public/_headers');

const PUBLIC =
  "default-src 'self'; script-src 'self' {{hashes:DOC}}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; manifest-src 'self'; worker-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types angular angular#bundler";
const APP =
  "default-src 'self'; script-src 'self' {{hashes:DOC}} https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://www.googleapis.com/drive/v3/ https://www.googleapis.com/upload/drive/v3/ https://oauth2.googleapis.com/revoke; frame-src 'none'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types angular angular#bundler cc-gis-loader cc-sw-loader";
const WORKER =
  "default-src 'self'; connect-src 'self' https://accounts.google.com/gsi/client https://www.googleapis.com/drive/v3/ https://www.googleapis.com/upload/drive/v3/ https://oauth2.googleapis.com/revoke; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

describe('policies (ADR-0021 section 7, literal)', () => {
  it('public policy', () => {
    expect(policyTemplate('public', 'index.html')).toBe(PUBLIC.replace('DOC', 'index.html'));
  });
  it('app policy', () => {
    expect(policyTemplate('app', 'index.csr.html')).toBe(APP.replace('DOC', 'index.csr.html'));
  });
  it('worker policy has no document', () => {
    expect(policyTemplate('worker')).toBe(WORKER);
  });
  it('expectedPolicy substitutes the hashes', () => {
    expect(expectedPolicy('public', ["'sha256-A='", "'sha256-B='"])).toContain(
      "script-src 'self' 'sha256-A=' 'sha256-B=';",
    );
    expect(expectedPolicy('public', [])).toContain("script-src 'self';");
  });
  it('cspDirectives parses into a map', () => {
    const map = cspDirectives("default-src 'self'; object-src 'none'");
    expect(map.get('object-src')).toEqual(["'none'"]);
  });
  it('never allows unsafe-inline/eval in script-src nor hashes in style-src', () => {
    for (const kind of ['public', 'app', 'worker']) {
      const map = cspDirectives(policyTemplate(kind, 'x.html'));
      const script = (map.get('script-src') ?? []).join(' ');
      expect(script).not.toMatch(/unsafe-(inline|eval)/);
      expect((map.get('style-src') ?? []).join(' ')).not.toMatch(/sha256|nonce/);
    }
  });
  it('rejects an unknown kind', () => {
    expect(() => policyTemplate('nope', 'x')).toThrow(/unknown/i);
  });
});

describe('hashSource', () => {
  it('is the CSP sha256 source of the exact text', () => {
    expect(hashSource('abc')).toBe("'sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0='");
  });
});

describe('extractInlineScripts', () => {
  it('returns executable inline scripts only, deduplicated, in document order', () => {
    const html =
      '<script src="a.js"></script><script>one()</script><script type="module">two()</script>' +
      '<script id="ng-state" type="application/json">{"a":1}</script><script>one()</script><script>  </script>' +
      '<script type="text/javascript">three()</script><script type="application/ld+json">{}</script>';
    expect(extractInlineScripts(html)).toEqual(['one()', 'two()', '  ', 'three()']);
  });
});

describe('extractInlineScripts edge cases', () => {
  it('does not mistake data-src or data-type for src or type', () => {
    expect(extractInlineScripts('<script data-src="x">f()</script><script data-type="x">g()</script>')).toEqual([
      'f()',
      'g()',
    ]);
  });
  it('accepts the JavaScript MIME types of the HTML spec, case-insensitively and with parameters', () => {
    const types = [
      'text/ecmascript',
      'application/ecmascript',
      'text/jscript',
      'text/livescript',
      'text/x-javascript',
      'application/x-javascript',
      'application/x-ecmascript',
      'text/javascript1.5',
      'TEXT/JavaScript',
      'Module',
      'text/javascript; charset=utf-8',
    ];
    for (const type of types)
      expect(extractInlineScripts(`<script type="${type}">f()</script>`), type).toEqual(['f()']);
    expect(extractInlineScripts('<script type="importmap">{}</script>')).toEqual([]);
  });
  it('keeps whitespace-only scripts but skips empty ones', () => {
    expect(extractInlineScripts('<script> </script><script></script>')).toEqual([' ']);
  });
});

describe('renderHeaders', () => {
  const hashes = new Map([
    ['a.html', ["'sha256-A='"]],
    ['b.html', []],
  ]);
  it('replaces tokens with space-separated hashes and drops the slot when empty', () => {
    expect(renderHeaders("x 'self' {{hashes:a.html}}; y 'self' {{hashes:b.html}}; z", hashes)).toBe(
      "x 'self' 'sha256-A='; y 'self'; z",
    );
  });
  it('fails on a document it has no hashes for', () => {
    expect(() => renderHeaders('{{hashes:c.html}}', hashes)).toThrow(/c\.html/);
  });
});

describe('generate', () => {
  const dirs = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const page = (inline) => `<html><head><base href="/"></head><body><script>${inline}</script></body></html>`;
  function fakeDist() {
    const dist = mkdtempSync(join(tmpdir(), 'headers-spec-'));
    dirs.push(dist);
    mkdirSync(join(dist, 'privacidad'));
    mkdirSync(join(dist, '404'));
    writeFileSync(join(dist, 'index.html'), page('landing()'));
    writeFileSync(join(dist, 'privacidad', 'index.html'), page('privacy()'));
    writeFileSync(join(dist, '404', 'index.html'), page('notfound()'));
    writeFileSync(join(dist, 'index.csr.html'), page('shell()'));
    writeFileSync(join(dist, '_headers'), readFileSync(TEMPLATE));
    return dist;
  }

  it('promotes 404/index.html to 404.html and removes 404/', () => {
    const dist = fakeDist();
    expect(promote404(dist)).toBe(true);
    expect(readFileSync(join(dist, '404.html'), 'utf8')).toContain('notfound()');
    expect(existsSync(join(dist, '404'))).toBe(false);
    expect(promote404(dist)).toBe(false);
  });

  it('fails when there is no 404 page at all', () => {
    const dist = fakeDist();
    rmSync(join(dist, '404'), { recursive: true });
    expect(() => generate({ dist, template: TEMPLATE })).toThrow(/404/);
  });

  it('writes _headers with the hashes of the served documents, per route', () => {
    const dist = fakeDist();
    generate({ dist, template: TEMPLATE });
    const text = readFileSync(join(dist, '_headers'), 'utf8');
    expect(text).not.toContain('{{');
    expect(text).not.toContain('Report-Only');
    const block = (path) => {
      const match = new RegExp(`^${path.replace(/[*]/g, '\\*')}\\n((?:  .*\\n)+)`, 'm').exec(text);
      return match?.[1] ?? '';
    };
    const csp = (path) => /^ {2}Content-Security-Policy: (.*)$/m.exec(block(path))?.[1];
    expect(csp('/')).toBe(expectedPolicy('public', [hashSource('landing()')]));
    expect(csp('/privacidad')).toBe(expectedPolicy('public', [hashSource('privacy()')]));
    expect(csp('/*')).toBe(expectedPolicy('public', [hashSource('notfound()')]));
    for (const path of ['/app', '/app/*', '/index.csr', '/index.csr.html']) {
      expect(csp(path)).toBe(expectedPolicy('app', [hashSource('shell()')]));
    }
    for (const path of WORKER_PATHS) expect(csp(path)).toBe(expectedPolicy('worker', []));
  });

  it('is idempotent and never writes hashes into the template', () => {
    const dist = fakeDist();
    const before = readFileSync(TEMPLATE, 'utf8');
    generate({ dist, template: TEMPLATE });
    const first = readFileSync(join(dist, '_headers'), 'utf8');
    generate({ dist, template: TEMPLATE });
    expect(readFileSync(join(dist, '_headers'), 'utf8')).toBe(first);
    expect(readFileSync(TEMPLATE, 'utf8')).toBe(before);
  });

  it('fails clearly when the build output is missing', () => {
    expect(() => generate({ dist: join(tmpdir(), 'no-such-dist-xyz'), template: TEMPLATE })).toThrow(/pnpm build/);
  });
});

describe('parseArgs', () => {
  it('defaults and reads --dist/--template', () => {
    expect(parseArgs([]).dist).toMatch(/dist\/apps\/web\/browser$/);
    expect(parseArgs(['--dist', 'x']).dist).toMatch(/x$/);
    expect(parseArgs(['--dist=y', '--template', 't']).template).toMatch(/t$/);
  });
  it('rejects unknown flags and missing values', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/unknown/i);
    expect(() => parseArgs(['--dist'])).toThrow(/requires a value/i);
  });
});

describe('apps/web/public/_headers template (ADR-0021 section 8)', () => {
  const text = readFileSync(TEMPLATE, 'utf8');
  const block = (path) => {
    const match = new RegExp(`^${path.replace(/[*]/g, '\\*')}\\n((?:  .*\\n|\\n(?=  ))*)`, 'm').exec(text);
    return match?.[1] ?? '';
  };

  it('has no report-only placeholder', () => {
    expect(text).not.toContain('Report-Only');
  });

  it('puts the public 404 policy on /* with the baseline headers', () => {
    const star = block('/\\*'.replace('\\', ''));
    expect(star).toContain(`  Content-Security-Policy: ${policyTemplate('public', '404.html')}\n`);
    for (const header of [
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'Permissions-Policy:',
      'Strict-Transport-Security: max-age=31536000',
      'X-Frame-Options: DENY',
    ]) {
      expect(star).toContain(header);
    }
    expect(star).not.toContain('Cache-Control');
  });

  it('each routed policy drops the /* one first and sets its own, exactly once', () => {
    for (const { paths, kind, doc } of ROUTE_POLICIES) {
      for (const path of paths) {
        const lines = block(path).split('\n');
        const drop = lines.indexOf('  ! Content-Security-Policy');
        const set = lines.indexOf(`  Content-Security-Policy: ${policyTemplate(kind, doc)}`);
        expect(drop, `${path} drop`).toBeGreaterThanOrEqual(0);
        expect(set, `${path} set`).toBeGreaterThan(drop);
        expect(lines.filter((l) => l.startsWith('  Content-Security-Policy:'))).toHaveLength(1);
        expect(lines).toContain('  Cache-Control: no-cache');
      }
    }
  });
});
