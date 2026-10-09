import { defineConfig, loadEnv } from 'vite';
import { langue } from './scripts/i18n/vite-langue.mjs';

// /api/fedapay (vérification des paiements MoMo) : en ligne, c'est une fonction Vercel (api/fedapay.js) ;
// en local, `npm run dev` et `npm run preview` la servent eux-mêmes, avec la clé de .env.local.
const apiLocale = () => {
  const brancher = server => {
    Object.assign(process.env, loadEnv('development', process.cwd(), 'FEDAPAY_'));
    server.middlewares.use('/api/fedapay', async (req, res) => (await import('./api/fedapay.js')).default(req, res));
  };
  return { name: 'api-locale', configureServer: brancher, configurePreviewServer: brancher };
};

// base relative : le dossier dist/ fonctionne à n'importe quelle adresse.
export default defineConfig({
  base: './',
  // LANGUE=en : version anglaise (scripts/i18n/construire.mjs la construit dans dist/en/).
  plugins: [langue(process.env.LANGUE), apiLocale()],
  build: { chunkSizeWarningLimit: 1200 },
});
