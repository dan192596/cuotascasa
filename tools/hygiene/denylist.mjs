// @ts-check
// pre-commit hook: refuses added staged lines that contain a term of the developer's private denylist (ADR-0015 §6).
// The list lives outside the repo ($CUOTASCASA_DENYLIST or ~/.config/cuotascasa/denylist.txt). Output is limited to
// file paths and line numbers: neither the list nor the matching text is ever printed.
//
// Comparación por palabra y número completos (enmienda de ADR-0015 §6, decisión del dueño, 2026-10-09):
// - Texto y términos se normalizan igual: Unicode NFC y minúsculas; se quita el prefijo de moneda `Q` / `US$` (sin
//   importar mayúsculas) cuando va justo antes de un número, con o sin espacio; y se quitan los separadores de miles
//   dentro de un número (coma, espacio o NBSP entre grupos de tres dígitos). El punto decimal se conserva.
// - Se tokeniza en palabras y números: letras Unicode (con tildes), dígitos y un punto decimal interno entre dígitos
//   (`1234.50`). Todo lo demás separa (guiones, guiones bajos, comas sueltas, símbolos).
// - Los números decimales se comparan en forma canónica: sin ceros finales en la parte decimal ni punto final, así que
//   `1234.5`, `1234.50` y `Q 1,234.50` coinciden, pero `91234.5`, `1234.51` y `12345` no. Los ceros a la izquierda se
//   conservan tal como se escriben (`007` ≠ `7`).
// - Un término coincide cuando su secuencia de tokens aparece como una racha contigua de tokens completos de la línea:
//   un nombre de dos palabras solo coincide con esas dos palabras seguidas, y una palabra corta nunca dentro de otra.
//
// Count mode for tooling: `--count-file <path>` or `--count-stdin` prints only the number of lines with at least one
// hit. List problems (absent, broken symlink, inside the repo, unreadable) exit 1 without a number.
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, isAbsolute, sep } from 'node:path';
import { git } from './lib.mjs';

/**
 * NFC + lower case; drops the Q / US$ prefix of an amount and the thousands separators inside numbers.
 * "Q 1,234,567.89", "1 234 567.89" and "1234567.89" all become "1234567.89".
 * @param {string} text
 * @returns {string}
 */
export function normalize(text) {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/(?<![\p{L}\p{M}\p{N}])(?:us\s*\$|q)\s*(?=\d)/gu, '') // "Q 12", "US$12" -> "12"; words ending in q stay
    .replace(/(?<=\d)[,\s\u00a0](?=\d{3}(?:\D|$))/gu, ''); // "1,234" / "1 234" -> "1234"
}

/**
 * Canonical form of a decimal number token: no trailing fractional zeros nor trailing point ("1234.50" -> "1234.5").
 * @param {string} token
 * @returns {string}
 */
function canonical(token) {
  return /^\d+\.\d+$/.test(token) ? token.replace(/0+$/, '').replace(/\.$/, '') : token;
}

/**
 * Splits text (normalized here) into whole words and numbers, numbers in canonical form.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  const matches = normalize(text).match(/[\p{L}\p{M}\p{N}]+(?:(?<=\d)\.(?=\d)[\p{L}\p{M}\p{N}]+)*/gu) ?? [];
  return matches.map(canonical);
}

/**
 * Parses the list file: one term per line, blank lines and `#` comments ignored, each term as its token sequence.
 * @param {string} content
 * @returns {string[][]}
 */
export function parseTerms(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map(tokenize)
    .filter((term) => term.length > 0);
}

/**
 * True when some term appears as a contiguous run of whole tokens of `text`.
 * @param {string} text
 * @param {string[][]} terms
 * @returns {boolean}
 */
function lineHits(text, terms) {
  const tokens = tokenize(text);
  return terms.some((term) => {
    for (let start = 0; start + term.length <= tokens.length; start += 1) {
      if (term.every((token, offset) => tokens[start + offset] === token)) return true;
    }
    return false;
  });
}

/**
 * Number of lines of `text` with at least one hit.
 * @param {string} text
 * @param {string[][]} terms from parseTerms
 * @returns {number}
 */
export function countHitLines(text, terms) {
  if (text === '') return 0;
  return text.split(/\r?\n/).filter((line) => lineHits(line, terms)).length;
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
 * Returns the `file:line` locations of added lines with a hit. Terms are never part of the result.
 * @param {string} diff
 * @param {string[][]} terms from parseTerms
 * @returns {string[]}
 */
export function findHits(diff, terms) {
  const hits = new Set();
  for (const { file, line, text } of addedLines(diff)) {
    if (lineHits(text, terms)) hits.add(`${file}:${line}`);
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
 * Resolves and reads the list, or returns the fixed failure for a list problem. `absentCode` is 0 for the hook (an
 * absent list passes with a notice) and 1 for count mode (a count without a list would be meaningless).
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} env
 * @param {number} absentCode
 * @returns {{ terms: string[][] } | { code: number, out: string[] }}
 */
function loadTerms(cwd, env, absentCode) {
  const list = resolveList(cwd, env);
  if (list.status === 'absent') {
    return {
      code: absentCode,
      out: ['hygiene:denylist: no denylist found (set CUOTASCASA_DENYLIST); nothing checked.'],
    };
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
  return { terms: parseTerms(readFileSync(list.path, 'utf8')) };
}

/**
 * Runs the hook. Returns the process exit code and the lines to print.
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ code: number, out: string[] }}
 */
export function run(cwd, env) {
  try {
    const loaded = loadTerms(cwd, env, 0);
    if (!('terms' in loaded)) return loaded;
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
    const hits = findHits(diff, loaded.terms);
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

/**
 * Count mode: number of lines of the input with at least one hit. `stdout` carries only that integer.
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} env
 * @param {() => string} readInput
 * @returns {{ code: number, out: string[], stdout?: string }}
 */
export function runCount(cwd, env, readInput) {
  try {
    const loaded = loadTerms(cwd, env, 1);
    if (!('terms' in loaded)) return loaded;
    return { code: 0, out: [], stdout: String(countHitLines(readInput(), loaded.terms)) };
  } catch {
    // Fixed message on purpose: no path, stack or contents may leak.
    return { code: 1, out: ['hygiene:denylist: could not read the denylist or the input'] };
  }
}

/**
 * @param {string[]} args
 * @returns {{ code: number, out: string[], stdout?: string }}
 */
function main(args) {
  if (args.length === 0) return run(process.cwd(), process.env);
  if (args.length === 1 && args[0] === '--count-stdin') {
    return runCount(process.cwd(), process.env, () => readFileSync(0, 'utf8'));
  }
  const path = args[1];
  if (args.length === 2 && args[0] === '--count-file' && path !== undefined) {
    return runCount(process.cwd(), process.env, () => readFileSync(path, 'utf8'));
  }
  return { code: 1, out: ['hygiene:denylist: usage: denylist.mjs [--count-file <path> | --count-stdin]'] };
}

if (import.meta.main) {
  const { code, out, stdout } = main(process.argv.slice(2));
  for (const line of out) console.error(line);
  if (stdout !== undefined) console.log(stdout);
  process.exitCode = code; // not process.exit(): let piped stdout/stderr drain
}
