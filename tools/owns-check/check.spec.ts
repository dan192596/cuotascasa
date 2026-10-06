import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const CLI = resolve('tools/owns-check/check.mjs');
const ENFORCED = 'tools/conformance/enforced-features.json';
const CARDS = [
  {
    id: 'W0-06',
    wave: 'W0',
    executor: 'opus',
    branch: 'card/W0-06-ci',
    owns: ['docs/plan/cards.json', 'docs/plan/frozen-files.json', ENFORCED],
  },
  {
    id: 'W1-04',
    wave: 'W1',
    executor: 'sonnet',
    branch: 'card/W1-04-memory',
    owns: ['packages/persistence/src/memory/'],
  },
  { id: 'W2-13', wave: 'W2', executor: 'sonnet', branch: 'card/W2-13-core', owns: [ENFORCED] },
];
const FROZEN = [{ path: 'docs/plan/', editableBy: ['W0-06'] }];

const scratchDirs: string[] = [];

function git(repo: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function write(repo: string, path: string, content: string): void {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
}

/** Scratch repo whose main holds the generated cards.json and frozen-files.json (the merge-base of every test). */
function scratchRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'owns-check-'));
  scratchDirs.push(repo);
  git(repo, 'init', '--quiet', '--initial-branch=main');
  git(repo, 'config', 'user.email', '0+synthetic@users.noreply.github.com');
  git(repo, 'config', 'user.name', 'Synthetic');
  git(repo, 'config', 'commit.gpgsign', 'false');
  write(repo, 'docs/plan/cards.json', `${JSON.stringify(CARDS, null, 2)}\n`);
  write(repo, 'docs/plan/frozen-files.json', `${JSON.stringify(FROZEN, null, 2)}\n`);
  write(repo, ENFORCED, '[]\n');
  write(repo, 'packages/persistence/src/memory/index.ts', 'export {};\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '--quiet', '-m', 'chore: base');
  return repo;
}

function commitOnBranch(repo: string, branch: string, files: Record<string, string>): void {
  git(repo, 'switch', '--quiet', '-c', branch);
  for (const [path, content] of Object.entries(files)) write(repo, path, content);
  git(repo, 'add', '.');
  git(repo, 'commit', '--quiet', '-m', 'test: change');
}

function ownsCheck(repo: string, ...args: string[]) {
  return spawnSync(process.execPath, [CLI, '--base', 'main', ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_HEAD_REF: '' },
  });
}

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('check.mjs over a scratch git repository', () => {
  it('passes an in-owns diff against the merge-base', () => {
    const repo = scratchRepo();
    commitOnBranch(repo, 'card/W1-04-memory', { 'packages/persistence/src/memory/store.ts': 'export {};\n' });
    const result = ownsCheck(repo);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      'owns-check: W1-04: 1 changed path(s) inside owns; frozen and append-only rules respected\n',
    );
    expect(result.status).toBe(0);
  });

  it('fails and lists a path outside owns', () => {
    const repo = scratchRepo();
    commitOnBranch(repo, 'card/W1-04-memory', { 'README.md': 'x\n' });
    const result = ownsCheck(repo);
    expect(result.stderr).toBe('owns-check: W1-04: outside owns: README.md\n');
    expect(result.status).toBe(1);
  });

  it('fails when a tag is removed from enforced-features.json', () => {
    const repo = scratchRepo();
    git(repo, 'switch', '--quiet', '-c', 'card/W2-13-core');
    write(repo, ENFORCED, '["core"]\n');
    git(repo, 'commit', '--quiet', '-am', 'feat: enforce core');
    git(repo, 'switch', '--quiet', 'main');
    git(repo, 'merge', '--quiet', '--ff-only', 'card/W2-13-core');
    commitOnBranch(repo, 'card/W2-13-core-again', { [ENFORCED]: '[]\n' });
    const result = ownsCheck(repo, '--branch', 'card/W2-13-core-again');
    expect(result.stderr).toBe(
      `owns-check: W2-13: append-only: ${ENFORCED} may only gain entries (removes or reorders entries)\n`,
    );
    expect(result.status).toBe(1);
  });

  it('reads the branch from GITHUB_HEAD_REF and exempts renovate/', () => {
    const repo = scratchRepo();
    commitOnBranch(repo, 'renovate/vitest-5.x', { 'package.json': '{}\n' });
    const result = spawnSync(process.execPath, [CLI, '--base', 'main'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_HEAD_REF: 'renovate/vitest-5.x' },
    });
    expect(result.stdout).toBe('owns-check: branch renovate/vitest-5.x is exempt (renovate/)\n');
    expect(result.status).toBe(0);
  });

  it('reads cards.json from the merge-base, so a card cannot grant itself owns', () => {
    const repo = scratchRepo();
    const widened = CARDS.map((card) => (card.id === 'W1-04' ? { ...card, owns: [...card.owns, 'README.md'] } : card));
    commitOnBranch(repo, 'card/W1-04-memory', {
      'docs/plan/cards.json': `${JSON.stringify(widened, null, 2)}\n`,
      'README.md': 'x\n',
    });
    const result = ownsCheck(repo);
    expect(result.stderr).toBe(
      'owns-check: W1-04: outside owns: README.md\nowns-check: W1-04: outside owns: docs/plan/cards.json\n',
    );
    expect(result.status).toBe(1);
  });

  it('bootstraps from the head when the merge-base has no cards.json yet (the W0-06 branch itself)', () => {
    const repo = mkdtempSync(join(tmpdir(), 'owns-check-'));
    scratchDirs.push(repo);
    git(repo, 'init', '--quiet', '--initial-branch=main');
    git(repo, 'config', 'user.email', '0+synthetic@users.noreply.github.com');
    git(repo, 'config', 'user.name', 'Synthetic');
    git(repo, 'config', 'commit.gpgsign', 'false');
    write(repo, 'README.md', 'base\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '--quiet', '-m', 'chore: base');
    commitOnBranch(repo, 'card/W0-06-ci', {
      'docs/plan/cards.json': `${JSON.stringify(CARDS, null, 2)}\n`,
      'docs/plan/frozen-files.json': `${JSON.stringify(FROZEN, null, 2)}\n`,
    });
    const result = ownsCheck(repo);
    expect(result.stderr).toBe(
      'owns-check: bootstrap: docs/plan/cards.json is not in the merge-base yet; using the head version\n',
    );
    expect(result.stdout).toContain('owns-check: W0-06: 2 changed path(s) inside owns');
    expect(result.status).toBe(0);
  });

  it('exits 2 when frozen-files.json has an entry without editableBy', () => {
    const repo = scratchRepo();
    write(repo, 'docs/plan/frozen-files.json', '[{ "path": "docs/plan/" }]\n');
    git(repo, 'commit', '--quiet', '-am', 'chore: broken config');
    commitOnBranch(repo, 'card/W1-04-memory', { 'packages/persistence/src/memory/store.ts': 'export {};\n' });
    const result = ownsCheck(repo);
    expect(result.stderr).toBe(
      'owns-check: config: docs/plan/frozen-files.json entry 0 (docs/plan/): missing editableBy\n',
    );
    expect(result.status).toBe(2);
  });
});
