import { defineProject } from 'vitest/config';

// Picked up by the root vitest.config.ts (projects: 'tools/conformance/vitest.config.{ts,mts}'); `pnpm conformance`
// runs only this project.
export default defineProject({
  test: {
    name: 'conformance',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
