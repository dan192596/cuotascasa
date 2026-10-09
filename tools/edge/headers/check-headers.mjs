// @ts-check
// Final security headers check (ADR-0021): exact CSP + Trusted Types per route, one CSP per response, no report-only,
// baseline headers on every route. Picked up by `pnpm edge:check` (tools/edge/**/check*.mjs).
// Usage: node tools/edge/headers/check-headers.mjs [--base-url <https://host>] [--port 8799] [--assets <dir>]
//   without --base-url: serves the build with `wrangler dev --local`. If the build's _headers still has hash slots
//     (generate.mjs has not run), a temporary copy is generated and served; the build itself is never modified.
//   with --base-url:    checks an already running or deployed origin; hashes come from the HTML it serves.
// Exit codes: 0 pass, 1 failures, 2 usage or startup error.
import { DEFAULT_PORT, parseArgs } from '../lib.mjs';
import { startEdge } from '../serve.mjs';
import { runHeaderChecks } from './assertions.mjs';
import { prepareAssets } from './prepare.mjs';

// Not 8799: check-routing and the W2-11 e2e use it.
const HEADERS_PORT = 8798;

/** @type {{ stop: () => void } | undefined} */
let edge;
let cleanup = () => {};
try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/edge/headers/check-headers.mjs [--base-url <url>] [--port <n>] [--assets <dir>]');
    process.exit(0);
  }
  let baseUrl = args.baseUrl;
  if (baseUrl === undefined) {
    const prepared = prepareAssets(args.assets);
    cleanup = prepared.cleanup;
    edge = await startEdge({ port: args.port === DEFAULT_PORT ? HEADERS_PORT : args.port, assets: prepared.dir });
    baseUrl = edge.baseUrl;
  }
  const { ok, failures, checked } = await runHeaderChecks(baseUrl);
  edge?.stop();
  cleanup();
  if (!ok) {
    console.error(`edge:check (headers) FAILED against ${baseUrl}:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`edge:check headers ok: ${checked} requests against ${baseUrl}`);
} catch (error) {
  edge?.stop();
  cleanup();
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
