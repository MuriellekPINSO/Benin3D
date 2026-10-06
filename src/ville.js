import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LITE, hash, pal, toXZ, u8c } from './base.js';
import { frame, status } from './chargement.js';
import { E } from './etat.js';
import { VEGETATION } from './lieux.js';
import { texFacades } from './facades.js';
import { COUCHES_SOL, U, flatMat, grainSol, scene } from './scene.js';

// ---------- Surfaces ----------
export const KIND_STYLE = [
  { c: '#2a7896', o: 4, water: true }, { c: '#4e8c89', o: 4, water: true }, { c: '#4a8790', o: 4, water: true }, { c: '#8c9b62', o: 3 },
  { c: '#eadab4', o: 3 }, { c: '#8db06a', o: 3 }, { c: '#5f8945', o: 3 }, { c: '#b9b87a', o: 3 }, { c: '#6dab58', o: 3 },
  { c: '#a2ae88', o: 3 }, { c: '#cdc4b2', o: 2 }, { c: '#9b9b98', o: 5 }, { c: '#bdb98c', o: 2 }, { c: '#bdb6a8', o: 5 },
];
export const waterMats = [];
export function waterMaterial(hex) {
  const m = new THREE.MeshPhongMaterial({ color: hex, specular: 0x34444c, shininess: 110, depthWrite: false });
  m.onBeforeCompile = s => {
    s.uniforms.uTime = U.uTime;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uTime;')
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        vec2 wp = vWp.xz;
        float n1 = sin(wp.x * 0.043 + uTime * 0.9) + sin(wp.y * 0.061 - uTime * 1.1 + wp.x * 0.017) + 0.5 * sin((wp.x + wp.y) * 0.13 + uTime * 1.7);
        float n2 = cos(wp.y * 0.052 + uTime * 0.8) + 0.7 * sin(wp.x * 0.071 + wp.y * 0.033 + uTime * 1.3);
        normal = normalize(normal + (viewMatrix * vec4(n1 * 0.045, 0.0, n2 * 0.045, 0.0)).xyz);`);
  };
  waterMats.push(m);
  return m;
}
export let oceanRing = null;
export function buildSurfaces(S) {
  const byKind = new Map();
  let pi = 0, ri = 0;
  for (let i = 0; i < S.k.length; i++) {
    const k = S.k[i], rings = [];
    for (let r = 0; r < S.r[i]; r++) {
      const n = S.n[ri++]; const ring = []; let x = 0, z = 0;
      for (let j = 0; j < n; j++) { x += S.p[pi++]; z += S.p[pi++]; ring.push(new THREE.Vector2(x / 10, z / 10)); }
      rings.push(ring);
    }
    if (k === 1) rings.length = 1; // Ganvié : pilotis dans l'eau, pas sur des îlots
    if (k === 0 && !oceanRing) oceanRing = rings[0];
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k).push(rings);
  }
  for (const [k, list] of byKind) {
    const pos = [], idx = [];
    for (const rings of list) {
      const base = pos.length / 3;
      const all = rings.flat();
      for (const v of all) pos.push(v.x, 0, v.y);
      let faces;
      try { faces = THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1)); } catch (e) { faces = []; }
      for (const [a, b, c] of faces) {
        const A = all[a], B = all[b], C = all[c];
        const up = (B.y - A.y) * (C.x - A.x) - (B.x - A.x) * (C.y - A.y) > 0;
        idx.push(base + a, base + (up ? b : c), base + (up ? c : b));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    g.setIndex(idx);
    const st = KIND_STYLE[k];
    const m = new THREE.Mesh(g, st.water ? waterMaterial(st.c) : grainSol(flatMat(st.c)));
    m.renderOrder = st.o; m.receiveShadow = true; m.frustumCulled = k !== 0;
    scene.add(m); COUCHES_SOL.push(m);
  }
}

// Écume le long de la côte
export function buildFoam() {
  if (!oceanRing) return;
  const pts = oceanRing.filter(v => Math.abs(v.x) < 40000 && v.y < 30000);
  const pos = [], side = [], idx = [];
  const W = 42;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x, dz = b.y - a.y; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    let nx = -dz, nz = dx; if (nz < 0) { nx = -nx; nz = -nz; } // vers la mer (sud)
    const p = pts[i];
    pos.push(p.x - nx * 4, 0, p.y - nz * 4, p.x + nx * W, 0, p.y + nz * W); side.push(0, 1);
    if (i > 0) { const o = (i - 1) * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('side', new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(idx);
  E.foamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uBright: { value: 1 } }]),
    vertexShader: `attribute float side; varying float vSide; varying vec2 vW;
      #include <fog_pars_vertex>
      void main(){ vSide = side; vW = position.xz; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime, uBright; varying float vSide; varying vec2 vW;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        float band = sin(vSide * 15.0 + uTime * 1.5 + sin(vW.x * 0.012) * 2.5) * 0.5 + 0.5;
        float a = smoothstep(0.6, 1.0, band) * (1.0 - vSide) * 0.7 + (1.0 - smoothstep(0.0, 0.2, vSide)) * 0.45;
        gl_FragColor = vec4(vec3(uBright), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, E.foamMat); m.renderOrder = 6; m.frustumCulled = false; scene.add(m); COUCHES_SOL.push(m);
}

// ---------- Routes ----------
export const ROAD_W = { 0: 17, 1: 13, 2: 10.5, 3: 8, 4: 6, 5: 4.2, 6: 2.2, 7: 3.2, 9: 9, 10: 45, 11: 22 };
export const ROAD_ORDER = { 6: 0, 5: 1, 4: 2, 9: 2, 7: 3, 3: 4, 2: 5, 1: 6, 0: 7, 11: 8, 10: 9 };
export const roadLines = [];
// Tabliers des ponts (points denses et hauteur de chaque point), pour que Zém Run monte dessus.
export const TABLIERS = [];
export function roadColor(cls, surf) {
  if (cls === 7) return '#6b5e52';
  if (cls === 9) return '#bab3a6';
  if (cls === 10) return '#3e3f43';
  if (cls === 11) return '#55565a';
  if (cls === 6) return '#cbbd9f';
  if (surf === 0) return cls <= 1 ? '#4b4c51' : '#5a5b5f';
  if (surf === 1) return '#9f978a';
  return '#c3b393';
}
export function ribbon(pts, w, pos, idx, col, rgb, y = 0) {
  const n = pts.length, base = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let px, pz;
    const d1x = p[0] - a[0], d1z = p[1] - a[1], d2x = b[0] - p[0], d2z = b[1] - p[1];
    const l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
    const n1x = l1 ? -d1z / l1 : 0, n1z = l1 ? d1x / l1 : 0, n2x = l2 ? -d2z / l2 : 0, n2z = l2 ? d2x / l2 : 0;
    px = n1x + n2x; pz = n1z + n2z; const pl = Math.hypot(px, pz) || 1; px /= pl; pz /= pl;
    const ref = l2 ? [n2x, n2z] : [n1x, n1z];
    const sc = 1 / Math.max(0.4, px * ref[0] + pz * ref[1]);
    const h = w / 2 * sc;
    const yy = typeof y === 'function' ? y(i) : y;
    pos.push(p[0] - px * h, yy, p[1] - pz * h, p[0] + px * h, yy, p[1] + pz * h);
    col.push(...rgb, ...rgb);
    if (i > 0) { const o = base + (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
}
// Marquages des grands axes (lignes de rive, axe, files), comme sur le boulevard de la Marina.
function texMarquage(files) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = '#56585c'; c.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 900; i++) { c.fillStyle = Math.random() < .5 ? '#5f6165' : '#4e5054'; c.fillRect(Math.random() * 128, Math.random() * 256, 2, 2); }
  c.fillStyle = '#ecebe4';
  for (const u of [.045, .955]) c.fillRect(u * 128 - 1.5, 0, 3, 256);
  if (files === 4) { c.fillRect(.485 * 128 - 1.5, 0, 3, 256); c.fillRect(.515 * 128 - 1.5, 0, 3, 256); for (const u of [.275, .725]) c.fillRect(u * 128 - 1.5, 0, 3, 64); }
  else c.fillRect(64 - 1.5, 0, 3, 96);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function rubanUV(pts, w, pos, uv, idx) {
  const n = pts.length, base = pos.length / 3; let v = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const d1x = p[0] - a[0], d1z = p[1] - a[1], d2x = b[0] - p[0], d2z = b[1] - p[1], l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
    const n1x = l1 ? -d1z / l1 : 0, n1z = l1 ? d1x / l1 : 0, n2x = l2 ? -d2z / l2 : 0, n2z = l2 ? d2x / l2 : 0;
    let px = n1x + n2x, pz = n1z + n2z; const pl = Math.hypot(px, pz) || 1; px /= pl; pz /= pl;
    const ref = l2 ? [n2x, n2z] : [n1x, n1z], h = w / 2 / Math.max(0.4, px * ref[0] + pz * ref[1]);
    if (i) v += l1 / 12;
    pos.push(p[0] - px * h, 0, p[1] - pz * h, p[0] + px * h, 0, p[1] + pz * h); uv.push(0, v, 1, v);
    if (i > 0) { const o = base + (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
}
export function buildRoads(R) {
  let pi = 0;
  for (let i = 0; i < R.c.length; i++) {
    const n = R.n[i], pts = []; let x = 0, z = 0;
    for (let j = 0; j < n; j++) { x += R.p[pi++]; z += R.p[pi++]; pts.push([x / 10, z / 10]); }
    roadLines.push({ cls: R.c[i], surf: R.f[i] & 3, bridge: !!(R.f[i] & 4), pts });
  }
  const order = roadLines.map((_, i) => i).sort((a, b) => ROAD_ORDER[roadLines[a].cls] - ROAD_ORDER[roadLines[b].cls]);
  const pos = [], idx = [], col = [];
  const bpos = [], bidx = [], bcol = [];
  const marq4 = { pos: [], uv: [], idx: [], files: 4 }, marq2 = { pos: [], uv: [], idx: [], files: 2 };
  for (const i of order) {
    const L = roadLines[i], w = ROAD_W[L.cls], rgb = u8c(roadColor(L.cls, L.surf));
    if (!L.bridge && L.cls <= 2 && L.surf === 0) { const M = L.cls <= 1 ? marq4 : marq2; rubanUV(L.pts, w, M.pos, M.uv, M.idx); continue; }
    if (!L.bridge) { ribbon(L.pts, w, pos, idx, col, rgb); continue; }
    // pont : tablier surélevé avec rampes
    const dense = [];
    for (let j = 1; j < L.pts.length; j++) { const a = L.pts[j - 1], b = L.pts[j]; const seg = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 12)); for (let s = 0; s < seg; s++) dense.push([a[0] + (b[0] - a[0]) * s / seg, a[1] + (b[1] - a[1]) * s / seg]); }
    dense.push(L.pts[L.pts.length - 1]);
    const cum = [0]; for (let j = 1; j < dense.length; j++) cum.push(cum[j - 1] + Math.hypot(dense[j][0] - dense[j - 1][0], dense[j][1] - dense[j - 1][1]));
    // Hauteur selon la longueur : les ponts de la lagune montent à 4,5 m, un petit pont
    // sur un caniveau reste presque à plat (avant : 4,5 m partout, un mur pour le zém).
    const tot = cum[cum.length - 1] || 1, ramp = Math.min(60, tot * 0.3), hMax = tot < 60 ? .35 : Math.min(4.5, .3 + (tot - 60) * .02);
    const hY = j => 0.3 + (hMax - .3) * Math.min(1, cum[j] / ramp, (tot - cum[j]) / ramp);
    TABLIERS.push({ pts: dense, h: dense.map((_, j) => hY(j)), w, cls: L.cls, long: tot });
    const base0 = bpos.length / 3;
    ribbon(dense, w, bpos, bidx, bcol, rgb, hY);
    const side = u8c('#9c958a');
    for (const s of [0, 1]) { // flancs du tablier
      const sb = bpos.length / 3;
      for (let j = 0; j < dense.length; j++) {
        const vi = (base0 + j * 2 + s) * 3, x = bpos[vi], y = bpos[vi + 1], z = bpos[vi + 2];
        bpos.push(x, y, z, x, y - 1.4, z); bcol.push(...side, ...side);
        if (j > 0) { const o = sb + (j - 1) * 2; bidx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      }
    }
  }
  const mk = (p, ix, c, order, depthWrite) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(p.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    g.setAttribute('color', new THREE.Uint8BufferAttribute(c, 3, true));
    g.setIndex(ix);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, depthWrite, side: depthWrite ? THREE.DoubleSide : THREE.FrontSide }));
    m.renderOrder = order; m.receiveShadow = true; m.castShadow = depthWrite && !LITE; scene.add(m); return m;
  };
  const routes = mk(pos, idx, col, 7, false); grainSol(routes.material); routes.userData.route = true; COUCHES_SOL.push(routes);
  for (const M of [marq2, marq4]) {
    if (!M.pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(M.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(M.pos.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(M.uv, 2)); g.setIndex(M.idx);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: texMarquage(M.files), depthWrite: false }));
    m.renderOrder = M.files === 4 ? 7.6 : 7.5; m.receiveShadow = true; m.userData.route = true; scene.add(m); COUCHES_SOL.push(m);
  }
  if (bpos.length) mk(bpos, bidx, bcol, 8, true);
}

// ---------- Bâtiments ----------
const VILLAS = [[6.3545, 2.3935, 1150], [6.3565, 2.3700, 1350], [6.3605, 2.3960, 650], [6.3625, 2.4650, 1300], [6.3500, 2.3480, 1200]].map(([la, lo, r]) => [...toXZ(la, lo), r]);
export const PAL = {
  wall: [
    pal(['#f2efe8', '#f2efe8', '#f4f1ea', '#ebe7df', '#e6e2da', '#dfe3e2', '#efe4d2', '#e9dcc6', '#d9ddd9', '#e6d3bd', '#cfdadd', '#efe0d6', '#e8e9df', '#d7d2c6']),
    pal(['#f2f0ea', '#dde5e8', '#e9e0cd', '#d2dbe0']), pal(['#e8cf86', '#e4c27a']), pal(['#f4f1ea', '#efe6d6']),
    pal(['#bdb9b0', '#c8c1b2', '#aeb0ad']), pal(['#7d5d3f', '#6f5139', '#8a6a48']), pal(['#f2f2ee']), pal(['#aaa69d', '#a19d94']),
    pal(['#b9a58a', '#8fa6b0', '#c9b79c', '#a4b8a0', '#d1c2a6', '#7f98a8']), pal(['#d9c3a0', '#cdb791']), pal(['#d9c7b8', '#cbb6a6', '#c9b9a3']), pal(['#ecc58f', '#e9d3a3', '#f0dcb0', '#e3b07c']),
  ],
  tin: pal(['#9aa1a4', '#8c9396', '#a8aeb0', '#b3b8ba', '#7f878b', '#a0684a', '#8f5f47', '#6f8fa8']),
  tuile: pal(['#c8553a', '#d0603f', '#b94a34', '#cf6a45', '#bd5a3c', '#c4502f']),
  flat: pal(['#e6e3dc', '#dcd8cf', '#efece6', '#cfcac0', '#d9d4ca', '#c6c2b9']),
  roofCat: [null, pal(['#d7cfc0', '#c9c4ba']), pal(['#a9653f', '#9a5a3c']), pal(['#bdb6aa']), pal(['#9fa6a8', '#8f979b', '#b8bec0']), pal(['#a8946b', '#8f979b', '#9a8660']), pal(['#d7cfc0']), pal(['#9d998f']), pal(['#a9653f', '#8f979b', '#9fa6a8', '#8c5b43', '#b8bec0']), pal(['#b5583f', '#a94f3a']), pal(['#cfc8bb']), pal(['#b9654a', '#9fa6a8', '#d7cfc0'])],
};
export const buildingMat = new THREE.MeshLambertMaterial({ vertexColors: true });
buildingMat.onBeforeCompile = s => {
  s.uniforms.uRiseT = U.uRiseT; s.uniforms.uRiseO = U.uRiseO; s.uniforms.uNight = U.uNight;
  s.uniforms.uFacade = { value: texFacades() };
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 aw; varying vec3 vAw; varying float vY; uniform float uRiseT; uniform vec2 uRiseO;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      float dR = length(position.xz - uRiseO);
      float kR = clamp((uRiseT - dR / 3300.0) / 1.3, 0.0, 1.0);
      kR = 1.0 - pow(1.0 - kR, 3.0);
      transformed.y *= kR;
      vAw = aw; vY = position.y;`);
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec3 vAw; varying float vY; uniform float uNight; uniform sampler2D uFacade;
      float hh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if (vAw.x >= 0.0) {
        float cat = floor(vAw.y / 100.0), seed = mod(vAw.y, 100.0), H = vAw.z;
        vec2 g = vec2(vAw.x / 3.3, vY / 3.15);
        vec2 f = fract(g), cell = floor(g);
        float nearF = 1.0 - smoothstep(0.35, 0.95, length(fwidth(g)));
        float nLev = max(1.0, floor(H / 3.15 + 0.15));
        // Façades : habitations, commerces, écoles, entrepôts, hôpitaux, chantiers, campus.
        if (cat < 2.5 || cat == 4.0 || cat == 6.0 || cat == 7.0 || cat == 10.0 || cat == 11.0) {
          float hb = hh(vec3(seed, 1.7, 3.1)), h1 = hh(vec3(cell, seed));
          float trow, col;
          if (cell.y < 0.5) { trow = 0.0; col = cat == 4.0 ? (h1 < 0.5 ? 0.0 : 6.0) : floor(h1 * 8.0); }
          else if (cat == 7.0 || (cell.y > nLev - 1.5 && hb > 0.84 && nLev > 1.5)) { trow = 3.0; col = floor(h1 * 8.0); }
          else { trow = hb < 0.55 ? 1.0 : 2.0; col = h1 > 0.8 ? mod(floor(h1 * 53.0), 8.0) : floor(hh(vec3(seed, 5.0, 1.0)) * 8.0); }
          vec2 uvA = (vec2(col, trow) + f) / vec2(8.0, 4.0);
          vec4 tx = textureGrad(uFacade, uvA, dFdx(g) / vec2(8.0, 4.0), dFdy(g) / vec2(8.0, 4.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, tx.rgb, tx.a * nearF);
          float vitre = step(0.6, tx.a) * step(0.5, cell.y) * step(dot(tx.rgb, vec3(0.333)), 0.32) * step(trow, 2.5);
          float on = step(0.55, hh(vec3(cell, seed + 3.0)));
          vec3 warm = mix(vec3(1.0, 0.64, 0.3), vec3(0.82, 0.9, 1.0), step(0.92, hh(vec3(cell.yx, seed + 7.1))));
          totalEmissiveRadiance += warm * mix(0.07, vitre * on, nearF) * uNight * 1.7;
          // Dalle de chaque niveau, en léger relief.
          diffuseColor.rgb *= 1.0 - 0.12 * nearF * (1.0 - smoothstep(0.0, 0.03, f.y)) * step(0.5, cell.y);
        }
        // Éclaboussures de terre au pied des murs.
        diffuseColor.rgb *= mix(vec3(0.78, 0.66, 0.55), vec3(1.0), smoothstep(0.05, 0.85, vY));
      }`);
};
export const buildingMeshes = [];
// Pré-calcul d'un lot de bâtiments (format B des données) : décalages, toits à quatre pans,
// quartiers de villas, surfaces. `id(i)` donne la graine de chaque bâtiment.
function preparerLot(B, id) {
  const N = B.n.length, off = new Uint32Array(N + 1); for (let i = 0; i < N; i++) off[i + 1] = off[i] + B.n[i] * 2;
  const roof = new Uint8Array(N), villa = new Uint8Array(N), surf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const n = B.n[i], cat = B.c[i], h = B.h[i] / 4, k = id(i);
    // Les quartiers de villas (Haie Vive, Cocotiers, Fidjrossè, Cadjèhoun, bord de mer d'Akpakpa)
    // sont couverts de toits à quatre pans en tuiles rouge-orangé sur les vidéos de drone.
    const bx = B.x[i] / 10, bz = B.z[i] / 10;
    villa[i] = VILLAS.some(([vx, vz, r]) => (bx - vx) ** 2 + (bz - vz) ** 2 < r * r) ? 1 : 0;
    let pHip = 0;
    { let A = 0; const o = off[i]; for (let j = 0; j < n; j++) { const q = (j + 1) % n; A += B.p[o + 2 * j] * B.p[o + 2 * q + 1] - B.p[o + 2 * q] * B.p[o + 2 * j + 1]; } surf[i] = Math.abs(A) / 200; }
    if (n === 4 && cat === 0) {
      const m2 = surf[i];
      pHip = villa[i] ? (m2 > 55 && m2 < 600 && h < 11 ? 0.82 : 0) : h < 4.8 ? 0.62 : (m2 < 320 && h < 11 ? 0.2 : 0);
    } else if (n === 4 && (cat === 4 || cat === 5 || cat === 8) && h < 4.8) pHip = cat === 8 ? 0.95 : 0.72;
    roof[i] = hash(k, 3) < pHip ? 1 : 0;
  }
  return { N, off, roof, villa, surf };
}
const tailleBatiment = (B, L, i) => [4 * B.n[i] + (L.roof[i] ? 14 : B.n[i]), 6 * B.n[i] + (L.roof[i] ? 18 : 3 * (B.n[i] - 2))];
function nouvelleCellule(v, ix) { return { pos: new Float32Array(v * 3), nrm: new Int8Array(v * 3), col: new Uint8Array(v * 3), aw: new Float32Array(v * 3), idx: new Uint32Array(ix), vi: 0, ii: 0 }; }
const xs = [], zs = [], v2 = [];
// Murs (avec l'attribut de façade) et toit d'un bâtiment, écrits dans la cellule c.
function ajouterBatiment(c, B, L, i, k) {
  const n = B.n[i], cat = B.c[i], h = B.h[i] / 4, cx = B.x[i] / 10, cz = B.z[i] / 10;
  const y0 = cat === 5 ? 1.3 : 0;
  for (let j = 0; j < n; j++) { xs[j] = cx + B.p[L.off[i] + 2 * j] / 10; zs[j] = cz + B.p[L.off[i] + 2 * j + 1] / 10; }
  const wl = PAL.wall[cat]; const wc = wl[Math.floor(hash(k, 1) * wl.length)];
  const seed = hash(k, 9) * 97;
  let u = 0;
  for (let j = 0; j < n; j++) {
    const ax = xs[j], az = zs[j], bx = xs[(j + 1) % n], bz = zs[(j + 1) % n];
    const dx = bx - ax, dz = bz - az, Ln = Math.hypot(dx, dz) || 1;
    const nx = Math.round(dz / Ln * 127), nz = Math.round(-dx / Ln * 127);
    const v = c.vi;
    const P = c.pos, o = v * 3;
    P[o] = ax; P[o + 1] = y0; P[o + 2] = az;
    P[o + 3] = bx; P[o + 4] = y0; P[o + 5] = bz;
    P[o + 6] = bx; P[o + 7] = h; P[o + 8] = bz;
    P[o + 9] = ax; P[o + 10] = h; P[o + 11] = az;
    const shade = 0.93 + 0.07 * (j % 2);
    for (let q = 0; q < 4; q++) {
      c.nrm[o + q * 3] = nx; c.nrm[o + q * 3 + 1] = 0; c.nrm[o + q * 3 + 2] = nz;
      c.col[o + q * 3] = wc[0] * shade; c.col[o + q * 3 + 1] = wc[1] * shade; c.col[o + q * 3 + 2] = wc[2] * shade;
    }
    const a2 = v * 3, code = cat * 100 + seed;
    c.aw[a2] = u; c.aw[a2 + 1] = code; c.aw[a2 + 2] = h; c.aw[a2 + 3] = u + Ln; c.aw[a2 + 4] = code; c.aw[a2 + 5] = h;
    c.aw[a2 + 6] = u + Ln; c.aw[a2 + 7] = code; c.aw[a2 + 8] = h; c.aw[a2 + 9] = u; c.aw[a2 + 10] = code; c.aw[a2 + 11] = h;
    u += Ln;
    const I = c.idx, q = c.ii;
    I[q] = v; I[q + 1] = v + 2; I[q + 2] = v + 1; I[q + 3] = v; I[q + 4] = v + 3; I[q + 5] = v + 2;
    c.vi += 4; c.ii += 6;
  }
  let rc;
  if (cat === 0) {
    const pick = l => l[Math.floor(hash(k, 2) * l.length)];
    if (L.roof[i]) rc = hash(k, 6) < (L.villa[i] ? 0.78 : 0.32) ? pick(PAL.tuile) : pick(PAL.tin);
    else if (L.surf[i] < 650 && hash(k, 7) < (L.villa[i] ? 0.55 : 0.18)) rc = pick(PAL.tuile);
    else rc = h < 4.8 && hash(k, 5) < 0.45 ? pick(PAL.tin) : pick(PAL.flat);
  }
  else { const rl = PAL.roofCat[cat]; rc = rl[Math.floor(hash(k, 2) * rl.length)]; }
  if (L.roof[i]) addHip(c, xs, zs, h, rc, seed);
  else addFlat(c, xs, zs, n, h, rc, seed, v2);
}
function meshCellule(c) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(c.pos.subarray(0, c.vi * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(c.nrm.subarray(0, c.vi * 3), 3, true));
  g.setAttribute('color', new THREE.BufferAttribute(c.col.subarray(0, c.vi * 3), 3, true));
  g.setAttribute('aw', new THREE.BufferAttribute(c.aw.subarray(0, c.vi * 3), 3));
  g.setIndex(new THREE.BufferAttribute(c.idx.subarray(0, c.ii), 1));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, buildingMat);
  m.renderOrder = 10; m.receiveShadow = !LITE;
  return m;
}
export async function buildBuildings(B) {
  const CELL = 1600, L = preparerLot(B, i => i), N = L.N, cellOf = new Int32Array(N);
  const cellKeys = new Map(), cells = [];
  for (let i = 0; i < N; i++) {
    const key = Math.floor(B.x[i] / 10 / CELL) + ',' + Math.floor(B.z[i] / 10 / CELL);
    let c = cellKeys.get(key); if (c === undefined) { c = cells.length; cellKeys.set(key, c); cells.push({ v: 0, ix: 0 }); }
    cellOf[i] = c; const [v, ix] = tailleBatiment(B, L, i); cells[c].v += v; cells[c].ix += ix;
  }
  const C = cells.map(c => nouvelleCellule(c.v, c.ix));
  for (let i = 0; i < N; i++) {
    if (i % 6000 === 0) { status('Construction des bâtiments…', 14 + Math.round(60 * i / N)); await frame(); }
    ajouterBatiment(C[cellOf[i]], B, L, i, i);
  }
  status('Assemblage…', 76); await frame();
  for (const c of C) { const m = meshCellule(c); scene.add(m); buildingMeshes.push(m); }
}
/** Un seul maillage pour un lot de bâtiments (tuiles Google Open Buildings) ; `base` varie les graines. */
export function maillageLot(B, base = 0) {
  const L = preparerLot(B, i => base + i); let v = 0, ix = 0;
  for (let i = 0; i < L.N; i++) { const [a, b] = tailleBatiment(B, L, i); v += a; ix += b; }
  const c = nouvelleCellule(v, ix);
  for (let i = 0; i < L.N; i++) ajouterBatiment(c, B, L, i, base + i);
  return meshCellule(c);
}
export function putV(c, x, y, z, nx, ny, nz, rgb, seed) {
  const v = c.vi++, o = v * 3;
  c.pos[o] = x; c.pos[o + 1] = y; c.pos[o + 2] = z;
  c.nrm[o] = nx; c.nrm[o + 1] = ny; c.nrm[o + 2] = nz;
  c.col[o] = rgb[0]; c.col[o + 1] = rgb[1]; c.col[o + 2] = rgb[2];
  c.aw[v * 3] = -1; c.aw[v * 3 + 1] = seed; c.aw[v * 3 + 2] = 0;
  return v;
}
export function addFlat(c, xs, zs, n, h, rgb, seed, v2) {
  const base = c.vi;
  for (let j = 0; j < n; j++) putV(c, xs[j], h, zs[j], 0, 127, 0, rgb, seed);
  const need = 3 * (n - 2); let wrote = 0;
  const tri = (a, b, cc) => {
    const up = (zs[b] - zs[a]) * (xs[cc] - xs[a]) - (xs[b] - xs[a]) * (zs[cc] - zs[a]) > 0;
    const I = c.idx, q = c.ii; I[q] = base + a; I[q + 1] = base + (up ? b : cc); I[q + 2] = base + (up ? cc : b); c.ii += 3; wrote += 3;
  };
  let convex = true, sign = 0;
  for (let j = 0; j < n && convex; j++) {
    const a = j, b = (j + 1) % n, d = (j + 2) % n;
    const cr = (xs[b] - xs[a]) * (zs[d] - zs[b]) - (zs[b] - zs[a]) * (xs[d] - xs[b]);
    if (Math.abs(cr) < 1e-6) continue; const s = Math.sign(cr); if (!sign) sign = s; else if (s !== sign) convex = false;
  }
  if (convex) for (let j = 1; j < n - 1; j++) tri(0, j, j + 1);
  else {
    v2.length = n; for (let j = 0; j < n; j++) v2[j] = new THREE.Vector2(xs[j], zs[j]);
    let faces = []; try { faces = THREE.ShapeUtils.triangulateShape(v2.slice(0, n), []); } catch (e) { faces = []; }
    for (const f of faces) { if (wrote >= need) break; tri(f[0], f[1], f[2]); }
  }
  while (wrote < need) { const I = c.idx, q = c.ii; I[q] = I[q + 1] = I[q + 2] = base; c.ii += 3; wrote += 3; }
}
export function addHip(c, xs, zs, h, rgb, seed) {
  const P = [0, 1, 2, 3].map(j => [xs[j], zs[j]]);
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  // côtés longs : (0,1)/(2,3) ou (1,2)/(3,0)
  let p = P;
  if (len(P[1], P[2]) + len(P[3], P[0]) > len(P[0], P[1]) + len(P[2], P[3])) p = [P[1], P[2], P[3], P[0]];
  const m30 = [(p[3][0] + p[0][0]) / 2, (p[3][1] + p[0][1]) / 2], m12 = [(p[1][0] + p[2][0]) / 2, (p[1][1] + p[2][1]) / 2];
  const w = (len(p[1], p[2]) + len(p[3], p[0])) / 2, L = len(m30, m12) || 1;
  const dx = (m12[0] - m30[0]) / L, dz = (m12[1] - m30[1]) / L;
  const inset = Math.min(w / 2, L / 2);
  const ra = [m30[0] + dx * inset, m30[1] + dz * inset], rb = [m12[0] - dx * inset, m12[1] - dz * inset];
  const rh = h + Math.min(3.2, w * 0.28);
  const face = (pts) => { // pts : [[x,y,z]…] polygone convexe
    const a = pts[0], b = pts[1], d = pts[2];
    let nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
    let ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
    let nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    let flip = false; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; flip = true; }
    const l = Math.hypot(nx, ny, nz) || 1;
    const ids = pts.map(q => putV(c, q[0], q[1], q[2], Math.round(nx / l * 127), Math.round(ny / l * 127), Math.round(nz / l * 127), rgb, seed));
    for (let j = 1; j < ids.length - 1; j++) {
      const I = c.idx, q = c.ii;
      I[q] = ids[0]; I[q + 1] = flip ? ids[j] : ids[j + 1]; I[q + 2] = flip ? ids[j + 1] : ids[j]; c.ii += 3;
    }
  };
  const A = [p[0][0], h, p[0][1]], Bv = [p[1][0], h, p[1][1]], C = [p[2][0], h, p[2][1]], D = [p[3][0], h, p[3][1]];
  const RA = [ra[0], rh, ra[1]], RB = [rb[0], rh, rb[1]];
  face([A, Bv, RB, RA]); face([C, D, RA, RB]); face([Bv, C, RB]); face([D, A, RA]);
}

// ---------- Détails : palmiers, conteneurs, navires, pirogues, monuments ----------
export function mergeColored(parts) { // parts : [geometry, hex]
  const pos = [], nrm = [], col = [];
  for (const [g0, hex] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array, c = u8c(hex);
    for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nrm.push(n[i], n[i + 1], n[i + 2]); col.push(...c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Uint8BufferAttribute(col, 3, true));
  return g;
}
export function leaf(angle, len, droop) {
  const g = new THREE.BufferGeometry();
  const v = [0, 0, 0, len * 0.5, 0.35, 0.42, len, -droop, 0, 0, 0, 0, len, -droop, 0, len * 0.5, 0.35, -0.42];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.rotateZ(0.1); g.rotateY(angle); return g;
}
export function buildPalms(arr) {
  const parts = [[new THREE.CylinderGeometry(0.17, 0.27, 9, 5, 1, true).translate(0, 4.5, 0), '#7c6449']];
  for (let k = 0; k < 9; k++) parts.push([leaf(k * 0.7 + (k % 2) * 0.2, 3.6 + (k % 3) * 0.5, 1.6 + (k % 2) * 0.6).translate(0, 9, 0), k % 2 ? '#4d7a2c' : '#5f8c35']);
  const g = mergeColored(parts);
  const n = arr.length / 2;
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const sc = 0.75 + hash(i, 21) * 0.6;
    e.set((hash(i, 22) - 0.5) * 0.18, hash(i, 23) * 6.28, (hash(i, 24) - 0.5) * 0.18);
    m.compose(p.set(arr[2 * i] / 10, 0, arr[2 * i + 1] / 10), q.setFromEuler(e), s.set(sc, sc, sc));
    mesh.setMatrixAt(i, m);
  }
  mesh.castShadow = !LITE; mesh.renderOrder = 11; mesh.visible = false;
  mesh.userData.xz = Float32Array.from(arr, v => v / 10); VEGETATION.push(mesh);
  scene.add(mesh); return mesh;
}
export function buildContainers(arr) {
  const n = arr.length / 5;
  const g = new THREE.BoxGeometry(12.2, 2.6, 2.44).translate(0, 1.3, 0);
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial(), n);
  const cols = ['#b5422d', '#2f5f8a', '#3c7a4f', '#d58a2a', '#8a9095', '#7a4a2c', '#e0d8c8'].map(h => new THREE.Color(h));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const b = i * 5;
    m.compose(p.set(arr[b] / 10, 0, arr[b + 1] / 10), q.setFromAxisAngle(Y, -arr[b + 2] / 1000), s.set(1, arr[b + 3], 1));
    mesh.setMatrixAt(i, m); mesh.setColorAt(i, cols[arr[b + 4]]);
  }
  mesh.castShadow = !LITE; mesh.receiveShadow = !LITE; mesh.renderOrder = 11; mesh.visible = false;
  scene.add(mesh); return mesh;
}
export function buildShips() {
  const group = new THREE.Group();
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-80, -13); hullShape.lineTo(58, -13); hullShape.quadraticCurveTo(80, -10, 92, 0); hullShape.quadraticCurveTo(80, 10, 58, 13); hullShape.lineTo(-80, 13); hullShape.closePath();
  const hull = new THREE.ExtrudeGeometry(hullShape, { depth: 11, bevelEnabled: false }).rotateX(-Math.PI / 2);
  const hullCols = ['#8c2f2a', '#23384f', '#2b2b2e', '#1f4d4a'];
  const spots = [[-1200, 6400, 3.6], [800, 5800, 3.5], [2600, 7200, 3.7], [4300, 6100, 3.5], [-2600, 7900, 3.6], [1700, 9100, 3.7], [5600, 8600, 3.55], [-300, 10400, 3.6]];
  spots.forEach(([x, z, a], i) => {
    const parts = [[hull, hullCols[i % hullCols.length]], [new THREE.BoxGeometry(16, 20, 24).translate(-66, 21, 0), '#efece4'], [new THREE.BoxGeometry(4, 10, 4).translate(-70, 35, 0), '#3a3a3a']];
    const ccol = ['#b5422d', '#2f5f8a', '#3c7a4f', '#d58a2a', '#8a9095'];
    for (let r = 0; r < 9; r++) { const hgt = 2.6 * (2 + ((i + r) % 3)); parts.push([new THREE.BoxGeometry(12, hgt, 22).translate(-44 + r * 13.5, 11 + hgt / 2, 0), ccol[(i * 3 + r) % ccol.length]]); }
    const mesh = new THREE.Mesh(mergeColored(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.position.set(x, -2, z); mesh.rotation.y = a + (hash(i, 40) - 0.5) * 0.3; mesh.scale.setScalar(0.9 + hash(i, 41) * 0.3);
    mesh.castShadow = !LITE; group.add(mesh);
  });
  group.renderOrder = 11; scene.add(group); return group;
}
