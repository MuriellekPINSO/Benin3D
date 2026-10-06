import * as THREE from 'three';
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
    total += len * W[L.cls]; paths.push({ xz, cum, len, w: ROAD_W[L.cls], acc: total });
  }
  const n = LITE ? 1400 : 3000;
  const g = mergeColored(partsZem({ passager: '#2f6fb0' }));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, emissive: '#ffcf6a', emissiveIntensity: 0 });
  E.zems = new THREE.InstancedMesh(g, mat, n);
  E.zems.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  E.zems.frustumCulled = false; E.zems.renderOrder = 11; E.zems.visible = false;
  for (let i = 0; i < n; i++) {
    const r = hash(i, 60) * total; let lo = 0, hi = paths.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (paths[mid].acc < r) lo = mid + 1; else hi = mid; }
    const P = paths[lo];
    E.zemState.push({ P, s: hash(i, 61) * P.len, v: 7 + hash(i, 62) * 7, dir: hash(i, 63) < 0.5 ? 1 : -1, seg: 0, lane: 0.8 + hash(i, 64) * (P.w * 0.3) });
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
export function updateZems(dt) {
  const A = E.zems.instanceMatrix.array;
  const PR = E.zemsProches, B = PR ? PR.instanceMatrix.array : null, cam = camera.position, R2 = 300 * 300;
  let np = 0;
  for (let i = 0; i < E.zemState.length; i++) {
    const z = E.zemState[i], P = z.P;
    z.s += z.v * dt * z.dir;
    if (z.s >= P.len) { z.s = P.len - 0.01; z.dir = -1; } else if (z.s <= 0) { z.s = 0.01; z.dir = 1; }
    const cum = P.cum; let k = z.seg;
    while (k < cum.length - 2 && z.s > cum[k + 1]) k++;
    while (k > 0 && z.s < cum[k]) k--;
    z.seg = k;
    const x0 = P.xz[2 * k], z0 = P.xz[2 * k + 1], x1 = P.xz[2 * k + 2], z1 = P.xz[2 * k + 3];
    const sl = cum[k + 1] - cum[k] || 1, t = (z.s - cum[k]) / sl;
    let dx = (x1 - x0) / sl * z.dir, dz = (z1 - z0) / sl * z.dir;
    const x = x0 + (x1 - x0) * t + (-dz) * z.lane, zz = z0 + (z1 - z0) * t + dx * z.lane;
    const th = Math.atan2(-dz, dx), c = Math.cos(th), s = Math.sin(th), o = i * 16;
    if (B && np < PR.userData.max && (x - cam.x) ** 2 + (zz - cam.z) ** 2 < R2) {
      const q = np++ * 16;
      B[q] = c; B[q + 1] = 0; B[q + 2] = -s; B[q + 3] = 0; B[q + 4] = 0; B[q + 5] = 1; B[q + 6] = 0; B[q + 7] = 0;
      B[q + 8] = s; B[q + 9] = 0; B[q + 10] = c; B[q + 11] = 0; B[q + 12] = x; B[q + 13] = 0.04; B[q + 14] = zz; B[q + 15] = 1;
      A.fill(0, o, o + 16); continue;
    }
    A[o] = c; A[o + 1] = 0; A[o + 2] = -s; A[o + 3] = 0; A[o + 4] = 0; A[o + 5] = 1; A[o + 6] = 0; A[o + 7] = 0;
    A[o + 8] = s; A[o + 9] = 0; A[o + 10] = c; A[o + 11] = 0; A[o + 12] = x; A[o + 13] = 0.15; A[o + 14] = zz; A[o + 15] = 1;
  }
  E.zems.instanceMatrix.needsUpdate = true;
  if (PR) { PR.count = np; PR.instanceMatrix.needsUpdate = true; }
}

// Lampadaires (nuit)
export function buildLamps() {
  const pos = [];
  for (const L of roadLines) {
    if (L.cls > 2) continue;
    const w = ROAD_W[L.cls] / 2 + 1.5; let carry = 0, side = 1;
    for (let j = 1; j < L.pts.length; j++) {
      const a = L.pts[j - 1], b = L.pts[j]; const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); if (!len) continue;
      for (let d = carry; d < len; d += 32) { const t = d / len; side = -side; pos.push(a[0] + dx * t + (-dz / len) * w * side, L.bridge ? 12 : 8, a[1] + dz * t + (dx / len) * w * side); }
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
    const len = cum[cum.length - 1]; if (len < 60) continue; total += len; paths.push({ xz, cum, len, w: ROAD_W[L.cls], acc: total });
  }
  if (!paths.length) return;
  const n = LITE ? 70 : 160;
  E.tokpas = new THREE.InstancedMesh(mergeColored(partsTokpa()), matVeh, n);
  E.tokpas.instanceMatrix.setUsage(THREE.DynamicDrawUsage); E.tokpas.frustumCulled = false; E.tokpas.visible = false; E.tokpas.castShadow = !LITE;
  for (let i = 0; i < n; i++) {
    const r = hash(i, 160) * total; let lo = 0, hi = paths.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (paths[mid].acc < r) lo = mid + 1; else hi = mid; }
    const P = paths[lo]; E.tokpaState.push({ P, s: hash(i, 161) * P.len, v: 7 + hash(i, 162) * 5, dir: hash(i, 163) < .5 ? 1 : -1, seg: 0, lane: 2.2 + hash(i, 164) * 1.2 });
  }
  scene.add(E.tokpas);
}
export function majTokpas(dt) {
  if (!E.tokpas) return;
  const A = E.tokpas.instanceMatrix.array;
  for (let i = 0; i < E.tokpaState.length; i++) {
    const z = E.tokpaState[i], P = z.P; z.s += z.v * dt * z.dir;
    if (z.s >= P.len) { z.s = P.len - .01; z.dir = -1; } else if (z.s <= 0) { z.s = .01; z.dir = 1; }
    const cum = P.cum; let k = z.seg; while (k < cum.length - 2 && z.s > cum[k + 1]) k++; while (k > 0 && z.s < cum[k]) k--; z.seg = k;
    const x0 = P.xz[2 * k], z0 = P.xz[2 * k + 1], x1 = P.xz[2 * k + 2], z1 = P.xz[2 * k + 3], sl = cum[k + 1] - cum[k] || 1, t = (z.s - cum[k]) / sl;
    const dx = (x1 - x0) / sl * z.dir, dz = (z1 - z0) / sl * z.dir, x = x0 + (x1 - x0) * t - dz * z.lane, zz = z0 + (z1 - z0) * t + dx * z.lane;
    const th = Math.atan2(-dz, dx), c = Math.cos(th), s = Math.sin(th), o = i * 16;
    A[o] = c; A[o + 1] = 0; A[o + 2] = -s; A[o + 3] = 0; A[o + 4] = 0; A[o + 5] = 1; A[o + 6] = 0; A[o + 7] = 0; A[o + 8] = s; A[o + 9] = 0; A[o + 10] = c; A[o + 11] = 0; A[o + 12] = x; A[o + 13] = 0.05; A[o + 14] = zz; A[o + 15] = 1;
  }
  E.tokpas.instanceMatrix.needsUpdate = true;
}

