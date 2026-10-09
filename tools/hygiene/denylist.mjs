// @ts-check
// pre-commit hook: refuses added staged lines that contain a term of the developer's private denylist (ADR-0015 §6).
// The list lives outside the repo ($CUOTASCASA_DENYLIST or ~/.config/cuotascasa/denylist.txt). Output is limited to
// file paths and line numbers: neither the list nor the matching text is ever printed.
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
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
 * Decodes a git C-style quoted path (`"b/caf\303\251.txt"`): octal bytes, `\t`, `\n`, `\"`, `\\` and friends.
 * @param {string} quoted including the surrounding double quotes
 * @returns {string}
 */
function unquoteCStyle(quoted) {
  const inner = quoted.slice(1, -1);
  /** @type {number[]} */
  const bytes = [];
  const simple = /** @type {Record<string, number>} */ ({
    a: 7,
    b: 8,
    f: 12,
    n: 10,
    r: 13,
    t: 9,
    v: 11,
    '"': 34,
    '\\': 92,
  });
  for (let i = 0; i < inner.length; i += 1) {
    const ch = /** @type {string} */ (inner[i]);
    if (ch !== '\\') {
      bytes.push(...Buffer.from(ch, 'utf8'));
      continue;
    }
    const octal = /^[0-7]{3}/.exec(inner.slice(i + 1, i + 4));
    const next = /** @type {string} */ (inner[i + 1]);
    if (octal) {
      bytes.push(parseInt(octal[0], 8));
      i += 3;
    } else if (next !== undefined && simple[next] !== undefined) {
      bytes.push(/** @type {number} */ (simple[next]));
      i += 1;
    } else {
      bytes.push(92);
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

/**
 * File name of a `+++ ` header, or '' when it is not a `b/`-prefixed path (e.g. /dev/null).
 * @param {string} rest what follows `+++ `
 * @returns {string}
 */
function headerFile(rest) {
  const path =
    rest.startsWith('"') && rest.endsWith('"') && rest.length >= 2 ? unquoteCStyle(rest) : rest.replace(/\t$/, '');
  return path.startsWith('b/') ? path.slice(2) : '';
}

/**
 * Extracts the added lines of a `git diff -U0` (generated with explicit a/ b/ prefixes) as { file, line, text }.
 * Hunk-aware: lines inside a hunk are content, never headers. Throws (fail closed) when an added line has no known file.
 * @param {string} diff
 * @returns {{ file: string, line: number, text: string }[]}
 */
export function addedLines(diff) {
  /** @type {{ file: string, line: number, text: string }[]} */
  const added = [];
  let file = '';
  let line = 0;
  let oldLeft = 0;
  let newLeft = 0;
  for (const raw of diff.split('\n')) {
    if (oldLeft > 0 || newLeft > 0) {
      const mark = raw[0];
      if (mark === '+') {
        if (file === '') throw new Error('added line without a known file');
        added.push({ file, line, text: raw.slice(1) });
        line += 1;
        newLeft -= 1;
      } else if (mark === '-') {
        oldLeft -= 1;
      } else if (mark === ' ') {
        oldLeft -= 1;
        newLeft -= 1;
        line += 1;
      } else if (mark !== '\\') {
        // Malformed hunk: stop trusting the counts and fall through to header parsing.
        oldLeft = 0;
        newLeft = 0;
      }
      if (mark === '+' || mark === '-' || mark === ' ' || mark === '\\') continue;
    }
    if (raw.startsWith('diff --git ')) {
      file = '';
    } else if (raw.startsWith('+++ ')) {
      file = headerFile(raw.slice(4));
    } else if (raw.startsWith('@@')) {
      const match = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(raw);
      if (!match) throw new Error('unparseable hunk header');
      oldLeft = match[1] === undefined ? 1 : Number(match[1]);
      line = Number(match[2]);
      newLeft = match[3] === undefined ? 1 : Number(match[3]);
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
 * @returns {{ status: 'absent' } | { status: 'broken' } | { status: 'inRepo' } | { status: 'ok', path: string }}
 */
export function resolveList(cwd, env) {
  const configured = env['CUOTASCASA_DENYLIST'];
  const candidate =
    configured !== undefined && configured !== ''
      ? configured
      : join(env['HOME'] ?? homedir(), '.config', 'cuotascasa', 'denylist.txt');
  if (!existsSync(candidate)) {
    // A symlink whose target is missing is not "absent": fail closed.
    try {
      lstatSync(candidate);
      return { status: 'broken' };
    } catch {
      return { status: 'absent' };
    }
  }
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
  try {
    const list = resolveList(cwd, env);
    if (list.status === 'absent') {
      return { code: 0, out: ['hygiene:denylist: no denylist found (set CUOTASCASA_DENYLIST); nothing checked.'] };
    }
    if (list.status === 'broken') {
      return { code: 1, out: ['hygiene:denylist: the denylist is a broken symlink; fix or remove it.'] };
    }
    if (list.status === 'inRepo') {
      return {
        code: 1,
        out: ['hygiene:denylist: the denylist resolves inside the repository; keep it outside (ADR-0015 §6).'],
      };
    }
    const terms = parseTerms(readFileSync(list.path, 'utf8'));
    const diff = git(
      [
        '-c',
        'core.quotepath=false',
        '-c',
        'diff.noprefix=false',
        '-c',
        'diff.mnemonicPrefix=false',
        '-c',
        'diff.relative=false',
        'diff',
        '--cached',
        '-U0',
        '--no-color',
        '--no-ext-diff',
        '--diff-filter=ACMR',
        '--src-prefix=a/',
        '--dst-prefix=b/',
      ],
      cwd,
    );
    const hits = findHits(diff, terms);
    if (hits.length === 0) return { code: 0, out: [] };
    return {
      code: 1,
      out: [
        'hygiene:denylist: staged lines match the local denylist (contents not shown):',
        ...hits.map((hit) => `  ${hit}`),
      ],
    };
  } catch {
    // Fixed message on purpose: no path, stack or contents may leak.
    return { code: 1, out: ['hygiene:denylist: could not read the denylist or the staged diff'] };
  }
}

if (import.meta.main) {
  const { code, out } = run(process.cwd(), process.env);
  for (const line of out) console.error(line);
  process.exit(code);
}
