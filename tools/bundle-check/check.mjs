// @ts-check
// Usage: node tools/bundle-check/check.mjs [--dist <dir>] [--config <file>] [--budget-landing <bytes>]
//   --dist            build output (default dist/apps/web); reads browser-stats.json and browser/<chunks>
//   --config          rules (default tools/bundle-check/config.json)
//   --budget-landing  overrides the gzip budget, in bytes, of the first graph (landing)
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, gzipLength } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (/** @type {string} */ name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

try {
  const dist = resolve(flag('--dist') ?? 'dist/apps/web');
  const configPath = resolve(flag('--config') ?? join(dirname(fileURLToPath(import.meta.url)), 'config.json'));
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const budget = flag('--budget-landing');
  if (budget !== undefined) {
    if (!/^\d+$/.test(budget)) throw new Error(`--budget-landing must be a number of bytes, got "${budget}"`);
    config.graphs[0].budgetGzipBytes = Number(budget);
  }
  const metafile = JSON.parse(readFileSync(join(dist, 'browser-stats.json'), 'utf8'));
  const { violations, report } = analyze(metafile, config, (file) =>
    gzipLength(readFileSync(join(dist, 'browser', file))),
  );
  for (const r of report) {
    const budget = r.budgetGzipBytes === undefined ? '' : ` / budget ${(r.budgetGzipBytes / 1024).toFixed(2)} kB`;
    console.log(
      `bundle-check: ${r.graph}: ${r.files.length} chunks, initial JS ${(r.gzipBytes / 1024).toFixed(2)} kB gzip${budget}`,
    );
    for (const f of r.files) console.log(`  ${f}`);
  }
  for (const v of violations) console.error(`bundle-check: ${v.graph}: [${v.rule}] ${v.message}`);
  if (violations.length > 0) process.exit(1);
  console.log('bundle-check: OK');
} catch (error) {
  console.error(`bundle-check: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
