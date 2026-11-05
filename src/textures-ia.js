// ---------- Textures photographiques : enduit, sable, tôle, tuiles, dalle ----------
// Tirées d'images générées avec Higgsfield (scripts/textures-ia.mjs, 31/10). Ce sont des « détails » autour du gris
// moyen : un texel de 0,5 laisse la couleur du jeu telle quelle (la peinture de chaque maison, la tôle grise ou
// rouillée), la photo n'apporte que le grain, les coulures, la rouille, les cailloux. Gris uni en attendant la photo,
// téléchargée une fois la ville affichée (telechargements.js) ; le mode de secours garde les aplats.
import * as THREE from 'three';
import { LITE, SECOURS } from './base.js';
import { plusTard } from './telechargements.js';

const T = {};
/** `nom` : enduit, sol, tole, tuiles ou dalle (public/textures/ia/, en 512 px sur téléphone). */
export function texIA(nom) {
  if (T[nom]) return T[nom];
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const g = cv.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 1, 1);
  const t = T[nom] = new THREE.Texture(cv); // pas de colorSpace : des valeurs, pas des couleurs à convertir
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = LITE ? 2 : 8; t.needsUpdate = true;
  if (!SECOURS) plusTard(() => new THREE.ImageLoader().loadAsync(`${import.meta.env.BASE_URL}textures/ia/${nom}${LITE ? '-leger' : ''}.jpg`), true) // petites (40 à 220 Ko) : avant les modèles
    .then(img => { t.image = img; t.dispose(); t.needsUpdate = true; })
    .catch(e => console.warn(`texture ${nom}`, e.message));
  return t;
}
