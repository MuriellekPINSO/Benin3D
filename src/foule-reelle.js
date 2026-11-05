// ---------- La foule en vrais personnages (05/11) ----------
// « Enlève ces humains 3D et mets de vraies personnes » (Murielle, 05/11) : les foules de lieux.js (marché de Dantokpa,
// marchés de bord de route, plage, esplanade de l'Amazone, Corniche) étaient des cylindres coiffés d'une boule.
// Près de la caméra, chacun devient un des personnages du jeu (vendeuse, maman, étudiante, jeune, employé de bureau,
// ancien, écoliers), figé debout dans une pose (scripts/foule.mjs : 24 variantes de 700 triangles, une seule image,
// public/modeles/ville/foule.glb, 340 Ko). Plus loin, ils ne font que quelques pixels : les silhouettes restent.
// Le fichier part après l'affichage de la ville ; d'ici là, ce sont les silhouettes partout.
import * as THREE from 'three';
import { LITE, SECOURS, hash } from './base.js';
import { scene } from './scene.js';
import { plusTard } from './telechargements.js';
import { chargeurGLB } from './textures.js';
import { enFlottants, indexVille } from './ville-tripo.js';

// En deçà de PRES mètres (caméra comprise, de haut on ne les voit pas), de vrais personnages ; par cases de CASE m.
const PRES = LITE ? 70 : 120, CASE = 40;
// Qui l'on croise : surtout des femmes au marché ; les écoliers en uniforme, de temps en temps.
const POIDS = { vendeuse: 3, maman: 2.5, etudiante: 2, jeune: 2, bureau: 1.5, ancien: 1.2, 'eleve-fille': .35, 'eleve-garcon': .35 };
const G = { x: [], y: [], z: [], a: [], k: [], h: [], cap: [], cases: new Map(), proches: new Set(), variantes: null, meshes: [], v: [] };
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** Inscrit une foule de lieux.js : positions (dm, comme foule()), hauteur, et ses silhouettes (corps, têtes). */
export function ajouterFoule(arr, graine, y, corps, tetes) {
  if (SECOURS) return;
  for (let i = 0; i < arr.length / 2; i++) {
    const x = arr[2 * i] / 10, z = arr[2 * i + 1] / 10, j = G.x.length;
    corps.getMatrixAt(i, m4);
    G.x.push(x); G.y.push(y); G.z.push(z); G.k.push(m4.elements[5]); G.cap.push([corps, tetes, i]);
    G.a.push(hash(i, graine + 90) * Math.PI * 2); G.h.push(hash(i, graine + 91));
    const ci = Math.floor(x / CASE), cj = Math.floor(z / CASE), c = `${ci},${cj}`;
    let e = G.cases.get(c); if (!e) G.cases.set(c, e = { ci, cj, y, l: [] }); e.l.push(j);
  }
  if (G.variantes) construire();
}

/** Lancé une fois au démarrage (main.js), après les autres modèles de la ville. */
export async function chargerFoule() {
  if (SECOURS) return;
  const i = (await indexVille())?.foule; if (!i) return;
  const g = await plusTard(() => chargeurGLB({ liberer: true, max: LITE ? 512 : 1024 }).loadAsync(`${import.meta.env.BASE_URL}modeles/ville/foule.glb?v=${i.octets}`), { apres: true })
    .catch(e => { console.warn('foule non chargée', e?.message || e); return null; });
  if (!g) return;
  g.scene.updateMatrixWorld(true);
  let mat = null; const V = [];
  g.scene.traverse(n => {
    if (!n.isMesh) return;
    const geo = enFlottants(n.geometry.clone());
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'uv') geo.deleteAttribute(k);
    geo.applyMatrix4(n.matrixWorld); geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
    mat ||= new THREE.MeshLambertMaterial({ map: n.material.map }); mat.name = 'foule-reelle';
    // « vendeuse:idle@0.3 » dans le fichier ; GLTFLoader retire « : » et « . » des noms (« vendeuseidle@03 »).
    const id = Object.keys(POIDS).find(k => n.name.startsWith(k)) ?? n.name; V.push({ geo, poids: POIDS[id] ?? 1, enfant: id.startsWith('eleve') });
  });
  if (!V.length) return;
  const total = V.reduce((t, v) => t + v.poids, 0); let cumul = 0;
  for (const v of V) { cumul += v.poids / total; v.jusqua = cumul; }
  G.variantes = V; G.mat = mat;
  construire();
}

// Un instancié par variante, assez grand pour tous ceux qui l'ont tirée ; rempli seulement de ceux qui sont près.
function construire() {
  for (const m of G.meshes) { scene.remove(m); m.dispose(); }
  const V = G.variantes, n = new Array(V.length).fill(0);
  G.v = G.h.map(h => { const k = Math.max(0, V.findIndex(v => h < v.jusqua)); n[k]++; return k; });
  G.meshes = V.map((v, k) => {
    const m = new THREE.InstancedMesh(v.geo, G.mat, Math.max(1, n[k]));
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.visible = false;
    m.castShadow = !LITE; m.receiveShadow = true; m.name = 'foule-reelle';
    scene.add(m); return m;
  });
  for (const c of G.proches) montrer(G.cases.get(c), true); // les silhouettes de ces cases reviennent, on recompte
  G.proches = new Set(); G.change = true;
}

// Silhouettes d'une case : cachées (taille nulle) quand les personnages sont là, remises sinon.
function montrer(e, oui, touches) {
  for (const j of e.l) {
    const [corps, tetes, i] = G.cap[j], k = G.k[j];
    if (oui) m4.makeScale(k, k, k).setPosition(G.x[j], G.y[j], G.z[j]);
    corps.setMatrixAt(i, oui ? m4 : ZERO); tetes.setMatrixAt(i, oui ? m4 : ZERO);
    touches?.add(corps); touches?.add(tetes);
  }
}

/** Toutes les douze images (visibiliteLieux) : qui est assez près pour être un vrai personnage. */
export function majFoule(cam, cache = false) {
  if (!G.variantes) return;
  const proches = new Set();
  if (!cache) for (const [c, e] of G.cases) {
    const dx = Math.max(e.ci * CASE - cam.x, 0, cam.x - (e.ci + 1) * CASE), dz = Math.max(e.cj * CASE - cam.z, 0, cam.z - (e.cj + 1) * CASE);
    if (dx < PRES && dz < PRES && Math.hypot(dx, dz, cam.y - e.y) < PRES) proches.add(c);
  }
  if (!G.change && proches.size === G.proches.size && [...proches].every(c => G.proches.has(c))) return;
  const touches = new Set();
  for (const c of G.proches) if (!proches.has(c)) montrer(G.cases.get(c), true, touches);
  for (const c of proches) if (!G.proches.has(c)) montrer(G.cases.get(c), false, touches);
  for (const m of touches) m.instanceMatrix.needsUpdate = true;
  G.proches = proches; G.change = false;
  // Les personnages des cases proches, rangés par variante.
  for (const m of G.meshes) m.count = 0;
  for (const c of proches) for (const j of G.cases.get(c).l) {
    const m = G.meshes[G.v[j]], k = 1 + (G.k[j] - 1.01) * .45; // les silhouettes varient de ± 11 % ; eux, déjà à leur taille, de ± 5 %
    m4.compose(p.set(G.x[j], G.y[j], G.z[j]), q.setFromAxisAngle(Y, G.a[j]), s.set(k, k, k));
    m.setMatrixAt(m.count++, m4);
  }
  for (const m of G.meshes) { m.visible = m.count > 0; if (m.count) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); } }
}
/** Pour les essais : combien de vrais personnages affichés, et combien de silhouettes remplacées. */
export const etatFoule = () => ({ variantes: G.variantes?.length || 0, enfants: G.variantes ? +(G.v.filter(k => G.variantes[k].enfant).length / G.v.length).toFixed(3) : 0, gens: G.x.length, affiches: G.meshes.reduce((t, m) => t + m.count, 0), cases: G.proches.size });
