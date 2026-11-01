// L'épargne de « Ma vie » (src/epargne.js) : le serveur seul la tient. La base refuse qu'un joueur se donne plus de 5 000 F
// d'un coup (database.rules.json, zem_vies) : un retrait de 50 000 F aurait pris dix gains de suite, et les intérêts calculés
// par la page auraient pu être inventés. Ici, en administrateur (le secret de la base, FIREBASE_DB_SECRET, comme
// api/recharge.js), on relit la vie du joueur, on applique les règles (src/epargne-regles.js) et on réécrit la vie entière
// sous condition (ETag) : si le jeu du joueur écrit entre-temps (sa faim, un gain), on relit et on recommence.
//   POST /api/epargne { jeton, action: 'etat' | 'deposer' | 'retirer', montant }
//     →  { statut: 'ok' | 'montant' | 'pas-assez' | 'plafond' | <erreur>, argent, epargne, eJ, eI, interets?, jours? }
// Les champs epargne, eJ (le dernier jour compté) et eI (les intérêts reçus en tout) sont interdits en écriture aux joueurs.
import { BASE, lireCorps, origineAdmise, uidVerifie } from './fedapay.js';
import { jourDe, operer } from '../src/epargne-regles.js';

const ACTIONS = ['etat', 'deposer', 'retirer'];
const lire = async (base, auth, chemin) => {
  const r = await fetch(`${base}/${chemin}.json?${auth}`, { headers: { 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`lecture ${r.status}`);
  return { val: await r.json(), etag: r.headers.get('etag') };
};
const ecrireSi = async (base, auth, chemin, val, etag) => {
  const r = await fetch(`${base}/${chemin}.json?${auth}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'if-match': etag }, body: JSON.stringify(val), signal: AbortSignal.timeout(8000) });
  if (r.status === 412) return false; // le jeu du joueur a écrit entre-temps
  if (!r.ok) throw new Error(`écriture ${r.status}`);
  return true;
};
const etat = v => ({ argent: v.argent, epargne: v.epargne || 0, eJ: v.eJ || '', eI: v.eI || 0 });

export async function epargne(q, { secret = process.env.FIREBASE_DB_SECRET, base = BASE, now = Date.now() } = {}) {
  if (!String(secret || '').trim()) return { code: 503, corps: { statut: 'non-configure' } };
  const auth = `auth=${encodeURIComponent(String(secret).trim())}`, action = ACTIONS.includes(q.action) ? q.action : '', montant = Number(q.montant ?? 0);
  if (!action || !(montant >= 0 && montant <= 1e9)) return { code: 400, corps: { statut: 'demande-invalide' } };
  const uid = await uidVerifie(q.jeton, base); if (!uid) return { code: 401, corps: { statut: 'jeton-refuse' } };
  const chemin = `zem_vies/${uid}`, jour = jourDe(now);
  for (let essai = 0; essai < 6; essai++) {
    const { val: v, etag } = await lire(base, auth, chemin);
    if (!v || typeof v !== 'object') return { code: 404, corps: { statut: 'sans-vie' } };
    const r = operer(v, action, montant, jour);
    if (r.refus) return { code: 200, corps: { statut: r.refus, ...etat(v) } };
    if (!r.change) return { code: 200, corps: { statut: 'ok', ...etat(v), interets: 0, jours: 0 } };
    if (await ecrireSi(base, auth, chemin, { ...v, ...r.patch }, etag)) return { code: 200, corps: { statut: 'ok', ...r.patch, interets: r.interets, jours: r.jours } };
  }
  return { code: 409, corps: { statut: 'occupe' } };
}

// Quelques appels par minute et par adresse : la page en fait un à l'entrée, un par dépôt ou retrait.
const ESSAIS = new Map();
const tropDEssais = ip => { const t = Date.now(), l = (ESSAIS.get(ip) || []).filter(x => t - x < 60e3); l.push(t); ESSAIS.set(ip, l); if (ESSAIS.size > 5000) ESSAIS.clear(); return l.length > 30; };

export default async function handler(req, res, secrets = {}) { // en local, vite.config.js passe { secret } de .env.local
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  let r;
  try {
    if (req.method !== 'POST') r = { code: 405, corps: { statut: 'methode' } };
    else if (!origineAdmise(req.headers.origin || '')) r = { code: 403, corps: { statut: 'origine-refusee' } };
    else if (tropDEssais(ip)) r = { code: 429, corps: { statut: 'trop-d-essais' } };
    else r = await epargne(await lireCorps(req), { secret: secrets.secret ?? process.env.FIREBASE_DB_SECRET });
  } catch (e) { console.error('epargne', e?.message); r = { code: 502, corps: { statut: 'serveur-injoignable' } }; } // jamais le jeton ni le secret
  res.statusCode = r.code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(r.corps));
}
