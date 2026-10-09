// @ts-check
// Shared helpers of the hygiene hooks. Every git call takes an explicit cwd so tests can use throwaway repos.
import { spawnSync } from 'node:child_process';

/**
 * Runs git and returns its stdout; throws when git exits non-zero.
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string}
 */
export function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

/** Directories whose JSON must carry `synthetic: true` and whose files may never be ignored (ADR-0015 §2, §4). */
export const FIXTURE_DIRS = [
  'packages/schema/fixtures',
  'tools/oracle/fixtures',
  'docs/specs/algorithm-examples',
  'e2e/fixtures',
];
