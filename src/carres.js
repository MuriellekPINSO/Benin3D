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
