import * as THREE from 'three';
import { toXZ } from './base.js';
import { B3, C3, KOIN, matVeh, partsVelo } from './vehicules.js';
import { groupeLieu } from './lieux.js';
import { mergeColored } from './ville.js';

// ---------- Koin Koin Vélo (koinkoinvelo.com) ----------
// Le loueur de vélos de Cotonou, posé au bord de l'esplanade de l'Amazone : c'est là que les joueurs se
// retrouvent, et c'est de là que partent leurs balades. Une boutique en conteneur, l'auvent de tôle, le
// panneau au canard orange, et des vélos rangés au râtelier. On loue en s'approchant du comptoir.
const LAT = 6.34895, LON = 2.40755; // la place de l'Amazone ; la boutique est au bord de l'esplanade
const [AX, AZ] = toXZ(LAT, LON);
// Le comptoir et l'auvent regardent le sud (+z dans le repère du jeu) : la boutique n'est pas pivotée,
// pour que le point d'arrivée devant elle tombe au bon endroit. On s'arrête à 4,2 m, hors de l'auvent.
export const KOIN_LIEU = { x: AX + 38, z: AZ - 62 };
export const DEVANT_KOIN = [KOIN_LIEU.x, KOIN_LIEU.z + 4.2, Math.PI]; // x, z, et le regard vers la boutique
export const PRES_DE_KOIN = (x, z) => Math.hypot(x - KOIN_LIEU.x, z - KOIN_LIEU.z) < 9;

// Leurs balades en groupe, celles de leur programme, chacune par des lieux de rendez-vous du jeu
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
  c.fillStyle = KOIN.cadre; c.fillRect(0, 0, 512, 160);
  c.fillStyle = KOIN.jante; c.fillRect(0, 132, 512, 28);
  c.fillStyle = KOIN.canard; // le canard, de profil, comme sur leur logo
  c.beginPath(); c.ellipse(74, 86, 34, 26, -.15, 0, 7); c.fill();
  c.beginPath(); c.ellipse(70, 46, 19, 21, 0, 0, 7); c.fill();
  c.beginPath(); c.moveTo(86, 40); c.lineTo(126, 50); c.lineTo(86, 60); c.closePath(); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(66, 40, 8, 0, 7); c.fill();
  c.fillStyle = '#1c1c1e'; c.beginPath(); c.arc(68, 40, 4, 0, 7); c.fill();
  c.fillStyle = '#17130c'; c.font = '800 46px "Google Sans", system-ui, sans-serif';
  c.fillText('KOIN KOIN', 136, 72); c.fillText('VÉLO', 136, 120);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1), new THREE.MeshLambertMaterial({ map: t }));
  m.position.set(0, 3.25, 1.32); return m;
}
/** La boutique seule (sans les vélos ni le panneau) : séparée pour pouvoir la regarder hors du jeu. */
export function partsKoinKoin() {
  const P = [], add = (geo, hex) => P.push([geo, hex]);
  add(B3(6, 2.6, 2.5).translate(0, 1.3, 0), KOIN.cadre); // le conteneur
  add(B3(6.1, .36, 2.6).translate(0, 2.62, 0), KOIN.jante); // le bandeau bleu du haut
  add(B3(4.2, 1.4, .08).translate(0, 1.55, 1.28), '#0b5f85'); // la vitre du guichet (un aplat noir faisait un trou)
  add(B3(4.36, .12, .16).translate(0, 2.3, 1.3), KOIN.jante); add(B3(4.36, .1, .16).translate(0, .86, 1.3), KOIN.jante); // l'encadrement
  for (const x of [-1.4, 0, 1.4]) add(B3(.08, 1.4, .1).translate(x, 1.55, 1.32), KOIN.cadre); // les montants
  add(B3(4.3, .14, .5).translate(0, .78, 1.45), '#caa06a'); // le comptoir
  for (const x of [-2.9, 2.9]) add(C3(.07, .07, 2.4, 6).translate(x, 1.2, 2.7), KOIN.acier); // poteaux de l'auvent
  add(B3(6.4, .08, 1.6).rotateX(-.12).translate(0, 2.52, 2.1), '#9aa1a7'); // la tôle
  for (const z of [-1, 0, 1]) add(B3(.06, .5, .06).translate(-3.6, .25, z), KOIN.acier); // le râtelier
  add(C3(.05, .05, 2.4, 6).rotateZ(Math.PI / 2).translate(-3.6, .5, 0), KOIN.acier);
  return P;
}
/** La boutique, l'auvent, le panneau et les vélos au râtelier, posés dans la ville. */
export function construireKoinKoin() {
  const g = groupeLieu('koinkoin', KOIN_LIEU.x, KOIN_LIEU.z);
  const m = new THREE.Mesh(mergeColored(partsKoinKoin()), matVeh); m.castShadow = true; m.receiveShadow = true; g.add(m);
  g.add(panneau());
  // Quatre vélos rangés le long du râtelier, de trois quarts, comme posés à la va-vite.
  for (let i = 0; i < 4; i++) {
    const v = new THREE.Mesh(mergeColored(partsVelo({ panier: i === 1 })), matVeh); v.castShadow = true;
    v.position.set(-3.6, 0, -1.4 + i * .95); v.rotation.y = Math.PI / 2 + (i % 2 ? .12 : -.1); g.add(v);
  }
  return g;
}
