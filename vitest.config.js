import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Les fixtures de `tests/fixtures/` peuvent contenir des `.test.js`
    // délibérément invalides (ex. epsilon/commands/ping.test.js, qui prouve
    // le filtre d'applyConventions) : ce ne sont pas de vraies suites.
    exclude: ['**/node_modules/**', 'tests/fixtures/**'],
    coverage: { include: ['src/**/*.js'] },
  },
});
