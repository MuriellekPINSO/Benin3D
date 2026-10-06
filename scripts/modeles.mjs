// Versions allégées des zémidjans de « 3D monde » pour la circulation de la carte.
// moto-taxi.glb (≈ 59 000 triangles) et zem.glb (≈ 155 000) restent intacts pour
// le joueur et les obstacles du jeu ; les copies « -lod » servent aux dizaines de
// motos qui roulent près de la caméra. À lancer depuis la racine : npm run modeles
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, weld, simplify, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const triangles = doc => doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
for (const [nom, ratio] of [['moto-taxi', 0.12], ['zem', 0.05]]) {
  const doc = await io.read(`sources/${nom}.glb`);
  const avant = triangles(doc);
  await doc.transform(dequantize(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004 }), prune());
  for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'EXT_meshopt_compression' || ext.extensionName === 'KHR_mesh_quantization') ext.dispose();
  await io.write(`public/modeles/${nom}-lod.glb`, doc);
  console.log(`${nom}-lod.glb : ${Math.round(avant)} → ${Math.round(triangles(doc))} triangles`);
}
