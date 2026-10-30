import * as THREE from 'three';
import { clone as clonerSquelette } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { LITE, hash } from './base.js';
import { camera } from './scene.js';
import { plusTard } from './telechargements.js';
import { chargeurGLB } from './textures.js';

// ---------- Personnages béninois réalistes et animés ----------
// scripts/personnages.mjs fabrique public/modeles/personnages/<id>.glb avec Tripo : un modèle
// texturé (vendeuse en pagne wax, jeune en maillot, ancien en boubou, policier…), un squelette
// humain et ses animations (idle, marche, salut, parle, telephone, assis, rire). Ici, chaque
// personnage du jeu est une copie qui partage maillage et textures, avec son propre squelette et
// son AnimationMixer. Tant que les modèles ne sont pas chargés (ou s'ils manquent), le jeu garde
// ses personnages dessinés en code (personne() de discussions.js).

const P = { modeles: {}, pret: false, actifs: new Set(), accessoires: {}, index: {}, danses: null };
// Rôles : on ne tire pas au hasard le policier ni le zém, ils servent quand on les demande.
const ROLES = new Set(['policier', 'zem']);
const TAILLE = { femme: [1.6, 1.7], homme: [1.68, 1.82], ancien: [1.64, 1.72], maman: [1.56, 1.64], 'eleve-garcon': [1.24, 1.38], 'eleve-fille': [1.22, 1.36] };
const v = new THREE.Vector3(), v2 = new THREE.Vector3();

/** Charge les personnages (en tâche de fond : le jeu marche sans eux). */
let PRETS = null;
export function chargerPersonnages() { return PRETS ??= chargerTous(); }
/** Promesse : true quand les personnages animés sont chargés, false s'ils ne le seront pas. */
export const personnagesCharges = () => PRETS ?? Promise.resolve(false);
async function chargerTous() {
  let idx = {};
  try { const r = await fetch(import.meta.env.BASE_URL + 'modeles/personnages/index.json'); if (r.ok && /json/.test(r.headers.get('content-type') || '')) idx = await r.json(); } catch { }
  P.index = idx;
  const chargeur = chargeurGLB();
  await Promise.all(Object.entries(idx).map(async ([id, info]) => {
    try {
      const g = await plusTard(() => chargeur.loadAsync(`${import.meta.env.BASE_URL}modeles/personnages/${id}.glb?v=${info.octets}`), true); // avant les monuments : on les voit de près
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

// Tenues de la boutique de mode (public/modeles/mode/, voir mode.js) : chargées à la demande, et jamais
// tirées au hasard pour les passants (ce sont des rôles, comme le policier).
const TENUES = {};
let INDEX_MODE = null;
const indexMode = () => (INDEX_MODE ??= fetch(`${import.meta.env.BASE_URL}modeles/mode/index.json`).then(r => r.json()).catch(() => ({})));
/** Charge la tenue `id` (modèle animé) ; renvoie true si elle est prête. */
export function chargerTenue(id, info) {
  if (P.modeles[id]) return Promise.resolve(true);
  TENUES[id] ??= (async () => {
    info ??= (await indexMode())[id] || {};
    const [g] = await Promise.all([chargeurGLB().loadAsync(`${import.meta.env.BASE_URL}modeles/mode/${id}.glb?v=${info.octets || 0}`), personnagesCharges()]);
    emprunterAnimations(g, P.modeles[info.femme ? 'etudiante' : 'jeune'] || Object.values(P.modeles).find(M => !M.mode && M.femme === !!info.femme));
    P.modeles[id] = Object.assign(preparer(id, g, info), { mode: true }); return true;
  })().catch(e => { delete TENUES[id]; console.warn('tenue', id, e.message); return false; });
  return TENUES[id];
}
// Les tenues de la boutique n'ont que six animations (repos, marche, salut, deux danses, acclamer) : sans « assis », on
// restait debout sur la selle du zém, sur les chaises, dans les gradins de l'arène. Elles ont le même squelette (41 os)
// que les personnages : on leur prête les animations qui manquent, celles d'un personnage du même genre, la position du
// bassin (seul os déplacé) remise à l'échelle de la tenue.
const PRETEES = ['assis', 'telephone', 'parle', 'rire'];
function emprunterAnimations(g, base) {
  const hip = g.scene.getObjectByName('Hip'); if (!base?.hipRepos || !hip) return;
  const a = base.hipRepos, b = hip.position.clone(), k = b.length() / (a.length() || 1), ont = new Set(g.animations.map(c => c.name));
  for (const nom of PRETEES) {
    const src = base.clips[nom]; if (!src || ont.has(nom)) continue;
    const c = src.clone();
    for (const t of c.tracks) if (t.name.endsWith('Hip.position')) { const v = t.values; for (let i = 0; i < v.length; i += 3) { v[i] = b.x + (v[i] - a.x) * k; v[i + 1] = b.y + (v[i + 1] - a.y) * k; v[i + 2] = b.z + (v[i + 2] - a.z) * k; } }
    g.animations.push(c);
  }
}
/** Les danses du concert (danse1, danse2, acclame), dans des fichiers à part : chargées à la première entrée au concert. */
export function chargerDanses() {
  if (P.danses) return P.danses;
  const chargeur = chargeurGLB();
  P.danses = Promise.all(Object.entries(P.modeles).map(async ([id, M]) => {
    const o = P.index[id]?.danses; if (!o) return;
    try { const g = await chargeur.loadAsync(`${import.meta.env.BASE_URL}modeles/personnages/${id}-danses.glb?v=${o}`); for (const c of g.animations) M.clips[c.name] = c; }
    catch (e) { console.warn('danses', id, e.message); }
  }));
  return P.danses;
}

// Les clips de Tripo déplacent parfois tout le corps malgré « sur place » : le salut fait deux pas en
// avant (≈ 2 m), la marche avance d'un mètre et demi puis revient d'un coup en boucle. Le jeu déplace
// lui-même ses personnages : on garde le bassin à sa place, seule sa hauteur bouge encore. Les danses,
// elles, gardent leur balancement.
function surPlace(clips) {
  for (const [nom, clip] of Object.entries(clips)) {
    if (/^danse|acclame/.test(nom)) continue;
    for (const t of clip.tracks) {
      if (!t.name.endsWith('Hip.position')) continue;
      const v = t.values, haut = [0, 1, 2].reduce((a, k) => Math.abs(v[k]) > Math.abs(v[a]) ? k : a, 0); // l'axe vertical : la hauteur du bassin
      for (let i = 3; i < v.length; i += 3) for (let k = 0; k < 3; k++) if (k !== haut) v[i + k] = v[k];
    }
  }
}
// « La maman est encore coincée dans la chaise » (Carlos, 26/10) : on posait le BASSIN des personnes assises à
// la hauteur de l'assise, alors que les fesses sont 14 à 21 cm plus bas (mesuré sur les dix modèles) — la chaise
// leur passait à travers les cuisses. On mesure donc, dans la pose assise, sur la peau elle-même : la profondeur des
// fesses et des pieds sous le bassin, et jusqu'où le dos recule derrière lui (pour ne pas entrer dans un dossier).
// Repère du personnage : regard vers +z, en unités du modèle (personnage3d les met à l'échelle).
function mesurerAssis(scene, b, rot, hauteur) {
  const k = hauteur / 1.7, p = new THREE.Vector3(), cos = Math.cos(rot), sin = Math.sin(rot);
  let fesses = 0, pieds = 0, dos = 0;
  scene.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i += 2) {
      o.getVertexPosition(i, p).applyMatrix4(o.matrixWorld).sub(b);
      const x = p.x * cos + p.z * sin, z = -p.x * sin + p.z * cos, y = p.y; // tourné comme corps.rotation.y = rot
      pieds = Math.max(pieds, -y);
      if (Math.abs(x) < .16 * k && z < .03 * k) fesses = Math.max(fesses, -y); // sous le bassin, pas sous les cuisses
      if (y > -.15 * k && y < .55 * k && Math.abs(x) < .22 * k) dos = Math.max(dos, -z);
    }
  });
  return { fesses, pieds, dos };
}
/**
 * Pose un personnage assis (créé avec `assise`) sur un siège dont le dessus est à `y` : les fesses sur l'assise, et,
 * s'il y a un dossier à `dossier` mètres derrière le centre du siège, assez en avant pour que le dos ne le traverse pas.
 * Les personnages dessinés en code (sans mesures) restent posés comme avant, le bassin au ras de l'assise.
 */
export function poserAssis(p, x, y, z, cap, dossier = 0) {
  const A = p.userData.assise, recul = A && dossier ? Math.max(0, A.dos + .01 - dossier) : 0;
  p.position.set(x + Math.sin(cap) * recul, A ? y + A.fesses : y - .005, z + Math.cos(cap) * recul); p.rotation.y = cap;
}

// Mesures faites une fois par modèle : hauteur en position d'attente, sens du regard (des pieds
// vers les orteils), hauteur du bassin assis.
function preparer(id, g, info) {
  const scene = g.scene, clips = Object.fromEntries(g.animations.map(c => [c.name, c])), hipRepos = scene.getObjectByName('Hip')?.position.clone() ?? null;
  surPlace(clips);
  scene.traverse(o => { if (o.isMesh) { o.castShadow = !LITE; o.receiveShadow = false; o.frustumCulled = false; } });
  const os = nom => scene.getObjectByName(nom);
  const mixer = new THREE.AnimationMixer(scene), poser = (clip, t) => { mixer.stopAllAction(); const a = mixer.clipAction(clip); a.play(); a.time = t; mixer.update(0); scene.updateMatrixWorld(true); };
  // Debout : hauteur (sommet de la tête) et sol.
  if (clips.idle) poser(clips.idle, 0);
  // Écartés du dessin hors de l'écran, comme le reste : sans ça (frustumCulled false), chaque passant, marchande ou client
  // de la ville était dessiné même dans le dos de la caméra, 13 800 triangles chacun (566 000 en course sur téléphone).
  // La sphère, prise debout, est élargie de 80 % pour couvrir les gestes et la marche.
  scene.traverse(o => { if (o.isSkinnedMesh) { o.computeBoundingSphere(); o.boundingSphere.radius *= 1.8; o.frustumCulled = true; } });
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
    assis = { t: tMin, bassin: b, ...mesurerAssis(scene, b, rot, hauteur) };
  }
  mixer.stopAllAction(); mixer.uncacheRoot(scene);
  return { id, scene, clips, hauteur, sol, rot, assis, crane, hipRepos, femme: !!info.femme, enfant: !!info.enfant };
}

function choisirId(i, femme, role, enfant = false) {
  if (role) { if (P.modeles[role]) return role; if (ROLES.has(role)) return null; } // pas de faux policier : on garde celui dessiné en code
  // Les écoliers ne sortent que si on les demande (passants, concert) : jamais comme clients du zém.
  const ids = Object.keys(P.modeles).filter(k => !ROLES.has(k) && !P.modeles[k].mode && P.modeles[k].enfant === enfant && (femme === null || femme === undefined || P.modeles[k].femme === femme));
  return ids.length ? ids[Math.floor(hash(i, 91) * ids.length)] : null;
}

/**
 * Un personnage animé (face à +z, pieds au sol) ou null si les modèles ne sont pas là.
 * Même contrat que personne() : userData.tete (bulles), userData.anim(t, parle, signe), userData.liberer().
 * En plus : userData.main (objets remis de main en main), userData.coiffer(objet) (casque sur la tête),
 * userData.jouer(nom) (idle, marche, salut, parle, telephone, assis, rire ; « dort » : la pose d'attente figée).
 */
export function personnage3d(i, { assise = false, femme = null, role = null, enfant = false, manuel = false } = {}) {
  if (!P.pret && !(role && P.modeles[role])) return null;
  const id = choisirId(i, femme, role, enfant); if (!id) return null;
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
  const E = { g, mixer, actions, courante: null, corps, velo: null, osVelo: null, tete: new THREE.Object3D(), main: new THREE.Object3D(), osTete: os('Head'), osMain: os('R_Hand'), crane: M.crane * ech, orphelin: 0, ph: hash(i, 93) * 10 };
  g.add(E.tete); E.main.position.set(0, 1.1, .25); g.add(E.main);
  E.tete.position.set(0, taille + .08, 0);
  const jouer = (nom, fondu = .35) => {
    // Assis, on le reste : un salut ou un rire (animations debout) relevait la voisine à travers sa chaise au lever du
    // joueur (maison.js), et le client du food court qui appelle le serveur (« coincée dans la chaise », Carlos, 26/10).
    if (assise && nom !== 'assis' && nom !== 'telephone') return;
    // « dort » : couché dans son lit (maison.js), la pose d'attente figée, d'un coup — on ne se balance pas en dormant,
    // et le pagne est drapé sur cette pose-là (« le pagne est un pavé », Carlos, 26/10).
    if (nom === 'dort') {
      if (E.courante === 'dort' || !actions.idle) return;
      mixer.stopAllAction(); const a = actions.idle; a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play(); a.paused = true; E.courante = 'dort'; return;
    }
    if (!actions[nom] && M.clips[nom]) actions[nom] = mixer.clipAction(M.clips[nom]); // danse chargée après coup
    if (!actions[nom]) nom = 'idle'; if (E.courante === nom || !actions[nom]) return;
    const a = actions[nom]; a.reset(); a.enabled = true; a.setEffectiveWeight(1);
    if (nom === 'assis') { a.time = M.assis?.t ?? a.getClip().duration; a.paused = true; } // on garde la pose assise
    else if (fondu === 0) a.time = (E.ph * 7.3) % a.getClip().duration; // chacun à son rythme, pas tous en même temps
    a.play();
    const prec = E.courante && actions[E.courante === 'dort' ? 'idle' : E.courante]; // au lever, « idle » reprend l'action figée elle-même
    if (prec && prec !== a && fondu > 0) a.crossFadeFrom(prec, fondu, false); else if (prec && prec !== a) prec.stop();
    E.courante = nom;
  };
  // Chacun ne fait pas la même chose au même moment : début décalé, et certains, assis, téléphonent.
  // « telephone » est une pose assise (bassin bas, genoux pliés) : seulement pour ceux qui sont assis, sinon ils s'assoiraient dans le vide.
  const repos = 'idle';
  jouer(assise ? (hash(i, 94) < .22 && actions.telephone ? 'telephone' : 'assis') : repos, 0);
  mixer.update(assise ? 0 : E.ph); suivre(E);
  if (!manuel) P.actifs.add(E); // manuel : animé par son propriétaire (userData.maj), ex. la cabine d'essayage
  g.userData = {
    tete: E.tete, main: E.main, femme: M.femme, graine: i, modele: id, haut: 1.15, jouer, peut: nom => !!(actions[nom] || M.clips[nom]), // peut('course') : seuls les modèles des joueurs savent courir
    assise: assise && M.assis?.pieds ? { fesses: M.assis.fesses * ech, pieds: M.assis.pieds * ech, dos: M.assis.dos * ech } : null, // sous le bassin, en mètres (poserAssis)
    maj: dt => { mixer.update(dt); if (E.velo !== null) poserVelo(E, E.velo); suivre(E); },
    // null rend le personnage à son animation.
    velo: v => { E.velo = v; }, // { a, bb, r, ecart, guidon } : à vélo (trajets.js, veloSous) ; 'moto' : les pieds sur les cale-pieds ; null : rien
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

// ---------- La pose à vélo ----------
// L'animation « assis » laisse les bras le long du corps et les jambes pendantes : sur un vélo, on a les
// mains au guidon et les pieds qui tournent. On repose donc les os par-dessus l'animation, à chaque image et
// APRÈS le mixer — avant, il les réécrivait aussitôt.
const OS_VELO = ['L_Thigh', 'R_Thigh', 'L_Calf', 'R_Calf', 'L_Foot', 'R_Foot', 'L_Upperarm', 'R_Upperarm', 'L_Forearm', 'R_Forearm', 'L_Hand', 'R_Hand', 'Spine01'];
const vAv = new THREE.Vector3(), vCote = new THREE.Vector3(), vBut = new THREE.Vector3(), vHaut = new THREE.Vector3(0, 1, 0), qTmp = new THREE.Quaternion();
const iA = new THREE.Vector3(), iB = new THREE.Vector3(), iC = new THREE.Vector3(), iD = new THREE.Vector3(), iK = new THREE.Vector3(), iP = new THREE.Vector3(), iF = new THREE.Vector3();
const vRacine = new THREE.Vector3(), qRacine = new THREE.Quaternion(), vLoc = new THREE.Vector3(), vPole = new THREE.Vector3();
/** Oriente un os vers `vBut` (direction, en repère monde). Plutôt que de deviner des angles d'Euler — ce qui
 *  donnait une cycliste les jambes en l'air —, on part de la direction de l'os au repos (vers son premier
 *  enfant) et on calcule la rotation qui l'amène là où on la veut. Marche quel que soit le squelette. */
function viser(o, x, y, z) {
  if (!o) return;
  // L'os suivant du membre, pas un os de torsion (L_ForearmTwist01, posé presque sur l'avant-bras) : l'avant-bras
  // visait ce petit os au lieu de la main, et la main revenait à l'épaule (bras en l'air, mesuré le 30/10).
  const enfant = o.userData.suiteVelo ??= o.children.filter(c => c.isBone).sort((m, n) => (/Twist/i.test(m.name) - /Twist/i.test(n.name)) || n.position.length() - m.position.length())[0];
  if (!enfant) return;
  const repos = o.userData.reposVelo ||= enfant.position.clone().normalize();
  o.parent.getWorldQuaternion(qTmp).invert();
  vBut.set(x, y, z).normalize().applyQuaternion(qTmp);
  o.quaternion.setFromUnitVectors(repos, vBut);
}
/**
 * Deux os d'un membre (cuisse et mollet, bras et avant-bras) : le bout (la cheville, le poignet) va au point `but`
 * (monde), l'articulation du milieu (le genou, le coude) pliée du côté de `pole`. Les longueurs sont celles du
 * personnage : un enfant qui n'atteint pas la pédale du bas tend la jambe vers elle.
 */
function membre(haut, bas, bout, but, pole) {
  if (!haut || !bas || !bout) return;
  haut.getWorldPosition(iA); bas.getWorldPosition(iB); bout.getWorldPosition(iC);
  const l1 = iA.distanceTo(iB), l2 = iB.distanceTo(iC);
  iD.subVectors(but, iA); let d = iD.length(); if (d < 1e-4 || !l1 || !l2) return; iD.divideScalar(d); d = Math.min(d, (l1 + l2) * .999);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  iP.copy(pole).addScaledVector(iD, -pole.dot(iD)); if (iP.lengthSq() < 1e-8) iP.copy(vHaut); iP.normalize();
  iK.copy(iA).addScaledVector(iD, x).addScaledVector(iP, h); // le genou, le coude
  viser(haut, iK.x - iA.x, iK.y - iA.y, iK.z - iA.z); haut.updateMatrixWorld(true);
  bas.getWorldPosition(iB); iF.copy(iA).addScaledVector(iD, d);
  viser(bas, iF.x - iB.x, iF.y - iB.y, iF.z - iB.z); bas.updateMatrixWorld(true);
}
/** Un point donné dans le repère du personnage en selle (l'avant vers +z, la gauche vers +x), en repère monde. */
const versMonde = (x, y, z, out) => out.set(x, y, z).applyQuaternion(qRacine).add(vRacine);
/**
 * Au guidon. Pour un vélo, `velo` dit où sont le pédalier et le guidon sous le personnage (trajets.js, veloSous) et
 * l'angle des manivelles : chaque pied suit sa pédale, le genou plie vers l'avant, les mains tiennent les poignées, le
 * buste penché un peu, comme sur un vélo de ville. « L'animation de conduire vélo est bizarre » (Murielle, 30/10) :
 * avant, les cuisses et les mollets suivaient deux sinus sans rapport avec les pédales, qui ne tournaient pas.
 * 'moto' : pour une moto ou un zém, dont le pilote tient le guidon mais garde les pieds sur les cale-pieds. Avant, le
 * pilote d'une moto jouait simplement « assis » — la pose d'une chaise, jambes tendues devant lui : « l'animation du
 * personnage qui conduit n'est pas bien » (Murielle, 25/10).
 */
function poserVelo(E, velo) {
  const os = E.osVelo ||= Object.fromEntries(OS_VELO.map(n => [n, E.corps.getObjectByName(n)]));
  E.g.getWorldDirection(vAv); // l'avant du personnage (+z de son groupe) : il regarde où va le vélo
  vCote.crossVectors(vAv, vHaut).normalize(); // sa droite
  if (velo === 'moto') {
    // À moto, on ne touche pas aux bras : braqués comme ceux d'un cycliste, ils partaient en l'air sur un guidon placé
    // autrement (vérifié de profil). L'animation « assis » leur donne une attitude naturelle ; ce sont les jambes qui
    // étaient fausses, tendues devant comme sur une chaise : genou plié, pied posé sur le cale-pied, un peu écarté.
    for (const c of [1, -1]) {
      const p = c > 0 ? 'L_' : 'R_', a = (kAv, kHaut, kCote = 0) => [vAv.x * kAv + vCote.x * kCote, kHaut, vAv.z * kAv + vCote.z * kCote];
      viser(os[p + 'Thigh'], ...a(.34, -.92, .20 * c));
      viser(os[p + 'Calf'], ...a(.04, -.99, .07 * c));
    }
    return;
  }
  E.g.updateMatrixWorld(true); E.g.getWorldPosition(vRacine); E.g.getWorldQuaternion(qRacine);
  // Le buste, penché de 24° vers le guidon : droit, les mains n'arrivaient pas aux poignées.
  if (os.Spine01) { viser(os.Spine01, vAv.x * .41, .91, vAv.z * .41); os.Spine01.updateMatrixWorld(true); }
  for (const p of ['L_', 'R_']) {
    // De quel côté est cette jambe ? On le mesure (le modèle peut être tourné) : +1 à gauche, −1 à droite.
    const cuisse = os[p + 'Thigh']; if (!cuisse) continue;
    cuisse.getWorldPosition(vLoc); const s = vLoc.sub(vRacine).dot(vCote) > 0 ? -1 : 1;
    // La pédale : la manivelle gauche à l'angle a, la droite à l'opposé ; la cheville un peu au-dessus et en arrière de son axe.
    const a = velo.a + (s > 0 ? 0 : Math.PI), [, by, bz] = velo.bb;
    versMonde(s * velo.ecart, by + velo.r * Math.sin(a) + .065, bz + velo.r * Math.cos(a) - .04, iC);
    vPole.copy(vAv).addScaledVector(vCote, -s * .15).addScaledVector(vHaut, .1); // le genou devant, un peu écarté
    membre(cuisse, os[p + 'Calf'], os[p + 'Foot'], iC.clone(), vPole);
    viser(os[p + 'Foot'], vAv.x * .95, -.3, vAv.z * .95); // le pied à plat sur la pédale
    // La main sur sa poignée, le coude plié vers l'extérieur et vers le bas.
    const [gx, gy, gz] = velo.guidon;
    versMonde(s * gx, gy, gz, iC);
    vPole.copy(vCote).multiplyScalar(-s * .6).addScaledVector(vHaut, -.5).addScaledVector(vAv, -.4);
    membre(os[p + 'Upperarm'], os[p + 'Forearm'], os[p + 'Hand'], iC.clone(), vPole);
  }
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
    E.mixer.update(dt); if (E.velo !== null) poserVelo(E, E.velo); suivre(E);
  }
}
