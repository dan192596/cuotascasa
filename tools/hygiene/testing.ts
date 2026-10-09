// Helpers shared by the hygiene specs: throwaway git repos and CLI runs. Synthetic data only.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const HYGIENE_DIR = resolve(import.meta.dirname);

/** A minimal environment: no global git config, no inherited identity, so results do not depend on the machine. */
export function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env['PATH'],
    HOME: tmpdir(),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    ...extra,
  };
  return env;
}

export class TempRepo {
  readonly dir = mkdtempSync(join(tmpdir(), 'hygiene-repo-'));
  readonly env: NodeJS.ProcessEnv;

  constructor(email = 'tester@users.noreply.github.com', extraEnv: Record<string, string> = {}) {
    this.env = cleanEnv(extraEnv);
    this.git('init', '-q');
    if (email !== '') this.git('config', 'user.email', email);
    this.git('config', 'user.name', 'Synthetic Tester');
  }

  git(...args: string[]) {
    const result = spawnSync('git', args, { cwd: this.dir, env: this.env, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout;
  }

  write(path: string, content: string) {
    const full = join(this.dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }

  stage(path: string, content: string) {
    this.write(path, content);
    this.git('add', '-f', path);
  }

  /** Runs a hygiene entrypoint (e.g. `denylist.mjs`) with this repo as cwd. */
  run(entrypoint: string, extraEnv: Record<string, string> = {}) {
    return spawnSync(process.execPath, [join(HYGIENE_DIR, entrypoint)], {
      cwd: this.dir,
      env: { ...this.env, ...extraEnv },
      encoding: 'utf8',
    });
  }

  dispose() {
    rmSync(this.dir, { recursive: true, force: true });
  }
}
