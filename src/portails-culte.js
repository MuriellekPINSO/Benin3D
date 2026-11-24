// ---------- Les portails de la cathédrale et de la mosquée de Zongo ----------
// « L'entrée de la cathédrale, au moins on doit voir la porte : c'est un mur. Expert 3D, pour la mosquée aussi » (Murielle,
// 23/11). La cathédrale est un modèle Tripo : sa porte, au pied du clocher, n'était qu'une arche peinte et floue dans la
// texture rayée. La mosquée n'avait qu'un rectangle vert cerclé d'or collé au mur. Les deux ont maintenant un vrai portail
// en volume, posé sur la façade derrière la porte où l'on entre (culte.js) :
//  - la cathédrale Notre-Dame de Miséricorde : trois marches, deux colonnes de pierre blanche et leurs chapiteaux, l'arc en
//    plein cintre aux claveaux alternés rouges et blancs comme ses murs, le tympan à la croix, deux vantaux de chêne cloutés
//    aux pentures de fer et anneaux, un petit fronton rayé et sa croix, deux lanternes ;
//  - la mosquée : un grand cadre blanc en saillie, l'arc brisé souligné d'or, un bandeau de carreaux bleus, deux vantaux
//    verts aux étoiles dorées, deux marches de marbre, deux lanternes de laiton.
import * as THREE from 'three';
import { INTERIEURS } from './interieurs.js';
import { K, bake, groupeLieu } from './lieux.js';
import { poserObstacles } from './rue.js';

const mats = new Map();
function toile(cle, w, h, dessin, o = {}) {
  if (mats.has(cle)) return mats.get(cle);
  const c = document.createElement('canvas'); c.width = w; c.height = h; dessin(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (o.repete) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...o.repete); }
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: o.rugosite ?? .7, metalness: o.metal ?? 0, side: o.face2 ? THREE.DoubleSide : THREE.FrontSide });
  mats.set(cle, m); return m;
}
/** Un groupe dont l'origine est sur la façade, derrière la porte (`recul` mètres plus loin), z local vers le dehors. */
function surFacade(nom, P, recul) {
  const d = P.dehors, ox = P.porte[0] - Math.sin(d) * recul, oz = P.porte[1] - Math.cos(d) * recul, g = groupeLieu(nom, ox, oz, -d);
  const ob = (x, z, w, p, obst) => obst.push([ox + x * Math.cos(d) + z * Math.sin(d), oz - x * Math.sin(d) + z * Math.cos(d), d, w, p]);
  return { g, ob };
}
/** Une forme plate (Shape) extrudée de `ep`, debout, face vers +z, posée en (x, y, z). */
function plaque(forme, ep, mat, x, y, z) {
  const geo = new THREE.ExtrudeGeometry(forme, { depth: ep, bevelEnabled: false, curveSegments: 24 });
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; K.racine.add(m); return m;
}
const vantailChene = () => toile('vantailChene', 256, 512, (c, w, h) => {
  c.fillStyle = '#4a2a14'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 9; i++) { c.fillStyle = i % 2 ? '#56321a' : '#4e2d16'; c.fillRect(i * w / 9, 0, w / 9 - 2, h); } // les planches
  for (const [x0, y0] of [[26, 40], [134, 40], [26, 200], [134, 200], [26, 360], [134, 360]]) { c.fillStyle = '#3a2010'; c.fillRect(x0, y0, 96, 130); c.fillStyle = '#5e3820'; c.fillRect(x0 + 8, y0 + 8, 80, 114); c.strokeStyle = '#2a170a'; c.lineWidth = 3; c.strokeRect(x0 + 8, y0 + 8, 80, 114); } // les panneaux
  c.fillStyle = '#1b1b1b'; for (const y of [24, 186, 346, 492]) c.fillRect(0, y, w, 12); // les pentures de fer
  c.fillStyle = '#2b2b2b'; for (const y of [30, 192, 352, 498]) for (let x = 12; x < w; x += 28) { c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); } // les clous
});
const vantailVert = () => toile('vantailVert', 256, 512, (c, w, h) => {
  c.fillStyle = '#17513b'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#d9b44a'; c.lineWidth = 3;
  const etoile = (x, y, r) => { c.beginPath(); for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, rr = k % 2 ? r * .55 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.stroke(); };
  for (let y = 48; y < h; y += 96) for (let x = 64; x < w; x += 128) etoile(x + (Math.floor(y / 96) % 2) * 0, y, 34);
  c.strokeRect(10, 10, w - 20, h - 20); c.strokeRect(22, 22, w - 44, h - 44);
  c.fillStyle = '#d9b44a'; for (let y = 30; y < h; y += 56) { c.beginPath(); c.arc(w - 14, y, 4, 0, Math.PI * 2); c.fill(); }
});
const carreauxBleus = () => toile('carreauxBleus', 256, 64, (c, w, h) => {
  c.fillStyle = '#2f5fa8'; c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) { c.fillStyle = '#f4f2ec'; c.beginPath(); c.moveTo(x + 16, 6); c.lineTo(x + 28, 32); c.lineTo(x + 16, 58); c.lineTo(x + 4, 32); c.closePath(); c.fill(); c.fillStyle = '#e9b62c'; c.beginPath(); c.arc(x + 16, 32, 5, 0, Math.PI * 2); c.fill(); }
}, { repete: [3, 1] });
function lanterne(x, y, z, laiton) {
  K.boite(.08, .08, .35, laiton, x, y, z + .17); K.boite(.26, .36, .26, K.mat('#fff2c4', { emissif: '#ffcf70' }), x, y - .05, z + .4);
  K.cone(.22, .2, 4, laiton, x, y + .24, z + .4).rotation.y = Math.PI / 4; K.boite(.3, .05, .3, laiton, x, y - .25, z + .4);
}

// ---------- La cathédrale ----------
// Mesuré au lancer de rayons (23/11) : la face du clocher est à 6 cm derrière la porte et large de 5 m, de 3,75 m à gauche
// à 1,25 m à droite ; l'arche peinte du modèle est à 1,5 m à gauche. Le portail se centre sur le clocher (X0), et la porte
// où l'on entre passe au milieu des marches.
const X0 = -1.3;
function portailCathedrale(P, obst) {
  const { g, ob: ob0 } = surFacade('portail-cathedrale', P, .06), sub = new THREE.Group(); sub.position.x = X0; g.add(sub);
  const ob = (x, z, w, p, o) => ob0(x + X0, z, w, p, o);
  const d = P.dehors, ox = P.porte[0] - Math.sin(d) * .06, oz = P.porte[1] - Math.cos(d) * .06;
  P.porte = [ox + X0 * Math.cos(d) + 1.7 * Math.sin(d), oz - X0 * Math.sin(d) + 1.7 * Math.cos(d)];
  K.into(sub, () => {
    const pierre = K.mat('#efe8dc', { rugosite: .8 }), rouge = K.mat('#b8352c', { rugosite: .7 }), blanc = K.mat('#f1ece4', { rugosite: .7 }), fer = K.mat('#1d1d1d', { metal: .5, rugosite: .5 });
    for (let k = 0; k < 3; k++) K.boite(4.4 - k * .35, .16, 1.5 - k * .45, pierre, 0, .08 + k * .16, .75 - k * .22); // les marches
    // Le cadre : le fond sombre du porche, les colonnes et leurs chapiteaux, les deux arcs aux claveaux alternés.
    K.boite(3.6, 4.6, .12, '#2a1d14', 0, 2.3, .03);
    for (const s of [-1, 1]) {
      K.cyl(.2, .22, 3, 14, pierre, s * 1.6, 1.98, .42); K.boite(.55, .22, .55, pierre, s * 1.6, .58, .42); K.boite(.6, .25, .6, pierre, s * 1.6, 3.6, .42);
      K.boite(.45, 3.4, .5, blanc, s * 2.05, 1.7 + .48, .22);
      ob(s * 1.8, .4, 1, .7, obst);
    }
    const yA = 3.72;
    for (const [r, n, z] of [[1.42, 13, .42], [1.82, 15, .3]]) for (let k = 0; k < n; k++) {
      const a = Math.PI * (k + .5) / n, v = K.boite(.36, .3, .34, k % 2 ? rouge : blanc, Math.cos(a) * r, yA + Math.sin(a) * r, z); v.rotation.z = a - Math.PI / 2;
    }
    // Le tympan et sa croix.
    const tymp = new THREE.Shape(); tymp.absarc(0, 0, 1.25, 0, Math.PI, false); tymp.lineTo(1.25, 0);
    plaque(tymp, .06, K.mat('#e8dcc8', { rugosite: .9 }), 0, yA, .1);
    K.boite(.12, .8, .06, rouge, 0, yA + .55, .18); K.boite(.5, .12, .06, rouge, 0, yA + .7, .18);
    K.boite(2.9, .22, .3, pierre, 0, yA - .05, .2); // le linteau
    // Les deux vantaux de chêne, fermés, leurs anneaux.
    for (const s of [-1, 1]) {
      const v = K.boite(1.36, 3.5, .1, vantailChene(), s * .69, .48 + 1.75, .12);
      v.rotation.y = s > 0 ? Math.PI : 0; // les deux faces du dessin : la planche de droite, retournée, garde ses clous à l'extérieur
      const an = K.maillage(K.geo('anneauPorte', () => new THREE.TorusGeometry(.09, .018, 6, 14)), fer, s * .22, 2.1, .2); an.rotation.x = 0;
    }
    K.boite(.04, 3.5, .12, '#120a05', 0, .48 + 1.75, .13); // la fente entre les vantaux
    // Le petit fronton rayé et sa croix, les lanternes.
    const fr = new THREE.Shape(); fr.moveTo(-2.35, 0); fr.lineTo(2.35, 0); fr.lineTo(0, 1.15); fr.closePath();
    plaque(fr, .4, toile('frontonRaye', 64, 64, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f1ece4' : '#b8352c'; c.fillRect(0, i * h / 8, w, h / 8 + 1); } }, { repete: [.25, .9] }), 0, yA + 2.05, .02);
    K.boite(4.9, .2, .55, pierre, 0, yA + 2, .24);
    K.boite(.14, .9, .14, pierre, 0, yA + 3.6, .2); K.boite(.55, .14, .14, pierre, 0, yA + 3.75, .2);
    for (const s of [-1, 1]) lanterne(s * 2.25, 2.7, 0, K.mat('#2b2b2b', { metal: .5, rugosite: .4 }));
  });
  bake(g);
}

// ---------- La mosquée de Zongo ----------
function arcBrise(w, h, hArc) { // le contour d'une baie en arc brisé : largeur w, piédroits h, flèche hArc
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h); s.quadraticCurveTo(-w / 2, h + hArc * .85, 0, h + hArc); s.quadraticCurveTo(w / 2, h + hArc * .85, w / 2, h); s.lineTo(w / 2, 0); s.closePath(); return s;
}
/** Le cadre en saillie : un rectangle L × H dont on a ôté, jusqu'au sol, la baie en arc brisé (sans trou : un seul contour). */
function cadreEnU(L, H, w, h, hArc) {
  const s = new THREE.Shape(); s.moveTo(-L / 2, 0); s.lineTo(-w / 2, 0); s.lineTo(-w / 2, h);
  s.quadraticCurveTo(-w / 2, h + hArc * .85, 0, h + hArc); s.quadraticCurveTo(w / 2, h + hArc * .85, w / 2, h);
  s.lineTo(w / 2, 0); s.lineTo(L / 2, 0); s.lineTo(L / 2, H); s.lineTo(-L / 2, H); s.closePath(); return s;
}
/** Le liseré : une bande de largeur e qui suit l'arc et les piédroits de la baie. */
function bandeArc(w, h, hArc, e) {
  const W = w + 2 * e, Ha = hArc + e, s = new THREE.Shape(); s.moveTo(-W / 2, 0); s.lineTo(-W / 2, h);
  s.quadraticCurveTo(-W / 2, h + Ha * .85, 0, h + Ha); s.quadraticCurveTo(W / 2, h + Ha * .85, W / 2, h); s.lineTo(W / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h);
  s.quadraticCurveTo(w / 2, h + hArc * .85, 0, h + hArc); s.quadraticCurveTo(-w / 2, h + hArc * .85, -w / 2, h); s.lineTo(-w / 2, 0); s.closePath(); return s;
}
function portailMosquee(P, obst, n) {
  const { g, ob } = surFacade(`portail-zongo-${n}`, P, 2.2);
  K.into(g, () => {
    const blanc = K.mat('#f6f4ee', { rugosite: .8 }), or = K.mat('#d9b44a', { metal: .65, rugosite: .3 }), marbre = K.mat('#e9e6df', { rugosite: .35 });
    // Le cadre en saillie (5 × 6,2 m), percé de la baie en arc brisé.
    plaque(cadreEnU(5, 7.7, 2.9, 3.3, 1.35), .55, blanc, 0, 0, 0); // assez haut pour couvrir les baies peintes du mur
    // Le fond de la baie (en retrait), l'arc souligné d'or, le bandeau de carreaux bleus au-dessus.
    plaque(arcBrise(2.9, 3.3, 1.35), .04, K.mat('#0f2a20'), 0, 0, .02);
    plaque(bandeArc(2.9, 3.3, 1.35, .13), .08, or, 0, 0, .56);
    K.boite(5, .7, .1, carreauxBleus(), 0, 6.75, .6); K.boite(5.1, .12, .62, or, 0, 7.76, .3); K.boite(5.1, .1, .6, or, 0, 6.32, .3); K.boite(5.1, .1, .6, or, 0, 7.18, .3);
    const etoile = new THREE.Shape(); for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8 + Math.PI / 16, r = k % 2 ? .2 : .38; k ? etoile.lineTo(Math.cos(a) * r, Math.sin(a) * r) : etoile.moveTo(Math.cos(a) * r, Math.sin(a) * r); } etoile.closePath();
    plaque(etoile, .06, or, 0, 4.85, .56);
    // Les deux vantaux verts aux étoiles dorées, fermés, en retrait de 45 cm ; leurs heurtoirs.
    for (const s of [-1, 1]) {
      const v = new THREE.Shape(); v.moveTo(0, 0); v.lineTo(0, 3.3 + 1.35); v.quadraticCurveTo(s * 1.45 * .15, 3.3 + 1.35 * .99, s * 1.45 * .5, 3.3 + 1.35 * .72); v.quadraticCurveTo(s * 1.45, 3.3 + 1.35 * .3, s * 1.45, 3.3); v.lineTo(s * 1.45, 0); v.closePath();
      const m = plaque(v, .08, vantailVert(), 0, 0, .1);
      const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s / 1.45, uv.getY(i) / 4.65); // l'étoffe du dessin sur tout le vantail
      K.maillage(K.geo('heurtoir', () => new THREE.TorusGeometry(.1, .022, 6, 14)), or, s * .3, 1.9, .22);
    }
    K.boite(.04, 4.6, .1, '#081a12', 0, 2.3, .14);
    for (let k = 0; k < 2; k++) K.boite(4.6 - k * .5, .15, 1.3 - k * .5, marbre, 0, .075 + k * .15, .55 + (1.3 - k * .5) / 2); // les marches
    for (const s of [-1, 1]) { lanterne(s * 3, 3.1, 0, or); ob(s * 1.95, .3, 1.1, .6, obst); }
  });
  bake(g);
}

/** Pose les deux portails (main.js, après lieux-videos.js qui déclare les portes). */
export function construirePortailsCulte() {
  const obst = [];
  try { const C = INTERIEURS.get('cathedrale'); if (C) portailCathedrale(C, obst); } catch (e) { console.warn('Portail de la cathédrale :', e); }
  try { const M = INTERIEURS.get('mosquee-zongo'); if (M) (M.portes || [M]).forEach((P, k) => portailMosquee(P, obst, k)); } catch (e) { console.warn('Portail de la mosquée :', e); }
  poserObstacles('portails-culte', obst);
}
