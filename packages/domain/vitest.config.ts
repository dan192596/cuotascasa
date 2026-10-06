import { defineProject } from 'vitest/config';

// Proyecto `domain` del vitest.config.ts raíz (W0-01). La cobertura y sus umbrales solo se configuran en la raíz.
export default defineProject({
  test: {
    name: 'domain',
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts', 'test/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
});
