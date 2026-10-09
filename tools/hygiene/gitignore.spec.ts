// Regression test for the defensive .gitignore (ADR-0015 §3). Paths need not exist: check-ignore matches patterns.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every pattern of the .gitignore committed before W0-01; none may be removed. */
const BASELINE_PATTERNS = [
  '*.pdf',
  '*.xls',
  '*.xlsx',
  '*.xlsm',
  '*.numbers',
  '*.ods',
  '*.csv',
  '*.tsv',
  '*.doc',
  '*.docx',
  '*.eml',
  '*.msg',
  '*.mbox',
  '*.heic',
  'Captura de pantalla *',
  'Screenshot *',
  'Screenshot_*',
  '!tools/oracle/fixtures/**/*.csv',
  '!e2e/fixtures/**/*.csv',
  'cuotascasa*respaldo*.json',
  'cuotascasa*backup*.json',
  '*.enc.json',
  '.cuotascasa-private/',
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '.claude/settings.local.json',
  '.worktrees/',
  '.DS_Store',
  'node_modules/',
  'dist/',
  'coverage/',
  'playwright-report/',
  'test-results/',
  '.angular/',
];

const MUST_IGNORE = [
  // W0-01 acceptance criterion
  'report.pdf',
  'tabla.xlsx',
  'cuotascasa-respaldo-2026-01-01.json',
  'x.enc.json',
  '.env.local',
  '.worktrees/W1-01',
  '.worktrees/W0-01',
  'correo.eml',
  'x.msg',
  'x.mbox',
  'hoja.numbers',
  'hoja.ods',
  'hoja.xlsm',
  'x.tsv',
  'x.doc',
  'contrato.docx',
  'foto.heic',
  'Captura de pantalla 2026-01-01 a las 10.00.00.png',
  'Screenshot 2026-01-01 at 10.00.00.png',
  'Screenshot_20260101-100000.png',
  '.cuotascasa-private/x',
  'k.pem',
  'k.key',
  'k.p12',
  'k.pfx',
  'packages/x/fixtures/a.csv',
  // Extensions added by W0-01
  'contrato.odt',
  'carta.rtf',
  'contrato.pages',
  'estado.ofx',
  'estado.qfx',
  'estado.qif',
  'banca.har',
  '.dev.vars',
  '.dev.vars.production',
  '.wrangler/state/x',
  'lefthook-local.yml',
  '.eslintcache',
  'tsconfig.tsbuildinfo',
  'pnpm-debug.log',
  'tools/oracle/.venv/bin/python',
  'tools/oracle/cuotascasa_oracle/__pycache__/x.cpython-313.pyc',
  'tools/oracle/.pytest_cache/v/x',
  'tools/oracle/.ruff_cache/x',
  'blob-report/x.zip',
  // Added by the W0-01 final review: local agent state and downloaded OAuth client secrets
  '.superpowers/sdd/x.md',
  'client_secret_000000000000-synthetic.apps.googleusercontent.com.json',
  // Added by W1-10: probes the previous lists lacked
  'x.xls',
  'cuotascasa-backup-2026-01-01.json',
  '.claude/settings.local.json',
  '.env',
  'tools/oracle/x.pyc',
];

const MUST_KEEP = [
  'tools/oracle/fixtures/x.csv',
  'e2e/fixtures/x.csv',
  'docs/screenshots/x.png',
  'packages/schema/fixtures/backup/v1/backup-v1-basico.json',
];

function ignoredAmong(paths: string[]): Set<string> {
  // The verdict is computed in a throwaway repo holding only a copy of the root .gitignore: nested .gitignore files
  // (or a negation living elsewhere) cannot mask a pattern deleted from the root file.
  const scratch = mkdtempSync(join(tmpdir(), 'gitignore-probe-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: scratch });
    copyFileSync('.gitignore', join(scratch, '.gitignore'));
    // `-c core.excludesFile=/dev/null` keeps the developer's global ignore file out of the verdict, so a global
    // `*.log` or `.venv/` cannot make a dropped repo pattern look covered.
    const result = spawnSync(
      'git',
      ['-c', 'core.excludesFile=/dev/null', 'check-ignore', '--no-index', '--stdin', '-z'],
      { cwd: scratch, input: paths.join('\0'), encoding: 'utf8' },
    );
    if (result.status !== 0 && result.status !== 1) throw new Error(`git check-ignore failed: ${result.stderr}`);
    return new Set(result.stdout.split('\0').filter((path) => path !== ''));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

describe('.gitignore', () => {
  it('keeps every pattern committed before W0-01', () => {
    const lines = new Set(readFileSync('.gitignore', 'utf8').split(/\r?\n/));
    expect(BASELINE_PATTERNS.filter((pattern) => !lines.has(pattern))).toEqual([]);
  });

  it('ignores real-data formats, secrets and local tooling', () => {
    const ignored = ignoredAmong(MUST_IGNORE);
    expect(MUST_IGNORE.filter((path) => !ignored.has(path))).toEqual([]);
  });

  it('does not ignore fixture CSVs, docs screenshots or backup fixtures', () => {
    expect([...ignoredAmong(MUST_KEEP)]).toEqual([]);
  });
});
