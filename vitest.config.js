import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'bot',
          environment: 'node',
          include: ['tests/**/*.test.js'],
          // Inchangé : `tests/fixtures/` contient des `.test.js` délibérément
          // invalides (ex. epsilon/commands/ping.test.js, qui prouve le filtre
          // d'applyConventions) : ce ne sont pas de vraies suites.
          exclude: ['**/node_modules/**', 'tests/fixtures/**'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          globals: true,
          include: ['web/src/**/*.test.{ts,tsx}'],
          setupFiles: ['web/src/test-setup.ts'],
        },
      },
    ],
    // La couverture reste sur le bot : la mesurer sur le front demanderait un
    // fournisseur supplémentaire, pour aucun usage actuel.
    coverage: { include: ['src/**/*.js'] },
  },
});
