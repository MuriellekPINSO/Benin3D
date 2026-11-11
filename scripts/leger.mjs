// Versions « téléphone » des modèles Tripo : public/modeles/batiments/<id>.glb → public/modeles/batiments/leger/<id>.glb.
// Sur téléphone (LITE), chaque image 2048 × 2048 prend ~21 Mo une fois décodée, et onze monuments suffisaient à faire
// fermer la page par le navigateur. Ici : couleurs en 1024, relief et rugosité en 256, monuments ramenés à ~30 000 triangles
// (vus de loin) ; les véhicules du joueur, vus de près, gardent leurs triangles.
//   npm run leger            tous les modèles
//   npm run leger -- <id>    un seul (après « npm run tripo -- alleger <id> »)
import fs from 'fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, weld, simplify, prune, dedup, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const SOURCE = 'public/modeles/batiments', SORTIE = `${SOURCE}/leger`;
// Triangles visés sur téléphone : monuments vus de loin ; voiture et tokpa de la circulation (trois à l'écran en course,
// 59 000 triangles chacun avant) ; la moto et la voiture du joueur, vues de près, gardent les leurs.
// Les voitures du joueur faites d'après photo : 50 000 (P2) à 100 000 triangles sur ordinateur (« plus net », 11/11),
// 40 000 à 45 000 ici, et leur relief en 512 (le jeu leur garde aussi leur couleur en 1024 : textures.js, dePres).
const CIBLES = { voiture: 12000, tokpa: 10000, 'roadster-rouge': 45000, 'landcruiser-p2': 40000, vitz: 45000, 'jetour-net': 45000 }, DE_PRES = new Set(['voiture-perso', 'moto-perso']);
const RELIEF = { 'roadster-rouge': 512, 'landcruiser-p2': 512, vitz: 512, 'jetour-net': 512 };
const CIBLE = 30000;

await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const tri = doc => doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);

const info = JSON.parse(fs.readFileSync(`${SOURCE}/index.json`, 'utf8'));
const ids = process.argv[2] ? [process.argv[2]] : Object.keys(info);
fs.mkdirSync(SORTIE, { recursive: true });
const idx = `${SORTIE}/index.json`, liste = fs.existsSync(idx) ? JSON.parse(fs.readFileSync(idx, 'utf8')) : {};
for (const id of ids) {
  const doc = await io.read(`${SOURCE}/${id}.glb`), avant = tri(doc);
  await doc.transform(
    dequantize(), dedup(), weld(),
    ...(DE_PRES.has(id) || avant <= (CIBLES[id] || CIBLE) ? [] : [simplify({ simplifier: MeshoptSimplifier, ratio: (CIBLES[id] || CIBLE) / avant, error: 0.01 })]),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024], slots: /baseColor/ }),
    textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [RELIEF[id] || 256, RELIEF[id] || 256], slots: /normal/ }),
    textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [256, 256], slots: /metallicRoughness|occlusion/ }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const out = `${SORTIE}/${id}.glb`; await io.write(out, doc);
  liste[id] = { triangles: Math.round(tri(doc)), octets: fs.statSync(out).size };
  console.log(`${id} : ${Math.round(avant)} → ${liste[id].triangles} triangles, ${(fs.statSync(`${SOURCE}/${id}.glb`).size / 1e6).toFixed(2)} → ${(liste[id].octets / 1e6).toFixed(2)} Mo`);
}
fs.writeFileSync(idx, JSON.stringify(liste, null, 1));
