import * as THREE from 'three';
import { $, coarse, toXZ } from './base.js';
import { PLACES } from './donnees-lieux.js';
import { groupeLieu } from './lieux.js';
import { poserObstacles } from './rue.js';
import { camera, canvas, controls } from './scene.js';
import { MAX_DECOR, reduireImage } from './textures.js';
import { personne } from './discussions.js';
import { AUDIO, son } from './audio.js';
import { firebase, joueur } from './firebase.js';
import { VIE, depenser } from './vie.js';
import { filtrer } from './moderation.js';
import { SAISIE } from './saisie.js';
import { moodCur } from './ambiances.js';
import { CAISSE, DEPART, DUREE, ETAGERES, G, HAUSSE_MAX, LACET_MAX, PAS, SEUIL, Y_BARRE, Y_RAIL, Z_BACHE, Z_ETAGERE, Z_MANGUES, Z_RAIL, creerPartie, debutDe, elan, finDe, forceDu, jourDe, pas, pret, rejouer, tirer } from './lance-pierre-regles.js';

// ---------- Tir au lance-pierre : le stand de la plage de Fidjrossè ----------
// « Le 1 et 2 comme dit » (27/10) : le jeu d'adresse d'une minute, entre deux courses de zém. Un stand de fête foraine sur
// le sable, face à la mer : des boîtes de tomate en pyramide, des bouteilles, des mangues qui se balancent au bout d'une
// ficelle. Points : boîte 10, bouteille 20, mangue 30, la boîte du chariot qui passe (les 15 dernières secondes) 40 ; un
// tir qui touche juste après un autre tir réussi compte double. Le calcul (le vol du caillou, les cibles, les points) est
// dans lance-pierre-regles.js, que le serveur refait.
// Le 28/10, « Tir au lance-pierre — visée, contrôles et instructions » : le doigt cachait la cible, un millimètre changeait
// le coup de plusieurs mètres, le tir partait dès qu'on levait le doigt, sans moyen de l'annuler. Le jeu ne connaît plus
// que quatre actions — viser, tendre, lâcher, annuler — que chaque appareil envoie à sa façon (V, plus bas) :
//   doigt : poser n'importe où dans le bas de l'écran, glisser vers l'arrière (la longueur tend, le côté vise, démultiplié :
//     1 cm de côté ≈ 1,5°), lever pour tirer, revenir au point de départ pour annuler. La visée reste d'un tir à l'autre.
//   manette : stick gauche (et droit, finement) pour viser, gâchette droite plus ou moins enfoncée pour tendre (ou garder
//     A), la relâcher pour tirer ; B annule, Start met en pause.
//   souris et clavier : la souris vise, garder le clic gauche tend, le relâcher tire ; clic droit ou Échap annule, P met en
//     pause. Au clavier seul : les flèches visent, la barre d'espace tend.
// Pendant la visée, la caméra zoome un peu ; on voit le premier tiers de la trajectoire (sans le vent) et une jauge de
// tension, qui vibre à fond. Le vent change à chaque tir : la girouette du haut de l'écran et la manche à air le disent,
// en trois forces. La première fois, un entraînement : trois grosses boîtes proches, le vent seulement au 3e tir.
// Le défi du jour : tout le monde a le même stand et la même suite de vents, tirés du jour du défi de Zém Run (de 20 h la
// veille à 20 h). La première partie du jour est gratuite, les suivantes coûtent 50 F ; on garde la meilleure. Deux
// classements par jour : au doigt, et à la manette ou à la souris, qui visent bien plus finement.
// Firebase (règles dans database.rules.json) :
//   zem_lp_departs/{uid}        { t : heure du serveur au départ, j : jour du défi }, écrit par la page au « Tire ! »
//   zem_lp2/{jour}/{t|m}/{uid}  la meilleure partie du jour au doigt (t) ou à la manette et à la souris (m) : écrite par le
//                               serveur seul (api/lance-pierre.js), qui rejoue les tirs avant de l'inscrire
// (L'ancien classement zem_lp, rempli par la page, reste pour les pages pas encore mises à jour.)
// En développement, ?salon-local (ou ?lp-local) : un classement d'essai dans ce navigateur, rien n'est envoyé.

const LP = PLACES.find(q => q.id === 'fidjrosse'), [FX, FZ] = LP ? toXZ(LP.lat, LP.lon) : [0, 0];
export const STAND = { x: FX + 14, z: FZ + 20 }; // la ligne de tir, à 25 m de l'arrivée « Plage de Fidjrossè »
export const presDuStand = (x, z) => Math.hypot(x - STAND.x, z - STAND.z) < 3.5;
const PRIX = 50, OEIL = new THREE.Vector3(0, 1.6, -.35), VISE = new THREE.Vector3(0, 1.45, 7.3); // le regard un peu bas : l'étagère du bas passe au-dessus du lance-pierre dessiné
const Q = new URLSearchParams(location.search), LOCAL = import.meta.env.DEV && (Q.has('salon-local') || Q.has('lp-local'));
const CLE_GRATUIT = 'kutonu.lp.gratuit', CLE_LOCAL = 'kutonu.lp.local2', CLE_REGLAGES = 'kutonu.lp.reglages', CLE_APPRIS = 'kutonu.lp.appris';
const nb = n => Math.round(n).toLocaleString('fr-FR');
const place = r => r === 1 ? '1re place' : r === 2 ? '2e place' : r === 3 ? '3e place' : `${r}e place`; // en entier : la version anglaise dit 2nd, 3rd
const lireLS = k => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } };
const r5 = x => Math.round(x * 1e5) / 1e5; // les tirs partent au serveur arrondis : il rejoue exactement les mêmes nombres
const borne = (v, m) => THREE.MathUtils.clamp(v, -m, m);

// ---------- Les réglages du joueur ----------
// Sensibilité de la visée, vibration, aide à la trajectoire (normale ou réduite : jamais plus forte, c'est la même pour
// tous), axe vertical inversé (manette, souris), gaucher (la jauge et l'aide passent à gauche). Des numéros, pas des
// mots : la version anglaise traduit les mots, et les réglages passent d'une version à l'autre.
const REGLAGES = { sens: 1, vib: true, aide: 0, inverse: false, gaucher: false };
try { Object.assign(REGLAGES, JSON.parse(lireLS(CLE_REGLAGES) || '{}')); } catch { /* réglages abîmés : ceux d'origine */ }
const SENS = [.65, 1, 1.45], NOMS_SENS = ['basse', 'normale', 'haute'], NOMS_AIDE = ['normale', 'réduite'];
const sens = () => SENS[REGLAGES.sens] ?? 1;

let X = null; // le salon : { S, ligne, choisir }
// Ce qu'on voit du stand : la partie montrée (J, celle qu'on joue ou le stand au repos), ses cibles en 3D, les éclats.
const L = { g: null, J: null, vitrine: null, objets: new Map(), eclats: [], caillou: null, forain: null, manche: null, wagon: null, caisse: null, tableau: null, tableauT: -1e9, decalage: 0, heure: null, zoom: 0, secousse: 0 };
// La partie en cours : phase 'tuto' (l'entraînement), 'bravo', 'decompte' (3, 2, 1), 'jeu' ; null hors partie.
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
  M.eclat = { bouteille: new THREE.MeshBasicMaterial({ color: '#3f8a4c' }), mangue: new THREE.MeshBasicMaterial({ color: '#f2a62a' }), boite: new THREE.MeshBasicMaterial({ color: '#c8302a' }), metal: new THREE.MeshBasicMaterial({ color: '#e6e8ea' }) };
  M.poussiere = { sable: new THREE.MeshBasicMaterial({ color: '#dcc79c' }), bache: new THREE.MeshBasicMaterial({ color: '#d8d3c8' }) };
  M.chariot = new THREE.MeshLambertMaterial({ color: '#2f6fb0' });
  M.manche = [new THREE.MeshLambertMaterial({ color: '#f07a1a', side: THREE.DoubleSide }), new THREE.MeshLambertMaterial({ color: '#f6f1e7', side: THREE.DoubleSide })];
  M.geo = {
    boite: new THREE.CylinderGeometry(.07, .07, .15, 16).translate(0, .075, 0),
    grosse: new THREE.CylinderGeometry(.14, .14, .3, 20).translate(0, .15, 0), // les boîtes de l'entraînement
    // La bouteille, tournée : le cul, le corps, l'épaule, le goulot.
    bouteille: new THREE.LatheGeometry([[0, 0], [.04, 0], [.042, .01], [.042, .17], [.03, .21], [.014, .24], [.014, .28], [0, .28]].map(([x, y]) => new THREE.Vector2(x, y)), 16),
    mangue: new THREE.SphereGeometry(.065, 16, 12).scale(.95, 1.18, .85),
    queue: new THREE.CylinderGeometry(.006, .008, .04, 5).translate(0, .095, 0),
    caillou: new THREE.IcosahedronGeometry(.03, 1),
    eclat: new THREE.TetrahedronGeometry(.025),
    poussiere: new THREE.IcosahedronGeometry(.05, 0),
  };
  // La nuit (après 19 h 30 au Bénin), le stand s'éclaire comme une fête foraine : ses matières brillent d'elles-mêmes, un
  // peu (une vraie lampe de plus ferait recalculer l'éclairage de toute la ville).
  M.lumineux = [M.bois, M.boisClair, M.metal, M.bache, M.toit, M.etiquette, ...M.verts, M.mangue, M.queue, M.chariot];
  for (const m of M.lumineux) { if (m.map) { m.emissive.set('#ffffff'); m.emissiveMap = m.map; } else m.emissive.copy(m.color); m.emissiveIntensity = 0; }
  M.lueur = 0;
  return M;
}

// ---------- Le stand ----------
/** Le stand, posé sur le sable une fois pour toutes (main.js), avec les cibles du jour au repos. */
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
  // Une guirlande d'ampoules sous l'enseigne.
  const ampoule = new THREE.SphereGeometry(.035, 8, 6), jaune = new THREE.MeshBasicMaterial({ color: '#ffe9a8' });
  for (let i = 0; i < 13; i++) { const o = new THREE.Mesh(ampoule, jaune); o.position.set(-1.5 + i * .25, 2.53 - Math.sin(i / 12 * Math.PI) * .05, 6.46); g.add(o); }
  // Trois étagères, et leurs montants.
  for (const y of ETAGERES) box(2.5, .04, .34, M.boisClair, 0, y - .02, Z_ETAGERE);
  for (const x of [-1.27, 1.27]) box(.05, 2.0, .3, M.bois, x, 1.0, Z_ETAGERE);
  // La barre des mangues, et le rail du chariot, devant l'étagère du bas.
  const barre = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 2.9, 8).rotateZ(Math.PI / 2), M.bois); barre.position.set(0, Y_BARRE, Z_MANGUES); g.add(barre);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, 2.6, 6).rotateZ(Math.PI / 2), M.metal); rail.position.set(0, Y_RAIL, Z_RAIL); g.add(rail);
  for (const x of [-1.3, 1.3]) box(.04, Y_RAIL, .04, M.bois, x, Y_RAIL / 2, Z_RAIL);
  L.wagon = box(.24, .06, .16, M.chariot, 0, Y_RAIL + .03, Z_RAIL); L.wagon.visible = false;
  // La table de l'entraînement, à 3 m : un plateau sur deux pieds, qu'on ne voit que la première fois.
  L.caisse = new THREE.Group(); g.add(L.caisse); L.caisse.visible = false;
  for (const [w, h, x, y] of [[CAISSE.l, .06, 0, CAISSE.y - .03], [.07, CAISSE.y - .06, -CAISSE.l / 2 + .1, (CAISSE.y - .06) / 2], [.07, CAISSE.y - .06, CAISSE.l / 2 - .1, (CAISSE.y - .06) / 2]]) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, w > 1 ? CAISSE.p : .07), M.boisClair); o.position.set(x, y, CAISSE.z); o.castShadow = true; L.caisse.add(o);
  }
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
  L.tableau = { cv, tex, listes: { t: null, m: null }, a: 't', bascule: 0 };
  dessinerTableau();
  // Solide : le comptoir, la bâche et ses poteaux, le mât, le panneau. [x, z, angle, longueur, épaisseur] (rue.js).
  const { x, z } = STAND;
  poserObstacles('lancepierre', [[x, z + .8, 0, 2.7, .5], [x, z + 7.25, 0, 3.2, 1.6], [x + 1.85, z + 6.2, 0, .2, .2], [x - 2.6, z + 2.6, 0, 1.2, .5], [x - 1.5, z + 3.75, Math.PI / 2, 5.5, .15], [x + 1.5, z + 3.75, Math.PI / 2, 5.5, .15]]);
  L.vitrine = creerPartie(jourDe(Date.now()), { vitrine: true }); afficher(L.vitrine);
  return g;
}
/** Le panneau du classement : les cinq meilleurs du jour, au doigt puis à la manette et à la souris, à tour de rôle. */
function dessinerTableau() {
  const T = L.tableau; if (!T) return;
  const c = T.cv.getContext('2d'), w = 512;
  c.fillStyle = '#17324f'; c.fillRect(0, 0, w, w); c.fillStyle = '#f5c518'; c.fillRect(0, 0, w, 118);
  c.fillStyle = '#17130c'; c.textAlign = 'center'; c.font = '900 46px Impact, "Arial Black", sans-serif'; c.fillText('MEILLEURS DU JOUR', w / 2, 58);
  c.font = '800 26px system-ui, sans-serif'; c.fillText(T.a === 't' ? 'AU DOIGT' : 'MANETTE · SOURIS', w / 2, 98);
  c.textAlign = 'left'; c.font = '700 34px system-ui, sans-serif';
  const l = T.listes[T.a];
  if (!l) { c.fillStyle = '#c9d6e3'; c.fillText('…', 40, 186); }
  else if (!l.length) { c.fillStyle = '#f3efe6'; c.font = '700 32px system-ui, sans-serif'; c.fillText('Personne encore.', 40, 186); c.fillText('À toi de jouer !', 40, 236); }
  else l.slice(0, 5).forEach((e, i) => {
    const y = 180 + i * 70; c.fillStyle = i === 0 ? '#f5c518' : '#f3efe6';
    c.fillText(`${i + 1}. ${String(e.n).slice(0, 12)}`, 34, y); c.textAlign = 'right'; c.fillText(nb(e.s), w - 34, y); c.textAlign = 'left';
  });
  T.tex.needsUpdate = true;
}

// ---------- Les cibles à l'écran ----------
/** Montre une partie (ou le stand au repos) : ses cibles debout, en 3D. */
function afficher(J) {
  for (const O of L.objets.values()) { L.g.remove(O.o); if (O.fil) L.g.remove(O.fil); }
  L.objets.clear(); L.J = J; J.evts.length = 0;
  for (const C of J.cibles) if (C.etat === 'debout') poser(C, false);
}
/** Une cible de la partie devient un objet : elle apparaît en grandissant, comme posée vite par le forain. */
function poser(C, pop = true) {
  const m = matieres(); let o;
  if (C.type === 'boite' || C.type === 'chariot' || C.type === 'grosse') o = new THREE.Mesh(C.type === 'grosse' ? m.geo.grosse : m.geo.boite, [m.etiquette, m.metal, m.metal]);
  else if (C.type === 'bouteille') o = new THREE.Mesh(m.geo.bouteille, m.verts[C.id % 2]);
  else { o = new THREE.Mesh(m.geo.mangue, m.mangue); o.add(new THREE.Mesh(m.geo.queue, m.queue)); }
  o.castShadow = true; o.position.set(C.x, C.y, C.z); L.g.add(o);
  const O = { o, C, fil: null, chute: null, pop: pop ? 0 : 1 }; if (pop) o.scale.setScalar(.01);
  if (C.balance) { // la ficelle bouge à chaque image : son tableau de sommets doit rester (memoire.js rend ceux qui ne bougent pas)
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    O.fil = new THREE.Line(geo, m.ficelle); O.fil.frustumCulled = false; L.g.add(O.fil);
  }
  L.objets.set(C.id, O);
}
function oter(C) { const O = L.objets.get(C.id); if (!O) return; L.g.remove(O.o); if (O.fil) L.g.remove(O.fil); L.objets.delete(C.id); }
/** Ce que la partie vient de faire (lance-pierre-regles.js) : les cibles posées, tombées, éclatées ; les sons, les éclats. */
function traiterEvts(J) {
  const jeu = !!P && J === P.J, t = performance.now();
  for (const e of J.evts) {
    if (e.e === 'pose') poser(e.C);
    else if (e.e === 'retire' || e.e === 'parti') oter(e.C);
    else if (e.e === 'touche') { // elle tombe, roule et disparaît dans le sable (l'allure de la chute n'est qu'à l'écran)
      const O = L.objets.get(e.C.id); if (O) O.chute = { v: new THREE.Vector3(e.v.x * .12 + (Math.random() - .5) * .6, 1 + Math.random() * .8, Math.max(.6, e.v.z * .1)), w: new THREE.Vector3((Math.random() + .5) * 6, 0, (Math.random() - .5) * 8) };
      son('boite'); if (jeu) { eclater(e.C, 'metal', 4); points(e.C, e.pts); }
    } else if (e.e === 'eclat') { oter(e.C); eclater(e.C, e.C.type, 9); son(e.C.type === 'bouteille' ? 'verre' : 'mangue'); if (jeu) points(e.C, e.pts); }
    else if (e.e === 'tir') { son('fronde'); L.secousse = .16; vibrer(.45, 45); }
    else if (e.e === 'impact') { if (e.ou === 'bache' || e.ou === 'planche') son('bache'); if (e.ou !== 'loin') poussiere(e.p, e.ou === 'sable'); }
    else if (e.e === 'coup' && jeu) P.message = { t, txt: J.tuto ? 'Touché !' : `+${e.points + e.bonus}${e.bonus ? ' · ×2 !' : ''}` };
    else if (e.e === 'rate' && jeu) P.message = { t, txt: 'Raté', petit: true };
    else if (e.e === 'chariot' && jeu) { X.ligne('Le chariot passe : 40 points la boîte !'); P.message = { t, txt: 'Le chariot !' }; }
  }
  J.evts.length = 0;
}
/** Les objets suivent la partie : les mangues au bout de leur ficelle, le chariot ; ceux qui tombent tombent. */
function animerObjets(dt) {
  const J = L.J; if (!J) return;
  for (const O of L.objets.values()) {
    const C = O.C, o = O.o;
    if (O.pop < 1) { O.pop = Math.min(1, O.pop + dt * 5); o.scale.setScalar(Math.max(.01, O.pop)); }
    if (O.chute) {
      const c = O.chute; c.v.y -= G * dt; o.position.addScaledVector(c.v, dt); o.rotation.x += c.w.x * dt; o.rotation.z += c.w.z * dt;
      if (o.position.y <= .04) { o.position.y = .04; c.v.multiplyScalar(.3); c.v.y = Math.abs(c.v.y) * .2; }
      continue;
    }
    if (C.balance) {
      o.position.set(C.x, C.y, C.z); o.rotation.z = C.rot;
      const pos = O.fil.geometry.attributes.position; pos.setXYZ(0, C.balance.x, Y_BARRE, C.z); pos.setXYZ(1, C.x, C.y + .07, C.z); pos.needsUpdate = true;
    } else if (C.type === 'chariot') o.position.x = C.x;
  }
  L.wagon.visible = J.chariot; if (J.chariot) L.wagon.position.x = Math.sin(J.t * 1.1) * 1.05;
  L.caisse.visible = J.tuto;
  const lueur = Math.min(.6, (moodCur.night || 0) * .6); if (Math.abs(lueur - M.lueur) > .01) { M.lueur = lueur; for (const m of M.lumineux) m.emissiveIntensity = lueur; }
  const w = J.vent, a = Math.min(1, Math.abs(w) / 4); L.manche.rotation.set(0, w > 0 ? Math.PI : 0, -(1 - a) * 1.25 + Math.sin(performance.now() / 180) * .05 * a);
  const c = J.caillou;
  if (c) { L.caillou ??= (() => { const o = new THREE.Mesh(M.geo.caillou, M.caillou); L.g.add(o); return o; })(); L.caillou.visible = true; L.caillou.position.set(c.p.x, c.p.y, c.p.z); }
  else if (L.caillou) L.caillou.visible = false;
}
function eclater(C, sorte, n) {
  const m = matieres(), mat = m.eclat[sorte] || m.eclat.boite;
  for (let i = 0; i < n; i++) {
    const o = new THREE.Mesh(m.geo.eclat, mat); o.position.set(C.x, C.y + (C.h || .08) * .6, C.z); L.g.add(o);
    L.eclats.push({ o, v: new THREE.Vector3((Math.random() - .5) * 3, 1 + Math.random() * 2.5, (Math.random() - .3) * 2.5), t: 0 });
  }
}
/** Un caillou qui finit dans le sable ou la bâche : un petit nuage, sans bruit agressif. */
function poussiere(p, sable) {
  const m = matieres();
  for (let i = 0; i < 7; i++) {
    const o = new THREE.Mesh(m.geo.poussiere, sable ? m.poussiere.sable : m.poussiere.bache), a = i / 7 * Math.PI * 2;
    o.position.set(p.x, Math.max(.04, p.y), Math.min(p.z, Z_BACHE - .06)); o.scale.setScalar(.4); L.g.add(o);
    L.eclats.push({ o, v: new THREE.Vector3(Math.cos(a) * .7, .35 + Math.random() * .4, Math.sin(a) * .35 - (sable ? 0 : .3)), t: 0, nuage: true });
  }
}
function majEclats(dt) {
  L.eclats = L.eclats.filter(e => {
    e.t += dt;
    if (e.nuage) { e.v.multiplyScalar(Math.exp(-dt * 3)); e.o.position.addScaledVector(e.v, dt); e.o.scale.setScalar(Math.max(.01, (.4 + e.t * 1.6) * (1 - e.t / .7))); }
    else { e.v.y -= G * dt; e.o.position.addScaledVector(e.v, dt); e.o.rotation.x += dt * 9; if (e.o.position.y < .02) { e.o.position.y = .02; e.v.set(0, 0, 0); } }
    if (e.t > (e.nuage ? .7 : 1.6)) { L.g.remove(e.o); return false; } return true;
  });
}
/** Les points qui sautent au-dessus d'une cible touchée. */
function points(C, pts) {
  if (!(pts > 0) || !UI.hud) return;
  const p = new THREE.Vector3(C.x + STAND.x, C.y + (C.h || .1) + .05, C.z + STAND.z).project(camera);
  if (p.z > 1) return;
  const b = document.createElement('b'); b.className = 'lp-pts'; b.textContent = `+${pts}`;
  b.style.left = `${((p.x + 1) / 2 * 100).toFixed(1)}%`; b.style.top = `${((1 - p.y) / 2 * 100).toFixed(1)}%`;
  UI.hud.append(b); setTimeout(() => b.remove(), 950);
}
/** Le téléphone (Android) ou la manette vibre, si le joueur l'a laissé ; force de 0 à 1. */
function vibrer(force, ms = 30) {
  if (!REGLAGES.vib) return;
  if (V.par === 'manette') document.dispatchEvent(new CustomEvent('vibrer', { detail: [force * .6, force * .3, ms] }));
  else if (V.par === 'toucher') navigator.vibrate?.(ms);
}

// ---------- La partie ----------
export const tirEnCours = () => !!P;
/** Les boutons du stand (salon.js), à côté de la ligne de tir. Pendant la partie, rien : la pause est en haut de l'écran. */
export function actionsLancePierre(S, T) {
  if (P) return [];
  if (T.mode !== 'pied' || S.lieu || !L.g || !presDuStand(S.x, S.z)) return [];
  const gratuit = lireLS(CLE_GRATUIT) !== jourDe(maintenant());
  return [
    { texte: `Jouer au lance-pierre · ${gratuit ? 'gratuit aujourd’hui' : `${PRIX} F`}`, f: commencer },
    { texte: 'Classement du lance-pierre', f: () => montrerClassement() },
    { texte: 'Réglages du lance-pierre', f: () => reglages() },
  ];
}
async function commencer() {
  if (P) return;
  const j = jourDe(maintenant()), gratuit = lireLS(CLE_GRATUIT) !== j;
  if (!gratuit && !(await depenser(PRIX, 'une partie de lance-pierre'))) { X.ligne(`Il te faut ${PRIX} F pour une partie de lance-pierre.`); return; }
  if (gratuit) ecrireLS(CLE_GRATUIT, j);
  const S = X.S; S.x = STAND.x; S.z = STAND.z; S.cap = 0; S.geste = 'idle'; S.saut = true;
  P = { j, phase: 'tuto', t: 0, pause: false, J: null, appareils: new Set(), depart: null, message: null };
  Object.assign(V, { lacet: 0, hausse: 0, p: 0, tendu: false, derniere: .5, vu: V.vu || (SAISIE.manette ? 'manette' : coarse ? 'toucher' : 'souris') });
  if (lireLS(CLE_APPRIS)) decompte();
  else { P.J = creerPartie(j, { tuto: true }); afficher(P.J); } // la première fois : l'entraînement
  interface_(true); son('arret');
}
/** 3, 2, 1… la vraie partie, sur le stand du jour. */
function decompte() {
  Object.assign(P, { phase: 'decompte', t: -3, J: creerPartie(P.j), message: null }); P.appareils.clear();
  afficher(P.J); Object.assign(V, { tendu: false, p: 0, lacet: 0, hausse: 0 }); D.id = null; // la vraie partie repart visée au centre
}
/** L'heure du serveur, et le départ noté par lui (le serveur compare la fin de partie à ce départ). */
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
  const fin = P; P = null; interface_(false); L.zoom = 0;
  if (L.polaire !== undefined) { controls.maxPolarAngle = L.polaire; L.polaire = undefined; }
  if (fin.pause && !$('#choix')?.hidden) $('#choix').hidden = true; // le menu de pause, s'il est resté ouvert
  L.vitrine = creerPartie(jourDe(maintenant()), { vitrine: true }); afficher(L.vitrine);
  X.S.saut = true;
  if (abandon || fin.phase !== 'jeu') { X.ligne(fin.phase === 'tuto' ? 'Entraînement arrêté.' : 'Partie de lance-pierre arrêtée.'); return; }
  son('arret');
  bilan(fin);
}

// ---------- La pause et les réglages ----------
function mettrePause(oui) {
  if (!P || P.pause === oui) return;
  P.pause = oui; V.tendu = false; V.p = 0; D.id = null; MA.parRT = false; CLAV.clear();
  if (oui) menuPause();
}
function menuPause() {
  if (!P) return;
  X.choisir('Pause', [
    { texte: 'Reprendre', f: () => mettrePause(false) },
    { texte: 'Réglages', sous: 'Sensibilité, vibration, gaucher…', f: () => reglages(true) },
    { texte: 'Arrêter la partie', sous: P.phase === 'jeu' ? 'Elle ne comptera pas' : '', f: () => finir(true) },
  ], { annuler: 'Reprendre', puis: () => mettrePause(false) });
}
function reglages(depuisPause = false) {
  const R = REGLAGES, oui = v => (v ? 'oui' : 'non'), encore = () => reglages(depuisPause);
  const changer = (k, v) => { R[k] = v; ecrireLS(CLE_REGLAGES, JSON.stringify(R)); encore(); };
  X.choisir('Réglages du lance-pierre', [
    { texte: `Sensibilité de la visée : ${NOMS_SENS[R.sens] ?? NOMS_SENS[1]}`, sous: 'Basse, normale ou haute', f: () => changer('sens', ((R.sens ?? 1) + 1) % 3) },
    { texte: `Vibration : ${R.vib ? 'activée' : 'coupée'}`, sous: 'Téléphone et manette', f: () => changer('vib', !R.vib) },
    { texte: `Son : ${AUDIO.muet ? 'coupé' : 'activé'}`, sous: 'Le son de tout le jeu', f: () => { AUDIO.muet = !AUDIO.muet; $('#jhSon')?.setAttribute('aria-pressed', String(!AUDIO.muet)); encore(); } },
    { texte: `Aide à la trajectoire : ${NOMS_AIDE[R.aide] ?? NOMS_AIDE[0]}`, sous: 'Réduite : on voit moins loin le chemin du caillou', f: () => changer('aide', R.aide ? 0 : 1) },
    { texte: `Inverser l’axe vertical : ${oui(R.inverse)}`, sous: 'À la manette et à la souris', f: () => changer('inverse', !R.inverse) },
    { texte: `Gaucher : ${oui(R.gaucher)}`, sous: 'La jauge et l’aide passent à gauche', f: () => changer('gaucher', !R.gaucher) },
    ...(depuisPause ? [] : [{ texte: 'Revoir l’entraînement', sous: 'À ta prochaine partie', f: () => { ecrireLS(CLE_APPRIS, ''); X.ligne('L’entraînement reviendra à ta prochaine partie.'); } }]),
  ], { annuler: depuisPause ? 'Retour' : 'Fermer', puis: depuisPause ? menuPause : null });
}

// ---------- Les quatre actions : viser, tendre, lâcher, annuler ----------
// Chaque appareil les envoie à sa façon (le doigt, la manette, la souris et le clavier, plus bas) ; la partie ne regarde
// que V. La visée (lacet, hausse) reste d'un tir à l'autre ; la tension repart de zéro à chaque fois.
// `par` : l'appareil de la tension en cours ; `vu` : le dernier qui a servi (pour les aides et la visée pâle).
const V = { lacet: 0, hausse: 0, p: 0, tendu: false, par: '', vu: '', pMax: 0, plein: false, palier: 0, ronron: 0, derniere: .5, debut: 0 };
const TEMPS_TENSION = 1.1; // secondes pour tendre à fond en gardant un bouton (A, clic, espace) : à l'horloge, pas aux images
const jouable = () => !!P && !P.pause && (P.phase === 'jeu' || P.phase === 'tuto');
function tendre(par) {
  if (!jouable() || V.tendu) return false;
  Object.assign(V, { tendu: true, par, vu: par, p: 0, pMax: 0, plein: false, palier: 0, ronron: 0, debut: performance.now() });
  son('elastique'); return true;
}
function poserTension(p) {
  V.p = THREE.MathUtils.clamp(p, 0, 1); V.pMax = Math.max(V.pMax, V.p);
  // Au doigt, une petite vibration par tiers ; à fond, une plus franche, et la jauge s'allume : on vise sans la regarder.
  const palier = Math.floor(V.p * 3); if (palier > V.palier && palier < 3) vibrer(.25, 12); V.palier = palier;
  if (V.p >= .97 && !V.plein) { V.plein = true; son('tendu'); vibrer(1, 40); } else if (V.p < .9) V.plein = false;
}
const annonce = txt => { if (P) P.message = { t: performance.now(), txt, petit: true }; };
function lacher() {
  if (!V.tendu) return;
  V.tendu = false;
  const tir = { lacet: r5(V.lacet), hausse: r5(V.hausse), p: r5(V.p) }; V.p = 0;
  if (tir.p < SEUIL) { if (V.pMax >= SEUIL) annonce('Tir annulé'); return; }
  if (!jouable() || !tirer(P.J, tir)) { annonce('Attends le caillou…'); return; }
  P.appareils.add(V.par); V.derniere = tir.p;
}
function annuler() {
  if (!V.tendu) return false;
  if (V.par === 'manette') MA.relacher = true; // la gâchette encore enfoncée ne retend pas aussitôt
  V.tendu = false; V.p = 0; MA.parRT = false; D.id = null; annonce('Tir annulé'); return true;
}

// ---------- Au doigt : poser, glisser vers l'arrière, lever ----------
// Le doigt ne touche plus le lance-pierre : c'est le déplacement depuis son point de départ qui compte, n'importe où dans
// le bas de l'écran. Démultiplié : 1 cm de côté tourne la visée de 1,5° (sensibilité normale), et un geste lent compte
// moins qu'un geste vif (on approche vite, on ajuste doucement). En levant le doigt, il glisse toujours un peu : on garde
// la position d'il y a 60 ms. Revenir à moins de 5 mm du départ détend l'élastique : lever là, c'est annuler.
const PX_CM = coarse ? 56 : 38, DEG_CM = 1.5 * Math.PI / 180, ANNULE_CM = .5;
const D = { id: null, x0: 0, y0: 0, x: 0, y: 0, t: 0, ax: 0, ay: 0, lacet0: 0, retour: true, hist: [] };
const tirage = () => Math.min(5 * PX_CM, .42 * innerHeight) / sens(); // la longueur à tirer pour tendre à fond (px)
const gain = v => .4 + .6 * THREE.MathUtils.smoothstep(v, 1.5, 8); // v : vitesse du doigt, en cm/s
function viserAuDoigt() {
  V.lacet = borne(D.lacet0 - D.ax / PX_CM * DEG_CM * sens(), LACET_MAX);
  poserTension(D.retour ? 0 : D.ay / tirage());
}
function surAppui(e) {
  if (!P || P.pause || P.phase === 'bravo') return;
  if (e.pointerType === 'mouse') {
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.button === 0) tendre('souris'); else if (e.button === 2) annuler();
    return;
  }
  if (D.id !== null || e.clientY < innerHeight * .3) return; // le haut de l'écran : le temps, le score, la pause
  e.stopImmediatePropagation(); e.preventDefault();
  V.vu = 'toucher';
  if (!tendre('toucher')) return;
  Object.assign(D, { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: e.timeStamp, ax: 0, ay: 0, lacet0: V.lacet, retour: true, hist: [] });
  try { canvas.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
}
function surGlisse(e) {
  // Le clic droit pendant qu'on garde le gauche n'est pas un nouvel appui pour le navigateur : un mouvement, bouton 2.
  if (e.pointerType === 'mouse') { if (P && !P.pause) { if (e.button === 2) annuler(); else viserSouris(e); } return; }
  if (e.pointerId !== D.id) return;
  const dx = e.clientX - D.x, dy = e.clientY - D.y, dt = Math.max(1, e.timeStamp - D.t) / 1000, g = gain(Math.hypot(dx, dy) / PX_CM / dt);
  D.x = e.clientX; D.y = e.clientY; D.t = e.timeStamp;
  const retour = Math.hypot(D.x - D.x0, D.y - D.y0) < ANNULE_CM * PX_CM;
  if (retour) { D.ax = 0; D.ay = 0; } else { D.ax += dx * g; D.ay += dy * g; } // revenu au départ : on repart de zéro
  D.retour = retour;
  D.hist.push({ t: e.timeStamp, ax: D.ax, ay: D.ay, retour }); if (D.hist.length > 20) D.hist.shift();
  viserAuDoigt();
}
function surLacher(e) {
  if (e.pointerType === 'mouse') { if (e.button === 0 && V.tendu && V.par === 'souris') lacher(); return; }
  if (e.pointerId !== D.id) return;
  D.id = null;
  const h = D.hist.findLast(x => e.timeStamp - x.t >= 60);
  if (h) Object.assign(D, { ax: h.ax, ay: h.ay, retour: h.retour });
  viserAuDoigt();
  if (D.retour) { V.tendu = false; V.p = 0; if (V.pMax >= SEUIL) annonce('Tir annulé'); } else lacher();
}

// ---------- À la souris (elle vise, le clic gauche tend) et au clavier (les flèches visent, l'espace tend) ----------
const K_SOURIS = .0011; // radians par pixel, sensibilité normale
function viserSouris(e) {
  if (!e.movementX && !e.movementY) return;
  V.lacet = borne(V.lacet + e.movementX * K_SOURIS * sens(), LACET_MAX);
  V.hausse = borne(V.hausse - e.movementY * K_SOURIS * sens() * (REGLAGES.inverse ? -1 : 1), HAUSSE_MAX);
  if (!V.tendu) V.vu = 'souris';
}
const CLAV = new Set(), FLECHES = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const stop = e => { e.preventDefault(); e.stopImmediatePropagation(); };
function surTouche(e) { // capté avant le salon, où Échap ouvre le menu
  if (!P || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.key === 'Escape') {
    if (P.pause) { if (!$('#choix').hidden) $('#chAnnuler').click(); } // le menu de pause (ou les réglages) se ferme
    else if (!annuler()) mettrePause(true);
    stop(e); return;
  }
  if (P.pause) return; // le menu de pause a la main
  if (e.code === 'KeyP') { if (!e.repeat) mettrePause(true); stop(e); }
  else if (e.code === 'Space') { if (!e.repeat) { V.vu = 'clavier'; tendre('clavier'); } stop(e); }
  else if (FLECHES.includes(e.code)) { CLAV.add(e.code); V.vu = 'clavier'; stop(e); }
}
function surRelache(e) {
  CLAV.delete(e.code);
  if (P && e.code === 'Space') { if (V.tendu && V.par === 'clavier') lacher(); stop(e); }
}

// ---------- À la manette ----------
// Stick gauche (ou croix) pour viser, droit pour viser finement ; la zone morte (manette.js) et un lissage, sinon la
// visée tremble. La gâchette droite, plus ou moins enfoncée, tend d'autant ; la relâcher tire, avec la tension d'il y a
// un instant (une gâchette qu'on lâche repasse par toutes les valeurs). Une gâchette sans course (0 ou 1) et le bouton A
// tendent avec le temps, comme le clic. B annule, Start met en pause.
const MA = { lx: 0, ly: 0, rx: 0, ry: 0, analogique: false, parRT: false, hist: [], relacher: false };
/** Appelé par manette.js à chaque image de la partie. */
export function manetteLancePierre({ dt, lx, ly, rx, ry, rt, a, aAppui, b, start }) {
  if (!P) return;
  if (start) { mettrePause(true); return; }
  if (P.pause) return;
  const k = 1 - Math.exp(-dt / .06), c = v => v * Math.abs(v), s = sens(), inv = REGLAGES.inverse ? -1 : 1;
  MA.lx += (lx - MA.lx) * k; MA.ly += (ly - MA.ly) * k; MA.rx += (rx - MA.rx) * k; MA.ry += (ry - MA.ry) * k;
  V.lacet = borne(V.lacet + (c(MA.lx) * .5 + c(MA.rx) * .12) * s * dt, LACET_MAX);
  V.hausse = borne(V.hausse - (c(MA.ly) * .22 + c(MA.ry) * .055) * s * inv * dt, HAUSSE_MAX);
  if (lx || ly || rx || ry || rt > .05 || a) V.vu = 'manette';
  if (b) { annuler(); return; }
  if (rt > .04 && rt < .96) MA.analogique = true;
  if (MA.relacher) { if (rt > .05 || a) return; MA.relacher = false; } // après B, on relâche avant de retendre
  const t = performance.now();
  if (MA.analogique && (MA.parRT || !V.tendu)) {
    if (rt > .05) {
      if (!V.tendu) { if (!tendre('manette')) return; MA.parRT = true; MA.hist = []; }
      poserTension((rt - .05) / .9); MA.hist.push([t, V.p]); while (MA.hist.length && t - MA.hist[0][0] > 150) MA.hist.shift();
      return;
    }
    if (V.tendu && MA.parRT) { // la tension d'avant le relâchement : 110 ms, ou les trois dernières images si elles sont lentes
      const recents = MA.hist.filter(([u]) => t - u <= 110); V.p = Math.max(V.p, ...(recents.length >= 3 ? recents : MA.hist.slice(-3)).map(h => h[1]));
      MA.parRT = false; lacher(); return;
    }
  }
  // A, ou une gâchette sans course : la tension monte avec le temps (majLancePierre). Un nouvel appui : le A qui a lancé
  // la partie ne tend rien.
  const tient = a || (!MA.analogique && rt > .5);
  if ((aAppui || (!MA.analogique && rt > .5)) && !V.tendu) { if (tendre('manette')) MA.parRT = false; }
  else if (!tient && V.tendu && V.par === 'manette' && !MA.parRT) lacher();
}

// ---------- À chaque image ----------
/** Avance une partie par pas fixes de 1/240 s (lance-pierre-regles.js) : le temps de l'image, découpé. */
function avancer(J, dt) {
  J.acc = (J.acc || 0) + Math.min(dt, .1);
  while (J.acc >= PAS) { pas(J); J.acc -= PAS; }
  if (J === L.J) traiterEvts(J);
}
/** Fait vivre le stand (mangues, forain, panneau) et la partie. Appelé par le salon à chaque image. */
export function majLancePierre(dt, S) {
  if (!L.g) return;
  const proche = Math.hypot(S.x - STAND.x, S.z - STAND.z) < 120;
  if (!P && proche) {
    if (L.vitrine.j !== jourDe(maintenant())) { L.vitrine = creerPartie(jourDe(maintenant()), { vitrine: true }); afficher(L.vitrine); } // 20 h : le stand du nouveau jour
    avancer(L.vitrine, dt); majForain(); majTableau();
  }
  if (proche || P) { animerObjets(dt); majEclats(dt); }
  if (!P) return;
  if (Math.hypot(S.x - STAND.x, S.z - STAND.z) > 3) { finir(true); return; } // parti autrement (téléporté, menu « Aller »)
  L.zoom += ((V.tendu && jouable() ? 1 : 0) - L.zoom) * Math.min(1, dt * 6); L.secousse = Math.max(0, L.secousse - dt);
  if (!P.pause) {
    // Les tensions au temps (clic, espace, A), la visée aux flèches, les vibrations pendant qu'on tend.
    if (V.tendu && (V.par === 'souris' || V.par === 'clavier' || (V.par === 'manette' && !MA.parRT))) poserTension((performance.now() - V.debut) / 1000 / TEMPS_TENSION);
    if (CLAV.size) {
      const h = Number(CLAV.has('ArrowRight')) - Number(CLAV.has('ArrowLeft')), v = Number(CLAV.has('ArrowUp')) - Number(CLAV.has('ArrowDown'));
      V.lacet = borne(V.lacet + h * .3 * sens() * dt, LACET_MAX); V.hausse = borne(V.hausse + v * .15 * sens() * (REGLAGES.inverse ? -1 : 1) * dt, HAUSSE_MAX);
    }
    if (V.tendu && V.par === 'manette' && (V.ronron -= dt) <= 0) { V.ronron = .12; vibrer(.12 + V.p * .4, 110); }
    if (P.phase === 'decompte') {
      P.t += dt; const n = Math.ceil(-P.t); if (n !== P.affiche) { P.affiche = n; if (n > 0) son('piece'); }
      if (P.t >= 0) { P.phase = 'jeu'; P.t = 0; P.depart = depart(P.j); son('arret'); }
    } else if (P.phase === 'bravo') { if ((P.t += dt) > 1.8) decompte(); }
    else if (P.phase === 'tuto' || P.phase === 'jeu') {
      avancer(P.J, dt);
      if (P.J.fin && P.phase === 'tuto') { ecrireLS(CLE_APPRIS, '1'); P.phase = 'bravo'; P.t = 0; P.message = { t: performance.now(), txt: 'Bravo ! À toi la vraie partie.' }; son('piece'); }
      else if (P.J.fin) { finir(); return; }
    }
  }
  majInterface();
}

// ---------- Le forain et le panneau ----------
function majForain() {
  if (L.forain) return;
  const f = personne(4242, { femme: false }); f.position.set(2.15, 0, 7.1); f.rotation.y = Math.PI; L.g.add(f); f.userData.jouer?.('idle'); L.forain = f;
}
async function majTableau() {
  const T = L.tableau, now = performance.now();
  if (now - T.bascule > 12000) { T.bascule = now; T.a = T.a === 't' ? 'm' : 't'; dessinerTableau(); }
  if (now - L.tableauT < 30000) return; L.tableauT = now;
  try { const j = jourDe(maintenant()); [T.listes.t, T.listes.m] = await Promise.all([lireJour(j, 't'), lireJour(j, 'm')]); dessinerTableau(); } catch { /* hors ligne : le panneau garde ce qu'il avait */ }
}

// ---------- Les scores ----------
// Deux classements : au doigt (t), à la manette et à la souris (m). Une partie compte à la manette dès qu'un de ses tirs
// n'est pas parti du doigt.
const NOMS_CLASSEMENT = { t: 'au doigt', m: 'manette et souris' };
const monClassement = () => ((V.vu && V.vu !== 'toucher') || (!V.vu && !coarse) ? 'm' : 't');
async function lireJour(j, a) {
  if (LOCAL) { try { return (JSON.parse(lireLS(CLE_LOCAL) || '{}')[j]?.[a] || []).sort((x, y) => y.s - x.s); } catch { return []; } }
  await heureServeur();
  const { d, db } = await firebase(); await joueur();
  const snap = await d.get(d.query(d.ref(db, `zem_lp2/${j}/${a}`), d.orderByChild('s'), d.limitToLast(100)));
  const debut = debutDe(j), fin = finDe(j), liste = [];
  snap.forEach(e => { const v = e.val(); if (v && v.dep >= debut && v.dep < fin) liste.push({ uid: e.key, ...v, n: filtrer(v.n) }); });
  return liste.sort((x, y) => y.s - x.s || x.t - y.t);
}
/** Envoie la partie au serveur, qui la rejoue et l'inscrit si elle bat le meilleur score du jour. Un texte pour le bilan. */
async function envoyer(fin) {
  const J = fin.J, appareil = [...fin.appareils].map(x => (x === 'clavier' ? 'souris' : x)).find(x => x !== 'toucher') || 'toucher', a = appareil === 'toucher' ? 't' : 'm';
  if (J.score <= 0) return 'Aucune cible touchée : retente ta chance !';
  if (LOCAL) { // l'essai : on rejoue ici ce que ferait le serveur
    const R = rejouer(fin.j, J.journal), s = R.ok ? R.score : J.score; if (!R.ok || R.score !== J.score) console.warn('lance-pierre : partie rejouée différente', R, J.score);
    const tout = (() => { try { return JSON.parse(lireLS(CLE_LOCAL) || '{}'); } catch { return {}; } })(), l = ((tout[fin.j] ||= {})[a] ||= []);
    const moi = l.find(e => e.uid === 'moi'), mieux = !moi || s > moi.s, n = filtrer(String(X.S.nom || '').trim()).slice(0, 16) || 'Joueur';
    if (mieux) { if (moi) Object.assign(moi, { n, s }); else l.push({ uid: 'moi', n, s, t: Date.now() }); ecrireLS(CLE_LOCAL, JSON.stringify(tout)); }
    L.tableauT = -1e9; return mieux ? `Score vérifié et enregistré (essai, dans ce navigateur), classement ${NOMS_CLASSEMENT[a]}.` : `Ton meilleur score du jour reste ${nb(moi.s)} points.`;
  }
  try {
    await heureServeur();
    if (maintenant() >= finDe(fin.j)) return 'Le défi a changé à 20 h : cette partie ne compte plus.';
    const dep = await fin.depart; if (!dep) return 'Ton départ n’a pas été enregistré (pas de réseau) : cette partie ne compte pas.';
    const user = await joueur(), jeton = await user.getIdToken();
    const r = await fetch('/api/lance-pierre', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ jeton, jour: fin.j, appareil, tirs: J.journal }) });
    const v = await r.json().catch(() => ({}));
    if (v.statut === 'refuse') return 'Cette partie n’a pas pu être vérifiée : elle ne compte pas au classement.'; // un message neutre
    if (!r.ok || !['enregistre', 'moins-bien'].includes(v.statut)) return 'Ton score n’est pas parti : vérifie ta connexion.';
    L.tableauT = -1e9;
    const liste = await lireJour(fin.j, a), rang = liste.findIndex(e => e.uid === user.uid) + 1, mieux = v.statut === 'enregistre';
    if (mieux && rang && rang <= 3) X.S.canal?.dire({ n: X.S.nom, txt: `${nb(v.score)} points au lance-pierre de Fidjrossè : ${place(rang)} du jour !`, lieu: 'fidjrosse' });
    return `${mieux ? (v.avant ? 'Nouveau record du jour ! ' : 'Score vérifié et enregistré. ') : `Ton meilleur score du jour reste ${nb(v.meilleur)} points. `}${rang ? `Tu es à la ${place(rang)} sur ${liste.length} (${NOMS_CLASSEMENT[a]}).` : ''}`;
  } catch (e) { console.warn('lance-pierre', e.message); return 'Ton score n’est pas parti : vérifie ta connexion.'; }
}
async function bilan(fin) {
  const J = fin.J, { b, u, g, c, k } = J.comptes;
  const detail = [b && `${b} boîte${b > 1 ? 's' : ''}`, u && `${u} bouteille${u > 1 ? 's' : ''}`, g && `${g} mangue${g > 1 ? 's' : ''}`, c && `${c} au chariot`, k && `+${nb(k)} en tirs doublés`].filter(Boolean).join(' · ');
  X.ligne(`Lance-pierre : ${nb(J.score)} points en ${J.tirs} tir${J.tirs > 1 ? 's' : ''}${detail ? ` (${detail})` : ''}.`);
  const etat = await envoyer(fin);
  X.ligne(etat);
  const gratuit = lireLS(CLE_GRATUIT) !== jourDe(maintenant());
  X.choisir(`${nb(J.score)} points !`, [
    { texte: `Rejouer · ${gratuit ? 'gratuit' : `${PRIX} F`}`, sous: etat, desactive: !gratuit && (VIE.data?.argent ?? 0) < PRIX, f: commencer },
    { texte: 'Voir le classement du jour', sous: detail || 'Le meilleur score du jour de chacun', f: () => montrerClassement(fin.appareils.size && ![...fin.appareils].every(x => x === 'toucher') ? 'm' : 't') },
  ], { annuler: 'Quitter le stand' });
}
async function montrerClassement(a = monClassement()) {
  let liste = []; try { liste = await lireJour(jourDe(maintenant()), a); } catch { X.ligne('Classement indisponible : vérifie ta connexion.'); return; }
  const moi = LOCAL ? 'moi' : (await joueur().catch(() => null))?.uid, rang = liste.findIndex(e => e.uid === moi) + 1, autre = a === 't' ? 'm' : 't';
  X.choisir(`Lance-pierre · classement ${NOMS_CLASSEMENT[a]}`, [
    ...(liste.length ? liste.slice(0, 8).map((e, i) => ({ texte: `${i + 1}. ${e.n} · ${nb(e.s)} points`, sous: e.uid === moi ? 'C’est toi !' : '', desactive: true, f: () => {} }))
      : [{ texte: 'Personne n’a encore joué aujourd’hui', sous: 'La première place est à prendre', desactive: true, f: () => {} }]),
    ...(rang > 8 ? [{ texte: `${rang}. Toi · ${nb(liste[rang - 1].s)} points`, desactive: true, f: () => {} }] : []),
    { texte: `Voir le classement ${NOMS_CLASSEMENT[autre]}`, sous: 'On ne vise pas pareil au doigt et à la manette : deux classements par jour', f: () => montrerClassement(autre) },
  ], { annuler: 'Fermer' });
}

// ---------- L'interface : le temps, le score, la girouette, la pause, le lance-pierre ----------
const UI = { hud: null, svg: null };
const ICONE_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>';
const ICONE_PASSER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l8 7-8 7z"/><path d="M12 5l8 7-8 7z"/></svg>';
const FANION = '<svg class="lp-fanion" viewBox="0 0 44 30" aria-hidden="true"><path class="mat" d="M6 2v27"/><path class="drapeau" d="M7 4q14 2 29 6-15 4-29 6z"/></svg>';
function interface_(oui) {
  $('#salonHud')?.classList.toggle('lp-tir', oui);
  canvas.classList.toggle('lp-vise', oui);
  if (oui && !UI.hud) {
    UI.hud = document.createElement('div'); UI.hud.className = 'lp-hud'; UI.hud.setAttribute('role', 'status');
    UI.hud.innerHTML = `<div class="lp-haut panel"><b class="lp-temps"></b><b class="lp-score"></b><span class="lp-vent">${FANION}<span class="lp-vent-txt"></span></span></div>`
      + `<button type="button" class="lp-pause" title="Pause (P)" aria-label="Pause">${ICONE_PAUSE}</button><button type="button" class="lp-passer" title="Passer l’entraînement" aria-label="Passer l’entraînement">${ICONE_PASSER}</button>`
      + '<p class="lp-grand"></p><p class="lp-aide"></p><div class="lp-fantome" aria-hidden="true"><i></i></div>';
    UI.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); UI.svg.setAttribute('class', 'lp-fronde'); UI.svg.setAttribute('aria-hidden', 'true');
    document.querySelector('#app')?.append(UI.hud, UI.svg);
    UI.hud.querySelector('.lp-pause').addEventListener('click', () => mettrePause(true));
    UI.hud.querySelector('.lp-passer').addEventListener('click', () => { if (P?.phase === 'tuto') { ecrireLS(CLE_APPRIS, '1'); decompte(); } });
  }
  if (UI.hud) { UI.hud.hidden = !oui; UI.svg.style.display = oui ? '' : 'none'; }
  D.id = null; V.tendu = false; V.p = 0; MA.parRT = false; CLAV.clear();
}
const AIDES = {
  toucher: 'Glisse vers l’arrière, vise sur le côté, lâche.',
  manette: ['Stick : viser · RT : tendre, relâche pour tirer · B : annuler', 'Stick : viser · R2 : tendre, relâche pour tirer · ○ : annuler'],
  souris: 'La souris vise · garde le clic pour tendre, lâche · clic droit : annuler',
  clavier: 'Flèches : viser · garde Espace pour tendre, lâche · Échap : annuler',
};
// Au premier tir de l'entraînement, pendant qu'on tend : comment tirer et comment annuler, avec les mots de son appareil.
const PREMIER = {
  toucher: 'Lâche pour tirer. Reviens au départ pour annuler.',
  manette: ['Relâche pour tirer. B pour annuler.', 'Relâche pour tirer. ○ pour annuler.'],
  souris: 'Lâche le clic pour tirer. Clic droit pour annuler.',
  clavier: 'Lâche Espace pour tirer. Échap pour annuler.',
};
const pour = (o, k) => { const v = o[k] || o.toucher; return Array.isArray(v) ? v[SAISIE.ps ? 1 : 0] : v; };
const FORCES = ['Pas de vent', 'Vent faible', 'Vent moyen', 'Vent fort'];
function majInterface() {
  if (!P || !UI.hud) return;
  const h = UI.hud, J = P.J, appareil = V.vu || 'toucher', reste = Math.max(0, Math.ceil(DUREE - (J?.t ?? 0)));
  const txt = (sel, t) => { const el = h.querySelector(sel); if (el.textContent !== t) el.textContent = t; };
  const tuto = P.phase === 'tuto' || P.phase === 'bravo';
  txt('.lp-temps', tuto ? 'Entraînement' : P.phase === 'decompte' ? `${DUREE} s` : `${reste} s`);
  txt('.lp-score', tuto || !J ? '' : `${nb(J.score)} pts${J.serie ? ' · ×2' : ''}`);
  // La girouette : le fanion flotte dans le sens du vent, plus ou moins tendu ; en mots, trois forces.
  const w = J?.vent ?? 0, f = forceDu(w), vent = h.querySelector('.lp-vent');
  if (vent.dataset.f !== `${f}${w < 0}`) { vent.dataset.f = `${f}${w < 0}`; vent.className = `lp-vent f${f}${w < 0 ? ' gauche' : ''}`; txt('.lp-vent-txt', f ? `${FORCES[f]} ${w > 0 ? '→' : '←'}` : FORCES[0]); }
  const m = P.message, maintenantMs = performance.now(), recent = m && maintenantMs - m.t < (m.petit ? 1100 : 900);
  const grand = P.phase === 'decompte' ? String(Math.max(1, Math.ceil(-P.t))) : P.phase === 'bravo' ? m?.txt || '' : recent ? m.txt : P.phase === 'jeu' && J.t < .8 ? 'Tire !' : '';
  const g = h.querySelector('.lp-grand'); if (g.textContent !== grand) g.textContent = grand; g.classList.toggle('petit', !!(recent && m.petit && grand === m.txt));
  // L'aide : avant le premier tir de la partie ; à l'entraînement, pas de texte (la main fantôme montre le geste), puis
  // pendant la première tension, comment tirer et comment annuler.
  const premier = tuto && J?.tirs === 0 && V.tendu;
  txt('.lp-aide', premier ? pour(PREMIER, appareil) : pour(AIDES, appareil));
  h.querySelector('.lp-aide').hidden = !(premier || (J && J.tirs === 0 && !V.tendu && (P.phase === 'jeu' || (P.phase === 'decompte' && appareil !== 'toucher'))));
  // La main fantôme de l'entraînement, jusqu'au premier tir : elle montre le geste (ou le bouton) de son appareil.
  const fantome = h.querySelector('.lp-fantome'); fantome.hidden = !(P.phase === 'tuto' && J.tirs === 0 && !V.tendu);
  fantome.className = `lp-fantome ${appareil}${REGLAGES.gaucher ? ' gaucher' : ''}`;
  h.querySelector('.lp-passer').hidden = P.phase !== 'tuto';
  h.querySelector('.lp-temps').classList.toggle('fin', P.phase === 'jeu' && reste <= 10);
  dessinerFronde();
}
/** Le lance-pierre en bas de l'écran : la fourche, les élastiques, la poche, la jauge, le repère du doigt, la trajectoire. */
function dessinerFronde() {
  // En paysage, plus petit : il cachait le bas des étagères.
  const W = innerWidth, H = innerHeight, s = Math.min(W, H) * (W > H ? .72 : 1), cx = W / 2, base = H + s * .02, fourche = H - s * .2, ecart = s * .085, haut = H - s * .3;
  const J = P.J, prete = !!J && jouable() && pret(J), tendu = V.tendu && jouable();
  // La poche recule à l'opposé du tir : vers le bas avec la tension, sur le côté avec la visée.
  const px = cx - V.lacet / LACET_MAX * s * .09, py = haut + s * .015 + (tendu ? V.p : 0) * s * .16;
  let svg = '';
  // La trajectoire : son premier tiers (un sixième, aide réduite), sans le vent. Pâle avant de tendre, à la manette et à la
  // souris, qui visent sans tendre ; au doigt, on la voit dès qu'on tire.
  const pale = !tendu && prete && V.vu !== 'toucher';
  if ((tendu && prete && V.p >= SEUIL) || pale) { // revenu au point de départ : l'élastique est détendu, rien ne partira
    const v = elan({ lacet: V.lacet, hausse: V.hausse, p: Math.max(SEUIL, tendu ? V.p : V.derniere) }), o = DEPART, q = new THREE.Vector3();
    const tFin = (Z_ETAGERE - o.z) * (REGLAGES.aide ? 1 / 6 : 1 / 3) / v.z, op = tendu ? 1 : .55;
    for (let i = 1; i <= 9; i++) {
      const t = tFin * i / 9; q.set(STAND.x + o.x + v.x * t, o.y + v.y * t - G * t * t / 2, STAND.z + o.z + v.z * t).project(camera);
      svg += `<circle cx="${((q.x + 1) / 2 * W).toFixed(1)}" cy="${((1 - q.y) / 2 * H).toFixed(1)}" r="${(5.2 - i * .3).toFixed(1)}" fill="#fff" fill-opacity="${((.9 - i * .06) * op).toFixed(2)}"/>`;
    }
  }
  svg += `<path d="M${cx} ${base} L${cx} ${fourche} M${cx} ${fourche} Q${cx - ecart * .4} ${fourche - s * .03} ${cx - ecart} ${haut} M${cx} ${fourche} Q${cx + ecart * .4} ${fourche - s * .03} ${cx + ecart} ${haut}" stroke="#7a4f2a" stroke-width="${s * .03}" stroke-linecap="round" fill="none"/>`
    + `<path d="M${cx - ecart} ${haut} L${px} ${py} L${cx + ecart} ${haut}" stroke="#3b2a1e" stroke-width="${tendu ? 4 : 5}" fill="none" stroke-linejoin="round"/>`
    + (prete ? `<circle cx="${px}" cy="${py}" r="${s * .022}" fill="#6d6a64" stroke="#3f3c38" stroke-width="2"/>` : '');
  // La jauge de tension, du côté de la main qui tire (à gauche pour un gaucher) ; la zone du haut, c'est à fond.
  if (tendu) {
    const jx = cx + (REGLAGES.gaucher ? -1 : 1) * s * .2, jh = s * .3, jy = H - s * .08 - jh, jw = Math.max(12, s * .03), hp = jh * V.p;
    svg += `<rect x="${jx - jw / 2}" y="${jy}" width="${jw}" height="${jh}" rx="${jw / 2}" fill="rgba(21,33,27,.55)" stroke="#fff" stroke-opacity=".7" stroke-width="2"/>`
      + `<rect x="${jx - jw / 2}" y="${jy}" width="${jw}" height="${jh * .06}" rx="${jw / 2}" fill="${V.plein ? '#ffe27a' : 'rgba(255,226,122,.45)'}"/>`
      + `<rect x="${jx - jw / 2 + 3}" y="${jy + jh - hp + 3}" width="${jw - 6}" height="${Math.max(0, hp - 6)}" rx="${(jw - 6) / 2}" fill="${V.plein ? '#ffd23f' : '#f2f0ea'}"${V.plein ? ' class="lp-plein"' : ''}/>`;
  }
  // Le repère du doigt : là où il s'est posé (le rond où revenir pour annuler), et le fil jusqu'à lui.
  if (D.id !== null) {
    const r = ANNULE_CM * PX_CM, ici = D.retour && V.pMax >= SEUIL;
    svg += `<line x1="${D.x0}" y1="${D.y0}" x2="${D.x}" y2="${D.y}" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-dasharray="4 5"/>`
      + `<circle cx="${D.x0}" cy="${D.y0}" r="${r}" fill="${ici ? 'rgba(200,56,47,.35)' : 'rgba(255,255,255,.12)'}" stroke="#fff" stroke-opacity=".85" stroke-width="2"/>`
      + (ici ? `<path d="M${D.x0 - r * .35} ${D.y0 - r * .35}L${D.x0 + r * .35} ${D.y0 + r * .35}M${D.x0 + r * .35} ${D.y0 - r * .35}L${D.x0 - r * .35} ${D.y0 + r * .35}" stroke="#fff" stroke-width="3" stroke-linecap="round"/>` : '')
      + `<circle cx="${D.x}" cy="${D.y}" r="7" fill="#fff" fill-opacity=".85"/>`;
  }
  UI.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  UI.svg.innerHTML = svg;
}

// ---------- La caméra pendant la partie (salon.js) ----------
/**
 * L'œil derrière la ligne de tir, le regard sur les étagères ; une petite secousse au tir. Les commandes de la caméra
 * (scene.js) la gardent à 11° au moins au-dessus de ce qu'elle regarde : l'œil, voulu à 1,60 m, finissait à 3 m, on
 * voyait le stand d'en haut et le début de la trajectoire passait sous l'image. Pendant la partie, on les laisse faire.
 */
export function cameraTir(controls) {
  L.polaire ??= controls.maxPolarAngle; controls.maxPolarAngle = Math.PI / 2 + .2;
  const k = L.secousse / .16, t = performance.now();
  camera.position.set(STAND.x + OEIL.x + Math.sin(t * .09) * .012 * k, OEIL.y + Math.cos(t * .11) * .009 * k, STAND.z + OEIL.z);
  controls.target.set(STAND.x + VISE.x, VISE.y, STAND.z + VISE.z);
}
/** L'angle laisse voir tout le stand, en hauteur comme en largeur ; pendant qu'on tend, il se resserre un peu (le zoom). */
export function fovTir() {
  const d = VISE.z - OEIL.z, v = Math.atan(1.35 / d), h = Math.atan(1.36 / d / camera.aspect); // les étagères font 2,5 m de large
  return THREE.MathUtils.radToDeg(2 * Math.max(v, h)) * 1.06 * (1 - .16 * L.zoom);
}

// ---------- Mise en route ----------
export function initLancePierre(ctx) {
  X = ctx;
  canvas.addEventListener('pointerdown', surAppui, true);
  canvas.addEventListener('contextmenu', e => { if (P) { e.preventDefault(); annuler(); } }); // le clic droit annule, sans menu
  window.addEventListener('pointermove', surGlisse);
  window.addEventListener('pointerup', surLacher); window.addEventListener('pointercancel', e => { if (e.pointerId === D.id) { D.id = null; V.tendu = false; V.p = 0; } });
  window.addEventListener('keydown', surTouche, true); window.addEventListener('keyup', surRelache, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden && P && (P.phase === 'jeu' || P.phase === 'decompte')) mettrePause(true); }); // un appel, une autre appli : la partie attend
  heureServeur();
  if (import.meta.env.DEV) { // pour les tests : `tir` passe par les mêmes actions qu'un appareil (tendre, viser, lâcher)
    const tir = (lacet, p, par = 'toucher', hausse = 0) => { if (!tendre(par)) return false; V.lacet = lacet; V.hausse = hausse; poserTension(p); const n = P.J.tirs; lacher(); return P.J.tirs > n; };
    window.__lp = { L, get P() { return P; }, V, D, MA, REGLAGES, STAND, commencer, finir, mettrePause, lireJour, montrerClassement, reglages, tir };
  }
}
