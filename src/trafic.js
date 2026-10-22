import * as THREE from 'three';
import { dansTerrePlein } from './terre-pleins.js';
import { LITE, hash } from './base.js';
import { E } from './etat.js';
import { camera, scene } from './scene.js';
import { ZEMS_3D, matVeh, partsTokpa, partsZem } from './vehicules.js';
import { ROAD_W, mergeColored, roadLines } from './ville.js';

// ---------- Zémidjans ----------
export function buildZems() {
  const W = { 0: 4, 1: 3.4, 2: 2.6, 3: 1.6, 4: 0.45 };
  const paths = [];
  let total = 0;
  for (const L of roadLines) {
    if (L.bridge || W[L.cls] === undefined || L.pts.length < 2) continue;
    const xz = new Float32Array(L.pts.length * 2), cum = new Float32Array(L.pts.length);
    for (let j = 0; j < L.pts.length; j++) { xz[2 * j] = L.pts[j][0]; xz[2 * j + 1] = L.pts[j][1]; if (j) cum[j] = cum[j - 1] + Math.hypot(xz[2 * j] - xz[2 * j - 2], xz[2 * j + 1] - xz[2 * j - 1]); }
    const len = cum[cum.length - 1]; if (len < 30) continue;
    total += len * W[L.cls]; paths.push({ xz, cum, len, w: L.w ?? ROAD_W[L.cls], sens: L.sens && L.cls <= 3, acc: total });
  }
  const n = LITE ? 800 : 3000; // téléphone : 1 400 zéms à 1 176 triangles faisaient 1,6 M de triangles à chaque image
  const g = mergeColored(partsZem({ passager: '#2f6fb0' }));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, emissive: '#ffcf6a', emissiveIntensity: 0 });
  E.zems = new THREE.InstancedMesh(g, mat, n);
  E.zems.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  E.zems.frustumCulled = false; E.zems.renderOrder = 11; E.zems.visible = false;
  for (let i = 0; i < n; i++) {
    const r = hash(i, 60) * total; let lo = 0, hi = paths.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (paths[mid].acc < r) lo = mid + 1; else hi = mid; }
    const P = paths[lo];
    // Chaussée à sens unique (moitié de boulevard) : tout le monde roule dans le même sens, réparti sur la largeur.
    E.zemState.push({ P, s: hash(i, 61) * P.len, v: 7 + hash(i, 62) * 7, dir: P.sens ? 1 : hash(i, 63) < 0.5 ? 1 : -1, seg: 0, lane: P.sens ? (hash(i, 64) - .5) * (P.w - 2) : 0.8 + hash(i, 64) * (P.w * 0.3), hl: 1.05, hw: .42 });
  }
  scene.add(E.zems);
}
// Les motos proches de la caméra passent au zémidjan détaillé (moto-taxi-lod.glb).
export function zemsDetailles() {
  if (!ZEMS_3D.motoLod) return;
  const max = LITE ? 40 : 90;
  E.zemsProches = new THREE.InstancedMesh(ZEMS_3D.motoLod.geo, ZEMS_3D.motoLod.mat, max);
  E.zemsProches.userData.max = max; E.zemsProches.count = 0;
  E.zemsProches.instanceMatrix.setUsage(THREE.DynamicDrawUsage); E.zemsProches.frustumCulled = false;
  E.zemsProches.castShadow = !LITE; E.zemsProches.receiveShadow = true; E.zemsProches.visible = false;
  scene.add(E.zemsProches);
}
// Seuls les véhicules dans le champ et à portée de vue passent par la carte graphique (rangés en tête, `count` réduit) :
// dans la rue, les 800 zéms de toute la ville étaient dessinés à chaque image (940 000 triangles sur téléphone).
const CHAMP = new THREE.Frustum(), _pv = new THREE.Matrix4(), _sph = new THREE.Sphere();
function majChamp() {
  camera.updateMatrixWorld(); CHAMP.setFromProjectionMatrix(_pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const p = 700 + camera.position.y * 3; return p * p; // à pied, 700 m ; vu d'avion, toute la ville
}
const dansLeChamp = (x, z, r) => { _sph.center.set(x, 1, z); _sph.radius = r; return CHAMP.intersectsSphere(_sph); };
export function updateZems(dt) {
  const A = E.zems.instanceMatrix.array;
  const PR = E.zemsProches, B = PR ? PR.instanceMatrix.array : null, cam = camera.position, R2 = 300 * 300, V2 = majChamp();
  let np = 0, nv = 0;
  for (let i = 0; i < E.zemState.length; i++) {
    const z = E.zemState[i], P = z.P;
    if (!cede(z)) z.s += z.v * dt * z.dir;
    if (P.sens) { if (z.s >= P.len) z.s = 0.01; } // sens unique : pas de demi-tour, on repart du début
    else if (z.s >= P.len) { z.s = P.len - 0.01; z.dir = -1; } else if (z.s <= 0) { z.s = 0.01; z.dir = 1; }
    const cum = P.cum; let k = z.seg;
    while (k < cum.length - 2 && z.s > cum[k + 1]) k++;
    while (k > 0 && z.s < cum[k]) k--;
    z.seg = k;
    const x0 = P.xz[2 * k], z0 = P.xz[2 * k + 1], x1 = P.xz[2 * k + 2], z1 = P.xz[2 * k + 3];
    const sl = cum[k + 1] - cum[k] || 1, t = (z.s - cum[k]) / sl;
    let dx = (x1 - x0) / sl * z.dir, dz = (z1 - z0) / sl * z.dir;
    const x = x0 + (x1 - x0) * t + (-dz) * z.lane, zz = z0 + (z1 - z0) * t + dx * z.lane;
    retenir(z, x, zz, dx, dz);
    const d2 = (x - cam.x) ** 2 + (zz - cam.z) ** 2; if (d2 > V2 || !dansLeChamp(x, zz, 2)) continue;
    const th = Math.atan2(-dz, dx), c = Math.cos(th), s = Math.sin(th);
    if (B && np < PR.userData.max && d2 < R2) {
      const q = np++ * 16;
      B[q] = c; B[q + 1] = 0; B[q + 2] = -s; B[q + 3] = 0; B[q + 4] = 0; B[q + 5] = 1; B[q + 6] = 0; B[q + 7] = 0;
      B[q + 8] = s; B[q + 9] = 0; B[q + 10] = c; B[q + 11] = 0; B[q + 12] = x; B[q + 13] = 0.04; B[q + 14] = zz; B[q + 15] = 1;
      continue;
    }
    const o = nv++ * 16;
    A[o] = c; A[o + 1] = 0; A[o + 2] = -s; A[o + 3] = 0; A[o + 4] = 0; A[o + 5] = 1; A[o + 6] = 0; A[o + 7] = 0;
    A[o + 8] = s; A[o + 9] = 0; A[o + 10] = c; A[o + 11] = 0; A[o + 12] = x; A[o + 13] = 0.15; A[o + 14] = zz; A[o + 15] = 1;
  }
  E.zems.count = nv; E.zems.instanceMatrix.needsUpdate = true;
  if (PR) { PR.count = np; PR.instanceMatrix.needsUpdate = true; }
}

// ---------- La circulation et le joueur de « Vivre à Cotonou » ----------
// Personne ne traverse personne : un zém ou un tokpa qui a le joueur juste devant lui s'arrête (cede), et ceux qui
// roulent près de lui (retenir → E.circulation) bloquent sa marche et sa conduite (dansCirculation).
function cede(z) {
  const J = E.joueur; if (!J || z.px === undefined) return false;
  const Jr = Math.max(J.hl ?? .3, J.hw ?? .3); // un piéton, ou la voiture qu'il conduit
  const ax = J.x - z.px, az = J.z - z.pz; if (ax * ax + az * az > (8 + Jr) ** 2) return false;
  const devant = ax * z.fx + az * z.fz, cote = Math.abs(ax * z.fz - az * z.fx);
  // Devant lui, mais aussi à hauteur de sa caisse : sans ça, un joueur à côté de l'arrière du véhicule
  // le voyait repartir, et la moitié arrière lui passait au travers.
  return devant > -z.hl - Jr && devant < z.hl + Jr + 3 && cote < z.hw + Jr + .6;
}
function retenir(z, x, zz, dx, dz) {
  z.px = x; z.pz = zz; z.fx = dx; z.fz = dz; z.cap = Math.atan2(dx, dz);
  const J = E.joueur; if (J && (x - J.x) ** 2 + (zz - J.z) ** 2 < 1600) E.circulation.push(z);
}
/** De combien un corps de rayon r posé en (x, z) entre dans un zém ou un tokpa de la circulation (0 : il est libre). */
export function dansCirculation(x, z, r = .3) {
  let p = 0;
  for (const V of E.circulation) {
    const dx = x - V.px, dz = z - V.pz, s = Math.sin(V.cap), c = Math.cos(V.cap);
    const u = V.hl + r - Math.abs(dx * s + dz * c), w = V.hw + r - Math.abs(dx * c - dz * s);
    if (u > 0 && w > 0) p = Math.max(p, Math.min(u, w));
  }
  return p;
}

// Lampadaires (nuit)
export function buildLamps() {
  const pos = [];
  for (const L of roadLines) {
    if (L.cls > 2) continue;
    const w = (L.w ?? ROAD_W[L.cls]) / 2 + 1.5; let carry = 0, side = 1;
    for (let j = 1; j < L.pts.length; j++) {
      const a = L.pts[j - 1], b = L.pts[j]; const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); if (!len) continue;
      for (let d = carry; d < len; d += 32) { const t = d / len; side = -side; if (dansTerrePlein(a[0] + dx * t + (-dz / len) * w * side, a[1] + dz * t + (dx / len) * w * side, 1)) continue; pos.push(a[0] + dx * t + (-dz / len) * w * side, L.bridge ? 12 : 8, a[1] + dz * t + (dx / len) * w * side); }
      carry = (carry - len) % 32; if (carry < 0) carry += 32;
    }
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const cx = cv.getContext('2d'); const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,210,1)'); gr.addColorStop(0.18, 'rgba(255,190,110,0.85)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  E.lamps = new THREE.Points(g, new THREE.PointsMaterial({ size: 14, map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffc27a', opacity: 0, fog: true }));
  E.lamps.renderOrder = 20; E.lamps.visible = false; scene.add(E.lamps);
}


// ---------- Tokpa-tokpa en circulation, aux portes de la ville ----------
// Interdits dans Cotonou depuis 2021 : on les fait rouler vers Calavi, Godomey et la sortie est.
export function construireTokpas() {
  const paths = []; let total = 0;
  for (const L of roadLines) {
    if (L.bridge || L.cls > 2 || L.pts.length < 2) continue;
    const m = L.pts[Math.floor(L.pts.length / 2)];
    if (!(m[0] < -5200 || (m[1] < -2800 && m[0] < -1500) || m[0] > 8000)) continue;
    const xz = new Float32Array(L.pts.length * 2), cum = new Float32Array(L.pts.length);
    for (let j = 0; j < L.pts.length; j++) { xz[2 * j] = L.pts[j][0]; xz[2 * j + 1] = L.pts[j][1]; if (j) cum[j] = cum[j - 1] + Math.hypot(xz[2 * j] - xz[2 * j - 2], xz[2 * j + 1] - xz[2 * j - 1]); }
    const len = cum[cum.length - 1]; if (len < 60) continue; total += len; paths.push({ xz, cum, len, w: L.w ?? ROAD_W[L.cls], acc: total });
  }
  if (!paths.length) return;
  // Le tokpa-tokpa fait 30 000 triangles à lui seul, et l'instance n'est jamais écartée du champ (frustumCulled
  // false, les instances bougent) : 70 d'entre eux étaient dessinés en entier à chaque image, 2,1 M de triangles.
  // C'était le plus gros objet de la scène et la première cause des plantages de l'onglet sur téléphone.
  const n = LITE ? 24 : 160;
  E.tokpas = new THREE.InstancedMesh(mergeColored(partsTokpa()), matVeh, n);
  E.tokpas.instanceMatrix.setUsage(THREE.DynamicDrawUsage); E.tokpas.frustumCulled = false; E.tokpas.visible = false; E.tokpas.castShadow = !LITE;
  for (let i = 0; i < n; i++) {
    const r = hash(i, 160) * total; let lo = 0, hi = paths.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (paths[mid].acc < r) lo = mid + 1; else hi = mid; }
    const P = paths[lo]; E.tokpaState.push({ P, s: hash(i, 161) * P.len, v: 7 + hash(i, 162) * 5, dir: hash(i, 163) < .5 ? 1 : -1, seg: 0, lane: 2.2 + hash(i, 164) * 1.2, hl: 2.45, hw: .93 });
  }
  scene.add(E.tokpas);
}
export function majTokpas(dt) {
  if (!E.tokpas) return;
  const A = E.tokpas.instanceMatrix.array, cam = camera.position, V2 = majChamp(); let nv = 0;
  for (let i = 0; i < E.tokpaState.length; i++) {
    const z = E.tokpaState[i], P = z.P; if (!cede(z)) z.s += z.v * dt * z.dir;
    if (z.s >= P.len) { z.s = P.len - .01; z.dir = -1; } else if (z.s <= 0) { z.s = .01; z.dir = 1; }
    const cum = P.cum; let k = z.seg; while (k < cum.length - 2 && z.s > cum[k + 1]) k++; while (k > 0 && z.s < cum[k]) k--; z.seg = k;
    const x0 = P.xz[2 * k], z0 = P.xz[2 * k + 1], x1 = P.xz[2 * k + 2], z1 = P.xz[2 * k + 3], sl = cum[k + 1] - cum[k] || 1, t = (z.s - cum[k]) / sl;
    const dx = (x1 - x0) / sl * z.dir, dz = (z1 - z0) / sl * z.dir, x = x0 + (x1 - x0) * t - dz * z.lane, zz = z0 + (z1 - z0) * t + dx * z.lane;
    retenir(z, x, zz, dx, dz);
    if ((x - cam.x) ** 2 + (zz - cam.z) ** 2 > V2 || !dansLeChamp(x, zz, 4)) continue;
    const th = Math.atan2(-dz, dx), c = Math.cos(th), s = Math.sin(th), o = nv++ * 16;
    A[o] = c; A[o + 1] = 0; A[o + 2] = -s; A[o + 3] = 0; A[o + 4] = 0; A[o + 5] = 1; A[o + 6] = 0; A[o + 7] = 0; A[o + 8] = s; A[o + 9] = 0; A[o + 10] = c; A[o + 11] = 0; A[o + 12] = x; A[o + 13] = 0.05; A[o + 14] = zz; A[o + 15] = 1;
  }
  E.tokpas.count = nv; E.tokpas.instanceMatrix.needsUpdate = true;
}

