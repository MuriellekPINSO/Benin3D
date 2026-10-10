import * as THREE from 'three';
import { personne } from './discussions.js';
import { K, panneauTexte } from './lieux.js';
import { CAMPAGNES, matAffiche } from './publicites.js';
import { scene } from './scene.js';

// ---------- Intérieurs : entrer dans les bâtiments (salon entre amis) ----------
// On entre par une porte dessinée sur la façade : devant elle, le salon propose « Entrer » ; dedans,
// « Sortir » ramène devant la porte. Comme dans les jeux de ville, la pièce est construite à part, en mer
// à plusieurs kilomètres de la côte et 40 m au-dessus de l'eau : sous son bâtiment, celui-ci lui ferait de
// l'ombre (soleil), et au ras de l'eau la mer passerait par-dessus le sol. La pièce peut être plus grande que
// le bâtiment ; elle n'est construite qu'à la première visite.
const LARGE = 7000, ALT = 40; // z (vers le sud) des pièces, en pleine mer, et hauteur du sol
export const INTERIEURS = new Map();
/**
 * Déclare un intérieur. def : { nom, porte: [x, z] devant la façade, dehors: regard vers la rue (radians),
 * w, d (pièce rectangulaire, mètres), entree: [x, z, regard] dans la pièce, construire(I) }.
 */
export function declarerInterieur(id, def) { INTERIEURS.set(id, { id, ...def, centre: [def.porte[0], LARGE], g: null, sieges: [] }); }
/** L'intérieur dont on est devant la porte (moins de 4 m), sinon null. */
export function porteProche(x, z) { for (const I of INTERIEURS.values()) if (Math.hypot(x - I.porte[0], z - I.porte[1]) < 4) return I; return null; }
/** Construit la pièce à la première visite et l'affiche. */
export function ouvrirInterieur(I) {
  if (!I.g) { const g = new THREE.Group(); g.name = `interieur-${I.id}`; g.position.set(I.centre[0], ALT, I.centre[1]); scene.add(g); I.g = g; K.into(g, () => I.construire(I)); }
  I.g.visible = true; return I;
}
export function cacherInterieurs() { for (const I of INTERIEURS.values()) if (I.g) I.g.visible = false; }
export const arriveeDedans = I => ({ x: I.centre[0] + I.entree[0], y: ALT, z: I.centre[1] + I.entree[1], cap: I.entree[2] });
export const arriveeDehors = I => ({ x: I.porte[0] + Math.sin(I.dehors) * 2.5, z: I.porte[1] + Math.cos(I.dehors) * 2.5, cap: I.dehors });
/** Garde un point entre les murs de la pièce. */
export function limiter(I, x, z, marge = .45) {
  const [cx, cz] = I.centre;
  return [THREE.MathUtils.clamp(x, cx - I.w / 2 + marge, cx + I.w / 2 - marge), THREE.MathUtils.clamp(z, cz - I.d / 2 + marge, cz + I.d / 2 - marge)];
}
/** La chaise libre la plus proche (moins de 4,5 m : on y va tout seul) : { x, z, cap } en coordonnées de la ville, ou null. */
export function siegeProche(I, x, z) {
  let best = null, dm = 4.5;
  for (const s of I.sieges) { const d = Math.hypot(x - (I.centre[0] + s.x), z - (I.centre[1] + s.z)); if (d < dm && !s.occupe) { dm = d; best = s; } }
  return best && { x: I.centre[0] + best.x, z: I.centre[1] + best.z, cap: best.cap };
}

// ---------- Matières ----------
K.motif('terrazzo', (c, t) => { // grandes dalles claires polies, éclats de pierre
  c.fillStyle = '#e8e2d6'; c.fillRect(0, 0, t, t);
  for (let i = 0; i < 700; i++) { c.fillStyle = ['#d6cdbd', '#f3efe7', '#c9bfae', '#b8ad9b'][i % 4]; c.fillRect(Math.random() * t, Math.random() * t, 2 + (i % 3), 2); }
  c.fillStyle = '#cfc6b6'; c.fillRect(0, 0, t, 2); c.fillRect(0, 0, 2, t);
});
K.motif('travertin', (c, t) => { c.fillStyle = '#ece5d6'; c.fillRect(0, 0, t, t); for (let i = 0; i < 26; i++) { c.fillStyle = i % 2 ? 'rgba(170,150,115,.12)' : 'rgba(255,255,255,.18)'; c.fillRect(0, Math.random() * t, t, 1 + Math.random() * 3); } c.fillStyle = 'rgba(120,100,70,.18)'; c.fillRect(0, t - 2, t, 2); });
K.motif('drapeauBenin', (c, t) => { const h = c.canvas.height; c.fillStyle = '#008751'; c.fillRect(0, 0, t * .4, h); c.fillStyle = '#fcd116'; c.fillRect(t * .4, 0, t * .6, h / 2); c.fillStyle = '#e8112d'; c.fillRect(t * .4, h / 2, t * .6, h / 2); }, 256, 170);

// Panneau de menu : nom du comptoir, plats et prix alignés.
function menu(titre, plats, couleur, w, h, x, y, z, rot) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * h / w); const c = cv.getContext('2d');
  c.fillStyle = '#1d1f22'; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = couleur; c.fillRect(0, 0, cv.width, 70);
  c.fillStyle = '#fff'; c.font = '800 34px system-ui, sans-serif'; c.textBaseline = 'middle'; c.fillText(titre, 22, 36, 470);
  c.font = '600 27px system-ui, sans-serif';
  plats.forEach(([nom, prix], k) => { const yy = 112 + k * 50; c.fillStyle = '#f3ecdf'; c.textAlign = 'left'; c.fillText(nom, 22, yy, 360); c.fillStyle = '#f5c21b'; c.textAlign = 'right'; c.fillText(prix, 490, yy); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  m.position.set(x, y, z); m.rotation.y = rot; m.userData.garder = true; K.racine.add(m); return m;
}

// ---------- Food court de la Cité ministérielle ----------
// D'après La Nation (octobre 2025) : un « food court » de bars et de restaurants sert le repas des agents,
// car il est interdit de manger dans les bureaux. Les comptoirs et les menus sont des exemples (plats
// béninois, prix en francs CFA), pas de vraies enseignes.
const COMPTOIRS = [
  ['Chez Tantie Rose', 'Cuisine béninoise', '#b5462b', [['Amiwo au poulet', '1 500 F'], ['Akassa, sauce poisson', '1 000 F'], ['Riz au gras', '1 000 F'], ['Haricots, gari, huile rouge', '700 F']]],
  ['Le Grill de la Marina', 'Braisés', '#7a3b1d', [['Poulet bicyclette braisé', '2 500 F'], ['Poisson braisé, aloko', '2 000 F'], ['Brochettes de bœuf', '1 000 F'], ['Aloko', '500 F']]],
  ['Saveurs du Mono', 'Ablo et spécialités', '#2f6b4f', [['Ablo, poisson frit', '1 500 F'], ['Ablo, sauce tomate', '1 000 F'], ['Wagasi frit', '1 000 F'], ['Atassi', '800 F']]],
  ['Pâtisserie du Littoral', 'Viennoiseries, café', '#8a5a2b', [['Croissant', '400 F'], ['Pain au chocolat', '450 F'], ['Gâteau du jour', '800 F'], ['Café ou thé', '500 F']]],
  ['Bissap & Cie', 'Jus frais', '#9d174d', [['Bissap', '300 F'], ['Jus d’ananas', '500 F'], ['Dèguè (lait caillé)', '500 F'], ['Eau minérale', '300 F']]],
];
function foodCourt(I) {
  const W = I.w, D = I.d, H = 4.6;
  const sol = K.boite(W, .2, D, K.tex('terrazzo', W / 4, D / 4), 0, -.1, 0); sol.castShadow = false;
  const plafond = K.boite(W, .2, D, '#f4f2ee', 0, H + .1, 0); plafond.castShadow = false;
  const mur = K.tex('travertin', 6, 1);
  for (const [w, d, x, z] of [[W, .3, 0, -D / 2], [W, .3, 0, D / 2], [.3, D, -W / 2, 0], [.3, D, W / 2, 0]]) K.boite(w, H, d, mur, x, H / 2, z).castShadow = false;
  // Dalles lumineuses au plafond (détection de présence, dit La Nation : ici toujours allumées).
  const led = K.mat('#ffffff', { emissif: '#fff4e0' });
  for (let x = -W / 2 + 3; x < W / 2 - 1; x += 4) for (let z = -D / 2 + 3; z < D / 2 - 1; z += 4) K.boite(1.2, .04, .6, led, x, H - .02, z).castShadow = false;
  // Baies vitrées à l'est (lumière du jour) et porte vitrée au nord, par où l'on est entré.
  const jour = K.mat('#dcebf2', { emissif: '#9fb9c4' });
  for (const z of [-7, 0, 7]) K.boite(.05, 2.6, 5, jour, W / 2 - .17, 2, z).castShadow = false;
  K.boite(3.6, 2.6, .08, K.mat('#5d7f8e', { transparent: .6, rugosite: .1 }), 0, 1.3, -D / 2 + .19).castShadow = false;
  panneauTexte(['SORTIE'], 1.4, .4, 0, 3, -D / 2 + .17, 0, { fond: '#1f7a3e', encre: '#ffffff', px: 512, py: 146 });
  panneauTexte(['RAPPEL', 'Les repas se prennent au food court,', 'pas dans les bureaux.'], 2.6, 1.2, 6.5, 1.8, -D / 2 + .17, 0, { fond: '#f3e9d2', encre: '#1d1a16', px: 1024, py: 472, police: '700 64px system-ui, sans-serif' });
  panneauTexte(['FOOD COURT · CITÉ MINISTÉRIELLE'], 14, .8, 0, H - .55, D / 2 - .17, Math.PI, { fond: '#ece5d6', encre: '#3d4448', px: 2048, py: 117, police: '800 70px system-ui, sans-serif' });
  // Comptoirs le long du mur sud : enseigne, menu, comptoir, et la cuisinière ou le vendeur derrière.
  COMPTOIRS.forEach(([nom, genre, couleur, plats], k) => {
    const x = -14.4 + k * 7.2;
    K.boite(6.4, 3.4, .1, K.mat(couleur, { rugosite: .7 }), x, 1.7, D / 2 - .2).castShadow = false;
    panneauTexte([nom, genre], 4.6, .9, x, 3.05, D / 2 - .26, Math.PI, { fond: couleur, encre: '#ffffff', px: 1024, py: 200, police: '800 72px "Bricolage Grotesque", system-ui, sans-serif' });
    menu(nom, plats, couleur, 2, 1.3, x + 1.9, 1.85, D / 2 - .27, Math.PI);
    K.boite(5.4, 1.05, .9, '#f2efe8', x, .52, D / 2 - 2.4); K.boite(5.5, .06, 1, K.mat('#3a3f44', { rugosite: .35 }), x, 1.08, D / 2 - 2.4);
    for (let p = 0; p < 3; p++) K.cyl(.22, .22, .12, 14, K.mat(['#c25a2a', '#e9d8a6', '#6b8e4e'][(p + k) % 3]), x - 1.4 + p * 1.1, 1.17, D / 2 - 2.4); // plats exposés
    const v = personne(500 + k, { role: k % 2 ? 'jeune' : 'vendeuse' }); v.position.set(x - .8, 0, D / 2 - 1.3); v.rotation.y = Math.PI; K.racine.add(v);
  });
  // Tables de quatre, allée centrale vers les comptoirs ; chaque chaise est un siège possible.
  const plateau = K.mat('#b98a5a', { rugosite: .6 }), metal = K.mat('#6d7478', { metal: .4, rugosite: .5 }), assise = K.mat('#2f8f8a', { rugosite: .6 });
  let n = 0;
  for (const tx of [-15, -9, -3.4, 3.4, 9, 15]) for (const tz of [-5.5, -.5, 4.5]) {
    K.boite(1.5, .05, .95, plateau, tx, .75, tz); K.cyl(.05, .05, .72, 8, metal, tx, .37, tz); K.cyl(.32, .32, .03, 16, metal, tx, .02, tz);
    for (const [cx, cz, cap] of [[-.42, -.85, 0], [.42, -.85, 0], [-.42, .85, Math.PI], [.42, .85, Math.PI]]) {
      const x = tx + cx, z = tz + cz, dos = cap ? .22 : -.22;
      K.boite(.46, .05, .44, assise, x, .46, z); K.boite(.46, .46, .05, assise, x, .72, z + dos); K.cyl(.025, .025, .44, 6, metal, x, .22, z);
      I.sieges.push({ x, z, cap });
      // Des agents déjeunent déjà à quelques tables.
      if ((n++ * 7) % 11 === 3) { const p = personne(600 + n, { assise: true }); p.position.set(x, .47, z); p.rotation.y = cap; K.racine.add(p); I.sieges[I.sieges.length - 1].occupe = true; }
    }
  }
  // Plantes, drapeau, écran publicitaire.
  for (const [x, z] of [[-W / 2 + 1.2, -D / 2 + 1.2], [W / 2 - 1.2, -D / 2 + 1.2], [-W / 2 + 1.2, D / 2 - 3.4], [W / 2 - 1.2, D / 2 - 3.4]]) { K.cyl(.38, .3, .7, 12, '#d9d2c4', x, .35, z); K.sphere(.75, K.mat('#4f7a3c', { rugosite: .9 }), x, 1.35, z).scale.set(1, 1.3, 1); }
  K.cyl(.04, .04, 3.2, 8, metal, -W / 2 + 2.6, 1.6, -D / 2 + 1); const dr = K.boite(1.2, .8, .02, K.tex('drapeauBenin', 1, 1), -W / 2 + 3.2, 2.75, -D / 2 + 1); dr.castShadow = false;
  const pub = CAMPAGNES.find(c => c.id === 'moov-meilleur') || CAMPAGNES[0];
  K.boite(.12, 1.95, 3.45, '#1a1c1f', -W / 2 + .22, 2.5, 0);
  const ecran = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), matAffiche(pub)); ecran.position.set(-W / 2 + .3, 2.5, 0); ecran.rotation.y = Math.PI / 2; ecran.userData.garder = true; K.racine.add(ecran);
}

// ---------- Porte du food court sur la façade nord du bâtiment-parking (appelé par lieux-marina.js) ----------
export function porteFoodCourt(g, ring) {
  const xs = ring.map(p => p[0]), zs = ring.map(p => p[1]), px = (Math.min(...xs) + Math.max(...xs)) / 2, pz = Math.min(...zs);
  const lx = px - g.position.x, lz = pz - g.position.z;
  K.boite(4.4, 3, .2, K.mat('#2c4a57', { rugosite: .15, metal: .2 }), lx, 1.5, lz - .12); // portes vitrées
  K.boite(6, .25, 2.2, '#efede7', lx, 3.3, lz - 1.1); // auvent
  panneauTexte(['FOOD COURT'], 4.6, .7, lx, 3.85, lz - .2, Math.PI, { fond: '#1f3d4a', encre: '#f5c21b', px: 1024, py: 156, police: '800 96px system-ui, sans-serif' });
  declarerInterieur('cite-foodcourt', { nom: 'le food court de la Cité ministérielle', porte: [px, pz - 1.5], dehors: Math.PI, w: 40, d: 26, entree: [0, -9.5, 0], construire: foodCourt });
}
