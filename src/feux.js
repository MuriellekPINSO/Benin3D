import * as THREE from 'three';
import { LITE } from './base.js';
import { COUCHES_SOL, scene } from './scene.js';
import { roadLines } from './ville.js';

// ---------- Feux tricolores et passages piétons réels ----------
// Positions d'OpenStreetMap (highway=traffic_signals : 81 feux ; highway=crossing : passages
// piétons), exportées par scripts/donnees.mjs dans L.feux et L.passages. Chaque feu est posé sur
// la rue la plus proche : un poteau de chaque côté, tête tournée vers ceux qui arrivent, et des
// bandes blanches en travers. Les rues orientées est-ouest et nord-sud alternent : quand l'une est
// au vert, celle qui la croise est au rouge. En jeu, ce sont les feux du jeu (regles.js) qui comptent.

export const FEUX = { noeuds: [], groupe: null, mats: null, tete: [] };
const TOUR = 30, VERT = 12, ORANGE = 3; // phase A : vert 0–12, orange 12–15, rouge 15–30 ; phase B décalée de 15 s

/** Rue la plus proche d'un point : direction (unitaire) et largeur, ou null au-delà de 25 m. */
export function rueProche(x, z, max = 25, clsMax = 4) {
  let best = null, bd = max;
  for (const L of roadLines) {
    if (L.bridge || L.cls > clsMax) continue;
    for (let i = 1; i < L.pts.length; i++) {
      const [ax, az] = L.pts[i - 1], [bx, bz] = L.pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; if (!l2) continue;
      if (Math.min(ax, bx) - bd > x || Math.max(ax, bx) + bd < x || Math.min(az, bz) - bd > z || Math.max(az, bz) + bd < z) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < bd) { const l = Math.sqrt(l2); bd = d; best = { dx: dx / l, dz: dz / l, w: L.w ?? 8, cls: L.cls, x: ax + dx * t, z: az + dz * t }; }
    }
  }
  return best;
}

/** Construit les feux et les passages piétons de la ville. */
export function construireFeux(feux = [], passages = []) {
  const poteaux = [], tetes = [], zebras = [];
  // Plusieurs nœuds OSM pour un même carrefour : un feu tous les 12 m au plus.
  const pris = [];
  for (const [x, z] of feux) {
    if (pris.some(([px, pz]) => Math.hypot(px - x, pz - z) < 12)) continue; pris.push([x, z]);
    const r = rueProche(x, z); if (!r) continue;
    const rx = -r.dz, rz = r.dx, phase = Math.abs(r.dx) >= Math.abs(r.dz) ? 0 : 1; // côté droit du sens +d ; est-ouest ou nord-sud
    for (const s of [1, -1]) { // un poteau pour chaque sens de circulation
      const off = r.w / 2 + 1.1, px = r.x + rx * off * s, pz = r.z + rz * off * s;
      poteaux.push([px, pz]);
      const fx = -r.dx * s, fz = -r.dz * s; // la tête regarde ceux qui arrivent
      tetes.push({ x: px - rx * s * .9, z: pz - rz * s * .9, ang: Math.atan2(fx, fz), phase });
    }
    zebras.push({ x: r.x - r.dx * 7, z: r.z - r.dz * 7, ...r }, { x: r.x + r.dx * 7, z: r.z + r.dz * 7, ...r });
    FEUX.noeuds.push({ x: r.x, z: r.z, dx: r.dx, dz: r.dz, phase });
  }
  for (const [x, z] of passages) { const r = rueProche(x, z, 15); if (r) zebras.push({ ...r }); }
  const g = new THREE.Group(); g.name = 'feux'; scene.add(g); FEUX.groupe = g;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), un = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
  const gris = new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: .6, metalness: .3 });
  // Poteaux de 5,6 m avec potence vers la chaussée.
  const potG = new THREE.CylinderGeometry(.09, .12, 5.6, 6).translate(0, 2.8, 0), pot = new THREE.InstancedMesh(potG, gris, poteaux.length);
  poteaux.forEach(([x, z], k) => { m4.compose(v.set(x, 0, z), q.identity(), un); pot.setMatrixAt(k, m4); });
  pot.castShadow = !LITE; g.add(pot);
  // Têtes : boîtier sombre et trois disques ; matériaux par phase et par couleur, animés par majFeuxVille.
  const boite = new THREE.InstancedMesh(new THREE.BoxGeometry(.42, 1.25, .28).translate(0, 4.9, 0), gris, tetes.length);
  tetes.forEach((t, k) => { m4.compose(v.set(t.x, 0, t.z), q.setFromAxisAngle(Y, t.ang), un); boite.setMatrixAt(k, m4); });
  g.add(boite);
  const COUL = { rouge: '#ff2a1a', orange: '#ffae1a', vert: '#2bff6a' }, HAUT = { rouge: 5.3, orange: 4.9, vert: 4.5 };
  FEUX.mats = [0, 1].map(() => Object.fromEntries(Object.entries(COUL).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: '#1c1c1c', emissive: c, emissiveIntensity: 0 })])));
  for (const ph of [0, 1]) for (const k of Object.keys(COUL)) {
    const liste = tetes.filter(t => t.phase === ph); if (!liste.length) continue;
    const disque = new THREE.InstancedMesh(new THREE.CircleGeometry(.14, 14).translate(0, HAUT[k], .145), FEUX.mats[ph][k], liste.length);
    liste.forEach((t, i) => { m4.compose(v.set(t.x, 0, t.z), q.setFromAxisAngle(Y, t.ang), un); disque.setMatrixAt(i, m4); });
    g.add(disque);
  }
  // Passages piétons : bandes blanches de 0,5 m, longues de 3 m dans le sens de la rue, sur toute la largeur.
  const bandes = [];
  for (const r of zebras) { const rx = -r.dz, rz = r.dx, n = Math.max(3, Math.floor(r.w / 1)); for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 1; bandes.push([r.x + rx * o, r.z + rz * o, Math.atan2(r.dx, r.dz)]); } }
  if (bandes.length) {
    const zb = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, .02, 3), new THREE.MeshLambertMaterial({ color: '#f1f0ea', depthWrite: false }), bandes.length);
    bandes.forEach(([x, z, a], k) => { m4.compose(v.set(x, .07, z), q.setFromAxisAngle(Y, a), un); zb.setMatrixAt(k, m4); });
    zb.renderOrder = 7.9; zb.receiveShadow = true; zb.userData.route = true; scene.add(zb); COUCHES_SOL.push(zb);
  }
  console.info(`feux : ${FEUX.noeuds.length} carrefours à feux, ${tetes.length} têtes, ${bandes.length} bandes de passages piétons`);
}

/** À chaque image : le cycle des feux (hors jeu ; en jeu, ce sont les feux du jeu qui comptent). */
export function majFeuxVille(t, enJeu) {
  if (!FEUX.groupe) return;
  FEUX.groupe.visible = !enJeu;
  if (enJeu) return;
  for (const ph of [0, 1]) {
    const u = ((t + ph * 15) % TOUR + TOUR) % TOUR, e = u < VERT ? 'vert' : u < VERT + ORANGE ? 'orange' : 'rouge';
    for (const k of ['rouge', 'orange', 'vert']) FEUX.mats[ph][k].emissiveIntensity = k === e ? 2.2 : 0;
  }
}
