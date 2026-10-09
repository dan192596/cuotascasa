import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

const WEB_ANCHOR = fileURLToPath(new URL('./src/main.ts', import.meta.url));
/**
 * The unit-test builder emits shared chunks at the repo root, where a bare import of a package's own dependency (dexie,
 * zod, …) cannot resolve. Fall back to each workspace package, in order, so specs can run the real adapters. Test-only:
 * the production build resolves from each importer's real path, and lint still enforces the dependency matrix.
 */
const PACKAGE_ANCHORS = ['domain', 'schema', 'persistence', 'sync', 'export'].map((name) =>
  fileURLToPath(new URL(`../../packages/${name}/package.json`, import.meta.url)),
);

function resolveFromAppsWeb(): Plugin {
  return {
    name: 'cuotascasa:resolve-from-apps-web',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (source.startsWith('.') || source.startsWith('/') || source.startsWith('\0') || source.includes(':')) {
        return null;
      }
      const direct = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (direct) {
        return direct;
      }
      for (const anchor of [WEB_ANCHOR, ...PACKAGE_ANCHORS]) {
        const resolved = await this.resolve(source, anchor, { ...options, skipSelf: true });
        if (resolved) {
          return resolved;
        }
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [resolveFromAppsWeb()],
});
