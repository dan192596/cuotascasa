// @ts-check
// commit-msg hook: refuses to commit with an identity that is not a GitHub noreply address (ADR-0015 §7).
// Reads the effective author and committer identities (config, environment overrides), not only user.email.
import { git } from './lib.mjs';

export const NOREPLY_SUFFIX = '@users.noreply.github.com';

/**
 * Extracts the e-mail from a `git var` identity line: "Name <email> timestamp tz".
 * @param {string} ident
 * @returns {string | null}
 */
export function emailOf(ident) {
  const match = /<([^<>]*)>/.exec(ident);
  return match ? (match[1] ?? '').trim() : null;
}

/**
 * Returns the error lines for the identities that are not noreply (empty when all are).
 * @param {string} cwd
 * @returns {string[]}
 */
export function check(cwd) {
  /** @type {string[]} */
  const errors = [];
  for (const variable of ['GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT']) {
    let email;
    try {
      email = emailOf(git(['var', variable], cwd));
    } catch {
      errors.push(`hygiene:noreply: could not determine ${variable}; set user.email to your noreply address.`);
      continue;
    }
    if (email === null || !email.toLowerCase().endsWith(NOREPLY_SUFFIX)) {
      errors.push(
        `hygiene:noreply: ${variable} is not an address ending in ${NOREPLY_SUFFIX}; run: git config user.email <id>+<user>${NOREPLY_SUFFIX}`,
      );
    }
  }
  return errors;
}

if (import.meta.main) {
  const errors = check(process.cwd());
  for (const line of errors) console.error(line);
  process.exit(errors.length === 0 ? 0 : 1);
}
