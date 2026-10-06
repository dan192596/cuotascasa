import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FIXTURE_PROFILES,
  fixtureIdFor,
  fixtureSchema,
  manifestSchema,
  type Fixture,
  type Manifest,
} from '@cuotascasa/schema';

export interface LoadedFixtureSet {
  readonly manifest: Manifest | null;
  readonly fixtures: readonly Fixture[];
  readonly problems: readonly string[];
}

interface Issue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

function describeIssues(issues: readonly Issue[]): string {
  return issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`).join('; ');
}

function readJson(path: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch {
    return { ok: false };
  }
}

/**
 * Loads DIR/manifest.json and exactly the files it lists (DIR/<profile>-0001.json … <count>), each validated with
 * fixtureSchema and checked against its manifest entry. Without a manifest (before W2-01) the set is empty.
 */
export function loadFixtureSet(dir: string): LoadedFixtureSet {
  const jsonFiles = existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .sort()
    : [];
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return {
      manifest: null,
      fixtures: [],
      problems: jsonFiles.map((name) => `${name}: not listed (manifest.json is missing)`),
    };
  }
  const raw = readJson(manifestPath);
  const parsed = raw.ok ? manifestSchema.safeParse(raw.value) : null;
  if (parsed === null || !parsed.success) {
    const detail = parsed === null ? 'invalid JSON' : describeIssues(parsed.error.issues);
    return { manifest: null, fixtures: [], problems: [`manifest.json: ${detail}`] };
  }
  const manifest = parsed.data;
  const fixtures: Fixture[] = [];
  const problems: string[] = [];
  const listed = new Set<string>(['manifest.json']);
  for (const profile of FIXTURE_PROFILES) {
    const entry = manifest.profiles[profile];
    if (entry === undefined) continue;
    for (let loanIndex = 1; loanIndex <= entry.count; loanIndex += 1) {
      const id = fixtureIdFor(profile, loanIndex);
      const name = `${id}.json`;
      listed.add(name);
      if (!existsSync(join(dir, name))) {
        problems.push(`${name}: listed by manifest.json but missing`);
        continue;
      }
      const json = readJson(join(dir, name));
      if (!json.ok) {
        problems.push(`${name}: invalid JSON`);
        continue;
      }
      const result = fixtureSchema.safeParse(json.value);
      if (!result.success) {
        problems.push(`${name}: does not match fixtureSchema (${describeIssues(result.error.issues)})`);
        continue;
      }
      const fixture = result.data;
      if (fixture.id !== id) problems.push(`${name}: id is ${fixture.id}`);
      if (fixture.seed !== entry.seed) {
        problems.push(`${name}: seed ${String(fixture.seed)} differs from manifest.json (${String(entry.seed)})`);
      }
      if (fixture.generatorVersion !== entry.generatorVersion) {
        problems.push(
          `${name}: generatorVersion ${String(fixture.generatorVersion)} differs from manifest.json (${String(entry.generatorVersion)})`,
        );
      }
      fixtures.push(fixture);
    }
  }
  problems.push(...jsonFiles.filter((name) => !listed.has(name)).map((name) => `${name}: not listed in manifest.json`));
  return { manifest, fixtures, problems };
}
