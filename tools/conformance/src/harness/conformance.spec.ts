/**
 * The conformance gate (Opus-frozen, W0-06). It loads every fixture listed in tools/oracle/fixtures/manifest.json,
 * validates it with fixtureSchema, runs the public engine API and compares every row field and summary value to the
 * cent. Only fixtures whose feature tags are all in tools/conformance/enforced-features.json can fail; the rest show
 * as todo (pending). It also fails if any fixture id appears under packages/domain/src/.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPublicEngine } from '../engine-adapter.ts';
import { DOMAIN_SRC_DIR, ENFORCED_FEATURES_FILE, FIXTURES_DIR } from '../paths.ts';
import { parseEnforcedFeatures } from './enforced-features.ts';
import { findFixtureIdLeaks, formatFixtureIdLeak } from './fixture-id.ts';
import { loadFixtureSet } from './fixture-set.ts';
import {
  checkFixture,
  enforcedTagsWithoutFixtures,
  formatConformanceSummary,
  limitReport,
  partitionFixtures,
} from './run-conformance.ts';

const enforcedTags = parseEnforcedFeatures(readFileSync(ENFORCED_FEATURES_FILE, 'utf8'));
const fixtureSet = loadFixtureSet(FIXTURES_DIR);
const partition = partitionFixtures(fixtureSet.fixtures, enforcedTags);
const engine = createPublicEngine();

describe('conformance gate', () => {
  it('loads every fixture listed in tools/oracle/fixtures/manifest.json, validates it with fixtureSchema and finds a fixture for every enforced tag', () => {
    console.info(
      fixtureSet.manifest === null
        ? 'conformance: no tools/oracle/fixtures/manifest.json yet (W2-01 commits the first profile)'
        : formatConformanceSummary(partition),
    );
    expect(fixtureSet.problems).toEqual([]);
    expect(
      enforcedTagsWithoutFixtures(fixtureSet.fixtures, enforcedTags),
      'enforced tags that no fixture carries',
    ).toEqual([]);
  });

  it('finds no fixture id under packages/domain/src', () => {
    expect(findFixtureIdLeaks(DOMAIN_SRC_DIR).map(formatFixtureIdLeak)).toEqual([]);
  });
});

if (partition.enforced.length > 0) {
  describe('enforced fixtures (every row field and summary value to the cent)', () => {
    for (const fixture of partition.enforced) {
      it(fixture.id, () => {
        const mismatches = checkFixture(fixture, engine);
        expect(limitReport(mismatches), `${String(mismatches.length)} mismatch(es)`).toEqual([]);
      });
    }
  });
}

if (partition.pending.length > 0) {
  describe('pending fixtures (feature tags not in enforced-features.json yet; they never fail CI)', () => {
    for (const pending of partition.pending) {
      it.todo(`${pending.id} needs ${pending.missing.join(', ')}`);
    }
  });
}
