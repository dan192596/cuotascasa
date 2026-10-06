import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXPECTED_ROW_COLUMNS, type Fixture } from '@cuotascasa/schema';
import { afterEach, describe, expect, it } from 'vitest';
import type { ComputedFixtureResult, FixtureEngine } from '../engine-adapter.ts';
import { centsToMoney, moneyToCents } from '../money.ts';
import { compareFixture } from './compare-fixture.ts';
import { missingFeatures, parseEnforcedFeatures } from './enforced-features.ts';
import { findFixtureIdLeaks, formatFixtureIdLeak } from './fixture-id.ts';
import { loadFixtureSet } from './fixture-set.ts';
import {
  checkFixture,
  enforcedTagsWithoutFixtures,
  formatConformanceSummary,
  limitReport,
  partitionFixtures,
  runConformance,
} from './run-conformance.ts';
import { miniFixture } from './testing/mini-fixture.ts';

const scratchDirs: string[] = [];

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'conformance-'));
  scratchDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** An engine that returns `fixture.expected`, optionally edited. */
function engineReturning(fixture: Fixture, edit: (result: ComputedFixtureResult) => ComputedFixtureResult = (r) => r) {
  const calls: string[] = [];
  const engine: FixtureEngine = (inputs) => {
    calls.push(inputs.terms.principal);
    return edit(structuredClone(fixture.expected));
  };
  return { engine, calls };
}

function withRow(result: ComputedFixtureResult, index: number, patch: Record<string, unknown>): ComputedFixtureResult {
  return { ...result, rows: result.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) };
}

describe('harness self-tests with synthetic mini-fixtures', () => {
  it('passes an equal fixture', () => {
    const fixture = miniFixture();
    const { engine, calls } = engineReturning(fixture);
    expect(runConformance([fixture], ['core'], engine)).toEqual({
      results: [{ id: 'core-0001', status: 'pass', mismatches: [] }],
      pending: [],
    });
    expect(calls).toEqual(['300.00']);
  });

  it('fails a 0.01 difference with the exact report format', () => {
    const fixture = miniFixture();
    const { engine } = engineReturning(fixture, (result) => ({
      ...withRow(result, 1, { capital: '100.01' }),
      summary: { ...result.summary, totalPaid: '300.01' },
    }));
    expect(runConformance([fixture], ['core'], engine).results).toEqual([
      {
        id: 'core-0001',
        status: 'fail',
        mismatches: [
          'core-0001 row 2 capital: expected 100.00, actual 100.01',
          'core-0001 summary totalPaid: expected 300.00, actual 300.01',
        ],
      },
    ]);
  });

  it('shows a fixture with an unenforced tag as pending, without running it', () => {
    const fixture = miniFixture({ features: ['core', 'advance'] });
    const { engine, calls } = engineReturning(fixture);
    const report = runConformance([fixture], ['core'], engine);
    expect(report).toEqual({ results: [], pending: [{ id: 'core-0001', missing: ['advance'] }] });
    expect(calls).toEqual([]);
    expect(formatConformanceSummary(partitionFixtures([fixture], ['core']))).toBe(
      'conformance: 0 enforced, 1 pending (features not enforced yet)',
    );
  });

  it('fails when a fixture id is planted in a scratch domain file', () => {
    const domainSrc = scratchDir();
    mkdirSync(join(domainSrc, 'schedule'));
    writeFileSync(join(domainSrc, 'schedule/clean.ts'), "export const score = 'score-0007';\n");
    writeFileSync(join(domainSrc, 'schedule/planted.ts'), "// tuned for\nexport const leak = 'core-0007';\n");
    const leaks = findFixtureIdLeaks(domainSrc);
    expect(leaks).toEqual([{ file: 'schedule/planted.ts', line: 2, id: 'core-0007' }]);
    expect(leaks.map(formatFixtureIdLeak)).toEqual(['fixture id core-0007 found in schedule/planted.ts:2']);
  });
});

describe('compareFixture', () => {
  it('compares money to the cent and every other field exactly', () => {
    const fixture = miniFixture();
    const actual = withRow(structuredClone(fixture.expected), 0, {
      dueDate: '2025-03-01',
      paid: true,
      insuranceComponents: ['0.00'],
    });
    expect(compareFixture(fixture, actual)).toEqual([
      'core-0001 row 1 dueDate: expected 2025-02-28, actual 2025-03-01',
      'core-0001 row 1 insuranceComponents: expected 0 items, actual 1 items',
      'core-0001 row 1 paid: expected false, actual true',
    ]);
    // A non-canonical amount differs even when the cents agree (tools/oracle/FORMAT.md §1: no leading zeros, never '-0.00').
    const nonCanonical = withRow(structuredClone(fixture.expected), 0, { level: '0100.00', prepayment: '-0.00' });
    expect(compareFixture(fixture, nonCanonical)).toEqual([
      'core-0001 row 1 level: expected 100.00, actual 0100.00',
      'core-0001 row 1 prepayment: expected 0.00, actual -0.00',
    ]);
    // Every row column and every summary field is compared: one perturbation gives exactly one line naming it.
    const bump = (value: string | number | boolean): string | number | boolean => {
      if (typeof value === 'number') return value + 1;
      if (typeof value === 'boolean') return !value;
      const cents = moneyToCents(value);
      return cents === null ? '2099-12-31' : centsToMoney(cents + 1n);
    };
    for (const column of EXPECTED_ROW_COLUMNS) {
      if (column === 'insuranceComponents') continue; // length and elements: covered above
      const before = fixture.expected.rows[1]![column];
      const after = bump(before);
      const changed = withRow(structuredClone(fixture.expected), 1, { [column]: after });
      expect(compareFixture(fixture, changed), column).toEqual([
        `core-0001 row 2 ${column}: expected ${String(before)}, actual ${String(after)}`,
      ]);
    }
    for (const [field, before] of Object.entries(fixture.expected.summary)) {
      const after = bump(before);
      const expected = structuredClone(fixture.expected);
      const changed = { ...expected, summary: { ...expected.summary, [field]: after } };
      expect(compareFixture(fixture, changed), field).toEqual([
        `core-0001 summary ${field}: expected ${String(before)}, actual ${String(after)}`,
      ]);
    }
  });

  it('reports missing and extra rows', () => {
    const fixture = miniFixture();
    const expected = structuredClone(fixture.expected);
    expect(compareFixture(fixture, { ...expected, rows: expected.rows.slice(0, 2) })).toEqual([
      'core-0001 row 3: expected present, actual missing',
    ]);
    const extra = { ...expected.rows[2]!, k: 4 };
    expect(compareFixture(fixture, { ...expected, rows: [...expected.rows, extra] })).toEqual([
      'core-0001 row 4: expected missing, actual present',
    ]);
  });

  it('compares anchors and payments by event id', () => {
    const base = miniFixture();
    const fixture: Fixture = {
      ...base,
      expected: {
        ...base.expected,
        anchors: [{ eventId: 'ev-01', k: 2, realDelta: '-1.00' }],
        payments: [{ eventId: 'ev-02', k: 1, componentDeltas: null }],
      },
    };
    const actual: ComputedFixtureResult = {
      ...structuredClone(base.expected),
      anchors: [{ eventId: 'ev-01', k: 2, realDelta: '-1.01' }],
      payments: [
        {
          eventId: 'ev-02',
          k: 1,
          componentDeltas: { capital: '0.00', interest: '0.00', insurance: '0.00', fixedCharges: '0.00' },
        },
        { eventId: 'ev-09', k: 3, componentDeltas: null },
      ],
    };
    expect(compareFixture(fixture, actual)).toEqual([
      'core-0001 anchor ev-01 realDelta: expected -1.00, actual -1.01',
      'core-0001 payment ev-02 componentDeltas: expected null, actual present',
      'core-0001 payment ev-09: expected missing, actual present',
    ]);
  });
});

describe('checkFixture and limitReport', () => {
  it('turns an engine error into one report line', () => {
    const engine: FixtureEngine = () => {
      throw new RangeError('not implemented in this scratch engine');
    };
    expect(checkFixture(miniFixture(), engine)).toEqual([
      'core-0001: engine threw RangeError: not implemented in this scratch engine',
    ]);
  });

  it('keeps the first lines and counts the rest', () => {
    expect(limitReport(['a', 'b', 'c'], 2)).toEqual(['a', 'b', '… and 1 more mismatch(es)']);
    expect(limitReport(['a'], 2)).toEqual(['a']);
  });
});

describe('enforced features', () => {
  it('parses a JSON array of known, unique feature tags', () => {
    expect(parseEnforcedFeatures('[]\n')).toEqual([]);
    expect(parseEnforcedFeatures('["core", "anchor"]')).toEqual(['core', 'anchor']);
    expect(() => parseEnforcedFeatures('{}')).toThrow('enforced-features.json: expected a JSON array of feature tags');
    expect(() => parseEnforcedFeatures('["core", "leapYear"]')).toThrow(
      'enforced-features.json: unknown feature tag "leapYear"',
    );
    expect(() => parseEnforcedFeatures('["core", "core"]')).toThrow(
      'enforced-features.json: duplicated feature tag "core"',
    );
  });

  it('lists the tags a fixture still needs, and the enforced tags that no fixture carries', () => {
    expect(missingFeatures(miniFixture({ features: ['core', 'anchor', 'advance'] }), ['core', 'advance'])).toEqual([
      'anchor',
    ]);
    expect(
      enforcedTagsWithoutFixtures([miniFixture({ features: ['core', 'anchor'] })], ['core', 'anchor', 'advance']),
    ).toEqual(['advance']);
    expect(enforcedTagsWithoutFixtures([], ['core'])).toEqual(['core']);
    expect(enforcedTagsWithoutFixtures([], [])).toEqual([]);
  });
});

describe('loadFixtureSet', () => {
  function writeJson(dir: string, name: string, value: unknown): void {
    writeFileSync(join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
  }

  it('returns an empty set when manifest.json is not committed yet', () => {
    expect(loadFixtureSet(join(scratchDir(), 'fixtures'))).toEqual({ manifest: null, fixtures: [], problems: [] });
  });

  it('loads every fixture the manifest lists and validates each one', () => {
    const dir = scratchDir();
    writeJson(dir, 'manifest.json', {
      synthetic: true,
      profiles: { core: { seed: 20261004, count: 2, generatorVersion: 1 } },
    });
    writeJson(dir, 'core-0001.json', miniFixture({ loanIndex: 1 }));
    writeJson(dir, 'core-0002.json', miniFixture({ loanIndex: 2 }));
    const set = loadFixtureSet(dir);
    expect(set.problems).toEqual([]);
    expect(set.fixtures.map((fixture) => fixture.id)).toEqual(['core-0001', 'core-0002']);
  });

  it('reports missing, invalid, inconsistent and unlisted files', () => {
    const dir = scratchDir();
    writeJson(dir, 'manifest.json', {
      synthetic: true,
      profiles: { core: { seed: 1, count: 3, generatorVersion: 1 } },
    });
    writeJson(dir, 'core-0001.json', miniFixture({ loanIndex: 1 }));
    writeJson(dir, 'core-0002.json', { ...miniFixture({ loanIndex: 2 }), synthetic: false });
    writeJson(dir, 'core-0009.json', miniFixture({ loanIndex: 9 }));
    const set = loadFixtureSet(dir);
    expect(set.problems).toEqual([
      'core-0001.json: seed 20261004 differs from manifest.json (1)',
      'core-0002.json: does not match fixtureSchema (synthetic: Invalid input: expected true)',
      'core-0003.json: listed by manifest.json but missing',
      'core-0009.json: not listed in manifest.json',
    ]);
    expect(set.fixtures.map((fixture) => fixture.id)).toEqual(['core-0001']);
  });
});
