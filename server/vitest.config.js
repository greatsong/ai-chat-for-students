import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['__tests__/**/*.test.js'],
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['**/*.js'],
      exclude: ['__tests__/', 'node_modules/', 'vitest.config.js'],
    },
  },
});
