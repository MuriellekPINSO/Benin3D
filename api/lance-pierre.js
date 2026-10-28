// Le classement du lance-pierre (src/lancepierre.js) : le serveur seul l'écrit, après avoir rejoué la partie.
// « Dès qu'un vrai lot est en jeu, le serveur vérifie la partie du gagnant » (plan du 28/10) : la page n'envoie plus son
// score, seulement ses tirs (le pas où chacun part, la visée, la tension) ; on les rejoue ici avec les règles du jeu
// (src/lance-pierre-regles.js : le même stand du jour, le même vent, le même calcul) et c'est ce score-là qui compte.
//   POST /api/lance-pierre { jeton, jour, appareil: 'toucher' | 'manette' | 'souris', tirs: [[pas, lacet, hausse, tension], …] }
//     →  { statut: 'enregistre' | 'moins-bien' | 'rien' | 'refuse' | <erreur>, score?, meilleur?, avant? }
// On refuse (message neutre côté page) une partie :
//  - sans départ noté par la base pour ce joueur et ce jour (zem_lp_departs, écrit au « Tire ! »), ou envoyée moins d'une
//    minute après ce départ, ou plus de 20 min après (la pause compte) ;
//  - dont un tir est impossible : parti avant que le caillou précédent soit retombé, hors des bornes, après la minute ;
//  - aux tirs trop rapides pour un humain (plus de la moitié partis dans les 10 ms où le caillou est prêt, sur 10 au moins).
// Deux classements par jour, zem_lp2/{jour}/t (au doigt) et zem_lp2/{jour}/m (manette, souris) : on ne vise pas pareil.
// Écrit en administrateur avec le secret de la base (FIREBASE_DB_SECRET, comme api/recharge.js), sous condition (ETag).
import { BASE, lireCorps, origineAdmise, uidVerifie } from './fedapay.js';
import { DUREE, finDe, jourDe, rejouer } from '../src/lance-pierre-regles.js';

const APPAREILS = ['toucher', 'manette', 'souris'];
const lire = async (base, auth, chemin) => {
  const r = await fetch(`${base}/${chemin}.json?${auth}`, { headers: { 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`lecture ${r.status}`);
  return { val: await r.json(), etag: r.headers.get('etag') };
};
const ecrire = async (base, auth, chemin, val, etag) => {
  const r = await fetch(`${base}/${chemin}.json?${auth}`, { method: val === null ? 'DELETE' : 'PUT', headers: { 'Content-Type': 'application/json', ...(etag ? { 'if-match': etag } : {}) }, body: val === null ? undefined : JSON.stringify(val), signal: AbortSignal.timeout(8000) });
  if (r.status === 412) return false; // quelqu'un a écrit entre-temps
  if (!r.ok) throw new Error(`écriture ${r.status}`);
  return true;
};
const refus = raison => ({ code: 200, corps: { statut: 'refuse', raison } });

export async function inscrire(q, { secret = process.env.FIREBASE_DB_SECRET, base = BASE, now = Date.now() } = {}) {
  if (!String(secret || '').trim()) return { code: 503, corps: { statut: 'non-configure' } };
  const auth = `auth=${encodeURIComponent(String(secret).trim())}`;
  const jour = String(q.jour ?? ''), appareil = APPAREILS.includes(q.appareil) ? q.appareil : '';
  if (!/^20\d\d-\d\d-\d\d$/.test(jour) || !appareil || !Array.isArray(q.tirs)) return { code: 400, corps: { statut: 'demande-invalide' } };
  const uid = await uidVerifie(q.jeton, base); if (!uid) return { code: 401, corps: { statut: 'jeton-refuse' } };
  // Le départ, noté par la base au « Tire ! » : le bon jour, il y a plus d'une minute et moins de 20.
  const dep = (await lire(base, auth, `zem_lp_departs/${uid}`)).val;
  if (!dep || dep.j !== jour || typeof dep.t !== 'number' || jourDe(dep.t) !== jour) return refus('depart');
  if (now - dep.t < (DUREE - 3) * 1000 || now - dep.t > 20 * 60e3 || now > finDe(jour) + 5 * 60e3) return refus('duree');
  const R = rejouer(jour, q.tirs);
  if (!R.ok) return refus(R.raison);
  if (R.tirs >= 10 && R.vifs * 2 > R.tirs) return refus('cadence');
  // Le départ sert une fois : une partie, un envoi.
  await ecrire(base, auth, `zem_lp_departs/${uid}`, null).catch(() => { });
  if (R.score <= 0) return { code: 200, corps: { statut: 'rien', score: 0 } };
  const nom = String((await lire(base, auth, `zem_vies/${uid}/nom`)).val || 'Joueur').trim().slice(0, 16) || 'Joueur';
  const chemin = `zem_lp2/${jour}/${appareil === 'toucher' ? 't' : 'm'}/${uid}`, { b, u, g, c, k } = R.comptes;
  for (let essai = 0; essai < 6; essai++) {
    const A = await lire(base, auth, chemin);
    if (A.val && A.val.s >= R.score) return { code: 200, corps: { statut: 'moins-bien', score: R.score, meilleur: A.val.s } };
    if (await ecrire(base, auth, chemin, { n: nom, s: R.score, b, u, g, c, k, ti: R.tirs, a: appareil, dep: dep.t, t: { '.sv': 'timestamp' } }, A.etag)) return { code: 200, corps: { statut: 'enregistre', score: R.score, avant: A.val?.s ?? null } };
  }
  return { code: 409, corps: { statut: 'occupe' } };
}

// Quelques envois par minute et par adresse : un par partie.
const ESSAIS = new Map();
const tropDEssais = ip => { const t = Date.now(), l = (ESSAIS.get(ip) || []).filter(x => t - x < 60e3); l.push(t); ESSAIS.set(ip, l); if (ESSAIS.size > 5000) ESSAIS.clear(); return l.length > 12; };

export default async function handler(req, res, secrets = {}) { // en local, vite.config.js passe { secret } de .env.local
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  let r;
  try {
    if (req.method !== 'POST') r = { code: 405, corps: { statut: 'methode' } };
    else if (!origineAdmise(req.headers.origin || '')) r = { code: 403, corps: { statut: 'origine-refusee' } };
    else if (tropDEssais(ip)) r = { code: 429, corps: { statut: 'trop-d-essais' } };
    else r = await inscrire(await lireCorps(req), { secret: secrets.secret ?? process.env.FIREBASE_DB_SECRET });
  } catch (e) { console.error('lance-pierre', e?.message); r = { code: 502, corps: { statut: 'serveur-injoignable' } }; } // jamais le jeton ni le secret
  res.statusCode = r.code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(r.corps));
}
