import type { FeatureTag, Fixture } from '@cuotascasa/schema';
import type { FixtureEngine } from '../engine-adapter.ts';
import { compareFixture } from './compare-fixture.ts';
import { missingFeatures } from './enforced-features.ts';

export interface PendingFixture {
  readonly id: string;
  /** Feature tags of the fixture that enforced-features.json does not list yet. */
  readonly missing: readonly FeatureTag[];
}

export interface FixturePartition {
  readonly enforced: readonly Fixture[];
  readonly pending: readonly PendingFixture[];
}

export interface ConformanceOutcome {
  readonly id: string;
  readonly status: 'pass' | 'fail';
  readonly mismatches: readonly string[];
}

export interface ConformanceReport {
  readonly results: readonly ConformanceOutcome[];
  readonly pending: readonly PendingFixture[];
}

/** A fixture is enforced only when every one of its feature tags is in enforced-features.json. */
export function partitionFixtures(fixtures: readonly Fixture[], enforced: readonly FeatureTag[]): FixturePartition {
  const result = { enforced: [] as Fixture[], pending: [] as PendingFixture[] };
  for (const fixture of fixtures) {
    const missing = missingFeatures(fixture, enforced);
    if (missing.length === 0) result.enforced.push(fixture);
    else result.pending.push({ id: fixture.id, missing });
  }
  return result;
}

/** Enforced tags that no loaded fixture carries: with one of them the gate would pass with nothing to check. */
export function enforcedTagsWithoutFixtures(
  fixtures: readonly Fixture[],
  enforced: readonly FeatureTag[],
): FeatureTag[] {
  return enforced.filter((tag) => !fixtures.some((fixture) => fixture.features.includes(tag)));
}

/** Runs one fixture through the engine; an engine error becomes a single report line. */
export function checkFixture(fixture: Fixture, engine: FixtureEngine): string[] {
  try {
    return compareFixture(fixture, engine(fixture.inputs));
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error';
    const message = error instanceof Error ? error.message : String(error);
    return [`${fixture.id}: engine threw ${name}: ${message}`];
  }
}

/** Runs the enforced fixtures and lists the pending ones; pending fixtures never run and never fail. */
export function runConformance(
  fixtures: readonly Fixture[],
  enforced: readonly FeatureTag[],
  engine: FixtureEngine,
): ConformanceReport {
  const partition = partitionFixtures(fixtures, enforced);
  return {
    results: partition.enforced.map((fixture) => {
      const mismatches = checkFixture(fixture, engine);
      return { id: fixture.id, status: mismatches.length === 0 ? 'pass' : 'fail', mismatches };
    }),
    pending: partition.pending,
  };
}

export function formatConformanceSummary(partition: FixturePartition): string {
  return `conformance: ${String(partition.enforced.length)} enforced, ${String(partition.pending.length)} pending (features not enforced yet)`;
}

/** The first `max` lines of a report, plus a count of the rest. */
export function limitReport(lines: readonly string[], max = 25): string[] {
  if (lines.length <= max) return [...lines];
  return [...lines.slice(0, max), `… and ${String(lines.length - max)} more mismatch(es)`];
}
