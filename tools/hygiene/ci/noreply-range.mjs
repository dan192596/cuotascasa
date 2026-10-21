// @ts-check
// CI check (W7-02, ADR-0015 §7): every non-merge commit of a pull request range has a noreply author and committer.
// Usage: node tools/hygiene/ci/noreply-range.mjs --base <ref-or-sha> [--head <ref>]   (head defaults to HEAD)
// Output: only the short SHA and the failed identity (author, committer), never e-mails, names or messages.
// Exit codes: 0 pass, 1 violation, 2 git or usage error.
import { git } from '../lib.mjs';
import { NOREPLY_SUFFIX } from '../noreply.mjs';

/** GitHub's own committer for web edits and merges. Valid as committer only. */
const GITHUB_COMMITTER = 'noreply@github.com';
const NOREPLY_ADDRESS = new RegExp(`^[^@\\s]+${NOREPLY_SUFFIX.replaceAll('.', '\\.')}$`, 'i');

/**
 * @param {string} email
 * @returns {boolean}
 */
export function isNoreplyAddress(email) {
  return NOREPLY_ADDRESS.test(email);
}

/**
 * @param {string} email
 * @returns {boolean}
 */
export function isAllowedCommitter(email) {
  return isNoreplyAddress(email) || email === GITHUB_COMMITTER;
}

/**
 * Returns one line per violating commit, naming only the short SHA and the failed identities.
 * @param {string} base
 * @param {string} head
 * @param {string} cwd
 * @returns {string[]}
 */
export function checkRange(base, head, cwd) {
  const shas = git(['rev-list', '--no-merges', `${base}..${head}`], cwd)
    .split('\n')
    .filter((sha) => sha !== '');
  /** @type {string[]} */
  const errors = [];
  for (const sha of shas) {
    const [short = sha.slice(0, 7), author = '', committer = ''] = git(['log', '-1', '--format=%h%n%ae%n%ce', sha], cwd)
      .trimEnd()
      .split('\n');
    /** @type {string[]} */
    const failed = [];
    if (!isNoreplyAddress(author)) failed.push('author');
    if (!isAllowedCommitter(committer)) failed.push('committer');
    if (failed.length > 0)
      errors.push(`hygiene:noreply: commit ${short}: ${failed.join(' and ')} is not a noreply address`);
  }
  return errors;
}

/**
 * @param {string[]} argv
 * @returns {{ base: string, head: string } | null}
 */
function parseArgs(argv) {
  /** @type {{ base?: string, head: string }} */
  const options = { head: 'HEAD' };
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    if (value === undefined || value === '' || value.startsWith('--')) return null;
    if (argv[i] === '--base') options.base = value;
    else if (argv[i] === '--head') options.head = value;
    else return null;
  }
  return options.base === undefined ? null : { base: options.base, head: options.head };
}

if (import.meta.main) {
  const options = parseArgs(process.argv.slice(2));
  if (options === null) {
    console.error('usage: node tools/hygiene/ci/noreply-range.mjs --base <ref> [--head <ref>]');
    process.exit(2);
  }
  /** @type {string[]} */
  let errors;
  try {
    errors = checkRange(options.base, options.head, process.cwd());
  } catch {
    // The git message can echo refs; keep the output fixed.
    console.error('hygiene:noreply: git could not list the commit range (check --base and --head)');
    process.exit(2);
  }
  for (const line of errors) console.error(line);
  process.exit(errors.length === 0 ? 0 : 1);
}
