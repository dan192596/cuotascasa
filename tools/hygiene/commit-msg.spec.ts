import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCommitMessage, COMMIT_TYPES } from './commit-msg.mjs';

describe('checkCommitMessage', () => {
  it.each([
    'feat(domain): núcleo del calendario (W1-01)',
    'fix: redondeo HALF_UP_2 en negativos',
    'build(workspace)!: fija el catálogo de dependencias',
    'wip(W1-01): falta la última fila',
    'docs(adr): ADR-0024 orden de combinación',
    'chore(hygiene): ajusta .gitignore\n\nCuerpo opcional.\n',
    '# comentario de git\nci: agrega el job de gitleaks',
    'Revert "feat(domain): núcleo del calendario"',
    "Merge branch 'main' into card/W1-01-x",
    'fixup! feat(domain): núcleo del calendario',
    'squash! feat(domain): núcleo del calendario',
    'amend! feat(domain): núcleo del calendario',
    'Reapply "feat(domain): núcleo del calendario"',
    `feat(domain): ${'x'.repeat(86)}`, // header of exactly 100 characters
  ])('accepts %j', (message) => {
    expect(checkCommitMessage(message)).toBeNull();
  });

  it.each([
    'update stuff',
    'feat: ',
    'feature(domain): tipo desconocido',
    'feat(domain):sin espacio',
    'Feat(domain): mayúscula',
    '',
    `feat(domain): ${'x'.repeat(100)}`,
    `feat(domain): ${'x'.repeat(87)}`, // header of exactly 101 characters
  ])('rejects %j', (message) => {
    expect(checkCommitMessage(message)).toMatch(/^commit-msg: /);
  });
});

describe('COMMIT_TYPES', () => {
  it('lists exactly the types ADR-0018 allows', () => {
    expect([...COMMIT_TYPES]).toEqual([
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
    ]);
  });
});

describe('commit-msg.mjs CLI', () => {
  function runWith(message: string) {
    const dir = mkdtempSync(join(tmpdir(), 'commit-msg-'));
    const file = join(dir, 'COMMIT_EDITMSG');
    writeFileSync(file, message);
    const result = spawnSync(process.execPath, ['tools/hygiene/commit-msg.mjs', file], { encoding: 'utf8' });
    rmSync(dir, { recursive: true, force: true });
    return result;
  }

  it('exits 0 for a conventional message', () => {
    expect(runWith('test(hygiene): cubre el hook commit-msg\n').status).toBe(0);
  });

  it('exits 2 with usage when no file is given', () => {
    const result = spawnSync(process.execPath, ['tools/hygiene/commit-msg.mjs'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('usage:');
  });

  it('exits 1 and explains the format for a non-conventional message', () => {
    const result = runWith('arreglos varios\n');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is not a conventional commit');
  });
});
