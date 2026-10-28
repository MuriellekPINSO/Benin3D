import * as THREE from 'three';
import { $, toXZ } from './base.js';
import { PLACES } from './donnees-lieux.js';
import { groupeLieu } from './lieux.js';
import { poserObstacles } from './rue.js';
import { MAX_DECOR, reduireImage } from './textures.js';
import { son } from './audio.js';
import { firebase, joueur } from './firebase.js';
import { filtrer } from './moderation.js';
import { VIE, ecrire } from './vie.js';
import { ABSENT, BATTEMENT, DUREE, DUREES, FIN_CHAT, MAX_JOUEURS, MIN_JOUEURS, PARTI, THEMES, XP_PARTIE, XP_VICTOIRE, indiceRefuse, orateur, reparer } from './faux-frere-regles.js';

// ---------- Le Faux Frère : au maquis de la plage de Fidjrossè ----------
// Le jeu de l'intrus, refait d'après les règles de Murielle du 28/10 (faux-frere-regles.js) : des frères qui ont tous le
// même mot, un ou deux faux frères qui ont un mot proche sans le savoir, parfois un Ignorant sans mot ; un tour d'indices
// (un seul mot chacun), puis la discussion et le vote ensemble, jusqu'à ce qu'un camp gagne. Environ 5 minutes.
//
// Où : le maquis de plage Tanti Rosine, ouvert à tous, à côté du stand du lance-pierre. Le plan disait « depuis son
// maquis », mais les maquis des joueurs (commerces.js) ne se voient que de leur patron : on ne pourrait pas y réunir les
// autres. On y ouvre un salon (un code de 6 lettres) ; les joueurs présents le rejoignent (« Rejoindre »), les autres par
// le lien partagé (WhatsApp…) : ?salon=<la ville>&ami=…&de=…&ff=<le salon>, qui mène dans la ville de l'hôte, puis à la
// table. On s'assoit autour des deux tables. Le salon reste ouvert d'une partie à l'autre (« Rejouer »).
// Qui décide : l'arbitre (faux-frere-arbitre.js), sur le serveur (/api/faux-frere) — la paire de mots, les rôles, la
// composition, l'ordre de parole, les minuteurs, les indices refusés, les votes. Chacun ne reçoit que son mot. La page
// écrit seulement ce qui est à elle : sa place au salon et son signe de vie, les réglages (l'hôte), ses messages.
// Firebase (règles dans database.rules.json) : zem_ff2/{salon} = { salon (la ville), lieu, cree, reglages: { duree,
//   theme }, joueurs/{uid}: { n, t, vu, m }, pub (écrit par l'arbitre : { rev, hote, etat, n, jeu, recap, finT }),
//   ms (chat du salon), mp (chat de partie) } ; zem_ff2_morts/{salon} : la discussion des éliminés.
// En développement, ?salon-local : les onglets du même navigateur jouent ensemble (localStorage), et l'arbitre tourne dans
// la page avec le même code que sur le serveur ; ?ff-3 : on lance à trois.

const LP = PLACES.find(q => q.id === 'fidjrosse'), [FX, FZ] = LP ? toXZ(LP.lat, LP.lon) : [0, 0];
export const MAQUIS = { x: FX - 18, z: FZ + 18 }; // à 26 m de l'arrivée « Plage de Fidjrossè », côté ouest
const presDuMaquis = (x, z, r = 7) => Math.hypot(x - MAQUIS.x, z - MAQUIS.z) < r;
const Q = new URLSearchParams(location.search), LOCAL = import.meta.env.DEV && Q.has('salon-local');
const MIN = import.meta.env.DEV && Q.has('ff-3') ? 3 : MIN_JOUEURS; // en test : à trois
const TS = { '.sv': 'timestamp' }; // l'heure du serveur, à l'écriture (comme d.serverTimestamp())
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const LETTRES = 'abcdefghjkmnpqrstuvwxyz23456789'; // le code du salon : ni 0/o, ni 1/l/i
const codeSalon = () => Array.from({ length: 6 }, () => LETTRES[Math.floor(Math.random() * LETTRES.length)]).join('');

let X = null; // le salon de la ville : { S, T, ligne, choisir, bulleDe, dehors }
// Le salon de Faux Frère où l'on est : ce que la base en dit (P), son mot pour la partie n, les mots de tous (une fois
// éliminé) et la discussion des éliminés, ce qui a déjà été annoncé, sa place à table, ce que l'on regarde.
const G = { id: '', P: null, off: null, mot: null, motN: 0, motT: 0, mots: null, motsN: 0, motsT: 0, morts: [], offMorts: null, mortsDe: '', vus: new Set(), assisN: null, debout: false, carte: false, choix: '', onglet: 'salon', lus: {}, entreT: 0, batT: 0, avanceT: 0, rien: false, xp: {}, ecritT: 0, tour: '' };
// Les salons de la ville (pour « Rejoindre »), et l'invitation reçue par lien (?ff=).
const OUV = { liste: [], off: null, code: '', nettoyes: new Map() };
const INV = { id: /^[a-z0-9]{6,24}$/.test(Q.get('ff') || '') ? Q.get('ff') : '', off: null, P: null, recu: false, fait: false };
const BASE = { decalage: 0 };
const maintenant = () => Date.now() + BASE.decalage;

// ---------- La base : Firebase, ou localStorage entre onglets (mode test) ----------
const LS = 'kutonu.ff2.local', canalLS = LOCAL ? new BroadcastChannel('kutonu-ff') : null, ecouteursLS = new Set();
const lireLocal = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } };
function majLocal(f) { const b = lireLocal(); if (f(b) === false) return; localStorage.setItem(LS, JSON.stringify(b)); canalLS?.postMessage(1); for (const e of ecouteursLS) e(); }
canalLS?.addEventListener('message', () => { for (const e of ecouteursLS) e(); });
const heures = v => (v && typeof v === 'object' ? (v['.sv'] ? Date.now() : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, heures(x)]))) : v);
const obtenir = (b, chemin) => chemin.split('/').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), b);
function poser(b, chemin, val) {
  const k = chemin.split('/'); let o = b;
  for (const c of k.slice(0, -1)) o = o[c] && typeof o[c] === 'object' ? o[c] : (o[c] = {});
  if (val == null) delete o[k.at(-1)]; else o[k.at(-1)] = val;
}
const B = {
  async uid() { return LOCAL ? X.S.R?.id : (await joueur()).uid; },
  async ecrire(chemin, val) {
    if (LOCAL) return majLocal(b => { poser(b, chemin, heures(val)); });
    const { d, db } = await firebase(); await joueur(); return d.set(d.ref(db, chemin), val);
  },
  async pousser(chemin, val) {
    if (LOCAL) return majLocal(b => { poser(b, `${chemin}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, heures(val)); });
    const { d, db } = await firebase(); await joueur(); return d.push(d.ref(db, chemin), val);
  },
  suivre(chemin, cb, ko = () => {}) {
    if (LOCAL) { const f = () => cb(obtenir(lireLocal(), chemin) ?? null); ecouteursLS.add(f); f(); return () => ecouteursLS.delete(f); }
    let off = () => {}, fini = false;
    firebase().then(async ({ d, db }) => { await joueur(); if (!fini) off = d.onValue(d.ref(db, chemin), s => cb(s.val()), ko); }).catch(() => {});
    return () => { fini = true; off(); };
  },
  suivreSalons(code, cb) {
    if (LOCAL) { const f = () => cb(Object.entries(lireLocal().zem_ff2 || {}).filter(([, P]) => P.salon === code).map(([id, P]) => ({ id, ...P }))); ecouteursLS.add(f); f(); return () => ecouteursLS.delete(f); }
    let off = () => {}, fini = false;
    firebase().then(async ({ d, db }) => {
      await joueur(); if (fini) return;
      off = d.onValue(d.query(d.ref(db, 'zem_ff2'), d.orderByChild('salon'), d.equalTo(code), d.limitToLast(12)), s => { const l = []; s.forEach(e => { l.push({ id: e.key, ...e.val() }); }); cb(l); });
    }).catch(() => {});
    return () => { fini = true; off(); };
  },
};
function heureServeur() {
  if (LOCAL) return;
  firebase().then(({ d, db }) => d.onValue(d.ref(db, '.info/serverTimeOffset'), s => { BASE.decalage = s.val() || 0; })).catch(() => {});
}
// En mode test, l'arbitre tourne ici, sur la base de localStorage vue « en administrateur » (avec ses ETag).
const empreinte = v => { const s = JSON.stringify(v ?? null); let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return `${s.length}-${h}`; };
const baseLocale = {
  async lire(chemin) { const v = obtenir(lireLocal(), chemin) ?? null; return { val: v, etag: empreinte(v) }; },
  async ecrireSi(chemin, val, etag) { let ok = false; majLocal(b => { if (empreinte(obtenir(b, chemin) ?? null) !== etag) return false; poser(b, chemin, val == null ? null : JSON.parse(JSON.stringify(val))); ok = true; }); return ok; },
  async supprimer(chemin) { majLocal(b => { poser(b, chemin, null); }); },
};
/** L'arbitre : `quoi` (voir api/faux-frere.js), pour le salon `partie`. `qui` : en mode test, jouer à la place d'un autre. */
async function arbitre(quoi, plus = {}, { partie = G.id, qui = '' } = {}) {
  if (LOCAL) {
    const { arbitrer } = await import('./faux-frere-arbitre.js');
    const r = await arbitrer({ partie, quoi, ...plus }, qui || X.S.R?.id, baseLocale, { min: MIN });
    if (r.code >= 400) throw Object.assign(new Error(r.corps.erreur), { code: r.corps.erreur }); return r.corps;
  }
  const u = await joueur(), jeton = await u.getIdToken();
  const r = await fetch('/api/faux-frere', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partie, jeton, quoi, ...plus }) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.erreur || `arbitre-${r.status}`), { code: d.erreur || '' });
  return d;
}

// ---------- Le maquis ----------
const SIEGES = []; // { x, z, cap } en coordonnées de la ville, dix places autour de deux tables
const TOIT = { mats: [], o: 1 }; // les matières du toit et des enseignes, et leur opacité
export function construireMaquis() {
  const g = groupeLieu('Maquis Tanti Rosine', MAQUIS.x, MAQUIS.z); g.userData.portee = 1200;
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  const bois = mat('#8a5a32'), rouge = mat('#c8352b'), dalle = mat('#d8cdb9'), table = mat('#e8b33a');
  // Le toit et les enseignes s'effacent quand on est assis dessous : la caméra, derrière soi et plus haut, ne voyait que la paille.
  const paille = new THREE.MeshLambertMaterial({ color: '#c9a45c', transparent: true }), franges = new THREE.MeshLambertMaterial({ color: '#a8843f', transparent: true });
  TOIT.mats.push(paille, franges);
  box(8, .08, 7.6, dalle, 0, .04, 0); // la dalle de ciment
  for (const x of [-3.5, 3.5]) for (const z of [-3.3, 3.3]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.09, .11, 2.9, 7), bois); p.position.set(x, 1.45, z); p.castShadow = true; g.add(p); }
  // Le toit de paille : une pyramide basse, et sa frange.
  const toit = new THREE.Mesh(new THREE.ConeGeometry(5.9, 1.7, 4, 1, true).rotateY(Math.PI / 4), paille); toit.position.set(0, 3.7, 0); toit.castShadow = true; g.add(toit);
  const frange = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.9, .35, 4, 1, true).rotateY(Math.PI / 4), franges); frange.position.set(0, 2.85, 0); g.add(frange);
  // Le comptoir du fond, les casiers de boissons, les bouteilles.
  box(3.4, 1.05, .6, bois, 0, .53, -2.9); box(3.5, .06, .7, mat('#6b4426'), 0, 1.08, -2.9);
  for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.035, .04, .26, 8), mat(i % 3 ? '#2f6b3a' : '#6b3d1c')); b.position.set(-1.3 + i * .42, 1.24, -2.95); g.add(b); }
  for (const x of [-2.6, 2.4]) box(.5, .35, .35, mat(x < 0 ? '#c8382f' : '#f5c518'), x, .2, -3.0);
  // L'enseigne, au-dessus de l'entrée, côté mer.
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 200; const c = cv.getContext('2d');
  c.fillStyle = '#1a7d52'; c.fillRect(0, 0, 1024, 200); c.fillStyle = '#f5c518'; c.font = '900 92px Impact, "Arial Black", sans-serif'; c.textAlign = 'center'; c.fillText('MAQUIS TANTI ROSINE', 512, 110);
  c.fillStyle = '#ffffff'; c.font = '700 40px system-ui, sans-serif'; c.fillText('Poisson braisé · Boissons fraîches · Le Faux Frère', 512, 166);
  const t = new THREE.CanvasTexture(reduireImage(cv, MAX_DECOR)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const enseigne = new THREE.MeshBasicMaterial({ map: t, transparent: true }); TOIT.mats.push(enseigne);
  for (const [z, ry] of [[3.42, 0], [-3.42, Math.PI]]) { const e = new THREE.Mesh(new THREE.PlaneGeometry(4.6, .9), enseigne); e.position.set(0, 2.55, z); e.rotation.y = ry; g.add(e); }
  // Deux tables rondes, cinq chaises en plastique autour de chacune (comme les tabourets du salon).
  const obst = [[MAQUIS.x, MAQUIS.z - 2.9, 0, 3.5, .7]];
  for (const tx of [-1.7, 1.7]) {
    const tz = .5, plateau = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, .05, 20), table); plateau.position.set(tx, .74, tz); plateau.castShadow = true; g.add(plateau);
    const pied = new THREE.Mesh(new THREE.CylinderGeometry(.05, .2, .72, 8), bois); pied.position.set(tx, .36, tz); g.add(pied);
    obst.push([MAQUIS.x + tx, MAQUIS.z + tz, 0, .9, .9]);
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2 + .3, x = tx + Math.sin(a) * 1.05, z = tz + Math.cos(a) * 1.05, cap = Math.atan2(tx - x, tz - z);
      const ch = new THREE.Group(); ch.position.set(x, 0, z); ch.rotation.y = cap; g.add(ch);
      const bloc = (sx, sy, sz, bx, by, bz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), rouge); m.position.set(bx, by, bz); m.castShadow = true; ch.add(m); };
      bloc(.44, .05, .42, 0, .44, -.04); bloc(.44, .4, .04, 0, .66, -.25);
      for (const [lx, lz] of [[-.19, .14], [.19, .14], [-.19, -.22], [.19, -.22]]) bloc(.035, .44, .035, lx, .22, lz);
      SIEGES.push({ x: MAQUIS.x + x, z: MAQUIS.z + z, cap });
    }
  }
  for (const x of [-3.5, 3.5]) for (const z of [-3.3, 3.3]) obst.push([MAQUIS.x + x, MAQUIS.z + z, 0, .25, .25]);
  poserObstacles('fauxfrere', obst);
  return g;
}

// ---------- Ce que la page lit d'un salon ----------
const arrivee = P => Object.entries(P?.joueurs || {}).sort(([a, x], [b, y]) => ((x?.t || 0) - (y?.t || 0)) || (a < b ? -1 : 1)).map(([u]) => u);
const vuDe = (P, u) => Number(P?.joueurs?.[u]?.vu) || 0;
const presents = (P, t = maintenant()) => arrivee(P).filter(u => t - vuDe(P, u) <= PARTI);
const nomDe = (P, J, u) => filtrer(J?.noms?.[u] || P?.joueurs?.[u]?.n || '?');
const teinte = u => { let h = 0; for (const c of String(u)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h % 360; };
const ROLES = { frere: 'Frère', faux: 'Faux frère', ignorant: 'L’Ignorant' };
const ROLES_DE = { frere: 'un frère', faux: 'un faux frère', ignorant: 'l’Ignorant' };
const GAGNANTS = { freres: 'Les frères gagnent !', imposteurs: 'Les imposteurs gagnent !', ignorant: 'L’Ignorant gagne seul !' };
const REFUS = { 'un-mot': 'Un seul mot, sans espace (2 à 24 lettres).', grossier: 'Pas de gros mots.', 'mot-secret': 'Trop proche de ton mot secret ! Donne un autre mot.' };
const secondes = t => Math.max(0, Math.ceil((t - maintenant()) / 1000));
const enTableau = x => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);
const enListe = noms => (noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}` : noms[0] || '');

// ---------- Les boutons du maquis (salon.js) ----------
export const enPartie = () => !!G.id;
/** Au maquis, hors d'un salon : rejoindre un salon ouvert, ou en ouvrir un. Dans un salon, tout se fait dans son panneau. */
export function actionsFauxFrere(S, T) {
  if (X) X.T = T;
  if (T.mode !== 'pied' || S.lieu || G.id || !presDuMaquis(S.x, S.z)) return [];
  const t = maintenant(), ouverts = OUV.liste.filter(P => P.pub?.etat === 'salon' && presents(P, t).length && arrivee(P).length < MAX_JOUEURS).slice(0, 2);
  if (ouverts.length) return ouverts.map(P => ({ texte: `Rejoindre le Faux Frère de ${nomDe(P, null, P.pub.hote)} · ${arrivee(P).length}/${MAX_JOUEURS}`, f: () => rejoindre(P.id) }));
  return [{ texte: 'Ouvrir un salon de Faux Frère', f: creer }];
}
const nom = () => filtrer(String(X.S.nom || '').trim()).slice(0, 16) || 'Joueur';
const moiAuSalon = () => ({ n: nom(), t: TS, vu: TS });
async function creer() {
  const S = X.S, uid = await B.uid(); if (!uid || G.id) return;
  for (let essai = 0; essai < 3; essai++) { // un code déjà pris : la base refuse, on en tire un autre
    const id = codeSalon();
    try { await B.ecrire(`zem_ff2/${id}`, { salon: S.code, lieu: 'fidjrosse', cree: TS, pub: { rev: 0, n: 0, etat: 'salon', hote: uid }, reglages: { duree: DUREE, theme: 'tous' }, joueurs: { [uid]: moiAuSalon() } }); }
    catch (e) { if (essai < 2) continue; console.warn('faux frère', e.message); X.ligne('Le salon n’a pas pu être ouvert : vérifie ta connexion.'); return; }
    suivreSalon(id);
    X.ligne(`Salon de Faux Frère ouvert (code ${id.toUpperCase()}). Il faut ${MIN} joueurs au moins : partage le code, ceux qui sont en ville sont prévenus.`);
    S.canal?.dire({ n: S.nom, txt: 'J’ouvre un salon de Faux Frère au maquis Tanti Rosine, plage de Fidjrossè : viens jouer !', lieu: 'fidjrosse' });
    return;
  }
}
async function rejoindre(id, P0 = null) {
  const uid = await B.uid(); if (!uid || G.id === id) return;
  const P = P0 || OUV.liste.find(x => x.id === id);
  if (P && arrivee(P).length >= MAX_JOUEURS) { X.ligne(`Ce salon est complet (${MAX_JOUEURS} joueurs).`); return; }
  if (G.id) await quitter();
  try { await B.ecrire(`zem_ff2/${id}/joueurs/${uid}`, moiAuSalon()); } catch { X.ligne('Impossible de rejoindre ce salon : la partie a sans doute commencé. Attends la suivante.'); return; }
  suivreSalon(id); son('piece');
}
/** On s'en va : le serveur nous retire (en partie, notre rôle est révélé) et passe la main si l'on était l'hôte. */
async function quitter(parler = false) {
  const id = G.id; if (!id) return;
  const uid = await B.uid().catch(() => '');
  arbitre('quitter', {}, { partie: id }).catch(() => { if (uid) B.ecrire(`zem_ff2/${id}/joueurs/${uid}`, null).catch(() => {}); }); // sans le serveur, on s'efface soi-même (au salon)
  laisser();
  if (parler) X.ligne('Tu as quitté le salon de Faux Frère.');
}
/** On ne suit plus le salon (on l'a quitté, ou il n'existe plus). */
function laisser() {
  G.off?.(); G.offMorts?.();
  Object.assign(G, { id: '', P: null, off: null, mot: null, motN: 0, mots: null, motsN: 0, morts: [], offMorts: null, mortsDe: '', assisN: null, debout: false, carte: false, choix: '', onglet: 'salon', lus: {}, tour: '' });
  G.vus.clear(); panneau(false);
}
function suivreSalon(id) {
  G.off?.(); laisser(); G.id = id; G.entreT = performance.now(); G.batT = 0;
  G.off = B.suivre(`zem_ff2/${id}`, P => {
    if (G.id !== id) return;
    if (!P) { if (G.P) X.ligne('Le salon de Faux Frère est fermé.'); laisser(); return; }
    if (P.pub?.jeu) reparer(P.pub.jeu); if (P.pub?.recap) reparer(P.pub.recap); // la base rend les listes en objets
    G.P = P;
  });
  panneau(true);
}
/** Le lien d'invitation : la ville de l'hôte, à côté de lui, puis la table (?ff=). */
const lienInvitation = () => { const S = X.S, q = new URLSearchParams({ salon: S.code }); if (S.R?.id) q.set('ami', S.R.id); if (S.nom) q.set('de', S.nom); q.set('ff', G.id); return `${location.origin}${location.pathname}?${q}`; };
async function partager() {
  const url = lienInvitation(), texte = `Viens jouer au Faux Frère avec moi au maquis Tanti Rosine, à Cotonou (salon ${G.id.toUpperCase()}) :`;
  try { if (navigator.share) { await navigator.share({ title: 'Le Faux Frère', text: texte, url }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); X.ligne('Lien du salon copié : colle-le dans WhatsApp. Tes amis arriveront à la table.'); } catch { X.ligne(`Envoie ce lien à tes amis : ${url}`); }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${texte} ${url}`)}`, '_blank', 'noopener');
}
/** Arrivé en ville par le lien d'un salon : on propose la table (sans payer de téléportation, c'est une invitation). */
function invitation(S) {
  if (!INV.id || INV.fait || !S.actif || !S.moi || G.id) return;
  if (!INV.off) INV.off = B.suivre(`zem_ff2/${INV.id}`, P => { INV.P = P; INV.recu = true; });
  if (!INV.recu || X.T?.mode !== 'pied' || S.couche || performance.now() - (S.entreeT || 0) < 2500) return;
  INV.fait = true; INV.off(); const P = INV.P;
  if (!P) { X.ligne('Ce salon de Faux Frère est fermé.'); return; }
  const hote = nomDe(P, null, P.pub?.hote);
  if (P.pub?.etat !== 'salon') { X.ligne(`La partie de Faux Frère de ${hote} a déjà commencé : va au maquis Tanti Rosine (plage de Fidjrossè), tu joueras la suivante.`); return; }
  X.choisir(`${hote} t’invite au Faux Frère`, [{ texte: 'Rejoindre la table', sous: 'Maquis Tanti Rosine, plage de Fidjrossè', f: () => {
    if (X.T?.mode !== 'pied') { X.ligne('Descends d’abord de ton véhicule.'); return; }
    if (S.lieu) X.dehors?.(false);
    S.x = MAQUIS.x + (Math.random() - .5) * 2; S.z = MAQUIS.z + 4.5; S.cap = Math.PI; S.saut = true; S.geste = 'idle';
    rejoindre(INV.id, P);
  } }], { annuler: 'Plus tard' });
}
function asseoir(S) {
  const i = Math.max(0, arrivee(G.P).indexOf(S.R?.id)), c = SIEGES[i % SIEGES.length]; if (!c) return;
  S.x = c.x; S.z = c.z; S.cap = c.cap; S.geste = 'assis'; S.gesteFin = 0; S.saut = true; G.debout = false;
}

// ---------- À chaque image ----------
let tic = 0;
export function majFauxFrere(dt, S) {
  const o = S.lieu || !presDuMaquis(S.x, S.z, 4.6) ? 1 : .15; // sous la paillote : on voit à travers le toit
  if (Math.abs(TOIT.o - o) > .01) { TOIT.o += (o - TOIT.o) * Math.min(1, dt * 5); for (const m of TOIT.mats) { m.opacity = TOIT.o; m.depthWrite = TOIT.o > .99; } }
  // Les salons de la ville : on ne les écoute qu'à l'approche du maquis.
  const pres = presDuMaquis(S.x, S.z, 60);
  if (pres && S.code && OUV.code !== S.code) { OUV.off?.(); OUV.code = S.code; OUV.off = B.suivreSalons(S.code, l => { OUV.liste = l; }); }
  else if (!pres && OUV.off && !G.id) { OUV.off(); OUV.off = null; OUV.code = ''; OUV.liste = []; }
  if ((tic += dt) < .2) return; tic = 0;
  invitation(S);
  nettoyer();
  if (!G.id || !G.P) return;
  const P = G.P, pub = P.pub || {}, moi = S.R?.id, t = maintenant(), J = pub.etat === 'jeu' ? pub.jeu : null, R = J ? null : pub.recap;
  if (t - G.batT > BATTEMENT && moi) { G.batT = t; battre(moi); } // « je suis là »
  if (performance.now() - G.entreT > 6000 && !P.joueurs?.[moi]) { // retiré par l'arbitre (une minute sans nouvelles), ou parti d'ailleurs
    X.ligne(J?.morts?.[moi]?.c === 'absent' ? 'Tu as perdu le réseau trop longtemps : tu as été retiré de la partie de Faux Frère.' : 'Tu n’es plus dans le salon de Faux Frère.');
    laisser(); return;
  }
  const dans = !!J && J.joueurs.includes(moi);
  if (dans && G.motN !== J.n && performance.now() - G.motT > 2500) { // son mot, une fois par partie (la carte est retournée face cachée)
    G.motT = performance.now();
    arbitre('mot').then(r => { if (r?.n === G.P?.pub?.jeu?.n) { G.mot = r; G.motN = r.n; G.carte = false; } }).catch(e => console.warn('faux frère', e.message));
  }
  if (dans && J.morts[moi] && G.motsN !== J.n && performance.now() - G.motsT > 2500) { // éliminé : les mots de tous, et la discussion des éliminés
    G.motsT = performance.now();
    arbitre('mots').then(r => { if (r?.mots) { G.mots = r.mots; G.motsN = r.n; } }).catch(e => console.warn('faux frère', e.message));
  }
  const fil = dans && J.morts[moi] ? `${G.id}.${J.n}` : '';
  if (fil !== G.mortsDe) {
    G.offMorts?.(); G.offMorts = null; G.morts = []; G.mortsDe = fil;
    if (fil) G.offMorts = B.suivre(`zem_ff2_morts/${G.id}`, v => { G.morts = Object.entries(v || {}).map(([cle, m]) => ({ cle, ...m })); }, () => { G.morts = []; });
    if (!fil && G.onglet === 'morts') G.onglet = J ? 'partie' : 'salon';
  }
  // À table : assis dès qu'on entre au salon, et de nouveau au début de chaque partie ; debout une fois éliminé.
  const n = J ? J.n : -1;
  if (G.assisN !== n && presDuMaquis(S.x, S.z, 25) && X.T?.mode === 'pied' && !S.lieu) { G.assisN = n; asseoir(S); }
  if (dans && (J.morts[moi] || (J.phase !== 'vote' && J.resultat?.u === moi)) && !G.debout) { G.debout = true; if (S.geste === 'assis') S.geste = 'idle'; }
  if (R) donnerXp(R, moi);
  if (besoin(P, J, t) && performance.now() - G.avanceT > (G.rien ? 5000 : 1500)) { // une échéance passée : l'arbitre l'applique
    G.avanceT = performance.now() + Math.random() * 500;
    arbitre('avancer').then(r => { G.rien = !!r?.rien; }).catch(e => { G.rien = true; console.warn('faux frère', e.message); });
  }
  annoncer(P, J, R, moi);
  rendre(P, pub, J, R, moi, t);
}
function battre(moi) {
  if (LOCAL) return majLocal(b => { const j = obtenir(b, `zem_ff2/${G.id}/joueurs/${moi}`); if (!j) return false; j.vu = Date.now(); }); // sans règles : ne pas se recréer une fois retiré
  B.ecrire(`zem_ff2/${G.id}/joueurs/${moi}/vu`, TS).catch(() => {});
}
/** Faut-il demander à l'arbitre d'avancer ? Une échéance passée (heure du serveur), un orateur muet, un absent. */
function besoin(P, J, t) {
  const pub = P.pub || {};
  if (J) {
    if (J.jusqua && t > J.jusqua + 300) return true;
    if (J.phase === 'vote' && ((J.attente && t > J.attente + 300) || (J.plafond && t > J.plafond + 300))) return true;
    const o = orateur(J); if (o && t - vuDe(P, o) > ABSENT + 1500) return true;
    return J.joueurs.some(u => J.vivants[u] && t - vuDe(P, u) > PARTI + 1500);
  }
  if (arrivee(P).some(u => t - vuDe(P, u) > PARTI + 1500)) return true;
  if (pub.hote && !P.joueurs?.[pub.hote]) return true;
  return !!(pub.finT && P.mp && t > pub.finT + FIN_CHAT + 1500);
}
/** Les salons abandonnés de la ville (plus personne depuis une minute) : l'arbitre les ferme quand on passe à côté. */
function nettoyer() {
  const t = maintenant();
  for (const P of OUV.liste) {
    if (P.id === G.id || presents(P, t).length || t - (Number(P.cree) || 0) < PARTI || performance.now() - (OUV.nettoyes.get(P.id) || -1e9) < 60e3) continue;
    OUV.nettoyes.set(P.id, performance.now()); arbitre('avancer', {}, { partie: P.id }).catch(() => {});
  }
}
/** L'expérience d'une partie jouée jusqu'au bout, plus pour le camp gagnant : une seule fois par partie. */
function donnerXp(R, moi) {
  const cle = `${G.id}.${R.n}`; if (G.xp[cle] !== undefined || !R.fin || !R.joueurs.includes(moi)) return;
  let deja = {}; try { deja = JSON.parse(localStorage.getItem('kutonu.ff.xp') || '{}'); } catch { /* navigation privée */ }
  if (cle in deja) { G.xp[cle] = deja[cle]; return; }
  const m = R.morts[moi], r = R.fin.roles?.[moi], g = R.gagnant, gagne = g === 'ignorant' ? r === 'ignorant' : g === 'freres' ? r === 'frere' : r !== 'frere';
  const gain = m && m.c !== 'vote' ? 0 : XP_PARTIE + (gagne ? XP_VICTOIRE : 0); // parti avant la fin : rien
  G.xp[cle] = deja[cle] = gain;
  try { localStorage.setItem('kutonu.ff.xp', JSON.stringify(Object.fromEntries(Object.entries(deja).slice(-40)))); } catch { /* navigation privée */ }
  if (gain && VIE.data) ecrire({ xp: (Number(VIE.data.xp) || 0) + gain });
}
/** Ce qui vient d'arriver : l'indice en bulle au-dessus du joueur, le rôle de l'éliminé, son tour, la fin. */
function annoncer(P, J, R, moi) {
  const E = J || R; if (!E) return;
  const recent = x => maintenant() - (x || 0) < 12000, premier = !G.vus.has(`${E.n}`) && maintenant() - (E.debut || 0) > 15000; // arrivé en cours de partie : pas de rappel de tout ce qui s'est dit
  G.vus.add(`${E.n}`);
  E.ind.forEach((i, k) => { const c = `${E.n}.i${k}`; if (G.vus.has(c)) return; G.vus.add(c); if (!premier && i.m) { X.bulleDe(i.u, filtrer(i.m)); son('piece'); } });
  E.journal.forEach((e, k) => {
    const c = `${E.n}.j${k}`; if (G.vus.has(c)) return; G.vus.add(c); if (premier || !recent(e.t)) return;
    if (e.k === 'elimine' || e.k === 'parti' || e.k === 'retire') { X.bulleDe(e.u, e.r === 'faux' ? 'Faux frère !' : e.r === 'ignorant' ? 'L’Ignorant !' : 'Frère…'); son('arret'); }
    else if (e.k === 'debut') { X.ligne('Faux Frère : la partie commence ! Retourne ta carte pour voir ton mot.'); son('arret'); G.onglet = 'partie'; }
    else if (e.k === 'vote') { G.onglet = 'partie'; son('arret'); }
    else if (e.k === 'devine' && e.ok) son('arret');
    else if (e.k === 'fin') { X.ligne(`Faux Frère · ${GAGNANTS[e.a] || ''}`); son('arret'); }
  });
  const tour = J && orateur(J) === moi ? `${J.n}.${J.manche}.${J.passe}.${J.tour}` : '';
  if (tour && tour !== G.tour) { son('arret'); UI.el?.classList.remove('reduit'); } // à toi de parler : le panneau s'ouvre
  G.tour = tour;
  if (J?.phase === 'ignorant' && J.ignorant?.u === moi) UI.el?.classList.remove('reduit');
}

// ---------- Le panneau du salon ----------
const UI = { el: null, mode: '' };
const ICONE_PARTAGER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.4 13.4 7.2 4.2M15.6 6.4l-7.2 4.2"/></svg>';
function panneau(oui) {
  if (oui && !UI.el) {
    UI.el = document.createElement('section'); UI.el.className = 'ff-panneau panel'; UI.el.setAttribute('aria-label', 'Le Faux Frère');
    UI.el.innerHTML = '<header><b>Le Faux Frère</b><span class="ff-phase" role="status"></span><button type="button" class="ff-reduire" aria-expanded="true" title="Réduire">–</button><button type="button" class="ff-sortir" data-ff="quitter" title="Quitter le salon" aria-label="Quitter le salon">×</button></header><div class="ff-corps"><div class="ff-haut"></div><div class="ff-agir"><div class="ff-mode"></div><p class="ff-info" aria-live="polite"></p></div><ol class="ff-joueurs"></ol><div class="ff-options"></div><div class="ff-fil"><div class="ff-onglets" role="tablist"></div><p class="ff-note"></p><ol class="ff-messages" aria-live="polite"></ol><form class="ff-ecrire"><input maxlength="140" autocomplete="off" enterkeyhint="send" aria-label="Message"><button type="submit">Envoyer</button></form></div></div>';
    $('#salonHud')?.append(UI.el);
    UI.el.querySelector('.ff-reduire').addEventListener('click', e => { const r = UI.el.classList.toggle('reduit'); e.currentTarget.setAttribute('aria-expanded', String(!r)); e.currentTarget.textContent = r ? '+' : '–'; });
    UI.el.addEventListener('click', e => { const b = e.target.closest('[data-ff]'); if (b && !b.disabled) agir(b.dataset.ff, b.dataset.v); });
    UI.el.addEventListener('submit', e => {
      e.preventDefault(); const f = e.target;
      if (f.classList.contains('ff-deviner')) deviner(f); else if (f.classList.contains('ff-saisie')) donnerIndice(f); else if (f.classList.contains('ff-ecrire')) envoyer(f); // le formulaire de l'Ignorant a les deux classes
    });
  }
  if (UI.el) { UI.el.hidden = !oui; if (oui) { UI.el.classList.remove('reduit'); UI.el.querySelector('.ff-reduire').textContent = '–'; } }
  UI.mode = '';
}
/** Ne réécrit une zone que si elle a changé (un champ en cours de saisie n'est jamais effacé). */
function zone(sel, html) { const el = UI.el.querySelector(sel); if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; } return el; }
const texte = (sel, t) => { const el = UI.el.querySelector(sel); if (el.textContent !== t) el.textContent = t; return el; };
const avatar = (P, J, u) => `<i class="ff-av" style="--h:${teinte(u)}" aria-hidden="true">${esc(nomDe(P, J, u).slice(0, 1).toUpperCase())}</i>`;

function rendre(P, pub, J, R, moi, t) {
  if (!UI.el || UI.el.hidden) return;
  const hote = pub.hote === moi, nb = arrivee(P).length, n = u => esc(nomDe(P, J || R, u));
  // L'en-tête : où en est-on, et le compte à rebours (heure du serveur).
  const s = J?.jusqua ? ` · ${secondes(J.jusqua)} s` : '';
  texte('.ff-phase', !J ? (R ? GAGNANTS[R.gagnant] || '' : `${nb}/${MAX_JOUEURS} joueurs`)
    : { lecture: `Découvre ton mot${s}`, indice: J.passe === 'd' ? `Départage · indices${s}` : `Manche ${J.manche + 1} · indices${s}`, vote: `Manche ${J.manche + 1} · discussion et vote`, resultat: `Manche ${J.manche + 1} · résultat`, ignorant: `L’Ignorant cherche le mot${s}` }[J.phase] || '');
  const cb = zone('.ff-haut', J ? carte(J, moi) : salon(P, R)).querySelector('.ff-carte'); // retournée sur place : l'animation se voit
  zone('.ff-options', J ? '' : reglages(P, hote));
  if (cb && cb.classList.contains('retournee') !== G.carte) { cb.classList.toggle('retournee', G.carte); cb.setAttribute('aria-pressed', String(G.carte)); cb.setAttribute('aria-label', G.carte ? 'Cacher mon mot' : 'Voir mon mot'); }
  if (G.choix && !(J?.phase === 'vote' && J.vivants[G.choix] && (!J.candidats.length || J.candidats.includes(G.choix)))) G.choix = '';
  zone('.ff-joueurs', J ? joueursEnJeu(P, J, moi, t) : joueursAuSalon(P, pub, R, moi, t));
  // Ce qu'on peut faire.
  const vivant = !!J?.vivants[moi], o = J ? orateur(J) : '';
  let mode, html = '';
  if (!J) { mode = `salon.${hote}.${nb >= MIN}.${!!R}`; html = hote ? `<div class="ff-boutons"><button type="button" class="jouer" data-ff="${R ? 'rejouer' : 'lancer'}"${nb >= MIN ? '' : ' disabled'}>${R ? 'Rejouer' : 'Lancer la partie'}</button><button type="button" data-ff="fermer">Fermer le salon</button></div>${nb >= MIN ? '' : `<small>Il faut ${MIN} joueurs au moins : partage le code du salon.</small>`}` : `<p>${R ? 'L’hôte peut relancer une partie : nouvelle paire, nouveaux rôles.' : `L’hôte lance la partie dès que vous êtes au moins ${MIN}.`}</p><div class="ff-boutons"><button type="button" data-ff="quitter">Quitter le salon</button></div>`; }
  else if (!J.joueurs.includes(moi)) { mode = 'spectateur'; html = '<p>La table est pleine : tu joueras la prochaine partie.</p>'; }
  else if (J.phase === 'lecture') { mode = 'lecture'; html = '<p>Retourne ta carte pour découvrir ton mot. Personne ne sait dans quel camp il est, ni combien d’imposteurs se cachent.</p>'; }
  else if (J.phase === 'indice' && o === moi) { mode = `saisir.${J.manche}.${J.passe}.${J.tour}`; html = `<form class="ff-saisie"><label>À toi : ton indice (un seul mot)<input maxlength="24" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send"></label><button type="submit" class="jouer">Donner</button><small class="ff-erreur" role="alert"></small></form>`; }
  else if (J.phase === 'indice') { mode = `indice.${o}.${vivant}`; html = `<p>${vivant ? `Écoute l’indice de ${n(o)}.` : `Tu es hors jeu : ${n(o)} donne son indice.`}</p>`; }
  else if (J.phase === 'vote' && vivant && !J.valides[moi]) { mode = `voter.${G.choix}`; html = `<p>${J.candidats.length ? `Départage : on ne vote que pour ${enListe(J.candidats.map(n))}.` : 'Qui est un imposteur ?'} Choisis un joueur dans la liste, puis valide quand tu es sûr.</p><div class="ff-boutons"><button type="button" class="jouer" data-ff="valider"${G.choix ? '' : ' disabled'}>${G.choix ? `Valider : ${n(G.choix)}` : 'Valider'}</button></div>`; }
  else if (J.phase === 'vote') { mode = `vote.${vivant}`; html = `<p>${vivant ? 'Ton vote est parti : il est définitif. On attend les autres.' : 'Tu es hors jeu : les autres votent. Parle avec les éliminés (« Éliminés »).'}</p>`; }
  else if (J.phase === 'ignorant' && J.ignorant?.u === moi) { mode = 'deviner'; html = `<form class="ff-saisie ff-deviner"><label>Le mot des frères ?<input maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send"></label><button type="submit" class="jouer">Proposer</button><small class="ff-erreur" role="alert"></small></form>`; }
  else if (J.phase === 'ignorant') { mode = `ignorant.${J.ignorant?.u}`; html = `<p class="ff-fige">${n(J.ignorant?.u)} était l’Ignorant ! Tout se fige : 20 secondes pour deviner le mot des frères, sous vos yeux.</p>`; }
  else if (J.phase === 'resultat') { mode = `resultat.${J.votes.length}.${J.ignorant?.fini ? J.ignorant.u : ''}.${J.resultat?.u || ''}`; html = resultat(P, J); }
  else { mode = J.phase; html = ''; }
  if (mode !== UI.mode) { UI.mode = mode; const el = zone('.ff-mode', html), f = el.querySelector('form'); if (f) { f.scrollIntoView({ block: 'nearest' }); f.querySelector('input').focus({ preventScroll: true }); } }
  // La ligne qui bouge : « En attente de Koffi… 42 s », le temps de l'Ignorant.
  const restants = J?.phase === 'vote' ? J.joueurs.filter(u => J.vivants[u] && !J.valides[u]) : [];
  texte('.ff-info', J?.phase === 'vote' && J.attente ? `En attente de ${enListe(restants.map(u => nomDe(P, J, u)))}… ${secondes(J.attente)} s`
    : J?.phase === 'ignorant' ? `${J.ignorant?.u === moi ? 'Il te reste' : 'Il reste'} ${secondes(J.jusqua)} s` : '');
  discussion(P, J, R, moi);
}
/** La carte : face cachée, on la touche pour voir son mot, et on la retourne quand on veut. */
function carte(J, moi) {
  if (!J.joueurs.includes(moi)) return '';
  const m = G.motN === J.n ? G.mot : null;
  const face = !m ? '<small>L’arbitre distribue les mots…</small>' : m.ignorant ? '<b class="ff-sans">Tu n’as pas de mot.</b><small>Écoute bien les autres.</small>' : `<b>${esc(m.mot)}</b><small>Touche pour la retourner</small>`;
  return `<button type="button" class="ff-carte" data-ff="carte" aria-pressed="false" aria-label="Voir mon mot"><span class="ff-dos"><b>Ton mot</b><small>Touche pour le voir</small></span><span class="ff-face">${face}</span></button>`;
}
/** Au salon : le gagnant de la partie qui vient de finir, et le code à partager. */
function salon(P, R) {
  let h = '';
  if (R?.fin) {
    const xp = G.xp[`${G.id}.${R.n}`];
    h += `<div class="ff-gagnant ${R.gagnant}"><b>${GAGNANTS[R.gagnant] || ''}</b><span>Les frères : « ${esc(R.fin.paire?.[0])} » · le faux frère : « ${esc(R.fin.paire?.[1])} »</span>${xp ? `<em class="ff-xp">+${xp} XP</em>` : ''}</div>`;
  }
  return `${h}<div class="ff-code"><span><small>Code du salon</small><b>${esc(G.id.toUpperCase())}</b></span><button type="button" class="ff-rond" data-ff="partager" title="Partager le code" aria-label="Partager le code">${ICONE_PARTAGER}</button></div>`;
}
/** Les réglages de l'hôte (les autres les lisent) : la durée d'un tour d'indice, le thème des mots. */
function reglages(P, hote) {
  const rg = P.reglages || {}, duree = DUREES.includes(rg.duree) ? rg.duree : DUREE, theme = THEMES[rg.theme] ? rg.theme : 'tous';
  let h = '';
  if (hote) h += `<div class="ff-reglages"><span>Tour d’indice</span><div class="ff-choix">${DUREES.map(d => `<button type="button" data-ff="duree" data-v="${d}" aria-pressed="${d === duree}">${d} s</button>`).join('')}</div><span>Thème</span><div class="ff-choix">${Object.entries(THEMES).map(([k, l]) => `<button type="button" data-ff="theme" data-v="${k}" aria-pressed="${k === theme}">${esc(l)}</button>`).join('')}</div></div>`;
  else h += `<p class="ff-reglages-lus">Tour d’indice : ${duree} s · Thème : ${esc(THEMES[theme])}</p>`;
  return h;
}
function joueursAuSalon(P, pub, R, moi, t) {
  const l = arrivee(P);
  const avant = R ? R.joueurs.filter(u => !l.includes(u)) : []; // ceux de la partie finie qui sont partis : dans le récapitulatif aussi
  return [...l, ...avant].map(u => {
    const ici = l.includes(u), role = R?.fin?.roles?.[u], mot = R?.fin ? R.fin.mots?.[u] : null, m = R?.morts?.[u];
    const tags = [u === pub.hote && ici ? '<span class="ff-tag hote">hôte</span>' : '', ici && t - vuDe(P, u) > ABSENT ? '<span class="ff-tag">absent</span>' : '', !ici ? '<span class="ff-tag">parti</span>' : '', role ? `<span class="ff-role ${role}">${ROLES[role]}</span>` : '', m ? '<span class="ff-tag">éliminé</span>' : ''].join('');
    const inds = R ? indices(R, u) : '';
    return `<li class="${u === moi ? 'moi' : ''}${!ici ? ' parti' : ''}"><div class="ff-ligne">${avatar(P, R, u)}<span class="ff-qui"><b>${esc(nomDe(P, R, u))}${u === moi ? ' <small>(toi)</small>' : ''}</b>${mot != null ? `<em>${mot ? esc(mot) : 'sans mot'}</em>` : ''}${tags}</span>${inds ? `<span class="ff-inds">${inds}</span>` : ''}</div></li>`;
  }).join('');
}
const indices = (E, u) => E.ind.filter(i => i.u === u).map(i => (i.p ? `<span class="ff-ind vide">${i.p === 'absent' ? 'ne répondait pas' : 'a passé son tour'}</span>` : `<span class="ff-ind${i.d ? ' dep' : ''}">${esc(filtrer(i.m))}</span>`)).join('');
function joueursEnJeu(P, J, moi, t) {
  const o = orateur(J), vote = J.phase === 'vote', choisir = vote && J.vivants[moi] && !J.valides[moi], dernier = J.votes.at(-1);
  const mots = G.motsN === J.n ? G.mots : null; // éliminé : les mots de tous
  return J.joueurs.map(u => {
    const m = J.morts[u] || (J.resultat?.u === u ? { r: J.resultat.r } : null), dehors = !J.vivants[u];
    const cible = choisir && u !== moi && !dehors && (!J.candidats.length || J.candidats.includes(u));
    const tags = [o === u ? '<span class="ff-tag tour">à son tour</span>' : '', vote && J.valides[u] ? '<span class="ff-tag ok" title="a validé son vote">✓</span>' : '', !dehors && t - vuDe(P, u) > ABSENT ? '<span class="ff-tag">absent</span>' : '', J.phase !== 'vote' && dernier?.a?.includes(u) ? '<span class="ff-tag">abstention</span>' : '', J.candidats.includes(u) ? '<span class="ff-tag">ex aequo</span>' : '', m ? `<span class="ff-role ${m.r}">${ROLES[m.r]}</span>` : ''].join('');
    const cls = [u === moi ? 'moi' : '', dehors ? 'parti' : '', o === u ? 'tour' : '', G.choix === u && cible ? 'choisi' : '', J.phase === 'resultat' && J.resultat?.u === u ? 'revele' : ''].filter(Boolean).join(' ');
    const dedans = `${avatar(P, J, u)}<span class="ff-qui"><b>${esc(nomDe(P, J, u))}${u === moi ? ' <small>(toi)</small>' : ''}</b>${mots ? `<em>${mots[u] ? esc(mots[u]) : 'sans mot'}</em>` : ''}${tags}</span><span class="ff-inds">${indices(J, u)}</span>`;
    return `<li class="${cls}">${cible ? `<button type="button" class="ff-ligne" data-ff="cible" data-v="${esc(u)}" aria-pressed="${G.choix === u}">${dedans}</button>` : `<div class="ff-ligne">${dedans}</div>`}</li>`;
  }).join('');
}
/** Le résultat d'un vote : qui a voté pour qui, et ce qui s'ensuit (le rôle de l'éliminé, l'égalité, le mot de l'Ignorant). */
function resultat(P, J) {
  const n = u => esc(nomDe(P, J, u)), V = J.votes.at(-1), Rr = J.resultat || {}, I = J.ignorant?.fini && J.ignorant.u === Rr.u ? J.ignorant : null;
  let h = '';
  if (I) h = `<p class="ff-elimine ignorant">${I.ok ? `<b>${n(I.u)}</b> a trouvé le mot des frères : « ${esc(I.m)} » ! L’Ignorant gagne seul.` : I.m ? `<b>${n(I.u)}</b> a proposé « ${esc(I.m)} » : ce n’est pas le mot des frères.` : `<b>${n(I.u)}</b> n’a rien proposé à temps.`}</p>`;
  else if (Rr.u) h = `<p class="ff-elimine ${Rr.r}"><b>${n(Rr.u)}</b> ${Rr.c === 'absent' ? 'a perdu le réseau et quitte la table' : Rr.c === 'parti' ? 'a quitté la partie' : 'quitte la table'} : <span class="ff-role ${Rr.r}">${ROLES[Rr.r]}</span></p>`;
  else if (Rr.egalite?.length && J.votes.at(-1)?.d) h = `<p class="ff-elimine">Encore égalité entre ${enListe(Rr.egalite.map(n))} : personne ne quitte la table cette manche.</p>`;
  else if (Rr.egalite?.length) h = `<p class="ff-elimine">Égalité entre ${enListe(Rr.egalite.map(n))} : un indice de plus chacun, puis on revote entre eux.</p>`;
  else h = '<p class="ff-elimine">Personne ne quitte la table cette manche.</p>';
  if (V && !I && !Rr.c) {
    const l = [...Object.entries(V.v).map(([u, c]) => `<li>${n(u)} <span aria-hidden="true">→</span><span class="ff-sr"> a voté pour</span> <b>${n(c)}</b></li>`), ...V.a.map(u => `<li>${n(u)} : abstention</li>`)];
    h += `<p class="ff-sous">Qui a voté pour qui</p><ul class="ff-qui-vote">${l.join('')}</ul>`;
  }
  return h;
}

// ---------- Les discussions : le salon, la partie, les éliminés ----------
const MUETS = 'kutonu.ff.muets', SIGNALES = 'kutonu.ff.signalements';
const lireLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const muets = () => new Set([...lireLS('cotonou3d.muets', []), ...lireLS(MUETS, [])]); // ceux qu'on ne veut plus lire, en ville comme ici
function journal(e, P, E) {
  const qui = nomDe(P, E, e.u), noms = enTableau(e.a).map(u => nomDe(P, E, u));
  switch (e.k) {
    case 'debut': return `La partie commence à ${e.a} joueurs : retournez vos cartes.`;
    case 'manche': return `Manche ${e.a}`;
    case 'vote': return 'Discussion et vote : choisis ta cible, puis valide.';
    case 'valide': return `${qui} a validé`;
    case 'abstention': return `${qui} n’a pas voté à temps : abstention`;
    case 'passe': return `${qui} a passé son tour`;
    case 'absent': return `${qui} ne répond pas : son tour passe`;
    case 'elimine': return `${qui} quitte la table : c’était ${ROLES_DE[e.r]}`;
    case 'egalite': return `Égalité entre ${enListe(noms)} : un indice de plus chacun, puis on revote entre eux`;
    case 'departage': return `Départage entre ${enListe(noms)}`;
    case 'personne': return 'Personne ne quitte la table cette manche';
    case 'ignorant': return `${qui} était l’Ignorant : 20 secondes pour deviner le mot des frères`;
    case 'devine': return e.ok ? `${qui} a trouvé le mot des frères : « ${filtrer(e.a)} » !` : e.a ? `${qui} a proposé « ${filtrer(e.a)} » : raté` : `${qui} n’a rien proposé`;
    case 'parti': return `${qui} a quitté la partie : c’était ${ROLES_DE[e.r]}`;
    case 'retire': return `${qui} a perdu le réseau et quitte la partie : c’était ${ROLES_DE[e.r]}`;
    case 'revote': return `${qui} doit revoter : sa cible est partie`;
    case 'fin': return `Fin de la partie : ${GAGNANTS[e.a] || ''}`;
  }
  return '';
}
const messages = o => Object.entries(o || {}).map(([cle, m]) => ({ cle, ...m })).filter(m => m && m.txt);
function discussion(P, J, R, moi) {
  const E = J || R, mort = !!J?.morts?.[moi], tous = [['salon', 'Salon'], ...(E ? [['partie', 'Partie']] : []), ...(mort ? [['morts', 'Éliminés']] : [])];
  if (!tous.some(([k]) => k === G.onglet)) G.onglet = J ? 'partie' : 'salon';
  const fils = { salon: messages(P.ms), partie: E ? [...messages(P.mp), ...E.journal.map((e, k) => ({ cle: `j${k}`, sys: true, t: e.t, txt: journal(e, P, E) }))] : [], morts: G.morts.filter(m => m.txt) };
  const derniers = k => fils[k].reduce((x, m) => Math.max(x, Number(m.t) || 0), 0);
  G.lus[G.onglet] = derniers(G.onglet);
  zone('.ff-onglets', tous.length < 2 ? '' : tous.map(([k, l]) => { const nl = fils[k].filter(m => !m.sys && (Number(m.t) || 0) > (G.lus[k] || 0) && m.u !== moi).length; return `<button type="button" role="tab" data-ff="onglet" data-v="${k}" aria-selected="${k === G.onglet}">${l}${nl ? ` <b>${nl}</b>` : ''}</button>`; }).join(''));
  const M = muets(), l = fils[G.onglet].filter(m => !M.has(m.u)).sort((a, b) => ((Number(a.t) || 0) - (Number(b.t) || 0)) || (a.cle < b.cle ? -1 : 1)).slice(-60);
  const ol = zone('.ff-messages', l.map(m => (m.sys ? `<li class="sys">${esc(m.txt)}</li>` : `<li class="${m.u === moi ? 'moi' : ''}"><b${m.u !== moi ? ` data-ff="qui" data-v="${esc(m.u)}" tabindex="0" title="${esc(filtrer(m.n))} : ne plus voir ses messages, signaler"` : ''}>${esc(filtrer(String(m.n || '?').slice(0, 16)))}</b> ${esc(filtrer(String(m.txt).slice(0, 140)))}</li>`)).join(''));
  if (ol.dataset.bas !== ol.dataset.h) { ol.dataset.bas = ol.dataset.h; ol.scrollTop = ol.scrollHeight; }
  // La note au-dessus du fil, et le champ : ouvert ou fermé selon le moment (le mot secret n'est pas filtré : on peut bluffer).
  const motsTous = G.onglet === 'morts' && G.mots && J ? `Les mots : ${J.joueurs.map(u => `${nomDe(P, J, u)} « ${G.mots[u] || '—'} »`).join(', ')}` : '';
  texte('.ff-note', G.onglet === 'salon' && J ? 'Chat du salon en pause pendant la partie' : motsTous);
  const ferme = G.onglet === 'salon' ? (J ? 'Chat du salon en pause pendant la partie' : !P.joueurs?.[moi] ? '…' : '')
    : G.onglet === 'partie' ? (!J ? 'La partie est finie' : J.phase === 'ignorant' ? 'Silence : l’Ignorant cherche le mot' : !J.vivants[moi] ? (mort ? 'Tu es éliminé : écris aux éliminés' : 'Tu ne joues pas cette partie') : '')
      : !mort ? '…' : '';
  const inp = UI.el.querySelector('.ff-ecrire input'), ph = ferme || (G.onglet === 'salon' ? 'Écris au salon…' : G.onglet === 'partie' ? 'Discute, bluffe, accuse…' : 'Écris aux autres éliminés…');
  if (inp.disabled !== !!ferme) { inp.disabled = !!ferme; UI.el.querySelector('.ff-ecrire button').disabled = !!ferme; }
  if (inp.placeholder !== ph) inp.placeholder = ph;
}
async function envoyer(f) {
  const inp = f.querySelector('input'), txt = filtrer(String(inp.value || '').replace(/\s+/g, ' ').trim().slice(0, 140)), moi = await B.uid(); if (!txt || !moi || !G.id) return;
  if (performance.now() - G.ecritT < 1500) { X.ligne('Doucement : un message toutes les deux secondes.'); return; }
  G.ecritT = performance.now();
  const chemin = G.onglet === 'morts' ? `zem_ff2_morts/${G.id}` : `zem_ff2/${G.id}/${G.onglet === 'partie' ? 'mp' : 'ms'}`;
  try { await B.pousser(chemin, { u: moi, n: nom(), txt, t: TS }); inp.value = ''; } catch { X.ligne('Message non envoyé : vérifie ta connexion.'); }
}
/** Toucher le nom de quelqu'un dans le fil : ne plus le lire (pour soi), ou signaler son message. */
function proposerMuet(u) {
  const P = G.P, nomU = nomDe(P, P?.pub?.jeu || P?.pub?.recap, u);
  X.choisir(nomU, [
    { texte: 'Ne plus voir ses messages', sous: 'Pour toi seulement, dans ce jeu et en ville.', f: () => { const l = lireLS(MUETS, []); l.push(u); try { localStorage.setItem(MUETS, JSON.stringify([...new Set(l)].slice(-200))); } catch { /* navigation privée */ } X.ligne(`Tu ne verras plus les messages de ${nomU} au Faux Frère.`); } },
    // Il n'y a pas encore de modération qui lise les signalements : on le garde dans ce navigateur, sans rien envoyer.
    { texte: 'Signaler ses messages', sous: 'Ses messages sont masqués pour toi, et le signalement est gardé.', f: () => { const l = lireLS(SIGNALES, []); l.push({ u, n: nomU, salon: G.id, t: Date.now() }); try { localStorage.setItem(SIGNALES, JSON.stringify(l.slice(-50))); const m = lireLS(MUETS, []); m.push(u); localStorage.setItem(MUETS, JSON.stringify([...new Set(m)].slice(-200))); } catch { /* navigation privée */ } X.ligne(`Merci : c’est noté. Les messages de ${nomU} sont masqués pour toi.`); } },
  ], { annuler: 'Annuler' });
}

// ---------- Ce que l'on fait ----------
async function donnerIndice(f) {
  const inp = f.querySelector('input'), err = f.querySelector('.ff-erreur'), m = inp.value.trim(); if (!m) return;
  const avant = indiceRefuse(m, G.mot?.mot || ''); // le même contrôle que l'arbitre, sur son propre mot, pour répondre tout de suite
  if (avant) { err.textContent = REFUS[avant]; return; }
  try { const r = await arbitre('indice', { m }); if (r.refus) { err.textContent = REFUS[r.refus] || REFUS['mot-secret']; return; } son('piece'); }
  catch (e) { err.textContent = e.code === 'pas-ton-tour' ? 'Trop tard : ton tour est passé.' : 'Indice non envoyé : vérifie ta connexion, puis réessaie.'; }
}
async function deviner(f) {
  const inp = f.querySelector('input'), err = f.querySelector('.ff-erreur'), m = inp.value.trim(); if (!m) return;
  try { await arbitre('deviner', { m }); } catch (e) { err.textContent = e.code === 'un-mot' ? 'Écris un mot.' : e.code === 'pas-a-toi' ? 'Trop tard : le temps est écoulé.' : 'Pas envoyé : vérifie ta connexion, puis réessaie.'; }
}
const ERREURS = { 'pas-assez': `Il faut ${MIN} joueurs présents au moins.`, 'pas-l-hote': 'Seul l’hôte peut faire ça.', 'deja-en-jeu': 'La partie a déjà commencé.', 'cible-invalide': 'Choisis un autre joueur.', 'deja-vote': 'Tu as déjà voté.', 'pas-de-vote': 'Le vote est clos.' };
const dire = e => X.ligne(ERREURS[e.code] || 'Le Faux Frère ne répond pas : vérifie ta connexion, puis réessaie.');
async function agir(quoi, v) {
  const P = G.P, J = P?.pub?.etat === 'jeu' ? P.pub.jeu : null, moi = X.S.R?.id;
  if (quoi === 'carte') { G.carte = !G.carte; return; }
  if (quoi === 'cible') { G.choix = v; return; }
  if (quoi === 'onglet') { G.onglet = v; return; }
  if (quoi === 'qui') { proposerMuet(v); return; }
  if (quoi === 'partager') { partager(); return; }
  if (quoi === 'valider' && G.choix && J) {
    const c = G.choix;
    X.choisir(`Voter contre ${nomDe(P, J, c)} ?`, [{ texte: 'Valider mon vote', sous: 'C’est définitif : tu ne pourras plus changer.', f: () => arbitre('voter', { c }).then(() => { son('piece'); G.choix = ''; }, dire) }], { annuler: 'Pas encore' });
    return;
  }
  if (quoi === 'lancer' || quoi === 'rejouer') { arbitre(quoi).catch(dire); return; }
  if ((quoi === 'duree' || quoi === 'theme') && P?.pub?.hote === moi) {
    const rg = { duree: DUREES.includes(P.reglages?.duree) ? P.reglages.duree : DUREE, theme: THEMES[P.reglages?.theme] ? P.reglages.theme : 'tous', ...(quoi === 'duree' ? { duree: Number(v) } : { theme: v }) };
    B.ecrire(`zem_ff2/${G.id}/reglages`, rg).catch(() => X.ligne('Réglage non enregistré : vérifie ta connexion.'));
    return;
  }
  if (quoi === 'fermer') { X.choisir('Fermer le salon ?', [{ texte: 'Fermer le salon', sous: 'Tout le monde quitte la table.', f: () => arbitre('fermer').then(() => { laisser(); X.ligne('Salon de Faux Frère fermé.'); }, dire) }], { annuler: 'Garder le salon' }); return; }
  if (quoi === 'quitter') {
    if (J?.vivants?.[moi]) X.choisir('Quitter la partie ?', [{ texte: 'Quitter', sous: 'Ton rôle sera révélé à tous.', f: () => quitter(true) }], { annuler: 'Rester' });
    else quitter(true);
  }
}

/** On quitte la ville : on quitte aussi le salon. */
export function quitterFauxFrere() { if (G.id) quitter(); OUV.off?.(); OUV.off = null; OUV.code = ''; OUV.liste = []; }

// ---------- Mise en route ----------
export function initFauxFrere(ctx) {
  X = ctx; heureServeur();
  if (import.meta.env.DEV) window.__ff = { G, OUV, INV, MAQUIS, SIEGES, creer, rejoindre, quitter, arbitre, B, lireLocal, majLocal, baseLocale }; // pour les tests
}
