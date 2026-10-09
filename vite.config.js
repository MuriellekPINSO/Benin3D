import { defineConfig } from 'vite';
import { langue } from './scripts/i18n/vite-langue.mjs';

// base relative : le dossier dist/ fonctionne à n'importe quelle adresse.
export default defineConfig({
  base: './',
  // LANGUE=en : version anglaise (scripts/i18n/construire.mjs la construit dans dist/en/).
  plugins: [langue(process.env.LANGUE)],
  build: { chunkSizeWarningLimit: 1200 },
});
