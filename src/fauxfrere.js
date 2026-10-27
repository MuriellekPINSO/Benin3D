import * as THREE from 'three';
import { $, toXZ } from './base.js';
import { PLACES } from './donnees-lieux.js';
import { groupeLieu } from './lieux.js';
import { poserObstacles } from './rue.js';
import { MAX_DECOR, reduireImage } from './textures.js';
import { son } from './audio.js';
import { firebase, joueur } from './firebase.js';
import { filtrer } from './moderation.js';
import { INSCRIPTION, MAX_JOUEURS, MIN_JOUEURS, TOURS, deroule, indiceValable, motsDe, ordreDe } from './faux-frere-regles.js';

// ---------- Le Faux Frère : au maquis de la plage de Fidjrossè ----------
// Le jeu de l'intrus (« le 1 et 2 comme dit », 27/10). Tout le monde reçoit le même mot secret, sauf un joueur, le faux
// frère, qui reçoit un mot proche et ne le sait pas. Chacun à son tour donne un mot d'indice ; puis on vote pour
// éliminer celui qu'on soupçonne. Les frères gagnent s'ils éliminent le faux frère ; lui gagne s'il reste caché.
// De 4 à 10 joueurs, environ 5 minutes. Le déroulé (tours, délais, votes, fin) est dans faux-frere-regles.js.
//
// Où : un maquis de plage ouvert à tous, sous une paillote, à côté du stand du lance-pierre. Les maquis des joueurs
// (commerces.js) ne se voient que de leur patron : on ne pouvait pas y réunir les autres. Quelqu'un lance la partie
// au maquis, la ville en est prévenue (« Y aller »), les joueurs présents la rejoignent et s'assoient autour des tables.
// Les mots ne sont jamais écrits dans la base : chacun demande le sien à l'arbitre (/api/faux-frere), qui ne donne que
// le sien, et ne dit qui était le faux frère qu'une fois le vote clos.
// Firebase (règles dans database.rules.json) : zem_ff/{partie} = { hote, salon, lieu, cree, etat, debut,
//   joueurs/{uid}: { n, t }, indices/{manche}/{passe}/{uid}: { m, t }, votes/{manche}/{uid}: { c, t } }.
// En développement, ?salon-local : les onglets du même navigateur jouent ensemble (localStorage), l'arbitre est imité ici.

const LP = PLACES.find(q => q.id === 'fidjrosse'), [FX, FZ] = LP ? toXZ(LP.lat, LP.lon) : [0, 0];
export const MAQUIS = { x: FX - 18, z: FZ + 18 }; // à 26 m de l'arrivée « Plage de Fidjrossè », côté ouest
const presDuMaquis = (x, z, r = 7) => Math.hypot(x - MAQUIS.x, z - MAQUIS.z) < r;
const Q = new URLSearchParams(location.search), LOCAL = import.meta.env.DEV && Q.has('salon-local');
const MIN = import.meta.env.DEV && Q.has('ff-3') ? 3 : MIN_JOUEURS; // en test : à trois
const TS = { '.sv': 'timestamp' }; // l'heure du serveur, à l'écriture (comme d.serverTimestamp())
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let X = null; // le salon : { S, ligne, choisir, bulleDe }
// La partie qu'on suit : id, données, déroulé, son mot, les verdicts de l'arbitre, la fin.
const G = { id: '', P: null, E: null, mot: '', verdicts: {}, fin: null, off: null, demandeT: 0, vus: new Set(), assis: false, annonces: new Set() };
// Les parties ouvertes de la ville (inscriptions en cours), pour le bouton « Rejoindre ».
const OUV = { liste: [], off: null, code: '' };
const BASE = { decalage: 0 };
const maintenant = () => Date.now() + BASE.decalage;

// ---------- La base : Firebase, ou localStorage entre onglets (mode test) ----------
const LS = 'kutonu.ff.local', canalLS = LOCAL ? new BroadcastChannel('kutonu-ff') : null, ecouteursLS = new Set();
const lireLocal = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } };
function majLocal(f) { const b = lireLocal(); f(b); localStorage.setItem(LS, JSON.stringify(b)); canalLS?.postMessage(1); for (const e of ecouteursLS) e(); }
canalLS?.addEventListener('message', () => { for (const e of ecouteursLS) e(); });
const heures = v => (v && typeof v === 'object' ? (v['.sv'] ? Date.now() : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, heures(x)]))) : v);
const B = {
  async uid() { return LOCAL ? X.S.R?.id : (await joueur()).uid; },
  async ecrire(chemin, val) {
    if (LOCAL) return majLocal(b => { const k = chemin.split('/'); let o = b; for (const c of k.slice(0, -1)) o = o[c] ??= {}; if (val === null) delete o[k.at(-1)]; else o[k.at(-1)] = heures(val); });
    const { d, db } = await firebase(); await joueur(); return d.set(d.ref(db, `zem_ff/${chemin}`), val);
  },
  async maj(id, champs) {
    if (LOCAL) return majLocal(b => { Object.assign(b[id] ??= {}, heures(champs)); });
    const { d, db } = await firebase(); await joueur(); return d.update(d.ref(db, `zem_ff/${id}`), champs);
  },
  suivre(id, cb) {
    if (LOCAL) { const f = () => cb(lireLocal()[id] || null); ecouteursLS.add(f); f(); return () => ecouteursLS.delete(f); }
    let off = () => {}, fini = false;
    firebase().then(async ({ d, db }) => { await joueur(); if (!fini) off = d.onValue(d.ref(db, `zem_ff/${id}`), s => cb(s.val())); }).catch(() => {});
    return () => { fini = true; off(); };
  },
  suivreSalon(code, cb) {
    if (LOCAL) { const f = () => cb(Object.entries(lireLocal()).filter(([, P]) => P.salon === code).map(([id, P]) => ({ id, ...P }))); ecouteursLS.add(f); f(); return () => ecouteursLS.delete(f); }
    let off = () => {}, fini = false;
    firebase().then(async ({ d, db }) => {
      await joueur(); if (fini) return;
      off = d.onValue(d.query(d.ref(db, 'zem_ff'), d.orderByChild('salon'), d.equalTo(code), d.limitToLast(12)), s => { const l = []; s.forEach(e => { l.push({ id: e.key, ...e.val() }); }); cb(l); });
    }).catch(() => {});
    return () => { fini = true; off(); };
  },
};
function heureServeur() {
  if (LOCAL) return;
  firebase().then(({ d, db }) => d.onValue(d.ref(db, '.info/serverTimeOffset'), s => { BASE.decalage = s.val() || 0; })).catch(() => {});
}
/** L'arbitre : son mot, ou les verdicts des votes clos (et la fin). En mode test, on le fait ici, avec un secret d'essai. */
async function arbitre(quoi) {
  if (LOCAL) {
    const P = lireLocal()[G.id], uid = await B.uid(); if (!P || !P.joueurs?.[uid] || typeof P.debut !== 'number') return null;
    const { mots, faux } = await motsDe('essai-local', G.id, P);
    if (quoi === 'mot') return { mot: mots[uid] };
    const v = {}, now = Date.now(); let E = deroule(P, now, v);
    for (let k = 0; k < 6 && E.phase === 'verdict'; k++) { const E2 = deroule(P, now, { ...v, [E.manche]: false }); v[E.manche] = E2.elimines.find(e => e.manche === E.manche)?.u === faux; E = deroule(P, now, v); }
    return { verdicts: v, ...(E.phase === 'fin' ? { fin: { gagnant: E.gagnant, faux, mots } } : {}) };
  }
  const u = await joueur(), jeton = await u.getIdToken();
  const r = await fetch('/api/faux-frere', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partie: G.id, jeton, quoi }) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.erreur || `arbitre-${r.status}`); return d;
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

// ---------- Les boutons (salon.js) ----------
export const enPartie = () => !!G.id;
/** Les boutons du maquis : lancer une partie, la rejoindre, la commencer, la quitter. */
export function actionsFauxFrere(S, T) {
  if (T.mode !== 'pied' || S.lieu) return [];
  const P = G.P;
  if (G.id && P?.etat === 'inscription') {
    const n = Object.keys(P.joueurs || {}).length;
    if (P.hote === S.R?.id) return [n >= MIN ? { texte: `Lancer le Faux Frère · ${n} joueurs`, f: lancer } : { texte: `Faux Frère : ${n}/${MIN} joueurs, on attend`, f: () => X.ligne(`Il faut au moins ${MIN} joueurs. Invite ceux qui sont en ville : ils ont reçu « Y aller ».`) }, { texte: 'Annuler la partie', f: () => quitter(true) }];
    return [{ texte: 'Quitter la table', f: () => quitter(true) }];
  }
  if (G.id) return [];
  if (!presDuMaquis(S.x, S.z)) return [];
  const ouverte = OUV.liste.find(P2 => P2.etat === 'inscription' && maintenant() - (P2.cree || 0) < INSCRIPTION && Object.keys(P2.joueurs || {}).length < MAX_JOUEURS);
  if (ouverte) return [{ texte: `Rejoindre le Faux Frère de ${filtrer(ouverte.joueurs?.[ouverte.hote]?.n || 'quelqu’un')} · ${Object.keys(ouverte.joueurs || {}).length}/${MAX_JOUEURS}`, f: () => rejoindre(ouverte.id) }];
  return [{ texte: 'Lancer une partie de Faux Frère', f: creer }];
}
async function creer() {
  const S = X.S, uid = await B.uid(); if (!uid || G.id) return;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  try {
    await B.ecrire(id, { hote: uid, salon: S.code, lieu: 'fidjrosse', cree: TS, etat: 'inscription', joueurs: { [uid]: { n: nom(), t: TS } } });
  } catch (e) { console.warn('faux frère', e.message); X.ligne('La partie n’a pas pu être créée : vérifie ta connexion.'); return; }
  suivrePartie(id);
  X.ligne(`Partie de Faux Frère ouverte. Il faut ${MIN} joueurs au moins : ceux qui sont en ville sont prévenus.`);
  S.canal?.dire({ n: S.nom, txt: `Je lance une partie de Faux Frère au maquis Tanti Rosine, plage de Fidjrossè : viens jouer !`, lieu: 'fidjrosse' });
}
async function rejoindre(id) {
  const uid = await B.uid(); if (!uid || G.id) return;
  try { await B.ecrire(`${id}/joueurs/${uid}`, { n: nom(), t: TS }); } catch { X.ligne('Trop tard : la partie a déjà commencé.'); return; }
  suivrePartie(id); son('piece');
}
async function lancer() {
  const P = G.P; if (!P || P.etat !== 'inscription') return;
  try { await B.maj(G.id, { etat: 'jeu', debut: TS }); } catch (e) { console.warn('faux frère', e.message); X.ligne('La partie n’a pas pu commencer : réessaie.'); }
}
async function quitter(parler = false) {
  const P = G.P, uid = await B.uid().catch(() => '');
  if (P?.etat === 'inscription' && uid) {
    if (P.hote === uid) B.ecrire(G.id, null).catch(() => {}); // l'hôte s'en va : la table se vide
    else B.ecrire(`${G.id}/joueurs/${uid}`, null).catch(() => {});
  }
  G.off?.(); Object.assign(G, { id: '', P: null, E: null, mot: '', verdicts: {}, fin: null, off: null, assis: false }); G.vus.clear(); G.annonces.clear();
  panneau(false);
  if (parler) X.ligne('Tu as quitté la partie de Faux Frère.');
}
const nom = () => filtrer(String(X.S.nom || '').trim()).slice(0, 16) || 'Joueur';
function suivrePartie(id) {
  G.off?.(); G.id = id; G.verdicts = {}; G.fin = null; G.mot = ''; G.vus.clear(); G.annonces.clear(); G.assis = false;
  G.off = B.suivre(id, P => {
    if (!P && G.id === id) { if (G.P?.etat === 'inscription' && G.P.hote !== X.S.R?.id) X.ligne('La partie de Faux Frère a été annulée.'); quitter(); return; }
    G.P = P;
  });
  panneau(true);
}

// ---------- À chaque image ----------
let tic = 0;
export function majFauxFrere(dt, S) {
  const o = S.lieu || !presDuMaquis(S.x, S.z, 4.6) ? 1 : .15; // sous la paillote : on voit à travers le toit
  if (Math.abs(TOIT.o - o) > .01) { TOIT.o += (o - TOIT.o) * Math.min(1, dt * 5); for (const m of TOIT.mats) { m.opacity = TOIT.o; m.depthWrite = TOIT.o > .99; } }
  // Les parties ouvertes de la ville : on ne les écoute qu'à l'approche du maquis.
  const pres = presDuMaquis(S.x, S.z, 60);
  if (pres && S.code && OUV.code !== S.code) { OUV.off?.(); OUV.code = S.code; OUV.off = B.suivreSalon(S.code, l => { OUV.liste = l; }); }
  else if (!pres && OUV.off && !G.id) { OUV.off(); OUV.off = null; OUV.code = ''; OUV.liste = []; }
  if (!G.id || !G.P) return;
  if ((tic += dt) < .2) return; tic = 0;
  const P = G.P, E = deroule(P, maintenant(), G.verdicts); G.E = E;
  const moi = S.R?.id;
  if (P.etat === 'inscription' && maintenant() - (P.cree || 0) > INSCRIPTION + 60000) { X.ligne('Pas assez de joueurs : la partie de Faux Frère est fermée.'); quitter(); return; }
  if (E.phase !== 'inscription') {
    if (!G.mot && performance.now() - G.demandeT > 2500) { G.demandeT = performance.now(); arbitre('mot').then(r => { if (r?.mot) { G.mot = r.mot; son('arret'); } }).catch(e => console.warn('faux frère', e.message)); }
    if (!G.assis && presDuMaquis(S.x, S.z, 20)) { // à sa place autour d'une table
      G.assis = true; const i = ordreDe(P).indexOf(moi), c = SIEGES[i];
      if (c) { S.x = c.x; S.z = c.z; S.cap = c.cap; S.geste = 'assis'; S.gesteFin = 0; S.saut = true; }
    }
    if ((E.phase === 'verdict' || (E.phase === 'fin' && !G.fin)) && performance.now() - G.demandeT > 1500) {
      G.demandeT = performance.now();
      arbitre('verdicts').then(r => { if (!r) return; Object.assign(G.verdicts, r.verdicts || {}); if (r.fin) G.fin = r.fin; }).catch(e => console.warn('faux frère', e.message));
    }
  }
  annoncer(E, P);
  rendre(E, P, moi);
}
/** Ce qui vient d'arriver (un indice, un vote clos, la fin) : dans la discussion, et en bulle au-dessus du joueur. */
function annoncer(E, P) {
  const n = u => filtrer(P.joueurs?.[u]?.n || '?');
  for (const i of E.indices) { const k = `i${i.manche}.${i.passe}.${i.u}`; if (G.vus.has(k)) continue; G.vus.add(k); const m = filtrer(i.m); X.ligne(`Faux Frère · ${n(i.u)} : « ${m} »`); X.bulleDe(i.u, m); son('piece'); }
  const R = E.resultat;
  if (R && !G.annonces.has(`r${R.manche}`) && (E.phase === 'resultat' || E.phase === 'fin')) {
    G.annonces.add(`r${R.manche}`);
    X.ligne(R.u ? `Faux Frère · ${n(R.u)} quitte la table${R.faux ? ' : c’était le faux frère !' : ' : c’était un frère.'}` : 'Faux Frère · égalité : personne ne part.');
  }
  if (E.phase === 'fin' && G.fin && !G.annonces.has('fin')) {
    G.annonces.add('fin'); son('arret');
    const autre = Object.values(G.fin.mots).find(m => m !== G.fin.mots[G.fin.faux]);
    X.ligne(`Faux Frère · ${G.fin.gagnant === 'freres' ? 'les frères gagnent' : 'le faux frère gagne'} ! ${n(G.fin.faux)} avait « ${G.fin.mots[G.fin.faux]} », les autres « ${autre} ».`);
  }
}

// ---------- Le panneau de la partie ----------
const UI = { el: null, mode: '', liste: '' };
function panneau(oui) {
  if (oui && !UI.el) {
    UI.el = document.createElement('section'); UI.el.className = 'ff-panneau panel'; UI.el.setAttribute('aria-label', 'Le Faux Frère');
    UI.el.innerHTML = '<header><b>Le Faux Frère</b><span class="ff-phase" role="status"></span><button type="button" class="ff-reduire" aria-expanded="true" title="Réduire">–</button></header><div class="ff-corps"><p class="ff-mot"></p><ol class="ff-joueurs"></ol><div class="ff-agir"></div></div>';
    $('#salonHud')?.append(UI.el);
    UI.el.querySelector('.ff-reduire').addEventListener('click', e => { const r = UI.el.classList.toggle('reduit'); e.currentTarget.setAttribute('aria-expanded', String(!r)); e.currentTarget.textContent = r ? '+' : '–'; });
    UI.el.addEventListener('click', e => { const b = e.target.closest('[data-ff]'); if (b) agir(b.dataset.ff, b.dataset.v); });
    UI.el.addEventListener('submit', e => { e.preventDefault(); donnerIndice(); });
  }
  if (UI.el) UI.el.hidden = !oui;
  UI.mode = ''; UI.liste = '';
}
const secondes = t => Math.max(0, Math.ceil((t - maintenant()) / 1000));
function rendre(E, P, moi) {
  if (!UI.el || UI.el.hidden) return;
  const n = u => esc(filtrer(P.joueurs?.[u]?.n || '?')), ordre = ordreDe(P), nbJ = ordre.length;
  const phases = { inscription: `En attente · ${nbJ}/${MAX_JOUEURS} joueurs`, lecture: 'Lis ton mot…', indice: `Manche ${E.manche + 1}/${TOURS} · indices · ${secondes(E.jusqua)} s`, vote: `Manche ${E.manche + 1}/${TOURS} · vote · ${secondes(E.jusqua)} s`, verdict: 'Le vote est clos…', resultat: `Manche ${E.manche + 1}/${TOURS} · résultat`, fin: G.fin ? (G.fin.gagnant === 'freres' ? 'Les frères gagnent !' : 'Le faux frère gagne !') : 'Fin de la partie…' };
  const ph = UI.el.querySelector('.ff-phase'); if (ph.textContent !== phases[E.phase]) ph.textContent = phases[E.phase];
  // Son mot.
  const motHtml = E.phase === 'inscription' ? (P.hote === moi ? `Il faut ${MIN} joueurs au moins : quand vous êtes assez, appuie sur « Lancer le Faux Frère ».` : 'L’hôte lance la partie dès que vous êtes assez.')
    : G.mot ? `Ton mot : <b>${esc(G.mot)}</b><small>Un seul joueur a un mot différent… peut-être toi.</small>` : 'L’arbitre distribue les mots…';
  const pm = UI.el.querySelector('.ff-mot'); if (pm.dataset.h !== motHtml) { pm.dataset.h = motHtml; pm.innerHTML = motHtml; }
  // Les joueurs, leurs indices, qui a voté, qui est parti.
  const elimines = new Set(E.elimines.map(e => e.u)), votants = new Set(E.votants);
  const lignes = ordre.map(u => {
    const ind = E.indices.filter(i => i.u === u).map(i => `<span class="ff-ind">${esc(filtrer(i.m))}</span>`).join('');
    const etat = elimines.has(u) ? (G.fin?.faux === u || E.resultat?.u === u && E.resultat.faux ? 'faux frère' : 'hors jeu') : E.qui === u ? 'à son tour' : E.phase === 'vote' && votants.has(u) ? 'a voté' : '';
    const mot = G.fin ? ` <em>${esc(G.fin.mots[u] || '')}</em>` : '';
    return `<li class="${elimines.has(u) ? 'parti' : ''}${E.qui === u ? ' tour' : ''}${G.fin?.faux === u ? ' faux' : ''}"><b>${n(u)}${u === moi ? ' (toi)' : ''}</b>${mot}${ind}${etat ? `<small>${etat}</small>` : ''}</li>`;
  }).join('');
  if (lignes !== UI.liste) { UI.liste = lignes; UI.el.querySelector('.ff-joueurs').innerHTML = lignes; }
  // Ce qu'on peut faire : écrire son indice, voter, rejouer.
  const vivant = E.vivants.includes(moi) && !elimines.has(moi), monVote = P.votes?.[E.manche]?.[moi];
  const mode = E.phase === 'indice' && E.qui === moi && vivant && G.mot ? `saisir${E.manche}.${E.passe}`
    : E.phase === 'vote' && vivant && !monVote ? `voter${E.manche}` : E.phase === 'vote' && monVote ? `vote${E.manche}` : E.phase === 'fin' ? 'fin' : E.phase;
  const agir = UI.el.querySelector('.ff-agir');
  if (mode !== UI.mode) {
    UI.mode = mode;
    if (mode.startsWith('saisir')) { agir.innerHTML = '<form class="ff-saisie"><label>Ton indice (un seul mot)<input maxlength="20" autocomplete="off" autocapitalize="off" enterkeyhint="send"></label><button type="submit" class="jouer">Donner</button><small class="ff-erreur" role="alert"></small></form>'; agir.querySelector('input').focus(); son('arret'); }
    else if (mode.startsWith('voter')) agir.innerHTML = `<p>Qui est le faux frère ?</p><div class="ff-votes">${E.vivants.filter(u => u !== moi).map(u => `<button type="button" data-ff="voter" data-v="${esc(u)}">${n(u)}</button>`).join('')}</div>`;
    else if (mode.startsWith('vote')) agir.innerHTML = `<p>Tu as voté contre ${n(monVote.c)}. On attend les autres.</p>`;
    else if (mode === 'fin') agir.innerHTML = `<div class="ff-votes"><button type="button" data-ff="fermer">Fermer</button></div>`;
    else if (mode === 'indice') agir.innerHTML = `<p>${vivant ? 'Écoute les indices des autres.' : 'Tu es hors jeu : regarde la suite.'}</p>`;
    else agir.innerHTML = '';
  }
}
async function donnerIndice() {
  const E = G.E, inp = UI.el?.querySelector('.ff-saisie input'); if (!E || !inp) return;
  const m = inp.value.trim(), err = indiceValable(m, G.mot) || (filtrer(m) !== m ? 'Pas de gros mots.' : '');
  if (err) { UI.el.querySelector('.ff-erreur').textContent = err; return; }
  const uid = await B.uid();
  try { await B.ecrire(`${G.id}/indices/${E.manche}/${E.passe}/${uid}`, { m, t: TS }); UI.mode = ''; }
  catch { UI.el.querySelector('.ff-erreur').textContent = 'Indice non envoyé : vérifie ta connexion.'; }
}
async function agir(quoi, v) {
  if (quoi === 'fermer') { quitter(); return; }
  if (quoi === 'voter' && G.E?.phase === 'vote') {
    const uid = await B.uid();
    try { await B.ecrire(`${G.id}/votes/${G.E.manche}/${uid}`, { c: v, t: TS }); son('piece'); } catch { X.ligne('Vote non envoyé : vérifie ta connexion.'); }
  }
}

/** On quitte la ville : on quitte aussi la table. */
export function quitterFauxFrere() { if (G.id) quitter(); OUV.off?.(); OUV.off = null; OUV.code = ''; OUV.liste = []; }

// ---------- Mise en route ----------
export function initFauxFrere(ctx) {
  X = ctx; heureServeur();
  if (import.meta.env.DEV) window.__ff = { G, OUV, MAQUIS, SIEGES, creer, rejoindre, lancer, quitter, arbitre, B }; // pour les tests
}
