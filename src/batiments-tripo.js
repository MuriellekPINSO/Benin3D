import * as THREE from 'three';
import { LITE } from './base.js';
import { plusTard } from './telechargements.js';
import { chargeurGLB } from './textures.js';

// ---------- Bâtiments reconnaissables : modèles Tripo générés à partir de photos ----------
// scripts/tripo.mjs fabrique public/modeles/batiments/<id>.glb à partir d'une photo
// (Wikimedia Commons, crédits dans scripts/tripo-photos.json) et tient la liste à jour
// dans index.json. Quand un modèle existe, le lieu dessiné à la main garde ses abords
// (place, parking, rond-point) et le modèle prend la place du bâtiment.

export const TRIPO = { dispo: new Set(), info: {}, leger: {} };
/** À attendre avant de construire les lieux : quels modèles existent. */
export async function chargerIndexTripo() {
  try {
    const lire = async f => { const r = await fetch(import.meta.env.BASE_URL + `modeles/batiments/${f}`); return r.ok && /json/.test(r.headers.get('content-type') || '') ? r.json() : null; };
    const [info, leger] = await Promise.all([lire('index.json'), LITE ? lire('leger/index.json').catch(() => null) : null]);
    if (info) { TRIPO.info = info; for (const id of Object.keys(info)) TRIPO.dispo.add(id); }
    if (leger) TRIPO.leger = leger;
  } catch { }
  return TRIPO.dispo.size;
}
/** Adresse du modèle `id` : sur téléphone, sa version allégée (scripts/leger.mjs) quand elle existe. La taille sert de version. */
export function urlTripo(id) {
  const L = TRIPO.leger[id], i = L || TRIPO.info[id];
  return import.meta.env.BASE_URL + `modeles/batiments/${L ? 'leger/' : ''}${id}.glb?v=${i?.octets || 0}`;
}
export const tripoDispo = id => TRIPO.dispo.has(id);

// Réglages fins par bâtiment (rotation en radians, ajoutée à celle du lieu ; décalage local en mètres).
export const REGLAGES = { congres: {}, cathedrale: { rot: -Math.PI / 2 }, porte: {}, etoile: {}, bioguera: {}, dome: { dy: -6, mat: { couleur: '#b7bbbe', rugosite: .5, metal: .25 } }, dantokpa: { rot: Math.PI / 2 }, bceao: {}, sofitel: { rot: Math.PI / 2 }, moov: { rot: Math.PI / 2, dz: -5 } }; // moov : façade (verre bleu, logo) vers l'avenue Jean-Paul II, alignée sur le bord nord de l'emprise // sofitel : façade courbe et auvent vers le boulevard // dantokpa : enseigne et étals vers la lagune // dome : photo de nuit, on garde le volume et une teinte argent // dome : le socle (parvis photographié) s'enfonce dans le sol
const chargeur = chargeurGLB();
/**
 * Pose le modèle `id` dans `parent` (repère local du lieu) : posé au sol, centré en (x, z),
 * mis à l'échelle par sa hauteur ou sa plus grande largeur, tourné de `rot` (radians).
 */
export function poserTripo(id, parent, opts = {}) {
  const R = REGLAGES[id] || {}, { hauteur, largeur } = { ...opts, ...R }, rot = (opts.rot || 0) + (R.rot || 0), x = (opts.x || 0) + (R.dx || 0), y = (opts.y || 0) + (R.dy || 0), z = (opts.z || 0) + (R.dz || 0);
  const pivot = new THREE.Group(); pivot.name = `tripo-${id}`; pivot.position.set(x, y, z); pivot.rotation.y = rot; parent.add(pivot);
  // La taille du fichier sert de version : un modèle refait n'est pas repris du cache du navigateur. Téléchargé une fois
  // la ville affichée (telechargements.js) : en attendant, le monument dessiné en code reste en place.
  plusTard(() => chargeur.loadAsync(urlTripo(id))).then(gltf => {
    const obj = gltf.scene, boite = new THREE.Box3().setFromObject(obj), t = boite.getSize(new THREE.Vector3());
    const k = hauteur ? hauteur / t.y : largeur / Math.max(t.x, t.z);
    obj.scale.setScalar(k);
    const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3());
    obj.position.set(-c.x, -b2.min.y, -c.z);
    obj.traverse(n => { if (n.isMesh) { n.castShadow = !LITE; n.receiveShadow = true; n.userData.garder = true; if (R.mat) n.material = new THREE.MeshStandardMaterial({ color: R.mat.couleur, roughness: R.mat.rugosite ?? .6, metalness: R.mat.metal ?? .2 }); } });
    pivot.add(obj);
  }).catch(e => console.warn(`modèle ${id} non chargé`, e));
  return pivot;
}
