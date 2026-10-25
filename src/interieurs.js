import * as THREE from 'three';
import { personne } from './discussions.js';
import { K, centroide, groupeLieu, obb, panneauTexte } from './lieux.js';
import { CAMPAGNES, matAffiche } from './publicites.js';
import { scene, sky } from './scene.js';
import { reduireImage } from './textures.js';

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
 * w, d (pièce rectangulaire, mètres), entree: [x, z, regard] dans la pièce, construire(I) }. Facultatif : centre
 * (où construire la pièce, en mer), plafond (hauteur sous laquelle la caméra reste), entrer (texte du bouton).
 */
export function declarerInterieur(id, def) { INTERIEURS.set(id, { id, ...def, centre: def.centre ?? [def.porte[0], LARGE], g: null, sieges: [], comptoirs: [], guichets: [], assis: [], obstacles: [] }); }
/** L’intérieur dont on est devant la porte (moins de 7 m : le zém dépose à côté de sa moto, parfois à 5,6 m), sinon null. */
export function porteProche(x, z) { let best = null, bd = 7; for (const I of INTERIEURS.values()) { const d = Math.hypot(x - I.porte[0], z - I.porte[1]); if (d < bd) { bd = d; best = I; } } return best; }
/** Étiquette jaune, de taille fixe à l'écran, vue à travers les murs : « Chez toi » sur la porte, douche, billetterie… */
export function etiquette(texte) {
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 72; const c = cv.getContext('2d');
  c.font = '800 30px system-ui, sans-serif'; const w = Math.min(300, c.measureText(texte).width + 44);
  c.fillStyle = '#f2b705'; c.beginPath(); c.roundRect(160 - w / 2, 8, w, 54, 27); c.fill(); c.fillStyle = '#17130c'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(texte, 160, 36);
  const t = new THREE.CanvasTexture(reduireImage(cv)); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false })); sp.scale.set(.145, .033, 1); sp.renderOrder = 30; return sp;
}
/** Construit la pièce à la première visite et l'affiche. */
export function ouvrirInterieur(I) {
  if (!I.g) {
    const g = new THREE.Group(); g.name = `interieur-${I.id}`; g.position.set(I.centre[0], ALT, I.centre[1]); scene.add(g); I.g = g; K.into(g, () => I.construire(I));
    for (const o of g.children) if (o.userData?.jouer || o.userData?.pnj) I.obstacles.push([o.position.x, o.position.z, .22, .22]); // vendeurs, clients, voisins : on ne les traverse pas
  }
  I.g.visible = true; allumer(I); return I;
}
// Une pièce n'avait aucune lumière à elle : tout le jeu n'est éclairé que par le ciel et le soleil, qui
// n'entrent pas sous un toit. Les enduits tombaient dans un gris plat — « espace vide », « c'est bizarre et
// vilain » au réveil dans la chambre, et « la nuit, l'intérieur de certains lieux n'est pas éclairé » (trois
// testeurs, 24/10). Une seule lampe pour tout le jeu, posée au milieu de la pièce où l'on se trouve : les
// matériaux sont des Lambert, une lumière de plus ne coûte presque rien, et elle s'éteint dès qu'on ressort.
const LAMPE = new THREE.PointLight(0xffeec8, 0, 26, 1.4);
LAMPE.visible = false; scene.add(LAMPE);
function allumer(I) {
  LAMPE.position.set(I.centre[0], ALT + (I.plafond ? I.plafond - .45 : 2.3), I.centre[1]);
  LAMPE.distance = Math.max(I.w, I.d) * 1.6;
  LAMPE.intensity = Math.max(I.w, I.d) * 1.1; // décroissance en 1/d² : une grande pièce demande une lampe plus forte
  LAMPE.visible = true;
}
export function cacherInterieurs() { LAMPE.visible = false; for (const I of INTERIEURS.values()) if (I.g) I.g.visible = false; }

// ---------- La nuit, on voit où sont les portes ----------
// « La nuit, les entrées des bâtiments sont peu visibles » (un testeur, 24/10). À Cotonou, une boutique ouverte
// le soir, c'est d'abord une ampoule au-dessus de la porte. On en pose une à chaque entrée : un seul nuage de
// points pour toutes, comme les lampadaires de la rue (trafic.js), allumé par ambiances.js selon l'heure.
export function allumerLesPortes() {
  if (!INTERIEURS.size || PORTES.n === INTERIEURS.size) return;
  // Les intérieurs ne sont pas tous déclarés en même temps : la maison, les agences et les commerces arrivent
  // après le food court et l'aéroport. On refait le nuage quand il en manque — quelques dizaines de points.
  if (PORTES.points) { scene.remove(PORTES.points); PORTES.points.geometry.dispose(); PORTES.points.material.map?.dispose(); PORTES.points.material.dispose(); }
  PORTES.n = INTERIEURS.size;
  const pos = [];
  // I.porte est dans la ville, au niveau de la mer — pas dans la pièce, qui est bâtie à 40 m au large (ALT).
  for (const I of INTERIEURS.values()) pos.push(I.porte[0], 2.5, I.porte[1]);
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,246,220,1)'); gr.addColorStop(.22, 'rgba(255,206,130,.9)'); gr.addColorStop(1, 'rgba(255,170,70,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  PORTES.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 5.5, map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffd79a', opacity: 0, fog: true }));
  PORTES.points.renderOrder = 20; PORTES.points.visible = false; scene.add(PORTES.points);
}
/** `nuit` de 0 à 1 (ambiances.js) : les ampoules des portes s'allument au crépuscule. */
export function majPortesDeNuit(nuit) {
  if (nuit > .05) allumerLesPortes(); // au crépuscule : on prend les portes déclarées depuis
  if (!PORTES.points) return;
  PORTES.points.visible = nuit > .05;
  PORTES.points.material.opacity = Math.min(1, nuit * 1.25);
}
const PORTES = { points: null, n: 0 };
// Dans une pièce, on ne dessine que ce qui l'entoure : la ville est à des kilomètres, derrière les murs, et coûtait
// pourtant 3,4 millions de triangles par image (assez pour faire fermer la page sur téléphone). Liste faite à l'entrée.
const HORS = { I: null, liste: [] };
/** Ce qu'il ne faut pas dessiner quand on est dans la pièce I, vue de p : tout ce qui est à plus de 150 m, sauf les lumières. */
export function horsDeLaPiece(I, p) {
  if (!I) { HORS.I = null; HORS.liste.length = 0; return HORS.liste; }
  if (HORS.I !== I) {
    HORS.I = I; HORS.liste.length = 0; const b = new THREE.Box3();
    // Jamais le ciel : il suit la caméra d'une image à l'autre, mais la liste se fait une fois pour toutes à
    // l'entrée, et il était alors encore posé sur la ville, à des kilomètres de la pièce — donc rangé parmi les
    // choses lointaines et caché tant qu'on restait dedans. Dans la cour, à ciel ouvert, on voyait le fond de la
    // page au-dessus des murs (« espace vide », un testeur le 24/10).
    for (const o of scene.children) if (!o.isLight && o !== I.g && o !== sky && !b.setFromObject(o).isEmpty() && b.distanceToPoint(p) > 150) HORS.liste.push(o);
  }
  return HORS.liste;
}
export const arriveeDedans = I => ({ x: I.centre[0] + I.entree[0], y: ALT, z: I.centre[1] + I.entree[1], cap: I.entree[2] });
export const arriveeDehors = I => ({ x: I.porte[0] + Math.sin(I.dehors) * 2.5, z: I.porte[1] + Math.cos(I.dehors) * 2.5, cap: I.dehors });
/** Garde un point entre les murs de la pièce. */
export function limiter(I, x, z, marge = .45) {
  const [cx, cz] = I.centre;
  return [THREE.MathUtils.clamp(x, cx - I.w / 2 + marge, cx + I.w / 2 - marge), THREE.MathUtils.clamp(z, cz - I.d / 2 + marge, cz + I.d / 2 - marge)];
}
// Meubles qu'on ne traverse pas (comptoirs, tables, guichets, colonnes…) : boîtes [x, z, demi-largeur, demi-profondeur] de la pièce,
// et leur hauteur quand c'est une cloison (la caméra ne passe pas au travers, voir murEntre).
const bloc = (I, w, d, x, z) => I.obstacles.push([x, z, w / 2, d / 2]);
/** Part du trajet de (ax, az) vers (bx, bz) (coordonnées de la ville) faite avant de buter sur une cloison : 1 si rien ne gêne. */
export function murEntre(I, ax, az, bx, bz) {
  const lx = ax - I.centre[0], lz = az - I.centre[1], dx = bx - ax, dz = bz - az;
  for (let i = 1; i <= 16; i++) {
    const f = i / 16, x = lx + dx * f, z = lz + dz * f;
    for (const [ox, oz, hw, hd, h] of I.obstacles) if (h > 1.8 && Math.abs(x - ox) < hw + .15 && Math.abs(z - oz) < hd + .15) return Math.max(.12, (i - 1) / 16);
  }
  return 1;
}
/** De combien (x, z) de la ville, avec un rayon r, entre dans un meuble de la pièce (0 : libre). */
export function profondeurInterieur(I, x, z, r = .3) {
  const lx = x - I.centre[0], lz = z - I.centre[1]; let p = 0;
  for (const [bx, bz, hw, hd] of I.obstacles) { const u = Math.abs(lx - bx), v = Math.abs(lz - bz); if (u < hw + r && v < hd + r) p = Math.max(p, Math.min(hw + r - u, hd + r - v)); }
  return p;
}
/** Le comptoir devant lequel on se tient (moins de 2,5 m) : { nom, plats, vendeur, x, z } en coordonnées de la ville, ou null. */
export function comptoirProche(I, x, z) {
  for (const c of I.comptoirs) { const cx = I.centre[0] + c.x, cz = I.centre[1] + c.z; if (Math.hypot(x - cx, z - cz) < 2.5) return { ...c, x: cx, z: cz }; }
  return null;
}
/** Le guichet devant lequel on se tient (billetterie, porte d'embarquement…) : { id, nom, agent, x, z } en coordonnées de la ville, ou null. */
export function guichetProche(I, x, z) {
  for (const c of I?.guichets || []) { const cx = I.centre[0] + c.x, cz = I.centre[1] + c.z; if (Math.hypot(x - cx, z - cz) < 2.6) return { ...c, x: cx, z: cz }; }
  return null;
}
/** Point de la pièce en coordonnées de la ville. */
export const dansLaPiece = (I, x, z, cap = 0) => ({ x: I.centre[0] + x, y: ALT, z: I.centre[1] + z, cap });
/** Le plateau de la table devant une chaise (x, z, regard) : où poser l'assiette. */
export const devantChaise = (x, z, cap) => ({ x: x + Math.sin(cap) * .5, z: z + Math.cos(cap) * .5, y: .79 });
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
  const t = new THREE.CanvasTexture(reduireImage(cv)); t.colorSpace = THREE.SRGBColorSpace;
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
    panneauTexte([nom, genre], 4.6, .9, x, 3.05, D / 2 - .26, Math.PI, { fond: couleur, encre: '#ffffff', px: 1024, py: 200, police: '800 72px "Google Sans", system-ui, sans-serif' });
    menu(nom, plats, couleur, 2, 1.3, x + 1.9, 1.85, D / 2 - .27, Math.PI);
    K.boite(5.4, 1.05, .9, '#f2efe8', x, .52, D / 2 - 2.4); K.boite(5.5, .06, 1, K.mat('#3a3f44', { rugosite: .35 }), x, 1.08, D / 2 - 2.4); bloc(I, 5.5, 1, x, D / 2 - 2.4);
    for (let p = 0; p < 3; p++) K.cyl(.22, .22, .12, 14, K.mat(['#c25a2a', '#e9d8a6', '#6b8e4e'][(p + k) % 3]), x - 1.4 + p * 1.1, 1.17, D / 2 - 2.4); // plats exposés
    const v = personne(500 + k, { role: k % 2 ? 'jeune' : 'vendeuse' }); v.position.set(x - .8, 0, D / 2 - 1.3); v.rotation.y = Math.PI; K.racine.add(v);
    I.comptoirs.push({ nom, plats: plats.map(([p, prix]) => [p, Number(prix.replace(/\D/g, ''))]), vendeur: v, x: x - .8, z: D / 2 - 3.3 }); // on commande devant le comptoir
  });
  // Tables de quatre, allée centrale vers les comptoirs ; chaque chaise est un siège possible.
  const plateau = K.mat('#b98a5a', { rugosite: .6 }), metal = K.mat('#6d7478', { metal: .4, rugosite: .5 }), assise = K.mat('#2f8f8a', { rugosite: .6 });
  let n = 0;
  for (const tx of [-15, -9, -3.4, 3.4, 9, 15]) for (const tz of [-5.5, -.5, 4.5]) {
    K.boite(1.5, .05, .95, plateau, tx, .75, tz); K.cyl(.05, .05, .72, 8, metal, tx, .37, tz); K.cyl(.32, .32, .03, 16, metal, tx, .02, tz); bloc(I, 1.5, .95, tx, tz);
    for (const [cx, cz, cap] of [[-.42, -.85, 0], [.42, -.85, 0], [-.42, .85, Math.PI], [.42, .85, Math.PI]]) {
      const x = tx + cx, z = tz + cz, dos = cap ? .22 : -.22;
      K.boite(.46, .05, .44, assise, x, .46, z); K.boite(.46, .46, .05, assise, x, .72, z + dos); K.cyl(.025, .025, .44, 6, metal, x, .22, z);
      I.sieges.push({ x, z, cap });
      // Des agents déjeunent déjà à quelques tables.
      if ((n++ * 7) % 11 === 3) { const p = personne(600 + n, { assise: true }); p.position.set(x, .47, z); p.rotation.y = cap; K.racine.add(p); I.sieges[I.sieges.length - 1].occupe = true; I.assis.push({ p, x, z, cap }); } // clients du serveur (metiers-ville.js)
    }
  }
  // Plantes, drapeau, écran publicitaire.
  for (const [x, z] of [[-W / 2 + 1.2, -D / 2 + 1.2], [W / 2 - 1.2, -D / 2 + 1.2], [-W / 2 + 1.2, D / 2 - 3.4], [W / 2 - 1.2, D / 2 - 3.4]]) { K.cyl(.38, .3, .7, 12, '#d9d2c4', x, .35, z); K.sphere(.75, K.mat('#4f7a3c', { rugosite: .9 }), x, 1.35, z).scale.set(1, 1.3, 1); bloc(I, .8, .8, x, z); }
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

// ---------- Hall de l'aéroport de Cotonou : billetterie des vols découverte, porte d'embarquement (vol.js) ----------
// On entre par le grand portail blanc de la façade côté ville. Dedans : les comptoirs d'enregistrement,
// l'écran des départs, la billetterie des vols découverte (Cotonou → Ouidah), des rangées de sièges et la
// porte 2, vitrée, qui donne sur le tarmac. Les départs affichés sont des exemples, sans compagnie réelle.
const DEPARTS_AFFICHES = [['10:30', 'OUIDAH · vol découverte', '2', 'Embarquement'], ['11:15', 'LOMÉ', '4', 'À l’heure'], ['12:05', 'ABIDJAN', '5', 'À l’heure'], ['13:40', 'LAGOS', '3', 'Enregistrement'], ['15:20', 'PARIS CDG', '6', 'À l’heure'], ['17:55', 'DAKAR', '4', 'Retardé']];
function ecranDeparts(w, h, x, y, z, rot) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = Math.round(1024 * h / w); const c = cv.getContext('2d');
  c.fillStyle = '#0d1a2b'; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = '#f2c21b'; c.fillRect(0, 0, cv.width, 78);
  c.fillStyle = '#0d1a2b'; c.font = '800 46px system-ui, sans-serif'; c.textBaseline = 'middle'; c.fillText('DÉPARTS · DEPARTURES', 26, 40);
  c.font = '600 26px system-ui, sans-serif'; c.fillStyle = '#9fb2c8'; [['Heure', 26], ['Destination', 160], ['Porte', 700], ['Statut', 800]].forEach(([t, x]) => c.fillText(t, x, 106));
  c.font = '700 34px system-ui, sans-serif';
  DEPARTS_AFFICHES.forEach(([hh, dest, porte, statut], k) => {
    const yy = 152 + k * 52; if (k % 2) { c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(0, yy - 26, cv.width, 52); }
    c.fillStyle = '#ffffff'; c.fillText(hh, 26, yy); c.fillText(dest, 160, yy, 520); c.fillText(porte, 716, yy);
    c.fillStyle = statut === 'Embarquement' ? '#5fd38a' : statut === 'Retardé' ? '#ff8a6a' : '#f2c21b'; c.fillText(statut, 800, yy, 210);
  });
  const t = new THREE.CanvasTexture(reduireImage(cv)); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  m.position.set(x, y, z); m.rotation.y = rot; m.userData.garder = true; K.racine.add(m); return m;
}
function hallAeroport(I) {
  const W = I.w, D = I.d, H = 8;
  K.boite(W, .2, D, K.tex('terrazzo', W / 4, D / 4), 0, -.1, 0).castShadow = false;
  K.boite(W, .2, D, '#f4f2ee', 0, H + .1, 0).castShadow = false;
  const blanc = K.mat('#efede7', { rugosite: .9 });
  for (const [w, d, x, z] of [[W, .3, 0, -D / 2], [.3, D, -W / 2, 0], [.3, D, W / 2, 0]]) K.boite(w, H, d, blanc, x, H / 2, z).castShadow = false;
  // Mur sud, côté pistes : grandes baies vitrées sur le tarmac (lumière du jour), montants gris.
  const jour = K.mat('#dcebf2', { emissif: '#a9c4cf' }), gris = K.mat('#7d868b', { metal: .3, rugosite: .5 });
  K.boite(W, H, .1, jour, 0, H / 2, D / 2 - .05).castShadow = false;
  for (let x = -W / 2; x <= W / 2; x += 3.2) K.boite(.18, H, .25, gris, x, H / 2, D / 2 - .2);
  K.boite(W, .25, .3, gris, 0, 2.9, D / 2 - .2); K.boite(W, 1.2, .3, '#e9e6de', 0, H - .6, D / 2 - .22);
  panneauTexte(['AÉROPORT INTERNATIONAL CARDINAL BERNARDIN GANTIN · COTONOU'], 26, 1, 0, H - .6, D / 2 - .4, Math.PI, { fond: '#e9e6de', encre: '#2c3a40', px: 2048, py: 79, police: '800 50px system-ui, sans-serif' });
  // Colonnes rondes et dalles lumineuses.
  for (const x of [-15, -5, 5, 15]) for (const z of [-5, 5]) { K.cyl(.45, .45, H, 18, blanc, x, H / 2, z); bloc(I, .9, .9, x, z); }
  const led = K.mat('#ffffff', { emissif: '#fff4e0' });
  for (let x = -W / 2 + 3; x < W / 2 - 1; x += 5) for (let z = -D / 2 + 3; z < D / 2 - 1; z += 5) K.boite(1.6, .04, .8, led, x, H - .02, z).castShadow = false;
  // Entrée côté ville (par où l'on est arrivé) : portes vitrées, sortie vers les taxis et les zéms.
  K.boite(4.4, 3, .08, K.mat('#5d7f8e', { transparent: .6, rugosite: .1 }), 0, 1.5, -D / 2 + .19).castShadow = false;
  panneauTexte(['SORTIE · Taxis, zéms'], 3.4, .5, 0, 3.4, -D / 2 + .17, 0, { fond: '#1f7a3e', encre: '#ffffff', px: 1024, py: 150, police: '800 74px system-ui, sans-serif' });
  // Comptoirs d'enregistrement le long du mur ouest, tapis à bagages, agents à deux d'entre eux.
  panneauTexte(['ENREGISTREMENT · CHECK-IN'], 12, .8, -W / 2 + .17, 4.6, 0, Math.PI / 2, { fond: '#1f3d4a', encre: '#ffffff', px: 2048, py: 136, police: '800 84px system-ui, sans-serif' });
  for (let k = 0; k < 5; k++) {
    const z = -8 + k * 4;
    K.boite(.9, 1.1, 2.2, '#e9e6de', -W / 2 + 4, .55, z); K.boite(1, .06, 2.3, K.mat('#3a3f44', { rugosite: .35 }), -W / 2 + 4, 1.12, z); bloc(I, 1, 2.3, -W / 2 + 4, z);
    K.boite(1.6, .35, .9, '#2b2f33', -W / 2 + 5.4, .2, z + 1.5); bloc(I, 1.6, .9, -W / 2 + 5.4, z + 1.5); // tapis à bagages
    panneauTexte([String(k + 1)], .7, .7, -W / 2 + .2, 2.6, z, Math.PI / 2, { fond: '#f2c21b', encre: '#1d1a16', px: 256, py: 256 });
    if (k % 2 === 0) { const a = personne(700 + k, { role: 'bureau' }); a.position.set(-W / 2 + 2.9, 0, z); a.rotation.y = Math.PI / 2; K.racine.add(a); }
    if (k === 0 || k === 2) for (let q = 0; q < 2; q++) { const p = personne(710 + k * 3 + q); p.position.set(-W / 2 + 6 + q * 1.4, 0, z + .3); p.rotation.y = -Math.PI / 2; K.racine.add(p); K.boite(.42, .62, .26, ['#2f4f6f', '#7a2f2a', '#3a3a3a'][(k + q) % 3], -W / 2 + 6.1 + q * 1.4, .31, z + .85); } // voyageurs et leurs valises
  }
  // Écran des départs, au-dessus de l'allée vers la porte 2.
  K.boite(7.4, 3.6, .2, '#1a1c1f', -7, 5.2, D / 2 - .45);
  ecranDeparts(7, 3.2, -7, 5.2, D / 2 - .57, Math.PI);
  // Billetterie des vols découverte, le long du mur est, près de l'entrée.
  const bleu = '#1f5fa8';
  K.boite(.1, 3.4, 6.4, K.mat(bleu, { rugosite: .7 }), W / 2 - .2, 1.7, -5.5).castShadow = false;
  panneauTexte(['BILLETTERIE', 'Vols découverte'], 5, 1, W / 2 - .27, 3.05, -5.5, -Math.PI / 2, { fond: bleu, encre: '#ffffff', px: 1024, py: 205, police: '800 76px system-ui, sans-serif' });
  panneauTexte(['Cotonou → Ouidah · 12 000 F', 'Le long de la côte · env. 10 min', 'Avion 4 places, pilote compris', 'Premier vol offert'], 2.6, 1.5, W / 2 - .27, 1.75, -3.6, -Math.PI / 2, { fond: '#f6f4ee', encre: '#1d1a16', px: 1024, py: 590, police: '700 60px system-ui, sans-serif' });
  K.boite(.9, 1.05, 5, '#f2efe8', W / 2 - 4, .52, -5.5); K.boite(1, .06, 5.1, K.mat('#3a3f44', { rugosite: .35 }), W / 2 - 4, 1.08, -5.5); bloc(I, 1, 5.1, W / 2 - 4, -5.5);
  const agentBillets = personne(720, { role: 'bureau' }); agentBillets.position.set(W / 2 - 2.8, 0, -5.5); agentBillets.rotation.y = -Math.PI / 2; K.racine.add(agentBillets);
  I.guichets.push({ id: 'billetterie', nom: 'la billetterie', agent: agentBillets, x: W / 2 - 5.2, z: -5.5 });
  const repere = (texte, x, y, z) => { const e = etiquette(texte); e.position.set(x, y, z); K.racine.add(e); }; // vus de tout le hall, à travers les colonnes
  repere('Billetterie', W / 2 - 4, 1.3, -5.5); // juste au-dessus du comptoir : plus haut, elle passait sous la barre du salon en entrant
  panneauTexte(['← Billetterie · vols pour Ouidah'], 4.2, .5, 9, 4.2, -5.3, 0, { fond: '#1f3d4a', encre: '#f5c21b', px: 1024, py: 122, police: '800 64px system-ui, sans-serif' }); // vu en entrant
  // Porte 2 : portique de sécurité, pupitre de l'agente, porte vitrée sur le tarmac.
  K.boite(3, 3, .12, K.mat('#5d7f8e', { transparent: .55, rugosite: .1 }), 0, 1.5, D / 2 - .3).castShadow = false;
  panneauTexte(['PORTE 2 · EMBARQUEMENT', 'Vol découverte pour Ouidah'], 5.2, 1, 0, 3.7, D / 2 - .5, Math.PI, { fond: '#f2c21b', encre: '#1d1a16', px: 1024, py: 197, police: '800 70px system-ui, sans-serif' });
  for (const s of [-1, 1]) { K.boite(.18, 2.3, .6, '#9aa3a8', s * .55, 1.15, D / 2 - 5.5); bloc(I, .18, .6, s * .55, D / 2 - 5.5); }
  K.boite(1.3, .22, .6, '#9aa3a8', 0, 2.38, D / 2 - 5.5);
  K.boite(1.1, 1.05, .6, '#2c3a40', 2.4, .52, D / 2 - 2.8); K.boite(1.2, .05, .7, '#e9e6de', 2.4, 1.07, D / 2 - 2.8); bloc(I, 1.2, .7, 2.4, D / 2 - 2.8);
  const agentPorte = personne(721, { role: 'bureau' }); agentPorte.position.set(2.4, 0, D / 2 - 1.9); agentPorte.rotation.y = Math.PI; K.racine.add(agentPorte);
  I.guichets.push({ id: 'porte', nom: 'la porte 2', agent: agentPorte, x: 1.6, z: D / 2 - 4 });
  repere('Porte 2', 0, 2.9, D / 2 - 5.5);
  // Rangées de sièges face aux pistes ; chaque siège est une place où s'asseoir.
  const assise = K.mat('#2b4f7a', { rugosite: .6 }), pied = K.mat('#6d7478', { metal: .4, rugosite: .5 });
  let n = 0;
  for (const z of [-1.5, 2, 5.5]) for (const cote of [-1, 1]) {
    const x0 = cote * 7.5;
    K.boite(6.2, .08, .5, pied, x0, .42, z); for (const dx of [-2.6, 0, 2.6]) K.boite(.08, .42, .08, pied, x0 + dx, .21, z); bloc(I, 6.2, .5, x0, z - .1);
    for (let k = 0; k < 6; k++) {
      const x = x0 - 2.5 + k; K.boite(.5, .06, .46, assise, x, .46, z); K.boite(.5, .5, .06, assise, x, .74, z - .22);
      I.sieges.push({ x, z, cap: 0 });
      if ((n++ * 5) % 9 === 2) { const p = personne(730 + n, { assise: true }); p.position.set(x, .47, z); K.racine.add(p); I.sieges[I.sieges.length - 1].occupe = true; } // des voyageurs attendent déjà
    }
  }
  // Plantes, drapeau, écran publicitaire près de l'entrée.
  for (const [x, z] of [[-W / 2 + 1.2, -D / 2 + 1.2], [W / 2 - 1.2, -D / 2 + 1.2], [-W / 2 + 1.2, D / 2 - 1.5], [W / 2 - 1.2, D / 2 - 1.5]]) { K.cyl(.45, .35, .8, 12, '#d9d2c4', x, .4, z); K.sphere(.85, K.mat('#4f7a3c', { rugosite: .9 }), x, 1.5, z).scale.set(1, 1.35, 1); }
  K.cyl(.04, .04, 3.4, 8, pied, -4.2, 1.7, -D / 2 + 1); const dr = K.boite(1.2, .8, .02, K.tex('drapeauBenin', 1, 1), -3.6, 2.95, -D / 2 + 1); dr.castShadow = false;
  const pub = CAMPAGNES.find(c => c.id === 'moov-meilleur') || CAMPAGNES[0];
  K.boite(3.45, 1.95, .12, '#1a1c1f', -9, 2.6, -D / 2 + .22);
  const ecran = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), matAffiche(pub)); ecran.position.set(-9, 2.6, -D / 2 + .3); ecran.userData.garder = true; K.racine.add(ecran);
}
/** Porte du hall au pied du grand portail blanc de l'aérogare, côté ville (même calcul que lieux.js, aeroport()). */
export function declarerAeroport(A) {
  if (!A?.terminals?.length || !A.runway) return;
  const main = A.terminals[0], c = centroide(main), rw = A.runway, ra = rw[0], rb = rw[rw.length - 1];
  const t = ((c[0] - ra[0]) * (rb[0] - ra[0]) + (c[1] - ra[1]) * (rb[1] - ra[1])) / ((rb[0] - ra[0]) ** 2 + (rb[1] - ra[1]) ** 2);
  const px = ra[0] + (rb[0] - ra[0]) * t, pz = ra[1] + (rb[1] - ra[1]) * t, vl = Math.hypot(c[0] - px, c[1] - pz) || 1, lx = (c[0] - px) / vl, lz = (c[1] - pz) / vl;
  const o = obb(main), prof = Math.min(o.L, o.W) / 2 + 6, rot = Math.atan2(lx, lz);
  const g = groupeLieu('aeroport-porte', c[0] + lx * (prof + .3), c[1] + lz * (prof + .3)); g.rotation.y = rot;
  K.into(g, () => {
    const verre = K.mat('#4d6f7e', { transparent: .7, rugosite: .1, metal: .2 });
    for (const s of [-1, 1]) K.boite(1.9, 2.8, .08, verre, s * 1, 1.4, 0).castShadow = false; // portes coulissantes
    K.boite(4.4, .2, .3, '#c9cdd0', 0, 2.9, 0);
    panneauTexte(['DÉPARTS · DEPARTURES'], 3.6, .55, 0, 3.4, .1, 0, { fond: '#1f3d4a', encre: '#f5c21b', px: 1024, py: 156, police: '800 84px system-ui, sans-serif' });
    K.cyl(.05, .05, 1.2, 8, '#8f979b', 3.4, .6, 1.6);
    panneauTexte(['Billetterie', 'Vols pour Ouidah'], 1.3, .8, 3.4, 1.55, 1.62, 0, { fond: '#1f5fa8', encre: '#ffffff', px: 512, py: 315, police: '800 84px system-ui, sans-serif' });
  });
  declarerInterieur('aeroport-hall', { nom: 'le hall de l’aéroport', porte: [c[0] + lx * (prof + 1.8), c[1] + lz * (prof + 1.8)], dehors: rot, w: 46, d: 30, entree: [0, -12.5, 1.3], construire: hallAeroport }); // en entrant, la billetterie un peu à droite du centre (à gauche de la porte 2, hors de l'écran sinon ; sur téléphone, le panneau « Ma vie » couvre le haut gauche)
}

// ---------- Agences : MTN, Moov, accueil de la Cité ministérielle (métiers en entreprise, metiers-ville.js) ----------
// Une agence générique aux couleurs de l'entreprise : guichets au fond (le 1 est celui du joueur), salle
// d'attente, borne à tickets, et le bureau vitré de la direction générale dans un coin. Le texte des
// panneaux est générique : pas de logo ni de vraie campagne.
function agence(I) {
  const W = I.w, D = I.d, H = 4.2, A = I.agence;
  K.boite(W, .2, D, K.tex('terrazzo', W / 4, D / 4), 0, -.1, 0).castShadow = false;
  K.boite(W, .2, D, '#f6f5f2', 0, H + .1, 0).castShadow = false;
  const blanc = K.mat('#f2f0ea', { rugosite: .9 });
  for (const [w, d, x, z] of [[W, .3, 0, -D / 2], [.3, D, -W / 2, 0], [.3, D, W / 2, 0]]) K.boite(w, H, d, blanc, x, H / 2, z).castShadow = false;
  K.boite(W, H, .3, K.mat(A.couleur, { rugosite: .7 }), 0, H / 2, D / 2); // mur du fond aux couleurs de l'entreprise
  panneauTexte([A.titre], 12, 1, 0, H - .9, D / 2 - .17, Math.PI, { fond: A.couleur, encre: A.encre, px: 2048, py: 171, police: '800 110px system-ui, sans-serif' });
  const led = K.mat('#ffffff', { emissif: '#fff4e0' });
  for (let x = -W / 2 + 3; x < W / 2 - 1; x += 4) for (let z = -D / 2 + 2.5; z < D / 2 - 1; z += 4) K.boite(1.2, .04, .6, led, x, H - .02, z).castShadow = false;
  K.boite(3.6, 2.6, .08, K.mat('#5d7f8e', { transparent: .6, rugosite: .1 }), 0, 1.3, -D / 2 + .19).castShadow = false; // porte d'entrée vitrée
  panneauTexte(['SORTIE'], 1.4, .4, 0, 3, -D / 2 + .17, 0, { fond: '#1f7a3e', encre: '#ffffff', px: 512, py: 146 });
  // Guichets, le long du mur du fond.
  const gris = K.mat('#3a3f44', { rugosite: .35 });
  for (let k = 0; k < 4; k++) {
    const x = -7.5 + k * 4.2, z = D / 2 - 3.2;
    K.boite(3.4, 1.1, .7, '#ece9e2', x, .55, z); K.boite(3.5, .06, .8, gris, x, 1.12, z); bloc(I, 3.5, .8, x, z);
    K.boite(.55, .38, .04, '#1d2024', x + .6, 1.42, z + .1); K.boite(.05, .25, .05, gris, x + .6, 1.22, z + .1); // écran
    panneauTexte([`GUICHET ${k + 1}`], 1.8, .45, x, 2.6, D / 2 - .17, Math.PI, { fond: '#1d2024', encre: '#f5c21b', px: 1024, py: 256, police: '800 120px system-ui, sans-serif' });
    if (k) { const a = personne(760 + k, { role: 'bureau' }); a.position.set(x, 0, z + 1); a.rotation.y = Math.PI; K.racine.add(a); }
    else I.guichets.push({ id: 'poste', nom: 'ton guichet', x, z: z + 1 }); // le joueur se tient derrière le 1
  }
  // Salle d'attente : rangées de sièges face aux guichets, borne à tickets.
  const assise = K.mat(A.siege || '#2b4f7a', { rugosite: .6 }), pied = K.mat('#6d7478', { metal: .4, rugosite: .5 });
  for (const z of [-3.6, -1.6]) for (const cote of [-1, 1]) {
    const x0 = cote * 4.2; K.boite(4.6, .08, .5, pied, x0, .42, z); bloc(I, 4.6, .5, x0, z - .1);
    for (let k = 0; k < 4; k++) { const x = x0 - 1.5 + k; K.boite(.5, .06, .46, assise, x, .46, z); K.boite(.5, .5, .06, assise, x, .74, z - .22); I.sieges.push({ x, z, cap: 0 }); }
  }
  K.boite(.6, 1.4, .5, '#2c3a40', W / 2 - 2, .7, -D / 2 + 2); bloc(I, .6, .5, W / 2 - 2, -D / 2 + 2); panneauTexte(['TICKETS'], .6, .2, W / 2 - 2, 1.25, -D / 2 + 1.74, 0, { fond: A.couleur, encre: A.encre, px: 512, py: 170 });
  panneauTexte(A.affiche, 3.2, 1.8, -W / 2 + .17, 2.1, -1, Math.PI / 2, { fond: '#f6f4ee', encre: '#1d1a16', px: 1024, py: 576, police: '700 66px system-ui, sans-serif' });
  // Le bureau du DG, vitré, dans le coin : bureau, fauteuil (un siège), plante, panneau.
  const bx = W / 2 - 3.2, bz = D / 2 - 3.4, verre = K.mat('#9fc3d1', { transparent: .45, rugosite: .1 });
  // Cloisons vitrées : à l'ouest, et devant avec une porte d'1,2 m (de bx − 1,5 à bx − 0,3).
  K.boite(.08, 2.6, 4.6, verre, bx - 2.6, 1.3, bz).castShadow = false; bloc(I, .12, 4.6, bx - 2.6, bz);
  K.boite(1.1, 2.6, .08, verre, bx - 2.05, 1.3, bz - 2.3).castShadow = false; bloc(I, 1.1, .12, bx - 2.05, bz - 2.3);
  K.boite(2.9, 2.6, .08, verre, bx + 1.15, 1.3, bz - 2.3).castShadow = false; bloc(I, 2.9, .12, bx + 1.15, bz - 2.3);
  K.boite(1.8, .06, .9, K.mat('#5a3a22', { rugosite: .5 }), bx, .76, bz + .4); K.boite(1.7, .72, .08, K.mat('#5a3a22'), bx, .37, bz + .82); bloc(I, 1.8, .9, bx, bz + .4);
  K.boite(.6, .08, .6, '#1d2024', bx, .5, bz + 1.3); K.boite(.6, .7, .08, '#1d2024', bx, .9, bz + 1.6); I.sieges.push({ x: bx, z: bz + 1.3, cap: Math.PI, dg: true });
  panneauTexte(['DIRECTION GÉNÉRALE'], 2.4, .35, bx, 2.4, bz - 2.26, 0, { fond: '#1d2024', encre: '#ffffff', px: 1024, py: 150, police: '800 84px system-ui, sans-serif' });
  K.cyl(.3, .24, .6, 12, '#d9d2c4', bx + 2, .3, bz - 1.6); K.sphere(.6, K.mat('#4f7a3c', { rugosite: .9 }), bx + 2, 1.2, bz - 1.6).scale.set(1, 1.3, 1);
  I.dg = { x: bx, z: bz - 1 }; // devant le bureau du DG
  for (const [x, z] of [[-W / 2 + 1, -D / 2 + 1], [-W / 2 + 1, D / 2 - 1]]) { K.cyl(.38, .3, .7, 12, '#d9d2c4', x, .35, z); K.sphere(.75, K.mat('#4f7a3c', { rugosite: .9 }), x, 1.35, z).scale.set(1, 1.3, 1); bloc(I, .8, .8, x, z); }
}
/** Une agence et sa porte sur la façade (porte : [x, z] devant la façade ; dehors : regard vers la rue). */
export function declarerAgence(id, { nom, porte, dehors, ...agenceDef }) {
  const g = groupeLieu(`porte-${id}`, porte[0] - Math.sin(dehors) * 1.2, porte[1] - Math.cos(dehors) * 1.2); g.rotation.y = dehors;
  K.into(g, () => {
    K.boite(3.2, 2.8, .12, K.mat('#4d6f7e', { transparent: .7, rugosite: .1, metal: .2 }), 0, 1.4, 0).castShadow = false;
    panneauTexte([agenceDef.enseigne], 4, .6, 0, 3.3, .1, 0, { fond: agenceDef.couleur, encre: agenceDef.encre, px: 1024, py: 154, police: '800 84px system-ui, sans-serif' });
  });
  declarerInterieur(id, { nom, porte, dehors, w: 24, d: 16, entree: [0, -6.5, 0], agence: agenceDef, construire: agence });
}
