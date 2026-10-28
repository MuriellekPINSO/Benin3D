import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
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
    // Le fichier est relu dès qu'il change : sans ça, `npm run preview` gardait la version chargée au démarrage (le 22/10,
    // la copie de test parlait encore à l'ancien /api/fedapay et refusait chaque paiement).
    // /api/paiements : les paiements du jeu pour le tableau de bord (en local, sans le code d'accès de middleware.js).
    // /api/faux-frere : l'arbitre du Faux Frère, avec le secret de .env.local (FAUX_FRERE_SECRET), sinon un secret d'essai.
    // /api/recharge : crédite une recharge payée, avec le compte de service Firebase de .env.local (FIREBASE_SERVICE_ACCOUNT).
    const secrets = { fedapay: cle, paiements: cle, 'faux-frere': loadEnv('development', process.cwd(), 'FAUX_FRERE_').FAUX_FRERE_SECRET || 'secret-de-developpement', recharge: { cle, compte: loadEnv('development', process.cwd(), 'FIREBASE_').FIREBASE_SERVICE_ACCOUNT } };
    for (const nom of ['fedapay', 'paiements', 'faux-frere', 'recharge']) {
      const api = pathToFileURL(path.resolve(`api/${nom}.js`)).href; // adresse absolue : Vite ne réécrit pas cet import
      server.middlewares.use(`/api/${nom}`, async (req, res) => (await import(/* @vite-ignore */ `${api}?v=${fs.statSync(`api/${nom}.js`).mtimeMs}`)).default(req, res, secrets[nom]));
    }
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
