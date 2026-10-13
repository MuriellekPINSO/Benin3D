import { defineConfig, loadEnv } from 'vite';
import { langue } from './scripts/i18n/vite-langue.mjs';

// /api/fedapay (vérification des paiements MoMo) : en ligne, c'est une fonction Vercel (api/fedapay.js) ;
// en local, `npm run dev` et `npm run preview` la servent eux-mêmes, avec la clé de .env.local.
const apiLocale = () => {
  const brancher = server => {
    // Clé relue à chaque démarrage et passée directement, sans la copier dans process.env : au redémarrage qui suit
    // une modification de .env.local, loadEnv donne la priorité à ce que process.env contient déjà, et le serveur
    // vérifiait des paiements réels avec l'ancienne clé de test (« introuvable » : le joueur croyait n'avoir rien payé).
    const cle = loadEnv('development', process.cwd(), 'FEDAPAY_').FEDAPAY_SECRET_KEY;
    server.middlewares.use('/api/fedapay', async (req, res) => (await import('./api/fedapay.js')).default(req, res, cle));
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
