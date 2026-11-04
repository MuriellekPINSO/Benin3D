import * as THREE from 'three';
import { TRAFIC_3D, chargerTrafic, matVeh, partsVoiture, partsZem } from './vehicules.js';
import { E } from './etat.js';
import { chevauchement, degagerAutourDuJoueur, vuDe } from './trafic.js';
import { dansBatiment, dansObstacleRue } from './rue.js';
import { dansTerrePlein } from './terre-pleins.js';
import { LITE } from './base.js';
import { mergeColored, roadLines } from './ville.js';
import { camera, scene } from './scene.js';

// ---------- La circulation autour du joueur (« Vivre à Cotonou ») ----------
// Les zems de toute la ville (trafic.js) sont trop clairsemés là où l'on marche : ici, une circulation, seulement autour
// du joueur — voitures de plusieurs couleurs, taxis jaunes, zems et motos, en 3D (TRAFIC_3D). Chacun suit sa rue (à droite
// sur une rue à double sens, réparti sur la largeur d'un boulevard à sens unique), passe à la rue suivante au carrefour,
// garde ses distances avec celui de devant, s'arrête si le joueur est devant lui, puis le contourne. Loin du joueur, il réapparaît sur une
// rue proche. Comme ceux de trafic.js, ils sont solides : E.circulation (dansCirculation).

// 40 au lieu de 110 (18 au lieu de 50 au téléphone) : à 110, ils se rentraient dedans aux carrefours et dans les files
// (« on a toujours un problème de collision des voitures et motos qui deviennent beaucoup : supprime la majorité »,
// Murielle, 27/10). Plus de camions ni de vélos dessinés en boîtes : seulement les voitures et les motos qu'on a en 3D.
// « Il n'y a pas d'embouteillages sur la voie, les voies sont larges et respirent » (Murielle, 28/10, devant Slop New York
// de mrdoob) : chacun garde 6 m avec celui de devant (au lieu de 2,5), le voit venir de 24 m, ne se pose ni ne tourne à
// moins de 30 m d'un autre qui va dans son sens, et une file qui se forme loin des yeux du joueur se dissout.
const ECART = 6, REGARD = 24, PLACE = 30;
const N = LITE ? 18 : 40, LOIN = 300, CELL = 150, POIDS = c => (c <= 2 ? 5 : c === 3 ? 3 : c === 4 ? 2 : 1); // plus de monde sur les grands axes
const TYPES = [ // part de la circulation, vitesse (m/s), demi-longueur et demi-largeur (pour les collisions)
  { id: 'voiture', part: .5, v: [8, 13], hl: 2.15, hw: .9 },
  { id: 'taxi', part: .15, v: [8, 12], hl: 2.15, hw: .9 },
  { id: 'zem', part: .22, v: [8, 12], hl: 1.05, hw: .42 },
  { id: 'moto', part: .13, v: [8, 12], hl: 1.05, hw: .42 }, // une moto ordinaire : le conducteur en chemise, pas en gilet de zém
];
const COULEURS = ['#e8e8e4', '#9da3a6', '#1f2326', '#7b2a2a', '#2c4a6e', '#c9c9c4'];
const C = { pret: false, meshes: new Map(), vehicules: [], grille: null, bouts: null, routes: null, actif: false };
const hasard = (a, b) => a + Math.random() * (b - a);

// ---------- Les modèles (même repère que vehicules.js : l'avant vers +x) ----------
// Les modèles 3D de scripts/trafic.mjs, une variante par couleur ; s'ils manquent, ceux dessinés en code.
function maillages() {
  const D = TRAFIC_3D.pret ? { voiture: TRAFIC_3D.voitures, taxi: [TRAFIC_3D.taxi], zem: [TRAFIC_3D.zem], moto: TRAFIC_3D.civils } : {
    voiture: COULEURS.map(c => ({ geo: mergeColored(partsVoiture(c)), mat: matVeh })), taxi: [{ geo: mergeColored(partsVoiture('#f2c21b')), mat: matVeh }],
    zem: [{ geo: mergeColored(partsZem({ passager: '#2f6fb0' })), mat: matVeh }], moto: [{ geo: mergeColored(partsZem({ passager: false })), mat: matVeh }],
  };
  for (const [t, variantes] of Object.entries(D)) for (const { geo, mat } of variantes) {
    const m = new THREE.InstancedMesh(geo, mat, N); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; m.castShadow = !LITE; m.receiveShadow = true; m.visible = false;
    scene.add(m); (C.meshes.get(t) || C.meshes.set(t, []).get(t)).push(m);
  }
}
// Les rues (et leurs bouts, pour passer de l'une à l'autre au carrefour), rangées par cases.
function indexer() {
  C.grille = new Map(); C.bouts = new Map(); C.routes = [];
  const cleBout = (x, z) => Math.round(x / 3) + ',' + Math.round(z / 3);
  roadLines.forEach((L, li) => {
    if (L.bridge || L.cls > 5 || L.pts.length < 2) return;
    const cum = [0]; for (let j = 1; j < L.pts.length; j++) cum.push(cum[j - 1] + Math.hypot(L.pts[j][0] - L.pts[j - 1][0], L.pts[j][1] - L.pts[j - 1][1]));
    const R = { L, li, cum, len: cum[cum.length - 1], hw: (L.w || 6) / 2, sens: !!L.sens }; if (R.len < 15) return; L._circ = R;
    const iR = C.routes.length; C.routes.push(R);
    for (let j = 0; j < L.pts.length; j += 2) { const k = Math.floor(L.pts[j][0] / CELL) + ',' + Math.floor(L.pts[j][1] / CELL); let l = C.grille.get(k); if (!l) C.grille.set(k, l = new Set()); l.add(R); }
    // Carrefours : on indexe TOUS les points de la rue, pas seulement ses deux bouts. Beaucoup de croisements sont
    // des T, où une rue se termine au milieu d'une autre : le bout de la première ne tombait sur le bout d'aucune
    // autre, le véhicule n'avait nulle part où tourner et filait tout droit (« certains ne savent pas tourner »).
    // Un objet { R, s } par point faisait 170 000 objets, 7,6 Mo au profileur : on garde deux nombres dans une
    // liste à plat (le numéro de la rue dans C.routes, et la distance depuis son début).
    for (let j = 0; j < L.pts.length; j++) { const k = cleBout(L.pts[j][0], L.pts[j][1]); let l = C.bouts.get(k); if (!l) C.bouts.set(k, l = []); l.push(iR, cum[j]); }
  });
  C.cleBout = cleBout;
}
/** Le point et la direction à s mètres le long de la rue R (dans le sens dir). */
function poser(R, s, dir) {
  const { L, cum } = R; let k = 0; while (k < cum.length - 2 && s > cum[k + 1]) k++;
  const [ax, az] = L.pts[k], [bx, bz] = L.pts[k + 1], l = cum[k + 1] - cum[k] || 1, t = (s - cum[k]) / l;
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / l * dir, dz: (bz - az) / l * dir };
}
function voie(R, type) { // décalage à droite de la direction de marche
  if (R.sens) return (Math.random() - .5) * Math.max(0, R.hw * 2 - 2.4);
  return type === 'zem' || type === 'moto' ? Math.min(3.6, Math.max(.6, R.hw - 1.1)) : THREE.MathUtils.clamp(R.hw * .5, 1.6, 3.2); // au milieu de sa moitié ; les motos serrent à droite
}
/** Une place sur une rue à distance [rMin, rMax] du joueur, ou null. */
function placer(V, jx, jz, rMin, rMax) {
  for (let essai = 0; essai < 12; essai++) {
    const a = Math.random() * Math.PI * 2, d = hasard(rMin, rMax), x = jx + Math.cos(a) * d, z = jz + Math.sin(a) * d;
    const l = C.grille.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!l || !l.size) continue;
    const routes = [...l], tot = routes.reduce((t, r) => t + POIDS(r.L.cls), 0); let u = Math.random() * tot, R = routes[0];
    for (const r of routes) { u -= POIDS(r.L.cls); if (u <= 0) { R = r; break; } }
    V.R = R; V.dir = R.sens ? 1 : Math.random() < .5 ? 1 : -1; V.s = Math.random() * R.len; V.lane = voie(R, V.type.id);
    const p = poser(R, V.s, V.dir), dj = Math.hypot(p.x - jx, p.z - jz); if (dj < rMin * .7 || dj > rMax * 1.2) continue;
    // Pas sur un autre : posé dans sa carrosserie, il y restait le temps que l'autre s'éloigne. Ni sur un véhicule garé.
    if (C.vehicules.some(W => W !== V && W.R === R && W.dir === V.dir && Math.abs(W.s - V.s) < PLACE)) continue;
    const x0 = p.x - p.dz * V.lane, z0 = p.z + p.dx * V.lane; if (E.garees.some(G => Math.abs(G.x - x0) < 8 && Math.abs(G.z - z0) < 8)) continue;
    V.v = hasard(...V.type.v); V.vmax = V.v; V.laneN = V.lane; V.contour = null; V.laneVise = undefined; V.demi = null; V.bloque = 0; V.cede = false;
    V.px = x0; V.pz = z0; V.fx = p.dx; V.fz = p.dz; V.cap = Math.atan2(p.dx, p.dz);
    return true;
  }
  return false;
}
function creer() {
  maillages(); indexer();
  let k = 0;
  for (const T of TYPES) for (let i = 0; i < Math.round(N * T.part); i++) {
    const ms = C.meshes.get(T.id), mesh = ms[k++ % ms.length];
    C.vehicules.push({ type: T, rang: C.vehicules.length, mesh, idx: mesh.count++, R: null, s: 0, dir: 1, lane: 0, v: 0, vmax: 0, hl: T.hl, hw: T.hw, px: 0, pz: 0, fx: 0, fz: 1, cap: 0 });
  }
  C.pret = true; E.denses = C.vehicules; // les zéms de toute la ville s'arrêtent derrière eux (trafic.js)
}
// Un véhicule qu'on peut retirer sans que personne ne le voie s'effacer : hors du champ de la caméra, ou à plus de 150 m
// d'elle. On jugeait au regard du joueur, à 70 m : au bout d'une rue droite, à 90 ou 110 m, les voitures arrivées dans
// une impasse s'évaporaient en plein écran (16 en 30 s, mesuré à pied au milieu d'une rue de 180 m, 04/11).
const CHAMP = new THREE.Frustum(), _pv = new THREE.Matrix4(), _sph = new THREE.Sphere(new THREE.Vector3(), 3);
function majChamp() { camera.updateMatrixWorld(); CHAMP.setFromProjectionMatrix(_pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); }
function horsDeVue(J, x, z) {
  const dx = x - camera.position.x, dz = z - camera.position.z;
  if (dx * dx + dz * dz > 150 * 150) return true;
  _sph.center.set(x, 1, z); return !CHAMP.intersectsSphere(_sph);
}
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), un = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0), echelle = new THREE.Vector3();
/**
 * Un véhicule qui cède la place au joueur s'en va : tout de suite s'il est hors de vue, sinon il se rétracte en une
 * demi-seconde (plus solide pendant ce temps) au lieu de s'évaporer d'une image à l'autre. Il réapparaît ensuite loin,
 * à 150 m au moins (`ailleurs`), et non à 20 m, sous les yeux du joueur.
 */
const FONDU = .5;
function partir(V, J) {
  V.bloque = 0;
  if (horsDeVue(J, V.px, V.pz)) { V.R = null; V.ailleurs = true; } else V.part = FONDU;
}

// ---------- Contourner ce qui barre la rue ----------
// « Il faut que les voitures des bots contournent le joueur quand celui-ci bloque le chemin, et non qu'elles disparaissent »
// (testeur, 04/11). Retenue 3 s par le joueur, une voiture se rétractait et s'en allait, sous ses yeux. Elle s'arrête
// maintenant derrière lui comme avant, puis se décale — sur l'autre file, ou dans l'autre moitié de la rue si personne
// n'arrive en face —, passe au pas à côté de lui (ou du véhicule garé, ou du zém arrêté) et reprend sa file. Pas la place :
// elle attend, ou fait demi-tour si la rue est à double sens et assez large ; elle ne s'en va que si le joueur ne la voit
// pas. Ces calculs ne se font que pour une voiture arrêtée devant un obstacle, une fois par demi-seconde au plus.
const LATERAL = 1.6, AU_PAS = 4.5, MARGE = .5;
/** Rien de fixe en (x, z) : ni bâtiment, ni mur, ni poteau, ni terre-plein. */
const solLibre = (x, z) => !dansBatiment(x, z) && !dansObstacleRue(x, z, .15) && !dansTerrePlein(x, z, 0);
/** Le centre de V à `k` mètres devant lui sur sa rue, à la `lane` l (dans son sens de marche), et la direction de la rue. */
function surSaRue(V, k, l) { const p = poser(V.R, THREE.MathUtils.clamp(V.s + k * V.dir, 0, V.R.len), V.dir); return { x: p.x - p.dz * l, z: p.z + p.dx * l, dx: p.dx, dz: p.dz }; }
/**
 * Le couloir où V passerait à côté de l'obstacle g (vuDe), à la lane l, est-il libre ? Sa caisse reste sur la chaussée, loin
 * des murs ; aucun véhicule dedans ; personne n'arrive en face sur cette file avant qu'il ait fini, ni derrière lui
 * sur un boulevard à plusieurs files.
 */
function couloirLibre(V, l, g, obst) {
  const L = Math.max(8, g.devant + g.eLong + V.hl + 3), T = L / AU_PAS + 1;
  for (let k = 0; k <= L; k += 1.5) {
    const lk = V.lane + (l - V.lane) * Math.min(1, k / 5), P = surSaRue(V, k, lk), cap = Math.atan2(P.dx, P.dz);
    for (const b of [-V.hw, 0, V.hw]) for (const a of [V.hl, -V.hl]) if (!solLibre(P.x + P.dx * a - P.dz * b, P.z + P.dz * a + P.dx * b)) return false;
    for (const O of obst) if (O !== g.O && O.W !== V && Math.abs(O.x - P.x) < 8 && Math.abs(O.z - P.z) < 8 && chevauchement(P.x, P.z, cap, V.hl, V.hw, O.x, O.z, O.cap, O.hl + .3, O.hw + .3) > 0) return false;
    for (const W of C.vehicules) if (W !== V && W.R && Math.abs(W.px - P.x) < 8 && Math.abs(W.pz - P.z) < 8 && chevauchement(P.x, P.z, cap, V.hl, V.hw, W.px, W.pz, W.cap, W.hl + .3, W.hw + .3) > 0) return false;
  }
  const physique = l * V.dir; // la file visée, vue dans le sens de la rue
  for (const W of C.vehicules) {
    if (W === V || W.R !== V.R || Math.abs(W.lane * W.dir - physique) > V.hw + W.hw + .4) continue;
    const d = (W.s - V.s) * V.dir;
    if (W.dir !== V.dir && d > 0 && d < L + W.v * T + 10) return false; // en face, il serait là avant qu'on ait fini
    if (W.dir === V.dir && d < 0 && d > -(W.v * 2 + 8)) return false; // derrière, sur la file visée : on le laisse passer
  }
  return true;
}
/** La lane où V contourne l'obstacle g (vuDe) : de l'un ou l'autre côté, le plus court décalage d'abord ; null : pas la place. */
function voieDeContour(V, g, obst) {
  const latO = V.lane + g.lat, ecart = g.eLat + V.hw + MARGE, bord = V.R.hw - V.hw - .2;
  for (const l of [latO + ecart, latO - ecart].filter(l => Math.abs(l) <= bord).sort((a, b) => Math.abs(a - V.lane) - Math.abs(b - V.lane))) if (couloirLibre(V, l, g, obst)) return l;
  return null;
}
/**
 * Le demi-tour : un demi-cercle de rayon r vers la gauche, de sa file à celle d'en face (D : { s0, dir0, r }). th va de
 * 0 à π : le centre avance de r sin th et passe de la lane r à −r ; le capot tourne avec lui.
 */
function poseDemi(V, D, th) {
  const p = poser(V.R, THREE.MathUtils.clamp(D.s0 + D.dir0 * D.r * Math.sin(th), 0, V.R.len), D.dir0), l = D.r * Math.cos(th);
  const hx = p.dx * Math.cos(th) + p.dz * Math.sin(th), hz = p.dz * Math.cos(th) - p.dx * Math.sin(th);
  return { x: p.x - p.dz * l, z: p.z + p.dx * l, hx, hz, cap: Math.atan2(hx, hz), p };
}
/** Le demi-tour de V tient-il dans la rue : sa caisse sur la chaussée, loin des murs, de l'obstacle et des autres véhicules ? Si oui, il commence. */
function demiTourPossible(V, obst) {
  if (V.R.sens) return false;
  const D = { s0: V.s, dir0: V.dir, r: Math.max(1.2, Math.abs(V.laneN ?? V.lane)) };
  for (let i = 0; i <= 8; i++) {
    const P = poseDemi(V, D, Math.PI * i / 8);
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0]]) {
      const x = P.x + P.hx * a * V.hl + P.hz * b * V.hw, z = P.z + P.hz * a * V.hl - P.hx * b * V.hw;
      if (Math.abs((x - P.p.x) * -P.p.dz + (z - P.p.z) * P.p.dx) > V.R.hw + .3 || !solLibre(x, z)) return false;
    }
    for (const O of obst) if (O.W !== V && chevauchement(P.x, P.z, P.cap, V.hl, V.hw, O.x, O.z, O.cap, O.hl + .3, O.hw + .3) > 0) return false;
    for (const W of C.vehicules) if (W !== V && W.R && Math.abs(W.px - P.x) < 10 && Math.abs(W.pz - P.z) < 10 && chevauchement(P.x, P.z, P.cap, V.hl, V.hw, W.px, W.pz, W.cap, W.hl + .3, W.hw + .3) > 0) return false;
  }
  V.demi = { ...D, t: 0, duree: V.hl > 1.5 ? 2.6 : 1.5 }; V.contour = null; V.laneVise = undefined;
  return true;
}
/** De combien V, posé en (x, z) au cap `cap`, entre dans le joueur ou un véhicule hors circulation proche (0 : libre). */
function dansObstacles(V, x, z, cap, obst) {
  let p = 0;
  for (const O of obst) if (O.W !== V && Math.abs(O.x - x) < 10 && Math.abs(O.z - z) < 10) p = Math.max(p, chevauchement(x, z, cap, V.hl, V.hw, O.x, O.z, O.cap, O.hl + .15, O.hw + .15));
  return p;
}

/** À chaque image du salon : `J` la position du joueur (à pied ou en véhicule), ou null (dedans : rien à montrer). */
export function majCirculation(dt, J) {
  if (!roadLines.length) return;
  if (!C.pret) { if (!TRAFIC_3D.pret && !TRAFIC_3D.echec) { chargerTrafic(); return; } creer(); } // les modèles 3D d'abord (~300 Ko)
  const visible = !!J; if (visible !== C.actif) { C.actif = visible; for (const ms of C.meshes.values()) for (const m of ms) m.visible = visible; }
  if (!visible) return;
  majChamp();
  // Ce qui barre la rue sans être de la circulation : le joueur (sauf la Roadster en vol : on passe dessous), les véhicules
  // garés ou conduits par d'autres joueurs (E.garees, salon.js) et les zéms arrêtés (trafic.js).
  const obst = [];
  if (!J.enLair) obst.push({ x: J.x, z: J.z, cap: J.cap ?? 0, hl: J.hl ?? .3, hw: J.hw ?? .3 });
  for (const G of E.garees) obst.push(G);
  for (const W of E.zemsPres) if (W.arret) obst.push({ x: W.px, z: W.pz, cap: W.cap, hl: W.hl, hw: W.hw });
  // Celui qui fait demi-tour est en travers de la rue, hors de sa file : les autres le voient là où il est vraiment.
  for (const W of C.vehicules) if (W.demi) obst.push({ x: W.px, z: W.pz, cap: W.cap, hl: W.hl, hw: W.hw, W });
  for (const V of C.vehicules) {
    if (V.part > 0) { V.part -= dt; if (V.part <= 0) { V.part = 0; V.R = null; V.ailleurs = true; } continue; } // il s'efface (partir) : ni avance, ni obstacle
    if (!V.R || Math.hypot(V.px - J.x, V.pz - J.z) > LOIN) { const loin = !!V.R || V.ailleurs; if (!placer(V, J.x, J.z, loin ? 150 : 20, loin ? 260 : 240)) { V.R = null; continue; } V.ailleurs = false; } // réapparaît hors de vue
    if (V.demi) { // il fait demi-tour (demiTourPossible) ; si quelqu'un entre dans son arc, il s'arrête et attend
      const D = V.demi, k = Math.min(1, (D.t + dt) / D.duree), P = poseDemi(V, D, Math.PI * k * k * (3 - 2 * k));
      if (dansObstacles(V, P.x, P.z, P.cap, obst) <= dansObstacles(V, V.px, V.pz, V.cap, obst) + 1e-3) {
        D.t += dt; V.px = P.x; V.pz = P.z; V.fx = P.hx; V.fz = P.hz; V.cap = P.cap;
        if (k >= 1) { V.dir = -D.dir0; V.s = D.s0; V.lane = V.laneN = D.r; V.demi = null; V.bloque = 0; V.v = 0; }
      }
      if ((V.px - J.x) ** 2 + (V.pz - J.z) ** 2 < 1600) E.circulation.push(V);
      continue;
    }
    // Garder ses distances : celui de devant, sur la même rue et dans le même sens ; et le joueur devant soi.
    let vise = V.vmax;
    for (const W of C.vehicules) {
      // Côte à côte s'ils ne se touchent pas : la somme de leurs demi-largeurs, et non 1,6 m pour tous. Deux voitures
      // font 1,8 m, un camion et une voiture 2,1 m : décalées de 1,7 m sur un boulevard, elles ne se voyaient pas et la
      // plus rapide entrait dans l'autre (« certaines voitures rentrent l'une dans l'autre », un testeur, 26/10 ; 9 sur
      // 10 des chevauchements mesurés étaient là, sur la même rue et dans le même sens).
      // La file se compare dans le sens de la rue (lane × dir) : celui qui contourne passe dans la moitié d'en face, où
      // ceux qui viennent vers lui doivent le voir.
      if (W === V || W.R !== V.R || Math.abs(W.lane * W.dir - V.lane * V.dir) > V.hw + W.hw + .3) continue;
      const d = (W.s - V.s) * V.dir, ecart = d - W.hl - V.hl; if (d <= 0 || ecart >= REGARD) continue;
      // On visait W.v * (ecart / 14) : derrière un vélo à 3 m/s, une voiture plafonnait à 2,8 m/s même à 13 m, et
      // la file entière ralentissait de proche en proche — d'où les véhicules « très lents sans raison ». On vise
      // maintenant la vitesse de celui de devant, plus ce que l'écart permet de gagner.
      if (W.dir === V.dir) vise = Math.min(vise, ecart < ECART ? 0 : W.v + (ecart - ECART) * .6);
      else vise = Math.min(vise, V.contour && !W.contour ? (ecart < 2.5 ? 0 : AU_PAS) : ecart < ECART ? 0 : (ecart - ECART) * .6); // en face sur la même file : celui qui ne contourne pas s'arrête
    }
    // Ceux des autres rues : au carrefour, deux voitures de rues différentes ne se voyaient pas et entraient l'une
    // dans l'autre (« certaines voitures rentrent toujours l'une dans l'autre », un testeur, 26/10). Derrière une
    // voiture qui va dans notre sens, on la suit ; une qui nous coupe la route, on la laisse passer — sauf si elle
    // nous cède déjà (le plus petit rang passe), sinon les deux s'attendraient au milieu du carrefour.
    for (const W of C.vehicules) {
      if (W === V || !W.R || W.R === V.R) continue;
      const bx = W.px - V.px, bz = W.pz - V.pz; if (bx * bx + bz * bz > 400) continue;
      const dv = bx * V.fx + bz * V.fz, cv = Math.abs(bx * V.fz - bz * V.fx), meme = W.fx * V.fx + W.fz * V.fz;
      const tr = Math.sqrt(Math.max(0, 1 - meme * meme)), lng = W.hl * (1 - tr) + W.hw * tr, lrg = W.hw * (1 - tr) + W.hl * tr; // W vu de face ou de travers
      if (dv <= 0 || dv > V.hl + lng + 12 || cv > V.hw + lrg + .3) continue;
      const ecart = dv - V.hl - lng;
      if (meme < .7 && W.rang > V.rang && ecart > .8) continue; // il nous coupe la route, mais c'est lui qui cède
      vise = Math.min(vise, ecart < ECART ? 0 : Math.max(0, W.v * meme) + (ecart - ECART) * .6);
    }
    // Et derrière les zéms et tokpas de toute la ville (trafic.js), qu'on traversait. Bloqué plus de 4 s par l'un
    // d'eux (un croisement où chacun attend l'autre), on passe — hors de la vue du joueur seulement : sous ses yeux,
    // un zém arrêté se contourne comme le reste (obst).
    if (!(V.libre > 0)) {
      let gene = false;
      for (const W of E.zemsPres) {
        const bx = W.px - V.px, bz = W.pz - V.pz, dv = bx * V.fx + bz * V.fz, cv = Math.abs(bx * V.fz - bz * V.fx);
        if (dv <= 0 || dv > V.hl + W.hl + REGARD || cv > V.hw + W.hw + .3) continue;
        const ecart = dv - V.hl - W.hl; vise = Math.min(vise, ecart < ECART ? 0 : (W.arret ? 0 : W.v) + (ecart - ECART) * .6); gene ||= ecart < ECART;
      }
      V.attente = gene && V.v < .3 ? (V.attente || 0) + dt : 0; if (V.attente > 4 && horsDeVue(J, V.px, V.pz)) { V.attente = 0; V.libre = 1.5; }
    } else V.libre -= dt;
    const viseVeh = vise; // ce que les autres véhicules permettent, sans compter le joueur ni ce qui est garé
    // Le joueur, les véhicules garés, les zéms arrêtés : vus dans leur vraie emprise (un taxi en travers n'occupe pas la
    // même largeur qu'un piéton). On freine pour s'arrêter à 2 m ; à 60 cm de celui qu'on est en train de contourner.
    let gene = null;
    for (const O of obst) {
      if (O.W === V || Math.abs(O.x - V.px) > 40 || Math.abs(O.z - V.pz) > 40) continue;
      const g = vuDe(V, O); if (g.devant <= -V.hl - g.eLong || Math.abs(g.lat) > V.hw + g.eLat + .3) continue;
      g.ecart = g.devant - V.hl - g.eLong; g.O = O; if (g.ecart > REGARD) continue;
      const contourne = V.contour && Math.abs(V.contour.x - O.x) < 1.5 && Math.abs(V.contour.z - O.z) < 1.5;
      vise = Math.min(vise, Math.max(0, (g.ecart - (contourne ? .6 : 2)) * 1.1));
      if (!gene || g.ecart < gene.ecart) gene = g;
    }
    if (V.contour) {
      vise = Math.min(vise, AU_PAS);
      // L'obstacle est derrière lui (ou parti) : il reprend sa file ; revenu, le contournement est fini.
      const g = vuDe(V, V.contour);
      if (V.laneVise !== V.laneN && (g.devant < -(V.hl + g.eLong + 1.5) || Math.abs(g.devant) > 40)) V.laneVise = V.laneN;
      if (V.laneVise === V.laneN && Math.abs(V.lane - V.laneN) < .05) { V.lane = V.laneN; V.contour = null; V.laneVise = undefined; }
    }
    const R0 = V.R, s0 = V.s, lane0 = V.lane; // pour le garde-fou plus bas
    V.v += THREE.MathUtils.clamp(vise - V.v, -9 * dt, 3 * dt);
    V.s += V.v * dt * V.dir;
    if (V.laneVise !== undefined) V.lane += THREE.MathUtils.clamp(V.laneVise - V.lane, -LATERAL * dt, LATERAL * dt); // le déport, en douceur
    if (V.s < 0 || V.s > V.R.len) { // au bout de la rue : la suivante (au carrefour), sinon demi-tour
      const bout = V.s < 0 ? 0 : 1, p = bout ? V.R.L.pts[V.R.L.pts.length - 1] : V.R.L.pts[0];
      const plat = C.bouts.get(C.cleBout(p[0], p[1])) || [], suite = [];
      for (let j = 0; j < plat.length; j += 2) { const R = C.routes[plat[j]], s = plat[j + 1]; if (R !== V.R && s > .5 && s < R.len - .5) suite.push({ R, s }); }
      // On rejoint la rue croisée en son milieu : il faut donc vérifier la place, sinon on atterrit sur un autre
      // véhicule et les deux se bloquent (la première version doublait le nombre de véhicules à l'arrêt).
      let pris = null;
      for (let essai = 0; essai < 4 && suite.length && !pris; essai++) {
        const b = suite.splice(Math.floor(Math.random() * suite.length), 1)[0];
        const dir = b.R.sens ? 1 : b.s < b.R.len / 2 ? 1 : -1, lane = voie(b.R, V.type.id);
        const occupe = C.vehicules.some(W => W !== V && W.R === b.R && W.dir === dir && Math.abs(W.s - b.s) < PLACE * .6);
        if (!occupe) pris = { R: b.R, dir, s: b.s, lane };
      }
      if (pris) { V.R = pris.R; V.dir = pris.dir; V.s = pris.s; V.lane = V.laneN = pris.lane; V.contour = null; V.laneVise = undefined; }
      // Impasse, ou sens unique sans suite. Le faire réapparaître ailleurs évite la navette dans les petites rues,
      // mais les joueurs voyaient des voitures s'évaporer devant eux : on ne le retire que de dos ou de loin, et
      // sous les yeux du joueur il fait demi-tour, ce qui est de toute façon ce qu'on ferait.
      else if (horsDeVue(J, V.px, V.pz)) { V.R = null; continue; } // impasse, ou pas de place au carrefour
      else { V.dir = -V.dir; V.s = THREE.MathUtils.clamp(V.s, .5, V.R.len - .5); V.v = 0; V.lane = V.laneN = voie(V.R, V.type.id); V.contour = null; V.laneVise = undefined; }
    }
    let p = poser(V.R, V.s, V.dir), x = p.x - p.dz * V.lane, z = p.z + p.dx * V.lane;
    // En se décalant, le capot se tourne un peu vers où il va (au plus 26°).
    const derive = (V.lane - lane0) / Math.max(dt, 1e-3), psi = THREE.MathUtils.clamp(Math.atan2(derive, Math.max(1.5, V.v)), -.45, .45);
    let fx = p.dx * Math.cos(psi) - p.dz * Math.sin(psi), fz = p.dz * Math.cos(psi) + p.dx * Math.sin(psi);
    // Garde-fou : le freinage est progressif (9 m/s² au plus). Il faut 9 m à une voiture lancée à 47 km/h pour
    // s'arrêter, et le joueur qui pose le pied sur la chaussée juste devant elle se faisait traverser. Au contact,
    // elle s'arrête net et attend qu'il s'écarte. On revient sur la rue d'avant, pas seulement au point d'avant :
    // au carrefour, celle qui venait de tourner gardait sa nouvelle rue et traversait le joueur (les joueurs l'ont
    // signalé : « elle passe en toi »). La boîte du joueur est maintenant la vraie (rectangle orienté, trafic.js
    // chevauchement), et non un carré de son plus grand côté : à côté d'un taxi arrêté, il y a la place de passer.
    if (dansObstacles(V, x, z, Math.atan2(fx, fz), obst) > dansObstacles(V, V.px, V.pz, V.cap, obst) + 1e-3) {
      V.R = R0; V.s = s0; V.lane = lane0; V.v = 0; p = poser(V.R, V.s, V.dir); x = p.x - p.dz * V.lane; z = p.z + p.dx * V.lane; fx = p.dx; fz = p.dz;
    }
    // Retenu par un obstacle : au bout de 0,6 s, il cherche par où passer (voieDeContour) ; sans place pendant 8 s (le temps
    // que passent ceux d'en face, ou si le joueur, coincé, le lui demande : desserrer), il fait demi-tour s'il le peut ; hors de la vue du joueur, il
    // va plutôt rouler ailleurs. Sinon il attend : il ne s'évapore plus sous ses yeux.
    const barre = !!gene && gene.ecart < 4 && V.v < .3 && !V.contour;
    if (barre) {
      V.bloque = (V.bloque || 0) + dt; V.essai = (V.essai || 0) - dt;
      if (V.bloque > .6 && V.essai <= 0) {
        V.essai = .5;
        const l = voieDeContour(V, gene, obst);
        if (l !== null) { V.contour = { x: gene.O.x, z: gene.O.z, cap: gene.O.cap, hl: gene.O.hl, hw: gene.O.hw }; V.laneVise = l; V.bloque = 0; }
        else if (V.bloque > 8 || V.cede) {
          V.cede = false;
          if (horsDeVue(J, x, z)) { V.bloque = 0; V.R = null; V.ailleurs = true; continue; }
          if (demiTourPossible(V, obst)) continue;
        }
      }
    } else V.bloque = 0;
    if (V.cede && V.v < .3 && !barre) { V.cede = false; if (demiTourPossible(V, obst)) continue; } // le joueur, coincé derrière lui, attend qu'il dégage
    // Deux voitures qui s'attendent au milieu d'un carrefour (chacune croit l'autre devant elle) : au bout de 12 s,
    // celle que le joueur ne voit pas s'en va ailleurs.
    V.arretT = V.v < .3 ? (V.arretT || 0) + dt : 0;
    if (V.arretT > 12 && !barre && horsDeVue(J, x, z)) { V.arretT = 0; V.R = null; continue; }
    // Pas de file : celui que les autres ralentissent de moitié plus de 3 s, loin des yeux du joueur, s'en va ailleurs.
    V.fileT = viseVeh < V.vmax * .5 ? (V.fileT || 0) + dt : 0;
    if (V.fileT > 3 && !barre && !V.contour && horsDeVue(J, x, z)) { V.fileT = 0; V.R = null; continue; }
    V.px = x; V.pz = z; V.fx = fx; V.fz = fz; V.cap = Math.atan2(fx, fz);
    if ((x - J.x) ** 2 + (z - J.z) ** 2 < 1600) E.circulation.push(V); // solide près du joueur (trafic.js, dansCirculation)
  }
  desserrer(dt, J);
  // Les matrices : chacun à sa place, ceux qui n'ont pas de rue cachés.
  for (const V of C.vehicules) {
    if (!V.R) { m4.compose(pos.set(0, -50, 0), q.identity(), zero); V.mesh.setMatrixAt(V.idx, m4); continue; }
    q.setFromAxisAngle(Y, Math.atan2(-V.fz, V.fx)); m4.compose(pos.set(V.px, .04, V.pz), q, V.part > 0 ? echelle.setScalar(V.part / FONDU) : un); V.mesh.setMatrixAt(V.idx, m4);
  }
  for (const ms of C.meshes.values()) for (const m of ms) m.instanceMatrix.needsUpdate = true;
}
/**
 * Le joueur pousse et n'avance pas : on desserre l'embouteillage devant lui.
 *
 * Un testeur s'est retrouvé « coincé entre les voitures, il ne pouvait même pas avancer, il a dû descendre et
 * prendre un zém ». Le garde-fou qui existait ne traitait que le cas inverse — un véhicule que le joueur
 * bloque. Quand c'est lui qui est pris dans la file, chacun attend celui de devant et plus rien ne bouge.
 *
 * Toutes les 0,8 s, on prend un véhicule à l'arrêt, ceux qui sont devant lui d'abord. Hors de sa vue, il s'en va
 * rouler ailleurs. Sous ses yeux, il ne se rétracte plus (« qu'elles ne disparaissent pas », testeur, 04/11) : il
 * cherche tout de suite à faire demi-tour (cede, majCirculation). En tout dernier recours seulement — coincé depuis
 * 20 s, rien n'a pu bouger —, il se rétracte et s'en va : rester coincé est pire.
 */
let depuis = 0;
function desserrer(dt, J) {
  const t = J.coince || 0;
  if (t < 3) { depuis = 0; return; }
  depuis += dt; if (depuis < .8) return; depuis = 0;
  // Les zéms et tokpas de toute la ville (trafic.js) sont un autre système : eux aussi peuvent le coincer, et
  // même lui monter dessus. On les écarte d'abord : ceux qu'il voit se décalent, les autres sautent plus loin.
  if (degagerAutourDuJoueur(J, t > 20)) return;
  const s = Math.sin(J.cap ?? 0), c = Math.cos(J.cap ?? 0);
  let pris = null, score = -1;
  for (const V of C.vehicules) {
    if (!V.R || V.part > 0 || V.demi || V.v > .5) continue; // pas celui qui s'en va ou fait déjà demi-tour
    const ax = V.px - J.x, az = V.pz - J.z, d = Math.hypot(ax, az); if (d > 50) continue;
    // Ceux qui barrent vraiment la route d'abord : devant lui, dans son axe. Puis, de préférence, hors de vue —
    // la file se vide par la tête, là où il ne regarde pas.
    const devant = (ax * s + az * c) / (d || 1);
    const barre = devant > .35 ? 2000 : 0;
    if (!barre && t < 10) continue; // au début, on ne touche qu'à ceux qui sont devant lui
    const note = barre + (horsDeVue(J, V.px, V.pz) ? 500 : 0) + (t > 10 ? 50 - d : d);
    if (note > score) { score = note; pris = V; }
  }
  if (!pris) return;
  if (horsDeVue(J, pris.px, pris.pz)) { pris.R = null; pris.ailleurs = true; } // personne ne le voit partir
  else if (t > 20) partir(pris, J); // il se rétracte, et revient loin
  else { pris.cede = true; pris.essai = 0; }
}
export function cacherCirculation() { C.actif = false; for (const ms of C.meshes.values()) for (const m of ms) m.visible = false; for (const V of C.vehicules) V.R = null; }
/** Combien de véhicules roulent à moins de r mètres de (x, z) (pour le bruit de la circulation, ambiance-salon.js). */
export function densiteCirculation(x, z, r = 60) { let n = 0; for (const V of C.vehicules) if (V.R && Math.abs(V.px - x) < r && Math.abs(V.pz - z) < r) n += 2.5; return n; } // 40 au lieu de 110 : chacun compte pour plus, le bruit de la rue ne baisse pas
if (import.meta.env.DEV) window.__circulation = C;
