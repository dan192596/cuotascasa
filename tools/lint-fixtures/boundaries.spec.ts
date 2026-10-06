import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { BOUNDARY_RULE, MATRIX_ROWS, NOT_LINTABLE_THIRD_PARTY, THIRD_PARTY_ROWS, type LintFixture } from './matrix.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ADR = readFileSync(join(ROOT, 'docs/adr/0010-monorepo-pnpm-reglas-de-dependencia.md'), 'utf8');

// ignore: false lints the virtual paths even if a global ignore covered them; the config is the repo's eslint.config.mjs.
const eslint = new ESLint({ cwd: ROOT, ignore: false });

interface Report {
  readonly ruleId: string | null;
  readonly line: number;
  readonly message: string;
}

async function lint(fixture: LintFixture): Promise<Report[]> {
  const results = await eslint.lintText(fixture.code, { filePath: join(ROOT, fixture.filePath) });
  return (results[0]?.messages ?? []).map(({ ruleId, line, message }) => ({ ruleId, line, message }));
}

/** First-column texts of the markdown table that follows `heading` in the ADR. */
function tableAreas(heading: string): string[] {
  const lines = ADR.slice(ADR.indexOf(heading) + heading.length).split('\n');
  const rows: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|')) rows.push(trimmed);
    else if (rows.length > 0) break;
  }
  return rows.slice(2).map((row) => (row.split('|')[1] ?? '').trim());
}

/** Labels (text before the first ': ') of the bullet list that follows `heading` in the ADR. */
function bulletLabels(heading: string): string[] {
  const lines = ADR.slice(ADR.indexOf(heading) + heading.length).split('\n');
  const labels: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) labels.push(trimmed.slice(2).split(': ')[0] ?? '');
    else if (labels.length > 0 && trimmed !== '') break;
  }
  return labels;
}

describe('the fixtures cover ADR-0010 §5', () => {
  it('has one row per row of the «Paquetes» and «App» tables, in order', () => {
    const areas = [...tableAreas('**Paquetes**'), ...tableAreas('**App (`apps/web/src/app`)**')];
    expect(areas).toHaveLength(15);
    expect(MATRIX_ROWS.map((row) => row.area)).toEqual(areas);
  });

  it('has one row per «Terceros por área» bullet that constrains TypeScript imports', () => {
    const labels = bulletLabels('**Terceros por área**');
    expect([...THIRD_PARTY_ROWS.map((row) => row.area), ...NOT_LINTABLE_THIRD_PARTY].sort()).toEqual(
      [...labels].sort(),
    );
  });

  it('gives every row at least one passing and one failing fixture', () => {
    for (const row of [...MATRIX_ROWS, ...THIRD_PARTY_ROWS]) {
      expect(row.pass.length, row.area).toBeGreaterThan(0);
      expect(row.fail.length, row.area).toBeGreaterThan(0);
    }
  });
});

describe.each([...MATRIX_ROWS, ...THIRD_PARTY_ROWS])('$area', (row) => {
  it.each(row.pass)('passes: $filePath', async (fixture) => {
    expect(await lint(fixture)).toEqual([]);
  });

  it.each(row.fail)('fails with exactly the boundary rule: $filePath', async (fixture) => {
    const reports = await lint(fixture);
    expect(reports.map((report) => report.ruleId)).toEqual([BOUNDARY_RULE]);
    expect(reports[0]?.line).toBe(1);
  });
});
