// Le centre de Ouidah : les monuments qu'on visite à pied, dessinés d'après les photos et posés à leur vraie place.
// « Je veux qu'on passe à Ouidah et qu'on modélise tout » (Murielle, 22/11). Avant, la ville de Ouidah n'était faite que des
// bâtiments génériques de la carte : la basilique était une boîte beige, la place Chacha un carrefour, le fort une pelouse.
// Mesures et emprises : ouidah-sites.js. Modèles regardés (photos libres de Wikimedia Commons, jamais posées en texture) :
//  - basilique : Fawaz.tairou (2020, CC BY-SA 4.0), façade grise aux encadrements blancs, tour au-dessus du portail,
//    pinacles rouges ; vue aérienne de la vidéo 4U Tourisme (10/11/2026) : toit de tuiles orangées, petit clocher blanc
//    au chevet, annexe à l'est de la façade, petite chapelle blanche à la croix sur le parvis ;
//  - Temple des Pythons : la vidéo (le nouveau bâtiment ocre, son pavillon « TEMPLE DE PYTHONS », les noms des
//    collectivités au-dessus des fenêtres, la cour pavée de briques) ; Ji-Elle (2017) pour la case ronde ;
//  - place Chacha : Bernadomariano (2025, CC0) et l'image satellite : rond planté au centre, arcs de briques rouges,
//    rangées de boules de bronze, murs rouges, lampadaires solaires, poteaux peints ;
//  - fort portugais : Bencas1 (2025, CC0) pour les bastions ocre rouge, Rachad sanoussi (2019) pour le musée blanc ;
//  - villa Ajavon : Kottiobed (2020) et Kulttuurinavigaattori (2018) : deux étages crème, balustres, pavillons d'angle.
import * as THREE from 'three';
import { K, bake, groupeLieu, lieux, local, obb, ruban, solPoly, mursPoly } from './lieux.js';
import { ajouterPlace } from './zones.js';
import { poserObstacles } from './rue.js';
import { BASILIQUE, CHACHA, FORT, KPASSE, ROUTE, ZINSOU, monde, placeBasiliqueTemple, repereBasilique, repereTemple } from './ouidah-sites.js';

// ---------- Outils ----------
const mats = new Map();
/** Matériau dessiné sur une toile (une fois par clé) ; `alpha` : le transparent de la toile découpe la forme. */
function toile(cle, w, h, dessin, o = {}) {
  if (mats.has(cle)) return mats.get(cle);
  const c = document.createElement('canvas'); c.width = w; c.height = h; dessin(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (o.repete) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: o.rugosite ?? .85, metalness: o.metal ?? 0, alphaTest: o.alpha ? .5 : 0, side: o.face2 ? THREE.DoubleSide : THREE.FrontSide });
  mats.set(cle, m); return m;
}
const bruit = (c, w, h, n, couleurs, t = 2) => { for (let i = 0; i < n; i++) { c.fillStyle = couleurs[i % couleurs.length]; c.fillRect(Math.random() * w, Math.random() * h, t, t); } };
/** Un plan vertical (face vers +z local, tourné de `ry`). */
function plan(w, h, mat, x, y, z, ry = 0, parent) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; (parent ?? K.racine).add(m); return m; }
/** Un panneau écrit (fond, encre), face vers +z local. */
function enseigne(texte, w, h, x, y, z, ry = 0, o = {}) {
  const px = 1024, py = Math.max(64, Math.round(px * h / w));
  const mat = toile(`ens|${texte}|${w}|${h}|${o.fond}|${o.encre}`, px, py, (c) => {
    c.fillStyle = o.fond ?? '#f4f2ec'; c.fillRect(0, 0, px, py); if (o.cadre) { c.strokeStyle = o.cadre; c.lineWidth = py * .08; c.strokeRect(0, 0, px, py); }
    c.fillStyle = o.encre ?? '#121212'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const lignes = texte.split('\n'); lignes.forEach((l, i) => { c.font = `${o.gras ?? 800} ${Math.round(py * Math.min(.66, .78 / lignes.length))}px "Arial Narrow", Arial, sans-serif`; c.fillText(l, px / 2, py * (i + .5) / lignes.length + py * .02, px * .94); });
  }, { rugosite: .6 });
  return plan(w, h, mat, x, y, z, ry);
}
/** Toit à quatre pans (ou pyramide si carré) de w × d, faîte à h au-dessus de y, débord `deb`. */
function geoToit4(w, d, h, deb = .5) {
  const tourne = d > w; if (tourne) [w, d] = [d, w];
  const W = w / 2 + deb, D = d / 2 + deb, r = Math.max(0, W - D), P = [[-W, 0, -D], [W, 0, -D], [W, 0, D], [-W, 0, D]], A = [-r, h, 0], B = [r, h, 0];
  const tris = [[P[0], B, P[1]], [P[0], A, B], [P[2], A, P[3]], [P[2], B, A], [P[1], B, P[2]], [P[3], A, P[0]]];
  const pos = [], uv = [];
  for (const t of tris) for (const v of t) { pos.push(...v); uv.push(v[0] / 2.2, (v[2] + v[1]) / 2.2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  if (tourne) g.rotateY(Math.PI / 2);
  return g;
}
function toit4(w, d, h, mat, x, y, z, ry = 0, deb = .5) { const m = new THREE.Mesh(geoToit4(w, d, h, deb), mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; K.racine.add(m); return m; }
/** Toit à deux pans le long de z local : largeur W (en x), longueur L (en z), pente h. */
function toit2(W, L, h, mat, x, y, z, deb = .6) {
  const demi = W / 2 + deb, pente = Math.atan2(h, W / 2), rampant = Math.hypot(h, W / 2) + deb;
  for (const s of [-1, 1]) { const v = K.boite(rampant, .22, L + deb * 2, mat, x + s * (W / 4 + deb / 4), y + h / 2, z); v.rotation.z = -s * pente; }
  void demi;
}
/** Pignon triangulaire plein (face vers +z local). */
function pignon(W, h, mat, x, y, z, ry = 0) {
  const s = new THREE.Shape(); s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(0, h); s.closePath();
  const geo = new THREE.ShapeGeometry(s), uv = geo.attributes.uv, P = geo.attributes.position; // la toile couvre tout le triangle
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (P.getX(i) + W / 2) / W, P.getY(i) / h);
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; K.racine.add(m); return m;
}
const ARBRES = ['#3f6b3c', '#4a7a3f', '#557f45', '#3a5f35'];
/** Un grand arbre (tronc et houppier de quelques blocs) en coordonnées locales. */
function arbre(x, z, h = 10, r = 5, i = 0) {
  K.cyl(.32 * h / 10, .5 * h / 10, h * .5, 7, '#6b5443', x, h * .25, z);
  const k = [[0, 0, 0, 1], [.55, .1, .2, .75], [-.5, .05, -.3, .7], [.1, .2, -.55, .7], [-.15, -.05, .55, .7]];
  k.forEach(([dx, dy, dz, s], j) => { const b = K.maillage(K.geo(`ico${r * s}`, () => new THREE.IcosahedronGeometry(r * s, 0)), ARBRES[(i + j) % ARBRES.length], x + dx * r, h * .72 + dy * r, z + dz * r); b.scale.y = .72; });
}
/** Un cocotier. */
function palmier(x, z, h = 9, i = 0) {
  const t = K.cyl(.16, .24, h, 6, '#7c6048', x, h / 2, z); t.rotation.z = ((i * 37) % 9 - 4) * .012;
  for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + i, f = K.boite(4, .06, .7, '#3f7a2e', x + Math.cos(a) * 1.8, h - .35, z + Math.sin(a) * 1.8); f.rotation.y = -a; f.rotation.z = -.42; }
}
/** Un obstacle (boîte) posé dans le repère R : centre (x, z) local, lx le long de x local, lz le long de z local. */
const obs = (R, x, z, lx, lz) => [...monde(R, x, z), -R.ang, lx, lz];
/** Les murs d'un anneau [x, z] (monde) comme obstacles fins. */
const obsAnneau = (r, ep = .5) => r.map((a, i) => { const b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, -Math.atan2(b[1] - a[1], b[0] - a[0]), L + ep, ep]; });
const dansAnneau = (x, z, r) => { let d = false; for (let a = 0, j = r.length - 1; a < r.length; j = a++) { const [xa, za] = r[a], [xj, zj] = r[j]; if ((za > z) !== (zj > z) && x < (xj - xa) * (z - za) / (zj - za) + xa) d = !d; } return d; };

// ---------- Les matières dessinées ----------
const GRIS = '#6f797c', BLANC = '#f2f0ea', ROUGE_PINACLE = '#b3322b';
const tuiles = () => toile('tuiles', 256, 256, (c, w, h) => {
  c.fillStyle = '#b5603a'; c.fillRect(0, 0, w, h);
  for (let r = 0; r < 8; r++) for (let k = -1; k < 9; k++) { const x = k * w / 8 + (r % 2) * w / 16, y = r * h / 8; c.fillStyle = ['#c06a40', '#a9552f', '#b9643b', '#9f4e2c'][(r * 3 + k) & 3]; c.beginPath(); c.ellipse(x + w / 16, y + h / 10, w / 17, h / 11, 0, 0, Math.PI); c.fill(); }
  bruit(c, w, h, 500, ['#8f4527', '#c87a50']);
}, { repete: true, face2: true, rugosite: .8 });
/** Fenêtre en ogive (encadrement blanc, vitrail sombre) découpée dans la toile. */
const lancette = (fond = null) => toile(`lancette${fond}`, 128, 384, (c, w, h) => {
  const ogive = (m) => { c.beginPath(); c.moveTo(m, h - m); c.lineTo(m, h * .3); c.quadraticCurveTo(m, m * .6, w / 2, m * .4); c.quadraticCurveTo(w - m, m * .6, w - m, h * .3); c.lineTo(w - m, h - m); c.closePath(); };
  if (fond) { c.fillStyle = fond; c.fillRect(0, 0, w, h); }
  c.fillStyle = BLANC; ogive(0); c.fill();
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3d4e66'); g.addColorStop(1, '#22293a'); c.fillStyle = g; ogive(w * .17); c.fill();
  c.strokeStyle = 'rgba(190,170,120,.55)'; c.lineWidth = 2; for (let y = h * .3; y < h; y += h / 9) { c.beginPath(); c.moveTo(w * .17, y); c.lineTo(w * .83, y); c.stroke(); }
  c.beginPath(); c.moveTo(w / 2, h * .12); c.lineTo(w / 2, h - w * .17); c.stroke();
}, { alpha: !fond });
/** Abat-son du clocher : ogive à lames blanches sur fond sombre. */
const abatSon = () => toile('abatson', 128, 384, (c, w, h) => {
  c.fillStyle = BLANC; c.beginPath(); c.moveTo(0, h); c.lineTo(0, h * .28); c.quadraticCurveTo(0, 0, w / 2, 0); c.quadraticCurveTo(w, 0, w, h * .28); c.lineTo(w, h); c.closePath(); c.fill();
  c.fillStyle = '#1e2224'; c.fillRect(w * .16, h * .22, w * .68, h * .74);
  c.fillStyle = '#e9e7e0'; for (let y = h * .26; y < h * .95; y += h / 16) c.fillRect(w * .16, y, w * .68, h / 40);
}, { alpha: true });
/** La grande baie au-dessus du portail : arc blanc, deux lancettes et un oculus. */
const baieDouble = () => toile('baiedouble', 256, 512, (c, w, h) => {
  c.fillStyle = BLANC; c.beginPath(); c.moveTo(0, h); c.lineTo(0, h * .32); c.quadraticCurveTo(0, 0, w / 2, 0); c.quadraticCurveTo(w, 0, w, h * .32); c.lineTo(w, h); c.closePath(); c.fill();
  c.fillStyle = '#2a3346'; for (const x0 of [w * .2, w * .56]) { c.beginPath(); c.moveTo(x0, h * .92); c.lineTo(x0, h * .42); c.quadraticCurveTo(x0, h * .3, x0 + w * .12, h * .28); c.quadraticCurveTo(x0 + w * .24, h * .3, x0 + w * .24, h * .42); c.lineTo(x0 + w * .24, h * .92); c.closePath(); c.fill(); }
  c.beginPath(); c.arc(w / 2, h * .17, w * .08, 0, Math.PI * 2); c.fill();
}, { alpha: true });
/** Le portail : arc blanc, bandeau de mosaïque bleue, porte bois rouge sombre, croix rouge. */
const portail = () => toile('portailbas', 256, 512, (c, w, h) => {
  c.fillStyle = BLANC; c.beginPath(); c.moveTo(0, h); c.lineTo(0, h * .3); c.quadraticCurveTo(0, 0, w / 2, 0); c.quadraticCurveTo(w, 0, w, h * .3); c.lineTo(w, h); c.closePath(); c.fill();
  c.strokeStyle = '#2f62a8'; c.lineWidth = w * .05; c.beginPath(); c.arc(w / 2, h * .36, w * .34, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  c.fillStyle = '#c23a2e'; c.fillRect(w * .47, h * .14, w * .06, h * .17); c.fillRect(w * .4, h * .19, w * .2, h * .04);
  c.fillStyle = '#5a2a22'; c.fillRect(w * .2, h * .46, w * .6, h * .54);
  c.strokeStyle = '#3e1c17'; c.lineWidth = 3; c.strokeRect(w * .2, h * .46, w * .3, h * .54); c.strokeRect(w * .5, h * .46, w * .3, h * .54);
}, { alpha: true });
/** Mur blanc d'un bâtiment colonial : deux rangs de fenêtres à volets bruns, soubassement noir (musée du fort). */
const murMusee = () => toile('murmusee', 256, 480, (c, w, h) => {
  c.fillStyle = '#f1efe9'; c.fillRect(0, 0, w, h); bruit(c, w, h, 300, ['#e6e2d9', '#f7f5f0']);
  c.fillStyle = '#1d1d1d'; c.fillRect(0, h * .9, w, h * .1);
  c.fillStyle = '#e2ddd2'; c.fillRect(0, h * .47, w, h * .03);
  for (const y of [h * .1, h * .57]) { c.fillStyle = '#3b2f28'; c.fillRect(w * .32, y, w * .36, h * .26); c.fillStyle = '#7a4b2e'; c.fillRect(w * .1, y, w * .2, h * .26); c.fillRect(w * .7, y, w * .2, h * .26); c.fillStyle = '#5e3a24'; for (let k = 0; k < 6; k++) { c.fillRect(w * .1, y + k * h * .044, w * .2, 2); c.fillRect(w * .7, y + k * h * .044, w * .2, 2); } }
}, { repete: true });
/** Mur crème de la villa Ajavon : arcades au rez-de-chaussée, fenêtres à l'étage, corniches, balustres. */
const murVilla = () => toile('murvilla', 256, 512, (c, w, h) => {
  c.fillStyle = '#e9dcc2'; c.fillRect(0, 0, w, h); bruit(c, w, h, 400, ['#dfd1b5', '#f1e6cf']);
  c.fillStyle = '#d8c9ab'; c.fillRect(0, h * .47, w, h * .035); c.fillRect(0, 0, w, h * .04);
  c.fillStyle = '#d2c3a5'; for (let x = w * .08; x < w * .92; x += w * .06) c.fillRect(x, h * .41, w * .025, h * .06); // balustres de l'étage
  c.fillStyle = '#e4d6bb'; c.fillRect(w * .05, h * .405, w * .9, h * .012);
  c.fillStyle = '#2a2b2a'; c.fillRect(w * .3, h * .12, w * .4, h * .27); // fenêtre de l'étage
  c.fillStyle = '#6f5a44'; c.fillRect(w * .18, h * .12, w * .1, h * .27); c.fillRect(w * .72, h * .12, w * .1, h * .27);
  c.fillStyle = '#2a2b2a'; c.beginPath(); c.moveTo(w * .26, h); c.lineTo(w * .26, h * .66); c.arc(w / 2, h * .66, w * .24, Math.PI, 0); c.lineTo(w * .74, h); c.closePath(); c.fill(); // arcade
  c.strokeStyle = '#d6c7a8'; c.lineWidth = 6; c.beginPath(); c.arc(w / 2, h * .66, w * .26, Math.PI, 0); c.stroke();
}, { repete: true });
const balustrade = () => toile('balustrade', 256, 96, (c, w, h) => {
  c.fillStyle = '#e9dcc2'; c.fillRect(0, 0, w, h); c.fillStyle = '#c9b996'; for (let x = 6; x < w; x += 22) { c.beginPath(); c.ellipse(x + 7, h * .55, 6, h * .28, 0, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#dccdb0'; c.fillRect(0, 0, w, h * .18); c.fillRect(0, h * .86, w, h * .14);
}, { repete: true });
/** Mur ocre du Temple des Pythons. */
const OCRE = '#d68a3c';
const persienne = () => toile('persienne', 64, 128, (c, w, h) => { c.fillStyle = '#1f1f1f'; c.fillRect(0, 0, w, h); c.fillStyle = '#9aa3a6'; for (let y = 6; y < h - 4; y += 7) c.fillRect(5, y, w - 10, 3); c.strokeStyle = '#111'; c.lineWidth = 5; c.strokeRect(0, 0, w, h); });
const briques = () => toile('briquesrouges', 256, 256, (c, w, h) => {
  c.fillStyle = '#8f4a36'; c.fillRect(0, 0, w, h);
  for (let r = 0; r < 16; r++) for (let k = -1; k < 9; k++) { c.fillStyle = ['#b65d43', '#a95440', '#bf684b', '#9e4d3a', '#b86a52'][(r * 7 + k * 3) % 5]; c.fillRect(k * w / 8 + (r % 2) * w / 16 + 1, r * h / 16 + 1, w / 8 - 2, h / 16 - 2); }
  bruit(c, w, h, 700, ['#7d3f2e', '#c97a5c']);
}, { repete: true });
const dalleBeige = () => toile('dallebeige', 256, 256, (c, w, h) => {
  c.fillStyle = '#d8c08f'; c.fillRect(0, 0, w, h); bruit(c, w, h, 2500, ['#cdb381', '#e2cc9e', '#c9ad78', '#ead7ad'], 2);
  c.strokeStyle = 'rgba(150,120,80,.25)'; c.lineWidth = 2; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * w / 4, 0); c.lineTo(i * w / 4, h); c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke(); }
}, { repete: true });
const totem = (i) => toile(`totem${i % 5}`, 64, 256, (c, w, h) => {
  const pal = [['#e7b52c', '#2b6db2', '#c8382f', '#2f8a4a'], ['#f2efe6', '#c8382f', '#1f1f1f', '#e7b52c'], ['#2f8a4a', '#e9b62c', '#8e3c8f', '#f2efe6'], ['#2b6db2', '#f2efe6', '#e2672a', '#1f8f8a'], ['#c8382f', '#e7b52c', '#2b6db2', '#f2efe6']][i % 5];
  for (let y = 0; y < h; y += 16) { c.fillStyle = pal[(y / 16) % pal.length]; c.fillRect(0, y, w, 16); c.fillStyle = pal[(y / 16 + 2) % pal.length]; for (let x = 4; x < w; x += 16) { c.beginPath(); c.arc(x + 4, y + 8, 4, 0, Math.PI * 2); c.fill(); } }
});

// ---------- Basilique de l'Immaculée-Conception ----------
const ARBRES_BAS = [[-14, 8, 10], [14.5, 12, 9], [-12, -30, 11], [12.5, -26, 10]];
// Repère : origine au milieu de la façade (au sud), x d'ouest en est le long de la façade, z vers le parvis ; la nef part vers −z.
function basilique() {
  const R = repereBasilique(), g = groupeLieu('Basilique de Ouidah', R.o[0], R.o[1], R.ang); g.userData.portee = 3500;
  const { C, L } = BASILIQUE, profondeur = -Math.min(local(g, ...C)[1], local(g, ...L)[1]), W = 14, Hm = 11; // la nef : ~46 m
  const nef = -profondeur, gris = K.mat(GRIS, { rugosite: .9 }), blanc = K.mat(BLANC, { rugosite: .85 }), cote = K.mat('#e2e3de', { rugosite: .9 }), rouge = K.mat(ROUGE_PINACLE, { rugosite: .7 });
  const obst = [];
  K.into(g, () => {
    // Nef : murs clairs rythmés de contreforts gris et de lancettes, toit de tuiles orangées.
    K.boite(W, Hm, profondeur, cote, 0, Hm / 2, nef / 2);
    for (const s of [-1, 1]) {
      for (let z = -5.5; z > nef + 3; z -= 6.2) { plan(1.7, 5.4, lancette(), s * (W / 2 + .02), 6.2, z, s * Math.PI / 2); K.boite(.6, Hm - .6, .8, gris, s * (W / 2 + .3), (Hm - .6) / 2, z - 3.1); }
      K.boite(.5, .5, profondeur, blanc, s * (W / 2 + .25), Hm - .2, nef / 2); // corniche
    }
    toit2(W, profondeur, 6, K.tex('tuilesBas', 4, 18), 0, Hm, nef / 2);
    K.boite(.45, .35, profondeur + 1, '#9c4c2c', 0, Hm + 6.05, nef / 2);
    pignon(W + 1, 6, cote, 0, Hm, nef - .01, Math.PI);
    // Façade : mur gris, rampants des bas-côtés qui montent vers la tour, contreforts blancs aux angles et pinacles rouges.
    const f = new THREE.Shape(); f.moveTo(-7.3, 0); f.lineTo(7.3, 0); f.lineTo(7.3, 11); f.lineTo(2.9, 14); f.lineTo(-2.9, 14); f.lineTo(-7.3, 11); f.closePath();
    const fa = K.maillage(new THREE.ExtrudeGeometry(f, { depth: 1, bevelEnabled: false }), gris, 0, 0, 0); void fa;
    for (const s of [-1, 1]) {
      const r = K.boite(5.2, .35, 1.3, blanc, s * 5.1, 12.6, .5); r.rotation.z = -s * Math.atan2(3, 4.4); // rampant
      K.boite(.95, 12, 1.5, blanc, s * 7.05, 6, .55); K.boite(1.15, .5, 1.7, blanc, s * 7.05, 12.1, .55);
      K.cone(.5, 1.7, 4, rouge, s * 7.05, 13.2, .55).rotation.y = Math.PI / 4;
      K.boite(.7, 1.6, .9, blanc, s * 3.3, 14.6, .55); K.cone(.4, 1.3, 4, rouge, s * 3.3, 16, .55).rotation.y = Math.PI / 4;
      plan(1.9, 5.6, lancette(), s * 5.1, 6.6, 1.02);
      K.boite(.35, 11, .3, blanc, s * 3.1, 5.5, 1.05); // pilastres de part et d'autre de la tour
    }
    // Tour du portail : grise, chaînes d'angle et bandeaux blancs, baie double, abat-sons, pinacles rouges.
    const Ht = 30;
    K.boite(5.8, Ht, 5, gris, 0, Ht / 2, -1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.boite(.5, Ht, .5, blanc, sx * 2.9, Ht / 2, -1 + sz * 2.5);
    for (const [y, e] of [[17.2, .55], [19.6, .3], [27.4, .35]]) K.boite(6.1, e, 5.3, blanc, 0, y, -1);
    K.boite(6.6, .7, 5.8, blanc, 0, Ht + .35, -1);
    plan(3.4, 7.1, portail(), 0, 3.55, 1.52); plan(3.6, 6.8, baieDouble(), 0, 12.9, 1.52);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, nx = Math.sin(a), nz = Math.cos(a), d = k % 2 ? 2.92 : 2.52; for (const t of [-.8, .8]) plan(1.1, 4.4, abatSon(), nx * d + Math.cos(a) * t, 23.5, -1 + nz * d - Math.sin(a) * t, a); }
    K.cyl(.25, .3, 1.3, 8, rouge, 0, 18.4, 1.65); K.sphere(.22, '#e9d3c0', 0, 19.2, 1.65); // la statue rouge dans sa niche
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { K.boite(.75, 1.7, .75, blanc, sx * 2.85, Ht + 1.5, -1 + sz * 2.35); K.cone(.48, 1.6, 4, rouge, sx * 2.85, Ht + 3.15, -1 + sz * 2.35).rotation.y = Math.PI / 4; }
    toit4(5.2, 4.4, 3.2, K.mat('#4f5a5e', { rugosite: .6, face2: true }), 0, Ht + .7, -1, 0, .1);
    K.boite(.22, 2.2, .22, BLANC, 0, Ht + 4.9, -1); K.boite(1, .22, .22, BLANC, 0, Ht + 5.3, -1);
    // Marches et parvis jusqu'à la rue ; petite chapelle blanche à la croix près de la rue (vue aérienne).
    for (let k = 0; k < 3; k++) K.boite(9 - k * .8, .18, 1.1, '#d9d6cf', 0, .09 + k * .18, 2.9 - k * .55);
    solPoly([[[-16, 0], [16, 0], [16, 24.5], [-16, 24.5]]], K.tex('beton', 6, 4, '#d2cbbd'), .07, 4);
    K.boite(4, 3.4, 3.2, BLANC, -12, 1.7, 20); toit4(4, 3.2, 1.2, K.mat('#9aa3a6', { face2: true }), -12, 3.4, 20, 0, .3);
    K.boite(.2, 1.6, .2, '#c23a2e', -12, 5.2, 20); K.boite(.9, .2, .2, '#c23a2e', -12, 5.5, 20);
    // Petit clocher blanc au chevet, annexe à toit orangé à l'est de la façade.
    K.boite(5.4, 18, 5.4, K.mat('#eeeeea'), 0, 9, nef - 2.6);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; plan(1, 3.6, abatSon(), Math.sin(a) * 2.72, 14.5, nef - 2.6 + Math.cos(a) * 2.72, a); }
    toit4(5.4, 5.4, 3, K.mat('#4f5a5e', { rugosite: .6, face2: true }), 0, 18, nef - 2.6, 0, .25);
    K.boite(.2, 1.8, .2, BLANC, 0, 21.9, nef - 2.6); K.boite(.9, .2, .2, BLANC, 0, 22.3, nef - 2.6);
    K.boite(5.2, 4.6, 7, K.mat('#ecebe6'), W / 2 + 2.6, 2.3, -4.5); toit4(5.2, 7, 1.8, tuiles(), W / 2 + 2.6, 4.6, -4.5, 0, .4);
    // La grotte de Lourdes, à l'ouest de la nef : rochers couverts de lierre, la Vierge blanche au-dessus.
    for (const [dx, dy, s] of [[0, 1.6, 2.6], [-2, 1.1, 1.9], [2.1, 1.2, 2], [0, 3.4, 1.5]]) { const b = K.maillage(K.geo(`roc${s}`, () => new THREE.DodecahedronGeometry(s, 0)), dy > 3 ? '#4d6b39' : '#56743f', -W / 2 - 7 + dx, dy, -14); b.scale.set(1.1, .9, .8); }
    plan(2.2, 2.2, K.mat('#1c1f1d'), -W / 2 - 7, 1.1, -11.8);
    K.cyl(.28, .38, 1.6, 8, '#f4f4f2', -W / 2 - 7, 5.1, -13.6); K.sphere(.22, '#f4f4f2', -W / 2 - 7, 6.1, -13.6);
    for (const [x, z, h] of ARBRES_BAS) arbre(x, z, h, 4.2, x > 0 ? 1 : 2);
  });
  obst.push(...ARBRES_BAS.map(([x, z]) => obs(R, x, z, 1, 1)), obs(R, 0, nef / 2, W + 1.4, profondeur), obs(R, 0, -1, 6, 5.4), obs(R, 0, nef - 2.6, 5.6, 5.6), obs(R, W / 2 + 2.6, -4.5, 5.4, 7.2), obs(R, -12, 20, 4.2, 3.4), obs(R, -W / 2 - 7, -14, 6, 4));
  bake(g);
  return obst;
}

// ---------- Temple des Pythons ----------
// Repère : origine sur l'axe de la rue, x le long de la rue (vers l'est-nord-est), z vers le temple. La façade regarde la
// rue (−z), à 9 m de l'axe ; la case du python est derrière, dans la cour.
function temple() {
  const R = repereTemple(), g = groupeLieu('Temple des Pythons', R.o[0], R.o[1], R.ang); g.userData.portee = 3500;
  const ocre = K.mat(OCRE, { rugosite: .92 }), soubas = K.mat('#c57a33', { rugosite: .95 }), noir = K.mat('#151515', { rugosite: .6 });
  const F = 9, P = 8, L2 = 21; // façade à z = F, profondeur P, demi-longueur L2
  K.into(g, () => {
    K.boite(L2 * 2 + .6, .45, P + 1.9, soubas, 0, .225, F + P / 2 - .9); // soubassement et terrasse
    K.boite(L2 * 2 + 1, .16, .35, K.mat('#bdbab2'), 0, .08, F - 1.9); // bordure grise
    K.boite(L2 * 2, 3.9, P, ocre, 0, .45 + 1.95, F + P / 2);
    toit4(L2 * 2, P, 2.4, tuiles(), 0, 4.35, F + P / 2, 0, .7);
    // Pavillon central : avancé, plus haut, toit pyramidal, l'enseigne et l'entrée aux piliers noirs.
    K.boite(8.4, 4.6, 9.6, ocre, 0, .45 + 2.3, F + P / 2 - .7);
    toit4(8.4, 9.6, 3.6, tuiles(), 0, 5.05, F + P / 2 - .7, 0, .75);
    K.sphere(.28, '#a9552f', 0, 8.75, F + P / 2 - .7);
    const pf = F - 1.5; // le devant du pavillon
    enseigne('TEMPLE DE PYTHONS', 7.4, .82, 0, 4.45, pf - .04, Math.PI, { cadre: '#2a2a2a' });
    plan(4.1, 3.5, K.mat('#3a2b22'), 0, .45 + 1.75, pf - .02, Math.PI);
    for (const s of [-1, 1]) { K.boite(.5, 3.7, .45, noir, s * 2.3, .45 + 1.85, pf - .2); K.boite(.52, .5, .47, K.mat('#f0eee8'), s * 2.3, 1.2, pf - .2); }
    for (let k = 0; k < 2; k++) K.boite(4.6 - k * .5, .15, .9, '#d9d4c8', 0, .07 + k * .15, pf - 1.2 + k * .4);
    // Ailes : fenêtres à persiennes, noms au-dessus, jardinières ocre.
    const fen = (x) => plan(.95, 1.9, persienne(), x, 2.25, F - .02, Math.PI);
    for (const x of [6, 9, 12, 15, 18.6]) fen(x);
    for (const x of [-16.5, -19.4]) fen(x);
    enseigne('ZOSSOUNGBO', 3.4, .5, 18.2, 3.75, F - .03, Math.PI, { cadre: '#333' });
    enseigne('AGBAMOU ATAKPALOKO AGBO', 6.6, .5, 10.4, 3.75, F - .03, Math.PI, { cadre: '#333' });
    enseigne('ADJOVI AKANKOTOGLONOU', 6.4, .5, -12.2, 3.75, F - .03, Math.PI, { cadre: '#333' });
    for (const x of [7.5, 10.5, 13.5, 16.8, 20]) { K.boite(1, .5, .7, soubas, x, .7, F - .5); K.sphere(.42, '#3f7a35', x, 1.25, F - .5); }
    // Terrasse du café, à l'ouest de l'entrée : parasols orange, tables et chaises noires.
    for (const x of [-7.5, -11, -14.5]) {
      K.cyl(.04, .04, 2.4, 5, '#ddd', x, 1.2, F - 3.4); K.cone(1.5, .55, 8, K.mat('#ec7a1c', { face2: true }), x, 2.5, F - 3.4);
      K.cyl(.45, .45, .05, 10, '#222', x, .75, F - 3.4); for (const a of [0, 2.1, 4.2]) K.boite(.45, .8, .45, noir, x + Math.cos(a) * .9, .4, F - 3.4 + Math.sin(a) * .9);
    }
    // La cour : murs roses, la case ronde du python sous les grands arbres.
    const mur = K.mat('#e6c3b4', { rugosite: .95 });
    for (const s of [-1, 1]) K.boite(.35, 2.4, 14, mur, s * L2, 1.2, F + P + 7);
    K.boite(L2 * 2, 2.4, .35, mur, 0, 1.2, F + P + 14);
    const hz = F + P + 7;
    K.cyl(3, 3, 2.6, 20, K.mat('#efe6d3'), 0, 1.3, hz); K.cyl(3.02, 3.02, .7, 20, K.mat('#5f8fb8'), 0, .35, hz);
    K.cone(3.9, 3, 20, K.mat('#8a5a3c', { rugosite: .9 }), 0, 4.1, hz);
    plan(1, 1.9, K.mat('#4a3626'), 0, .95, hz - 3.02, Math.PI);
    for (const [x, z] of [[-10, hz + 2], [12, hz + 1]]) arbre(x, z, 14, 6, 2);
  });
  const troncs = [[-10, F + P + 9], [12, F + P + 8]];
  // La rue pavée entre la basilique et le temple : briques rouges, on y roule toujours.
  const place = placeBasiliqueTemple();
  solPoly([place.map(p => local(g, ...p))], briques(), .1, 3.5, g);
  ajouterPlace(place, { roule: true });
  const obst = [obs(R, 0, F + P / 2, L2 * 2, P), obs(R, 0, F + P / 2 - .7, 8.4, 9.6), obs(R, 0, F + P + 7, 5.8, 5.8),
    obs(R, -L2, F + P + 7, .5, 14), obs(R, L2, F + P + 7, .5, 14), obs(R, 0, F + P + 14, L2 * 2, .5),
    ...[-7.5, -11, -14.5].map(x => obs(R, x, F - 3.4, 1.4, 1.4)), ...troncs.map(([x, z]) => obs(R, x, z, 1.2, 1.2))];
  bake(g);
  return obst;
}

// ---------- Place Chacha ----------
function chacha() {
  const [cx, cz] = CHACHA.centre, g = groupeLieu('Place Chacha', cx, cz, 0); g.userData.portee = 3000;
  const contour = CHACHA.contour.map(([x, z]) => [x - cx, z - cz]), dedans = (x, z) => dansAnneau(x, z, contour) || x * x + z * z < 19 * 19;
  const brique = briques(), bronze = new THREE.MeshStandardMaterial({ color: '#5b3a22', metalness: .55, roughness: .42 });
  // Les allées droites qui partent du rond : vers les trois bouts de la place (sud-ouest, sud, nord-est).
  const bouts = [contour[0], contour[2], [(contour[7][0] + contour[8][0]) / 2, (contour[7][1] + contour[8][1]) / 2]], angles = bouts.map(([x, z]) => Math.atan2(z, x));
  const surAllee = (x, z) => angles.some(a => { const u = x * Math.cos(a) + z * Math.sin(a), v = -x * Math.sin(a) + z * Math.cos(a); return u > 10 && Math.abs(v) < 1.9; });
  const obst = [];
  K.into(g, () => {
    solPoly([contour], dalleBeige(), .1, 3);
    solPoly([Array.from({ length: 64 }, (_, k) => [Math.cos(k / 64 * Math.PI * 2) * 19.5, Math.sin(k / 64 * Math.PI * 2) * 19.5])], dalleBeige(), .1, 3);
    // Arcs de briques rouges autour du rond (coupés au bord de la place), anneau rouge autour du massif.
    const pos = [], uv = [], idx = [];
    const arc = (r0, r1) => { for (let a = 0; a < 360; a += 2) { const t0 = a * Math.PI / 180, t1 = (a + 2) * Math.PI / 180, rm = (r0 + r1) / 2; if (!dedans(Math.cos(t0 + .017) * rm, Math.sin(t0 + .017) * rm)) continue; const n = pos.length / 3; for (const [t, r] of [[t0, r0], [t0, r1], [t1, r1], [t1, r0]]) { pos.push(Math.cos(t) * r, .125, Math.sin(t) * r); uv.push(Math.cos(t) * r / 3, Math.sin(t) * r / 3); } idx.push(n, n + 2, n + 1, n, n + 3, n + 2); } };
    arc(10.6, 12.2); for (const r of [17, 23, 28.5, 34, 39.5]) arc(r - .7, r + .7);
    const ga = new THREE.BufferGeometry(); ga.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ga.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ga.setIndex(idx); ga.computeVertexNormals();
    const briqueArc = brique.clone(); Object.assign(briqueArc, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -20 });
    K.racine.add(Object.assign(new THREE.Mesh(ga, briqueArc), { receiveShadow: true }));
    for (const a of angles) { const pts = []; for (let u = 12; u < 60; u += 2) { if (!dedans(Math.cos(a) * u, Math.sin(a) * u)) break; pts.push([Math.cos(a) * u, Math.sin(a) * u]); } if (pts.length > 1) { const m = solPoly([[[-1.6, 0], [1.6, 0], [1.6, pts.length * 2], [-1.6, pts.length * 2]]], brique, .13, 3); m.rotation.y = -a + Math.PI / 2; m.position.set(Math.cos(a) * 12, 0, Math.sin(a) * 12); } }
    // Le massif rond : bordure claire, gazon, le grand arbre de la place et la stèle « PLACE CHACHA ».
    K.cyl(9.2, 9.2, .5, 48, '#e2dccd', 0, .25, 0); K.cyl(8.9, 8.9, .1, 48, '#5f8a43', 0, .52, 0);
    K.cyl(.9, 1.3, 5.5, 9, '#5d4a3b', 0, 3, 0);
    for (const [dx, dz, s, y] of [[0, 0, 7, 9.5], [4.5, 2, 4.5, 8], [-4.2, -2.5, 4.6, 8.2], [1.5, -4.8, 4, 8.6], [-2, 4.6, 4.2, 8.4]]) { const b = K.maillage(K.geo(`ico${s}`, () => new THREE.IcosahedronGeometry(s, 1)), ARBRES[Math.abs(Math.round(dx + dz)) % ARBRES.length], dx, y, dz); b.scale.y = .55; }
    for (const a of [.6, 2.2, 3.9, 5.3]) { const b = K.cyl(.22, .35, 4.5, 6, '#5d4a3b', Math.cos(a) * 1.8, 6.2, Math.sin(a) * 1.8); b.rotation.z = Math.cos(a) * .7; b.rotation.x = -Math.sin(a) * .7; }
    K.boite(1.6, 1.1, .45, '#cfc8b8', 0, .65, 10); enseigne('PLACE\nCHACHA', 1.3, .8, 0, .7, 10.24, 0, { fond: '#d6cfbf', encre: '#3a332a' });
    // Lampadaires solaires.
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2 + .2, r = k % 2 ? 31 : 21.5, x = Math.cos(a) * r, z = Math.sin(a) * r; if (!dedans(x, z) || surAllee(x, z)) continue; K.cyl(.08, .11, 7.5, 6, '#4b5052', x, 3.75, z); const p = K.boite(1.2, .06, .8, '#26354a', x, 7.7, z); p.rotation.x = .35; K.boite(.5, .15, .25, '#dfe3e3', x, 7.2, z + .3); obst.push([cx + x, cz + z, 0, .35, .35]); }
  });
  // Le mur rouge au nord-ouest (au-delà du rond), les poteaux peints devant, le groupe de bronze des captifs au bout nord-est
  // (au-delà des arcs). Leurs places d'abord : les boules de bronze s'en écartent.
  const rougeMur = K.mat('#8f3b29', { rugosite: .95 }), chaperon = K.mat('#a64c35');
  const [a0, a1] = [contour[0], contour[1]], lon = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]), ux = (a1[0] - a0[0]) / lon, uz = (a1[1] - a0[1]) / lon, nx = uz, nz = -ux; // vers l'extérieur (nord-ouest)
  const poteaux = []; for (let k = 0; k < 12; k++) { const s = 5 + k * 1.6, x = a0[0] + ux * s - nx * 2.2, z = a0[1] + uz * s - nz * 2.2; if (x * x + z * z >= 24 * 24 && dedans(x, z)) poteaux.push([x, z, k]); }
  const sx = a0[0] + ux * (lon * .85) - nx * 4, sz = a0[1] + uz * (lon * .85) - nz * 4, rot = -Math.atan2(uz, ux);
  const reserve = [...poteaux.map(([x, z]) => [x, z, 1.1]), [sx, sz, 2.6]];
  // Les boules de bronze, le long des arcs (instanciées).
  const boules = [];
  for (const r of [17, 23, 28.5, 34, 39.5]) for (const d of [-1.05, 1.05]) { const rr = r + d, n = Math.floor(rr * Math.PI * 2 / 2.4); for (let k = 0; k < n; k++) { const t = k / n * Math.PI * 2, x = Math.cos(t) * rr, z = Math.sin(t) * rr; if (dedans(x, z) && !surAllee(x, z) && !reserve.some(([u, v, e]) => Math.hypot(x - u, z - v) < e)) boules.push([x, z]); } }
  const B = new THREE.InstancedMesh(new THREE.SphereGeometry(.34, 14, 10), bronze, boules.length), m4 = new THREE.Matrix4();
  boules.forEach(([x, z], i) => { B.setMatrixAt(i, m4.makeTranslation(x, .47, z)); obst.push([cx + x, cz + z, 0, .6, .6]); });
  B.castShadow = true; B.receiveShadow = true; g.add(B);
  K.into(g, () => {
    for (let s = 1; s < lon - 1; s += 4) {
      const x = a0[0] + ux * (s + 2) + nx * .8, z = a0[1] + uz * (s + 2) + nz * .8; if (x * x + z * z < 22 * 22) continue;
      const w = K.boite(4.05, 2.8, .35, rougeMur, x, 1.4, z); w.rotation.y = rot; const c = K.boite(4.1, .18, .5, chaperon, x, 2.88, z); c.rotation.y = rot;
      obst.push([cx + x, cz + z, rot, 4.1, .5]);
    }
    for (const [x, z, k] of poteaux) { K.maillage(K.geo('totem', () => new THREE.CylinderGeometry(.28, .3, 1.7, 12)), totem(k), x, .95, z); obst.push([cx + x, cz + z, 0, .6, .6]); }
    // Groupe de bronze sur socle : un captif enchaîné, agenouillé, et un captif debout, les bras liés.
    K.boite(3.4, 1.1, 2, '#9b9488', sx, .65, sz).rotation.y = rot;
    const figure = (dx, accroupi) => { const c = Math.cos(rot), s = Math.sin(rot), x = sx + dx * c, z = sz - dx * s, y0 = 1.2; const h = accroupi ? .55 : 1;
      K.maillage(K.geo('corpsB', () => new THREE.CylinderGeometry(.24, .2, .9, 8)), bronze, x, y0 + (accroupi ? .75 : 1.25), z); K.maillage(K.geo('teteB', () => new THREE.SphereGeometry(.17, 10, 8)), bronze, x, y0 + (accroupi ? 1.35 : 1.88), z);
      for (const e of [-.14, .14]) { const j = K.maillage(K.geo('jambeB', () => new THREE.CylinderGeometry(.09, .07, .95, 6)), bronze, x + e * c, y0 + .45 * h, z - e * s); if (accroupi) j.rotation.x = 1.2; }
      for (const e of [-.3, .3]) { const b = K.maillage(K.geo('brasB', () => new THREE.CylinderGeometry(.07, .06, .8, 6)), bronze, x + e * c, y0 + (accroupi ? .9 : 1.4), z - e * s + .1); b.rotation.x = .5; } };
    figure(-.7, true); figure(.8, false);
    K.boite(1.6, .05, .05, '#2b2522', sx, 2.1, sz).rotation.y = rot; // la chaîne
    obst.push([cx + sx, cz + sz, rot, 3.5, 2.1]);
  });
  // Le massif (deux carrés croisés ≈ un disque de 9 m) et la stèle.
  obst.push([cx, cz, 0, 17, 17], [cx, cz, Math.PI / 4, 17, 17], [cx, cz + 10, 0, 1.7, .6]);
  ajouterPlace(CHACHA.contour, { roule: false });
  bake(g);
  return obst;
}

// ---------- Fort portugais : musée d'Histoire de Ouidah ----------
function fort() {
  const P = FORT.bastions, c = [P.reduce((s, p) => s + p[0], 0) / 4, P.reduce((s, p) => s + p[1], 0) / 4];
  const g = groupeLieu('Fort portugais de Ouidah', c[0], c[1], 0); g.userData.portee = 3500;
  const L = r => r.map(([x, z]) => [x - c[0], z - c[1]]), B = L(P), mur = K.mat('#a4553f', { rugosite: .95 }), chap = K.mat('#c88a6c', { rugosite: .9 });
  const obst = [], batis = [FORT.musee, FORT.chapelle, FORT.annexe].map(L);
  K.into(g, () => {
    // Pelouse dans l'enceinte, allée de sable de la porte au musée.
    const dedansMur = B.map(([x, z]) => { const d = Math.hypot(x, z); return [x * (d - 1) / d, z * (d - 1) / d]; });
    solPoly([dedansMur], K.tex('gazon', 1, 1), .12, 4);
    // Les quatre murs, une porte au milieu du mur nord-ouest (côté rue), les bastions ronds aux angles.
    B.forEach((a, i) => {
      const b = B[(i + 1) % 4], lon = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / lon, uz = (b[1] - a[1]) / lon, rot = -Math.atan2(uz, ux);
      const morceaux = i === 0 ? [[5.5, lon * .45 - 2.2], [lon * .45 + 2.2, lon - 5.5]] : [[5.5, lon - 5.5]];
      for (const [s0, s1] of morceaux) { const m = (s0 + s1) / 2, x = a[0] + ux * m, z = a[1] + uz * m; K.boite(s1 - s0, 4.2, .8, mur, x, 2.1, z).rotation.y = rot; K.boite(s1 - s0, .25, 1.05, chap, x, 4.32, z).rotation.y = rot; obst.push([c[0] + x, c[1] + z, rot, s1 - s0, .9]); }
      if (i === 0) { // le portail : deux piliers, un linteau, les vantaux ouverts
        const m = lon * .45, x = a[0] + ux * m, z = a[1] + uz * m;
        for (const s of [-1, 1]) { K.boite(.9, 4.8, 1.1, mur, x + ux * s * 2.4, 2.4, z + uz * s * 2.4).rotation.y = rot; const v = K.boite(2, 3.4, .12, '#5a3a26', x + ux * s * 1.9 - uz * 1, 1.7, z + uz * s * 1.9 + ux * 1); v.rotation.y = rot + s * 1.2; }
        K.boite(5.7, .7, 1.1, chap, x, 4.75, z).rotation.y = rot;
      }
    });
    for (const [x, z] of B) {
      K.cyl(6, 6.25, 5, 32, mur, x, 2.5, z); K.cyl(6.35, 6.35, .3, 32, chap, x, 5.15, z); K.cone(6.35, 1.3, 32, K.mat('#c98a76', { rugosite: .85 }), x, 5.95, z);
      for (const da of [-.5, .5]) { const a = Math.atan2(z, x) + da; K.boite(.5, .35, .3, '#2a1d17', x + Math.cos(a) * 6.2, 3, z + Math.sin(a) * 6.2).rotation.y = -a + Math.PI / 2; }
      obst.push([c[0] + x, c[1] + z, 0, 12, 12], [c[0] + x, c[1] + z, Math.PI / 4, 12, 12]);
    }
    // Le musée : deux étages blancs, volets bruns, soubassement noir, toit de tôle grise ; la chapelle et l'annexe aux tuiles.
    const [musee, chapelle, annexe] = batis;
    mursPoly(musee, 0, 7.6, murMusee(), 4.2, 7.6); solPoly([musee], K.mat('#8f969a', { rugosite: .6 }), 7.62, 4); mursPoly(musee, 7.6, 8, K.mat('#e9e7e1'), 4, .4);
    for (const [r, h] of [[chapelle, 5.6], [annexe, 3.8]]) {
      mursPoly(r, 0, h, K.mat('#f0eee8', { rugosite: .9 }), 4, h);
      const o = obb(r); const gt = new THREE.Group(); gt.position.set(o.cx, 0, o.cz); gt.rotation.y = -o.ang; K.racine.add(gt);
      K.into(gt, () => { const m = new THREE.Mesh(geoToit4(o.L, o.W, h * .45, .6), tuiles()); m.position.y = h; m.castShadow = true; gt.add(m); });
    }
    { // l'escalier double du musée, sur la façade tournée vers la cour (vers le centre du fort)
      let best = null; musee.forEach((a, i) => { const b = musee[(i + 1) % musee.length], lon = Math.hypot(b[0] - a[0], b[1] - a[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (lon > 12 && (!best || Math.hypot(...m) < Math.hypot(...best.m))) best = { a, b, m, lon }; });
      if (best) { const { a, b, m } = best, ux = (b[0] - a[0]) / best.lon, uz = (b[1] - a[1]) / best.lon; let nx = uz, nz = -ux; if (nx * -m[0] + nz * -m[1] < 0) { nx = -nx; nz = -nz; } const rot = -Math.atan2(uz, ux);
        for (const s of [-1, 1]) { const e = K.boite(5.4, .3, 1.6, '#ecebe6', m[0] + ux * s * 3 + nx * 1, 1.9, m[1] + uz * s * 3 + nz * 1); e.rotation.y = rot; e.rotation.z = s * .55; }
        K.boite(3, 3.7, 2.2, '#ecebe6', m[0] + nx * 1.1, 1.85, m[1] + nz * 1.1).rotation.y = rot;
        K.boite(3, .2, 2.4, '#1d1d1d', m[0] + nx * 1.1, .1, m[1] + nz * 1.1).rotation.y = rot;
        for (const s of [-1, 1]) { const cx = m[0] + ux * s * 6 + nx * 4.5, cz = m[1] + uz * s * 6 + nz * 4.5; const tube = K.cyl(.2, .28, 2.4, 10, '#1e1e1e', cx, .7, cz); tube.rotation.order = 'YXZ'; tube.rotation.x = Math.PI / 2 - .2; tube.rotation.y = rot + Math.PI / 2; K.cyl(.45, .45, .15, 10, '#3a2a1e', cx, .45, cz).rotation.z = Math.PI / 2; }
      }
    }
    // Arbres et cocotiers dans l'enceinte, à l'écart des bâtiments.
    const libre = (x, z) => !batis.some(r => dansAnneau(x, z, r) || r.some(([px, pz]) => Math.hypot(px - x, pz - z) < 7));
    let i = 0; for (let k = 0; k < 4; k++) { const a = B[k], b = B[(k + 1) % 4]; for (const t of [.22, .5, .78]) { const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d = Math.hypot(...p), x = p[0] * (d - 9) / d, z = p[1] * (d - 9) / d; if (!libre(x, z) || (k === 0 && Math.abs(t - .45) < .1)) continue; (i++ % 3 === 2 ? palmier(x, z, 10, i) : arbre(x, z, 12, 5.5, i)); obst.push([c[0] + x, c[1] + z, 0, 1, 1]); } }
  });
  for (const r of batis) obst.push(...obsAnneau(r.map(([x, z]) => [x + c[0], z + c[1]]), .6));
  bake(g);
  return obst;
}

// ---------- Villa Ajavon : le musée de la Fondation Zinsou ----------
function villaAjavon() {
  const r0 = ZINSOU.emprise, c = [r0.reduce((s, p) => s + p[0], 0) / r0.length, r0.reduce((s, p) => s + p[1], 0) / r0.length];
  const g = groupeLieu('Villa Ajavon (Fondation Zinsou)', c[0], c[1], 0); g.userData.portee = 3000;
  const r = r0.map(([x, z]) => [x - c[0], z - c[1]]), rue = [ZINSOU.rue[0] - c[0], ZINSOU.rue[1] - c[1]], H = 8.4;
  K.into(g, () => {
    mursPoly(r, 0, H, murVilla(), 3.6, H); mursPoly(r, H, H + .9, balustrade(), 1.6, .9); solPoly([r], K.mat('#b8ae9c'), H + .5, 4);
    mursPoly(r, H - .15, H + .1, K.mat('#d9caa9'), 4, .25);
    // Les deux pavillons d'angle côté rue, coiffés de tuiles rouges.
    const coins = r.map((p, i) => [i, Math.hypot(p[0] - rue[0], p[1] - rue[1])]).sort((a, b) => a[1] - b[1]);
    const pris = []; for (const [i] of coins) { if (pris.length === 2) break; if (pris.every(j => Math.hypot(r[i][0] - r[j][0], r[i][1] - r[j][1]) > 10)) pris.push(i); }
    for (const i of pris) { const [x, z] = r[i], d = Math.hypot(x, z), px = x * (d - 2.2) / d, pz = z * (d - 2.2) / d;
      K.boite(4.8, H + 2.3, 4.8, K.mat('#e9dcc2', { rugosite: .9 }), px, (H + 2.3) / 2, pz); K.boite(5.1, .3, 5.1, '#d8c9ab', px, H + 2.35, pz);
      toit4(4.8, 4.8, 2.6, tuiles(), px, H + 2.5, pz, 0, .45); }
    // L'enseigne rouge « LE MUSÉE », sur le mur le plus proche de la rue.
    let best = null; r.forEach((a, i) => { const b = r[(i + 1) % r.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > 6 && (!best || Math.hypot(m[0] - rue[0], m[1] - rue[1]) < best.d)) best = { a, b, m, d: Math.hypot(m[0] - rue[0], m[1] - rue[1]) }; });
    if (best) { const { a, b, m } = best, ux = b[0] - a[0], uz = b[1] - a[1], l = Math.hypot(ux, uz); let nx = uz / l, nz = -ux / l; if (nx * (rue[0] - m[0]) + nz * (rue[1] - m[1]) < 0) { nx = -nx; nz = -nz; }
      enseigne('LE MUSÉE\nFondation Zinsou', 2.6, 1, m[0] + nx * .06, 3.3, m[1] + nz * .06, Math.atan2(nx, nz), { fond: '#c4302b', encre: '#ffffff', gras: 700 }); }
  });
  const obst = obsAnneau(r0, .6);
  bake(g);
  return obst;
}

// ---------- La Route des Esclaves : les mémoriaux ----------
// Photos regardées : Ji-Elle (2017) et Yelouassi (2019) pour le mémorial Zomachi (murs jaunes et bleus sculptés de navires
// et de captifs, grande pancarte, les sept piliers aux portraits des abolitionnistes) ; Rachad sanoussi (2019) pour la
// stèle de la case de Zomaï ; Eric Emeraux (2022) et Ji-Elle pour la fosse commune de Zoungbodji (stèle de mosaïque rouge
// et grise, socle noir, statues de captifs aux mains liées, grille de silhouettes noires) ; Ji-Elle pour l'Arbre du Retour
// (banc rond, statue « Ouidah 92 » sur socle blanc).
const murZomachi = () => toile('murzomachi', 512, 128, (c, w, h) => {
  c.fillStyle = '#e6c34c'; c.fillRect(0, 0, w, h); c.fillStyle = '#2f6fb0'; c.fillRect(0, 0, w, h * .14); c.fillRect(0, h * .82, w, h * .18);
  c.fillStyle = '#7a5030'; c.fillRect(w * .04, h * .3, w * .92, h * .42); c.fillStyle = '#5b3a22';
  for (let k = 0; k < 7; k++) { const x = w * (.08 + k * .13); c.fillRect(x, h * .44, w * .016, h * .2); c.beginPath(); c.arc(x + w * .008, h * .4, h * .045, 0, Math.PI * 2); c.fill(); } // captifs
  c.beginPath(); c.moveTo(w * .62, h * .62); c.lineTo(w * .8, h * .62); c.lineTo(w * .76, h * .7); c.lineTo(w * .66, h * .7); c.fill(); c.fillRect(w * .7, h * .34, w * .008, h * .28); c.fillRect(w * .74, h * .38, w * .006, h * .24); // le navire
  c.fillStyle = '#f0e6c8'; c.beginPath(); c.moveTo(w * .705, h * .36); c.lineTo(w * .705, h * .56); c.lineTo(w * .76, h * .5); c.fill();
}, { repete: true });
const piliers = (i) => toile(`pilier${i % 3}`, 128, 320, (c, w, h) => {
  c.fillStyle = '#8c8275'; c.fillRect(0, 0, w, h); for (let k = 0; k < 900; k++) { c.fillStyle = ['#d8d2c4', '#bfb6a6', '#ece8dd', '#a69c8c'][k & 3]; c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, 3, 2, Math.random() * 3, 0, Math.PI * 2); c.fill(); }
  for (const [x, y] of [[.5, .2], [.32, .52], [.66, .78]]) { c.fillStyle = '#b48a5e'; c.beginPath(); c.ellipse(w * x, h * y, w * .2, h * .1, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#6e4a2c'; c.beginPath(); c.ellipse(w * x, h * y - h * .02, w * .09, h * .045, 0, 0, Math.PI * 2); c.fill(); }
  c.strokeStyle = '#5a4a38'; c.lineWidth = 6; c.strokeRect(0, 0, w, h); void i;
});
const mosaique = () => toile('mosaique', 128, 512, (c, w, h) => {
  c.fillStyle = '#e9e4da'; c.fillRect(0, 0, w, h); const t = 8;
  for (let y = 0; y < h; y += t) for (let x = 0; x < w; x += t) { const v = Math.sin(x * .05 + y * .021) + Math.sin(y * .043 - x * .02); c.fillStyle = v > .9 ? '#b8262a' : v > .2 ? '#6d6e72' : v > -.6 ? '#e9e4da' : '#3b3c40'; c.fillRect(x + 1, y + 1, t - 2, t - 2); }
  c.strokeStyle = '#2a2a2a'; c.lineWidth = 6; c.strokeRect(0, 0, w, h);
});
const silhouettes = () => toile('silhouettes', 512, 128, (c, w, h) => {
  c.fillStyle = '#121212'; c.fillRect(0, 0, w, h * .1); c.fillRect(0, h * .9, w, h * .1);
  for (let k = 0; k < 8; k++) { const x = w * (k + .5) / 8; c.beginPath(); c.arc(x, h * .26, h * .09, 0, Math.PI * 2); c.fill(); c.fillRect(x - w * .022, h * .34, w * .044, h * .34); c.fillRect(x - w * .06, h * .4, w * .12, h * .05); c.fillRect(x - w * .028, h * .66, w * .02, h * .26); c.fillRect(x + w * .008, h * .66, w * .02, h * .26); }
}, { alpha: true, face2: true });
const plaqueMarbre = () => toile('plaquemarbre', 128, 192, (c, w, h) => { c.fillStyle = '#c9512f'; c.fillRect(0, 0, w, h); c.fillStyle = '#f1eee8'; c.fillRect(w * .12, h * .08, w * .76, h * .84); c.fillStyle = '#5b5b5b'; for (let y = h * .16; y < h * .86; y += h * .05) c.fillRect(w * .2, y, w * (.4 + Math.random() * .2), 2); });
/** Une statue de captif (bronze verdi, pagne bleu, mains liées dans le dos) ou la statue sombre « Ouidah 92 » au pagne de raphia. */
function statue(x, z, rot, { socle = 1, ouidah92 = false } = {}) {
  const peau = K.mat(ouidah92 ? '#2b2724' : '#2f4a44', { rugosite: .5, metal: .3 }), pagne = K.mat(ouidah92 ? '#b08a4a' : '#2d5fb3', { rugosite: .8 });
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; K.racine.add(g);
  K.into(g, () => {
    K.boite(.9, socle, .9, '#f0eee8', 0, socle / 2, 0); if (ouidah92) plan(.62, .7, plaqueMarbre(), 0, socle * .55, .46);
    const y = socle;
    for (const e of [-.13, .13]) K.cyl(.09, .07, .85, 7, peau, e, y + .43, 0);
    K.cyl(.26, .24, .35, 10, pagne, 0, y + .95, 0);
    K.cyl(.23, .27, .7, 10, peau, 0, y + 1.45, 0); K.sphere(.16, peau, 0, y + 1.95, 0);
    for (const e of [-.3, .3]) { const b = K.cyl(.07, .06, .65, 6, peau, e, y + 1.42, -.12); b.rotation.x = .5; }
  });
  return g;
}
/** Un arbre de mémoire : grand arbre, banc rond, statue « Ouidah 92 ». */
function arbreMemoire(x, z, rot, rayonBanc = 3.4) {
  K.cyl(.9, 1.2, 6, 10, '#5d4a3b', x, 3, z);
  for (const [dx, dz, r, y] of [[0, 0, 6.5, 10.5], [3.5, 1.5, 4.5, 9.4], [-3.2, -1.8, 4.6, 9.6], [1, -3.6, 4.2, 10], [-1.4, 3.4, 4.3, 9.8]]) { const b = K.maillage(K.geo(`ico${r}`, () => new THREE.IcosahedronGeometry(r, 1)), ARBRES[Math.abs(Math.round(dx * 2 + dz)) % ARBRES.length], x + dx, y, z + dz); b.scale.y = .6; }
  const banc = new THREE.Mesh(new THREE.RingGeometry(rayonBanc - .5, rayonBanc, 40, 1, .5, Math.PI * 2 - 1).rotateX(-Math.PI / 2), K.mat('#d9d5cc')); banc.position.set(x, .45, z); banc.rotation.y = rot - Math.PI / 2; banc.castShadow = true; K.racine.add(banc);
  const dossier = K.maillage(new THREE.CylinderGeometry(rayonBanc + .05, rayonBanc + .05, .9, 40, 1, true, .5 + Math.PI / 2, Math.PI * 2 - 1), K.mat('#cfcac0', { face2: true }), x, .45, z); dossier.rotation.y = rot - Math.PI / 2;
  statue(x + Math.sin(rot) * (rayonBanc + 1.4), z + Math.cos(rot) * (rayonBanc + 1.4), rot, { socle: 1.6, ouidah92: true });
}
/** Les obstacles du banc rond d'un arbre de mémoire (sauf l'ouverture, côté statue). */
function obstBanc(x, z, rot, r, obst) {
  const ouverture = Math.atan2(Math.cos(rot), Math.sin(rot));
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, d = Math.abs(Math.atan2(Math.sin(a - ouverture), Math.cos(a - ouverture))); if (d < .55) continue; obst.push([x + Math.cos(a) * (r - .25), z + Math.sin(a) * (r - .25), -(a + Math.PI / 2), 1.5, .6]); }
}
function routeEsclaves() {
  const obst = [];
  // L'Arbre de l'Oubli, au bord de la Route de l'Esclave, la statue tournée vers la route.
  { const { p, rue } = ROUTE.oubli, g = groupeLieu("Arbre de l'Oubli", p[0], p[1], 0); g.userData.portee = 2500; const rot = Math.atan2(rue[0] - p[0], rue[1] - p[1]);
    K.into(g, () => { solPoly([Array.from({ length: 32 }, (_, k) => [Math.cos(k / 32 * Math.PI * 2) * 7.5, Math.sin(k / 32 * Math.PI * 2) * 7.5])], K.tex('paves', 2, 2, '#d8cfbf'), .08, 3); arbreMemoire(0, 0, rot); enseigne("ARBRE DE L'OUBLI", 2.4, .6, Math.sin(rot) * 6.2, 1.7, Math.cos(rot) * 6.2, rot, { fond: '#f3efe4', cadre: '#8f3b29' }); K.cyl(.05, .05, 1.4, 5, '#555', Math.sin(rot) * 6.2, .7, Math.cos(rot) * 6.2); });
    obst.push([p[0], p[1], 0, 2.4, 2.4], [p[0] + Math.sin(rot) * 4.8, p[1] + Math.cos(rot) * 4.8, 0, 1, 1]); obstBanc(p[0], p[1], rot, 3.4, obst); bake(g); }
  // L'Arbre du Retour, au carrefour de Zoungbodji.
  { const { p, rue } = ROUTE.retour, g = groupeLieu('Arbre du Retour', p[0], p[1], 0); g.userData.portee = 2500; const rot = Math.atan2(rue[0] - p[0], rue[1] - p[1]);
    K.into(g, () => arbreMemoire(0, 0, rot, 3.1)); obst.push([p[0], p[1], 0, 2.4, 2.4], [p[0] + Math.sin(rot) * 4.5, p[1] + Math.cos(rot) * 4.5, 0, 1, 1]); obstBanc(p[0], p[1], rot, 3.1, obst); bake(g); }
  // Le mémorial Zomachi : enclos jaune et bleu face à la rue (à l'est), pancarte, les sept piliers, la stèle de la case de Zomaï.
  { const { p, rue, angleRue, zomai } = ROUTE.zomachi, R = { o: p, ang: angleRue }, g = groupeLieu('Mémorial Zomachi', p[0], p[1], angleRue); g.userData.portee = 2500;
    const vr = local(g, ...rue), face = vr[1] > 0 ? 1 : -1, L2 = 12, P2 = 10; // x local le long de la rue, z local vers la rue si face = 1
    K.into(g, () => {
      const mur = murZomachi(), pil = K.mat('#2f6fb0'), feu = K.mat('#e2662a', { emissif: '#4a1a05' });
      const pans = [[-L2, P2 * face, 4, P2 * face], [8, P2 * face, L2, P2 * face], [-L2, -P2 * face, L2, -P2 * face], [-L2, -P2, -L2, P2], [L2, -P2, L2, P2]]; // le portail : entre x = 4 et 8
      pans.forEach(([x0, z0, x1, z1], i) => { const l = Math.hypot(x1 - x0, z1 - z0), r = -Math.atan2(z1 - z0, x1 - x0); if (l < .5) return; const m = K.maillage(K.geo(`mz${l.toFixed(1)}`, () => new THREE.BoxGeometry(l, 1.9, .3)), mur, (x0 + x1) / 2, .95, (z0 + z1) / 2); m.rotation.y = r; obst.push(obs(R, (x0 + x1) / 2, (z0 + z1) / 2, Math.abs(r) > .1 ? .5 : l, Math.abs(r) > .1 ? l : .5)); void i; });
      for (let x = -L2; x <= L2 + .1; x += 4) for (const zz of [P2, -P2]) { K.boite(.45, 2.3, .45, pil, x, 1.15, zz); K.cone(.22, .5, 6, feu, x, 2.55, zz); }
      enseigne('MÉMORIAL ZOMACHI\nCITÉ DE LA DIASPORA\n(ESCALE DU RETOUR)\nPLACE DU DEVOIR DE MÉMOIRE', 3.2, 1.9, -3, 2.65, P2 * face + .2 * face, face > 0 ? 0 : Math.PI, { fond: '#f6f4ee', encre: '#a3262a', cadre: '#2f6fb0', gras: 800 });
      K.boite(3.4, .9, .2, '#e6c34c', -3, 1.35, P2 * face);
      solPoly([[[-L2, -P2], [L2, -P2], [L2, P2], [-L2, P2]]], K.tex('sable', 3, 3), .06, 4);
      for (let k = 0; k < 7; k++) { const a = Math.PI * (.15 + k * .7 / 6), x = Math.cos(a) * 7 * -1, z = -face * (Math.sin(a) * 5.5 - 1.5); const pl = K.maillage(K.geo('pilierZ', () => new THREE.BoxGeometry(1.2, 3.2, .35)), piliers(k), x, 1.6, z); pl.rotation.y = Math.atan2(-x, -z) + (face > 0 ? 0 : 0); obst.push(obs(R, x, z, 1.3, 1.3)); }
      for (const [x, z, h] of [[-9, -7 * face, 11], [8.5, -6 * face, 12], [9, 4 * face, 10], [-8.5, 3 * face, 9.5]]) { palmier(x, z, h, Math.round(x)); obst.push(obs(R, x, z, .8, .8)); }
      const [zx, zz] = local(g, ...zomai); plan(.9, 1.5, plaqueMarbre(), zx, .95, zz, face > 0 ? 0 : Math.PI); K.boite(1.2, .25, .6, '#d06a45', zx, .12, zz); obst.push(obs(R, zx, zz, 1, .6));
    });
    bake(g); }
  // La fosse commune de Zoungbodji : enclos blanc, stèle de mosaïque, statues de captifs, grille de silhouettes côté rue (nord).
  { const { p, stele, rueNord } = ROUTE.zoungbodji, g = groupeLieu('Mémorial de Zoungbodji', p[0], p[1], 0); g.userData.portee = 2500;
    const W2 = 12, D2 = 15; void rueNord;
    K.into(g, () => {
      const blanc = K.mat('#efedea', { rugosite: .95 });
      for (const [x, z, l, r] of [[0, D2, W2 * 2, 0], [-W2, 0, D2 * 2, Math.PI / 2], [W2, 0, D2 * 2, Math.PI / 2]]) { K.boite(l, 2.6, .35, blanc, x, 1.3, z).rotation.y = r; obst.push([p[0] + x, p[1] + z, r, l, .5]); }
      for (const s of [-1, 1]) { K.boite(W2 - 2.5, 2.6, .35, blanc, s * (W2 + 2.5) / 2, 1.3, -D2); obst.push([p[0] + s * (W2 + 2.5) / 2, p[1] - D2, 0, W2 - 2.5, .5]); }
      solPoly([[[-W2, -D2], [W2, -D2], [W2, D2], [-W2, D2]]], K.tex('beton', 4, 4, '#d9d4c9'), .08, 4);
      const [sx, sz] = local(g, ...stele);
      for (let k = 0; k < 3; k++) K.boite(5 - k * 1.1, .3, 3 - k * .6, '#1d1d1f', sx, .15 + k * .3, sz);
      K.boite(1.9, 8, .5, '#1d1d1f', sx, 4.9, sz); for (const f of [1, -1]) plan(1.6, 7.6, mosaique(), sx, 4.95, sz + f * .26, f > 0 ? 0 : Math.PI);
      obst.push([p[0] + sx, p[1] + sz, 0, 5, 3]);
      plan(6, 1.6, silhouettes(), sx, .8, sz - 4); obst.push([p[0] + sx, p[1] + sz - 4, 0, 6, .3]); // la grille de silhouettes devant la stèle
      for (const [x, z, r] of [[-W2 + 1.2, -6, Math.PI / 2], [-W2 + 1.2, 2, Math.PI / 2], [-W2 + 1.2, 9, Math.PI / 2], [W2 - 1.2, -6, -Math.PI / 2], [W2 - 1.2, 2, -Math.PI / 2], [W2 - 1.2, 9, -Math.PI / 2]]) { statue(x, z, r, { socle: .5 }); obst.push([p[0] + x, p[1] + z, 0, 1, 1]); }
      for (const [x, z] of [[-14, -18], [15, 17]]) palmier(x, z, 11, x);
    });
    bake(g); }
  return obst;
}

// ---------- Forêt sacrée de Kpassè ----------
// Photos regardées : Yelouassi (2019) et Ivannovna (2019) : maison d'entrée blanche au soubassement noir, deux léopards
// peints sous le pignon, « FORÊT SACRÉE DE KPASSÈ OUIDAH » ; dedans, les grands arbres, le sentier et les sculptures vodun.
const fronton = () => toile('frontonkpasse', 512, 256, (c, w, h) => {
  c.fillStyle = '#9fc7d6'; c.fillRect(0, 0, w, h); c.fillStyle = '#6b8f3a'; c.beginPath(); c.arc(w / 2, h * .25, h * .3, 0, Math.PI * 2); c.fill(); c.fillStyle = '#7a4f2e'; c.fillRect(w * .48, h * .3, w * .04, h * .5);
  for (const s of [-1, 1]) { const x = w / 2 + s * w * .2; c.fillStyle = '#e0b23a'; c.beginPath(); c.ellipse(x, h * .62, w * .13, h * .13, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(x + s * w * .12, h * .5, h * .08, 0, Math.PI * 2); c.fill(); c.fillStyle = '#3a2a14'; for (let k = 0; k < 14; k++) { c.beginPath(); c.arc(x + (Math.random() - .5) * w * .2, h * (.55 + Math.random() * .15), 3, 0, Math.PI * 2); c.fill(); } }
});
function kpasse() {
  const { contour, boucle, entree, iroko } = KPASSE, cx = contour.reduce((s, p) => s + p[0], 0) / contour.length, cz = contour.reduce((s, p) => s + p[1], 0) / contour.length;
  const g = groupeLieu('Forêt sacrée de Kpassè', cx, cz, 0); g.userData.portee = 3500;
  const L = ([x, z]) => [x - cx, z - cz], C = contour.map(L), B = boucle.map(L), E = L(entree), I = L(iroko);
  const versDedans = (() => { const d = Math.hypot(-E[0], -E[1]); return [-E[0] / d, -E[1] / d]; })();
  const porte = [E[0] + versDedans[0] * 9, E[1] + versDedans[1] * 9], rot = Math.atan2(-versDedans[0], -versDedans[1]); // la façade regarde le carrefour
  const allee = [porte, [porte[0] + versDedans[0] * 12, porte[1] + versDedans[1] * 12], B[9]];
  const obst = [];
  const prochesChemin = (x, z, m) => [allee, B].some(l => l.some((a, i) => { const b = l[i + 1]; if (!b) return false; const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < m; }));
  K.into(g, () => {
    solPoly([C], K.tex('gazon', 1, 1, '#7d8f55'), .05, 4); // sous-bois
    ruban(allee, -1.3, 1.3, K.tex('sable', 1, 1), .09, 3); ruban(B, -1.2, 1.2, K.tex('sable', 1, 1), .09, 3);
    // La maison d'entrée : murs blancs, soubassement noir, pignon aux léopards, portes noires ouvertes.
    const me = new THREE.Group(); me.position.set(porte[0], 0, porte[1]); me.rotation.y = rot; K.racine.add(me);
    K.into(me, () => {
      K.boite(8, 4.2, 6, K.mat('#f1efe9', { rugosite: .95 }), 0, 2.1, 0); K.boite(8.05, 1.2, 6.05, K.mat('#1b1b1b'), 0, .6, 0);
      pignon(8, 2.4, fronton(), 0, 4.2, 3.01); pignon(8, 2.4, K.mat('#f1efe9'), 0, 4.2, -3.01, Math.PI);
      toit2(8, 6, 2.4, K.tex('tole', 3, 2, '#8d8a84'), 0, 4.2, 0, .4);
      enseigne("FORÊT SACRÉE DE KPASSÈ OUIDAH\nKPASSÈ'S SACRED FOREST", 6.4, .9, 0, 3.6, 3.03, 0, { fond: '#f1efe9', encre: '#1d1d1d' });
      plan(2.8, 2.7, K.mat('#2a2a2a'), 0, 1.35, 3.02); plan(2.8, 2.7, K.mat('#2a2a2a'), 0, 1.35, -3.02, Math.PI); // on traverse la maison pour entrer dans la forêt
      for (const s of [-1, 1]) { const v = K.boite(1.4, 2.6, .08, '#111', s * 2.1, 1.3, 3.5); v.rotation.y = s * .9; }
    });
    // L'iroko du roi Kpassè, ceint d'un pagne blanc, et les sculptures vodun le long du sentier.
    K.cyl(1.5, 2.1, 14, 12, '#5a4636', I[0], 7, I[1]); K.cyl(1.75, 1.85, 1.4, 12, K.mat('#f4f2ec'), I[0], 2.4, I[1]); K.cyl(1.76, 1.8, .25, 12, K.mat('#c23a2e'), I[0], 3.2, I[1]);
    for (const [dx, dz, r, y] of [[0, 0, 9, 21], [6, 3, 6, 18], [-6, -3, 6, 18.5], [2, -7, 5.5, 19], [-3, 6.5, 5.5, 18.8]]) { const b = K.maillage(K.geo(`icoK${r}`, () => new THREE.IcosahedronGeometry(r, 1)), ARBRES[Math.abs(Math.round(dx + dz)) % ARBRES.length], I[0] + dx, y, I[1] + dz); b.scale.y = .55; }
    obst.push([iroko[0], iroko[1], 0, 3.8, 3.8], [iroko[0], iroko[1], Math.PI / 4, 3.8, 3.8]);
    const sculptures = [];
    B.forEach((a, i) => { if (i % 3 || i === 9) return; const b = B[(i + 1) % B.length], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; sculptures.push([a[0] - dz / l * 2.6, a[1] + dx / l * 2.6, Math.atan2(dz / l, -dx / l), sculptures.length]); });
    for (const [x, z, r, k] of sculptures) {
      K.boite(1.2, .5, 1.2, '#cfc8b8', x, .25, z);
      const t = k % 4;
      if (t === 0) { const s = K.maillage(K.geo('serpentK', () => new THREE.TorusGeometry(.65, .16, 8, 24)), K.mat(['#c8382f', '#e9b62c', '#2f8a4a'][k % 3]), x, 1.2, z); s.rotation.x = Math.PI / 2; K.maillage(K.geo('serpentK2', () => new THREE.TorusGeometry(.45, .14, 8, 20)), K.mat('#2b6db2'), x, 1.45, z).rotation.x = Math.PI / 2; K.sphere(.2, '#2b6db2', x, 1.8, z); } // Dan, le serpent arc-en-ciel
      else { const peau = K.mat(['#6b4a33', '#3f6f9f', '#a8432f', '#2f2f2f'][t]), tissu = K.mat(['#f2efe6', '#e9b62c', '#f2efe6', '#c8382f'][t]);
        const f = new THREE.Group(); f.position.set(x, .5, z); f.rotation.y = r; K.racine.add(f);
        K.into(f, () => { K.cyl(.3, .35, 1.2, 8, tissu, 0, .6, 0); K.cyl(.28, .3, .9, 8, peau, 0, 1.6, 0); K.sphere(.26, peau, 0, 2.3, 0); for (const e of [-.42, .42]) { const b = K.cyl(.08, .07, .9, 6, peau, e, 1.75, .15); b.rotation.z = e > 0 ? -.7 : .7; } if (t === 2) K.boite(.08, 1.6, .08, '#3a3a3a', .6, 1.5, .2); if (t === 3) K.cone(.3, .5, 8, K.mat('#e9b62c'), 0, 2.65, 0); }); }
      obst.push([cx + x, cz + z, 0, 1.3, 1.3]);
    }
  });
  // Les arbres de la forêt (instanciés) : partout sauf sur le sentier, l'entrée et autour de l'iroko.
  // Un arbre de forêt : tronc court, houppier large et bas, un buisson de sous-bois à côté (sinon : une forêt de poteaux).
  const geo = (() => { const parts = [new THREE.CylinderGeometry(.35, .55, 6, 6).translate(0, 3, 0), new THREE.IcosahedronGeometry(4.6, 0).scale(1, .7, 1).translate(0, 7.6, 0), new THREE.IcosahedronGeometry(3.3, 0).translate(2, 9, -1), new THREE.IcosahedronGeometry(3, 0).translate(-1.9, 8.8, 1.3), new THREE.IcosahedronGeometry(1.9, 0).scale(1, .7, 1).translate(2.6, 1.1, 1.8), new THREE.IcosahedronGeometry(1.5, 0).scale(1, .8, 1).translate(-2.4, 1, -1.6)].map(x => x.toNonIndexed());
    const teintes = [[.45, .36, .28], [1, 1, 1], [1, 1, 1], [1, 1, 1], [.72, .82, .62], [.68, .8, .6]];
    const n = parts.reduce((s, p) => s + p.attributes.position.count, 0), pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    parts.forEach((p, k) => { pos.set(p.attributes.position.array, o * 3); for (let i = 0; i < p.attributes.position.count; i++) col.set(teintes[k], (o + i) * 3); o += p.attributes.position.count; });
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g2.setAttribute('color', new THREE.BufferAttribute(col, 3)); g2.computeVertexNormals(); return g2; })();
  const pts = []; for (let x = -160; x < 160; x += 6.5) for (let z = -160; z < 160; z += 6.5) { const px = x + (Math.sin(x * 12.9 + z * 78.2) * 43758 % 1) * 5, pz = z + (Math.sin(x * 39.3 + z * 11.1) * 24634 % 1) * 5; if (!dansAnneau(px, pz, C) || prochesChemin(px, pz, 3.2) || Math.hypot(px - I[0], pz - I[1]) < 11 || Math.hypot(px - porte[0], pz - porte[1]) < 9) continue; pts.push([px, pz]); }
  const verts = ['#3f6b3c', '#4a7a3f', '#557f45', '#3a5f35', '#2f5530'].map(h => new THREE.Color(h));
  const A = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), pts.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  pts.forEach(([x, z], i) => { const s = .8 + ((i * 7919) % 100) / 100 * .6; m4.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(Y, i * 2.39), new THREE.Vector3(s, s * (.9 + (i % 5) * .06), s)); A.setMatrixAt(i, m4); A.setColorAt(i, verts[i % verts.length]); obst.push([cx + x, cz + z, 0, .9 * s, .9 * s]); });
  A.castShadow = true; A.receiveShadow = true; g.add(A);
  for (const s2 of [-1, 1]) { const lx = s2 * 2.75; obst.push([cx + porte[0] + lx * Math.cos(rot), cz + porte[1] - lx * Math.sin(rot), rot, 2.6, 6.2]); } // les deux moitiés : on passe au milieu
  bake(g);
  return obst;
}

/** Construit le centre de Ouidah (main.js, après la ville). */
export function construireOuidahVille() {
  const obst = [];
  for (const f of [basilique, temple, chacha, fort, villaAjavon, routeEsclaves, kpasse]) { try { obst.push(...f()); } catch (e) { console.warn('Ouidah :', f.name, e); } }
  poserObstacles('ouidah-centre', obst);
  if (import.meta.env.DEV) window.__ouidah = { obst, scene: lieux[0]?.parent }; // pour les tests (banc d'essai)
}

// Les tuiles de la nef (motif répétable de lieux.js, pour les boîtes : une tuile tous les ~2,4 m).
K.motif('tuilesBas', (c, t) => {
  c.fillStyle = '#b5603a'; c.fillRect(0, 0, t, t);
  for (let r = 0; r < 8; r++) for (let k = -1; k < 9; k++) { c.fillStyle = ['#c06a40', '#a9552f', '#b9643b', '#9f4e2c'][(r * 3 + k) & 3]; c.beginPath(); c.ellipse(k * t / 8 + (r % 2) * t / 16 + t / 16, r * t / 8 + t / 10, t / 17, t / 11, 0, 0, Math.PI); c.fill(); }
});
