import * as THREE from 'three';
import { scene } from './scene.js';

// ---------- Rendre la mémoire que three.js garde en double ----------
// Une géométrie envoyée à la carte graphique reste aussi du côté JavaScript : three ne libère jamais le tableau
// de sommets, au cas où on voudrait le relire. Mesuré sur un écran de téléphone, cela fait 142 Mo sur les
// 340 Mo du jeu — la position, la normale, l'index et l'UV de toute la ville, gardés en double. C'est la
// première cause des plantages de l'onglet : un Android d'entrée de gamme ne donne que 256 à 512 Mo à une page.
//
// Le jeu ne relit jamais ces tableaux : il n'y a pas un seul Raycaster dans le code, les collisions passent par
// ses propres index (rue.js, conduite.js, trafic.js). Ce qui les relirait, ce sont les boîtes englobantes — le
// tri du rendu, et horsDeLaPiece quand on entre dans une pièce. On les calcule donc d'avance.
//
// On passe par onUpload, le crochet prévu par three : le tableau n'est rendu qu'au moment précis où la carte
// graphique l'a reçu. Libérer soi-même serait dangereux, car tout ce qui est caché ou hors du champ (les zéms,
// les tokpa-tokpa, les lampadaires, les intérieurs) n'est pas encore envoyé à ce moment-là.

const vues = new WeakSet();
/** Un attribut qu'on peut rendre : ni dynamique (il sera réécrit), ni entrelacé, ni déjà traité. */
const liberable = a => a && a.array && !a.isInterleavedBufferAttribute && a.usage !== THREE.DynamicDrawUsage;

/**
 * À appeler avant le premier rendu, puis après chaque arrivée de modèles. Renvoie le nombre de géométries
 * préparées (pour les essais).
 */
export function preparerGeometries(racine = scene) {
  let n = 0;
  racine.traverse(o => {
    const g = o.geometry;
    if (!g || vues.has(g) || o.isSkinnedMesh || o.morphTargetInfluences) return; // un personnage animé garde ses sommets
    vues.add(g); n++;
    // Les boîtes d'abord : après, on ne saurait plus les calculer. Le rendu se sert de la sphère, horsDeLaPiece de la boîte.
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingSphere) g.computeBoundingSphere();
    for (const a of [...Object.values(g.attributes), g.index]) if (liberable(a)) a.onUpload(function rendre() { this.array = null; });
  });
  return n;
}
/** Ce que les géométries de la scène tiennent encore du côté JavaScript, en octets (pour les essais). */
export function octetsGeometries(racine = scene) {
  const vu = new Set(); let o = 0;
  racine.traverse(x => { const g = x.geometry; if (!g || vu.has(g)) return; vu.add(g); for (const a of [...Object.values(g.attributes), g.index]) o += a?.array?.byteLength || 0; });
  return o;
}
if (import.meta.env.DEV) window.__memoire = { preparerGeometries, octetsGeometries };
