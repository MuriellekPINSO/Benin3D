// La foule en vrais personnages (marché de Dantokpa, plage, esplanade de l'Amazone, Corniche, concert) : « enlève ces
// humains 3D et mets de vraies personnes » (Murielle, 05/11, à propos des silhouettes en cylindre de lieux.js), puis
// « règle ça pour qu'on ne voie plus ces choses » (la foule du concert, 05/11).
// Les personnages animés du jeu (Tripo, public/modeles/personnages) sont figés dans quelques poses, allégés et rangés
// avec une seule image pour tous, en deux finesses : « haut » (700 triangles, de près) et « bas » (~160, de loin).
//   public/modeles/ville/foule.glb    debout (repos à deux moments, discute), pour les foules de la ville
//   public/modeles/ville/concert.glb  bras levés et danses, pour le concert de l'Amazone (téléchargé en entrant)
//   public/modeles/ville/gradins.glb  assis, pour le public de l'arène des Egungun à Ouidah
// Le jeu les instancie (foule-reelle.js).
//   npm run dev -- --port 5195     (le serveur de développement sert la page de cuisson)
//   node scripts/foule.mjs [port]
// Playwright : celui de 3D-MONDE par défaut (PLAYWRIGHT=chemin/vers/playwright/index.mjs).
import fs from 'fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplifyPrimitive, compactPrimitive, prune, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const PORT = process.argv[2] || '5195', SORTIE = 'public/modeles/ville';
// Pas le policier ni le zém (des rôles), ni les tenues de la boutique (personnages.js) : les gens du quartier.
const IDS = ['vendeuse', 'maman', 'etudiante', 'jeune', 'bureau', 'ancien', 'eleve-fille', 'eleve-garcon'];
// [animation, moment dans le clip]. Les normales sont calculées dans le jeu (normals() de gltf-transform défait les sommets partagés).
// « telephone » (make_a_call) est un appel passé assis, et « rire » se plie en deux : en pleine foule, ils flottaient.
const FICHIERS = {
  foule: { poses: [['idle', .3], ['parle', .45], ['idle', .8]] },
  concert: { poses: [['acclame', .25], ['acclame', .6], ['danse1', .3], ['danse2', .55]], danses: true },
  // Assis (le public des gradins de l'arène de Ouidah) : « telephone » est justement un appel passé assis.
  gradins: { poses: [['assis', .5], ['assis', .85], ['telephone', .35], ['telephone', .7]] },
};
// Tailles en mètres (milieu des fourchettes de personnages.js) ; le jeu les varie encore de ± 5 %.
const TAILLES = { vendeuse: 1.64, maman: 1.6, etudiante: 1.66, jeune: 1.76, bureau: 1.76, ancien: 1.68, 'eleve-fille': 1.3, 'eleve-garcon': 1.32 };
// [triangles, erreur permise] par finesse. Le simplificateur s'arrête vers 300 triangles (les coutures de la texture) ;
// « sans soin » (simplifySloppy, sansSoin = true) descend à 100, mais déchire l'image et coupe les jambes (essayé le 05/11).
const FINESSES = { haut: [700, .02], bas: [160, .25] }, CASE = 256, COLS = 4;

await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const { chromium } = await import(process.env.PLAYWRIGHT || '/Users/muriellekpinso/Projects/3D-MONDE/node_modules/playwright/index.mjs');
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const idx = `${SORTIE}/index.json`, liste = JSON.parse(fs.readFileSync(idx, 'utf8'));
for (const [nom, { poses, danses = false }] of Object.entries(FICHIERS)) {
  const page = await b.newPage();
  page.on('console', m => { if (m.type() !== 'debug') console.log('  page :', m.text()); });
  page.on('pageerror', e => console.log('  ERREUR', e.message));
  await page.goto(`http://localhost:${PORT}/scripts/foule/cuire.html#${encodeURIComponent(JSON.stringify({ ids: IDS, poses, tailles: TAILLES, danses }))}`);
  await page.waitForFunction(() => window.__foule, null, { timeout: 300000 });
  const F = await page.evaluate(() => window.__foule);
  await page.close();
  console.log(`${nom} : ${F.variantes.length} poses figées, ${Object.keys(F.textures).length} images`);

  // Une seule image : les textures des personnages côte à côte, CASE px chacune.
  const ids = IDS.filter(id => F.textures[id]), rows = Math.ceil(ids.length / COLS);
  const atlas = await sharp({ create: { width: COLS * CASE, height: rows * CASE, channels: 3, background: '#000' } })
    .composite(await Promise.all(ids.map(async (id, i) => ({ input: await sharp(Buffer.from(F.textures[id].split(',')[1], 'base64')).resize(CASE, CASE).toBuffer(), left: (i % COLS) * CASE, top: Math.floor(i / COLS) * CASE }))))
    .png().toBuffer();

  const doc = new Document(), buf = doc.createBuffer(), scene = doc.createScene(nom);
  const tex = doc.createTexture(nom).setImage(atlas).setMimeType('image/png');
  const mat = doc.createMaterial(nom).setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(.9);
  // Noms sans « : » ni « . » (GLTFLoader les retire) : <id>-p<n°>-<finesse>.
  const parPose = new Map();
  for (const V of F.variantes) {
    const k = ids.indexOf(V.id); if (k < 0) continue;
    const n = parPose.get(V.id) || 0; parPose.set(V.id, n + 1);
    const c = k % COLS, r = Math.floor(k / COLS), uv = new Float32Array(V.uv.length);
    for (let i = 0; i < uv.length; i += 2) { uv[i] = (c + Math.min(.999, Math.max(.001, V.uv[i]))) / COLS; uv[i + 1] = (r + Math.min(.999, Math.max(.001, V.uv[i + 1]))) / rows; }
    for (const finesse of Object.keys(FINESSES)) {
      const prim = doc.createPrimitive().setMaterial(mat)
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(V.pos)).setBuffer(buf))
        .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv.slice()).setBuffer(buf))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(V.idx)).setBuffer(buf));
      const id = `${V.id}-p${n}-${finesse}`;
      scene.addChild(doc.createNode(id).setMesh(doc.createMesh(id).addPrimitive(prim)).setExtras({ finesse }));
    }
  }
  const avant = F.variantes[0].idx.length / 3;
  await doc.transform(weld());
  for (const node of scene.listChildren()) {
    const [cible, error, sansSoin] = FINESSES[node.getExtras().finesse];
    for (const p of node.getMesh().listPrimitives()) {
      if (!sansSoin) { simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: cible / (p.getIndices().getCount() / 3), error }); continue; }
      const I = p.getIndices(), [J] = MeshoptSimplifier.simplifySloppy(new Uint32Array(I.getArray()), p.getAttribute('POSITION').getArray(), 3, null, cible * 3, error);
      I.setArray(J); compactPrimitive(p);
    }
  }
  await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = `${SORTIE}/${nom}.glb`; await io.write(out, doc);
  const tris = f => scene.listChildren().filter(n => n.getExtras().finesse === f).map(n => n.getMesh().listPrimitives()[0].getIndices().getCount() / 3);
  liste[nom] = { variantes: tris('haut').length, triangles: { haut: Math.max(...tris('haut')), bas: Math.max(...tris('bas')) }, octets: fs.statSync(out).size };
  console.log(`${nom} : ${tris('haut').length} variantes, ${Math.min(...tris('haut'))}-${Math.max(...tris('haut'))} triangles de près, ${Math.min(...tris('bas'))}-${Math.max(...tris('bas'))} de loin (au lieu de ${avant}), ${(liste[nom].octets / 1024).toFixed(0)} Ko`);
}
await b.close();
fs.writeFileSync(idx, JSON.stringify(liste, null, 1));
