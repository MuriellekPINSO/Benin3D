// GoDrive, l'entreprise de VTC inventée pour le jeu (23/11) : son nom sur ses véhicules. « GoDrive sur la voiture… si je peux
// commander, il doit y avoir écrit GoDrive sur le zém » (Murielle, 24/11). La voiture porte une enseigne sur le toit, orange
// et un peu lumineuse comme celles des taxis ; le zém, un top-case orange derrière la selle du passager. Les couleurs et le
// logo sont ceux de l'affiche de l'Hôtel 8 Janvier (akpakpa.js, logoGoDrive).
import * as THREE from 'three';

const ORANGE = '#ff6a13';
const TEX = new Map();
function texture(cle, w, h, dessin) {
  if (TEX.has(cle)) return TEX.get(cle);
  const c = document.createElement('canvas'); c.width = w; c.height = h; dessin(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; TEX.set(cle, t); return t;
}
/** Le « G » du logo (un arc et sa barre), centré en (x, y), de rayon r. */
function lettreG(c, x, y, r, ep) {
  c.strokeStyle = '#ffffff'; c.lineWidth = ep; c.lineCap = 'round';
  c.beginPath(); c.arc(x, y, r, -.3, Math.PI * 1.55); c.stroke();
  c.beginPath(); c.moveTo(x + r * .13, y); c.lineTo(x + r, y); c.stroke();
}
// Le bandeau : le logo puis « GoDrive », blanc sur orange (l'avant et l'arrière de l'enseigne du toit).
const bandeau = () => texture('bandeau', 1024, 256, (c, w, h) => {
  c.fillStyle = ORANGE; c.fillRect(0, 0, w, h);
  lettreG(c, 150, h / 2, 74, 30);
  c.fillStyle = '#ffffff'; c.font = '900 150px "Google Sans", system-ui, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('GoDrive', 270, h / 2 + 8);
});
// Le carré : le logo et le nom dessous (les flancs de l'enseigne, le top-case du zém).
const carre = () => texture('carre', 512, 512, (c, w, h) => {
  c.fillStyle = ORANGE; c.fillRect(0, 0, w, h);
  lettreG(c, w / 2, h / 2 - 40, 130, 42);
  c.fillStyle = '#ffffff'; c.font = '900 92px "Google Sans", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText('GoDrive', w / 2, h - 44);
});
const MATS = {};
const mat = (cle, map, lumineux = 0) => MATS[cle] ??= new THREE.MeshStandardMaterial({ map, color: map ? '#ffffff' : ORANGE, roughness: .5, emissive: lumineux ? '#ffffff' : '#000000', emissiveMap: lumineux ? map : null, emissiveIntensity: lumineux });

/** La boîte (repère du véhicule : x sur le côté, y en haut, z vers l'avant) du véhicule tel qu'il est dessiné. */
function gabarit(V) {
  const g = V.g, r = g.rotation.y, p = g.position.clone();
  g.rotation.y = 0; g.position.set(0, 0, 0); g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g);
  g.rotation.y = r; g.position.copy(p); g.updateMatrixWorld(true);
  return b;
}
/** Habille un véhicule GoDrive (trajets.js, appelerZem) : l'enseigne sur le toit de la voiture, le top-case du zém. */
export function habillerGoDrive(V) {
  if (!V?.g) return;
  const b = gabarit(V);
  if (V.D?.cache) {
    // L'enseigne du toit : 0,9 m de large, au milieu du pavillon, un peu en arrière (le pare-brise descend vers l'avant).
    const L = Math.min(.95, (b.max.x - b.min.x) * .5), z = (b.min.z + b.max.z) / 2 - .15;
    const face = mat('bandeau', bandeau(), .55), flanc = mat('carre', carre(), .55), plein = mat('orange', null);
    const m = new THREE.Mesh(new THREE.BoxGeometry(L, .24, .3), [flanc, flanc, plein, plein, face, face]);
    m.position.set(0, b.max.y + .12, z); m.castShadow = true; m.name = 'godrive-enseigne'; V.g.add(m);
    for (const x of [-L * .35, L * .35]) { const pied = new THREE.Mesh(new THREE.BoxGeometry(.05, .04, .2), MATS.pied ??= new THREE.MeshStandardMaterial({ color: '#222222', roughness: .6 })); pied.position.set(x, b.max.y + .01, z); V.g.add(pied); }
  } else {
    // Le top-case du zém : sur le porte-bagages, derrière le passager (VEHICULES.zem.arriere = −0,62 m).
    const logo = mat('carre-mat', carre()), plein = mat('orange', null);
    const m = new THREE.Mesh(new THREE.BoxGeometry(.42, .32, .36), [logo, logo, plein, plein, plein, logo]);
    m.position.set(0, .95, Math.max(b.min.z + .05, -1.02)); m.castShadow = true; m.name = 'godrive-topcase'; V.g.add(m);
  }
}
