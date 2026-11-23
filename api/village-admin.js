// Le passeport du Village de l'innovation, pour le tableau de bord (public/tableau.html ; même code d'accès, vérifié par
// middleware.js et ici, voir api/_tableau.js) : combien de comptes ont pris au moins un tampon, et combien l'ont rempli.
//   GET /api/village-admin → { commences: { jour: n }, remplis: { jour: n }, comptes: n }
// Ces chiffres existent depuis l'ouverture du Village dans le jeu (17/11), avant les compteurs d'entrées (statistiques.js).
// zem_village_dep/{uid} = { t, j } n'est lisible que par son propriétaire, d'où cette fonction ; la base ne garde que le
// DERNIER jour de chaque compte : un compte venu le 18 puis le 19 ne compte que le 19 (le total, lui, est exact).
import { accesTableau, refuser } from './_tableau.js';
import { BASE } from './fedapay.js';

export async function village({ secret, base = BASE }) {
  const lire = async chemin => {
    const r = await fetch(`${base}/${chemin}.json?auth=${encodeURIComponent(secret)}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`lecture ${chemin} ${r.status}`);
    return (await r.json()) || {};
  };
  const [dep, remplis] = await Promise.all([lire('zem_village_dep'), lire('zem_village')]);
  const commences = {};
  for (const v of Object.values(dep)) if (/^20\d\d-\d\d-\d\d$/.test(v?.j)) commences[v.j] = (commences[v.j] || 0) + 1;
  return {
    commences,
    remplis: Object.fromEntries(Object.entries(remplis).map(([j, l]) => [j, Object.keys(l || {}).length])),
    comptes: Object.values(commences).reduce((a, n) => a + n, 0),
  };
}

export default async function handler(req, res, secrets = {}) { // en local, vite.config.js passe { secret } de .env.local
  if (!(await accesTableau(req))) return refuser(res);
  const secret = String(secrets.secret ?? process.env.FIREBASE_DB_SECRET ?? '').trim();
  let code = 200, corps;
  try {
    if (!secret) { code = 503; corps = { erreur: 'non-configure' }; }
    else corps = await village({ secret });
  } catch (e) { console.error('village-admin', e?.message); code = 502; corps = { erreur: 'base-injoignable' }; }
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(corps));
}
