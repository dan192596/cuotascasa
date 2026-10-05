// @ts-check
// commit-msg hook (lefthook): enforces Conventional Commits, as CLAUDE.md and ADR-0018 §12 require.
// Usage: node tools/hygiene/commit-msg.mjs <path-to-commit-message-file>
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const COMMIT_TYPES = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
  'wip',
];
const MAX_HEADER_LENGTH = 100;
const CONVENTIONAL = new RegExp(`^(?:${COMMIT_TYPES.join('|')})(?:\\([A-Za-z0-9._/-]+\\))?!?: \\S`);
const GIT_GENERATED = /^(?:Merge |Revert "|fixup! |squash! |amend! )/;

/**
 * Returns null when the message is acceptable, or the error to print.
 * @param {string} message full commit message, as git writes it to the message file
 * @returns {string | null}
 */
export function checkCommitMessage(message) {
  const header = message.split(/\r?\n/).find((line) => line.trim() !== '' && !line.startsWith('#')) ?? '';
  if (GIT_GENERATED.test(header)) return null;
  if (!CONVENTIONAL.test(header)) {
    return `commit-msg: "${header}" is not a conventional commit. Use "<type>(<scope>): <subject>" with type one of: ${COMMIT_TYPES.join(', ')}.`;
  }
  if (header.length > MAX_HEADER_LENGTH) {
    return `commit-msg: the header has ${header.length} characters; the limit is ${MAX_HEADER_LENGTH}.`;
  }
  return null;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (file === undefined) {
    console.error('usage: node tools/hygiene/commit-msg.mjs <commit-message-file>');
    process.exit(2);
  }
  const error = checkCommitMessage(readFileSync(file, 'utf8'));
  if (error !== null) {
    console.error(error);
    process.exit(1);
  }
}
