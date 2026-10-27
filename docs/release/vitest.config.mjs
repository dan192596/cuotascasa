// Vitest project of the release documents (W7-01). Run: pnpm exec vitest run --config docs/release/vitest.config.mjs
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Keep Vite's cache in the workspace node_modules, not in a new docs/release/node_modules.
  cacheDir: '../../node_modules/.vite/release',
  test: {
    name: 'release',
    root: import.meta.dirname,
    environment: 'node',
    include: ['*.spec.mjs'],
  },
});
