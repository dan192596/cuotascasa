// @ts-check
// pre-commit hook: refuses added staged lines that contain a term of the developer's private denylist (ADR-0015 §6).
// The list lives outside the repo ($CUOTASCASA_DENYLIST or ~/.config/cuotascasa/denylist.txt). Output is limited to
// file paths and line numbers: neither the list nor the matching text is ever printed.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, isAbsolute, sep } from 'node:path';
import { git } from './lib.mjs';

/**
 * Lower-cases and drops commas, whitespace and currency symbols (also the Q / US$ prefix of an amount) so "Q 1,234,567.89" and "1234567.89" compare equal.
 * @param {string} text
 * @returns {string}
 */
export function normalize(text) {
  return text
    .toLowerCase()
    .replace(/(?<![a-z0-9])(?:us\s*\$|q)\s*(?=\d)/g, '') // "Q 12", "US$ 12" -> "12"; plain words ending in q are untouched
    .replace(/[,\s$€£¥]/g, '');
}

/**
 * Parses the list file: one term per line, blank lines and `#` comments ignored, terms normalized.
 * @param {string} content
 * @returns {string[]}
 */
export function parseTerms(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map(normalize)
    .filter((term) => term !== '');
}

/**
 * Extracts the added lines of a `git diff -U0` as { file, line } pairs plus their text.
 * @param {string} diff
 * @returns {{ file: string, line: number, text: string }[]}
 */
export function addedLines(diff) {
  /** @type {{ file: string, line: number, text: string }[]} */
  const added = [];
  let file = '';
  let line = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      file = raw.startsWith('+++ b/') ? raw.slice(6) : '';
    } else if (raw.startsWith('@@')) {
      const match = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
      line = match ? Number(match[1]) : 0;
    } else if (raw.startsWith('+') && file !== '') {
      added.push({ file, line, text: raw.slice(1) });
      line += 1;
    }
  }
  return added;
}

/**
 * Returns the `file:line` locations whose text contains any term. Terms are never part of the result.
 * @param {string} diff
 * @param {string[]} terms already normalized
 * @returns {string[]}
 */
export function findHits(diff, terms) {
  const hits = new Set();
  for (const { file, line, text } of addedLines(diff)) {
    const normalized = normalize(text);
    if (terms.some((term) => normalized.includes(term))) hits.add(`${file}:${line}`);
  }
  return [...hits];
}

/**
 * Resolves the list path. `inRepo` is true when it resolves inside the repository, which is refused.
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ status: 'absent' } | { status: 'inRepo' } | { status: 'ok', path: string }}
 */
export function resolveList(cwd, env) {
  const configured = env['CUOTASCASA_DENYLIST'];
  const candidate =
    configured !== undefined && configured !== ''
      ? configured
      : join(env['HOME'] ?? homedir(), '.config', 'cuotascasa', 'denylist.txt');
  if (!existsSync(candidate)) return { status: 'absent' };
  const real = realpathSync(candidate);
  const root = realpathSync(git(['rev-parse', '--show-toplevel'], cwd).trim());
  const rel = relative(root, real);
  if (rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel))) return { status: 'inRepo' };
  return { status: 'ok', path: real };
}

/**
 * Runs the hook. Returns the process exit code and the lines to print.
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ code: number, out: string[] }}
 */
export function run(cwd, env) {
  const list = resolveList(cwd, env);
  if (list.status === 'absent') {
    return { code: 0, out: ['hygiene:denylist: no denylist found (set CUOTASCASA_DENYLIST); nothing checked.'] };
  }
  if (list.status === 'inRepo') {
    return {
      code: 1,
      out: ['hygiene:denylist: the denylist resolves inside the repository; keep it outside (ADR-0015 §6).'],
    };
  }
  const terms = parseTerms(readFileSync(list.path, 'utf8'));
  const diff = git(['diff', '--cached', '-U0', '--no-color', '--no-ext-diff', '--diff-filter=ACMR'], cwd);
  const hits = findHits(diff, terms);
  if (hits.length === 0) return { code: 0, out: [] };
  return {
    code: 1,
    out: [
      'hygiene:denylist: staged lines match the local denylist (contents not shown):',
      ...hits.map((hit) => `  ${hit}`),
    ],
  };
}

if (import.meta.main) {
  const { code, out } = run(process.cwd(), process.env);
  for (const line of out) console.error(line);
  process.exit(code);
}
