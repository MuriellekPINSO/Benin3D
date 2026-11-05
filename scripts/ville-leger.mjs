// Modèles Tripo de la ville (objets de rue, maisons, repères) en version très légère pour le site :
// sources/tripo/<id>.glb (≈ 50 Mo, sorti de Tripo) → public/modeles/ville/<id>.glb (≈ 50 à 250 Ko).
// Peu de triangles, une seule image de couleur en WebP (512 px pour les objets, 1024 pour les bâtiments),
// ni relief ni rugosité : vus de la rue, on ne les voit pas, et ils pèsent plus lourd que la couleur.
//   node scripts/ville-leger.mjs            tous
//   node scripts/ville-leger.mjs <id>       un seul
// SOURCES : dossier des originaux (par défaut ../cotonou-3d/sources/tripo, gitignoré).
import fs from 'fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, weld, simplify, prune, dedup, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const SOURCES = process.env.SOURCES || '../cotonou-3d/sources/tripo', SORTIE = 'public/modeles/ville';
// [triangles, taille de l'image]
const CIBLES = {
  poubelle: [1500, 256], pousse: [3000, 512], keke: [4000, 512], 'sieges-pneus': [2500, 512],
  'pirogue-peche': [3000, 512], 'pirogue-chargee': [4000, 512],
  'maison-tole': [3500, 512], 'maison-r1': [5000, 1024], 'villa-blanche': [5000, 1024], 'batisse-stmichel': [8000, 1024],
  'pharmacie-haievive': [6000, 1024], 'eglise-akpakpa': [8000, 1024], 'passerelle-dantokpa': [5000, 1024],
};
// Bâtiments : on ne garde que le plus grand morceau d'un seul tenant. Tripo reprend ce qui est posé devant sur la photo
// (parasol, table, tôle du voisin) : détaché du bâtiment, il flottait à côté dans le jeu.
const PRINCIPAL = new Set(['maison-tole', 'maison-r1', 'villa-blanche', 'batisse-stmichel', 'pharmacie-haievive', 'eglise-akpakpa']);
const seulPrincipal = () => doc => {
  for (const prim of doc.getRoot().listMeshes().flatMap(m => m.listPrimitives())) {
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(); if (!idx) continue;
    const n = pos.getCount(), v = [0, 0, 0], canon = new Map(), id = new Uint32Array(n), par = new Uint32Array(n).map((_, i) => i);
    for (let i = 0; i < n; i++) { pos.getElement(i, v); const k = v.map(c => Math.round(c * 1e4)).join(); if (!canon.has(k)) canon.set(k, i); id[i] = canon.get(k); }
    const f = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
    const I = idx.getArray(), T = I.length / 3, taille = new Map();
    for (let t = 0; t < T; t++) { const A = f(id[I[3 * t]]); par[f(id[I[3 * t + 1]])] = A; par[f(id[I[3 * t + 2]])] = A; }
    for (let t = 0; t < T; t++) { const r = f(id[I[3 * t]]); taille.set(r, (taille.get(r) || 0) + 1); }
    const garde = [...taille].sort((a, b) => b[1] - a[1])[0][0], J = [];
    for (let t = 0; t < T; t++) if (f(id[I[3 * t]]) === garde) J.push(I[3 * t], I[3 * t + 1], I[3 * t + 2]);
    console.log(`  morceau principal : ${J.length / 3} triangles sur ${T} (${taille.size} morceaux)`);
    idx.setArray(new I.constructor(J));
  }
};
// Coupes : boîtes [x0, x1, y0, y1, z0, z1] en fractions de la boîte du modèle ; les triangles dont le centre y tombe
// sont retirés. Passerelle : le grand panneau de bois de la photo pendait du tablier jusqu'à la chaussée (les voitures
// passaient au travers) ; relevé sur une vue de côté quadrillée (05/11).
const COUPES = { 'passerelle-dantokpa': [[0, 1, 0, .47, .51, .65]] };
const couper = boites => doc => {
  const prims = [];
  for (const node of doc.getRoot().listNodes()) { const mesh = node.getMesh(); if (mesh) for (const p of mesh.listPrimitives()) if (p.getIndices()) prims.push([p, node.getWorldMatrix()]); }
  const monde = (M, v) => [0, 1, 2].map(k => M[k] * v[0] + M[4 + k] * v[1] + M[8 + k] * v[2] + M[12 + k]);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], v = [0, 0, 0];
  for (const [p, M] of prims) { const a = p.getAttribute('POSITION'); for (const i of p.getIndices().getArray()) { const w = monde(M, a.getElement(i, v)); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], w[k]); mx[k] = Math.max(mx[k], w[k]); } } }
  for (const [p, M] of prims) {
    const a = p.getAttribute('POSITION'), I = p.getIndices().getArray(), J = [];
    for (let t = 0; t < I.length; t += 3) {
      const c = [0, 0, 0]; for (let s = 0; s < 3; s++) { const w = monde(M, a.getElement(I[t + s], v)); for (let k = 0; k < 3; k++) c[k] += w[k] / 3; }
      const n = c.map((x, k) => (x - mn[k]) / (mx[k] - mn[k]));
      if (!boites.some(b => n[0] >= b[0] && n[0] <= b[1] && n[1] >= b[2] && n[1] <= b[3] && n[2] >= b[4] && n[2] <= b[5])) J.push(I[t], I[t + 1], I[t + 2]);
    }
    console.log(`  coupes : ${(I.length - J.length) / 3} triangles retirés`);
    p.getIndices().setArray(new I.constructor(J));
  }
};
await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const tri = doc => doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
fs.mkdirSync(SORTIE, { recursive: true });
const idx = `${SORTIE}/index.json`, liste = fs.existsSync(idx) ? JSON.parse(fs.readFileSync(idx, 'utf8')) : {};
for (const id of process.argv[2] ? [process.argv[2]] : Object.keys(CIBLES)) {
  const [cible, px] = CIBLES[id];
  const doc = await io.read(`${SOURCES}/${id}.glb`), avant = tri(doc);
  for (const m of doc.getRoot().listMaterials()) { m.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null).setMetallicFactor(0).setRoughnessFactor(.9); }
  await doc.transform(
    dequantize(), dedup(), weld(),
    ...(PRINCIPAL.has(id) ? [seulPrincipal()] : []),
    ...(COUPES[id] ? [couper(COUPES[id])] : []),
    simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, cible / avant), error: 0.05 }),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [px, px], quality: 78 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const out = `${SORTIE}/${id}.glb`; await io.write(out, doc);
  liste[id] = { triangles: Math.round(tri(doc)), octets: fs.statSync(out).size };
  console.log(`${id} : ${Math.round(avant)} → ${liste[id].triangles} triangles, ${(liste[id].octets / 1024).toFixed(0)} Ko`);
}
fs.writeFileSync(idx, JSON.stringify(liste, null, 1));
