// ---------- Textures photographiques : enduit, sable, tôle, tuiles, dalle ----------
// Tirées d'images générées avec Higgsfield (scripts/textures-ia.mjs, 31/10). Ce sont des « détails » autour du gris
// moyen : un texel de 0,5 laisse la couleur du jeu telle quelle (la peinture de chaque maison, la tôle grise ou
// rouillée), la photo n'apporte que le grain, les coulures, la rouille, les cailloux. Gris uni en attendant la photo,
// téléchargée une fois la ville affichée (telechargements.js) ; le mode de secours garde les aplats.
import * as THREE from 'three';
import { HQ_DEPART, LITE, SECOURS } from './base.js';
import { plusTard } from './telechargements.js';
import { actif, avecRepli } from './actifs.js';

const T = {};
// Poly Haven (polyhaven.com, CC0, 21/11) : le sable et l'enduit scannés remplacent les images Higgsfield (même rôle,
// même poids) ; ?ph=0 pour revenir aux anciennes (comparaison). scripts/textures-polyhaven.mjs.
export const PH = new URLSearchParams(location.search).get('ph') !== '0';
const PH_REMPLACE = new Set(['sol', 'enduit']);
/** `nom` : enduit, sol, tole, tuiles ou dalle (public/textures/ia/, en 512 px sur téléphone). */
export function texIA(nom) {
  if (T[nom]) return T[nom];
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const g = cv.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 1, 1);
  const t = T[nom] = new THREE.Texture(cv); // pas de colorSpace : des valeurs, pas des couleurs à convertir
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = LITE ? 2 : 8; t.needsUpdate = true;
  const dossier = PH && PH_REMPLACE.has(nom) ? 'ph' : 'ia';
  if (!SECOURS) plusTard(() => avecRepli(actif(`textures/${dossier}/${nom}${LITE ? '-leger' : ''}.jpg`), u => new THREE.ImageLoader().loadAsync(u)), true) // petites (40 à 220 Ko) : avant les modèles
    .then(img => { t.image = img; t.dispose(); t.needsUpdate = true; })
    .catch(e => console.warn(`texture ${nom}`, e.message));
  return t;
}

/** Textures de la haute qualité (Poly Haven, public/textures/ph/) : `bitume` (détail du goudron), `bitume-n`, `sol-n`,
 *  `trottoir-n` (reliefs, normal maps OpenGL), `trottoir` (couleur des pavés). Neutres tant qu'elles ne sont pas
 *  arrivées, et toujours neutres hors haute qualité (téléphones, ?hq=0, ?ph=0) : rien n'est téléchargé. */
export const HQ_PH = PH && HQ_DEPART && !SECOURS;
export function texHQ(nom) {
  const cle = 'hq:' + nom; if (T[cle]) return T[cle];
  const relief = nom.endsWith('-n'), couleur = nom === 'trottoir';
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const g = cv.getContext('2d'); g.fillStyle = relief ? '#8080ff' : couleur ? '#9a9a94' : '#808080'; g.fillRect(0, 0, 1, 1);
  const t = T[cle] = new THREE.Texture(cv);
  if (couleur) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; t.needsUpdate = true;
  if (HQ_PH) plusTard(() => avecRepli(actif(`textures/ph/${nom}.jpg`), u => new THREE.ImageLoader().loadAsync(u)), true)
    .then(img => { t.image = img; t.dispose(); t.needsUpdate = true; })
    .catch(e => console.warn(`texture ${nom}`, e.message));
  return t;
}
