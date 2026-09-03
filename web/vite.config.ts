import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // En développement, le bot tourne sur 3000 et Vite sur 5173. Le proxy
    // fait voir au navigateur une seule origine, ce qui vaut aussi pour le
    // cookie de session posé par /auth/callback.
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
    },
  },
});
