// ---------- Textures : réduites sur téléphone ----------
// Safari coupe l'onglet quand la page passe le gigaoctet — « Un problème récurrent est survenu », et le jeu ne
// démarre plus du tout (iPhone 13 d'un testeur, 25/10). Mesuré sur un écran de 390 × 844 : 264 Mo de textures
// pour 189 Mo de tas JavaScript. Une image de 1024 × 1024 occupe 5,4 Mo en mémoire vidéo (RVBA + mipmaps), la
// même en 512 n'en prend que 1,4 : sur un écran de poche la différence ne se voit pas, et c'est la moitié de la
// page qui s'en va. On réduit donc tout ce qui arrive en mode léger — les visuels des affiches, les photos de
// façade, et les textures des modèles (personnages, monuments, véhicules).
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { LITE, SECOURS } from './base.js';

/** Côté maximal d'une image, en pixels. Sur ordinateur on ne touche à rien. */
export const MAX_TEX = SECOURS ? 256 : LITE ? 512 : Infinity;
/** Le décor de rue (devantures, plaques, enseignes d'atelier) : vu de loin et en roulant, il supporte plus petit.
 *  C'est le gros de Zém Run — 205 Mo de textures mesurés sur un écran de 393 × 852, en centaines de petites
 *  images dessinées une par une, là où la ville n'en a que 135. */
export const MAX_DECOR = SECOURS ? 128 : LITE ? 192 : Infinity;

/** L'image réduite au format demandé (un canevas), ou l'image telle quelle si elle y tient déjà. */
export function reduireImage(img, max = MAX_TEX) {
  const w = img?.width || img?.videoWidth || 0, h = img?.height || img?.videoHeight || 0;
  if (!w || !h || Math.max(w, h) <= max) return img;
  const k = max / Math.max(w, h), cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
  const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high';
  c.drawImage(img, 0, 0, cv.width, cv.height);
  return cv;
}

const vues = new WeakSet();
/** Réduit l'image d'une texture déjà chargée. Les canevas qu'on dessine nous-mêmes sont déjà à la bonne taille. */
export function reduireTexture(t, max = MAX_TEX) {
  if (!t?.isTexture || vues.has(t) || t.isCanvasTexture || t.isVideoTexture || t.isCompressedTexture || t.isDataTexture) return t;
  vues.add(t);
  const im = reduireImage(t.image, max);
  if (im !== t.image) { t.image = im; t.dispose(); t.needsUpdate = true; }
  return t;
}

/** Toutes les textures d'un modèle chargé : couleur, relief, rugosité, émission… */
export function reduireTextures(racine, max = MAX_TEX) {
  if (max === Infinity) return racine;
  racine?.traverse(o => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const k in m) if (m[k]?.isTexture) reduireTexture(m[k], max);
  });
  return racine;
}

// ---------- Images rendues une fois envoyées à la carte graphique ----------
// Comme pour les sommets (memoire.js), three garde l'image d'une texture après l'avoir envoyée, au cas où il
// faudrait la renvoyer. Mesuré sur ordinateur (1440 × 900, écran Retina), en ville : 430 Mo d'images tenues ainsi,
// la moitié de la mémoire de l'onglet. Les modèles Tripo en font 250 à eux seuls : chacun a une couleur en
// 2048 × 2048, soit 16 Mo une fois décodée, et 2 Mo pour le relief et la rugosité.
// On rend l'image au moment où three a fini l'envoi (onUpdate), et seulement pour ce qui ne repart jamais :
// ni les canevas qu'on redessine, ni ce que montrent aussi la cabine d'essayage et la boutique (personnages,
// tenues, objets : mode.js et artisans.js ont leur propre carte graphique, elles devraient renvoyer l'image et
// n'auraient plus rien). Après une perte du contexte WebGL, ces textures ne reviennent pas, pas plus que les
// sommets : le jeu demande déjà de recharger la page (incidents.js).
const liberable = t => t?.isTexture && !t.isVideoTexture && !t.isDataTexture && !t.isCompressedTexture && !t.isRenderTargetTexture;
function rendreImage(t) { const im = t.source.data; t.source.data = null; im?.close?.(); } // close : un ImageBitmap rend sa mémoire tout de suite
/** Une texture seule (une photo qui arrive après coup) : son image est rendue à chaque envoi. */
export function libererApresEnvoi(t) { if (liberable(t)) t.onUpdate = rendreImage; return t; }
/** Les textures d'un modèle chargé. Une image partagée par plusieurs textures (même image, réglages différents)
 *  attend que toutes soient parties : la deuxième n'aurait sinon plus rien à envoyer. */
export function libererImages(racine) {
  const parSource = new Map();
  racine?.traverse(o => { for (const m of [].concat(o.material || [])) for (const k in m) { const t = m?.[k]; if (liberable(t)) { if (!parSource.has(t.source)) parSource.set(t.source, new Set()); parSource.get(t.source).add(t); } } });
  for (const ts of parSource.values()) { const attente = new Set(ts); for (const t of ts) t.onUpdate = () => { attente.delete(t); if (!attente.size) rendreImage(t); }; }
  return racine;
}

/** Le chargeur de modèles du jeu : meshopt, et les textures réduites à l'arrivée sur téléphone.
 *  `liberer` : modèles que seule la ville montre (bâtiments et véhicules Tripo, zémidjans), images rendues après l'envoi.
 *  `max` : côté maximal de leurs images, sur ordinateur aussi. */
export function chargeurGLB({ liberer = false, max = MAX_TEX } = {}) {
  const L = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  max = Math.min(max, MAX_TEX);
  if (max === Infinity && !liberer) return L;
  const charger = L.loadAsync.bind(L);
  L.loadAsync = (...a) => charger(...a).then(g => { reduireTextures(g.scene, max); if (liberer) libererImages(g.scene); return g; });
  return L;
}
