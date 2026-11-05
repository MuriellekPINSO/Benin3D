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
