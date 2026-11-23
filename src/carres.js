import * as THREE from 'three';

/**
 * Découpe une instance géante (des objets semés sur des kilomètres : palmiers, lampadaires, pilotis, tombes…) en carrés de
 * `cote` m. D'un seul tenant, sa sphère couvrait toute la ville : toujours « dans le champ », dessinée en entier à chaque
 * image. Chaque carré a sa propre sphère, et la caméra (champ, brouillard) les écarte un par un. Rend les carrés (à
 * ajouter à la scène) ; userData est copié, et la liste par instance userData.xz suit le découpage.
 */
export function parCarres(m, cote = 600) {
  const cases = new Map(), M = new THREE.Matrix4(), C = new THREE.Color(), xz = m.userData.xz;
  for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, M); const k = `${Math.floor(M.elements[12] / cote)},${Math.floor(M.elements[14] / cote)}`; if (!cases.has(k)) cases.set(k, []); cases.get(k).push(i); }
  if (cases.size < 2) { m.computeBoundingSphere(); return [m]; }
  return [...cases.values()].map(ids => {
    const c = new THREE.InstancedMesh(m.geometry, m.material, ids.length);
    ids.forEach((i, j) => { m.getMatrixAt(i, M); c.setMatrixAt(j, M); if (m.instanceColor) { m.getColorAt(i, C); c.setColorAt(j, C); } });
    c.castShadow = m.castShadow; c.receiveShadow = m.receiveShadow; c.renderOrder = m.renderOrder; c.frustumCulled = m.frustumCulled; c.name = m.name;
    c.userData = { ...m.userData }; if (xz) c.userData.xz = Float32Array.from(ids.flatMap(i => [xz[2 * i], xz[2 * i + 1]]));
    c.computeBoundingSphere(); return c;
  });
}

/**
 * Le même découpage pour un maillage posé sur des kilomètres (les routes, les bordures et le gazon des terre-pleins, les
 * maisons de Ganvié) : chaque triangle va au carré de son premier sommet. Indexé, les carrés partagent les sommets (envoyés
 * une fois à la carte graphique) ; sinon chacun a les siens. Chaque carré a sa boîte et sa sphère, calculées ici : memoire.js
 * ne pourrait plus le faire, et sur des sommets partagés elles couvriraient toute la ville. Rend les géométries.
 */
export function geometriesParCarres(g, cote = 500) {
  const P = g.attributes.position.array, I = g.index?.array, nt = (I ? I.length : P.length / 3) / 3, cases = new Map();
  const sommet = (t, j) => (I ? I[3 * t + j] : 3 * t + j);
  for (let t = 0; t < nt; t++) {
    const a = sommet(t, 0) * 3, k = `${Math.floor(P[a] / cote)},${Math.floor(P[a + 2] / cote)}`;
    let l = cases.get(k); if (!l) cases.set(k, l = []); l.push(sommet(t, 0), sommet(t, 1), sommet(t, 2));
  }
  if (cases.size < 2) return [g];
  return [...cases.values()].map(ix => {
    const c = new THREE.BufferGeometry();
    if (I) { for (const [n, a] of Object.entries(g.attributes)) c.setAttribute(n, a); c.setIndex(new THREE.BufferAttribute(Uint32Array.from(ix), 1)); }
    else for (const [n, a] of Object.entries(g.attributes)) {
      const t = a.itemSize, src = a.array, dst = new src.constructor(ix.length * t);
      ix.forEach((i, j) => { for (let q = 0; q < t; q++) dst[j * t + q] = src[i * t + q]; });
      c.setAttribute(n, new THREE.BufferAttribute(dst, t, a.normalized));
    }
    const b = new THREE.Box3(), v = new THREE.Vector3(); for (const i of ix) b.expandByPoint(v.fromArray(P, i * 3));
    c.boundingBox = b; c.boundingSphere = b.getBoundingSphere(new THREE.Sphere());
    return c;
  });
}
/** Un maillage en carrés de `cote` m (geometriesParCarres) : des maillages qui reprennent son matériau, son ordre, ses ombres. */
export function maillageParCarres(m, cote = 500) {
  const gs = geometriesParCarres(m.geometry, cote); if (gs.length < 2) return [m];
  return gs.map(g => {
    const c = new THREE.Mesh(g, m.material);
    c.renderOrder = m.renderOrder; c.castShadow = m.castShadow; c.receiveShadow = m.receiveShadow; c.frustumCulled = m.frustumCulled; c.name = m.name; c.userData = { ...m.userData };
    c.matrixAutoUpdate = false; // posés une fois pour toutes : pas de matrice à refaire à chaque image
    return c;
  });
}
