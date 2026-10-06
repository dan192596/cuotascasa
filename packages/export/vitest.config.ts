import { defineProject } from 'vitest/config';

// Proyecto `export` del vitest.config.ts raíz (W0-01). La cobertura y sus umbrales solo se configuran en la raíz.
export default defineProject({
  test: {
    name: 'export',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
});
