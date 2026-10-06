// Masques des cérémonies vodun (Arène de Ouidah) et objets d'art des étals d'artisans.
// Les modèles d'origine (générés avec Tripo, ~2 millions de triangles et trois
// textures 4K chacun, 60 à 72 Mo) sont dans sources/masques/ et sources/art/ ; ce script
// en tire des versions légères pour le navigateur. À lancer depuis la racine :
// npm run masques            (tous)       npm run masques -- statue   (un seul)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, weld, simplify, prune, dedup, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'fs';

await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const triangles = doc => doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
// [dossier, fichier, triangles visés] : masques de l'arène, puis objets d'art des étals d'artisans.
const LISTE = [['masques', 'zangbeto', 60000], ['masques', 'egungun-traditionnel', 60000], ['masques', 'egungun-groupe', 90000],
  ['art', 'tete-sculptee', 30000], ['art', 'portrait-cubiste', 30000], ['art', 'sphere-rouge', 20000], ['art', 'statue', 30000], ['art', 'creature-paille', 40000]];
const seuls = process.argv.slice(2);
for (const [dossier, nom, cible] of LISTE) {
  if (seuls.length && !seuls.includes(nom)) continue;
  const doc = await io.read(`sources/${dossier}/${nom}.glb`);
  const avant = triangles(doc);
  await doc.transform(
    dequantize(), dedup(), weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: cible / avant, error: 0.01 }),
    prune(),
    // Couleur en 1024 px, relief (normal map) et rugosité en 512 px, en JPEG.
    textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024], slots: /baseColor/ }),
    textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [512, 512], slots: /normal|metallicRoughness/ }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const out = `public/modeles/${nom}.glb`;
  await io.write(out, doc);
  console.log(`${nom}.glb : ${Math.round(avant)} → ${Math.round(triangles(doc))} triangles, ${(statSync(out).size / 1e6).toFixed(2)} Mo`);
}
