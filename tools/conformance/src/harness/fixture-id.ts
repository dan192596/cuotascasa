import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { FIXTURE_PROFILES } from '@cuotascasa/schema';

/** A fixture id inside any text: '<profile>-<NNNN>' as a whole word (tools/oracle/FORMAT.md §3.1). */
export const FIXTURE_ID_IN_TEXT = new RegExp(String.raw`\b(?:${FIXTURE_PROFILES.join('|')})-\d{4}\b`, 'g');

export interface FixtureIdLeak {
  /** Path relative to the scanned directory, with '/' separators. */
  readonly file: string;
  readonly line: number;
  readonly id: string;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return listFiles(path);
      return entry.isFile() ? [path] : [];
    });
}

/** Every fixture id that appears in a file below `dir` (engine code must never special-case a fixture). */
export function findFixtureIdLeaks(dir: string): FixtureIdLeak[] {
  return listFiles(dir).flatMap((path) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .flatMap((text, index) =>
        [...text.matchAll(FIXTURE_ID_IN_TEXT)].map((match) => ({
          file: relative(dir, path).split(sep).join('/'),
          line: index + 1,
          id: match[0],
        })),
      ),
  );
}

export function formatFixtureIdLeak(leak: FixtureIdLeak): string {
  return `fixture id ${leak.id} found in ${leak.file}:${String(leak.line)}`;
}
