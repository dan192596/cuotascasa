import { FEATURE_TAGS, type FeatureTag, type Fixture } from '@cuotascasa/schema';

const KNOWN: ReadonlySet<string> = new Set(FEATURE_TAGS);

/** Parses tools/conformance/enforced-features.json: a JSON array of known, unique feature tags (append-only). */
export function parseEnforcedFeatures(text: string): FeatureTag[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = undefined;
  }
  if (!Array.isArray(data)) throw new Error('enforced-features.json: expected a JSON array of feature tags');
  const seen = new Set<string>();
  return data.map((tag: unknown) => {
    if (typeof tag !== 'string' || !KNOWN.has(tag)) {
      throw new Error(`enforced-features.json: unknown feature tag ${JSON.stringify(tag)}`);
    }
    if (seen.has(tag)) throw new Error(`enforced-features.json: duplicated feature tag "${tag}"`);
    seen.add(tag);
    return tag as FeatureTag;
  });
}

/** Feature tags of the fixture that are not enforced yet; empty means the fixture is enforced. */
export function missingFeatures(fixture: Fixture, enforced: readonly FeatureTag[]): FeatureTag[] {
  return fixture.features.filter((tag) => !enforced.includes(tag));
}
