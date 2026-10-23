import * as THREE from 'three';
import { B3, C3, matVeh, partsVelo, partsVoiture, partsZem } from './vehicules.js';
import { E } from './etat.js';
import { LITE } from './base.js';
import { mergeColored, roadLines } from './ville.js';
import { scene } from './scene.js';

// ---------- La circulation autour du joueur (« Vivre à Cotonou ») ----------
// Les zems de toute la ville (trafic.js) sont trop clairsemés là où l'on marche : ici, une circulation dense, seulement
// autour du joueur — voitures de toutes les couleurs, taxis jaunes, camions, vélos et zems. Chacun suit sa rue (à droite
// sur une rue à double sens, réparti sur la largeur d'un boulevard à sens unique), passe à la rue suivante au carrefour,
// garde ses distances avec celui de devant, et s'arrête si le joueur est devant lui. Loin du joueur, il réapparaît sur une
// rue proche. Comme ceux de trafic.js, ils sont solides : E.circulation (dansCirculation).

const N = LITE ? 50 : 110, LOIN = 300, CELL = 150, POIDS = c => (c <= 2 ? 5 : c === 3 ? 3 : c === 4 ? 2 : 1); // plus de monde sur les grands axes
const TYPES = [ // part de la circulation, vitesse (m/s), demi-longueur et demi-largeur (pour les collisions)
  { id: 'voiture', part: .4, v: [8, 13], hl: 2.15, hw: .9 },
  { id: 'zem', part: .28, v: [8, 12], hl: 1.05, hw: .42 },
  { id: 'taxi', part: .1, v: [8, 12], hl: 2.15, hw: .9 },
  { id: 'camion', part: .1, v: [6, 9], hl: 3.8, hw: 1.2 },
  { id: 'velo', part: .12, v: [3, 5], hl: .9, hw: .3 },
];
const COULEURS = ['#e8e8e4', '#9da3a6', '#1f2326', '#7b2a2a', '#2c4a6e', '#c9c9c4'];
const C = { pret: false, meshes: new Map(), vehicules: [], grille: null, bouts: null, actif: false };
const hasard = (a, b) => a + Math.random() * (b - a);

// ---------- Les modèles (même repère que vehicules.js : l'avant vers +x) ----------
function partsCamion() {
  const P = [], add = (g, hex) => P.push([g, hex]), caisse = ['#2f6fb0', '#c8553d', '#e3b21c', '#3a7d44'][Math.floor(Math.random() * 4)];
  add(B3(2, 2, 2.3).translate(2.6, 1.45, 0), '#d9d6cf'); add(B3(.08, .8, 2).translate(3.62, 1.9, 0), '#2e3a40'); // cabine, pare-brise
  add(B3(5.2, 2.6, 2.4).translate(-1.1, 1.85, 0), caisse); add(B3(7.6, .3, 2.2).translate(.2, .55, 0), '#3a3530'); // caisse, châssis
  for (const x of [2.7, -.6, -2.6]) for (const z of [1.05, -1.05]) add(C3(.48, .48, .32, 12).rotateX(Math.PI / 2).translate(x, .48, z), '#1c1c1e');
  for (const z of [.75, -.75]) add(B3(.05, .16, .34).translate(3.62, 1.05, z), '#f4efd8');
  return P;
}
function maillages() {
  const def = [
    ['voiture', 0], ['voiture', 1], ['voiture', 2], ['voiture', 3], ['voiture', 4], ['voiture', 5],
    ['taxi', 0], ['zem', 0], ['camion', 0], ['camion', 1], ['velo', 0], ['velo', 1],
  ];
  for (const [t, k] of def) {
    // Un vélo sur deux est un Koin Koin (cadre blanc, jantes bleues, le canard) ; l'autre, un vélo comme on en croise partout.
    const velo = k === 0 ? { pilote: true, haut: '#e8e8e4' } : { pilote: true, canard: false, casque: false, cadre: '#2f6fb0', jante: '#9aa1a7', haut: '#d9a521' };
    const parts = t === 'voiture' ? partsVoiture(COULEURS[k]) : t === 'taxi' ? partsVoiture('#f2c21b') : t === 'zem' ? partsZem({ passager: '#2f6fb0' }) : t === 'camion' ? partsCamion() : partsVelo(velo);
    const m = new THREE.InstancedMesh(mergeColored(parts), matVeh, N); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; m.castShadow = !LITE; m.visible = false;
    scene.add(m); (C.meshes.get(t) || C.meshes.set(t, []).get(t)).push(m);
  }
}
// Les rues (et leurs bouts, pour passer de l'une à l'autre au carrefour), rangées par cases.
function indexer() {
  C.grille = new Map(); C.bouts = new Map();
  const cleBout = (x, z) => Math.round(x / 3) + ',' + Math.round(z / 3);
  roadLines.forEach((L, li) => {
    if (L.bridge || L.cls > 5 || L.pts.length < 2) return;
    const cum = [0]; for (let j = 1; j < L.pts.length; j++) cum.push(cum[j - 1] + Math.hypot(L.pts[j][0] - L.pts[j - 1][0], L.pts[j][1] - L.pts[j - 1][1]));
    const R = { L, li, cum, len: cum[cum.length - 1], hw: (L.w || 6) / 2, sens: !!L.sens }; if (R.len < 15) return; L._circ = R;
    for (let j = 0; j < L.pts.length; j += 2) { const k = Math.floor(L.pts[j][0] / CELL) + ',' + Math.floor(L.pts[j][1] / CELL); let l = C.grille.get(k); if (!l) C.grille.set(k, l = new Set()); l.add(R); }
    for (const [fin, p] of [[0, L.pts[0]], [1, L.pts[L.pts.length - 1]]]) { const k = cleBout(p[0], p[1]); let l = C.bouts.get(k); if (!l) C.bouts.set(k, l = []); l.push({ R, fin }); }
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
  return type === 'velo' ? Math.max(.6, R.hw - .9) : Math.min(2, R.hw * .45);
}
/** Le joueur J (un point, rayon r) est-il dans l'emprise d'un véhicule posé en (x, z), orienté cap, de demi-longueur hl
 *  et de demi-largeur hw ? Même boîte que dansCirculation (trafic.js). */
const toucheJoueur = (J, x, z, cap, hl, hw, r = .45) => {
  const dx = J.x - x, dz = J.z - z, s = Math.sin(cap), c = Math.cos(cap);
  return Math.abs(dx * s + dz * c) < hl + r && Math.abs(dx * c - dz * s) < hw + r;
};
/** Une place sur une rue à distance [rMin, rMax] du joueur, ou null. */
function placer(V, jx, jz, rMin, rMax) {
  for (let essai = 0; essai < 12; essai++) {
    const a = Math.random() * Math.PI * 2, d = hasard(rMin, rMax), x = jx + Math.cos(a) * d, z = jz + Math.sin(a) * d;
    const l = C.grille.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!l || !l.size) continue;
    const routes = [...l], tot = routes.reduce((t, r) => t + POIDS(r.L.cls), 0); let u = Math.random() * tot, R = routes[0];
    for (const r of routes) { u -= POIDS(r.L.cls); if (u <= 0) { R = r; break; } }
    V.R = R; V.dir = R.sens ? 1 : Math.random() < .5 ? 1 : -1; V.s = Math.random() * R.len; V.lane = voie(R, V.type.id);
    const p = poser(R, V.s, V.dir), dj = Math.hypot(p.x - jx, p.z - jz); if (dj < rMin * .7 || dj > rMax * 1.2) continue;
    V.v = hasard(...V.type.v); V.vmax = V.v; return true;
  }
  return false;
}
function creer() {
  maillages(); indexer();
  let k = 0;
  for (const T of TYPES) for (let i = 0; i < Math.round(N * T.part); i++) {
    const ms = C.meshes.get(T.id), mesh = ms[k++ % ms.length];
    C.vehicules.push({ type: T, mesh, idx: mesh.count++, R: null, s: 0, dir: 1, lane: 0, v: 0, vmax: 0, hl: T.hl, hw: T.hw, px: 0, pz: 0, fx: 0, fz: 1, cap: 0 });
  }
  C.pret = true;
}
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), un = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);

/** À chaque image du salon : `J` la position du joueur (à pied ou en véhicule), ou null (dedans : rien à montrer). */
export function majCirculation(dt, J) {
  if (!roadLines.length) return;
  if (!C.pret) creer();
  const visible = !!J; if (visible !== C.actif) { C.actif = visible; for (const ms of C.meshes.values()) for (const m of ms) m.visible = visible; }
  if (!visible) return;
  const Jr = Math.max(J.hl ?? .3, J.hw ?? .3); // rayon du joueur : un piéton, ou la voiture qu'il conduit
  for (const V of C.vehicules) {
    if (!V.R || Math.hypot(V.px - J.x, V.pz - J.z) > LOIN) { if (!placer(V, J.x, J.z, V.R ? 150 : 20, V.R ? 260 : 240)) { V.R = null; continue; } } // réapparaît hors de vue
    // Garder ses distances : celui de devant, sur la même rue et dans le même sens ; et le joueur devant soi.
    let vise = V.vmax;
    for (const W of C.vehicules) {
      if (W === V || W.R !== V.R || W.dir !== V.dir || Math.abs(W.lane - V.lane) > 1.6) continue;
      const ecart = (W.s - V.s) * V.dir - W.hl - V.hl; if (ecart > 0 && ecart < 14) vise = Math.min(vise, ecart < 3 ? 0 : W.v * (ecart / 14));
    }
    const ax = J.x - V.px, az = J.z - V.pz, devant = ax * V.fx + az * V.fz, cote = Math.abs(ax * V.fz - az * V.fx);
    if (devant > 0 && devant < V.hl + Jr + 12 && cote < V.hw + Jr + .7) vise = Math.min(vise, Math.max(0, (devant - V.hl - Jr - 2) * 1.1)); // freine à temps : arrêt à 2 m de son pare-chocs
    const R0 = V.R, s0 = V.s; // pour le garde-fou plus bas
    V.v += THREE.MathUtils.clamp(vise - V.v, -9 * dt, 3 * dt);
    V.s += V.v * dt * V.dir;
    if (V.s < 0 || V.s > V.R.len) { // au bout de la rue : la suivante (au carrefour), sinon demi-tour
      const bout = V.s < 0 ? 0 : 1, p = bout ? V.R.L.pts[V.R.L.pts.length - 1] : V.R.L.pts[0];
      const suite = (C.bouts.get(C.cleBout(p[0], p[1])) || []).filter(b => b.R !== V.R && (!b.R.sens || b.fin === 0));
      if (suite.length) { const b = suite[Math.floor(Math.random() * suite.length)]; V.R = b.R; V.dir = b.fin === 0 ? 1 : -1; V.s = b.fin === 0 ? .5 : b.R.len - .5; V.lane = voie(b.R, V.type.id); }
      else if (V.R.sens) { V.R = null; continue; }
      // Au bout d'une impasse, il ne fait plus demi-tour : il réapparaît ailleurs. Avant, dans une petite rue sans
      // issue, toute la circulation faisait la navette au même endroit, et ceux qui revenaient roulaient dans la file
      // de ceux qui arrivaient.
      else { V.R = null; continue; }
    }
    let p = poser(V.R, V.s, V.dir), x = p.x - p.dz * V.lane, z = p.z + p.dx * V.lane;
    // Garde-fou : le freinage est progressif (9 m/s² au plus). Il faut 9 m à une voiture lancée à 47 km/h pour
    // s'arrêter, et le joueur qui pose le pied sur la chaussée juste devant elle se faisait traverser. Au contact,
    // elle s'arrête net et attend qu'il s'écarte (sauf au carrefour, où elle vient de changer de rue).
    if (V.R === R0 && toucheJoueur(J, x, z, Math.atan2(p.dx, p.dz), V.hl, V.hw, Jr + .2)) {
      V.s = s0; V.v = 0; p = poser(V.R, V.s, V.dir); x = p.x - p.dz * V.lane; z = p.z + p.dx * V.lane;
    }
    // Jamais de bouchon sans fin : un véhicule que le joueur retient depuis 5 s s'en va, il réapparaît hors de vue.
    // Sinon, collés devant et derrière lui, ils attendaient qu'il parte pendant qu'il ne pouvait plus bouger.
    if (V.v < .3 && Math.hypot(x - J.x, z - J.z) < V.hl + Jr + 5) { V.bloque = (V.bloque || 0) + dt; if (V.bloque > 5) { V.bloque = 0; V.R = null; continue; } }
    else V.bloque = 0;
    V.px = x; V.pz = z; V.fx = p.dx; V.fz = p.dz; V.cap = Math.atan2(p.dx, p.dz);
    if ((x - J.x) ** 2 + (z - J.z) ** 2 < 1600) E.circulation.push(V); // solide près du joueur (trafic.js, dansCirculation)
  }
  // Les matrices : chacun à sa place, ceux qui n'ont pas de rue cachés.
  for (const V of C.vehicules) {
    if (!V.R) { m4.compose(pos.set(0, -50, 0), q.identity(), zero); V.mesh.setMatrixAt(V.idx, m4); continue; }
    q.setFromAxisAngle(Y, Math.atan2(-V.fz, V.fx)); m4.compose(pos.set(V.px, .04, V.pz), q, un); V.mesh.setMatrixAt(V.idx, m4);
  }
  for (const ms of C.meshes.values()) for (const m of ms) m.instanceMatrix.needsUpdate = true;
}
export function cacherCirculation() { C.actif = false; for (const ms of C.meshes.values()) for (const m of ms) m.visible = false; for (const V of C.vehicules) V.R = null; }
/** Combien de véhicules roulent à moins de r mètres de (x, z) (pour le bruit de la circulation, ambiance-salon.js). */
export function densiteCirculation(x, z, r = 60) { let n = 0; for (const V of C.vehicules) if (V.R && Math.abs(V.px - x) < r && Math.abs(V.pz - z) < r) n += V.type.id === 'velo' ? .2 : V.type.id === 'camion' ? 2 : 1; return n; }
if (import.meta.env.DEV) window.__circulation = C;
