// Personnages béninois réalistes : générés par Tripo (API v3) à partir d'une description, puis
// dotés d'un squelette humain (auto-rig) et d'animations (marcher, attendre, saluer, discuter,
// téléphoner, s'asseoir…), et enfin allégés pour le navigateur. Chaque étape est mémorisée dans
// sources/personnages/<id>.json : une coupure réseau ne fait pas repayer les étapes déjà faites.
//   npm run personnages -- liste                 les personnages prévus et leur état
//   npm run personnages -- <id> [<id>…]          fabrique ces personnages (ou reprend où ils en sont)
//   npm run personnages -- tout                  fabrique tous ceux qui manquent
//   npm run personnages -- alleger <id>          refait seulement la version légère
// La clé est lue dans .env.local (TRIPO_API_KEY), jamais affichée.
import fs from 'fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cloneDocument, dedup, prune, textureCompress, meshopt, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const BASE = 'https://openapi.tripo3d.ai/v3', MODELE = 'v3.1-20260211', RIG = 'v1.0-20240301';
const SOURCES = 'sources/personnages', SORTIE = 'public/modeles/personnages';
const POSE = 'full body, standing straight in A-pose with arms held slightly away from the body, feet apart, facing forward, empty hands, realistic human proportions, photorealistic game character in the style of GTA V, highly detailed face and fabric';
const NEG = 'holding objects, bag, backpack, umbrella, base, pedestal, ground plane, multiple people, cartoon, chibi, big head, toy, arms touching the body, cape';
// Tenues de la boutique de mode (test) : une même personne par silhouette, seule la tenue change.
const FEMME = 'A stylish young Beninese woman from Cotonou in her mid-twenties, dark brown skin, oval face, slim build';
const HOMME = 'A stylish young Beninese man from Cotonou in his late twenties, dark skin, short black hair with a neat fade, trimmed beard, athletic build';
const SANS_LOGO = 'plain fabric with no logo, no brand, no text';
// Animations prêtes de Tripo (squelette biped v1.0) gardées pour le jeu, et leur nom dans le site.
const ANIMS = { idle: 'preset:biped:idle', marche: 'preset:biped:walk', salut: 'preset:biped:greet_01', parle: 'preset:biped:agree', telephone: 'preset:biped:make_a_call_01', assis: 'preset:biped:sit', rire: 'preset:biped:laugh_01' , danse1: 'preset:biped:dance_01', danse2: 'preset:biped:dance_02', acclame: 'preset:biped:cheer' };

// Animations du concert, rangées à part (voir alleger).
const DANSES = ['danse1', 'danse2', 'acclame'];
// Les tenues de la boutique n'ont besoin que de quelques animations (cabine, défilé, concert).
const ANIMS_MODE = ['idle', 'marche', 'salut', 'danse1', 'danse2', 'acclame'];
const animsDe = id => PERSONNAGES[id]?.mode ? ANIMS_MODE : Object.keys(ANIMS);
const sortieDe = id => PERSONNAGES[id]?.mode ? 'public/modeles/mode' : SORTIE;
export const PERSONNAGES = {
  vendeuse: { femme: true, prompt: `A Beninese market woman from Cotonou in her forties, dark brown skin, wearing a long fitted dress in a vivid orange, blue and yellow African wax print (pagne), a matching tied headwrap (foulard), simple flip-flop sandals, ${POSE}` },
  jeune: { femme: false, prompt: `A young Beninese man from Cotonou, about twenty years old, dark skin, short black hair with a fade, wearing a green and yellow football jersey, light blue jeans and white sneakers, slim build, ${POSE}` },
  ancien: { femme: false, prompt: `An elderly Beninese man, about seventy years old, dark skin, short grey beard, wearing a long traditional boubou tunic and trousers in a brown and gold African wax print with embroidery at the neck, a matching kufi cap, leather sandals, ${POSE}` },
  etudiante: { femme: true, prompt: `A young Beninese woman student, about twenty, dark skin, long box braids tied back, wearing a fitted top in a red and black African wax print, dark jeans and white sneakers, ${POSE}` },
  bureau: { femme: false, prompt: `A Beninese office worker man in his thirties, dark skin, short hair, wearing a short-sleeved shirt in a blue and white African wax print tucked into dark grey trousers, black leather shoes, wristwatch, ${POSE}` },
  maman: { femme: true, prompt: `A plump Beninese grandmother in her sixties, dark skin, wearing a loose two-piece outfit (blouse and wrapper skirt) in a green and purple African wax print, a matching headscarf, plastic sandals, ${POSE}` },
  policier: { femme: false, prompt: `A police officer of the Republic of Benin, dark skin, wearing a light blue short-sleeved uniform shirt with epaulettes and badge, dark navy blue trousers, black belt, black boots and a navy blue peaked cap, ${POSE}` },
  'eleve-garcon': { femme: false, enfant: true, prompt: `A Beninese schoolboy about nine years old, dark skin, short black hair, wearing the khaki school uniform of Benin: short-sleeved khaki shirt with pockets and khaki shorts, black plastic sandals, child proportions, ${POSE}` },
  'eleve-fille': { femme: true, enfant: true, prompt: `A Beninese schoolgirl about nine years old, dark skin, hair in short neat braids, wearing the khaki school uniform of Benin: short-sleeved khaki dress with a belt, white socks and black shoes, child proportions, ${POSE}` },
  // Boutique de mode (scripts : `mode: true` → public/modeles/mode/, chargés seulement dans la cabine d'essayage).
  'robe-wax': { femme: true, mode: true, prompt: `${FEMME}, wearing a long fitted mermaid-cut dress in a vivid royal blue, orange and yellow African wax print with large circles, short puffed sleeves, a matching tied headwrap, gold earrings, flat golden sandals, ${SANS_LOGO}, ${POSE}` },
  kaba: { femme: true, mode: true, prompt: `${FEMME}, wearing a traditional Beninese two-piece outfit: a fitted blouse with flared sleeves and a long wrapper skirt in a matching purple, green and gold African wax print, a tall tied headwrap of the same fabric, beaded necklace, leather sandals, ${SANS_LOGO}, ${POSE}` },
  'urbaine-f': { femme: true, mode: true, prompt: `${FEMME}, natural black hair in a short rounded afro, wearing a modern Cotonou street outfit: a short cropped jacket in a bold red, black and white African wax print over a plain white t-shirt, high-waisted light blue jeans, clean white sneakers, ${SANS_LOGO}, ${POSE}` },
  'chemise-wax': { femme: false, mode: true, prompt: `${HOMME}, wearing a fitted short-sleeved shirt in a green, orange and white African wax print, beige chino trousers, brown leather loafers, a wristwatch, ${SANS_LOGO}, ${POSE}` },
  bomba: { femme: false, mode: true, prompt: `${HOMME}, wearing a knee-length West African embroidered tunic (bomba) with matching straight trousers in shiny ivory white bazin fabric, gold embroidery around the neck and down the chest, a matching ivory kufi cap, brown leather slippers, ${SANS_LOGO}, ${POSE}` },
  'sport-h': { femme: false, mode: true, prompt: `${HOMME}, wearing a sporty outfit: a fitted black track jacket with yellow and green stripes on the sleeves, black jogging pants, white and black running sneakers, ${SANS_LOGO}, ${POSE}` },
  zem: { femme: false, prompt: `A Beninese zemidjan motorcycle taxi driver from Cotonou, dark skin, wearing a bright yellow short-sleeved work shirt with a black registration number printed on the back and chest, dark trousers, plastic sandals, ${POSE}` },
};

const cle = (() => {
  const l = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8').split('\n').find(x => x.startsWith('TRIPO_API_KEY=')) : null;
  return l ? l.slice('TRIPO_API_KEY='.length).trim() : process.env.TRIPO_API_KEY;
})();
async function fetchR(url, opts, essais = 6) {
  for (let k = 0; ; k++) {
    try { return await fetch(url, opts); }
    catch (e) { if (k >= essais - 1) throw new Error(`${e.message} (${e.cause?.code || 'réseau'}) : ${url.slice(0, 60)}`); await new Promise(r => setTimeout(r, 3000 * (k + 1))); }
  }
}
const api = async (methode, chemin, corps) => {
  if (!cle) throw new Error('TRIPO_API_KEY manquante dans .env.local');
  const r = await fetchR(BASE + chemin, { method: methode, headers: { Authorization: `Bearer ${cle}`, ...(corps ? { 'Content-Type': 'application/json' } : {}) }, body: corps ? JSON.stringify(corps) : undefined });
  const j = await r.json().catch(() => ({ code: r.status, message: r.statusText }));
  if (j.code !== 0) throw new Error(`Tripo ${chemin} : ${j.code} ${j.message || ''} ${j.suggestion || ''}`.trim());
  return j.data;
};
const solde = async () => { const d = await api('GET', '/account/balance'); return `${d.balance} crédits disponibles`; };

async function attendre(id, etape, task_id) {
  let t, dernier = '';
  for (;;) {
    t = await api('GET', `/tasks/${task_id}`);
    const s = `${id} · ${etape} : ${t.status} ${t.progress ?? 0} %`; if (s !== dernier) { dernier = s; console.log(s); }
    if (t.status === 'success') return t;
    if (['failed', 'cancelled', 'banned', 'expired', 'unknown'].includes(t.status)) throw new Error(`${id} · ${etape} : tâche ${t.status}`);
    await new Promise(r => setTimeout(r, 5000));
  }
}
const telecharger = async (url, f) => { if (!url) return; const r = await fetchR(url); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); };

async function fabriquer(id) {
  const P = PERSONNAGES[id]; if (!P) throw new Error(`personnage inconnu : ${id}`);
  fs.mkdirSync(SOURCES, { recursive: true });
  const fe = `${SOURCES}/${id}.json`, E = fs.existsSync(fe) ? JSON.parse(fs.readFileSync(fe, 'utf8')) : { id, credits: 0 };
  const noter = (k, t) => { E[k] = t.task_id; E.credits += t.credits_consumed || 0; fs.writeFileSync(fe, JSON.stringify(E, null, 2)); };
  // 1. Le modèle texturé
  if (!E.modele && !E.modele_en_cours) {
    const { task_id } = await api('POST', '/generation/text-to-model', { prompt: P.prompt, negative_prompt: NEG, model: MODELE, face_limit: 14000, texture: true, pbr: true, texture_quality: 'detailed', texture_version: 'v3.5-20260815', delight: true });
    E.modele_en_cours = task_id; fs.writeFileSync(fe, JSON.stringify(E, null, 2));
  }
  if (!E.modele) { const t = await attendre(id, 'modèle', E.modele_en_cours); noter('modele', t); await telecharger(t.output.rendered_image_url, `${SOURCES}/${id}-apercu.webp`); await telecharger(t.output.model_url || t.output.pbr_model_url, `${SOURCES}/${id}-statique.glb`); }
  // 2. Le squelette
  if (!E.rig) {
    if (!E.rig_en_cours) {
      const chk = await api('POST', '/animations/rig-check', { input: E.modele }); const c = await attendre(id, 'vérification', chk.task_id);
      if (c.output && c.output.riggable === false) throw new Error(`${id} : Tripo juge le modèle impossible à animer (${c.output.rig_type})`);
      const { task_id } = await api('POST', '/animations/rig', { input: E.modele, model: RIG, rig_type: 'biped', spec: 'tripo', out_format: 'glb' });
      E.rig_en_cours = task_id; fs.writeFileSync(fe, JSON.stringify(E, null, 2));
    }
    noter('rig', await attendre(id, 'squelette', E.rig_en_cours));
  }
  // 3. Les animations, sur place (le jeu déplace lui-même le personnage). Une demande par animation
  // (en lot, le .glb n'en garde qu'une) ; seule la première emporte le maillage, les autres ne
  // contiennent que le mouvement des os, fusionné ensuite dans un seul fichier par alleger().
  E.anims ||= {};
  for (const [k, nom] of animsDe(id).entries()) {
    const f = `${SOURCES}/${id}-${nom}.glb`; if (fs.existsSync(f)) continue;
    const avecMaillage = k === 0 || !animsDe(id).some(n => fs.existsSync(`${SOURCES}/${id}-${n}.glb`));
    if (!E.anims[nom]) {
      const { task_id } = await api('POST', '/animations/retarget', { input: E.rig, animation: ANIMS[nom], out_format: 'glb', bake_animation: true, export_with_geometry: avecMaillage, animate_in_place: true });
      E.anims[nom] = task_id; fs.writeFileSync(fe, JSON.stringify(E, null, 2));
    }
    const t = await attendre(id, `animation ${nom}`, E.anims[nom]);
    E.credits += t.credits_consumed || 0; fs.writeFileSync(fe, JSON.stringify(E, null, 2));
    await telecharger(t.output.model_url, f);
  }
  console.log(`${id} : ${E.credits} crédits`);
  await alleger(id);
}

// Version légère pour le site : textures 1024 px en webp, animations rééchantillonnées, maillage compressé.
async function alleger(id) {
  await MeshoptDecoder.ready; await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  // Le fichier qui porte le maillage sert de base ; les clips des autres le rejoignent (mêmes os).
  const fichiers = animsDe(id).map(nom => [nom, `${SOURCES}/${id}-${nom}.glb`]).filter(([, f]) => fs.existsSync(f));
  const lus = await Promise.all(fichiers.map(async ([nom, f]) => [nom, await io.read(f)]));
  const base = lus.find(([, d]) => d.getRoot().listMeshes().length); if (!base) throw new Error(`${id} : aucun fichier avec le maillage`);
  const doc = base[1], root = doc.getRoot(), buf = root.listBuffers()[0];
  root.listAnimations().forEach(a => a.setName(base[0]));
  const noeuds = new Map(root.listNodes().map(n => [n.getName(), n]));
  for (const [nom, autre] of lus) {
    if (autre === doc) continue;
    for (const a of autre.getRoot().listAnimations()) {
      const na = doc.createAnimation(nom);
      for (const ch of a.listChannels()) {
        const cible = noeuds.get(ch.getTargetNode()?.getName()); if (!cible) continue;
        const s0 = ch.getSampler(), copie = acc => doc.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice()).setBuffer(buf);
        const sp = doc.createAnimationSampler().setInput(copie(s0.getInput())).setOutput(copie(s0.getOutput())).setInterpolation(s0.getInterpolation());
        na.addSampler(sp).addChannel(doc.createAnimationChannel().setTargetNode(cible).setTargetPath(ch.getTargetPath()).setSampler(sp));
      }
    }
  }
  // Les danses du concert vont dans un petit fichier à part (<id>-danses.glb : les os et leurs mouvements,
  // sans maillage ni texture), téléchargé seulement quand on entre au concert.
  // (les tenues de la boutique gardent tout dans un seul fichier : elles ne se chargent qu'à la demande)
  const danses = cloneDocument(doc), estDanse = n => !PERSONNAGES[id]?.mode && DANSES.includes(n);
  // (on supprime aussi les morceaux internes : sinon leurs données restent dans le fichier)
  const jeter = a => { for (const c of a.listChannels()) c.dispose(); for (const sp of a.listSamplers()) sp.dispose(); a.dispose(); };
  for (const a of danses.getRoot().listAnimations()) if (!estDanse(a.getName())) jeter(a);
  for (const n of danses.getRoot().listNodes()) { n.setMesh(null); n.setSkin(null); }
  for (const m of danses.getRoot().listMeshes()) { for (const p of m.listPrimitives()) p.dispose(); m.dispose(); }
  for (const sk of danses.getRoot().listSkins()) sk.dispose();
  for (const a of root.listAnimations()) if (estDanse(a.getName())) jeter(a);
  await danses.transform(resample(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(
    dedup(), resample(), prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], slots: /baseColor/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], slots: /normal|metallicRoughness|occlusion/ }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const dossier = sortieDe(id); fs.mkdirSync(dossier, { recursive: true });
  const out = `${dossier}/${id}.glb`; await io.write(out, doc);
  const outD = `${dossier}/${id}-danses.glb`; if (danses.getRoot().listAnimations().length) await io.write(outD, danses);
  const tri = root.listMeshes().flatMap(m => m.listPrimitives()).reduce((s, p) => s + (p.getIndices()?.getCount() ?? 0) / 3, 0);
  const anims = root.listAnimations().map(a => a.getName());
  console.log(`${id}.glb : ${Math.round(tri)} triangles, danses ${fs.existsSync(outD) ? (fs.statSync(outD).size / 1e3).toFixed(0) + ' ko' : '—'}, ${root.listSkins().length} squelette(s), animations [${anims.join(', ')}], ${(fs.statSync(out).size / 1e6).toFixed(2)} Mo`);
  const idx = `${dossier}/index.json`, liste = fs.existsSync(idx) ? JSON.parse(fs.readFileSync(idx, 'utf8')) : {};
  liste[id] = { femme: PERSONNAGES[id]?.femme ?? false, enfant: !!PERSONNAGES[id]?.enfant, animations: anims, triangles: Math.round(tri), octets: fs.statSync(out).size, danses: fs.existsSync(outD) ? fs.statSync(outD).size : 0 };
  fs.writeFileSync(idx, JSON.stringify(liste, null, 1));
}

const args = process.argv.slice(2);
try {
  if (args[0] === 'liste') for (const id of Object.keys(PERSONNAGES)) { const f = `${SOURCES}/${id}.json`; console.log(id.padEnd(10), fs.existsSync(`${sortieDe(id)}/${id}.glb`) ? 'prêt' : fs.existsSync(f) ? 'commencé' : '—'); }
  else if (args[0] === 'alleger') await alleger(args[1]);
  else if (args.length) {
    const ids = args[0] === 'tout' ? Object.keys(PERSONNAGES).filter(id => !fs.existsSync(`${sortieDe(id)}/${id}.glb`)) : args;
    console.log(await solde());
    // Les personnages se fabriquent en parallèle (les étapes de chacun restent dans l'ordre).
    const res = await Promise.allSettled(ids.map(fabriquer));
    res.forEach((r, i) => { if (r.status === 'rejected') { console.error(`${ids[i]} : ${r.reason.message}`); process.exitCode = 1; } });
    console.log(await solde());
  } else console.log('Usage : npm run personnages -- liste | tout | <id> [<id>…] | alleger <id>');
} catch (e) { console.error(e.message); process.exitCode = 1; }
