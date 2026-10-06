import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Standalone config: the root vitest.config.ts excludes tools/lint-fixtures (W0-01), so CI runs this one with
// `pnpm exec vitest run --config tools/lint-fixtures/vitest.config.ts`.
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    name: 'lint-fixtures',
    environment: 'node',
    include: ['tools/lint-fixtures/**/*.spec.ts'],
    testTimeout: 120_000,
  },
});
