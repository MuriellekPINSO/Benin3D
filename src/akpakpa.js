// Akpakpa : le Centre communautaire EYA, dessiné d'après ses photos et posé à sa vraie place (akpakpa-sites.js).
// « Retournons à Akpakpa : fais le centre EYA, la société La Béninoise, l'hôtel 8 Janvier, et on doit pouvoir entrer
// dedans et faire la visite ; trouve des photos de ces endroits en ligne » (Murielle, 23/11).
// Photos regardées (jamais posées en texture) : eyacenter.com et son album Flickr officiel, Tripadvisor (avis 2022-2024),
// image satellite Esri. Le campus est fait de pavillons de plain-pied :
//  - l'entrée sur la route de Porto-Novo : socle noir « Centre Communautaire » en lettres cuivre, trois planches de bois
//    foncé debout et le logo EYA jaune ; un totem de bois, des lampadaires blancs à chapeau rond, des frangipaniers, la
//    clôture d'acier noir côté route ;
//  - des kiosques en planches de pin orangé, toits de tôle à quatre pans ; des « arbres-parasols » (un poteau, des bras
//    inclinés, un carré de lattes) ; le long bâtiment de bois (conteneurs habillés) au toit-terrasse grillagé et son escalier
//    de métal noir ; le gazebo au toit turquoise ; la pelouse et ses bancs courbes rouges ;
//  - le terrain de basket (dalles grises, raquettes rouges, rond central noir au logo rouge), grillage noir de 6 m,
//    gradins de bois posés sur des conteneurs noirs aux fenêtres orange ;
//  - l'amphithéâtre (murs blancs, un volume saumon, pergola de lattes, toit d'arcs d'acier et de panneaux translucides) :
//    on y entre (gradins en demi-cercle de béton gris au nez orange, scène de carrelage brun, régie en haut) ;
//  - le studio d'enregistrement « EYA STUDIO » (panneaux de bois perforés orange, console, LED bleues ; la cabine à la
//    moquette grise, la fresque de masques, la batterie, le canapé) : on y entre par le long bâtiment.
// Ce qu'on n'a pas trouvé en photo (salle informatique, bibliothèque, salle de danse, restaurant) n'est pas inventé.
import * as THREE from 'three';
import { bulle, personne } from './discussions.js';
import { INTERIEURS, declarerInterieur } from './interieurs.js';
import { K, bake, groupeLieu, guerite, panneauTexte, voiture } from './lieux.js';
import { chargerDanses, personnagesPrets, poserAssis } from './personnages.js';
import { poserObstacles } from './rue.js';
import { EYA, HOTEL, ROND_POINT_BENINOISE, SOB, SOB_BORDS, SUPER_U, monde } from './akpakpa-sites.js';
import { COURSES, resume, sauverCourses } from './courses.js';
import { jourDe } from './journee.js';
import { coucher, lever } from './maison.js';
import { VIE, depenser, gagner } from './vie.js';
import { scene } from './scene.js';

// ---------- Outils ----------
const mats = new Map();
/** Matériau dessiné sur une toile (une fois par clé) ; `alpha` : le transparent de la toile découpe la forme. */
function toile(cle, w, h, dessin, o = {}) {
  if (mats.has(cle)) return mats.get(cle);
  const c = document.createElement('canvas'); c.width = w; c.height = h; dessin(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (o.repete) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repete[0], o.repete[1]); }
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: o.rugosite ?? .85, metalness: o.metal ?? 0, alphaTest: o.alpha ? .5 : 0, side: o.face2 ? THREE.DoubleSide : THREE.FrontSide });
  if (o.lumineux) { m.emissive = new THREE.Color('#ffffff'); m.emissiveMap = t; m.emissiveIntensity = o.lumineux; }
  mats.set(cle, m); return m;
}
/** Un plan vertical (face vers +z local, tourné de `ry`). */
function plan(w, h, mat, x, y, z, ry = 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; K.racine.add(m); return m; }
const bloc = (I, w, d, x, z, h = 1) => I.obstacles.push([x, z, w / 2, d / 2, h]);
// Au sol, quelques centimètres au-dessus de la ville : décalé en profondeur, sinon le sable de la carte repasse dessus
// quand on le regarde de loin et de biais (comme solPoly, lieux.js). Une image entière sur le rectangle (le terrain de
// basket) ou une tuile tous les `tuile` mètres.
const DECALES = new Map();
function auSol(w, d, mat, x, z, y = .05, tuile = 0) {
  if (!DECALES.has(mat)) DECALES.set(mat, Object.assign(mat.clone(), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -10 }));
  const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
  if (tuile) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tuile, uv.getY(i) * d / tuile); }
  const m = new THREE.Mesh(g, DECALES.get(mat)); m.position.set(x, y, z); m.receiveShadow = true; K.racine.add(m); return m;
}

// Planches verticales de pin orangé (kiosques), bardage horizontal (long bâtiment), bois foncé (enseigne).
const planches = (cle, fond, teintes, vertical, n = 10) => toile(cle, 256, 256, (c, w, h) => {
  c.fillStyle = fond; c.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { c.fillStyle = teintes[i % teintes.length]; if (vertical) c.fillRect(i * w / n, 0, w / n - 3, h); else c.fillRect(0, i * h / n, w, h / n - 3); }
  c.fillStyle = 'rgba(40,20,8,.18)'; for (let i = 0; i < 300; i++) c.fillRect(Math.random() * w, Math.random() * h, vertical ? 1 : 6, vertical ? 6 : 1); // le fil du bois
});
const pin = () => planches('pin', '#7a4320', ['#b8692c', '#c0733a', '#a95f27', '#c77d43'], true);
const bardage = () => planches('bardage', '#6e3b1c', ['#b76b37', '#a95f2f', '#c27841', '#b06634'], false, 12);
/** Le grillage noir (terrain de basket, toit-terrasse) : mailles de 8 cm, transparent entre les fils. */
const grillage = (rx, ry) => toile(`grillage|${rx}|${ry}`, 128, 128, (c, w, h) => {
  c.clearRect(0, 0, w, h); c.strokeStyle = '#141414'; c.lineWidth = 3;
  for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * w / 8, 0); c.lineTo(i * w / 8 - w / 16, h); c.stroke(); c.beginPath(); c.moveTo(i * w / 8, 0); c.lineTo(i * w / 8 + w / 16, h); c.stroke(); }
}, { alpha: true, face2: true, repete: [rx, ry], rugosite: .6, metal: .3 });
/** La clôture d'acier noir côté route : barreaux et branches. */
const barreaux = rx => toile(`barreaux|${rx}`, 256, 128, (c, w, h) => {
  c.clearRect(0, 0, w, h); c.fillStyle = '#121212';
  c.fillRect(0, 0, w, 7); c.fillRect(0, h - 7, w, 7);
  for (let i = 0; i < 8; i++) c.fillRect(i * w / 8, 0, 5, h);
  c.strokeStyle = '#121212'; c.lineWidth = 4;
  for (let i = 0; i < 4; i++) { const x0 = i * w / 4 + 10; c.beginPath(); c.moveTo(x0, h - 8); c.bezierCurveTo(x0 + 20, h * .6, x0 + 6, h * .4, x0 + 34, h * .18); c.moveTo(x0 + 14, h * .55); c.quadraticCurveTo(x0 + 34, h * .5, x0 + 46, h * .36); c.stroke(); }
}, { alpha: true, face2: true, repete: [rx, 1], rugosite: .5, metal: .4 });
/** Le logo EYA (lettres jaunes, découpées). */
const logoEya = () => toile('logoEya', 512, 256, (c, w, h) => {
  c.clearRect(0, 0, w, h); c.fillStyle = '#f5c400'; c.font = '900 210px "Arial Black", "Google Sans", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('EYA', w / 2, h / 2 + 10, w * .96);
}, { alpha: true, rugosite: .4, metal: .2 });

// ---------- Le terrain de basket (15 × 28 m) ----------
// Dalles de sport grises, lignes blanches, raquettes rouges, rond central noir et le grand logo rouge en « P » (photo du site).
function terrainBasket() {
  const px = 22; // pixels par mètre
  return toile('basketEya', 15 * px, 28 * px, (c, w, h) => {
    c.fillStyle = '#a9b3bf'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(70,80,92,.25)'; c.lineWidth = 1; for (let x = 0; x < w; x += px * .5) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y < h; y += px * .5) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    const m = v => v * px;
    c.fillStyle = '#d9453a'; for (const y0 of [0, h - m(5.8)]) c.fillRect(w / 2 - m(2.45), y0, m(4.9), m(5.8)); // les raquettes
    c.strokeStyle = '#ffffff'; c.lineWidth = 3;
    c.strokeRect(2, 2, w - 4, h - 4); c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
    for (const [y0, s] of [[0, 1], [h, -1]]) {
      c.strokeRect(w / 2 - m(2.45), Math.min(y0, y0 + s * m(5.8)), m(4.9), m(5.8));
      c.beginPath(); c.arc(w / 2, y0 + s * m(5.8), m(1.8), 0, Math.PI * 2); c.stroke(); // le cercle des lancers francs
      c.beginPath(); c.arc(w / 2, y0 + s * m(1.575), m(6.75), s > 0 ? .13 : Math.PI + .13, s > 0 ? Math.PI - .13 : -.13); c.stroke(); // la ligne à trois points
    }
    // Le rond central noir et son logo rouge.
    c.fillStyle = '#1b1d20'; c.beginPath(); c.arc(w / 2, h / 2, m(2.6), 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#d9453a'; c.lineWidth = m(.14); c.beginPath(); c.arc(w / 2, h / 2, m(2.35), 0, Math.PI * 2); c.stroke();
    c.lineWidth = m(.42); c.lineCap = 'round'; c.beginPath(); c.moveTo(w / 2 - m(.8), h / 2 + m(1.5)); c.lineTo(w / 2 - m(.8), h / 2 - m(1.4)); c.stroke();
    c.beginPath(); c.arc(w / 2 - m(.05), h / 2 - m(.65), m(.75), -Math.PI / 2, Math.PI / 2); c.lineTo(w / 2 - m(.8), h / 2 + m(.1)); c.stroke();
    c.beginPath(); c.moveTo(w / 2 - m(1.5), h / 2 + m(.5)); c.lineTo(w / 2 + m(1.2), h / 2 + m(.5)); c.stroke();
  }, { rugosite: .7 });
}

// ---------- Le campus ----------
/** Bâtit le Centre EYA (main.js, après la ville) ; renvoie les obstacles de la rue (repère du monde). */
function centreEya() {
  const R = EYA, g = groupeLieu('centre-eya', R.o[0], R.o[1], R.ang), obst = [];
  const A = { x: 24, z: -13, w: 22, d: 17, h: 4.4 }; // l'amphithéâtre (sa façade au sud, sur la promenade)
  const ob = (x, z, w, d, r = 0) => { const [X, Z] = monde(R, x, z); obst.push([X, Z, -R.ang + r, w, d]); };
  K.into(g, () => {
    // Le sol : pelouse, allées de béton clair (#D9DADB).
    auSol(142, 52.5, K.tex('gazon', 1, 1), -7, .25, .04, 4);
    const beton = K.mat('#d9dadb', { rugosite: .9 });
    for (const [w, d, x, z] of [[4.4, 30.5, 2, 11.3], [84, 4, -4, -2], [24, 3, -33, -16.5]]) auSol(w, d, beton, x, z, .07);
    // La clôture côté route (acier noir sur muret), l'entrée au milieu ; les murs crépis des côtés ; au nord, le mur du
    // stade René Pleven et ses tourelles rondes de béton.
    const creme = K.mat('#d8d0c0', { rugosite: .95 }), noir = K.mat('#151515', { rugosite: .5, metal: .4 });
    for (const [x0, x1] of [[-78, -3], [7, 64]]) {
      const L = x1 - x0, cx = (x0 + x1) / 2;
      K.boite(L, .45, .3, creme, cx, .22, 26.5); plan(L, 1.5, barreaux(Math.round(L / 2.2)), cx, 1.2, 26.5);
      for (let x = x0; x <= x1; x += 2.5) K.boite(.1, 2, .1, noir, x, 1, 26.5);
      ob(cx, 26.5, L, .4);
    }
    for (const x of [-3, 7]) { K.boite(.6, 2.4, .6, '#2a2a2a', x, 1.2, 26.5); ob(x, 26.5, .6, .6); } // les piliers de l'entrée
    for (const x of [-78, 64]) { K.boite(.3, 2.4, 53, creme, x, 1.2, .25); ob(x, .25, .3, 53); }
    K.boite(142, 2.8, .35, K.mat('#bdb6a8', { rugosite: .95 }), -7, 1.4, -26); ob(-7, -26, 142, .4);
    for (let x = -70; x < 64; x += 26) { K.cyl(.9, .9, 3.4, 14, '#b3ac9e', x, 1.7, -26.6); K.cyl(1, 1, .2, 14, '#9e978a', x, 3.45, -26.6); }

    // L'entrée : socle noir et ses lettres cuivre, trois planches de bois foncé debout, le logo EYA jaune ; le totem.
    const xE = -7.5; // à gauche de l'allée, face à la route : on le lit depuis le trottoir, à travers la clôture
    K.boite(4.2, .7, .8, '#141414', xE, .35, 23.6); ob(xE, 23.6, 4.4, 1);
    panneauTexte(['Centre Communautaire'], 3.6, .36, xE, .4, 24.02, 0, { fond: '#141414', encre: '#c98a4b', px: 1024, py: 102, police: '600 62px "Google Sans", system-ui, sans-serif' });
    const fonce = K.mat('#6b4a2e', { rugosite: .7 });
    for (const [x, h] of [[-1.05, 1.5], [0, 1.75], [1.05, 1.6]]) K.boite(.95, h, .14, fonce, xE + x, .7 + h / 2, 23.45);
    plan(2.7, 1.35, logoEya(), xE, 1.55, 23.56).userData.garder = true;
    K.boite(.55, 2.6, .55, fonce, 10, 1.3, 23.2); K.boite(.6, .2, .6, '#141414', 10, 2.7, 23.2); plan(.5, .25, logoEya(), 10, 2.2, 23.48).userData.garder = true; ob(10, 23.2, .6, .6);

    // Lampadaires blancs à chapeau rond.
    const blanc = K.mat('#f2f2ee', { rugosite: .5 }), ampoule = K.mat('#fff3d6', { emissif: '#ffd98a' });
    for (const [x, z] of [[-.6, 7], [4.6, 7], [-.6, 16], [4.6, 16], [-40, -5.2], [-26, -5.2], [-12, -5.2], [12, -5.2], [20, 1.2]]) {
      K.cyl(.07, .1, 3.6, 8, blanc, x, 1.8, z); K.cyl(.42, .42, .07, 16, blanc, x, 3.66, z); K.sphere(.16, ampoule, x, 3.48, z); ob(x, z, .3, .3);
    }
    // Frangipaniers : tronc court et branches, bouquets de feuilles, fleurs blanches.
    const tronc = K.mat('#8a7a66'), feuilles = K.mat('#5f8f3f'), fleurs = K.mat('#fbf4ea');
    for (const [x, z, s] of [[-12, 21.5, 1], [13.5, 21, 1.1], [-6, 9, .9], [10, 9.5, 1], [-46, 18, 1.2], [44, 16, 1.1], [52, -10, 1]]) {
      K.cyl(.12 * s, .2 * s, 1.6 * s, 7, tronc, x, .8 * s, z);
      for (const [dx, dz, dy] of [[.7, .2, 2.1], [-.6, .5, 2.2], [.1, -.7, 2.4], [-.2, .1, 2.7]]) {
        K.cable([x, 1.4 * s, z], [x + dx * s, dy * s, z + dz * s], .07 * s, tronc);
        K.sphere(.62 * s, feuilles, x + dx * s, dy * s + .25, z + dz * s).scale.set(1, .6, 1);
        K.sphere(.13 * s, fleurs, x + dx * s + .25, dy * s + .55, z + dz * s - .1);
      }
      ob(x, z, .5, .5);
    }
    for (const [x, z] of [[-30, 22.5], [-14, 22.5], [24, 22.5], [40, 22.5], [56, 21], [-50, -20], [56, -20]]) { K.cocotier(x, z); ob(x, z, .5, .5); }

    // Les kiosques : planches de pin orangé, toit de tôle à quatre pans, un volet relevé en auvent.
    const tole = K.mat('#8f989b', { rugosite: .55, metal: .4 }), sombre = K.mat('#2a1d13');
    for (const x of [-40, -33, -26, -19, -12]) {
      K.boite(3, 2.8, 3, pin(), x, 1.4, -9);
      const toit = K.cone(2.55, 1, 4, tole, x, 3.3, -9); toit.rotation.y = Math.PI / 4;
      K.boite(1.6, .9, .05, sombre, x, 1.55, -7.48);
      const volet = K.boite(1.7, .05, .85, pin(), x, 2.1, -7.15); volet.rotation.x = -.35;
      K.boite(1.7, .08, .4, pin(), x, 1.05, -7.3); // la tablette
      ob(x, -9, 3.2, 3.2);
    }
    // Les arbres-parasols : poteau, six bras inclinés, carré de lattes à 4 m.
    const latte = K.mat('#a5683a', { rugosite: .8 });
    for (const x of [-36.5, -29.5, -22.5, -15.5]) {
      const z = -6.3; K.cyl(.14, .2, 4.1, 8, latte, x, 2.05, z); ob(x, z, .45, .45);
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + .3; K.cable([x, 2.9, z], [x + Math.cos(a) * 2, 4.05, z + Math.sin(a) * 2], .05, latte); }
      for (let k = 0; k < 9; k++) K.boite(4.8, .05, .2, latte, x, 4.12, z - 2.2 + k * .55);
    }
    // Le long bâtiment de bois (conteneurs habillés) : bandeau de fenêtres, la porte du studio, toit-terrasse grillagé,
    // escalier de métal noir à l'est.
    K.boite(38, 3, 3.5, bardage(), -25, 1.5, -22.25); ob(-25, -22.25, 38.2, 3.7);
    plan(30, .75, K.mat('#26343b', { rugosite: .2, metal: .3 }), -27, 2, -20.48);
    K.boite(1.1, 2.15, .06, K.mat('#3b2616', { rugosite: .6 }), -20, 1.07, -20.46);
    panneauTexte(['EYA STUDIO'], 1.9, .42, -20, 2.62, -20.44, 0, { fond: '#9c6031', encre: '#ffffff', px: 1024, py: 226, police: '800 120px "Google Sans", system-ui, sans-serif' });
    for (const [w, x, z, r] of [[38, -25, -20.55, 0], [38, -25, -23.95, 0], [3.4, -43.95, -22.25, Math.PI / 2], [3.4, -6.05, -22.25, Math.PI / 2]]) { const m = plan(w, 1.1, grillage(Math.round(w * 2), 2), x, 3.55, z, r); m.castShadow = false; }
    for (let k = 0; k < 10; k++) K.boite(.45, .05, 1, noir, -2.3 - k * .42, .3 * (k + 1), -19.85);
    K.cable([-1.9, 0, -20.35], [-6.4, 3, -20.35], .05, noir); K.cable([-1.9, 0, -19.35], [-6.4, 3, -19.35], .05, noir);
    K.cable([-1.9, 1, -19.35], [-6.4, 4, -19.35], .03, noir); ob(-4.2, -19.85, 4.8, 1.1);
    // Le gazebo au toit de tuiles turquoise.
    for (const [dx, dz] of [[-2.1, -2.1], [2.1, -2.1], [2.1, 2.1], [-2.1, 2.1]]) { K.cyl(.1, .12, 2.6, 8, latte, 13 + dx, 1.3, 17 + dz); ob(13 + dx, 17 + dz, .3, .3); }
    const gz = K.cone(3.5, 1.7, 4, K.mat('#3a9aa5', { rugosite: .5, metal: .2 }), 13, 3.45, 17); gz.rotation.y = Math.PI / 4;
    K.cyl(.05, .05, .6, 6, noir, 13, 4.5, 17);
    K.boite(2.2, .45, .5, latte, 13, .23, 17); // un banc sous le gazebo
    // La pelouse : buttes d'herbe et bancs courbes à lattes rouges.
    const rouge = K.mat('#c0281e', { rugosite: .6 }), butte = K.mat('#6f9a45');
    for (const [cx, cz, a0] of [[-4, 4.5, .2], [9, 12.5, 3.4], [16, 5, .4]]) {
      K.sphere(2.6, butte, cx, -.6, cz).scale.set(1.5, .55, 1);
      for (let k = 0; k <= 10; k++) {
        const a = a0 + k * .18, x = cx + Math.cos(a) * 3.6, z = cz + Math.sin(a) * 3.6;
        const s = K.boite(.34, .07, .5, rouge, x, .46, z); s.rotation.y = -a;
        const d = K.boite(.3, .5, .05, rouge, cx + Math.cos(a) * 3.9, .75, cz + Math.sin(a) * 3.9); d.rotation.y = -a + Math.PI / 2;
      }
      ob(cx, cz, 5, 5);
    }

    // Le terrain de basket : enclos de 25 × 32 m, grillage noir de 6 m et voiles d'ombrage, gradins sur conteneurs.
    const B = { x: -62, z: 9 };
    auSol(25, 32, K.mat('#8f99a6', { rugosite: .8 }), -62.5, B.z, .06);
    auSol(15, 28, terrainBasket(), B.x, B.z, .08);
    const blancPur = K.mat('#f4f4f2'), orange = K.mat('#d9452f', { metal: .3, rugosite: .5 });
    for (const s of [-1, 1]) {
      const zb = B.z + s * 15.3, zp = B.z + s * 12.8;
      K.cyl(.1, .12, 3.4, 8, '#3a3d40', B.x, 1.7, zb); K.boite(.12, .12, 2.5, '#3a3d40', B.x, 3.35, (zb + zp) / 2);
      K.boite(1.8, 1.05, .05, blancPur, B.x, 3.35, zp); K.boite(.6, .45, .06, '#d9452f', B.x, 3.2, zp - s * .01);
      const cercle = K.maillage(K.geo('cercleBasket', () => new THREE.TorusGeometry(.23, .02, 6, 18)), orange, B.x, 3.05, zp - s * .38); cercle.rotation.x = Math.PI / 2;
      ob(B.x, zb, .4, .4);
    }
    const E = { x0: -75, x1: -50, z0: -7, z1: 25 };
    for (const [w, x, z, r, porte] of [[25, -62.5, E.z0, 0], [25, -62.5, E.z1, 0], [32, E.x0, B.z, Math.PI / 2], [32, E.x1, B.z, Math.PI / 2, true]]) {
      const morceaux = porte ? [[w / 2 - 2.5, -w / 4 - 1.25], [w / 2 - 2.5, w / 4 + 1.25]] : [[w, 0]]; // une porte de 5 m à l'est, côté campus
      for (const [lw, o] of morceaux) {
        const cx = r ? x : x + o, cz = r ? z + o : z;
        plan(lw, 6, grillage(Math.round(lw * 1.5), 6), cx, 3, cz, r).castShadow = false;
        plan(lw, 1.6, K.mat('#101010', { face2: true }), cx, 5.2, cz, r).castShadow = false; // la voile d'ombrage noire
        ob(cx, cz, r ? .3 : lw, r ? lw : .3);
      }
      for (let k = 0; k <= w; k += 4) K.boite(.12, 6.2, .12, noir, r ? x : x - w / 2 + k, 3.1, r ? z - w / 2 + k : z);
    }
    // Les gradins : deux conteneurs noirs (fenêtres cadrées d'orange) et trois rangs de bois dessus.
    const cont = K.mat('#1d1d1d', { rugosite: .6, metal: .3 }), cadre = K.mat('#e0782c'), vitre = K.mat('#2f3b42', { rugosite: .2 });
    for (const z of [2, 16]) {
      K.boite(2.4, 2.6, 12, cont, -73.2, 1.3, z);
      for (let k = -4; k <= 4; k += 4) { K.boite(.05, 1.1, 1.8, cadre, -71.98, 1.5, z + k); K.boite(.06, .9, 1.6, vitre, -71.97, 1.5, z + k); }
      for (let k = 0; k < 3; k++) K.boite(.8, .45, 12, K.mat('#b07a45', { rugosite: .8 }), -73.9 + k * .7, 2.82 + k * .45, z);
      ob(-73.2, z, 2.5, 12.1);
    }

    // L'amphithéâtre : murs blancs, volume saumon, portes de bois foncé, pergola de lattes sur acier noir, toit d'arcs
    // d'acier et de panneaux translucides, massifs d'héliconias. La porte, au sud, donne sur l'allée.
    const mur = K.mat('#f1efe9', { rugosite: .9 });
    K.boite(A.w, A.h, A.d, mur, A.x, A.h / 2, A.z); ob(A.x, A.z, A.w + .2, A.d + .2);
    K.boite(6.5, 5.4, 3.6, K.mat('#c08a74', { rugosite: .9 }), A.x - 7.5, 2.7, A.z + A.d / 2 - 1.4);
    const toitAmphi = K.geo('toitAmphi', () => { const c = new THREE.CylinderGeometry(A.w / 2 + .6, A.w / 2 + .6, A.d + 1, 28, 1, true, Math.PI / 2, Math.PI); c.rotateX(Math.PI / 2); c.scale(1, .26, 1); return c; });
    const tr = K.maillage(toitAmphi, K.mat('#dfe9ec', { transparent: .62, face2: true, rugosite: .3 }), A.x, A.h, A.z); tr.castShadow = false;
    const arcAcier = K.geo('arcAmphi', () => new THREE.TorusGeometry(A.w / 2 + .6, .09, 5, 28, Math.PI).scale(1, .26, 1));
    for (let k = 0; k <= 5; k++) K.maillage(arcAcier, K.mat('#8b9196', { metal: .6, rugosite: .4 }), A.x, A.h, A.z - A.d / 2 - .4 + k * (A.d + .8) / 5);
    const porteBois = K.mat('#3b2616', { rugosite: .6 });
    K.boite(2.6, 2.7, .08, porteBois, A.x + 1, 1.35, A.z + A.d / 2 + .02);
    panneauTexte(['AMPHITHÉÂTRE'], 3, .5, A.x + 1, 3.15, A.z + A.d / 2 + .06, 0, { fond: '#f1efe9', encre: '#3b2616', px: 1024, py: 170, police: '800 96px "Google Sans", system-ui, sans-serif' });
    K.boite(1.1, 2.2, .08, porteBois, A.x + 8.5, 1.1, A.z + A.d / 2 + .02);
    panneauTexte(['SORTIE'], .9, .26, A.x + 8.5, 2.45, A.z + A.d / 2 + .06, 0, { fond: '#1f7a3e', encre: '#ffffff', px: 512, py: 148 });
    const zP = A.z + A.d / 2 + 2.2;
    for (const x of [A.x - 3, A.x + 5]) { K.boite(.14, 3, .14, noir, x, 1.5, zP + 1.6); ob(x, zP + 1.6, .3, .3); }
    K.boite(8.4, .12, .12, noir, A.x + 1, 3, zP + 1.6);
    for (let k = 0; k < 14; k++) K.boite(.1, .08, 3.3, latte, A.x - 3.3 + k * .64, 3.1, zP);
    const helico = K.mat('#3f7a35'), fleur = K.mat('#e8572b');
    for (const x of [A.x - 9.5, A.x + 11]) { K.boite(3.6, .5, 1.2, helico, x, .25, A.z + A.d / 2 + .9); for (let k = 0; k < 5; k++) K.cone(.12, .35, 5, fleur, x - 1.4 + k * .7, .7, A.z + A.d / 2 + .9); ob(x, A.z + A.d / 2 + .9, 3.6, 1.2); }
  });
  bake(g);
  // Les portes des deux intérieurs : un pas devant la façade (sud, vers l'allée ; « dehors » : le regard en sortant).
  const dehors = -R.ang;
  declarerInterieur('eya-amphi', {
    nom: 'l’amphithéâtre du Centre EYA', porte: monde(R, A.x + 1, A.z + A.d / 2 + 2.3), dehors, w: AM.W, d: AM.D, plafond: AM.H - .6, lampe: 3.4,
    entree: [-AM.W / 2 + 2, 9.4, 2.2], entrer: 'Entrer dans l’amphithéâtre',
    bienvenue: 'L’amphithéâtre du Centre EYA : un spectacle de danse est en cours. Assieds-toi sur une chaise devant la scène.',
    construire: amphitheatre,
  });
  const ps = monde(R, -20, -19.1);
  declarerInterieur('eya-studio', {
    nom: 'le studio du Centre EYA', porte: ps, dehors, centre: [ps[0], 7120], w: ST.W, d: ST.D, plafond: ST.H - .3, lampe: 2.6,
    entree: [-ST.W / 2 + 1.2, -ST.D / 2 + 1.1, 0], entrer: 'Entrer dans le studio EYA',
    bienvenue: 'EYA STUDIO : la régie et, derrière la vitre, la cabine d’enregistrement. Assieds-toi à la console.',
    construire: studio,
  });
  return obst;
}

// ---------- L'amphithéâtre (dedans) ----------
// Gradins en demi-cercle de béton gris au nez orange, tournés vers la scène (carrelage brun, 60 cm), mur du fond crème,
// toit d'arcs d'acier et de panneaux translucides. On entre de côté, au niveau du parterre et de ses chaises bleues.
const AM = { W: 24, D: 22, H: 8.2, C: [0, 6.6] };
function secteur(r0, r1, h, a0, a1) {
  const s = new THREE.Shape(); s.absarc(0, 0, r1, a0, a1, false); s.absarc(0, 0, r0, a1, a0, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 36 }); g.rotateX(-Math.PI / 2); return g;
}
function amphitheatre(I) {
  const { W, D, H, C } = AM;
  const sol = toile('solAmphi', 256, 256, (c, w, h) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { c.fillStyle = ['#5a463a', '#634d3f', '#534135', '#6a5243'][(i + j * 3) % 4]; c.fillRect(j * w / 2 + (i % 2) * w / 4, i * h / 8, w / 2 - 2, h / 8 - 2); } }, { repete: [W / 3, D / 3], rugosite: .6 });
  K.boite(W, .2, D, sol, 0, -.1, 0).castShadow = false;
  const creme = K.mat('#e8dcc8', { rugosite: .95 });
  for (const [w, d, x, z] of [[W, .3, 0, -D / 2], [W, .3, 0, D / 2], [.3, D, -W / 2, 0], [.3, D, W / 2, 0]]) K.boite(w, H - 1.6, d, creme, x, (H - 1.6) / 2, z).castShadow = false;
  // Le haut des murs est ouvert sur le jardin : une bande claire (le jour) sous le toit translucide.
  const jour = K.mat('#e9f2e4', { emissif: '#b9c9b0' });
  for (const [w, d, x, z] of [[W, .1, 0, -D / 2 + .2], [.1, D, -W / 2 + .2, 0], [.1, D, W / 2 - .2, 0]]) K.boite(w, 1.4, d, jour, x, H - .9, z).castShadow = false;
  const toitG = K.geo('toitAmphiDedans', () => { const c = new THREE.CylinderGeometry(W / 2, W / 2, D, 28, 1, true, Math.PI / 2, Math.PI); c.rotateX(Math.PI / 2); c.scale(1, .22, 1); return c; });
  K.maillage(toitG, K.mat('#f2f6f3', { emissif: '#c9d3cf', face2: true, rugosite: .4 }), 0, H - .2, 0).castShadow = false;
  const arc = K.geo('arcAmphiDedans', () => new THREE.TorusGeometry(W / 2, .1, 5, 28, Math.PI).scale(1, .22, 1));
  for (let k = 0; k <= 5; k++) K.maillage(arc, K.mat('#8b9196', { metal: .6, rugosite: .4 }), 0, H - .2, -D / 2 + k * D / 5).castShadow = false;
  // La scène, le mur du fond et sa banderole.
  K.boite(15, .6, D / 2 - C[1] - .2, K.mat('#4a3b32', { rugosite: .5 }), 0, .3, (C[1] + D / 2) / 2 + .1);
  bloc(I, 15, D / 2 - C[1] - .2, 0, (C[1] + D / 2) / 2 + .1, .6);
  panneauTexte(['CENTRE COMMUNAUTAIRE EYA', 'Culture · Sport · Jeunesse'], 10, 2.6, 0, 3.6, D / 2 - .2, Math.PI, { fond: '#ffffff', encre: '#1d2a6b', px: 1536, py: 400, police: '800 118px "Google Sans", system-ui, sans-serif' });
  plan(2.6, 1.3, logoEya(), 0, 5.6, D / 2 - .23, Math.PI).userData.garder = true;
  for (const x of [-6.5, 6.5]) { K.boite(.6, 1.6, .5, '#151515', x, 1.4, D / 2 - 1); } // les enceintes
  // Les gradins : huit rangs de 90 cm, 40 cm de haut chacun, en arc de cercle autour du milieu de la scène.
  const beton = K.mat('#9c9c96', { rugosite: .95 }), nez = K.mat('#d9742b', { rugosite: .6 });
  const a0 = .2, a1 = Math.PI - .2;
  for (let k = 0; k < 8; k++) {
    const r0 = 6.2 + k * .9, h = .4 * (k + 1);
    const m = K.maillage(secteur(r0, r0 + .9, h, a0, a1), beton, C[0], 0, C[1]); m.castShadow = false;
    K.maillage(secteur(r0, r0 + .07, h + .02, a0, a1), nez, C[0], 0, C[1]).castShadow = false;
  }
  // Les gradins bloquent le passage (on reste au parterre) : des carrés de 1,5 m sur leur emprise.
  for (let x = -W / 2 + .75; x < W / 2; x += 1.5) for (let z = -D / 2 + .75; z < C[1]; z += 1.5) {
    const dx = x - C[0], dz = C[1] - z, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    if (r > 6.1 && a > a0 - .05 && a < a1 + .05) bloc(I, 1.5, 1.5, x, z, 3);
  }
  K.boite(3.4, 2.4, 2.2, '#8d8f8c', 0, 1.2 + 3.2, -D / 2 + 1.2); K.boite(3, .9, .05, '#26343b', 0, 4.6, -D / 2 + 2.32); // la régie, en haut
  // Le parterre : chaises bleues au liseré doré, en arcs devant la scène.
  const bleu = K.mat('#2f4fa8', { rugosite: .6 }), dore = K.mat('#c9a227', { metal: .5, rugosite: .4 });
  for (const [r, n] of [[2.6, 7], [3.7, 9], [4.8, 11]]) for (let k = 0; k < n; k++) {
    const a = .45 + k * (Math.PI - .9) / (n - 1), x = C[0] + Math.cos(a) * r, z = C[1] - Math.sin(a) * r, cap = Math.atan2(C[0] - x, C[1] - z);
    const ch = new THREE.Group(); ch.position.set(x, 0, z); ch.rotation.y = cap; K.racine.add(ch);
    K.boite(.46, .06, .44, bleu, 0, .46, 0, ch); K.boite(.46, .5, .06, bleu, 0, .74, -.22, ch); K.boite(.48, .04, .08, dore, 0, 1, -.22, ch);
    for (const [dx, dz] of [[-.2, -.18], [.2, -.18], [-.2, .18], [.2, .18]]) K.boite(.03, .46, .03, dore, dx, .23, dz, ch);
    I.sieges.push({ x, z, cap });
  }
  // Le public (sur les gradins et le parterre) et, sur scène, les danseurs : ils viennent avec les personnages animés.
  const publique = () => {
    if (I.public || !personnagesPrets()) return; I.public = true;
    chargerDanses();
    for (let k = 0; k < 26; k++) {
      const rang = k % 6, r = 6.2 + rang * .9 + .45, a = a0 + .15 + ((k * 37) % 26) / 26 * (a1 - a0 - .3);
      const x = C[0] + Math.cos(a) * r, z = C[1] - Math.sin(a) * r, cap = Math.atan2(C[0] - x, C[1] - z);
      const p = personne(400 + k * 13, { assise: true }); p.userData.jouer?.('assis'); poserAssis(p, x - Math.sin(cap) * .15, .4 * (rang + 1), z - Math.cos(cap) * .15, cap); K.racine.add(p);
    }
    I.sieges.forEach((s, i) => { if ((i * 5) % 7 > 2) return; const p = personne(470 + i, { assise: true }); p.userData.jouer?.('assis'); poserAssis(p, s.x, .45, s.z, s.cap); s.occupe = true; K.racine.add(p); });
    I.danseurs = [-3, -1, 1, 3].map((x, k) => { const p = personne(520 + k * 7, { femme: k % 2 === 0 }); p.position.set(x, .6, 8.8 + (k % 2) * .9); p.rotation.y = Math.PI; K.racine.add(p); return p; });
  };
  K.into(K.racine, publique);
  I.majEya = () => { if (!I.public) K.into(I.g, publique); for (const [k, p] of (I.danseurs || []).entries()) p.userData.jouer?.(k % 2 ? 'danse2' : 'danse1'); };
}

// ---------- Le studio d'enregistrement (dedans) ----------
// La régie (panneaux de bois perforés orange, enseigne arquée « EYA STUDIO », console de bois clair et ses écrans, LED
// bleues), puis, derrière la vitre, la cabine : moquette grise, fresque de masques africains, batterie, canapé gris, clim.
const ST = { W: 9, D: 8, H: 2.9, P: .6 }; // P : la cloison vitrée entre la régie (z < P) et la cabine
function studio(I) {
  const { W, D, H, P } = ST;
  const perfore = toile('perfore', 256, 256, (c, w, h) => {
    c.fillStyle = '#9c6031'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(60,30,10,.25)'; for (let i = 0; i < 6; i++) c.fillRect(0, i * h / 6, w, 2);
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) { const r = 2.5 + ((i * 7 + j * 3) % 5) * 1.6; c.fillStyle = '#2a170b'; c.beginPath(); c.arc(i * w / 12 + w / 24, j * h / 12 + h / 24, r, 0, Math.PI * 2); c.fill(); }
  }, { repete: [9, 2.6], rugosite: .7 });
  K.boite(W, .2, D, K.mat('#3c3f44', { rugosite: 1 }), 0, -.1, 0).castShadow = false; // moquette gris foncé
  K.boite(W, .2, D, K.mat('#f2efe8'), 0, H + .1, 0).castShadow = false;
  for (const [w, d, x, z] of [[W, .3, 0, -D / 2], [.3, D, -W / 2, 0], [.3, D, W / 2, 0]]) K.boite(w, H, d, perfore, x, H / 2, z).castShadow = false;
  // La fresque de masques, au fond de la cabine.
  const fresque = toile('fresqueMasques', 1024, 330, (c, w, h) => {
    c.fillStyle = '#e9e4da'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { c.fillStyle = ['rgba(30,30,30,.5)', 'rgba(200,60,40,.35)', 'rgba(240,190,40,.35)'][i % 3]; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 10 + Math.random() * 40, 0, Math.PI * 2); c.fill(); }
    for (let k = 0; k < 6; k++) {
      const x = 90 + k * 170, y = h / 2 + (k % 2 ? 18 : -12), rx = 56, ry = 110;
      c.fillStyle = ['#2b2b2b', '#b8352c', '#d9a12b', '#3e6fb0', '#2b2b2b', '#e8e0cf'][k]; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#111'; c.lineWidth = 5; c.stroke();
      c.fillStyle = k === 5 ? '#2b2b2b' : '#f4efe2'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(x + s * 22, y - 25, 14, 8, 0, 0, Math.PI * 2); c.fill(); }
      c.fillRect(x - 5, y - 15, 10, 45); c.beginPath(); c.ellipse(x, y + 55, 20, 9, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = c.fillStyle; c.lineWidth = 4; for (let l = -2; l <= 2; l++) { c.beginPath(); c.moveTo(x + l * 10, y - ry + 10); c.lineTo(x + l * 12, y - ry - 18); c.stroke(); }
    }
  });
  K.boite(W, H, .3, fresque, 0, H / 2, D / 2).castShadow = false;
  // La cloison vitrée (porte à droite), l'enseigne « EYA STUDIO » au-dessus de la vitre.
  const cloison = K.mat('#7a4a26', { rugosite: .7 });
  K.boite(W - 1.6, .9, .14, cloison, -.8, .45, P); K.boite(W - 1.6, .6, .14, cloison, -.8, H - .3, P);
  K.boite(W - 1.6, 1.4, .04, K.mat('#9fb6bf', { transparent: .35, rugosite: .1 }), -.8, 1.6, P).castShadow = false;
  bloc(I, W - 1.6, .3, -.8, P, H);
  panneauTexte(['EYA STUDIO'], 2.6, .42, -.8, 2.35, P - .12, Math.PI, { fond: '#9c6031', encre: '#ffffff', px: 1024, py: 166, police: '800 108px "Google Sans", system-ui, sans-serif' });
  // La console, les écrans, les enceintes, le clavier, le fauteuil noir ; les LED bleues au pied des murs.
  const bois = K.mat('#d8b98f', { rugosite: .6 }), noirM = K.mat('#151515', { rugosite: .5 }), ecran = K.mat('#4fa3d9', { emissif: '#2e7fb8' });
  K.boite(3, .08, .9, bois, -.8, .82, -.7); K.boite(3, .78, .06, bois, -.8, .4, -.27); bloc(I, 3, 1, -.8, -.7, 1);
  K.boite(1.6, .06, .5, '#2a2c30', -.8, .88, -.8); for (let k = 0; k < 24; k++) K.boite(.04, .02, .12, k % 3 ? '#cfd3d8' : '#e0493a', -1.5 + k * .06, .92, -.85);
  for (const x of [-1.3, -.3]) { K.boite(.62, .38, .04, '#1a1a1a', x, 1.25, -.4); K.boite(.56, .32, .02, ecran, x, 1.25, -.43).castShadow = false; }
  for (const x of [-2.1, .5]) { K.boite(.3, .45, .3, noirM, x, 1.1, -.45); K.cyl(.08, .08, .02, 12, '#e8c23a', x, 1.05, -.61).rotation.x = Math.PI / 2; }
  K.boite(1.3, .08, .3, '#f4f4f4', -.8, .78, -1.45); for (let k = 0; k < 8; k++) K.boite(.04, .02, .16, '#111', -1.33 + k * .155, .83, -1.42); K.cyl(.03, .03, .75, 6, noirM, -.8, .38, -1.45);
  const fauteuil = new THREE.Group(); fauteuil.position.set(-.8, 0, -1.9); K.racine.add(fauteuil);
  K.boite(.55, .1, .5, noirM, 0, .5, 0, fauteuil); K.boite(.55, .65, .08, noirM, 0, .9, -.25, fauteuil); K.cyl(.04, .04, .45, 6, '#666', 0, .25, 0, fauteuil);
  I.sieges.push({ x: -.8, z: -1.9, cap: 0 });
  const led = K.mat('#2f7bff', { emissif: '#2f7bff' });
  for (const [w, d, x, z] of [[W - .4, .04, 0, -D / 2 + .17], [.04, D / 2 + P - .4, -W / 2 + .17, (P - D / 2) / 2], [.04, D / 2 + P - .4, W / 2 - .17, (P - D / 2) / 2]]) K.boite(w, .03, d, led, x, .05, z).castShadow = false;
  K.boite(1.1, .3, .25, '#f4f4f4', -W / 2 + .3, H - .45, 2.4).rotation.y = Math.PI / 2; // la clim de la cabine
  // La cabine : la batterie électronique, le pied de micro, le canapé gris.
  const pad = K.mat('#1c1c1c', { rugosite: .5 }), chrome = K.mat('#b9bec2', { metal: .7, rugosite: .3 });
  // La batterie électronique : la grosse caisse couchée, trois pads inclinés vers le batteur, deux cymbales dorées, le tabouret.
  const caisse = K.cyl(.28, .28, .32, 20, pad, -2.1, .3, 1.75); caisse.rotation.x = Math.PI / 2; K.cyl(.26, .26, .01, 20, '#e9e9e9', -2.1, .3, 1.58).rotation.x = Math.PI / 2;
  for (const [x, z, y] of [[-2.55, 1.45, .72], [-2.1, 1.3, .82], [-1.65, 1.45, .72]]) { const d = K.cyl(.17, .17, .05, 18, pad, x, y, z); d.rotation.x = -.35; K.cyl(.012, .012, y, 6, chrome, x, y / 2, z + .05); }
  for (const [x, z] of [[-2.85, 1.75], [-1.35, 1.75]]) { const c = K.cyl(.24, .24, .012, 20, K.mat('#c9a227', { metal: .7, rugosite: .35 }), x, 1.2, z); c.rotation.x = -.2; K.cyl(.012, .012, 1.2, 6, chrome, x, .6, z); }
  K.cyl(.17, .15, .08, 14, pad, -2.1, .52, .85); K.cyl(.02, .02, .5, 6, chrome, -2.1, .26, .85); bloc(I, 2, 1.6, -2.1, 1.6, 1.2);
  K.cyl(.015, .015, 1.6, 6, chrome, 1, .8, 2); K.boite(.06, .14, .06, '#222', 1, 1.62, 1.98);
  K.boite(.9, .45, 2.2, '#8a8d91', 3.8, .23, 2.3); K.boite(.25, .5, 2.2, '#8a8d91', 4.15, .6, 2.3); bloc(I, 1, 2.3, 3.8, 2.3, .9);
  for (const z of [1.7, 2.9]) I.sieges.push({ x: 3.65, z, cap: -Math.PI / 2 });
  // L'ingénieur du son, à la console ; une chanteuse au micro.
  const gens = () => {
    if (I.gens || !personnagesPrets()) return; I.gens = true;
    const ch = personne(611, { femme: true }); ch.position.set(1, 0, 2.45); ch.rotation.y = Math.PI; ch.userData.jouer?.('parle'); K.racine.add(ch);
  };
  K.into(K.racine, gens);
  I.majEya = () => { if (!I.gens) K.into(I.g, gens); };
}

// ---------- SOBEBRA, la brasserie de La Béninoise (PK 2,5, route de Porto-Novo) ----------
// D'après l'image satellite, la photo de drone (brochure Africa Outlook) et les photos du carrefour (Wikimedia Commons) :
// la grande halle grise aux puits de lumière (panneaux solaires sur une partie du toit), le hangar blanc à l'ouest, le parc
// à casiers rouge bordeaux le long de la rue du sud, dix-huit cuves d'inox sur leur dalle jaune, douze autres au centre,
// la tour de brassage blanche, la cheminée d'acier à anneaux et son mât rouge et blanc ; côté route, une haie et la bâche
// verte et noire, le portail aux barreaux vert foncé et le panneau SOBEBRA (le soleil vert au cœur jaune).
// Le logo et le nom sont ceux de la marque : à montrer à la SOBEBRA avant toute vidéo publique.
const logoSobebra = () => toile('logoSobebra', 1024, 300, (c, w, h) => {
  c.fillStyle = '#e9ebe8'; c.fillRect(0, 0, w, h);
  const cx = 150, cy = h / 2;
  c.fillStyle = '#016531'; for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; c.save(); c.translate(cx, cy); c.rotate(a); c.beginPath(); c.ellipse(78, 0, 34, 13, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
  c.fillStyle = '#f5d20a'; c.beginPath(); c.arc(cx, cy, 44, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#016531'; c.font = '900 150px "Arial Black", "Google Sans", system-ui, sans-serif'; c.textBaseline = 'middle'; c.fillText('SOBEBRA', 270, cy + 8, 720);
  c.fillStyle = '#f5d20a'; c.fillRect(270, h - 46, 720, 10);
}, { rugosite: .6 });
const bache = () => toile('bacheSobebra', 1024, 160, (c, w, h) => {
  const d = c.createLinearGradient(0, 0, w, 0); d.addColorStop(0, '#0a3d22'); d.addColorStop(1, '#111'); c.fillStyle = d; c.fillRect(0, 0, w, h);
  c.fillStyle = '#f5d20a'; c.font = '800 54px "Google Sans", system-ui, sans-serif'; c.textBaseline = 'middle'; c.fillText('LA BÉNINOISE', 40, 58);
  c.fillStyle = '#ffffff'; c.font = '600 34px "Google Sans", system-ui, sans-serif'; c.fillText('Brassée à Cotonou · SOBEBRA', 40, 112);
  c.fillStyle = '#8a3a30'; c.beginPath(); c.roundRect(860, 18, 46, 126, 14); c.fill(); c.fillRect(874, 4, 18, 24); c.fillStyle = '#2f8a4a'; c.fillRect(864, 70, 38, 40);
}, { rugosite: .8 });
const casiers = () => toile('casiers', 256, 256, (c, w, h) => {
  c.fillStyle = '#5a1b17'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) { c.fillStyle = ['#8a2b25', '#93302a', '#7f2621'][(i + j) % 3]; c.fillRect(i * w / 4 + 3, j * h / 8 + 3, w / 4 - 6, h / 8 - 6); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(i * w / 4 + 10, j * h / 8 + 10, w / 4 - 20, 6); }
}, { repete: [40, 1], rugosite: .7 });
const toitUsine = () => toile('toitUsine', 256, 256, (c, w, h) => {
  c.fillStyle = '#b9bab5'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#c4c5c0' : '#acada8'; c.fillRect(i * w / 16, 0, w / 16, h); }
  c.fillStyle = '#dfe7ea'; for (let j = 0; j < 4; j++) c.fillRect(0, j * h / 4 + h / 10, w, h / 22); // les puits de lumière
}, { repete: [8, 4], rugosite: .6, metal: .2 });
/** Une cuve d'inox cylindro-conique sur ses pieds : rayon r, hauteur du fût h. */
function cuve(x, z, r, h, inox) {
  K.cyl(r, r, h, 18, inox, x, 3 + h / 2, z); K.cone(r, 2.6, 18, inox, x, 1.7, z).rotation.x = Math.PI; K.sphere(r, inox, x, 3 + h, z).scale.set(1, .25, 1);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + .78; K.cyl(.12, .12, 3.4, 6, inox, x + Math.cos(a) * r * .8, 1.7, z + Math.sin(a) * r * .8); }
}
function usineSobebra() {
  const R = SOB, B = SOB_BORDS, g = groupeLieu('sobebra', R.o[0], R.o[1], R.ang), obst = [];
  const ob = (x, z, w, d, r = 0) => { const [X, Z] = monde(R, x, z); obst.push([X, Z, -R.ang + r, w, d]); };
  const boite = (w, h, d, mat, x, z, y = 0) => { K.boite(w, h, d, mat, x, y + h / 2, z); ob(x, z, w + .2, d + .2); };
  const P = { x: 106, l: 12 }; // le portail, côté RNIE1
  K.into(g, () => {
    auSol(B.x1 - B.x0, B.z1 - B.z0, K.mat('#aaa69d', { rugosite: .95 }), (B.x0 + B.x1) / 2, (B.z0 + B.z1) / 2, .04);
    // L'enceinte : murs crème au sud, à l'est et à l'ouest ; au nord, sur la RNIE1, la haie et la bâche.
    const creme = K.mat('#d9d2c2', { rugosite: .95 });
    K.boite(B.x1 - B.x0, 2.6, .35, creme, (B.x0 + B.x1) / 2, 1.3, B.z1); ob((B.x0 + B.x1) / 2, B.z1, B.x1 - B.x0, .4);
    for (const x of [B.x0, B.x1]) { K.boite(.35, 2.6, B.z1 - B.z0, creme, x, 1.3, (B.z0 + B.z1) / 2); ob(x, (B.z0 + B.z1) / 2, .4, B.z1 - B.z0); }
    for (const [x0, x1] of [[B.x0, P.x - P.l / 2], [P.x + P.l / 2, B.x1]]) {
      const L = x1 - x0, cx = (x0 + x1) / 2;
      K.boite(L, 2.8, .25, K.mat('#1c2a22', { rugosite: .8 }), cx, 1.4, B.z0); ob(cx, B.z0, L, .4);
      for (let x = x0 + 2; x < x1 - 14; x += 34) plan(16, 2.5, bache(), x + 8, 1.45, B.z0 - .14, Math.PI);
      K.boite(L, 1, .8, K.mat('#3f6e34', { rugosite: .95 }), cx, .5, B.z0 - .7);
    }
    // Le portail : deux battants de barreaux vert foncé, ouverts ; le grand panneau SOBEBRA ; la guérite.
    const vert = K.mat('#0a4a30', { rugosite: .5, metal: .4 });
    for (const s of [-1, 1]) {
      K.boite(.6, 3.4, .6, '#cfcabe', P.x + s * (P.l / 2 + .3), 1.7, B.z0); ob(P.x + s * (P.l / 2 + .3), B.z0, .7, .7);
      const battant = new THREE.Group(); battant.position.set(P.x + s * P.l / 2, 0, B.z0); battant.rotation.y = s * 1.25; K.racine.add(battant);
      for (let k = 0; k <= 14; k++) K.boite(.06, 2.6, .06, vert, -s * k * .4, 1.4, 0, battant);
      for (const y of [.25, 2.6]) K.boite(5.8, .1, .08, vert, -s * 2.9, y, 0, battant);
    }
    K.boite(.4, 5.5, .4, '#9da19b', P.x + P.l / 2 + 4, 2.75, B.z0 - 1.2); K.boite(.4, 5.5, .4, '#9da19b', P.x + P.l / 2 + 11, 2.75, B.z0 - 1.2);
    K.boite(7.8, 2.3, .25, '#e9ebe8', P.x + P.l / 2 + 7.5, 4.2, B.z0 - 1.2); plan(7.6, 2.2, logoSobebra(), P.x + P.l / 2 + 7.5, 4.2, B.z0 - 1.33, Math.PI);
    ob(P.x + P.l / 2 + 7.5, B.z0 - 1.2, 8, .5);
    guerite(P.x + P.l / 2 + 3, B.z0 + 4, 0); ob(P.x + P.l / 2 + 3, B.z0 + 4, 3, 3);
    // L'accueil des visiteurs (blanc, deux niveaux, l'enseigne verte) : la porte de la visite, face au portail.
    const blanc = K.mat('#f1f0ec', { rugosite: .9 }), vitre = K.mat('#33454d', { rugosite: .2, metal: .3 });
    boite(16, 7, 12, blanc, 90, -63);
    for (const y of [1.6, 4.9]) plan(13, 1.2, vitre, 90, y, -69.04, Math.PI);
    K.boite(2.6, 2.6, .1, K.mat('#2b3a40', { rugosite: .2 }), 96, 1.3, -69.06);
    panneauTexte(['ACCUEIL · VISITES'], 4.2, .55, 90, 3.35, -69.1, Math.PI, { fond: '#016531', encre: '#ffffff', px: 1024, py: 134, police: '800 80px "Google Sans", system-ui, sans-serif' });
    // La grande halle (embouteillage, stockage) : murs gris clair, toit aux puits de lumière, panneaux solaires.
    const gris = K.mat('#cbc9c2', { rugosite: .9 });
    boite(124, 12, 64, gris, 20, -4);
    K.boite(124.4, .3, 64.4, toitUsine(), 20, 12.15, -4).castShadow = false;
    const solaire = toile('solaire', 128, 128, (c, w, h) => { c.fillStyle = '#1b2a4a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#8fa3c0'; c.lineWidth = 2; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * w / 4, 0); c.lineTo(i * w / 4, h); c.stroke(); c.beginPath(); c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke(); } }, { repete: [12, 5], rugosite: .3, metal: .5 });
    K.boite(46, .2, 17, solaire, 52, 12.45, -24).castShadow = false;
    plan(56, 1.2, K.mat('#016531'), 20, 10.2, 28.02);
    boite(51, 7, 13, gris, -4.5, 32.5);
    // Le hangar blanc, à l'ouest.
    boite(42, 10, 97, K.mat('#efeeea', { rugosite: .85 }), -136, 15.6);
    // Le parc à casiers : quatorze rangées de casiers rouge bordeaux, une allée entre chacune.
    for (let k = 0; k < 13; k++) { const z = 41.5 + k * 2.85; K.boite(150, 2.4, 2, casiers(), -28.5, 1.2, z); ob(-28.5, z, 150, 2); }
    // Les dix-huit cuves de la dalle jaune, au sud ; les douze du centre.
    const inox = K.mat('#c9cdd0', { rugosite: .3, metal: .75 });
    auSol(40, 22, K.mat('#e0b52a', { rugosite: .8 }), 68.5, 50, .06);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) cuve(53.5 + i * 6, 44 + j * 6, 2.4, 13, inox);
    ob(68.5, 50, 36, 18);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) cuve(92.5 + i * 5, -15 + j * 5, 2, 11, inox);
    ob(100, -10, 20, 15);
    // La tour de brassage blanche (six niveaux, persiennes grises) et la cheminée d'acier, son mât rouge et blanc.
    const persiennes = toile('persiennes', 128, 256, (c, w, h) => { c.fillStyle = '#f2f2ee'; c.fillRect(0, 0, w, h); for (let j = 0; j < 6; j++) { c.fillStyle = '#8d9599'; for (let k = 0; k < 6; k++) c.fillRect(w * .2, j * h / 6 + h / 18 + k * 5, w * .6, 3); } }, { repete: [3, 1] });
    boite(16, 25, 14, persiennes, 125, -45);
    K.boite(16.4, .5, 14.4, blanc, 125, 25.2, -45);
    const acier = K.mat('#8e7a64', { rugosite: .6, metal: .5 });
    K.cyl(1.3, 1.6, 38, 16, acier, 141, 19, -52); for (let y = 4; y < 38; y += 4.5) K.cyl(1.55, 1.55, .35, 16, '#6f5f4e', 141, y, -52);
    K.cyl(2.2, 2.2, .25, 16, '#5f5245', 141, 34, -52); ob(141, -52, 3.4, 3.4);
    for (let k = 0; k < 5; k++) K.boite(.18, 2, .18, k % 2 ? '#ffffff' : '#c8202a', 141, 39 + k * 2, -52);
    // Les autres halles de l'est, les bassins ronds d'épuration.
    for (const [w, h, d, x, z] of [[34, 9, 57, 151, -17], [23, 8, 35, 183, -28], [46, 7, 28, 129, 45], [39, 6, 12, 169, 43]]) boite(w, h, d, gris, x, z);
    for (const [x, z] of [[178, -63], [196, -63]]) { K.cyl(7.5, 7.5, 1.2, 28, '#8f8b82', x, .6, z); K.cyl(7, 7, .1, 28, K.mat('#5a7f86', { rugosite: .2 }), x, 1.15, z); ob(x, z, 15, 15); }
    for (const x of [-120, -80, -40, 0, 40, 70]) K.arbre(x, -73, 1);
  });
  bake(g);
  // La visite : par la porte de l'accueil, face au portail (« dehors » : le regard en sortant, vers la RNIE1).
  declarerInterieur('sobebra-visite', {
    nom: 'la brasserie de la SOBEBRA', porte: monde(R, 96, -70.6), dehors: Math.atan2(Math.sin(R.ang), -Math.cos(R.ang)), w: BR.W, d: BR.D, plafond: BR.H - .5, lampe: 3,
    entree: [0, -BR.D / 2 + 1.6, 0], entrer: 'Entrer pour la visite de la brasserie',
    bienvenue: 'Bienvenue à la SOBEBRA ! La visite : la salle de brassage, les cuves de fermentation, le laboratoire et la ligne d’embouteillage de La Béninoise.',
    construire: brasserie,
  });
  return obst;
}

// ---------- Le carrefour La Béninoise ----------
// Au rond-point de la RNIE1 : la bouteille géante (8-10 m, verre brun, étiquette verte et blanche, capsule bleue) tenue par
// des câbles, et une cuve de brassage en cuivre sur son socle de briques ; de l'herbe et des agaves.
function rondPointBeninoise() {
  const [x0, z0] = ROND_POINT_BENINOISE, g = groupeLieu('rond-point-beninoise', x0 + 2.7, z0 - 7.8), obst = []; // le centre de l'anneau de la route (relevé dans le jeu)
  K.into(g, () => {
    const verre = K.mat('#7a3326', { rugosite: .22, metal: .1 });
    const profil = [[0, 0], [1.25, 0], [1.32, .3], [1.32, 5.1], [1.2, 5.7], [.82, 6.4], [.5, 7], [.45, 8.4], [.52, 8.55], [.52, 8.8], [0, 8.8]].map(([r, y]) => new THREE.Vector2(r, y));
    K.maillage(K.geo('bouteilleGeante', () => new THREE.LatheGeometry(profil, 28)), verre, 0, .6, 0);
    const etiquette = toile('etiquetteBeninoise', 512, 256, (c, w, h) => {
      c.fillStyle = '#f4f1e6'; c.fillRect(0, 0, w, h); c.fillStyle = '#2f8a4a'; c.fillRect(0, 0, w, 40); c.fillRect(0, h - 40, w, 40);
      c.fillStyle = '#b8322a'; c.font = 'italic 800 64px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('La Béninoise', w / 4, h / 2, w / 2 - 20); c.fillText('La Béninoise', w * 3 / 4, h / 2, w / 2 - 20);
    });
    K.maillage(K.geo('etiquetteGeante', () => new THREE.CylinderGeometry(1.34, 1.34, 2.2, 28, 1, true)), etiquette, 0, 3.4, 0);
    K.cyl(.56, .56, .25, 20, K.mat('#2f5fb3', { metal: .5, rugosite: .3 }), 0, 9.5, 0);
    K.boite(3.2, .6, 3.2, '#b9b1a0', 0, .3, 0);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + .4; K.cable([0, 7.2, 0], [Math.cos(a) * 5, .1, Math.sin(a) * 5], .03, '#3a3a3a'); }
    const cuivre = K.mat('#b87333', { metal: .75, rugosite: .3 });
    K.boite(4.6, 1.3, 4.6, '#9a4a32', -7, .65, 3);
    K.cyl(1.9, 1.9, 2.2, 24, cuivre, -7, 2.4, 3); K.sphere(1.9, cuivre, -7, 3.5, 3).scale.set(1, .55, 1); K.cyl(.3, .45, 4.5, 12, cuivre, -7, 6.2, 3);
    const herbe = new THREE.Mesh(new THREE.CircleGeometry(24, 40).rotateX(-Math.PI / 2), Object.assign(K.mat('#6f9a45').clone(), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -10 }));
    herbe.position.y = .06; herbe.receiveShadow = true; K.racine.add(herbe);
    const agave = K.mat('#5f8f6a', { rugosite: .8 });
    for (let k = 0; k < 10; k++) { const a = k * .63, r = 9 + (k % 3) * 3; for (let f = 0; f < 6; f++) { const c2 = K.cone(.12, 1.1, 4, agave, Math.cos(a) * r, .55, Math.sin(a) * r); c2.rotation.z = Math.cos(f) * .6; c2.rotation.x = Math.sin(f) * .6; } }
  });
  bake(g);
  obst.push([x0 + 2.7, z0 - 7.8, 0, 3.4, 3.4], [x0 + 2.7 - 7, z0 - 7.8 + 3, 0, 4.8, 4.8]);
  return obst;
}

// ---------- La visite de la brasserie (dedans) ----------
// Pas de photo de l'intérieur (sauf le laboratoire) : une brasserie comme on la visite, sobre et fidèle au métier — la salle
// de brassage et ses cuves de cuivre, les cuves de fermentation d'inox, le laboratoire, la ligne d'embouteillage où passent
// les bouteilles brunes, et les casiers rouges qui partent en camion.
const BR = { W: 44, D: 28, H: 9 };
function brasserie(I) {
  const { W, D, H } = BR;
  const carreaux = toile('carreauxBrasserie', 256, 256, (c, w, h) => { c.fillStyle = '#b9a58a'; c.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#c8b59a' : '#bfab90'; c.fillRect(i * w / 4 + 2, j * h / 4 + 2, w / 4 - 4, h / 4 - 4); } }, { repete: [W / 2, D / 2], rugosite: .6 });
  K.boite(W, .2, D, carreaux, 0, -.1, 0).castShadow = false;
  K.boite(W, .2, D, K.mat('#dcdcd8'), 0, H + .1, 0).castShadow = false;
  const mur = K.mat('#eeece6', { rugosite: .9 });
  for (const [w, d, x, z] of [[W, .3, 0, -D / 2], [W, .3, 0, D / 2], [.3, D, -W / 2, 0], [.3, D, W / 2, 0]]) K.boite(w, H, d, mur, x, H / 2, z).castShadow = false;
  K.boite(W - .6, 1.2, .05, K.mat('#016531'), 0, .6, D / 2 - .17).castShadow = false; // la plinthe verte
  const led = K.mat('#ffffff', { emissif: '#fff4e0' });
  for (let x = -W / 2 + 4; x < W / 2 - 2; x += 6) for (let z = -D / 2 + 4; z < D / 2 - 2; z += 6) K.boite(2.4, .06, .4, led, x, H - .05, z).castShadow = false;
  // Le chemin des visiteurs : bandes jaunes au sol.
  const jaune = K.mat('#e9c21b', { rugosite: .7 });
  for (const [w, d, x, z] of [[1.6, D - 5, 0, 1], [W - 10, 1.6, 0, -4]]) { for (const s of [-1, 1]) K.boite(w > d ? w : .08, .015, w > d ? .08 : d, jaune, w > d ? x : x + s * .8, .01, w > d ? z + s * .8 : z).castShadow = false; }
  const panneau = (t, x, z, r = 0) => panneauTexte([t], 4.4, .7, x, 4.8, z, r, { fond: '#016531', encre: '#ffffff', px: 1024, py: 163, police: '800 84px "Google Sans", system-ui, sans-serif' });
  plan(9, 2.6, logoSobebra(), 0, 7.6, D / 2 - .17, Math.PI);
  // La salle de brassage : quatre cuves de cuivre sur une estrade carrelée, leurs cheminées, une rambarde.
  const cuivre = K.mat('#b87333', { metal: .8, rugosite: .28 }), acier = K.mat('#b9bec2', { metal: .7, rugosite: .3 });
  K.boite(15, .4, 13, K.mat('#8c7a66', { rugosite: .7 }), -13.5, .2, 5); bloc(I, 15, 13, -13.5, 5, 1);
  for (const [x, z] of [[-17.5, 1.5], [-9.5, 1.5], [-17.5, 8.5], [-9.5, 8.5]]) {
    K.cyl(2, 2, 2.6, 28, cuivre, x, 1.7, z); K.sphere(2, cuivre, x, 3, z).scale.set(1, .5, 1); K.cyl(.3, .4, H - 3.8, 12, cuivre, x, 3.5 + (H - 3.8) / 2, z);
    K.boite(.7, .5, .06, '#3a2a1c', x, 2.2, z - 2.02);
  }
  for (const z of [-1.5, 11.5]) K.boite(15, .06, .06, acier, -13.5, 1.4, z); for (const x of [-21, -6]) K.boite(.06, .06, 13, acier, x, 1.4, 5);
  panneau('SALLE DE BRASSAGE', -13.5, -1.6, Math.PI);
  // Les cuves de fermentation, au fond, et leur passerelle.
  for (let k = 0; k < 5; k++) cuve(-2 + k * 3.6, 10.6, 1.4, 4.4 - 0, acier);
  bloc(I, 19, 4, 5.2, 10.6, 8);
  panneau('FERMENTATION', 5.2, 8, Math.PI);
  // Le laboratoire (la seule photo de l'intérieur : blouses blanches, microscopes).
  const blancLab = K.mat('#f4f4f2', { rugosite: .5 });
  for (const z of [-10.5, -7.5]) { K.boite(7, .9, 1, blancLab, -16.5, .45, z); bloc(I, 7, 1.1, -16.5, z, 1); for (let k = 0; k < 3; k++) { const x = -19 + k * 2.4; K.cyl(.18, .22, .1, 10, '#222', x, .95, z); K.cyl(.04, .04, .45, 6, '#333', x, 1.2, z - .1); K.boite(.12, .3, .12, '#eee', x, 1.42, z - .05); } }
  for (let k = 0; k < 6; k++) K.cyl(.06, .06, .22, 8, K.mat('#bfe0ef', { transparent: .5 }), -14 + k * .2, 1.02, -10.4);
  panneau('LABORATOIRE', -16.5, -D / 2 + .2);
  // La ligne d'embouteillage : le convoyeur, la soutireuse ronde, la capsuleuse, les bouteilles brunes qui avancent.
  const L = { x: 13, z0: -11, z1: 9 };
  K.boite(.7, .95, L.z1 - L.z0, acier, L.x, .48, (L.z0 + L.z1) / 2); bloc(I, 1.2, L.z1 - L.z0, L.x, (L.z0 + L.z1) / 2, 1.2);
  K.boite(.75, .06, L.z1 - L.z0, '#3a3d40', L.x, .97, (L.z0 + L.z1) / 2);
  K.cyl(1.4, 1.4, 1.6, 24, acier, L.x + 1.6, 1.3, -3); K.cyl(1.2, .3, .6, 24, acier, L.x + 1.6, 2.4, -3); bloc(I, 3, 3, L.x + 1.6, -3, 2);
  K.boite(1.2, 2.2, 1.2, acier, L.x + 1.1, 1.1, 3); K.boite(1.3, .3, .5, '#016531', L.x + 1.1, 2.3, 3); bloc(I, 1.4, 1.4, L.x + 1.1, 3, 2);
  const bouteille = (() => { const pf = [[0, 0], [.035, 0], [.036, .16], [.022, .2], [.013, .23], [.013, .27], [0, .27]].map(([r, y]) => new THREE.Vector2(r, y)); return new THREE.LatheGeometry(pf, 10); })();
  const N = 46, bouteilles = new THREE.InstancedMesh(bouteille, K.mat('#6b2a1f', { rugosite: .25 }), N); bouteilles.castShadow = false; K.racine.add(bouteilles);
  I.ligne = { bouteilles, N, L, t: 0, m: new THREE.Matrix4() };
  panneau('LIGNE D’EMBOUTEILLAGE', L.x, -12, 0);
  // Au bout de la ligne : les casiers rouges sur palettes.
  for (let j = 0; j < 3; j++) K.boite(1.5, .1, 1.1, '#a07a4c', 17.3, .05, 2 + j * 1.2); // les palettes
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 4; k++) K.boite(.4, .28, .3, K.mat('#8a2b25', { rugosite: .7 }), 16.8 + i * .45, .25 + k * .3, 2 + j * 1.2 + (k % 2) * .05);
  bloc(I, 2, 4, 17.3, 3.2, 1.5);
  // Le personnel et le guide (avec les personnages animés).
  const gens = () => {
    if (I.gens || !personnagesPrets()) return; I.gens = true;
    const guide = personne(733, { femme: true }); guide.position.set(1.6, 0, -D / 2 + 3.2); guide.rotation.y = Math.PI * .85; guide.userData.jouer?.('parle'); K.racine.add(guide);
    for (const [x, z, r, i] of [[-16.5, -9, Math.PI, 741], [-18.5, -6.2, 0, 742], [11.8, -6, Math.PI / 2, 743], [11.8, 4, Math.PI / 2, 744], [-13, -.5, 0, 745]]) { const p = personne(i); p.position.set(x, 0, z); p.rotation.y = r; K.racine.add(p); }
  };
  K.into(K.racine, gens);
  I.majEya = dt => {
    if (!I.gens) K.into(I.g, gens);
    const Lg = I.ligne; if (!Lg) return; Lg.t += (dt || .016) * .7; const long = Lg.L.z1 - Lg.L.z0;
    for (let k = 0; k < Lg.N; k++) { const z = Lg.L.z0 + ((k * long / Lg.N + Lg.t) % long); Lg.m.makeTranslation(Lg.L.x, 1, z); Lg.bouteilles.setMatrixAt(k, Lg.m); }
    Lg.bouteilles.instanceMatrix.needsUpdate = true;
  };
}

// ---------- L'Hôtel 8 Janvier (Missessin) ----------
// Aucune photo publique (annuaire GoAfrica seulement) : un hôtel de Cotonou de sa taille, sans rien d'extravagant. R+3 crème,
// bandeaux ocre aux planchers, balcons à garde-corps, rez-de-chaussée vitré sous une marquise bordeaux, l'enseigne sur
// l'acrotère, des palmiers en pot. Dedans : la réception et son salon, la salle du petit-déjeuner, et le couloir des
// chambres, toutes ouvertes à la visite (101 standard, 102 à deux lits, 103 suite, 104 l'appartement avec salon et cuisine).
// GoDrive (l'entreprise de VTC inventée pour le jeu, 23/11) a son affiche à la réception.
const logoGoDrive = () => toile('logoGoDrive', 512, 512, (c, w, h) => {
  c.fillStyle = '#ff6a13'; c.beginPath(); c.roundRect(0, 0, w, h, 90); c.fill();
  c.strokeStyle = '#ffffff'; c.lineWidth = 46; c.lineCap = 'round'; c.beginPath(); c.arc(w / 2, h / 2 - 20, 150, -.3, Math.PI * 1.55); c.stroke();
  c.beginPath(); c.moveTo(w / 2 + 20, h / 2 - 20); c.lineTo(w / 2 + 150, h / 2 - 20); c.stroke();
  c.fillStyle = '#ffffff'; c.font = '900 70px "Google Sans", system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('GoDrive', w / 2, h - 40);
});
function hotel8Janvier() {
  const R = HOTEL, g = groupeLieu('hotel-8-janvier', R.o[0], R.o[1], R.ang), obst = [];
  const ob = (x, z, w, d) => { const [X, Z] = monde(R, x, z); obst.push([X, Z, -R.ang, w, d]); };
  const L = 33, P = 14, Hn = 3.4, N = 4, F = P / 2; // longueur, profondeur, hauteur d'étage, niveaux ; F : la façade
  K.into(g, () => {
    const creme = K.mat('#efe6d2', { rugosite: .9 }), ocre = K.mat('#c98a3c', { rugosite: .8 }), vitre = K.mat('#2f4550', { rugosite: .15, metal: .35 }), fer = K.mat('#2e3134', { rugosite: .5, metal: .4 });
    K.boite(L, Hn * N, P, creme, 0, Hn * N / 2, 0); ob(0, 0, L + .2, P + .2);
    for (let k = 1; k <= N; k++) K.boite(L + .3, .28, P + .3, ocre, 0, k * Hn, 0);
    K.boite(L + .3, 1.9, .3, creme, 0, Hn * N + .95, F); K.boite(L + .3, 1, .3, creme, 0, Hn * N + .5, -F); for (const x of [-L / 2, L / 2]) K.boite(.3, 1, P, creme, x, Hn * N + .5, 0);
    panneauTexte(['HÔTEL 8 JANVIER'], 15, 1.5, 0, Hn * N + 1, F + .17, 0, { fond: '#7a1f2b', encre: '#ffffff', px: 2048, py: 205, police: '800 150px "Google Sans", system-ui, sans-serif' });
    for (let k = 1; k < N; k++) for (let i = 0; i < 7; i++) {
      const x = -13.5 + i * 4.5, y = k * Hn;
      plan(1.7, 1.6, vitre, x, y + 1.7, F + .02); K.boite(2.4, .14, 1, ocre, x, y + .5, F + .5); K.boite(2.4, .9, .05, fer, x, y + 1.02, F + .98);
      if (i % 2) K.boite(.8, .5, .35, '#e9e9e6', x + 1.3, y + 2.6, F + .2); // les climatiseurs
    }
    plan(23, 2.7, vitre, 0, 1.55, F + .02);
    K.boite(2.6, 2.6, .07, K.mat('#1a2328', { rugosite: .2 }), 0, 1.3, F + .05);
    K.boite(6.4, .28, 2.8, '#7a1f2b', 0, 3.15, F + 1.4); for (const x of [-3, 3]) { K.cyl(.07, .07, 3.05, 8, fer, x, 1.52, F + 2.6); ob(x, F + 2.6, .2, .2); }
    panneauTexte(['HÔTEL 8 JANVIER · RÉCEPTION'], 6, .26, 0, 3.15, F + 2.82, 0, { fond: '#7a1f2b', encre: '#f5d27a', px: 1024, py: 44, police: '700 34px "Google Sans", system-ui, sans-serif' });
    for (const x of [-5.5, 5.5]) { K.cyl(.38, .3, .7, 12, '#d9d2c4', x, .35, F + 1); K.cocotier(x, F + 1, false); ob(x, F + 1, .8, .8); }
    auSol(L, 2.4, K.mat('#bdb6a8', { rugosite: .9 }), 0, F + 1.2, .05);
  });
  bake(g);
  declarerInterieur('hotel-8-janvier', {
    nom: 'l’Hôtel 8 Janvier', porte: monde(R, 0, F + 1.5), dehors: -R.ang, w: HO.W, d: HO.D, plafond: HO.H - .3, lampe: 2.2,
    entree: [-11, -HO.D / 2 + 1.4, 0], entrer: 'Entrer dans l’Hôtel 8 Janvier',
    bienvenue: 'Bienvenue à l’Hôtel 8 Janvier ! La réception est à gauche ; le couloir mène aux chambres 101 à 104 : entre, elles sont ouvertes à la visite.',
    construire: hotelDedans,
  });
  return obst;
}
const HO = { W: 30, D: 16, H: 3 };
/** Un meuble : un groupe posé en (x, z), tourné de r, ses pièces en coordonnées locales. */
function meuble(x, z, r, fn) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; K.racine.add(g); K.into(g, fn); return g; }
function lit(x, z, r, l, couvre) {
  const bois = K.mat('#6b4426', { rugosite: .6 });
  return meuble(x, z, r, () => {
    K.boite(l + .1, .32, 2.1, bois, 0, .16, 1.05); K.boite(l, .22, 2, '#f4f2ee', 0, .43, 1.05); K.boite(l + .3, 1.15, .08, bois, 0, .58, -.02);
    for (const s of (l > 1.2 ? [-1, 1] : [0])) K.boite(l > 1.2 ? l * .4 : l * .8, .12, .42, '#ffffff', s * l * .24, .6, .32);
    K.boite(l + .04, .05, 1.35, couvre, 0, .56, 1.38);
  });
}
function hotelDedans(I) {
  const { W, D, H } = HO;
  const sol = toile('solHotel', 256, 256, (c, w, h) => { c.fillStyle = '#d9d2c5'; c.fillRect(0, 0, w, h); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { c.fillStyle = '#ece6da'; c.fillRect(i * 128 + 2, j * 128 + 2, 124, 124); c.fillStyle = 'rgba(160,150,130,.15)'; c.fillRect(i * 128 + 20, j * 128 + 40, 80, 3); } }, { repete: [W / 1.2, D / 1.2], rugosite: .35 });
  K.boite(W, .2, D, sol, 0, -.1, 0).castShadow = false;
  K.boite(W, .2, D, K.mat('#f6f4ef'), 0, H + .1, 0).castShadow = false;
  const mur = K.mat('#f1ebdf', { rugosite: .95 }), bordeaux = K.mat('#7a1f2b', { rugosite: .7 });
  for (const [w, d, x, z] of [[W, .3, 0, -D / 2], [W, .3, 0, D / 2], [.3, D, -W / 2, 0], [.3, D, W / 2, 0]]) K.boite(w, H, d, mur, x, H / 2, z).castShadow = false;
  const led = K.mat('#ffffff', { emissif: '#fff1d6' });
  for (let x = -W / 2 + 2.5; x < W / 2; x += 4) for (const z of [-4.5, 0, 4.5]) K.cyl(.22, .22, .03, 14, led, x, H - .02, z).castShadow = false;
  // Les cloisons : le couloir (z de −1 à 1, de x = −6 au fond), les chambres de chaque côté, une porte de 1,1 m chacune.
  const cloison = (x0, x1, z) => { const l = x1 - x0; K.boite(l, H, .14, mur, (x0 + x1) / 2, H / 2, z).castShadow = false; bloc(I, l, .3, (x0 + x1) / 2, z, H); };
  const travers = (x, z0, z1) => { const l = z1 - z0; K.boite(.14, H, l, mur, x, H / 2, (z0 + z1) / 2).castShadow = false; bloc(I, .3, l, x, (z0 + z1) / 2, H); };
  // Côté nord (z < −1) : 101, 102, 103 ; côté sud (z > 1) : la salle du petit-déjeuner (ouverte sur le hall) et l'appartement 104.
  for (const [x0, x1] of [[-6, -.4], [.7, 2.6], [3.7, 9.6], [10.7, 15]]) cloison(x0, x1, -1);
  for (const [x0, x1] of [[1, 5.4], [6.5, 15]]) cloison(x0, x1, 1);
  travers(-6, -D / 2, -1); travers(2.5, -D / 2, -1); travers(9.5, -D / 2, -1); travers(1, 1, D / 2);
  const plaque = (t, x, z, r) => panneauTexte([t], .5, .22, x, 1.9, z, r, { fond: '#7a1f2b', encre: '#f5d27a', px: 256, py: 112, police: '800 80px "Google Sans", system-ui, sans-serif' });
  plaque('101', -1.1, -.92, 0); plaque('102', 2.1, -.92, 0); plaque('103', 9.1, -.92, 0); plaque('104', 7.2, .92, Math.PI); // à côté de chaque porte
  panneauTexte(['CHAMBRES 101 – 104 →'], 2.6, .36, -5, 2.35, -.93, 0, { fond: '#f1ebdf', encre: '#7a1f2b', px: 1024, py: 142, police: '700 80px "Google Sans", system-ui, sans-serif' });
  // La réception : le comptoir, le tableau des clés, l'enseigne ; le salon et sa télévision ; l'affiche GoDrive.
  const bois = K.mat('#6b4426', { rugosite: .55 });
  K.boite(4, 1.1, .8, bois, -11.5, .55, 5.2); K.boite(4.2, .06, 1, '#e9e2d4', -11.5, 1.12, 5.2); bloc(I, 4.2, 1, -11.5, 5.2, 1.2);
  panneauTexte(['RÉCEPTION'], 3, .5, -11.5, 2.3, D / 2 - .17, Math.PI, { fond: '#7a1f2b', encre: '#ffffff', px: 1024, py: 170, police: '800 110px "Google Sans", system-ui, sans-serif' });
  K.boite(1.4, .9, .05, bois, -9, 1.6, D / 2 - .18); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) K.boite(.05, .14, .02, '#c9a227', -9.5 + i * .3, 1.35 + j * .25, D / 2 - .21);
  const canape = (x, z, r) => { meuble(x, z, r, () => { K.boite(2, .45, .85, '#3e4a5c', 0, .23, 0); K.boite(2, .5, .2, '#3e4a5c', 0, .65, -.33); for (const s of [-1, 1]) K.boite(.2, .6, .85, '#3e4a5c', s * .95, .3, 0); }); };
  canape(-13.2, -2.5, Math.PI / 2); canape(-9.5, -5.6, 0); bloc(I, 1, 2.2, -13.2, -2.5, .8); bloc(I, 2.2, 1, -9.5, -5.6, .8);
  I.sieges.push({ x: -13, z: -3, cap: Math.PI / 2 }, { x: -13, z: -2, cap: Math.PI / 2 }, { x: -10, z: -5.5, cap: 0 }, { x: -9, z: -5.5, cap: 0 });
  K.boite(1.2, .4, .7, bois, -10.6, .2, -2.6); bloc(I, 1.2, .7, -10.6, -2.6, .5);
  K.boite(.08, .75, 1.3, '#111', -W / 2 + .2, 1.6, -2.5); K.boite(.02, .68, 1.2, K.mat('#2d5d8a', { emissif: '#1d4a70' }), -W / 2 + .25, 1.6, -2.5);
  plan(1.1, 1.1, logoGoDrive(), -13.6, 1.7, -D / 2 + .17);
  panneauTexte(['Ta moto ou ta voiture GoDrive', 'se commande ici : « Commander un GoDrive »'], 2.6, .5, -11.4, 1.6, -D / 2 + .17, 0, { fond: '#1d1d1d', encre: '#ffffff', px: 1024, py: 196, police: '600 56px "Google Sans", system-ui, sans-serif' });
  for (const [x, z] of [[-14.3, 7.3], [-6.6, -7.3]]) { K.cyl(.3, .24, .55, 10, '#d9d2c4', x, .28, z); K.sphere(.55, K.mat('#4f7a3c', { rugosite: .9 }), x, 1.1, z).scale.set(1, 1.4, 1); bloc(I, .7, .7, x, z, 1); }
  // La salle du petit-déjeuner : quatre tables nappées et leurs chaises.
  for (const [x, z] of [[-4.2, 3.2], [-1.5, 3.2], [-4.2, 6.2], [-1.5, 6.2]]) {
    K.cyl(.55, .55, .05, 16, '#ffffff', x, .76, z); K.cyl(.06, .06, .74, 8, '#3a3a3a', x, .37, z); bloc(I, 1.1, 1.1, x, z, .8);
    for (const [dx, dz, c] of [[0, -.85, 0], [0, .85, Math.PI]]) { K.boite(.42, .05, .42, bordeaux, x + dx, .46, z + dz); K.boite(.42, .5, .05, bordeaux, x + dx, .72, z + dz + (dz < 0 ? -.2 : .2)); I.sieges.push({ x: x + dx, z: z + dz, cap: c }); }
  }
  panneauTexte(['PETIT-DÉJEUNER · 7 h – 10 h'], 2.4, .34, -2.8, 2.3, D / 2 - .17, Math.PI, { fond: '#f1ebdf', encre: '#7a1f2b', px: 1024, py: 145, police: '700 76px "Google Sans", system-ui, sans-serif' });
  // Ce qu'il y a dans une chambre : rideaux, climatiseur, télévision, chevets, armoire, salle d'eau.
  const rideau = (x, z, l, r) => meuble(x, z, r, () => { for (let k = 0; k < Math.round(l / .3); k++) K.boite(.3, H - .4, .06, k % 2 ? '#5c4a7a' : '#4f3f6b', -l / 2 + .15 + k * .3, (H - .4) / 2 + .1, 0); });
  const clim = (x, z, r) => meuble(x, z, r, () => { K.boite(.9, .3, .22, '#f4f4f2', 0, H - .45, 0); });
  const tele = (x, z, r) => meuble(x, z, r, () => { K.boite(1.1, .65, .05, '#111', 0, 1.5, 0); K.boite(1.02, .58, .02, K.mat('#24405e', { emissif: '#13283c' }), 0, 1.5, .03); });
  const salleEau = (x0, z0, x1, z1, porteX) => { // une cloison en L avec sa porte, la douche, le lavabo, les WC
    const zc = Math.abs(z0) > Math.abs(z1) ? z0 : z1, zf = zc === z0 ? z1 : z0; // zc : le côté chambre (loin du couloir)
    K.boite(porteX - .5 - x0, H, .1, mur, (x0 + porteX - .5) / 2, H / 2, zc); K.boite(x1 - porteX - .5, H, .1, mur, (porteX + .5 + x1) / 2, H / 2, zc);
    bloc(I, porteX - .5 - x0, .25, (x0 + porteX - .5) / 2, zc, H); bloc(I, x1 - porteX - .5, .25, (porteX + .5 + x1) / 2, zc, H);
    K.boite(x1 - x0, .02, Math.abs(z1 - z0), K.mat('#dde7ea'), (x0 + x1) / 2, .01, (z0 + z1) / 2).castShadow = false;
    K.boite(.9, .08, .9, '#f4f4f2', x0 + .55, .04, (zc + zf) / 2 + (zf > zc ? .4 : -.4)); K.cyl(.02, .02, 1.8, 6, '#b9bec2', x0 + .2, 1.1, zf + (zf > zc ? -.15 : .15));
    K.boite(.45, .4, .35, '#f4f4f2', x1 - .4, .2, zf + (zf > zc ? -.3 : .3)); K.boite(.5, .15, .4, '#f4f4f2', x1 - .4, .85, (zc + zf) / 2);
  };
  const vert = K.mat('#2f7a5c', { rugosite: .9 }), sable = K.mat('#c9a66b', { rugosite: .9 }), prune = K.mat('#6b2d4a', { rugosite: .9 });
  // 101 : chambre standard, un grand lit.
  lit(-2.9, -D / 2 + .05, 0, 1.6, vert); bloc(I, 2, 2.2, -2.9, -6.9, .7);
  for (const x of [-4.1, -1.7]) K.boite(.45, .5, .4, bois, x, .25, -7.6);
  rideau(-3.2, -D / 2 + .2, 3, 0); clim(-5.8, -4.5, Math.PI / 2); tele(2.38, -4.6, -Math.PI / 2); K.boite(.6, 2, 1.4, bois, -5.6, 1, -2.2); bloc(I, .7, 1.4, -5.6, -2.2, 2);
  // 102 : deux lits.
  lit(5.2, -D / 2 + .05, 0, 1, sable); lit(7.4, -D / 2 + .05, 0, 1, sable); bloc(I, 3.4, 2.2, 6.3, -6.9, .7); K.boite(.45, .5, .4, bois, 6.3, .25, -7.6);
  rideau(6, -D / 2 + .2, 3, 0); clim(9.3, -4.5, -Math.PI / 2); tele(2.75, -4.6, Math.PI / 2);
  // 103 : la suite, le grand lit, un fauteuil, la salle d'eau.
  lit(13.2, -D / 2 + .05, 0, 1.8, prune); bloc(I, 2.2, 2.2, 13.2, -6.9, .7);
  for (const x of [11.9, 14.5]) K.boite(.45, .5, .4, bois, x, .25, -7.6);
  rideau(12.5, -D / 2 + .2, 3.6, 0); clim(14.8, -4, -Math.PI / 2); canape(11, -3.2, Math.PI / 2); bloc(I, 1, 2.2, 11, -3.2, .8); I.sieges.push({ x: 11.2, z: -3.2, cap: Math.PI / 2 });
  salleEau(12.8, -2.9, 15, -1.1, 13.9); // dans le coin, loin de la porte de la chambre
  // 104 : l'appartement — le salon (canapés, télévision), la cuisine (plan de travail, frigo, évier), la chambre derrière sa cloison.
  canape(3.6, 5.8, Math.PI); canape(1.9, 3.9, Math.PI / 2); bloc(I, 2.2, 1, 3.6, 5.8, .8); bloc(I, 1, 2.2, 1.9, 3.9, .8);
  I.sieges.push({ x: 3.4, z: 5.6, cap: Math.PI }, { x: 4, z: 5.6, cap: Math.PI }, { x: 2.1, z: 3.6, cap: Math.PI / 2 });
  K.boite(1, .4, .6, bois, 3.6, .2, 4.2); tele(5.3, 4, -Math.PI / 2);
  K.boite(3.2, .9, .6, '#d8b98f', 8.4, .45, D / 2 - .45); K.boite(3.3, .05, .65, '#e9e2d4', 8.4, .92, D / 2 - .45); K.boite(.7, 1.8, .65, '#b9bec2', 6.5, .9, D / 2 - .45); bloc(I, 4.2, .8, 8, D / 2 - .45, 1.8);
  K.boite(.6, .05, .4, '#c9cdd0', 9.2, .95, D / 2 - .45);
  travers(10.5, 1, 5); travers(10.5, 6.1, D / 2);
  lit(13, D / 2 - .05, Math.PI, 1.6, vert); bloc(I, 2, 2.2, 13, 6.9, .7); K.boite(.45, .5, .4, bois, 14.4, .25, 7.6); rideau(14.9, 4, 3, -Math.PI / 2); clim(14.8, 2, -Math.PI / 2);
  // La réceptionniste, et quelques clients.
  const gens = () => {
    if (I.gens || !personnagesPrets()) return; I.gens = true;
    const rec = personne(822, { femme: true }); rec.position.set(-11.5, 0, 6.1); rec.rotation.y = Math.PI; rec.userData.jouer?.('parle'); K.racine.add(rec); I.receptionniste = rec;
    for (const [k, s] of [[823, I.sieges[4]], [824, I.sieges[6]]]) { if (!s) continue; const p = personne(k, { assise: true }); p.userData.jouer?.('assis'); poserAssis(p, s.x, .46, s.z, s.cap); s.occupe = true; K.racine.add(p); }
  };
  K.into(K.racine, gens);
  I.majEya = () => { if (!I.gens) K.into(I.g, gens); };
}

// ---------- Super U Akpakpa (ex-Erevan, carrefour PK3) ----------
// « Je dois pouvoir entrer dans le supermarché d'Akpakpa, payer des articles, aller vers ma voiture, mettre les trucs dans
// ma voiture » (Murielle, 23/11). Pas de photo trouvée : un supermarché de cette taille (le bâtiment OSM, ≈ 120 × 37 m),
// sa façade vitrée sur le parking, l'enseigne rouge. Dedans : les caisses près de l'entrée, les gondoles et leurs rayons,
// les frigos au fond, les fruits et légumes. On prend au rayon, on paie à la caisse, on repart avec un sac (courses.js).
// L'enseigne Super U est une marque : à montrer à l'enseigne avant toute vidéo publique.
const PRODUITS = {
  riz: { nom: 'Riz parfumé 5 kg', prix: 2500, repas: 6 }, pates: { nom: 'Spaghetti 500 g', prix: 300, repas: 1 }, gari: { nom: 'Gari 1 kg', prix: 500, repas: 2 },
  huile: { nom: 'Huile 1 L', prix: 900, repas: 1 }, tomate: { nom: 'Tomate concentrée', prix: 150, repas: 1 }, sardines: { nom: 'Sardines en boîte', prix: 400, repas: 1 },
  lait: { nom: 'Lait en poudre 400 g', prix: 1200, repas: 2 }, pain: { nom: 'Pain de mie', prix: 400, repas: 1 }, oeufs: { nom: 'Œufs (plateau de 30)', prix: 1800, repas: 4 },
  eau: { nom: 'Eau minérale 1,5 L', prix: 300, repas: 0 }, jus: { nom: 'Jus d’ananas 1 L', prix: 600, repas: 0 }, soda: { nom: 'Soda 33 cl', prix: 350, repas: 0 },
  savon: { nom: 'Savon de toilette', prix: 250, repas: 0 }, papier: { nom: 'Papier toilette (4 rouleaux)', prix: 700, repas: 0 }, lessive: { nom: 'Lessive 1 kg', prix: 900, repas: 0 },
  biscuits: { nom: 'Biscuits', prix: 300, repas: 0 }, cubes: { nom: 'Cubes d’assaisonnement', prix: 200, repas: 0 }, sel: { nom: 'Sel 1 kg', prix: 150, repas: 0 },
  yaourt: { nom: 'Yaourt (4 pots)', prix: 800, repas: 1 }, poulet: { nom: 'Poulet congelé', prix: 2200, repas: 3 }, poisson: { nom: 'Chinchards congelés 1 kg', prix: 1500, repas: 2 },
  bananes: { nom: 'Bananes (le régime)', prix: 600, repas: 1 }, ananas: { nom: 'Ananas', prix: 500, repas: 1 }, tomates: { nom: 'Tomates fraîches 1 kg', prix: 600, repas: 1 }, oignons: { nom: 'Oignons 1 kg', prix: 500, repas: 1 },
};
// Les rayons : leur nom, ce qu'on y prend, et où l'on se tient pour prendre (coordonnées de la pièce).
const SU = { W: 40, D: 26, H: 5.4 };
const RAYONS = [
  { nom: 'Riz · pâtes · gari', p: ['riz', 'pates', 'gari'], x: -13.2 }, { nom: 'Huiles · conserves', p: ['huile', 'tomate', 'sardines'], x: -10.8 },
  { nom: 'Petit-déjeuner', p: ['lait', 'pain', 'oeufs'], x: -7.2 }, { nom: 'Boissons', p: ['eau', 'jus', 'soda'], x: -4.8 },
  { nom: 'Hygiène', p: ['savon', 'papier'], x: -1.2 }, { nom: 'Entretien', p: ['lessive'], x: 1.2 },
  { nom: 'Biscuits · confiserie', p: ['biscuits'], x: 4.8 }, { nom: 'Épices · condiments', p: ['cubes', 'sel'], x: 7.2 },
].map(r => ({ ...r, zone: [r.x - 1.1, r.x + 1.1, -4, 9] })).concat([ // le long des gondoles (z de −4 à 9), du côté de la face
  { nom: 'Produits frais', p: ['yaourt', 'poulet', 'poisson'], x: -2, zone: [-14, 10, SU.D / 2 - 2.6, SU.D / 2] },
  { nom: 'Fruits et légumes', p: ['bananes', 'ananas', 'tomates', 'oignons'], x: 16, zone: [14.6, 17, -4, 7.5] },
]);
const CAISSES = [-8, -2, 4]; // x des caisses (z = −7) ; on paie du côté +x du tapis
function superU() {
  const R = SUPER_U, g = groupeLieu('super-u-akpakpa', R.o[0], R.o[1], R.ang), obst = [];
  const ob = (x, z, w, d) => { const [X, Z] = monde(R, x, z); obst.push([X, Z, -R.ang, w, d]); };
  K.into(g, () => {
    const blanc = K.mat('#f1f1ee', { rugosite: .9 }), rouge = K.mat('#d6001c', { rugosite: .6 }), vitre = K.mat('#2f4550', { rugosite: .12, metal: .35 });
    K.boite(122, 7.5, 37, blanc, 0, 3.75, -18.5); ob(0, -18.5, 122.2, 37.2);
    for (const [w, d, x, z] of [[122.4, .3, 0, .05], [122.4, .3, 0, -37.05], [.3, 37.4, 61.05, -18.5], [.3, 37.4, -61.05, -18.5]]) K.boite(w, 1.2, d, rouge, x, 7, z); // le bandeau rouge, sur les façades seulement
    plan(40, 3.4, vitre, 0, 2, .02); K.boite(4, 3, .08, K.mat('#1a2328', { rugosite: .2 }), 0, 1.5, .06);
    K.boite(14, .3, 4, '#d6001c', 0, 3.9, 2); for (const x of [-6.5, 6.5]) { K.cyl(.09, .09, 3.8, 8, '#cfd3d6', x, 1.9, 3.8); ob(x, 3.8, .3, .3); }
    const enseigne = toile('enseigneSuperU', 1024, 256, (c, w, h) => {
      c.fillStyle = '#d6001c'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffffff'; c.font = 'italic 900 150px "Arial Black", "Google Sans", system-ui, sans-serif'; c.textBaseline = 'middle'; c.fillText('Super', 60, h / 2 + 6);
      c.beginPath(); c.arc(w - 190, h / 2, 100, 0, Math.PI * 2); c.fill(); c.fillStyle = '#d6001c'; c.font = '900 150px "Arial Black", system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('U', w - 190, h / 2 + 8);
    }, { rugosite: .5 });
    plan(16, 4, enseigne, 0, 9.4, .25).castShadow = false; K.boite(16.4, 4.4, .3, '#a30015', 0, 9.4, .05);
    panneauTexte(['AKPAKPA · OUVERT 8 h – 21 h'], 10, .8, 0, 4.6, .18, 0, { fond: '#ffffff', encre: '#d6001c', px: 1536, py: 123, police: '800 84px "Google Sans", system-ui, sans-serif' });
    // Le parking : marquage au sol, quelques voitures, l'abri des chariots.
    auSol(80, 24, K.mat('#5f6264', { rugosite: .95 }), 0, 22, .05); // au-delà de la rue de service (z ≈ 6)
    auSol(40, 4, K.mat('#bdb6a8', { rugosite: .9 }), 0, 2, .05); // le trottoir devant l'entrée
    const ligneB = K.mat('#f2f2ee');
    for (let k = -14; k <= 14; k++) { auSol(.12, 5, ligneB, k * 2.6, 15, .07); auSol(.12, 5, ligneB, k * 2.6, 29, .07); }
    for (const [x, c, r] of [[-20.8, '#c8c8c2', 0], [-15.6, '#7a1f2b', 0], [13, '#1d4fb8', Math.PI], [23.4, '#222', 0], [-28.6, '#e8e8e4', Math.PI], [5.2, '#a6acb2', 0]]) { voiture(x, r ? 29 : 15, c, r); ob(x, r ? 29 : 15, 2, 4.6); }
    K.boite(6, .12, 2.2, '#9aa0a2', 12, 2.4, 1.6); for (const x of [9.2, 14.8]) K.cyl(.05, .05, 2.4, 6, '#9aa0a2', x, 1.2, 2.6);
  });
  bake(g);
  declarerInterieur('super-u', {
    nom: 'le Super U d’Akpakpa', porte: monde(R, 0, 1.6), dehors: -R.ang, w: SU.W, d: SU.D, plafond: SU.H - .4, lampe: 2.6,
    entree: [0, -SU.D / 2 + 1.4, 0], entrer: 'Entrer au Super U',
    bienvenue: 'Bienvenue au Super U d’Akpakpa ! Approche-toi d’un rayon pour prendre des articles, puis passe à la caisse.',
    construire: superUDedans,
  });
  return obst;
}
const marchandises = (cle, teintes) => toile(cle, 256, 256, (c, w, h) => {
  c.fillStyle = '#e9e7e2'; c.fillRect(0, 0, w, h);
  for (let r = 0; r < 4; r++) { c.fillStyle = '#b9bcbf'; c.fillRect(0, r * h / 4 + h / 4 - 8, w, 8); for (let k = 0; k < 12; k++) { c.fillStyle = teintes[(k * 7 + r * 3) % teintes.length]; const hh = h / 4 - 18 - (k % 3) * 6; c.fillRect(k * w / 12 + 2, r * h / 4 + h / 4 - 8 - hh, w / 12 - 4, hh); c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(k * w / 12 + 5, r * h / 4 + h / 4 - 8 - hh * .7, w / 12 - 10, 5); } }
}, { repete: [4, 1], rugosite: .7 });
function superUDedans(I) {
  const { W, D, H } = SU;
  K.boite(W, .2, D, toile('solSuperU', 128, 128, (c, w, h) => { c.fillStyle = '#e8e6e0'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d0cdc5'; c.lineWidth = 2; c.strokeRect(0, 0, w, h); }, { repete: [W / 1.5, D / 1.5], rugosite: .3 }), 0, -.1, 0).castShadow = false;
  K.boite(W, .2, D, K.mat('#f4f4f2'), 0, H + .1, 0).castShadow = false;
  const mur = K.mat('#f1f1ee', { rugosite: .9 }), rouge = K.mat('#d6001c');
  for (const [w, d, x, z] of [[W, .3, 0, -D / 2], [W, .3, 0, D / 2], [.3, D, -W / 2, 0], [.3, D, W / 2, 0]]) K.boite(w, H, d, mur, x, H / 2, z).castShadow = false;
  for (const [w, d, x, z] of [[W - .6, .05, 0, D / 2 - .17], [.05, D - .6, -W / 2 + .17, 0], [.05, D - .6, W / 2 - .17, 0]]) K.boite(w, .5, d, rouge, x, H - .6, z).castShadow = false;
  const led = K.mat('#ffffff', { emissif: '#f4f8ff' });
  for (let x = -W / 2 + 3; x < W / 2; x += 5) for (let z = -D / 2 + 3; z < D / 2; z += 4) K.boite(3, .05, .3, led, x, H - .03, z).castShadow = false;
  // Les gondoles : quatre, de x = −12 à 6, deux faces de rayons chacune ; les étiquettes des rayons au-dessus des allées.
  const teintes = [['#d6001c', '#f2c21b', '#2f6fb0', '#ffffff', '#3a8a4a'], ['#e07b1b', '#c8382f', '#f4d35e', '#2b2b2b'], ['#2f6fb0', '#ffffff', '#e9b62c', '#8a2b25'], ['#1aa1d6', '#e8112d', '#ffffff', '#2f8a4a', '#f2b705']];
  [-12, -6, 0, 6].forEach((x, k) => {
    K.boite(1.2, 1.9, 13, marchandises(`marchandises${k}`, teintes[k]), x, .95, 2.5); K.boite(1.3, .08, 13.1, '#c9ccce', x, 1.94, 2.5); bloc(I, 1.3, 13.2, x, 2.5, 2);
  });
  for (const R of RAYONS.slice(0, 8)) panneauTexte([R.nom], 2.2, .4, R.x, 2.9, -4.4, Math.PI, { fond: '#d6001c', encre: '#ffffff', px: 1024, py: 186, police: '800 90px "Google Sans", system-ui, sans-serif' }).castShadow = false; // au bout des allées, côté caisses
  // Les frigos du fond (portes vitrées éclairées) et les fruits et légumes, à droite.
  const frigo = toile('frigos', 256, 256, (c, w, h) => { c.fillStyle = '#cfe8f2'; c.fillRect(0, 0, w, h); for (let r = 0; r < 4; r++) for (let k = 0; k < 8; k++) { c.fillStyle = ['#ffffff', '#f2c21b', '#e8e2d4', '#2f6fb0', '#e5a6a0'][(r + k) % 5]; c.fillRect(k * w / 8 + 4, r * h / 4 + 12, w / 8 - 8, h / 4 - 24); } c.strokeStyle = '#8fa3ad'; c.lineWidth = 6; for (let k = 0; k <= 4; k++) { c.beginPath(); c.moveTo(k * w / 4, 0); c.lineTo(k * w / 4, h); c.stroke(); } }, { repete: [5, 1], rugosite: .2 });
  frigo.emissive = new THREE.Color('#9fc4d4'); frigo.emissiveIntensity = .35;
  K.boite(24, 2.2, .8, frigo, -2, 1.1, D / 2 - .55); bloc(I, 24, 1, -2, D / 2 - .55, 2.2);
  panneauTexte(['PRODUITS FRAIS'], 4, .5, -2, 2.8, D / 2 - .18, Math.PI, { fond: '#2f6fb0', encre: '#ffffff', px: 1024, py: 128, police: '800 84px "Google Sans", system-ui, sans-serif' });
  const caisseBois = K.mat('#a07a4c', { rugosite: .8 });
  for (let k = 0; k < 6; k++) {
    const x = 17.2, z = -3 + k * 1.9; K.boite(2.4, .8, 1.5, caisseBois, x, .4, z); bloc(I, 2.5, 1.6, x, z, .9);
    const fr = ['#f2c21b', '#e2a23b', '#c8382f', '#b99a6a', '#3a8a4a', '#e07b1b'][k];
    for (let i = 0; i < 10; i++) K.sphere(.13, fr, x - .9 + (i % 5) * .45, .9, z - .3 + Math.floor(i / 5) * .6);
  }
  panneauTexte(['FRUITS ET LÉGUMES'], 3.6, .5, W / 2 - .18, 2.8, 2, -Math.PI / 2, { fond: '#3a8a4a', encre: '#ffffff', px: 1024, py: 142, police: '800 84px "Google Sans", system-ui, sans-serif' });
  // Les caisses : le tapis, la caisse enregistreuse, le panneau numéroté ; la caissière derrière.
  CAISSES.forEach((x, k) => {
    K.boite(.9, .9, 3.2, '#d9d9d6', x, .45, -7); K.boite(.7, .05, 2.4, '#2b2b2b', x, .92, -6.6); K.boite(.4, .3, .35, '#3a3d40', x, 1.1, -8.2); bloc(I, 1, 3.3, x, -7, 1);
    panneauTexte([`CAISSE ${k + 1}`], 1.1, .35, x, 2.6, -7, 0, { fond: '#d6001c', encre: '#ffffff', px: 512, py: 163, police: '800 90px "Google Sans", system-ui, sans-serif' });
  });
  panneauTexte(['SORTIE · CAISSES'], 3.2, .45, 0, 3, -D / 2 + .18, 0, { fond: '#1f7a3e', encre: '#ffffff', px: 1024, py: 144, police: '800 84px "Google Sans", system-ui, sans-serif' });
  const gens = () => {
    if (I.gens || !personnagesPrets()) return; I.gens = true;
    I.caissieres = CAISSES.map((x, k) => { const p = personne(900 + k * 3, { femme: true }); p.position.set(x - .9, 0, -7.4); p.rotation.y = Math.PI / 2; K.racine.add(p); return p; });
    for (const [x, z, r, i] of [[-9, 5, 0, 911], [-3, 7, Math.PI, 912], [3, 0, Math.PI / 2, 913], [15.5, 4, -Math.PI / 2, 914], [-2, 10.5, Math.PI, 915]]) { const p = personne(i); p.position.set(x, 0, z); p.rotation.y = r; K.racine.add(p); }
    const vigile = personne(920, { femme: false }); vigile.position.set(4.5, 0, -D / 2 + 1.2); vigile.rotation.y = 0; K.racine.add(vigile);
  };
  K.into(K.racine, gens);
  I.majEya = () => { if (!I.gens) K.into(I.g, gens); };
}

// ---------- Ce qu'on fait à Akpakpa : faire ses courses, jouer au basket, louer une chambre ----------
const X = { S: null, T: null, ligne: () => { }, choisir: () => { } };
/** Appelé par le salon au démarrage. */
export function initAkpakpa(ctx) { Object.assign(X, ctx); }
const fmtF = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const dansPiece = (I, x, z, r) => X.S && Math.hypot(X.S.x - (I.centre[0] + x), X.S.z - (I.centre[1] + z)) < r;
const total = l => l.reduce((t, a) => t + a.prix, 0);
const leVeh = () => { const V = X.T?.veh; return V ? (V.D.cache ? 'ta voiture' : V.type === 'velo' ? 'ton vélo' : 'ta moto') : ''; };

function prendreAuRayon(R) {
  X.choisir(`${R.nom} · ton panier : ${X.S.panier?.length || 0} article(s)`, R.p.map(id => { const P = PRODUITS[id]; return { texte: `${P.nom} · ${fmtF(P.prix)}`, f: () => {
    (X.S.panier ||= []).push({ id, nom: P.nom, prix: P.prix, repas: P.repas });
    X.ligne(`${P.nom} dans le panier. Panier : ${X.S.panier.length} article(s), ${fmtF(total(X.S.panier))}.`);
  } }; }), { annuler: 'C’est bon' });
}
async function payer(I, k) {
  const P = X.S.panier || [], t = total(P); if (!P.length) return;
  if ((VIE.data?.argent ?? 0) < t) { X.ligne(`Il te manque ${fmtF(t - (VIE.data?.argent ?? 0))} : repose un article (« Vider le panier ») ou recharge ton compte.`); return; }
  if (!(await depenser(t, `Super U Akpakpa · ${P.length} article(s)`))) return;
  COURSES.sac.push(...P); X.S.panier = []; sauverCourses();
  const c = I.caissieres?.[k]; if (c) bulle(c, 'Merci, à bientôt au Super U !', { duree: 3 });
  X.ligne(`Payé : ${fmtF(t)}. Tes courses sont dans un sac (${resume(COURSES.sac)}). ${X.T?.veh ? `Va jusqu’à ${leVeh()} : « Mettre les courses dans le coffre ».` : 'Ramène-les chez toi : « Ranger les courses ».'}`);
}

// Le basket : dix tirs au panier sur le terrain du Centre EYA. La jauge va et vient ; on tire quand le curseur est dans la
// zone verte (plus étroite de loin). 50 F par panier, à la fin de la partie.
const PANIER = { x: -62, z: -3.42, y: 3.05 }; // le cercle nord (repère EYA)
const POSTES = [[0, 4.6, 'lancer franc'], [3.6, 3, 'à droite'], [-3.6, 3, 'à gauche'], [5.5, 1.2, 'dans le coin droit'], [-5.5, 1.2, 'dans le coin gauche'], [0, 6.9, 'à trois points']];
const BK = { actif: false, el: null };
const surLeTerrain = () => { if (!X.S || X.S.lieu || X.T?.mode !== 'pied') return false; const [x, z] = localDe(EYA, X.S.x, X.S.z); return x > -70 && x < -54 && z > -6 && z < 24; };
const localDe = ({ o, ang }, x, z) => { const dx = x - o[0], dz = z - o[1], c = Math.cos(ang), s = Math.sin(ang); return [dx * c + dz * s, -dx * s + dz * c]; };
function jauge() {
  if (BK.el) return BK.el;
  const el = document.createElement('div'); el.className = 'jauge-basket';
  el.innerHTML = '<div class="jb-titre"></div><div class="jb-barre"><i class="jb-zone"></i><b class="jb-curseur"></b></div>';
  Object.assign(el.style, { position: 'fixed', left: '50%', top: '92px', transform: 'translateX(-50%)', zIndex: 40, pointerEvents: 'none', textAlign: 'center', font: '700 15px "Google Sans", system-ui, sans-serif', color: '#fff', textShadow: '0 1px 3px #000' });
  const barre = el.querySelector('.jb-barre'); Object.assign(barre.style, { position: 'relative', width: '280px', height: '18px', borderRadius: '9px', background: 'rgba(0,0,0,.55)', marginTop: '6px', overflow: 'hidden', border: '2px solid #fff' });
  Object.assign(el.querySelector('.jb-zone').style, { position: 'absolute', top: 0, bottom: 0, background: '#2fbf5a' });
  Object.assign(el.querySelector('.jb-curseur').style, { position: 'absolute', top: '-2px', bottom: '-2px', width: '6px', marginLeft: '-3px', background: '#ffd23b', borderRadius: '3px' });
  document.body.append(el); BK.el = el; return el;
}
function posteSuivant() {
  const [dx, dz, nom] = POSTES[BK.tir % POSTES.length], lx = PANIER.x + dx, lz = PANIER.z + dz, [x, z] = monde(EYA, lx, lz), [px, pz] = monde(EYA, PANIER.x, PANIER.z);
  X.S.x = x; X.S.z = z; X.S.cap = Math.atan2(px - x, pz - z); X.S.saut = true;
  const loin = Math.hypot(dx, dz);
  BK.poste = { x, z, loin, nom }; BK.cible = .45 + loin * .04; BK.zone = Math.max(.07, .2 - loin * .018); BK.vitesse = 2.2 + loin * .25; BK.t = Math.random() * 3; BK.phase = 'jauge';
  const el = jauge(); el.hidden = false; el.querySelector('.jb-titre').textContent = `Tir ${BK.tir + 1} sur 10 · ${nom} · ${BK.paniers} panier(s)`;
  Object.assign(el.querySelector('.jb-zone').style, { left: `${(BK.cible - BK.zone / 2) * 100}%`, width: `${BK.zone * 100}%` });
}
function jouerBasket() {
  Object.assign(BK, { actif: true, tir: 0, paniers: 0 });
  if (!BK.ballon) { const t = toile('ballon', 128, 64, (c, w, h) => { c.fillStyle = '#d9652b'; c.fillRect(0, 0, w, h); c.strokeStyle = '#2a1a10'; c.lineWidth = 3; for (const x of [w / 4, w / 2, w * 3 / 4]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke(); }); BK.ballon = new THREE.Mesh(new THREE.SphereGeometry(.12, 16, 12), t); BK.ballon.castShadow = true; scene.add(BK.ballon); }
  BK.ballon.visible = false;
  X.ligne('Dix tirs au panier : quand le curseur jaune passe dans la zone verte, « Tirer ! ». 50 F par panier.');
  posteSuivant();
}
function arreterBasket(msg) {
  BK.actif = false; if (BK.el) BK.el.hidden = true; if (BK.ballon) BK.ballon.visible = false;
  if (msg) X.ligne(msg);
}
function tirer() {
  if (BK.phase !== 'jauge') return;
  const c = (Math.sin(BK.t * BK.vitesse) + 1) / 2, ecart = c - BK.cible, reussi = Math.abs(ecart) <= BK.zone / 2;
  const [rx, rz] = monde(EYA, PANIER.x, PANIER.z), dx = rx - BK.poste.x, dz = rz - BK.poste.z, l = Math.hypot(dx, dz);
  const rate = reussi ? 0 : Math.sign(ecart) * Math.min(1.1, .35 + Math.abs(ecart) * 2.5); // trop fort : derrière le cercle ; trop doux : devant
  BK.vol = { t: 0, de: [BK.poste.x + dx / l * .4, 2.1, BK.poste.z + dz / l * .4], vers: [rx + dx / l * rate, PANIER.y + (reussi ? 0 : .05), rz + dz / l * rate], reussi, duree: .9 + l * .04 };
  BK.phase = 'vol'; BK.ballon.visible = true; X.S.geste = 'salut';
}
function majBasket(dt) {
  if (!BK.actif) return;
  if (!surLeTerrain() && BK.phase === 'jauge') { arreterBasket(`Tu as quitté le terrain : partie arrêtée (${BK.paniers} panier(s)).`); return; }
  BK.t += dt;
  if (BK.phase === 'jauge') { const c = (Math.sin(BK.t * BK.vitesse) + 1) / 2; if (BK.el) BK.el.querySelector('.jb-curseur').style.left = `${c * 100}%`; return; }
  const V = BK.vol; if (!V) return; V.t += dt; const k = Math.min(1, V.t / V.duree);
  if (k < 1) { const y = V.de[1] + (V.vers[1] - V.de[1]) * k + Math.sin(k * Math.PI) * 2.2; BK.ballon.position.set(V.de[0] + (V.vers[0] - V.de[0]) * k, y, V.de[2] + (V.vers[2] - V.de[2]) * k); BK.ballon.rotation.x -= dt * 9; return; }
  const apres = V.t - V.duree; // après le cercle : il tombe dans le filet, ou rebondit à côté
  const y = Math.max(.12, V.vers[1] - apres * apres * 9 - (V.reussi ? apres * 1.5 : 0)), dx = V.reussi ? 0 : (V.vers[0] - V.de[0]) * apres * .4, dz = V.reussi ? 0 : (V.vers[2] - V.de[2]) * apres * .4;
  BK.ballon.position.set(V.vers[0] + dx, y, V.vers[2] + dz);
  if (apres < .9) return;
  BK.vol = null; BK.tir++; if (V.reussi) BK.paniers++;
  X.ligne(V.reussi ? `Panier ! ${BK.paniers} sur ${BK.tir}.` : `Raté… ${BK.paniers} sur ${BK.tir}.`);
  if (BK.tir >= 10) { const gain = BK.paniers * 50; arreterBasket(); if (gain) gagner(gain, `basket au Centre EYA · ${BK.paniers} paniers`, { source: 'jeu' }); X.ligne(`Fin de la partie : ${BK.paniers} panier(s) sur 10.${gain ? ` +${fmtF(gain)}.` : ''} « Jouer au basket » pour rejouer.`); return; }
  posteSuivant();
}

// L'hôtel : parler à la réception, louer une chambre pour la nuit ou la réserver pour un autre soir, prendre la clé, dormir.
// Les prix sont ceux du jeu (la journée de moto : 1 500 F, l'appartement de la Haie Vive : 5 000 F par jour).
const CHAMBRES = {
  101: { nom: 'Chambre standard', prix: 3000, lit: [-2.9, -7.4, 0] }, 102: { nom: 'Chambre à deux lits', prix: 4000, lit: [5.2, -7.4, 0] },
  103: { nom: 'Suite', prix: 6000, lit: [13.2, -7.4, 0] }, 104: { nom: 'Appartement (salon, cuisine, chambre)', prix: 9000, lit: [13, 7.4, Math.PI] },
};
const CLE_HOTEL = 'kutonu.hotel8janvier';
const HO_ETAT = (() => { try { return JSON.parse(localStorage.getItem(CLE_HOTEL) || '{}'); } catch { return {}; } })();
HO_ETAT.resas ||= [];
const sauverHotel = () => { try { localStorage.setItem(CLE_HOTEL, JSON.stringify(HO_ETAT)); } catch { } };
const aujourdHui = () => jourDe(Date.now()), demainDe = (j, n) => new Date(Date.parse(j) + n * 864e5).toISOString().slice(0, 10);
const cleValide = () => HO_ETAT.cle && HO_ETAT.cle.jour === aujourdHui() ? HO_ETAT.cle : null;
function reception(I) {
  if (I.receptionniste) bulle(I.receptionniste, 'Bonsoir, bienvenue à l’Hôtel 8 Janvier !', { duree: 3 });
  const cle = cleValide(), resa = HO_ETAT.resas.find(r => r.jour === aujourdHui()), o = [];
  if (resa && !cle) o.push({ texte: `Prendre ma clé · chambre ${resa.chambre} (réservée)`, f: () => donnerCle(I, resa.chambre, true) });
  if (!cle) o.push({ texte: 'Louer une chambre pour cette nuit', f: () => choisirChambre(I, 0) });
  o.push({ texte: 'Réserver une chambre pour un autre soir', f: () => X.choisir('Pour quel soir ?', [1, 2, 3].map(n => ({ texte: n === 1 ? 'Demain soir' : n === 2 ? 'Après-demain soir' : 'Dans trois jours', f: () => choisirChambre(I, n) }))) });
  if (cle) o.push({ texte: `Rendre la clé de la chambre ${cle.chambre}`, f: () => { HO_ETAT.cle = null; sauverHotel(); X.ligne('Clé rendue. Merci de votre séjour, à bientôt !'); } });
  if (HO_ETAT.resas.length) o.push({ texte: 'Mes réservations', sous: HO_ETAT.resas.map(r => `${r.chambre} le ${r.jour.slice(8)}/${r.jour.slice(5, 7)}`).join(' · '), f: () => { } });
  X.choisir('La réception de l’Hôtel 8 Janvier', o, { annuler: 'Au revoir' });
}
function choisirChambre(I, dans) {
  X.choisir(dans ? 'Quelle chambre réserver ? (payée maintenant)' : 'Quelle chambre pour cette nuit ?', Object.entries(CHAMBRES).map(([n, C]) => ({
    texte: `${n} · ${C.nom} · ${fmtF(C.prix)}`, desactive: (VIE.data?.argent ?? 0) < C.prix, sous: (VIE.data?.argent ?? 0) < C.prix ? 'Tu n’as pas assez d’argent' : '',
    f: async () => {
      if (!(await depenser(C.prix, `Hôtel 8 Janvier · chambre ${n}${dans ? ' (réservation)' : ''}`))) return;
      if (dans) { const jour = demainDe(aujourdHui(), dans); HO_ETAT.resas.push({ chambre: n, jour }); sauverHotel(); X.ligne(`Réservé : chambre ${n} (${C.nom}) pour le soir du ${jour.slice(8)}/${jour.slice(5, 7)}. Ce soir-là, ta clé t’attend à la réception.`); if (I.receptionniste) bulle(I.receptionniste, 'C’est noté, à bientôt !', { duree: 3 }); }
      else donnerCle(I, n, false);
    },
  })));
}
function donnerCle(I, n, resa) {
  HO_ETAT.cle = { chambre: String(n), jour: aujourdHui() }; if (resa) HO_ETAT.resas = HO_ETAT.resas.filter(r => !(r.jour === aujourdHui() && r.chambre === String(n))); sauverHotel();
  if (I.receptionniste) bulle(I.receptionniste, `Voici votre clé : chambre ${n}. Bonne nuit !`, { duree: 3.5 });
  X.ligne(`Clé de la chambre ${n} (${CHAMBRES[n].nom}). ${n === '104' ? 'L’appartement est de l’autre côté du couloir, au fond : la chambre est derrière le salon.' : 'Prends le couloir : la porte numérotée.'} Approche-toi du lit : « Dormir ».`);
}
function dormir(I, n) {
  const [lx, lz, a] = CHAMBRES[n].lit;
  I.lit = { x: lx, z: lz, a, y: .42, vue: a + Math.PI, leve: [lx + (a ? -1.5 : 1.5), lz + (a ? -1.6 : 1.6), a + Math.PI], deplie: { visible: false }, plie: { visible: true } };
  coucher(I); if (X.S.couche) X.S.couche.moi = X.S.moi; // pas de drap à border : le lit de l'hôtel est fait
  X.ligne('Bonne nuit… Zzz.');
  const voile = document.createElement('div'); Object.assign(voile.style, { position: 'fixed', inset: 0, background: '#000', opacity: 0, transition: 'opacity 1.6s', zIndex: 60, pointerEvents: 'none', display: 'grid', placeItems: 'center', color: '#fff', font: '700 26px "Google Sans", system-ui, sans-serif' });
  voile.textContent = 'Zzz…'; document.body.append(voile);
  requestAnimationFrame(() => { voile.style.opacity = 1; });
  setTimeout(() => { voile.textContent = 'Le lendemain matin…'; }, 2600);
  setTimeout(() => { voile.style.opacity = 0; X.ligne('Bonjour ! Tu as bien dormi à l’Hôtel 8 Janvier. Avance pour te lever ; la clé se rend à la réception.'); }, 4600);
  setTimeout(() => voile.remove(), 6400);
}

/** Les boutons du moment (salon.js). */
export function actionsAkpakpa() {
  const S = X.S, T = X.T; if (!S || !T) return [];
  if (BK.actif) return BK.phase === 'jauge' ? [{ texte: 'Tirer !', f: tirer }, { texte: 'Arrêter de jouer', f: () => arreterBasket(`Partie arrêtée : ${BK.paniers} panier(s) sur ${BK.tir}.`) }] : [];
  const out = [], I = S.lieu;
  if (T.mode === 'pied' && I?.id === 'super-u') {
    const lx = S.x - I.centre[0], lz = S.z - I.centre[1], R = RAYONS.find(r => lx > r.zone[0] && lx < r.zone[1] && lz > r.zone[2] && lz < r.zone[3]); if (R) out.push({ texte: `Prendre au rayon ${R.nom}`, f: () => prendreAuRayon(R) });
    const k = CAISSES.findIndex(x => dansPiece(I, x + 1, -7, 2.2));
    if (k >= 0 && S.panier?.length) out.push({ texte: `Payer à la caisse · ${fmtF(total(S.panier))}`, f: () => payer(I, k) });
    if (S.panier?.length && !R && k < 0) out.push({ texte: `Vider le panier (${S.panier.length})`, f: () => { S.panier = []; X.ligne('Les articles retournent en rayon.'); } });
  }
  if (T.mode === 'pied' && I?.id === 'hotel-8-janvier') {
    if (dansPiece(I, -11.5, 4.1, 1.9)) out.push({ texte: 'Parler à la réception', f: () => reception(I) });
    if (!S.couche) for (const [n, C] of Object.entries(CHAMBRES)) if (dansPiece(I, C.lit[0], C.lit[1] + (C.lit[2] ? -1 : 1), 2)) {
      const cle = cleValide(); out.push(cle?.chambre === n ? { texte: 'Dormir jusqu’au matin', f: () => dormir(I, n) } : { texte: 'Dormir ici', f: () => X.ligne(`La chambre ${n} n’est pas à toi : loue-la à la réception (${fmtF(C.prix)} la nuit).`) });
    }
    if (S.couche) out.push({ texte: 'Se lever', f: lever });
  }
  if (surLeTerrain() && !T.zem) out.push({ texte: 'Jouer au basket', f: jouerBasket });
  // Les courses : du sac au coffre, du coffre à la maison.
  if (T.mode === 'pied' && !I && T.veh && Math.hypot(T.veh.x - S.x, T.veh.z - S.z) < 3.6) {
    if (COURSES.sac.length) out.push({ texte: `Mettre les courses dans ${T.veh.D.cache ? 'le coffre' : 'le top-case'}`, f: () => { COURSES.coffre.push(...COURSES.sac); COURSES.sac = []; sauverCourses(); X.ligne(`Les courses sont dans ${T.veh.D.cache ? 'le coffre' : 'le top-case'} : ${resume(COURSES.coffre)}. Ramène-les chez toi : sors-les du ${T.veh.D.cache ? 'coffre' : 'top-case'} devant ta porte.`); } });
    else if (COURSES.coffre.length) out.push({ texte: `Sortir les courses ${T.veh.D.cache ? 'du coffre' : 'du top-case'}`, f: () => { COURSES.sac.push(...COURSES.coffre); COURSES.coffre = []; sauverCourses(); X.ligne(`Tu portes tes courses : ${resume(COURSES.sac)}. Chez toi : « Ranger les courses ».`); } });
  }
  if (T.mode === 'pied' && I?.prive && COURSES.sac.length && !S.couche) out.push({ texte: 'Ranger les courses', f: () => { const r = COURSES.sac.reduce((t, a) => t + (a.repas || 0), 0); COURSES.placard += r; COURSES.sac = []; sauverCourses(); X.ligne(`Courses rangées : ${r} repas au placard. Au fourneau, tu cuisines avec tes courses sans racheter les ingrédients.`); } });
  return out;
}

/** Chaque image (trajets.js, à côté de majCulte) : le public, les danseurs, les bouteilles sur la ligne. */
export function majAkpakpa(dt) {
  majBasket(dt);
  if (X.S?.panier?.length && X.S.lieu?.id !== 'super-u') { X.S.panier = []; X.ligne('« Hé, tu n’as pas payé ! » Le vigile te reprend les articles à la sortie : passe d’abord à la caisse.'); }
  for (const id of ['eya-amphi', 'eya-studio', 'sobebra-visite', 'hotel-8-janvier', 'super-u']) { const I = INTERIEURS.get(id); if (I?.g?.visible) I.majEya?.(dt); }
}
/** Bâtit Akpakpa (main.js, après la ville). */
export function construireAkpakpa() {
  const obst = [];
  for (const f of [centreEya, usineSobebra, rondPointBeninoise, hotel8Janvier, superU]) { try { obst.push(...f()); } catch (e) { console.warn('Akpakpa :', f.name, e); } }
  poserObstacles('akpakpa', obst);
  if (import.meta.env.DEV) window.__akpakpa = { obst }; // pour les tests (banc d'essai)
}
