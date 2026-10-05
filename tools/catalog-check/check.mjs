// @ts-check
// Usage: node tools/catalog-check/check.mjs [--root <dir>]   (default root: current directory)
import { resolve } from 'node:path';
import { checkWorkspace } from './lib.mjs';

const rootFlag = process.argv.indexOf('--root');
const root = resolve(rootFlag === -1 ? '.' : (process.argv[rootFlag + 1] ?? '.'));

try {
  const violations = checkWorkspace(root);
  for (const { file, message } of violations) console.error(`catalog-check: ${file}: ${message}`);
  if (violations.length > 0) process.exit(1);
  console.log('catalog-check: every dependency uses catalog: (exact pins) or workspace:*');
} catch (error) {
  console.error(`catalog-check: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
