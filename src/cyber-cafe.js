import * as THREE from 'three';
import { personne } from './discussions.js';
import { etiquette } from './interieurs.js';
import { K, panneauTexte } from './lieux.js';
import { poserAssis } from './personnages.js';
import { reduireImage } from './textures.js';

// ---------- Le cyber café de la salle de jeux (06/11) ----------
// « Pourquoi je ne rentre pas dans la salle avant qu'on me montre le menu des jeux ? Améliore aussi l'intérieur pour
// qu'il ressemble à un cyber café » (Murielle, 06/11). On entre donc dans une vraie pièce (interieurs.js), et c'est
// assis à un ordinateur qu'on ouvre la liste des jeux (salle-jeux.js). La pièce, comme les cybers de Cotonou : des
// rangées d'ordinateurs séparés par des cloisons basses, des chaises de joueur, la caisse à l'entrée avec ses tarifs en
// francs CFA, le frigo des boissons, des ventilateurs au plafond et un climatiseur ; et pour la salle de jeux, des
// néons roses et bleus, le coin console avec son canapé, l'écran géant et les affiches des jeux des créateurs.
// Aucune marque réelle : les écrans montrent des images dessinées ici, ou les affiches des jeux validés.
export const CYBER = { W: 18, D: 14, H: 3.6 };
const RANGEES = [-0.6, 2.5, 5.6]; // z du milieu des bureaux (les joueurs regardent vers le fond, +z)
const ILOT = 3.9, COLONNES = [-5.4, -3.9, -2.4, 2.4, 3.9, 5.4]; // deux îlots de trois postes (centrés à ±3,9 m), l'allée au milieu
const OCCUPES = new Set([1, 5, 8, 10, 15]); // les postes où des jeunes jouent déjà
const ASSISE = .485; // le dessus de l'assise des chaises (comme au food court : le salon y pose le joueur assis)

function toile(w, h, dessin) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; dessin(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(reduireImage(cv)); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const lumineux = couleur => new THREE.MeshBasicMaterial({ color: couleur, toneMapped: false }); // néons, écrans : ils brillent même sans lampe
const plan = (w, h, mat, x, y, z, rot = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = rot; m.userData.garder = true; K.racine.add(m); return m; };
const sansOmbre = m => { m.castShadow = false; return m; };

// ---------- Ce que montrent les écrans ----------
const ECRANS = [
  // Le bureau de Kutɔnu Vibes : dégradé violet, le nom de la salle.
  (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2a1d52'); g.addColorStop(1, '#b0247a'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 9; i++) c.fillRect(i * w / 8, 0, 2, h);
    c.fillStyle = '#ffd23b'; c.font = '800 34px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('SALLE DE JEUX', w / 2, h / 2 - 6);
    c.fillStyle = '#fff'; c.font = '600 18px system-ui, sans-serif'; c.fillText('Kutɔnu Vibes · Haie Vive', w / 2, h / 2 + 24);
  },
  // Une bibliothèque de jeux : des vignettes de couleur en grille.
  (c, w, h) => {
    c.fillStyle = '#121826'; c.fillRect(0, 0, w, h); c.fillStyle = '#1f2a3d'; c.fillRect(0, 0, 70, h);
    c.fillStyle = '#ffd23b'; c.font = '700 16px system-ui, sans-serif'; c.fillText('JEUX', 86, 28);
    const coul = ['#e94f37', '#1a7d52', '#2f6fb0', '#e9b62c', '#8a3ffc', '#ff3fb4', '#2cc6b8', '#f28c28'];
    for (let i = 0; i < 8; i++) { c.fillStyle = coul[i]; c.fillRect(86 + (i % 4) * 58, 44 + Math.floor(i / 4) * 70, 50, 62); }
  },
  // Une course de nuit : la route qui fuit vers le soleil couchant.
  (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h * .55); g.addColorStop(0, '#2b1055'); g.addColorStop(1, '#ff7b39'); c.fillStyle = g; c.fillRect(0, 0, w, h * .55);
    c.fillStyle = '#ffcf5a'; c.beginPath(); c.arc(w / 2, h * .55, 46, Math.PI, 0); c.fill();
    c.fillStyle = '#1a1424'; c.fillRect(0, h * .55, w, h * .45);
    c.fillStyle = '#3a3346'; c.beginPath(); c.moveTo(w / 2 - 8, h * .55); c.lineTo(w / 2 + 8, h * .55); c.lineTo(w * .92, h); c.lineTo(w * .08, h); c.fill();
    c.fillStyle = '#ffd23b'; for (let i = 0; i < 5; i++) { const y = h * .58 + i * i * 6, l = 3 + i * 4; c.fillRect(w / 2 - l / 4, y, l / 2, 3 + i * 2); }
    c.fillStyle = '#e94f37'; c.fillRect(w / 2 - 22, h - 34, 44, 20);
  },
  // Un match de foot vu d'en haut.
  (c, w, h) => {
    c.fillStyle = '#2f8a3a'; c.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#2b8035' : '#349640'; c.fillRect(i * w / 8, 0, w / 8, h); }
    c.strokeStyle = '#e8f5e9'; c.lineWidth = 2; c.strokeRect(10, 10, w - 20, h - 20); c.beginPath(); c.moveTo(w / 2, 10); c.lineTo(w / 2, h - 10); c.stroke(); c.beginPath(); c.arc(w / 2, h / 2, 26, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? '#e94f37' : '#ffd23b'; c.beginPath(); c.arc(40 + (i * 53) % (w - 80), 30 + (i * 37) % (h - 60), 5, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#111'; c.fillRect(w / 2 - 34, 14, 68, 18); c.fillStyle = '#fff'; c.font = '700 13px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('2 - 1', w / 2, 28);
  },
];

// Carrelage gris foncé, joints noirs : le sol facile à laver des cybers.
let motifsPrets = false;
function motifs() {
  if (motifsPrets) return; motifsPrets = true;
  K.motif('carrelageCyber', (c, t) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#3b3f46' : '#34383f'; c.fillRect(i * t / 2, j * t / 2, t / 2, t / 2); }
    for (let k = 0; k < 500; k++) { c.fillStyle = k % 2 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.08)'; c.fillRect(Math.random() * t, Math.random() * t, 2, 2); }
    c.fillStyle = '#17191d'; c.fillRect(0, 0, t, 3); c.fillRect(0, 0, 3, t); c.fillRect(0, t / 2 - 1, t, 3); c.fillRect(t / 2 - 1, 0, 3, t);
  });
}

// L'enseigne au néon rose : le texte, son halo, sur fond transparent.
function neon(texte, w, h, x, y, z, rot, couleur = '#ff4fc3') {
  const t = toile(1024, Math.round(1024 * h / w), (c, cw, ch) => {
    c.font = `800 ${Math.round(ch * .5)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = couleur; c.shadowBlur = 40; c.fillStyle = couleur; c.fillText(texte, cw / 2, ch / 2); c.shadowBlur = 12; c.fillStyle = '#ffe6f6'; c.fillText(texte, cw / 2, ch / 2);
  });
  return plan(w, h, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }), x, y, z, rot);
}

/**
 * Construit la pièce (appelé par interieurs.js à la première visite, dans K.into). Renvoie ce dont la salle a besoin
 * ensuite : les postes (où s'asseoir pour jouer), et de quoi poser les affiches des jeux quand elles arrivent.
 */
export function construireCyber(I) {
  motifs();
  const { W, D, H } = CYBER, bloc = (w, d, x, z, h = 1) => I.obstacles.push([x, z, w / 2, d / 2, h]);
  // Sol, plafond, murs : violet sombre en haut, soubassement presque noir. Ni murs ni plafond ne font d'ombre (comme au
  // food court) : le jour qui tombe dessus éclaire la pièce, sinon tout serait noir hors de la lampe.
  sansOmbre(K.boite(W, .2, D, K.tex('carrelageCyber', W / 1.2, D / 1.2), 0, -.1, 0));
  sansOmbre(K.boite(W, .2, D, new THREE.MeshBasicMaterial({ color: '#16111f' }), 0, H + .1, 0)); // mat : la lampe, juste dessous, y faisait une tache blanche
  const mur = K.mat('#4a3b78', { rugosite: .9 }), bas = K.mat('#211a33', { rugosite: .8 });
  for (const [w, d, x, z] of [[W, .3, 0, -D / 2], [W, .3, 0, D / 2], [.3, D, -W / 2, 0], [.3, D, W / 2, 0]]) {
    sansOmbre(K.boite(w, H, d, mur, x, H / 2, z));
    sansOmbre(K.boite(w + (d > w ? .04 : 0), 1.1, d + (w > d ? .04 : 0), bas, x, .55, z));
  }
  // Bandeau de LED bleu tout autour, à 2,9 m, et néons roses et bleus au plafond, au-dessus des allées.
  const cyan = lumineux('#3ff0ff'), rose = lumineux('#ff3fb4'), violet = lumineux('#9d6bff');
  for (const [w, d, x, z] of [[W - .4, .03, 0, -D / 2 + .16], [W - .4, .03, 0, D / 2 - .16], [.03, D - .4, -W / 2 + .16, 0], [.03, D - .4, W / 2 - .16, 0]]) sansOmbre(K.boite(w, .05, d, cyan, x, 2.9, z));
  for (const [k, z] of [-2.2, 1.0, 4.1].entries()) for (const x of [-ILOT, ILOT]) sansOmbre(K.boite(4.6, .05, .06, k % 2 ? cyan : rose, x, H - .04, z));
  sansOmbre(K.boite(.06, .05, D - 3, violet, 0, H - .04, 1)); // au-dessus de l'allée du milieu
  const tube = lumineux('#f4f1ff'); // et des tubes blancs, comme dans tous les cybers
  for (const z of [-4.6, 1, 6.1]) for (const x of [-6, 0, 6]) sansOmbre(K.boite(1.2, .04, .07, tube, x, H - .03, z));

  // Façade, vue de dedans : la porte vitrée par où l'on est entré, deux vitrines sur la rue (le jour).
  // Vitres teintées (film bleuté, comme les cybers qui protègent leurs écrans du soleil), montants noirs.
  const verre = K.mat('#5d7f8e', { transparent: .6, rugosite: .1 }), jour = K.mat('#6f93a3', { emissif: '#2e4c5a', rugosite: .2 });
  sansOmbre(K.boite(1.8, 2.3, .06, verre, 0, 1.15, -D / 2 + .19));
  for (const x of [-4.4, 4.4]) {
    sansOmbre(K.boite(4.6, 1.5, .05, jour, x, 1.75, -D / 2 + .17));
    for (const dx of [-2.3, -1.15, 0, 1.15, 2.3]) sansOmbre(K.boite(.06, 1.56, .08, '#15161a', x + dx, 1.75, -D / 2 + .2));
    for (const y of [1, 2.5]) sansOmbre(K.boite(4.66, .06, .08, '#15161a', x, y, -D / 2 + .2));
  }
  panneauTexte(['SORTIE'], 1.1, .32, 0, 2.6, -D / 2 + .17, 0, { fond: '#1f7a3e', encre: '#ffffff', px: 512, py: 149 });

  // ---------- Les postes ----------
  const ecrans = ECRANS.map(f => { const m = lumineux('#ffffff'); m.map = toile(320, 192, f); return m; });
  const noir = K.mat('#15161a', { rugosite: .5 }), plateau = K.mat('#2b2530', { rugosite: .45 }), cloison = K.mat('#4b2d6e', { rugosite: .7 });
  const coque = K.mat('#101114', { rugosite: .4, metal: .3 }), assise = K.mat('#17171b', { rugosite: .6 });
  const touches = [K.mat('#d6263a', { rugosite: .6 }), K.mat('#1f6fd6', { rugosite: .6 }), K.mat('#1a9a5a', { rugosite: .6 })];
  const rgb = [lumineux('#3ff0ff'), lumineux('#ff3fb4'), lumineux('#7dff6a')];
  const casqueGeo = K.geo('casqueCyber', () => new THREE.TorusGeometry(.085, .014, 6, 14, Math.PI));
  const postes = []; let n = 0;
  for (const zr of RANGEES) {
    for (const cote of [-1, 1]) { // les deux îlots de la rangée : un long bureau, ses cloisons, son panneau de fond
      const cx = cote * ILOT;
      K.boite(4.6, .04, .75, plateau, cx, .74, zr);
      sansOmbre(K.boite(4.6, .42, .02, noir, cx, .5, zr + .36));
      for (const dx of [-2.28, 2.28]) K.boite(.04, .72, .72, noir, cx + dx, .36, zr);
      for (const dx of [-.75, .75]) sansOmbre(K.boite(.03, .5, .72, cloison, cx + dx, 1.0, zr)); // les cloisons entre les postes
      bloc(4.6, .8, cx, zr);
    }
    for (const x of COLONNES) {
      const k = n++, z = zr - .78; // la chaise, devant le bureau
      // L'écran, son pied, le clavier, la souris, le casque.
      K.boite(.64, .4, .035, noir, x, 1.04, zr + .2);
      const ecran = plan(.6, .36, ecrans[k % ecrans.length], x, 1.04, zr + .18, Math.PI);
      K.boite(.05, .16, .05, noir, x, .84, zr + .22); K.boite(.22, .015, .16, noir, x, .765, zr + .22);
      K.boite(.42, .02, .14, noir, x, .77, zr - .16); K.boite(.06, .025, .1, noir, x + .3, .77, zr - .16);
      const casque = K.maillage(casqueGeo, touches[k % 3], x - .42, .86, zr + .1); casque.rotation.y = Math.PI / 2;
      // L'unité centrale sous le bureau, sa bande de lumière tournée vers le joueur.
      K.boite(.2, .44, .42, coque, x + .48, .22, zr + .05);
      sansOmbre(K.boite(.015, .36, .01, rgb[k % 3], x + .48, .24, zr - .165));
      // La chaise de joueur : assise, haut dossier à liseré de couleur, accoudoirs, pied et étoile.
      K.boite(.5, .08, .48, assise, x, ASSISE - .04, z);
      const dos = K.boite(.48, .78, .07, assise, x, .93, z - .25); dos.rotation.x = -.1;
      const lis = K.boite(.14, .7, .075, touches[k % 3], x, .95, z - .252); lis.rotation.x = -.1;
      for (const s of [-1, 1]) K.boite(.05, .04, .3, noir, x + s * .27, .66, z - .02);
      K.cyl(.03, .03, .38, 8, coque, x, .23, z); K.cyl(.26, .26, .04, 10, coque, x, .05, z);
      const P = { x, z, cap: 0, ecran, k, rangee: zr };
      I.sieges.push(P); postes.push(P);
      if (OCCUPES.has(k)) { // un jeune joue déjà, les yeux sur l'écran
        const p = personne(820 + k, { assise: true, role: k % 2 ? 'jeune' : null }); poserAssis(p, x, ASSISE, z, 0, .21); K.racine.add(p); P.occupe = true;
      }
    }
  }
  // « Joue ici » : le premier poste libre au bord de l'allée, vu dès l'entrée.
  const libre = postes.find(p => !p.occupe && Math.abs(p.x) < 4 && p.rangee === RANGEES[0]) || postes.find(p => !p.occupe);
  const repere = etiquette('Joue ici'); repere.position.set(libre.x, 1.55, libre.rangee + .2); K.racine.add(repere);

  // ---------- La caisse, à gauche en entrant ----------
  const violetFonce = K.mat('#5a2d86', { rugosite: .6 });
  K.boite(.7, 1.05, 2.6, violetFonce, -6.4, .52, -4.9); K.boite(.8, .05, 2.7, plateau, -6.4, 1.07, -4.9);
  sansOmbre(K.boite(.02, .05, 2.5, rose, -6.04, .9, -4.9));
  bloc(.8, 2.7, -6.4, -4.9);
  const caisse = K.boite(.45, .3, .04, noir, -6.5, 1.3, -5.5); caisse.rotation.y = -Math.PI / 2;
  plan(.4, .25, ecrans[0], -6.48, 1.3, -5.5, -Math.PI / 2);
  K.boite(.45, .22, .38, '#d9d9dc', -6.45, 1.2, -4.3); // l'imprimante
  K.boite(.3, .08, .22, noir, -6.45, 1.12, -4.9); // le tiroir-caisse
  const gerant = personne(840, { role: 'jeune' }); gerant.position.set(-7.5, 0, -4.9); gerant.rotation.y = Math.PI / 2; K.racine.add(gerant);
  panneauTexte(['ACCUEIL · CAISSE'], 2.2, .4, -6.4, 2.45, -4.9, Math.PI / 2, { fond: '#1b1626', encre: '#ffd23b', px: 1024, py: 186, police: '800 110px system-ui, sans-serif' });
  panneauTexte(['TARIFS', 'Connexion · 1 h : 300 F', 'Impression : 50 F la page', 'Jeux des créateurs : gratuit'], 2, 1.25, -W / 2 + .17, 1.85, -4.9, Math.PI / 2, { fond: '#f4efe4', encre: '#1d1a16', px: 1024, py: 640, police: '700 72px system-ui, sans-serif' });
  // Le frigo des boissons, porte vitrée éclairée, et le code du Wi-Fi au-dessus.
  K.boite(.75, 1.8, .7, '#e9e9ec', -W / 2 + .5, .9, -2.4);
  sansOmbre(K.boite(.02, 1.4, .56, K.mat('#bfe6ff', { emissif: '#5fa9d6' }), -W / 2 + .88, 1, -2.4));
  for (let r = 0; r < 4; r++) for (let b = 0; b < 4; b++) K.cyl(.035, .035, .2, 8, ['#d62f2f', '#f28c28', '#2f9e4f', '#f2d33b'][(r + b) % 4], -W / 2 + .7, .5 + r * .32, -2.62 + b * .15);
  bloc(.8, .75, -W / 2 + .5, -2.4);
  panneauTexte(['Boissons fraîches'], 1, .26, -W / 2 + .18, 2, -2.4, Math.PI / 2, { fond: '#d62f2f', encre: '#ffffff', px: 512, py: 133, police: '800 64px system-ui, sans-serif' });
  panneauTexte(['Wi-Fi', 'Le code est à la caisse'], 1.1, .5, -W / 2 + .17, 2.4, -.8, Math.PI / 2, { fond: '#1b1626', encre: '#ffffff', px: 512, py: 233, police: '700 54px system-ui, sans-serif' });

  // ---------- Le coin console, à droite en entrant : la télé, la console, le canapé ----------
  K.boite(.08, 1.12, 1.95, noir, W / 2 - .2, 1.55, -4.7);
  plan(1.85, 1.02, ecrans[3], W / 2 - .25, 1.55, -4.7, -Math.PI / 2);
  K.boite(.45, .5, 1.7, K.mat('#2b2530'), W / 2 - .42, .25, -4.7); K.boite(.3, .06, .22, '#f2f2f2', W / 2 - .45, .53, -4.5);
  bloc(.5, 1.75, W / 2 - .42, -4.7);
  const canape = K.mat('#7a2f5c', { rugosite: .9 }), cx0 = W / 2 - 3.1;
  K.boite(.9, .42, 2.1, canape, cx0, .21, -4.7); K.boite(.22, .85, 2.1, canape, cx0 - .45, .45, -4.7);
  for (const s of [-1, 1]) K.boite(.9, .6, .2, canape, cx0, .3, -4.7 + s * 1.05);
  bloc(1, 2.3, cx0, -4.7);
  for (const [i, dz] of [[0, -.45], [1, .45]]) { const p = personne(850 + i, { assise: true, role: 'jeune' }); poserAssis(p, cx0 + .1, .44, -4.7 + dz, Math.PI / 2, .3); K.racine.add(p); }
  panneauTexte(['COIN CONSOLE', 'Tournoi le samedi'], 2.2, .62, W / 2 - .17, 2.55, -4.7, -Math.PI / 2, { fond: '#1b1626', encre: '#3ff0ff', px: 1024, py: 289, police: '800 96px system-ui, sans-serif' });

  // ---------- Les murs : l'enseigne au néon, l'écran géant, les affiches des jeux, le règlement ----------
  neon('SALLE DE JEUX', 4.2, .8, -W / 2 + .2, 2.45, 2.6, Math.PI / 2);
  K.boite(3.5, 2, .1, noir, 0, 2.4, D / 2 - .2);
  const geant = plan(3.3, 1.86, lumineux('#ffffff'), 0, 2.4, D / 2 - .26, Math.PI);
  geant.material.map = toile(1024, 576, (c, w, h) => ecranGeant(c, w, h, null));
  const affiches = [0, 2.6, 5.2].map((z, i) => { K.boite(.05, 1.42, 1.08, noir, W / 2 - .17, 1.8, z); return plan(1, 1.33, new THREE.MeshBasicMaterial({ map: afficheVide(i), toneMapped: false }), W / 2 - .2, 1.8, z, -Math.PI / 2); });
  panneauTexte(['Ton jeu ici ?', 'kotonuvibes.com/createurs.html'], 2.2, .5, W / 2 - .2, 2.78, 2.6, -Math.PI / 2, { fond: '#ffd23b', encre: '#1b1626', px: 1024, py: 233, police: '800 70px system-ui, sans-serif' });
  panneauTexte(['RÈGLES DE LA SALLE', 'On respecte le matériel', 'Rien à manger sur les claviers', 'Bon jeu !'], 1.6, 1.1, 5.6, 2.1, D / 2 - .17, Math.PI, { fond: '#f4efe4', encre: '#1d1a16', px: 1024, py: 704, police: '700 74px system-ui, sans-serif' });
  // Le climatiseur au fond, les ventilateurs au plafond (ils tournent).
  K.boite(1.1, .32, .24, '#f2f2f2', -5.6, 3.05, D / 2 - .3); sansOmbre(K.boite(.9, .03, .02, K.mat('#9aa0a6'), -5.6, 2.92, D / 2 - .42));
  for (const x of [-ILOT, ILOT]) {
    K.cyl(.015, .015, .35, 6, noir, x, H - .18, 2.6); const moyeu = K.cyl(.1, .1, .1, 10, '#e8e4dc', x, H - .4, 2.6);
    const pales = new THREE.Group(); pales.position.set(x, H - .42, 2.6); K.racine.add(pales);
    for (let p = 0; p < 3; p++) { const b = K.boite(.75, .012, .13, '#e8e4dc', 0, 0, 0, pales); b.castShadow = false; b.position.set(Math.cos(p * 2.094) * .42, 0, Math.sin(p * 2.094) * .42); b.rotation.y = -p * 2.094; }
    moyeu.onBeforeRender = () => { pales.rotation.y = performance.now() * .007; };
  }
  // Plantes aux coins du fond.
  for (const x of [-W / 2 + .7, W / 2 - .7]) { K.cyl(.3, .24, .55, 12, '#2b2530', x, .28, D / 2 - .7); K.sphere(.55, K.mat('#3f7a3c', { rugosite: .9 }), x, 1.1, D / 2 - .7).scale.set(1, 1.35, 1); bloc(.7, .7, x, D / 2 - .7); }

  // Les affiches arrivent après la pièce : sur les murs, l'écran géant, et les écrans de quelques joueurs.
  const poser = jeux => {
    jeux.slice(0, 3).forEach((j, i) => { const m = affiches[i].material; m.map?.dispose(); m.map = j.tex; m.needsUpdate = true; });
    if (jeux[0]) { const m = geant.material; m.map?.dispose(); m.map = toile(1024, 576, (c, w, h) => ecranGeant(c, w, h, jeux[0])); m.needsUpdate = true; }
    postes.filter(p => p.occupe).forEach((p, i) => { const j = jeux[i % jeux.length]; if (j) { p.ecran.material = new THREE.MeshBasicMaterial({ map: j.tex, toneMapped: false }); } });
  };
  return { postes, libre, repere, poser };
}

// L'écran géant du fond : « À l'affiche », le dernier jeu validé (son image et son nom), ou l'invitation aux créateurs.
function ecranGeant(c, w, h, jeu) {
  const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#16102a'); g.addColorStop(1, '#3a1450'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = '#ff3fb4'; c.fillRect(0, 0, w, 8); c.fillRect(0, h - 8, w, 8);
  c.textBaseline = 'middle';
  if (jeu?.img) {
    const r = Math.min((h - 80) / jeu.img.height, (w * .5) / jeu.img.width), iw = jeu.img.width * r, ih = jeu.img.height * r;
    c.drawImage(jeu.img, 40, (h - ih) / 2, iw, ih);
    const x = 40 + iw + 40, l = w - x - 30;
    c.fillStyle = '#3ff0ff'; c.font = '800 34px system-ui, sans-serif'; c.fillText('À L’AFFICHE', x, 120, l);
    c.fillStyle = '#ffffff'; c.font = '800 56px system-ui, sans-serif'; ligneCoupee(c, jeu.nom, x, 200, l, 64, 3);
    c.fillStyle = '#ffd23b'; c.font = '600 30px system-ui, sans-serif'; c.fillText('Assieds-toi à un ordinateur pour y jouer', x, h - 90, l);
  } else {
    c.textAlign = 'center';
    c.fillStyle = '#ffd23b'; c.font = '800 84px system-ui, sans-serif'; c.fillText('JEUX DES CRÉATEURS', w / 2, h / 2 - 50, w - 60);
    c.fillStyle = '#ffffff'; c.font = '600 38px system-ui, sans-serif'; c.fillText('Assieds-toi à un ordinateur pour voir les jeux', w / 2, h / 2 + 40, w - 60);
  }
}
function ligneCoupee(c, texte, x, y, l, pas, max) {
  const mots = String(texte || '').split(/\s+/); let ligne = '', n = 0;
  for (const m of mots) { const essai = ligne ? `${ligne} ${m}` : m; if (c.measureText(essai).width > l && ligne) { c.fillText(ligne, x, y + n * pas, l); ligne = m; if (++n >= max) return; } else ligne = essai; }
  if (ligne) c.fillText(ligne, x, y + n * pas, l);
}
function afficheVide(i) {
  return toile(192, 256, (c, w, h) => {
    c.fillStyle = ['#1a7d52', '#d6452f', '#2f6fb0'][i % 3]; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.9)'; c.textAlign = 'center'; c.font = '700 26px system-ui, sans-serif'; c.fillText('BIENTÔT', w / 2, 120); c.font = '500 18px system-ui, sans-serif'; c.fillText('ton jeu ici', w / 2, 150);
  });
}
