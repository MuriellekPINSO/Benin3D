// Créditer une recharge payée par Mobile Money (src/recharge.js) : le serveur seul ajoute l'argent au compte du joueur.
// La base refuse qu'un joueur se donne plus de 5 000 F d'un coup (database.rules.json, zem_vies) : on écrit ici en
// administrateur, ce qui passe outre les règles, avec le secret de la base (FIREBASE_DB_SECRET, console Firebase →
// Comptes de service → Secrets de la base de données ; réglages Vercel, en local .env.local) ou, à défaut, un compte de
// service (FIREBASE_SERVICE_ACCOUNT). Le 28/10, Google refusait de créer une clé de compte de service pour ce projet
// (« La création de clés n'est pas autorisée ») : c'est le secret de la base qui sert.
//   POST /api/recharge { id, jeton }  →  { statut: 'credite' | 'deja' | 'pending' | <refus>, credit?, argent? }
// `id` : la transaction FedaPay ; `jeton` : le jeton Firebase du joueur. On crédite si, et seulement si :
//  - FedaPay dit la transaction payée, pour une recharge, au prix de sa formule (src/recharge-formules.js) ;
//  - elle a été créée pour ce joueur (custom_metadata.uid, posé par api/fedapay.js d'après son jeton) ;
//  - elle n'a jamais été créditée : zem_recharges/<id> (illisible pour les joueurs) est réservé par une écriture
//    conditionnelle (ETag) avant de toucher à l'argent. Deux appels en même temps ne créditent qu'une fois.
// Tant que le joueur n'a pas validé sur son téléphone : 'pending', la page redemandera.
import { createSign } from 'node:crypto';
import { BASE, PAYES, lireCorps, lireTransaction, origineAdmise, uidVerifie } from './fedapay.js';
import { formule } from '../src/recharge-formules.js';

const REFUS = ['declined', 'canceled', 'refunded'];
const ADMIN = { jeton: '', fin: 0 };

/** Le compte de service : le fichier JSON de Firebase, tel quel ou en base64. */
function compteDe(brut) {
  if (!brut) return null;
  try { const c = typeof brut === 'object' ? brut : JSON.parse(brut.trim().startsWith('{') ? brut : Buffer.from(brut, 'base64').toString()); return c.client_email && c.private_key ? c : null; } catch { return null; }
}
/** Jeton d'accès Google du compte de service (une heure), signé ici : pas de dépendance en plus. */
async function jetonAdmin(c) {
  if (ADMIN.jeton && ADMIN.fin > Date.now() + 120e3) return ADMIN.jeton;
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url'), t = Math.floor(Date.now() / 1000);
  const corps = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: c.client_email, scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email', aud: 'https://oauth2.googleapis.com/token', iat: t, exp: t + 3600 })}`;
  const assertion = `${corps}.${createSign('RSA-SHA256').update(corps).sign(c.private_key, 'base64url')}`;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(8000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(`jeton-admin ${r.status}`);
  ADMIN.jeton = d.access_token; ADMIN.fin = Date.now() + (d.expires_in || 3600) * 1000;
  return ADMIN.jeton;
}
/** Le paramètre d'accès administrateur : le secret de la base tel quel, sinon un jeton du compte de service. */
const acces = async ({ secret, compte }) => (secret ? `auth=${encodeURIComponent(secret)}` : `access_token=${await jetonAdmin(compte)}`);
/** Lecture (avec son ETag) et écriture conditionnelle dans la base, en administrateur (`jeton` : le paramètre d'accès). */
const lire = async (base, jeton, chemin) => {
  const r = await fetch(`${base}/${chemin}.json?${jeton}`, { headers: { 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`lecture ${r.status}`);
  return { val: await r.json(), etag: r.headers.get('etag') };
};
const ecrireSi = async (base, jeton, chemin, val, etag) => {
  const r = await fetch(`${base}/${chemin}.json?${jeton}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'if-match': etag }, body: JSON.stringify(val), signal: AbortSignal.timeout(8000) });
  if (r.status === 412) return false; // quelqu'un a écrit entre-temps
  if (!r.ok) throw new Error(`écriture ${r.status}`);
  return true;
};

export async function crediter(q, { cle = process.env.FEDAPAY_SECRET_KEY, secret = process.env.FIREBASE_DB_SECRET, compte = process.env.FIREBASE_SERVICE_ACCOUNT, base = BASE } = {}) {
  const id = String(q.id ?? '');
  if (!/^\d{1,15}$/.test(id)) return { code: 400, corps: { statut: 'identifiant-invalide' } };
  const admin = { secret: String(secret || '').trim(), compte: compteDe(compte) };
  if (!cle || !(admin.secret || admin.compte)) return { code: 503, corps: { statut: 'non-configure' } }; // la page garde la transaction et redemandera
  const uid = await uidVerifie(q.jeton, base); if (!uid) return { code: 401, corps: { statut: 'jeton-refuse' } };
  const L = await lireTransaction(id, cle);
  if (!L.ok) return { code: 502, corps: { statut: L.statut ? `fedapay-${L.statut}` : 'fedapay-injoignable' } };
  const m = L.t.custom_metadata || {}, F = formule(m.formule);
  if (m.objet !== 'recharge' || !F) return { code: 200, corps: { statut: 'autre-objet' } };
  if (m.uid !== uid) return { code: 403, corps: { statut: 'autre-joueur' } };
  if (REFUS.includes(L.t.status)) return { code: 200, corps: { statut: L.t.status } };
  if (!PAYES.includes(L.t.status) || Number(L.t.amount) < F.prix) return { code: 200, corps: { statut: 'pending' } };

  const jeton = await acces(admin), chemin = `zem_recharges/${id}`;
  // 1. Réserver la transaction : on n'ajoute l'argent qu'après avoir écrit « créditée », sous condition.
  for (let essai = 0; ; essai++) {
    const R = await lire(base, jeton, chemin);
    if (R.val?.credite) return { code: 200, corps: { statut: 'deja', credit: F.credit } };
    if (await ecrireSi(base, jeton, chemin, { uid, formule: F.id, prix: F.prix, credit: F.credit, credite: true, t: { '.sv': 'timestamp' } }, R.etag)) break;
    if (essai > 3) return { code: 409, corps: { statut: 'occupe' } };
  }
  // 2. L'argent : relu et réécrit sous condition, le jeu du joueur peut écrire en même temps (gain, dépense).
  try {
    for (let essai = 0; essai < 8; essai++) {
      const A = await lire(base, jeton, `zem_vies/${uid}/argent`), argent = (Number(A.val) || 0) + F.credit;
      if (await ecrireSi(base, jeton, `zem_vies/${uid}/argent`, argent, A.etag)) return { code: 200, corps: { statut: 'credite', credit: F.credit, argent } };
    }
    throw new Error('argent trop disputé');
  } catch (e) {
    // Pas crédité : on rend la transaction, la page redemandera (sinon elle resterait « créditée » sans l'argent).
    await fetch(`${base}/${chemin}/credite.json?${jeton}`, { method: 'PUT', body: 'false', signal: AbortSignal.timeout(8000) }).catch(() => { });
    throw e;
  }
}

// Quelques appels par minute et par adresse : la page n'en fait qu'un par paiement (et ses relances).
const ESSAIS = new Map();
const tropDEssais = ip => { const t = Date.now(), l = (ESSAIS.get(ip) || []).filter(x => t - x < 60e3); l.push(t); ESSAIS.set(ip, l); if (ESSAIS.size > 5000) ESSAIS.clear(); return l.length > 30; };

export default async function handler(req, res, secrets = {}) { // en local, vite.config.js passe { cle, secret, compte } de .env.local
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  let r;
  try {
    if (req.method !== 'POST') r = { code: 405, corps: { statut: 'methode' } };
    else if (!origineAdmise(req.headers.origin || '')) r = { code: 403, corps: { statut: 'origine-refusee' } };
    else if (tropDEssais(ip)) r = { code: 429, corps: { statut: 'trop-d-essais' } };
    else r = await crediter(await lireCorps(req), { cle: secrets.cle ?? process.env.FEDAPAY_SECRET_KEY, secret: secrets.secret ?? process.env.FIREBASE_DB_SECRET, compte: secrets.compte ?? process.env.FIREBASE_SERVICE_ACCOUNT });
  } catch (e) { console.error('recharge', e?.message); r = { code: 502, corps: { statut: 'serveur-injoignable' } }; } // jamais le jeton ni la clé
  res.statusCode = r.code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(r.corps));
}
