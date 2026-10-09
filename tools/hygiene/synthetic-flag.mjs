// @ts-check
// pre-commit hook (ADR-0015 §2, §4):
//  1. every JSON under the fixture directories has top-level `synthetic: true`;
//  2. no file under those directories is ignored by git (an ignored fixture would silently never be committed).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE_DIRS, git } from './lib.mjs';

/**
 * Returns an error for a fixture whose text is not a JSON object with `synthetic: true`, or null.
 * @param {string} path
 * @param {string} text
 * @returns {string | null}
 */
export function checkSyntheticFlag(path, text) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return `${path}: not valid JSON`;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return `${path}: top level must be an object with "synthetic": true`;
  }
  return /** @type {Record<string, unknown>} */ (parsed)['synthetic'] === true
    ? null
    : `${path}: missing top-level "synthetic": true`;
}

/**
 * Runs both checks and returns the error lines.
 * @param {string} cwd
 * @returns {string[]}
 */
export function check(cwd) {
  /** @type {string[]} */
  const errors = [];
  const listed = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...FIXTURE_DIRS], cwd);
  const staged = new Set(git(['ls-files', '-z', '--cached', '--', ...FIXTURE_DIRS], cwd).split('\0'));
  const files = [...new Set(listed.split('\0'))].filter((file) => file.endsWith('.json')).sort();
  for (const file of files) {
    // Prefer the staged content so a partially staged file is judged by what will be committed.
    let text;
    if (staged.has(file)) {
      text = git(['show', `:${file}`], cwd);
    } else if (existsSync(join(cwd, file))) {
      text = readFileSync(join(cwd, file), 'utf8');
    } else {
      continue;
    }
    const error = checkSyntheticFlag(file, text);
    if (error !== null) errors.push(`hygiene:synthetic: ${error}`);
  }
  const ignored = git(['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--', ...FIXTURE_DIRS], cwd)
    .split('\0')
    .filter((file) => file !== '');
  for (const file of ignored) {
    errors.push(`hygiene:synthetic: ${file}: file under a fixture directory is ignored by git`);
  }
  return errors;
}

if (import.meta.main) {
  const errors = check(process.cwd());
  for (const line of errors) console.error(line);
  process.exit(errors.length === 0 ? 0 : 1);
}
