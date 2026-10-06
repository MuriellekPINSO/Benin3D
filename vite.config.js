import { defineConfig } from 'vite';

// base relative : le dossier dist/ fonctionne à n'importe quelle adresse.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
});
