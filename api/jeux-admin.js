// La validation des jeux des créateurs (api/jeux.js), depuis le tableau de bord : réservée à l'équipe, sous le même code
// d'accès que public/tableau.html (middleware.js). En local, `npm run dev` la sert sans code, comme api/paiements.js.
//   GET  /api/jeux-admin                        → { fiches: [ toutes les fiches, la plus récente d'abord ] }
//   GET  /api/jeux-admin?img=<id>&k=a|0…4       → une image de la fiche en attente (aperçu avant validation)
//   POST /api/jeux-admin { action: 'valider' | 'refuser' | 'retirer', id, mot? }
//   POST /api/jeux-admin { action: 'repondre', uid, texte }   (les messages des créateurs : api/jeux.js, messages/)
// Valider copie la fiche et ses images vers la version publique : le jeu apparaît dans la salle de jeux en une minute
// (cache de /api/jeux?liste). Refuser laisse un mot au créateur, qui corrige et renvoie. Retirer enlève un jeu en ligne.
import { BASE, origineAdmise } from './fedapay.js';
import { baseAdmin } from './_admin.js';
import { fil, image, lireCorpsGrand, racine, totaux, versionPublique } from './jeux.js';

const ID = /^[a-z0-9-]{3,48}$/;
export async function admin(q, { secret = process.env.FIREBASE_DB_SECRET, base = BASE, now = Date.now(), methode = 'POST' } = {}) {
  if (!String(secret || '').trim()) return { code: 503, corps: { statut: 'non-configure' } };
  const B = baseAdmin(base, String(secret).trim()), R = racine();
  if (methode === 'GET') {
    const { val } = await B.lire(`${R}/fiches`), { val: pubs } = await B.lire(`${R}/publics`);
    const fiches = [];
    for (const [id, f] of Object.entries(val || {})) {
      fiches.push({ id, ...f, enLigne: !!pubs?.[id], stats: pubs?.[id] ? await totaux(B, R, id, 30, now) : null });
    }
    // Les messages, par créateur : le fil le plus récent d'abord ; « à répondre » si le dernier mot est du créateur.
    const { val: msgs } = await B.lire(`${R}/messages`), { val: cr } = await B.lire(`${R}/createurs`);
    const fils = Object.entries(msgs || {}).map(([uid, m]) => { const l = Object.values(m || {}).sort((a, b) => a.t - b.t); return { uid, email: cr?.[uid]?.email || '', messages: l.slice(-40), dernier: l.at(-1)?.t || 0, aRepondre: l.at(-1)?.de === 'createur' }; })
      .sort((a, b) => b.dernier - a.dernier);
    return { code: 200, corps: { racine: R, fiches: fiches.sort((a, b) => (b.modifie || 0) - (a.modifie || 0)), fils } };
  }
  const action = String(q.action || ''), id = String(q.id || ''), mot = String(q.mot || '').trim().slice(0, 400);
  if (action === 'repondre') {
    const uid = String(q.uid || ''), texte = String(q.texte || '').trim().slice(0, 1000);
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid) || texte.length < 1) return { code: 400, corps: { statut: 'demande-invalide' } };
    await B.ecrire(`${R}/messages/${uid}/${now}-${Math.random().toString(36).slice(2, 6)}`, { de: 'equipe', texte, t: now });
    return { code: 200, corps: { statut: 'ok' } };
  }
  if (!['valider', 'refuser', 'retirer'].includes(action) || !ID.test(id)) return { code: 400, corps: { statut: 'demande-invalide' } };
  const { val: f } = await B.lire(`${R}/fiches/${id}`); if (!f) return { code: 404, corps: { statut: 'introuvable' } };
  if (action === 'valider') {
    const { val: im } = await B.lire(`${R}/images/brouillon/${id}`);
    if (!im?.a) return { code: 409, corps: { statut: 'sans-affiche' } };
    const { val: avant } = await B.lire(`${R}/publics/${id}/publie`);
    await B.ecrire(`${R}/images/public/${id}`, im);
    await B.ecrire(`${R}/publics/${id}`, { ...versionPublique(f, id), publie: avant || now });
    await B.ecrire(`${R}/fiches/${id}`, { ...f, statut: 'publie', mot: '', valide: now });
  } else if (action === 'refuser') {
    await B.ecrire(`${R}/fiches/${id}`, { ...f, statut: 'refuse', mot: mot || 'Fiche à corriger.', refuse: now });
  } else {
    await B.supprimer(`${R}/publics/${id}`); await B.supprimer(`${R}/images/public/${id}`);
    await B.ecrire(`${R}/fiches/${id}`, { ...f, statut: 'retire', mot: mot || 'Retiré par l’équipe de Kutɔnu Vibes.', retire: now });
  }
  return { code: 200, corps: { statut: 'ok' } };
}

export default async function handler(req, res, secrets = {}) {
  const secret = secrets.secret ?? process.env.FIREBASE_DB_SECRET;
  try {
    if (req.method === 'GET') {
      const q = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
      if (q.img) {
        const im = await image(q, { secret, dossier: 'brouillon' });
        if (!im) { res.statusCode = 404; res.end(); return; }
        res.statusCode = 200; res.setHeader('Content-Type', im.type); res.setHeader('Cache-Control', 'private, no-store'); res.end(im.octets); return;
      }
      const r = await admin(q, { secret, methode: 'GET' });
      res.statusCode = r.code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(r.corps)); return;
    }
    let r;
    if (req.method !== 'POST') r = { code: 405, corps: { statut: 'methode' } };
    else if (!origineAdmise(req.headers.origin || '')) r = { code: 403, corps: { statut: 'origine-refusee' } };
    else r = await admin(await lireCorpsGrand(req, 20000), { secret });
    res.statusCode = r.code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(r.corps));
  } catch (e) {
    console.error('jeux-admin', e?.message);
    res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify({ statut: 'serveur-injoignable' }));
  }
}
