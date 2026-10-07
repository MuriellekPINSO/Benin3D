import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LITE, hash } from './base.js';
import { COUCHES_SOL, grainSol, scene } from './scene.js';

// ---------- Terre-pleins centraux des boulevards ----------
// Entre les deux chaussées à sens unique d'un même boulevard (calculé par scripts/donnees.mjs,
// L.terrePleins : [{ nom, p: [[x, z, largeur], …] }]). D'après la vue satellite Google et les vidéos :
// moins de 1 m, un simple double trait (Steinmetz) ; de 1 à 4,5 m, un séparateur en béton surélevé
// bordé de blanc, avec des lampadaires à double crosse (Marina, Route des Pêches, Saint-Michel) ;
// au-delà, un terre-plein de gazon avec blocs de haie taillée et lampadaires.

export const TP = { bandes: [], grille: new Map(), decor: [] };
const CASE = 40, cle = (x, z) => Math.floor(x / CASE) + ',' + Math.floor(z / CASE);

/** À appeler avant la rue et la circulation : range les terre-pleins dans une grille. */
export function initTerrePleins(T = []) {
  TP.bandes = T; TP.grille.clear();
  for (const b of T) for (let i = 1; i < b.p.length; i++) {
    const [ax, az, wa] = b.p[i - 1], [bx, bz, wb] = b.p[i], hw = Math.max(wa, wb) / 2 + 1;
    for (let cx = Math.floor((Math.min(ax, bx) - hw) / CASE); cx <= Math.floor((Math.max(ax, bx) + hw) / CASE); cx++)
      for (let cz = Math.floor((Math.min(az, bz) - hw) / CASE); cz <= Math.floor((Math.max(az, bz) + hw) / CASE); cz++) {
        const k = cx + ',' + cz; let l = TP.grille.get(k); if (!l) TP.grille.set(k, l = []); l.push([ax, az, bx, bz, wa / 2, wb / 2]);
      }
  }
}
/** Vrai si (x, z) est sur un terre-plein (élargi de `marge` mètres). */
export function dansTerrePlein(x, z, marge = 0) {
  const l = TP.grille.get(cle(x, z)); if (!l) return false;
  for (const [ax, az, bx, bz, ha, hb] of l) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    if (Math.hypot(ax + dx * t - x, az + dz * t - z) < ha + (hb - ha) * t + marge) return true;
  }
  return false;
}

// Normale lissée au point i d'une bande.
function normale(p, i) {
  const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return [-dz / l, dx / l, dx / l, dz / l];
}
function drapeauToile() {
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 64; const c = cv.getContext('2d');
  c.fillStyle = '#008751'; c.fillRect(0, 0, 38, 64); c.fillStyle = '#fcd116'; c.fillRect(38, 0, 58, 32); c.fillStyle = '#e8112d'; c.fillRect(38, 32, 58, 32);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Construit les terre-pleins : gazon, bordures, haies, lampadaires, drapeaux. */
export function construireTerrePleins() {
  if (!TP.bandes.length) return;
  const gaz = { pos: [], col: [], idx: [] }, bord = { pos: [], idx: [] };
  const haies = [], lampes = [], drapeaux = [];
  const vert = ['#5c8a3f', '#557f3a', '#64924a', '#5a8740'].map(h => new THREE.Color(h)), beton = ['#c9c6be', '#c3c0b8', '#cfccc4'].map(h => new THREE.Color(h)), blanc = new THREE.Color('#ecebe4');
  for (const [bi, b] of TP.bandes.entries()) {
    const p = b.p, n = p.length, base = gaz.pos.length / 3;
    const wm = p.map(q => q[2]).sort((u, v) => u - v)[Math.floor(n / 2)], type = wm < 1 ? 'peint' : wm < 4.5 ? 'beton' : 'gazon';
    // Surface : gazon ou béton entre les bordures, légèrement surélevé ; double trait blanc si moins de 1 m.
    for (let i = 0; i < n; i++) {
      const [x, z, w] = p[i], [nx, nz] = normale(p, i), h = type === 'peint' ? Math.max(.08, w / 2) : Math.max(.1, w / 2 - .3);
      const c = type === 'gazon' ? vert[Math.floor(hash(bi * 31 + i, 7) * vert.length)] : type === 'beton' ? beton[Math.floor(hash(bi * 31 + i, 7) * beton.length)] : blanc;
      const y = type === 'peint' ? .03 : .16;
      gaz.pos.push(x - nx * h, y, z - nz * h, x + nx * h, y, z + nz * h); gaz.col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i) { const o = base + (i - 1) * 2; gaz.idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    }
    // Bordures blanches : dessus (30 cm) et face côté chaussée, des deux côtés (pas pour un simple marquage).
    if (type !== 'peint') for (const s of [-1, 1]) {
      const b0 = bord.pos.length / 3;
      for (let i = 0; i < n; i++) {
        const [x, z, w] = p[i], [nx, nz] = normale(p, i), e = w / 2, d = Math.max(.05, w / 2 - .3);
        bord.pos.push(x + s * nx * d, .2, z + s * nz * d, x + s * nx * e, .2, z + s * nz * e, x + s * nx * e, 0, z + s * nz * e);
        if (i) { const o = b0 + (i - 1) * 3, q = o + 3; bord.idx.push(o, q, o + 1, o + 1, q, q + 1, o + 1, q + 1, o + 2, o + 2, q + 1, q + 2); }
      }
    }
    // Haies, lampadaires et drapeaux le long de l'axe.
    let cum = 0;
    for (let i = 1; i < n; i++) {
      const [ax, az, wa] = p[i - 1], [bx, bz] = p[i], L = Math.hypot(bx - ax, bz - az); if (!L) continue;
      const ang = Math.atan2(bx - ax, bz - az);
      for (let d = 0; d < L; d += 1) {
        const s = cum + d, x = ax + (bx - ax) * d / L, z = az + (bz - az) * d / L;
        if (s < 6) continue;
        if (type === 'gazon' && s % 7 < 1) haies.push([x, z, ang, Math.min(1.5, wa - 1.6), hash(bi * 97 + Math.round(s), 3)]);
        if (type !== 'peint' && (s + 16) % 32 < 1) lampes.push([x, z, ang]);
      }
      cum += L;
    }
  }
  // Gazon et bordures : au sol, comme les routes (visibles en jeu sur la vue Google).
  const sol = (pos, idx, mat, ordre) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.renderOrder = ordre; m.receiveShadow = true; m.userData.route = true; scene.add(m); COUCHES_SOL.push(m); return m;
  };
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(gaz.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(gaz.col, 3)); g.setIndex(gaz.idx);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(gaz.pos.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    const m = new THREE.Mesh(g, grainSol(new THREE.MeshLambertMaterial({ vertexColors: true, depthWrite: false }))); m.renderOrder = 7.8; m.receiveShadow = true; m.userData.route = true; scene.add(m); COUCHES_SOL.push(m); }
  sol(bord.pos, bord.idx, new THREE.MeshLambertMaterial({ color: '#e9e7e0', side: THREE.DoubleSide }), 8);
  // Objets : instanciés, cachés avec la végétation en vue Google seule.
  const inst = (geo, mat, liste, poser) => {
    if (!liste.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, liste.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    liste.forEach((e, k) => { poser(e, v, q, s, Y, m, k); m4.compose(v, q, s); m.setMatrixAt(k, m4); });
    m.castShadow = !LITE; m.receiveShadow = true; scene.add(m); TP.decor.push(m); return m;
  };
  const vertsHaie = ['#3f6a33', '#46733a', '#3a612f'].map(h => new THREE.Color(h));
  inst(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), new THREE.MeshLambertMaterial(), haies, ([x, z, a, w, r], v, q, s, Y, m, k) => {
    v.set(x, .16, z); q.setFromAxisAngle(Y, a); s.set(w, .8 + r * .2, 2.4); m.setColorAt(k, vertsHaie[Math.floor(r * 3)]);
  });
  // Lampadaire solaire à double crosse (au-dessus des deux chaussées), panneau incliné au sommet.
  const lampe = mergeGeometries([
    new THREE.CylinderGeometry(.09, .13, 10, 6).translate(0, 5, 0),
    new THREE.BoxGeometry(3.6, .1, .1).translate(0, 9.6, 0),
    new THREE.BoxGeometry(.55, .12, .28).translate(-1.8, 9.5, 0), new THREE.BoxGeometry(.55, .12, .28).translate(1.8, 9.5, 0),
    new THREE.BoxGeometry(1.2, .05, .7).rotateX(.35).translate(0, 10.3, 0),
  ].map(g => g.toNonIndexed()));
  inst(lampe, new THREE.MeshStandardMaterial({ color: '#6b7076', roughness: .5, metalness: .4 }), lampes, ([x, z, a], v, q, s, Y) => { v.set(x, .16, z); q.setFromAxisAngle(Y, a); s.set(1, 1, 1); });
  // Drapeaux du Bénin sur mâts (boulevard de la Marina).
  inst(new THREE.CylinderGeometry(.05, .07, 8, 6).translate(0, 4, 0), new THREE.MeshLambertMaterial({ color: '#e8e4d6' }), drapeaux, ([x, z, a], v, q, s, Y) => { v.set(x, .16, z); q.setFromAxisAngle(Y, a); s.set(1, 1, 1); });
  inst(new THREE.PlaneGeometry(1.6, 1.05).translate(.85, 7.3, 0).rotateY(Math.PI / 2), new THREE.MeshLambertMaterial({ map: drapeauToile(), side: THREE.DoubleSide }), drapeaux, ([x, z, a], v, q, s, Y) => { v.set(x, .16, z); q.setFromAxisAngle(Y, a); s.set(1, 1, 1); });
  console.info(`terre-pleins : ${TP.bandes.length} bandes, ${haies.length} haies, ${lampes.length} lampadaires, ${drapeaux.length} drapeaux`);
}
