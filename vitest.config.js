import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'plugins/**/*.test.js', 'tests/**/*.test.js'],
    coverage: { include: ['src/**/*.js'], exclude: ['src/**/*.test.js'] },
  },
});
