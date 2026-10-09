import { afterEach, describe, expect, it } from 'vitest';
import { emailOf } from './noreply.mjs';
import { TempRepo } from './testing.js';

const repos: TempRepo[] = [];
afterEach(() => repos.splice(0).forEach((repo) => repo.dispose()));

function newRepo(email?: string, env: Record<string, string> = {}) {
  const repo = new TempRepo(email, env);
  repos.push(repo);
  return repo;
}

describe('noreply.mjs CLI', () => {
  it('passes for a noreply address', () => {
    expect(newRepo('1234+someone@users.noreply.github.com').run('noreply.mjs').status).toBe(0);
  });

  it('fails for a non-noreply address', () => {
    const result = newRepo('someone@example.com').run('noreply.mjs');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('GIT_AUTHOR_IDENT');
    expect(result.stderr).not.toContain('someone@example.com');
  });

  it('fails when the author override in the environment is not noreply, even if user.email is', () => {
    const repo = newRepo('ok@users.noreply.github.com');
    const result = repo.run('noreply.mjs', { GIT_AUTHOR_EMAIL: 'other@example.com' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('GIT_AUTHOR_IDENT');
    expect(result.stderr).not.toContain('GIT_COMMITTER_IDENT');
  });

  it('fails when the committer override is not noreply', () => {
    const result = newRepo('ok@users.noreply.github.com').run('noreply.mjs', {
      GIT_COMMITTER_EMAIL: 'other@example.com',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('GIT_COMMITTER_IDENT');
  });

  it('fails when a suffix lookalike is used', () => {
    expect(newRepo('x@users.noreply.github.com.evil.test').run('noreply.mjs').status).toBe(1);
  });

  it('fails when no identity can be determined', () => {
    const repo = newRepo('');
    const result = repo.run('noreply.mjs', { GIT_AUTHOR_NAME: 'N', GIT_COMMITTER_NAME: 'N', EMAIL: '' });
    expect(result.status).toBe(1);
  });
});

describe('emailOf', () => {
  it('extracts the address from a git ident line', () => {
    expect(emailOf('Name <a@b.test> 1700000000 +0000')).toBe('a@b.test');
    expect(emailOf('no address here')).toBeNull();
  });
});
