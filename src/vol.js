import * as THREE from 'three';
import { moteur, moteurMaj, moteurStop, son } from './audio.js';
import { moodCur } from './ambiances.js';
import { $ } from './base.js';
import { personne } from './discussions.js';
import { INTERIEURS, dansLaPiece, declarerAeroport, guichetProche, lampeIci } from './interieurs.js';
import { K, groupeLieu, panneauTexte } from './lieux.js';
import { payerEtRecevoir, remettre } from './remise.js';
import { scene } from './scene.js';
import { oceanRing } from './ville.js';
import { VIE, acheterBillet, billet, composterBillet, premierVol } from './vie.js';
import { pisteOuidah } from './zones.js';
import { CAMERA_CABINE, HUBLOT_JET, LAMPE_CABINE, LONGUEUR_JET, PIED_ESCALIER, PLACE_CABINE, PORTE_JET, SOL_CABINE, cabine, jet, majJet } from './jet.js';

// ---------- Vol découverte : Cotonou → Ouidah en jet (salon entre amis) ----------
// On achète son billet à la billetterie du hall de l'aéroport, on passe la porte 2, le minibus de l'aéroport
// dépose au pied de l'avion (poste 12, aviation générale) et l'on monte par l'escalier. Le pilote fait le reste :
// roulage jusqu'à la piste, décollage vers l'ouest, vol à 250 m le long de la côte (Fidjrossè, la Route des
// Pêches), descente et atterrissage à Ouidah. On voit l'avion de dehors pendant tout le vol ; en l'air, le temps
// passe plus vite (×10, ×20 sur demande), sinon le trajet durerait dix minutes. Ouidah n'a pas d'aéroport : la piste en latérite près de la Porte du Non-Retour est
// inventée pour le jeu, et on le dit au joueur. Retour : billet acheté au pilote, le même vol dans l'autre sens.
// Deux avions font la navette : il y en a toujours un à chaque bout.

export const PRIX_VOL = 12000;
const NOMS = { cotonou: 'Cotonou', ouidah: 'Ouidah' };
const AUTRE = { cotonou: 'ouidah', ouidah: 'cotonou' };
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const VOL = { avions: {}, pilotes: {}, achat: false, vue: 'dehors', pilote: '', tangageAvant: null, carteT: 0, chemin: null, de: '', vers: '', phase: '', s: 0, v: 0, i: 0, arret: 0, attente: 0, accel: 10, echelle: 1, cap: 0, tangage: 0, roulis: 0, fini: false };
let S = null, T = null, ligne = () => { }, ctx = {};
const AD = { cotonou: null, ouidah: null };

// ---------- Les deux aérodromes ----------
// Cotonou : piste 06/24 et voies de circulation d'OpenStreetMap ; le petit avion stationne au poste 12, celui de
// l'aviation générale, à l'ouest de l'aérogare, et rejoint la piste par la bretelle voisine.
// Ouidah : piste fictive de 520 m entre la plage et la Route des Pêches, à l'est de l'Arène (vérifié sur les données :
// ni bâtiment, ni palmier, à 75-90 m de l'eau), presque parallèle à la côte.
function definir(L) {
  const rw = L.aero?.runway, st = L.aero?.stands?.find(s => s.ref === '12');
  if (!rw || !st || !L.ouidah) return false;
  const E = rw[0], W = rw[rw.length - 1], lu = Math.hypot(E[0] - W[0], E[1] - W[1]), u = [(E[0] - W[0]) / lu, (E[1] - W[1]) / lu];
  const a = st.pts[0], b = st.pts[st.pts.length - 1];
  AD.cotonou = { W, u, parking: b, poste: a, entree: [-3817, 1745], bretelle: [[-3723, 1874], [-3763, 1818]], cap: Math.atan2(a[0] - b[0], a[1] - b[1]) };
  const P = L.ouidah.porte, { A, B } = pisteOuidah(P), lo = Math.hypot(B[0] - A[0], B[1] - A[1]), e = [(B[0] - A[0]) / lo, (B[1] - A[1]) / lo]; // zones.js : rien n'y est construit
  const n = [e[1], -e[0]]; // vers le nord (côté route), où l'on se gare
  const pt = (d, k = 0) => [A[0] + e[0] * d + n[0] * k, A[1] + e[1] * d + n[1] * k];
  AD.ouidah = { A, B, e, n, pt, longueur: lo, parking: pt(45, 32), cap: Math.atan2(e[0], e[1]), porte: P };
  return true;
}
const le = (p, dir, d) => [p[0] + dir[0] * d, p[1] + dir[1] * d];

// Le trait de côte (anneau de l'océan, ville.js) : z de la plage pour un x donné.
function coteZ(x) {
  let best = null;
  for (let i = 1; i < oceanRing.length; i++) {
    const a = oceanRing[i - 1], b = oceanRing[i]; if (Math.abs(a.y) > 30000 || Math.abs(b.y) > 30000 || (a.x - x) * (b.x - x) > 0 || a.x === b.x) continue;
    const z = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x); if (best === null || z < best) best = z;
  }
  return best;
}
// Points de croisière au-dessus de la plage (60 m dans les terres), de x0 à x1, tous les 2 km.
function longerLaCote(x0, x1, y, v, n) {
  const pas = Math.sign(x1 - x0) * 2000;
  for (let x = x0; pas < 0 ? x >= x1 : x <= x1; x += pas) { const z = coteZ(x); if (z !== null) n.push({ x, z: z - 60, y, v }); }
}

// ---------- Plans de vol : une suite de points (x, z, hauteur, vitesse visée en m/s) ----------
// sol : roulage ; arret : secondes d'attente (on s'y arrête, et l'avion pivote vers la suite) ; dit : ce que
// dit le pilote en passant ; phase : roulage, décollage, montée, croisière, descente, atterrissage.
function plan(de) {
  const C = AD.cotonou, O = AD.ouidah, n = [];
  const sol = (p, v, o = {}) => n.push({ x: p[0], z: p[1], y: 0, v, sol: true, ...o });
  const air = (p, y, v, o = {}) => n.push({ x: p[0], z: p[1], y, v, ...o });
  if (de === 'cotonou') {
    sol(C.parking, 8, { phase: 'roulage', dit: 'Le pilote : « Bienvenue à bord ! On roule jusqu’à la piste. »' }); sol(C.poste, 9); sol(C.bretelle[0], 9); sol(C.bretelle[1], 8);
    sol(C.entree, 31, { arret: 1.5, dit: 'Le pilote : « Piste 24, autorisés au décollage. Accroche-toi ! »', phase: 'decollage' });
    const ouest = [-C.u[0], -C.u[1]];
    sol(le(C.entree, ouest, 250), 31); air(le(C.entree, ouest, 520), 20, 36, { phase: 'montee' }); air(le(C.entree, ouest, 1150), 60, 42);
    const kf = n.length; longerLaCote(-6000, -8000, 160, 50, n); n[kf].dit = 'Le pilote : « En bas, la plage de Fidjrossè. On longe la côte jusqu’à Ouidah. »';
    const k0 = n.length; longerLaCote(-10000, -28000, 250, 58, n); n[k0].phase = 'croisiere'; n[k0].dit = 'Le pilote : « 250 mètres d’altitude, 210 km/h. À gauche la mer, à droite la Route des Pêches et ses cocotiers. »';
    const z = coteZ(-30000); air([-30000, z - 60], 215, 50, { phase: 'descente', dit: 'Le pilote : « On commence la descente vers Ouidah. »' });
    air(le(O.B, O.e, 3500), 175, 42); air(le(O.B, O.e, 1600), 85, 37, { dit: 'Le pilote : « Voilà Ouidah ! Devant, la piste en terre rouge. »' }); air(le(O.B, O.e, 600), 33, 34);
    air(O.B, 6, 32, { phase: 'atterrissage' }); sol(le(O.B, O.e, -110), 30, { touche: true });
    sol(O.pt(140), 9); sol(O.pt(60), 7); sol(O.pt(50, 14), 5); sol(O.parking, 0);
  } else {
    sol(O.parking, 7, { phase: 'roulage', dit: 'Le pilote : « Bienvenue à bord ! Retour sur Cotonou. »' }); sol(O.pt(30, 12), 7);
    sol(O.pt(12), 31, { arret: 1.5, dit: 'Le pilote : « Piste dégagée, on décolle. Accroche-toi ! »', phase: 'decollage' });
    sol(O.pt(260), 31); air(O.pt(520), 22, 36, { phase: 'montee' }); air(le(O.B, O.e, 700), 70, 42); air(le(O.B, O.e, 2200), 140, 48);
    const k0 = n.length; longerLaCote(Math.ceil((O.B[0] + 5000) / 2000) * 2000, -11500, 250, 58, n); n[k0].phase = 'croisiere'; n[k0].dit = 'Le pilote : « 250 mètres d’altitude, 210 km/h. On longe la côte jusqu’à Cotonou. »';
    air([-10300, 3900], 230, 50, { phase: 'descente', dit: 'Le pilote : « On descend vers Cotonou. On se pose face à l’est, piste 06. »' });
    air(le(C.W, C.u, -4500), 210, 42); air(le(C.W, C.u, -2000), 105, 37); air(le(C.W, C.u, -700), 38, 34);
    air(C.W, 7, 32, { phase: 'atterrissage' }); sol(le(C.W, C.u, 170), 30, { touche: true });
    sol(le(C.W, C.u, 560), 10); sol(C.entree, 9); sol(C.bretelle[1], 9); sol(C.bretelle[0], 9); sol(C.poste, 6); sol(C.parking, 0);
  }
  return chemin(n);
}
// Chemin continu : chaque virage est arrondi (courbe de Bézier) — quelques mètres au roulage, des centaines de
// mètres en l'air ; l'altitude et la vitesse sont lissées de la même façon (arrondi de l'arrondi à l'atterrissage).
function chemin(n) {
  const C = [], pousse = (x, y, z, v, o = {}) => C.push({ x, y, z, v, sol: o.sol, arret: o.arret, dit: o.dit, phase: o.phase, touche: o.touche });
  for (let k = 0; k < n.length; k++) {
    const p = n[k - 1], c = n[k], q = n[k + 1];
    if (!p || !q || c.arret) { pousse(c.x, c.y, c.z, c.v, c); continue; }
    const l1 = Math.hypot(c.x - p.x, c.z - p.z) || 1, l2 = Math.hypot(q.x - c.x, q.z - c.z) || 1, r = Math.min(c.sol && q.sol ? 14 : 900, l1 * .45, l2 * .45);
    const f1 = 1 - r / l1, f2 = r / l2, lerp = (a, b, f) => a + (b - a) * f;
    const a = { x: lerp(p.x, c.x, f1), y: lerp(p.y, c.y, f1), z: lerp(p.z, c.z, f1), v: lerp(p.v, c.v, f1) }, b = { x: lerp(c.x, q.x, f2), y: lerp(c.y, q.y, f2), z: lerp(c.z, q.z, f2), v: lerp(c.v, q.v, f2) };
    const N = Math.max(3, Math.ceil(r / 12));
    for (let j = 0; j <= N; j++) {
      const t = j / N, m = (u, w, s) => (1 - t) ** 2 * u + 2 * (1 - t) * t * w + t * t * s;
      pousse(m(a.x, c.x, b.x), m(a.y, c.y, b.y), m(a.z, c.z, b.z), m(a.v, c.v, b.v), { sol: c.sol, ...(j === N >> 1 ? c : {}), arret: 0 });
    }
  }
  let s = 0; C.forEach((c, k) => { if (k) s += Math.hypot(c.x - C[k - 1].x, c.y - C[k - 1].y, c.z - C[k - 1].z); c.s = s; });
  C.arrets = C.map((c, k) => (c.arret ? k : -1)).filter(k => k >= 0).concat(C.length - 1);
  return C;
}

// ---------- L'avion : le jet de Kutɔnu Vibes (jet.js) ----------
/** Un avion : groupe orienté (cap, tangage, roulis) autour du modèle. */
export function creerAvion() {
  const A = { g: new THREE.Group(), modele: jet(), x: 0, y: 0, z: 0, cap: 0, tangage: 0, roulis: 0 };
  A.g.add(A.modele); scene.add(A.g); return A;
}
export function retirerAvion(A) { if (A) scene.remove(A.g); }
/** Place l'avion ; tangage > 0 : nez en haut ; roulis > 0 : penché à gauche (virage à gauche). */
export function poserAvion(A, x, y, z, cap, tangage = 0, roulis = 0) {
  Object.assign(A, { x, y, z, cap, tangage, roulis });
  A.g.position.set(x, y, z); A.g.rotation.set(-tangage, cap, -roulis, 'YXZ');
  A.modele.userData.train.visible = y < 45; // le train sort pour l'approche
}
function etiquette(texte) {
  const cv = document.createElement('canvas'); cv.width = 420; cv.height = 72; const c = cv.getContext('2d');
  c.font = '800 30px system-ui, sans-serif'; const w = Math.min(400, c.measureText(texte).width + 44);
  c.fillStyle = '#f2b705'; c.beginPath(); c.roundRect(210 - w / 2, 8, w, 54, 27); c.fill(); c.fillStyle = '#17130c'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(texte, 210, 36);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false })); sp.scale.set(.19, .033, 1); sp.renderOrder = 30; return sp;
}

// ---------- La piste fictive de Ouidah : latérite, marques, manche à air, paillote ----------
function aerodromeOuidah() {
  const O = AD.ouidah, m = [(O.A[0] + O.B[0]) / 2, (O.A[1] + O.B[1]) / 2], L = O.longueur, ang = Math.atan2(O.e[1], O.e[0]);
  const g = groupeLieu('aerodrome-ouidah', m[0], m[1], ang); g.userData.portee = 7000; // repère : +x vers l'est (B), −z vers le nord
  K.into(g, () => {
    K.boite(L + 20, .1, 20, K.mat('#a95c37', { rugosite: 1 }), 0, .05, 0).castShadow = false; // latérite
    K.boite(L + 30, .06, 30, K.mat('#8f8a4e', { rugosite: 1 }), 0, .02, 0).castShadow = false; // bas-côtés d'herbe rase
    const blanc = K.mat('#f2f1ea', { rugosite: .9 });
    for (const s of [-1, 1]) {
      for (let k = -3; k <= 3; k++) K.boite(16, .03, .9, blanc, s * (L / 2 - 4), .12, k * 2.3).castShadow = false; // seuils
      const num = panneauTexte([s < 0 ? '08' : '26'], 9, 4.5, s * (L / 2 - 30), .13, 0, 0, { fond: 'rgba(0,0,0,0)', encre: '#f2f1ea', px: 512, py: 256, police: '700 220px system-ui, sans-serif' });
      num.rotation.set(-Math.PI / 2, 0, s < 0 ? -Math.PI / 2 : Math.PI / 2); num.material.transparent = true;
    }
    for (let x = -L / 2; x <= L / 2; x += 40) for (const z of [-10.5, 10.5]) K.cyl(.32, .36, .28, 10, '#f4f4f0', x, .14, z); // pneus peints en blanc
    // Aire de stationnement au nord, manche à air, paillote d'attente et panneaux.
    K.boite(40, .08, 26, K.mat('#c9a874', { rugosite: 1 }), -L / 2 + 50, .07, -30).castShadow = false; // aire de stationnement en sable compacté
    K.cyl(.06, .08, 6.5, 8, '#cfd3d6', -L / 2 + 20, 3.25, -38);
    const manche = K.cone(.4, 2.6, 12, K.mat('#f07b1d', { face2: true }), -L / 2 + 21.2, 6.2, -38); manche.rotation.z = Math.PI / 2 + .2; // le vent de mer souffle vers les terres
    const px = -L / 2 + 62, pz = -40;
    for (const [dx, dz] of [[-3, -2.4], [3, -2.4], [-3, 2.4], [3, 2.4]]) K.cyl(.12, .14, 2.6, 6, '#7b5a3a', px + dx, 1.3, pz + dz);
    K.cone(5.2, 2.2, 10, K.mat('#b39363', { rugosite: 1, face2: true }), px, 3.6, pz).castShadow = true; // toit de paille
    for (const dz of [-1.2, 1.2]) K.boite(4, .45, .45, '#8a6440', px, .45, pz + dz);
    panneauTexte(['OUIDAH', 'Piste des vols découverte'], 5.4, 1.5, -L / 2 + 50, 2.2, -45.5, 0, { fond: '#1f5fa8', encre: '#ffffff', px: 1024, py: 285, police: '800 84px system-ui, sans-serif' });
    for (const dx of [-2.4, 2.4]) K.cyl(.07, .07, 2.6, 6, '#8f979b', -L / 2 + 50 + dx, 1.1, -45.6);
    panneauTexte(['Vol retour pour Cotonou · 12 000 F', 'Billets auprès du pilote'], 3.4, .9, px, 1.9, pz - 2.6, 0, { fond: '#f6f4ee', encre: '#1d1a16', px: 1024, py: 271, police: '700 64px system-ui, sans-serif' });
    for (let k = 0; k < 3; k++) K.cyl(.3, .3, .9, 12, '#2f5f8a', -L / 2 + 30 + k * .7, .45, -44); // fûts de carburant
  });
}

// ---------- Ce que voit le joueur : où sont les avions et les pilotes ----------
function garer(k) {
  const A = VOL.avions[k], D = AD[k]; if (!A) return;
  poserAvion(A, D.parking[0], 0, D.parking[1], D.cap); A.modele.userData.escalier.visible = true;
  etiqueter(k); placerPilote(k);
}
// Étiquette au-dessus de l'avion garé (montrée quand on est à pied, à moins de 250 m : voir majPilotes).
function etiqueter(k) {
  const A = VOL.avions[k];
  if (A.etiquette) { A.g.remove(A.etiquette); A.etiquette.material.map.dispose(); A.etiquette.material.dispose(); }
  A.etiquette = etiquette(k === 'cotonou' ? 'Vol pour Ouidah' : 'Vol retour pour Cotonou'); A.etiquette.position.y = 6.4; A.etiquette.visible = false; A.g.add(A.etiquette);
}
// Le pilote attend à côté de l'escalier, un peu devant, face à ceux qui arrivent.
function placerPilote(k) {
  const A = VOL.avions[k], p = VOL.pilotes[k]; if (!A || !p) return;
  const [x, z] = local(A, -3.4, PIED_ESCALIER[2] + 1.6), d = droite(A.cap); p.position.set(x, 0, z); p.rotation.y = Math.atan2(d[0], d[1]); p.visible = true;
}
const droite = cap => [-Math.cos(cap), Math.sin(cap)]; // à droite de l'avion qui regarde vers `cap`
const local = (A, lx, lz) => [A.x + lx * Math.cos(A.cap) + lz * Math.sin(A.cap), A.z - lx * Math.sin(A.cap) + lz * Math.cos(A.cap)]; // lx > 0 : à gauche de l'avion
const porte = A => local(A, PORTE_JET[0] + .3, PORTE_JET[2]); // la porte, à droite derrière le poste de pilotage
const piedEscalier = A => local(A, PIED_ESCALIER[0] - .3, PIED_ESCALIER[2]);

export function initVol(data, c) {
  ctx = c; S = c.S; T = c.T; ligne = c.ligne;
  declarerAeroport(data.L.aero);
  if (!definir(data.L) || !oceanRing) return;
  aerodromeOuidah();
  for (const k of ['cotonou', 'ouidah']) { VOL.avions[k] = creerAvion(); garer(k); }
  $('#volArriver')?.addEventListener('click', arriverMaintenant);
  $('#volVue')?.addEventListener('click', e => { const b = e.target.closest('[data-vue]'); if (b) choisirVue(b.dataset.vue); });
  if (import.meta.env.DEV) window.__vol = { VOL, AD, sauter: s => { const C = VOL.chemin; VOL.s = s; VOL.arret = C.arrets.findIndex(k => C[k].s >= s); VOL.attente = 0; let i = 0; while (i < C.length - 2 && C[i + 1].s <= s) i++; VOL.i = i; VOL.v = C[i].v; VOL.phase = C.slice(0, i + 1).reverse().find(c => c.phase)?.phase || ''; } }; // essais : sauter à un point du vol
}
/** De combien (x, z), avec un rayon r, entre dans un avion garé (0 : libre) : le fuselage, les réacteurs, les ailes (à hauteur de tête). */
export function obstacleAvions(x, z, r = .3) {
  let p = 0;
  const dans = (u, v, u1, u2, v2) => Math.min(u - u1, u2 - u, v2 - v); // > 0 : dedans, et de combien il faut sortir
  for (const A of Object.values(VOL.avions)) {
    if (!A?.g?.visible || A === VOL.avion) continue;
    const dx = x - A.x, dz = z - A.z, u = dx * Math.sin(A.cap) + dz * Math.cos(A.cap), v = Math.abs(dx * Math.cos(A.cap) - dz * Math.sin(A.cap)), L = LONGUEUR_JET / 2;
    p = Math.max(p, dans(u, v, -L - r, L - .3 + r, 1.06 + r), dans(u, v, -6 - r, -3.2 + r, 2.15 + r)); // fuselage, réacteurs
    const e = Math.max(0, v - .55), ba = 1.05 - e * .3; p = Math.max(p, dans(u, v, ba - (3 - e * .26) - r, ba + r, 8.1 + r)); // l'aile, en flèche
  }
  return p;
}
/** Avions garés et pilotes, cachés en Vue réelle seule (monde-reel.js) ; pas l'avion où l'on vole. */
let avionsMontres = true;
export function avionsVisibles(on) {
  if (on === avionsMontres) return; avionsMontres = on; // seulement quand on bascule : le salon gère le reste (avion d'un ami…)
  for (const A of Object.values(VOL.avions)) if (A?.g && A !== VOL.avion) A.g.visible = on;
  for (const p of Object.values(VOL.pilotes)) if (p) p.visible = on;
}
/** Les pilotes, quand on approche (les personnages animés ont eu le temps de se charger). */
function majPilotes() {
  for (const k of ['cotonou', 'ouidah']) {
    const A = VOL.avions[k]; if (!A) continue;
    const d = Math.hypot(A.x - S.x, A.z - S.z);
    if (!VOL.pilotes[k] && d < 600) { const p = personne(740 + (k === 'cotonou' ? 0 : 1), { role: 'bureau' }); scene.add(p); VOL.pilotes[k] = p; placerPilote(k); }
    if (A.etiquette) A.etiquette.visible = d < 250 && T.mode === 'pied';
    if (A !== VOL.avion) A.g.visible = ![...S.autres.values()].some(F => F.avion && Math.hypot(F.avion.x - A.x, F.avion.z - A.z) < 30); // un ami vient d'y monter : on ne voit que son avion à lui
  }
}

// ---------- Actions : billet, embarquement, accélérer la croisière ----------
export function actionsVol() {
  const out = []; if (!AD.cotonou) return out;
  if (T.mode === 'avion') return out; // en vol : « Arriver maintenant » est sur la carte du vol
  if (T.mode !== 'pied') return out;
  if (S.lieu?.id === 'aeroport-hall') {
    const g = guichetProche(S.lieu, S.x, S.z);
    if (g?.id === 'billetterie' && billet() !== 'ouidah') out.push({ texte: `Billet pour Ouidah · ${premierVol() ? 'offert' : fmt(PRIX_VOL)}`, f: () => vendre('ouidah', g.agent) });
    if (g?.id === 'porte') out.push(billet() === 'ouidah' ? { texte: 'Embarquer · vol pour Ouidah', f: () => embarquer(g) } : { texte: 'Porte 2 · il te faut un billet', f: () => ligne('Il te faut un billet pour passer : la billetterie est à gauche en entrant dans le hall, sous l’étiquette jaune.') });
    return out;
  }
  if (S.lieu) return out;
  for (const k of ['cotonou', 'ouidah']) {
    const A = VOL.avions[k]; if (!A || Math.hypot(A.x - S.x, A.z - S.z) > 10) continue;
    const vers = AUTRE[k];
    if (billet() === vers) out.push({ texte: `Monter dans l’avion · vol pour ${NOMS[vers]}`, f: () => monter(k) });
    else if (VOL.pilotes[k]) out.push({ texte: `Billet pour ${NOMS[vers]} au pilote · ${premierVol() ? 'offert' : fmt(PRIX_VOL)}`, f: () => vendre(vers, VOL.pilotes[k]) });
  }
  return out;
}
async function vendre(vers, vendeur) {
  const offert = premierVol(), prix = offert ? 0 : PRIX_VOL;
  if (VOL.achat) return; // un seul achat à la fois (deux clics rapides pendant l'enregistrement)
  if (!offert && (VIE.data?.argent ?? 0) < prix) { ligne(`Il te faut ${fmt(prix)} pour le billet. Tu as ${fmt(VIE.data?.argent ?? 0)}.`); return; }
  VOL.achat = true; const ok = await acheterBillet(vers, prix, NOMS[vers]); VOL.achat = false;
  if (!ok) { ligne('Le billet n’a pas pu être enregistré : vérifie ta connexion.'); return; }
  vendeur.userData.jouer?.('parle'); setTimeout(() => vendeur.userData.jouer?.('idle'), 2400);
  if (offert) remettre(vendeur, S.moi, 'ticket', { garder: 1.4 }); else payerEtRecevoir(S.moi, vendeur, 'ticket', S.moi, { garder: 1.4 });
  son('piece');
  ligne(vers === 'ouidah'
    ? `${offert ? 'Ton premier vol est offert !' : `Billet payé : ${fmt(prix)}.`} Embarquement porte 2, au fond du hall. (Ouidah n’a pas d’aéroport : la piste où l’on se pose est inventée pour le jeu.)`
    : `${offert ? 'Ton premier vol est offert !' : `Billet payé : ${fmt(prix)}.`} « Monte quand tu veux, on part tout de suite. »`);
}
// Porte 2 : l'agente scanne le billet, puis le minibus de l'aéroport dépose au pied de l'avion.
function embarquer(g) {
  if (VOL.minibus) return;
  g.agent.userData.jouer?.('parle');
  remettre(S.moi, g.agent, 'ticket', { garder: .5, apres: () => remettre(g.agent, S.moi, 'ticket', { garder: .8 }) });
  ligne('L’agente scanne ton billet : « Bon vol ! Le minibus vous attend. »');
  VOL.minibus = setTimeout(() => {
    VOL.minibus = null; g.agent.userData.jouer?.('idle');
    if (!S.lieu || T.mode !== 'pied') return;
    const A = VOL.avions.cotonou, d = droite(A.cap); ctx.dehors(false);
    S.x = A.x + d[0] * 12 + Math.sin(A.cap) * 8; S.z = A.z + d[1] * 12 + Math.cos(A.cap) * 8; S.cap = Math.atan2(A.x - S.x, A.z - S.z); S.saut = true;
    ligne('Le minibus de l’aéroport te dépose au pied du jet, au poste 12. Approche-toi et monte par l’escalier, à droite de l’avion.');
  }, 2600);
}
// On marche jusqu'au pied de l'escalier, on le monte, on entre par la porte ; le pilote est déjà à bord.
function monter(k) {
  const A = VOL.avions[k], pied = piedEscalier(A), p = porte(A);
  T.trans = { t: 0, duree: Math.max(.6, Math.hypot(pied[0] - S.x, pied[1] - S.z) / 1.7), de: [S.x, S.z], vers: pied, fin: () => {
    T.trans = { t: 0, duree: 1.3, de: pied, vers: p, ya: 0, yb: PORTE_JET[1], fin: () => {
      composterBillet(); if (S.moi) S.moi.visible = false;
      if (VOL.pilotes[k]) VOL.pilotes[k].visible = false;
      T.mode = 'avion'; decoller(k);
    } };
  } };
}
function decoller(k) {
  const A = VOL.avions[k];
  Object.assign(VOL, { de: k, vers: AUTRE[k], chemin: plan(k), s: 0, v: 0, i: 0, arret: 0, attente: 2, accel: 10, echelle: 1, phase: 'roulage', fini: false, cap: A.cap, tangage: 0, roulis: 0, avion: A });
  if (A.etiquette) A.etiquette.visible = false;
  A.modele.userData.escalier.visible = false; moteur('jet'); son('bosse');
  ligne(`Tu montes à bord. Le pilote démarre les réacteurs… (vol pour ${NOMS[VOL.vers]} : env. ${Math.round(VOL.chemin.at(-1).s / 1000)} km, environ 2 minutes et demie : en l’air, le temps passe dix fois plus vite)`);
  // La caméra se met de côté, presque à l'horizontale, comme on filme un avion en vol ; on retrouve la sienne à l'arrivée.
  VOL.tangageAvant = S.tangage; S.tangage = .1; S.orbite = cote(); S.saut = true;
  VOL.pilote = ''; VOL.carteT = 0; choisirVue('dehors'); montrerCarte(true);
  passer(VOL.chemin[0]);
}
// La caméra de côté : du côté de la mer, l'avion devant la côte et la ville (vers Ouidah, la mer est à gauche).
const cote = () => (VOL.vers === 'ouidah' ? -1.2 : 1.2);
const PHASES = { roulage: 'Roulage vers la piste', decollage: 'Décollage', montee: 'Montée', croisiere: 'En croisière', descente: 'Descente', atterrissage: 'Atterrissage' };
/** La carte du vol (en haut à gauche), « Arriver maintenant » et le choix de la vue ; le reste de l'écran s'efface (style.css, .en-vol). */
function montrerCarte(on) {
  $('#app')?.classList.toggle('en-vol', on); $('#volPile').hidden = !on; $('#volVue').hidden = !on;
  if (!on) choisirVue('dehors');
}
function choisirVue(v) {
  VOL.vue = v; $('#app')?.classList.toggle('vue-hublot', v === 'hublot'); $('#volHublot').hidden = v !== 'hublot';
  const C = cabine(); if (v === 'cabine' && VOL.avion) VOL.avion.modele.add(C); else { C.removeFromParent(); if (C.lampe) { lampeIci(null); C.lampe = false; } } // l'intérieur, seulement quand on le regarde
  if (v !== 'cabine' && S?.moi && T?.mode === 'avion') { S.moi.visible = false; S.moi.rotation.set(0, S.cap, 0); } // hors de la cabine, on ne se voit pas
  for (const b of document.querySelectorAll('#volVue [data-vue]')) b.setAttribute('aria-checked', String(b.dataset.vue === v));
  if (S) S.saut = true;
}
// Combien de secondes (vraies) avant d'arriver : le reste du chemin, à la vitesse prévue et au temps accéléré prévu.
function resteSecondes() {
  const C = VOL.chemin; let t = VOL.attente > 0 ? VOL.attente : 0;
  for (let k = VOL.i + 1; k < C.length; k++) {
    const a = C[k - 1], b = C[k], ds = b.s - Math.max(a.s, VOL.s); if (ds <= 0) continue;
    const v = Math.max(6, (a.v + b.v) / 2); t += ds / (v * echelle((a.y + b.y) / 2, v));
  }
  return t + C.arrets.slice(VOL.arret).reduce((n, k) => n + (C[k].arret || 0), 0) + 2;
}
function majCarte() {
  const C = VOL.chemin, A = VOL.avion, t = performance.now(); if (!C || !A || t - VOL.carteT < 250) return; VOL.carteT = t;
  $('#vcDe').textContent = NOMS[VOL.de]; $('#vcVers').textContent = NOMS[VOL.vers];
  $('#vcBarre').style.width = `${Math.min(100, VOL.s / C.at(-1).s * 100).toFixed(1)}%`;
  const alt = Math.round(A.y / 10) * 10, kmh = Math.round(VOL.v * 3.6 / 5) * 5;
  $('#vcEtat').textContent = VOL.fini ? `Arrivé à ${NOMS[VOL.vers]}` : [PHASES[VOL.phase] || '', alt > 15 ? `${alt} m` : '', kmh > 0 ? `${kmh} km/h` : ''].filter(Boolean).join(' · ');
  const r = Math.round(VOL.fini ? 0 : resteSecondes()); $('#vcReste').textContent = VOL.fini ? '' : `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
  $('#vcPilote').textContent = VOL.pilote;
  $('#volArriver').hidden = !(A.y > 15 && !VOL.fini && VOL.phase !== 'atterrissage');
}
// « Arriver maintenant » (comme dans les jeux de vie) : on saute le reste du vol, l'avion est garé à destination.
function arriverMaintenant() {
  const C = VOL.chemin; if (!C || VOL.fini || !VOL.avion) return;
  libererPlace(); // l'avion qui attendait là-bas part se garer à l'autre bout
  const n = C.length - 1;
  Object.assign(VOL, { s: C[n].s, i: n - 1, v: 0, arret: C.arrets.length - 1, attente: 0, phase: 'atterrissage', cap: Math.atan2(C[n].x - C[n - 1].x, C[n].z - C[n - 1].z), tangage: 0, roulis: 0 });
  S.saut = true; son('bosse');
}

// ---------- À chaque image, pendant le vol ----------
const angle = a => Math.atan2(Math.sin(a), Math.cos(a));
// Le temps du vol : ×3 au roulage, ×1 pendant la course au décollage et à l'atterrissage (on les voit en vrai), puis
// de plus en plus vite en montant, jusqu'à ×10 au-dessus de 100 m (×20 avec « Encore plus vite »).
const echelle = (y, v) => (y < .05 ? (v < 12 ? 3 : 1) : 1 + (VOL.accel - 1) * THREE.MathUtils.clamp((y - 15) / 85, 0, 1));
/** Renvoie le point suivi par la caméra (derrière l'avion). */
export function majVol(dt) {
  const A = VOL.avion, C = VOL.chemin; if (!A || !C) return null;
  VOL.echelle = echelle(A.y, VOL.v); const dtv = dt * VOL.echelle;
  if (VOL.attente > 0) { VOL.attente -= dt; VOL.v = 0; if (VOL.attente <= 0 && VOL.fini) { arrivee(); return null; } } // attentes au sol (moteur, alignement, arrivée) en temps réel
  else if (!VOL.fini) {
    const a = C[VOL.i], b = C[VOL.i + 1], stop = C.arrets[VOL.arret];
    const f = b ? (VOL.s - a.s) / Math.max(.001, b.s - a.s) : 1;
    let vt = b ? a.v + (b.v - a.v) * f : 0;
    const reste = C[stop].s - VOL.s; vt = Math.min(vt, Math.sqrt(2 * 1.6 * Math.max(0, reste)) + .3);
    const acc = vt > VOL.v ? (a.sol ? 3 : 1.3) : (a.sol ? 2.8 : 1.5); // au sol : course au décollage d'une dizaine de secondes
    VOL.v += THREE.MathUtils.clamp(vt - VOL.v, -acc * dtv, acc * dtv);
    VOL.s = Math.min(C[stop].s, VOL.s + VOL.v * dtv);
    while (VOL.i < C.length - 2 && VOL.s >= C[VOL.i + 1].s) { VOL.i++; passer(C[VOL.i]); }
    if (C[stop].s - VOL.s < .05) { // arrêt : alignement sur la piste, ou fin du roulage
      VOL.v = 0; VOL.arret++;
      if (stop === C.length - 1) { VOL.fini = true; VOL.attente = 2; moteurMaj(0, false); VOL.pilote = `Le pilote coupe les réacteurs. « Bienvenue à ${NOMS[VOL.vers]} ! »`; VOL.carteT = 0; ligne(VOL.pilote); }
      else VOL.attente = C[stop].arret;
    }
  }
  // Position sur le chemin, cap (pivote sur place à l'arrêt), tangage (pente + incidence en l'air), roulis (virages).
  const a = C[VOL.i], b = C[Math.min(C.length - 1, VOL.i + 1)], l = Math.max(.001, b.s - a.s), f = THREE.MathUtils.clamp((VOL.s - a.s) / l, 0, 1);
  const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, z = a.z + (b.z - a.z) * f;
  const vise = b === a ? VOL.cap : Math.atan2(b.x - a.x, b.z - a.z), sol = a.sol && b.sol && y < .05;
  const capAvant = VOL.cap, da = angle(vise - VOL.cap);
  VOL.cap = angle(VOL.cap + (sol ? THREE.MathUtils.clamp(da, -.9 * dtv, .9 * dtv) : da * (1 - Math.exp(-dtv * 4))));
  const tangVise = sol ? 0 : Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)) + .06;
  VOL.tangage += (tangVise - VOL.tangage) * (1 - Math.exp(-dt * 3));
  const omega = dtv > 0 ? angle(VOL.cap - capAvant) / dtv : 0, rouVise = sol ? 0 : THREE.MathUtils.clamp(Math.atan(VOL.v * omega / 9.81), -.55, .55);
  VOL.roulis += (rouVise - VOL.roulis) * (1 - Math.exp(-dt * 2.5));
  poserAvion(A, x, y, z, VOL.cap, VOL.tangage, VOL.roulis);
  if (VOL.fini && VOL.attente <= 0) A.modele.userData.escalier.visible = true;
  majJet(moodCur.night);
  moteurMaj(VOL.fini ? 0 : Math.max(18, VOL.v), !VOL.fini || VOL.attente > 0);
  S.x = x; S.z = z; S.y = y; S.cap = VOL.cap; S.anim = 'assis';
  majCarte();
  // Dehors, l'avion entier dans l'image : de plus loin sur un téléphone en hauteur, où l'image est étroite.
  const dist = Math.max(32, 8.5 / (Math.tan(Math.PI / 8) * innerWidth / innerHeight));
  if (VOL.vue === 'cabine') { // assis dans son fauteuil, côté terre, et la caméra de l'autre côté de l'allée
    const k = VOL.vers === 'ouidah' ? -1 : 1, P = PLACE_CABINE, [ox, oy, oz] = CAMERA_CABINE.oeil, [vx, vy, vz] = CAMERA_CABINE.vise; A.g.updateMatrixWorld(true);
    if (S.moi) {
      PLACE.makeRotationY(P.cap).setPosition(P.x * k, SOL_CABINE, P.z).premultiply(A.g.matrixWorld);
      S.moi.visible = true; S.moi.position.setFromMatrixPosition(PLACE); S.moi.quaternion.setFromRotationMatrix(PLACE); S.moi.userData.jouer?.('assis');
    }
    OEIL.set(ox * k, oy, oz).applyMatrix4(A.g.matrixWorld); VISE.set(vx * k, vy, vz).applyMatrix4(A.g.matrixWorld);
    lampeIci(LAMPE.set(...LAMPE_CABINE).applyMatrix4(A.g.matrixWorld), 4.5, 2.6); cabine().lampe = true; // la lampe des intérieurs, au plafond de la cabine
    return { x, y, z, cap: VOL.cap, dist, haut: 3, libre: true, oeil: OEIL, vise: VISE, fov: innerHeight > innerWidth ? 74 : 60, near: .1 };
  }
  if (VOL.vue === 'hublot') { // assis côté terre, devant l'aile : on regarde dehors, vers l'arrière et un peu vers le bas (l'aile, la côte)
    const k = VOL.vers === 'ouidah' ? -1 : 1, [hx, hy, hz] = HUBLOT_JET; A.g.updateMatrixWorld(true);
    OEIL.set(hx * k, hy, hz).applyMatrix4(A.g.matrixWorld); VISE.set((hx + 10) * k, hy - .7, hz - 5.5).applyMatrix4(A.g.matrixWorld);
    return { x, y, z, cap: VOL.cap, dist, haut: 3, libre: true, oeil: OEIL, vise: VISE };
  }
  return { x, y, z, cap: VOL.cap, dist, haut: 3, libre: true, orbite: cote() };
}
const OEIL = new THREE.Vector3(), VISE = new THREE.Vector3(), LAMPE = new THREE.Vector3(), PLACE = new THREE.Matrix4();
function passer(c) {
  if (c.phase) { VOL.phase = c.phase; if (c.phase === 'croisiere') libererPlace(); }
  if (c.dit) { ligne(c.dit); VOL.pilote = c.dit; VOL.carteT = 0; }
  if (c.touche) { son('bosse'); document.dispatchEvent(new CustomEvent('vibrer', { detail: 'choc' })); }
}
// En croisière (loin des deux pistes), l'avion qui attendait à destination part se garer à l'autre bout : sinon, on
// roulerait jusqu'à sa place et les deux avions seraient l'un dans l'autre.
function libererPlace() {
  const autre = VOL.avions[VOL.vers], D = AD[VOL.de]; if (!autre || autre === VOL.avion) return;
  poserAvion(autre, D.parking[0], 0, D.parking[1], D.cap);
}
// Moteur coupé : on descend par l'aile ; à Cotonou, le minibus ramène dans le hall de l'aérogare.
function arrivee() {
  const A = VOL.avion, k = VOL.vers, autre = VOL.avions[k];
  moteurStop(); montrerCarte(false); finCamera();
  // La navette : l'avion qui attendait ici part se garer à l'autre bout, celui-ci prend sa place.
  VOL.avions[k] = A; VOL.avions[VOL.de] = autre; garer(VOL.de); etiqueter(k); // celui-ci reste où il s'est arrêté
  VOL.avion = null; VOL.chemin = null; VOL.phase = '';
  A.modele.userData.escalier.visible = true;
  const p = porte(A), pied = piedEscalier(A);
  S.x = p[0]; S.z = p[1]; S.y = PORTE_JET[1]; if (S.moi) { S.moi.visible = true; S.moi.position.set(S.x, S.y, S.z); }
  if (VOL.pilotes[k]) VOL.pilotes[k].visible = false;
  T.mode = 'pied';
  T.trans = { t: 0, duree: 1.3, de: p, vers: pied, ya: PORTE_JET[1], yb: 0, fin: () => {
    S.y = 0; placerPilote(k);
    if (k === 'ouidah') {
      const P = AD.ouidah.porte;
      ligne('Bienvenue à Ouidah ! La Porte du Non-Retour est à 500 m à l’ouest, au bout de la plage, et l’Arène juste avant. (La piste est inventée pour le jeu : Ouidah n’a pas d’aéroport.)');
      S.cap = Math.atan2(P[0] - S.x, P[1] - S.z);
    } else setTimeout(() => {
      const I = INTERIEURS.get('aeroport-hall'); if (!I || T.mode !== 'pied' || S.lieu) return;
      ctx.dedans(I); const q = dansLaPiece(I, -4, I.d / 2 - 7, Math.PI); S.x = q.x; S.z = q.z; S.cap = q.cap; S.saut = true; // passé le portique de la porte 2, face au hall
      ligne('Le minibus te ramène à l’aérogare. Bienvenue à Cotonou ! La sortie (taxis, zéms) est au fond du hall.');
    }, 1800);
  } };
}
/** Quitter le salon en plein vol : l'avion retourne à son poste. */
export function arreterVol() {
  clearTimeout(VOL.minibus); VOL.minibus = null;
  if (VOL.avion) { garer(VOL.de); garer(VOL.vers); VOL.avion = null; VOL.chemin = null; VOL.phase = ''; moteurStop(); montrerCarte(false); finCamera(); } // chacun à sa place
  for (const k of Object.keys(VOL.avions)) { placerPilote(k); if (VOL.avions[k].etiquette) VOL.avions[k].etiquette.visible = false; }
}
/** Hors du vol : pilotes et étiquettes près de soi, hublots allumés la nuit. */
export function majAeroports() { if (AD.cotonou && S) { majPilotes(); majJet(moodCur.night); } }
// La caméra d'avant le vol (son inclinaison) ; elle revient derrière soi.
function finCamera() { if (VOL.tangageAvant !== null) { S.tangage = VOL.tangageAvant; VOL.tangageAvant = null; } S.orbite = 0; S.saut = true; }
/** Pour les amis : leur avion, à leur altitude. */
export const etatVol = () => ({ ta: Math.round(VOL.tangage * 100) / 100, ro: Math.round(VOL.roulis * 100) / 100 });
