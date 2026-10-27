// Les véhicules de la circulation, en 3D et légers : copies allégées des modèles qu'on a déjà, pour les dupliquer par
// dizaines (« duplique juste les simples modèles de voiture et moto qu'on a, mais en 3D, en réduisant un peu la qualité »,
// Murielle, 27/10). La voiture rouge du joueur (repeinte en plusieurs couleurs au chargement, vehicules.js), le taxi
// jaune et vert, et la moto-taxi avec son conducteur — en deux finesses : de près, et de loin (les centaines de zéms
// de la ville). Une seule texture couleur, sans relief ni reflets. À lancer depuis la racine : npm run trafic
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, meshopt, weld, simplify, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const triangles = doc => doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
mkdirSync('public/modeles/trafic', { recursive: true });
// [sortie, source, triangles visés, côté de la texture, écart toléré (part de la taille du modèle), « sloppy » permis]
const MODELES = [
  ['voiture', 'public/modeles/batiments/voiture-perso.glb', 2500, 512, .02, false],
  ['taxi', 'public/modeles/batiments/voiture.glb', 2500, 512, .02, false],
  ['moto', 'public/modeles/moto-taxi-lod.glb', 3000, 512, .05, false],
  ['moto-loin', 'public/modeles/moto-taxi-lod.glb', 700, 256, .15, true],
];
for (const [nom, source, vise, cote, ecart, sloppy] of MODELES) {
  const doc = await io.read(source), avant = triangles(doc);
  // Seulement la couleur : le relief (normal map) et les reflets ne se voient pas sur un véhicule qui passe.
  for (const m of doc.getRoot().listMaterials()) { m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setEmissiveTexture(null); }
  await doc.transform(dequantize(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, vise / avant), error: ecart }), prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [cote, cote], quality: 82 }));
  // La moto ne descend pas sous ~5 800 triangles : les coutures de sa texture (des centaines d'îlots) bloquent la
  // simplification. De loin seulement, le mode « sloppy » de meshoptimizer, qui les ignore : il brouille la texture
  // (des zigzags, vus de près), mais à 300 m une moto n'est qu'un point.
  if (sloppy && triangles(doc) > vise * 1.5) for (const p of doc.getRoot().listMeshes().flatMap(m => m.listPrimitives())) {
    const ix = Uint32Array.from(p.getIndices().getArray()), pos = Float32Array.from(p.getAttribute('POSITION').getArray());
    const cible = Math.floor(vise * (ix.length / 3) / triangles(doc)) * 3; // sa part des triangles visés, en indices
    const [nouveaux] = MeshoptSimplifier.simplifySloppy(ix, pos, 3, null, cible, ecart);
    p.getIndices().setArray(Uint32Array.from(nouveaux));
  }
  await doc.transform(meshopt({ encoder: MeshoptEncoder }));
  await io.write(`public/modeles/trafic/${nom}.glb`, doc);
  console.log(`trafic/${nom}.glb : ${Math.round(avant)} → ${Math.round(triangles(doc))} triangles, texture ${cote} px`);
}
