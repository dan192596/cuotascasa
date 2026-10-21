import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TempRepo } from '../testing.js';

const SCRIPT = resolve(import.meta.dirname, 'noreply-range.mjs');
const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const GOOD = '1+tester@users.noreply.github.com';
const GITHUB_COMMITTER = 'noreply@github.com';
const BAD = 'someone@example.com';

const repos: TempRepo[] = [];
afterEach(() => repos.splice(0).forEach((repo) => repo.dispose()));

function newRepo() {
  const repo = new TempRepo(GOOD);
  repos.push(repo);
  return repo;
}

/** Commits with explicit author and committer e-mails; returns the short SHA. */
function commit(repo: TempRepo, file: string, author = GOOD, committer = GOOD): string {
  repo.write(file, `${file}\n`);
  repo.git('add', file);
  const env = {
    GIT_AUTHOR_EMAIL: author,
    GIT_COMMITTER_EMAIL: committer,
  };
  const result = spawnSync('git', ['commit', '-q', '-m', `chore: add ${file}`], {
    cwd: repo.dir,
    env: { ...repo.env, ...env },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return repo.git('rev-parse', '--short', 'HEAD').trim();
}

function run(cwd: string, args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env, encoding: 'utf8' });
}

/** A repo with a base commit and returns its SHA, ready for commits on a topic branch. */
function withBase() {
  const repo = newRepo();
  commit(repo, 'base.txt');
  const base = repo.git('rev-parse', 'HEAD').trim();
  repo.git('checkout', '-q', '-b', 'topic');
  return { repo, base };
}

describe('noreply-range.mjs', () => {
  it('passes for noreply author and committer', () => {
    const { repo, base } = withBase();
    commit(repo, 'a.txt');
    expect(run(repo.dir, ['--base', base], repo.env).status).toBe(0);
  });

  it('passes for an empty range', () => {
    const { repo, base } = withBase();
    expect(run(repo.dir, ['--base', base], repo.env).status).toBe(0);
  });

  it('accepts noreply@github.com as committer', () => {
    const { repo, base } = withBase();
    commit(repo, 'a.txt', GOOD, GITHUB_COMMITTER);
    expect(run(repo.dir, ['--base', base], repo.env).status).toBe(0);
  });

  it('rejects noreply@github.com as author', () => {
    const { repo, base } = withBase();
    const sha = commit(repo, 'a.txt', GITHUB_COMMITTER, GOOD);
    const result = run(repo.dir, ['--base', base], repo.env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(sha);
    expect(result.stderr).toContain('author');
    expect(result.stderr).not.toContain('committer');
  });

  it('names only the short SHA and the failed identity for a bad author', () => {
    const { repo, base } = withBase();
    const sha = commit(repo, 'a.txt', BAD, GOOD);
    const result = run(repo.dir, ['--base', base], repo.env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(sha);
    expect(result.stderr).toContain('author');
    expect(result.stderr).not.toContain('committer');
    expect(result.stdout + result.stderr).not.toContain(BAD);
    expect(result.stdout + result.stderr).not.toContain('example.com');
    expect(result.stdout + result.stderr).not.toContain('Synthetic Tester');
    expect(result.stdout + result.stderr).not.toContain('chore: add');
  });

  it('flags a bad committer and reports both when both fail', () => {
    const { repo, base } = withBase();
    const onlyCommitter = commit(repo, 'a.txt', GOOD, BAD);
    const both = commit(repo, 'b.txt', BAD, BAD);
    const result = run(repo.dir, ['--base', base], repo.env);
    expect(result.status).toBe(1);
    const lines = result.stderr.split('\n');
    const committerLine = lines.find((line) => line.includes(onlyCommitter));
    expect(committerLine).toContain('committer');
    expect(committerLine).not.toContain('author');
    const bothLine = lines.find((line) => line.includes(both));
    expect(bothLine).toContain('author');
    expect(bothLine).toContain('committer');
    expect(result.stdout + result.stderr).not.toContain(BAD);
  });

  it('rejects look-alike addresses', () => {
    const { repo, base } = withBase();
    commit(repo, 'a.txt', 'x@users.noreply.github.com.example.com', GOOD);
    commit(repo, 'b.txt', GOOD, 'noreply@github.com.example.com');
    commit(repo, 'c.txt', GOOD, 'Noreply@Github.com');
    expect(run(repo.dir, ['--base', base], repo.env).status).toBe(1);
  });

  it('only looks at commits after the base', () => {
    const repo = newRepo();
    commit(repo, 'old.txt', BAD, BAD);
    const base = repo.git('rev-parse', 'HEAD').trim();
    commit(repo, 'a.txt');
    expect(run(repo.dir, ['--base', base], repo.env).status).toBe(0);
  });

  it('skips merge commits (update-branch merges carry GitHub metadata)', () => {
    const { repo, base } = withBase();
    commit(repo, 'a.txt');
    repo.git('checkout', '-q', '-b', 'side', base);
    commit(repo, 'side.txt');
    repo.git('checkout', '-q', 'topic');
    const env = { GIT_AUTHOR_EMAIL: BAD, GIT_COMMITTER_EMAIL: BAD };
    const merged = spawnSync('git', ['merge', '--no-ff', '-q', '-m', 'Merge branch side', 'side'], {
      cwd: repo.dir,
      env: { ...repo.env, ...env },
      encoding: 'utf8',
    });
    expect(merged.status).toBe(0);
    expect(repo.git('rev-list', '--merges', '-n1', 'HEAD').trim()).not.toBe('');
    expect(run(repo.dir, ['--base', base], repo.env).status).toBe(0);
  });

  it('still checks non-merge commits that arrive through a merge', () => {
    const { repo, base } = withBase();
    repo.git('checkout', '-q', '-b', 'side', base);
    const sha = commit(repo, 'side.txt', BAD, GOOD);
    repo.git('checkout', '-q', 'topic');
    commit(repo, 'a.txt');
    repo.git('merge', '--no-ff', '-q', '-m', 'Merge side', 'side');
    const result = run(repo.dir, ['--base', base], repo.env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(sha);
  });

  it('accepts --head', () => {
    const { repo, base } = withBase();
    const first = repo.git('rev-parse', 'HEAD').trim();
    commit(repo, 'a.txt');
    const bad = commit(repo, 'b.txt', BAD, GOOD);
    expect(run(repo.dir, ['--base', base, '--head', first], repo.env).status).toBe(0);
    const result = run(repo.dir, ['--base', base], repo.env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(bad);
  });

  it('exits 2 on usage and git errors', () => {
    const { repo } = withBase();
    expect(run(repo.dir, [], repo.env).status).toBe(2);
    expect(run(repo.dir, ['--base'], repo.env).status).toBe(2);
    expect(run(repo.dir, ['--bogus', 'x'], repo.env).status).toBe(2);
    const unknown = run(repo.dir, ['--base', 'does-not-exist'], repo.env);
    expect(unknown.status).toBe(2);
  });

  it('exits 2 outside a git repository', () => {
    const result = run('/', ['--base', 'HEAD'], repo0Env());
    expect(result.status).toBe(2);
  });

  it('passes on the repository itself, with base = merge-base with main', () => {
    const env = { PATH: process.env['PATH'], HOME: process.env['HOME'] };
    const baseRef = ['main', 'origin/main'].find(
      (ref) => spawnSync('git', ['rev-parse', '--verify', '-q', ref], { cwd: REPO_ROOT }).status === 0,
    );
    expect(baseRef).toBeDefined();
    const base = spawnSync('git', ['merge-base', baseRef as string, 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(base.status).toBe(0);
    const result = run(REPO_ROOT, ['--base', base.stdout.trim()], env);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});

function repo0Env(): NodeJS.ProcessEnv {
  return { PATH: process.env['PATH'], GIT_CEILING_DIRECTORIES: '/' };
}
