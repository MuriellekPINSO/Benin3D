import * as THREE from 'three';
import { $, LITE, hash, toXZ } from './base.js';
import { PLACES } from './donnees-lieux.js';
import { K } from './lieux.js';
import { ZEMS_3D } from './vehicules.js';
import { roadLines } from './ville.js';
import { GJ, JEU, LANE, pose } from './jeu.js';
import { photoJeu } from './google.js';
import { campagne, compterVue, matAffiche } from './publicites.js';
import { matVeh } from './vehicules.js';

// Ce qui rend un trajet reconnaissable, à la manière de Danfo Run : les vrais
// commerces et services (OpenStreetMap) au bord de la route, avec leur enseigne,
// la vie de rue de Cotonou entre eux (kpayo, kiosques MoMo, vulcanisateurs,
// boutiques-conteneurs, poteaux électriques), le nom de la rue que l'on prend,
// une carte « à droite : … » quand on passe devant un monument, et une mini-carte.

// ---------- Enseignes ----------
const STYLES = {
  pharmacie: { fond: '#ffffff', encre: '#14532d', bande: '#1f9d55', label: 'PHARMACIE', icone: 'croix', ic: '#1f9d55' },
  sante: { fond: '#ffffff', encre: '#7f1d1d', bande: '#d93a2b', label: 'SANTÉ', icone: 'croix', ic: '#d93a2b' },
  banque: { fond: '#13325b', encre: '#ffffff', bande: '#e9b62c', label: 'BANQUE', icone: 'colonnes', ic: '#e9b62c' },
  station: { fond: '#ffffff', encre: '#b91c1c', bande: '#b91c1c', label: 'STATION-SERVICE', icone: 'pompe', ic: '#b91c1c' },
  hotel: { fond: '#2a2320', encre: '#f3e3b5', bande: '#c8a468', label: 'HÔTEL', icone: 'etoiles', ic: '#e9b62c' },
  restaurant: { fond: '#c2410c', encre: '#fff7ed', bande: '#fde68a', label: 'RESTAURANT', icone: 'couverts', ic: '#fde68a' },
  bar: { fond: '#1d4ed8', encre: '#ffffff', bande: '#facc15', label: 'BAR · MAQUIS', icone: 'verre', ic: '#facc15' },
  ecole: { fond: '#1e40af', encre: '#ffffff', bande: '#ffffff', label: 'ÉCOLE', icone: 'livre', ic: '#ffffff' },
  eglise: { fond: '#f8fafc', encre: '#1e3a8a', bande: '#1e3a8a', label: 'ÉGLISE', icone: 'croixEglise', ic: '#1e3a8a' },
  mosquee: { fond: '#14532d', encre: '#ffffff', bande: '#facc15', label: 'MOSQUÉE', icone: 'croissant', ic: '#facc15' },
  supermarche: { fond: '#dc2626', encre: '#ffffff', bande: '#ffffff', label: 'SUPERMARCHÉ', icone: 'chariot', ic: '#ffffff' },
  coiffure: { fond: '#f5d0fe', encre: '#701a75', bande: '#a21caf', label: 'COIFFURE', icone: 'ciseaux', ic: '#a21caf' },
  mode: { fond: '#fef3c7', encre: '#7c2d12', bande: '#ea580c', label: 'COUTURE · MODE', icone: 'cintre', ic: '#ea580c' },
  telephone: { fond: '#facc15', encre: '#1e3a8a', bande: '#1e3a8a', label: 'TÉLÉPHONES', icone: 'telephone', ic: '#1e3a8a' },
  garage: { fond: '#27272a', encre: '#fafafa', bande: '#f97316', label: 'GARAGE', icone: 'cle', ic: '#f97316' },
  poste: { fond: '#facc15', encre: '#1e3a8a', bande: '#1e3a8a', label: 'LA POSTE', icone: 'enveloppe', ic: '#1e3a8a' },
  police: { fond: '#1e3a8a', encre: '#ffffff', bande: '#dc2626', label: 'POLICE', icone: 'bouclier', ic: '#ffffff' },
  marche: { fond: '#f59e0b', encre: '#1c1917', bande: '#1c1917', label: 'MARCHÉ', icone: 'parasol', ic: '#1c1917' },
  gare: { fond: '#0f766e', encre: '#ffffff', bande: '#facc15', label: 'GARE ROUTIÈRE', icone: 'bus', ic: '#facc15' },
  quincaillerie: { fond: '#e7e5e4', encre: '#1c1917', bande: '#57534e', label: 'QUINCAILLERIE', icone: 'marteau', ic: '#57534e' },
  bureau: { fond: '#e2e8f0', encre: '#0f172a', bande: '#475569', label: '', icone: 'immeuble', ic: '#475569' },
  boutique: { fond: '#fde68a', encre: '#7c2d12', bande: '#b45309', label: 'BOUTIQUE', icone: 'sac', ic: '#b45309' },
};
function styleDe(type, nom) {
  const s = { ...(STYLES[type] || STYLES.boutique) }, n = nom.toLowerCase();
  if (type === 'station') { if (/total/.test(n)) Object.assign(s, { fond: '#ffffff', encre: '#e11d48', bande: '#1d4ed8', ic: '#e11d48' }); else if (/oryx/.test(n)) Object.assign(s, { fond: '#f97316', encre: '#ffffff', bande: '#7c2d12', ic: '#ffffff' }); else if (/sonacop/.test(n)) Object.assign(s, { fond: '#15803d', encre: '#ffffff', bande: '#facc15', ic: '#facc15' }); }
  if (type === 'telephone' && /moov/.test(n)) Object.assign(s, { fond: '#1d4ed8', encre: '#ffffff', bande: '#f97316', ic: '#f97316' });
  return s;
}
function icone(c, nom, x, y, r, col) {
  c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = r * .16; c.lineCap = 'round'; c.lineJoin = 'round';
  const L = (pts) => { c.beginPath(); pts.forEach(([a, b], i) => i ? c.lineTo(a * r, b * r) : c.moveTo(a * r, b * r)); c.stroke(); };
  switch (nom) {
    case 'croix': c.fillRect(-r * .28, -r * .85, r * .56, r * 1.7); c.fillRect(-r * .85, -r * .28, r * 1.7, r * .56); break;
    case 'colonnes': c.beginPath(); c.moveTo(-r, -r * .35); c.lineTo(0, -r * .95); c.lineTo(r, -r * .35); c.fill(); for (const u of [-.7, 0, .7]) c.fillRect(u * r - r * .13, -r * .25, r * .26, r * .9); c.fillRect(-r, r * .7, r * 2, r * .2); break;
    case 'pompe': c.fillRect(-r * .7, -r * .8, r * .9, r * 1.65); c.fillStyle = '#ffffff'; c.fillRect(-r * .55, -r * .6, r * .6, r * .45); L([[.2, -.5], [.75, -.2], [.75, .5]]); break;
    case 'etoiles': for (const u of [-.7, 0, .7]) { c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = (k % 2 ? .16 : .38) * r; c.lineTo(u * r + Math.cos(a) * rr, Math.sin(a) * rr); } c.fill(); } break;
    case 'couverts': L([[-.4, -.8], [-.4, .85]]); L([[-.65, -.8], [-.65, -.25], [-.15, -.25], [-.15, -.8]]); L([[.4, -.8], [.4, .85]]); c.beginPath(); c.ellipse(.4 * r, -.45 * r, .2 * r, .38 * r, 0, 0, Math.PI * 2); c.fill(); break;
    case 'verre': L([[-.5, -.7], [.5, -.7], [0, .1], [-.5, -.7]]); L([[0, .1], [0, .75]]); L([[-.35, .75], [.35, .75]]); break;
    case 'livre': L([[0, -.55], [-.85, -.75], [-.85, .65], [0, .85], [.85, .65], [.85, -.75], [0, -.55], [0, .85]]); break;
    case 'croixEglise': c.fillRect(-r * .14, -r * .9, r * .28, r * 1.8); c.fillRect(-r * .55, -r * .45, r * 1.1, r * .26); break;
    case 'croissant': c.beginPath(); c.arc(-r * .1, 0, r * .75, 0, Math.PI * 2); c.fill(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(r * .2, -r * .1, r * .62, 0, Math.PI * 2); c.fill(); c.globalCompositeOperation = 'source-over'; c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = (k % 2 ? .1 : .24) * r; c.lineTo(r * .55 + Math.cos(a) * rr, -r * .1 + Math.sin(a) * rr); } c.fill(); break;
    case 'chariot': L([[-.9, -.6], [-.6, -.6], [-.35, .3], [.7, .3], [.85, -.35], [-.5, -.35]]); c.beginPath(); c.arc(-.25 * r, .65 * r, .14 * r, 0, 7); c.arc(.55 * r, .65 * r, .14 * r, 0, 7); c.fill(); break;
    case 'ciseaux': c.beginPath(); c.arc(-.45 * r, .5 * r, .25 * r, 0, 7); c.stroke(); c.beginPath(); c.arc(.45 * r, .5 * r, .25 * r, 0, 7); c.stroke(); L([[-.3, .3], [.55, -.85]]); L([[.3, .3], [-.55, -.85]]); break;
    case 'cintre': L([[0, -.85], [.15, -.65], [0, -.45], [-.9, .4], [.9, .4], [0, -.45]]); break;
    case 'telephone': c.fillRect(-r * .45, -r * .9, r * .9, r * 1.8); c.fillStyle = '#ffffff'; c.fillRect(-r * .32, -r * .7, r * .64, r * 1.15); break;
    case 'cle': c.beginPath(); c.arc(-.45 * r, -.45 * r, .35 * r, 0, 7); c.stroke(); L([[-.2, -.2], [.75, .75]]); break;
    case 'enveloppe': c.strokeRect(-r * .85, -r * .55, r * 1.7, r * 1.1); L([[-.85, -.55], [0, .1], [.85, -.55]]); break;
    case 'bouclier': c.beginPath(); c.moveTo(0, -r * .9); c.lineTo(r * .75, -r * .55); c.quadraticCurveTo(r * .7, r * .5, 0, r * .9); c.quadraticCurveTo(-r * .7, r * .5, -r * .75, -r * .55); c.closePath(); c.fill(); break;
    case 'parasol': c.beginPath(); c.moveTo(-r * .9, 0); c.quadraticCurveTo(0, -r * 1.1, r * .9, 0); c.closePath(); c.fill(); L([[0, 0], [0, .85]]); break;
    case 'bus': c.fillRect(-r * .85, -r * .6, r * 1.7, r * 1.05); c.fillStyle = '#ffffff'; for (const u of [-.6, -.15, .3]) c.fillRect(u * r, -r * .45, r * .35, r * .35); c.fillStyle = col; c.beginPath(); c.arc(-.5 * r, .55 * r, .16 * r, 0, 7); c.arc(.5 * r, .55 * r, .16 * r, 0, 7); c.fill(); break;
    case 'marteau': c.fillRect(-r * .7, -r * .75, r * 1.2, r * .4); c.fillRect(-r * .12, -r * .4, r * .24, r * 1.25); break;
    case 'immeuble': c.fillRect(-r * .55, -r * .9, r * 1.1, r * 1.75); c.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) for (const u of [-.32, .12]) c.fillRect(u * r, (-.7 + i * .45) * r, r * .2, r * .22); break;
    default: c.beginPath(); c.moveTo(-r * .7, -r * .3); c.lineTo(r * .7, -r * .3); c.lineTo(r * .6, r * .85); c.lineTo(-r * .6, r * .85); c.closePath(); c.fill(); L([[-.35, -.3], [-.35, -.7], [.35, -.7], [.35, -.3]]);
  }
  c.restore();
}
function lignesDe(c, txt, w, taille) {
  const mots = txt.split(/\s+/), out = []; let cur = '';
  c.font = `800 ${taille}px "Plus Jakarta Sans", system-ui, sans-serif`;
  for (const m of mots) { const t = cur ? cur + ' ' + m : m; if (c.measureText(t).width > w && cur) { out.push(cur); cur = m; } else cur = t; }
  if (cur) out.push(cur); return out;
}
function texEnseigne(type, nom) {
  const W = 768, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'), s = styleDe(type, nom);
  c.fillStyle = s.fond; c.fillRect(0, 0, W, H);
  c.fillStyle = s.bande; c.fillRect(0, H - 22, W, 22); c.fillRect(0, 0, W, 10);
  icone(c, s.icone, 118, H / 2 - 4, 72, s.ic);
  const x0 = 230, w = W - x0 - 26; let titre = nom.toUpperCase();
  let taille = 66, lg = lignesDe(c, titre, w, taille);
  while ((lg.length > 2 || lg.some(l => c.measureText(l).width > w)) && taille > 30) { taille -= 4; lg = lignesDe(c, titre, w, taille); }
  if (lg.length > 2) lg = [lg[0], lg.slice(1).join(' ').slice(0, 26) + '…'];
  const sous = s.label && !titre.includes(s.label.split(' ')[0]) ? s.label : '';
  const hTot = lg.length * taille * 1.05 + (sous ? 34 : 0); let y = (H - 22 - hTot) / 2 + taille * .85;
  c.fillStyle = s.encre; c.textBaseline = 'alphabetic';
  if (sous) { c.font = '700 26px "Plus Jakarta Sans", system-ui, sans-serif'; c.globalAlpha = .75; c.fillText(sous, x0, y - taille * .85 + 26); c.globalAlpha = 1; y += 34; }
  c.font = `800 ${taille}px "Plus Jakarta Sans", system-ui, sans-serif`;
  for (const l of lg) { c.fillText(l, x0, y); y += taille * 1.05; }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// Petites pancartes peintes à la main, communes à toutes les lignes.
const PEINTES = ['COUTURE', 'COIFFURE DAME', 'SOUDURE', 'MENUISERIE', 'VULCANISATEUR', 'VENTE DE GARI', 'CABINE · MOMO', 'ATELIER AUTO', 'BOUTIQUE GRÂCE DIVINE', 'MAQUIS CHEZ TANTI', 'DIEU EST GRAND', 'QUINCAILLERIE'];
const cacheTex = new Map();
function texPeinte(txt) {
  if (cacheTex.has(txt)) return cacheTex.get(txt);
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160; const c = cv.getContext('2d');
  const fonds = ['#f8fafc', '#fde68a', '#bfdbfe', '#fecaca', '#bbf7d0'], encres = ['#1e3a8a', '#991b1b', '#14532d', '#111827', '#7c2d12'];
  const k = txt.length % 5; c.fillStyle = fonds[k]; c.fillRect(0, 0, 512, 160);
  c.strokeStyle = encres[(k + 2) % 5]; c.lineWidth = 10; c.strokeRect(8, 8, 496, 144);
  c.fillStyle = encres[k]; c.textAlign = 'center'; c.textBaseline = 'middle';
  let taille = 70; c.font = `900 ${taille}px Impact, "Arial Black", system-ui, sans-serif`;
  while (c.measureText(txt).width > 470 && taille > 30) { taille -= 4; c.font = `900 ${taille}px Impact, "Arial Black", system-ui, sans-serif`; }
  c.fillText(txt, 256, 84);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; cacheTex.set(txt, t); return t;
}
const matCote = new THREE.MeshStandardMaterial({ color: '#3a3f44', roughness: .6 });
function panneau(tex, w, h) {
  const front = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, .08), [matCote, matCote, matCote, matCote, front, matCote]);
  m.castShadow = !LITE; return m;
}

// ---------- Objets du bord de route ----------
// Chaque fabrique renvoie un groupe dont l'axe +z regarde la route, et la liste
// de ce qu'il faut libérer quand il est retiré.
const geoCache = {};
const gc = (k, f) => geoCache[k] || (geoCache[k] = f());
function m(geo, mat, x, y, z, parent) { const o = new THREE.Mesh(geo, typeof mat === 'string' ? K.mat(mat) : mat); o.position.set(x, y, z); o.castShadow = !LITE; o.receiveShadow = true; parent.add(o); return o; }
const FAB = {
  enseigne(it) {
    const g = new THREE.Group(), tex = texEnseigne(it.t, it.nom);
    for (const x of [-1.5, 1.5]) m(gc('poteau', () => new THREE.CylinderGeometry(.07, .08, 3, 6)), '#4b5563', x, 1.5, -.1, g);
    const p = panneau(tex, 4, 1.35); p.position.set(0, 3.55, 0); g.add(p);
    // Boutique-conteneur derrière les enseignes de commerce, comme partout à Cotonou.
    if (/mode|coiffure|telephone|boutique|quincaillerie|garage/.test(it.t)) {
      const col = ['#b5422d', '#2f5f8a', '#3c7a4f', '#d58a2a', '#7a4a2c', '#e0d8c8'][Math.floor(hash(Math.round(it.s), 3) * 6)];
      m(gc('cont', () => new THREE.BoxGeometry(6, 2.6, 2.44)), K.tex('tole', 3, 1, col), 0, 1.3, -3.4, g);
      m(gc('ouv', () => new THREE.BoxGeometry(2.3, 2.2, .1)), '#1f2326', 0, 1.15, -2.15, g);
      for (const x of [-1.6, 1.6]) { const v = m(gc('vitr', () => new THREE.BoxGeometry(.8, 1.1, .4)), '#cbd5e1', x, .55, -1.6, g); v.castShadow = false; }
    }
    return { g, liberer: [tex, p.material[4]] };
  },
  station(it) {
    const g = new THREE.Group(), tex = texEnseigne('station', it.nom), s = styleDe('station', it.nom);
    m(gc('auvent', () => new THREE.BoxGeometry(13, .7, 8)), K.mat('#f4f4f2'), 0, 5.3, -6, g);
    m(gc('rive', () => new THREE.BoxGeometry(13.1, .45, 8.1)), K.mat(s.bande), 0, 5.05, -6, g);
    for (const x of [-4.5, 4.5]) { m(gc('pil', () => new THREE.BoxGeometry(.4, 5, .4)), '#e5e7eb', x, 2.5, -6, g); m(gc('pompe', () => new THREE.BoxGeometry(.9, 1.7, .6)), K.mat(s.fond === '#ffffff' ? s.encre : s.fond), x, .85, -5, g); }
    m(gc('dalle', () => new THREE.BoxGeometry(16, .12, 11)), '#9ca3af', 0, .06, -6, g).castShadow = false;
    m(gc('totem', () => new THREE.BoxGeometry(.5, 6, .5)), '#e5e7eb', 7.5, 3, -1, g);
    const p = panneau(tex, 4.2, 1.4); p.position.set(7.5, 6.5, -1); g.add(p);
    return { g, liberer: [tex, p.material[4]] };
  },
  kpayo(it) { // essence de contrebande en bouteilles, sur une table au bord de la route
    const g = new THREE.Group();
    m(gc('table', () => new THREE.BoxGeometry(1.6, .08, .7)), '#7a5a3a', 0, .85, 0, g);
    for (const [x, z] of [[-.7, -.3], [.7, -.3], [-.7, .3], [.7, .3]]) m(gc('pied', () => new THREE.BoxGeometry(.06, .85, .06)), '#5b4330', x, .42, z, g);
    const verre = K.mat('#e7a521', { rugosite: .1, transparent: .75 });
    for (let i = 0; i < 12; i++) m(gc('btl', () => new THREE.CylinderGeometry(.06, .07, .38, 8)), verre, -.65 + (i % 6) * .26, 1.08, -.15 + Math.floor(i / 6) * .3, g);
    for (let i = 0; i < 3; i++) m(gc('bidon', () => new THREE.BoxGeometry(.32, .45, .22)), '#e2b13c', .95, .23, -.3 + i * .3, g);
    m(gc('para', () => new THREE.ConeGeometry(1.5, .55, 10, 1, true).translate(0, 2.4, 0)), K.mat(['#c8382f', '#2f6fb0', '#e9b62c', '#2f8a4a'][Math.floor(hash(Math.round(it.s), 5) * 4)], { face2: true }), 0, 0, -.1, g);
    m(gc('mat', () => new THREE.CylinderGeometry(.03, .03, 2.3, 5)), '#555', 0, 1.15, -.1, g);
    return { g, liberer: [] };
  },
  vendeuse(it) {
    const g = new THREE.Group();
    const o = new THREE.Mesh(GJ.marchande[Math.floor(hash(Math.round(it.s), 6) * 4)], matVeh); o.position.set(.4, 0, 0); g.add(o);
    m(gc('bassine', () => new THREE.CylinderGeometry(.45, .32, .25, 12)), '#c9ccd0', -.5, .45, .2, g);
    m(gc('tabouret', () => new THREE.BoxGeometry(.6, .4, .6)), '#8a6a48', -.5, .2, .2, g);
    m(gc('para2', () => new THREE.ConeGeometry(1.7, .6, 10, 1, true).translate(0, 2.5, 0)), K.mat(['#f2efe6', '#c8382f', '#e9b62c', '#2f6fb0', '#5a8f3a'][Math.floor(hash(Math.round(it.s), 7) * 5)], { face2: true }), 0, 0, 0, g);
    m(gc('mat2', () => new THREE.CylinderGeometry(.03, .03, 2.4, 5)), '#555', 0, 1.2, 0, g);
    return { g, liberer: [] };
  },
  momo(it) {
    const g = new THREE.Group(), moov = hash(Math.round(it.s), 8) < .35;
    m(gc('kiosque', () => new THREE.BoxGeometry(1.7, 2.3, 1.3)), moov ? '#1d4ed8' : '#facc15', 0, 1.15, -.3, g);
    m(gc('guichet', () => new THREE.BoxGeometry(1.2, .6, .05)), '#1f2326', 0, 1.35, .37, g);
    const p = panneau(texPeinte(moov ? 'MOOV MONEY' : 'MTN MOMO'), 1.9, .6); p.position.set(0, 2.6, .3); g.add(p);
    m(gc('chaise', () => new THREE.BoxGeometry(.45, .45, .45)), '#2f6fb0', .9, .22, .6, g);
    return { g, liberer: [] };
  },
  vulca(it) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) { const t = m(gc('pneu', () => new THREE.TorusGeometry(.32, .12, 6, 12)), '#1c1c1e', -.6, .13 + i * .24, 0, g); t.rotation.x = Math.PI / 2; }
    m(gc('compr', () => new THREE.CylinderGeometry(.25, .25, .7, 10)), '#c8382f', .5, .35, 0, g).rotation.z = Math.PI / 2;
    for (const x of [-.8, .8]) m(gc('poteau2', () => new THREE.CylinderGeometry(.05, .05, 2.4, 5)), '#5b4330', x, 1.2, -.4, g);
    const p = panneau(texPeinte('VULCANISATEUR'), 2.2, .7); p.position.set(0, 2.3, -.4); g.add(p);
    return { g, liberer: [] };
  },
  peinte(it) {
    const g = new THREE.Group();
    m(gc('poteau3', () => new THREE.CylinderGeometry(.05, .05, 2.2, 5)), '#5b4330', 0, 1.1, 0, g);
    const p = panneau(texPeinte(PEINTES[Math.floor(hash(Math.round(it.s), 9) * PEINTES.length)]), 2, .62); p.position.set(0, 2.4, 0); g.add(p);
    return { g, liberer: [] };
  },
  zems(it) { // station de zémidjans en attente, sous un arbre
    const g = new THREE.Group();
    const tr = K.mat('#6f5c47'), fe = K.mat('#3f6b3c');
    m(gc('tronc', () => new THREE.CylinderGeometry(.25, .35, 3.4, 7)), tr, -1.5, 1.7, -3.2, g);
    const f = m(gc('feuil', () => new THREE.SphereGeometry(2.2, 10, 7)), fe, -1.5, 4.2, -3.2, g); f.scale.set(1.2, .55, 1.2);
    if (ZEMS_3D.motoLod) for (let i = 0; i < 3; i++) { const z = new THREE.Mesh(ZEMS_3D.motoLod.geo, ZEMS_3D.motoLod.mat); z.position.set(-1.2 + i * 1.1, 0, -.2); z.rotation.y = Math.PI / 2 + .25 * (i - 1); g.add(z); }
    return { g, liberer: [] };
  },
  pub(it) { // grand panneau 4 × 3 sur deux mâts, tourné vers ceux qui arrivent
    const g = new THREE.Group();
    for (const x of [-1.5, 1.5]) m(gc('mpub', () => new THREE.CylinderGeometry(.11, .14, 4.4, 8)), '#8d9196', x, 2.2, -.15, g);
    m(gc('cpub', () => new THREE.BoxGeometry(4.9, 3.7, .2)), '#e8e6e0', 0, 5.75, -.15, g);
    const p = new THREE.Mesh(gc('ppub', () => new THREE.PlaneGeometry(4.6, 3.45)), matAffiche(it.c)); p.position.set(0, 5.75, -.04); g.add(p);
    for (const x of [-1.4, 1.4]) { const l = m(gc('lpub', () => new THREE.BoxGeometry(.5, .1, .5)), '#3a3f44', x, 7.75, .2, g); l.castShadow = false; }
    return { g, liberer: [], campagne: it.c.id };
  },
  poteau(it) { // poteau électrique en béton, câbles vers le précédent
    const g = new THREE.Group();
    m(gc('pbeton', () => new THREE.CylinderGeometry(.11, .17, 9, 6)), '#b8b2a6', 0, 4.5, 0, g);
    m(gc('traverse', () => new THREE.BoxGeometry(1.6, .12, .12)), '#6b6b6b', 0, 8.4, 0, g);
    return { g, liberer: [], cable: true };
  },
};

// Positions de travail propres à ce module : pose() renvoie sinon l'objet partagé du jeu.
const tmpPB = { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 }, tmpPM = { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 }, tmpPQ = { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 };

// ---------- Préparation d'une ligne ----------
const EXTRA = [['Sofitel Cotonou Marina', 'Hôtel', 6.34946, 2.39371], ['Grand magasin Erevan', 'Commerce', 6.34902, 2.38696], ["Rond-point de l'aéroport", 'Rond-point', 6.35231, 2.38605], ['Ancien cimetière', 'Cimetière', 6.36134, 2.44308],
  ['Temple des Pythons', 'Temple vodun', 6.35997, 2.08504], ['Place Chacha', 'Place', 6.35647, 2.08501], ["Arbre de l'Oubli", 'Mémorial', 6.34810, 2.08688], ['Mémorial de Zoungbodji', 'Mémorial', 6.33984, 2.08938]];
export const BORD = { items: [], ptr: 0, vivants: [], reperes: [], rues: [], ruePtr: 0, repere: null, dernierPoteau: null, cables: null, mini: null };
function projeter(C, x, z) {
  let bi = 0, bd = 1e18;
  for (let i = 0; i < C.n; i += 4) { const d = (C.X[i] - x) ** 2 + (C.Z[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  for (let i = Math.max(0, bi - 4); i < Math.min(C.n, bi + 5); i++) { const d = (C.X[i] - x) ** 2 + (C.Z[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  const p = pose(C, bi, 0, tmpPQ), side = Math.sign((x - p.x) * -p.dz + (z - p.z) * p.dx) || 1;
  return { s: bi, d: Math.sqrt(bd), side };
}
export function preparerBordure(L, C, arrets) {
  nettoyerBordure();
  const B = BORD;
  // Monuments et lieux le long du trajet.
  const lieux = [...PLACES.map(p => ({ nom: p.name, kind: p.kind, x: p.x ?? toXZ(p.lat, p.lon)[0], z: p.z ?? toXZ(p.lat, p.lon)[1] })),
    ...EXTRA.map(([nom, kind, la, lo]) => { const [x, z] = toXZ(la, lo); return { nom, kind, x, z }; })];
  B.reperes = lieux.map(l => ({ ...l, ...projeter(C, l.x, l.z) })).filter(r => r.d < 300 && r.s > 20 && r.s < C.L - 10).sort((a, b) => a.s - b.s);
  // Noms de rues.
  B.rues = (L.rues || []).map(r => { const p = projeter(C, r.x, r.z); return { nom: r.nom, s: p.s, d: p.d }; }).filter(r => r.d < 30).sort((a, b) => a.s - b.s); // après un virage, seules les rues encore sur le trajet
  B.ruePtr = 0;
  const ponts = [];
  B.rues.forEach((r, i) => { if (/^Pont/i.test(r.nom)) ponts.push([r.s - 30, (B.rues[i + 1]?.s ?? r.s + 300) + 30]); });
  // Détecte aussi les ponts par la géométrie des routes OSM marquées « bridge ».
  for (const rl of roadLines) if (rl.bridge && rl.cls <= 3) for (const [x, z] of [rl.pts[0], rl.pts[rl.pts.length - 1]]) { const pr = projeter(C, x, z); if (pr.d < 25) ponts.push([pr.s - 40, pr.s + 40]); }
  const surPont = s => ponts.some(([a, b]) => s > a && s < b);
  const libre = s => !arrets.some(a => s > a.s - 45 && s < a.s + 20) && !B.reperes.some(r => r.d < 140 && Math.abs(s - r.s) < 70) && !surPont(s);
  const OFF = LANE * 1.5 + 3.3, items = [];
  // Commerces réels.
  const vus = [];
  for (const c of L.commerces || []) {
    const pr = projeter(C, c.x, c.z); if (pr.d > 55 || pr.s < 30 || pr.s > C.L - 30 || surPont(pr.s)) continue;
    if (arrets.some(a => pr.s > a.s - 38 && pr.s < a.s + 8)) continue;
    if (vus.some(v => v.side === pr.side && Math.abs(v.s - pr.s) < 11)) continue;
    vus.push(pr);
    items.push({ type: c.t === 'station' ? 'station' : 'enseigne', t: c.t, nom: c.nom, s: pr.s, side: pr.side, off: c.t === 'station' ? OFF + 2 : OFF + .4 });
  }
  // Vie de rue entre les commerces.
  const GEN = ['kpayo', 'vendeuse', 'vendeuse', 'momo', 'peinte', 'peinte', 'vulca', 'zems'];
  for (const side of [-1, 1]) {
    for (let s = 40 + hash(side + 5, 1) * 20; s < C.L - 40; s += 16 + hash(Math.round(s), side + 3) * 22) {
      if (!libre(s) || vus.some(v => v.side === side && Math.abs(v.s - s) < 12)) continue;
      const type = GEN[Math.floor(hash(Math.round(s * 3), side + 7) * GEN.length)];
      items.push({ type, s, side, off: OFF + (type === 'zems' ? 1.5 : 0) });
    }
  }
  // Grands panneaux publicitaires (catalogue de publicites.js), tous les 600 à 900 m.
  for (let s = 260 + Math.random() * 200; s < C.L - 120; s += 600 + Math.random() * 300) {
    if (!libre(s)) continue;
    const side = Math.random() < .5 ? -1 : 1, pres = it => it.side === side && Math.abs(it.s - s) < 12;
    if (items.some(it => pres(it) && (it.type === 'enseigne' || it.type === 'station'))) continue; // un vrai commerce reste prioritaire
    for (let i = items.length - 1; i >= 0; i--) if (pres(items[i])) items.splice(i, 1);
    items.push({ type: 'pub', s, side, off: OFF + 3.4, c: campagne(Math.random()) });
  }
  // Poteaux électriques, d'un seul côté.
  for (let s = 20; s < C.L - 20; s += 36) if (!surPont(s)) items.push({ type: 'poteau', s, side: -1, off: OFF - 1.2 });
  B.items = items.sort((a, b) => a.s - b.s); B.ptr = 0;
  B.cables = new THREE.Group(); JEU.decor.add(B.cables);
  B.ponts = ponts;
  preparerMiniCarte(L, C, arrets);
  $('#jhRue').classList.remove('on'); $('#jhRepere').classList.remove('on');
}
export function nettoyerBordure() {
  for (const v of BORD.vivants) { v.g.parent?.remove(v.g); for (const l of v.liberer) l.dispose?.(); }
  BORD.vivants = []; BORD.items = []; BORD.ptr = 0; BORD.dernierPoteau = null; BORD.repere = null;
  if (BORD.cables) { for (const c of BORD.cables.children) c.geometry.dispose(); BORD.cables.parent?.remove(BORD.cables); BORD.cables = null; }
}

// ---------- Mise à jour pendant la course ----------

const matCable = new THREE.LineBasicMaterial({ color: '#1f2326' });
export function majBordure(st, C) {
  const B = BORD;
  while (B.ptr < B.items.length && B.items[B.ptr].s < st.s + 360) {
    if (B.items[B.ptr].s < st.s - 30) { B.ptr++; continue; } // déjà dépassé (reprise, saut)
    const it = B.items[B.ptr++], p = pose(C, it.s, it.side * it.off, tmpPB);
    const o = FAB[it.type](it); o.s = it.s; o.type = it.type;
    o.g.position.set(p.x, p.y, p.z);
    // Face à la route, légèrement tournée vers ceux qui arrivent.
    const nx = -it.side * -p.dz * .85 - p.dx * .5, nz = -it.side * p.dx * .85 - p.dz * .5;
    o.g.rotation.y = it.type === 'poteau' ? Math.atan2(-p.dz, p.dx) + Math.PI / 2 : Math.atan2(nx, nz);
    JEU.decor.add(o.g); B.vivants.push(o);
    if (o.cable) {
      if (B.dernierPoteau && it.s - B.dernierPoteau.s < 60) for (const dy of [8.35, 7.9]) for (const dx of [-.7, .7]) {
        const a = B.dernierPoteau.g.localToWorld(new THREE.Vector3(dx, dy, 0)), b = o.g.localToWorld(new THREE.Vector3(dx, dy, 0));
        const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * .7, a.z + (b.z - a.z) * t)); }
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), matCable); l.userData.s = it.s; B.cables.add(l);
      }
      B.dernierPoteau = o;
    }
  }
  for (const v of B.vivants) if (v.campagne && !v.vu && v.s - st.s < 70) { v.vu = true; compterVue(v.campagne); } // affichage compté pour l'annonceur
  if (B.vivants.length && B.vivants[0].s < st.s - 30) {
    B.vivants = B.vivants.filter(v => { if (v.s >= st.s - 30) return true; v.g.parent?.remove(v.g); for (const l of v.liberer) l.dispose?.(); return false; });
    for (const c of [...B.cables.children]) if (c.userData.s < st.s - 60) { c.geometry.dispose(); B.cables.remove(c); }
  }
  // Plaque de rue quand on entre dans une rue nommée.
  while (B.ruePtr < B.rues.length && B.rues[B.ruePtr].s <= st.s + 10) {
    const r = B.rues[B.ruePtr++], el = $('#jhRue');
    el.querySelector('b').textContent = r.nom; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  // Carte du monument que l'on longe.
  const r = B.reperes.find(x => st.s > x.s - 140 && st.s < x.s + 25);
  if (r !== B.repere) {
    B.repere = r; const el = $('#jhRepere');
    if (r) { el.querySelector('small').textContent = `${r.side > 0 ? 'À droite' : 'À gauche'} · ${r.kind}`; el.querySelector('b').textContent = r.nom; el.className = 'jh-repere on ' + (r.side > 0 ? 'droite' : 'gauche'); photoJeu($('#jhRepPhoto'), r.x, r.z); }
    else el.classList.remove('on');
  }
  return r;
}

// ---------- Mini-carte ----------
const MPX = 3; // mètres par pixel du fond
function preparerMiniCarte(L, C, arrets) {
  const data = JEU.data; if (!data) return;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < C.n; i += 10) { x0 = Math.min(x0, C.X[i]); x1 = Math.max(x1, C.X[i]); z0 = Math.min(z0, C.Z[i]); z1 = Math.max(z1, C.Z[i]); }
  x0 -= 900; x1 += 900; z0 -= 900; z1 += 900;
  const W = Math.ceil((x1 - x0) / MPX), H = Math.ceil((z1 - z0) / MPX);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const X = x => (x - x0) / MPX, Z = z => (z - z0) / MPX;
  c.fillStyle = '#e9e1cf'; c.fillRect(0, 0, W, H);
  // Eau : océan, lac, lagune.
  const S = data.S; let pi = 0, ri = 0;
  for (let i = 0; i < S.k.length; i++) {
    const k = S.k[i]; c.beginPath();
    for (let r = 0; r < S.r[i]; r++) {
      const n = S.n[ri++]; let x = 0, z = 0;
      for (let j = 0; j < n; j++) { x += S.p[pi++]; z += S.p[pi++]; if (k <= 2 || k === 5 || k === 6) (j ? c.lineTo(X(x / 10), Z(z / 10)) : c.moveTo(X(x / 10), Z(z / 10))); }
      c.closePath();
    }
    if (k <= 2) { c.fillStyle = '#8cc4d6'; c.fill('evenodd'); } else if (k === 5 || k === 6) { c.fillStyle = '#c9dcae'; c.fill('evenodd'); }
  }
  // Routes.
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const rl of roadLines) {
    if (rl.cls > 4 && rl.cls !== 10) continue;
    c.strokeStyle = rl.cls <= 2 ? '#ffffff' : '#f5f0e6'; c.lineWidth = rl.cls <= 2 ? 3.2 : rl.cls === 10 ? 6 : 1.4;
    c.beginPath(); rl.pts.forEach(([x, z], j) => j ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z))); c.stroke();
  }
  // Trajet.
  c.strokeStyle = '#1d1a16'; c.lineWidth = 9; c.beginPath(); for (let i = 0; i < C.n; i += 6) (i ? c.lineTo(X(C.X[i]), Z(C.Z[i])) : c.moveTo(X(C.X[i]), Z(C.Z[i]))); c.stroke();
  c.strokeStyle = '#f2b705'; c.lineWidth = 5.5; c.stroke();
  // Monuments et arrêts.
  for (const r of BORD.reperes) { c.fillStyle = '#d6452f'; c.beginPath(); c.arc(X(r.x), Z(r.z), 6, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); }
  for (const a of arrets) { const p = pose(C, a.s, 0, tmpPQ); c.fillStyle = '#ffffff'; c.beginPath(); c.arc(X(p.x), Z(p.z), 7, 0, 7); c.fill(); c.strokeStyle = '#1d1a16'; c.lineWidth = 3; c.stroke(); }
  BORD.mini = { cv, x0, z0, arrets, C };
}
export function majMiniCarte(st, C) {
  const M = BORD.mini, el = $('#jhMini'); if (!M || !el) return;
  const c = el.getContext('2d'), w = el.width, h = el.height, p = pose(C, st.s, st.lat, tmpPM);
  const echelle = 1.6; // pixels de mini-carte par pixel du fond
  c.save(); c.clearRect(0, 0, w, h);
  c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, 7); c.clip();
  c.fillStyle = '#e9e1cf'; c.fillRect(0, 0, w, h);
  const rot = -Math.PI / 2 - Math.atan2(p.dz, p.dx);
  c.translate(w / 2, h * .62); c.rotate(rot); c.scale(echelle, echelle);
  c.drawImage(M.cv, -(p.x - M.x0) / MPX, -(p.z - M.z0) / MPX);
  c.restore();
  // Noms des arrêts à venir.
  c.save(); c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, 7); c.clip();
  const cs = Math.cos(rot), sn = Math.sin(rot);
  c.font = `700 ${Math.round(w / 15)}px "Plus Jakarta Sans", system-ui, sans-serif`; c.textAlign = 'center';
  for (const a of M.arrets) {
    if (a.s < st.s) continue; const q = pose(C, a.s, 0, tmpPQ); const dx = (q.x - p.x) / MPX * echelle, dz = (q.z - p.z) / MPX * echelle;
    const sx = w / 2 + dx * cs - dz * sn, sy = h * .62 + dx * sn + dz * cs;
    if (sx < 0 || sx > w || sy < 0 || sy > h) continue;
    c.lineWidth = 4; c.strokeStyle = '#ffffff'; c.strokeText(a.nom, sx, sy - 10); c.fillStyle = '#1d1a16'; c.fillText(a.nom, sx, sy - 10);
  }
  c.restore();
  // Joueur.
  c.save(); c.translate(w / 2, h * .62); c.fillStyle = '#f2b705'; c.strokeStyle = '#1d1a16'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(0, -w / 16); c.lineTo(w / 22, w / 22); c.lineTo(0, w / 40); c.lineTo(-w / 22, w / 22); c.closePath(); c.fill(); c.stroke(); c.restore();
  c.strokeStyle = 'rgba(29,26,22,.35)'; c.lineWidth = 3; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, 7); c.stroke();
}
