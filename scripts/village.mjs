// Le Village de l'innovation (18-20 novembre 2026, esplanade du Palais des Congrès) : la maquette 3D que Murielle a faite
// pour son site de visite (sources/village/maquette-village.glb, tirée de la page CloudGrid) devient le Village du jeu.
// npm run village
//
// On garde le Village (parvis, portique, accueil, halles, étals, arbre à palabre, jardins, voiles, clôture, mobilier) et
// on retire ce que le jeu a déjà : le socle paysager, le palais et ses trois tours, les arbres du parking. Les visiteurs
// immobiles de la maquette partent aussi : dans le jeu, ce sont les joueurs qui remplissent le Village.
//
// Sortent :
//  - public/modeles/village/village.glb : un seul repère, celui de la maquette (x vers l'est du plan, z vers l'entrée ;
//    le palais est vers −z). village.js le tourne d'un demi-tour et le pose devant le vrai palais.
//  - public/modeles/village/collisions.json : les boîtes qu'on ne traverse pas, calculées dans la géométrie (tout ce
//    qui occupe la tranche de 0,3 à 1,9 m de haut : poteaux des halles, étals, tables, chaises, bancs, agaves, massifs,
//    clôture, voiles, totems, bornes…). Les halles restent ouvertes : on entre dessous entre leurs poteaux.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, meshopt, prune, simplifyPrimitive, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync, statSync, writeFileSync } from 'fs';

await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read('sources/village/maquette-village.glb');
const racine = doc.getRoot(), scene = racine.listScenes()[0];

// ---------- Ce qu'on retire ----------
const DANS_LE_VILLAGE = (x, z) => Math.abs(x) <= 37 && z >= -60 && z <= 20;
const retirer = n => {
  const nom = n.getName() || '', [x, , z] = n.getTranslation();
  if (/^(Socle paysager|Palais|Tour à oculus|Visiteur)/.test(nom)) return true;
  // Les arbres : ceux du parking, et les huit du Village (des grappes de boules, 3 464 triangles chacun, que le simplificateur
  // ne sait pas réduire). village.js plante les arbres du jeu aux places de ces huit-là (ARBRES dans collisions.json).
  if (/^Arbre feuillu/.test(nom)) { if (DANS_LE_VILLAGE(x, z)) ARBRES.push([+x.toFixed(2), +z.toFixed(2)]); return true; }
  return false;
};
const ARBRES = [];
let retires = 0;
for (const n of scene.listChildren()) if (retirer(n)) { n.dispose(); retires++; }

// ---------- Les collisions : une grille de 20 cm sur la tranche où l'on marche ----------
const PAS = .2, X0 = -40, X1 = 40, Z0 = -68, Z1 = 32, NX = Math.round((X1 - X0) / PAS), NZ = Math.round((Z1 - Z0) / PAS);
const BAS = .3, HAUT = 1.9;
const plein = new Uint8Array(NX * NZ);
const SOLS = /^(Parvis|Médaillon|Jardin circulaire)/; // à plat : on marche dessus
const marquer = (x, z) => { const i = Math.floor((x - X0) / PAS), k = Math.floor((z - Z0) / PAS); if (i >= 0 && i < NX && k >= 0 && k < NZ) plein[k * NX + i] = 1; };
const appliquer = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
let triangles = 0;
for (const n of scene.listChildren()) {
  const mesh = n.getMesh(); if (!mesh || SOLS.test(n.getName() || '')) continue;
  const m = n.getWorldMatrix();
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), idx = p.getIndices(), nb = idx ? idx.getCount() : pos.getCount();
    const sommet = k => { const v = pos.getElement(idx ? idx.getScalar(k) : k, []); return appliquer(m, v[0], v[1], v[2]); };
    for (let t = 0; t < nb; t += 3) {
      const A = sommet(t), B = sommet(t + 1), C = sommet(t + 2); triangles++;
      if (Math.max(A[1], B[1], C[1]) < BAS || Math.min(A[1], B[1], C[1]) > HAUT) continue;
      // Points semés sur le triangle, tous les 8 cm au plus : seuls ceux de la tranche comptent.
      const l = Math.max(Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]), Math.hypot(C[0] - A[0], C[1] - A[1], C[2] - A[2]), Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]));
      const k = Math.max(1, Math.ceil(l / .08));
      for (let a = 0; a <= k; a++) for (let b = 0; a + b <= k; b++) {
        const u = a / k, v = b / k, w = 1 - u - v;
        const y = A[1] * w + B[1] * u + C[1] * v; if (y < BAS || y > HAUT) continue;
        marquer(A[0] * w + B[0] * u + C[0] * v, A[2] * w + B[2] * u + C[2] * v);
      }
    }
  }
}
// Cases pleines → rectangles : les plus longues bandes en x, prolongées vers +z tant qu'elles se répètent à l'identique.
const pris = new Uint8Array(NX * NZ), boites = [];
for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
  if (!plein[k * NX + i] || pris[k * NX + i]) continue;
  let i2 = i; while (i2 + 1 < NX && plein[k * NX + i2 + 1] && !pris[k * NX + i2 + 1]) i2++;
  let k2 = k;
  const ligneLibre = kk => { for (let ii = i; ii <= i2; ii++) if (!plein[kk * NX + ii] || pris[kk * NX + ii]) return false; return true; };
  while (k2 + 1 < NZ && ligneLibre(k2 + 1)) k2++;
  for (let kk = k; kk <= k2; kk++) for (let ii = i; ii <= i2; ii++) pris[kk * NX + ii] = 1;
  const x0 = X0 + i * PAS, x1 = X0 + (i2 + 1) * PAS, z0 = Z0 + k * PAS, z1 = Z0 + (k2 + 1) * PAS;
  boites.push([+((x0 + x1) / 2).toFixed(2), +((z0 + z1) / 2).toFixed(2), +(x1 - x0).toFixed(2), +(z1 - z0).toFixed(2)]);
}

// ---------- La végétation, allégée ----------
// Une fois les objets répétés recopiés à leur place (flatten), la maquette faisait 141 000 triangles, dont les deux tiers
// pour huit arbres, douze palmiers, vingt-quatre massifs et quarante-deux agaves : trop pour un téléphone. On les
// simplifie, eux seulement (les arbres, eux, sont retirés plus haut) ; halles, étals, enseignes et mobilier restent tels quels.
// [nom, part des triangles gardée, écart toléré (part de la taille de l'objet)].
const ALLEGER = [[/^Palmier/, .28, .04], [/^Massif bas/, .35, .02], [/^Agave/, .5, .05], [/^Jardin circulaire/, .5, .02], [/^Marchandises/, .5, .02], [/^Lampadaire/, .5, .02]];
await doc.transform(weld());
const faits = new Set();
for (const n of scene.listChildren()) {
  const mesh = n.getMesh(), r = ALLEGER.find(([re]) => re.test(n.getName() || ''))?.[1];
  if (!mesh || !r || faits.has(mesh)) continue; faits.add(mesh);
  // Des facettes : chaque triangle a ses sommets à lui (sa normale), le simplificateur n'a rien à fusionner. Sans normales, les
  // sommets se rejoignent ; three redessine alors ces plantes en facettes (flatShading), comme dans la maquette.
  for (const p of mesh.listPrimitives()) { p.setAttribute('NORMAL', null); p.setAttribute('TEXCOORD_0', null); }
}
await doc.transform(weld());
for (const mesh of faits) {
  const r = ALLEGER.find(([re]) => re.test(mesh.getName() || ''))?.[1] ?? .5;
  const avant = mesh.listPrimitives().reduce((s, p) => s + p.getIndices().getCount() / 3, 0);
  for (const p of mesh.listPrimitives()) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: r, error: .02 });
  if (process.env.DETAIL) console.log(mesh.getName(), avant, '→', mesh.listPrimitives().reduce((s, p) => s + p.getIndices().getCount() / 3, 0));
}

// ---------- Le sol : ses propres matières ----------
// Le parvis, le médaillon et les jardins sont à plat, à 4 cm au-dessus du sol de la ville : village.js les décale en
// profondeur pour qu'ils ne clignotent pas avec lui. Leurs matières sont dédoublées (« … · sol ») pour que la fusion
// ci-dessous ne les mélange pas avec celles des objets debout (la même pierre sert aux socles des stands).
await doc.transform(prune(), dedup());
const copies = new Map();
for (const n of scene.listChildren()) {
  if (!SOLS.test(n.getName() || '')) continue;
  for (const p of n.getMesh()?.listPrimitives() || []) {
    const m = p.getMaterial(); if (!m || / · sol$/.test(m.getName() || '')) continue; // déjà dédoublée (un même maillage sert deux fois)
    if (!copies.has(m)) copies.set(m, m.clone().setName(`${m.getName() || 'matiere'} · sol`));
    p.setMaterial(copies.get(m));
  }
}

// ---------- Le modèle : un seul repère, fusionné par matière (peu d'appels de dessin), compressé ----------
await doc.transform(
  flatten(), join({ keepNamed: false }), weld(), prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
mkdirSync('public/modeles/village', { recursive: true });
const sortie = 'public/modeles/village/village.glb';
await io.write(sortie, doc);
writeFileSync('public/modeles/village/collisions.json', JSON.stringify({ pas: PAS, arbres: ARBRES, boites }));
const tris = racine.listMeshes().flatMap(m => m.listPrimitives()).reduce((s, p) => s + (p.getIndices()?.getCount() ?? 0) / 3, 0);
console.log(`village.glb : ${retires} éléments retirés, ${racine.listMeshes().length} maillages, ${racine.listMaterials().length} matières, ${Math.round(tris)} triangles, ${(statSync(sortie).size / 1e6).toFixed(2)} Mo`);
console.log(`collisions.json : ${boites.length} boîtes (${triangles} triangles lus)`);
