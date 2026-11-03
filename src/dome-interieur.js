import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { personne } from './discussions.js';
import { declarerInterieur } from './interieurs.js';
import { K, panneauTexte } from './lieux.js';
import { poserAssis } from './personnages.js';

// ---------- Le Dôme du Sofitel, dedans : la salle de « La Nuit Kutɔnu Vibes » ----------
// « C'est là qu'on va recevoir nos invités » (Murielle, 03/11). D'après les photos des architectes d'intérieur
// (Sundukovy Sisters) et les vidéos de l'hôtel (Sofitel Cotonou Marina, 2025) : une salle d'environ 740 m² aux murs
// crème cannelés, pilastres et appliques, moquette bleu nuit à motifs ; au plafond, une coupole de lattes de bois d'où
// tombe une pluie de centaines de petites lumières ; au fond, la scène, ses rideaux sombres et un grand écran. Ici en
// soirée de gala, comme dans la vidéo de l'hôtel : tables rondes nappées de blanc, chaises roses, lumière violette sur
// les murs ; et pour la soirée, un tapis rouge de l'entrée à la scène, un photocall, l'accueil des invités, les
// trophées et le pupitre de la remise des prix.
const W = 28, D = 32, H = 8.5, RD = 12, ZD = -1; // salle, hauteur des murs, rayon et centre de la coupole
const SCENE = { l: 18, p: 6, h: 1.1 }; // la scène, contre le mur du fond (z = D/2)

// Moquette bleu nuit, volutes bleu clair (la moquette du Dôme).
K.motif('moquetteDome', (c, t) => {
  c.fillStyle = '#18213a'; c.fillRect(0, 0, t, t);
  c.lineWidth = 2.5; c.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    c.strokeStyle = ['#3d5d93', '#5c7fb6', '#2b3f66', '#8aa6cf'][i % 4];
    const x = K.alea() * t, y = K.alea() * t, r = 14 + K.alea() * 40, a = K.alea() * 6;
    for (const dx of [-t, 0, t]) for (const dy of [-t, 0, t]) { c.beginPath(); c.arc(x + dx, y + dy, r, a, a + 1.6 + K.alea() * 2); c.stroke(); }
  }
}, 256, 256);
// Les murs : crème, cannelures verticales.
K.motif('cannelures', (c, t) => {
  c.fillStyle = '#efe6d6'; c.fillRect(0, 0, t, t);
  for (let i = 0; i < 16; i++) { c.fillStyle = 'rgba(160, 140, 110, .16)'; c.fillRect(i * t / 16, 0, 2, t); c.fillStyle = 'rgba(255, 255, 255, .5)'; c.fillRect(i * t / 16 + 3, 0, 2, t); }
}, 256, 256);
// La coupole : lattes de bois qui montent vers le centre (u fait le tour : chaque bande devient une latte).
K.motif('lattesCoupole', (c, t) => {
  for (let i = 0; i < 96; i++) { c.fillStyle = ['#8a5a36', '#9b6a42', '#7a4d2e', '#a8774c'][i % 4]; c.fillRect(i * t / 96, 0, t / 96, t); c.fillStyle = 'rgba(30, 18, 8, .55)'; c.fillRect(i * t / 96, 0, 1.5, t); }
}, 1024, 64);
// Les rideaux de la scène : velours bleu nuit, plis.
K.motif('rideauScene', (c, t) => {
  const g = c.createLinearGradient(0, 0, t / 12, 0); g.addColorStop(0, '#0f1730'); g.addColorStop(.5, '#2a3963'); g.addColorStop(1, '#0f1730');
  c.fillStyle = g; for (let i = 0; i < 12; i++) { c.save(); c.translate(i * t / 12, 0); c.fillRect(0, 0, t / 12, t); c.restore(); }
}, 256, 256);
// Le photocall : fond blanc, logos de la soirée répétés en quinconce.
K.motif('photocall', (c, t) => {
  c.fillStyle = '#fafaf7'; c.fillRect(0, 0, t, t); c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let l = 0; l < 4; l++) for (let k = 0; k < 3; k++) {
    const x = (k + (l % 2 ? .5 : 0)) * t / 3 + t / 6, y = (l + .5) * t / 4;
    c.fillStyle = '#1A7D52'; c.font = '800 30px system-ui, sans-serif'; c.fillText('La Nuit', x, y - 14);
    c.fillStyle = '#d99a00'; c.font = '800 26px system-ui, sans-serif'; c.fillText('Kutɔnu Vibes', x, y + 16);
  }
}, 512, 512);

// L'écran de la scène : l'affiche de la soirée (les mots du teaser). `mat.userData.dessiner(lignes)` la change : la remise
// des prix y montre chaque prix, puis son gagnant (nuit.js).
function affiche(l, h, lignes) {
  const cv = document.createElement('canvas'); cv.width = l; cv.height = h; const c = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const dessiner = L => {
    const g = c.createLinearGradient(0, 0, l, h); g.addColorStop(0, '#2a0f4f'); g.addColorStop(.55, '#4b1a78'); g.addColorStop(1, '#0d1a3a'); c.fillStyle = g; c.fillRect(0, 0, l, h);
    for (let i = 0; i < 90; i++) { const x = Math.random() * l, y = Math.random() * h, r = 2 + Math.random() * 10; c.fillStyle = `rgba(255, ${190 + Math.random() * 60}, ${150 + Math.random() * 80}, ${.12 + Math.random() * .3})`; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const { t, y, taille, couleur, poids = 800 } of L) { c.font = `${poids} ${taille * l / 1600}px system-ui, sans-serif`; c.fillStyle = couleur; c.fillText(t, l / 2, h * y, l * .92); }
    tex.needsUpdate = true;
  };
  dessiner(lignes);
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }); mat.userData.dessiner = dessiner; return mat;
}
/** L'affiche de la soirée, au repos. */
export const AFFICHE_NUIT = [
  { t: 'LA NUIT', y: .28, taille: 150, couleur: '#ffffff' }, { t: 'KUTƆNU VIBES', y: .48, taille: 170, couleur: '#F5B700' },
  { t: 'Remise des prix', y: .7, taille: 70, couleur: '#ffffff', poids: 700 }, { t: 'Les meilleurs joueurs récompensés', y: .82, taille: 50, couleur: '#e6d6ff', poids: 600 },
];
// Une lumière violette qui monte le long du mur (projecteur posé au sol) : dégradé additif.
let LAVIS = null;
function lavis() {
  if (LAVIS) return LAVIS;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 256, 4, 32, 256, 250); g.addColorStop(0, 'rgba(210, 120, 255, 1)'); g.addColorStop(.35, 'rgba(150, 70, 230, .55)'); g.addColorStop(1, 'rgba(90, 40, 200, 0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  LAVIS = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .55 });
  return LAVIS;
}

function salle(I) {
  const bloc = (l, p, x, z, h = 1) => I.obstacles.push([x, z, l / 2, p / 2, h]);
  // Le sol, les quatre murs, le plafond percé de la coupole.
  K.boite(W, .2, D, K.tex('moquetteDome', W / 5, D / 5), 0, -.1, 0).castShadow = false;
  const mur = K.tex('cannelures', 6, 2);
  for (const [l, p, x, z] of [[W, .3, 0, -D / 2], [W, .3, 0, D / 2], [.3, D, -W / 2, 0], [.3, D, W / 2, 0]]) K.boite(l, H, p, mur, x, H / 2, z).castShadow = false;
  const plafond = new THREE.Shape(); plafond.moveTo(-W / 2, -D / 2); plafond.lineTo(W / 2, -D / 2); plafond.lineTo(W / 2, D / 2); plafond.lineTo(-W / 2, D / 2); plafond.closePath();
  const trou = new THREE.Path(); trou.absarc(0, ZD, RD, 0, Math.PI * 2, false); plafond.holes.push(trou);
  const pl = K.maillage(new THREE.ShapeGeometry(plafond, 48).rotateX(Math.PI / 2), K.mat('#f3eee4', { rugosite: .9 }), 0, H, 0); pl.castShadow = false;
  // La coupole de lattes : une calotte de sphère vue du dessous, 6,5 m au-dessus du plafond.
  const monte = 6.5, rho = (RD * RD + monte * monte) / (2 * monte), cy = H + monte - rho, tmax = Math.asin(RD / rho);
  const lattes = K.tex('lattesCoupole', 1, 1); lattes.side = THREE.BackSide;
  const coupole = K.maillage(new THREE.SphereGeometry(rho, 96, 16, 0, Math.PI * 2, 0, tmax), lattes, 0, cy, ZD); coupole.castShadow = false;
  const corniche = K.maillage(new THREE.TorusGeometry(RD + .05, .14, 8, 120).rotateX(Math.PI / 2), K.mat('#fff2d4', { emissif: '#e8c98f' }), 0, H - .05, ZD); corniche.castShadow = false;
  for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2, s = K.cyl(.09, .09, .02, 10, K.mat('#fff8e8', { emissif: '#fff1cf' }), Math.cos(a) * (RD + .9), H - .01, ZD + Math.sin(a) * (RD + .9)); s.castShadow = false; } // les spots autour
  // La pluie de lumières : des centaines de gouttes au bout de fils, plus longues au centre, sous la coupole.
  const N = 800, goutte = new THREE.InstancedMesh(new THREE.SphereGeometry(.07, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff1cf', toneMapped: false }), N * 2), fils = [], m = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const r = (RD - 2.2) * Math.pow(K.alea(), .75), a = K.alea() * Math.PI * 2, x = Math.cos(a) * r, z = ZD + Math.sin(a) * r;
    const haut = cy + Math.sqrt(rho * rho - r * r), long = 1.6 + 9.8 * Math.pow(1 - r / (RD - 2.2), 1.4) * (.7 + .3 * K.alea()), bas = Math.max(4, haut - long); // jusqu'à 4 m du sol au centre, au-dessus du tapis rouge
    goutte.setMatrixAt(i * 2, m.makeTranslation(x, bas, z)); goutte.setMatrixAt(i * 2 + 1, m.makeTranslation(x, bas + (haut - bas) * .45, z));
    fils.push(x, haut, z, x, bas, z);
  }
  goutte.frustumCulled = false; K.racine.add(goutte);
  const lf = new THREE.BufferGeometry(); lf.setAttribute('position', new THREE.Float32BufferAttribute(fils, 3));
  K.racine.add(new THREE.LineSegments(lf, new THREE.LineBasicMaterial({ color: '#d8c9a6', transparent: true, opacity: .28 })));
  // Pilastres et appliques le long des murs ; entre eux, la lumière violette de la soirée.
  const pilastre = K.mat('#f6efe2', { rugosite: .8 }), applique = K.mat('#fff4dc', { emissif: '#f2d9a6' });
  const lumiere = (l, x, z, rot) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(l, 6.2), lavis()); p.position.set(x, 3.1, z); p.rotation.y = rot; p.renderOrder = 5; K.racine.add(p); };
  for (const s of [-1, 1]) for (let z = -D / 2 + 3; z < D / 2 - SCENE.p; z += 3.6) {
    K.boite(.25, H, .55, pilastre, s * (W / 2 - .27), H / 2, z); K.boite(.12, .5, .22, applique, s * (W / 2 - .45), 3.1, z).castShadow = false;
    if (z + 1.8 < D / 2 - SCENE.p) lumiere(2.6, s * (W / 2 - .17), z + 1.8, -s * Math.PI / 2);
  }
  for (const x of [-10.5, -6.5, 6.5, 10.5]) lumiere(3, x, -D / 2 + .17, 0); // de part et d'autre des portes
  // Les portes d'entrée (bois et bronze), le tapis rouge jusqu'à la scène.
  for (const s of [-1, 1]) { K.boite(1.3, 3.2, .1, K.mat('#6b4a2c', { rugosite: .5 }), s * .68, 1.6, -D / 2 + .2); K.boite(.06, .9, .06, K.mat('#c9a227', { metal: .7, rugosite: .3 }), s * .12, 1.3, -D / 2 + .28); }
  const tapis = D - SCENE.p - .4;
  K.boite(2.4, .03, tapis, K.mat('#9e1b2e', { rugosite: .95 }), 0, .015, -D / 2 + .2 + tapis / 2).castShadow = false;
  for (const s of [-1, 1]) for (let z = -D / 2 + 2; z < -D / 2 + 9; z += 2.3) { K.cyl(.05, .05, .9, 8, K.mat('#c9a227', { metal: .7, rugosite: .3 }), s * 1.6, .45, z); K.sphere(.08, K.mat('#c9a227', { metal: .7, rugosite: .3 }), s * 1.6, .95, z); } // potelets dorés
  for (const s of [-1, 1]) for (let z = -D / 2 + 2; z < -D / 2 + 7; z += 2.3) K.cable([s * 1.6, .85, z], [s * 1.6, .85, z + 2.3], .025, K.mat('#8e1426', { rugosite: .6 }));
  // Le photocall (on s'y fait photographier en arrivant) et l'accueil des invités.
  const pc = K.boite(6, 2.7, .12, K.tex('photocall', 2, 1), -8.5, 1.45, -D / 2 + 4.2); pc.rotation.y = Math.PI / 5; bloc(5.6, 1.5, -8.5, -D / 2 + 4.2, 2.8);
  K.boite(3, .02, 1.6, K.mat('#9e1b2e', { rugosite: .95 }), -7.4, .02, -D / 2 + 5.6).rotation.y = Math.PI / 5;
  K.boite(2.2, 1, .7, K.mat('#f6f2ea', { rugosite: .6 }), 7, .5, -D / 2 + 4.5); K.boite(2.3, .05, .8, K.mat('#c9a227', { metal: .6, rugosite: .35 }), 7, 1.02, -D / 2 + 4.5); bloc(2.3, .8, 7, -D / 2 + 4.5);
  for (const [z, rot] of [[-D / 2 + 4.1, Math.PI], [-D / 2 + 4.9, 0]]) panneauTexte(['Accueil des invités'], 2, .4, 7, 1.35, z, rot, { fond: '#1A7D52', encre: '#ffffff', px: 1024, py: 205, police: '800 110px system-ui, sans-serif' }); // lisible des deux côtés
  // La scène : estrade noire, marches au milieu, rideaux, grand écran, écrans de côté, pupitre et trophées.
  const zs = D / 2 - SCENE.p / 2, avant = D / 2 - SCENE.p, noir = K.mat('#111215', { rugosite: .4 });
  K.boite(SCENE.l, SCENE.h, SCENE.p, noir, 0, SCENE.h / 2, zs); bloc(SCENE.l, SCENE.p, 0, zs, SCENE.h);
  for (let k = 0; k < 3; k++) K.boite(3, SCENE.h * (k + 1) / 4, .4, noir, 0, SCENE.h * (k + 1) / 8, avant - 1.2 + k * .4);
  bloc(3, 1.2, 0, avant - .6, .8);
  K.boite(W - 1, H - SCENE.h, .2, K.tex('rideauScene', 10, 1), 0, SCENE.h + (H - SCENE.h) / 2, D / 2 - .3).castShadow = false;
  K.boite(W - 1, 1.2, .3, K.tex('rideauScene', 10, .3), 0, H - .6, avant + .3).castShadow = false; // le lambrequin
  K.boite(10.4, 5.9, .2, '#0b0b0d', 0, 4.65, D / 2 - .6);
  const ecran = new THREE.Mesh(new THREE.PlaneGeometry(10, 5.6), affiche(1600, 896, AFFICHE_NUIT));
  ecran.position.set(0, 4.65, D / 2 - .72); ecran.rotation.y = Math.PI; ecran.userData.garder = true; K.racine.add(ecran);
  for (const [s, a, b] of [[-1, 'Roi ou Reine de Zém Run', 'La plus longue série'], [1, 'Le plus riche de Cotonou', 'Le meilleur explorateur']]) {
    K.boite(4.6, 2.75, .2, '#0b0b0d', s * 11, 4.4, D / 2 - .6);
    const e = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.5), affiche(880, 500, [{ t: 'Les prix', y: .22, taille: 116, couleur: '#F5B700' }, { t: a, y: .5, taille: 87, couleur: '#ffffff', poids: 700 }, { t: b, y: .72, taille: 87, couleur: '#ffffff', poids: 700 }]));
    e.position.set(s * 11, 4.4, D / 2 - .72); e.rotation.y = Math.PI; e.userData.garder = true; K.racine.add(e);
  }
  const yS = SCENE.h;
  K.boite(.8, 1.15, .55, K.mat('#f4efe4', { rugosite: .5 }), 4.5, yS + .58, avant + 1.6); K.boite(.86, .05, .62, K.mat('#c9a227', { metal: .6, rugosite: .35 }), 4.5, yS + 1.18, avant + 1.6);
  panneauTexte(['Kutɔnu Vibes'], .7, .2, 4.5, yS + .8, avant + 1.31, Math.PI, { fond: '#1A7D52', encre: '#F5B700', px: 512, py: 146, police: '800 70px system-ui, sans-serif' });
  K.boite(3.2, .9, .8, K.mat('#f6f2ea', { rugosite: .6 }), -4.5, yS + .45, avant + 1.8);
  const or = K.mat('#d4a52a', { metal: .85, rugosite: .25 });
  const coupe = K.geo('coupeTrophee', () => new THREE.LatheGeometry([[.001, 0], [.13, 0], [.13, .05], [.04, .08], [.035, .3], [.05, .33], [.16, .42], [.18, .6], [.16, .62], [.001, .5]].map(([r, y]) => new THREE.Vector2(r, y)), 24));
  for (let k = 0; k < 4; k++) K.maillage(coupe, or, -5.7 + k * .8, yS + .9, avant + 1.8);
  for (const s of [-1, 1]) { K.boite(.8, 1.9, .7, '#1b1c1f', s * 8.2, yS + .95, avant + 1); } // enceintes
  const pont = K.mat('#6e7378', { metal: .6, rugosite: .4 }); K.boite(SCENE.l, .3, .3, pont, 0, H - 1.1, avant - .2);
  for (let k = 0; k < 9; k++) { const p = K.cyl(.14, .1, .35, 10, '#1b1c1f', -8 + k * 2, H - 1.45, avant - .2); p.rotation.x = .5; K.cyl(.11, .11, .01, 10, K.mat('#fff6e0', { emissif: '#fff0c8' }), -8 + k * 2, H - 1.62, avant - .1).rotation.x = .5; }
  // Seize tables rondes nappées de blanc, dix chaises roses chacune ; chaque chaise est une place où s'asseoir.
  const tables = []; for (const z of [-8, -3.4, 1.2, 5.8]) for (const x of [-9.4, -4, 4, 9.4]) tables.push([x, z]);
  const nappe = K.mat('#f7f5ef', { rugosite: .75 }), verre = K.mat('#dfeef0', { transparent: .5, rugosite: .1 });
  const bougie = K.mat('#fff2cc', { emissif: '#ffcf7a' });
  const bouquet = new THREE.InstancedMesh(new THREE.SphereGeometry(.085, 8, 6), K.mat('#ffffff', { rugosite: .7 }), tables.length * 9), teintes = ['#ffffff', '#f6c9d6', '#e58fac', '#fbe7ee', '#6f9a5a'].map(c => new THREE.Color(c));
  const chaiseTissu = mergeGeometries([new THREE.BoxGeometry(.46, .09, .44).translate(0, .44, 0), new THREE.BoxGeometry(.46, .52, .08).translate(0, .74, -.2)]);
  const chaiseCadre = mergeGeometries([[-.19, -.17], [.19, -.17], [-.19, .17], [.19, .17]].map(([x, z]) => new THREE.CylinderGeometry(.018, .018, .4, 6).translate(x, .2, z)));
  const assiette = new THREE.CylinderGeometry(.13, .13, .02, 16);
  const nc = tables.length * 10, tissu = new THREE.InstancedMesh(chaiseTissu, K.mat('#c98ba3', { rugosite: .8 }), nc), cadre = new THREE.InstancedMesh(chaiseCadre, K.mat('#c9a227', { metal: .6, rugosite: .35 }), nc), plats = new THREE.InstancedMesh(assiette, K.mat('#ffffff', { rugosite: .3 }), nc);
  const q = new THREE.Quaternion(), un = new THREE.Vector3(1, 1, 1), axeY = new THREE.Vector3(0, 1, 0);
  let n = 0;
  tables.forEach(([tx, tz], t) => {
    K.cyl(.92, 1, .75, 28, nappe, tx, .375, tz); K.cyl(.95, .95, .02, 28, nappe, tx, .76, tz).castShadow = false; bloc(1.9, 1.9, tx, tz);
    K.cyl(.05, .07, .5, 10, verre, tx, 1.02, tz); // un vase haut, un bouquet de roses blanches et roses
    for (let f = 0; f < 9; f++) { const a = f * 2.4, r = f ? .07 + (f % 3) * .035 : 0; bouquet.setMatrixAt(t * 9 + f, m.makeTranslation(tx + Math.cos(a) * r, 1.32 + (f ? -.02 * (f % 3) : .05), tz + Math.sin(a) * r)); bouquet.setColorAt(t * 9 + f, teintes[f === 8 ? 4 : (f + t) % 4]); }
    for (const s of [-1, 1]) K.cyl(.025, .025, .1, 8, bougie, tx + s * .35, .82, tz).castShadow = false;
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2 + (t % 2) * .3, x = tx + Math.sin(a) * 1.3, z = tz + Math.cos(a) * 1.3, cap = Math.atan2(tx - x, tz - z);
      m.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(axeY, cap), un); tissu.setMatrixAt(n, m); cadre.setMatrixAt(n, m);
      plats.setMatrixAt(n, m.makeTranslation(tx + Math.sin(a) * .7, .78, tz + Math.cos(a) * .7)); n++;
      I.sieges.push({ x, z, cap });
    }
  });
  for (const o of [tissu, cadre, plats, bouquet]) { o.castShadow = true; o.receiveShadow = true; K.racine.add(o); }
  // Les invités : assis à quelques tables, deux au photocall, l'hôtesse d'accueil, la présentatrice au pupitre, des serveurs.
  let id = 900;
  I.sieges.forEach((s, i) => { if ((i * 7) % 11 < 2) { const p = personne(id++, { assise: true }); poserAssis(p, s.x, .48, s.z, s.cap, .2); K.racine.add(p); s.occupe = true; } });
  const debout = (x, z, cap, o = {}, y = 0) => { const p = personne(id++, o); p.position.set(x, y, z); p.rotation.y = cap; K.racine.add(p); return p; };
  const photo = [debout(-7.3, -D / 2 + 5.3, Math.PI / 5 + Math.PI), debout(-6.6, -D / 2 + 6, Math.PI / 5 + Math.PI)];
  const hotesse = debout(7, -D / 2 + 3.6, 0, { role: 'bureau', femme: true });
  const presentatrice = debout(4.5, avant + 2.3, Math.PI, { role: 'bureau', femme: true }, yS);
  const serveurs = [debout(-1.6, -5.7, Math.PI / 2, { role: 'bureau' }), debout(1.7, 3.5, -Math.PI / 2, { role: 'bureau' })];
  // Ce dont la remise des prix a besoin (nuit.js) : l'écran, la présentatrice, ceux qui applaudissent debout, la scène.
  I.nuit = { ecran: ecran.material.userData.dessiner, presentatrice, debout: [...photo, hotesse, ...serveurs], scene: { z: avant, l: SCENE.l, h: SCENE.h } };
}

/** La porte du Dôme : au pied du cône, côté boulevard (lieux-marina.js) ; x, z en ville, `dehors` : le regard en sortant. */
export function declarerDome(porte, dehors) {
  declarerInterieur('dome-sofitel', { nom: 'le Dôme du Sofitel', porte, dehors, w: W, d: D, plafond: H - .4, lampe: 2.4, entree: [0, -D / 2 + 5, 0], entrer: 'Entrer au Dôme', construire: salle });
}
