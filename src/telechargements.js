// ---------- Téléchargements de fond : après l'arrivée dans la ville, trois à la fois ----------
// Les modèles détaillés (monuments Tripo, personnages animés, véhicules, avion) ne sont pas nécessaires pour
// voir la ville : le jeu a ses versions dessinées en code et les remplace dès qu'ils arrivent. Lancés tous
// ensemble pendant le chargement (une trentaine de mégaoctets), ils se partageaient la connexion avec ce que
// l'écran de chargement attend vraiment (données de la ville, zémidjans) et retardaient l'entrée de 20 à 30 s,
// davantage sur un téléphone en 4G.
import * as THREE from 'three';
import { reduireImage } from './textures.js';

const F = { demarre: false, attente: [], enCours: 0, max: 3 };

/** Lance `fn` (qui renvoie une promesse) quand la ville est affichée ; `prioritaire` : avant ceux qui attendent. */
export function plusTard(fn, prioritaire = false) {
  return new Promise((ok, ko) => { F.attente[prioritaire ? 'unshift' : 'push']({ fn, ok, ko }); suivant(); });
}
function suivant() {
  while (F.demarre && F.enCours < F.max && F.attente.length) {
    const t = F.attente.shift(); F.enCours++;
    Promise.resolve().then(t.fn).then(t.ok, t.ko).finally(() => { F.enCours--; suivant(); });
  }
}
/** Appelé quand l'écran de chargement disparaît (main.js). */
export function demarrerTelechargements() { F.demarre = true; suivant(); }
/** Texture d'une photo (public/…) téléchargée une fois la ville affichée ; un aplat `teinte` en attendant.
 *  L'image n'a pas la taille de l'aplat : dispose() avant le nouvel envoi, sinon three garde le stockage 1 × 1 déjà alloué. */
export function photoPlusTard(fichier, teinte = '#cbbfa8') {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const g = cv.getContext('2d'); g.fillStyle = teinte; g.fillRect(0, 0, 1, 1);
  const t = new THREE.Texture(cv); t.needsUpdate = true;
  plusTard(() => new THREE.ImageLoader().loadAsync(import.meta.env.BASE_URL + fichier))
    .then(img => { t.image = reduireImage(img); t.dispose(); t.needsUpdate = true; })
    .catch(e => console.warn(`photo ${fichier}`, e.message));
  return t;
}
