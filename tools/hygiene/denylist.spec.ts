import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addedLines, countHitLines, findHits, normalize, parseTerms, tokenize } from './denylist.mjs';
import { TempRepo } from './testing.js';

const ENTRYPOINT = resolve(import.meta.dirname, 'denylist.mjs');

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

    const outside = listOutsideRepo('needle\n');
    const okLink = join(dir, 'ok-link.txt');
    symlinkSync(outside, okLink);
    repo.stage('b.txt', 'a needle b\n');
    const accepted = repo.run('denylist.mjs', { CUOTASCASA_DENYLIST: okLink });
    expect(accepted.status).toBe(1);
    expect(accepted.stderr).toContain('b.txt:1');
    expect(accepted.stderr).not.toContain('inside the repository');
  });

  it('fails closed on a dangling symlink instead of treating the list as absent', () => {
    const repo = newRepo();
    const dir = mkdtempSync(join(tmpdir(), 'denylist-dangling-'));
    dirs.push(dir);
    const link = join(dir, 'link.txt');
    symlinkSync(join(dir, 'missing-target.txt'), link);
    repo.stage('a.txt', 'harmless\n');
    const result = repo.run('denylist.mjs', { CUOTASCASA_DENYLIST: link });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('hygiene:denylist: the denylist is a broken symlink');
  });

  it.skipIf(process.getuid?.() === 0)('fails closed with a fixed message when the list is unreadable', () => {
    const repo = newRepo();
    const list = listOutsideRepo('needle\n');
    chmodSync(list, 0o000);
    try {
      repo.stage('a.txt', 'harmless\n');
      const result = repo.run('denylist.mjs', { CUOTASCASA_DENYLIST: list });
      expect(result.status).toBe(1);
      expect(result.stderr.trim()).toBe('hygiene:denylist: could not read the denylist or the staged diff');
    } finally {
      chmodSync(list, 0o600);
    }
  });

  it('fails closed with a fixed message when git cannot produce the staged diff', () => {
    const repo = newRepo();
    const list = listOutsideRepo('needle\n');
    repo.stage('a.txt', 'harmless\n');
    writeFileSync(join(repo.dir, '.git', 'index'), 'corrupt');
    const result = repo.run('denylist.mjs', { CUOTASCASA_DENYLIST: list });
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe('hygiene:denylist: could not read the denylist or the staged diff');
  });
});

describe('denylist.mjs CLI: diff parsing cannot fail open', () => {
  function check(path: string, content: string, configure?: (repo: TempRepo) => void) {
    const repo = newRepo();
    configure?.(repo);
    const list = listOutsideRepo('zzz-synthetic-term\n');
    repo.stage(path, content);
    return repo.run('denylist.mjs', { CUOTASCASA_DENYLIST: list });
  }

  it('catches a hit in a file with a non-ASCII name', () => {
    const result = check('caf\u00e9.txt', 'x zzz-synthetic-term y\n');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('caf\u00e9.txt:1');
  });

  it('catches a hit in a file whose name contains a space', () => {
    const result = check('my notes.txt', 'x zzz-synthetic-term y\n');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('my notes.txt:1');
  });

  it('catches a hit on a line that itself starts with "++ " (diff line "+++ ...")', () => {
    const result = check('a.txt', 'first\n++ zzz-synthetic-term\n');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('a.txt:2');
  });

  it('catches a hit after a "++ " line in the same hunk, attributing it to the right file', () => {
    const result = check('a.txt', '++ clean\nzzz-synthetic-term\n');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('a.txt:2');
  });

  it('catches a hit when diff.noprefix is set', () => {
    const result = check('a.txt', 'zzz-synthetic-term\n', (repo) => repo.git('config', 'diff.noprefix', 'true'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('a.txt:1');
  });

  it('catches a hit when diff.mnemonicPrefix is set', () => {
    const result = check('a.txt', 'zzz-synthetic-term\n', (repo) => repo.git('config', 'diff.mnemonicPrefix', 'true'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('a.txt:1');
  });
});

describe('denylist helpers', () => {
  it('unquotes C-style quoted file names (octal bytes, tab, newline, quote, backslash)', () => {
    const diff = [
      'diff --git "a/caf\\303\\251.txt" "b/caf\\303\\251.txt"',
      '--- /dev/null',
      '+++ "b/caf\\303\\251 \\t\\n\\"\\\\.txt"',
      '@@ -0,0 +1 @@',
      '+hit',
    ].join('\n');
    expect(addedLines(diff)).toEqual([{ file: 'caf\u00e9 \t\n"\\.txt', line: 1, text: 'hit' }]);
  });

  it('strips the trailing tab git adds after paths with spaces', () => {
    const diff = ['--- /dev/null', '+++ b/my notes.txt\t', '@@ -0,0 +1 @@', '+hit'].join('\n');
    expect(addedLines(diff)).toEqual([{ file: 'my notes.txt', line: 1, text: 'hit' }]);
  });

  it('never treats lines inside a hunk as headers', () => {
    const diff = ['+++ b/f', '@@ -0,0 +1,3 @@', '+a', '+++ b/other', '++ c'].join('\n');
    expect(addedLines(diff)).toEqual([
      { file: 'f', line: 1, text: 'a' },
      { file: 'f', line: 2, text: '++ b/other' },
      { file: 'f', line: 3, text: '+ c' },
    ]);
  });

  it('fails closed when an added line has no determinable file', () => {
    expect(() => addedLines(['+++ x', '@@ -0,0 +1 @@', '+hit'].join('\n'))).toThrow();
    expect(() => addedLines(['+++ /dev/null', '@@ -0,0 +1 @@', '+hit'].join('\n'))).toThrow();
  });

  it('normalizes NFC and case, drops Q / US$ before a number and thousands separators inside numbers', () => {
    expect(normalize('US$ 1,234.56')).toBe('1234.56');
    expect(normalize('Q 1,234,567.89')).toBe('1234567.89');
    expect(normalize('US$1234.50')).toBe('1234.50');
    expect(normalize('1 234.5')).toBe('1234.5');
    expect(normalize('1\u00a0234\u00a0567')).toBe('1234567');
    expect(normalize('Que\u0301 Quetzal')).toBe('qu\u00e9 quetzal');
    // A comma or space that is not a thousands separator stays a separator.
    expect(normalize('12, 345 y 1,23')).toBe('12, 345 y 1,23');
  });

  it('tokenizes into whole words and numbers, keeping an internal decimal point', () => {
    expect(tokenize('Pagó Q 1,234.50, el 3.')).toEqual(['pagó', '1234.5', 'el', '3']);
    expect(tokenize('zzz-synthetic_term')).toEqual(['zzz', 'synthetic', 'term']);
    expect(tokenize('1234.00 y 0.50 y 1234.')).toEqual(['1234', 'y', '0.5', 'y', '1234']);
  });

  it('parses terms into token sequences, skipping comments and blanks', () => {
    expect(parseTerms('# c\n\n  Foo Bar \r\n,\n')).toEqual([['foo', 'bar']]);
  });

  it('does not match a number inside a longer number nor a different number', () => {
    const terms = parseTerms('1234\n1234.5\n');
    expect(countHitLines('saldo 91234.5\n', terms)).toBe(0);
    expect(countHitLines('saldo 1234.51\n', terms)).toBe(0);
    expect(countHitLines('saldo 12345\n', terms)).toBe(0);
  });

  it('matches the same number written with grouping, currency or trailing zeros', () => {
    const terms = parseTerms('1234.5\n');
    expect(countHitLines('Q 1,234.50\n1 234.5\nUS$1234.50\nq1234.5\n(1,234.5)\n', terms)).toBe(5);
  });

  it('matches a two-word name only as consecutive whole words, case- and NFC-insensitive', () => {
    const terms = parseTerms('Zoé Quintanilla\n');
    expect(countHitLines('la señora ZOE\u0301 quintanilla firmó\n', terms)).toBe(1);
    expect(countHitLines('zoé, quintanilla\n', terms)).toBe(1);
    expect(countHitLines('zoé y quintanilla\n', terms)).toBe(0);
    expect(countHitLines('zoé quintanillas\n', terms)).toBe(0);
    expect(countHitLines('azoé quintanilla\n', terms)).toBe(0);
    expect(countHitLines('zoéquintanilla\n', terms)).toBe(0);
  });

  it('does not match a short word term inside a longer word', () => {
    const terms = parseTerms('casa\n');
    expect(countHitLines('casamiento, encasado, casas\n', terms)).toBe(0);
    expect(countHitLines('la Casa azul\n', terms)).toBe(1);
  });

  it('joins numbers grouped with spaces before comparing', () => {
    const terms = parseTerms('1234567\n');
    expect(countHitLines('total 1 234 567 netos\n', terms)).toBe(1);
    expect(countHitLines('total 1 234 5678\n', terms)).toBe(0);
  });

  it('counts lines, not hits', () => {
    const terms = parseTerms('alfa\nbeta\n');
    expect(countHitLines('alfa beta alfa\nnada\r\nbeta\n', terms)).toBe(2);
    expect(countHitLines('', terms)).toBe(0);
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
    expect(findHits(diff, [['second'], ['third']])).toEqual(['x:6', 'x:20']);
  });
});

describe('denylist.mjs count mode', () => {
  function count(repo: TempRepo, args: string[], env: Record<string, string>, input?: string) {
    return spawnSync(process.execPath, [ENTRYPOINT, ...args], {
      cwd: repo.dir,
      env: { ...repo.env, ...env },
      encoding: 'utf8',
      ...(input === undefined ? {} : { input }),
    });
  }

  it('--count-file prints only the number of lines with a hit', () => {
    const repo = newRepo();
    const list = listOutsideRepo('zzz-synthetic-term\n1234.5\n');
    const dir = mkdtempSync(join(tmpdir(), 'denylist-count-'));
    dirs.push(dir);
    const file = join(dir, 'input.txt');
    writeFileSync(file, 'x ZZZ synthetic term\nQ 1,234.50\n91234.5\nnada\n');
    const result = count(repo, ['--count-file', file], { CUOTASCASA_DENYLIST: list });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('2\n');
    expect(result.stderr).toBe('');
  });

  it('--count-stdin reads standard input and prints only a number', () => {
    const repo = newRepo();
    const list = listOutsideRepo('zzz-synthetic-term\n');
    const result = count(repo, ['--count-stdin'], { CUOTASCASA_DENYLIST: list }, 'nada\nlimpio\n');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('0\n');
    expect(result.stderr).toBe('');
  });

  it('fails closed with exit 1 and no number when the list is absent, broken or inside the repo', () => {
    const repo = newRepo();
    const absent = count(
      repo,
      ['--count-stdin'],
      { CUOTASCASA_DENYLIST: join(tmpdir(), 'no-such-denylist.txt') },
      'x\n',
    );
    expect(absent.status).toBe(1);
    expect(absent.stdout).toBe('');
    expect(absent.stderr).toContain('no denylist found');

    repo.write('denylist.txt', 'needle\n');
    const inside = count(repo, ['--count-stdin'], { CUOTASCASA_DENYLIST: join(repo.dir, 'denylist.txt') }, 'x\n');
    expect(inside.status).toBe(1);
    expect(inside.stdout).toBe('');
    expect(inside.stderr).toContain('inside the repository');
  });

  it('fails with the fixed message when the input file cannot be read', () => {
    const repo = newRepo();
    const list = listOutsideRepo('needle\n');
    const result = count(repo, ['--count-file', join(tmpdir(), 'no-such-input.txt')], { CUOTASCASA_DENYLIST: list });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('hygiene:denylist: could not read the denylist or the input');
  });

  it('rejects unknown arguments with a usage message', () => {
    const repo = newRepo();
    const result = count(repo, ['--bogus'], {});
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('usage');
  });
});
