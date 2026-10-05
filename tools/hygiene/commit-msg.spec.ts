import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCommitMessage } from './commit-msg.mjs';

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
  ])('rejects %j', (message) => {
    expect(checkCommitMessage(message)).toMatch(/^commit-msg: /);
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

  it('exits 1 and explains the format for a non-conventional message', () => {
    const result = runWith('arreglos varios\n');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is not a conventional commit');
  });
});
