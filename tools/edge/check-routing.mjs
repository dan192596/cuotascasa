// @ts-check
// Edge routing check (ADR-0002, ADR-0022). Status/body/header assertions on the real static-assets behavior.
// Usage: node tools/edge/check-routing.mjs [--base-url <https://host>] [--port 8799] [--assets <dir>]
//   without --base-url: starts `wrangler dev --local` on the production build (run `pnpm build` first)
//   with --base-url:    checks an already running or deployed origin; nothing is started
// Exit codes: 0 all rows pass, 1 failures, 2 usage or startup error.
import { parseArgs, runChecks } from './lib.mjs';
import { startEdge } from './serve.mjs';

/** @type {{ stop: () => void } | undefined} */
let edge;
try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/edge/check-routing.mjs [--base-url <url>] [--port <n>] [--assets <dir>]');
    process.exit(0);
  }
  let baseUrl = args.baseUrl;
  if (baseUrl === undefined) {
    edge = await startEdge({ port: args.port, assets: args.assets });
    baseUrl = edge.baseUrl;
  }
  const { ok, failures, checked } = await runChecks(baseUrl);
  edge?.stop();
  if (!ok) {
    console.error(`edge:check FAILED against ${baseUrl}:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`edge:check ok: ${checked} requests against ${baseUrl}`);
} catch (error) {
  edge?.stop();
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
