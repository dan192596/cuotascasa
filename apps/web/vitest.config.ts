import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

const WEB_ANCHOR = fileURLToPath(new URL('./src/main.ts', import.meta.url));

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
      return this.resolve(source, WEB_ANCHOR, { ...options, skipSelf: true });
    },
  };
}

export default defineConfig({
  plugins: [resolveFromAppsWeb()],
});
