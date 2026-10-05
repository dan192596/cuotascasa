// @ts-check
// Dependency policy check (ADR-0010 §3): every manifest uses `catalog:` and the catalog pins exact versions.
import { existsSync, globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** @typedef {{ file: string, message: string }} Violation */
/** @typedef {{ packages: string[], catalog: Record<string, string> }} Workspace */

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const INTERNAL_SCOPE = '@cuotascasa/';

/**
 * Strips one level of single or double quotes from a YAML scalar.
 * @param {string} value
 * @returns {string}
 */
function unquote(value) {
  const trimmed = value.trim();
  const quoted = /^'(.*)'$/.exec(trimmed) ?? /^"(.*)"$/.exec(trimmed);
  return quoted ? (quoted[1] ?? '') : trimmed;
}

/**
 * Parses the YAML subset used by pnpm-workspace.yaml: top-level keys whose children are either a block
 * sequence of scalars (`  - item`) or a block mapping of scalars (`  key: value`). Anything else throws,
 * so the file stays simple enough to be checked without a YAML dependency.
 * @param {string} text
 * @returns {Record<string, string[] | Record<string, string>>}
 */
export function parseWorkspaceYaml(text) {
  /** @type {Record<string, string[] | Record<string, string>>} */
  const result = {};
  /** @type {string | null} */
  let key = null;
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.startsWith('#') ? '' : raw.replace(/\s+#.*$/, '');
    if (line.trim() === '') return;
    const where = `pnpm-workspace.yaml line ${index + 1}`;
    const top = /^([A-Za-z][\w-]*):$/.exec(line.trimEnd());
    if (top) {
      key = top[1] ?? '';
      result[key] = [];
      return;
    }
    const current = key === null ? undefined : result[key];
    const item = /^ {2}- (.+)$/.exec(line);
    if (item && Array.isArray(current)) {
      current.push(unquote(item[1] ?? ''));
      return;
    }
    const entry = /^ {2}('[^']+'|"[^"]+"|[^\s:'"][^:]*):\s+(\S.*)$/.exec(line);
    if (entry && key !== null && current !== undefined && !(Array.isArray(current) && current.length > 0)) {
      const mapping = Array.isArray(current) ? {} : current;
      mapping[unquote(entry[1] ?? '')] = unquote(entry[2] ?? '');
      result[key] = mapping;
      return;
    }
    throw new Error(`${where}: unsupported syntax: ${raw.trim()}`);
  });
  return result;
}

/**
 * Reads `packages` and the default `catalog` from <root>/pnpm-workspace.yaml.
 * @param {string} root
 * @returns {Workspace}
 */
export function readWorkspace(root) {
  const parsed = parseWorkspaceYaml(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'));
  const packages = parsed['packages'];
  const catalog = parsed['catalog'];
  if (!Array.isArray(packages) || packages.length === 0) {
    throw new Error('pnpm-workspace.yaml: `packages` must be a non-empty list');
  }
  if (catalog === undefined || Array.isArray(catalog)) {
    throw new Error('pnpm-workspace.yaml: `catalog` must be a mapping of package → exact version');
  }
  return { packages, catalog };
}

/**
 * Lists the root manifest and every workspace project manifest, relative to root.
 * @param {string} root
 * @param {string[]} patterns pnpm `packages` globs
 * @returns {string[]}
 */
export function findManifests(root, patterns) {
  const manifests = new Set(['package.json']);
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) throw new Error(`pnpm-workspace.yaml: negated pattern not supported: ${pattern}`);
    for (const dir of globSync(pattern, { cwd: root }).sort()) {
      const manifest = join(dir, 'package.json');
      if (existsSync(join(root, manifest))) manifests.add(manifest);
    }
  }
  return [...manifests];
}

/**
 * Checks the workspace at root and returns every violation of the dependency policy.
 * @param {string} root
 * @returns {Violation[]}
 */
export function checkWorkspace(root) {
  const { packages, catalog } = readWorkspace(root);
  /** @type {Violation[]} */
  const violations = [];
  for (const [name, version] of Object.entries(catalog)) {
    if (!EXACT_VERSION.test(version)) {
      violations.push({
        file: 'pnpm-workspace.yaml',
        message: `catalog entry ${name} must pin an exact version, got "${version}"`,
      });
    }
  }
  const manifestFiles = findManifests(root, packages);
  /** @type {Map<string, Record<string, unknown>>} */
  const manifests = new Map(manifestFiles.map((file) => [file, JSON.parse(readFileSync(join(root, file), 'utf8'))]));
  const internalNames = new Set(
    [...manifests.values()].map((manifest) => manifest['name']).filter((name) => typeof name === 'string'),
  );
  for (const [file, manifest] of manifests) {
    for (const field of DEPENDENCY_FIELDS) {
      const deps = manifest[field];
      if (deps === undefined) continue;
      for (const [name, spec] of Object.entries(/** @type {Record<string, string>} */ (deps))) {
        if (name.startsWith(INTERNAL_SCOPE)) {
          if (spec !== 'workspace:*') {
            violations.push({ file, message: `${field}.${name} must be "workspace:*", got "${spec}"` });
          } else if (!internalNames.has(name)) {
            violations.push({ file, message: `${field}.${name} is not a workspace package` });
          }
        } else if (spec !== 'catalog:') {
          violations.push({ file, message: `${field}.${name} must use "catalog:", got "${spec}"` });
        } else if (!(name in catalog)) {
          violations.push({ file, message: `${field}.${name} uses "catalog:" but the catalog has no entry for it` });
        }
      }
    }
  }
  return violations;
}
