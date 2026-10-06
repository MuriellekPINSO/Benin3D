import * as THREE from 'three';
import { $, LITE, hash } from './base.js';
import { camera } from './scene.js';
import { son } from './audio.js';
import { C3, matVeh } from './vehicules.js';
import { mergeColored } from './ville.js';
import { PLACES } from './donnees-lieux.js';
import { BORD } from './bordure.js';
import { JEU, LANE, fmtF, pose, toast } from './jeu.js';
import { progres } from './missions.js';

// ---------- Les gens parlent : Zém Run comme Danfo Run, version Cotonou ----------
// Bulles au-dessus des têtes (les gens qui causent au bord de la route, les vendeuses
// qui appellent, ceux qu'on klaxonne), et un vrai dialogue avec le client du zém : on
// discute le prix, il fait la causette, il pose des questions sur la ville, il râle
// quand on conduit mal… On répond avec les touches 1, 2, 3 ou en touchant la réponse.

export const DISC = { signes: [], groupes: [], ptr: 0, vivants: [], client: null, file: [], courant: null, klaxons: [], collecteur: null, appel: -1, causerie: 0 };
const v = new THREE.Vector3();
const choisir = l => l[Math.floor(Math.random() * l.length)];

// ---------- Bulles ----------
const BULLES = [];
/** Une bulle au-dessus de `ancre` (objet 3D ou point). `ton` : '', 'fort', 'fon' (avec traduction). */
export function bulle(ancre, texte, { duree = 2.8, ton = '', trad = '' } = {}) {
  const box = $('#jhBulles'); if (!box || !ancre) return null;
  for (const b of BULLES) if (b.ancre === ancre) b.t = Math.min(b.t, .12); // une seule bulle à la fois par personne
  const el = document.createElement('div'); el.className = `bulle ${ton}`;
  el.textContent = texte; if (trad) { const s = document.createElement('small'); s.textContent = trad; el.append(s); }
  box.append(el);
  const b = { el, ancre, t: duree, d: duree }; BULLES.push(b); return b;
}
function tete(a, out) {
  if (a.isVector3) return out.copy(a);
  if (a.userData?.tete) return a.userData.tete.getWorldPosition(out);
  a.getWorldPosition(out); out.y += a.userData?.haut ?? 2.1; return out;
}
function majBulles(dt) {
  const r = $('#scene').getBoundingClientRect();
  for (let i = BULLES.length - 1; i >= 0; i--) {
    const b = BULLES[i]; b.t -= dt;
    if (b.t <= 0) { b.el.remove(); BULLES.splice(i, 1); continue; }
    tete(b.ancre, v); v.y += .35; const dist = v.distanceTo(camera.position); v.project(camera);
    const vu = v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15 && dist < 140;
    b.el.style.opacity = vu ? Math.min(1, b.t / .3, (b.d - b.t) / .12) : 0;
    b.el.style.transform = `translate(${((v.x * .5 + .5) * r.width).toFixed(1)}px, ${((-v.y * .5 + .5) * r.height).toFixed(1)}px) translate(-50%, -100%) scale(${THREE.MathUtils.clamp(26 / Math.max(dist, 1), .72, 1.05).toFixed(3)})`;
  }
}
function viderBulles() { for (const b of BULLES) b.el.remove(); BULLES.length = 0; }

// ---------- Les gens ----------
const PAGNES = ['#e2672a', '#2f6fb0', '#8e3c8f', '#2f8a4a', '#d9a521', '#c8382f', '#1f6f8b', '#f2efe6', '#e04f7a', '#6b8e23'];
const PANTALONS = ['#2b2f3a', '#4a3b2a', '#1f3d5a', '#5e5e5e', '#3f4d2c'];
const PEAUX = ['#4a2f22', '#5a3a28', '#3b261c', '#6b452f'];
/** Une personne debout (face à +z) ou assise ; userData.tete pour les bulles, userData.anim(t, parle). */
export function personne(i, { assise = false, gilet = null } = {}) {
  const femme = hash(i, 71) < .5, c1 = PAGNES[Math.floor(hash(i, 72) * PAGNES.length)], c2 = PAGNES[Math.floor(hash(i, 73) * PAGNES.length)];
  const peau = PEAUX[Math.floor(hash(i, 74) * PEAUX.length)], bas = PANTALONS[Math.floor(hash(i, 75) * PANTALONS.length)];
  const P = [], add = (g, c) => P.push([g, c]);
  const y0 = assise ? -.82 : 0; // assis : le bassin est à l'origine
  if (assise) {
    for (const x of [-.1, .1]) { add(C3(.075, .07, .44, 6).rotateX(Math.PI / 2).translate(x, 0, .2), femme ? c1 : bas); add(C3(.06, .055, .42, 6).translate(x, -.22, .42), femme ? peau : bas); }
  } else if (femme) add(C3(.2, .3, .95, 10).translate(0, .475, 0), c1);
  else for (const x of [-.09, .09]) { add(C3(.075, .065, .86, 7).translate(x, .43, 0), bas); add(new THREE.BoxGeometry(.11, .07, .24).translate(x, .035, .05), '#2a221c'); }
  add(C3(.17, .19, .5, 10).translate(0, y0 + 1.15, 0), gilet || (femme ? c2 : c1));
  add(new THREE.SphereGeometry(.12, 10, 8).translate(0, y0 + 1.55, 0), peau);
  if (femme) { add(C3(.14, .13, .17, 10).translate(0, y0 + 1.64, -.01), c1); add(new THREE.SphereGeometry(.07, 6, 5).translate(0, y0 + 1.66, -.13), c1); }
  else if (hash(i, 76) < .45) { add(C3(.13, .13, .07, 10).translate(0, y0 + 1.65, 0), c2); add(new THREE.BoxGeometry(.18, .02, .12).translate(0, y0 + 1.62, .13), c2); }
  const g = new THREE.Group(), corps = new THREE.Mesh(mergeColored(P), matVeh); corps.castShadow = !LITE; g.add(corps);
  const bras = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(s * .21, y0 + 1.36, 0);
    const m = new THREE.Mesh(mergeColored([[C3(.05, .045, .52, 6).translate(0, -.26, 0), gilet || (femme ? c2 : c1)], [new THREE.SphereGeometry(.05, 6, 5).translate(0, -.54, 0), peau]]), matVeh);
    pivot.add(m); pivot.rotation.z = s * .12; if (assise) pivot.rotation.x = -.5; g.add(pivot); return pivot;
  });
  const t0 = new THREE.Object3D(); t0.position.set(0, y0 + 1.75, 0); g.add(t0);
  const ph = hash(i, 77) * 6;
  g.userData = {
    tete: t0, bras,
    anim: (t, parle, signe) => {
      const [bg, bd] = bras;
      if (signe) { bd.rotation.x = -2.7 + Math.sin(t * 9 + ph) * .3; bd.rotation.z = .5 + Math.sin(t * 9 + ph) * .25; bg.rotation.x = 0; }
      else if (parle) { bd.rotation.x = -.9 + Math.sin(t * 7 + ph) * .45; bd.rotation.z = .35; bg.rotation.x = -.3 + Math.sin(t * 5 + ph) * .25; }
      else { bd.rotation.x += ((assise ? -.5 : Math.sin(t * .8 + ph) * .06) - bd.rotation.x) * .1; bd.rotation.z = .12; bg.rotation.x += ((assise ? -.5 : 0) - bg.rotation.x) * .1; }
      corps.rotation.y = Math.sin(t * .6 + ph) * .08;
    },
    liberer: () => g.traverse(o => { if (o.isMesh) o.geometry.dispose(); }),
  };
  return g;
}

// ---------- Ce qu'on entend au bord de la route ----------
const CONVERSATIONS = [
  [[0, 'On dit quoi ?'], [1, 'On est là, doucement.'], [0, 'Et la famille ?'], [1, 'Tout le monde va bien, merci !']],
  [[0, 'Tu as vu le match des Guépards ?'], [1, 'Hum, on a encore souffert !'], [0, 'La prochaine fois, ça va aller.']],
  [[0, 'Le gari a encore monté à Dantokpa.'], [1, 'Ah, tout est cher maintenant deh !'], [2, 'C’est pas facile oh.']],
  [[0, 'Il fait chaud deh !'], [1, 'C’est Cotonou, mon frère.']],
  [[0, 'Tu vas aux Vodun Days à Ouidah ?'], [1, 'Oui, on part le 9 janvier !'], [0, 'Garde-moi une place dans la voiture.']],
  [[0, 'Le courant a coupé toute la nuit.'], [1, 'Patience, ça va revenir.']],
  [[0, 'A fɔn ganji à ?', 'Fon : tu t’es bien réveillé ?'], [1, 'Ɛɛ, un fɔn ganji !', 'Oui, je me suis bien réveillé !']],
  [[0, 'Tu as reçu le transfert MoMo ?'], [1, 'Pas encore, le réseau est lent.'], [0, 'Je vais réessayer.']],
  [[0, 'Tanti, le poisson c’est combien ?'], [1, 'Mille francs le tas, ma fille.'], [0, 'Huit cents ?'], [1, 'Ajoute un peu, on va s’entendre.']],
  [[0, 'Les zém roulent vite aujourd’hui !'], [1, 'Ils cherchent l’argent du jour.']],
  [[0, 'Ce soir on va à Haie Vive ?'], [1, 'Si tu paies la bière, je viens !'], [2, 'Moi je suis toujours là !']],
  [[0, 'Le pont est bouché encore.'], [1, 'Passe par Dantokpa, c’est mieux.']],
  [[0, 'Tu as fini ma robe ?'], [1, 'Demain sans faute, je te jure.'], [0, 'Tu dis ça depuis lundi !']],
  [[0, 'Il va pleuvoir ce soir.'], [1, 'Les caniveaux vont déborder encore…']],
  [[0, 'Tu prends le tokpa pour Calavi ?'], [1, 'Non, un zém, c’est plus rapide.']],
  [[0, 'Le maquis là fait du bon poulet bicyclette.'], [1, 'Avec l’akassa ? Je viens !']],
  [[0, 'Mon fils a eu son BAC !'], [1, 'Félicitations ! Il faut fêter ça !'], [2, 'Dieu merci !']],
  [[0, 'On est ensemble ?'], [1, 'On est ensemble !']],
];
const KLAXON_GENS = ['Tchrrr ! Ce zém-là !', 'Eh, on t’a vu !', 'Doucement, on cause ici !', 'Klaxonne encore là !'];
const KLAXON_PIETONS = ['Ago ! Ago !', 'Eh zém, doucement !', 'Tu veux me renverser ou bien ?', 'Pardon, je passe !', 'Attends un peu !'];
const APPELS = {
  vendeuse: ['Pure water ! Pure water !', 'Akassa chaud !', 'Venez acheter, c’est pas cher !', 'Arachides grillées !', 'Ananas sucré !'],
  kpayo: ['Kpayo ! Essence, essence !', 'Un litre, deux litres ?'],
  momo: ['Dépôt, retrait MoMo !', 'Crédit, crédit !'],
  vulca: ['Vulcanisateur ! Gonflage !'],
  zems: ['Zém ! Zém !', 'On va où, tanti ?'],
};

export function preparerDiscussions(L, C, arrets, garderClient = false) {
  nettoyerDiscussions(garderClient);
  const ponts = BORD.ponts || [], surPont = s => ponts.some(([a, b]) => s > a && s < b);
  const g = [];
  for (let s = 90 + Math.random() * 60; s < C.L - 60; s += 130 + Math.random() * 130) {
    if (surPont(s) || arrets.some(a => s > a.s - 55 && s < a.s + 25)) continue;
    const side = Math.random() < .5 ? -1 : 1;
    if (BORD.items.some(it => it.side === side && Math.abs(it.s - s) < 7)) continue;
    const script = choisir(CONVERSATIONS), nb = Math.max(2, ...script.map(l => l[0] + 1));
    g.push({ s, side, script, nb, graine: Math.floor(Math.random() * 1e5) });
  }
  DISC.groupes = g; DISC.ptr = 0;
  // Entre les arrêts, des gens font signe au zém pour qu'il s'arrête.
  DISC.signes = [];
  if (JEU.veh === 'zem') for (let s = 380 + Math.random() * 200; s < C.L - 250; s += 420 + Math.random() * 380) {
    if (surPont(s) || arrets.some(a => s > a.s - 90 && s < a.s + 40)) continue;
    const side = Math.random() < .7 ? 1 : -1;
    DISC.signes.push({ s, side, graine: Math.floor(Math.random() * 1e5), m: null, etat: 'attend' });
  }
}
export function nettoyerDiscussions(garderClient = false) {
  for (const v2 of DISC.vivants) { v2.g.parent?.remove(v2.g); for (const m of v2.membres) m.userData.liberer(); }
  for (const h of DISC.signes) if (h.m) { h.m.parent?.remove(h.m); h.m.userData.liberer(); }
  DISC.signes = [];
  if (garderClient) { DISC.vivants = []; DISC.groupes = []; DISC.collecteur = null; return; } // virage : le client reste à bord
  DISC.vivants = []; DISC.groupes = []; DISC.file = []; DISC.courant = null; DISC.client = null; DISC.klaxons = []; DISC.collecteur = null;
  fermerDialogue(); viderBulles();
}
function creerGroupe(gp, C) {
  const g = new THREE.Group(), membres = [];
  const p = pose(C, gp.s, gp.side * (LANE * 1.5 + 4.6), { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 });
  g.position.set(p.x, p.y, p.z); g.rotation.y = p.a;
  for (let k = 0; k < gp.nb; k++) {
    const m = personne(gp.graine + k), a = k / gp.nb * Math.PI * 2 + .4, r = gp.nb > 2 ? .62 : .5;
    m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); m.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
    g.add(m); membres.push(m);
  }
  JEU.decor.add(g);
  return { ...gp, g, membres, ligne: 0, prochaine: 0, parle: -1 };
}

// ---------- Le client du zém ----------
// [nom, femme ?]
const NOMS = [['Tanti Rosine', 1], ['Tonton Codjo', 0], ['Maman Bénédicte', 1], ['Le jeune Ulrich', 0], ['Sœur Prudence', 1], ['Monsieur Hounkpatin', 0], ['Mamie Adjoua', 1], ['Fifamè', 1], ['Le vieux Dossou', 0], ['Tanti Gisèle', 1], ['Sèna', 0], ['Koffi l’étudiant', 0]];
function tarifJuste(st, k) {
  const L = JEU.ligne, d = Math.max(200, (L.arretsJ[k]?.s ?? st.s) - st.s);
  return THREE.MathUtils.clamp(Math.round((150 + d / 1000 * 110) / 50) * 50, 150, 700);
}
function siege() { // le passager assis derrière le conducteur, ou à défaut le zém lui-même
  const j = JEU.joueur; if (!j) return null;
  if (!j.userData.passager) { const p = personne(7 + Math.floor(Math.random() * 999), { assise: true }); p.position.set(-.72, .86, 0); p.rotation.y = Math.PI / 2; p.visible = false; j.add(p); j.userData.passager = p; }
  return j.userData.passager;
}
function nouveauPassager() { const j = JEU.joueur; if (j?.userData.passager) { j.remove(j.userData.passager); j.userData.passager.userData.liberer(); j.userData.passager = null; } return siege(); }
function dit(texte, opts) { const s = DISC.client?.siege || siege(); return bulle(s, texte, opts); }
function humeur(d) { const c = DISC.client; if (!c) return; c.humeur = THREE.MathUtils.clamp(c.humeur + d, 0, 1); }

/** Le joueur s'est arrêté à côté de quelqu'un qui faisait signe : la personne monte. */
export function prendreSigne(h) {
  const st = JEU.etat; if (!st || DISC.client) return false;
  h.etat = 'monte'; if (h.m) h.m.visible = false;
  nouveauClient(st, st.prochain, { arrete: true }); return true;
}
/** Le joueur, arrêté sans client, attend : un passant vient lui demander une course. */
export function passantDemande(C) {
  const st = JEU.etat; if (!st || DISC.client || DISC.courant) return;
  const side = st.lat < -.5 ? -1 : 1, p = pose(C, st.s + 2, side * (LANE * 2.4), { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 });
  const m = personne(Math.floor(Math.random() * 1e5)); m.position.set(p.x, p.y, p.z); m.rotation.y = Math.atan2(side * p.dz, -side * p.dx); JEU.decor.add(m);
  const h = { s: st.s + 2, side, m, etat: 'propose', graine: 0 }; DISC.signes.push(h);
  const prochain = JEU.ligne.arretsJ[st.prochain], ou = prochain ? prochain.nom : 'le terminus';
  bulle(m, `Zém, tu es libre ? ${ou} !`, { duree: 3 });
  dialogue('Un passant s’approche', `« Zém, tu es libre ? Je vais à ${ou}. »`, [
    ['Oui, monte', () => prendreSigne(h)],
    ['Non, je suis occupé', () => { bulle(m, 'Bon… je vais attendre un autre.'); h.etat = 'ignore'; }],
  ], { defaut: -1, duree: 9, prioritaire: true });
}
/** Discussion avec un groupe au bord de la route ; parfois l'un d'eux veut une course. */
export function causerGroupe(g) {
  const st = JEU.etat; if (!st) return;
  const m = g.membres[Math.floor(Math.random() * g.membres.length)];
  const prochain = JEU.ligne.arretsJ[st.prochain], ou = prochain ? prochain.nom : 'le terminus';
  if (!DISC.client && Math.random() < .5) {
    bulle(m, `Ah zém ! Tu tombes bien. Tu vas vers ${ou} ?`, { duree: 3 });
    dialogue('Au bord de la route', `« Ah zém ! Tu tombes bien. Tu vas vers ${ou} ? »`, [
      ['Oui, monte', () => { m.visible = false; nouveauClient(st, st.prochain, { arrete: true }); }],
      ['Non, je passais saluer', () => bulle(m, 'Bonne route alors !')],
    ], { defaut: -1, duree: 9 });
    return;
  }
  const [q, r1, r2, r3] = choisir([
    ['On dit quoi, zém ?', 'On est là, doucement', 'Ça roule !', 'Le travail est dur deh'],
    ['Tu as vu le match des Guépards hier ?', 'Oui, on a bien joué !', 'J’étais au travail', 'Le foot, ça me stresse'],
    ['Il paraît que l’essence va encore monter…', 'Dieu va nous aider', 'Le kpayo est moins cher', 'On va faire comment ?'],
    ['Zém, tu connais le maquis de Tanti Rosine ?', 'Oui, son poisson braisé est bon', 'Non, c’est où ?', 'Je ne mange pas dehors'],
    ['A fɔn ganji à ? (Tu t’es bien réveillé ?)', 'Ɛɛ, un fɔn ganji ! (Oui, bien réveillé !)', 'Ça va, merci', 'Je suis fatigué'],
  ]);
  bulle(m, q, { duree: 3 });
  const ok = rep2 => () => { bulle(m, rep2, { duree: 2.6 }); };
  dialogue('Au bord de la route', `« ${q} »`, [[r1, ok(choisir(['Hahaha, toi tu es drôle !', 'On est ensemble !', 'C’est ça même !']))], [r2, ok(choisir(['D’accord, bonne route !', 'Ah bon ?', 'Hum…']))], [r3, ok(choisir(['Courage, mon frère !', 'Ça va aller !', 'Dieu est grand.']))]], { defaut: -1, duree: 9 });
}
/** Un client monte (zém) : on discute le prix jusqu'à l'arrêt `k`. */
export function nouveauClient(st, k, { arrete = false } = {}) {
  const L = JEU.ligne, a = L.arretsJ[k]; if (!a) return;
  const s = nouveauPassager(); s.visible = true;
  const juste = tarifJuste(st, k), [nom, femme] = choisir(NOMS);
  DISC.client = { nom, femme, juste, tarif: 0, humeur: .6, vers: k, siege: s, accord: false, causerie: st.s + 220 + Math.random() * 300, dits: new Set() };
  st.passagers = 1;
  const accord = (tarif, dh, rep) => { const c = DISC.client; if (!c) return; c.tarif = tarif; c.accord = true; humeur(dh); dit(rep); if (tarif >= juste) progres('negos', 1); };
  const perdu = () => { dit('Je prends un autre zém !', { ton: 'fort' }); son('choc'); toast('Client perdu', 1.4, 'mal'); setTimeout(() => { if (DISC.client?.nom === nom) { DISC.client = null; st.passagers = 0; s.visible = false; } }, 1200); };
  dit(`Zém ! ${a.nom}, c’est combien ?`, { duree: 3.2 });
  dialogue(`${nom} · ${femme ? 'ta cliente' : 'ton client'}`, `« Zém ! ${a.nom}, c’est combien ? »`, [
    [`${juste + 150} F`, () => {
      if (Math.random() < .35) return accord(juste + 150, -.15, 'Bon… on y va, mais roule bien hein !');
      dit(`Eh ! C’est trop ! ${juste} F ?`, { ton: 'fort' });
      dialogue(`${nom}`, `« Eh ! C’est trop ! ${juste} F ? »`, [
        ['D’accord, monte', () => accord(juste, 0, 'Merci, zém !')],
        [`Non, c’est ${juste + 150} F`, () => (Math.random() < .3 ? accord(juste + 150, -.25, 'Tchrrr… bon, on y va.') : perdu())],
      ], { defaut: 0 });
    }],
    [`${juste} F`, () => accord(juste, .05, 'Ok, on y va !')],
    ['Monte, on va s’entendre', () => accord(juste - 50, .2, `Ah, toi tu es gentil ! ${juste - 50} F alors.`)],
  ], { defaut: 1, bloquant: arrete });
}
/** Le client descend à l'arrêt : il paie le prix convenu, plus ou moins selon son humeur. Renvoie le gain. */
export function deposerClient() {
  const c = DISC.client; if (!c) return 0;
  let gain = c.accord ? c.tarif : Math.round(c.juste * .8 / 25) * 25;
  if (c.humeur >= .75) { const pb = c.humeur >= .9 ? 100 : 50; gain += pb; dit(`Merci zém, que Dieu te garde ! Garde ${pb} F.`, { duree: 3 }); progres('ravis', 1); }
  else if (c.humeur < .3) { gain = Math.max(0, gain - 50); dit('Tu as failli me tuer ! Je retiens 50 F.', { ton: 'fort', duree: 3 }); }
  else dit(choisir(['Merci, bonne route !', 'Merci zém !', 'Que Dieu te bénisse !']));
  DISC.client = null;
  return gain;
}
export function clientRate(a) { // arrêt dépassé
  const c = DISC.client; if (!c) return;
  dit(`Zém ! Tu as dépassé ${a.nom} !`, { ton: 'fort', duree: 3 }); son('choc');
  DISC.client = null; const s = c.siege; setTimeout(() => { if (!DISC.client && s) s.visible = false; }, 1500);
}

// Causeries pendant la course : le client parle, on choisit sa réponse.
function causerie(st) {
  const c = DISC.client; if (!c || DISC.courant) return;
  const sujets = [];
  if (st.quartier) sujets.push('ou');
  if (BORD.repere && BORD.repere.d < 260 && Math.abs(BORD.repere.s - st.s) < 160) sujets.push('lieu');
  sujets.push('foot', 'chaud', 'essence', 'monnaie', 'famille', 'musique');
  const sujet = choisir(sujets.filter(x => !c.dits.has(x))); if (!sujet) return; c.dits.add(sujet);
  const R = (txt, dh, rep, prime = 0) => [txt, () => { humeur(dh); dit(rep); if (prime) { st.argent += prime; toast(`+${prime} F`, 1, 'bien'); son('piece'); } }];
  if (sujet === 'ou') {
    const autres = JEU.quartiersNoms.filter(n => n !== st.quartier).sort(() => Math.random() - .5).slice(0, 2), bon = st.quartier;
    const choix = [bon, ...autres].sort(() => Math.random() - .5);
    dit('On est où là ?');
    dialogue(c.nom, '« Zém, on est où là ? »', choix.map(n => [n, () => {
      if (n === bon) { humeur(.15); dit('Exact ! Toi tu connais ta ville.'); st.argent += 50; toast('Bonne réponse : +50 F', 1.2, 'bien'); son('piece'); progres('quartiers', 1); }
      else { humeur(-.05); dit(`Non ! On est à ${bon}.`); }
    }]), { defaut: -1, duree: 10 });
  } else if (sujet === 'lieu') {
    const r = BORD.repere, faux = PLACES.filter(p => p.name !== r.nom).sort(() => Math.random() - .5).slice(0, 2).map(p => p.name);
    const choix = [r.nom, ...faux].sort(() => Math.random() - .5);
    dit('C’est quoi ce bâtiment là-bas ?');
    dialogue(c.nom, '« C’est quoi ce bâtiment là-bas ? »', choix.map(n => [n, () => {
      if (n === r.nom) { humeur(.15); dit('Ah oui ! Tu connais bien Cotonou.'); st.argent += 50; toast('Bonne réponse : +50 F', 1.2, 'bien'); son('piece'); }
      else { humeur(-.05); dit(`Non, ça c’est ${r.nom} !`); }
    }]), { defaut: -1, duree: 10 });
  } else if (sujet === 'foot') {
    dit('Tu supportes les Guépards ?');
    dialogue(c.nom, '« Tu supportes les Guépards ? »', [R('À fond ! Allez le Bénin !', .15, 'On est ensemble ! Allez les Guépards !'), R('Moi c’est le Real Madrid', -.05, 'Hum… et le pays alors ?'), R('Je n’ai pas le temps pour le foot', 0, 'Toujours au travail, hein !')], { defaut: 0 });
  } else if (sujet === 'chaud') {
    dit('Il fait chaud deh ! Tu n’as pas de l’eau ?');
    dialogue(c.nom, '« Il fait chaud deh ! Tu n’as pas de l’eau ? »', [R('On achète une pure water au feu', .1, 'Ah merci, tu es gentil !'), R('Désolé, je n’ai rien', 0, 'Ça va aller.'), R('Le vent du zém, c’est la clim !', .12, 'Hahaha ! Toi tu es drôle.')], { defaut: 0 });
  } else if (sujet === 'essence') {
    dit('L’essence a encore monté, non ?');
    dialogue(c.nom, '« L’essence a encore monté, non ? »', [R('Le kpayo est moins cher', .05, 'Attention aux bouteilles hein !'), R('Ça va baisser, Dieu est grand', .08, 'Amen !'), R('C’est pour ça que je ne fais pas de rabais', -.05, 'Hum… j’ai compris.')], { defaut: 1 });
  } else if (sujet === 'monnaie') {
    dit('Tu as la monnaie de 2 000 ?');
    dialogue(c.nom, '« Tu as la monnaie de 2 000 ? »', [R('Oui, pas de problème', .1, 'Merci beaucoup !'), R('Je n’ai pas la monnaie', -.08, 'Ah, les zém et la monnaie…')], { defaut: 0 });
  } else if (sujet === 'famille') {
    dit('Tu es marié, zém ?');
    dialogue(c.nom, '« Tu es marié, zém ? »', [R('Oui, avec deux enfants', .08, 'Que Dieu les garde !'), R('Pas encore…', .05, 'Ça va venir, patience !'), R('Ça, c’est mon secret !', .1, 'Hahaha, tu es malin !')], { defaut: 0 });
  } else if (sujet === 'musique') {
    dit('Tu écoutes quoi comme musique ?');
    dialogue(c.nom, '« Tu écoutes quoi comme musique ? »', [R('Angélique Kidjo !', .15, 'Ah, la grande dame du Bénin !'), R('Le gospel', .08, 'Gloire à Dieu !'), R('Rien, je conduis', 0, 'Tu es sérieux, toi.')], { defaut: 0 });
  }
}

// ---------- Le collecteur du syndicat (comme l'agbero de Danfo Run) ----------
export function placerCollecteur(L, C) {
  const n = L.arretsJ.length; if (JEU.veh !== 'zem' || n < 4) return;
  const k = 1 + Math.floor(Math.random() * (n - 3)), a = L.arretsJ[k];
  const p = pose(C, a.s + 2, LANE * 2.6, { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 });
  const m = personne(4242, { gilet: '#f28c1b' }); m.position.set(p.x, p.y, p.z); m.rotation.y = p.a - Math.PI / 2; JEU.decor.add(m);
  DISC.collecteur = { k, m, fait: false };
}
export function collecte(st) {
  const c = DISC.collecteur; if (!c || c.fait || st.prochain - 1 !== c.k) return;
  c.fait = true;
  const P = JEU.prog, montant = P.dette ? P.dette * 2 : 100;
  bulle(c.m, P.dette ? `Ta dette a doublé : ${montant} F !` : `Zém ! Ta cotisation du jour : ${montant} F.`, { duree: 3.4, ton: 'fort' });
  dialogue('Le collecteur du syndicat', P.dette ? `« Tu n’as pas payé la dernière fois. Maintenant c’est ${montant} F ! »` : `« Zém ! Ta cotisation du jour : ${montant} F. »`, [
    [`Payer ${montant} F`, () => { st.argent -= montant; P.dette = 0; bulle(c.m, 'Merci, roule tranquille mon frère !'); progres('cotisation', 1); }],
    ['Je paie demain', () => { P.dette = montant; bulle(c.m, 'Demain c’est le double, je t’ai noté !', { ton: 'fort' }); }],
  ], { defaut: 0 });
}

// ---------- L'apprenti du tokpa-tokpa ----------
function apprenti(texte) {
  const el = $('#jhApprenti'); if (!el) return;
  el.textContent = texte; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}
export function appelApprenti(a) { apprenti(choisir([`${a.nom} ! ${a.nom} ! Qui descend ?`, `On arrive à ${a.nom} ! Préparez la monnaie !`, `${a.nom} ! Ceux qui descendent, levez la main !`])); }
export function departApprenti() { apprenti(choisir(['On est au complet, on bouge !', 'Serrez-vous derrière, il y a encore de la place !', 'Chauffeur, on y va !'])); }

// ---------- Dialogue (réponses au choix) ----------
/** Ajoute un échange : `choix` = [[texte, fonction], …]. Défaut : réponse prise si l'on ne répond pas (-1 : aucune). */
export function dialogue(qui, texte, choix, { defaut = 0, duree = 8, prioritaire = false, valide = null, bloquant = false } = {}) {
  const d = { qui, texte, choix, defaut, duree, valide, prioritaire: prioritaire || bloquant || !!DISC.forcer, bloquant };
  if (d.prioritaire) {
    // Une proposition qui ne peut pas attendre passe devant ; la causerie en cours reprendra après.
    if (DISC.courant && !DISC.courant.prioritaire) { DISC.file.unshift(d, DISC.courant); DISC.courant = null; suivant(); return; }
    DISC.file.unshift(d);
  } else DISC.file.push(d);
  if (!DISC.courant) suivant();
}
function suivant() {
  let d = DISC.file.shift(); while (d && d.valide && !d.valide()) d = DISC.file.shift(); // propositions périmées (vendeur dépassé…)
  const el = $('#jhDialogue'); DISC.courant = d || null;
  if (!d) { el.hidden = true; return; }
  d.t = d.duree;
  el.querySelector('.qui').textContent = d.qui; el.querySelector('.dit').textContent = d.texte;
  const box = el.querySelector('.choix'); box.innerHTML = '';
  d.choix.forEach(([t], k) => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<kbd>${k + 1}</kbd>${t}`; b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); repondre(k); }); box.append(b); });
  el.hidden = false; son('arret');
  if (d.bloquant && JEU.etat) JEU.etat.service = 99; // arrêté le temps de répondre (plein, client qui monte)
}
export function repondre(k) {
  const d = DISC.courant; if (!d || !d.choix[k]) return;
  DISC.courant = null; $('#jhDialogue').hidden = true;
  if (d.bloquant && JEU.etat) JEU.etat.service = .6;
  d.choix[k][1]();
  setTimeout(() => { if (!DISC.courant) suivant(); }, 500);
}
function fermerDialogue() { const el = $('#jhDialogue'); if (el) el.hidden = true; }

// ---------- Klaxon ----------
export function klaxonner() {
  const st = JEU.etat; if (!st) return;
  son('klaxon', JEU.prog?.klaxon); const t = st.temps;
  DISC.klaxons = DISC.klaxons.filter(x => t - x < 6); DISC.klaxons.push(t);
  // Ceux qui traversent devant pressent le pas.
  for (const o of JEU.objets) {
    const ds = o.s - st.s; if (ds < 0 || ds > 45) continue;
    if (o.type === 'egungun' && !o.klaxonne) { o.klaxonne = true; bulle(o.mesh, 'On ne klaxonne pas les revenants !', { ton: 'fort' }); st.argent = Math.max(0, st.argent - 50); toast('Klaxonner un Egungun : −50 F', 1.4, 'mal'); continue; }
    if ((o.type === 'marchande' || o.type === 'chevre') && o.dirLat && !o.klaxonne && Math.abs(o.lat) < 6) {
      o.klaxonne = true; o.dirLat *= 2.6;
      bulle(o.mesh, o.type === 'chevre' ? choisir(['Mêêê !', 'Bêêê !']) : choisir(KLAXON_PIETONS), { duree: 2 });
      progres('klaxons', 1);
    }
  }
  // Ceux qui causent au bord de la route.
  for (const g of DISC.vivants) { const ds = g.s - st.s; if (ds > 0 && ds < 40 && !g.klaxonne) { g.klaxonne = true; const m = g.membres[Math.floor(Math.random() * g.membres.length)]; bulle(m, choisir(KLAXON_GENS), { duree: 2.2 }); } }
  if (DISC.client && DISC.klaxons.length >= 4 && !DISC.client.dits.has('klaxon')) { DISC.client.dits.add('klaxon'); humeur(-.08); dit('Arrête de klaxonner, j’ai mal à la tête !', { ton: 'fort' }); }
}

/** Ce qui arrive pendant la course et fait réagir le client. */
export function evenement(type) {
  const c = DISC.client; if (!c) return;
  const R = {
    frole: [-.06, ['Eh, doucement !', 'Tu veux nous tuer ?', 'Mon Dieu, c’était juste !']],
    choc: [-.25, ['Aïe ! Tu as vu ça ?!', 'Tu conduis comment, toi ?!', 'Jésus ! Mes os !']],
    trou: [-.08, ['Aïe, mon dos !', 'Les trous de Cotonou…']],
    saut: [.03, ['Waouh ! On vole !', 'Hé ! Doucement !']],
    egungun: [.12, ['Tu as bien fait. On respecte les revenants.']],
  }[type];
  if (!R) return;
  humeur(R[0]); if (Math.random() < (type === 'saut' ? .35 : .8)) dit(choisir(R[1]), { ton: R[0] < -.1 ? 'fort' : '' });
}

// ---------- Mise à jour à chaque image ----------
export function majDiscussions(st, C, dt) {
  // Groupes qui apparaissent devant et disparaissent derrière.
  while (DISC.ptr < DISC.groupes.length && DISC.groupes[DISC.ptr].s < st.s + 280) {
    const gp = DISC.groupes[DISC.ptr++]; if (gp.s < st.s - 20) continue;
    DISC.vivants.push(creerGroupe(gp, C));
  }
  const t = st.temps;
  DISC.vivants = DISC.vivants.filter(g => {
    const ds = g.s - st.s;
    if (ds < -30) { g.g.parent?.remove(g.g); for (const m of g.membres) m.userData.liberer(); return false; }
    // La conversation se déroule quand on approche : une réplique toutes les 1,7 s.
    if (ds < 70 && g.ligne < g.script.length && t >= g.prochaine) {
      const [qui, txt, trad] = g.script[g.ligne++], m = g.membres[qui % g.membres.length];
      bulle(m, txt, { duree: 2.4, ton: trad ? 'fon' : '', trad }); g.parle = qui; g.prochaine = t + 1.7;
    }
    if (t > g.prochaine + .2) g.parle = -1;
    g.membres.forEach((m, k) => m.userData.anim(t, k === g.parle));
    return true;
  });
  // Les gens qui font signe : on propose de s'arrêter, le zém se range seul.
  for (const h of DISC.signes) {
    const ds = h.s - st.s;
    if (!h.m && ds < 260 && ds > -20) {
      const p = pose(C, h.s, h.side * (LANE * 1.5 + 1.6), { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 });
      h.m = personne(h.graine); h.m.position.set(p.x, p.y, p.z); JEU.decor.add(h.m);
      h.m.rotation.y = Math.atan2(h.side * p.dz - .6 * p.dx, -h.side * p.dx - .6 * p.dz); // face à la route, tourné vers le zém qui arrive
    }
    if (!h.m) continue;
    if (ds < -30) { h.m.parent?.remove(h.m); h.m.userData.liberer(); h.m = null; h.etat = 'fini'; continue; }
    h.m.userData.anim(t, false, h.etat === 'attend' || h.etat === 'propose');
    // C'est le joueur qui décide : il s'arrête à sa hauteur et appuie sur E (interactions.js).
    if (h.etat === 'attend' && ds < 75 && ds > 25) {
      h.etat = 'propose';
      const prochain = JEU.ligne.arretsJ[st.prochain], ou = prochain ? prochain.nom : 'le terminus';
      bulle(h.m, choisir(['Zém ! Zém !', `Zém ! ${ou} ?`, 'Eh zém ! Attends !']), { duree: 2.6 });
      if (!DISC.client && !st.aideSigne) { st.aideSigne = true; toast(`Quelqu’un te fait signe à ${h.side > 0 ? 'droite' : 'gauche'} : arrête-toi à sa hauteur, puis E`, 2.6); }
    }
    if (h.etat === 'propose' && ds < -6) { h.etat = 'ignore'; bulle(h.m, choisir(['Tchrrr…', 'Hum, ces zém-là !', 'Bon, j’attends le suivant.'])); }
  }
  // Les vendeuses et les kiosques appellent les passants.
  if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) {
    for (const o of BORD.vivants) {
      const ds = o.s - st.s; if (ds < 8 || ds > 45 || o.appele || !APPELS[o.type] || Math.random() < .5) continue;
      o.appele = true; bulle(o.g, choisir(APPELS[o.type]), { duree: 2.2 }); break;
    }
  }
  // Le client : causerie de temps en temps, et passager animé.
  const c = DISC.client;
  if (c) { c.siege?.userData.anim(t, false); if (c.accord && st.s > c.causerie && JEU.ligne.arretsJ[c.vers] && JEU.ligne.arretsJ[c.vers].s - st.s > 150) { c.causerie = st.s + 500 + Math.random() * 500; causerie(st); } }
  if (DISC.collecteur) DISC.collecteur.m.userData.anim(t, DISC.courant?.qui?.startsWith('Le collecteur'));
  // Appel de l'apprenti avant chaque arrêt.
  const a = JEU.ligne.arretsJ[st.prochain];
  if (JEU.veh === 'tokpa' && a && DISC.appel !== st.prochain && a.s - st.s < 260) { DISC.appel = st.prochain; appelApprenti(a); }
  // Dialogue en cours : la réponse par défaut tombe à la fin du temps.
  const d = DISC.courant;
  if (d && d.valide && !d.valide()) { DISC.courant = null; $('#jhDialogue').hidden = true; if (d.bloquant) st.service = .6; suivant(); }
  else if (d) {
    d.t -= dt; $('#jhDialogue .minuteur').style.width = `${Math.max(0, d.t / d.duree * 100)}%`;
    if (d.t <= 0) { if (d.defaut >= 0) repondre(d.defaut); else { DISC.courant = null; $('#jhDialogue').hidden = true; if (d.bloquant) st.service = .6; setTimeout(suivant, 300); } }
  }
  majBulles(dt);
}
/** Texte pour la case passagers du HUD. */
export function etiquetteClient() {
  const c = DISC.client; if (!c) return 'À vide';
  const e = c.femme ? 'e' : '', h = c.humeur >= .75 ? `ravi${e}` : c.humeur >= .45 ? 'tranquille' : c.humeur >= .25 ? `pas content${e}` : `fâché${e}`;
  return `${c.nom.split(' ').slice(-1)[0]} · ${h}${c.accord ? ` · ${fmtF(c.tarif)}` : ''}`;
}
