import * as THREE from 'three';

// ---------- Le casque intégral ----------
// « Ce qu'on a actuellement n'est pas réaliste » (26/10, photo d'un casque intégral en carbone à l'appui) : une
// demi-sphère posée sur la tête. Voici un vrai casque intégral : coque ovale qui descend sous le menton, écran fumé
// et son bandeau pare-soleil, pivots de l'écran sur les côtés, mentonnière et son aération, petit becquet à l'arrière,
// bourrelet de caoutchouc autour du cou. Coque en carbone (le tissage en sergé, sous un vernis brillant) ou peinte.
// Pas de marque : celle de la photo est une marque déposée.
//
// Repère : celui de l'ancien casque, que coiffer() (personnages.js) pose 15 cm sous le sommet du crâne ; l'avant
// vers +z, comme le regard des personnages. Un peu moins de 1 000 triangles.

const COULEURS = ['#c8382f', '#f2f2ee', '#2f6fb0', '#e9b23a']; // les peints ; le carbone est tiré une fois sur deux
const M = { mats: new Map(), carbone: null, geo: null };

/** Le tissage du carbone : des mèches en sergé 2/2, chacune avec son reflet, qu'un vernis brillant recouvre. */
function carbone() {
  if (M.carbone) return M.carbone;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
  c.fillStyle = '#16181b'; c.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const trame = (i + j) % 4 < 2, x = i * 8, y = j * 8; // deux mèches dessus, deux dessous, décalées d'un cran à chaque rang
    const g = trame ? c.createLinearGradient(x, y, x + 8, y) : c.createLinearGradient(x, y, x, y + 8);
    g.addColorStop(0, '#202327'); g.addColorStop(.5, trame ? '#4a4f56' : '#3a3f45'); g.addColorStop(1, '#1c1e21');
    c.fillStyle = g; c.fillRect(x + .5, y + .5, 7, 7);
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 5); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (M.carbone = t);
}
function mat(cle) {
  if (M.mats.has(cle)) return M.mats.get(cle);
  const m = cle === 'carbone' ? new THREE.MeshPhysicalMaterial({ map: carbone(), roughness: .32, metalness: .3, clearcoat: 1, clearcoatRoughness: .06 })
    : cle === 'ecran' ? new THREE.MeshPhysicalMaterial({ color: '#161a1f', roughness: .04, metalness: .25, clearcoat: 1, clearcoatRoughness: .02 })
    : cle === 'bandeau' ? new THREE.MeshStandardMaterial({ color: '#0a0b0d', roughness: .2, metalness: .2 })
    : cle === 'caoutchouc' ? new THREE.MeshStandardMaterial({ color: '#121315', roughness: .9 })
    : cle === 'pivot' ? new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: .4, metalness: .6 })
    : new THREE.MeshPhysicalMaterial({ color: cle, roughness: .28, metalness: .05, clearcoat: 1, clearcoatRoughness: .05 }); // peint et verni
  M.mats.set(cle, m); return m;
}
// La coque : un ovoïde (14,5 cm de demi-largeur, 19 de demi-hauteur, 16,5 d'avant en arrière) ouvert sous le cou.
const RX = .145, RY = .19, RZ = .165, CY = .01, BAS = .78 * Math.PI;
function geometries() {
  if (M.geo) return M.geo;
  const calotte = (phi0, phiL, th0, thL, k = 1, seg = [28, 10]) => new THREE.SphereGeometry(1, seg[0], seg[1], phi0, phiL, th0, thL).scale(RX * k, RY * k, RZ * k).translate(0, CY, 0);
  const avant = Math.PI / 2; // dans SphereGeometry, φ = π/2 regarde vers +z
  const g = {
    coque: new THREE.SphereGeometry(1, 40, 26, 0, Math.PI * 2, 0, BAS).scale(RX, RY, RZ).translate(0, CY, 0),
    ecran: calotte(avant - .98, 1.96, .37 * Math.PI, .2 * Math.PI, 1.025), // des sourcils au nez, sur 112°
    bandeau: calotte(avant - .98, 1.96, .345 * Math.PI, .03 * Math.PI, 1.03, [28, 2]),
    menton: calotte(avant - .55, 1.1, .6 * Math.PI, .14 * Math.PI, 1.035, [16, 4]), // la mentonnière, un peu en relief
    aeration: new THREE.BoxGeometry(.05, .012, .012),
    pivot: new THREE.CylinderGeometry(.022, .022, .012, 14).rotateZ(Math.PI / 2),
    becquet: new THREE.BoxGeometry(.09, .018, .07),
    bourrelet: new THREE.TorusGeometry(1, .12, 8, 30).rotateX(Math.PI / 2), // ramené à 1,2 cm d'épaisseur plus bas
  };
  const r = Math.sin(BAS); g.bourrelet.scale(RX * r, .1, RZ * r).translate(0, CY + Math.cos(BAS) * RY, 0);
  return (M.geo = g);
}

/** Un casque intégral, prêt à poser avec coiffer(). `teinte` : 'carbone', une couleur, ou rien (tirée au sort). */
export function casqueIntegral(teinte = Math.random() < .5 ? 'carbone' : COULEURS[Math.floor(Math.random() * COULEURS.length)]) {
  const G = geometries(), g = new THREE.Group(), coque = mat(teinte);
  const piece = (geo, m, x = 0, y = 0, z = 0) => { const p = new THREE.Mesh(geo, m); p.position.set(x, y, z); p.castShadow = true; g.add(p); return p; };
  piece(G.coque, coque);
  piece(G.ecran, mat('ecran')); piece(G.bandeau, mat('bandeau'));
  piece(G.menton, coque);
  piece(G.aeration, mat('bandeau'), 0, CY - .095, RZ * .93).rotation.x = -.5; // la grille de la mentonnière
  for (const s of [-1, 1]) piece(G.pivot, mat('pivot'), s * RX * .99, CY + .055, .045); // les pivots de l'écran
  const b = piece(G.becquet, coque, 0, CY + RY * .82, -RZ * .62); b.rotation.x = -.55; // le becquet, en haut à l'arrière
  piece(G.bourrelet, mat('caoutchouc'));
  g.name = 'casque'; g.userData.casque = true;
  return g;
}

/** Le casque de moto qu'on porte sur une moto ou derrière un zém (« Vivre à Cotonou »), et qu'on ôte en descendant. */
export function porterCasque(p, oui) {
  const c = p?.userData.casqueMoto;
  if (oui && !c && p.userData.coiffer) { const k = casqueIntegral(); p.userData.coiffer(k); p.userData.casqueMoto = k; }
  else if (!oui && c) { c.parent?.remove(c); p.userData.casqueMoto = null; }
}
