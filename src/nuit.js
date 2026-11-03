import * as THREE from 'three';
import { AUDIO, applaudir, radio, son } from './audio.js';
import { toXZ } from './base.js';
import { premierZemRun } from './classement.js';
import { personne } from './discussions.js';
import { AFFICHE_NUIT } from './dome-interieur.js';
import { musiqueForcee } from './musique.js';
import { gagnants } from './palmares.js';
import { chargerDanses } from './personnages.js';
import { scene } from './scene.js';
import { MUR, poserSol } from './sols.js';
import { VIE } from './vie.js';

// ---------- La Nuit Kutɔnu Vibes, dans « Vivre à Cotonou » ----------
// « Comment l'événement se passe ? Et si on quitte là, on part à l'Amazone pour rencontrer le DJ. Les sons du DJ, comment
// on lance ça ? » (Murielle, 03/11). La soirée en deux temps, comme le teaser :
//  1. Au Dôme du Sofitel (dome-interieur.js), la remise des prix : dès qu'on entre, la présentatrice monte au pupitre,
//     annonce les quatre prix et leurs gagnants — les vrais premiers des classements de la semaine —, l'écran les montre,
//     la salle applaudit, les confettis tombent. Puis : « la fête continue à l'Amazone ». La cérémonie recommence pour
//     ceux qui arrivent après.
//  2. À l'Amazone, la scène du DJ (celle du teaser) : on s'approche et on lui demande de lancer le son ; il passe de
//     l'afrobeat, du coupé-décalé, de l'amapiano (musique.js : composés par le jeu, sans droits à payer), la foule danse,
//     les projecteurs balaient. « Un autre son » change de style, « Couper le son » arrête ; en s'éloignant, la musique
//     s'arrête toute seule.
let S = null, T = null, ctx = {};
const nombre = n => Math.round(n).toLocaleString('fr-FR');

// ---------- 1. La remise des prix ----------
const PRIX = [
  { id: 'zem', titre: 'Roi ou Reine de Zém Run', valeur: g => `${nombre(g.s)} points` },
  { id: 'riche', titre: 'Le plus riche de Cotonou', valeur: g => `${nombre(g.f)} F` },
  { id: 'serie', titre: 'La plus longue série', valeur: g => `${g.q} journées réussies de suite` },
  { id: 'album', titre: 'Le meilleur explorateur', valeur: g => `${g.a} cartes de l’album` },
];
const C = { I: null, t: -1, pas: 0, gagnants: {}, finie: false, voix: { g: null }, confettis: null, chute: [], applaudit: 0 };
const ecran = lignes => C.I?.nuit?.ecran(lignes);
function dire(texte) {
  const P = C.I?.nuit?.presentatrice; if (!P) return;
  C.voix.g = P; ctx.retirerBulle?.(C.voix); if (P.userData.tete) ctx.bulle?.(C.voix, texte); P.userData.jouer?.('parle'); // la bulle se pose sur sa tête
  ctx.astuce?.(`La présentatrice : « ${texte} »`, 5800); // et en sous-titre, en haut : la bulle sort parfois de l'image
}
function annoncer(p) {
  dire(`Le prix « ${p.titre} »… revient à…`); son('bosse');
  ecran([{ t: 'Le prix', y: .26, taille: 80, couleur: '#e6d6ff', poids: 700 }, { t: p.titre, y: .46, taille: 110, couleur: '#F5B700' }, { t: '…', y: .7, taille: 150, couleur: '#ffffff' }]);
}
function devoiler(p) {
  const g = C.gagnants[p.id], moi = g && VIE.data?.nom && g.n === VIE.data.nom;
  if (g) {
    dire(moi ? `${g.n} ! C’est toi ! Bravo !` : `${g.n} ! Bravo !`);
    ecran([{ t: p.titre, y: .2, taille: 76, couleur: '#F5B700' }, { t: '🏆', y: .42, taille: 150, couleur: '#ffffff' }, { t: g.n, y: .64, taille: 140, couleur: '#ffffff' }, { t: p.valeur(g), y: .83, taille: 60, couleur: '#e6d6ff', poids: 600 }]);
    if (moi) ctx.ligne?.(`Tu gagnes le prix « ${p.titre} » de La Nuit Kutɔnu Vibes !`);
  } else {
    dire('Personne encore cette semaine : à toi de le gagner !');
    ecran([{ t: p.titre, y: .3, taille: 90, couleur: '#F5B700' }, { t: 'À gagner cette semaine', y: .55, taille: 90, couleur: '#ffffff' }, { t: 'Joue, grimpe au classement', y: .74, taille: 60, couleur: '#e6d6ff', poids: 600 }]);
  }
  applaudir(3.5); C.applaudit = 3.5; jeterConfettis();
  for (const d of C.I.nuit.debout) d.userData.jouer?.('acclame');
}
// Le déroulé, en secondes depuis l'entrée dans la salle ; puis la cérémonie recommence pour ceux qui arrivent.
const DEROULE = [
  [1, () => { ecran(AFFICHE_NUIT); dire('Bonsoir Cotonou ! Bienvenue à La Nuit Kutɔnu Vibes !'); }],
  [7, () => dire('Ce soir, on récompense les meilleurs joueurs de la semaine.')],
  ...PRIX.flatMap((p, k) => [[13 + k * 12, () => annoncer(p)], [17 + k * 12, () => devoiler(p)]]),
  [62, () => {
    C.finie = true; dire('Bravo à tous ! La fête continue à l’Amazone : le DJ vous attend !');
    ecran([{ t: 'La fête continue', y: .3, taille: 110, couleur: '#ffffff' }, { t: 'à l’Amazone', y: .5, taille: 130, couleur: '#F5B700' }, { t: 'Le DJ lance le son', y: .74, taille: 80, couleur: '#e6d6ff', poids: 700 }]);
    ctx.ligne?.('La remise des prix est finie : la fête continue à l’Amazone, où le DJ t’attend (« Aller à l’Amazone »).');
  }],
  [86, () => { C.t = 0; C.pas = 0; }],
];
async function lireGagnants() {
  C.gagnants = {};
  try {
    const [zem, G] = await Promise.all([premierZemRun().catch(() => null), gagnants().catch(() => ({}))]);
    C.gagnants = { zem, riche: G.riche, serie: G.serie, album: G.album };
  } catch { /* hors ligne : les prix restent « à gagner » */ }
}
// Les confettis : des petits papiers de couleur qui tombent devant la scène en tournoyant, et restent au sol.
const NC = 320;
function jeterConfettis() {
  const I = C.I; if (!I?.g) return;
  if (!C.confettis) {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(.06, .09), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), NC);
    const teintes = ['#F5B700', '#ffffff', '#1A7D52', '#e58fac', '#9b5cff', '#ff6b3c'].map(c => new THREE.Color(c));
    for (let i = 0; i < NC; i++) m.setColorAt(i, teintes[i % teintes.length]);
    m.frustumCulled = false; I.g.add(m); C.confettis = m;
  }
  const sz = I.nuit.scene.z;
  C.chute = Array.from({ length: NC }, () => ({ x: (Math.random() - .5) * 22, y: 7 + Math.random() * 2.5, z: sz - 2 - Math.random() * 16, v: .9 + Math.random() * .8, r: Math.random() * 6, w: 2 + Math.random() * 5, ph: Math.random() * 6 }));
}
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V3 = new THREE.Vector3(), UN = new THREE.Vector3(1, 1, 1);
function majConfettis(dt) {
  if (!C.confettis || !C.chute.length) return;
  let bouge = false;
  C.chute.forEach((c, i) => {
    if (c.y > .01) { c.y = Math.max(.01, c.y - c.v * dt); c.r += c.w * dt; c.x += Math.sin(c.r + c.ph) * .3 * dt; bouge = true; }
    M4.compose(V3.set(c.x, c.y, c.z), Q.setFromEuler(E.set(c.y > .01 ? c.r : -Math.PI / 2, c.ph, c.y > .01 ? c.r * .7 : 0)), UN); C.confettis.setMatrixAt(i, M4);
  });
  C.confettis.instanceMatrix.needsUpdate = true;
  if (!bouge) C.chute.length = 0; // tous au sol : on ne les recalcule plus
}
function majCeremonie(dt) {
  const I = S.lieu?.id === 'dome-sofitel' ? S.lieu : null;
  if (!I) { if (C.I) { ctx.retirerBulle?.(C.voix); C.I = null; } return; }
  if (C.I !== I) { C.I = I; C.t = 0; C.pas = 0; C.finie = false; lireGagnants(); } // on entre : la cérémonie commence
  if (!I.nuit) return;
  C.t += dt;
  while (C.pas < DEROULE.length && C.t >= DEROULE[C.pas][0]) DEROULE[C.pas++][1]();
  if (C.applaudit > 0 && (C.applaudit -= dt) <= 0) for (const d of I.nuit.debout) d.userData.jouer?.('idle');
  majConfettis(dt);
}

// ---------- 2. Le DJ de l'Amazone ----------
// La scène du teaser, 24 m au nord de la statue, tournée vers le nord : on arrive par là (« Aller à l'Amazone »).
const STYLES = [['afrobeat', 'Afrobeat'], ['coupe', 'Coupé-décalé'], ['amapiano', 'Amapiano'], ['concert', 'Mix de la Nuit']];
const DJ = { g: null, x: 0, z: 0, panneaux: [], faisceaux: [], platines: [], facade: null, cercle: null, dj: null, foule: [], son: -1, t: 0, dit: false, persos: false };
const VU = 450, PRES = 16, LOIN = 130;
function placer() { if (DJ.x) return; const c = toXZ(6.34895, 2.40755); DJ.x = c[0]; DJ.z = c[1] - 24; }
// Dans le repère de la scène (+z local : vers le nord, vers la foule) → la ville.
const monde = (x, z) => [DJ.x - x, DJ.z - z];
// Sous les projecteurs : le DJ éclairé de l'intérieur (sans vraie lampe, qui recompilerait toute la scène).
function eclairer(m, force) { m.traverse(o => { if (!o.isMesh || !o.material) return; o.material = [].concat(o.material).map(x => { const c = x.clone(); if (c.emissive) { c.emissive.copy(c.color); if (c.map) c.emissiveMap = c.map; c.emissiveIntensity = force; } return c; }); if (o.material.length === 1) o.material = o.material[0]; }); }
function construire() {
  placer();
  const g = new THREE.Group(); g.name = 'scene-dj'; g.position.set(DJ.x, 0, DJ.z); g.rotation.y = Math.PI; scene.add(g); DJ.g = g;
  const mat = (c, e = 0, ec = c) => new THREE.MeshStandardMaterial({ color: c, roughness: .5, metalness: .25, emissive: ec, emissiveIntensity: e });
  const lum = c => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const boite = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const noir = mat('#0c0c10');
  boite(14, 1.2, 6.5, mat('#121216'), 0, .6, 0); boite(14.1, .07, .07, lum('#ffb648'), 0, 1.2, 3.27);
  // Le mur de LED (8 × 4 panneaux aux couleurs qui changent) et, au milieu, l'écran rond au logo de Kutɔnu Vibes.
  for (let i = 0; i < 8; i++) for (let k = 0; k < 4; k++) {
    const x = -6.3 + i * 1.8, y = 2 + k * 1.45; if (Math.abs(x) < 2.4 && y > 2.6 && y < 6.5) continue;
    const m = new THREE.MeshBasicMaterial({ color: '#203060', toneMapped: false }), o = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.35), m); o.position.set(x, y, -2.6); g.add(o); DJ.panneaux.push({ m, i, k });
  }
  boite(14.6, 6.4, .2, noir, 0, 4.2, -2.75);
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const cx = cv.getContext('2d');
  cx.fillStyle = '#05140d'; cx.beginPath(); cx.arc(256, 256, 256, 0, 7); cx.fill();
  cx.translate(256, 256); cx.scale(9, 9); cx.translate(-24, -24);
  const anneau = new Path2D('M 13.781 29.9 A 11.8 11.8 0 1 0 13.781 18.1'); cx.lineCap = 'round';
  cx.strokeStyle = '#1A7D52'; cx.lineWidth = 7; cx.stroke(anneau); cx.strokeStyle = '#FAFAF7'; cx.lineWidth = 5; cx.stroke(anneau); cx.strokeStyle = '#242824'; cx.lineWidth = 3.9; cx.stroke(anneau);
  cx.strokeStyle = '#F5B700'; cx.lineWidth = .5; cx.setLineDash([1.6, 1.4]); cx.stroke(anneau); cx.fillStyle = '#F5B700'; cx.beginPath(); cx.arc(24, 24, 1.45, 0, 7); cx.fill();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const rond = new THREE.Mesh(new THREE.CircleGeometry(1.9, 64), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); rond.position.set(0, 4.35, -2.55); g.add(rond);
  DJ.cercle = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.08, 64), lum('#ffb648')); DJ.cercle.position.set(0, 4.35, -2.54); g.add(DJ.cercle);
  // La cabine : la table noire et sa façade lumineuse, deux platines, la table de mixage, l'ordinateur.
  boite(4.6, 1.05, .9, noir, 0, 1.72, 2.4); DJ.facade = boite(4.5, .85, .02, lum('#7b3cff'), 0, 1.72, 2.86); boite(4.62, .04, .92, lum('#ffb648'), 0, 2.26, 2.4);
  for (const x of [-1.4, 1.4]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .05, 32), mat('#1a1a1e', .5, '#8fa0ff')); p.position.set(x, 2.3, 2.4); g.add(p); DJ.platines.push(p); }
  boite(.8, .07, .55, mat('#18181c', .9, '#3cffd0'), 0, 2.3, 2.4);
  boite(.55, .03, .4, mat('#2a2a2e'), .55, 2.29, 2.1); boite(.55, .36, .02, lum('#cfe0ff'), .55, 2.47, 1.92).rotation.x = .3;
  for (const x of [-6.2, 6.2]) { boite(1.3, 3, 1.1, noir, x, 2.7, 2.2); for (const [y, r] of [[3.5, .4], [2.4, .3], [1.6, .17]]) { const c = new THREE.Mesh(new THREE.CircleGeometry(r, 32), mat('#050508', .4, '#7b3cff')); c.position.set(x, y, 2.76); g.add(c); } }
  // La structure et ses projecteurs, dont les faisceaux balaient la foule quand le son est lancé.
  const alu = mat('#9a9aa2', .15, '#ffffff');
  for (const x of [-7, 7]) boite(.25, 8, .25, alu, x, 4, -1.2); boite(14.3, .3, .3, alu, 0, 8, -1.2);
  ['#9b5cff', '#3c6bff', '#ff2b4a', '#9b5cff', '#3c6bff', '#ff2b4a', '#9b5cff'].forEach((c, i) => {
    const x = -6 + i * 2; boite(.4, .45, .4, lum(c), x, 7.65, -1);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 26, 24, 1, true).translate(0, -13, 0), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const pv = new THREE.Group(); pv.position.set(x, 7.6, -1); pv.add(cone); pv.visible = false; g.add(pv); DJ.faisceaux.push({ pv, i });
  });
  // On ne traverse pas la scène : c'est un mur pour le salon (sols.js), tant qu'elle est là.
  poserSol(g, (lx, lz) => (DJ.g?.visible && Math.abs(lx) < 7.6 && lz > -3.3 && lz < 3.5 ? MUR : null), 12);
}
// Le DJ derrière sa table, le casque sur la tête ; la foule devant la scène. Les personnages animés arrivent après la ville.
function personnages() {
  if (DJ.persos) return; DJ.persos = true;
  chargerDanses?.();
  const m = personne(9300, { femme: false }); m.position.set(0, 1.2, 1.55); DJ.g.add(m); m.userData.jouer?.('idle'); DJ.dj = m; eclairer(m, .45);
  let tete = null; m.traverse(o => { if (!tete && o.isBone && /head$/i.test(o.name)) tete = o; });
  if (tete) {
    const v = new THREE.Vector3(); tete.getWorldScale(v);
    const casque = new THREE.Group(), noir = new THREE.MeshStandardMaterial({ color: '#111', roughness: .4, metalness: .6 }), or = new THREE.MeshBasicMaterial({ color: '#ffb648' });
    const arceau = new THREE.Mesh(new THREE.TorusGeometry(.105, .014, 8, 24, Math.PI), noir); arceau.position.y = .1; casque.add(arceau);
    for (const s of [-1, 1]) { for (const [r, mm] of [[.045, noir], [.036, or]]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .035 + (mm === or ? .002 : 0), 20), mm); e.rotation.z = Math.PI / 2; e.position.set(s * .1, .07, 0); casque.add(e); } }
    casque.scale.setScalar(1 / v.x); tete.add(casque);
  }
  for (let i = 0; i < 18; i++) {
    const p = personne(9500 + i * 31, { femme: i % 2 === 0 }), rang = Math.floor(i / 6), col = i % 6;
    const lx = (col - 2.5) * 1.9 + (Math.random() - .5) * .8 + (rang % 2) * .9, lz = 6 + rang * 2.4 + Math.random() * .8, [x, z] = monde(lx, lz);
    p.position.set(x, 0, z); p.rotation.y = Math.atan2(DJ.x - x, DJ.z - z) + (Math.random() - .5) * .4; // vers la scène
    p.userData.jouer?.('idle'); scene.add(p); DJ.foule.push(p);
  }
}
const DANSES = ['acclame', 'danse1', 'acclame', 'danse2', 'danse1', 'acclame'];
function lancer(k) {
  const premier = DJ.son < 0; DJ.son = k;
  if (AUDIO.radio) { radio(false); ctx.ligne?.('La radio s’arrête : c’est le DJ qui met l’ambiance.'); }
  musiqueForcee(STYLES[k][0]); son('bosse');
  DJ.foule.forEach((p, i) => p.userData.jouer?.(DANSES[(i * 5) % DANSES.length]));
  DJ.dj?.userData.jouer?.('danse2');
  for (const f of DJ.faisceaux) f.pv.visible = true;
  if (DJ.dj?.userData.tete) { if (DJ.voix) ctx.retirerBulle?.(DJ.voix); DJ.voix = { g: DJ.dj }; ctx.bulle?.(DJ.voix, premier ? 'C’est parti, Cotonou ! On met l’ambiance !' : `Et maintenant… ${STYLES[k][1]} !`); }
  ctx.ligne?.(`Le DJ lance le son : ${STYLES[k][1]}. Danse avec la foule (Gestes → Danser) !`);
  ctx.astuce?.(`Le DJ lance le son : ${STYLES[k][1]}`, 4000);
}
function couper(dire = true) {
  if (DJ.son < 0) return; DJ.son = -1; musiqueForcee(null); if (DJ.voix) ctx.retirerBulle?.(DJ.voix);
  DJ.foule.forEach(p => p.userData.jouer?.('idle')); DJ.dj?.userData.jouer?.('idle');
  for (const f of DJ.faisceaux) f.pv.visible = false;
  if (dire) ctx.ligne?.('Le DJ coupe le son. Reviens quand tu veux : il relance la fête.');
}
const PAL = [['#ff3b1f', '#ff7a1a'], ['#7b3cff', '#3c6bff'], ['#ff1f6b', '#9b5cff']];
function majDJ(dt) {
  placer();
  const dehors = !S.lieu && ['pied', 'conduit', 'passager'].includes(T.mode), d = Math.hypot(S.x - DJ.x, S.z - DJ.z);
  if (!dehors || d > VU) { if (DJ.g?.visible) { DJ.g.visible = false; for (const p of DJ.foule) p.visible = false; } if (DJ.son >= 0 && (!dehors || d > LOIN)) couper(false); return; }
  if (!DJ.g) construire();
  if (!DJ.g.visible) { DJ.g.visible = true; for (const p of DJ.foule) p.visible = true; }
  if (d < 160) personnages();
  if (DJ.son >= 0 && d > LOIN) { couper(false); ctx.ligne?.('Tu t’éloignes de l’Amazone : le son du DJ s’éteint derrière toi.'); }
  if (!DJ.dit && d < 60 && T.mode === 'pied') { DJ.dit = true; ctx.ligne?.('Le DJ de La Nuit Kutɔnu Vibes est sur la scène : approche-toi et demande-lui de lancer le son.'); }
  if (d > 220) return;
  const t = DJ.t += dt, ph = Math.floor(t / 1.6) % 3, fete = DJ.son >= 0;
  for (const { m, i, k } of DJ.panneaux) { if (fete) { const [a, b] = PAL[ph]; m.color.set((i + k + Math.floor(t * 4)) % 2 ? a : b).multiplyScalar(.75 + .25 * Math.sin(t * 6 + i)); } else m.color.set('#1b2a55').multiplyScalar(.6 + .2 * Math.sin(t * .8 + i * .5 + k)); }
  if (fete) for (const { pv, i } of DJ.faisceaux) { pv.rotation.x = -(.55 + .35 * Math.sin(t * 1.4 + i)); pv.rotation.z = .45 * Math.sin(t * 1.1 + i * 1.9); }
  for (const p of DJ.platines) p.rotation.y += dt * (fete ? 3.5 : 0);
  DJ.facade.material.color.set(fete ? PAL[ph][0] : '#3a2a6a'); DJ.cercle.material.color.set(fete && ph === 1 ? '#3c6bff' : '#ffb648');
}

// ---------- Ce que le salon appelle ----------
export function initNuit(c) { ctx = c; S = c.S; T = c.T; }
/** À chaque image du salon. */
export function majNuit(dt) { if (!S) return; majCeremonie(dt); majDJ(dt); }
/** Les boutons du moment : aller retrouver le DJ après la cérémonie ; près de la scène, lancer le son, en changer, le couper. */
export function actionsNuit() {
  const out = []; if (!S || T.mode !== 'pied') return out;
  if (S.lieu?.id === 'dome-sofitel' && C.finie) out.push({ texte: 'Aller à l’Amazone · le DJ t’attend', f: () => ctx.aller?.('amazone') });
  if (S.lieu || !DJ.g?.visible) return out;
  const [fx, fz] = monde(0, 6); // devant la scène, au milieu
  if (Math.hypot(S.x - fx, S.z - fz) > PRES) return out;
  if (DJ.son < 0) out.push({ texte: 'Demander au DJ de lancer le son', f: () => lancer(0) });
  else { const k = (DJ.son + 1) % STYLES.length; out.push({ texte: `Un autre son · ${STYLES[k][1]}`, f: () => lancer(k) }, { texte: 'Couper le son', f: () => couper() }); }
  return out;
}
/** On quitte « Vivre à Cotonou » : le son s'arrête, la scène se cache. */
export function arreterNuit() {
  couper(false); if (C.I) { ctx.retirerBulle?.(C.voix); C.I = null; }
  if (DJ.g) { DJ.g.visible = false; for (const p of DJ.foule) p.visible = false; }
}
