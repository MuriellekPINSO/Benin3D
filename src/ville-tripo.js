// ---------- Objets et maisons de Cotonou faits avec Tripo d'après de vraies photos (05/11) ----------
// Treize modèles très légers dans public/modeles/ville/ (40 à 330 Ko, 2 Mo en tout ; scripts/ville-leger.mjs) :
// pirogues, kéké, pousse-pousse, poubelle de la Mairie, sièges en pneus de la plage, maisons. « Tu dois réduire la qualité
// pour que ça n'impacte pas le chargement du site » (Murielle, 05/11) : ils ne partent qu'une fois la ville affichée, après
// tout le reste (telechargements.js, `apres`), et le jeu garde ses versions dessinées en code jusqu'à leur arrivée.
// Photos : Wikimedia Commons, auteurs et licences dans scripts/ville-photos.json.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LITE, SECOURS, toXZ } from './base.js';
import { plusTard } from './telechargements.js';
import { scene } from './scene.js';
import { roadLines, ROAD_W } from './ville.js';
import { REPERES } from './reperes.js';
import { chargeurGLB } from './textures.js';

/** id → { geo, mat, t } une fois arrivé : géométrie posée au sol et centrée, matériau, taille (x, y, z) en mètres du fichier. */
export const VILLE = {};
const attentes = new Map(), ecouteurs = [];
const chargeur = chargeurGLB({ liberer: true, max: LITE ? 512 : 1024 });

/** Appelle `f(modele)` quand le modèle `id` est là (tout de suite s'il l'est déjà). */
export function quandVille(id, f) {
  if (VILLE[id]) { f(VILLE[id]); return; }
  if (!attentes.has(id)) attentes.set(id, []);
  attentes.get(id).push(f);
}
/** `f(id)` à chaque arrivée d'un modèle (rue.js refait ses carrés). */
export function surArriveeVille(f) { ecouteurs.push(f); }

// Les fichiers sont quantifiés (entiers normalisés, et l'échelle dans le nœud) : on repasse en nombres à virgule avant
// d'appliquer la matrice du nœud, sinon applyMatrix4 écrit des flottants dans un tableau d'entiers.
export function enFlottants(geo) {
  for (const [nom, a] of Object.entries(geo.attributes)) {
    if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent ? a.getComponent(i, k) : [a.getX(i), a.getY(i), a.getZ(i), a.getW(i)][k];
    geo.setAttribute(nom, new THREE.BufferAttribute(f, a.itemSize));
  }
  return geo;
}

function preparer(id, gltf) {
  const geos = []; let mat = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(n => {
    if (!n.isMesh) return;
    const g = enFlottants(n.geometry.clone());
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(n.matrixWorld); geos.push(g); mat ||= n.material;
  });
  if (!geos.length) return null;
  const geo = geos.length > 1 ? mergeGeometries(geos) : geos[0];
  if (!geo.attributes.normal) geo.computeVertexNormals();
  geo.computeBoundingBox();
  const b = geo.boundingBox, c = b.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -b.min.y, -c.z); geo.computeBoundingBox(); geo.computeBoundingSphere();
  const t = geo.boundingBox.getSize(new THREE.Vector3());
  // Lambert, comme le reste de la ville : la photo porte déjà sa lumière (Tripo « delight » l'a seulement adoucie).
  const m = new THREE.MeshLambertMaterial({ map: mat?.map || null, color: mat?.map ? 0xffffff : (mat?.color || 0xcccccc) });
  m.name = `ville-${id}`;
  return { geo, mat: m, t };
}

// Modèles faits mais pas (encore) posés dans le jeu : pas téléchargés. Et ceux qu'un autre module charge à sa façon
// (la foule et celle du concert : plusieurs personnages dans un fichier, foule-reelle.js).
const PAS_ENCORE = new Set(), A_PART = new Set(['foule', 'concert', 'gradins']);
let INDEX = null;
/** La liste des modèles de public/modeles/ville (null si elle manque). */
export const indexVille = () => INDEX ??= fetch(import.meta.env.BASE_URL + 'modeles/ville/index.json')
  .then(r => r.ok && /json/.test(r.headers.get('content-type') || '') ? r.json() : null).catch(() => null);
/** Lancé une fois au démarrage (main.js) : la liste, puis les modèles, chacun quand la file est libre. */
export async function chargerVille() {
  if (SECOURS) return;
  const index = await indexVille(); if (!index) return;
  for (const [id, i] of Object.entries(index)) {
    if (PAS_ENCORE.has(id) || A_PART.has(id)) continue;
    plusTard(() => chargeur.loadAsync(`${import.meta.env.BASE_URL}modeles/ville/${id}.glb?v=${i.octets}`), { apres: true }).then(gltf => {
      const M = preparer(id, gltf); if (!M) return;
      VILLE[id] = M;
      for (const f of attentes.get(id) || []) f(M);
      attentes.delete(id);
      for (const f of ecouteurs) f(id);
    }).catch(e => console.warn(`modèle de ville ${id} non chargé`, e?.message || e));
  }
}

/**
 * Quand `id` arrive, l'instancié `m` (dessiné en code) prend sa forme : même matrices d'instances, la longueur du modèle
 * alignée sur celle de l'ancienne géométrie et mise à la même taille, posé à la même hauteur. Les couleurs d'instance
 * (peintures tirées au hasard) sont retirées : le modèle a celles de la photo. `cacher` : instanciés qui n'ont plus lieu
 * d'être (les paniers dessinés sur la pirogue chargée).
 */
export function remplacerParVille(m, id, { cacher = [], echelle = 1 } = {}) {
  // La boîte de l'ancienne forme est prise tout de suite : une fois envoyée à la carte graphique, la géométrie n'a plus ses
  // sommets côté JavaScript (memoire.js).
  const ancien = m.geometry; ancien.computeBoundingBox();
  const A = ancien.boundingBox.getSize(new THREE.Vector3()), bas = ancien.boundingBox.min.y;
  quandVille(id, M => {
    const g = M.geo.clone();
    // Long côté de l'ancienne forme sur x ou z ; celui du modèle aussi : un quart de tour s'ils ne tombent pas ensemble.
    if ((A.x >= A.z) !== (M.t.x >= M.t.z)) g.rotateY(Math.PI / 2);
    g.computeBoundingBox(); const T = g.boundingBox.getSize(new THREE.Vector3());
    const k = Math.max(A.x, A.z) / Math.max(T.x, T.z) * echelle;
    g.scale(k, k, k); g.translate(0, bas, 0); g.computeBoundingSphere();
    m.geometry = g; m.material = M.mat; m.instanceColor = null;
    if (m.boundingSphere) m.computeBoundingSphere();
    ancien.dispose();
    for (const c of cacher) if (c) c.count = 0; // pas `visible` : lieux.js le recalcule à chaque image selon la distance
  });
}

/** Un instancié du modèle `id` (s'il est arrivé) pour une liste [x, y, z, angle, sx, sy, sz] ; null sinon. */
export function instancesVille(id, liste, ombre = true) {
  const M = VILLE[id]; if (!M || !liste.length) return null;
  const m = new THREE.InstancedMesh(M.geo, M.mat, liste.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  liste.forEach(([x, y, z, a, sx, sy, sz], i) => { m4.compose(p.set(x, y, z), q.setFromAxisAngle(Y, a), s.set(sx, sy, sz)); m.setMatrixAt(i, m4); });
  m.castShadow = ombre && !LITE; m.receiveShadow = true; m.name = `ville-${id}`; m.computeBoundingSphere();
  return m;
}
/** Échelle uniforme pour que la plus grande longueur au sol du modèle `id` fasse `L` mètres. */
export const echelleSol = (id, L) => { const t = VILLE[id]?.t; return t ? L / Math.max(t.x, t.z) : 1; };
/** Échelle uniforme pour une hauteur de `h` mètres. */
export const echelleHaut = (id, h) => { const t = VILLE[id]?.t; return t ? h / t.y : 1; };
/** Les géométries partagées par les carrés de rue (à ne pas libérer avec eux). */
export const geometriesVille = () => Object.values(VILLE).map(M => M.geo);

// ---------- Repères à leur vraie place (reperes.js) ----------
/** Le point de rue le plus proche de (x, z) sur une rue de quartier ou plus grande, et la demi-largeur de cette rue. */
function rueProche(x, z) {
  let best = null, bd = 1e18;
  for (const L of roadLines) {
    if (L.cls > 4 || L.bridge) continue;
    const P = L.pts, hw = (L.w ?? ROAD_W[L.cls]) / 2;
    for (let k = 1; k < P.length; k++) {
      const [ax, az] = P[k - 1], [bx, bz] = P[k], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), px = ax + dx * t, pz = az + dz * t, d = (x - px) ** 2 + (z - pz) ** 2;
      if (d < bd) { bd = d; best = [px, pz, hw]; }
    }
  }
  return best;
}
/** Pose les repères (main.js, une fois la ville construite) : chacun arrive avec les autres modèles, après la ville. */
export function poserReperes() {
  if (SECOURS) return;
  for (const R of REPERES) quandVille(R.id, M => {
    const t = M.t, g = new THREE.Group(); g.name = `repere-${R.id}`;
    const m = new THREE.Mesh(M.geo, M.mat); m.castShadow = !LITE; m.receiveShadow = true; m.userData.garder = true; g.add(m);
    if (R.de) { // passerelle : le long du pont, sa longueur, sa hauteur et son épaisseur données
      const [ax, az] = toXZ(...R.de), [bx, bz] = toXZ(...R.a), L = Math.hypot(bx - ax, bz - az);
      m.scale.set(R.epaisseur / t.x, R.hauteur / t.y, L / t.z);
      g.position.set((ax + bx) / 2, 0, (az + bz) / 2); g.rotation.y = Math.atan2(bx - ax, bz - az);
    } else {
      const [cx, cz] = toXZ(...R.centre);
      let dir; // vers où regarde la façade (le +x du fichier)
      if (R.face) { const [fx, fz] = toXZ(...R.face); dir = [fx - cx, fz - cz]; }
      else { const p = rueProche(cx, cz); dir = p ? [p[0] - cx, p[1] - cz] : [1, 0]; R._rue = p; }
      const l = Math.hypot(...dir) || 1; dir = [dir[0] / l, dir[1] / l];
      const k = R.hauteur ? R.hauteur / t.y : R.largeur / t.z;
      m.scale.setScalar(k);
      const prof = t.x * k;
      let px = cx, pz = cz;
      // Église : la façade au bord sud de l'emprise (la photo est prise de là) ; le reste de la nef n'est pas sur la photo.
      if (R.longueur) { px = cx + dir[0] * (R.longueur / 2 - prof / 2); pz = cz + dir[1] * (R.longueur / 2 - prof / 2); }
      // Pharmacie : la façade à 3 m du bord de la chaussée.
      if (R._rue) { const [rx, rz, hw] = R._rue, recul = hw + 3 + prof / 2; px = rx - dir[0] * recul; pz = rz - dir[1] * recul; }
      g.position.set(px, 0, pz); g.rotation.y = Math.atan2(-dir[1], dir[0]);
    }
    scene.add(g);
  });
}
