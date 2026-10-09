// @ts-check
// Throwaway spike code (W1-08, retired in W7-01). Builds the web app in a scratch copy of the workspace so that
// angular.json, app.config.ts and the landing page (read-only contracts of this card) are never touched.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * `csrOnly` drops `server` and `outputMode` (no prerender): the only shape in which the Angular CLI accepts autoCsp.
 * @typedef {{ id: string, autoCsp: boolean, probe: boolean, csrOnly: boolean }} BuildVariant
 */

/** @type {BuildVariant[]} */
export const BUILD_VARIANTS = [
  { id: 'plain', autoCsp: false, probe: false, csrOnly: false },
  { id: 'probe', autoCsp: false, probe: true, csrOnly: false },
  { id: 'autocsp-ssr', autoCsp: true, probe: false, csrOnly: false },
  { id: 'autocsp-csr', autoCsp: true, probe: false, csrOnly: true },
];

const PROBE_TEMPLATE_FROM = "template: '<h1>CuotasCasa</h1><cc-quick-simulator />',";
const PROBE_TEMPLATE_TO =
  'template: \'<h1>CuotasCasa</h1><button type="button" (click)="probe()">probe</button><cc-quick-simulator />\',';

/**
 * Pure: applies the variant to the workspace config.
 * @param {string} angularJson
 * @param {BuildVariant} variant
 */
export function patchAngularJson(angularJson, variant) {
  const config = JSON.parse(angularJson);
  const options = config.projects.web.architect.build.options;
  if (variant.autoCsp) options.security = { autoCsp: true };
  if (variant.csrOnly) {
    delete options.server;
    delete options.outputMode;
  }
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * Pure: adds a click listener to the landing page so that withEventReplay() emits its inline scripts.
 * @param {string} source landing-page.component.ts
 */
export function addProbeListener(source) {
  if (!source.includes(PROBE_TEMPLATE_FROM)) throw new Error('landing page template changed: update the probe patch');
  return source
    .replace(PROBE_TEMPLATE_FROM, PROBE_TEMPLATE_TO)
    .replace('export class LandingPageComponent {}', 'export class LandingPageComponent {\n  probe(): void {}\n}');
}

/**
 * Builds every variant into `<scratch>/<id>/`. A variant the CLI refuses to build is reported, not thrown.
 * @param {string} repoRoot
 * @param {string} scratch
 * @returns {{ outputs: Record<string, string>, failures: Record<string, string> }}
 */
export function buildAll(repoRoot, scratch) {
  /** @type {Record<string, string>} */
  const outputs = {};
  /** @type {Record<string, string>} */
  const failures = {};
  for (const variant of BUILD_VARIANTS) {
    const workspace = mkdtempSync(join(tmpdir(), `csp-gis-${variant.id}-`));
    try {
      for (const entry of ['apps', 'packages', 'package.json', 'tsconfig.base.json', 'tsconfig.json']) {
        cpSync(join(repoRoot, entry), join(workspace, entry), {
          recursive: true,
          filter: (source) => !/(^|\/)(node_modules|dist)(\/|$)/.test(source.slice(repoRoot.length)),
        });
      }
      symlinkSync(join(repoRoot, 'node_modules'), join(workspace, 'node_modules'));
      for (const dir of ['apps/web', ...readdirSync(join(repoRoot, 'packages')).map((name) => `packages/${name}`)]) {
        const modules = join(repoRoot, dir, 'node_modules');
        if (existsSync(modules)) symlinkSync(modules, join(workspace, dir, 'node_modules'));
      }
      writeFileSync(
        join(workspace, 'angular.json'),
        patchAngularJson(readFileSync(join(repoRoot, 'angular.json'), 'utf8'), variant),
      );
      if (variant.probe) {
        const landing = join(workspace, 'apps/web/src/app/public/landing/landing-page.component.ts');
        writeFileSync(landing, addProbeListener(readFileSync(landing, 'utf8')));
      }
      const ng = join(repoRoot, 'node_modules/.bin/ng');
      const result = spawnSync(ng, ['build', '--output-path', join(scratch, variant.id)], {
        cwd: workspace,
        encoding: 'utf8',
        env: { ...process.env, NG_CLI_ANALYTICS: 'false', CI: '1' },
      });
      if (result.status !== 0) {
        failures[variant.id] = summarizeBuildFailure(`${result.stdout}\n${result.stderr}`);
        continue;
      }
      const browser = join(scratch, variant.id, 'browser');
      if (!existsSync(join(browser, 'index.html'))) throw new Error(`build ${variant.id}: no browser/index.html`);
      outputs[variant.id] = resolve(browser);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
  return { outputs, failures };
}

/**
 * Pure: the one-line reason of a failed `ng build`, without machine paths.
 * @param {string} output
 */
export function summarizeBuildFailure(output) {
  const reason = /\[FAILED: ([^\]]+)\]/.exec(output) ?? /\[ERROR\] ([^\n]+)/.exec(output);
  return reason ? reason[1].trim() : 'ng build failed';
}
