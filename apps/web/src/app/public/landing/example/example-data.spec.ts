import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLandingExample, renderRowsModule, renderSummaryModule } from './build-example.ts';
import { LANDING_EXAMPLE_ROWS } from './example-rows.generated.ts';
import { LANDING_EXAMPLE_SUMMARY } from './example-summary.generated.ts';

/** cwd is the repo root under `ng test`. */
const DIR = 'apps/web/src/app/public/landing/example';
const SUMMARY_FILE = join(DIR, 'example-summary.generated.ts');
const ROWS_FILE = join(DIR, 'example-rows.generated.ts');
const UPDATE = process.env['UPDATE_LANDING_EXAMPLE'] === '1';

describe('landing example generated from the engine (W8-07)', () => {
  const built = buildLandingExample();

  if (UPDATE) {
    it('rewrites the generated modules (UPDATE_LANDING_EXAMPLE=1)', () => {
      writeFileSync(SUMMARY_FILE, renderSummaryModule(built.summary));
      writeFileSync(ROWS_FILE, renderRowsModule(built.rows));
      expect(readFileSync(SUMMARY_FILE, 'utf8')).toBe(renderSummaryModule(built.summary));
    });
    return;
  }

  it('matches the committed generated constants', () => {
    expect(built.summary).toEqual(LANDING_EXAMPLE_SUMMARY);
    expect(built.rows).toEqual(LANDING_EXAMPLE_ROWS);
  });

  it('matches the committed generated files byte for byte', () => {
    expect(readFileSync(SUMMARY_FILE, 'utf8')).toBe(renderSummaryModule(built.summary));
    expect(readFileSync(ROWS_FILE, 'utf8')).toBe(renderRowsModule(built.rows));
  });

  it('is synthetic and has the level installment of the sketch (direccion-visual §4.1)', () => {
    expect(built.summary.synthetic).toBe(true);
    expect(built.summary.level).toBe('Q 4,263.47');
  });

  it('has the cuota 1 breakdown of [ALG.EXAMPLE] (no fixed charges)', () => {
    expect(built.summary.first).toEqual({
      interest: 'Q 2,916.67',
      insurance: 'Q 525.00',
      capital: 'Q 821.80',
      total: 'Q 4,263.47',
    });
  });

  it('has 240 base rows and one prepaid row per remaining installment', () => {
    expect(built.rows.base).toHaveLength(240);
    expect(built.summary.baseCount).toBe(240);
    expect(built.rows.prepaid).toHaveLength(built.summary.prepaidCount);
    expect(built.summary.prepaidCount).toBeLessThan(240);
  });

  it('counts the months saved as base minus prepaid installments', () => {
    expect(built.summary.monthsSaved).toBe(built.summary.baseCount - built.summary.prepaidCount);
    expect(built.summary.monthsSaved).toBeGreaterThan(0);
  });

  it('prepays Q 50,000.00 at installment 60 and starts the board there', () => {
    expect(built.summary.prepayment).toEqual({ installment: 60, amount: 'Q 50,000.00' });
    expect(built.summary.at60).toEqual(built.rows.base[59]);
    expect(built.summary.at60.k).toBe(60);
    expect(built.summary.at60.dueDate).toBe('15/12/2030');
  });

  it('formats every row: k in order, money, one-decimal percent and dd/mm/aaaa dates on day 15', () => {
    for (const rows of [built.rows.base, built.rows.prepaid]) {
      rows.forEach((row, i) => {
        expect(row.k).toBe(i + 1);
        expect(row.balance).toMatch(/^Q \d{1,3}(,\d{3})*\.\d{2}$/);
        expect(row.paidPercent).toMatch(/^\d{1,3}\.\d %$/);
        expect(row.dueDate).toMatch(/^15\/\d{2}\/20\d{2}$/);
      });
    }
    expect(built.rows.base[0]).toEqual({ k: 1, balance: 'Q 499,178.20', paidPercent: '0.2 %', dueDate: '15/01/2026' });
    expect(built.rows.base.at(-1)).toMatchObject({ k: 240, balance: 'Q 0.00', paidPercent: '100.0 %' });
    expect(built.rows.prepaid.at(-1)).toMatchObject({ balance: 'Q 0.00', paidPercent: '100.0 %' });
  });

  it('shows the prepayment in the balance after installment 60', () => {
    const base = built.rows.base[59];
    const prepaid = built.rows.prepaid[59];
    expect(prepaid?.k).toBe(60);
    expect(prepaid?.balance).not.toBe(base?.balance);
    expect(built.rows.prepaid[58]).toEqual(built.rows.base[58]);
  });

  it('saves a positive formatted amount of interest and insurance', () => {
    expect(built.summary.costSaved).toMatch(/^Q \d{1,3}(,\d{3})*\.\d{2}$/);
  });

  it('generated modules have no runtime imports (they enter the landing graph)', () => {
    for (const file of [SUMMARY_FILE, ROWS_FILE]) {
      const imports = readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => /^\s*import\b/.test(line));
      expect(imports.every((line) => /^import type\b/.test(line))).toBe(true);
    }
  });
});
