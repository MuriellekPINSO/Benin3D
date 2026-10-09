// Bâtiments reconnaissables : modèles 3D générés par Tripo (API v3) à partir d'une photo,
// puis allégés pour le navigateur. La clé est lue dans .env.local (TRIPO_API_KEY, jamais
// affichée ni envoyée au site). À lancer depuis la racine :
//   npm run tripo -- solde                       crédits disponibles
//   npm run tripo -- <id> <photo> [triangles]    génère sources/tripo/<id>.glb puis public/modeles/batiments/<id>.glb
//   npm run tripo -- alleger <id> [triangles]    refait seulement la version légère
//   npm run tripo -- reprendre <id> <task_id> [triangles]   récupère une tâche déjà lancée (coupure réseau…)
//   npm run tripo -- texte <id> "<description>" [triangles]  modèle à partir d'un texte (sans photo)
// Docs : https://developers.tripo3d.ai/fr/docs/quick-start
import fs from 'fs';
import path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, weld, simplify, prune, dedup, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const BASE = 'https://openapi.tripo3d.ai/v3', MODELE = 'v3.1-20260211';
// TRIPO_SORTIE : autre dossier de sortie (ex. public/modeles/mode/objets pour les chaussures de la boutique).
const SOURCES = 'sources/tripo', SORTIE = process.env.TRIPO_SORTIE || 'public/modeles/batiments';
const cle = (() => {
  const l = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8').split('\n').find(x => x.startsWith('TRIPO_API_KEY=')) : null;
  return l ? l.slice('TRIPO_API_KEY='.length).trim() : process.env.TRIPO_API_KEY;
})();
// Le réseau coupe parfois (gros fichiers) : on réessaie quelques fois avant d'abandonner.
async function fetchR(url, opts, essais = 5) {
  for (let k = 0; ; k++) {
    try { return await fetch(url, opts); }
    catch (e) { if (k >= essais - 1) throw new Error(`${e.message} (${e.cause?.code || e.cause?.message || 'réseau'}) : ${url.slice(0, 60)}`); await new Promise(r => setTimeout(r, 2000 * (k + 1))); }
  }
}
const api = async (methode, chemin, corps) => {
  if (!cle) throw new Error('TRIPO_API_KEY manquante dans .env.local');
  const r = await fetchR(BASE + chemin, { method: methode, headers: { Authorization: `Bearer ${cle}`, ...(corps && !(corps instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: corps instanceof FormData ? corps : corps ? JSON.stringify(corps) : undefined });
  const j = await r.json().catch(() => ({ code: r.status, message: r.statusText }));
  if (j.code !== 0) throw new Error(`Tripo ${chemin} : ${j.code} ${j.message || ''} ${j.suggestion || ''}`.trim());
  return j.data;
};
const solde = async () => { const d = await api('GET', '/account/balance'); return `${d.balance} crédits disponibles (${d.frozen} réservés)`; };

async function genererTexte(id, prompt) {
  fs.mkdirSync(SOURCES, { recursive: true });
  const { task_id } = await api('POST', '/generation/text-to-model', { prompt, model: MODELE, texture: true, pbr: true, texture_quality: 'detailed' });
  console.log(`${id} : tâche ${task_id}`);
  return attendre(id, prompt, task_id);
}
async function generer(id, photo, reprise = null) {
  fs.mkdirSync(SOURCES, { recursive: true });
  if (reprise) return attendre(id, photo, reprise);
  const ext = path.extname(photo).slice(1).toLowerCase().replace('jpg', 'jpeg');
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(photo)], { type: `image/${ext}` }), path.basename(photo));
  const { file_token } = await api('POST', '/files', fd);
  const { task_id } = await api('POST', '/generation/image-to-model', { input: file_token, model: MODELE, texture: true, pbr: true, texture_quality: 'detailed', texture_version: 'v3.5-20260815', delight: true, enable_image_autofix: true });
  console.log(`${id} : tâche ${task_id}`);
  return attendre(id, photo, task_id);
}
async function attendre(id, photo, task_id) {
  let t, dernier = -1;
  for (;;) {
    t = await api('GET', `/tasks/${task_id}`);
    if (t.progress !== dernier) { dernier = t.progress; process.stdout.write(`\r${id} : ${t.status} ${t.progress ?? 0} %   `); }
    if (t.status === 'success') break;
    if (['failed', 'cancelled', 'banned', 'expired', 'unknown'].includes(t.status)) throw new Error(`\n${id} : tâche ${t.status}`);
    await new Promise(r => setTimeout(r, 3000));
  }
  console.log('');
  const telecharger = async (url, f) => { if (!url) return; const r = await fetchR(url); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); };
  await telecharger(t.output.model_url, `${SOURCES}/${id}.glb`);
  await telecharger(t.output.rendered_image_url, `${SOURCES}/${id}-apercu.png`);
  fs.writeFileSync(`${SOURCES}/${id}.json`, JSON.stringify({ id, photo, task_id, modele: MODELE, credits: t.credits_consumed, date: t.completed_at }, null, 2));
  console.log(`${id} : ${(fs.statSync(`${SOURCES}/${id}.glb`).size / 1e6).toFixed(1)} Mo, ${t.credits_consumed ?? '?'} crédits`);
}

// Retouches de couleur par modèle (photo de nuit, dominante…) : scripts/tripo-reglages.json { id: { saturation, luminosite, teinte } }.
const REGLAGES = fs.existsSync('scripts/tripo-reglages.json') ? JSON.parse(fs.readFileSync('scripts/tripo-reglages.json', 'utf8')) : {};
async function retoucher(doc, r) {
  if (!r) return;
  for (const mat of doc.getRoot().listMaterials()) {
    const t = mat.getBaseColorTexture(); if (!t) continue;
    let img = sharp(t.getImage()).modulate({ saturation: r.saturation ?? 1, brightness: r.luminosite ?? 1, hue: r.teinte ?? 0 });
    if (r.gris) img = img.tint(r.gris);
    t.setImage(await img.png().toBuffer()).setMimeType('image/png');
  }
}
async function alleger(id, cible = 60000) {
  await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const tri = doc => doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
  const doc = await io.read(`${SOURCES}/${id}.glb`), avant = tri(doc);
  await retoucher(doc, REGLAGES[id]);
  await doc.transform(
    dequantize(), dedup(), weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, cible / avant), error: 0.01 }),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [2048, 2048], slots: /baseColor/ }),
    textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [512, 512], slots: /normal|metallicRoughness/ }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  fs.mkdirSync(SORTIE, { recursive: true });
  const out = `${SORTIE}/${id}.glb`; await io.write(out, doc);
  console.log(`${id}.glb : ${Math.round(avant)} → ${Math.round(tri(doc))} triangles, ${(fs.statSync(out).size / 1e6).toFixed(2)} Mo`);
  // Liste des modèles disponibles, lue par le site (src/batiments-tripo.js).
  const idx = `${SORTIE}/index.json`, liste = fs.existsSync(idx) ? JSON.parse(fs.readFileSync(idx, 'utf8')) : {};
  liste[id] = { triangles: Math.round(tri(doc)), octets: fs.statSync(out).size };
  fs.writeFileSync(idx, JSON.stringify(liste, null, 1));
}

const [a, b, c] = process.argv.slice(2);
try {
  if (a === 'solde') console.log(await solde());
  else if (a === 'alleger') await alleger(b, +c || undefined);
  else if (a === 'texte') { const [id, prompt, tri] = process.argv.slice(3); console.log(await solde()); await genererTexte(id, prompt); await alleger(id, +tri || undefined); console.log(await solde()); }
  else if (a === 'reprendre') { await generer(b, '', c); await alleger(b, +process.argv[5] || undefined); console.log(await solde()); }
  else if (a && b) { console.log(await solde()); await generer(a, b); await alleger(a, +c || undefined); console.log(await solde()); }
  else console.log('Usage : npm run tripo -- solde | <id> <photo> [triangles] | alleger <id> [triangles]');
} catch (e) { console.error(e.message); process.exitCode = 1; }
