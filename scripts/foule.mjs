// La foule en vrais personnages (marché de Dantokpa, plage, esplanade de l'Amazone, Corniche) : « enlève ces humains
// 3D et mets de vraies personnes » (Murielle, 05/11, à propos des silhouettes en cylindre de lieux.js).
// Les personnages animés du jeu (Tripo, public/modeles/personnages) sont figés dans trois poses debout (repos à deux
// moments, discute), allégés à quelques centaines de triangles et rangés dans un seul fichier, avec une seule image pour
// tous : public/modeles/ville/foule.glb (≈ 200 Ko). Le jeu les instancie près de la caméra (foule-reelle.js).
//   npm run dev -- --port 5195     (le serveur de développement sert la page de cuisson)
//   node scripts/foule.mjs [port]
// Playwright : celui de 3D-MONDE par défaut (PLAYWRIGHT=chemin/vers/playwright/index.mjs).
import fs from 'fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const PORT = process.argv[2] || '5195', SORTIE = 'public/modeles/ville';
// Pas le policier ni le zém (des rôles), ni les tenues de la boutique (personnages.js) : les gens du quartier.
const IDS = ['vendeuse', 'maman', 'etudiante', 'jeune', 'bureau', 'ancien', 'eleve-fille', 'eleve-garcon'];
// [animation, moment dans le clip]. Les normales sont calculées dans le jeu (normals() de gltf-transform défait les sommets partagés).
// « telephone » (make_a_call) est un appel passé assis, et « rire » se plie en deux : en pleine foule, ils flottaient.
const POSES = [['idle', .3], ['parle', .45], ['idle', .8]];
// Tailles en mètres (milieu des fourchettes de personnages.js) ; le jeu les varie encore de ± 5 %.
const TAILLES = { vendeuse: 1.64, maman: 1.6, etudiante: 1.66, jeune: 1.76, bureau: 1.76, ancien: 1.68, 'eleve-fille': 1.3, 'eleve-garcon': 1.32 };
const TRIANGLES = 700, CASE = 256, COLS = 4;

const { chromium } = await import(process.env.PLAYWRIGHT || '/Users/muriellekpinso/Projects/3D-MONDE/node_modules/playwright/index.mjs');
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await b.newPage();
page.on('console', m => { if (m.type() !== 'debug') console.log('  page :', m.text()); });
page.on('pageerror', e => console.log('  ERREUR', e.message));
await page.goto(`http://localhost:${PORT}/scripts/foule/cuire.html#${encodeURIComponent(JSON.stringify({ ids: IDS, poses: POSES, tailles: TAILLES }))}`);
await page.waitForFunction(() => window.__foule, null, { timeout: 300000 });
const F = await page.evaluate(() => window.__foule);
await b.close();
console.log(`${F.variantes.length} poses figées, ${Object.keys(F.textures).length} images`);

// Une seule image : les textures des personnages côte à côte, CASE px chacune.
const ids = IDS.filter(id => F.textures[id]), rows = Math.ceil(ids.length / COLS);
const atlas = await sharp({ create: { width: COLS * CASE, height: rows * CASE, channels: 3, background: '#000' } })
  .composite(await Promise.all(ids.map(async (id, i) => ({ input: await sharp(Buffer.from(F.textures[id].split(',')[1], 'base64')).resize(CASE, CASE).toBuffer(), left: (i % COLS) * CASE, top: Math.floor(i / COLS) * CASE }))))
  .png().toBuffer();

const doc = new Document(), buf = doc.createBuffer(), scene = doc.createScene('foule');
const tex = doc.createTexture('foule').setImage(atlas).setMimeType('image/png');
const mat = doc.createMaterial('foule').setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(.9);
for (const V of F.variantes) {
  const k = ids.indexOf(V.id); if (k < 0) continue;
  const c = k % COLS, r = Math.floor(k / COLS), uv = new Float32Array(V.uv.length);
  for (let i = 0; i < uv.length; i += 2) { uv[i] = (c + Math.min(.999, Math.max(.001, V.uv[i]))) / COLS; uv[i + 1] = (r + Math.min(.999, Math.max(.001, V.uv[i + 1]))) / rows; }
  const prim = doc.createPrimitive().setMaterial(mat)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(V.pos)).setBuffer(buf))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(V.idx)).setBuffer(buf));
  scene.addChild(doc.createNode(`${V.id}:${V.pose}`).setMesh(doc.createMesh(`${V.id}:${V.pose}`).addPrimitive(prim)));
}
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const avant = F.variantes[0].idx.length / 3;
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: TRIANGLES / avant, error: .02 }),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const out = `${SORTIE}/foule.glb`; await io.write(out, doc);
const tris = doc.getRoot().listMeshes().map(m => m.listPrimitives()[0].getIndices().getCount() / 3);
const idx = `${SORTIE}/index.json`, liste = JSON.parse(fs.readFileSync(idx, 'utf8'));
liste.foule = { triangles: Math.round(tris.reduce((a, b) => a + b, 0)), octets: fs.statSync(out).size, variantes: tris.length };
fs.writeFileSync(idx, JSON.stringify(liste, null, 1));
console.log(`foule : ${tris.length} variantes de ${Math.min(...tris)} à ${Math.max(...tris)} triangles (au lieu de ${avant}), ${(liste.foule.octets / 1024).toFixed(0)} Ko`);
