import { describe, expect, it } from 'vitest';
import {
  ROUTE_CLASSES,
  buildHeaders,
  classifyRoute,
  externalSources,
  extractInline,
  forbiddenScriptSources,
  parseCsp,
  sha256Source,
} from './policies.mjs';

const HASHES = { scripts: ["'sha256-AAA='"], styles: ["'sha256-BBB='"] };
const GOOGLE = {
  script: ['https://accounts.google.com/gsi/client'],
  connect: ['https://www.googleapis.com', 'https://oauth2.googleapis.com'],
  frame: ['https://accounts.google.com/gsi/'],
  style: ['https://accounts.google.com/gsi/style'],
};
const STRATEGIES = ['autocsp', 'header-hashes', 'post-build'];
const TT_MODES = ['enforced', 'report-only', 'off'];

describe('sha256Source', () => {
  it('hashes the exact text as a CSP source expression', () => {
    expect(sha256Source('abc')).toBe("'sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0='");
  });
});

describe('extractInline', () => {
  it('returns executable inline scripts and styles, and skips json data blocks and external scripts', () => {
    const html = [
      '<style>a{b:c}</style>',
      '<script src="x.js" type="module"></script>',
      '<script>one()</script>',
      '<script type="text/javascript" id="k">two()</script>',
      '<script id="ng-state" type="application/json">{"a":1}</script>',
    ].join('');
    expect(extractInline(html)).toEqual({ scripts: ['one()', 'two()'], styles: ['a{b:c}'] });
  });
});

describe('classifyRoute', () => {
  it.each([
    ['/', 'root'],
    ['/privacidad', 'privacy'],
    ['/privacidad/', 'privacy'],
    ['/app', 'app'],
    ['/app/prestamos/1', 'app'],
    ['/no-existe', 'notfound'],
    ['/apple', 'notfound'],
  ])('%s is %s', (path, expected) => {
    expect(classifyRoute(path)).toBe(expected);
  });
});

describe('parseCsp', () => {
  it('splits directives and source lists', () => {
    const parsed = parseCsp("default-src 'self'; script-src 'self' https://a.test ; object-src 'none'");
    expect(parsed.get('script-src')).toEqual(["'self'", 'https://a.test']);
    expect(parsed.get('object-src')).toEqual(["'none'"]);
  });
});

describe('buildHeaders', () => {
  const header = (route, strategy, tt) => buildHeaders({ route, strategy, tt, hashes: HASHES, google: GOOGLE });

  it('never puts unsafe-inline or unsafe-eval in script-src, for any route, strategy or Trusted Types mode', () => {
    for (const route of ROUTE_CLASSES)
      for (const strategy of STRATEGIES)
        for (const tt of TT_MODES)
          for (const value of Object.values(header(route, strategy, tt))) {
            expect(forbiddenScriptSources(parseCsp(value))).toEqual([]);
          }
  });

  it('gives the public routes no external origin in any directive', () => {
    for (const route of ['root', 'privacy', 'notfound'])
      for (const strategy of STRATEGIES)
        for (const tt of TT_MODES)
          for (const value of Object.values(header(route, strategy, tt))) {
            expect(externalSources(parseCsp(value))).toEqual([]);
          }
  });

  it('lists the Google origins only under /app', () => {
    const app = parseCsp(header('app', 'post-build', 'off')['content-security-policy']);
    expect(externalSources(app)).toContain('https://www.googleapis.com');
    expect(app.get('connect-src')).toEqual(["'self'", ...GOOGLE.connect]);
    expect(app.get('script-src')).toContain('https://accounts.google.com/gsi/client');
  });

  it('uses strict-dynamic with hashes for autocsp and self with hashes otherwise', () => {
    const auto = parseCsp(header('root', 'autocsp', 'off')['content-security-policy']);
    expect(auto.get('script-src')).toEqual(["'strict-dynamic'", ...HASHES.scripts]);
    const hashed = parseCsp(header('root', 'post-build', 'off')['content-security-policy']);
    expect(hashed.get('script-src')).toEqual(["'self'", ...HASHES.scripts]);
  });

  it('seals the document: object-src, base-uri and frame-ancestors', () => {
    const root = parseCsp(header('root', 'post-build', 'off')['content-security-policy']);
    expect(root.get('object-src')).toEqual(["'none'"]);
    expect(root.get('frame-ancestors')).toEqual(["'none'"]);
    expect(root.get('base-uri')).toEqual(["'self'"]);
    const literal = buildHeaders({ route: 'root', strategy: 'post-build', tt: 'off', hashes: HASHES, baseUri: 'none' });
    expect(parseCsp(literal['content-security-policy']).get('base-uri')).toEqual(["'none'"]);
  });

  it('places Trusted Types in the enforced header, the report-only header, or neither', () => {
    const enforced = header('root', 'post-build', 'enforced');
    expect(enforced['content-security-policy']).toContain("require-trusted-types-for 'script'");
    expect(enforced['content-security-policy-report-only']).toBeUndefined();
    const reportOnly = header('root', 'post-build', 'report-only');
    expect(reportOnly['content-security-policy']).not.toContain('trusted-types');
    expect(reportOnly['content-security-policy-report-only']).toContain("require-trusted-types-for 'script'");
    const off = header('root', 'post-build', 'off');
    expect(JSON.stringify(off)).not.toContain('trusted-types');
  });

  it('can relax style-src (and only style-src) to unsafe-inline, dropping the style hashes', () => {
    const relaxed = buildHeaders({
      route: 'app',
      strategy: 'post-build',
      tt: 'off',
      hashes: HASHES,
      google: GOOGLE,
      unsafeInlineStyle: true,
    });
    const policy = parseCsp(relaxed['content-security-policy']);
    expect(policy.get('style-src')).toEqual(["'self'", "'unsafe-inline'", ...GOOGLE.style]);
    expect(forbiddenScriptSources(policy)).toEqual([]);
  });

  it('allows the GIS loader policy names only under /app', () => {
    const root = header('root', 'post-build', 'enforced')['content-security-policy'];
    const app = header('app', 'post-build', 'enforced')['content-security-policy'];
    expect(parseCsp(root).get('trusted-types')).toEqual(['angular', 'angular#bundler', 'angular#unsafe-bypass']);
    expect(parseCsp(app).get('trusted-types')).toContain('cc-gis-loader');
  });
});

describe('negative-check helpers', () => {
  it('flags unsafe keywords, nonces-free wildcards and host sources', () => {
    const parsed = parseCsp(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src https://x.test wss://y.test *",
    );
    expect(forbiddenScriptSources(parsed)).toEqual(["'unsafe-inline'", "'unsafe-eval'"]);
    expect(externalSources(parsed)).toEqual(['https://x.test', 'wss://y.test', '*']);
  });

  it('ignores keywords, hashes, data: and blob: when looking for external origins', () => {
    const parsed = parseCsp("img-src 'self' data: blob:; script-src 'sha256-abc=' 'strict-dynamic'");
    expect(externalSources(parsed)).toEqual([]);
  });
});
