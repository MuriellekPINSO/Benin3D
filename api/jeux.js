// Les jeux des créateurs dans Kutɔnu Vibes (05/11) : « ils ont leur espace, ils gèrent tout, je valide, et après c'est
// disponible » (Murielle). Comme Lagos Life avec son espace développeurs, pour les jeux web ET les jeux mobiles :
//   - le créateur (compte Kutɔnu Vibes, e-mail ou Google, public/createurs.html) remplit la fiche de son jeu et l'envoie ;
//   - Murielle valide dans le tableau de bord (api/jeux-admin.js) ;
//   - le jeu apparaît dans la salle de jeux de la ville (src/salle-jeux.js), sans mise à jour du site.
// Tout passe par ici, en administrateur (le secret de la base, comme api/epargne.js) : les règles de la base n'ont pas
// à changer, et un créateur ne touche qu'à ses fiches (son identité vient de son jeton Firebase, vérifié).
//
// Dans la base (racine `jeux` en ligne, `essais_jeux` en local : les essais ne touchent pas aux vrais jeux) :
//   fiches/<id>            la fiche telle que le créateur l'écrit (statut : brouillon, attente, publie, refuse, retire)
//   publics/<id>           la version validée, celle que voient les joueurs (une fiche modifiée repasse en attente,
//                          la version validée reste en place jusqu'à la nouvelle validation)
//   images/<brouillon|public>/<id>/<a|c0…c4>   l'affiche et les captures, réduites dans le navigateur (data: URL)
//   createurs/<uid>        { email, jeux: { <id>: true } }
//   stats/<id>/<jour>/<quoi>   les compteurs de la salle : vue, fiche, partie, magasin, qr, code, video
//
//   GET  /api/jeux?liste                  → { jeux: [ résumé des jeux publiés ] }
//   GET  /api/jeux?id=<id>                → { jeu: fiche publiée }
//   GET  /api/jeux?img=<id>&k=a|0…4&v=…   → l'image (mise en cache par Vercel)
//   GET  /api/jeux?aller=<id>[&qr]        → vers le bon magasin selon le téléphone (Play Store, App Store), ou la page de
//                                          téléchargement d'un jeu d'ordinateur, compté :
//                                          le bouton de la salle et le QR code affiché sur ordinateur pointent ici
//   POST /api/jeux { action: 'compter', id, quoi }
//   POST /api/jeux { action: 'moi' | 'lire' | 'enregistrer' | 'supprimer' | 'message', jeton, … }   (espace créateurs)
//   messages/<uid>/<n°>    ce que le créateur écrit à l'équipe et ses réponses (« Écrire à l'équipe », « Demander le
//                          retrait ») : aucune adresse e-mail sur la page, la réponse arrive dans son espace (05/11)
import { BASE, origineAdmise } from './fedapay.js';
import { baseAdmin, uidDuJeton } from './_admin.js';

export const racine = () => (process.env.VERCEL ? 'jeux' : 'essais_jeux');
export const jourDe = t => new Date(t + 3600e3).toISOString().slice(0, 10); // heure du Bénin
export const QUOI = ['vue', 'fiche', 'partie', 'magasin', 'qr', 'code', 'video'];
export const STATUTS = ['brouillon', 'attente', 'publie', 'refuse', 'retire'];
const ID = /^[a-z0-9-]{3,48}$/, CLES_IMAGES = ['a', 'c0', 'c1', 'c2', 'c3', 'c4'];
export const ACCORD = '1';
export const PLATEFORMES = ['windows', 'linux', 'mac']; // version de l'accord créateur (public/createurs.html)

// ---------- La fiche : ce qu'on accepte ----------
const texte = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max);
/** Une adresse de jeu web : https, un vrai domaine (ni localhost, ni adresse IP, ni Kutɔnu Vibes), pas de port. */
export function adresseWeb(u) {
  let a; try { a = new URL(String(u || '').trim()); } catch { return { erreur: 'Ce n’est pas une adresse web valide.' }; }
  if (a.protocol !== 'https:') return { erreur: 'L’adresse doit commencer par https://' };
  if (a.username || a.password) return { erreur: 'Pas de nom d’utilisateur ni de mot de passe dans l’adresse.' };
  if (a.port) return { erreur: 'Pas de numéro de port dans l’adresse.' };
  const h = a.hostname.toLowerCase();
  if (/^[\d.]+$/.test(h) || h.includes(':')) return { erreur: 'Utilise un nom de domaine, pas une adresse IP.' };
  if (!h.includes('.') || /(^|\.)(localhost|local|internal|lan)$/.test(h)) return { erreur: 'Utilise un domaine public (pas localhost).' };
  if (/(^|\.)(kotonuvibes\.com|xn--kutnuvibes-[a-z0-9]+\.com)$/.test(h)) return { erreur: 'C’est une adresse de Kutɔnu Vibes : héberge ton jeu sur ton propre domaine.' };
  return { url: a.href };
}
export function lienAndroid(u) {
  let a; try { a = new URL(String(u || '').trim()); } catch { return null; }
  const id = a.searchParams.get('id');
  return a.hostname === 'play.google.com' && a.pathname.startsWith('/store/apps/details') && /^[A-Za-z0-9._]{3,150}$/.test(id || '') ? `https://play.google.com/store/apps/details?id=${id}` : null;
}
export function lienIos(u) {
  let a; try { a = new URL(String(u || '').trim()); } catch { return null; }
  return a.hostname === 'apps.apple.com' && /\/id\d{5,12}/.test(a.pathname) ? `https://apps.apple.com${a.pathname}` : null;
}
export function videoYoutube(u) {
  const s = String(u || '').trim(); if (!s) return '';
  const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
const IMAGE = /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/, IMAGE_MAX = 420000;
/**
 * Vérifie une fiche envoyée par un créateur. Renvoie { fiche, images, erreurs } : `images` = { a, c0… } avec, pour chaque
 * clé, une data: URL nouvelle, 'garder' (l'image déjà enregistrée) ou null (à retirer).
 */
export function verifierFiche(f, { envoyer = false } = {}) {
  const e = {}, o = {};
  o.nom = texte(f?.nom, 40); if (o.nom.length < 2) e.nom = 'Le nom du jeu (2 à 40 caractères).';
  o.accroche = texte(f?.accroche, 90);
  o.description = texte(f?.description, 700);
  o.createurs = texte(f?.createurs, 80);
  o.code = texte(f?.code, 30);
  // Trois sortes de jeux : web (il se joue dans Kutɔnu Vibes), mobile (Play Store, App Store), ordinateur (Windows,
  // Linux, Mac : un bouton vers sa page de téléchargement, itch.io, Steam, GitHub ou le site du créateur ; 05/11).
  o.type = ['web', 'pc'].includes(f?.type) ? f.type : 'mobile';
  if (o.type === 'web') { const w = adresseWeb(f?.web); if (w.erreur) e.web = w.erreur; else o.web = w.url; }
  else if (o.type === 'pc') {
    const w = adresseWeb(f?.pc); if (w.erreur) e.pc = w.erreur.replace('ton jeu', 'ta page de téléchargement'); else o.pc = w.url;
    o.plateformes = PLATEFORMES.filter(p => Array.isArray(f?.plateformes) && f.plateformes.includes(p));
    if (!o.plateformes.length) e.plateformes = 'Coche au moins un système : Windows, Linux ou Mac.';
  }
  else {
    o.android = f?.android ? lienAndroid(f.android) : ''; o.ios = f?.ios ? lienIos(f.ios) : '';
    if (o.android === null) e.android = 'Un lien du Play Store : https://play.google.com/store/apps/details?id=…';
    if (o.ios === null) e.ios = 'Un lien de l’App Store : https://apps.apple.com/…/id123456789';
    if (!o.android && !o.ios && !e.android && !e.ios) e.android = 'Au moins un lien : Play Store ou App Store.';
  }
  const v = videoYoutube(f?.video); if (v === null) e.video = 'Un lien YouTube (youtube.com/watch?v=… ou youtu.be/…).'; else o.video = v;
  const images = {};
  for (const k of CLES_IMAGES) {
    const x = f?.images?.[k];
    if (x === 'garder') images[k] = 'garder';
    else if (typeof x === 'string' && x) { if (!IMAGE.test(x) || x.length > IMAGE_MAX) e[`image_${k}`] = 'Image trop lourde ou dans un format non pris en charge.'; else images[k] = x; }
    else images[k] = null;
  }
  if (!images.a) e.image_a = 'L’affiche du jeu est obligatoire.';
  if (envoyer) {
    if (o.description.length < 20) e.description = 'Décris ton jeu en quelques phrases (20 caractères au moins).';
    if (o.createurs.length < 2) e.createurs = 'Le nom du créateur ou du studio.';
    if (f?.accord !== ACCORD) e.accord = 'Il faut accepter l’accord créateur.';
  }
  return { fiche: o, images, erreurs: e };
}

// ---------- Outils ----------
export async function lireCorpsGrand(req, max = 3.5e6) {
  if (req.body && typeof req.body === 'object') return req.body;
  let brut = ''; for await (const m of req) { brut += m; if (brut.length > max) return { trop: true }; }
  try { return JSON.parse(brut || '{}'); } catch { return {}; }
}
/** Le créateur derrière un jeton Firebase : un vrai compte (e-mail ou Google), pas un compte anonyme de joueur. */
export async function createurDuJeton(jeton, base = BASE) {
  const uid = await uidDuJeton(jeton, base, 'zem_stats/jours/2000-01-01'); if (!uid) return null;
  let p = {}; try { p = JSON.parse(Buffer.from(String(jeton).split('.')[1], 'base64url').toString()); } catch { return null; }
  if (p.firebase?.sign_in_provider === 'anonymous' || !p.email) return null;
  return { uid, email: String(p.email).toLowerCase().slice(0, 120) };
}
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'jeu';
const hasard = () => Math.random().toString(36).slice(2, 6);
/** Ce que les joueurs voient d'un jeu (rien sur son créateur que son nom public). */
export const versionPublique = (f, id) => ({ id, type: f.type, nom: f.nom, accroche: f.accroche || '', description: f.description || '', createurs: f.createurs || '', web: f.web || '', pc: f.pc || '', plateformes: f.plateformes || [], android: f.android || '', ios: f.ios || '', video: f.video || '', code: f.code || '', captures: f.nCaptures || 0, v: f.modifie || 0 });
/** +1 sur un compteur, sous condition (ETag) : deux joueurs en même temps ne s'écrasent pas. */
export async function incrementer(B, chemin) {
  for (let i = 0; i < 6; i++) {
    const { val, etag } = await B.lire(chemin);
    if (await B.ecrireSi(chemin, (Number(val) || 0) + 1, etag)) return true;
  }
  return false;
}
/** Les compteurs d'un jeu sur `jours` jours : { vue: n, fiche: n, … }. */
export async function totaux(B, R, id, jours = 30, now = Date.now()) {
  const { val } = await B.lire(`${R}/stats/${id}`); const t = Object.fromEntries(QUOI.map(q => [q, 0])), depuis = jourDe(now - jours * 864e5);
  for (const [j, c] of Object.entries(val || {})) if (j >= depuis) for (const q of QUOI) t[q] += Number(c?.[q]) || 0;
  return t;
}
const reponse = (code, corps) => ({ code, corps });
/** Les messages entre un créateur et l'équipe, du plus ancien au plus récent (les `n` derniers). */
export async function fil(B, R, uid, n = 40) {
  const { val } = await B.lire(`${R}/messages/${uid}`);
  return Object.values(val || {}).sort((a, b) => a.t - b.t).slice(-n);
}

// ---------- Les actions ----------
export async function jeux(q, { secret = process.env.FIREBASE_DB_SECRET, base = BASE, now = Date.now(), methode = 'POST' } = {}) {
  if (!String(secret || '').trim()) return reponse(503, { statut: 'non-configure' });
  const B = baseAdmin(base, String(secret).trim()), R = racine();
  if (methode === 'GET') {
    if ('liste' in q) {
      const { val } = await B.lire(`${R}/publics`);
      const liste = Object.entries(val || {}).map(([id, j]) => ({ id, type: j.type, nom: j.nom, accroche: j.accroche, createurs: j.createurs, v: j.v, publie: j.publie || 0 }))
        .sort((a, b) => b.publie - a.publie);
      return reponse(200, { jeux: liste });
    }
    if (q.id) {
      if (!ID.test(q.id)) return reponse(400, { statut: 'id' });
      const { val } = await B.lire(`${R}/publics/${q.id}`);
      return val ? reponse(200, { jeu: val }) : reponse(404, { statut: 'introuvable' });
    }
    return reponse(400, { statut: 'demande-invalide' });
  }
  const action = String(q.action || '');
  if (action === 'compter') {
    if (!ID.test(q.id || '') || !QUOI.includes(q.quoi)) return reponse(400, { statut: 'demande-invalide' });
    const { val } = await B.lire(`${R}/publics/${q.id}/nom`); if (!val) return reponse(404, { statut: 'introuvable' });
    await incrementer(B, `${R}/stats/${q.id}/${jourDe(now)}/${q.quoi}`);
    return reponse(200, { statut: 'ok' });
  }
  if (!['moi', 'lire', 'enregistrer', 'supprimer', 'message'].includes(action)) return reponse(400, { statut: 'demande-invalide' });
  const moi = await createurDuJeton(q.jeton, base); if (!moi) return reponse(401, { statut: 'connexion' });
  const { val: c } = await B.lire(`${R}/createurs/${moi.uid}`);
  const mesJeux = Object.keys(c?.jeux || {});
  if (action === 'moi') {
    const fiches = [];
    for (const id of mesJeux) {
      const { val: f } = await B.lire(`${R}/fiches/${id}`); if (!f) continue;
      const { val: pub } = await B.lire(`${R}/publics/${id}/v`);
      fiches.push({ id, nom: f.nom, type: f.type, statut: f.statut, mot: f.mot || '', modifie: f.modifie || 0, enLigne: !!pub, stats: pub ? await totaux(B, R, id, 30, now) : null });
    }
    return reponse(200, { statut: 'ok', email: moi.email, fiches: fiches.sort((a, b) => b.modifie - a.modifie), messages: await fil(B, R, moi.uid) });
  }
  if (action === 'message') {
    const t = texte(q.texte, 1000); if (t.length < 2) return reponse(422, { statut: 'message-vide' });
    const id = q.id ? String(q.id) : ''; if (id && !mesJeux.includes(id)) return reponse(403, { statut: 'pas-a-toi' });
    const deja = await fil(B, R, moi.uid, 200);
    if (deja.filter(m => m.de === 'createur' && now - m.t < 864e5).length >= 20) return reponse(429, { statut: 'trop-de-messages' });
    await B.ecrire(`${R}/messages/${moi.uid}/${now}-${hasard()}`, { de: 'createur', texte: t, ...(id ? { id } : {}), ...(id && q.retrait === true ? { retrait: true } : {}), t: now });
    if (!c) await B.ecrire(`${R}/createurs/${moi.uid}`, { email: moi.email, jeux: {} });
    return reponse(200, { statut: 'ok', messages: await fil(B, R, moi.uid) });
  }
  if (action === 'lire' || action === 'supprimer') {
    if (!mesJeux.includes(q.id)) return reponse(403, { statut: 'pas-a-toi' });
    const { val: f } = await B.lire(`${R}/fiches/${q.id}`); if (!f) return reponse(404, { statut: 'introuvable' });
    if (action === 'lire') {
      const { val: im } = await B.lire(`${R}/images/brouillon/${q.id}`);
      const { uid, email, ...fiche } = f; void uid; void email;
      return reponse(200, { statut: 'ok', fiche: { ...fiche, images: im || {} } });
    }
    const { val: pub } = await B.lire(`${R}/publics/${q.id}/v`);
    if (pub) return reponse(409, { statut: 'en-ligne' }); // un jeu en ligne se retire par l'équipe (accord créateur)
    await B.supprimer(`${R}/fiches/${q.id}`); await B.supprimer(`${R}/images/brouillon/${q.id}`); await B.supprimer(`${R}/createurs/${moi.uid}/jeux/${q.id}`);
    return reponse(200, { statut: 'ok' });
  }
  // enregistrer
  const envoyer = q.envoyer === true, { fiche, images, erreurs } = verifierFiche(q.fiche, { envoyer });
  if (Object.keys(erreurs).length) return reponse(422, { statut: 'fiche', erreurs });
  let id = String(q.id || ''), avant = null;
  if (id) {
    if (!mesJeux.includes(id)) return reponse(403, { statut: 'pas-a-toi' });
    avant = (await B.lire(`${R}/fiches/${id}`)).val;
  } else {
    if (mesJeux.length >= 10) return reponse(429, { statut: 'trop-de-jeux' });
    id = `${slug(fiche.nom)}-${hasard()}`;
  }
  const { val: imAvant } = await B.lire(`${R}/images/brouillon/${id}`);
  const im = {};
  for (const k of CLES_IMAGES) { const x = images[k]; if (x === 'garder') { if (imAvant?.[k]) im[k] = imAvant[k]; } else if (x) im[k] = x; }
  const captures = ['c0', 'c1', 'c2', 'c3', 'c4'].map(k => im[k]).filter(Boolean), imOrdre = { a: im.a };
  captures.forEach((x, i) => { imOrdre[`c${i}`] = x; });
  const statut = envoyer ? 'attente' : (avant?.statut === 'publie' || avant?.statut === 'attente' ? avant.statut : 'brouillon');
  const f = { ...fiche, nCaptures: captures.length, uid: moi.uid, email: moi.email, statut, mot: envoyer ? '' : (avant?.mot || ''), cree: avant?.cree || now, modifie: now, ...(envoyer ? { accord: { v: ACCORD, t: now } } : avant?.accord ? { accord: avant.accord } : {}) };
  await B.ecrire(`${R}/images/brouillon/${id}`, imOrdre);
  await B.ecrire(`${R}/fiches/${id}`, f);
  if (!avant) await B.ecrire(`${R}/createurs/${moi.uid}`, { email: moi.email, jeux: { ...(c?.jeux || {}), [id]: true } });
  return reponse(200, { statut: 'ok', id, etat: statut });
}

// ---------- Le lien qui reconnaît le téléphone (comme le lien unique de Handi chez Lagos Life) ----------
/** L'adresse du magasin pour l'appareil `ua`, marquée « Kutɔnu Vibes » : Google Play range ces installations sous
 *  utm_source=kutonuvibes dans la console du créateur. Sans magasin pour cet appareil, la page de l'autre. */
export function magasinPour(j, ua = '') {
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua));
  const android = j.android ? `${j.android}&referrer=${encodeURIComponent('utm_source=kutonuvibes&utm_medium=salle-de-jeux')}` : '';
  const apple = j.ios ? `${j.ios}?ct=kutonuvibes` : '';
  return (ios ? apple || android : android || apple) || null;
}
export async function aller(q, ua, { secret = process.env.FIREBASE_DB_SECRET, base = BASE, now = Date.now() } = {}) {
  if (!ID.test(q.aller || '') || !String(secret || '').trim()) return null;
  const B = baseAdmin(base, String(secret).trim()), R = racine();
  const { val: j } = await B.lire(`${R}/publics/${q.aller}`); if (!j || j.type === 'web') return null;
  const url = j.type === 'pc' ? j.pc : magasinPour(j, ua); if (!url) return null; // un jeu d'ordinateur : sa page de téléchargement
  await incrementer(B, `${R}/stats/${q.aller}/${jourDe(now)}/magasin`).catch(() => {});
  return url;
}

// ---------- Les images publiées, servies comme des fichiers (mises en cache par Vercel) ----------
export async function image(q, { secret = process.env.FIREBASE_DB_SECRET, base = BASE, dossier = 'public' } = {}) {
  const k = q.k === 'a' ? 'a' : /^[0-4]$/.test(q.k || '') ? `c${q.k}` : null;
  if (!ID.test(q.img || '') || !k || !String(secret || '').trim()) return null;
  const { val } = await baseAdmin(base, String(secret).trim()).lire(`${racine()}/images/${dossier}/${q.img}/${k}`);
  const m = String(val || '').match(/^data:(image\/(?:jpeg|webp|png));base64,(.+)$/); if (!m) return null;
  return { type: m[1], octets: Buffer.from(m[2], 'base64') };
}

// Quelques appels par minute et par adresse : la salle compte une vue, une fiche, un clic ; l'espace créateurs enregistre.
const ESSAIS = new Map();
const tropDEssais = (ip, n = 60) => { const t = Date.now(), l = (ESSAIS.get(ip) || []).filter(x => t - x < 60e3); l.push(t); ESSAIS.set(ip, l); if (ESSAIS.size > 5000) ESSAIS.clear(); return l.length > n; };
const parametres = req => Object.fromEntries(new URL(req.url, 'http://x').searchParams);

export default async function handler(req, res, secrets = {}) { // en local, vite.config.js passe { secret } de .env.local
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim(), secret = secrets.secret ?? process.env.FIREBASE_DB_SECRET;
  try {
    if (req.method === 'GET') {
      const q = parametres(req);
      if (q.aller) {
        const url = await aller(q, String(req.headers['user-agent'] || ''), { secret });
        res.statusCode = url ? 302 : 404; res.setHeader('Cache-Control', 'no-store'); if (url) res.setHeader('Location', url); res.end(); return;
      }
      if (q.img) {
        const im = await image(q, { secret });
        if (!im) { res.statusCode = 404; res.end(); return; }
        res.statusCode = 200; res.setHeader('Content-Type', im.type); res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800'); res.end(im.octets); return;
      }
      const r = await jeux(q, { secret, methode: 'GET' });
      res.statusCode = r.code; res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', r.code === 200 ? 'public, max-age=30, s-maxage=60, stale-while-revalidate=600' : 'no-store'); // un jeu validé apparaît en une minute
      res.end(JSON.stringify(r.corps)); return;
    }
    let r;
    if (req.method !== 'POST') r = reponse(405, { statut: 'methode' });
    else if (!origineAdmise(req.headers.origin || '')) r = reponse(403, { statut: 'origine-refusee' });
    else if (tropDEssais(ip)) r = reponse(429, { statut: 'trop-d-essais' });
    else { const q = await lireCorpsGrand(req); r = q.trop ? reponse(413, { statut: 'trop-lourd' }) : await jeux(q, { secret }); }
    res.statusCode = r.code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(r.corps));
  } catch (e) {
    console.error('jeux', e?.message); // jamais le jeton ni le secret
    res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify({ statut: 'serveur-injoignable' }));
  }
}
