import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'sync',
    include: ['src/**/*.spec.ts'],
    exclude: ['src/**/*.browser.spec.ts'],
  },
});
