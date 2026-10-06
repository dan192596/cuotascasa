// @ts-check
// Usage: node tools/owns-check/check.mjs [--base <ref>] [--head <ref>] [--branch <name>]
//   --base    defaults to origin/main when it exists, otherwise main
//   --head    defaults to HEAD (commit your work first: the working tree is not checked)
//   --branch  defaults to $GITHUB_HEAD_REF (pull requests in CI), otherwise the current branch
// Exit codes: 0 pass or exempt branch, 1 rule violations, 2 configuration or git error.
import { spawnSync } from 'node:child_process';
import {
  CARDS_FILE,
  FROZEN_FILES_FILE,
  OwnsCheckConfigError,
  evaluate,
  parseBranch,
  parseCards,
  parseFrozenFiles,
} from './lib.mjs';

class GitError extends Error {}

/**
 * @param {string[]} args
 * @returns {{ ok: boolean, stdout: string, stderr: string }}
 */
function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: result.status === 0, stdout: result.stdout ?? '', stderr: (result.stderr ?? '').trim() };
}

/**
 * @param {string[]} args
 * @returns {string}
 */
function gitOrThrow(args) {
  const result = git(args);
  if (!result.ok) throw new GitError(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

/**
 * @param {string} rev
 * @param {string} path
 * @returns {string | null}
 */
function showFile(rev, path) {
  const result = git(['show', `${rev}:${path}`]);
  return result.ok ? result.stdout : null;
}

/**
 * @param {string} name
 * @returns {string | undefined}
 */
function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function defaultBase() {
  return git(['rev-parse', '--verify', '--quiet', 'origin/main']).ok ? 'origin/main' : 'main';
}

/**
 * Files changed between two revisions (`git diff --name-status --no-renames -z`): a rename is a delete plus an add.
 * @param {string} from
 * @param {string} to
 * @returns {{ status: string, path: string }[]}
 */
function changedFiles(from, to) {
  const fields = gitOrThrow(['diff', '--name-status', '--no-renames', '-z', from, to])
    .split('\0')
    .filter((field) => field !== '');
  /** @type {{ status: string, path: string }[]} */
  const changes = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    changes.push({ status: fields[index] ?? '', path: fields[index + 1] ?? '' });
  }
  return changes;
}

function main() {
  const branch =
    flag('--branch') || process.env['GITHUB_HEAD_REF'] || gitOrThrow(['rev-parse', '--abbrev-ref', 'HEAD']);
  const info = parseBranch(branch);
  if (info.kind === 'exempt') {
    console.log(`owns-check: branch ${branch} is exempt (${info.prefix})`);
    return 0;
  }
  const head = flag('--head') ?? 'HEAD';
  const mergeBase = gitOrThrow(['merge-base', flag('--base') ?? defaultBase(), head]);

  // The rules come from the merge-base, never from the branch under review, so a PR cannot widen its own owns.
  let configRev = mergeBase;
  if (showFile(mergeBase, CARDS_FILE) === null) {
    console.error(`owns-check: bootstrap: ${CARDS_FILE} is not in the merge-base yet; using the head version`);
    configRev = head;
  }
  const cardsText = showFile(configRev, CARDS_FILE);
  const frozenText = showFile(configRev, FROZEN_FILES_FILE);
  if (cardsText === null || frozenText === null) {
    throw new OwnsCheckConfigError(`${CARDS_FILE} and ${FROZEN_FILES_FILE} must both exist`);
  }
  const cards = parseCards(cardsText);
  const frozen = parseFrozenFiles(frozenText, new Set(cards.keys()));

  const changes = changedFiles(mergeBase, head);
  const result = evaluate({
    branch,
    changes,
    cards,
    frozen,
    readBefore: (path) => showFile(mergeBase, path),
    readAfter: (path) => showFile(head, path),
  });
  const label = result.cardId ?? branch;
  if (result.outcome === 'fail') {
    for (const violation of result.violations) console.error(`owns-check: ${label}: ${violation}`);
    return 1;
  }
  console.log(
    `owns-check: ${label}: ${changes.length} changed path(s) inside owns; frozen and append-only rules respected`,
  );
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  if (error instanceof OwnsCheckConfigError) {
    console.error(`owns-check: config: ${error.message}`);
  } else if (error instanceof GitError) {
    console.error(`owns-check: git: ${error.message}`);
  } else {
    throw error;
  }
  process.exitCode = 2;
}
