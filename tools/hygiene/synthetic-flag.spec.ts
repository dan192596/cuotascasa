import { afterEach, describe, expect, it } from 'vitest';
import { checkSyntheticFlag } from './synthetic-flag.mjs';
import { TempRepo } from './testing.js';

const repos: TempRepo[] = [];
afterEach(() => repos.splice(0).forEach((repo) => repo.dispose()));

function newRepo() {
  const repo = new TempRepo();
  repos.push(repo);
  return repo;
}

describe('synthetic-flag.mjs CLI', () => {
  it('passes on a clean tree without fixtures', () => {
    const repo = newRepo();
    repo.stage('README.md', 'x\n');
    expect(repo.run('synthetic-flag.mjs').status).toBe(0);
  });

  it('passes when every fixture JSON carries synthetic: true', () => {
    const repo = newRepo();
    repo.stage('packages/schema/fixtures/a.json', '{"synthetic": true, "n": 1}');
    repo.stage('docs/specs/algorithm-examples/core/b.json', '{"synthetic": true}');
    repo.write('e2e/fixtures/c.json', '{"synthetic": true}');
    expect(repo.run('synthetic-flag.mjs').status).toBe(0);
  });

  it('fails for a staged fixture without synthetic: true', () => {
    const repo = newRepo();
    repo.stage('packages/schema/fixtures/a.json', '{"n": 1}');
    const result = repo.run('synthetic-flag.mjs');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packages/schema/fixtures/a.json');
  });

  it('fails for synthetic: "true", nested flags, arrays and invalid JSON', () => {
    const repo = newRepo();
    repo.stage('tools/oracle/fixtures/a.json', '{"synthetic": "true"}');
    repo.stage('tools/oracle/fixtures/b.json', '{"data": {"synthetic": true}}');
    repo.stage('tools/oracle/fixtures/c.json', '[{"synthetic": true}]');
    repo.stage('tools/oracle/fixtures/d.json', '{oops');
    const result = repo.run('synthetic-flag.mjs');
    expect(result.status).toBe(1);
    for (const name of ['a', 'b', 'c', 'd']) expect(result.stderr).toContain(`tools/oracle/fixtures/${name}.json`);
  });

  it('judges the staged content, not the working tree', () => {
    const repo = newRepo();
    repo.stage('e2e/fixtures/a.json', '{"n": 1}');
    repo.write('e2e/fixtures/a.json', '{"synthetic": true}');
    expect(repo.run('synthetic-flag.mjs').status).toBe(1);
  });

  it('ignores JSON outside the fixture directories', () => {
    const repo = newRepo();
    repo.stage('package.json', '{}');
    expect(repo.run('synthetic-flag.mjs').status).toBe(0);
  });

  it('fails when a file under a fixture dir would be ignored by git', () => {
    const repo = newRepo();
    repo.stage('.gitignore', '*.csv\n');
    repo.write('packages/schema/fixtures/x.csv', 'a,b\n');
    const result = repo.run('synthetic-flag.mjs');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packages/schema/fixtures/x.csv');
    expect(result.stderr).toContain('ignored by git');
  });

  it('passes when the ignore rule is negated for the fixture dir', () => {
    const repo = newRepo();
    repo.stage('.gitignore', '*.csv\n!tools/oracle/fixtures/**/*.csv\n');
    repo.write('tools/oracle/fixtures/x.csv', 'a,b\n');
    expect(repo.run('synthetic-flag.mjs').status).toBe(0);
  });

  it('ignores ignored files outside the fixture directories', () => {
    const repo = newRepo();
    repo.stage('.gitignore', '*.csv\n');
    repo.write('elsewhere/x.csv', 'a,b\n');
    expect(repo.run('synthetic-flag.mjs').status).toBe(0);
  });
});

describe('checkSyntheticFlag', () => {
  it('returns null only for an object with synthetic === true', () => {
    expect(checkSyntheticFlag('f.json', '{"synthetic":true}')).toBeNull();
    expect(checkSyntheticFlag('f.json', '{"synthetic":false}')).toContain('missing');
    expect(checkSyntheticFlag('f.json', 'null')).toContain('top level');
  });
});
