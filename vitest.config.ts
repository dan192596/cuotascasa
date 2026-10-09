import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const STRICT = { lines: 95, branches: 95, functions: 95, statements: 95 };
const FULL = { lines: 100, branches: 100, functions: 100, statements: 100 };

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.test-d.ts', '**/testing/**', '**/contract/**'],
      reporter: ['text-summary', 'lcov'],
      thresholds: {
        'packages/domain/src/**': STRICT,
        'packages/domain/src/money/**': FULL,
        'packages/domain/src/dates/**': FULL,
        'packages/schema/src/**': STRICT,
        'packages/sync/src/**': STRICT,
      },
    },
    projects: [
      'packages/*/vitest.config.ts',
      'tools/conformance/vitest.config.{ts,mts}',
      {
        test: {
          name: 'tools',
          environment: 'node',
          include: ['tools/**/*.spec.{ts,mts,mjs}'],
          exclude: ['**/node_modules/**', 'tools/conformance/**', 'tools/lint-fixtures/**', 'tools/oracle/**'],
        },
      },
      {
        // Run only by `pnpm test:browser`; `test` and `test:coverage` exclude it (v8 covers only Chromium).
        test: {
          name: 'sync-browser',
          include: ['packages/sync/src/**/*.browser.spec.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }, { browser: 'webkit' }],
          },
        },
      },
    ],
  },
});
