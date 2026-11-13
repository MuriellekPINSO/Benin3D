import * as THREE from 'three';
import { toXZ } from './base.js';
import { B3, C3, CAI, matVeh, partsVelo } from './vehicules.js';
import { groupeLieu } from './lieux.js';
import { mergeColored } from './ville.js';
import { MAX_DECOR, reduireImage } from './textures.js';
import { ajouterZoneSansMur, poserObstacles } from './rue.js';
import { quandVelo } from './conduite.js';

// ---------- RideCorniche ----------
// Le loueur de vélos du jeu : RideCorniche, les vélos jaunes de la Corniche de Cotonou. Leur fondateur a demandé d'avoir
// sa marque à la place de « Caï Caï Vélo », le nom inventé d'avant (06/11) ; Murielle a dit oui le 11/11, avec leur vélo
// en 3D (conduite.js, VELO_TRIPO). Les identifiants (caicai, CAI…) restent : les lieux enregistrés s'en servent.
// La boutique est sur la Corniche Est d'Akpakpa, au bord du boulevard (« tu enlèves ça de l'Amazone pour la Corniche »,
// Murielle, 12/11 ; elle était au bord de l'esplanade de l'Amazone) : c'est de là que partent les balades et la course à
// vélo (course-velo.js). Une boutique en conteneur aux couleurs de la marque (jaune et noir), l'auvent de tôle, le panneau au
// logo, et des vélos rangés au râtelier. On loue en s'approchant du comptoir.
const LAT = 6.3555, LON = 2.4508; // la Corniche Est (donnees-lieux.js, 'corniche')
const [AX, AZ] = toXZ(LAT, LON);
// Le comptoir et l'auvent regardent le sud (+z dans le repère du jeu) : la boutique n'est pas pivotée,
// pour que le point d'arrivée devant elle tombe au bon endroit. On s'arrête à 4,2 m, hors de l'auvent.
// 130 m à l'est du point de la Corniche, côté ville : le premier terrain libre au bord du boulevard (ni bâtiment, ni
// arbre, ni poteau, ni eau sous la boutique, le râtelier et le vélo posé), à 8 m de la chaussée ; le comptoir regarde le
// boulevard, et la mer derrière lui. Cherché dans le jeu le 12/11 (session 2deab2d3, scratchpad velo/lieu2.mjs).
export const CAI_LIEU = { x: AX + 130, z: AZ - 13 };
export const DEVANT_CAI = [CAI_LIEU.x, CAI_LIEU.z + 4.2, Math.PI]; // x, z, et le regard vers la boutique
// Où le loueur pose le vélo : à trois pas du comptoir, hors de l'auvent, roue vers la ville.
export const POSE_VELO = { x: CAI_LIEU.x - 2.4, z: CAI_LIEU.z + 4, cap: 0 };
export const PRES_DE_CAI = (x, z) => Math.hypot(x - CAI_LIEU.x, z - CAI_LIEU.z) < 9;

// Les balades en groupe de la boutique, chacune par des lieux de rendez-vous du jeu
// (les identifiants de LIEUX dans salon.js). Le meneur annonce les étapes une à une dans la discussion :
// chaque annonce donne aux autres un bouton « Y aller », et tout le monde roule au même endroit.
// Depuis le 12/11, deux balades au départ de la Corniche (« tu peux aller de la Corniche à Akpakpa, ou de la Corniche à
// Ganhi, l'église cathédrale », Murielle) ; les quatre d'avant partaient de l'Amazone.
export const BALADES = [
  { id: 'akpakpa', nom: 'De la Corniche à Akpakpa', etapes: ['caicai', 'akpakpa'] },
  { id: 'ganhi', nom: 'De la Corniche à Ganhi', etapes: ['caicai', 'cathedrale', 'ganhi'] },
];
// Le rendez-vous d'Akpakpa : sur le parvis de l'église Sainte-Trinité d'Avotrou (reperes.js, 'eglise-akpakpa'), à 9 m de
// sa façade, face à elle. Ce n'est pas un lieu de la carte (PLACES) : salon.js le traite comme la boutique.
const [EX, EZ] = toXZ(6.376862, 2.475893);
export const RDV_AKPAKPA = [EX + 4, EZ + 9, -2.94];

// Les couleurs de la boutique. La vitre reste claire : les couleurs sont rangées en linéaire par mergeColored, et tout ce
// qui est déjà sombre y devient noir — un bleu nuit faisait un trou dans le conteneur.
const RC = { jaune: '#f2b705', noir: '#2a2a2c', vitre: '#9aa4ab' };
/** Le panneau de la boutique : le logo RideCorniche (le même que sur le garde-boue des vélos) et un vélo dessiné, sans
 *  mot à traduire. Noir le temps que le logo arrive. */
function panneau() {
  const mat = new THREE.MeshLambertMaterial({ color: '#1f1f1f' }), img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
    const c = cv.getContext('2d');
    c.fillStyle = '#1f1f1f'; c.fillRect(0, 0, 512, 160); // le fond du logo
    c.fillStyle = RC.jaune; c.fillRect(0, 150, 512, 10);
    c.drawImage(img, 14, 4, 182, 144);
    c.strokeStyle = RC.jaune; c.lineWidth = 7; c.lineCap = c.lineJoin = 'round'; // un vélo, de profil
    for (const x of [330, 450]) { c.beginPath(); c.arc(x, 100, 34, 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(330, 100); c.lineTo(385, 100); c.lineTo(440, 58); c.lineTo(370, 58); c.lineTo(330, 100); c.moveTo(385, 100); c.lineTo(366, 50);
    c.moveTo(352, 44); c.lineTo(378, 44); c.moveTo(450, 100); c.lineTo(436, 40); c.lineTo(456, 38); c.stroke();
    const t = new THREE.CanvasTexture(reduireImage(cv, MAX_DECOR)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    mat.map = t; mat.color.set('#ffffff'); mat.needsUpdate = true;
  };
  img.src = `${import.meta.env.BASE_URL}textures/ride-corniche.png`;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1), mat);
  m.position.set(0, 3.25, 1.32); return m;
}
/** La boutique seule (sans les vélos ni le panneau) : séparée pour pouvoir la regarder hors du jeu. */
export function partsCaiCai() {
  const P = [], add = (geo, hex) => P.push([geo, hex]);
  add(B3(6, 2.6, 2.5).translate(0, 1.3, 0), RC.jaune); // le conteneur
  add(B3(6.1, .36, 2.6).translate(0, 2.62, 0), RC.noir); // le bandeau noir du haut
  // La façade est à l'ombre (le soleil passe derrière) : elle ne reçoit que la lumière du ciel. Il faut une vitre
  // claire pour qu'elle se voie (RC).
  add(B3(4.2, 1.4, .08).translate(0, 1.55, 1.28), RC.vitre); // la vitre du guichet
  add(B3(4.36, .12, .16).translate(0, 2.3, 1.3), RC.noir); add(B3(4.36, .1, .16).translate(0, .86, 1.3), RC.noir); // l'encadrement
  for (const x of [-1.4, 0, 1.4]) add(B3(.08, 1.4, .1).translate(x, 1.55, 1.32), RC.noir); // les montants
  add(B3(4.3, .14, .5).translate(0, .78, 1.45), '#caa06a'); // le comptoir
  for (const x of [-2.9, 2.9]) add(C3(.07, .07, 2.4, 6).translate(x, 1.2, 2.7), CAI.acier); // poteaux de l'auvent
  add(B3(6.4, .08, 1.6).rotateX(-.12).translate(0, 2.52, 2.1), '#9aa1a7'); // la tôle
  for (const z of [-1, 0, 1]) add(B3(.06, .5, .06).translate(-3.6, .25, z), CAI.acier); // le râtelier
  add(C3(.05, .05, 2.4, 6).rotateZ(Math.PI / 2).translate(-3.6, .5, 0), CAI.acier);
  return P;
}
/** La boutique, l'auvent, le panneau et les vélos au râtelier, posés dans la ville. */
export function construireCaiCai() {
  const g = groupeLieu('caicai', CAI_LIEU.x, CAI_LIEU.z);
  const m = new THREE.Mesh(mergeColored(partsCaiCai()), matVeh); m.castShadow = true; m.receiveShadow = true; g.add(m);
  g.add(panneau());
  // Quatre vélos rangés le long du râtelier, de trois quarts, comme posés à la va-vite.
  for (let i = 0; i < 4; i++) {
    const v = new THREE.Mesh(mergeColored(partsVelo({ panier: i === 1 })), matVeh); v.castShadow = true;
    v.position.set(-3.6, 0, -1.4 + i * .95); v.rotation.y = Math.PI / 2 + (i % 2 ? .12 : -.1); g.add(v);
    // Puis le vrai vélo (RideCorniche, conduite.js), dès qu'il est chargé : son avant est vers −x, d'où le demi-tour.
    quandVelo(modele => { const c = modele.clone(); c.position.copy(v.position); c.rotation.y = v.rotation.y + Math.PI; g.add(c); g.remove(v); v.geometry.dispose(); });
  }
  // Solide : on passait au travers du conteneur, et la caméra entrait dedans — l'écran devenait bleu
  // pendant quatre secondes (vidéo d'un testeur, 25/10). Le conteneur et son comptoir, le râtelier et ses
  // vélos, les deux poteaux de l'auvent : [x, z, angle, longueur, épaisseur] (rue.js).
  const { x, z } = CAI_LIEU;
  poserObstacles('caicai', [[x, z + .2, 0, 6.1, 2.95], [x - 3.65, z - .25, 0, 1.3, 3.9], [x - 2.9, z + 2.7, 0, .25, .25], [x + 2.9, z + 2.7, 0, .25, .25]]);
  // Entre la boutique et le boulevard, rue.js posait un mur de clôture : on ne voyait plus que le haut du panneau
  // (« enlève le mur là, ça empêche de voir l'entreprise », Murielle, 13/11). Le trottoir va jusqu'au comptoir.
  ajouterZoneSansMur([x - 10, z - 3, x + 10, z + 14]);
  return g;
}
