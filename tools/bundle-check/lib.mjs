// @ts-check
// Bundle composition and budget check over the esbuild metafile that `ng build` writes (browser-stats.json).
import { gzipSync } from 'node:zlib';

/**
 * @typedef {{ id: string, pattern: string }} ForbiddenRule
 * @typedef {{ id: string, name: string, roots: string[], forbidden: ForbiddenRule[], budgetGzipBytes?: number }} GraphConfig
 * @typedef {{ graphs: GraphConfig[] }} Config
 * @typedef {{ graph: string, rule: string, message: string }} Violation
 * @typedef {{ imports?: { path: string, kind: string, external?: boolean }[], inputs?: Record<string, unknown>, entryPoint?: string }} MetaOutput
 * @typedef {{ outputs: Record<string, MetaOutput> }} Metafile
 */

const STATIC_KINDS = new Set(['import-statement', 'require-call']);
const isJs = (/** @type {string} */ file) => /\.(?:m?js)$/.test(file);

/**
 * Static import closure of every output whose entryPoint ends with one of `roots`. Dynamic imports are not followed:
 * they are separate chunks that load later, not part of the initial graph.
 * @param {Metafile} metafile
 * @param {string[]} roots
 * @returns {{ files: Set<string>, missing: string[] }}
 */
export function resolveGraph(metafile, roots) {
  const files = new Set();
  const missing = [];
  const stack = [];
  for (const root of roots) {
    const matches = Object.entries(metafile.outputs)
      .filter(
        ([, out]) => out.entryPoint !== undefined && (out.entryPoint === root || out.entryPoint.endsWith(`/${root}`)),
      )
      .map(([file]) => file);
    if (matches.length === 0) missing.push(root);
    stack.push(...matches);
  }
  while (stack.length > 0) {
    const file = /** @type {string} */ (stack.pop());
    if (files.has(file)) continue;
    files.add(file);
    for (const imp of metafile.outputs[file]?.imports ?? []) {
      if (imp.external || !STATIC_KINDS.has(imp.kind)) continue;
      if (metafile.outputs[imp.path] !== undefined) stack.push(imp.path);
    }
  }
  return { files, missing };
}

/**
 * @param {Metafile} metafile
 * @param {Config} config
 * @param {(file: string) => number} gzipSize gzip size in bytes of an output file
 * @returns {{ violations: Violation[], report: { graph: string, files: string[], gzipBytes: number, budgetGzipBytes?: number }[] }}
 */
export function analyze(metafile, config, gzipSize) {
  /** @type {Violation[]} */
  const violations = [];
  const report = [];
  for (const graph of config.graphs) {
    const rules = graph.forbidden.map((rule) => {
      try {
        return { id: rule.id, re: new RegExp(rule.pattern) };
      } catch {
        throw new Error(`invalid pattern for rule "${rule.id}" in graph "${graph.name}": ${rule.pattern}`);
      }
    });
    const { files, missing } = resolveGraph(metafile, graph.roots);
    for (const root of missing) {
      violations.push({
        graph: graph.name,
        rule: 'missing-root',
        message: `no output has entry point "${root}" (renamed or removed?)`,
      });
    }
    const sorted = [...files].sort();
    for (const file of sorted) {
      const out = metafile.outputs[file];
      const subjects = [
        ...Object.keys(out?.inputs ?? {}),
        ...(out?.imports ?? []).filter((i) => i.external).map((i) => i.path),
      ];
      for (const rule of rules) {
        const hit = subjects.find((s) => rule.re.test(s));
        if (hit !== undefined) {
          violations.push({
            graph: graph.name,
            rule: rule.id,
            message: `forbidden "${rule.id}" in ${file} (via ${hit})`,
          });
        }
      }
    }
    const gzipBytes = sorted.filter(isJs).reduce((sum, file) => sum + gzipSize(file), 0);
    if (graph.budgetGzipBytes !== undefined && gzipBytes > graph.budgetGzipBytes) {
      violations.push({
        graph: graph.name,
        rule: 'budget',
        message: `initial JS is ${gzipBytes} B gzip, over the budget of ${graph.budgetGzipBytes} B`,
      });
    }
    report.push({ graph: graph.name, files: sorted, gzipBytes, budgetGzipBytes: graph.budgetGzipBytes });
  }
  return { violations, report };
}

/** @param {Buffer | string} content */
export const gzipLength = (content) => gzipSync(content, { level: 9 }).length;
