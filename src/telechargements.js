// ---------- Téléchargements de fond : après l'arrivée dans la ville, trois à la fois ----------
// Les modèles détaillés (monuments Tripo, personnages animés, véhicules, avion) ne sont pas nécessaires pour
// voir la ville : le jeu a ses versions dessinées en code et les remplace dès qu'ils arrivent. Lancés tous
// ensemble pendant le chargement (une trentaine de mégaoctets), ils se partageaient la connexion avec ce que
// l'écran de chargement attend vraiment (données de la ville, zémidjans) et retardaient l'entrée de 20 à 30 s,
// davantage sur un téléphone en 4G.
// Ensuite, sur une connexion faible, tout partait encore d'un coup, dans l'ordre où le code les demandait : la cathédrale
// ou la Porte du Non-Retour avant le monument devant lequel on se tient (Murielle, 04/11). L'ordre est maintenant :
// 1. les urgents (`prioritaire` : personnages) ; 2. ceux qu'on voit partout (véhicules, affiches) ; 3. les monuments
// (`ou` : leur position) à moins de 1,5 km, le plus proche d'abord ; 4. ceux qui peuvent attendre (`apres` : les danses) ;
// 5. les monuments lointains, un seul à la fois et quand rien d'autre ne passe — l'un d'eux qui devient proche passe devant.
// Hors ligne, la file attend le retour du réseau ; chaque modèle est retenté (textures.js, avecReprises).
import * as THREE from 'three';
import { camera } from './scene.js';
import { E } from './etat.js';
import { libererApresEnvoi, reduireImage } from './textures.js';

const F = { demarre: false, attente: [], enCours: 0, max: 3, veille: 0 };
const PROCHE = 1500;

/** Lance `fn` (qui renvoie une promesse) quand la ville est affichée. `o` : true (prioritaire, comme avant) ou
 *  { prioritaire, ou: () => [x, z], apres }. */
export function plusTard(fn, o = false) {
  const opts = typeof o === 'object' ? o : { prioritaire: !!o };
  return new Promise((ok, ko) => { F.attente.push({ fn, ok, ko, ...opts }); suivant(); });
}
const ici = () => { const J = E.joueur; return J ? [J.x, J.z] : [camera.position.x, camera.position.z]; };
function rang(t, [x, z]) {
  if (t.prioritaire) return [0, 0];
  if (t.apres) return [3, 0];
  if (!t.ou) return [1, 0];
  const p = t.ou(); if (!p) return [1, 0];
  const d = Math.hypot(p[0] - x, p[1] - z);
  return d < Math.max(PROCHE, camera.position.y * 1.5) ? [2, d] : [4, d]; // de haut, on voit plus loin
}
function suivant() {
  if (!F.demarre) return;
  if (navigator.onLine === false) { if (!F.horsLigne) { F.horsLigne = true; addEventListener('online', () => { F.horsLigne = false; suivant(); }, { once: true }); } return; }
  while (F.enCours < F.max && F.attente.length) {
    const pos = ici(); let best = -1, br = null;
    F.attente.forEach((t, i) => { const r = rang(t, pos); if (!br || r[0] < br[0] || (r[0] === br[0] && r[1] < br[1])) { br = r; best = i; } });
    if (br[0] === 4 && F.enCours > 0) break; // un lointain : seulement quand la connexion est libre
    const [t] = F.attente.splice(best, 1); F.enCours++;
    Promise.resolve().then(t.fn).then(t.ok, t.ko).finally(() => { F.enCours--; suivant(); });
  }
  // Des lointains attendent : on regarde de temps en temps si l'on s'en est approché.
  if (F.attente.length && !F.veille) F.veille = setTimeout(() => { F.veille = 0; suivant(); }, 3000);
}
/** Appelé quand l'écran de chargement disparaît (main.js). */
export function demarrerTelechargements() { F.demarre = true; suivant(); }
/** Texture d'une photo (public/…) téléchargée une fois la ville affichée ; un aplat `teinte` en attendant.
 *  L'image n'a pas la taille de l'aplat : dispose() avant le nouvel envoi, sinon three garde le stockage 1 × 1 déjà alloué. */
export function photoPlusTard(fichier, teinte = '#cbbfa8') {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const g = cv.getContext('2d'); g.fillStyle = teinte; g.fillRect(0, 0, 1, 1);
  const t = libererApresEnvoi(new THREE.Texture(cv)); t.needsUpdate = true; // la photo n'est envoyée qu'une fois : son image est rendue (textures.js)
  plusTard(() => new THREE.ImageLoader().loadAsync(import.meta.env.BASE_URL + fichier))
    .then(img => { t.image = reduireImage(img); t.dispose(); t.needsUpdate = true; })
    .catch(e => console.warn(`photo ${fichier}`, e.message));
  return t;
}
