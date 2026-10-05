import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkWorkspace, parseWorkspaceYaml } from './lib.mjs';

const WORKSPACE_YAML = `packages:
  - packages/*

# exact pins only
catalog:
  '@scope/tool': 1.2.3
  zod: 4.0.0 # trailing comment
`;

const scratchDirs: string[] = [];

function scratchWorkspace(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'catalog-check-'));
  scratchDirs.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

function validFiles(): Record<string, unknown> {
  return {
    'pnpm-workspace.yaml': WORKSPACE_YAML,
    'package.json': { name: 'root', private: true, devDependencies: { '@scope/tool': 'catalog:' } },
    'packages/a/package.json': { name: '@cuotascasa/a', dependencies: { zod: 'catalog:' } },
    'packages/b/package.json': { name: '@cuotascasa/b', dependencies: { '@cuotascasa/a': 'workspace:*' } },
  };
}

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('parseWorkspaceYaml', () => {
  it('reads block sequences and mappings, quoted keys and comments', () => {
    expect(parseWorkspaceYaml(WORKSPACE_YAML)).toEqual({
      packages: ['packages/*'],
      catalog: { '@scope/tool': '1.2.3', zod: '4.0.0' },
    });
  });

  it('rejects syntax outside the supported subset, naming the line', () => {
    expect(() => parseWorkspaceYaml('packages: [a, b]\n')).toThrow('pnpm-workspace.yaml line 1: unsupported syntax');
  });
});

describe('checkWorkspace', () => {
  it('accepts catalog: and workspace:* references', () => {
    expect(checkWorkspace(scratchWorkspace(validFiles()))).toEqual([]);
  });

  it('flags a literal version in a workspace manifest', () => {
    const files = validFiles();
    files['packages/a/package.json'] = { name: '@cuotascasa/a', dependencies: { zod: '4.0.0' } };
    expect(checkWorkspace(scratchWorkspace(files))).toEqual([
      { file: 'packages/a/package.json', message: 'dependencies.zod must use "catalog:", got "4.0.0"' },
    ]);
  });

  it('flags a literal version in the root manifest', () => {
    const files = validFiles();
    files['package.json'] = { name: 'root', devDependencies: { '@scope/tool': '^1.2.3' } };
    expect(checkWorkspace(scratchWorkspace(files))).toEqual([
      { file: 'package.json', message: 'devDependencies.@scope/tool must use "catalog:", got "^1.2.3"' },
    ]);
  });

  it('flags a catalog entry that is a range instead of an exact version', () => {
    const files = validFiles();
    files['pnpm-workspace.yaml'] = WORKSPACE_YAML.replace('zod: 4.0.0', 'zod: ^4.0.0');
    expect(checkWorkspace(scratchWorkspace(files))).toEqual([
      { file: 'pnpm-workspace.yaml', message: 'catalog entry zod must pin an exact version, got "^4.0.0"' },
    ]);
  });

  it('flags catalog: for a package missing from the catalog', () => {
    const files = validFiles();
    files['packages/a/package.json'] = { name: '@cuotascasa/a', dependencies: { dexie: 'catalog:' } };
    expect(checkWorkspace(scratchWorkspace(files))).toEqual([
      {
        file: 'packages/a/package.json',
        message: 'dependencies.dexie uses "catalog:" but the catalog has no entry for it',
      },
    ]);
  });

  it('requires workspace:* for internal packages and that they exist', () => {
    const files = validFiles();
    files['packages/b/package.json'] = {
      name: '@cuotascasa/b',
      dependencies: { '@cuotascasa/a': '0.0.0', '@cuotascasa/ghost': 'workspace:*' },
    };
    expect(checkWorkspace(scratchWorkspace(files))).toEqual([
      { file: 'packages/b/package.json', message: 'dependencies.@cuotascasa/a must be "workspace:*", got "0.0.0"' },
      { file: 'packages/b/package.json', message: 'dependencies.@cuotascasa/ghost is not a workspace package' },
    ]);
  });
});

describe('check.mjs CLI', () => {
  const cli = (root: string) =>
    spawnSync(process.execPath, ['tools/catalog-check/check.mjs', '--root', root], { encoding: 'utf8' });

  it('exits 1 and names the manifest when a scratch manifest uses a literal version', () => {
    const files = validFiles();
    files['packages/a/package.json'] = { name: '@cuotascasa/a', dependencies: { zod: '4.0.0' } };
    const result = cli(scratchWorkspace(files));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('catalog-check: packages/a/package.json: dependencies.zod must use "catalog:"');
  });

  it('passes on this repository', () => {
    const result = cli('.');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
