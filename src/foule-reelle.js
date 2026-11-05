// ---------- La foule en vrais personnages (05/11) ----------
// « Enlève ces humains 3D et mets de vraies personnes » (Murielle, 05/11) : les foules de lieux.js (marché de Dantokpa,
// marchés de bord de route, plage, esplanade de l'Amazone, Corniche) et celle du concert étaient des cylindres coiffés
// d'une boule. Ce sont maintenant les personnages du jeu (vendeuse, maman, étudiante, jeune, employé de bureau, ancien,
// écoliers), figés dans une pose (scripts/foule.mjs) :
//   foule.glb    debout, pour les foules de la ville (24 variantes, 470 Ko)
//   concert.glb  bras levés et danses, pour le concert (32 variantes, 590 Ko, téléchargé quand la scène se monte)
// Chacun en deux finesses : 700 triangles de près, ~330 de loin. Au-delà de LOIN mètres, une personne ne fait plus que
// deux ou trois pixels : les silhouettes reprennent, ce sont des points de couleur. Les fichiers partent après
// l'affichage de la ville ; d'ici là, ce sont les silhouettes partout.
import * as THREE from 'three';
import { LITE, SECOURS, hash } from './base.js';
import { scene } from './scene.js';
import { plusTard } from './telechargements.js';
import { chargeurGLB } from './textures.js';
import { enFlottants, indexVille } from './ville-tripo.js';

// Mètres (caméra comprise : de haut, on les voit moins) : finesse haute en deçà de PRES, basse jusqu'à LOIN. Cases de CASE m.
const PRES = LITE ? 70 : 120, LOIN = LITE ? 200 : 350, CASE = 40;
// Qui l'on croise : surtout des femmes au marché ; les écoliers en uniforme, de temps en temps.
const POIDS = { vendeuse: 3, maman: 2.5, etudiante: 2, jeune: 2, bureau: 1.5, ancien: 1.2, 'eleve-fille': .35, 'eleve-garcon': .35 };
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// ---------- Les fichiers ----------
const FICHIERS = {};
/** Les variantes du fichier `nom` : { V: [{ id, poids, jusqua, enfant, haut, bas, sommet }], mat } (null s'il manque). */
export function variantesFoule(nom, { prioritaire = false } = {}) {
  return FICHIERS[nom] ??= (async () => {
    if (SECOURS) return null;
    const i = (await indexVille())?.[nom]; if (!i) return null;
    const url = `${import.meta.env.BASE_URL}modeles/ville/${nom}.glb?v=${i.octets}`;
    const g = await plusTard(() => chargeurGLB({ liberer: true, max: LITE ? 512 : 1024 }).loadAsync(url), prioritaire ? true : { apres: true });
    g.scene.updateMatrixWorld(true);
    let mat = null; const par = new Map();
    g.scene.traverse(n => {
      if (!n.isMesh) return;
      const [, cle, finesse] = n.name.match(/^(.*)-(haut|bas)$/) || []; // <id>-p<n°>-<finesse> (scripts/foule.mjs)
      if (!cle) return;
      const geo = enFlottants(n.geometry.clone());
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'uv') geo.deleteAttribute(k);
      geo.applyMatrix4(n.matrixWorld); geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
      mat ||= new THREE.MeshLambertMaterial({ map: n.material.map }); mat.name = `foule-${nom}`;
      const id = Object.keys(POIDS).find(k => cle.startsWith(k)) ?? cle;
      if (!par.has(cle)) par.set(cle, { id, poids: POIDS[id] ?? 1, enfant: id.startsWith('eleve') });
      par.get(cle)[finesse] = geo;
    });
    const V = [...par.values()].filter(v => v.haut && v.bas); if (!V.length) return null;
    const total = V.reduce((t, v) => t + v.poids, 0); let cumul = 0;
    for (const v of V) { cumul += v.poids / total; v.jusqua = cumul; v.sommet = v.haut.boundingBox.max.y; }
    return { V, mat };
  })().catch(e => { console.warn(`foule ${nom} non chargée`, e?.message || e); return null; });
}
const tirer = (V, h) => Math.max(0, V.findIndex(v => h < v.jusqua));

// ---------- Les foules de la ville (lieux.js) ----------
const G = { x: [], y: [], z: [], a: [], k: [], h: [], cap: [], cases: new Map(), F: null, haut: [], bas: [], v: [], change: false };

/** Inscrit une foule de lieux.js : positions (dm, comme foule()), hauteur, et ses silhouettes (corps, têtes). */
export function ajouterFoule(arr, graine, y, corps, tetes) {
  if (SECOURS) return;
  for (let i = 0; i < arr.length / 2; i++) {
    const x = arr[2 * i] / 10, z = arr[2 * i + 1] / 10, j = G.x.length;
    corps.getMatrixAt(i, m4);
    G.x.push(x); G.y.push(y); G.z.push(z); G.k.push(m4.elements[5]); G.cap.push([corps, tetes, i]);
    G.a.push(hash(i, graine + 90) * Math.PI * 2); G.h.push(hash(i, graine + 91));
    const ci = Math.floor(x / CASE), cj = Math.floor(z / CASE), c = `${ci},${cj}`;
    let e = G.cases.get(c); if (!e) G.cases.set(c, e = { ci, cj, y, l: [], etat: 0 }); e.l.push(j);
  }
  if (G.F) construire();
}

/** Lancé une fois au démarrage (main.js) : la foule de la ville, après les autres modèles. */
export async function chargerFoule() {
  const F = await variantesFoule('foule'); if (!F) return;
  G.F = F; construire();
}

// Par variante, un instancié de chaque finesse, assez grand pour tous ceux qui l'ont tirée ; rempli de ceux qu'on voit.
function construire() {
  for (const m of [...G.haut, ...G.bas]) { scene.remove(m); m.dispose(); }
  const V = G.F.V, n = new Array(V.length).fill(0);
  G.v = G.h.map(h => { const k = tirer(V, h); n[k]++; return k; });
  const faire = (finesse, ombre) => V.map((v, k) => {
    const m = new THREE.InstancedMesh(v[finesse], G.F.mat, Math.max(1, n[k]));
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.visible = false;
    m.castShadow = ombre; m.receiveShadow = true; m.name = 'foule-reelle';
    scene.add(m); return m;
  });
  G.haut = faire('haut', !LITE); G.bas = faire('bas', false);
  for (const e of G.cases.values()) { if (e.etat) montrer(e, true); e.etat = 0; } // on recompte tout
  G.change = true;
}

// Silhouettes d'une case : à taille nulle quand les personnages sont là, remises sinon.
function montrer(e, oui, touches) {
  for (const j of e.l) {
    const [corps, tetes, i] = G.cap[j], k = G.k[j];
    if (oui) m4.makeScale(k, k, k).setPosition(G.x[j], G.y[j], G.z[j]);
    corps.setMatrixAt(i, oui ? m4 : ZERO); tetes.setMatrixAt(i, oui ? m4 : ZERO);
    touches?.add(corps); touches?.add(tetes);
  }
}

/** Toutes les douze images (visibiliteLieux) : qui est assez près pour être un vrai personnage, et en quelle finesse. */
export function majFoule(cam, cache = false) {
  if (!G.F) return;
  const touches = new Set(); let change = G.change;
  for (const e of G.cases.values()) {
    let etat = 0; // 0 silhouettes, 1 de loin, 2 de près
    if (!cache) {
      const dx = Math.max(e.ci * CASE - cam.x, 0, cam.x - (e.ci + 1) * CASE), dz = Math.max(e.cj * CASE - cam.z, 0, cam.z - (e.cj + 1) * CASE);
      if (dx < LOIN && dz < LOIN) { const d = Math.hypot(dx, dz, cam.y - e.y); etat = d < PRES ? 2 : d < LOIN ? 1 : 0; }
    }
    if (etat === e.etat) continue;
    if (!etat !== !e.etat) montrer(e, !etat, touches);
    e.etat = etat; change = true;
  }
  if (!change) return;
  for (const m of touches) m.instanceMatrix.needsUpdate = true;
  G.change = false;
  for (const m of G.haut) m.count = 0;
  for (const m of G.bas) m.count = 0;
  for (const e of G.cases.values()) {
    if (!e.etat) continue;
    const L = e.etat === 2 ? G.haut : G.bas;
    for (const j of e.l) {
      const m = L[G.v[j]], k = 1 + (G.k[j] - 1.01) * .45; // les silhouettes varient de ± 11 % ; eux, déjà à leur taille, de ± 5 %
      m4.compose(p.set(G.x[j], G.y[j], G.z[j]), q.setFromAxisAngle(Y, G.a[j]), s.set(k, k, k));
      m.setMatrixAt(m.count++, m4);
    }
  }
  for (const m of [...G.haut, ...G.bas]) { m.visible = m.count > 0; if (m.count) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); } }
}
/** Pour les essais : combien de vrais personnages affichés, de près et de loin. */
export const etatFoule = () => ({
  variantes: G.F?.V.length || 0, gens: G.x.length, enfants: G.F ? +(G.v.filter(k => G.F.V[k].enfant).length / G.v.length).toFixed(3) : 0,
  pres: G.haut.reduce((t, m) => t + m.count, 0), loin: G.bas.reduce((t, m) => t + m.count, 0),
});

// ---------- Une foule que l'appelant anime (le concert, evenement.js) ----------
/**
 * `n` personnes du fichier `nom`, ajoutées à `parent`, chacune avec sa variante (tirée avec `graine`). L'appelant pose
 * chacune à chaque image : poser(i, matrice), puis fini(). choisir('haut' | 'bas') change de finesse (à reposer ensuite).
 * sommet(i) : la hauteur de la personne i, mains levées comprises (pour le téléphone qu'elle brandit).
 */
export async function fouleAnimee(nom, n, graine, parent) {
  const F = await variantesFoule(nom, { prioritaire: true }); if (!F) return null;
  const V = F.V, v = new Int32Array(n), rang = new Int32Array(n), compte = new Array(V.length).fill(0);
  for (let i = 0; i < n; i++) { v[i] = tirer(V, hash(i, graine)); rang[i] = compte[v[i]]++; }
  const jeu = finesse => V.map((x, k) => {
    const m = new THREE.InstancedMesh(x[finesse], F.mat, Math.max(1, compte[k]));
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = compte[k]; m.visible = false;
    m.frustumCulled = false; m.receiveShadow = true; m.name = `foule-${nom}`; // positions changées à chaque image
    parent.add(m); return m;
  });
  const J = { haut: jeu('haut'), bas: jeu('bas') };
  let actif = J.bas;
  return {
    meshes: [...J.haut, ...J.bas],
    choisir(f) { if (J[f] === actif) return; for (const m of actif) m.visible = false; actif = J[f]; },
    poser: (i, mat) => actif[v[i]].setMatrixAt(rang[i], mat),
    fini() { for (const m of actif) { m.visible = m.count > 0; m.instanceMatrix.needsUpdate = true; } },
    sommet: i => V[v[i]].sommet,
  };
}
