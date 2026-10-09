import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { analyze, resolveGraph } from './lib.mjs';

interface Out {
  entryPoint?: string;
  imports?: { path: string; kind: string; external?: boolean }[];
  inputs?: string[];
}

/** Synthetic esbuild metafile: only the fields the checker reads. */
function metafile(outputs: Record<string, Out>) {
  return {
    inputs: {},
    outputs: Object.fromEntries(
      Object.entries(outputs).map(([name, o]) => [
        name,
        {
          bytes: 1000,
          entryPoint: o.entryPoint,
          imports: o.imports ?? [],
          inputs: Object.fromEntries((o.inputs ?? []).map((i) => [i, { bytesInOutput: 10 }])),
        },
      ]),
    ),
  };
}

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), 'check.mjs');

const CONFIG = {
  graphs: [
    {
      id: 'landing',
      name: 'landing',
      roots: ['src/main.ts', 'src/landing.ts'],
      budgetGzipBytes: 5000,
      forbidden: [
        { id: 'dexie', pattern: '/dexie/' },
        { id: 'sync', pattern: 'packages/sync/' },
        { id: 'gis', pattern: 'accounts\\.google\\.com' },
      ],
    },
    {
      id: 'app',
      name: 'app',
      roots: ['src/main.ts', 'src/area.ts'],
      forbidden: [{ id: 'chart', pattern: '/chart\\.js/' }],
    },
  ],
};

const ok = () =>
  metafile({
    'main.js': {
      entryPoint: 'src/main.ts',
      imports: [
        { path: 'landing.js', kind: 'dynamic-import' },
        { path: 'area.js', kind: 'dynamic-import' },
        { path: 'shared.js', kind: 'import-statement' },
      ],
      inputs: ['src/main.ts'],
    },
    'shared.js': { inputs: ['src/shared.ts'] },
    'landing.js': {
      entryPoint: 'src/landing.ts',
      imports: [{ path: 'main.js', kind: 'import-statement' }],
      inputs: ['src/landing.ts'],
    },
    'area.js': {
      entryPoint: 'src/area.ts',
      imports: [{ path: 'heavy.js', kind: 'dynamic-import' }],
      inputs: ['node_modules/dexie/x.js', 'packages/sync/src/a.ts'],
    },
    'heavy.js': { inputs: ['node_modules/chart.js/y.js'] },
  });

const gzip = () => 1000;

describe('resolveGraph', () => {
  it('follows static imports and skips dynamic imports', () => {
    const files = resolveGraph(ok(), ['src/main.ts', 'src/landing.ts']).files;
    expect([...files].sort()).toEqual(['landing.js', 'main.js', 'shared.js']);
  });

  it('matches roots on a path boundary', () => {
    const m = metafile({
      'a.js': { entryPoint: 'src/xapp-area.routes.ts' },
      'b.js': { entryPoint: 'src/app-area.routes.ts' },
    });
    expect([...resolveGraph(m, ['app-area.routes.ts']).files]).toEqual(['b.js']);
    const only = metafile({ 'a.js': { entryPoint: 'src/xapp-area.routes.ts' } });
    expect(resolveGraph(only, ['app-area.routes.ts']).missing).toEqual(['app-area.routes.ts']);
    expect([...resolveGraph(only, ['xapp-area.routes.ts']).files]).toEqual(['a.js']);
  });

  it('reports a root that matches no entry point', () => {
    expect(resolveGraph(ok(), ['src/nope.ts']).missing).toEqual(['src/nope.ts']);
  });
});

describe('analyze', () => {
  it('passes when forbidden modules live only behind dynamic imports or in other graphs', () => {
    const { violations } = analyze(ok(), CONFIG, gzip);
    expect(violations).toEqual([]);
  });

  it('fails when a forbidden input is in the graph', () => {
    const m = ok();
    m.outputs['shared.js']!.inputs['node_modules/.pnpm/dexie@1/node_modules/dexie/z.js'] = { bytesInOutput: 1 };
    const { violations } = analyze(m, CONFIG, gzip);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ graph: 'landing', rule: 'dexie' });
    expect(violations[0]!.message).toContain('shared.js');
  });

  it('fails on a forbidden external import', () => {
    const m = ok();
    m.outputs['shared.js']!.imports.push({
      path: 'https://accounts.google.com/gsi/client',
      kind: 'import-statement',
      external: true,
    } as never);
    const { violations } = analyze(m, CONFIG, gzip);
    expect(violations.map((v) => v.rule)).toEqual(['gis']);
  });

  it('applies rules per graph: the app graph rejects chart.js when statically imported', () => {
    const m = ok();
    m.outputs['area.js']!.imports.push({ path: 'heavy.js', kind: 'import-statement' });
    const { violations } = analyze(m, CONFIG, gzip);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ graph: 'app', rule: 'chart' });
  });

  it('fails when the gzip budget is exceeded and passes at the limit', () => {
    expect(analyze(ok(), CONFIG, () => 1666).violations).toEqual([]); // 3 files * 1666 = 4998
    const over = analyze(ok(), CONFIG, () => 1667); // 5001 > 5000
    expect(over.violations).toHaveLength(1);
    expect(over.violations[0]).toMatchObject({ graph: 'landing', rule: 'budget' });
  });

  it('only counts JavaScript toward the budget', () => {
    const m = ok();
    m.outputs['x.css'] = { bytes: 1, imports: [], inputs: {}, entryPoint: 'src/landing.ts' } as never;
    const sizes: string[] = [];
    analyze(m, CONFIG, (f: string) => (sizes.push(f), 1));
    expect(sizes.some((f) => f.endsWith('.css'))).toBe(false);
  });

  it('fails when a root entry point is missing', () => {
    const cfg = { graphs: [{ id: 'g', name: 'g', roots: ['src/gone.ts'], forbidden: [] }] };
    const { violations } = analyze(ok(), cfg, gzip);
    expect(violations[0]).toMatchObject({ graph: 'g', rule: 'missing-root' });
  });

  it('rejects an invalid pattern in the config', () => {
    const cfg = { graphs: [{ id: 'g', name: 'g', roots: ['src/main.ts'], forbidden: [{ id: 'bad', pattern: '(' }] }] };
    expect(() => analyze(ok(), cfg, gzip)).toThrow(/bad/);
  });
});

describe('check.mjs CLI', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function run(m: unknown, extra: string[] = [], config: unknown = CONFIG) {
    const dir = mkdtempSync(join(tmpdir(), 'bundle-check-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'browser'));
    writeFileSync(join(dir, 'browser-stats.json'), JSON.stringify(m));
    for (const f of ['main.js', 'shared.js', 'landing.js', 'area.js', 'heavy.js'])
      writeFileSync(join(dir, 'browser', f), 'x'.repeat(200));
    const cfg = join(dir, 'config.json');
    writeFileSync(cfg, JSON.stringify(config));
    return spawnSync(process.execPath, [CLI, '--dist', dir, '--config', cfg, ...extra], {
      encoding: 'utf8',
    });
  }

  it('exits 0 and prints a report on a clean metafile', () => {
    const r = run(ok());
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('landing');
    expect(r.stdout).toMatch(/gzip/);
  });

  it('exits 1 on a violation', () => {
    const m = ok();
    m.outputs['shared.js']!.inputs['packages/sync/src/x.ts'] = { bytesInOutput: 1 };
    const r = run(m);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('sync');
  });

  it('honors --budget-landing overriding the configured budget', () => {
    const r = run(ok(), ['--budget-landing', '1']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('budget');
  });

  it('applies --budget-landing to the graph with id "landing" even when reordered', () => {
    const reordered = { graphs: [...CONFIG.graphs].reverse() };
    const r = run(ok(), ['--budget-landing', '1'], reordered);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('landing: [budget]');
    expect(r.stderr).not.toContain('app: [budget]');
  });

  it('fails when --budget-landing is given but no graph has id "landing"', () => {
    const r = run(ok(), ['--budget-landing', '1'], {
      graphs: [{ id: 'x', name: 'x', roots: ['src/main.ts'], forbidden: [] }],
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('landing');
  });

  it('exits 1 when the metafile is missing', () => {
    const r = spawnSync(process.execPath, [CLI, '--dist', '/nonexistent-dist'], {
      encoding: 'utf8',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('bundle-check');
  });
});
