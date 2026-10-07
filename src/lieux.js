import * as THREE from 'three';
import { poserTripo, tripoDispo } from './batiments-tripo.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { LITE, hash, toXZ, u8c } from './base.js';
import { scene } from './scene.js';
import { ROAD_W, TABLIERS, roadLines } from './ville.js';

// ---------- Lieux détaillés ----------
// Matières et primitives reprises du projet « 3D monde » (src/entities/Batisseur.ts),
// où chaque motif a été dessiné d'après les photos et vidéos de repérage.
export const K = (() => {
  let graine = 1;
  const alea = () => { graine = (graine * 1103515245 + 12345) & 0x7fffffff; return graine / 0x7fffffff; };
  const grain = (c, t, n, couleurs, taille = 2) => { for (let i = 0; i < n; i++) { c.fillStyle = couleurs[Math.floor(alea() * couleurs.length)]; c.fillRect(alea() * t, alea() * t, taille, taille); } };
  const verriere = (c, t, fond, meneau) => {
    c.fillStyle = fond; c.fillRect(0, 0, t, t);
    c.strokeStyle = meneau; c.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * t / 4, 0); c.lineTo(i * t / 4, t); c.stroke(); }
    for (let j = 0; j <= 3; j++) { c.beginPath(); c.moveTo(0, j * t / 3); c.lineTo(t, j * t / 3); c.stroke(); }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { c.fillStyle = '#f0ece2'; c.fillRect(i * t / 4 + t / 13, j * t / 3 + t / 11, t / 9, t / 12); }
  };
  const D = {
    paves(c, t) { c.fillStyle = '#d5cec0'; c.fillRect(0, 0, t, t); const k = t / 8; for (let l = 0; l < 8; l++) for (let col = -1; col < 9; col++) { c.fillStyle = ['#dad3c6', '#cfc7b8', '#e0dacd', '#d2cbbc'][Math.floor(alea() * 4)]; c.fillRect(col * k + (l % 2 ? k / 2 : 0) + 1, l * k + 1, k - 2, k - 2); } grain(c, t, 500, ['#c7bfb0', '#e4dfd3']); },
    bitume(c, t) { c.fillStyle = '#5c5f60'; c.fillRect(0, 0, t, t); grain(c, t, 1200, ['#666969', '#525556', '#6f7272']); },
    sable(c, t) { c.fillStyle = '#e0cfa8'; c.fillRect(0, 0, t, t); grain(c, t, 1600, ['#d6c39a', '#e9daba', '#cbb891', '#f0e3c6']); },
    gazon(c, t) { c.fillStyle = '#6d8f4e'; c.fillRect(0, 0, t, t); grain(c, t, 1800, ['#628345', '#7b9d59', '#587a3e', '#86a663'], 3); },
    beton(c, t) { c.fillStyle = '#b3ac9e'; c.fillRect(0, 0, t, t); grain(c, t, 900, ['#aaa395', '#bdb6a8', '#a09989']); c.strokeStyle = '#9c9587'; c.lineWidth = 2; for (const p of [0, .5, 1]) { c.beginPath(); c.moveTo(p * t, 0); c.lineTo(p * t, t); c.moveTo(0, p * t); c.lineTo(t, p * t); c.stroke(); } },
    piste(c, t) { c.fillStyle = '#ac5f3f'; c.fillRect(0, 0, t, t); grain(c, t, 900, ['#a2573a', '#b96b48', '#96502f']); c.fillStyle = '#efe7d5'; c.fillRect(t * .485, t * .25, t * .03, t * .5); },
    vitrage(c, t) { verriere(c, t, '#2f5f88', '#27496a'); },
    vitrageSombre(c, t) { verriere(c, t, '#2c3134', '#232729'); },
    pavesGris(c, t) { c.fillStyle = '#9a9c98'; c.fillRect(0, 0, t, t); const h = t / 8, l = t / 4; for (let r = 0; r < 8; r++) for (let k = -1; k < 5; k++) { c.fillStyle = ['#6f7370', '#777b78', '#6a6e6b', '#7d807c'][Math.floor(alea() * 4)]; c.fillRect(k * l + (r % 2 ? l / 2 : 0) + 1.5, r * h + 1.5, l - 3, h - 3); } grain(c, t, 700, ['#646865', '#82857f']); },
    chevrons(c, t) { c.fillStyle = '#cfc8ba'; c.fillRect(0, 0, t, t); const u = t / 8; for (let i = -2; i < 10; i++) for (let j = -2; j < 10; j++) { c.fillStyle = ['#e4ddd0', '#ddd6c8', '#e8e2d6', '#d8d1c2'][Math.floor(alea() * 4)]; const x = i * u * 2, y = j * u * 2; c.fillRect(x + (j % 2) * u + 1, y + 1, u * 2 - 2, u - 2); c.fillRect(x + (j % 2) * u + 1, y + u + 1, u - 2, u * 2 - 2); } grain(c, t, 500, ['#d2cbbd', '#ece6db']); },
    // Tambours du Palais des Congrès : enduit blanc, frise de triangles des tata somba.
    tata(c, t) { c.fillStyle = '#f2f0ea'; c.fillRect(0, 0, t, t); grain(c, t, 160, ['#ebe8e0', '#f7f5f0']); const haut = t * .3, bas = t * .46, n = 6; c.fillStyle = '#e4e0d6'; c.fillRect(0, haut - t * .025, t, t * .012); c.fillRect(0, bas + t * .012, t, t * .012); c.fillStyle = '#3b3935'; for (let i = 0; i < n; i++) { const x = i * t / n, w = t / n; c.beginPath(); c.moveTo(x + w * .08, bas); c.lineTo(x + w * .5, haut); c.lineTo(x + w * .92, bas); c.closePath(); c.fill(); } c.fillStyle = '#e9e6de'; for (let i = 0; i < 4; i++) c.fillRect(0, t * (.62 + i * .09), t, t * .006); },
    // Frise des tambours : zigzag blanc sur fond sombre (triangles évidés).
    friseTata(c, t) { c.fillStyle = '#f2f0ea'; c.fillRect(0, 0, t, t); c.fillStyle = '#2f3134'; const w = t / 2, y0 = t * .14, y1 = t * .86, m = t * .035; for (let i = 0; i < 2; i++) { const x = i * w; c.beginPath(); c.moveTo(x + m * 1.6, y1 - m); c.lineTo(x + w / 2, y0 + m * 1.6); c.lineTo(x + w - m * 1.6, y1 - m); c.closePath(); c.fill(); c.beginPath(); c.moveTo(x + w / 2 + m * 1.6, y0 + m); c.lineTo(x + w, y1 - m * 1.6); c.lineTo(x + w * 1.5 - m * 1.6, y0 + m); c.closePath(); c.fill(); if (i === 1) { c.beginPath(); c.moveTo(-w / 2 + m * 1.6, y0 + m); c.lineTo(0, y1 - m * 1.6); c.lineTo(w / 2 - m * 1.6, y0 + m); c.closePath(); c.fill(); } } },
    claustra(c, t) { c.fillStyle = '#f1ece0'; c.fillRect(0, 0, t, t); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { c.fillStyle = '#5d6b64'; c.fillRect(i * t / 8 + t / 34, j * t / 8 + t / 34, t / 8 - t / 17, t / 8 - t / 17); } },
    tole(c, t) { c.fillStyle = '#8c857a'; c.fillRect(0, 0, t, t); for (let i = 0; i < 32; i++) { c.fillStyle = i % 2 ? '#999287' : '#7b756b'; c.fillRect(i * t / 32, 0, t / 64, t); } grain(c, t, 400, ['#7a6f60', '#9d958a', '#6f6458']); },
    drapeau(c, t) { c.fillStyle = '#008751'; c.fillRect(0, 0, t * .38, t); c.fillStyle = '#fcd116'; c.fillRect(t * .38, 0, t * .62, t / 2); c.fillStyle = '#e8112d'; c.fillRect(t * .38, t / 2, t * .62, t / 2); },
    roche(c, t) { c.fillStyle = '#a89a83'; c.fillRect(0, 0, t, t); for (let i = 0; i < 100; i++) { c.fillStyle = ['#b6a992', '#9a8c76', '#c2b6a0', '#8d8070'][Math.floor(alea() * 4)]; const w = t * .09 + alea() * t * .17; c.fillRect(alea() * t, alea() * t, w, w * .7); } },
    // Cathédrale Notre-Dame : rayures rouges et blanches, baies en plein cintre cernées de rouge.
    rayures(c, t) {
      for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? '#f1ece4' : '#b8352c'; c.fillRect(0, i * t / 10, t, t / 10 + 1); }
      const bx = t * .3, bw = t * .4, by = t * .22, bh = t * .5;
      c.fillStyle = '#9d2a22'; c.beginPath(); c.moveTo(bx - 6, by + bh); c.lineTo(bx - 6, by + bw / 2); c.arc(t / 2, by + bw / 2, bw / 2 + 6, Math.PI, 0); c.lineTo(bx + bw + 6, by + bh); c.closePath(); c.fill();
      c.fillStyle = '#2b2a2c'; c.beginPath(); c.moveTo(bx, by + bh); c.lineTo(bx, by + bw / 2); c.arc(t / 2, by + bw / 2, bw / 2, Math.PI, 0); c.lineTo(bx + bw, by + bh); c.closePath(); c.fill();
      grain(c, t, 300, ['#e6dfd4', '#a93029']);
    },
    rayuresPleines(c, t) { for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? '#f1ece4' : '#b8352c'; c.fillRect(0, i * t / 10, t, t / 10 + 1); } grain(c, t, 300, ['#e6dfd4', '#a93029']); },
    // Planches de Ganvié : lames verticales de bois gris, joints sombres.
    planches(c, t) { for (let i = 0; i < 12; i++) { c.fillStyle = ['#cfc6b6', '#bdb3a2', '#d8d0c2', '#c4baa8'][Math.floor(alea() * 4)]; c.fillRect(i * t / 12, 0, t / 12 - 2, t); } c.fillStyle = '#5b5247'; for (let i = 0; i < 12; i++) c.fillRect(i * t / 12 + t / 12 - 2, 0, 2, t); grain(c, t, 600, ['#a99f8e', '#e2dbcf'], 2); },
    paille(c, t) { c.fillStyle = '#a88d5c'; c.fillRect(0, 0, t, t); for (let i = 0; i < 900; i++) { c.strokeStyle = ['#bfa46d', '#8e7447', '#c9b27c', '#9b8150'][Math.floor(alea() * 4)]; c.lineWidth = 1 + alea() * 2; const x = alea() * t, y = alea() * t; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (alea() - .5) * 6, y + 10 + alea() * 18); c.stroke(); } for (let j = 0; j < 6; j++) { c.fillStyle = 'rgba(70,52,30,.35)'; c.fillRect(0, j * t / 6, t, 3); } },
    // Gradins du stade : rangées de sièges jaunes, verts et rouges.
    gradins(c, t) { const n = 16; for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? '#9a958c' : '#b5b0a6'; c.fillRect(0, i * t / n, t, t / n); for (let k = 0; k < 24; k++) { const col = ['#e8b323', '#e8b323', '#2f8a4a', '#c8382f'][(Math.floor(k / 6) + Math.floor(i / 5)) % 4]; c.fillStyle = col; c.fillRect(k * t / 24 + 1, i * t / n + 2, t / 24 - 2, t / n * .45); } } },
    facadeStade(c, t) { c.fillStyle = '#d4b892'; c.fillRect(0, 0, t, t); for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#c4a57d' : '#dfc7a3'; c.fillRect(i * t / 16, t * .1, t / 32, t * .8); } c.fillStyle = '#8c6f4f'; c.fillRect(0, t * .9, t, t * .1); grain(c, t, 300, ['#cbb08a', '#e2cda9']); },
    aerogare(c, t) { c.fillStyle = '#d9c3a0'; c.fillRect(0, 0, t, t); c.fillStyle = '#3d5a5e'; c.fillRect(0, t * .18, t, t * .72); c.strokeStyle = '#c9b38f'; c.lineWidth = 4; for (let i = 0; i <= 6; i++) { c.beginPath(); c.moveTo(i * t / 6, t * .18); c.lineTo(i * t / 6, t * .9); c.stroke(); } c.beginPath(); c.moveTo(0, t * .54); c.lineTo(t, t * .54); c.stroke(); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(t * .05, t * .2, t * .2, t * .3); },
    facadeMarina(c, t) { c.fillStyle = '#cdbb9a'; c.fillRect(0, 0, t, t); verriereBande(c, t); grain(c, t, 250, ['#c3b08e', '#d8c7a8']); },
    murBlanc(c, t) { c.fillStyle = '#efece5'; c.fillRect(0, 0, t, t); grain(c, t, 300, ['#e6e2d9', '#f6f4ef']); c.fillStyle = '#3e4c50'; for (let i = 0; i < 4; i++) c.fillRect(i * t / 4 + t * .05, t * .35, t * .15, t * .4); },
    facadeMarche(c, t) { c.fillStyle = '#d9c7b8'; c.fillRect(0, 0, t, t); for (let f = 0; f < 3; f++) { const y = f * t / 3; c.fillStyle = '#b9a593'; c.fillRect(0, y, t, t * .04); for (let i = 0; i < 5; i++) { c.fillStyle = (i + f) % 3 ? '#4c5654' : '#6f8a8c'; c.fillRect(i * t / 5 + t * .03, y + t * .09, t / 5 - t * .06, t * .17); } } grain(c, t, 400, ['#cdb9a8', '#e6d6c8', '#a8988a']); },
  };
  function verriereBande(c, t) { c.fillStyle = '#2f5f88'; c.fillRect(0, t * .32, t, t * .46); c.strokeStyle = '#27496a'; c.lineWidth = 3; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * t / 4, t * .32); c.lineTo(i * t / 4, t * .78); c.stroke(); } for (let i = 0; i < 4; i++) { c.fillStyle = '#f0ece2'; c.fillRect(i * t / 4 + t / 13, t * .4, t / 9, t / 16); } c.fillStyle = '#b9a685'; c.fillRect(0, t * .9, t, t * .1); }

  const tailles = {};
  const geos = new Map(), mats = new Map(), toiles = new Map();
  let cible = null;
  const K = {
    alea,
    motif(nom, f, w = 256, h = 256) { D[nom] = f; tailles[nom] = [w, h]; },
    get racine() { return cible; },
    into(g, fn) { const p = cible; cible = g; try { fn(); } finally { cible = p; } return g; },
    geo(cle, fab) { if (!geos.has(cle)) geos.set(cle, fab()); return geos.get(cle); },
    toile(motif) { if (!toiles.has(motif)) { const cv = document.createElement('canvas'); const [w, h] = tailles[motif] || [256, 256]; cv.width = w; cv.height = h; graine = 1; D[motif](cv.getContext('2d'), w); toiles.set(motif, cv); } return toiles.get(motif); },
    mat(couleur, o = {}) {
      const cle = `u${couleur}|${o.rugosite}|${o.metal}|${o.transparent}|${o.face2}|${o.emissif}`;
      if (!mats.has(cle)) mats.set(cle, new THREE.MeshStandardMaterial({ color: couleur, roughness: o.rugosite ?? .85, metalness: o.metal ?? 0, transparent: o.transparent !== undefined, opacity: o.transparent ?? 1, side: o.face2 ? THREE.DoubleSide : THREE.FrontSide, emissive: o.emissif ?? '#000000' }));
      return mats.get(cle);
    },
    tex(motif, rx = 1, ry = 1, teinte = '#ffffff', o = {}) {
      const cle = `t${motif}|${rx}|${ry}|${teinte}|${o.metal}|${o.face2}|${o.vc}`;
      if (!mats.has(cle)) {
        const carte = new THREE.CanvasTexture(K.toile(motif));
        carte.colorSpace = THREE.SRGBColorSpace; carte.wrapS = carte.wrapT = THREE.RepeatWrapping; carte.repeat.set(rx, ry); carte.anisotropy = 4;
        mats.set(cle, new THREE.MeshStandardMaterial({ map: carte, color: teinte, roughness: o.rugosite ?? .82, metalness: o.metal ?? 0, side: o.face2 ? THREE.DoubleSide : THREE.FrontSide, vertexColors: !!o.vc }));
      }
      return mats.get(cle);
    },
    /** Matériau à partir d'une photo (public/textures/…), répétée `rx` × `ry` fois ; `alpha` : masque de transparence. */
    photo(fichier, o = {}) {
      const cle = `p${fichier}|${o.rx}|${o.ry}|${o.alpha}`;
      if (!mats.has(cle)) {
        const ch = f => { const t = new THREE.TextureLoader().load(import.meta.env.BASE_URL + f); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.rx ?? 1, o.ry ?? 1); t.anisotropy = 8; return t; };
        const map = ch(fichier); map.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.MeshStandardMaterial({ map, roughness: o.rugosite ?? .85, metalness: o.metal ?? 0, side: o.face2 ? THREE.DoubleSide : THREE.FrontSide });
        if (o.alpha) { m.alphaMap = ch(o.alpha); m.alphaTest = .5; }
        mats.set(cle, m);
      }
      return mats.get(cle);
    },
    maillage(g, c, x, y, z, parent) { const m = new THREE.Mesh(g, typeof c === 'string' ? K.mat(c) : c); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (parent ?? cible).add(m); return m; },
    boite(w, h, d, c, x, y, z, parent) { return K.maillage(K.geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), c, x, y, z, parent); },
    cyl(rH, rB, h, seg, c, x, y, z, parent, ouvert = false) { return K.maillage(K.geo(`c${rH},${rB},${h},${seg},${ouvert}`, () => new THREE.CylinderGeometry(rH, rB, h, seg, 1, ouvert)), c, x, y, z, parent); },
    sphere(r, c, x, y, z, parent) { return K.maillage(K.geo(`s${r}`, () => new THREE.SphereGeometry(r, 12, 9)), c, x, y, z, parent); },
    cone(r, h, seg, c, x, y, z, parent) { return K.maillage(K.geo(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), c, x, y, z, parent); },
    anneau(rInt, rExt, c, x, y, z, depart = 0, longueur = Math.PI * 2) { const m = K.maillage(K.geo(`a${rInt},${rExt},${depart},${longueur}`, () => { const g = new THREE.RingGeometry(rInt, rExt, 64, 1, depart, longueur); g.rotateX(-Math.PI / 2); return g; }), c, x, y, z); m.castShadow = false; return m; },
    etoile(rExt, rInt, ep, c, x, y, z, rot = 0) {
      return K.maillage(K.geo(`e${rExt},${rInt},${ep},${rot}`, () => {
        const f = new THREE.Shape();
        for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2 + rot, r = i % 2 ? rInt : rExt; i ? f.lineTo(Math.cos(a) * r, Math.sin(a) * r) : f.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
        f.closePath(); const g = new THREE.ExtrudeGeometry(f, { depth: ep, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return g;
      }), c, x, y, z);
    },
    sol(w, d, c, x, z, y = 0) { const m = K.boite(w, .3, d, c, x, y - .15, z); m.castShadow = false; return m; },
    cable(a, b, r, c, parent) { const d0 = new THREE.Vector3(...a), dir = new THREE.Vector3(...b).sub(d0); const m = K.cyl(r, r, dir.length(), 5, c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, parent); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); m.castShadow = false; return m; },
    rocher(x, y, z, rayon, c, parent) { const m = K.maillage(K.geo(`i${rayon}`, () => new THREE.IcosahedronGeometry(rayon, 0)), c, x, y, z, parent); m.rotation.set(varie(x, z) * 3, varie(z, x) * 3, varie(rayon, x) * 3); m.scale.set(1, .62 + varie(x, y) * .45, 1.12); return m; },
    haie(x, z, w, d, h = .8) { return K.boite(w, h, d, '#4f7a3c', x, h / 2, z); },
    frondaison(nb, longueur, chute, largeur) {
      return K.geo(`f${nb},${longueur},${chute},${largeur}`, () => {
        const pos = [], idx = [], seg = 5; let base = 0;
        for (let p = 0; p < nb; p++) {
          const a = p * Math.PI * 2 / nb, dx = Math.cos(a), dz = Math.sin(a);
          for (let s = 0; s <= seg; s++) { const u = s / seg, r = u * longueur, y = u * 1.15 * longueur / 4 - u * u * chute, l = largeur * Math.sin(u * Math.PI); pos.push(dx * r - dz * l, y, dz * r + dx * l, dx * r + dz * l, y, dz * r - dx * l); }
          for (let s = 0; s < seg; s++) { const i0 = base + s * 2; idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2); }
          base += (seg + 1) * 2;
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
      });
    },
    cocotier(x, z, fosse = true) {
      const v = varie(x, z), h = 8 + v * 3.5;
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = v * 6.3; cible.add(g);
      K.cyl(.19, .3, h, 8, '#9e8865', 0, h / 2, 0, g).rotation.z = (v - .5) * .16;
      K.maillage(K.frondaison(9, 3.7, 2.5, .42), K.mat('#4b7d4a', { face2: true }), (v - .5) * .5, h - .1, 0, g);
      K.sphere(.22, '#7d9440', .1, h - .55, .14, g).scale.set(1.4, .75, 1.4);
      if (fosse) K.boite(1.7, .1, 1.7, '#8d8677', 0, .06, 0, g).castShadow = false;
      return g;
    },
    palmierRoyal(x, z) {
      const h = 11 + varie(x, z) * 2;
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = varie(z, x) * 6.3; cible.add(g);
      K.cyl(.28, .42, h, 8, '#b9b1a0', 0, h / 2, 0, g);
      K.maillage(K.frondaison(11, 3.2, 2.9, .36), K.mat('#39663d', { face2: true }), 0, h - .1, 0, g);
      return g;
    },
    arbre(x, z, echelle = 1) {
      const v = varie(x, z);
      const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(echelle * (.85 + v * .35)); cible.add(g);
      K.cyl(.4, .6, 4, 7, '#7d6a53', 0, 2, 0, g);
      const f = K.mat('#3f6b3c');
      K.sphere(3.4, f, 0, 5.1, 0, g).scale.set(1.25, .5, 1.25);
      K.sphere(2.5, f, 1.4, 6, -.8, g).scale.set(1.15, .55, 1.15);
      K.sphere(2.1, K.mat('#507b45'), -1.45, 5.75, .55, g).scale.set(1.1, .52, 1.05);
      return g;
    },
    lampadaireDouble(x, z, rot = 0) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; cible.add(g);
      K.cyl(.11, .17, 9, 8, '#9aa0a2', 0, 4.5, 0, g); K.cyl(.28, .31, .12, 10, '#737a78', 0, .07, 0, g);
      K.boite(3.4, .12, .12, '#9aa0a2', 0, 8.95, 0, g);
      for (const dx of [-1.5, 1.5]) { K.boite(.75, .16, .34, '#e7e3d6', dx, 8.8, 0, g); K.boite(.55, .035, .24, '#fff4c7', dx, 8.69, 0, g); }
      return g;
    },
    lampadaireSimple(x, z, sens = 1, rot = 0) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; cible.add(g);
      K.cyl(.1, .15, 8, 8, '#5d6360', 0, 4, 0, g); K.cyl(.25, .28, .1, 10, '#3f4544', 0, .06, 0, g);
      K.boite(1.8, .12, .12, '#5d6360', sens * .9, 7.95, 0, g);
      K.boite(.8, .16, .3, '#f0ebda', sens * 1.7, 7.82, 0, g); K.boite(.6, .03, .22, '#fff4c7', sens * 1.7, 7.71, 0, g);
      return g;
    },
    lanterneGlobe(x, z) { const g = new THREE.Group(); g.position.set(x, 0, z); cible.add(g); K.cyl(.08, .13, 4.4, 8, '#2b2f2e', 0, 2.2, 0, g); K.sphere(.34, '#f6f1e0', 0, 4.6, 0, g); K.cone(.3, .3, 8, '#2b2f2e', 0, 4.95, 0, g); return g; },
    matEclairage(x, z, k = 1) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(k); cible.add(g);
      const acier = K.mat('#b0b4b0'), r = .58;
      for (let i = 0; i < 3; i++) { const a = i * 2.094; K.cyl(.055, .085, 18, 6, acier, Math.cos(a) * r, 9, Math.sin(a) * r, g); }
      for (let y = 2; y < 18; y += 3.2) K.maillage(K.geo(`tr${r}`, () => new THREE.TorusGeometry(r, .035, 4, 3)), acier, 0, y, 0, g).rotation.x = Math.PI / 2;
      K.boite(1.7, .22, .5, acier, 0, 18.3, 0, g);
      for (const dx of [-.5, .5]) K.boite(.62, .48, .34, '#33383a', dx, 18.7, 0, g).rotation.x = .38;
      return g;
    },
    drapeauBenin(x, z, h = 9, rot = 0) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; cible.add(g);
      K.cyl(.07, .1, h, 8, '#e8e4d6', 0, h / 2, 0, g);
      const t = K.maillage(K.geo('pl2.2,1.4', () => new THREE.PlaneGeometry(2.2, 1.4)), K.tex('drapeau', 1, 1, '#ffffff', { face2: true }), 0, h - 1.1, 1.15, g);
      t.rotation.y = -Math.PI / 2; t.castShadow = false;
      return g;
    },
  };
  return K;
})();
export function varie(x, z) { return Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1; }

// Fusionne les maillages d'un ensemble par matière : quelques appels de dessin au lieu de milliers.
export function bake(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const parMat = new Map(), aRetirer = [];
  group.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.garder) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const m = o.material; if (!parMat.has(m)) parMat.set(m, { liste: [], ombre: false });
    const e = parMat.get(m); e.liste.push(g); e.ombre ||= o.castShadow;
    aRetirer.push(o);
  });
  for (const o of aRetirer) o.parent.remove(o);
  // Les groupes vides restent : sans maillage, ils ne coûtent rien.
  for (const [m, e] of parMat) {
    const g = mergeGeometries(e.liste, false); if (!g) continue;
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = e.ombre && !LITE; mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

// Polygone plat texturé au sol (UV planaires, une tuile tous les `tuile` mètres).
export function solPoly(rings, mat, y = 0.05, tuile = 4, parent) {
  const v2 = rings.map(r => r.map(([x, z]) => new THREE.Vector2(x, z)));
  let faces = []; try { faces = THREE.ShapeUtils.triangulateShape(v2[0], v2.slice(1)); } catch (e) { }
  const all = v2.flat(), pos = [], uv = [], idx = [];
  for (const p of all) { pos.push(p.x, y, p.y); uv.push(p.x / tuile, p.y / tuile); }
  for (const [a, b, c] of faces) { const A = all[a], B = all[b], C = all[c]; const up = (B.y - A.y) * (C.x - A.x) - (B.x - A.x) * (C.y - A.y) > 0; idx.push(a, up ? b : c, up ? c : b); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; (parent ?? K.racine).add(m); return m;
}
// Murs d'un polygone, du niveau y0 à y1, texture déroulée le long du périmètre.
export function mursPoly(ring, y0, y1, mat, tuileU = 4, tuileV = null, parent, toit = null) {
  let A = 0; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; A += a[0] * b[1] - b[0] * a[1]; }
  const r = A < 0 ? ring.slice().reverse() : ring; // sens positif : normale extérieure (dz, -dx)
  const pos = [], uv = [], nrm = [], h = y1 - y0, tv = tuileV ?? h; let u = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (!L) continue;
    const nx = dz / L, nz = -dx / L, u0 = u / tuileU, u1 = (u + L) / tuileU, v1 = h / tv;
    const P = [[a[0], y0, a[1], u0, 0], [b[0], y0, b[1], u1, 0], [b[0], y1, b[1], u1, v1], [a[0], y1, a[1], u0, v1]];
    for (const k of [0, 2, 1, 0, 3, 2]) { pos.push(P[k][0], P[k][1], P[k][2]); uv.push(P[k][3], P[k][4]); nrm.push(nx, 0, nz); }
    u += L;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; (parent ?? K.racine).add(m);
  if (toit) solPoly([ring], toit, y1, 4, parent);
  return m;
}
// Ruban texturé le long d'une polyligne, entre deux décalages latéraux (en mètres, côté +normale).
export function ruban(pts, d0, d1, mat, y = 0.06, tuile = 4, parent) {
  const pos = [], uv = [], idx = []; let u = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const nx = -dz, nz = dx, p = pts[i];
    if (i) u += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    pos.push(p[0] + nx * d0, y, p[1] + nz * d0, p[0] + nx * d1, y, p[1] + nz * d1); uv.push(u / tuile, 0, u / tuile, Math.abs(d1 - d0) / tuile);
    if (i) { const o = (i - 1) * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  if (g.attributes.normal.array[1] < 0) { const n = g.attributes.normal.array; for (let i = 0; i < n.length; i++) n[i] = -n[i]; const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } }
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; (parent ?? K.racine).add(m); return m;
}
export const centroide = r => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
export function obb(r) {
  let best = null;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang);
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const [x, z] of r) { const u = x * c + z * s, v = -x * s + z * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const A = (u1 - u0) * (v1 - v0);
    if (!best || A < best.A) { const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2; best = { A, L: u1 - u0, W: v1 - v0, ang, cx: uc * c - vc * s, cz: uc * s + vc * c }; }
  }
  return best;
}
// Groupe local : origine au centre du lieu, axe x local selon l'angle donné (radians, sens x→z).
export function groupeLieu(nom, x, z, ang = 0) { const g = new THREE.Group(); g.name = nom; g.position.set(x, 0, z); g.rotation.y = -ang; g.userData.centre = new THREE.Vector3(x, 0, z); lieux.push(g); scene.add(g); return g; }
export const lieux = [];
// Passe un point monde (x, z) dans le repère local d'un groupe créé par groupeLieu.
export const local = (g, x, z) => { const dx = x - g.position.x, dz = z - g.position.z, a = g.rotation.y; return [dx * Math.cos(a) - dz * Math.sin(a), dx * Math.sin(a) + dz * Math.cos(a)]; };

export function banc(x, z, r = 0) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; K.racine.add(g); const bois = K.mat('#866346', { rugosite: .92 }), metal = K.mat('#303836', { rugosite: .62, metal: .25 }); for (const dz of [-.32, 0, .32]) K.boite(2.25, .09, .22, bois, 0, .58, dz, g); for (const dx of [-.86, .86]) { K.boite(.1, .55, .72, metal, dx, .3, 0, g); K.boite(.1, .72, .1, metal, dx, .76, .38, g); } for (const dz of [.43, .68]) K.boite(2.25, .1, .16, bois, 0, .82, dz, g); return g; }
export function guerite(x, z, r = 0) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; K.racine.add(g); const blanc = K.mat('#f0eee8', { rugosite: .9 }); K.boite(2.8, 2.7, 2.8, blanc, 0, 1.35, 0, g); K.boite(2.84, 1, 2.84, K.mat('#3f5156', { rugosite: .25, metal: .3 }), 0, 1.75, 0, g); K.boite(4.4, .35, 4.4, blanc, 0, 2.9, 0, g); return g; }
export function chapiteau(x, z, largeur, longueur, r = 0) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; K.racine.add(g); const toile = K.mat('#f7f6f1', { rugosite: .8, face2: true }); const t = K.cone(Math.SQRT1_2, 1, 4, toile, 0, 4.1, 0, g); t.rotation.y = Math.PI / 4; t.scale.set(largeur, 2.2, longueur); for (const dx of [-1, 1]) for (const dz of [-1, 0, 1]) K.cyl(.06, .06, 3, 6, '#c9c9c4', dx * largeur / 2, 1.5, dz * longueur / 2, g); return g; }
// Écran publicitaire sur mât (esplanade de l'Amazone, Palais des Congrès), repris de 3D monde.
export function ecranPub(x, z, rot, titre, detail, fond) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; K.racine.add(g);
  K.cyl(.12, .16, 5.2, 8, '#2f3738', 0, 2.6, 0, g);
  K.boite(3.4, 2, .3, '#1d2224', 0, 5.6, 0, g);
  const t = texteToile([titre, detail], 1024, 600, fond, '#ffffff', '800 110px "Bricolage Grotesque", system-ui, sans-serif');
  for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.8), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); p.position.set(0, 5.6, s * .16); if (s < 0) p.rotation.y = Math.PI; p.userData.garder = true; g.add(p); }
  return g;
}
// Barrières mobiles métalliques en file (entrées, parkings).
export function barrieres(x, z, rot, n) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; K.racine.add(g);
  const acier = K.mat('#b9bec0', { metal: .5, rugosite: .4 });
  for (let i = 0; i < n; i++) {
    const dx = (i - (n - 1) / 2) * 2.1;
    K.boite(2, .06, .06, acier, dx, 1.1, 0, g); K.boite(2, .06, .06, acier, dx, .3, 0, g);
    for (let b = -.9; b <= .9; b += .3) K.boite(.03, .8, .03, acier, dx + b, .7, 0, g);
    for (const s of [-1, 1]) K.boite(.08, .06, .7, acier, dx + s * .95, .03, 0, g);
  }
  return g;
}
export function texteToile(lignes, w, h, fond, encre, police) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
  c.fillStyle = fond; c.fillRect(0, 0, w, h); c.fillStyle = encre; c.textAlign = 'center'; c.textBaseline = 'middle';
  lignes.forEach((l, i) => { c.font = police; c.fillText(l, w / 2, h * (i + 1) / (lignes.length + 1), w * .94); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function panneauTexte(lignes, w, h, x, y, z, rot, opts = {}) {
  const t = texteToile(lignes, opts.px ?? 1024, opts.py ?? Math.round(1024 * h / w), opts.fond ?? '#f3e9d2', opts.encre ?? '#1d1a16', opts.police ?? `800 ${Math.round((opts.py ?? 1024 * h / w) * .5)}px "Bricolage Grotesque", system-ui, sans-serif`);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: .7, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.y = rot; m.userData.garder = true; K.racine.add(m); return m;
}

// ---------- Place de l'Étoile Rouge ----------
// Relevé du jeu (Monuments.ts, d'après Download-7.mp4) : deux étoiles rouges imbriquées
// en murets bas sur un dallage, socle pentagonal, flèche blanche effilée, statue de
// bronze à la houe et à la gerbe ; massifs d'arbres dans les creux de l'étoile.
export function etoileRouge(L) {
  const c = centroide(L.ring), rMin = Math.min(...L.ring.map(p => Math.hypot(p[0] - c[0], p[1] - c[1])));
  const rIle = rMin - 9.5;
  const pointes = L.star.filter((_, i) => i % 2 === 0).map(p => Math.atan2(p[1] - c[1], p[0] - c[0]));
  const sc = centroide(L.star); const rExt = Math.max(...L.star.map(p => Math.hypot(p[0] - sc[0], p[1] - sc[1]))) * 1.02, rInt = rExt * .38;
  const tete = Math.atan2(L.star[0][1] - sc[1], L.star[0][0] - sc[0]);
  const g = groupeLieu('etoile-rouge', sc[0], sc[1]);
  K.into(g, () => {
    // Île : gazon, bordure claire, puis le dallage de l'étoile.
    K.cyl(rIle, rIle, .3, 72, K.tex('gazon', 22, 22), 0, .15, 0).castShadow = false;
    K.cyl(rIle + .4, rIle + .4, .45, 72, '#e2ddce', 0, .2, 0, undefined, true);
    // Anneau de chaussée à trois files, bordures et tiretés.
    K.anneau(rIle + .4, rIle + 17.5, K.tex('bitume', 24, 24), 0, .03, 0);
    K.anneau(rIle + 17.5, rIle + 21, K.tex('paves', 30, 30, '#cdc4b3'), 0, .05, 0);
    for (const r of [rIle + 6.2, rIle + 11.8]) for (let i = 0; i < 64; i++) { const a = i * Math.PI / 32; const t = K.boite(.25, .03, 2.6, '#e8e3d2', Math.cos(a) * r, .06, Math.sin(a) * r); t.rotation.y = -a; t.castShadow = false; }
    K.cyl(rExt + 6, rExt + 6, .32, 60, K.tex('beton', 12, 12, '#cfc8b8'), 0, .17, 0).castShadow = false;
    const rot = Math.PI / 2 - tete; // la première pointe OSM donne l'orientation
    const rouge = K.mat('#b8392d', { rugosite: .75 }), dallage = K.tex('beton', 10, 10, '#c3bdb0');
    const sol = .32;
    K.etoile(rExt, rInt, .25, dallage, 0, sol, 0, rot);
    contourEtoile(rExt, rInt, .78, 1.1, rouge, 0, sol, 0, rot);
    K.etoile(rExt * .62, rInt * .62, .25, dallage, 0, sol + .25, 0, rot);
    contourEtoile(rExt * .62, rInt * .62, .8, .8, rouge, 0, sol + .25, 0, rot);
    contourEtoile(rExt * 1.01, rInt * 1.015, .985, .08, K.mat('#8f2d24'), 0, sol + 1.1, 0, rot);
    // Socle pentagonal et flèche blanche à quatre ailerons.
    K.cyl(4.4, 5, 1.6, 5, '#e6e1d4', 0, sol + .8, 0).rotation.y = Math.PI / 10;
    K.cyl(3.6, 4.4, .7, 5, '#d8d2c2', 0, sol + 1.95, 0).rotation.y = Math.PI / 10;
    const blanc = K.mat('#eeebe2', { rugosite: .55 }), pied = sol + 2.3, H = 36;
    if (tripoDispo('etoile')) poserTripo('etoile', g, { hauteur: H + 9, y: pied });
    else {
    K.cyl(1.3, 2.4, H, 4, blanc, 0, pied + H / 2, 0).rotation.y = Math.PI / 4;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; K.boite(3.2, 9, .45, blanc, Math.cos(a) * 2.6, pied + 4.5, Math.sin(a) * 2.6).rotation.y = -a; K.boite(1.6, 3.6, .45, blanc, Math.cos(a) * 2.1, pied + 10.4, Math.sin(a) * 2.1).rotation.y = -a; }
    K.cyl(1.8, 1.45, 2.1, 10, blanc, 0, pied + H + 1, 0);
    K.maillage(new THREE.TorusGeometry(1.85, .16, 5, 20), '#d6d1c4', 0, pied + H + 2, 0).rotation.x = Math.PI / 2;
    statueEtoile(0, pied + H + 2.1, 0);
    }
    // Massifs de grands arbres dans les creux, mâts d'éclairage et bancs aux pointes.
    for (let i = 0; i < 5; i++) {
      const a = tete + Math.PI / 5 + i * Math.PI * 2 / 5;
      for (let k = 0; k < 7; k++) { const r = rExt * .55 + K.alea() * (rIle - rExt * .55 - 6), da = (K.alea() - .5) * .5; K.arbre(Math.cos(a + da) * r, Math.sin(a + da) * r, .9 + K.alea() * .5); }
      const b = tete + i * Math.PI * 2 / 5;
      K.matEclairage(Math.cos(a) * (rIle - 4), Math.sin(a) * (rIle - 4), 1.3);
      banc(Math.cos(b) * (rExt + 2.5), Math.sin(b) * (rExt + 2.5), -b + Math.PI / 2);
    }
  });
  bake(g);
}
export function contourEtoile(rExt, rInt, rapport, hauteur, mat, x, y, z, rot = 0) {
  const trace = (f, k) => { for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2 + rot, r = (i % 2 ? rInt : rExt) * k; i ? f.lineTo(Math.cos(a) * r, Math.sin(a) * r) : f.moveTo(Math.cos(a) * r, Math.sin(a) * r); } f.closePath(); };
  const f = new THREE.Shape(); trace(f, 1); const trou = new THREE.Path(); trace(trou, rapport); f.holes.push(trou);
  const g = new THREE.ExtrudeGeometry(f, { depth: hauteur, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
  return K.maillage(g, mat, x, y, z);
}
// Homme de bronze au sommet : houe brandie, gerbe contre le flanc, flamme rouge.
export function statueEtoile(x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = .5; g.scale.setScalar(2.4); K.racine.add(g);
  const bronze = K.mat('#5a6356', { rugosite: .62, metal: .25 }), flamme = K.mat('#d8342a', { rugosite: .4 });
  K.cone(.07, .2, 7, flamme, -.06, 2.2, .42, g); K.cyl(.03, .03, .2, 6, bronze, -.06, 2.02, .42, g);
  K.cyl(.1, .09, .95, 8, bronze, .16, .48, -.1, g); K.cyl(.1, .09, .95, 8, bronze, -.13, .48, .12, g);
  K.cyl(.19, .22, .78, 10, bronze, 0, 1.32, 0, g); K.boite(.46, .1, .3, bronze, 0, 1.06, 0, g);
  K.cyl(.08, .09, .12, 8, bronze, 0, 1.77, 0, g); K.sphere(.13, bronze, 0, 1.9, 0, g);
  K.cyl(.055, .06, .62, 7, bronze, .12, 1.94, -.22, g).rotation.z = -.35; K.cyl(.05, .055, .5, 7, bronze, .26, 2.44, -.24, g).rotation.z = -.15;
  K.cyl(.032, .032, .72, 7, bronze, .35, 2.92, -.24, g).rotation.z = .3; K.boite(.26, .17, .05, bronze, .24, 3.24, -.24, g).rotation.z = .3;
  K.cyl(.055, .06, .5, 7, bronze, .02, 1.52, .3, g).rotation.x = -.35; K.cyl(.05, .055, .34, 7, bronze, .06, 1.34, .4, g).rotation.x = .9;
  for (let i = 0; i < 7; i++) { const a = i * 6.28 / 7; K.cyl(.03, .045, 1.95, 6, bronze, -.06 + Math.cos(a) * .08, .98, .42 + Math.sin(a) * .08, g); }
}

// ---------- Esplanade et monument de l'Amazone ----------
export async function amazone(L) {
  const o = obb(L.place);
  const g = groupeLieu('amazone', L.pt[0], L.pt[1]);
  K.into(g, () => {
    // Esplanade dallée de gris, en grands triangles séparés de bandes beige clair (photos sur place et drone).
    solPoly([L.place.map(([x, z]) => local(g, x, z))], K.tex('triangles', 1, 256 / 443), .06, 21);
    // Parvis dallé sombre autour du socle.
    K.cyl(15, 15, .1, 48, K.tex('paves', 6, 6, '#9b9890'), 0, .08, 0).castShadow = false;
    // Socle de pierre noire en gradins, plaque dorée.
    K.boite(20, .3, 17, '#4b4c4b', 0, .15, 0); K.boite(18.2, .45, 15.4, '#282b2c', 0, .5, 0);
    K.boite(16, 1.6, 13.2, '#303334', 0, 1.5, 0); K.boite(12.6, .4, 9.8, '#4b4e4e', 0, 2.5, 0);
    K.boite(5.6, .9, .1, '#b98a3d', 0, 1.6, 6.65);
    // Massifs fleuris rouges autour du pied.
    for (const [x, z, w, d] of [[-10.5, 0, 2.4, 11], [10.5, 0, 2.4, 11], [0, -9, 14, 2.4]]) { K.haie(x, z, w, d, .6); for (let i = 0; i < 8; i++) K.sphere(.22, i % 2 ? '#b9343d' : '#d4554e', x + (w > d ? (i - 3.5) * w / 8 : 0), .7, z + (w > d ? 0 : (i - 3.5) * d / 8)).scale.set(1.3, .55, 1.3); }
    // Bornes et éclairage encastré en couronne, lampadaires le long des allées.
    for (let i = 0; i < 24; i++) { const a = i * Math.PI * 2 / 24; K.cyl(.14, .17, .75, 8, '#4b504d', Math.cos(a) * 21, .38, Math.sin(a) * 21); }
    const [hx, hz] = [o.W / 2 - 4, o.L / 2 - 6];
    for (let z = -hz; z <= hz; z += 16) { K.lampadaireSimple(-hx, z, 1); K.lampadaireSimple(hx, z, -1); }
    for (const z of [-hz + 6, hz - 6]) { guerite(-12, z); guerite(12, z); }
    chapiteau(-hx + 8, -hz + 20, 7, 9); chapiteau(-hx + 8, -hz + 31, 7, 9);
    for (const [x, z, r] of [[-hx + 3, -10, Math.PI / 2], [hx - 3, -10, -Math.PI / 2], [-hx + 3, 14, Math.PI / 2], [hx - 3, 14, -Math.PI / 2]]) banc(x, z, r);
    for (let z = -hz + 4; z <= hz - 4; z += 10) { K.haie(-hx - 1.5, z, 1.2, 6, .5); K.haie(hx + 1.5, z, 1.2, 6, .5); }
    // Repris de 3D monde : barrières mobiles devant les guérites, écrans sur mât le long
    // de l'allée, spots encastrés en couronne autour du socle.
    for (const z of [-hz + 6, hz - 6]) for (const x of [-12, 12]) barrieres(x + Math.sign(x) * 4.5, z, Math.PI / 2, 3);
    ecranPub(hx - 2, -hz * .55, -Math.PI / 2, 'BÉNIN RÉVÉLÉ', 'Esplanade des Amazones', '#2a6f8f');
    ecranPub(hx - 2, 0, -Math.PI / 2, 'AMAZONES', 'Fierté et mémoire du Danxomè', '#8a2f3a');
    ecranPub(hx - 2, hz * .55, -Math.PI / 2, 'COTONOU', 'Ville ouverte sur l’Atlantique', '#3f7b58');
    for (let i = 0; i < 18; i++) { const a = i * Math.PI * 2 / 18, l = K.cyl(.11, .11, .03, 10, K.mat('#fff0b0', { rugosite: .25, emissif: '#5a4a20' }), Math.cos(a) * 16.5, .12, Math.sin(a) * 16.5); l.castShadow = false; }
  });
  bake(g);
  // Statue : modèle amazone.glb du projet « 3D monde », patine bronze sombre des photos de terrain.
  try {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(import.meta.env.BASE_URL + 'modeles/amazone.glb');
    const obj = gltf.scene;
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
    const k = 27 / size.y; obj.scale.setScalar(k);
    const box2 = new THREE.Box3().setFromObject(obj), ctr = box2.getCenter(new THREE.Vector3());
    const piv = new THREE.Group(); piv.add(obj); obj.position.set(-ctr.x, 2.7 - box2.min.y, -ctr.z);
    piv.rotation.y = STATUE_ROT; g.add(piv);
    obj.traverse(n => {
      if (!n.isMesh) return; n.castShadow = !LITE; n.receiveShadow = true;
      const m = n.material.clone(); m.color.set('#ffffff'); m.metalness = .35; m.roughness = .5;
      m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = vec3(dot(diffuseColor.rgb, vec3(.299, .587, .114)) * 1.05) * vec3(0.254, 0.188, 0.136);'); };
      n.material = m;
    });
  } catch (e) { console.warn('Amazone : modèle non chargé', e); }
}
export const STATUE_ROT = Math.PI;

// ---------- Palais de la Marina ----------
// Long bâtiment beige porté par des piliers carrés, bandeaux vitrés bleutés à petits
// carrés opaques, cages d'escalier sur le toit ; drapeaux, palmiers royaux, clôture.
export function palaisMarina(ring) {
  const c = centroide(ring);
  const g = groupeLieu('marina', c[0], c[1]);
  const loc = ring.map(([x, z]) => [x - c[0], z - c[1]]);
  K.into(g, () => {
    const beige = K.mat('#cdbb9a');
    mursPoly(loc, 0, 4, K.tex('vitrageSombre', 1, 1, '#ffffff', { rugosite: .3, metal: .3 }), 5, 4);
    mursPoly(loc, 4, 12.4, K.photo('textures/marina-facade.jpg'), 22.3, 8.4, undefined, K.tex('beton', 1, 1, '#d8ccb3')); // photo de la façade (Adoscam, CC BY-SA 4.0)
    // Piliers du rez-de-chaussée, posés un peu en avant des façades.
    let A = 0; for (let i = 0; i < loc.length; i++) { const a = loc[i], b = loc[(i + 1) % loc.length]; A += a[0] * b[1] - b[0] * a[1]; }
    const s = A > 0 ? 1 : -1;
    for (let i = 0; i < loc.length; i++) {
      const a = loc[i], b = loc[(i + 1) % loc.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 6) continue;
      const nx = s * dz / L, nz = -s * dx / L;
      for (let d = 2.6; d < L - 1; d += 5.2) K.boite(1.3, 4, 1.3, beige, a[0] + dx * d / L + nx * .9, 2, a[1] + dz * d / L + nz * .9);
    }
    // Corniche et cages d'escalier sur le toit.
    for (const dx of [-14, 14]) { K.boite(4.5, 3.6, 4.5, beige, dx, 14.2, 0); K.boite(4.8, .3, 4.8, '#b8a583', dx, 16.1, 0); }
    // Côté jardin (au nord, vers l'avenue) : allée rosée, palmiers royaux, lanternes et drapeaux.
    const zn = Math.min(...loc.map(p => p[1]));
    K.sol(9, 70, K.tex('paves', 3, 18, '#b98a72'), 0, zn - 35, .07);
    for (let z = zn - 8; z > zn - 70; z -= 13) { K.palmierRoyal(-8, z); K.palmierRoyal(8, z); K.lanterneGlobe(-5.5, z - 6); K.lanterneGlobe(5.5, z - 6); }
    for (let x = -36; x <= 36; x += 9) if (Math.abs(x) > 6) K.drapeauBenin(x, zn - 12, 11, Math.PI / 2);
    for (const x of [-30, -18, 18, 30]) K.haie(x, zn - 20, 8, 1.2, .6);
  });
  bake(g);
}

// ---------- Palais des Congrès ----------
// Tambours blancs évasés à frise de triangles (tata somba), oculus doré, aile basse à claustras.
export function palaisCongres(L) {
  const all = L.outer.flat(); const xs = all.map(p => p[0]), zs = all.map(p => p[1]);
  const c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  const g = groupeLieu('congres', c[0], c[1]);
  K.into(g, () => {
    const blanc = K.mat('#f1efe8', { rugosite: .9 });
    // Modèle Tripo (d'après photo) s'il existe, sinon tambours et hall dessinés à la main.
    if (tripoDispo('congres')) poserTripo('congres', g, { largeur: 165, z: -8 });
    else {
    for (const r of L.outer) mursPoly(r.map(([x, z]) => [x - c[0], z - c[1]]), 0, 7, K.tex('claustra', 1, 1, '#f0ebdf'), 3, 3.5, undefined, K.mat('#f5f3ee'));
    for (const r of L.inner) solPoly([r.map(([x, z]) => [x - c[0], z - c[1]])], K.tex('gazon', 1, 1), 7.05, 4);
    // Tambours ajustés sur les arcs du contour OSM : deux salles latérales,
    // la grande salle au sud et une rotonde d'accueil plus basse au nord.
    tambour(-64, -39, 13, 25);
    tambour(65, -37, 13, 25);
    tambour(0, 27, 21.5, 33, { haut: .66 });
    hallCongres(-5, -43, 19, 11);
    }
    // Entrée au nord, vers le boulevard : marches, chapiteau, mâts et parking.
    const zn = Math.min(...all.map(p => p[1] - c[1]));
    for (let m = 0; m < 4; m++) K.boite(30 - m * 3, .3 * (m + 1), 2.2, '#e3ddd0', 0, .15 * (m + 1), zn - 1 - m * 2.2);
    chapiteau(0, zn - 16, 9, 14, Math.PI / 2);
    for (let x = -60; x <= 60; x += 8) { K.cyl(.07, .1, 10, 8, '#f1efea', x, 5, zn - 26); }
    K.sol(150, 30, K.tex('beton', 30, 6, '#cfcdc6'), 0, zn - 44, .07);
    const couleurs = ['#e8e8e4', '#9da3a6', '#1f2326', '#e2e2dc', '#7b2a2a', '#c9c9c4'];
    for (let x = -70; x <= 70; x += 4.6) for (const dz of [-6, 6]) if (K.alea() < .7) voiture(x, zn - 44 + dz, couleurs[Math.floor(K.alea() * 6)], dz > 0 ? 0 : Math.PI);
    for (let x = -64; x <= 64; x += 16) K.arbre(x, zn - 31, .55);
    // D'après les photos du parking (dossier espace) : grille grise, zémidjans garés, barrières
    // mobiles aux entrées, écran sur mât, bornes lumineuses, cocotiers.
    const zp = zn - 44, acier = K.mat('#68706e', { metal: .3, rugosite: .5 });
    K.boite(150, .16, .16, acier, 0, 1.4, zp - 12); for (let x = -75; x <= 75; x += 1.5) K.boite(.075, 1.55, .075, acier, x, .78, zp - 12);
    for (const [x, r] of [[-72, 0], [72, Math.PI]]) barrieres(x, zp - 13.5, r, 3);
    for (let i = 0; i < 9; i++) { const z = K.boite(.6, 1, 1.8, ['#1f2326', '#c8382f', '#2f6fb0'][i % 3], -30 + i * 1.2, .55, zp + 13); z.rotation.y = .15; }
    ecranPub(-78, zp, Math.PI / 2, 'PALAIS DES CONGRÈS', 'Conférences · Spectacles', '#5a4a8a');
    for (let x = -70; x <= 70; x += 10) { K.cyl(.14, .17, .68, 8, '#555d59', x, .34, zn - 20); K.sphere(.13, K.mat('#fff0b5', { emissif: '#5a4a20' }), x, .75, zn - 20).castShadow = false; }
    for (const x of [-48, -24, 24, 48]) K.cocotier(x, zp + 16, false);
  });
  bake(g);
}
// Tambour (d'après le drone, 2026) : tronc de cône blanc qui se resserre, coupé en biais vers l'entrée,
// gros bourrelet autour de l'oculus, verrière intérieure, une seule frise de triangles (tata somba)
// au tiers de la hauteur, socle vitré bleu entre des piliers blancs.
export function tambour(x, z, rBas, h, { haut = .72, pente = .22 } = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); K.racine.add(g);
  const blanc = K.mat('#f3f1ec', { rugosite: .88, face2: true }), verre = K.mat('#3f6a8c', { rugosite: .18, metal: .35 }), sombre = K.mat('#2c3a42', { rugosite: .2, metal: .4 });
  const socle = 3.4, H = h - socle, rHaut = rBas * haut, seg = 64;
  K.cyl(rBas * .95, rBas * .95, socle, 48, verre, 0, socle / 2, 0, g);
  for (let i = 0; i < 28; i++) { const a = i * Math.PI * 2 / 28; K.boite(.4, socle, .4, blanc, Math.cos(a) * rBas * .97, socle / 2, Math.sin(a) * rBas * .97, g); }
  // Coupe plane en biais : plus basse côté nord (−z, vers l'entrée et le boulevard).
  const sommet = a => H * (1 - pente * (1 - Math.sin(a)) / 2);
  const paroi = (t0, t1, dr, segH) => {
    const geo = new THREE.CylinderGeometry(1, 1, 1, seg, segH, true), p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const a = Math.atan2(p.getZ(k), p.getX(k)), t = t0 + (p.getY(k) + .5) * (t1 - t0), r = rBas + (rHaut - rBas) * t + dr;
      p.setXYZ(k, Math.cos(a) * r, socle + t * sommet(a), Math.sin(a) * r);
    }
    geo.computeVertexNormals(); return geo;
  };
  K.maillage(paroi(0, 1, 0, 8), blanc, 0, 0, 0, g);
  K.maillage(paroi(.24, .33, .08, 1), K.tex('friseTata', 16, 1, '#ffffff', { face2: true }), 0, 0, 0, g);
  // Bourrelet de l'oculus.
  const bord = []; for (let i = 0; i < seg; i++) { const a = i * Math.PI * 2 / seg; bord.push(new THREE.Vector3(Math.cos(a) * (rHaut + .3), socle + sommet(a) + .2, Math.sin(a) * (rHaut + .3))); }
  K.maillage(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bord, true), seg, 1.1, 10, true), blanc, 0, 0, 0, g);
  // Verrière qu'on voit par l'oculus : lanterne vitrée à meneaux blancs, toit plat.
  const bas = socle + H * (1 - pente) - 7, rl = rHaut * .8;
  K.cyl(rl, rl, 5.5, 32, sombre, 0, bas + 2.75, 0, g);
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; K.boite(.25, 5.5, .25, blanc, Math.cos(a) * rl, bas + 2.75, Math.sin(a) * rl, g); }
  K.cyl(rl + .4, rl + .4, .5, 32, blanc, 0, bas + 5.7, 0, g);
  K.cyl(rHaut * .98, rHaut * .98, .3, 48, '#e9e6df', 0, bas, 0, g);
}
// Hall d'accueil : colonnade blanche en arc, bandeau de claustras, dalle de toit débordante.
function hallCongres(x, z, r, h) {
  const g = new THREE.Group(); g.position.set(x, 0, z); K.racine.add(g);
  const blanc = K.mat('#f3f1ec', { rugosite: .88 });
  for (let i = 0; i <= 18; i++) { const a = Math.PI + i * Math.PI / 18; K.boite(.9, h - 1.2, .9, blanc, Math.cos(a) * r, (h - 1.2) / 2, Math.sin(a) * r, g); }
  const claustra = new THREE.CylinderGeometry(r - .3, r - .3, 3.2, 48, 1, true, -Math.PI / 2, Math.PI);
  K.maillage(claustra, K.tex('claustra', 12, 1, '#ffffff', { face2: true }), 0, h - 2.8, 0, g);
  const dalle = new THREE.CylinderGeometry(r + 2.2, r + 2.2, .6, 48, 1, false, -Math.PI / 2, Math.PI);
  K.maillage(dalle, blanc, 0, h - .9, 0, g);
  K.cyl(r - 1, r - 1, h - 1.2, 40, K.mat('#7d97a3', { rugosite: .2, metal: .3 }), 0, (h - 1.2) / 2, 0, g);
  // Parvis circulaire à rosace, devant l'entrée.
  K.cyl(r * 1.3, r * 1.3, .1, 48, '#d9d3c6', 0, .05, -r * 1.25, g);
  K.cyl(r * .45, r * .45, .12, 40, '#b5643c', 0, .07, -r * 1.25, g); K.cyl(r * .3, r * .3, .14, 40, '#e8e2d4', 0, .08, -r * 1.25, g);
}
export function voiture(x, z, couleur, r = 0) { const g = new THREE.Group(); g.position.set(x, .05, z); g.rotation.y = r; K.racine.add(g); K.boite(1.8, .75, 4.3, couleur, 0, .7, 0, g); K.boite(1.6, .6, 2.2, '#3c4a4f', 0, 1.35, -.2, g); for (const dx of [-.9, .9]) for (const dz of [-1.4, 1.4]) K.cyl(.33, .33, .2, 10, '#222', dx, .33, dz, g).rotation.z = Math.PI / 2; return g; }

// ---------- Cathédrale Notre-Dame de Miséricorde ----------
// Rayures rouges et blanches, nef à toit de tôle, pignon à rosace, clocher carré isolé.
export function cathedrale(ring) {
  // Emprise en L : nef est-ouest (A,B,H,I) et aile nord-sud à l'est (C…G).
  const [A, B, C, Dp, E, F, Gp, H, I] = ring;
  const c = centroide(ring);
  const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
  const g = groupeLieu('cathedrale', c[0], c[1], ang);
  const loc = p => local(g, p[0], p[1]);
  K.into(g, () => {
    const nefA = loc(A), nefB = loc(B), nefI = loc(I), nefH = loc(H);
    const nx0 = Math.min(nefA[0], nefI[0]), nx1 = Math.max(nefB[0], nefH[0]), nz0 = Math.min(nefA[1], nefB[1]), nz1 = Math.max(nefI[1], nefH[1]);
    if (tripoDispo('cathedrale')) {
      const xs = [nx0, nx1 + 6, ...[C, E, F, Gp].map(p => loc(p)[0])], zs = [nz0, nz1, ...[C, E, F, Gp].map(p => loc(p)[1])];
      const x0 = Math.min(...xs) - 7.5, x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      poserTripo('cathedrale', g, { largeur: Math.max(x1 - x0, z1 - z0), x: (x0 + x1) / 2, z: (z0 + z1) / 2 });
    } else {
    nefEglise(nx0, nx1 + 6, nz0, nz1, 10.9, 6.1, true, false, 'textures/cathedrale-facade.jpg');
    const pE = loc(E), pF = loc(F), pG = loc(Gp), pC = loc(C);
    const ax0 = Math.min(pC[0], pG[0]), ax1 = Math.max(pE[0], pF[0]), az0 = Math.min(pC[1], pE[1]), az1 = Math.max(pF[1], pG[1]);
    nefEglise(ax0, ax1, az0, az1, 9, 5.5, false, true);
    // Clocher carré, rayé, flèche et croix, à l'angle nord-ouest de l'aile.
    const tx = ax0 - 4.5, tz = az0 + 2.5, Ht = 34;
    K.boite(6, Ht, 6, K.tex('rayuresPleines', 1, 7), tx, Ht / 2, tz);
    for (const [dx, dz, ry] of [[0, 3.02, 0], [0, -3.02, 0], [3.02, 0, Math.PI / 2], [-3.02, 0, Math.PI / 2]]) for (let y = 8; y < Ht - 4; y += 7) K.boite(1, 2.6, .12, '#2b2a2c', tx + dx, y, tz + dz).rotation.y = ry;
    K.cone(4.6, 6, 4, '#c8bfb2', tx, Ht + 3, tz).rotation.y = Math.PI / 4;
    K.boite(.35, 3, .35, '#efe9de', tx, Ht + 7.5, tz); K.boite(1.6, .35, .35, '#efe9de', tx, Ht + 8.2, tz);
    }
    // Parvis et murets bleus devant la façade.
    K.sol(16, nz1 - nz0 + 10, K.tex('beton', 4, 6, '#cfc9bd'), nx0 - 9, (nz0 + nz1) / 2, .06);
    for (const z of [nz0 - 6, nz1 + 6]) K.boite(40, .9, .4, '#5f9bc2', nx0 + 12, .45, z);
  });
  bake(g);
}
export function nefEglise(x0, x1, z0, z1, hMur, hToit, facade = false, axeZ = false, photo = null) {
  const L = axeZ ? z1 - z0 : x1 - x0, W = axeZ ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const g = new THREE.Group(); g.position.set(cx, 0, cz); if (axeZ) g.rotation.y = Math.PI / 2; K.racine.add(g);
  K.boite(L, hMur, W, K.tex('rayures', Math.max(1, Math.round(L / 4.5)), 2), 0, hMur / 2, 0, g);
  // Pignons triangulaires rayés.
  const tri = new THREE.Shape(); tri.moveTo(-W / 2, 0); tri.lineTo(W / 2, 0); tri.lineTo(0, hToit); tri.closePath();
  const gp = new THREE.ExtrudeGeometry(tri, { depth: .4, bevelEnabled: false });
  const uv = gp.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4.5);
  for (const sx of [-1, 1]) { const m = K.maillage(gp, K.tex('rayuresPleines', 1, 1), sx * L / 2 + (sx > 0 ? -.2 : .2), hMur, 0, g); m.rotation.y = sx * Math.PI / 2; }
  // Versants de tôle rouillée.
  const pente = Math.atan2(hToit, W / 2), rampant = Math.hypot(hToit, W / 2) + .8;
  for (const s of [-1, 1]) { const v = K.boite(L + 1.2, .25, rampant, K.tex('tole', 6, 2, '#9b6a52'), 0, hMur + hToit / 2, s * W / 4, g); v.rotation.x = s * pente; }
  K.boite(L + 1.2, .4, .5, '#7c4f3c', 0, hMur + hToit + .1, 0, g);
  if (facade && photo) {
    // La vraie façade (photo libre redressée, scripts : redresser.mjs), découpée au gabarit du pignon ; la croix reste en volume.
    const sh = new THREE.Shape(); sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(W / 2, hMur); sh.lineTo(0, hMur + hToit); sh.lineTo(-W / 2, hMur); sh.closePath();
    const geo = new THREE.ShapeGeometry(sh), uv = geo.attributes.uv, p = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + W / 2) / W, p.getY(i) / (hMur + hToit));
    const tex = new THREE.TextureLoader().load(import.meta.env.BASE_URL + photo); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: .9 })); m.position.set(-L / 2 - .25, 0, 0); m.rotation.y = -Math.PI / 2; m.userData.garder = true; m.receiveShadow = true; m.castShadow = false; g.add(m);
    K.boite(.3, 2.6, .3, '#efe9de', -L / 2, hMur + hToit + 1.3, 0, g); K.boite(.3, .3, 1.4, '#efe9de', -L / 2, hMur + hToit + 1.8, 0, g);
  } else if (facade) {
    // Rosace et croix sur le pignon ouest, portail en plein cintre.
    K.cyl(1.7, 1.7, .3, 24, '#7a2a22', -L / 2 - .25, hMur + hToit * .42, 0, g).rotation.z = Math.PI / 2;
    K.cyl(1.2, 1.2, .35, 24, '#2b3a4a', -L / 2 - .3, hMur + hToit * .42, 0, g).rotation.z = Math.PI / 2;
    K.boite(.3, 2.6, .3, '#efe9de', -L / 2, hMur + hToit + 1.3, 0, g); K.boite(.3, .3, 1.4, '#efe9de', -L / 2, hMur + hToit + 1.8, 0, g);
    K.boite(.6, 5, 4, '#2b2a2c', -L / 2 - .1, 2.5, 0, g); K.boite(.7, 5.6, 5, '#9d2a22', -L / 2 - .05, 2.8, 0, g);
  }
  return g;
}

// ---------- Stade de l'Amitié Général Mathieu Kérékou ----------
export function stade(L) {
  const o = obb(L.pitch); const axe = o.L >= o.W ? o.ang : o.ang + Math.PI / 2;
  const g = groupeLieu('stade', o.cx, o.cz, axe);
  K.into(g, () => {
    // Pelouse tracée et piste rouge à huit couloirs.
    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(105, 68).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: toileTerrain(), roughness: .95 }));
    terrain.position.y = .12; terrain.receiveShadow = true; K.racine.add(terrain);
    const piste = formeStade(42.2, 37, 46.8); const pg = new THREE.ShapeGeometry(piste, 24); pg.rotateX(-Math.PI / 2);
    const pm = K.maillage(pg, K.mat('#b4553e', { rugosite: .9 }), 0, .1, 0); pm.castShadow = false;
    // Gradins : anneau incliné du bord de piste jusqu'à 18 m de haut.
    gradinsAnneau(48.5, 80, 42.2, 2, 19);
    // Tribune principale couverte, à l'ouest : façade beige à lames, auvent à bord vert.
    K.boite(120, 22, 5, K.photo('textures/stade-lames.jpg', { rx: 2 }), 0, 11, -84); // photo de la tribune (Adoscam, CC BY-SA 4.0)
    const auvent = K.boite(124, .9, 32, '#e7e2d6', 0, 25.5, -66); auvent.rotation.x = -.06;
    K.boite(124, 1.6, .6, '#2f7a52', 0, 25, -50);
    for (let x = -56; x <= 56; x += 14) K.boite(1.2, 25, 1.2, '#d9d2c2', x, 12.5, -82);
    // Pylônes d'éclairage en treillis aux quatre coins.
    for (const [x, z] of [[-108, -80], [108, -80], [-108, 80], [108, 80]]) { const t = K.matEclairage(x, z, 2.6); t.rotation.y = Math.atan2(-z, x); }
    // Parvis et parkings.
    K.sol(240, 30, K.tex('beton', 40, 6, '#cbc6ba'), 0, -104, .05);
  });
  bake(g);
}
export function formeStade(demiDroite, rInt, rExt) {
  const f = new THREE.Shape();
  f.moveTo(-demiDroite, -rExt); f.lineTo(demiDroite, -rExt); f.absarc(demiDroite, 0, rExt, -Math.PI / 2, Math.PI / 2, false); f.lineTo(-demiDroite, rExt); f.absarc(-demiDroite, 0, rExt, Math.PI / 2, Math.PI * 1.5, false);
  const h = new THREE.Path(); h.moveTo(-demiDroite, -rInt); h.absarc(-demiDroite, 0, rInt, Math.PI * 1.5, Math.PI / 2, true); h.lineTo(demiDroite, rInt); h.absarc(demiDroite, 0, rInt, Math.PI / 2, -Math.PI / 2, true); h.lineTo(-demiDroite, -rInt);
  f.holes.push(h); return f;
}
export function gradinsAnneau(rInt, rExt, demi, y0, y1) {
  const R = (rInt + rExt) / 2, arc = Math.PI * R, N = 180, pts = t => { // contour de stade, abscisse curviligne t ∈ [0,1)
    const per = 4 * demi + 2 * arc, s = t * per;
    if (s < 2 * demi) return [-demi + s, -1, 0];
    if (s < 2 * demi + arc) { const a = -Math.PI / 2 + (s - 2 * demi) / R; return [demi, 0, a]; }
    if (s < 4 * demi + arc) return [demi - (s - 2 * demi - arc), 1, 0];
    const a = Math.PI / 2 + (s - 4 * demi - arc) / R; return [-demi, 0, a];
  };
  const pos = [], uv = [], idx = [], face = [], fuv = [], fidx = [];
  for (let i = 0; i <= N; i++) {
    const [cx, side, a] = pts((i % N) / N);
    const dir = side ? [0, side] : [Math.cos(a), Math.sin(a)];
    const p0 = [cx + dir[0] * rInt, dir[1] * rInt], p1 = [cx + dir[0] * rExt, dir[1] * rExt];
    pos.push(p0[0], y0, p0[1], p1[0], y1, p1[1]); uv.push(i / 2, 0, i / 2, 1);
    face.push(p1[0], 0, p1[1], p1[0], y1, p1[1]); fuv.push(i / 2, 0, i / 2, 1);
    if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); fidx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  }
  const mk = (p, u, ix, mat) => { const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); gg.setIndex(ix); gg.computeVertexNormals(); const m = new THREE.Mesh(gg, mat); m.castShadow = true; m.receiveShadow = true; K.racine.add(m); return m; };
  const gr = mk(pos, uv, idx, K.tex('gradins', 1, 1, '#ffffff', { face2: true }));
  if (gr.geometry.attributes.normal.array[1] < 0) { gr.material = K.tex('gradins', 1, 1, '#ffffff', { face2: true }); }
  mk(face, fuv, fidx, K.tex('facadeStade', 1, 1, '#ffffff', { face2: true }));
}
export function toileTerrain() {
  const cv = document.createElement('canvas'); cv.width = 1050; cv.height = 680; const c = cv.getContext('2d');
  for (let i = 0; i < 14; i++) { c.fillStyle = i % 2 ? '#4f8f3c' : '#5a9b45'; c.fillRect(i * 75, 0, 75, 680); }
  c.strokeStyle = '#f4f4ee'; c.lineWidth = 5;
  c.strokeRect(10, 10, 1030, 660); c.beginPath(); c.moveTo(525, 10); c.lineTo(525, 670); c.stroke();
  c.beginPath(); c.arc(525, 340, 91, 0, Math.PI * 2); c.stroke();
  for (const x of [10, 875]) { c.strokeRect(x, 138, 165, 403); c.strokeRect(x === 10 ? 10 : 985, 248, 55, 183); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// ---------- Port autonome : portiques, grues mobiles, navires à quai ----------
export function port(L) {
  const g = groupeLieu('port', 800, 2600);
  K.into(g, () => {
    // Portiques à conteneurs le long du quai du môle, flèche au-dessus du bassin (au nord).
    const q = L.mole;
    for (const f of [.14, .3, .46, .62, .8]) {
      const [x, z, a] = surPolyligne(q, f);
      const p = portique(); p.position.set(x - 800, 0, z - 2600 + 14); p.rotation.y = -a - Math.PI / 2; p.scale.setScalar(2.1);
    }
    // Grues mobiles du quai nord (nœuds OSM).
    for (const [x, z] of L.cranes) grueMobile(x - 800, z - 2600 - 8);
    // Navires à quai.
    const [mx, mz, ma] = surPolyligne(q, .5);
    navire(mx - 800, mz - 2600 - 26, ma, '#23384f', true);
    const [nx, nz, na] = surPolyligne(L.nord, .62);
    navire(nx - 800, nz - 2600 + 24, na, '#8c2f2a', false);
  });
  bake(g);
}
export function surPolyligne(pts, f) {
  let tot = 0; const seg = []; for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); tot += l; }
  let d = f * tot; for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const t = Math.min(1, d / seg[i]); const a = pts[i], b = pts[i + 1]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])]; } d -= seg[i]; }
}
// Portique à conteneurs (Monuments.ts) : rouge, flèche vers le large, cabine claire.
export function portique() {
  const g = new THREE.Group(); K.racine.add(g); const acier = K.mat('#c2553f');
  for (const dx of [-5, 5]) for (const dz of [-5, 5]) { K.boite(.85, 20, .85, acier, dx, 10, dz, g); K.boite(.5, 9, .5, acier, dx * .82, 15.5, dz, g).rotation.z = dx > 0 ? .1 : -.1; }
  for (const dx of [-5, 5]) K.boite(1, .7, 11, acier, dx, 1.2, 0, g);
  K.boite(11.6, 1.7, 2.6, acier, 0, 20.8, 0, g); K.boite(38, 1.5, 2.6, acier, -11, 22.4, 0, g); K.boite(9, 1.2, 2.2, acier, 12, 22.4, 0, g);
  K.boite(4.2, 3.2, 3.6, '#e0dbcb', 3, 19, 0, g); K.boite(2, 1.6, 2.4, '#33383a', -6, 21.4, 0, g);
  K.cable([-6, 21, 0], [-6, 12, 0], .12, '#4a4a44', g);
  return g;
}
export function grueMobile(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = .6; K.racine.add(g); const jaune = K.mat('#e2b13c'), blanc = K.mat('#ece8de');
  K.boite(14, 3, 12, blanc, 0, 1.5, 0, g); K.boite(6, 5, 6, blanc, 0, 5.5, 0, g); K.boite(2.4, 24, 2.4, jaune, 0, 20, 0, g);
  const fl = K.boite(46, 1.6, 1.8, jaune, 18, 34, 0, g); fl.rotation.z = .5; K.cable([0, 31, 0], [36, 46, 0], .15, '#333', g); K.cable([38, 45, 0], [38, 18, 0], .1, '#333', g);
}
export function navire(x, z, a, coque, conteneurs) {
  const g = new THREE.Group(); g.position.set(x, -1.5, z); g.rotation.y = -a; K.racine.add(g);
  const forme = new THREE.Shape(); forme.moveTo(-80, -14); forme.lineTo(58, -14); forme.quadraticCurveTo(80, -11, 92, 0); forme.quadraticCurveTo(80, 11, 58, 14); forme.lineTo(-80, 14); forme.closePath();
  const h = new THREE.ExtrudeGeometry(forme, { depth: 13, bevelEnabled: false }); h.rotateX(-Math.PI / 2);
  K.maillage(h, K.mat(coque), 0, 0, 0, g); K.boite(170, .6, 27, '#7a2f2a', 5, 13.2, 0, g);
  K.boite(18, 22, 25, '#efece4', -66, 24, 0, g); K.boite(4, 10, 4, '#3a3a3a', -70, 40, 0, g);
  const cc = ['#b5422d', '#2f5f8a', '#3c7a4f', '#d58a2a', '#8a9095', '#e0d8c8'];
  if (conteneurs) for (let r = 0; r < 10; r++) for (let k = 0; k < 4; k++) K.boite(12.5, 2.6 * (2 + ((r + k) % 3)), 5.6, cc[(r * 3 + k) % 6], -48 + r * 13.5, 13.5 + 1.3 * (2 + ((r + k) % 3)), -9 + k * 6, g);
  else for (let r = 0; r < 5; r++) { K.boite(18, 2, 20, '#5a4a40', -40 + r * 22, 14.5, 0, g); K.boite(3, 18, 3, '#e2b13c', -30 + r * 22, 22, 9, g); }
}

// ---------- Aéroport Cardinal Bernardin Gantin ----------
export function aeroport(L) {
  const main = L.terminals[0], c = centroide(main), rw = L.runway, ra = rw[0], rb = rw[rw.length - 1];
  const rang = Math.atan2(rb[1] - ra[1], rb[0] - ra[0]);
  const g = groupeLieu('aeroport', c[0], c[1]);
  K.into(g, () => {
    // Côté ville : du côté opposé à la piste.
    const t = ((c[0] - ra[0]) * (rb[0] - ra[0]) + (c[1] - ra[1]) * (rb[1] - ra[1])) / ((rb[0] - ra[0]) ** 2 + (rb[1] - ra[1]) ** 2);
    const px = ra[0] + (rb[0] - ra[0]) * t, pz = ra[1] + (rb[1] - ra[1]) * t; const vx = c[0] - px, vz = c[1] - pz, vl = Math.hypot(vx, vz) || 1;
    const lx = vx / vl, lz = vz / vl; // direction côté ville
    const o = obb(main); const prof = Math.min(o.L, o.W) / 2 + 6;
    // Enseigne jaune et tentes blanches devant l'entrée.
    const rot = Math.atan2(lx, lz);
    panneauTexte(['AÉROPORT INTERNATIONAL CARDINAL BERNARDIN GANTIN'], 40, 2.4, lx * prof, 10.5, lz * prof, rot, { fond: '#f2c21b', encre: '#1d1a16', px: 2048, py: 123, police: '800 78px system-ui, sans-serif' });
    // Grand portail blanc en ogive au centre du terminal, côté ville (vidéo de drone 2025).
    { const blanc = K.mat('#f3f2ee', { rugosite: .8 }), H = 22;
      for (const s of [-1, 1]) { const b = K.boite(2.2, H, 1.4, blanc, lx * (prof + 1) + lz * s * 4.6, H / 2 - .4, lz * (prof + 1) - lx * s * 4.6); b.rotation.y = rot; b.rotateZ(-s * .34); }
      const v = K.boite(7.5, 15, .3, K.mat('#3f5a66', { rugosite: .2, metal: .3 }), lx * prof, 7.5, lz * prof); v.rotation.y = rot;
      const c = K.boite(44, .5, 7, blanc, lx * (prof + 3), 8.2, lz * (prof + 3)); c.rotation.y = rot; }
    // L'ancienne aérogare, deux niveaux saumon à bandeaux blancs, à gauche de l'esplanade.
    { const o = K.boite(26, 8.4, 14, K.mat('#d9a28c', { rugosite: .85 }), lx * (prof + 30) - lz * 42, 4.2, lz * (prof + 30) + lx * 42); o.rotation.y = rot;
      for (const y of [3.9, 8.6]) { const b = K.boite(26.4, .5, 14.4, '#f1efe8', lx * (prof + 30) - lz * 42, y, lz * (prof + 30) + lx * 42); b.rotation.y = rot; } }
    for (const s of [-1, 0, 1]) { const ox = lx * (prof + 12) + lz * s * 14, oz = lz * (prof + 12) - lx * s * 14; const tente = K.cone(6, 8, 8, K.mat('#f4f2ec', { face2: true }), ox, 6.5, oz); tente.castShadow = true; for (let k = 0; k < 4; k++) K.cyl(.1, .1, 3, 6, '#ccc', ox + Math.cos(k * 1.57) * 4.5, 1.5, oz + Math.sin(k * 1.57) * 4.5); }
    for (let k = -5; k <= 5; k++) { const ox = lx * (prof + 24) + lz * k * 2.4, oz = lz * (prof + 24) - lx * k * 2.4; K.boite(1.8, .8, .5, k % 2 ? '#c8382f' : '#f2f2ee', ox, .4, oz).rotation.y = rot; }
  });
  bake(g);
  // Marquages de piste : axe, seuils, numéros 06 / 24.
  const gp = groupeLieu('piste', (ra[0] + rb[0]) / 2, (ra[1] + rb[1]) / 2, rang);
  const len = Math.hypot(rb[0] - ra[0], rb[1] - ra[1]);
  K.into(gp, () => {
    const blanc = K.mat('#f2f1ea', { rugosite: .9 });
    for (let x = -len / 2 + 120; x < len / 2 - 120; x += 60) K.boite(30, .04, .9, blanc, x, .1, 0).castShadow = false;
    for (const s of [-1, 1]) {
      for (let k = -7; k <= 7; k++) if (k) K.boite(30, .04, 1.8, blanc, s * (len / 2 - 25), .1, k * 2.8).castShadow = false;
      const num = panneauTexte([s < 0 ? '06' : '24'], 18, 9, s * (len / 2 - 70), .12, 0, 0, { fond: 'rgba(0,0,0,0)', encre: '#f2f1ea', px: 512, py: 256, police: '700 220px system-ui, sans-serif' });
      num.rotation.set(-Math.PI / 2, 0, s < 0 ? Math.PI / 2 : -Math.PI / 2); num.material.transparent = true;
    }
  });
  // Avions aux postes de stationnement (lignes OSM) : moyens-courriers et un cargo blanc.
  const ga = groupeLieu('avions', c[0], c[1]);
  const livrees = [['#ffffff', '#1f5fa8'], ['#ffffff', '#c8382f'], ['#f4f4f0', '#2f8a4a'], ['#ffffff', '#f2b705']];
  K.into(ga, () => {
    L.stands.filter(s => s.pts.length >= 2).slice(0, 6).forEach((s, i) => {
      if (i % 2) return;
      const a = s.pts[0], b = s.pts[s.pts.length - 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      avion(b[0] - c[0], b[1] - c[1], ang + Math.PI, livrees[(i / 2) % livrees.length]);
    });
  });
  bake(ga);
}
export function avion(x, z, a, [coque, deriveC]) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -a; K.racine.add(g);
  const blanc = K.mat(coque, { rugosite: .5 }), gris = K.mat('#b9bdc2'), derive = K.mat(deriveC);
  const f = K.cyl(2, 2, 26, 16, blanc, 0, 3.6, 0, g); f.rotation.z = Math.PI / 2;
  const nez = K.sphere(2, blanc, 13, 3.6, 0, g); nez.scale.set(2.2, 1, 1);
  const q = K.cone(2, 9, 16, blanc, -17.5, 4, 0, g); q.rotation.z = Math.PI / 2;
  K.boite(1.6, .4, 3.4, '#20262b', 15.4, 4.4, 0, g);
  for (const s of [-1, 1]) { const ai = K.boite(9, .5, 16, gris, -1, 3, s * 8.5, g); ai.rotation.y = s * .35; K.cyl(1.1, 1.1, 4, 12, '#d9dcdf', 1.5, 2, s * 6.2, g).rotation.z = Math.PI / 2; const st = K.boite(3.6, .3, 6, gris, -19, 4.6, s * 3.2, g); st.rotation.y = s * .3; }
  const d = K.boite(5, 7, .4, derive, -19.5, 8, 0, g); d.rotation.z = .35;
  for (const dz of [-3, 0, 3]) K.cyl(.35, .35, .5, 8, '#222', dz ? -1 : 10, .35, dz, g).rotation.x = Math.PI / 2;
}

// ---------- Marché Dantokpa : enseigne, parasols, sacs, foule ----------
export function dantokpa(B, M) {
  // Enseigne « MARCHÉ DANTOKPA » sur le grand bâtiment du bord de lagune.
  let best = -1, bestA = 0, off = 0; const offs = [];
  for (let i = 0; i < B.n.length; i++) { offs.push(off); off += B.n[i] * 2; }
  for (let i = 0; i < B.n.length; i++) if (B.c[i] === 10) { let A = 0; const n = B.n[i], o = offs[i]; for (let j = 0; j < n; j++) { const k = (j + 1) % n; A += B.p[o + 2 * j] * B.p[o + 2 * k + 1] - B.p[o + 2 * k] * B.p[o + 2 * j + 1]; } A = Math.abs(A) / 200; if (A > bestA && B.x[i] / 10 > 1800) { bestA = A; best = i; } }
  if (best >= 0 && !tripoDispo('dantokpa')) { // sinon, le modèle Tripo du bâtiment (lieux-videos.js) porte déjà l'enseigne
    const n = B.n[best], o = offs[best], ring = []; for (let j = 0; j < n; j++) ring.push([(B.x[best] + B.p[o + 2 * j]) / 10, (B.z[best] + B.p[o + 2 * j + 1]) / 10]);
    const ob = obb(ring), h = B.h[best] / 4;
    const g = groupeLieu('dantokpa-enseigne', ob.cx, ob.cz, ob.L >= ob.W ? ob.ang : ob.ang + Math.PI / 2);
    K.into(g, () => {
      for (const r of [0, Math.PI]) { const t = panneauTexte(['MARCHÉ DANTOKPA'], 36, 4.2, 0, h + 4.2, r ? -.05 : .05, r, { fond: '#efe2c4', encre: '#2a2015', px: 1536, py: 180, police: '800 130px system-ui, sans-serif' }); t.material.side = THREE.FrontSide; }
      for (const x of [-15, 0, 15]) K.boite(.3, 3, .3, '#555', x, h + 1.5, -.3);
      K.boite(.4, .3, 36, '#555', 0, h + 1.9, 0).rotation.y = Math.PI / 2;
      // La vraie façade (photo jbdodane, CC BY 2.0, vue depuis la lagune) sur les deux longs côtés ; le motif se répète si le bâtiment est plus long que la photo.
      const Lb = Math.max(ob.L, ob.W), Wb = Math.min(ob.L, ob.W);
      const tex = new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'textures/dantokpa-facade.jpg'); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = Math.max(1, (Lb / h) / 3.6);
      for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(Lb - .3, h), new THREE.MeshStandardMaterial({ map: tex, roughness: .9 })); p.position.set(0, h / 2, s * (Wb / 2 + .08)); if (s < 0) p.rotation.y = Math.PI; p.userData.garder = true; p.receiveShadow = true; K.racine.add(p); }
    });
    bake(g);
  }
  // Parasols de tissu, hangars de tôle et bâches bleues (vus du drone : une mer de tôles), sacs d'oignons et de riz.
  const n = M.par.length / 2, estHangar = i => hash(i, 80) < .45, nh = Array.from({ length: n }, (_, i) => estHangar(i)).filter(Boolean).length;
  const parasolG = new THREE.ConeGeometry(1.6, .7, 10, 1, true).translate(0, 2.35, 0);
  const pied = new THREE.CylinderGeometry(.03, .03, 2.2, 4).translate(0, 1.1, 0);
  const par = new THREE.InstancedMesh(mergeGeometries([parasolG.toNonIndexed(), pied.toNonIndexed()]), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), n - nh);
  const hangarG = mergeGeometries([new THREE.BoxGeometry(3.8, .07, 3.2).rotateX(.12).translate(0, 2.75, 0).toNonIndexed(), ...[[-1.7, -1.4], [1.7, -1.4], [-1.7, 1.4], [1.7, 1.4]].map(([x, z]) => new THREE.BoxGeometry(.08, 2.7 - z * .1, .08).translate(x, (2.7 - z * .1) / 2, z).toNonIndexed())]);
  const toleTex = new THREE.CanvasTexture(K.toile('tole')); toleTex.colorSpace = THREE.SRGBColorSpace; toleTex.wrapS = toleTex.wrapT = THREE.RepeatWrapping; toleTex.repeat.set(2, 1);
  const hangars = new THREE.InstancedMesh(hangarG, new THREE.MeshLambertMaterial({ map: toleTex, side: THREE.DoubleSide }), nh);
  const toleC = ['#a0603f', '#8c5236', '#c9c6c0', '#b9bcbd', '#d6d3cc', '#3f74b8', '#2f62a8', '#c9a27a'].map(h => new THREE.Color(h));
  const sacs = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, .7, 1).translate(0, .35, 0), new THREE.MeshLambertMaterial(), n);
  const cols = ['#e6dcc4', '#d9e6d2', '#f2f0ea', '#2f6f8f', '#c0392b', '#e9b949', '#5a8f3a', '#e8d9b0'].map(h => new THREE.Color(h));
  const sacC = ['#b8323a', '#c9473c', '#f0ebe0', '#d9c79e', '#7a8f3a'].map(h => new THREE.Color(h));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let ip = 0, ih = 0;
  for (let i = 0; i < n; i++) {
    const x = M.par[2 * i] / 10, z = M.par[2 * i + 1] / 10;
    if (estHangar(i)) {
      m4.compose(p.set(x, 0, z), q.setFromEuler(e.set(0, Math.round(hash(i, 71) * 4) * Math.PI / 2 + (hash(i, 72) - .5) * .2, 0)), s.set(.8 + hash(i, 73) * .6, .9 + hash(i, 81) * .25, .8 + hash(i, 82) * .5));
      hangars.setMatrixAt(ih, m4); hangars.setColorAt(ih++, toleC[Math.floor(hash(i, 74) * toleC.length)]);
    } else {
      m4.compose(p.set(x, 0, z), q.setFromEuler(e.set((hash(i, 70) - .5) * .12, hash(i, 71) * 6.28, (hash(i, 72) - .5) * .12)), s.setScalar(.85 + hash(i, 73) * .4));
      par.setMatrixAt(ip, m4); par.setColorAt(ip++, cols[Math.floor(hash(i, 74) * cols.length)]);
    }
    m4.compose(p.set(x + (hash(i, 75) - .5) * 2.4, 0, z + (hash(i, 76) - .5) * 2.4), q.setFromEuler(e.set(0, hash(i, 77) * 3, 0)), s.set(1, .6 + hash(i, 78), 1));
    sacs.setMatrixAt(i, m4); sacs.setColorAt(i, sacC[Math.floor(hash(i, 79) * sacC.length)]);
  }
  for (const m of [par, hangars, sacs]) { m.castShadow = !LITE; m.receiveShadow = true; m.userData.proche = 2600; detailsProches.push(m); scene.add(m); }
  foule(M.ppl, 0);
}

// ---------- Foule : silhouettes en pagne et tissus wax ----------
export const detailsProches = [];
// Arbres et palmiers instanciés, avec leurs positions : le jeu écarte ceux qui gênent la caméra.
export const VEGETATION = [];
export const fouleCorps = new THREE.CylinderGeometry(.2, .27, 1.2, 6).translate(0, .62, 0);
export const fouleTete = new THREE.SphereGeometry(.15, 6, 5).translate(0, 1.38, 0);
export const fouleTissus = ['#e2672a', '#2f6fb0', '#e9b62c', '#2f8a4a', '#8e3c8f', '#c8382f', '#1f8f8a', '#f2efe6', '#3b3b44', '#d9548a'].map(h => new THREE.Color(h));
export function foule(arr, graine, y = 0) {
  const n = arr.length / 2; if (!n) return;
  const corps = new THREE.InstancedMesh(fouleCorps, new THREE.MeshLambertMaterial(), n);
  const tetes = new THREE.InstancedMesh(fouleTete, new THREE.MeshLambertMaterial({ color: '#4a2f22' }), n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const k = .9 + hash(i, graine + 80) * .22;
    m4.makeScale(k, k, k).setPosition(arr[2 * i] / 10, y, arr[2 * i + 1] / 10);
    corps.setMatrixAt(i, m4); tetes.setMatrixAt(i, m4); corps.setColorAt(i, fouleTissus[Math.floor(hash(i, graine + 81) * fouleTissus.length)]);
  }
  for (const m of [corps, tetes]) { m.userData.proche = 1800; detailsProches.push(m); scene.add(m); }
}

// ---------- Ganvié : maisons sur pilotis ----------
export function ganvie(G) {
  const n = G.length / 6;
  const murs = { pos: [], uv: [], col: [] }, toles = { pos: [], uv: [], col: [] }, pailles = { pos: [], uv: [], col: [] }, planchers = { pos: [], uv: [], col: [] };
  const peints = ['#d8cfc0', '#d8cfc0', '#d8cfc0', '#d8cfc0', '#8fb3cf', '#e5c564', '#9ccf9a', '#b9a0d6', '#f1ede4', '#7fb0c9'].map(u8c);
  // Toits vus du drone : surtout de la tôle, rouillée, grise, bleue ou blanche.
  const toleC = ['#9a5a3a', '#a9653f', '#7e4a33', '#8f979b', '#9fa6a8', '#b7bcbd', '#d9dcdc', '#4f7fae', '#5f86a8', '#b94a3c', '#c08a4a'].map(u8c);
  const quad = (o, a, b, c, d, col, uL, vL) => { for (const [P, U] of [[a, [0, 0]], [b, [uL, 0]], [c, [uL, vL]], [a, [0, 0]], [c, [uL, vL]], [d, [0, vL]]]) { o.pos.push(...P); o.uv.push(...U); o.col.push(...col); } };
  const tri = (o, a, b, c, col, s) => { for (const [P, U] of [[a, [0, 0]], [b, [s, 0]], [c, [s / 2, s * .6]]]) { o.pos.push(...P); o.uv.push(...U); o.col.push(...col); } };
  const pil = [];
  for (let i = 0; i < n; i++) {
    const cx = G[6 * i] / 10, cz = G[6 * i + 1] / 10, L = Math.min(G[6 * i + 2] / 10, 22), W = Math.min(G[6 * i + 3] / 10, 14), a = G[6 * i + 4] / 1000, sd = G[6 * i + 5];
    const ca = Math.cos(a), sa = Math.sin(a), P = (u, y, v) => [cx + u * ca - v * sa, y, cz + u * sa + v * ca];
    const r = hash(sd, 1), y0 = 1.7, etage = r > .9 ? 2 : 1, y1 = y0 + 2.5 * etage, hl = L / 2, hw = W / 2;
    const col = peints[Math.floor(hash(sd, 2) * peints.length)];
    // Plancher débordant (passerelle) et murs de planches.
    quad(planchers, P(-hl - .8, y0, -hw - .8), P(hl + .8, y0, -hw - .8), P(hl + .8, y0, hw + .8), P(-hl - .8, y0, hw + .8), [200, 190, 175], L / 3, W / 3);
    const cs = [P(-hl, 0, -hw), P(hl, 0, -hw), P(hl, 0, hw), P(-hl, 0, hw)];
    for (let k = 0; k < 4; k++) { const A = cs[k], Bq = cs[(k + 1) % 4], len = Math.hypot(Bq[0] - A[0], Bq[2] - A[2]); quad(murs, [A[0], y0, A[2]], [Bq[0], y0, Bq[2]], [Bq[0], y1, Bq[2]], [A[0], y1, A[2]], col, len / 3, (y1 - y0) / 3); }
    // Toit à quatre pans : tôle colorée (souvent) ou paille (plus pentu, plus débordant).
    const paille = r < .08, ov = paille ? 1.1 : .5, hr = paille ? Math.min(3.4, W * .55) : Math.min(1.8, W * .3);
    const tgt = paille ? pailles : toles, tc = paille ? [235, 225, 205] : toleC[Math.floor(hash(sd, 3) * toleC.length)];
    const e0 = P(-hl - ov, y1, -hw - ov), e1 = P(hl + ov, y1, -hw - ov), e2 = P(hl + ov, y1, hw + ov), e3 = P(-hl - ov, y1, hw + ov);
    const inset = Math.min(hw, hl * .9), r0 = P(-hl + inset, y1 + hr, 0), r1 = P(hl - inset, y1 + hr, 0);
    quad(tgt, e0, e1, r1, r0, tc, L / 3, 1.2); quad(tgt, e2, e3, r0, r1, tc, L / 3, 1.2);
    tri(tgt, e1, e2, r1, tc, 1.4); tri(tgt, e3, e0, r0, tc, 1.4);
    for (const [u, v] of [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw], [0, -hw], [0, hw]]) pil.push(P(u, 0, v));
  }
  const mk = (o, mat) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2)); g.setAttribute('color', new THREE.Uint8BufferAttribute(o.col, 3, true)); g.computeVertexNormals();
    // Normales tournées vers l'extérieur et vers le haut : les deux faces sont dessinées.
    const m = new THREE.Mesh(g, mat); m.castShadow = !LITE; m.receiveShadow = true; m.renderOrder = 10; scene.add(m); return m;
  };
  mk(murs, K.tex('planches', 1, 1, '#ffffff', { vc: true, face2: true }));
  mk(toles, K.tex('tole', 1, 1, '#ffffff', { vc: true, face2: true, metal: .2 }));
  mk(pailles, K.tex('paille', 1, 1, '#ffffff', { vc: true, face2: true }));
  mk(planchers, K.tex('planches', 1, 1, '#a99a86', { vc: true, face2: true }));
  // Herbiers flottants entre les maisons (vus du drone : des îlots verts partout dans le village).
  const herb = [];
  for (let i = 0; i < n; i++) {
    const sd = G[6 * i + 5]; if (hash(sd, 4) > .24) continue;
    const a = hash(sd, 5) * 6.28, r = 3 + hash(sd, 6) * 7, d = Math.min(G[6 * i + 3] / 10, 14) / 2 + r * .8;
    herb.push([G[6 * i] / 10 + Math.cos(a) * d, G[6 * i + 1] / 10 + Math.sin(a) * d, r, hash(sd, 7)]);
  }
  if (herb.length) {
    const forme = new THREE.CircleGeometry(1, 14); const fp = forme.attributes.position;
    for (let k = 1; k < fp.count; k++) { const f = .72 + hash(k, 9) * .5; fp.setXY(k, fp.getX(k) * f, fp.getY(k) * f); }
    forme.rotateX(-Math.PI / 2);
    const verts = ['#5f8a3e', '#6f9a48', '#4f7a35', '#7aa556', '#587f3a'].map(h => new THREE.Color(h));
    const ilots = new THREE.InstancedMesh(forme, new THREE.MeshLambertMaterial({ color: '#ffffff' }), herb.length);
    const m5 = new THREE.Matrix4(), q5 = new THREE.Quaternion(), s5 = new THREE.Vector3(), p5 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    herb.forEach(([x, z, r, h], k) => { m5.compose(p5.set(x, .06, z), q5.setFromAxisAngle(Y, h * 6.28), s5.set(r * (.8 + h * .6), 1, r * (1.3 - h * .5))); ilots.setMatrixAt(k, m5); ilots.setColorAt(k, verts[Math.floor(h * verts.length)]); });
    ilots.receiveShadow = true; ilots.renderOrder = 6; ilots.userData.proche = 4000; detailsProches.push(ilots); scene.add(ilots);
  }
  const pilotis = new THREE.InstancedMesh(new THREE.CylinderGeometry(.09, .11, 2.2, 5).translate(0, .6, 0), new THREE.MeshLambertMaterial({ color: '#5b4a3a' }), pil.length);
  const m4 = new THREE.Matrix4(); pil.forEach((p, i) => { m4.makeTranslation(p[0], 0, p[2]); pilotis.setMatrixAt(i, m4); });
  pilotis.userData.proche = 2500; detailsProches.push(pilotis); scene.add(pilotis);
}
// Façade rouge à pignons pointus, étoile et cercles blancs, galerie blanche (vue dans tes vidéos de Ganvié).
export function facadeRouge(x, z) {
  const g = groupeLieu('facade-rouge', x, z, .3);
  K.into(g, () => {
    const rouge = K.mat('#c8352c'), blanc = K.mat('#f4f1ea');
    K.boite(26, .4, 14, '#8a7560', 0, 1.6, 0);
    for (let i = -6; i <= 6; i++) for (const zz of [-7, 7]) K.cyl(.12, .14, 2.2, 6, '#5b4a3a', i * 2, .6, zz);
    K.boite(24, 6, 10, rouge, 0, 4.8, 0);
    for (let i = 0; i < 5; i++) {
      const x0 = -9.6 + i * 4.8, tri = new THREE.Shape(); tri.moveTo(-2.4, 0); tri.lineTo(2.4, 0); tri.lineTo(0, 5.2 + (i === 2 ? 1.5 : 0)); tri.closePath();
      K.maillage(new THREE.ExtrudeGeometry(tri, { depth: .5, bevelEnabled: false }), rouge, x0, 7.8, 4.6);
      K.cyl(.12, .2, 2.4, 6, rouge, x0, 13.6 + (i === 2 ? 1.5 : 0), 4.85);
      if (i === 2) K.etoile(1.3, .52, .12, blanc, x0, 9.6, 5.25).rotation.x = Math.PI / 2;
      else K.cyl(.8, .8, .12, 20, blanc, x0, 9.6, 5.2).rotation.x = Math.PI / 2;
    }
    K.boite(24.6, .3, 2.6, blanc, 0, 4.2, 6.2);
    for (let i = -6; i <= 6; i++) K.boite(.3, 2.6, .3, blanc, i * 2, 2.9, 7.3);
    for (let i = -24; i <= 24; i++) K.boite(.08, .9, .08, blanc, i * .5, 2.25, 7.3);
    K.boite(24.6, .12, .12, blanc, 0, 2.7, 7.3);
    K.boite(25, .5, 11, K.tex('tole', 6, 3, '#9fa6a8'), 0, 7.9, 0);
  });
  bake(g);
}

// ---------- Pirogues, acadjas, jacinthes ----------
export function pirogueGeo(L, w, h) {
  const s = new THREE.Shape(); s.moveTo(-L / 2, 0); s.quadraticCurveTo(-L / 4, w / 2, 0, w / 2); s.quadraticCurveTo(L / 4, w / 2, L / 2, 0); s.quadraticCurveTo(L / 4, -w / 2, 0, -w / 2); s.quadraticCurveTo(-L / 4, -w / 2, -L / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 }); g.rotateX(-Math.PI / 2); g.translate(0, -.15, 0); return g;
}
export function pirogues(arr) {
  const n = arr.length / 4;
  const lac = [], mer = [], marche = [];
  for (let i = 0; i < n; i++) (arr[4 * i + 3] === 1 ? mer : arr[4 * i + 3] === 2 ? marche : lac).push(i);
  const mk = (ids, geo, couleurs, pers, paniers) => {
    const coque = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), ids.length);
    const gens = pers ? new THREE.InstancedMesh(mergeGeometries([fouleCorps.clone().toNonIndexed(), fouleTete.clone().toNonIndexed()]), new THREE.MeshLambertMaterial(), ids.length) : null;
    const pan = paniers ? new THREE.InstancedMesh(new THREE.SphereGeometry(.45, 8, 5), new THREE.MeshLambertMaterial(), ids.length * 4) : null;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
    const base = ids.map(i => ({ x: arr[4 * i] / 10, z: arr[4 * i + 1] / 10, a: arr[4 * i + 2] / 1000, r: 10 + hash(i, 91) * 40, w: .02 + hash(i, 92) * .04, ph: hash(i, 93) * 6.28, debout: hash(i, 94) < .6 }));
    base.forEach((b, k) => {
      coque.setColorAt(k, couleurs[Math.floor(hash(ids[k], 95) * couleurs.length)]);
      if (gens) gens.setColorAt(k, fouleTissus[Math.floor(hash(ids[k], 96) * fouleTissus.length)]);
      if (pan) for (let j = 0; j < 4; j++) pan.setColorAt(k * 4 + j, new THREE.Color(['#d8432f', '#e9b23a', '#5d9b3a', '#d97a2a'][j]));
    });
    const maj = t => {
      base.forEach((b, k) => {
        const d = Math.sin(t * b.w + b.ph) * b.r, x = b.x + Math.cos(b.a) * d, z = b.z - Math.sin(b.a) * d;
        q.setFromAxisAngle(Y, b.a); m4.compose(p.set(x, 0, z), q, s1); coque.setMatrixAt(k, m4);
        if (gens) { const ox = Math.cos(b.a) * -1.8, oz = -Math.sin(b.a) * -1.8; m4.compose(p.set(x + ox, b.debout || paniers ? .05 : -.45, z + oz), q, s1); gens.setMatrixAt(k, m4); }
        if (pan) for (let j = 0; j < 4; j++) { m4.compose(p.set(x + Math.cos(b.a) * (j - 1) * .9, .2, z - Math.sin(b.a) * (j - 1) * .9), q, s1); pan.setMatrixAt(k * 4 + j, m4); }
      });
      coque.instanceMatrix.needsUpdate = true; if (gens) gens.instanceMatrix.needsUpdate = true; if (pan) pan.instanceMatrix.needsUpdate = true;
    };
    maj(0);
    coque.userData.anim = maj;
    for (const m of [coque, gens, pan]) if (m) { m.userData.proche = 6000; detailsProches.push(m); scene.add(m); }
  };
  const bois = ['#5b3f28', '#6b4a30', '#4e3624', '#7a5a3a'].map(h => new THREE.Color(h));
  const peintes = ['#2f6fb0', '#c8382f', '#e9b62c', '#2f8a4a', '#1f8f8a', '#f2efe6'].map(h => new THREE.Color(h));
  mk(lac, pirogueGeo(7.5, 1.1, .7), bois, true, false);
  mk(mer, pirogueGeo(13, 2, 1.2), peintes, true, false);
  mk(marche, pirogueGeo(7, 1.3, .7), bois, true, true);
}
export function piroguesPlage(arr) {
  const n = arr.length / 3; if (!n) return;
  const m = new THREE.InstancedMesh(pirogueGeo(12, 2, 1.2), new THREE.MeshLambertMaterial(), n);
  const peintes = ['#2f6fb0', '#c8382f', '#e9b62c', '#2f8a4a', '#1f8f8a', '#f2efe6'].map(h => new THREE.Color(h));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) { q.setFromAxisAngle(Y, -arr[3 * i + 2] / 1000); m4.compose(new THREE.Vector3(arr[3 * i] / 10, .3, arr[3 * i + 1] / 10), q, new THREE.Vector3(1, 1, 1)); m.setMatrixAt(i, m4); m.setColorAt(i, peintes[Math.floor(hash(i, 97) * peintes.length)]); }
  m.castShadow = !LITE; m.userData.proche = 2500; detailsProches.push(m); scene.add(m);
}
export function acadjas(arr) {
  const pos = [];
  for (let i = 0; i < arr.length / 5; i++) {
    const x = arr[5 * i] / 10, z = arr[5 * i + 1] / 10, L = arr[5 * i + 2] / 10, W = arr[5 * i + 3] / 10, a = arr[5 * i + 4] / 1000, c = Math.cos(a), s = Math.sin(a);
    const pt = (u, v) => pos.push(x + u * c - v * s, z + u * s + v * c);
    for (let u = -L / 2; u <= L / 2; u += .9) { pt(u, -W / 2); pt(u, W / 2); if (Math.round(u / .9) % 2) pt(u, 0); }
    for (let v = -W / 2; v <= W / 2; v += .9) { pt(-L / 2, v); pt(L / 2, v); }
  }
  const n = pos.length / 2;
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(.08, 1, .08).translate(0, .5, 0), new THREE.MeshLambertMaterial({ color: '#6e604f' }), n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) { m4.compose(p.set(pos[2 * i] + (hash(i, 3) - .5) * .5, -.3, pos[2 * i + 1] + (hash(i, 4) - .5) * .5), q.setFromEuler(e.set((hash(i, 5) - .5) * .5, 0, (hash(i, 6) - .5) * .5)), s.set(1, 1.2 + hash(i, 7) * 1.4, 1)); m.setMatrixAt(i, m4); }
  m.userData.proche = 4500; detailsProches.push(m); scene.add(m);
}
export function jacinthes(arr) {
  const n = arr.length / 3;
  const m = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#5f8f3a' }), n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) { const r = arr[3 * i + 2] / 10; q.setFromAxisAngle(Y, hash(i, 8) * 6); m4.compose(new THREE.Vector3(arr[3 * i] / 10, .06, arr[3 * i + 1] / 10), q, new THREE.Vector3(r, 1, r * (.5 + hash(i, 9) * .5))); m.setMatrixAt(i, m4); }
  m.renderOrder = 5; m.userData.proche = 5000; detailsProches.push(m); scene.add(m);
}

// ---------- Plage de Fidjrossè : paillotes et buvettes ----------
export function plage(Bc) {
  const n = Bc.pai.length / 4; if (!n) return;
  const g = groupeLieu('plage', 0, 0);
  K.into(g, () => {
    const paille = K.tex('paille', 2, 1, '#ffffff', { face2: true });
    for (let i = 0; i < n; i++) {
      const x = Bc.pai[4 * i] / 10, z = Bc.pai[4 * i + 1] / 10, a = Bc.pai[4 * i + 3] / 1000;
      if (Bc.pai[4 * i + 2] === 1) { // buvette
        const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = -a; K.racine.add(b);
        K.boite(6, 2.6, 4, K.tex('planches', 2, 1, '#c9b593'), 0, 1.3, 0, b); K.boite(6.2, 1.1, .5, '#7a5a3a', 0, .55, 2.6, b);
        const t = K.cone(5.4, 2.6, 4, paille, 0, 3.9, 0, b); t.rotation.y = Math.PI / 4; t.scale.set(1, 1, .8);
        for (const dx of [-2.5, 0, 2.5]) { K.cyl(.5, .5, .06, 10, '#d9c7a6', dx, .75, 5, b); K.cyl(.05, .05, .75, 5, '#6a5038', dx, .38, 5, b); }
      } else { // paillote parasol
        K.cyl(.08, .1, 2.6, 6, '#7a5a3a', x, 1.3, z); K.cone(2.4, 1.2, 9, paille, x, 3, z);
        K.cyl(.45, .45, .05, 10, '#d9c7a6', x + .9, .72, z); K.cyl(.05, .05, .72, 5, '#6a5038', x + .9, .36, z);
      }
    }
  });
  bake(g);
}

// ---------- Corniche Est d'Akpakpa ----------
// D'après Monuments.ts (IMG_6194, IMG_9331–9346) : trottoir pavé, piste de jogging
// terracotta, bande bleu-gris, rambarde, jardinières, lampadaires à double crosse,
// jeunes cocotiers, bancs tournés vers l'eau et épis de roches noires.
export function corniche(L) {
  const g = groupeLieu('corniche', 0, 0);
  const pts = L.road;
  // Côté mer : la normale (−dz, dx) pointe-t-elle vers le sud (z+) ?
  const s = (pts[pts.length - 1][0] - pts[0][0]) > 0 ? 1 : -1;
  const d = k => s * k;
  K.into(g, () => {
    const lim = (a, b) => [Math.min(d(a), d(b)), Math.max(d(a), d(b))];
    ruban(pts, ...lim(4.2, 10.5), K.tex('pavesGris', 1, 1), .07, 4);
    ruban(pts, ...lim(10.5, 13.5), K.tex('piste', 1, 1), .075, 6);
    ruban(pts, ...lim(13.5, 16.8), K.tex('beton', 1, 1, '#78979a'), .07, 4);
    ruban(pts, ...lim(16.8, 40), K.tex('sable', 1, 1, '#d4b07a'), .045, 6);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, nx = -uz * s, nz = ux * s, rot = Math.atan2(-uz, ux);
      for (let t = (12.5 - acc % 12.5) % 12.5; t < len; t += 12.5) {
        const px = a[0] + ux * t, pz = a[1] + uz * t, k = Math.round((acc + t) / 12.5);
        jeunePalmier(px + nx * 7.5, pz + nz * 7.5, 1.6);
        if (k % 3 === 0) K.lampadaireDouble(px + nx * 4.6, pz + nz * 4.6, rot);
        if (k % 2 === 0) { K.boite(1.55, .5, 1.55, '#b8b1a2', px + nx * 15, .27, pz + nz * 15); K.sphere(.72, k % 4 ? '#477447' : '#557f4c', px + nx * 15, 1.1, pz + nz * 15).scale.set(1, .75, 1); }
        if (k % 4 === 1) banc(px + nx * 14.6, pz + nz * 14.6, rot + (s > 0 ? 0 : Math.PI));
        for (let r = 0; r < 12.5; r += 5.5) K.cyl(.065, .075, 1.25, 7, '#596766', px + ux * r + nx * 16.9, .63, pz + uz * r + nz * 16.9);
      }
      for (const y of [.42, .86, 1.18]) { const r = K.boite(len, .055, .07, '#657371', (a[0] + b[0]) / 2 + nx * 16.9, y, (a[1] + b[1]) / 2 + nz * 16.9); r.rotation.y = rot; r.castShadow = false; }
      acc += len;
    }
    // Épis de roches noires qui s'avancent dans la mer.
    const roche = K.mat('#3b3a38', { rugosite: .95 }), claire = K.mat('#56524c', { rugosite: .95 });
    for (const [x, z, a] of L.epis) {
      let vx = Math.sin(a), vz = -Math.cos(a); if (vz < 0) { vx = -vx; vz = -vz; } // vers le large (sud)
      for (let i = 0; i * 1.6 < 34; i++) for (const dz of [-1.4, 0, 1.4]) { const px = x + vx * (i * 1.6 - 6) + Math.cos(a) * dz, pz = z + vz * (i * 1.6 - 6) + Math.sin(a) * dz; K.rocher(px, .3, pz, dz ? 1.1 : 1.35, (i + dz) % 2 ? roche : claire); }
    }
  });
  bake(g);
}
export function jeunePalmier(x, z, k = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = varie(x, z) * Math.PI; g.scale.setScalar(k); K.racine.add(g);
  K.cyl(.07, .13, 1.15, 6, '#806f58', 0, .55, 0, g);
  for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; const f = K.boite(.17, .055, 1.35, i % 2 ? '#4b7643' : '#62864d', Math.sin(a) * .52, 1.18, Math.cos(a) * .52, g); f.rotation.y = a; f.rotation.x = i % 2 ? -.12 : .12; }
  K.sphere(.16, '#718a45', 0, 1.18, 0, g);
  K.boite(1.7, .1, 1.7, '#8d8677', 0, .06, 0, g);
}

// ---------- Ponts : piles, garde-corps, lampadaires ----------
// Ils suivent le profil du tablier (TABLIERS) : piles sous le tablier là où il est
// haut, garde-corps et lampadaires posés dessus, en pente dans les rampes.
export function ponts() {
  const g = groupeLieu('ponts', 0, 0);
  K.into(g, () => {
    const beton = K.mat('#a9a399'), garde = K.mat('#d8d4ca');
    for (const T of TABLIERS) {
      if (T.cls > 3 || T.long < 60) continue;
      const w = T.w; let prochainePile = 18, prochaineLampe = 26, cum = 0;
      for (let i = 1; i < T.pts.length; i++) {
        const a = T.pts[i - 1], b = T.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); if (!len) continue;
        const ux = dx / len, uz = dz / len, rot = Math.atan2(-uz, ux), ha = T.h[i - 1], hb = T.h[i];
        for (const sg of [-1, 1]) { // garde-corps, par tronçon de ~12 m
          const ox = -uz * (w / 2 - .2) * sg, oz = ux * (w / 2 - .2) * sg;
          const r = K.boite(len + .05, .9, .25, garde, (a[0] + b[0]) / 2 + ox, (ha + hb) / 2 + .45, (a[1] + b[1]) / 2 + oz);
          r.rotation.set(0, rot, 0); r.rotateZ(Math.atan2(hb - ha, len));
        }
        while (prochainePile < cum + len) { // piles là où le tablier passe au-dessus de 1,8 m
          const t = (prochainePile - cum) / len, h = ha + (hb - ha) * t;
          if (h > 1.8) { const p = K.boite(2.2, h - .2 + 1.5, w * .7, beton, a[0] + ux * (t * len), (h - .2 - 1.5) / 2, a[1] + uz * (t * len)); p.rotation.y = rot; }
          prochainePile += 22;
        }
        while (prochaineLampe < cum + len) {
          const t = (prochaineLampe - cum) / len, h = ha + (hb - ha) * t;
          for (const sg of [-1, 1]) { const ox = -uz * (w / 2 - .2) * sg, oz = ux * (w / 2 - .2) * sg; const l = K.lampadaireSimple(a[0] + ux * t * len + ox, a[1] + uz * t * len + oz, -1, rot + (sg > 0 ? Math.PI / 2 : -Math.PI / 2)); l.position.y = h; }
          prochaineLampe += 36;
        }
        cum += len;
      }
    }
  });
  bake(g);
}

// ---------- Arbres des rues ----------
export function arbres(T) {
  const n = T.length / 4, CELL = 2000, parType = [new Map(), new Map(), new Map()];
  for (let i = 0; i < n; i++) { if (LITE && i % 2) continue; const x = T[4 * i] / 10, z = T[4 * i + 1] / 10, t = T[4 * i + 2], k = Math.floor(x / CELL) + ',' + Math.floor(z / CELL); const m = parType[t]; if (!m.has(k)) m.set(k, []); m.get(k).push(i); }
  const tronc = new THREE.CylinderGeometry(.22, .34, 3.6, 5).translate(0, 1.8, 0);
  const geos = [
    mergeGeometries([tronc.toNonIndexed(), new THREE.IcosahedronGeometry(2.8, 0).scale(1.2, .8, 1.2).translate(0, 5, 0), new THREE.IcosahedronGeometry(2, 0).translate(1, 6, -.6)].map(x => x.index ? x.toNonIndexed() : x)),
    mergeGeometries([tronc.toNonIndexed(), new THREE.SphereGeometry(4.2, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.3, .45, 1.3).translate(0, 4, 0).toNonIndexed()]),
    mergeGeometries([tronc.toNonIndexed(), ...[[4.2, 3.4], [3.2, 4.4], [2, 5.3]].map(([r, y]) => new THREE.CylinderGeometry(r, r * .92, .55, 8).translate(0, y, 0).toNonIndexed())]),
  ];
  for (const g of geos) { const c = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < g.attributes.position.count; i++) { const y = g.attributes.position.getY(i); const tr = y < 3.2; c[3 * i] = tr ? .42 : 1; c[3 * i + 1] = tr ? .33 : 1; c[3 * i + 2] = tr ? .25 : 1; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  const verts = ['#3f6b3c', '#4a7a3f', '#557f45', '#3a5f35', '#5d8a46'].map(h => new THREE.Color(h)), fleurs = new THREE.Color('#d9542f');
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), p = new THREE.Vector3();
  parType.forEach((cells, t) => {
    for (const ids of cells.values()) {
      const m = new THREE.InstancedMesh(geos[t], new THREE.MeshLambertMaterial({ vertexColors: true }), ids.length);
      ids.forEach((i, k) => { const sc = T[4 * i + 3] / 10; q.setFromAxisAngle(Y, hash(i, 31) * 6.28); m4.compose(p.set(T[4 * i] / 10, 0, T[4 * i + 1] / 10), q, s.set(sc, sc * (.9 + hash(i, 32) * .25), sc)); m.setMatrixAt(k, m4); m.setColorAt(k, t === 1 && hash(i, 33) < .08 ? fleurs : verts[Math.floor(hash(i, 34) * verts.length)]); });
      m.userData.xz = Float32Array.from(ids.flatMap(i => [T[4 * i] / 10, T[4 * i + 1] / 10])); VEGETATION.push(m);
      m.computeBoundingSphere(); m.castShadow = !LITE; m.receiveShadow = true; m.userData.proche = 5500; detailsProches.push(m); scene.add(m);
    }
  });
}

// ---------- Haie Vive : terrasses de maquis ----------
const BIO = toXZ(6.35015, 2.38752);
export function terrasses(centre) {
  const pos = [];
  for (const L of roadLines) {
    if (L.cls < 3 || L.cls > 5) continue;
    for (let i = 1; i < L.pts.length; i++) {
      const a = L.pts[i - 1], b = L.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); if (!len) continue;
      for (let t = 6; t < len; t += 18) { const x = a[0] + dx * t / len, z = a[1] + dz * t / len; if (Math.hypot(x - centre[0], z - centre[1]) > 380 || hash(Math.round(x * 7 + z), 41) > .3) continue;
        if (Math.hypot(x - BIO[0], z - BIO[1]) < 60) continue; const sg = hash(Math.round(x + z * 3), 42) < .5 ? -1 : 1; pos.push(x - dz / len * (ROAD_W[L.cls] / 2 + 3) * sg, z + dx / len * (ROAD_W[L.cls] / 2 + 3) * sg); }
    }
  }
  const n = pos.length / 2; if (!n) return;
  const par = new THREE.InstancedMesh(mergeGeometries([new THREE.ConeGeometry(1.5, .6, 8, 1, true).translate(0, 2.4, 0).toNonIndexed(), new THREE.CylinderGeometry(.04, .04, 2.3, 4).translate(0, 1.15, 0).toNonIndexed(), new THREE.CylinderGeometry(.6, .6, .06, 10).translate(0, .75, 0).toNonIndexed()]), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), n);
  const cols = ['#c8382f', '#f2efe6', '#2f6fb0', '#e9b62c', '#2f8a4a'].map(h => new THREE.Color(h)); const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) { m4.makeTranslation(pos[2 * i], 0, pos[2 * i + 1]); par.setMatrixAt(i, m4); par.setColorAt(i, cols[i % cols.length]); }
  par.userData.proche = 2000; detailsProches.push(par); scene.add(par);
  const gens = []; for (let i = 0; i < n * 3; i++) gens.push(Math.round((pos[2 * (i % n)] + (hash(i, 43) - .5) * 4) * 10), Math.round((pos[2 * (i % n) + 1] + (hash(i, 44) - .5) * 4) * 10));
  foule(gens, 7);
}

// ---------- Assemblage ----------
export async function construireLieux(data) {
  const L = data.L;
  etoileRouge(L.etoile);
  await amazone(L.amazone);
  palaisMarina(L.marina);
  palaisCongres(L.congres);
  cathedrale(L.cathedrale);
  stade(L.stade);
  port(L.port);
  aeroport(L.aero);
  dantokpa(data.B, data.market);
  ganvie(data.G);
  if (L.marcheFlottant) facadeRouge(L.marcheFlottant[0] + 40, L.marcheFlottant[1] - 25);
  pirogues(data.boats); piroguesPlage(data.beach.pir); acadjas(data.acadjas); jacinthes(data.hyacinths);
  plage(data.beach); foule(data.beach.ppl, 3);
  corniche(L.corniche);
  ponts();
  arbres(data.trees);
  terrasses(toXZ(6.3552, 2.3976));
  // Promeneurs sur l'esplanade de l'Amazone et la Corniche.
  const prom = []; const [ax, az] = L.amazone.pt; for (let i = 0; i < 90; i++) prom.push(Math.round((ax + (hash(i, 51) - .5) * 80) * 10), Math.round((az + (hash(i, 52) - .5) * 160) * 10));
  for (let i = 0; i < 160; i++) { const [x, z] = surPolyligne(L.corniche.road, hash(i, 53)); prom.push(Math.round((x + (hash(i, 54) - .5) * 4) * 10), Math.round((z + 8 + hash(i, 55) * 6) * 10)); }
  foule(prom, 5);
}
export const TOUJOURS = new Set(['piste', 'ponts', 'corniche', 'plage']);
// En « Vue réelle » sans maquette, les monuments reconstitués s'effacent devant les images Google.
export const LIEUX = { caches: false };
export function visibiliteLieux(cam) {
  for (const g of lieux) g.visible = !LIEUX.caches && (TOUJOURS.has(g.name) || cam.distanceTo(g.userData.centre) < (g.userData.portee ?? 4500));
  for (const m of detailsProches) {
    if (!m.boundingSphere) m.computeBoundingSphere();
    const bs = m.boundingSphere;
    m.visible = !LIEUX.caches && cam.distanceTo(bs.center) - bs.radius < m.userData.proche;
  }
}
export function animerLieux(t) { for (const m of detailsProches) if (m.visible && m.userData.anim) m.userData.anim(t); }

// ---------- Nouveaux lieux : UAC, Sèmè One ----------
K.motif('facadeSeme', (c, t) => {
  c.fillStyle = '#b5553f'; c.fillRect(0, 0, t, t);
  for (let f = 0; f < 3; f++) { const y = f * t / 3; c.fillStyle = '#a24a37'; c.fillRect(0, y + t * .3, t, t * .03); c.fillStyle = '#2f3437'; c.fillRect(t * .12, y + t * .08, t * .22, t * .18); c.fillRect(t * .62, y + t * .08, t * .22, t * .18); }
  c.fillStyle = '#c96a4f'; for (let i = 0; i < 4; i++) c.fillRect(i * t / 4 + t * .02, 0, t * .03, t);
  const fins = ['#f2c21b', '#6b4fa3', '#2f6fb0'];
  c.fillStyle = fins[Math.floor(Math.random() * 3)]; c.fillRect(t * .47, 0, t * .035, t);
});
export function semeOne(ring) {
  if (!ring) return;
  const c = centroide(ring), o = obb(ring);
  const g = groupeLieu('seme-one', c[0], c[1]);
  K.into(g, () => {
    const loc = ring.map(([x, z]) => [x - c[0], z - c[1]]);
    mursPoly(loc, 0, 12.5, K.tex('facadeSeme', 1, 1), 7.5, 12.5, undefined, K.mat('#c9bfb2'));
    const ang = o.L >= o.W ? o.ang : o.ang + Math.PI / 2, len = Math.max(o.L, o.W), dep = Math.min(o.L, o.W);
    const sx = Math.cos(ang), sz = Math.sin(ang);
    const nx = -sz, nz = sx; // façade : enseigne sur le toit, des deux côtés
    for (const s of [1, -1]) { panneauTexte(['SÈMÈ ONE'], 20, 3, nx * s * (dep / 2 + .3), 14.4, nz * s * (dep / 2 + .3), Math.atan2(nx * s, nz * s), { fond: '#f4f1ea', encre: '#9a3d2b', px: 1024, py: 154, police: '800 118px "Bricolage Grotesque", system-ui, sans-serif' }).material.side = THREE.FrontSide; }
    for (let k = -2; k <= 2; k++) voiture(sx * k * 9 + nx * (dep / 2 + 6), sz * k * 9 + nz * (dep / 2 + 6), ['#1f2326', '#e8e8e4', '#9da3a6', '#3c4a4f', '#e8e8e4'][k + 2], -ang);
  });
  bake(g);
}
// L'entrée principale donne sur la route de Calavi (RNIE 2) : on la pose sur le bord
// du campus qui longe cette route, à la hauteur de l'arrêt « UAC ».
export function portailUAC(campus, route) {
  if (!campus) return;
  const [bx, bz] = toXZ(6.4136, 2.3419);
  const dRoute = (x, z) => { if (!route) return 0; let m = 1e12; for (let i = 1; i < route.length; i++) { const a = route[i - 1], b = route[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)); m = Math.min(m, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z)); } return m; };
  let best = null, bd = 1e12;
  for (let i = 0; i < campus.length; i++) {
    const a = campus[i], b = campus[(i + 1) % campus.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    for (let u = 0; u <= L; u += 5) { const px = a[0] + dx * u / L, pz = a[1] + dz * u / L; if (dRoute(px, pz) > 45) continue; const d = (px - bx) ** 2 + (pz - bz) ** 2; if (d < bd) { bd = d; best = [px, pz, Math.atan2(dz, dx)]; } }
  }
  if (!best) return;
  const [px, pz, ang] = best;
  const g = groupeLieu('uac', px, pz, ang);
  K.into(g, () => {
    // Portail aux piliers orangés, bandeau blanc à lettres bleues, guérite blanche à soubassement brun.
    const peche = K.mat('#e8a77a'), blanc = K.mat('#f3efe6');
    for (const x of [-9, 9]) { K.boite(2.2, 7.5, 2.2, peche, x, 3.75, 0); for (const y of [2, 4.2]) K.boite(.7, 1.3, 2.25, '#c98d63', x, y, 0); }
    K.boite(20.5, 1.2, 1.6, peche, 0, 7.2, 0);
    for (const s of [1, -1]) { const p = panneauTexte(['UNIVERSITÉ D\'ABOMEY-CALAVI', 'CAMPUS UNIVERSITAIRE D\'ABOMEY-CALAVI'], 17, 2.2, 0, 6.3, s * .84, s > 0 ? 0 : Math.PI, { fond: '#f6f3ea', encre: '#1f4f9a', px: 1600, py: 207, police: '800 64px system-ui, sans-serif' }); }
    K.cyl(2.6, 2.6, 1.2, 20, '#7a5236', 14, .6, 4); K.cyl(2.5, 2.5, 1.6, 20, blanc, 14, 2, 4); K.cyl(2.9, 2.9, .3, 20, blanc, 14, 2.95, 4);
    for (const x of [-30, -20, 20, 30]) K.boite(10, 2.4, .4, '#e7dccb', x, 1.2, 0);
    K.boite(.12, 8, .12, '#d9d9d6', -12, 4, -3); K.boite(1.4, .06, .8, '#2b3a4a', -12, 8.1, -3);
  });
  bake(g);
}

