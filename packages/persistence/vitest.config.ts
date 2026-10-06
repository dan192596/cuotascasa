import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'persistence',
    include: ['src/**/*.spec.ts'],
  },
});
