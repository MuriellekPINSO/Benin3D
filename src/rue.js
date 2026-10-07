import * as THREE from 'three';
import { dansTerrePlein } from './terre-pleins.js';
import { LITE, hash, toXZ } from './base.js';
import { camera, controls, scene } from './scene.js';
import { ROAD_W, roadLines } from './ville.js';
import { texFacades } from './facades.js';
import { CAMPAGNES, campagne, matAffiche } from './publicites.js';

// Habillage des rues, d'après les vues Street View de Cotonou (2026) : dans une vraie
// rue, il n'y a pas de sable vide entre la chaussée et les maisons. Les parcelles
// sont fermées par des murs de clôture (rouge sombre, ocre, beige, blanc) percés de
// portails en tôle ; le long des grands axes, des boutiques au rideau métallique, des
// trottoirs pavés, des lampadaires solaires et de grands panneaux publicitaires.
//
// L'habillage est généré par carrés de 400 m autour de la caméra quand on est assez
// près, puis libéré quand on s'éloigne.

const CARRE = 400;
const TROTTOIR = { 0: 4, 1: 3.5, 2: 3, 3: 2.2, 4: 1.3, 5: .9 };
const R = { carres: new Map(), file: [], B: null, grilleB: null, grilleR: null, zonesLibres: [], zonesJeu: [], routeJeu: null, actif: true };

// ---------- Index spatiaux ----------
const CB = 50, CR = 40;
const cle = (x, z, c) => Math.floor(x / c) + ',' + Math.floor(z / c);
function indexer(data) {
  const B = data.B, N = B.n.length, off = new Uint32Array(N + 1);
  for (let i = 0; i < N; i++) off[i + 1] = off[i] + B.n[i] * 2;
  const bb = new Float32Array(N * 4), g = new Map();
  for (let i = 0; i < N; i++) {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let j = 0; j < B.n[i]; j++) { const x = (B.x[i] + B.p[off[i] + 2 * j]) / 10, z = (B.z[i] + B.p[off[i] + 2 * j + 1]) / 10; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    bb.set([x0, z0, x1, z1], i * 4);
    for (let cx = Math.floor(x0 / CB); cx <= Math.floor(x1 / CB); cx++) for (let cz = Math.floor(z0 / CB); cz <= Math.floor(z1 / CB); cz++) { const k = cx + ',' + cz; if (!g.has(k)) g.set(k, []); g.get(k).push(i); }
  }
  R.B = { B, off, bb }; R.grilleB = g;
  const gr = new Map();
  roadLines.forEach((L, li) => {
    if (L.cls > 6 && L.cls !== 9) return;
    const hw = (L.w ?? ROAD_W[L.cls] ?? 4) / 2;
    for (let i = 1; i < L.pts.length; i++) {
      const a = L.pts[i - 1], b = L.pts[i];
      for (let cx = Math.floor((Math.min(a[0], b[0]) - hw) / CR); cx <= Math.floor((Math.max(a[0], b[0]) + hw) / CR); cx++)
        for (let cz = Math.floor((Math.min(a[1], b[1]) - hw) / CR); cz <= Math.floor((Math.max(a[1], b[1]) + hw) / CR); cz++) { const k = cx + ',' + cz; if (!gr.has(k)) gr.set(k, []); gr.get(k).push([li, a[0], a[1], b[0], b[1], hw]); }
    }
  });
  R.grilleR = gr;
  // Grandes places et monuments reconstruits : on n'y pose pas de murs.
  const L = data.L;
  const zone = (x, z, r) => R.zonesLibres.push([x, z, r]);
  const c = r => r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]);
  if (L.etoile) { const [x, z] = c(L.etoile.ring); zone(x, z, 105); }
  if (L.amazone) zone(L.amazone.pt[0], L.amazone.pt[1], 140);
  if (L.marina) { const [x, z] = c(L.marina); zone(x, z, 160); }
  if (L.congres) { const [x, z] = c(L.congres.outer.flat()); zone(x, z, 150); }
  if (L.stade) { const [x, z] = c(L.stade.pitch); zone(x, z, 190); }
  for (const r of L.dantokpa || []) { const [x, z] = c(r); zone(x, z, 380); }
  if (L.port) for (const [x, z] of L.port.cranes) zone(x, z, 450);
  if (L.ouidah) { zone(L.ouidah.porte[0], L.ouidah.porte[1], 160); zone(L.ouidah.arene[0], L.ouidah.arene[1], 160); }
  for (const [la, lo, r] of [[6.35015, 2.38752, 60], [6.35231, 2.38605, 45],
    // Boulevard de la Marina (lieux-marina.js) : parking du Super U, jardin, Cité, ambassades, hôtels, MTN, Dôme, Sofitel.
    [6.3496, 2.3871, 78], [6.3507, 2.4069, 120], [6.3511, 2.4046, 175], [6.3508, 2.4030, 75], [6.3490, 2.4033, 70], [6.3488, 2.4012, 150],
    [6.34943, 2.39872, 45], [6.35058, 2.39921, 38], [6.34980, 2.39668, 50], [6.35037, 2.39581, 36], [6.3497, 2.3942, 150],
    [6.3532, 2.4268, 75], [6.35085, 2.41977, 40], [6.35453, 2.43723, 85], [6.35385, 2.40458, 70]]) { const [x, z] = toXZ(la, lo); zone(x, z, r); }
  // Le mur peint du port : pas de murs ni de maisons devant les fresques.
  const mp = L.marinaLieux?.murPort;
  if (mp) for (let i = 1; i < mp.length; i++) { const [ax, az] = mp[i - 1], [bx, bz] = mp[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 25); for (let k = 0; k <= n; k++) zone(ax + (bx - ax) * k / n, az + (bz - az) * k / n, 16); }
  // Aéroport : piste et aires de stationnement, sans murs de parcelles.
  if (L.aero) {
    const rw = L.aero.runway;
    for (let i = 1; i < rw.length; i++) { const [ax, az] = rw[i - 1], [bx, bz] = rw[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 80); for (let k = 0; k <= n; k++) zone(ax + (bx - ax) * k / n, az + (bz - az) * k / n, 170); }
    for (const t of L.aero.terminals) { const [x, z] = c(t); zone(x, z, 120); }
    for (const s of L.aero.stands) zone(s.pts[0][0], s.pts[0][1], 90);
  }
}
function dansBatiment(x, z) {
  const l = R.grilleB.get(cle(x, z, CB)); if (!l) return false;
  const { B, off, bb } = R.B;
  for (const i of l) {
    if (typeof i === 'object') { // emprise Google Open Buildings (anneau absolu, en mètres)
      const b2 = i.bb; if (x < b2[0] || x > b2[2] || z < b2[1] || z > b2[3]) continue;
      const r = i.r, n = r.length / 2; let dd = false;
      for (let a = 0, j = n - 1; a < n; j = a++) { const xa = r[2 * a], za = r[2 * a + 1], xj = r[2 * j], zj = r[2 * j + 1]; if ((za > z) !== (zj > z) && x < (xj - xa) * (z - za) / (zj - za) + xa) dd = !dd; }
      if (dd) return true; continue;
    }
    const o = i * 4; if (x < bb[o] || x > bb[o + 2] || z < bb[o + 1] || z > bb[o + 3]) continue;
    const n = B.n[i], cx = B.x[i] / 10, cz = B.z[i] / 10, p = B.p, b = off[i]; let dedans = false;
    for (let a = 0, j = n - 1; a < n; j = a++) {
      const xa = cx + p[b + 2 * a] / 10, za = cz + p[b + 2 * a + 1] / 10, xj = cx + p[b + 2 * j] / 10, zj = cz + p[b + 2 * j + 1] / 10;
      if ((za > z) !== (zj > z) && x < (xj - xa) * (z - za) / (zj - za) + xa) dedans = !dedans;
    }
    if (dedans) return true;
  }
  return false;
}
function presAutreRoute(x, z, li, marge) {
  const l = R.grilleR.get(cle(x, z, CR)); if (!l) return false;
  for (const [lj, ax, az, bx, bz, hw] of l) {
    if (lj === li) continue;
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    // Le trajet du jeu garde 10 m de chaque côté pour les commerces et la vie de rue.
    const h = R.routeJeu?.has(lj) ? Math.max(hw + marge, 10.4) : hw + marge;
    if (Math.hypot(ax + dx * t - x, az + dz * t - z) < h) return true;
  }
  return false;
}
const zoneLibre = (x, z) => dansTerrePlein(x, z, .6) || R.zonesLibres.some(([zx, zz, r]) => (x - zx) ** 2 + (z - zz) ** 2 < r * r) || R.zonesJeu.some(([zx, zz, r]) => (x - zx) ** 2 + (z - zz) ** 2 < r * r);

// ---------- Matières ----------
function toile(w, h, f) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; f(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }
let s0 = 7; const rnd = () => ((s0 = (s0 * 1103515245 + 12345) >>> 0) / 4294967296);
const MAT = {};
function matieres() {
  if (MAT.mur) return MAT;
  // Enduit : blanc (teinté par instance), grain, fissures, terre en pied de mur.
  MAT.mur = new THREE.MeshStandardMaterial({ roughness: .95, map: toile(256, 256, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { c.fillStyle = rnd() < .5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.08)'; c.fillRect(rnd() * w, rnd() * h, 2, 2); }
    for (let i = 0; i < 6; i++) { c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 1; c.beginPath(); let x = rnd() * w, y = rnd() * h * .7; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - .5) * 14; y += 6 + rnd() * 6; c.lineTo(x, y); } c.stroke(); }
    const g = c.createLinearGradient(0, h * .72, 0, h); g.addColorStop(0, 'rgba(120,80,45,0)'); g.addColorStop(1, 'rgba(120,80,45,.55)'); c.fillStyle = g; c.fillRect(0, h * .72, w, h * .28);
  }) });
  metrique(MAT.mur, 3, 3);
  // Parpaings nus des murs en construction (40 × 20 cm, joints de mortier).
  MAT.parpaing = new THREE.MeshStandardMaterial({ roughness: .97, map: toile(256, 128, (c, w, h) => {
    c.fillStyle = '#8e8a82'; c.fillRect(0, 0, w, h);
    const bw = w / 6, bh = h / 6;
    for (let r = 0; r < 6; r++) for (let k = -1; k < 7; k++) { const v = 150 + Math.floor(rnd() * 26); c.fillStyle = `rgb(${v},${v - 4},${v - 12})`; c.fillRect(k * bw + (r % 2 ? bw / 2 : 0) + 1.5, r * bh + 1.5, bw - 3, bh - 3); }
    for (let i = 0; i < 900; i++) { c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
  }) });
  metrique(MAT.parpaing, 2.4, 1.2);
  MAT.chaperon = new THREE.MeshStandardMaterial({ roughness: .9 });
  MAT.portail = new THREE.MeshStandardMaterial({ roughness: .5, metalness: .35, map: toile(256, 256, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 12) { c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(x, 0, 3, h); c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(x + 5, 0, 2, h); }
    c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(w / 2 - 2, 0, 4, h); c.fillRect(0, 0, w, 8); c.fillRect(0, h - 8, w, 8); c.fillRect(0, h * .45, w, 6);
    c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 4; c.strokeRect(w * .58, h * .2, w * .3, h * .72);
  }) });
  MAT.pilier = new THREE.MeshStandardMaterial({ roughness: .9 });
  MAT.trottoir = new THREE.MeshStandardMaterial({ roughness: .95, map: toile(256, 256, (c, w, h) => {
    c.fillStyle = '#8d8e8b'; c.fillRect(0, 0, w, h);
    const lx = w / 4, ly = h / 8;
    for (let r = 0; r < 8; r++) for (let k = -1; k < 5; k++) { c.fillStyle = ['#a3a49f', '#9a9b96', '#aeaea8', '#96978f'][Math.floor(rnd() * 4)]; c.fillRect(k * lx + (r % 2 ? lx / 2 : 0) + 1.5, r * ly + 1.5, lx - 3, ly - 3); }
    for (let i = 0; i < 1200; i++) { c.fillStyle = 'rgba(80,60,40,.12)'; c.fillRect(rnd() * w, rnd() * h, 2, 2); }
  }) });
  MAT.bordure = new THREE.MeshStandardMaterial({ color: '#cfccc4', roughness: .8, side: THREE.DoubleSide });
  MAT.lampe = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, metalness: .2 });
  MAT.boutique = new THREE.MeshStandardMaterial({ roughness: .8 });
  MAT.poteau = new THREE.MeshStandardMaterial({ color: '#b8b2a6', roughness: .9 });
  MAT.fil = new THREE.LineBasicMaterial({ color: '#202326' });
  MAT.voiture = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .4, metalness: .3 });
  // Inscriptions peintes sur les murs, comme partout à Cotonou.
  const TXT = ['INTERDIT D’URINER ICI', 'VENTE DE PARPAINGS', 'ATELIER DE SOUDURE', 'DIEU EST AMOUR', 'ÉCOLE PRIVÉE LES ÉTOILES', 'ICI ON VEND DU CIMENT', 'TERRAIN À VENDRE', 'COUTURE · MODE', 'GRÂCE DIVINE', 'DÉFENSE DE STATIONNER', 'LAVAGE AUTO', 'PHARMACIE À 100 M'];
  MAT.inscriptions = TXT.map((t, i) => new THREE.MeshStandardMaterial({ transparent: true, roughness: .95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, map: toile(512, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h); const col = ['#1e3a8a', '#991b1b', '#14532d', '#111827', '#7c2d12'][i % 5];
    if (i % 3 === 0) { c.fillStyle = ['#facc15', '#f8fafc', '#bfdbfe'][i % 3 === 0 ? (i / 3) % 3 : 0]; c.fillRect(6, 10, w - 12, h - 20); }
    c.fillStyle = col; c.font = '900 64px Impact, "Arial Black", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    let taille = 64; while (c.measureText(t).width > w - 30 && taille > 26) { taille -= 4; c.font = `900 ${taille}px Impact, "Arial Black", sans-serif`; }
    c.fillText(t, w / 2, h / 2 + 3);
  }) }));
  // Panneaux publicitaires 4 × 3 m : le catalogue des campagnes (publicites.js).
  MAT.pubs = CAMPAGNES.map(matAffiche);
  MAT.cadrePub = new THREE.MeshStandardMaterial({ color: '#e8e6e0', roughness: .5 });
  return MAT;
}
const COUL_MUR = ['#ece8df', '#e6d2b8', '#d8c7a6', '#f1ede4', '#e2cf95', '#d9d4c8', '#e8dcc4', '#bdbab2', '#c9934e', '#7a3b2e', '#a9c3cf', '#9fb78f', '#e3b9a0', '#d8c7a6'].map(h => new THREE.Color(h));
const TOITS = ['#8f979b', '#9aa3a8', '#7d6f62', '#8a5a44', '#a65a3e', '#6f7477'].map(h => new THREE.Color(h));
const GRIS_PARPAING = new THREE.Color('#ffffff'), TOIT_BOUTIQUE = new THREE.Color('#8f979b');
const COUL_PORTAIL = ['#8f9599', '#2f5f86', '#2f6b4a', '#7a2a24', '#2a2a2a', '#e6e4de', '#1f4f9a', '#9aa0a3'].map(h => new THREE.Color(h));
const GEO = {};
function geos() {
  if (GEO.boite) return GEO;
  GEO.boite = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0);
  GEO.plan = new THREE.PlaneGeometry(1, 1);
  GEO.cuve = new THREE.CylinderGeometry(.55, .55, 1.25, 12).translate(0, .62, 0);
  // Lampadaire solaire : mât gris, crosse, lanterne, panneau incliné au sommet.
  const parts = [];
  const add = (g, col) => { const n = g.index ? g.toNonIndexed() : g; const c = new THREE.Color(col); const a = new Float32Array(n.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } n.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(n); };
  add(new THREE.CylinderGeometry(.07, .11, 8.5, 6).translate(0, 4.25, 0), '#9aa0a3');
  add(new THREE.BoxGeometry(1.5, .08, .08).translate(.75, 7.9, 0), '#9aa0a3');
  add(new THREE.BoxGeometry(.6, .12, .26).translate(1.45, 7.82, 0), '#e7e3d6');
  add(new THREE.BoxGeometry(1.2, .05, .7).rotateZ(-.45).translate(0, 8.9, 0), '#1d3557');
  add(new THREE.BoxGeometry(.3, .3, .2).translate(0, 7.1, 0), '#d9d6cf');
  GEO.lampe = fusion(parts);
  const v = [];
  const addV = (g, col) => { const n = g.toNonIndexed(); const c = new THREE.Color(col); const a = new Float32Array(n.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } n.setAttribute('color', new THREE.BufferAttribute(a, 3)); v.push(n); };
  addV(new THREE.BoxGeometry(4.3, .7, 1.8).translate(0, .65, 0), '#ffffff');
  addV(new THREE.BoxGeometry(2.3, .6, 1.6).translate(-.2, 1.28, 0), '#2e3a40');
  for (const x of [1.35, -1.35]) for (const z of [.85, -.85]) addV(new THREE.CylinderGeometry(.32, .32, .22, 10).rotateX(Math.PI / 2).translate(x, .32, z), '#1c1c1e');
  GEO.voiture = fusion(v);
  GEO.poteau = new THREE.CylinderGeometry(.11, .16, 9, 6).translate(0, 4.5, 0);
  return GEO;
}
function fusion(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g of list) { g.computeVertexNormals(); pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}

// ---------- Génération d'un carré ----------
function decalee(pts, d) { // polyligne décalée de d mètres (côté +normale), raccords en onglet
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const d1x = p[0] - a[0], d1z = p[1] - a[1], d2x = b[0] - p[0], d2z = b[1] - p[1], l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
    const n1x = l1 ? -d1z / l1 : 0, n1z = l1 ? d1x / l1 : 0, n2x = l2 ? -d2z / l2 : 0, n2z = l2 ? d2x / l2 : 0;
    let nx = n1x + n2x, nz = n1z + n2z; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const ref = l2 ? [n2x, n2z] : [n1x, n1z], k = 1 / Math.max(.5, nx * ref[0] + nz * ref[1]);
    out.push([p[0] + nx * d * k, p[1] + nz * d * k]);
  }
  return out;
}
function echantillons(pts, pas) { // points tous les `pas` mètres, avec direction
  const out = []; let reste = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (!L) continue;
    for (let t = reste; t < L; t += pas) out.push([a[0] + dx * t / L, a[1] + dz * t / L, dx / L, dz / L]);
    reste = (reste - L) % pas; if (reste < 0) reste += pas;
  }
  return out;
}
function genererCarre(cx, cz) {
  const M = matieres(), G = geos();
  const x0 = cx * CARRE, z0 = cz * CARRE, x1 = x0 + CARRE, z1 = z0 + CARRE;
  const dedans = (x, z) => x >= x0 && x < x1 && z >= z0 && z < z1;
  const murs = [], chap = [], portails = [], piliers = [], boutiques = [], lampes = [], pubs = [], voitures = [], poteaux = [], fils = [], inscr = [], maisons = [], cuves = [];
  const occupe = new Set(), cellOcc = (x, z) => Math.floor(x / 2) + ',' + Math.floor(z / 2);
  const trot = { pos: [], uv: [], idx: [] };
  const groupe = new THREE.Group(); groupe.name = 'rue-' + cx + ',' + cz;
  const pasM = 1;
  const bordure = { pos: [], idx: [] };
  roadLines.forEach((L, li) => {
    if (L.bridge || L.cls > 5 || L.pts.length < 2) return;
    let lx0 = 1e9, lx1 = -1e9, lz0 = 1e9, lz1 = -1e9; for (const [x, z] of L.pts) { lx0 = Math.min(lx0, x); lx1 = Math.max(lx1, x); lz0 = Math.min(lz0, z); lz1 = Math.max(lz1, z); }
    if (lx1 < x0 - 20 || lx0 > x1 + 20 || lz1 < z0 - 20 || lz0 > z1 + 20) return;
    const hw = (L.w ?? ROAD_W[L.cls]) / 2, route = !!R.routeJeu?.has(li);
    const front = route ? Math.max(hw + TROTTOIR[L.cls], 9.8) : hw + TROTTOIR[L.cls];
    const sw = front - hw; // trottoir : de la chaussée jusqu'aux murs
    const grand = L.cls <= 3;
    for (const cote of [1, -1]) {
      const ligne = decalee(L.pts, cote * front), ech = echantillons(ligne, pasM);
      // 0 : rien (hors carré, carrefour, place) ; 1 : parcelle à clôturer ; 2 : un bâtiment fait déjà la façade.
      const libre = ech.map(([x, z, dx, dz]) => {
        if (!dedans(x, z)) return 0;
        if (zoneLibre(x, z) || presAutreRoute(x, z, li, 1.2)) return 0;
        const nx = -dz * cote, nz = dx * cote;
        if (dansBatiment(x, z) || dansBatiment(x + nx * .8, z + nz * .8)) return 2;
        return 1;
      });
      const n = k => { const e = ech[k]; return [-e[3] * cote, e[2] * cote]; }; // vers l'intérieur des parcelles
      // Trottoir pavé et bordure (grands axes et trajet du jeu).
      if ((grand || route) && L.surf !== 2) {
        let run = [];
        const flush = () => { if (run.length > 3) ruban(run, trot, bordure, cote, sw); run = []; };
        ech.forEach((e, k) => { if (libre[k]) run.push(e); else flush(); }); flush();
      }
      // Lampadaires solaires tous les ~30 m, en quinconce.
      if (grand) for (let k = (cote > 0 ? 0 : 15); k < ech.length; k += 30) if (libre[k]) { const [x, z] = ech[k], [nx, nz] = n(k), r = route ? .7 : sw - .5; lampes.push([x - nx * r, z - nz * r, Math.atan2(nz, -nx)]); }
      // Panneau publicitaire de temps en temps, derrière les murs, tourné vers ceux qui arrivent.
      if (L.cls <= 2 || route) for (let k = 60; k < ech.length; k += 150) if (libre[k] === 1 && libre[Math.min(ech.length - 1, k + 4)] === 1 && hash(li * 7 + k, cote + 3) < .6) {
        const [x, z, dx, dz] = ech[k], [nx, nz] = n(k), sens = hash(li + k, 2) < .5 ? 1 : -1, fx = -nx * .75 - dx * .66 * sens, fz = -nz * .75 - dz * .66 * sens;
        pubs.push([x + nx * 2.2, z + nz * 2.2, Math.atan2(fx, fz), CAMPAGNES.indexOf(campagne(hash(li + k, 9)))]);
      }
      // Poteaux électriques et fils sur les rues de quartier (un seul côté ; le jeu a les siens).
      if (cote > 0 && L.cls >= 3 && !route) { let prev = null; for (let k = 0; k < ech.length; k += 34) { if (!libre[k]) { prev = null; continue; } const [x, z] = ech[k], [nx, nz] = n(k), px = x - nx * (sw * .5 + .2), pz = z - nz * (sw * .5 + .2); poteaux.push([px, pz]); if (prev) for (const h of [8.2, 7.7]) fils.push(prev[0], h, prev[1], px, h, pz); prev = [px, pz]; } }
      // Parcelles : murs + portail, ou boutiques sur les grands axes.
      let k = 0;
      while (k < ech.length) {
        if (libre[k] !== 1) { k++; continue; }
        let fin = k; while (fin + 1 < ech.length && libre[fin + 1] === 1) fin++;
        let a = k;
        while (a <= fin) {
          const hsh = hash(li * 131 + a * 7, cote + 11);
          let lon = Math.min(fin - a + 1, Math.round((grand ? 7 : 11) + hsh * (grand ? 9 : 12)));
          if (fin - a + 1 - lon < 4) lon = fin - a + 1; // pas de bout de mur ridicule en fin de portion
          if (lon < 3) break;
          const p0 = ech[a], p1 = ech[a + lon - 1], [nx, nz] = n(a);
          const ddx = p1[0] - p0[0], ddz = p1[1] - p0[1], len = Math.hypot(ddx, ddz) + pasM;
          const ux = len > 1.5 ? ddx / (len - pasM || 1) : p0[2], uz = len > 1.5 ? ddz / (len - pasM || 1) : p0[3];
          const ang = Math.atan2(-uz, ux);
          const sx = p0[0] - ux * pasM / 2, sz = p0[1] - uz * pasM / 2; // début réel de la parcelle
          const at = (t, d = 0) => [sx + ux * t + nx * d, sz + uz * t + nz * d];
          let type = grand ? (hsh < .5 ? 'boutique' : hsh < .9 ? 'mur' : 'chantier') : (hsh < .84 ? 'mur' : hsh < .93 ? 'chantier' : 'boutique');
          const coul = COUL_MUR[Math.floor(hash(a + li, 5) * COUL_MUR.length)];
          let prof = 4 + hsh * 2;
          if (type === 'boutique') { // l'arrière ne doit pas entrer dans une maison existante
            while (prof > 2.5 && [.15, .5, .85].some(t => dansBatiment(...at(len * t, prof)))) prof -= 1;
            if (prof <= 2.5) type = 'mur';
          }
          if (type === 'boutique') {
            const [cx2, cz2] = at(len / 2, prof / 2);
            boutiques.push([cx2, cz2, ang + (cote < 0 ? Math.PI : 0), len, 3.3 + (hsh > .82 ? 3.15 : 0), prof, coul]);
          } else {
            const h = type === 'chantier' ? 1.4 + hsh : 2.2 + hsh * .5, cMur = type === 'chantier' ? GRIS_PARPAING : coul;
            // Portail en tôle : le mur s'interrompt, deux piliers l'encadrent.
            const gw = 3 + hash(a, 3) * .8, avecPortail = type === 'mur' && len > 7.5;
            const tg = avecPortail ? gw / 2 + .5 + hash(a, li % 97) * (len - gw - 1) : 0;
            const morceaux = avecPortail ? [[0, tg - gw / 2 - .22], [tg + gw / 2 + .22, len]] : [[0, len]];
            for (const [t0, t1] of morceaux) {
              if (t1 - t0 < .3) continue;
              const [mx, mz] = at((t0 + t1) / 2);
              murs.push([mx, mz, ang, t1 - t0, h, .22, cMur, type === 'chantier']);
              if (type === 'mur') chap.push([mx, mz, ang, t1 - t0 + .06, .12, .34, h]);
            }
            if (avecPortail) {
              const [gx, gz] = at(tg, .05);
              portails.push([gx, gz, ang, gw, 2.15, .08, COUL_PORTAIL[Math.floor(hash(a, 4) * COUL_PORTAIL.length)]]);
              for (const s of [-1, 1]) { const [px, pz] = at(tg + s * (gw / 2 + .22)); piliers.push([px, pz, ang, .44, h + .4, .44, coul]); }
            }
            // Inscription peinte sur le plus long morceau de mur.
            const mo = morceaux.reduce((b, m) => (m[1] - m[0] > b[1] - b[0] ? m : b));
            if (type === 'mur' && mo[1] - mo[0] > 4.5 && hash(a, 21) < (grand ? .4 : .14)) { const [ix, iz] = at((mo[0] + mo[1]) / 2, -.13); inscr.push([ix, iz, Math.atan2(-nx, -nz), Math.min(mo[1] - mo[0] - 1, 6), h * .55, Math.floor(hash(a, 22) * M.inscriptions.length)]); }
            if (!grand && !route && hash(a, 23) < .12) { const [vx, vz] = at(len / 2, -(sw + .9)); voitures.push([vx, vz, ang, Math.floor(hash(a, 24) * 6)]); }
            // Maison derrière le mur, là où OpenStreetMap n'a pas de bâtiment (le cas de la plupart des parcelles).
            if (type === 'mur' && len >= 8 && hash(a, 41) < .82) {
              const larg = Math.min(len - 2, 8 + hash(a, 43) * 6), pr = 6.5 + hash(a, 44) * 4.5, recul = 2.6 + hash(a, 42) * 2.6;
              const tc = len / 2 + (hash(a, 45) - .5) * (len - larg - 1.6);
              const echs = [];
              for (const u of [0, .5, 1]) for (const v of [0, .5, 1]) echs.push(at(tc - larg / 2 + u * larg, recul + v * pr));
              const cells = []; for (let u = 0; u <= larg; u += 2) for (let v = 0; v <= pr; v += 2) cells.push(cellOcc(...at(tc - larg / 2 + u, recul + v)));
              if (!echs.some(([x, z]) => dansBatiment(x, z) || zoneLibre(x, z) || presAutreRoute(x, z, -1, 1.5)) && !cells.some(c => occupe.has(c))) {
                for (const c of cells) occupe.add(c);
                const etages = hash(a, 46) < .26 ? 2 : 1, toit = etages === 1 && hash(a, 47) < .62 ? 1 : 0;
                const [hx, hz] = at(tc, recul + pr / 2);
                maisons.push([hx, hz, ang + (cote < 0 ? Math.PI : 0), larg, etages * 3.15 + .25, pr, COUL_MUR[Math.floor(hash(a, 48) * COUL_MUR.length)], 1, toit, Math.floor(hash(a, 49) * 16)]);
                if (toit === 0 && hash(a, 50) < .55) { const [tx, tz] = at(tc + larg * .3, recul + pr * .7); cuves.push([tx, etages * 3.15 + .25, tz, hash(a, 51) < .7]); }
                // Mur mitoyen avec la parcelle voisine, et parfois une seconde maison au fond de la cour.
                const fond = recul + pr + 1.2;
                if (![.3, .7].some(v => dansBatiment(...at(0, fond * v)))) { const [wx, wz] = at(0, fond / 2); murs.push([wx, wz, ang + Math.PI / 2, fond, 2.2, .2, coul, false]); }
                const pr2 = 5.5 + hash(a, 52) * 3, l2 = Math.min(len - 2.4, 7 + hash(a, 53) * 4), r2 = fond + 1.8;
                const echs2 = []; for (const u of [0, .5, 1]) for (const v of [0, .5, 1]) echs2.push(at(len / 2 - l2 / 2 + u * l2, r2 + v * pr2));
                const cells2 = []; for (let u = 0; u <= l2; u += 2) for (let v = 0; v <= pr2; v += 2) cells2.push(cellOcc(...at(len / 2 - l2 / 2 + u, r2 + v)));
                if (hash(a, 54) < .6 && !echs2.some(([x, z]) => dansBatiment(x, z) || zoneLibre(x, z) || presAutreRoute(x, z, -1, 1.5)) && !cells2.some(c => occupe.has(c))) {
                  for (const c of cells2) occupe.add(c);
                  const [hx2, hz2] = at(len / 2, r2 + pr2 / 2);
                  maisons.push([hx2, hz2, ang + (cote < 0 ? Math.PI : 0), l2, 3.4, pr2, COUL_MUR[Math.floor(hash(a, 55) * COUL_MUR.length)], 1, 1, Math.floor(hash(a, 56) * 16)]);
                }
              }
            }
          }
          a += lon + (hash(a, 25) < .2 ? 1 : 0);
        }
        k = fin + 1;
      }
    }
  });
  // ---------- Maillages instanciés ----------
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const inst = (liste, mat, f, ombre = true) => {
    if (!liste.length) return;
    const m = new THREE.InstancedMesh(G.boite, mat, liste.length);
    liste.forEach((it, i) => { f(it, i, m); });
    m.castShadow = ombre && !LITE; m.receiveShadow = true; m.computeBoundingSphere(); groupe.add(m);
  };
  const fMur = ([x, z, a, l, h, e, c], i, m) => { m4.compose(p.set(x, 0, z), q.setFromAxisAngle(Y, a), sc.set(l, h, e)); m.setMatrixAt(i, m4); m.setColorAt(i, c); };
  inst(murs.filter(m => !m[7]), M.mur, fMur);
  inst(murs.filter(m => m[7]), M.parpaing, fMur);
  inst(chap, M.chaperon, ([x, z, a, l, h, e, y], i, m) => { m4.compose(p.set(x, y, z), q.setFromAxisAngle(Y, a), sc.set(l, h, e)); m.setMatrixAt(i, m4); m.setColorAt(i, new THREE.Color('#e9e5dc')); }, false);
  inst(portails, M.portail, ([x, z, a, l, h, e, c], i, m) => { m4.compose(p.set(x, 0, z), q.setFromAxisAngle(Y, a), sc.set(l, h, e)); m.setMatrixAt(i, m4); m.setColorAt(i, c); });
  inst(piliers, M.pilier, ([x, z, a, l, h, e, c], i, m) => { m4.compose(p.set(x, 0, z), q.setFromAxisAngle(Y, a), sc.set(l, h, e)); m.setMatrixAt(i, m4); m.setColorAt(i, c.clone().multiplyScalar(.92)); });
  // Boutiques (rez-de-chaussée commerçant, auvent en tôle) et maisons des parcelles (fenêtres,
  // porte, toit de tôle à quatre pans ou dalle de béton avec sa citerne).
  const auvents = [];
  for (const b of boutiques) b.push(0, 0, 0);
  const blocs = boutiques.concat(maisons);
  if (blocs.length) {
    const g = new THREE.BufferGeometry(), pos = [], uv = [], nor = [], col = [], idx = [];
    const tri = (A, C, B, c) => { // triangle à normale plate (sommets donnés dans le sens horaire vu de dehors)
      const b = pos.length / 3, e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...n) || 1;
      for (const P of [A, B, C]) { pos.push(...P); uv.push(-1, 0); nor.push(n[0] / l, n[1] / l, n[2] / l); col.push(c.r, c.g, c.b); }
      idx.push(b, b + 1, b + 2);
    };
    for (const [x, z, a, l, h, d, c, maison, toit, style] of blocs) {
      const ux = Math.cos(a), uz = -Math.sin(a), vx = Math.sin(a), vz = Math.cos(a); // u le long de la rue, v vers l'intérieur (local +z)
      const loc = (a1, b1) => [x + ux * a1 + vx * b1, z + uz * a1 + vz * b1];
      const cor = [[-l / 2, -d / 2], [l / 2, -d / 2], [l / 2, d / 2], [-l / 2, d / 2]].map(([a1, b1]) => loc(a1, b1));
      const graine = Math.floor(hash(Math.round(x * 3), Math.round(z * 3)) * 60) * 3;
      [[0, 1], [1, 2], [2, 3], [3, 0]].forEach(([i0, i1], f) => {
        const A = cor[i0], Bp = cor[i1], L2 = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]), b = pos.length / 3;
        const nxx = (Bp[1] - A[1]) / L2, nzz = -(Bp[0] - A[0]) / L2;
        pos.push(A[0], 0, A[1], Bp[0], 0, Bp[1], Bp[0], h, Bp[1], A[0], h, A[1]);
        const u1 = Math.max(1, Math.round(L2 / 3.3)), v0 = maison ? 100 + style * 10 : 0;
        if (f === 0 || maison) uv.push(graine, v0, graine + u1, v0, graine + u1, v0 + h / 3.15, graine, v0 + h / 3.15);
        else uv.push(-1, 0, -1, 0, -1, 0, -1, 0); // côtés et arrière des boutiques : enduit seul
        for (let k = 0; k < 4; k++) { nor.push(nxx, 0, nzz); col.push(c.r, c.g, c.b); }
        idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      });
      const tc = maison ? TOITS[graine % TOITS.length] : TOIT_BOUTIQUE;
      if (toit === 1) { // tôle à quatre pans, avec débord
        const o = .4, L = l / 2 + o, D = d / 2 + o, r = Math.min(l, d) * .2, k = Math.max(0, L - D);
        const E = [loc(-L, -D), loc(L, -D), loc(L, D), loc(-L, D)].map(([px, pz]) => [px, h, pz]);
        const R1 = [...loc(-k, 0)], R2 = [...loc(k, 0)], r1 = [R1[0], h + r, R1[1]], r2 = [R2[0], h + r, R2[1]];
        tri(E[0], E[1], r2, tc); tri(E[0], r2, r1, tc); tri(E[2], E[3], r1, tc); tri(E[2], r1, r2, tc);
        tri(E[1], E[2], r2, tc); tri(E[3], E[0], r1, tc);
      } else {
        const b = pos.length / 3;
        for (const [px, pz] of cor) { pos.push(px, h, pz); uv.push(-1, 0); nor.push(0, 1, 0); col.push(tc.r, tc.g, tc.b); }
        idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      }
      if (!maison && hash(graine, 31) < .65) auvents.push([x - vx * (d / 2 + .65), z - vz * (d / 2 + .65), a, l - .2, COUL_PORTAIL[Math.floor(hash(graine, 32) * COUL_PORTAIL.length)]]);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, matBoutique()); m.castShadow = !LITE; m.receiveShadow = true; groupe.add(m);
  }
  // Citernes en plastique sur les toits-terrasses (noires ou bleues).
  if (cuves.length) { const m = new THREE.InstancedMesh(G.cuve, M.cuve, cuves.length); cuves.forEach(([x, y, z, noire], i) => { m4.makeTranslation(x, y, z); m.setMatrixAt(i, m4); m.setColorAt(i, noire ? new THREE.Color('#2a2b2d') : new THREE.Color('#2f6fb0')); }); m.castShadow = !LITE; m.computeBoundingSphere(); groupe.add(m); }
  const eul = new THREE.Euler(0, 0, 0, 'YXZ');
  inst(auvents, M.portail, ([x, z, a, l, c], i, m) => { m4.compose(p.set(x, 2.72, z), q.setFromEuler(eul.set(-.2, a, 0)), sc.set(l, .05, 1.35)); m.setMatrixAt(i, m4); m.setColorAt(i, c); });
  if (lampes.length) { const m = new THREE.InstancedMesh(G.lampe, M.lampe, lampes.length); lampes.forEach(([x, z, a], i) => { m4.compose(p.set(x, 0, z), q.setFromAxisAngle(Y, a), sc.set(1, 1, 1)); m.setMatrixAt(i, m4); }); m.castShadow = !LITE; m.computeBoundingSphere(); groupe.add(m); }
  if (voitures.length) { const cc = ['#e8e8e4', '#9da3a6', '#1f2326', '#c8382f', '#2f6fb0', '#e2e2dc'].map(h => new THREE.Color(h)); const m = new THREE.InstancedMesh(G.voiture, M.voiture, voitures.length); voitures.forEach(([x, z, a, c], i) => { m4.compose(p.set(x, 0, z), q.setFromAxisAngle(Y, a), sc.set(1, 1, 1)); m.setMatrixAt(i, m4); m.setColorAt(i, cc[c]); }); m.castShadow = !LITE; m.computeBoundingSphere(); groupe.add(m); }
  if (poteaux.length) { const m = new THREE.InstancedMesh(G.poteau, M.poteau, poteaux.length); poteaux.forEach(([x, z], i) => { m4.makeTranslation(x, 0, z); m.setMatrixAt(i, m4); }); m.computeBoundingSphere(); groupe.add(m); }
  if (fils.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(fils, 3)); groupe.add(new THREE.LineSegments(g, M.fil)); }
  // Panneaux publicitaires et inscriptions : un maillage instancié par réclame.
  const o3 = new THREE.Object3D(), parK = (liste, k) => liste.filter(e => e[e.length - 1] === k);
  if (pubs.length) {
    const cadres = [], pieds = [];
    for (const [x, z, a] of pubs) {
      o3.position.set(x, 0, z); o3.rotation.set(0, a, 0); o3.updateMatrix();
      cadres.push(new THREE.Matrix4().multiplyMatrices(o3.matrix, new THREE.Matrix4().compose(p.set(0, 3.75, 0), q.identity(), sc.set(4.9, 3.7, .25))));
      for (const dx of [-1.4, 1.4]) pieds.push(new THREE.Matrix4().multiplyMatrices(o3.matrix, new THREE.Matrix4().compose(p.set(dx, 0, -.1), q.identity(), sc.set(.22, 3.9, .22))));
    }
    for (const [geo, liste] of [[G.boite, cadres.concat(pieds)]]) { const m = new THREE.InstancedMesh(geo, M.cadrePub, liste.length); liste.forEach((mx, i) => m.setMatrixAt(i, mx)); m.castShadow = !LITE; m.receiveShadow = true; m.computeBoundingSphere(); groupe.add(m); }
    M.pubs.forEach((mat, k) => {
      const l = parK(pubs, k); if (!l.length) return;
      const m = new THREE.InstancedMesh(G.plan, mat, l.length);
      l.forEach(([x, z, a], i) => { o3.position.set(x, 0, z); o3.rotation.set(0, a, 0); o3.updateMatrix(); m.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(o3.matrix, new THREE.Matrix4().compose(p.set(0, 5.6, .14), q.identity(), sc.set(4.6, 3.4, 1)))); });
      m.computeBoundingSphere(); groupe.add(m);
    });
  }
  M.inscriptions.forEach((mat, k) => {
    const l = parK(inscr, k); if (!l.length) return;
    const m = new THREE.InstancedMesh(G.plan, mat, l.length);
    l.forEach(([x, z, a, lg, h], i) => { m4.compose(p.set(x, h, z), q.setFromAxisAngle(Y, a), sc.set(lg, lg / 4, 1)); m.setMatrixAt(i, m4); });
    m.computeBoundingSphere(); groupe.add(m);
  });
  if (trot.pos.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(trot.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(trot.uv, 2)); g.setIndex(trot.idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.trottoir); m.receiveShadow = true; groupe.add(m);
    const gb = new THREE.BufferGeometry(); gb.setAttribute('position', new THREE.Float32BufferAttribute(bordure.pos, 3)); gb.setIndex(bordure.idx); gb.computeVertexNormals();
    const mb = new THREE.Mesh(gb, M.bordure); mb.receiveShadow = true; groupe.add(mb);
  }
  groupe.userData.n = murs.length + boutiques.length;
  return groupe;
}
const HT = .12; // hauteur du trottoir
function ruban(run, T, Bd, cote, sw) {
  const base = T.pos.length / 3, bb = Bd.pos.length / 3;
  run.forEach(([x, z, dx, dz], i) => {
    const nx = -dz * cote, nz = dx * cote; // n : vers les parcelles ; la chaussée est du côté -n
    const lb = sw - .2, bx = x - nx * lb, bz = z - nz * lb, ex = x - nx * sw, ez = z - nz * sw;
    T.pos.push(x, HT, z, bx, HT, bz); T.uv.push(i / 3, 0, i / 3, lb / 3);
    // Bordure : dessus (bx → ex) et face verticale côté chaussée.
    Bd.pos.push(bx, HT + .01, bz, ex, HT + .01, ez, ex, HT + .01, ez, ex, 0, ez);
    if (i) {
      const o = base + (i - 1) * 2;
      if (cote > 0) T.idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); else T.idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      const q = bb + (i - 1) * 4;
      Bd.idx.push(q, q + 4, q + 1, q + 1, q + 4, q + 5, q + 2, q + 6, q + 3, q + 3, q + 6, q + 7);
    }
  });
}
let matB = null;
function matBoutique() {
  if (matB) return matB;
  matB = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 });
  matB.onBeforeCompile = s => {
    s.uniforms.uFacade = { value: texFacades() };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vU;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvU = uv;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vU; uniform sampler2D uFacade;\nfloat hh2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (vU.x >= 0.0) {
          float maison = step(50.0, vU.y), style = floor((vU.y - 100.0) / 10.0) * maison;
          vec2 w = vec2(vU.x, vU.y - maison * (100.0 + style * 10.0));
          vec2 cell = floor(w), f = fract(w);
          float row = cell.y < 0.5 ? 0.0 : 1.0 + step(0.5, hh2(vec2(floor(w.x / 3.0), 7.0)));
          float col = floor(hh2(vec2(cell.x, row)) * 8.0);
          if (maison > 0.5) { // une même fenêtre pour toute la maison ; au rez-de-chaussée, une porte de temps en temps
            float porte = step(0.68, hh2(vec2(cell.x, 11.0))) * (1.0 - step(0.5, cell.y));
            row = mix(1.0 + floor(style / 8.0), 0.0, porte);
            col = mix(mod(style, 8.0), 3.0, porte);
          }
          vec2 uvA = (vec2(col, row) + f) / vec2(8.0, 4.0);
          vec4 tx = textureGrad(uFacade, uvA, dFdx(w) / vec2(8.0, 4.0), dFdy(w) / vec2(8.0, 4.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, tx.rgb, tx.a);
          diffuseColor.rgb *= mix(0.78, 1.0, smoothstep(0.0, 0.2, w.y)); // soubassement sali par le sable
        }`);
  };
  return matB;
}
// Textures des murs à l'échelle réelle, quelle que soit la longueur du mur instancié.
function metrique(mat, ex, ey) {
  mat.onBeforeCompile = s => {
    s.vertexShader = s.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #if defined(USE_MAP) && defined(USE_INSTANCING)
        vec3 scI = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vMapUv = vec2((position.x * scI.x + position.z * scI.z) / ${ex.toFixed(2)}, (position.y * scI.y) / ${ey.toFixed(2)});
      #endif`);
  };
  mat.customProgramCacheKey = () => 'metrique' + ex + ',' + ey;
}

// ---------- Pilotage ----------
export function initRue(data) { indexer(data); }
/** Ajoute les emprises d'une tuile Google Open Buildings ; l'habillage de la zone est refait. */
export function ajouterEmprises(T, zone) {
  if (!R.grilleB) return;
  let o = 0;
  for (let i = 0; i < T.n.length; i++) {
    const n = T.n[i], cx = T.x[i] / 10, cz = T.z[i] / 10, r = new Float32Array(n * 2), bb = [1e9, 1e9, -1e9, -1e9];
    for (let j = 0; j < n; j++) { const x = cx + T.p[o + 2 * j] / 10, z = cz + T.p[o + 2 * j + 1] / 10; r[2 * j] = x; r[2 * j + 1] = z; bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], z); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], z); }
    o += n * 2;
    const e = { r, bb };
    for (let gx = Math.floor(bb[0] / CB); gx <= Math.floor(bb[2] / CB); gx++) for (let gz = Math.floor(bb[1] / CB); gz <= Math.floor(bb[3] / CB); gz++) { const k = gx + ',' + gz; if (!R.grilleB.has(k)) R.grilleB.set(k, []); R.grilleB.get(k).push(e); }
  }
  for (const [k, g] of R.carres) {
    const [a, b] = k.split(',').map(Number);
    if ((a + 1) * CARRE > zone[0] && a * CARRE < zone[2] && (b + 1) * CARRE > zone[1] && b * CARRE < zone[3]) { liberer(g); R.carres.delete(k); }
  }
}
/** Vrai si (x, z) tombe sur une chaussée ou un trottoir (routes, rues, pistes et sentiers). */
export function surChaussee(x, z, marge = .8) {
  const l = R.grilleR?.get(cle(x, z, CR)); if (!l) return false;
  for (const [li, ax, az, bx, bz, hw] of l) {
    const L = roadLines[li]; if (L.bridge) continue;
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    if (Math.hypot(ax + dx * t - x, az + dz * t - z) < hw + (TROTTOIR[L.cls] ?? 0) * .5 + marge) return true;
  }
  return false;
}
/** Retire les arbres et palmiers plantés sur les routes (données OSM approximatives). */
export function degagerChaussees(vegetation) {
  const zero = new THREE.Matrix4().makeScale(0, 0, 0); let n = 0;
  for (const m of vegetation) {
    const xz = m.userData.xz; if (!xz) continue; let touche = false;
    for (let k = 0; k < m.count; k++) if (surChaussee(xz[2 * k], xz[2 * k + 1])) { m.setMatrixAt(k, zero); touche = true; n++; }
    if (touche) m.instanceMatrix.needsUpdate = true;
  }
  return n;
}
export function rueActive(on) { R.actif = on; for (const g of R.carres.values()) g.visible = on; }
/** Pendant une course : routes suivies par la ligne (habillage reculé à ~10 m pour laisser la place au jeu)
 *  et zones occupées par les commerces du jeu [[x, z, rayon]]. Sans argument : retour à la ville. */
export function rueRouteJeu(C, occupees = []) {
  vider(); R.zonesJeu = occupees;
  if (!C) { R.routeJeu = null; return; }
  const set = new Set();
  for (let i = 0; i < C.n; i += 4) {
    const x = C.X[i], z = C.Z[i], l = R.grilleR.get(cle(x, z, CR)); if (!l) continue;
    let best = null, bd = 6;
    for (const [lj, ax, az, bx, bz] of l) { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); const d = Math.hypot(ax + dx * t - x, az + dz * t - z); if (d < bd) { bd = d; best = lj; } }
    if (best !== null) set.add(best);
  }
  R.routeJeu = set;
}
function vider() { for (const g of R.carres.values()) liberer(g); R.carres.clear(); }
const PARTAGEES = () => new Set([GEO.boite, GEO.lampe, GEO.voiture, GEO.poteau, GEO.plan, GEO.cuve]);
function liberer(g) { scene.remove(g); const p = PARTAGEES(); g.traverse(o => { if (o.geometry && !p.has(o.geometry)) o.geometry.dispose(); }); }
let attente = 0;
export const STATS_RUE = { ms: 0, n: 0 };
/** À appeler à chaque image : génère au plus un carré à la fois autour du point suivi. */
export function majRue(dt, centre, proche) {
  if (!R.grilleB || !R.actif) return;
  attente -= dt; if (attente > 0) return; attente = .05;
  const c = centre || controls.target;
  const dist = proche ?? camera.position.distanceTo(c);
  // Vue rapprochée seulement : vu de haut, la ville d'origine reste homogène.
  const rayon = LITE ? (dist < 600 ? 1 : -1) : (dist < 950 ? 2 : -1);
  const cx = Math.floor(c.x / CARRE), cz = Math.floor(c.z / CARRE);
  // Libère ce qui est trop loin (avec marge, pour ne pas reconstruire en va-et-vient).
  for (const [k, g] of R.carres) { const [a, b] = k.split(',').map(Number); if (rayon < 0 || Math.max(Math.abs(a - cx), Math.abs(b - cz)) > rayon + 1) { liberer(g); R.carres.delete(k); } }
  if (rayon < 0) return;
  // Génère le carré manquant le plus proche.
  let best = null, bd = 1e9;
  for (let i = -rayon; i <= rayon; i++) for (let j = -rayon; j <= rayon; j++) {
    const a = cx + i, b = cz + j, k = a + ',' + b; if (R.carres.has(k)) continue;
    const d = (a + .5) * CARRE - c.x, e = (b + .5) * CARRE - c.z, dd = d * d + e * e; if (dd < bd) { bd = dd; best = [a, b, k]; }
  }
  if (best) { const t0 = performance.now(); const g = genererCarre(best[0], best[1]); STATS_RUE.ms = performance.now() - t0; STATS_RUE.n++; R.carres.set(best[2], g); scene.add(g); }
}
