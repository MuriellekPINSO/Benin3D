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
import { dedup, prune, textureCompress, meshopt, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const BASE = 'https://openapi.tripo3d.ai/v3', MODELE = 'v3.1-20260211', RIG = 'v1.0-20240301';
const SOURCES = 'sources/personnages', SORTIE = 'public/modeles/personnages';
const POSE = 'full body, standing straight in A-pose with arms held slightly away from the body, feet apart, facing forward, empty hands, realistic human proportions, photorealistic game character in the style of GTA V, highly detailed face and fabric';
const NEG = 'holding objects, bag, backpack, umbrella, base, pedestal, ground plane, multiple people, cartoon, chibi, big head, toy, arms touching the body, cape';
// Animations prêtes de Tripo (squelette biped v1.0) gardées pour le jeu, et leur nom dans le site.
const ANIMS = { idle: 'preset:biped:idle', marche: 'preset:biped:walk', salut: 'preset:biped:greet_01', parle: 'preset:biped:agree', telephone: 'preset:biped:make_a_call_01', assis: 'preset:biped:sit', rire: 'preset:biped:laugh_01' };

export const PERSONNAGES = {
  vendeuse: { femme: true, prompt: `A Beninese market woman from Cotonou in her forties, dark brown skin, wearing a long fitted dress in a vivid orange, blue and yellow African wax print (pagne), a matching tied headwrap (foulard), simple flip-flop sandals, ${POSE}` },
  jeune: { femme: false, prompt: `A young Beninese man from Cotonou, about twenty years old, dark skin, short black hair with a fade, wearing a green and yellow football jersey, light blue jeans and white sneakers, slim build, ${POSE}` },
  ancien: { femme: false, prompt: `An elderly Beninese man, about seventy years old, dark skin, short grey beard, wearing a long traditional boubou tunic and trousers in a brown and gold African wax print with embroidery at the neck, a matching kufi cap, leather sandals, ${POSE}` },
  etudiante: { femme: true, prompt: `A young Beninese woman student, about twenty, dark skin, long box braids tied back, wearing a fitted top in a red and black African wax print, dark jeans and white sneakers, ${POSE}` },
  bureau: { femme: false, prompt: `A Beninese office worker man in his thirties, dark skin, short hair, wearing a short-sleeved shirt in a blue and white African wax print tucked into dark grey trousers, black leather shoes, wristwatch, ${POSE}` },
  maman: { femme: true, prompt: `A plump Beninese grandmother in her sixties, dark skin, wearing a loose two-piece outfit (blouse and wrapper skirt) in a green and purple African wax print, a matching headscarf, plastic sandals, ${POSE}` },
  policier: { femme: false, prompt: `A police officer of the Republic of Benin, dark skin, wearing a light blue short-sleeved uniform shirt with epaulettes and badge, dark navy blue trousers, black belt, black boots and a navy blue peaked cap, ${POSE}` },
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
  for (const [k, nom] of Object.keys(ANIMS).entries()) {
    const f = `${SOURCES}/${id}-${nom}.glb`; if (fs.existsSync(f)) continue;
    const avecMaillage = k === 0 || !Object.keys(ANIMS).some(n => fs.existsSync(`${SOURCES}/${id}-${n}.glb`));
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
  const fichiers = Object.keys(ANIMS).map(nom => [nom, `${SOURCES}/${id}-${nom}.glb`]).filter(([, f]) => fs.existsSync(f));
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
  await doc.transform(
    dedup(), resample(), prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], slots: /baseColor/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], slots: /normal|metallicRoughness|occlusion/ }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  fs.mkdirSync(SORTIE, { recursive: true });
  const out = `${SORTIE}/${id}.glb`; await io.write(out, doc);
  const tri = root.listMeshes().flatMap(m => m.listPrimitives()).reduce((s, p) => s + (p.getIndices()?.getCount() ?? 0) / 3, 0);
  const anims = root.listAnimations().map(a => a.getName());
  console.log(`${id}.glb : ${Math.round(tri)} triangles, ${root.listSkins().length} squelette(s), animations [${anims.join(', ')}], ${(fs.statSync(out).size / 1e6).toFixed(2)} Mo`);
  const idx = `${SORTIE}/index.json`, liste = fs.existsSync(idx) ? JSON.parse(fs.readFileSync(idx, 'utf8')) : {};
  liste[id] = { femme: PERSONNAGES[id]?.femme ?? false, animations: anims, triangles: Math.round(tri), octets: fs.statSync(out).size };
  fs.writeFileSync(idx, JSON.stringify(liste, null, 1));
}

const args = process.argv.slice(2);
try {
  if (args[0] === 'liste') for (const id of Object.keys(PERSONNAGES)) { const f = `${SOURCES}/${id}.json`; console.log(id.padEnd(10), fs.existsSync(`${SORTIE}/${id}.glb`) ? 'prêt' : fs.existsSync(f) ? 'commencé' : '—'); }
  else if (args[0] === 'alleger') await alleger(args[1]);
  else if (args.length) {
    const ids = args[0] === 'tout' ? Object.keys(PERSONNAGES).filter(id => !fs.existsSync(`${SORTIE}/${id}.glb`)) : args;
    console.log(await solde());
    // Les personnages se fabriquent en parallèle (les étapes de chacun restent dans l'ordre).
    const res = await Promise.allSettled(ids.map(fabriquer));
    res.forEach((r, i) => { if (r.status === 'rejected') { console.error(`${ids[i]} : ${r.reason.message}`); process.exitCode = 1; } });
    console.log(await solde());
  } else console.log('Usage : npm run personnages -- liste | tout | <id> [<id>…] | alleger <id>');
} catch (e) { console.error(e.message); process.exitCode = 1; }
