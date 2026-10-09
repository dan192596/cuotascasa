import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidInputError } from '@cuotascasa/domain';
import { EXPECTED_ROW_COLUMNS, type ExpectedRow } from '@cuotascasa/schema';
import { afterEach, describe, expect, it } from 'vitest';
import type { ComputedFixtureResult, FixtureEngine } from '../engine-adapter.ts';
import { REPO_ROOT } from '../paths.ts';
import { compareRows } from './compare-rows.ts';
import { formatLogLine, formatResultLines } from './output.ts';
import { PrivateCompareError, parseExpectedCsv } from './private-csv.ts';
import { runPrivateCompare, type PrivateCompareDeps } from './run.ts';
import { syntheticLoan, toExpectedCsv } from './testing/synthetic-loan.ts';

const DISTINCTIVE_ROW_COUNT = 137;
const THREE_LINES = /^allRowsMatched: (yes|no)\nmismatchedRows: \d+\nmaxAbsDiff: \d+\.\d{2}\n$/;
const LOG_LINE =
  /^\d{4}-\d{2}-\d{2} · motor [0-9a-f]{7,40} · préstamo [a-z]{1,8} · todas las filas coinciden: (sí|no)\n$/;

const scratchDirs: string[] = [];

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Writes a-terms.json and a-expected.csv to a scratch directory outside the repo. */
function privateFiles(termsText: string, csvText: string): { terms: string; expected: string } {
  const dir = mkdtempSync(join(tmpdir(), 'private-compare-'));
  scratchDirs.push(dir);
  writeFileSync(join(dir, 'a-terms.json'), termsText);
  writeFileSync(join(dir, 'a-expected.csv'), csvText);
  return { terms: join(dir, 'a-terms.json'), expected: join(dir, 'a-expected.csv') };
}

function engineFrom(rows: readonly ExpectedRow[]): FixtureEngine {
  return (): ComputedFixtureResult => ({
    rows,
    anchors: [],
    payments: [],
    summary: {
      installments: rows.length,
      endDate: rows.at(-1)?.dueDate ?? '2025-02-28',
      totalInterest: '0.00',
      totalInsurance: '0.00',
      totalCapital: '0.00',
      totalFixedCharges: '0.00',
      totalPrepayments: '0.00',
      totalCommissions: '0.00',
      totalPaid: '0.00',
    },
  });
}

function deps(engine: FixtureEngine): PrivateCompareDeps {
  return {
    readFile: (path) => readFileSync(path, 'utf8'),
    realPath: (path) => realpathSync.native(path),
    exists: (path) => existsSync(path),
    engine,
    today: () => '2026-10-04',
    repoRoot: REPO_ROOT,
  };
}

/** The synthetic loan with two engine rows off by one cent in one field each. */
function scenario() {
  const loan = syntheticLoan(DISTINCTIVE_ROW_COUNT);
  const computed = loan.rows.map((row) =>
    row.k === 10 ? { ...row, interest: '0.01' } : row.k === 120 ? { ...row, closing: '3399.99' } : row,
  );
  const files = privateFiles(JSON.stringify(loan.inputs), toExpectedCsv(loan.rows));
  return { loan, computed, files };
}

describe('private schema (tools/oracle/FORMAT.md §9)', () => {
  const { rows } = syntheticLoan(3);

  it('reads the exact header, one row per installment, \\r\\n line ends and insuranceComponents joined by ;', () => {
    const withComponents = rows.map((row) => ({
      ...row,
      insurance: '525.00',
      insuranceComponents: ['416.67', '108.33'],
    }));
    expect(parseExpectedCsv(toExpectedCsv(withComponents).replaceAll('\n', '\r\n'))).toEqual(withComponents);
  });

  it('rejects a different header: reordered, missing or extra columns, or a BOM', () => {
    const reordered = [...EXPECTED_ROW_COLUMNS].reverse().join(',');
    const missing = EXPECTED_ROW_COLUMNS.slice(0, -1).join(',');
    const extra = `${EXPECTED_ROW_COLUMNS.join(',')},balance`;
    for (const text of [
      toExpectedCsv(rows, reordered),
      toExpectedCsv(rows, missing),
      toExpectedCsv(rows, extra),
      `${String.fromCharCode(0xfeff)}${toExpectedCsv(rows)}`,
    ]) {
      expect(() => parseExpectedCsv(text)).toThrow(new PrivateCompareError('csv-header'));
    }
  });

  it('rejects malformed rows', () => {
    const csv = toExpectedCsv(rows);
    for (const text of [
      csv.replace('200.00,0.00', '200.000,0.00'),
      csv.replace('600.00', '"600.00"'),
      csv.replace('\n2,', '\n3,'),
      csv.replace(',false\n', ',no\n'),
      csv.replace('\n2,', '\n\n2,'),
      `${csv.split('\n')[0] ?? ''}\n`,
    ]) {
      expect(() => parseExpectedCsv(text), text.slice(0, 160)).toThrow(new PrivateCompareError('csv-row'));
    }
  });
});

describe('compareRows (tools/oracle/FORMAT.md §8.3)', () => {
  const { rows } = syntheticLoan(4);

  it('counts mismatched positions and the max absolute money difference', () => {
    expect(compareRows(rows, rows)).toEqual({ mismatchedRows: 0, maxAbsDiffCents: 0n });
    const changed = rows.map((row) => (row.k === 2 ? { ...row, capital: '199.98', total: '199.97' } : row));
    expect(compareRows(rows, changed)).toEqual({ mismatchedRows: 1, maxAbsDiffCents: 3n });
  });

  it('counts a missing row and a non-money difference, but takes the max diff only from rows on both sides', () => {
    const shorter = rows.slice(0, 3).map((row) => (row.k === 1 ? { ...row, paid: true } : row));
    expect(compareRows(rows, shorter)).toEqual({ mismatchedRows: 2, maxAbsDiffCents: 0n });
  });
});

describe('output', () => {
  it('prints exactly three labeled lines', () => {
    expect(formatResultLines({ mismatchedRows: 0, maxAbsDiffCents: 0n })).toBe(
      'allRowsMatched: yes\nmismatchedRows: 0\nmaxAbsDiff: 0.00\n',
    );
    expect(formatResultLines({ mismatchedRows: 2, maxAbsDiffCents: 1234n })).toBe(
      'allRowsMatched: no\nmismatchedRows: 2\nmaxAbsDiff: 12.34\n',
    );
  });

  it('prints the validation-log line of tools/oracle/FORMAT.md §8.4 with motor <sha>: only sí or no', () => {
    const line = (result: { mismatchedRows: number; maxAbsDiffCents: bigint }) =>
      formatLogLine({ date: '2026-10-04', sha: '0123abc', label: 'a', result });
    expect(line({ mismatchedRows: 0, maxAbsDiffCents: 0n })).toBe(
      '2026-10-04 · motor 0123abc · préstamo a · todas las filas coinciden: sí\n',
    );
    expect(line({ mismatchedRows: 2, maxAbsDiffCents: 1234n })).toBe(
      '2026-10-04 · motor 0123abc · préstamo a · todas las filas coinciden: no\n',
    );
  });
});

describe('runPrivateCompare', () => {
  it('normal output is exactly three labeled lines and maxAbsDiff is the only decimal', () => {
    const { computed, files } = scenario();
    const run = runPrivateCompare(['--terms', files.terms, '--expected', files.expected], deps(engineFrom(computed)));
    expect(run).toEqual({
      exitCode: 1,
      stdout: 'allRowsMatched: no\nmismatchedRows: 2\nmaxAbsDiff: 0.01\n',
      stderr: '',
    });
    expect(run.stdout).toMatch(THREE_LINES);
    expect(run.stdout.match(/\d+\.\d{2}/g)).toEqual(['0.01']);
    expect(run.stdout.split('\n').filter((line) => /\d+\.\d{2}/.test(line))).toEqual(['maxAbsDiff: 0.01']);
  });

  it('never prints the total row count, whether the rows match or not', () => {
    const { loan, computed, files } = scenario();
    for (const rows of [loan.rows, computed]) {
      const run = runPrivateCompare(['--terms', files.terms, '--expected', files.expected], deps(engineFrom(rows)));
      expect(run.stdout).toMatch(THREE_LINES);
      expect(run.stdout).not.toContain(String(DISTINCTIVE_ROW_COUNT));
    }
    const matched = runPrivateCompare(
      ['--terms', files.terms, '--expected', files.expected],
      deps(engineFrom(loan.rows)),
    );
    expect(matched).toEqual({
      exitCode: 0,
      stdout: 'allRowsMatched: yes\nmismatchedRows: 0\nmaxAbsDiff: 0.00\n',
      stderr: '',
    });
  });

  it('--log-line prints only the log line, without the row count, the mismatch count, the max diff or any loan term', () => {
    const { loan, computed, files } = scenario();
    const args = [
      '--terms',
      files.terms,
      '--expected',
      files.expected,
      '--log-line',
      '--sha',
      '0123abc',
      '--label',
      'a',
    ];
    const run = runPrivateCompare(args, deps(engineFrom(computed)));
    expect(run).toEqual({
      exitCode: 1,
      stdout: '2026-10-04 · motor 0123abc · préstamo a · todas las filas coinciden: no\n',
      stderr: '',
    });
    expect(run.stdout).toMatch(LOG_LINE);
    const terms = loan.inputs.terms;
    for (const forbidden of [
      String(DISTINCTIVE_ROW_COUNT),
      terms.principal,
      terms.interestRate,
      terms.disbursementDate,
      terms.firstDueDate,
      loan.rows.at(-1)?.dueDate ?? '',
      '200.00',
      '0.01',
      'filas con diferencia',
      'dif. máx.',
    ]) {
      expect(run.stdout).not.toContain(forbidden);
    }
  });

  it('--log-line requires --sha and --label with their formats', () => {
    const { computed, files } = scenario();
    const base = ['--terms', files.terms, '--expected', files.expected];
    for (const extra of [
      ['--log-line'],
      ['--log-line', '--sha', '0123abc'],
      ['--log-line', '--label', 'a'],
      ['--log-line', '--sha', '0123ABC', '--label', 'a'],
      ['--log-line', '--sha', '0123ab', '--label', 'a'],
      ['--log-line', '--sha', '0123abc', '--label', 'a1'],
      ['--sha', '0123abc', '--label', 'a'],
    ]) {
      expect(runPrivateCompare([...base, ...extra], deps(engineFrom(computed))), extra.join(' ')).toEqual({
        exitCode: 2,
        stdout: '',
        stderr: 'error: usage\n',
      });
    }
  });

  it('rejects a different header before running the engine', () => {
    const loan = syntheticLoan(3);
    const reordered = [...EXPECTED_ROW_COLUMNS].reverse().join(',');
    const files = privateFiles(JSON.stringify(loan.inputs), toExpectedCsv(loan.rows, reordered));
    let engineCalls = 0;
    const engine: FixtureEngine = (inputs) => {
      engineCalls += 1;
      return engineFrom(loan.rows)(inputs);
    };
    expect(runPrivateCompare(['--terms', files.terms, '--expected', files.expected], deps(engine))).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: 'error: csv-header\n',
    });
    expect(engineCalls).toBe(0);
  });

  it('maps every other failure to one error line without values', () => {
    const loan = syntheticLoan(3);
    const csv = toExpectedCsv(loan.rows);
    const good = privateFiles(JSON.stringify(loan.inputs), csv);
    const badTerms = privateFiles(
      JSON.stringify({ ...loan.inputs, terms: { ...loan.inputs.terms, termMonths: 0 } }),
      csv,
    );
    const throwing: FixtureEngine = () => {
      throw new RangeError('scratch engine failure 600.00');
    };
    const insideRepo = join(REPO_ROOT, 'package.json');
    const cases: [string[], FixtureEngine, string][] = [
      [[], engineFrom(loan.rows), 'error: usage\n'],
      [['--terms', good.terms], engineFrom(loan.rows), 'error: usage\n'],
      [
        ['--terms', good.terms, '--expected', join(tmpdir(), 'missing-a-expected.csv')],
        engineFrom(loan.rows),
        'error: usage\n',
      ],
      [['--terms', insideRepo, '--expected', good.expected], engineFrom(loan.rows), 'error: usage\n'],
      [['--terms', badTerms.terms, '--expected', badTerms.expected], engineFrom(loan.rows), 'error: terms-invalid\n'],
      [['--terms', good.terms, '--expected', good.expected], throwing, 'error: engine\n'],
    ];
    for (const [args, engine, stderr] of cases) {
      expect(runPrivateCompare(args, deps(engine)), args.join(' ')).toEqual({ exitCode: 2, stdout: '', stderr });
    }
  });

  it('refuses private files inside a checkout: a ..-prefixed directory, another letter case, a sibling checkout or a symlink', () => {
    const loan = syntheticLoan(3);
    const outside = privateFiles(JSON.stringify(loan.inputs), toExpectedCsv(loan.rows));
    const base = mkdtempSync(join(tmpdir(), 'private-compare-checkouts-'));
    scratchDirs.push(base);
    const root = join(base, 'Checkout'); // the repository root of this run (repoRoot below)
    const sibling = join(base, 'sibling'); // another checkout, like the main checkout seen from a worktree
    mkdirSync(join(root, '..notes'), { recursive: true });
    mkdirSync(join(root, 'notes'));
    mkdirSync(join(sibling, '.git'), { recursive: true });
    for (const dir of [join(root, '..notes'), join(root, 'notes'), sibling]) {
      writeFileSync(join(dir, 'a-terms.json'), JSON.stringify(loan.inputs));
    }
    symlinkSync(outside.terms, join(sibling, 'linked-a-terms.json'));
    const run = (terms: string) =>
      runPrivateCompare(['--terms', terms, '--expected', outside.expected], {
        ...deps(engineFrom(loan.rows)),
        repoRoot: root,
      });
    for (const terms of [
      join(root, '..notes', 'a-terms.json'),
      join(base, 'checkout', 'notes', 'a-terms.json'), // the same file on a case-insensitive file system (macOS)
      join(sibling, 'a-terms.json'),
      join(sibling, 'linked-a-terms.json'),
    ]) {
      expect(run(terms), terms).toEqual({ exitCode: 2, stdout: '', stderr: 'error: usage\n' });
    }
    expect(run(outside.terms).exitCode).toBe(0);
  });

  it("reports the engine's [ALG.DATES] InvalidInputError as terms-invalid, like the oracle's compare", () => {
    const loan = syntheticLoan(3);
    const files = privateFiles(JSON.stringify(loan.inputs), toExpectedCsv(loan.rows));
    const args = ['--terms', files.terms, '--expected', files.expected];
    const datesError: FixtureEngine = () => {
      throw new InvalidInputError('FIRST_DUE_DATE_MISMATCH', 'firstDueDate does not match the paymentDay rule');
    };
    const otherError: FixtureEngine = () => {
      throw new InvalidInputError('INSTALLMENT_OUT_OF_RANGE', 'Installment numbers start at 1');
    };
    expect(runPrivateCompare(args, deps(datesError))).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: 'error: terms-invalid\n',
    });
    expect(runPrivateCompare(args, deps(otherError))).toEqual({ exitCode: 2, stdout: '', stderr: 'error: engine\n' });
  });
});
