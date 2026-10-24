import * as THREE from 'three';
import { toXZ } from './base.js';
import { B3, C3, CAI, matVeh, partsVelo } from './vehicules.js';
import { groupeLieu } from './lieux.js';
import { mergeColored } from './ville.js';

// ---------- Caï Caï Vélo ----------
// Le loueur de vélos du jeu. Le nom est inventé (« caï caï », le cri du canard) : on s'inspire des
// loueurs de Cotonou sans porter l'enseigne de personne. Sa boutique est au bord de l'esplanade de
// l'Amazone : c'est là que les joueurs se retrouvent, et c'est de là que partent leurs balades. Une
// boutique en conteneur, l'auvent de tôle, le panneau au canard, et des vélos rangés au râtelier.
// On loue en s'approchant du comptoir.
const LAT = 6.34895, LON = 2.40755; // la place de l'Amazone ; la boutique est au bord de l'esplanade
const [AX, AZ] = toXZ(LAT, LON);
// Le comptoir et l'auvent regardent le sud (+z dans le repère du jeu) : la boutique n'est pas pivotée,
// pour que le point d'arrivée devant elle tombe au bon endroit. On s'arrête à 4,2 m, hors de l'auvent.
export const CAI_LIEU = { x: AX + 38, z: AZ - 62 };
export const DEVANT_CAI = [CAI_LIEU.x, CAI_LIEU.z + 4.2, Math.PI]; // x, z, et le regard vers la boutique
// Où le loueur pose le vélo : à trois pas du comptoir, hors de l'auvent, roue vers la ville.
export const POSE_VELO = { x: CAI_LIEU.x - 2.4, z: CAI_LIEU.z + 4, cap: 0 };
export const PRES_DE_CAI = (x, z) => Math.hypot(x - CAI_LIEU.x, z - CAI_LIEU.z) < 9;

// Les balades en groupe de la boutique, chacune par des lieux de rendez-vous du jeu
// (les identifiants de LIEUX dans salon.js). Le meneur annonce les étapes une à une dans la discussion :
// chaque annonce donne aux autres un bouton « Y aller », et tout le monde roule au même endroit.
export const BALADES = [
  { id: 'nuit', nom: 'Cotonou by Night', etapes: ['amazone', 'moov', 'haievive'] },
  { id: 'dimanche', nom: 'Vélo Dimanche', etapes: ['amazone', 'fidjrosse'] },
  { id: 'gourmandes', nom: 'Pédales gourmandes', etapes: ['cite', 'haievive'] },
  { id: 'picnic', nom: 'Vélo Picnic', etapes: ['fidjrosse', 'amazone'] },
];

/** Le panneau de la boutique : le canard et le nom, peints sur une tôle. */
function panneau() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
  const c = cv.getContext('2d');
  c.fillStyle = CAI.cadre; c.fillRect(0, 0, 512, 160);
  c.fillStyle = CAI.jante; c.fillRect(0, 132, 512, 28);
  c.fillStyle = CAI.canard; // le canard de l'enseigne, de profil
  c.beginPath(); c.ellipse(74, 86, 34, 26, -.15, 0, 7); c.fill();
  c.beginPath(); c.ellipse(70, 46, 19, 21, 0, 0, 7); c.fill();
  c.beginPath(); c.moveTo(86, 40); c.lineTo(126, 50); c.lineTo(86, 60); c.closePath(); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(66, 40, 8, 0, 7); c.fill();
  c.fillStyle = '#1c1c1e'; c.beginPath(); c.arc(68, 40, 4, 0, 7); c.fill();
  c.fillStyle = '#17130c'; c.font = '800 46px "Google Sans", system-ui, sans-serif';
  c.fillText('CAÏ CAÏ', 136, 72); c.fillText('VÉLO', 136, 120);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1), new THREE.MeshLambertMaterial({ map: t }));
  m.position.set(0, 3.25, 1.32); return m;
}
/** La boutique seule (sans les vélos ni le panneau) : séparée pour pouvoir la regarder hors du jeu. */
export function partsCaiCai() {
  const P = [], add = (geo, hex) => P.push([geo, hex]);
  add(B3(6, 2.6, 2.5).translate(0, 1.3, 0), CAI.cadre); // le conteneur
  add(B3(6.1, .36, 2.6).translate(0, 2.62, 0), CAI.jante); // le bandeau bleu du haut
  // La façade est à l'ombre (le soleil passe derrière) : elle ne reçoit que la lumière du ciel. Les
  // couleurs sont rangées en linéaire par mergeColored, donc tout ce qui est déjà sombre y devient noir —
  // un bleu nuit faisait un trou dans le conteneur. Il faut un bleu clair pour que la vitre se voie.
  add(B3(4.2, 1.4, .08).translate(0, 1.55, 1.28), CAI.jante); // la vitre du guichet, du bleu de la marque (un aplat noir faisait un trou)
  add(B3(4.36, .12, .16).translate(0, 2.3, 1.3), CAI.jante); add(B3(4.36, .1, .16).translate(0, .86, 1.3), CAI.jante); // l'encadrement
  for (const x of [-1.4, 0, 1.4]) add(B3(.08, 1.4, .1).translate(x, 1.55, 1.32), CAI.cadre); // les montants
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
  }
  return g;
}
