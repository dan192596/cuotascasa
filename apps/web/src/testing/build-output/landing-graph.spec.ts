import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Metafile proof of ADR-0011 decision 5. Run after `pnpm build` with `ng test --configuration=dist`. */
interface MetafileOutput {
  readonly entryPoint?: string;
  readonly imports: readonly { readonly path: string; readonly kind: string }[];
  readonly inputs: Readonly<Record<string, unknown>>;
}

const META = JSON.parse(readFileSync('dist/apps/web/browser-stats.json', 'utf8')) as {
  readonly outputs: Readonly<Record<string, MetafileOutput>>;
};

function outputOf(entryPoint: string): string {
  const match = Object.entries(META.outputs).find(([, output]) => output.entryPoint === entryPoint);
  if (!match) {
    throw new Error(`No output chunk has entryPoint ${entryPoint}`);
  }
  return match[0];
}

/** Output files reachable from `starts` through static imports only (what the browser loads up front). */
function staticGraph(starts: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const pending = [...starts];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    for (const dependency of META.outputs[file]?.imports ?? []) {
      if (dependency.kind === 'import-statement') {
        pending.push(dependency.path);
      }
    }
  }
  return seen;
}

const LANDING = staticGraph([
  outputOf('apps/web/src/main.ts'),
  outputOf('apps/web/src/app/public/landing/landing-page.component.ts'),
]);
const LANDING_INPUTS = [...LANDING].flatMap((file) => Object.keys(META.outputs[file]?.inputs ?? {}));

describe('landing initial graph (main.ts + the "/" route chunk)', () => {
  it('loads app-area.routes.ts only as its own lazy chunk', () => {
    expect(outputOf('apps/web/src/app/app-area.routes.ts')).toBeTruthy();
    expect(LANDING_INPUTS.filter((input) => input.endsWith('apps/web/src/app/app-area.routes.ts'))).toEqual([]);
  });

  it('contains no dexie and no @cuotascasa/sync', () => {
    expect(LANDING_INPUTS.filter((input) => /(^|\/)dexie(@|\/)/.test(input))).toEqual([]);
    expect(LANDING_INPUTS.filter((input) => /(^|\/)packages\/sync\/|@cuotascasa\/sync/.test(input))).toEqual([]);
  });

  it('contains nothing from data/ (the data layer is a route provider of /app)', () => {
    expect(LANDING_INPUTS.filter((input) => input.startsWith('apps/web/src/app/data/'))).toEqual([]);
  });
});
