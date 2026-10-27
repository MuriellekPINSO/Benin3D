import * as THREE from 'three';
import { $, hash, toXZ } from './base.js';
import { PLACES } from './donnees-lieux.js';
import { groupeLieu } from './lieux.js';
import { poserObstacles } from './rue.js';
import { camera, canvas } from './scene.js';
import { MAX_DECOR, reduireImage } from './textures.js';
import { personne } from './discussions.js';
import { son } from './audio.js';
import { firebase, joueur } from './firebase.js';
import { debutDe, finDe, jourDe } from './defi.js';
import { VIE, depenser } from './vie.js';
import { filtrer } from './moderation.js';

// ---------- Tir au lance-pierre : le stand de la plage de Fidjrossè ----------
// « Le 1 et 2 comme dit » (27/10) : le jeu d'adresse d'une minute, entre deux courses de zém. Un stand de fête foraine sur
// le sable, face à la mer : des boîtes de tomate en pyramide, des bouteilles, des mangues qui se balancent au bout d'une
// ficelle. On tire le doigt vers l'arrière pour tendre l'élastique (plus loin, plus fort), on vise à l'opposé et on lâche.
// Le vent de la plage change à chaque tir : la manche à air et la flèche du haut le disent. 60 secondes.
// Points : boîte 10, bouteille 20, mangue 30, la boîte du chariot qui passe (les 15 dernières secondes) 40 ; un tir qui
// touche juste après un autre tir réussi compte double. Une pyramide vidée, le forain la remonte.
// Le défi du jour : tout le monde a le même stand (le rangement des cibles, les mangues, la suite des vents), tiré du jour
// du défi de Zém Run (defi.js : de 20 h la veille à 20 h). La première partie du jour est gratuite, les suivantes coûtent
// 50 F ; elles comptent toutes, on garde la meilleure. Le classement s'affiche sur le panneau à côté du stand.
// Firebase (règles dans database.rules.json) :
//   zem_lp_departs/{uid}  { t : heure du serveur au départ, j : jour du défi }
//   zem_lp/{jour}/{uid}   la meilleure partie du jour : nom, score et ce qui le compose (b boîtes, u bouteilles,
//                         g mangues, c chariot, k bonus des tirs doublés, ti tirs), départ, envoi
// Les règles refont l'addition, bornent chaque compte par le nombre de tirs, et refusent une partie envoyée moins
// d'une minute après son départ. Pas de lot : c'est une protection suffisante.
// Repère du stand : l'origine est la ligne de tir, +z vers les cibles (le sud, la mer), donc la droite de l'écran est −x.
// En développement, ?salon-local (ou ?lp-local) : un classement d'essai dans ce navigateur, rien n'est envoyé.

const LP = PLACES.find(q => q.id === 'fidjrosse'), [FX, FZ] = LP ? toXZ(LP.lat, LP.lon) : [0, 0];
export const STAND = { x: FX + 14, z: FZ + 20 }; // la ligne de tir, à 25 m de l'arrivée « Plage de Fidjrossè »
export const presDuStand = (x, z) => Math.hypot(x - STAND.x, z - STAND.z) < 3.5;
const DUREE = 60, RECHARGE = .7, PRIX = 50, CHARIOT = 15, PTS = { boite: 10, bouteille: 20, mangue: 30, chariot: 40 };
const OEIL = new THREE.Vector3(0, 1.6, -.35), VISE = new THREE.Vector3(0, 1.55, 7.3), G = 9.81, R_CAILLOU = .03;
const ETAGERES = [.8, 1.3, 1.8], Z_ETAGERE = 7.45, Z_BACHE = 7.9, Z_MANGUES = 7.15, Y_BARRE = 2.62, Y_RAIL = .42, Z_RAIL = 6.85;
const Q = new URLSearchParams(location.search), LOCAL = import.meta.env.DEV && (Q.has('salon-local') || Q.has('lp-local'));
const CLE_GRATUIT = 'kutonu.lp.gratuit', CLE_LOCAL = 'kutonu.lp.local';
const nb = n => Math.round(n).toLocaleString('fr-FR');
const place = r => r === 1 ? '1re place' : r === 2 ? '2e place' : r === 3 ? '3e place' : `${r}e place`; // en entier : la version anglaise dit 2nd, 3rd
const lireLS = k => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } };

let X = null; // le salon : { S, ligne, choisir }
const L = { g: null, cibles: [], groupes: [], eclats: [], caillou: null, forain: null, manche: null, tableau: null, tableauT: -1e9, decalage: 0, heure: null };
// La partie en cours : phase 'decompte' (3, 2, 1), 'jeu', 'fin' ; null hors partie.
let P = null;

// ---------- Matières et formes (une fois) ----------
const M = {};
function matieres() {
  if (M.bois) return M;
  const toile = (w, h, f) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; f(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(reduireImage(cv, MAX_DECOR)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  M.bois = new THREE.MeshLambertMaterial({ color: '#9a6b41' });
  M.boisClair = new THREE.MeshLambertMaterial({ color: '#c79a62' });
  M.metal = new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: .7, roughness: .35 });
  // La bâche du fond, à grandes bandes bleues et blanches ; le toit, rayé rouge et blanc.
  M.bache = new THREE.MeshLambertMaterial({ map: toile(256, 256, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f3efe6' : '#2f6fb0'; c.fillRect(i * w / 8, 0, w / 8, h); } }) });
  M.toit = new THREE.MeshLambertMaterial({ map: toile(256, 64, (c, w, h) => { for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? '#f6f1e7' : '#c8382f'; c.fillRect(i * w / 10, 0, w / 10, h); } }), side: THREE.DoubleSide });
  M.enseigne = new THREE.MeshBasicMaterial({ map: toile(1024, 160, (c, w, h) => {
    c.fillStyle = '#f5c518'; c.fillRect(0, 0, w, h); c.fillStyle = '#c8382f'; c.fillRect(0, h - 18, w, 18);
    c.fillStyle = '#17130c'; c.font = '900 84px Impact, "Arial Black", sans-serif'; c.textAlign = 'center'; c.fillText('TIR AU LANCE-PIERRE', w / 2, 98);
    c.font = '700 30px system-ui, sans-serif'; c.fillText('Boîte 10 · Bouteille 20 · Mangue 30', w / 2, 132);
  }) });
  // L'étiquette des boîtes de tomate : rouge, une bande blanche, les bords en fer-blanc.
  M.etiquette = new THREE.MeshLambertMaterial({ map: toile(128, 64, (c, w, h) => { c.fillStyle = '#d0d3d6'; c.fillRect(0, 0, w, h); c.fillStyle = '#c8302a'; c.fillRect(0, 7, w, h - 14); c.fillStyle = '#f6efe2'; c.fillRect(0, 26, w, 12); c.fillStyle = '#2f8a4a'; for (let x = 6; x < w; x += 32) { c.beginPath(); c.arc(x + 8, 32, 5, 0, 7); c.fill(); } }) });
  M.verts = [new THREE.MeshStandardMaterial({ color: '#2f6b3a', roughness: .12, metalness: .1, transparent: true, opacity: .88 }), new THREE.MeshStandardMaterial({ color: '#6b3d1c', roughness: .12, metalness: .1, transparent: true, opacity: .9 })];
  M.mangue = new THREE.MeshLambertMaterial({ color: '#f0a52c' });
  M.queue = new THREE.MeshLambertMaterial({ color: '#4d7a2a' });
  M.ficelle = new THREE.LineBasicMaterial({ color: '#e8dcc0' });
  M.caillou = new THREE.MeshLambertMaterial({ color: '#6d6a64' });
  M.eclat = { bouteille: new THREE.MeshBasicMaterial({ color: '#3f8a4c' }), mangue: new THREE.MeshBasicMaterial({ color: '#f2a62a' }), boite: new THREE.MeshBasicMaterial({ color: '#c8302a' }) };
  M.chariot = new THREE.MeshLambertMaterial({ color: '#2f6fb0' });
  M.manche = [new THREE.MeshLambertMaterial({ color: '#f07a1a', side: THREE.DoubleSide }), new THREE.MeshLambertMaterial({ color: '#f6f1e7', side: THREE.DoubleSide })];
  M.geo = {
    boite: new THREE.CylinderGeometry(.07, .07, .15, 16).translate(0, .075, 0),
    // La bouteille, tournée : le cul, le corps, l'épaule, le goulot.
    bouteille: new THREE.LatheGeometry([[0, 0], [.04, 0], [.042, .01], [.042, .17], [.03, .21], [.014, .24], [.014, .28], [0, .28]].map(([x, y]) => new THREE.Vector2(x, y)), 16),
    mangue: new THREE.SphereGeometry(.065, 16, 12).scale(.95, 1.18, .85),
    queue: new THREE.CylinderGeometry(.006, .008, .04, 5).translate(0, .095, 0),
    caillou: new THREE.IcosahedronGeometry(R_CAILLOU, 1),
    eclat: new THREE.TetrahedronGeometry(.025),
  };
  return M;
}

// ---------- Le stand ----------
/** Le stand, posé sur le sable une fois pour toutes (main.js) ; les cibles viennent avec la première partie ou à l'approche. */
export function construireStand() {
  matieres();
  const g = groupeLieu('Tir au lance-pierre', STAND.x, STAND.z); g.userData.portee = 1200; L.g = g;
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  const poteau = (x, z, h = 3) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(.05, .06, h, 7), M.bois); o.position.set(x, h / 2, z); o.castShadow = true; g.add(o); };
  // Le comptoir de tir, devant le joueur, et la planche peinte au sol qui marque la ligne.
  box(2.6, .08, .5, M.boisClair, 0, 1.0, .7); box(2.5, .96, .06, M.bois, 0, .48, .9);
  box(2.2, .02, .12, new THREE.MeshLambertMaterial({ color: '#f3efe6' }), 0, .01, .1);
  // Le fond : quatre poteaux, la bâche, le toit rayé, l'enseigne.
  for (const x of [-1.5, 1.5]) for (const z of [6.55, 7.95]) poteau(x, z, 3.05);
  const bache = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.75), M.bache); bache.position.set(0, 1.42, Z_BACHE + .02); bache.rotation.y = Math.PI; g.add(bache);
  const toit = box(3.4, .05, 1.9, M.toit, 0, 3.08, 7.25); toit.rotation.x = .1;
  const ens = new THREE.Mesh(new THREE.PlaneGeometry(3.1, .48), M.enseigne); ens.position.set(0, 2.82, 6.5); ens.rotation.y = Math.PI; g.add(ens);
  // Trois étagères, et leurs montants.
  for (const y of ETAGERES) box(2.5, .04, .34, M.boisClair, 0, y - .02, Z_ETAGERE);
  for (const x of [-1.27, 1.27]) box(.05, 2.0, .3, M.bois, x, 1.0, Z_ETAGERE);
  // La barre des mangues, et le rail du chariot, devant l'étagère du bas.
  const barre = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 2.9, 8).rotateZ(Math.PI / 2), M.bois); barre.position.set(0, Y_BARRE, Z_MANGUES); g.add(barre);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, 2.6, 6).rotateZ(Math.PI / 2), M.metal); rail.position.set(0, Y_RAIL, Z_RAIL); g.add(rail);
  for (const x of [-1.3, 1.3]) box(.04, Y_RAIL, .04, M.bois, x, Y_RAIL / 2, Z_RAIL);
  // Les cordes de chaque côté du pas de tir : on ne va pas ramasser les boîtes pendant que les autres tirent.
  for (const x of [-1.5, 1.5]) {
    for (const z of [1.1, 3.6, 6.1]) { const o = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 1, 6), M.bois); o.position.set(x, .5, z); g.add(o); }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, .92, 1.1), new THREE.Vector3(x, .86, 3.6), new THREE.Vector3(x, .92, 6.1)]), new THREE.LineBasicMaterial({ color: '#c8382f' })));
  }
  // La manche à air, en haut d'un mât à gauche : elle pend sans vent et se tend avec lui.
  poteau(1.85, 6.2, 3.5);
  const manche = new THREE.Group(); manche.position.set(1.85, 3.42, 6.2);
  for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.11 - i * .018, .11 - (i + 1) * .018, .14, 10, 1, true).rotateZ(-Math.PI / 2).translate(.07 + i * .14, 0, 0), M.manche[i % 2]); manche.add(c); }
  g.add(manche); L.manche = manche;
  // Le panneau du classement du jour, tourné vers ceux qui arrivent.
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const pan = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: tex })); pan.position.set(-2.6, 1.75, 2.6); pan.rotation.y = Math.PI + .5; g.add(pan);
  for (const dx of [-.6, .6]) { const o = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 2.5, 6), M.bois); o.position.set(-2.6 + dx * Math.cos(.5), 1.25, 2.6 + dx * Math.sin(.5)); g.add(o); }
  L.tableau = { cv, tex, liste: null };
  dessinerTableau();
  // Solide : le comptoir, la bâche et ses poteaux, le mât, le panneau. [x, z, angle, longueur, épaisseur] (rue.js).
  const { x, z } = STAND;
  poserObstacles('lancepierre', [[x, z + .8, 0, 2.7, .5], [x, z + 7.25, 0, 3.2, 1.6], [x + 1.85, z + 6.2, 0, .2, .2], [x - 2.6, z + 2.6, 0, 1.2, .5], [x - 1.5, z + 3.75, Math.PI / 2, 5.5, .15], [x + 1.5, z + 3.75, Math.PI / 2, 5.5, .15]]);
  monterCibles(jourDe(Date.now()));
  return g;
}
/** Le panneau du classement : les cinq meilleurs du jour. */
function dessinerTableau() {
  const T = L.tableau; if (!T) return;
  const c = T.cv.getContext('2d'), w = 512;
  c.fillStyle = '#17324f'; c.fillRect(0, 0, w, w); c.fillStyle = '#f5c518'; c.fillRect(0, 0, w, 96);
  c.fillStyle = '#17130c'; c.textAlign = 'center'; c.font = '900 46px Impact, "Arial Black", sans-serif'; c.fillText('MEILLEURS DU JOUR', w / 2, 66);
  c.textAlign = 'left'; c.font = '700 34px system-ui, sans-serif';
  const l = T.liste;
  if (!l) { c.fillStyle = '#c9d6e3'; c.fillText('…', 40, 170); }
  else if (!l.length) { c.fillStyle = '#f3efe6'; c.font = '700 32px system-ui, sans-serif'; c.fillText('Personne encore.', 40, 170); c.fillText('À toi de jouer !', 40, 220); }
  else l.slice(0, 5).forEach((e, i) => {
    const y = 160 + i * 74; c.fillStyle = i === 0 ? '#f5c518' : '#f3efe6';
    c.fillText(`${i + 1}. ${String(e.n).slice(0, 12)}`, 34, y); c.textAlign = 'right'; c.fillText(nb(e.s), w - 34, y); c.textAlign = 'left';
  });
  T.tex.needsUpdate = true;
}

// ---------- Les cibles du jour ----------
const numeroJour = j => Math.round(Date.parse(`${j}T12:00:00Z`) / 864e5);
/** Le vent du tir `i` (m/s, positif : il pousse vers la droite de l'écran), le même pour tous ce jour-là. */
const ventDu = (j, i) => Math.round((hash(numeroJour(j) * 131 + i, 31) - .5) * 16) / 2;
/** Six places sur les étagères (deux par étagère), un rangement par jour : pyramides de boîtes, bouteilles. */
function rangement(j) {
  const n = numeroJour(j), types = ['pyramide', 'bouteilles', 'petite', 'bouteilles', 'pyramide', 'petite'];
  for (let i = types.length - 1; i > 0; i--) { const k = Math.floor(hash(n, 60 + i) * (i + 1)); [types[i], types[k]] = [types[k], types[i]]; }
  // L'étagère du haut n'a pas la place d'une grande pyramide sous les mangues : on l'échange avec une place plus basse.
  for (const i of [4, 5]) if (types[i] === 'pyramide') { const k = types.findIndex((t, m) => m < 4 && t !== 'pyramide'); [types[i], types[k]] = [types[k], types[i]]; }
  return types.map((type, i) => ({ type, x: (i % 2 ? .62 : -.62) + (hash(n, 70 + i) - .5) * .16, y: ETAGERES[Math.floor(i / 2)] }));
}
/** Les mangues : trois, chacune avec sa ficelle, son balancement et sa phase. */
const manguesDu = j => [-.75, 0, .75].map((x, i) => ({ x: x + (hash(numeroJour(j), 80 + i) - .5) * .2, amp: .12 + hash(numeroJour(j), 83 + i) * .3, w: 1.4 + hash(numeroJour(j), 86 + i) * 1.4, ph: hash(numeroJour(j), 89 + i) * 6.28, fil: .3 + hash(numeroJour(j), 92 + i) * .12 }));

function nouvelleCible(type, x, y, z, groupe, support = []) {
  const m = matieres();
  let o;
  if (type === 'boite' || type === 'chariot') o = new THREE.Mesh(m.geo.boite, [m.etiquette, m.metal, m.metal]);
  else if (type === 'bouteille') o = new THREE.Mesh(m.geo.bouteille, m.verts[Math.floor(Math.random() * 2)]);
  else { o = new THREE.Mesh(m.geo.mangue, m.mangue); o.add(new THREE.Mesh(m.geo.queue, m.queue)); }
  o.castShadow = true; o.position.set(x, y, z); L.g.add(o);
  const r = type === 'bouteille' ? .045 : type === 'mangue' ? .078 : .072, h = type === 'bouteille' ? .28 : .15;
  const C = { type, o, x, y, z, r, h, etat: 'debout', groupe, support, v: new THREE.Vector3(), w: new THREE.Vector3(), t: 0 };
  L.cibles.push(C); groupe.cibles.push(C); return C;
}
/** Pose (ou repose) les cibles d'une place : la pyramide 3-2-1, la petite 2-1, trois bouteilles. */
function remplir(G) {
  for (const C of G.cibles) { L.g.remove(C.o); if (C.fil) L.g.remove(C.fil); }
  L.cibles = L.cibles.filter(C => C.groupe !== G); G.cibles = []; G.vide = 0;
  const z = Z_ETAGERE - .02;
  if (G.type === 'pyramide' || G.type === 'petite') {
    const rangs = G.type === 'pyramide' ? [3, 2, 1] : [2, 1]; let dessous = [];
    rangs.forEach((n, r) => {
      const rang = [];
      for (let k = 0; k < n; k++) { const x = G.x + (k - (n - 1) / 2) * .148, sup = r ? [dessous[k], dessous[k + 1]] : []; rang.push(nouvelleCible('boite', x, G.y + r * .15, z, G, sup)); }
      dessous = rang;
    });
  } else if (G.type === 'bouteilles') for (let k = 0; k < 3; k++) nouvelleCible('bouteille', G.x + (k - 1) * .24, G.y, z, G);
  else if (G.type === 'mangues') for (const d of G.mangues) {
    const C = nouvelleCible('mangue', d.x, Y_BARRE - d.fil, Z_MANGUES, G); C.balance = d;
    // La ficelle bouge à chaque image : son tableau de sommets doit rester (memoire.js rend ceux qui ne bougent pas).
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    C.fil = new THREE.Line(geo, M.ficelle); C.fil.frustumCulled = false; L.g.add(C.fil);
  } else if (G.type === 'chariot') { // la boîte posée sur son chariot, qui va et vient sur le rail
    G.wagon ??= (() => { const w = new THREE.Mesh(new THREE.BoxGeometry(.24, .06, .16), M.chariot); w.position.set(0, Y_RAIL + .03, Z_RAIL); L.g.add(w); return w; })();
    nouvelleCible('chariot', 0, Y_RAIL + .06, Z_RAIL, G);
  }
  // Remises en place : elles apparaissent en grandissant, comme posées vite par le forain.
  for (const C of G.cibles) { C.o.scale.setScalar(.01); C.pop = 0; }
}
function monterCibles(j) {
  for (const C of L.cibles) { L.g.remove(C.o); if (C.fil) L.g.remove(C.fil); }
  for (const G of L.groupes) if (G.wagon) L.g.remove(G.wagon);
  L.cibles = []; L.groupes = [...rangement(j).map(p => ({ ...p, cibles: [] })), { type: 'mangues', mangues: manguesDu(j), cibles: [] }];
  for (const G of L.groupes) remplir(G);
  L.jour = j;
}

// ---------- La partie ----------
export const tirEnCours = () => !!P;
/** Le bouton du stand (salon.js), à côté de la ligne de tir. */
export function actionsLancePierre(S, T) {
  if (P) return [{ texte: 'Arrêter la partie', f: () => finir(true) }];
  if (T.mode !== 'pied' || S.lieu || !L.g || !presDuStand(S.x, S.z)) return [];
  const gratuit = lireLS(CLE_GRATUIT) !== jourDe(maintenant());
  return [{ texte: `Jouer au lance-pierre · ${gratuit ? 'gratuit aujourd’hui' : `${PRIX} F`}`, f: commencer }, { texte: 'Classement du lance-pierre', f: () => montrerClassement() }];
}
async function commencer() {
  if (P) return;
  const j = jourDe(maintenant()), gratuit = lireLS(CLE_GRATUIT) !== j;
  if (!gratuit && !(await depenser(PRIX, 'une partie de lance-pierre'))) { X.ligne(`Il te faut ${PRIX} F pour une partie de lance-pierre.`); return; }
  if (gratuit) ecrireLS(CLE_GRATUIT, j);
  const S = X.S; S.x = STAND.x; S.z = STAND.z; S.cap = 0; S.geste = 'idle'; S.saut = true;
  if (L.jour !== j) monterCibles(j);
  else for (const G of L.groupes) if (G.type !== 'chariot') remplir(G);
  P = { j, phase: 'decompte', t: -3, tirs: 0, recharge: 0, score: 0, comptes: { b: 0, u: 0, g: 0, c: 0, k: 0 }, serie: false, tir: null, vent: ventDu(j, 0), depart: null, tire: null };
  P.depart = depart(j);
  interface_(true); son('arret');
}
/** L'heure du serveur, et le départ noté par lui (les règles comparent la fin de partie à ce départ). */
const maintenant = () => Date.now() + L.decalage;
function heureServeur() {
  if (LOCAL) return Promise.resolve();
  L.heure ??= firebase().then(({ d, db }) => new Promise(ok => { d.onValue(d.ref(db, '.info/serverTimeOffset'), s => { L.decalage = s.val() || 0; ok(); }, { onlyOnce: true }); setTimeout(ok, 4000); })).catch(() => { L.heure = null; });
  return L.heure;
}
async function depart(j) {
  if (LOCAL) return Date.now();
  try {
    const { d, db } = await firebase(), u = await joueur(), r = d.ref(db, `zem_lp_departs/${u.uid}`);
    await d.set(r, { t: d.serverTimestamp(), j });
    const t = (await d.get(r)).val()?.t; return typeof t === 'number' ? t : null;
  } catch (e) { console.warn('lance-pierre', e.message); return null; }
}
function finir(abandon = false) {
  if (!P) return;
  const fin = P; P = null; interface_(false);
  if (L.caillou) L.caillou.o.visible = false;
  for (const G of L.groupes) if (G.type === 'chariot') { for (const C of G.cibles) L.g.remove(C.o); L.cibles = L.cibles.filter(C => C.groupe !== G); G.cibles = []; if (G.wagon) G.wagon.visible = false; }
  X.S.saut = true;
  if (abandon || fin.phase !== 'jeu') { X.ligne('Partie de lance-pierre arrêtée.'); return; }
  son('arret');
  bilan(fin);
}

// ---------- Le geste : tendre l'élastique, viser, lâcher ----------
const D = { id: null, x0: 0, y0: 0, x: 0, y: 0 };
const rayon = () => .28 * Math.min(innerWidth, innerHeight);
/** Le tir que donnerait le doigt là où il est : direction (repère du stand), vitesse, et la tension (0 à 1). */
function tirDuGeste() {
  const R = rayon(), dx = D.x - D.x0, dy = D.y - D.y0, p = Math.min(1, Math.hypot(dx, dy) / R);
  const lacet = THREE.MathUtils.clamp(-dx / R * .3, -.42, .42), tangage = THREE.MathUtils.clamp(.04 + dy / R * .32, -.15, .45);
  const dir = new THREE.Vector3(-Math.sin(lacet) * Math.cos(tangage), Math.sin(tangage), Math.cos(lacet) * Math.cos(tangage));
  return { dir, v: 12 + 12 * p, p };
}
function surAppui(e) {
  if (!P || P.phase !== 'jeu' || D.id !== null || e.button > 0) return;
  e.stopImmediatePropagation(); e.preventDefault();
  D.id = e.pointerId; D.x0 = D.x = e.clientX; D.y0 = D.y = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
  if (P.recharge <= 0) son('elastique');
}
function surGlisse(e) { if (e.pointerId !== D.id) return; D.x = e.clientX; D.y = e.clientY; }
function surLacher(e) {
  if (e.pointerId !== D.id) return;
  D.x = e.clientX; D.y = e.clientY; D.id = null;
  if (!P || P.phase !== 'jeu' || P.recharge > 0) return;
  const t = tirDuGeste(); if (t.p < .12) return; // à peine tendu : on n'a pas tiré
  lancer(t);
}
/** Le point de départ du caillou : dans la fourche, en bas de l'image, à 90 cm devant l'œil. */
function bouche() {
  const demi = THREE.MathUtils.degToRad(camera.fov / 2);
  return new THREE.Vector3(0, OEIL.y - .9 * Math.tan(demi) * .72, OEIL.z + .9);
}
function lancer(t) {
  const m = matieres();
  L.caillou ??= { o: (() => { const o = new THREE.Mesh(m.geo.caillou, m.caillou); L.g.add(o); return o; })(), p: new THREE.Vector3(), v: new THREE.Vector3() };
  const c = L.caillou; c.p.copy(bouche()); c.v.copy(t.dir).multiplyScalar(t.v); c.o.visible = true; c.o.position.copy(c.p); c.vent = P.vent; c.age = 0; c.touche = 0; c.vivant = true;
  P.tirs++; P.recharge = RECHARGE; P.coup = { touches: 0, points: 0 };
  son('fronde');
}

// ---------- À chaque image ----------
const SOUS = 1 / 240, tmp = new THREE.Vector3();
/** Fait vivre le stand (mangues, forain, panneau) et la partie. Appelé par le salon à chaque image. */
export function majLancePierre(dt, S) {
  if (!L.g) return;
  const proche = Math.hypot(S.x - STAND.x, S.z - STAND.z) < 120;
  if (proche) { animerCibles(dt); majForain(); majTableau(); }
  if (!P) return;
  if (Math.hypot(S.x - STAND.x, S.z - STAND.z) > 3) { finir(true); return; } // parti autrement (téléporté, menu « Aller »)
  P.t += dt;
  if (P.phase === 'decompte') {
    const n = Math.ceil(-P.t); if (n !== P.affiche) { P.affiche = n; if (n > 0) son('piece'); }
    if (P.t >= 0) { P.phase = 'jeu'; P.t = 0; son('arret'); }
  } else if (P.phase === 'jeu') {
    if (P.recharge > 0) { P.recharge -= dt; if (P.recharge <= 0 && !L.caillou?.vivant) nouveauVent(); }
    if (P.t >= DUREE - CHARIOT && !P.chariot) { P.chariot = true; const G = { type: 'chariot', cibles: [] }; L.groupes.push(G); remplir(G); X.ligne('Le chariot passe : 40 points la boîte !'); }
    if (P.t >= DUREE && !L.caillou?.vivant) { finir(); return; }
  }
  if (L.caillou?.vivant) volerCaillou(dt);
  majEclats(dt);
  majInterface();
}
function nouveauVent() { P.vent = ventDu(P.j, P.tirs); }
function animerCibles(dt) {
  const t = performance.now() / 1000;
  for (const C of L.cibles) {
    if (C.pop !== undefined && C.pop < 1) { C.pop = Math.min(1, C.pop + dt * 5); C.o.scale.setScalar(C.pop); if (C.pop === 1) C.pop = undefined; }
    if (C.etat === 'debout' && C.balance) { // la mangue au bout de sa ficelle
      const b = C.balance, a = b.amp * Math.sin(t * b.w + b.ph);
      C.x = b.x + Math.sin(a) * b.fil; C.y = Y_BARRE - Math.cos(a) * b.fil - .08; C.o.position.set(C.x, C.y, C.z); C.o.rotation.z = -a;
      const pos = C.fil.geometry.attributes.position; pos.setXYZ(0, b.x, Y_BARRE, C.z); pos.setXYZ(1, C.x, C.y + .07, C.z); pos.needsUpdate = true;
    } else if (C.etat === 'debout' && C.type === 'chariot') { C.x = Math.sin(t * 1.1) * 1.05; C.o.position.x = C.x; const W = C.groupe.wagon; if (W) { W.visible = true; W.position.x = C.x; } }
    else if (C.etat === 'tombe') { // tombe, roule et disparaît dans le sable
      C.v.y -= G * dt; C.o.position.addScaledVector(C.v, dt); C.o.rotation.x += C.w.x * dt; C.o.rotation.z += C.w.z * dt;
      if (C.o.position.y <= .04) { C.o.position.y = .04; C.v.multiplyScalar(.3); C.v.y = Math.abs(C.v.y) * .2; }
      if ((C.t += dt) > 2.2) { C.etat = 'parti'; C.o.visible = false; }
    }
  }
  // Une place vidée : le forain la remonte un instant plus tard.
  for (const G of L.groupes) {
    if (!G.cibles.length || G.cibles.some(C => C.etat === 'debout')) continue;
    G.vide = (G.vide || 0) + dt;
    if (G.vide > 1.6 && (G.type !== 'chariot' || P?.chariot)) remplir(G);
  }
}
function volerCaillou(dt) {
  const c = L.caillou; let reste = dt;
  while (reste > 0 && c.vivant) {
    const h = Math.min(SOUS, reste); reste -= h; c.age += h;
    c.v.y -= G * h; c.v.x += -c.vent * .55 * h; // le vent pousse vers la droite de l'écran, soit −x
    c.p.addScaledVector(c.v, h);
    for (const C of L.cibles) if (C.etat === 'debout' && touche(C, c.p)) { abattre(C, c.v); c.v.multiplyScalar(-.15); c.v.y = .5; c.touche++; break; }
    if (c.p.z >= Z_BACHE - .02) { c.vivant = false; son('bache'); } // dans la bâche
    else if (c.p.y <= R_CAILLOU) c.vivant = false; // dans le sable
    else if (ETAGERES.some(y => Math.abs(c.p.y - (y - .02)) < .03 && Math.abs(c.p.z - Z_ETAGERE) < .17 && Math.abs(c.p.x) < 1.25)) { c.vivant = false; son('bache'); } // sur une planche
    else if (c.age > 2.5 || Math.abs(c.p.x) > 4) c.vivant = false;
  }
  c.o.position.copy(c.p);
  if (!c.vivant) { c.o.visible = false; finCoup(); }
}
function touche(C, p) {
  if (C.type === 'mangue') return p.distanceTo(tmp.set(C.x, C.y, C.z)) < C.r + R_CAILLOU;
  return Math.hypot(p.x - C.x, p.z - C.z) < C.r + R_CAILLOU && p.y > C.y - R_CAILLOU && p.y < C.y + C.h + R_CAILLOU;
}
/** Une cible touchée (ou dont le support vient de tomber) : les points, puis elle tombe ou éclate. */
function abattre(C, v) {
  if (C.etat !== 'debout') return;
  C.etat = 'tombe'; C.t = 0;
  if (P?.phase === 'jeu' && P.coup) { const pts = PTS[C.type]; P.coup.touches++; P.coup.points += pts; P.comptes[{ boite: 'b', bouteille: 'u', mangue: 'g', chariot: 'c' }[C.type]]++; }
  if (C.type === 'bouteille' || C.type === 'mangue') { eclater(C); C.etat = 'parti'; C.o.visible = false; if (C.fil) C.fil.visible = false; son(C.type === 'bouteille' ? 'verre' : 'mangue'); }
  else { C.v.set(v.x * .12 + (Math.random() - .5) * .6, 1 + Math.random() * .8, Math.max(.6, v.z * .1)); C.w.set((Math.random() + .5) * 6, 0, (Math.random() - .5) * 8); son('boite'); }
  // Ceux qui reposaient dessus tombent aussi.
  for (const D2 of C.groupe.cibles) if (D2.etat === 'debout' && D2.support.includes(C)) abattre(D2, new THREE.Vector3((Math.random() - .5) * 2, 0, 3));
}
function eclater(C) {
  const m = matieres(), mat = m.eclat[C.type] || m.eclat.boite;
  for (let i = 0; i < 9; i++) {
    const o = new THREE.Mesh(m.geo.eclat, mat); o.position.set(C.x, C.y + (C.h || .08) * .6, C.z); L.g.add(o);
    L.eclats.push({ o, v: new THREE.Vector3((Math.random() - .5) * 3, 1 + Math.random() * 2.5, (Math.random() - .3) * 2.5), t: 0 });
  }
}
function majEclats(dt) {
  L.eclats = L.eclats.filter(e => {
    e.t += dt; e.v.y -= G * dt; e.o.position.addScaledVector(e.v, dt); e.o.rotation.x += dt * 9;
    if (e.o.position.y < .02) { e.o.position.y = .02; e.v.set(0, 0, 0); }
    if (e.t > 1.6) { L.g.remove(e.o); return false; } return true;
  });
}
/** Le caillou est retombé : on compte le tir (doublé s'il suit un tir réussi). */
function finCoup() {
  if (!P?.coup) return;
  const { touches, points } = P.coup; P.coup = null;
  if (touches) {
    const bonus = P.serie ? points : 0; P.comptes.k += bonus; P.score += points + bonus; P.serie = true;
    P.message = { t: P.t, txt: `+${points + bonus}${bonus ? ' · ×2 !' : ''}` };
  } else { P.serie = false; P.message = { t: P.t, txt: 'Raté', rate: true }; }
  if (P.recharge <= 0) nouveauVent();
}

// ---------- Le forain et le panneau ----------
function majForain() {
  if (L.forain) return;
  const f = personne(4242, { femme: false }); f.position.set(2.15, 0, 7.1); f.rotation.y = Math.PI; L.g.add(f); f.userData.jouer?.('idle'); L.forain = f;
}
async function majTableau() {
  const now = performance.now(); if (now - L.tableauT < 30000) return; L.tableauT = now;
  try { L.tableau.liste = await lireJour(jourDe(maintenant())); dessinerTableau(); } catch { /* hors ligne : le panneau garde ce qu'il avait */ }
}

// ---------- Les scores ----------
async function lireJour(j) {
  if (LOCAL) { try { return (JSON.parse(lireLS(CLE_LOCAL) || '{}')[j] || []).sort((a, b) => b.s - a.s); } catch { return []; } }
  await heureServeur();
  const { d, db } = await firebase(); await joueur();
  const snap = await d.get(d.query(d.ref(db, `zem_lp/${j}`), d.orderByChild('s'), d.limitToLast(100)));
  const debut = debutDe(j), fin = finDe(j), liste = [];
  snap.forEach(e => { const v = e.val(); if (v && v.dep >= debut && v.t < fin) liste.push({ uid: e.key, ...v, n: filtrer(v.n) }); });
  return liste.sort((a, b) => b.s - a.s || a.t - b.t);
}
/** Envoie la partie si elle bat le meilleur score du jour de ce joueur. Renvoie un texte pour le bilan. */
async function envoyer(fin) {
  const { b, u, g, c, k } = fin.comptes, s = fin.score;
  if (s <= 0) return 'Aucune cible touchée : retente ta chance !';
  const n = filtrer(String(X.S.nom || '').trim()).slice(0, 16) || 'Joueur';
  if (LOCAL) {
    const tout = (() => { try { return JSON.parse(lireLS(CLE_LOCAL) || '{}'); } catch { return {}; } })(), l = tout[fin.j] ||= [];
    const moi = l.find(e => e.uid === 'moi'), mieux = !moi || s > moi.s;
    if (mieux) { if (moi) Object.assign(moi, { n, s }); else l.push({ uid: 'moi', n, s, t: Date.now() }); ecrireLS(CLE_LOCAL, JSON.stringify(tout)); }
    L.tableauT = -1e9; return mieux ? 'Score enregistré (essai, dans ce navigateur).' : `Ton meilleur score du jour reste ${nb(moi.s)} points.`;
  }
  try {
    await heureServeur();
    if (maintenant() >= finDe(fin.j)) return 'Le défi a changé à 20 h : cette partie ne compte plus.';
    const dep = await fin.depart; if (!dep) return 'Ton départ n’a pas été enregistré (pas de réseau) : cette partie ne compte pas.';
    const { d, db } = await firebase(), user = await joueur(), chemin = `zem_lp/${fin.j}/${user.uid}`;
    const avant = (await d.get(d.ref(db, chemin))).val(), mieux = !avant || s > avant.s;
    if (mieux) await d.set(d.ref(db, chemin), { n, s, b, u, g, c, k, ti: fin.tirs, dep, t: d.serverTimestamp() });
    L.tableauT = -1e9;
    const liste = await lireJour(fin.j), rang = liste.findIndex(e => e.uid === user.uid) + 1;
    if (mieux && rang && rang <= 3) X.S.canal?.dire({ n: X.S.nom, txt: `${nb(s)} points au lance-pierre de Fidjrossè : ${place(rang)} du jour !`, lieu: 'fidjrosse' });
    return `${mieux ? (avant ? 'Nouveau record du jour ! ' : 'Score enregistré. ') : `Ton meilleur score du jour reste ${nb(avant.s)} points. `}${rang ? `Tu es à la ${place(rang)} sur ${liste.length}.` : ''}`;
  } catch (e) { console.warn('lance-pierre', e.message); return 'Ton score n’est pas parti : vérifie ta connexion.'; }
}
async function bilan(fin) {
  const { b, u, g, c, k } = fin.comptes;
  const detail = [b && `${b} boîte${b > 1 ? 's' : ''}`, u && `${u} bouteille${u > 1 ? 's' : ''}`, g && `${g} mangue${g > 1 ? 's' : ''}`, c && `${c} au chariot`, k && `+${nb(k)} en tirs doublés`].filter(Boolean).join(' · ');
  X.ligne(`Lance-pierre : ${nb(fin.score)} points en ${fin.tirs} tir${fin.tirs > 1 ? 's' : ''}${detail ? ` (${detail})` : ''}.`);
  const etat = await envoyer(fin);
  X.ligne(etat);
  const gratuit = lireLS(CLE_GRATUIT) !== jourDe(maintenant());
  X.choisir(`${nb(fin.score)} points !`, [
    { texte: `Rejouer · ${gratuit ? 'gratuit' : `${PRIX} F`}`, sous: etat, desactive: !gratuit && (VIE.data?.argent ?? 0) < PRIX, f: commencer },
    { texte: 'Voir le classement du jour', sous: detail || 'Le meilleur score du jour de chacun', f: () => montrerClassement() },
  ], { annuler: 'Quitter le stand' });
}
async function montrerClassement() {
  let liste = []; try { liste = await lireJour(jourDe(maintenant())); } catch { X.ligne('Classement indisponible : vérifie ta connexion.'); return; }
  const moi = LOCAL ? 'moi' : (await joueur().catch(() => null))?.uid, rang = liste.findIndex(e => e.uid === moi) + 1;
  X.choisir('Lance-pierre · classement du jour', liste.length ? [
    ...liste.slice(0, 8).map((e, i) => ({ texte: `${i + 1}. ${e.n} · ${nb(e.s)} points`, sous: e.uid === moi ? 'C’est toi !' : '', desactive: true, f: () => {} })),
    ...(rang > 8 ? [{ texte: `${rang}. Toi · ${nb(liste[rang - 1].s)} points`, desactive: true, f: () => {} }] : []),
  ] : [{ texte: 'Personne n’a encore joué aujourd’hui', sous: 'La première place est à prendre', desactive: true, f: () => {} }], { annuler: 'Fermer' });
}

// ---------- L'interface : le compte à rebours, le temps, le score, le vent, le lance-pierre ----------
const UI = { hud: null, svg: null };
function interface_(oui) {
  $('#salonHud')?.classList.toggle('lp-tir', oui);
  if (oui && !UI.hud) {
    UI.hud = document.createElement('div'); UI.hud.className = 'lp-hud'; UI.hud.setAttribute('role', 'status');
    UI.hud.innerHTML = '<div class="lp-haut panel"><b class="lp-temps"></b><b class="lp-score"></b><span class="lp-vent"></span></div><p class="lp-grand"></p><p class="lp-aide">Tire vers l’arrière, vise à l’opposé, lâche.</p>';
    UI.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); UI.svg.setAttribute('class', 'lp-fronde'); UI.svg.setAttribute('aria-hidden', 'true');
    document.querySelector('#app')?.append(UI.hud, UI.svg);
  }
  if (UI.hud) { UI.hud.hidden = !oui; UI.svg.style.display = oui ? '' : 'none'; }
  D.id = null;
}
const ventTexte = w => (w === 0 ? 'Pas de vent' : `Vent ${w > 0 ? '→' : '←'} ${String(Math.abs(w)).replace('.', ',')} m/s`);
function majInterface() {
  if (!P || !UI.hud) return;
  const h = UI.hud, reste = Math.max(0, Math.ceil(DUREE - P.t));
  const txt = (sel, t) => { const el = h.querySelector(sel); if (el.textContent !== t) el.textContent = t; };
  txt('.lp-temps', P.phase === 'decompte' ? `${DUREE} s` : `${reste} s`);
  txt('.lp-score', `${nb(P.score)} pts${P.serie ? ' · ×2' : ''}`);
  txt('.lp-vent', ventTexte(P.vent));
  const grand = P.phase === 'decompte' ? String(Math.max(1, Math.ceil(-P.t))) : P.t < .8 ? 'Tire !' : P.message && P.t - P.message.t < .9 ? P.message.txt : P.t >= DUREE - CHARIOT && P.t < DUREE - CHARIOT + 1.4 ? 'Le chariot !' : '';
  const g = h.querySelector('.lp-grand'); if (g.textContent !== grand) { g.textContent = grand; g.classList.toggle('rate', !!P.message?.rate && grand === P.message.txt); }
  h.querySelector('.lp-aide').hidden = P.tirs > 0 || P.phase !== 'jeu' || D.id !== null;
  h.querySelector('.lp-temps').classList.toggle('fin', P.phase === 'jeu' && reste <= 10);
  // La manche à air.
  const w = P.vent, a = Math.min(1, Math.abs(w) / 4); L.manche.rotation.set(0, w > 0 ? Math.PI : 0, -(1 - a) * 1.25 + Math.sin(performance.now() / 180) * .05 * a);
  dessinerFronde();
}
/** Le lance-pierre en bas de l'écran : la fourche, les deux élastiques et la poche, qui suit le doigt ; et le début de la trajectoire. */
function dessinerFronde() {
  const W = innerWidth, H = innerHeight, s = Math.min(W, H), cx = W / 2, base = H + s * .02;
  const fourche = H - s * .2, ecart = s * .085, haut = H - s * .3;
  const pret = P.phase === 'jeu' && P.recharge <= 0 && !L.caillou?.vivant, tendu = D.id !== null && pret;
  const R = rayon(), dx = D.x - D.x0, dy = D.y - D.y0, k = Math.min(1, R / Math.max(1, Math.hypot(dx, dy)));
  const px = cx + (tendu ? dx * k * .55 : 0), py = haut + s * .015 + (tendu ? dy * k * .55 : 0);
  let points = '';
  if (tendu) { // le début de la trajectoire, sans le vent : un peu moins de la moitié du chemin
    const t = tirDuGeste(), o = bouche(), p = new THREE.Vector3(), v = t.dir.clone().multiplyScalar(t.v);
    for (let i = 1; i <= 9; i++) {
      const tt = i * .028; p.set(o.x + v.x * tt, o.y + v.y * tt - G * tt * tt / 2, o.z + v.z * tt);
      p.x += STAND.x; p.z += STAND.z; p.project(camera);
      points += `<circle cx="${((p.x + 1) / 2 * W).toFixed(1)}" cy="${((1 - p.y) / 2 * H).toFixed(1)}" r="${(5 - i * .3).toFixed(1)}" fill="#fff" fill-opacity="${(.85 - i * .07).toFixed(2)}"/>`;
    }
  }
  const caillou = pret ? `<circle cx="${px}" cy="${py}" r="${s * .022}" fill="#6d6a64" stroke="#3f3c38" stroke-width="2"/>` : '';
  UI.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  UI.svg.innerHTML = `${points}<path d="M${cx} ${base} L${cx} ${fourche} M${cx} ${fourche} Q${cx - ecart * .4} ${fourche - s * .03} ${cx - ecart} ${haut} M${cx} ${fourche} Q${cx + ecart * .4} ${fourche - s * .03} ${cx + ecart} ${haut}" stroke="#7a4f2a" stroke-width="${s * .03}" stroke-linecap="round" fill="none"/>`
    + `<path d="M${cx - ecart} ${haut} L${px} ${py} L${cx + ecart} ${haut}" stroke="#3b2a1e" stroke-width="${tendu ? 4 : 5}" fill="none" stroke-linejoin="round"/>${caillou}`
    + (tendu ? `<text x="${cx}" y="${H - s * .36}" text-anchor="middle" class="lp-force">${Math.round(tirDuGeste().p * 100)} %</text>` : '');
}

// ---------- La caméra pendant la partie (salon.js) ----------
/** L'œil derrière la ligne de tir, le regard sur les étagères ; l'angle laisse voir tout le stand, en hauteur comme en largeur. */
export function cameraTir(controls) {
  camera.position.set(STAND.x + OEIL.x, OEIL.y, STAND.z + OEIL.z);
  controls.target.set(STAND.x + VISE.x, VISE.y, STAND.z + VISE.z);
}
export function fovTir() {
  const d = VISE.z - OEIL.z, v = Math.atan(1.35 / d), h = Math.atan(1.36 / d / camera.aspect); // les étagères font 2,5 m de large
  return THREE.MathUtils.radToDeg(2 * Math.max(v, h)) * 1.06;
}

// ---------- Mise en route ----------
export function initLancePierre(ctx) {
  X = ctx;
  canvas.addEventListener('pointerdown', surAppui, true);
  window.addEventListener('pointermove', surGlisse);
  window.addEventListener('pointerup', surLacher); window.addEventListener('pointercancel', e => { if (e.pointerId === D.id) D.id = null; });
  heureServeur();
  if (import.meta.env.DEV) window.__lp = { L, get P() { return P; }, STAND, commencer, finir, lancer, tirDuGeste, D, ventDu, rangement, montrerClassement, lireJour }; // pour les tests
}
