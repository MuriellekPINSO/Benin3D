// L'arbitre du Faux Frère (src/fauxfrere.js) : la fonction du serveur qui décide de tout ce qui touche au contenu du jeu.
// Aucun joueur, l'hôte compris, ne reçoit autre chose que son propre mot. Le calcul est dans src/faux-frere-arbitre.js
// (le même code tourne dans la page en mode test), les règles dans src/faux-frere-regles.js.
//   POST /api/faux-frere { partie, jeton, quoi, ... }  →  { ok: true, ... }  ou  { erreur }
//   quoi : 'lancer' / 'rejouer' (l'hôte, au salon, 4 joueurs au moins) · 'mot' → { n, mot } ou { n, ignorant: true }
//     (jamais un rôle : le faux frère ne sait pas qu'il l'est) · 'indice' { m } (à son tour ; → { refus } si le mot est
//     refusé) · 'voter' { c } (définitif) · 'deviner' { m } (l'Ignorant éliminé, 20 s) · 'avancer' (n'importe qui : les
//     échéances passées, les absents) · 'quitter' · 'fermer' (l'hôte, au salon) · 'mots' (les éliminés : les mots de tous)
// On écrit en administrateur avec le secret de la base (FIREBASE_DB_SECRET, api/_admin.js) : zem_ff2_secret est
// illisible pour les joueurs, et seul ce serveur écrit l'état public de la partie (zem_ff2/{partie}/pub).
// `jeton` : le jeton Firebase du joueur, prouvé en lisant le salon avec lui (api/_admin.js, uidDuJeton).
import { arbitrer } from '../src/faux-frere-arbitre.js';
import { baseAdmin, uidDuJeton } from './_admin.js';

const BASE = 'https://zem-run-cotonou-default-rtdb.europe-west1.firebasedatabase.app';
const ORIGINES_EN_LIGNE = /^https:\/\/((www\.)?(xn--kutnuvibes-ghe|kotonuvibes)\.com|tours[\w-]*\.vercel\.app)$/;
const ORIGINES_LOCALES = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|100\.\d+\.\d+\.\d+)(:\d+)?$/;
const origineAdmise = o => ORIGINES_EN_LIGNE.test(o) || (!process.env.VERCEL && ORIGINES_LOCALES.test(o));

async function lireCorps(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let brut = ''; for await (const morceau of req) { brut += morceau; if (brut.length > 6000) break; }
  try { return JSON.parse(brut || '{}'); } catch { return {}; }
}
// Chaque joueur appelle l'arbitre à chaque échéance (une toutes les secondes et demie au plus) : dix joueurs d'un même
// wifi de maquis restent loin de la limite. En mémoire de l'instance seulement : ça freine un abus, sans l'empêcher.
const ESSAIS = new Map();
const tropDEssais = (cle, max) => { const t = Date.now(), l = (ESSAIS.get(cle) || []).filter(x => t - x < 60e3); l.push(t); ESSAIS.set(cle, l); if (ESSAIS.size > 5000) ESSAIS.clear(); return l.length > max; };

/** La demande `q`, d'un joueur dont on vérifie le jeton. `secret` : celui de la base ; `base` : son adresse ; les essais
 *  changent aussi l'horloge, le tirage et la limite d'appels. */
export async function repondre(q, { secret = process.env.FIREBASE_DB_SECRET, base = BASE, now, alea, min, limite = tropDEssais } = {}) {
  secret = String(secret || '').trim(); if (!secret) return { code: 503, corps: { erreur: 'arbitre-sans-secret' } };
  const partie = String(q.partie || '');
  if (!/^[a-z0-9]{6,24}$/.test(partie) || !q.jeton) return { code: 400, corps: { erreur: 'demande-invalide' } };
  const uid = await uidDuJeton(q.jeton, base, `zem_ff2/${partie}/pub/rev`);
  if (!uid) return { code: 401, corps: { erreur: 'jeton-refuse' } };
  if (limite(`u:${uid}`, 120)) return { code: 429, corps: { erreur: 'trop-d-essais' } };
  return arbitrer(q, uid, baseAdmin(base, secret), { now, alea, min });
}

export default async function handler(req, res, secrets = {}) { // en local, vite.config.js passe { secret } de .env.local
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  let r;
  try {
    if (req.method !== 'POST') r = { code: 405, corps: { erreur: 'post-seulement' } };
    else if (!origineAdmise(req.headers.origin || '')) r = { code: 403, corps: { erreur: 'origine-refusee' } };
    else if (tropDEssais(`ip:${ip}`, 900)) r = { code: 429, corps: { erreur: 'trop-d-essais' } };
    else r = await repondre(await lireCorps(req), { secret: secrets.secret ?? process.env.FIREBASE_DB_SECRET });
  } catch (e) { console.error('faux-frere', e?.message); r = { code: 502, corps: { erreur: 'arbitre-en-panne' } }; } // jamais le jeton ni le secret
  res.statusCode = r.code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(r.corps));
}
