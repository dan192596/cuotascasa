import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TempRepo } from '../testing.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const COMMAND = 'node tools/hygiene/synthetic-flag.mjs';

const repos: TempRepo[] = [];
afterEach(() => repos.splice(0).forEach((repo) => repo.dispose()));

/** Runs the CI step's command in a throwaway checkout whose tools/hygiene is the repository's own. */
function runStep(repo: TempRepo) {
  const [bin, ...args] = COMMAND.split(' ');
  return spawnSync(bin as string, [resolve(REPO_ROOT, args[0] as string)], {
    cwd: repo.dir,
    env: repo.env,
    encoding: 'utf8',
  });
}

function newRepo() {
  const repo = new TempRepo();
  repos.push(repo);
  return repo;
}

describe('CI synthetic-flag step', () => {
  it('uses exactly the hook script, with no copied rules', () => {
    const workflow = readFileSync(resolve(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain(`run: ${COMMAND}`);
  });

  it('fails (exit 1) on a fixture JSON without synthetic: true', () => {
    const repo = newRepo();
    repo.stage('packages/schema/fixtures/unflagged.json', '{"n": 1}');
    const result = runStep(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packages/schema/fixtures/unflagged.json');
  });

  it('passes (exit 0) on the flagged fixture', () => {
    const repo = newRepo();
    repo.stage('packages/schema/fixtures/flagged.json', '{"synthetic": true, "n": 1}');
    expect(runStep(repo).status).toBe(0);
  });

  it('passes on the repository checkout itself', () => {
    const result = spawnSync(process.execPath, [resolve(REPO_ROOT, 'tools/hygiene/synthetic-flag.mjs')], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
