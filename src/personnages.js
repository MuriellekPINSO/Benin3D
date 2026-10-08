import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as clonerSquelette } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { LITE, hash } from './base.js';
import { camera } from './scene.js';

// ---------- Personnages béninois réalistes et animés ----------
// scripts/personnages.mjs fabrique public/modeles/personnages/<id>.glb avec Tripo : un modèle
// texturé (vendeuse en pagne wax, jeune en maillot, ancien en boubou, policier…), un squelette
// humain et ses animations (idle, marche, salut, parle, telephone, assis, rire). Ici, chaque
// personnage du jeu est une copie qui partage maillage et textures, avec son propre squelette et
// son AnimationMixer. Tant que les modèles ne sont pas chargés (ou s'ils manquent), le jeu garde
// ses personnages dessinés en code (personne() de discussions.js).

const P = { modeles: {}, pret: false, actifs: new Set(), accessoires: {} };
// Rôles : on ne tire pas au hasard le policier ni le zém, ils servent quand on les demande.
const ROLES = new Set(['policier', 'zem']);
const TAILLE = { femme: [1.6, 1.7], homme: [1.68, 1.82], ancien: [1.64, 1.72], maman: [1.56, 1.64] };
const v = new THREE.Vector3(), v2 = new THREE.Vector3();

/** Charge les personnages (en tâche de fond : le jeu marche sans eux). */
export async function chargerPersonnages() {
  let idx = {};
  try { const r = await fetch(import.meta.env.BASE_URL + 'modeles/personnages/index.json'); if (r.ok && /json/.test(r.headers.get('content-type') || '')) idx = await r.json(); } catch { }
  const chargeur = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(Object.entries(idx).map(async ([id, info]) => {
    try {
      const g = await chargeur.loadAsync(`${import.meta.env.BASE_URL}modeles/personnages/${id}.glb?v=${info.octets}`);
      P.modeles[id] = preparer(id, g, info);
    } catch (e) { console.warn('personnage', id, e.message); }
  }));
  P.pret = Object.keys(P.modeles).length > 0;
  if (P.pret) console.info(`personnages : ${Object.keys(P.modeles).join(', ')}`);
  chargerAccessoires(chargeur);
  return P.pret;
}

// Accessoires (modèles Tripo sans squelette) : bassines de fruits portées sur la tête…
async function chargerAccessoires(chargeur) {
  let liste = {};
  try { const r = await fetch(import.meta.env.BASE_URL + 'modeles/personnages/accessoires/index.json'); if (r.ok && /json/.test(r.headers.get('content-type') || '')) liste = await r.json(); } catch { }
  await Promise.all(Object.entries(liste).map(async ([id, info]) => {
    try {
      const s = (await chargeur.loadAsync(`${import.meta.env.BASE_URL}modeles/personnages/accessoires/${id}.glb?v=${info.octets}`)).scene;
      const b = new THREE.Box3().setFromObject(s), t = b.getSize(new THREE.Vector3()), ech = (info.largeur || .55) / Math.max(t.x, t.z);
      s.scale.setScalar(ech); s.position.set(-(b.min.x + b.max.x) / 2 * ech, -b.min.y * ech, -(b.min.z + b.max.z) / 2 * ech);
      s.traverse(o => { if (o.isMesh) o.castShadow = !LITE; });
      const g = new THREE.Group(); g.add(s); P.accessoires[id] = g;
    } catch (e) { console.warn('accessoire', id, e.message); }
  }));
}
/** Une copie de l'accessoire `prefixe` (ex. « bassine »), variante `k`, ou null s'il n'est pas chargé. */
export function accessoire(prefixe, k = 0) {
  const ids = Object.keys(P.accessoires).filter(id => id.startsWith(prefixe)); if (!ids.length) return null;
  return P.accessoires[ids[k % ids.length]].clone();
}
export const personnagesPrets = () => P.pret;

// Mesures faites une fois par modèle : hauteur en position d'attente, sens du regard (des pieds
// vers les orteils), hauteur du bassin assis.
function preparer(id, g, info) {
  const scene = g.scene, clips = Object.fromEntries(g.animations.map(c => [c.name, c]));
  scene.traverse(o => { if (o.isMesh) { o.castShadow = !LITE; o.receiveShadow = false; o.frustumCulled = false; } });
  const os = nom => scene.getObjectByName(nom);
  const mixer = new THREE.AnimationMixer(scene), poser = (clip, t) => { mixer.stopAllAction(); const a = mixer.clipAction(clip); a.play(); a.time = t; mixer.update(0); scene.updateMatrixWorld(true); };
  // Debout : hauteur (sommet de la tête) et sol.
  if (clips.idle) poser(clips.idle, 0);
  const boite = new THREE.Box3();
  scene.traverse(o => { if (o.isSkinnedMesh) { o.computeBoundingBox(); boite.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  const hauteur = boite.max.y - boite.min.y, sol = boite.min.y;
  // Du haut de l'os de la tête au sommet du crâne (foulard, casquette compris) : là où se posent bassine et casque.
  const crane = os('Head') ? boite.max.y - os('Head').getWorldPosition(v).y : hauteur * .14;
  // Sens du regard : du talon vers les orteils, sur les deux pieds.
  const avant = new THREE.Vector3();
  for (const c of ['L', 'R']) { const pied = os(`${c}_Foot`), orteil = os(`${c}_ToeBase`); if (pied && orteil) avant.add(orteil.getWorldPosition(v).sub(pied.getWorldPosition(v2))); }
  const rot = avant.lengthSq() > 1e-8 ? -Math.atan2(avant.x, avant.z) : 0;
  // Assis : l'instant où le bassin est le plus bas, et sa hauteur à ce moment.
  let assis = null;
  if (clips.assis && os('Pelvis')) {
    let tMin = 0, yMin = Infinity;
    for (let k = 0; k <= 40; k++) { const t = clips.assis.duration * k / 40; poser(clips.assis, t); const y = os('Pelvis').getWorldPosition(v).y; if (y < yMin - 1e-4) { yMin = y; tMin = t; } }
    poser(clips.assis, tMin); const b = os('Pelvis').getWorldPosition(new THREE.Vector3());
    assis = { t: tMin, bassin: b };
  }
  mixer.stopAllAction(); mixer.uncacheRoot(scene);
  return { id, scene, clips, hauteur, sol, rot, assis, crane, femme: !!info.femme };
}

function choisirId(i, femme, role) {
  if (role) { if (P.modeles[role]) return role; if (ROLES.has(role)) return null; } // pas de faux policier : on garde celui dessiné en code
  const ids = Object.keys(P.modeles).filter(k => !ROLES.has(k) && (femme === null || femme === undefined || P.modeles[k].femme === femme));
  return ids.length ? ids[Math.floor(hash(i, 91) * ids.length)] : null;
}

/**
 * Un personnage animé (face à +z, pieds au sol) ou null si les modèles ne sont pas là.
 * Même contrat que personne() : userData.tete (bulles), userData.anim(t, parle, signe), userData.liberer().
 * En plus : userData.main (objets remis de main en main), userData.coiffer(objet) (casque sur la tête),
 * userData.jouer(nom) (idle, marche, salut, parle, telephone, assis, rire).
 */
export function personnage3d(i, { assise = false, femme = null, role = null } = {}) {
  if (!P.pret) return null;
  const id = choisirId(i, femme, role); if (!id) return null;
  const M = P.modeles[id], corps = clonerSquelette(M.scene);
  const gamme = TAILLE[id] || TAILLE[M.femme ? 'femme' : 'homme'], taille = gamme[0] + hash(i, 92) * (gamme[1] - gamme[0]);
  const ech = taille / M.hauteur;
  corps.scale.setScalar(ech); corps.rotation.y = M.rot;
  const g = new THREE.Group(); g.add(corps);
  if (assise && M.assis) { // le bassin à l'origine, comme les personnages assis dessinés en code
    const b = M.assis.bassin.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), M.rot).multiplyScalar(ech);
    corps.position.set(-b.x, -b.y, -b.z);
  } else corps.position.y = -M.sol * ech;
  const mixer = new THREE.AnimationMixer(corps), actions = {};
  for (const [nom, clip] of Object.entries(M.clips)) actions[nom] = mixer.clipAction(clip);
  const os = nom => corps.getObjectByName(nom);
  const E = { g, mixer, actions, courante: null, tete: new THREE.Object3D(), main: new THREE.Object3D(), osTete: os('Head'), osMain: os('R_Hand'), crane: M.crane * ech, orphelin: 0, ph: hash(i, 93) * 10 };
  g.add(E.tete); E.main.position.set(0, 1.1, .25); g.add(E.main);
  E.tete.position.set(0, taille + .08, 0);
  const jouer = (nom, fondu = .35) => {
    if (!actions[nom]) nom = 'idle'; if (E.courante === nom || !actions[nom]) return;
    const a = actions[nom]; a.reset(); a.enabled = true; a.setEffectiveWeight(1);
    if (nom === 'assis') { a.time = M.assis?.t ?? a.getClip().duration; a.paused = true; } // on garde la pose assise
    a.play();
    const prec = E.courante && actions[E.courante]; if (prec && fondu > 0) a.crossFadeFrom(prec, fondu, false); else if (prec) prec.stop();
    E.courante = nom;
  };
  // Chacun ne fait pas la même chose au même moment : début décalé, et certains téléphonent en attendant.
  const repos = !assise && hash(i, 94) < .22 && actions.telephone ? 'telephone' : 'idle';
  jouer(assise ? 'assis' : repos, 0);
  mixer.update(assise ? 0 : E.ph); suivre(E);
  P.actifs.add(E);
  g.userData = {
    tete: E.tete, main: E.main, femme: M.femme, graine: i, modele: id, haut: 1.15, jouer,
    anim: (t, parle, signe) => {
      if (assise) return;
      if (signe) jouer('salut');
      else if (parle) jouer(Math.sin(t * .37 + E.ph) > .75 && actions.rire ? 'rire' : 'parle');
      else if (E.courante !== 'marche') jouer(repos);
    },
    coiffer: objet => { E.tete.add(objet); objet.position.set(0, -.15, -.01); objet.scale.setScalar(1.08); },
    liberer: () => { P.actifs.delete(E); mixer.stopAllAction(); mixer.uncacheRoot(corps); },
  };
  return g;
}

// La tête et la main suivent les os (pour les bulles, le casque, les objets échangés).
function suivre(E) {
  if (E.osTete) { E.osTete.getWorldPosition(v); E.g.updateMatrixWorld(); E.g.worldToLocal(v); E.tete.position.set(v.x, v.y + E.crane + .03, v.z); } // juste au-dessus du crâne
  if (E.osMain) { E.osMain.getWorldPosition(v); E.g.worldToLocal(v); E.main.position.copy(v); }
}
function dansScene(o) { while (o.parent) o = o.parent; return o.isScene; }

/** À chaque image : anime les personnages présents et assez proches de la caméra. */
export function majPersonnages(dt) {
  if (!P.actifs.size) return;
  for (const E of P.actifs) {
    if (!dansScene(E.g)) { if (++E.orphelin > 600) P.actifs.delete(E); continue; } // retiré sans liberer() : on l'oublie au bout d'un moment
    E.orphelin = 0;
    let vis = E.g.visible; for (let o = E.g.parent; vis && o; o = o.parent) vis = o.visible;
    if (!vis) continue;
    E.g.getWorldPosition(v); if (v.distanceToSquared(camera.position) > 160 * 160) continue;
    E.mixer.update(dt); suivre(E);
  }
}
