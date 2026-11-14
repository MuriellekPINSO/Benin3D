// La course à vélo payante de RideCorniche (src/course-velo.js) : le serveur tient le registre des courses, et lui seul
// donne un vrai ticket au gagnant. « Avant de faire la course, tu dois payer 2000 francs avec les pièces que tu as et 500
// en vraie monnaie » ; « chaque 1re place gagne un ticket, et je vois les gagnants dans le tableau de bord » (Murielle, 14/11).
//   POST /api/course-velo { etape: 'depart', id, jeton }
//     id : la transaction FedaPay de l'inscription (500 F, objet 'courseVelo', créée pour ce joueur par api/fedapay.js) ;
//     jeton : le jeton Firebase du joueur. Une transaction payée donne UN départ : zem_courses_velo/<id> est réservé par une
//     écriture conditionnelle (ETag), avec l'heure du serveur. → { statut: 'ok', depart } | 'pending' | 'deja' | <refus>
//   POST /api/course-velo { etape: 'arrivee', id, jeton, rang, temps, trace } | { etape: 'arrivee', id, jeton, abandon: true }
//     → { statut: 'gagne', ticket } | 'fini' | 'refuse' (refus : la raison) | 'abandon' | 'deja'
// Le registre (zem_courses_velo) est fermé aux joueurs (database.rules.json : rien n'y est ouvert) : on y écrit en
// administrateur, avec le secret de la base (FIREBASE_DB_SECRET), comme api/recharge.js. Le tableau de bord le lit par
// api/courses-admin.js. Le numéro qui a payé y est gardé, pour joindre le gagnant ; il n'est jamais renvoyé au joueur.
import { randomBytes } from 'node:crypto';
import { BASE, PAYES, lireCorps, lireTransaction, origineAdmise, uidVerifie } from './fedapay.js';
import { baseAdmin } from './_admin.js';
import { PRIX_MOMO, verifierArrivee } from '../src/course-velo-regles.js';

// En ligne zem_courses_velo ; en local (serveur de développement), essais_courses_velo : les essais ne touchent pas au vrai registre.
export const RACINE = process.env.VERCEL ? 'zem_courses_velo' : 'essais_courses_velo';
const REFUS = ['declined', 'canceled', 'refunded'];
const LETTRES = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // ni O/0, ni I/1/L : un code qu'on lit à voix haute
const ticket = () => 'RC-' + [...randomBytes(6)].map(b => LETTRES[b % LETTRES.length]).join('');
const nombre = (x, min, max) => { const n = Number(x); return Number.isFinite(n) && n >= min && n <= max ? n : null; };

export async function depart(q, { cle, secret, base = BASE, now = Date.now() }) {
  const id = String(q.id ?? '');
  if (!/^\d{1,15}$/.test(id)) return { code: 400, corps: { statut: 'identifiant-invalide' } };
  if (!cle || !secret) return { code: 503, corps: { statut: 'non-configure' } };
  const uid = await uidVerifie(q.jeton, base); if (!uid) return { code: 401, corps: { statut: 'jeton-refuse' } };
  const L = await lireTransaction(id, cle);
  if (!L.ok) return { code: 502, corps: { statut: L.statut ? `fedapay-${L.statut}` : 'fedapay-injoignable' } };
  const m = L.t.custom_metadata || {};
  if (m.objet !== 'courseVelo') return { code: 200, corps: { statut: 'autre-objet' } };
  if (m.uid !== uid) return { code: 403, corps: { statut: 'autre-joueur' } };
  if (REFUS.includes(L.t.status)) return { code: 200, corps: { statut: L.t.status } };
  if (!PAYES.includes(L.t.status) || Number(L.t.amount) < PRIX_MOMO) return { code: 200, corps: { statut: 'pending' } };
  const db = baseAdmin(base, secret), chemin = `${RACINE}/${id}`;
  let nom = ''; try { nom = String((await db.lire(`zem_vies/${uid}/nom`)).val || '').slice(0, 24); } catch { /* le nom n'est qu'un repère */ }
  for (let essai = 0; essai < 4; essai++) {
    const R = await db.lire(chemin);
    if (R.val) { // déjà parti : la même demande renvoyée (réponse perdue) dans la minute, sinon l'inscription a servi
      if (R.val.uid === uid && R.val.statut === 'en-course' && now - R.val.depart < 60e3) return { code: 200, corps: { statut: 'ok', depart: R.val.depart } };
      return { code: 200, corps: { statut: 'deja' } };
    }
    const fiche = { uid, nom, depart: now, statut: 'en-course', montant: Number(L.t.amount) || PRIX_MOMO, tel: String(m.tel || '').slice(0, 16), paiement: String(L.t.created_at || '') };
    if (await db.ecrireSi(chemin, fiche, R.etag)) return { code: 200, corps: { statut: 'ok', depart: now } };
  }
  return { code: 409, corps: { statut: 'occupe' } };
}

export async function arrivee(q, { secret, base = BASE, now = Date.now() }) {
  const id = String(q.id ?? '');
  if (!/^\d{1,15}$/.test(id)) return { code: 400, corps: { statut: 'identifiant-invalide' } };
  if (!secret) return { code: 503, corps: { statut: 'non-configure' } };
  const uid = await uidVerifie(q.jeton, base); if (!uid) return { code: 401, corps: { statut: 'jeton-refuse' } };
  const db = baseAdmin(base, secret), chemin = `${RACINE}/${id}`;
  for (let essai = 0; essai < 4; essai++) {
    const R = await db.lire(chemin), f = R.val;
    if (!f) return { code: 404, corps: { statut: 'inconnue' } };
    if (f.uid !== uid) return { code: 403, corps: { statut: 'autre-joueur' } };
    if (f.statut !== 'en-course') return { code: 200, corps: { statut: 'deja', ...(f.ticket ? { ticket: f.ticket } : {}), ...(f.refus ? { refus: f.refus } : {}) } }; // le même résultat, renvoyé
    const ecoule = Math.round((now - f.depart) / 100) / 10;
    let fin;
    if (q.abandon === true) fin = { statut: 'abandon', ecoule };
    else {
      const rang = nombre(q.rang, 1, 4), temps = nombre(q.temps, 0, 7200);
      const trace = Array.isArray(q.trace) ? q.trace.slice(0, 1200).map(p => (Array.isArray(p) ? [Math.round(Number(p[0])), Math.round(Number(p[1]))] : null)).filter(p => p && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [];
      const v = verifierArrivee({ rang: Math.round(rang ?? 0), temps: temps ?? NaN, ecoule, trace });
      fin = { rang: Math.round(rang ?? 0), temps: temps === null ? null : Math.round(temps * 10) / 10, ecoule, alertes: v.alertes.join(',') };
      if (rang === 1) Object.assign(fin, v.refus ? { statut: 'refuse', refus: v.refus } : { statut: 'gagne', ticket: ticket() }, { trace });
      else Object.assign(fin, { statut: v.refus ? 'refuse' : 'fini', ...(v.refus ? { refus: v.refus } : {}) });
    }
    if (await db.ecrireSi(chemin, { ...f, ...fin, fin: now }, R.etag)) return { code: 200, corps: { statut: fin.statut, ...(fin.ticket ? { ticket: fin.ticket } : {}), ...(fin.refus ? { refus: fin.refus } : {}) } };
  }
  return { code: 409, corps: { statut: 'occupe' } };
}

// Quelques appels par minute et par adresse : une course en fait deux (départ, arrivée), plus leurs relances.
const ESSAIS = new Map();
const tropDEssais = ip => { const t = Date.now(), l = (ESSAIS.get(ip) || []).filter(x => t - x < 60e3); l.push(t); ESSAIS.set(ip, l); if (ESSAIS.size > 5000) ESSAIS.clear(); return l.length > 20; };

export default async function handler(req, res, secrets = {}) { // en local, vite.config.js passe { cle, secret } de .env.local
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const cle = secrets.cle ?? process.env.FEDAPAY_SECRET_KEY, secret = String(secrets.secret ?? process.env.FIREBASE_DB_SECRET ?? '').trim();
  let r;
  try {
    if (req.method !== 'POST') r = { code: 405, corps: { statut: 'methode' } };
    else if (!origineAdmise(req.headers.origin || '')) r = { code: 403, corps: { statut: 'origine-refusee' } };
    else if (tropDEssais(ip)) r = { code: 429, corps: { statut: 'trop-d-essais' } };
    else {
      const q = await lireCorps(req);
      r = q.etape === 'depart' ? await depart(q, { cle, secret }) : q.etape === 'arrivee' ? await arrivee(q, { secret }) : { code: 400, corps: { statut: 'etape-invalide' } };
    }
  } catch (e) { console.error('course-velo', e?.message); r = { code: 502, corps: { statut: 'serveur-injoignable' } }; } // jamais le jeton ni le secret
  res.statusCode = r.code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(r.corps));
}
