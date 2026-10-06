import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { InvalidInputError } from '@cuotascasa/domain';
import { fixtureInputsSchema, type ExpectedRow, type FixtureInputs } from '@cuotascasa/schema';
import type { FixtureEngine } from '../engine-adapter.ts';
import { compareRows } from './compare-rows.ts';
import { formatLogLine, formatResultLines } from './output.ts';
import { PrivateCompareError, parseExpectedCsv } from './private-csv.ts';

export interface PrivateCompareDeps {
  /** Reads a UTF-8 file; throws when it cannot. */
  readonly readFile: (path: string) => string;
  /**
   * Canonical absolute path: symlinks resolved and on-disk letter case (`realpathSync.native`); throws when the path
   * does not exist.
   */
  readonly realPath: (path: string) => string;
  /** True when the path exists (file or directory). */
  readonly exists: (path: string) => boolean;
  readonly engine: FixtureEngine;
  /** Local date of the run, 'YYYY-MM-DD'. */
  readonly today: () => string;
  readonly repoRoot: string;
}

export interface PrivateCompareRun {
  readonly exitCode: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
}

interface PrivateCompareArgs {
  readonly terms: string;
  readonly expected: string;
  readonly logLine: { readonly sha: string; readonly label: string } | null;
}

const SHA = /^[0-9a-f]{7,40}$/;
const LABEL = /^[a-z]{1,8}$/;

/** `--terms <path> --expected <path> [--log-line --sha <sha> --label <label>]`; anything else is a usage error. */
export function parseArgs(argv: readonly string[]): PrivateCompareArgs {
  const values = new Map<string, string>();
  let logLine = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--log-line' && !logLine) {
      logLine = true;
      continue;
    }
    const value = argv[index + 1];
    const known = arg === '--terms' || arg === '--expected' || arg === '--sha' || arg === '--label';
    if (!known || values.has(arg) || value === undefined || value.startsWith('--')) {
      throw new PrivateCompareError('usage');
    }
    values.set(arg, value);
    index += 1;
  }
  const terms = values.get('--terms');
  const expected = values.get('--expected');
  const sha = values.get('--sha');
  const label = values.get('--label');
  if (terms === undefined || expected === undefined) throw new PrivateCompareError('usage');
  if (!logLine) {
    if (sha !== undefined || label !== undefined) throw new PrivateCompareError('usage');
    return { terms, expected, logLine: null };
  }
  if (sha === undefined || label === undefined || !SHA.test(sha) || !LABEL.test(label)) {
    throw new PrivateCompareError('usage');
  }
  return { terms, expected, logLine: { sha, label } };
}

/** True when `path` is `root` or lies below it ('..notes/x' is below root; only '..' or '../x' is above). */
function isWithin(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return !(fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot));
}

/** True when a directory above `path` holds a `.git` entry: the file sits in a git checkout (main or worktree). */
function insideCheckout(path: string, exists: (path: string) => boolean): boolean {
  let dir = dirname(path);
  while (!exists(join(dir, '.git'))) {
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
  return true;
}

/**
 * Reads a private file; it must exist outside the repository and outside every other git checkout
 * (docs/plan/README.md §6).
 */
function readPrivateFile(path: string, deps: PrivateCompareDeps): string {
  try {
    const given = resolve(path);
    const real = deps.realPath(given);
    const inside =
      isWithin(deps.realPath(deps.repoRoot), real) ||
      insideCheckout(given, deps.exists) ||
      insideCheckout(real, deps.exists);
    if (inside) {
      throw new PrivateCompareError('usage');
    }
    return deps.readFile(real);
  } catch {
    throw new PrivateCompareError('usage');
  }
}

function parseTerms(text: string): FixtureInputs {
  try {
    const parsed = fixtureInputsSchema.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
  } catch {
    // invalid JSON: same code as a schema failure
  }
  throw new PrivateCompareError('terms-invalid');
}

function computeRows(engine: FixtureEngine, inputs: FixtureInputs): readonly ExpectedRow[] {
  try {
    return engine(inputs).rows;
  } catch (error) {
    // [ALG.DATES]: firstDueDate breaks the paymentDay rule. The schema mirror does not check that pair, so the engine's
    // InvalidInputError is reported as terms-invalid, like the oracle's compare (FORMAT.md §3.4, §8.3; plan D25).
    const datesRule = error instanceof InvalidInputError && error.rule === 'ALG.DATES';
    throw new PrivateCompareError(datesRule ? 'terms-invalid' : 'engine');
  }
}

/**
 * private-compare: runs the public engine on a-terms.json and compares its rows with a-expected.csv.
 * Never throws and never prints the total row count, an amount or a term: stdout is the three labeled lines (or,
 * with --log-line, only the log line); an error is one `error: <code>` line on stderr with exit code 2.
 */
export function runPrivateCompare(argv: readonly string[], deps: PrivateCompareDeps): PrivateCompareRun {
  try {
    const args = parseArgs(argv);
    const inputs = parseTerms(readPrivateFile(args.terms, deps));
    const expected = parseExpectedCsv(readPrivateFile(args.expected, deps));
    const result = compareRows(expected, computeRows(deps.engine, inputs));
    const stdout =
      args.logLine === null
        ? formatResultLines(result)
        : formatLogLine({ date: deps.today(), sha: args.logLine.sha, label: args.logLine.label, result });
    return { exitCode: result.mismatchedRows === 0 ? 0 : 1, stdout, stderr: '' };
  } catch (error) {
    const code = error instanceof PrivateCompareError ? error.code : 'engine';
    return { exitCode: 2, stdout: '', stderr: `error: ${code}\n` };
  }
}
