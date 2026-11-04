import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.eval.ts'],
    testTimeout: 120_000,
    hookTimeout: 30_000,
    reporters: ['verbose'],
    sequence: {
      concurrent: false,
    },
  },
});
