import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { LITE } from './base.js';

// Egungun, les masques des revenants (culte des ancêtres yoruba, très présents
// à Porto-Novo et Ouidah). D'après les photos fournies : costumes en étages de
// panneaux de tissu brodés et pailletés, bordés de rouge et de franges dorées,
// voile de perles devant le visage, coiffe brodée, chaussures colorées.

const PALETTES = [
  { fond: '#2f6fb0', motif: '#8fd14f', bord: '#e2672a', accent: '#f2c21b', voile: ['#f4efe6', '#c8382f'] },   // cape bleue à feuilles vertes
  { fond: '#d9548a', motif: '#3fb3a8', bord: '#c8382f', accent: '#f2c21b', voile: ['#f4efe6', '#b8323a'] },   // rose paillete
  { fond: '#d8c27a', motif: '#c8382f', bord: '#c8382f', accent: '#f6e7a8', voile: ['#2b2b2b', '#f2c21b'] },   // or et creme
  { fond: '#7a4a2c', motif: '#2f6fb0', bord: '#e2672a', accent: '#d8c27a', voile: ['#1f8f8a', '#f4efe6'] },   // brun et bleu
];
const cacheTex = new Map();
function tissu(i, etage) {
  const k = i + ':' + etage; if (cacheTex.has(k)) return cacheTex.get(k);
  const P = PALETTES[i], cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const c = cv.getContext('2d');
  let s = (i * 97 + etage * 31 + 7) >>> 0; const r = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  // Panneaux cousus, chacun d'une teinte un peu différente.
  const n = 8;
  for (let p = 0; p < n; p++) {
    const x = p * 512 / n, w = 512 / n;
    c.fillStyle = p % 3 === 1 ? P.motif : p % 3 === 2 ? P.accent : P.fond; c.globalAlpha = p % 3 ? .85 : 1; c.fillRect(x, 0, w, 256); c.globalAlpha = 1;
    // Appliqués : feuilles, cercles, oiseaux stylisés.
    c.fillStyle = p % 3 === 0 ? P.motif : P.fond;
    const cx = x + w / 2, cy = 110 + r() * 40, t = (p + etage) % 3;
    if (t === 0) { for (let a = 0; a < 6; a++) { c.save(); c.translate(cx, cy); c.rotate(a * Math.PI / 3); c.beginPath(); c.ellipse(0, -18, 8, 18, 0, 0, Math.PI * 2); c.fill(); c.restore(); } }
    else if (t === 1) { c.beginPath(); c.arc(cx, cy, 20, 0, Math.PI * 2); c.fill(); c.fillStyle = P.accent; c.beginPath(); c.arc(cx, cy, 9, 0, Math.PI * 2); c.fill(); }
    else { c.beginPath(); c.moveTo(cx - 24, cy); c.quadraticCurveTo(cx, cy - 26, cx + 24, cy - 6); c.lineTo(cx + 6, cy + 4); c.lineTo(cx - 6, cy + 20); c.closePath(); c.fill(); }
    // Coutures.
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 256); c.stroke();
  }
  // Paillettes.
  for (let q = 0; q < 1400; q++) { c.fillStyle = r() < .5 ? 'rgba(255,255,255,.55)' : 'rgba(255,230,140,.5)'; c.fillRect(r() * 512, r() * 230, 2, 2); }
  // Bordure rouge et frange dorée en bas.
  c.fillStyle = P.bord; c.fillRect(0, 218, 512, 22);
  c.fillStyle = P.accent; for (let x = 0; x < 512; x += 6) c.fillRect(x, 240, 3, 16);
  c.fillStyle = P.bord; c.fillRect(0, 0, 512, 10);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 4;
  cacheTex.set(k, tex); return tex;
}
function voile(i) {
  const k = 'v' + i; if (cacheTex.has(k)) return cacheTex.get(k);
  const P = PALETTES[i], cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const c = cv.getContext('2d');
  c.fillStyle = '#111'; c.fillRect(0, 0, 256, 128);
  for (let x = 4; x < 256; x += 9) for (let y = 4; y < 128; y += 9) { c.fillStyle = (Math.floor(y / 18) % 3 === 2) ? P.voile[1] : P.voile[0]; c.beginPath(); c.ellipse(x, y, 3.2, 3.8, 0, 0, Math.PI * 2); c.fill(); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; cacheTex.set(k, tex); return tex;
}
const mats = new Map();
const mat = (cle, f) => mats.get(cle) || (mats.set(cle, f()), mats.get(cle));

/** Un Egungun : groupe dont userData.anim(t) le fait tourner et évaser ses étages. */
export function creerEgungun(i = 0, h = 2.3) {
  i = ((i % PALETTES.length) + PALETTES.length) % PALETTES.length;
  const P = PALETTES[i], g = new THREE.Group(), corps = new THREE.Group(); g.add(corps);
  const k = h / 2.3;
  // Étages de jupe, du bas vers les épaules.
  const etages = [];
  // Jupe large et bombée, cape évasée sur les épaules (photos images-40 à 44).
  const def = [[.6, .74, .55, .02], [.56, .66, .48, .52], [.34, .66, .5, .98], [.22, .36, .26, 1.46]];
  def.forEach(([rh, rb, hh, y], e) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rh * k, rb * k, hh * k, 20, 1, true), mat(`t${i}${e}`, () => new THREE.MeshStandardMaterial({ map: tissu(i, e), roughness: .55, metalness: .15, side: THREE.DoubleSide })));
    m.position.y = (y + hh / 2) * k; m.castShadow = !LITE; corps.add(m); etages.push(m);
  });
  // Pans qui flottent autour de la jupe.
  // Pans de la cape qui retombent des épaules, et pans de la jupe.
  for (let p = 0; p < 10; p++) {
    const a = p * Math.PI / 5 + .3, haut = p % 2 === 0;
    const pan = new THREE.Mesh(new THREE.PlaneGeometry(.36 * k, (haut ? .55 : .62) * k), mat(`p${i}${p % 3}`, () => new THREE.MeshStandardMaterial({ map: tissu(i, p % 3), roughness: .6, side: THREE.DoubleSide })));
    const r = (haut ? .64 : .76) * k;
    pan.position.set(Math.cos(a) * r, (haut ? 1.12 : .36) * k, Math.sin(a) * r); pan.rotation.y = -a + Math.PI / 2; pan.rotation.x = haut ? -.32 : -.12; corps.add(pan); etages.push(pan);
  }
  // Tête : voile de perles, coiffe brodée et crête.
  const tete = new THREE.Mesh(new THREE.CylinderGeometry(.17 * k, .2 * k, .42 * k, 16, 1, true), mat(`v${i}`, () => new THREE.MeshStandardMaterial({ map: voile(i), roughness: .4, side: THREE.DoubleSide })));
  tete.position.y = 1.9 * k; corps.add(tete);
  const coiffe = new THREE.Mesh(new THREE.CylinderGeometry(.22 * k, .19 * k, .32 * k, 8), mat(`c${i}`, () => new THREE.MeshStandardMaterial({ color: P.bord, roughness: .5 })));
  coiffe.position.y = 2.25 * k; corps.add(coiffe);
  const crete = new THREE.Mesh(new THREE.ConeGeometry(.14 * k, .22 * k, 4), mat(`a${i}`, () => new THREE.MeshStandardMaterial({ color: P.accent, metalness: .4, roughness: .35 })));
  crete.position.y = 2.5 * k; crete.rotation.y = Math.PI / 4; corps.add(crete);
  // Pieds chaussés.
  for (const z of [-.12, .12]) { const pied = new THREE.Mesh(new THREE.BoxGeometry(.26 * k, .1 * k, .12 * k), mat('pied' + i, () => new THREE.MeshStandardMaterial({ color: P.motif }))); pied.position.set(.06 * k, .05 * k, z * k); corps.add(pied); }
  const phase = i * 1.7;
  g.userData.anim = (t, vitesse = 1) => {
    // Tournoiement : le corps pivote, les étages s'évasent avec la rotation.
    corps.rotation.y = t * 2.2 * vitesse + phase;
    const f = 1 + .12 * Math.max(0, Math.sin(t * 4.4 + phase));
    for (let e = 0; e < 4; e++) etages[e].scale.set(f + e * .02, 1, f + e * .02);
    corps.position.y = Math.abs(Math.sin(t * 4.4 + phase)) * .08 * k;
  };
  g.userData.anim(0);
  return g;
}

// ---------- Modèles 3D fournis (générés avec Tripo, allégés par scripts/masques.mjs) ----------
// danseur : un Egungun en pleine danse, bras levé ; paire : deux Egungun aux masques
// sculptés ; groupe : quatre Egungun accroupis côte à côte.
const FICHIERS = { danseur: ['zangbeto', 1.95, 0], paire: ['egungun-traditionnel', 2.2, Math.PI / 2], groupe: ['egungun-groupe', 1.85, 0] };
export const MASQUES = { modeles: null, promesse: null };
export function chargerMasques() {
  if (MASQUES.promesse) return MASQUES.promesse;
  const L = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  MASQUES.promesse = Promise.all(Object.entries(FICHIERS).map(([cle, [f]]) => L.loadAsync(import.meta.env.BASE_URL + `modeles/${f}.glb`)
    .then(g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = !LITE; o.receiveShadow = true; if (o.material.metalness > .5) o.material.metalness = .15; } }); return [cle, g.scene]; })
    .catch(e => { console.warn(`masque ${f} indisponible`, e); return [cle, null]; })))
    .then(l => (MASQUES.modeles = Object.fromEntries(l)));
  return MASQUES.promesse;
}
/** Un masque du modèle `cle`, posé au sol, face à +z, haut de `h` m (ou sa hauteur réelle). Null s'il n'est pas chargé. */
export function masque(cle, h) {
  const src = MASQUES.modeles?.[cle]; if (!src) return null;
  const [, hauteur, rot] = FICHIERS[cle], g = new THREE.Group(), m = src.clone();
  m.scale.setScalar((h ?? hauteur) / .98 * (cle === 'groupe' ? .98 / .38 : 1)); m.rotation.y = rot; g.add(m);
  return g;
}

// ---------- Zangbeto : les gardiens de la nuit ----------
// Une meule de raphia teint, haute comme deux hommes, qui tourne sur elle-même.
const cacheRaphia = new Map();
function raphia(i) {
  if (cacheRaphia.has(i)) return cacheRaphia.get(i);
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512; const c = cv.getContext('2d');
  let s = (i * 131 + 17) >>> 0; const r = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  c.fillStyle = '#b8935a'; c.fillRect(0, 0, 512, 512);
  const teintes = [['#d9b779', '#a77d45', '#8a6234', '#e6cf9a'], ['#c9a46a', '#7a3b2e', '#d8b270', '#3e5b8a'], ['#d4b072', '#2f6b4a', '#b98a4c', '#c8382f']][i % 3];
  for (let k = 0; k < 2600; k++) { const x = r() * 512; c.strokeStyle = teintes[Math.floor(r() * 4)]; c.globalAlpha = .55 + r() * .45; c.lineWidth = 1 + r() * 2.2; c.beginPath(); c.moveTo(x, r() * 120); c.lineTo(x + (r() - .5) * 18, 512); c.stroke(); }
  c.globalAlpha = 1;
  // Bandes de raphia teint et franges.
  for (const [y, col] of [[96, teintes[1]], [118, teintes[3]], [300, teintes[1]]]) { c.fillStyle = col; c.globalAlpha = .8; c.fillRect(0, y, 512, 14); }
  c.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  cacheRaphia.set(i, t); return t;
}
export function creerZangbeto(i = 0, h = 2.6) {
  const g = new THREE.Group(), corps = new THREE.Group(); g.add(corps);
  const prof = [[0, h], [.12, h * .97], [.32, h * .88], [.5, h * .7], [.66, h * .48], [.8, h * .25], [.92, .06], [.96, 0]].map(([x, y]) => new THREE.Vector2(x * h / 2.6, y));
  const mat = new THREE.MeshStandardMaterial({ map: raphia(i), roughness: .95, side: THREE.DoubleSide });
  const meule = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), mat); meule.castShadow = !LITE; corps.add(meule);
  // Seconde jupe de raphia, plus courte, qui s'évase quand il tourne.
  const jupe = new THREE.Mesh(new THREE.CylinderGeometry(.62 * h / 2.6, 1.02 * h / 2.6, h * .42, 28, 1, true), mat); jupe.position.y = h * .24; jupe.castShadow = !LITE; corps.add(jupe);
  // Sommet : petite touffe et cornes de tissu.
  const touffe = new THREE.Mesh(new THREE.ConeGeometry(.14, .38, 8), new THREE.MeshStandardMaterial({ color: ['#c8382f', '#2f6fb0', '#e9b62c'][i % 3], roughness: .7 })); touffe.position.y = h + .12; corps.add(touffe);
  const phase = i * 2.1;
  g.userData.anim = t => {
    corps.rotation.y = t * (3.2 + (i % 3) * .5) + phase;
    const f = 1 + .14 * Math.abs(Math.sin(t * 3.4 + phase)); jupe.scale.set(f, 1, f);
    corps.rotation.z = Math.sin(t * 1.7 + phase) * .05; corps.position.y = Math.abs(Math.sin(t * 6.8 + phase)) * .05;
  };
  return g;
}

/** Une procession : n masques en file, et deux tambourineurs. Avec les modèles 3D s'ils sont chargés. */
export function procession(n = 3, graine = 0) {
  const g = new THREE.Group(), membres = [];
  for (let j = 0; j < n; j++) {
    let e = masque(['danseur', 'paire', 'danseur'][(graine + j) % 3]);
    if (e) { const m = e, ph = j * 1.3, base = m.children[0].rotation.y; m.userData.anim = t => { m.children[0].rotation.y = base + Math.sin(t * 2.4 + ph) * .9; m.position.y = Math.abs(Math.sin(t * 4.8 + ph)) * .08; }; }
    else e = creerEgungun(graine + j, 2.2 + (j % 2) * .25);
    e.position.set((j - (n - 1) / 2) * 1.9, 0, 0); g.add(e); membres.push(e);
  }
  for (const x of [-(n + 1) / 2 * 1.7, (n + 1) / 2 * 1.7]) {
    const t = new THREE.Group(); t.position.set(x, 0, -.6);
    const pagne = new THREE.Mesh(new THREE.CylinderGeometry(.2, .26, 1.1, 8), mat('tam', () => new THREE.MeshStandardMaterial({ color: '#f4efe6' }))); pagne.position.y = .55; t.add(pagne);
    const buste = new THREE.Mesh(new THREE.CylinderGeometry(.18, .2, .55, 8), mat('tamb', () => new THREE.MeshStandardMaterial({ color: '#4a2f22' }))); buste.position.y = 1.35; t.add(buste);
    const tete = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 6), mat('tamb', () => null)); tete.position.y = 1.75; t.add(tete);
    const tambour = new THREE.Mesh(new THREE.CylinderGeometry(.18, .14, .5, 10), mat('tamt', () => new THREE.MeshStandardMaterial({ color: '#8a5a32' }))); tambour.position.set(.25, 1.15, 0); tambour.rotation.z = .5; t.add(tambour);
    g.add(t);
  }
  g.userData.anim = (t) => { for (const m of membres) m.userData.anim(t); };
  return g;
}
