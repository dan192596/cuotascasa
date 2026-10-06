import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXPECTED_ROW_COLUMNS } from '@cuotascasa/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../paths.ts';
import { syntheticLoan, toExpectedCsv } from './testing/synthetic-loan.ts';

const CLI = join(REPO_ROOT, 'tools/conformance/src/private-compare/cli.ts');
const scratchDirs: string[] = [];

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function privateFiles(csvHeader?: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'private-compare-cli-'));
  scratchDirs.push(dir);
  const loan = syntheticLoan(5);
  writeFileSync(join(dir, 'a-terms.json'), JSON.stringify(loan.inputs));
  writeFileSync(join(dir, 'a-expected.csv'), toExpectedCsv(loan.rows, csvHeader));
  return ['--terms', join(dir, 'a-terms.json'), '--expected', join(dir, 'a-expected.csv')];
}

function cli(args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
}

describe('private-compare CLI (node tools/conformance/src/private-compare/cli.ts)', () => {
  it('prints error: usage and exits 2 without arguments', () => {
    const result = cli([]);
    expect([result.status, result.stdout, result.stderr]).toEqual([2, '', 'error: usage\n']);
  });

  it('reads the private schema and rejects a different header', () => {
    const result = cli(privateFiles([...EXPECTED_ROW_COLUMNS].reverse().join(',')));
    expect([result.status, result.stdout, result.stderr]).toEqual([2, '', 'error: csv-header\n']);
  });

  it('runs the public engine through Node type stripping: three labeled lines, or error: engine while it is a stub', () => {
    const result = cli(privateFiles());
    if (result.status === 2) {
      expect([result.stdout, result.stderr]).toEqual(['', 'error: engine\n']);
    } else {
      expect(result.stdout).toMatch(/^allRowsMatched: (yes|no)\nmismatchedRows: \d+\nmaxAbsDiff: \d+\.\d{2}\n$/);
    }
  });
});
