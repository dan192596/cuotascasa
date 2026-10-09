import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Build-output checks for the build-time defines (W3-17, ADR-0015 §9). Run after `pnpm build` with
 * `pnpm exec ng test --configuration=dist --no-watch` (cwd = repository root).
 *
 * The expected values come from the environment: CI leaves them unset, so the build must carry no client ID and no
 * issues URL; the deploy workflow sets them to the same values it passed to `ng build --define`.
 */
const BROWSER = 'dist/apps/web/browser';
const EXPECTED_CLIENT_ID = process.env['EXPECTED_GOOGLE_CLIENT_ID'] ?? '';
const EXPECTED_ISSUES_URL = process.env['EXPECTED_REPOSITORY_ISSUES_URL'] ?? '';
/** Any Google OAuth web client ID (same shape the gitleaks rule looks for, relaxed to catch placeholders). */
const CLIENT_ID_PATTERN = /[0-9]{6,}-[0-9a-z-]+\.apps\.googleusercontent\.com/g;
/** A GitHub Issues URL of any repository except the framework's own (Angular's runtime error messages link there). */
const ISSUES_URL_PATTERN = /https:\/\/github\.com\/(?!angular\/)[\w.-]+\/[\w.-]+\/issues/g;

function files(dir: string = BROWSER): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

function textFiles(): { path: string; text: string }[] {
  return files()
    .filter((path) => /\.(?:js|mjs|html|json|webmanifest|txt|css)$/.test(path) || path.endsWith('_headers'))
    .map((path) => ({ path, text: readFileSync(path, 'utf8') }));
}

function matchesIn(pattern: RegExp): string[] {
  return [...new Set(textFiles().flatMap(({ text }) => text.match(pattern) ?? []))].sort();
}

describe('build-time defines in the build output (W3-17, ADR-0015 §9)', () => {
  // Until a consumer reads GOOGLE_OAUTH_CLIENT_ID (W4-09) the optimizer drops it, so an injected build may ship it or
  // not; it must never ship a different one. W4-09 can tighten this to "exactly the injected ID".
  it(
    EXPECTED_CLIENT_ID === ''
      ? 'ships no Google client ID when GOOGLE_CLIENT_ID is not injected (Drive "no configurado")'
      : 'ships no Google client ID other than the injected one',
    () => {
      const unexpected = matchesIn(CLIENT_ID_PATTERN).filter((id) => id !== EXPECTED_CLIENT_ID);
      expect(unexpected).toEqual([]);
    },
  );

  it(
    EXPECTED_ISSUES_URL === ''
      ? 'ships no repository issues URL when REPOSITORY_ISSUES_URL is not injected'
      : 'ships exactly the injected repository issues URL',
    () => {
      expect(matchesIn(ISSUES_URL_PATTERN)).toEqual(EXPECTED_ISSUES_URL === '' ? [] : [EXPECTED_ISSUES_URL]);
    },
  );

  it('keeps every ngsw.json hash valid: nothing is mutated after the Angular build hashes it', () => {
    const ngsw = JSON.parse(readFileSync(join(BROWSER, 'ngsw.json'), 'utf8')) as { hashTable: Record<string, string> };
    // The table lists the files of ngsw-config.json assetGroups (empty until the PWA cards add some).
    const stale = Object.entries(ngsw.hashTable).filter(
      ([url, hash]) =>
        createHash('sha1')
          .update(readFileSync(join(BROWSER, url)))
          .digest('hex') !== hash,
    );
    expect(stale).toEqual([]);
  });
});
