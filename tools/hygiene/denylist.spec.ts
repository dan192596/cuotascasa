import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addedLines, findHits, normalize, parseTerms } from './denylist.mjs';
import { TempRepo } from './testing.js';

const repos: TempRepo[] = [];
const dirs: string[] = [];
afterEach(() => {
  repos.splice(0).forEach((repo) => repo.dispose());
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function newRepo() {
  const repo = new TempRepo();
  repos.push(repo);
  return repo;
}

function listOutsideRepo(content: string) {
  const dir = mkdtempSync(join(tmpdir(), 'denylist-'));
  dirs.push(dir);
  const path = join(dir, 'denylist.txt');
  writeFileSync(path, content);
  return path;
}

describe('denylist.mjs CLI', () => {
  it('fails when a staged added line contains a denylisted term, reporting only file and line', () => {
    const repo = newRepo();
    const list = listOutsideRepo('# synthetic list\nzzz-synthetic-term\n');
    repo.stage('notes.txt', 'one\ntwo\nthis has ZZZ-Synthetic-Term inside\n');
    const result = repo.run('denylist.mjs', { CUOTASCASA_DENYLIST: list });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('notes.txt:3');
  });

  it('matches numbers regardless of commas, spaces and currency symbols', () => {
    const repo = newRepo();
    const list = listOutsideRepo('1234567.89\n');
    repo.stage('a.txt', 'monto: Q 1,234,567.89 total\n');
    const result = repo.run('denylist.mjs', { CUOTASCASA_DENYLIST: list });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('a.txt:1');
  });

  it('matches in the other direction: a formatted term against a plain number', () => {
    const repo = newRepo();
    const list = listOutsideRepo('Q 1,234,567.89\n');
    repo.stage('a.txt', 'monto 1234567.89\n');
    expect(repo.run('denylist.mjs', { CUOTASCASA_DENYLIST: list }).status).toBe(1);
  });

  it('never prints the list contents nor the matching text', () => {
    const repo = newRepo();
    const list = listOutsideRepo('secret-synthetic-needle\n9876543.21\n');
    repo.stage('a.txt', 'x secret-synthetic-needle y\n9,876,543.21\n');
    const result = repo.run('denylist.mjs', { CUOTASCASA_DENYLIST: list });
    expect(result.status).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).not.toMatch(/needle/i);
    expect(output).not.toContain('9876543');
    expect(output).not.toContain('9,876,543');
    expect(output).toContain('a.txt:1');
    expect(output).toContain('a.txt:2');
  });

  it('ignores lines that were not added by the staged change', () => {
    const repo = newRepo();
    const list = listOutsideRepo('old-synthetic-term\n');
    repo.stage('a.txt', 'old-synthetic-term\n');
    repo.git('commit', '-q', '-m', 'init');
    repo.write('a.txt', 'old-synthetic-term\nclean line\n');
    repo.git('add', 'a.txt');
    expect(repo.run('denylist.mjs', { CUOTASCASA_DENYLIST: list }).status).toBe(0);
  });

  it('passes when nothing matches', () => {
    const repo = newRepo();
    const list = listOutsideRepo('needle\n');
    repo.stage('a.txt', 'harmless\n');
    const result = repo.run('denylist.mjs', { CUOTASCASA_DENYLIST: list });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('passes with a notice when the list is absent', () => {
    const repo = newRepo();
    repo.stage('a.txt', 'anything\n');
    const result = repo.run('denylist.mjs', {
      CUOTASCASA_DENYLIST: join(tmpdir(), 'does-not-exist-denylist.txt'),
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('no denylist found');
  });

  it('falls back to ~/.config/cuotascasa/denylist.txt when the variable is unset', () => {
    const repo = newRepo();
    const home = mkdtempSync(join(tmpdir(), 'denylist-home-'));
    dirs.push(home);
    const config = join(home, '.config', 'cuotascasa');
    // The list lives under the fake HOME, outside the repo.
    mkdirSync(config, { recursive: true });
    writeFileSync(join(config, 'denylist.txt'), 'home-synthetic-term\n');
    repo.stage('a.txt', 'a home-synthetic-term b\n');
    const result = repo.run('denylist.mjs', { HOME: home, CUOTASCASA_DENYLIST: '' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('a.txt:1');
  });

  it('refuses a list that lives inside the repository', () => {
    const repo = newRepo();
    repo.write('denylist.txt', 'needle\n');
    repo.stage('a.txt', 'harmless\n');
    const result = repo.run('denylist.mjs', { CUOTASCASA_DENYLIST: join(repo.dir, 'denylist.txt') });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('inside the repository');
  });

  it('refuses a symlink outside the repo that resolves into it, and accepts one that resolves outside', () => {
    const repo = newRepo();
    repo.write('real.txt', 'needle\n');
    const dir = mkdtempSync(join(tmpdir(), 'denylist-link-'));
    dirs.push(dir);
    const link = join(dir, 'link.txt');
    symlinkSync(join(repo.dir, 'real.txt'), link);
    repo.stage('a.txt', 'harmless\n');
    const result = repo.run('denylist.mjs', { CUOTASCASA_DENYLIST: link });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('inside the repository');
  });
});

describe('denylist helpers', () => {
  it('normalizes case, commas, whitespace and currency symbols', () => {
    expect(normalize('US$ 1,234.56')).toBe('1234.56');
    expect(normalize(' Q 1 234,5 ')).toBe('12345');
    expect(normalize('€9.5 Quetzal')).toBe('9.5quetzal');
  });

  it('parses terms skipping comments and blanks', () => {
    expect(parseTerms('# c\n\n  Foo Bar \r\n,\n')).toEqual(['foobar']);
  });

  it('reads line numbers from -U0 hunks', () => {
    const diff = [
      'diff --git a/x b/x',
      '--- a/x',
      '+++ b/x',
      '@@ -1,0 +5,2 @@',
      '+first',
      '+second',
      '@@ -9 +20 @@',
      '-gone',
      '+third',
      'diff --git a/y b/y',
      'deleted file mode 100644',
      '--- a/y',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-removed',
    ].join('\n');
    expect(addedLines(diff)).toEqual([
      { file: 'x', line: 5, text: 'first' },
      { file: 'x', line: 6, text: 'second' },
      { file: 'x', line: 20, text: 'third' },
    ]);
    expect(findHits(diff, ['second', 'third'])).toEqual(['x:6', 'x:20']);
  });
});
