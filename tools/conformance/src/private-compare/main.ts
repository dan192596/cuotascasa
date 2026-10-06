import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createPublicEngine } from '../engine-adapter.ts';
import { REPO_ROOT } from '../paths.ts';
import { runPrivateCompare } from './run.ts';

function localToday(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const run = runPrivateCompare(process.argv.slice(2), {
  readFile: (path) => readFileSync(path, 'utf8'),
  // .native canonicalizes letter case on case-insensitive file systems, so a case variant of the repo path is
  // recognized as inside.
  realPath: (path) => realpathSync.native(path),
  exists: (path) => existsSync(path),
  engine: createPublicEngine(),
  today: localToday,
  repoRoot: REPO_ROOT,
});
process.stdout.write(run.stdout);
process.stderr.write(run.stderr);
process.exitCode = run.exitCode;
