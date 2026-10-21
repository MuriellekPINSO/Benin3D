import * as THREE from 'three';
import { poserTripo, tripoDispo } from './batiments-tripo.js';
import { AUDIO, audioCtx, moteur, moteurMaj, moteurStop, radio, son } from './audio.js';
import { VOIX, taire, voixActives, voixDispo } from './voix.js';
import { accident, majFeux, preparerFeux } from './regles.js';
import { PT, majPietons, marchandeReelle, preparerPietons, regarder, viderPietons } from './pietons.js';
import { annoncerDepart, arriveeDuo } from './multijoueur.js';
import { arreterMusique, demarrerMusique, musiqueQuartier } from './musique.js';
import { $, LITE, coarse, hash, toXZ } from './base.js';
import { QUARTIERS } from './donnees-lieux.js';
import { E } from './etat.js';
import { startFlight } from './interface.js';
import { VEGETATION, texteToile } from './lieux.js';
import { U, camera, controls, scene } from './scene.js';
import { TOKPA_3D, ZEMS_3D, B3, C3, matVeh, partsChevre, partsMarchande, partsTokpa, partsVoiture, partsZem } from './vehicules.js';
import { TABLIERS, mergeColored } from './ville.js';
import { chargerMasques, procession } from './egungun.js';
import { satelliteVisible } from './satellite.js';
import { photoJeu } from './google.js';
import { BORD, majBordure, majMiniCarte, nettoyerBordure, preparerBordure } from './bordure.js';
import { bulle, clientRate, collecte, departApprenti, deposerClient, dialogue, DISC, etiquetteClient, evenement, klaxonner, majDiscussions, nettoyerDiscussions, nouveauClient, nouveauSigne, placerCollecteur, preparerDiscussions, repondre } from './discussions.js';
import { assurerMissions, progDefaut, progres, rendreProgression, serieDuJour } from './missions.js';
import { etalPres, ouvrirBoutique } from './artisans.js';
import { essenceDepart, facteurEssence, majEssence } from './essence.js';
import { interagir, majInteractions } from './interactions.js';
import { METEO } from './meteo.js';
import { vibrer } from './manette.js';
import { carrefoursDe, construireReseau, itineraire, itineraireCourt, itineraireDemiTour, rueSous } from './carrefours.js';
import { ouvrirOffre } from './publicites.js';
import { dansBatiment, pietonOk, profilRoute, profondeurRue, rueRouteJeu } from './rue.js';
import { creerGuide } from './guide.js';
import { compterUneFois, lieuStats } from './statistiques.js';
import { suspendreChanson } from './lecteur.js';
import { initClassement, ouvrirClassement, placeApresCourse } from './classement.js';
import { animerMoto } from './roues.js';

// ---------- Zém Run : le jeu ----------
/** Véhicules qui prennent un client à la fois, avec négociation (zém et taxi). */
export const avecClients = v => v === 'zem' || v === 'voiture';
export const VEH = {
  zem: { nom: 'Zémidjan', vmax: 25, accel: 4.4, larg: .75, long: 2.1, places: 1, tarif: [200, 450], cam: [5.4, 2.5] },
  tokpa: { nom: 'Tokpa-tokpa', vmax: 21, accel: 3.2, larg: 1.9, long: 5, places: 14, tarif: [150, 300], cam: [12.5, 5.2] },
  voiture: { nom: 'Taxi', vmax: 27, accel: 4.6, larg: 1.8, long: 4.3, places: 1, tarif: [300, 600], cam: [9.5, 3.8] }, // à débloquer au garage (priorité 3)
};
export const QUIZ = {
  centre: [["Où se trouve le plus grand marché à ciel ouvert d'Afrique de l'Ouest ?", ['Dantokpa', 'Ganhi', 'Akpakpa'], 0], ["Dans quel quartier se dresse la cathédrale rayée de rouge et de blanc ?", ['Missèbo', 'Ganhi', 'Étoile Rouge'], 1], ["Combien de ponts relient le centre à Akpakpa ?", ['Deux', 'Trois', 'Cinq'], 1]],
  marina: [["Quel quartier est celui de l'aéroport ?", ['Cadjèhoun', 'Haie Vive', 'Ganhi'], 0], ["Quelle hauteur fait la statue de l'Amazone ?", ['12 mètres', '30 mètres', '60 mètres'], 1], ["Quel bâtiment abrite la présidence de la République ?", ['Le Palais des Congrès', 'Le Palais de la Marina', 'Sèmè One'], 1]],
  calavi: [["En quelle année est née l'Université d'Abomey-Calavi ?", ['1960', '1970', '1990'], 1], ["D'où partent les pirogues pour Ganvié ?", ['Abomey-Calavi', 'Godomey', 'Akpakpa'], 0], ["Depuis 2021, où s'arrêtent les tokpa-tokpa venus de Calavi ?", ['À Dantokpa', 'À Godomey', 'À Ganhi'], 1]],
  ouidah: [["Quel animal sacré vit au temple de Dangbé, face à la basilique ?", ['Le python', 'Le crocodile', 'La tortue'], 0], ["Combien de kilomètres mesure la Route des Esclaves, de la place Chacha à la mer ?", ['Environ 1 km', 'Environ 4 km', 'Environ 12 km'], 1], ["Quelle grande fête se tient chaque 10 janvier à Ouidah ?", ['Les Vodun Days', 'La Gaani', 'Le Festival de Porto-Novo'], 0]],
  plage: [["Le long de quelle route s'étend la plage de Fidjrossè ?", ['La route des Pêches', 'Le boulevard Saint-Michel', 'La route de Calavi'], 0], ["Comment s'appelle l'équipe nationale qui joue au stade de l'Amitié ?", ['Les Écureuils', 'Les Guépards', 'Les Lions'], 1], ["Combien de voies se rejoignent à l'Étoile Rouge ?", ['Trois', 'Cinq', 'Huit'], 1]],
};
export const LANE = 2.7, RECUL = 3; // marche arrière : 11 km/h au plus
export const JEU = { actif: false, pause: false, etat: null, objets: [], decor: null, joueur: null, ligne: null, veh: 'zem', numero: '1234', lignes: [], meilleur: {} };
JEU.prog = null; JEU.autoGaz = false; // le zém n'avance que si le joueur accélère (↑) ; relâché, il ralentit jusqu'à l'arrêt
JEU.glisser = coarse; // au doigt, façon Subway Surfers : le zém avance seul, on glisse pour changer de file, sauter, freiner (option du menu)
try { const s = JSON.parse(localStorage.getItem('zemrun') || '{}'); JEU.meilleur = s.meilleur || {}; JEU.numero = s.numero || '1234'; JEU.progSauve = s.prog; if (typeof s.glisser === 'boolean') JEU.glisser = s.glisser; } catch (e) { }
const auDoigt = () => coarse && JEU.glisser;
export const sauver = () => { try { localStorage.setItem('zemrun', JSON.stringify({ meilleur: JEU.meilleur, numero: JEU.numero, prog: JEU.prog || JEU.progSauve, autoGaz: JEU.autoGaz, glisser: JEU.glisser })); } catch (e) { } };
export const fmtF = n => `${Math.round(n).toLocaleString('fr-FR')}\u00a0F`; // espace insécable : « 2 000 » et « F » restent sur la même ligne

// Lissage (Chaikin) des virages, mais seulement sur les 7 derniers mètres avant chaque coin et les 7 premiers après :
// lissées d'un bout à l'autre, les longues lignes droites d'OpenStreetMap coupaient les virages jusqu'à 15 m en
// dedans, à travers les murs et les maisons du coin (surtout après avoir tourné à un carrefour).
const COIN = 7;
export function cheminDe(pts) {
  const q = [pts[0]]; for (const b of pts) { const a = q[q.length - 1]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > .3) q.push(b); }
  arrondirDemiTours(q);
  if (q.length < 2) q.push(pts[pts.length - 1]);
  let p = [[q[0][0], q[0][1]]];
  for (let i = 1; i < q.length; i++) {
    const a = q[i - 1], b = q[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, r = Math.min(COIN, l / 2) / l;
    if (i > 1) p.push([a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]); // juste après le coin a
    if (i < q.length - 1) p.push([b[0] - (b[0] - a[0]) * r, b[1] - (b[1] - a[1]) * r]); // juste avant le coin b
    p.push([b[0], b[1]]);
  }
  for (let it = 0; it < 3; it++) { const o = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; o.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } o.push(p[p.length - 1]); p = o; }
  const cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.floor(L) + 1, X = new Float32Array(n), Z = new Float32Array(n);
  let j = 0; for (let d = 0; d < n; d++) { while (j < p.length - 2 && cum[j + 1] < d) j++; const t = (d - cum[j]) / ((cum[j + 1] - cum[j]) || 1); X[d] = p[j][0] + (p[j + 1][0] - p[j][0]) * t; Z[d] = p[j][1] + (p[j + 1][1] - p[j][1]) * t; }
  const C = { X, Z, n, L: n - 1 }; profiler(C); limiterVirages(C); return C;
}
// Là où le chemin rebrousse (on va jusqu'au carrefour ou au bout de l'impasse, puis on revient), un U de 6 m de
// large par la gauche, au lieu de pivoter sur place.
function arrondirDemiTours(q) {
  for (let i = 1; i < q.length - 1; i++) {
    const [ax, az] = q[i - 1], [bx, bz] = q[i], [cx, cz] = q[i + 1], lu = Math.hypot(bx - ax, bz - az), lv = Math.hypot(cx - bx, cz - bz);
    if (lu < 4 || lv < 4) continue;
    const ux = (bx - ax) / lu, uz = (bz - az) / lu; if ((ux * (cx - bx) + uz * (cz - bz)) / lv > -.85) continue;
    const R = 3, gx = uz, gz = -ux, ox = bx - ux * R + gx * R, oz = bz - uz * R + gz * R, U = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6 * Math.PI; U.push([ox - gx * R * Math.cos(t) + ux * R * Math.sin(t), oz - gz * R * Math.cos(t) + uz * R * Math.sin(t)]); }
    q.splice(i, 1, ...U); i += U.length - 1;
  }
}
// Vitesse possible dans les virages, mètre par mètre (le cap change de θ sur 20 m : rayon 20/θ, 6 m/s² sur le côté) :
// les virages suivent maintenant la vraie rue, un angle droit se prend à 30 km/h, un demi-tour au pas.
function limiterVirages(C) {
  const { X, Z, n } = C, lim = new Float32Array(n).fill(99), r = 10;
  for (let i = r; i < n - r; i++) {
    const a1 = Math.atan2(X[i] - X[i - r], Z[i] - Z[i - r]), a2 = Math.atan2(X[i + r] - X[i], Z[i + r] - Z[i]);
    const th = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
    if (th > .12) lim[i] = Math.max(3.5, Math.sqrt(6 * 2 * r / th));
  }
  C.lim = lim;
}
/** Vitesse à ne pas dépasser en s, pour pouvoir prendre les virages des 30 prochains mètres (en freinant à 7 m/s²). */
export const limiteVirage = (C, s) => { if (!C.lim) return 99; let m = 99; for (let d = 0; d <= 30; d += 2) { const i = Math.min(C.n - 1, Math.max(0, Math.round(s + d))); m = Math.min(m, Math.sqrt(C.lim[i] ** 2 + 2 * 7 * d)); } return m; };
// La vraie rue sous le trajet, mètre par mètre : demi-largeur de la chaussée (hw) et ligne des murs
// (front). Les files du jeu s'y resserrent, les piétons se tiennent sur le bas-côté, pas dans les murs.
function profiler(C) {
  const { X, Z, n } = C, hw = new Float32Array(n), front = new Float32Array(n), pas = 2, ech = [];
  for (let i = 0; i < n; i += pas) {
    const a = Math.max(0, i - 3), b = Math.min(n - 1, i + 3), dx = X[b] - X[a], dz = Z[b] - Z[a], l = Math.hypot(dx, dz) || 1;
    ech.push(profilRoute(X[i], Z[i], dx / l, dz / l));
  }
  // Médiane sur ~14 m : un carrefour ou une rue voisine plus large ne fait pas de saut.
  const med = (k, cle, def) => { const v = []; for (let q = Math.max(0, k - 3); q <= Math.min(ech.length - 1, k + 3); q++) if (ech[q]) v.push(ech[q][cle]); if (!v.length) return def; v.sort((u, w) => u - w); return v[v.length >> 1]; };
  const h = ech.map((e, k) => med(k, 'hw', 3.5)), f = ech.map((e, k) => med(k, 'front', 9.8));
  for (let i = 0; i < n; i++) { const k = Math.min(h.length - 1, Math.floor(i / pas)); hw[i] = h[k]; front[i] = Math.max(f[k], h[k] + 1); }
  C.hw = hw; C.front = front;
}
const ixC = (C, s) => Math.max(0, Math.min(C.n - 1, Math.round(s)));
/** Demi-largeur réelle de la chaussée au point s du trajet. */
export const demiChaussee = (C, s) => C.hw ? C.hw[ixC(C, s)] : LANE * 2.5;
/** Les 5 files du jeu resserrées dans la largeur réelle de la rue : facteur des décalages latéraux. */
export const kFiles = (C, s) => C.hw ? THREE.MathUtils.clamp((C.hw[ixC(C, s)] - .9) / (2 * LANE), .3, 1) : 1; // .3 : dans une ruelle, le bas-côté reste au bord de la chaussée, pas dans les étals
// Place libre de chaque côté du trajet avant le premier bâtiment (OpenStreetMap, Google), mètre par mètre, calculée
// à la demande : les files ±2 (bas-côté) passaient dans les façades des rues étroites, et les virages dans les coins.
const LIBRE_MAX = 6;
function libre1(C, i, cote) {
  const t = C.libre ??= new Float32Array(2 * C.n).fill(-1), k = 2 * i + (cote > 0 ? 0 : 1);
  if (t[k] >= 0) return t[k];
  const i0 = Math.max(0, i - 2), i1 = Math.min(C.n - 1, i + 2); let dx = C.X[i1] - C.X[i0], dz = C.Z[i1] - C.Z[i0]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  let r = LIBRE_MAX;
  try { for (let q = .25; q < LIBRE_MAX; q += .25) if (dansBatiment(C.X[i] - dz * cote * q, C.Z[i] + dx * cote * q)) { r = q - .25; break; } } catch { /* bâtiments pas encore chargés */ }
  return (t[k] = r);
}
// Sur toute la longueur de la moto (±1,5 m), puis en pente douce (0,5 m de côté par mètre) : le zém glisse le long d'un
// coin de maison au lieu de sauter, et son avant ne mord pas dans la façade.
function libreJeu(C, s, cote) { const i = ixC(C, s); let m = LIBRE_MAX; for (let d = -7; d <= 7; d++) { const j = i + d; if (j < 0 || j >= C.n) continue; m = Math.min(m, libre1(C, j, cote) + Math.max(0, Math.abs(d) - 1.5) * .5); } return m; }
/** Décalage latéral réel (m) d'une position de file `lat` au point s : files resserrées dans la largeur de la rue, et jamais
 *  dans un bâtiment (`m` : demi-largeur du véhicule et marge). Si l'axe lui-même est pris, on n'y touche pas. */
export function latJeu(C, s, lat, m = .6) {
  const v = lat * kFiles(C, s); if (!C.hw) return v;
  const d = libreJeu(C, s, 1) - m, g = libreJeu(C, s, -1) - m;
  return d + g < .3 ? v : THREE.MathUtils.clamp(v, -g, d);
}
/** La file f a-t-elle la place sur les prochains mètres ? (sinon on ne s'y met pas : il y a un mur) */
const placeFile = (C, s, f) => [0, 3, 6].every(d => Math.abs(latJeu(C, s + d, f * LANE) - f * LANE * kFiles(C, s + d)) < .7);
const tmpT = { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 };
/**
 * Décalage latéral d'une place sur le bas-côté, à `recul` m du bord de la chaussée, côté `cote` (+1 à droite,
 * −1 à gauche) ; null s'il n'y a pas de place (bâtiment, terre-plein, autre chaussée) même tout près du bord.
 */
export function latTrottoir(C, s, cote, recul = 1.4) {
  const i = ixC(C, s), hw = demiChaussee(C, s), front = C.front ? C.front[i] : 9.8, p = pose(C, s, 0, tmpT);
  for (const r of [Math.min(recul, front - hw - .5), Math.min(recul, front - hw - .5) * .5, .55]) {
    if (r < .3) continue;
    const lat = cote * (hw + r);
    if (pietonOk(p.x - p.dz * lat, p.z + p.dx * lat)) return lat;
  }
  return null;
}
export const tmpPose = { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 };
export function pose(C, s, lat = 0, out = tmpPose) {
  const sc = Math.max(0, Math.min(C.n - 1.001, s)), i = Math.floor(sc), t = sc - i;
  const x = C.X[i] + (C.X[i + 1] - C.X[i]) * t, z = C.Z[i] + (C.Z[i + 1] - C.Z[i]) * t;
  const i0 = Math.max(0, i - 3), i1 = Math.min(C.n - 1, i + 4); let dx = C.X[i1] - C.X[i0], dz = C.Z[i1] - C.Z[i0]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  out.x = x - dz * lat; out.z = z + dx * lat; out.dx = dx; out.dz = dz; out.a = Math.atan2(-dz, dx);
  out.y = C.H ? C.H[i] + (C.H[i + 1] - C.H[i]) * t : 0; // sur un pont, le tablier
  return out;
}
// Sur les ponts : le trajet est recentré sur le tablier qu'il suit (les grands ponts
// ont deux tabliers, un par sens, et la ligne passait parfois entre les deux) et prend
// sa hauteur. Un chemin qui passe SOUS un pont, en travers, reste au sol.
export function calerSurPonts(C) {
  const H = new Float32Array(C.n), DX = new Float32Array(C.n), DZ = new Float32Array(C.n), P = new Float32Array(C.n);
  const cs = 40, g = new Map(), cle = (x, z) => Math.floor(x / cs) + ',' + Math.floor(z / cs);
  for (const T of TABLIERS) for (let j = 1; j < T.pts.length; j++) {
    const a = T.pts[j - 1], b = T.pts[j], m = T.w / 2 + 8;
    for (let cx = Math.floor((Math.min(a[0], b[0]) - m) / cs); cx <= Math.floor((Math.max(a[0], b[0]) + m) / cs); cx++)
      for (let cz = Math.floor((Math.min(a[1], b[1]) - m) / cs); cz <= Math.floor((Math.max(a[1], b[1]) + m) / cs); cz++) { const k = cx + ',' + cz; if (!g.has(k)) g.set(k, []); g.get(k).push([T, j]); }
  }
  if (!g.size) return H;
  for (let i = 0; i < C.n; i++) {
    const l = g.get(cle(C.X[i], C.Z[i])); if (!l) continue;
    const i0 = Math.max(0, i - 3), i1 = Math.min(C.n - 1, i + 3); let dx = C.X[i1] - C.X[i0], dz = C.Z[i1] - C.Z[i0]; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    let best = null, bd = 1e9;
    for (const [T, j] of l) {
      const a = T.pts[j - 1], b = T.pts[j], ex = b[0] - a[0], ez = b[1] - a[1], el = Math.hypot(ex, ez) || 1;
      if (Math.abs((ex * dx + ez * dz) / el) < .8) continue; // en travers : on passe dessous
      const t = Math.max(0, Math.min(1, ((C.X[i] - a[0]) * ex + (C.Z[i] - a[1]) * ez) / (el * el)));
      const px = a[0] + ex * t, pz = a[1] + ez * t, d = Math.hypot(px - C.X[i], pz - C.Z[i]);
      if (d < T.w / 2 + 7 && d < bd) { bd = d; best = [px - C.X[i], pz - C.Z[i], T.h[j - 1] + (T.h[j] - T.h[j - 1]) * t]; }
    }
    if (best) { DX[i] = best[0]; DZ[i] = best[1]; H[i] = best[2]; P[i] = 1; }
  }
  // Lissage : ±4 m pour la hauteur, ±20 m pour le recentrage (pas de coup de volant).
  const lisse = (A, r) => { const o = new Float32Array(C.n); for (let i = 0; i < C.n; i++) { let s = 0; for (let k = -r; k <= r; k++) s += A[Math.max(0, Math.min(C.n - 1, i + k))]; o[i] = s / (2 * r + 1); } return o; };
  const sx = lisse(DX, 20), sz = lisse(DZ, 20), sh = lisse(H, 4);
  for (let i = 0; i < C.n; i++) { C.X[i] += sx[i]; C.Z[i] += sz[i]; }
  return sh;
}
export const GJ = {};
export function geosJeu() {
  if (GJ.zem) return;
  GJ.zem = mergeColored(partsZem({ passager: '#2f6fb0' }));
  GJ.zemB = mergeColored(partsZem({ chemise: '#f2c21b', carrosserie: '#1d1d22' }));
  GJ.tokpa = mergeColored(partsTokpa());
  GJ.voit = ['#e8e8e4', '#9da3a6', '#c8382f', '#1f2326', '#2f6fb0'].map(c => mergeColored(partsVoiture(c)));
  GJ.chevre = mergeColored(partsChevre());
  GJ.marchande = ['#e2672a', '#2f6fb0', '#8e3c8f', '#2f8a4a'].map(c => mergeColored(partsMarchande(c)));
  // Nid-de-poule : un trou noir (au fond, de l'eau boueuse) cerclé de bitume cassé, clair, qui se voit de loin ; la
  // nuit, ce bord s'éclaire un peu. Avant, un disque brun foncé sur le bitume : on ne le voyait pas, de nuit encore moins.
  const plat = g => g.rotateX(-Math.PI / 2).scale(1.3, 1, .8);
  GJ.trou = mergeColored([[plat(new THREE.CircleGeometry(.95, 20)), '#120f0c'], [plat(new THREE.CircleGeometry(.55, 16)).translate(.12, .01, .05), '#465659']]);
  GJ.trouBord = plat(new THREE.RingGeometry(.9, 1.32, 22));
  GJ.matTrouBord = new THREE.MeshStandardMaterial({ color: '#cdbb93', roughness: .9, emissive: '#8a7348', emissiveIntensity: 0 });
  GJ.travaux = mergeColored([[B3(2.2, .9, .3).translate(0, .75, 0), '#e2672a'], [B3(2.2, .22, .32).translate(0, .95, 0), '#f4f1ea'], [C3(.04, .04, .7, 6).translate(-.9, .35, 0), '#555'], [C3(.04, .04, .7, 6).translate(.9, .35, 0), '#555'], [new THREE.ConeGeometry(.22, .6, 8).translate(1.4, .3, .5), '#e2672a'], [new THREE.ConeGeometry(.22, .6, 8).translate(-1.4, .3, -.5), '#e2672a']]);
  GJ.jeton = new THREE.CylinderGeometry(.42, .42, .1, 18).rotateZ(Math.PI / 2);
  GJ.matJeton = new THREE.MeshStandardMaterial({ color: '#f2c21b', metalness: .6, roughness: .3, emissive: '#5a4300' });
  GJ.matTrou = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .2, metalness: .1 });
  GJ.phares = phares();
}
// Phares : la nuit, un faisceau éclaire la route devant soi (une tache de lumière posée sur la chaussée, sans vraie
// lampe : une lumière de plus ferait recompiler tous les matériaux de la ville).
function phares() {
  const W = 256, H = 128, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'), img = c.createImageData(W, H);
  for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) {
    const f = i / W, y = Math.abs(j / H - .5) * 2, w = .3 + .7 * f, dedans = Math.max(0, 1 - y / w) ** 1.6;
    const a = .75 * dedans * (1 - f) ** 1.4 * Math.min(1, f / .08), k = (j * W + i) * 4;
    img.data[k] = 255; img.data[k + 1] = 238; img.data[k + 2] = 196; img.data[k + 3] = Math.round(255 * a);
  }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return { geo: new THREE.PlaneGeometry(22, 8).rotateX(-Math.PI / 2).translate(12.5, .14, 0), mat: new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.25, 1.18, 1), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }) };
}
export const TYPES = {
  zem: { long: 2.1, larg: .8, saut: false, v: [8, 12.5], p: 30 },
  tokpa: { long: 5, larg: 1.9, saut: false, v: [6, 9], p: 12 },
  voiture: { long: 4.3, larg: 1.8, saut: false, v: [9, 14], p: 14 },
  trou: { long: 2.4, larg: 1.7, saut: true, v: [0, 0], p: 16 },
  travaux: { long: 1.2, larg: 2.4, saut: true, v: [0, 0], p: 9 },
  chevre: { long: 1.1, larg: .6, saut: true, v: [0, 0], p: 9, traverse: 1.6 },
  marchande: { long: .7, larg: .7, saut: false, v: [0, 0], p: 6, traverse: 1.1 },
  jeton: { long: 1, larg: 1.1, saut: false, v: [0, 0], p: 0 },
  // Procession d'Egungun : elle traverse lentement, on ne saute pas par-dessus, on freine.
  egungun: { long: 1.6, larg: 6.8, saut: false, v: [0, 0], p: 0, traverse: 1.6 },
};
export function creerObjet(type, s, file) {
  const T = TYPES[type]; let mesh;
  if (type === 'zem') {
    const m3d = hash(JEU.objets.length + s, 1) < .5 ? ZEMS_3D.moto : ZEMS_3D.zem || ZEMS_3D.moto;
    mesh = m3d ? m3d.clone() : new THREE.Mesh(hash(JEU.objets.length + s, 1) < .5 ? GJ.zem : GJ.zemB, matVeh);
  }
  else if (type === 'tokpa') { mesh = TOKPA_3D.geo ? new THREE.Mesh(TOKPA_3D.geo, TOKPA_3D.mat) : new THREE.Mesh(GJ.tokpa, matVeh); mesh.castShadow = !LITE; }
  else if (type === 'voiture') mesh = new THREE.Mesh(GJ.voit[Math.floor(hash(s, 2) * 5)], matVeh);
  else if (type === 'chevre') mesh = new THREE.Mesh(GJ.chevre, matVeh);
  else if (type === 'marchande') mesh = marchandeReelle(Math.floor(hash(s, 3) * 1e5), true) || new THREE.Mesh(GJ.marchande[Math.floor(hash(s, 3) * 4)], matVeh);
  else if (type === 'trou') { mesh = new THREE.Group(); mesh.add(new THREE.Mesh(GJ.trou, GJ.matTrou), new THREE.Mesh(GJ.trouBord, GJ.matTrouBord)); }
  else if (type === 'travaux') mesh = new THREE.Mesh(GJ.travaux, matVeh);
  else if (type === 'egungun') mesh = procession(3, Math.floor(Math.random() * 4));
  else mesh = new THREE.Mesh(GJ.jeton, GJ.matJeton);
  mesh.castShadow = type !== 'trou' && !LITE; JEU.decor.add(mesh);
  const o = { type, T, s, lat: file * LANE, v: T.v[0] + Math.random() * (T.v[1] - T.v[0]), mesh, touche: false, frole: false, dirLat: 0 };
  if (T.traverse) { const cote = Math.random() < .5 ? -1 : 1; o.lat = cote * (type === 'egungun' ? 8 : 7.5); o.dirLat = -cote * T.traverse; }
  JEU.objets.push(o); return o;
}
export function retirerObjet(o) { JEU.decor.remove(o.mesh); o.mesh.userData.liberer?.(); }

export function construireDecorLigne(L, C, debut = 1) {
  // Arrêts : zone jaune sur la file de droite, panneau au nom du quartier, passagers qui attendent.
  const g = JEU.decor;
  for (let k = Math.max(1, debut); k < L.arrets.length; k++) {
    const a = L.arrets[k], s = a.s;
    // Zone jaune sur les deux files de droite (on s'y arrête en file 1 ou 2), et un repère « ARRÊT » visible de loin.
    const z = new THREE.Mesh(new THREE.PlaneGeometry(30, LANE * 1.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f2c21b', transparent: true, opacity: .55, depthWrite: false }));
    const kz = kFiles(C, s - 12), p = pose(C, s - 12, latJeu(C, s - 12, LANE * 1.5)); z.scale.z = kz; z.position.set(p.x, p.y + .12, p.z); z.rotation.y = p.a; g.add(z);
    const rep = new THREE.Sprite(new THREE.SpriteMaterial({ map: texteToile(['▼ ARRÊT ▼'], 512, 150, '#f2c21b', '#1d1a16', '800 92px "Google Sans", system-ui, sans-serif'), depthWrite: false }));
    rep.scale.set(5.4, 1.6, 1); rep.position.set(p.x, p.y + 6.5, p.z); g.add(rep);
    const q = pose(C, s, demiChaussee(C, s) + .7); const post = new THREE.Group(); post.position.set(q.x, q.y, q.z); post.rotation.y = Math.atan2(q.dz * .6 - q.dx * .8, -q.dx * .6 - q.dz * .8);
    const mat = new THREE.Mesh(C3(.08, .08, 3.6, 6), new THREE.MeshStandardMaterial({ color: '#555' })); mat.position.set(0, 1.8, 0); post.add(mat);
    const t = texteToile(['ARRÊT', a.nom.toUpperCase()], 1024, 400, '#1d1a16', '#f2c21b', '800 110px "Google Sans", system-ui, sans-serif');
    const pan = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.25), new THREE.MeshBasicMaterial({ map: t })); pan.position.set(0, 3.9, 0); post.add(pan);
    const dos = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.25), new THREE.MeshBasicMaterial({ color: '#2b2f33' })); dos.position.set(0, 3.9, -.02); dos.rotation.y = Math.PI; post.add(dos); g.add(post);
    for (let i = 0; i < (JEU.veh === 'tokpa' ? 5 : 2); i++) {
      const si = s - 4 - i * 1.5, lat = latTrottoir(C, si, 1, 1.1 + (i % 2) * .7); if (lat === null) continue; // pas de place : personne
      const r = pose(C, si, lat), vraie = marchandeReelle(k * 31 + i * 7 + 3);
      const m = vraie || new THREE.Mesh(GJ.marchande[(k + i) % 4], matVeh); m.position.set(r.x, r.y, r.z);
      if (vraie) regarder(m, r.dz, -r.dx); else m.rotation.y = r.a + Math.PI / 2; // face à la chaussée
      g.add(m);
    }
  }
}

// Dos du gilet de moto-taxi.glb, mesuré sur le gabarit (avant vers +x).
export const NUMERO_DOS = { x: -.3, y: 1.32 };
// Arbres et palmiers à moins de 9 m du trajet : réduits à rien le temps de la course.
const ecartes = [], zero = new THREE.Matrix4().makeScale(0, 0, 0);
function degagerVegetation(C) {
  remettreVegetation();
  const cle = (x, z) => Math.floor(x / 10) + ',' + Math.floor(z / 10), pres = new Set();
  for (let i = 0; i < C.n; i += 3) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) pres.add(cle(C.X[i] + a * 10, C.Z[i] + b * 10));
  const m4 = new THREE.Matrix4();
  for (const m of VEGETATION) {
    const xz = m.userData.xz; let touche = false;
    for (let k = 0; k < m.count; k++) {
      const x = xz[2 * k], z = xz[2 * k + 1]; if (!pres.has(cle(x, z))) continue;
      let proche = false; const s0 = 0;
      for (let i = s0; i < C.n && !proche; i += 2) if ((C.X[i] - x) ** 2 + (C.Z[i] - z) ** 2 < 81) proche = true;
      if (!proche) continue;
      m.getMatrixAt(k, m4); ecartes.push([m, k, m4.clone()]); m.setMatrixAt(k, zero); touche = true;
    }
    if (touche) m.instanceMatrix.needsUpdate = true;
  }
}
function remettreVegetation() {
  const vus = new Set();
  for (const [m, k, mat] of ecartes) { m.setMatrixAt(k, mat); vus.add(m); }
  for (const m of vus) m.instanceMatrix.needsUpdate = true;
  ecartes.length = 0;
}
// Arrêts intermédiaires : il y avait jusqu'à 3,4 km entre deux arrêts (de l'Étoile Rouge à Dantokpa : 2 à 3 minutes
// sans s'arrêter, trop long). On en ajoute pour ne jamais dépasser ~850 m, devant un repère au bord de la route
// (marché, église, mosquée, pharmacie, station…) sinon au nom du quartier ; le client descend au prochain arrêt.
const ECART_ARRETS = 850, REPERES = ['marche', 'eglise', 'mosquee', 'pharmacie', 'station', 'ecole', 'sante', 'gare', 'supermarche', 'banque', 'hotel'];
export const nbIntermediaires = g => (g > 1100 ? Math.ceil(g / ECART_ARRETS) - 1 : 0);
// Les noms d'OpenStreetMap ne font pas tous un nom d'arrêt (« AGF Regard de jonction 1 », « PASE C 527 ») ; les postes
// électriques sont rangés en « poste ».
const nomPropre = n => n && n.length <= 32 && !/\d|\s{2}|\b(sté|sarl|sas|regard|jonction|direction)\b/i.test(n) && !/\s[A-Z]\.?$/.test(n) && !/^(restaurant|bar|maquis|buvette|boutique|pharmacie|station|supermarché|marché|église|mosquée|école|hôtel|banque|garage|kiosque)$/i.test(n.trim());
const nomRepere = c => (c.t === 'station' && !/station/i.test(c.nom) ? `Station ${c.nom}` : c.nom);
/** Le point du trajet C le plus proche de (x, z) : { s, d }. */
function surLeTrajet(C, x, z) {
  let best = { s: 0, d: Infinity }; for (let i = 0; i < C.n; i += 2) { const d = Math.hypot(C.X[i] - x, C.Z[i] - z); if (d < best.d) best = { s: i, d }; }
  return best;
}
function arretsIntermediaires(L, C, arrets) {
  const out = [arrets[0]], pris = new Set(arrets.map(a => a.nom)), q = { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 };
  const reperes = (L.commerces || []).filter(c => c.t !== 'poste' && c.t !== 'bureau' && nomPropre(c.nom)).map(c => ({ c, ...surLeTrajet(C, c.x, c.z) })).filter(r => r.d < 120);
  for (let k = 1; k < arrets.length; k++) {
    const A = arrets[k - 1], B = arrets[k], n = nbIntermediaires(B.s - A.s);
    for (let i = 1; i <= n; i++) {
      let s = out[out.length - 1].s + (B.s - out[out.length - 1].s) / (n - i + 2), nom = '', fait = ''; // réparti sur ce qui reste
      // Un repère au bord de la route près de l'endroit prévu : les grands repères d'abord, puis les commerces, à 70 m de
      // la route (120 m au besoin) ; jamais à moins de 300 m d'un autre arrêt.
      const prec = out[out.length - 1].s; let best = null, score = 600;
      for (const r of reperes) {
        if (r.s < prec + 300 || r.s > B.s - 300 || pris.has(nomRepere(r.c))) continue;
        const sc = Math.abs(r.s - s) + (REPERES.includes(r.c.t) ? 0 : 150) + (r.d > 70 ? 150 : 0); if (sc < score) { score = sc; best = r; }
      }
      if (best) s = best.s;
      pose(C, s, 0, q);
      const quartier = QUARTIERS_J.reduce((m, [nq, x, z]) => { const d = Math.hypot(x - q.x, z - q.z); return d < m.d ? { nom: nq, d } : m; }, { nom: '', d: 2500 }).nom;
      const rue = (L.rues || []).reduce((m, r) => { const d = Math.hypot(r.x - q.x, r.z - q.z); return d < m.d && !pris.has(r.nom) ? { nom: r.nom, d } : m; }, { nom: '', d: 900 }).nom;
      if (best) { nom = nomRepere(best.c); fait = `Un arrêt de zém devant ${nom}${quartier ? `, à ${quartier}` : ''}.`; }
      else if (quartier && !pris.has(quartier)) { nom = quartier; fait = `Un arrêt de quartier, à ${quartier}${rue ? `, sur ${rue}` : ''}.`; }
      else if (rue) { nom = rue; fait = `Un arrêt sur ${rue}${quartier ? `, à ${quartier}` : ''}.`; }
      else if (quartier && L.rues?.length) { const r = L.rues.reduce((m, r) => (Math.hypot(r.x - q.x, r.z - q.z) < Math.hypot(m.x - q.x, m.z - q.z) ? r : m)); nom = `${quartier} · ${r.nom}`; if (pris.has(nom)) continue; fait = `Un arrêt de quartier, à ${quartier}, sur ${r.nom}.`; }
      else continue; // rien pour le nommer : pas d'arrêt ici
      pris.add(nom); out.push({ nom, fait, s, petit: true });
    }
    out.push(B);
  }
  return out;
}
export function lancerLigne(L, veh) {
  geosJeu(); chargerMasques(); // les processions d'Egungun prennent les modèles 3D dès qu'ils sont là
  JEU.ligne = L; JEU.veh = veh; JEU.chemin = cheminDe(L.pts); compterUneFois('zemrun'); lieuStats('zemrun');
  const C = JEU.chemin; C.H = calerSurPonts(C);
  // Recale les arrêts sur le chemin lissé.
  const tot = L.arrets[L.arrets.length - 1].s || 1; L.arretsJ = L.arrets.map(a => ({ ...a, s: Math.min(C.L - 2, a.s / tot * C.L) }));
  L.arretsJ[0].s = 0;
  L.arretsJ = arretsIntermediaires(L, C, L.arretsJ);
  L.arretsXZ = L.arretsJ.map(a => { const p = pose(C, a.s, 0, { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 }); return [p.x, p.z]; });
  if (JEU.decor) scene.remove(JEU.decor);
  JEU.decor = new THREE.Group(); JEU.decor.renderOrder = 11; scene.add(JEU.decor);
  satelliteVisible(false);
  installerTrajet(L, C, 1, false);
  const V = VEH[veh];
  // Zém du joueur : moto-taxi détaillée de 3D monde (conducteur au gilet jaune), sinon le modèle en code.
  const detaille = veh === 'zem' && ZEMS_3D.moto;
  const taxiTripo = veh === 'voiture' && tripoDispo('voiture');
  const tokpaTripo = veh === 'tokpa' && TOKPA_3D.geo; // le vrai minibus (Tripo), sinon celui dessiné en code
  const j = detaille ? ZEMS_3D.moto.clone() : taxiTripo ? new THREE.Group() : tokpaTripo ? new THREE.Mesh(TOKPA_3D.geo, TOKPA_3D.mat) : new THREE.Mesh(mergeColored(veh === 'zem' ? partsZem({ passager: false }) : veh === 'voiture' ? partsVoiture('#f2c21b') : partsTokpa()), matVeh); j.castShadow = !LITE;
  const grp = new THREE.Group(); grp.add(j);
  if (taxiTripo) poserTripo('voiture', j, { largeur: 4.3, rot: Math.PI / 2 }); // taxi généré par Tripo
  if (veh === 'zem') { // numéro au dos du gilet
    const t = texteToile([JEU.numero || '0000'], 256, 160, '#f2c21b', '#1d5a2e', '900 120px system-ui, sans-serif');
    const d = new THREE.Mesh(new THREE.PlaneGeometry(.3, .19), new THREE.MeshBasicMaterial({ map: t })); d.rotation.y = -Math.PI / 2;
    if (detaille) d.position.set(NUMERO_DOS.x, NUMERO_DOS.y, 0); else { d.position.set(-.27, 1.38, 0); d.rotation.x = .28; }
    grp.add(d);
  }
  const faisceau = new THREE.Mesh(GJ.phares.geo, GJ.phares.mat); faisceau.renderOrder = 12; faisceau.visible = false; grp.add(faisceau); grp.userData.phares = faisceau;
  JEU.decor.add(grp); JEU.joueur = grp;
  JEU.anim?.liberer(); JEU.anim = veh === 'zem' ? animerMoto(grp, { parent: JEU.decor }) : null; // roues qui tournent, fumée, poussière (roues.js)
  JEU.etat = { s: 4, v: 0, file: 0, lat: 0, y: 0, vy: 0, vies: 3, argent: 0, passagers: veh === 'tokpa' ? 6 : 0, prochain: 1, servis: 0, manques: 0, frolements: 0, pieces: 0, invul: 0, service: 0, secousse: 0, frein: false, spawn: 40, quartier: '', temps: 0, carte: 0, casque: 0, superSaut: false, parcouru: 0, voyageurs: 0, doux: !!L.express || !Object.keys(JEU.meilleur).length };
  // Bonus achetés au garage, série de jours, le collecteur, et le premier client.
  const P = JEU.prog, st0 = JEU.etat; essenceDepart(st0);
  if (P.bonus.casque > 0) { P.bonus.casque--; st0.casque = 1; }
  if (P.bonus.saut > 0) { P.bonus.saut--; st0.superSaut = true; }
  sauver(); serieDuJour(); placerCollecteur(L, C);
  if (avecClients(veh)) setTimeout(() => { if (JEU.etat === st0 && JEU.actif) nouveauClient(st0, 1); }, 1400); else setTimeout(departApprenti, 900);
  JEU.actif = true; JEU.pause = false; E.flight = null; controls.enabled = false; controls.autoRotate = false;
  camera.near = .4; camera.updateProjectionMatrix();
  if (E.zems) E.zems.visible = false; if (E.zemsProches) E.zemsProches.visible = false; if (E.tokpas) E.tokpas.visible = false;
  document.getElementById('app').classList.add('mode-jeu');
  $('#jeuMenu').hidden = true; $('#jeuFin').hidden = true; $('#jeuHud').hidden = false; $('#jeuPause').hidden = true;
  $('#jhNom').textContent = `${L.nom} · ${V.nom}`;
  audioCtx(); moteur(veh); if (AUDIO.radio) radio(true); demarrerMusique(); suspendreChanson(true); // le lecteur YouTube recouvrirait la conduite
  const p = pose(C, 0); camera.position.set(p.x - p.dx * 30, 14, p.z - p.dz * 30); JEU.regard = new THREE.Vector3(p.x, 1, p.z); JEU.capCam = null;
  if (METEO.pluie > .3) setTimeout(() => toast('Il pleut : la route glisse, freine plus tôt', 2.4, 'mal'), 3200);
  Object.assign(G, { file: 0, changements: 0, cf: null, carrefours: 0, essence: st0.essence, plein: false });
  if (guideJeu?.actif()) toast(L.arretsJ[0].nom, 2);
  else toast(`${L.arretsJ[0].nom} · ↑ accélérer (relâche pour ralentir), ↓ freiner (à l’arrêt, appuie encore : marche arrière), U demi-tour, E interagir · arrête-toi au feu rouge`, 3.4);
}
// Tout ce qui dépend du trajet : arrêts, bord de route, gens, habillage des rues, végétation, carrefours.
function installerTrajet(L, C, debut, garderClient) {
  for (const o of [...JEU.decor.children]) if (o !== JEU.joueur) JEU.decor.remove(o);
  JEU.objets = [];
  construireDecorLigne({ arrets: L.arretsJ }, C, debut);
  preparerBordure(L, C, L.arretsJ);
  preparerDiscussions(L, C, L.arretsJ, garderClient);
  // Les murs et portails de la ville s'écartent des boutiques-conteneurs et des stations du jeu.
  const occupees = [];
  for (const it of BORD.items) {
    if (it.type === 'station') { const p = pose(C, it.s, it.lat + it.side * 6, { x: 0, z: 0, dx: 1, dz: 0, a: 0 }); occupees.push([p.x, p.z, 10]); }
    else if (it.type === 'enseigne' && /mode|coiffure|telephone|boutique|quincaillerie|garage/.test(it.t)) { const p = pose(C, it.s, it.lat + it.side * 3.4, { x: 0, z: 0, dx: 1, dz: 0, a: 0 }); occupees.push([p.x, p.z, 4.6]); }
  }
  rueRouteJeu(C, occupees);
  degagerVegetation(C);
  const bar = $('#jhArrets'); if (bar) bar.innerHTML = L.arretsJ.map((a, k) => k < debut && k ? '' : `<i${a.petit ? ' class="petit"' : ''} style="left:${(a.s / C.L * 100).toFixed(2)}%" title="${a.nom}"></i>`).join('');
  try { construireReseau(); JEU.carrefours = carrefoursDe(C); } catch (e) { console.warn('carrefours', e); JEU.carrefours = []; }
  preparerFeux(C); // feux tricolores aux carrefours (cahier des charges, priorité 1)
  preparerPietons(C); // passants sur les trottoirs et aux passages piétons
}
/** Au carrefour, ← ou → (ralenti) : on prend la rue de ce côté et le GPS recalcule jusqu'aux arrêts suivants.
 *  Quand l'itinéraire tourne et qu'on veut continuer tout droit (passer le pont, par exemple), la flèche opposée au
 *  virage prévu prend la rue d'en face, s'il n'y a pas de vraie rue de ce côté-là. */
export function virage(dir) {
  const st = JEU.etat, C = JEU.chemin, L = JEU.ligne; if (!st || !JEU.carrefours || JEU.pause) return false;
  if (st.v > 12) return false; // à plus de 43 km/h, les flèches changent de file
  const j = JEU.carrefours.find(c => c.s - st.s > -4 && c.s - st.s < 18);
  let br = j && (dir === 0 ? j.droit : dir < 0 ? j.gauche : j.droite), droit = dir === 0;
  if (j && !br && j.droit && dir === -j.sens) { br = j.droit; droit = true; }
  if (!br || st.prochain >= L.arretsJ.length) return false;
  const p = pose(C, st.s, latJeu(C, st.s, st.lat), { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 });
  const pts = itineraire(p.x, p.z, j.n, br.m, L.arretsXZ.slice(st.prochain));
  if (!pts || pts.length < 3) { toast('Pas de route par là', 1.2, 'mal'); return false; }
  appliquerItineraire(pts);
  son('piece'); toast(`${droit ? '↑ Tout droit' : dir < 0 ? '↰ À gauche' : '↱ À droite'} · itinéraire recalculé`, 1.6, 'bien'); G.carrefours++; G.cf = null;
  return true;
}
/** Demi-tour (U, arrêté ou au pas) : un U vers la gauche, on repart en sens inverse, le GPS recalcule jusqu'aux arrêts suivants. */
export function demiTour() {
  const st = JEU.etat, C = JEU.chemin, L = JEU.ligne; if (!st || JEU.pause || st.service > 0 || st.auto || st.prochain >= L.arretsJ.length) return false;
  if (Math.abs(st.v) > 3) { toast('Ralentis pour faire demi-tour', 1.2); return false; }
  const lat = latJeu(C, st.s, st.lat), p = pose(C, st.s, lat, { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 }), gx = p.dz, gz = -p.dx; // (gx, gz) : vers la gauche
  const R = THREE.MathUtils.clamp((demiChaussee(C, st.s) + lat - .6) / 2, 1.8, 3.5), boucle = [];
  for (let k = 1; k <= 6; k++) { const a = k / 6 * Math.PI, cx = p.x + gx * R, cz = p.z + gz * R; boucle.push([cx - gx * R * Math.cos(a) + p.dx * R * Math.sin(a), cz - gz * R * Math.cos(a) + p.dz * R * Math.sin(a)]); }
  // Sur la rue où l'on est ; hors du réseau des rues (une petite route), on revient d'abord sur ses pas jusqu'à lui.
  const debut = [[p.x, p.z], ...boucle], q = { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 }; let pts = null;
  for (let recul = 0; recul <= 600 && st.s - recul >= 0; recul += 8) {
    pose(C, st.s - recul, 0, q); const rue = rueSous(q.x, q.z, q.dx, q.dz); if (recul) debut.push([q.x, q.z]);
    if (rue) { pts = itineraireDemiTour(q.x, q.z, rue, L.arretsXZ.slice(st.prochain), debut); break; }
  }
  if (!pts || pts.length < 3) { toast('Pas de demi-tour possible ici', 1.4, 'mal'); return false; }
  appliquerItineraire(pts); st.v = 0; st.recul = 0;
  son('piece'); toast('↶ Demi-tour · itinéraire recalculé', 1.6, 'bien');
  return true;
}
/** Remplace le trajet par `pts` (à partir de la position du zém) et recale les arrêts restants. */
function appliquerItineraire(pts) {
  const st = JEU.etat, L = JEU.ligne, avant = JEU.chemin ? JEU.chemin.L - st.s : 0;
  const C2 = cheminDe(pts); C2.H = calerSurPonts(C2);
  if (avant && C2.L - avant > 600) setTimeout(() => toast(`Détour : ${((C2.L - avant) / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km de plus jusqu’au terminus`, 2.6, 'mal'), 900);
  let depuis = 0;
  L.arretsJ = L.arretsJ.map((a, k) => {
    if (k < st.prochain) return { ...a, s: 0 };
    const [x, z] = L.arretsXZ[k]; let best = depuis, bd = 1e18;
    for (let i = depuis; i < C2.n; i += 2) { const d = (C2.X[i] - x) ** 2 + (C2.Z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    depuis = best; return { ...a, s: Math.min(C2.L - 2, best) };
  });
  L.arretsJ[L.arretsJ.length - 1].s = C2.L - 2;
  JEU.chemin = C2; st.s = 1; st.spawn = 40; st.lat = 0; st.latM = 0; st.file = 0; st.plein = -1;
  installerTrajet(L, C2, st.prochain, true);
}
/** Client pressé (cahier des charges, priorité 3) : le GPS prend le plus court, petites rues comprises. */
export function prendreRaccourci() {
  const st = JEU.etat, C = JEU.chemin, L = JEU.ligne; if (!st || st.prochain >= L.arretsJ.length) return false;
  const p = pose(C, st.s, latJeu(C, st.s, st.lat), { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 }), q = pose(C, Math.min(C.L - 1, st.s + 18), 0, { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 });
  const avant = Math.max(0, L.arretsJ[st.prochain].s - st.s);
  const pts = itineraireCourt(p.x, p.z, q.x, q.z, L.arretsXZ.slice(st.prochain));
  if (!pts || pts.length < 3) { toast('Pas de raccourci par ici', 1.4, 'mal'); return false; }
  appliquerItineraire(pts);
  const apres = Math.max(0, L.arretsJ[st.prochain].s - st.s);
  toast(`Raccourci par les petites rues : ${Math.round(apres)} m au lieu de ${Math.round(avant)} m`, 2.4, 'bien'); son('piece');
  return true;
}
export function quitterJeu() {
  lieuStats('carte'); suspendreChanson(false);
  JEU.actif = false; moteurStop(); taire(); arreterMusique(); nettoyerBordure(); nettoyerDiscussions(); remettreVegetation(); satelliteVisible(true); rueRouteJeu(null);
  viderPietons(); if (JEU.decor) { scene.remove(JEU.decor); JEU.decor = null; }
  document.getElementById('app').classList.remove('mode-jeu');
  $('#jeu').hidden = true; controls.enabled = true; camera.near = 2; camera.fov = 45; camera.updateProjectionMatrix();
  const p = JEU.joueur ? JEU.joueur.position : controls.target; controls.target.set(p.x, 0, p.z);
  startFlight(new THREE.Vector3(p.x, 0, p.z), 900, 0.95, 0.4, 1.6);
}
// Fin de course : ce que le client a payé, puis on repart chercher un nouveau client.
let minuteurPaiement = 0;
function afficherPaiement() {
  const P = DISC.dernierPaiement, el = $('#jhPaiement'); if (!P || !el) return;
  const sup = P.supplement || 0, ecart = P.total - P.base - sup, prenom = P.nom.split(' ').slice(-1)[0];
  el.innerHTML = `<small>Course terminée</small><b>${prenom} a payé ${fmtF(P.total)}</b>`
    + `<span>${fmtF(P.base)} convenus${sup ? ` + ${fmtF(sup)} pour le raccourci` : ''}${ecart > 0 ? ` + ${fmtF(ecart)} de pourboire` : ecart < 0 ? ` − ${fmtF(-ecart)} retenus` : ''}</span>`
    + `<em>Cherche un nouveau client : quelqu’un te fera signe plus loin.</em>`;
  el.hidden = false; clearTimeout(minuteurPaiement); minuteurPaiement = setTimeout(() => { el.hidden = true; }, 4500);
}
export let toastT = 0;
// Un message à la fois, lisible : le même message n'est pas répété avant 6 s, et un message mineur (`mineur`) ne
// remplace pas celui qui est affiché. Avant, « Kpayo à gauche… » revenait 8 fois en 30 s.
const toastsVus = new Map();
export function toast(txt, d = 1.6, cls = '', mineur = false) {
  const t = performance.now(); if (toastsVus.get(txt) > t - 6000 || (mineur && toastT > 0)) return;
  toastsVus.set(txt, t); const el = $('#jhToast'); el.textContent = txt; el.className = 'jh-toast on ' + cls; toastT = d;
}
/** Petit gain affiché à côté de la recette (frôlements, pièces) au lieu d'un grand message au milieu de l'écran. */
function gainPetit(txt) { const el = $('#jhPop'); if (!el) return; el.textContent = txt; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
export function carteQuartier(a) {
  const c = $('#jhCarte'); c.querySelector('h3').textContent = a.nom; c.querySelector('p').textContent = a.fait; c.hidden = false; JEU.etat.carte = 5.5;
  const p = pose(JEU.chemin, a.s, 0, { x: 0, z: 0, dx: 1, dz: 0, a: 0 }); photoJeu($('#jhArretPhoto'), p.x, p.z);
}

export const tmpP2 = { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 };
export function sauter() { const s = JEU.etat; if (s && s.y === 0 && s.service <= 0) { s.vy = s.superSaut ? 10.5 : 7.8; son('saut'); evenement('saut'); } }
/** Le zém se range à l'abscisse `s`, du côté `side`, puis exécute `action`. */
export function arretAuto(s, side, action) { const st = JEU.etat; if (st) st.auto = { s, side, action }; }
/** Avant l'arrêt `a` : dit une fois ce qui manque pour s'y arrêter (arrêté trop tôt, pas à droite, trop vite),
 *  et retient la raison pour le message « Arrêt manqué ». */
function indiceArret(st, a) {
  if (st.service > 0) return;
  const d = a.s - st.s, dits = st.indices ??= new Set(), dire = (k, t) => { const c = `${st.prochain}|${k}`; if (!dits.has(c)) { dits.add(c); toast(t, 2.2); } };
  if (d <= 32) st.raisonArret = st.file < 1 ? 'file' : st.v >= 7.5 ? 'vite' : '';
  else if (d > 70) st.raisonArret = '';
  if (d > 32 && d < 100 && Math.abs(st.v) < .5) dire('loin', `Trop loin de l’arrêt : avance encore de ${Math.round(d - 30)} m`);
  else if (d < 75 && st.file < 1) dire('file', 'Serre à droite (→) pour t’arrêter');
  else if (d < 55 && st.v >= 7.5) dire('vite', `Ralentis (↓) : l’arrêt est dans ${Math.max(0, Math.round(d))} m`);
}
export function majJeu(dt) {
  const st = JEU.etat, C = JEU.chemin, L = JEU.ligne, V = VEH[JEU.veh];
  if (!st || JEU.pause) return;
  st.temps += dt;
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('#jhToast').className = 'jh-toast'; }
  if (st.carte > 0) { st.carte -= dt; if (st.carte <= 0) $('#jhCarte').hidden = true; }
  // Vitesse, file, saut.
  if (!st.frein && !st.freinM) st.tenu = false; // frein relâché : le prochain appui à l'arrêt fera reculer
  if (st.service > 0) { st.service -= dt; st.v = 0; }
  else if (st.auto) { // arrêt demandé en roulant (client qui fait signe, plein d'essence) : le zém se range seul
    const a = st.auto, reste = a.s - st.s; st.file = a.side;
    if (reste < -6) st.auto = null; // trop tard
    else if (reste < .9) { st.auto = null; st.v = 0; st.service = 1; a.action(); }
    else st.v = Math.min(Math.sqrt(2 * 6 * reste), st.v + V.accel * dt);
  }
  else {
    // Conduite : ↑ accélère, ↓ freine ; sans rien, la moto ralentit en roue libre jusqu'à l'arrêt.
    // Sur le bas-côté (files ±2), on roule au pas, le long des kiosques et des vendeurs.
    const vmax = Math.min(V.vmax * (1 + Math.min(.15, st.s / C.L * .2)) * facteurEssence(st) * (Math.abs(st.file) === 2 ? .3 : 1), limiteVirage(C, st.s));
    // Marche arrière, au pas : un nouvel appui sur le frein une fois arrêté. Le frein qui vient d'arrêter la moto
    // la tient arrêtée (au feu rouge, à l'arrêt), sans repartir en arrière.
    if (st.frein || st.freinM) {
      if (st.v > .05) { st.v = Math.max(0, st.v - 15 * (1 - .35 * METEO.pluie) * dt); st.recul = 0; st.tenu = true; } // route mouillée : on freine moins bien
      else if (st.tenu) st.v = Math.min(0, st.v + 5 * dt);
      else { st.recul = (st.recul || 0) + dt; if (st.recul > .45) { st.v = Math.max(-RECUL, st.v - 3 * dt); if (!st.reculVu) { st.reculVu = true; toast('Marche arrière', 1.2); } } }
    }
    else if (st.gaz || st.gazM || JEU.autoGaz || auDoigt()) {
      // Au doigt, le zém roule seul : avec un client, il garde 65 km/h (au-delà de 70, le client proteste et le pourboire
      // baisse ; sans cette limite, on ne pouvait pas rouler moins vite).
      const vm = auDoigt() && !st.gaz && !st.gazM && DISC.client?.accord && JEU.veh === 'zem' ? Math.min(vmax, 18) : vmax;
      st.v = st.v > vm ? Math.max(vm, st.v - 8 * dt) : Math.min(vm, st.v + V.accel * dt * (st.v < 6 ? 1.6 : 1));
    }
    else st.v = st.v < 0 ? Math.min(0, st.v + 5 * dt) : Math.max(0, st.v - (st.v > vmax ? 8 : 2.4) * dt);
  }
  st.s += st.v * dt; if (st.s < 1) { st.s = 1; st.v = Math.max(0, st.v); }
  st.parcouru += Math.abs(st.v) * dt; // st.s repart de 0 à chaque itinéraire recalculé (virage, demi-tour)
  majFeux(st);
  majEssence(st, dt);
  st.lat += (st.file * LANE - st.lat) * Math.min(1, dt * 9);
  if (st.y > 0 || st.vy > 0) { st.vy -= 24 * dt; st.y = Math.max(0, st.y + st.vy * dt); if (st.y === 0) st.vy = 0; }
  if (st.invul > 0) st.invul -= dt;
  if (st.secousse > 0) st.secousse -= dt;
  const kj = kFiles(C, st.s), latM = latJeu(C, st.s, st.lat, V.larg / 2 + .25), p = pose(C, st.s, latM); // files resserrées dans la vraie largeur de la rue, jamais dans un mur
  const latMAv = st.latM ?? latM; st.latM = latM;
  const j = JEU.joueur; j.position.set(p.x, p.y + st.y, p.z); j.rotation.set(0, p.a, 0);
  j.rotateX(JEU.veh === 'zem' ? Math.max(-.32, Math.min(.32, -(latM - latMAv) / Math.max(dt, .001) * .014)) : 0);
  if (C.H) { const i = Math.max(2, Math.min(C.n - 3, Math.floor(st.s))); j.rotateZ(Math.atan((C.H[i + 2] - C.H[i - 2]) / 4)); } // penché dans la rampe du pont
  if (JEU.anim) { // la moto vit : elle vibre sur la route, plonge au freinage, se cabre un peu en accélérant ; roues, fumée, poussière
    const vib = Math.min(1, Math.abs(st.v) / 6), acc = (st.v - (st.vAvant ?? st.v)) / Math.max(dt, .001); st.vAvant = st.v; st.acc = (st.acc || 0) + (acc - (st.acc || 0)) * Math.min(1, dt * 6);
    j.position.y += (Math.sin(st.temps * 31) * .006 + Math.sin(st.temps * 13.7) * .005) * vib;
    j.rotateZ(THREE.MathUtils.clamp(st.acc * .008, -.07, .04));
    JEU.anim.maj(st.v, dt, !!(st.gaz || st.gazM || JEU.autoGaz || auDoigt()) && st.acc > .3);
  }
  j.visible = true; // un accident n'est plus un clignotement : voir regles.js (constat de police ou client perdu)
  controls.target.set(p.x, 0, p.z);
  const nuit = U.uNight.value, f = j.userData.phares; if (f) { f.visible = nuit > .05; GJ.phares.mat.opacity = Math.min(1, nuit * 1.1); }
  GJ.matTrouBord.emissiveIntensity = nuit * .55;
  moteurMaj(Math.abs(st.v), true);
  // Apparition des obstacles et des jetons devant le joueur.
  const diff = Math.min(1, st.s / C.L * 1.3);
  while (st.spawn < st.s + 420 && st.spawn < C.L - 30) {
    const s = st.spawn, dansArret = L.arretsJ.some((a, k) => k && s > a.s - 70 && s < a.s + 25);
    if (!dansArret && s > 600 && s - (st.egun ?? 0) > 1600 && Math.random() < .25) { st.egun = s; creerObjet('egungun', s, 0); st.spawn += 60; continue; }
    if (!dansArret) {
      if (Math.random() < .3) { const f = Math.floor(Math.random() * 3) - 1; for (let i = 0; i < 6; i++) creerObjet('jeton', s + i * 3.2, f); }
      else {
        const types = Object.keys(TYPES).filter(t => TYPES[t].p && !(JEU.veh === 'tokpa' && t === 'chevre' && Math.random() < .5)); let tot = types.reduce((a, t) => a + TYPES[t].p, 0), r = Math.random() * tot, ty = types[0];
        for (const t of types) { r -= TYPES[t].p; if (r <= 0) { ty = t; break; } }
        const f = Math.floor(Math.random() * 3) - 1; creerObjet(ty, s, f);
        if (Math.random() < .25 + diff * .35) { const f2 = ((f + 2 + Math.floor(Math.random() * 2)) % 3) - 1; if (f2 !== f) creerObjet(Math.random() < .5 ? 'zem' : 'trou', s + 2, f2); }
      }
    }
    st.spawn += 26 + Math.random() * 30 - diff * 12;
  }
  // Mise à jour et collisions. Véhicules, gens, chèvres et travaux sont solides, avant comme après un choc : on ne
  // traverse plus rien. Seul celui qui fonce dans l'autre a l'accident ; un véhicule qui arrive derrière freine.
  const restants = [], latJ = st.latM;
  for (const o of JEU.objets) {
    if (o.T.v[1]) {
      o.vMax ??= o.v;
      const derr = st.s - o.s, sep = (o.T.long + V.long) / 2;
      if (derr > 0 && derr < sep + 10 && Math.abs((o.latM ?? o.lat) - latJ) < (o.T.larg + V.larg) / 2 + .3) { // dans notre file, juste derrière
        o.v = Math.max(0, Math.min(o.v, Math.max(0, st.v) + (derr - sep - 2) * .9)); o.bloque = (o.bloque || 0) + dt;
        if (o.bloque > 1.6 && o.latCible === undefined) o.latCible = THREE.MathUtils.clamp(st.lat + (st.lat > 0 ? -LANE : LANE), -LANE, LANE); // il double
      } else { o.bloque = 0; if (o.v < o.vMax) o.v = Math.min(o.vMax, o.v + 3 * dt); }
      if (o.latCible !== undefined) { const e = o.latCible - o.lat; o.lat += Math.sign(e) * Math.min(Math.abs(e), 2.2 * dt); if (Math.abs(e) < .01) o.latCible = undefined; }
      o.s += o.v * dt;
    }
    if (o.dirLat) o.lat += o.dirLat * dt;
    const ds = o.s - st.s;
    if (ds < -25 || Math.abs(o.lat) > (o.type === 'egungun' ? 11 : 9)) { retirerObjet(o); continue; }
    const latO = o.latM = latJeu(C, o.s, o.lat, Math.min(1.2, o.T.larg / 2 + .2)), q = pose(C, o.s, latO, tmpP2);
    o.mesh.position.set(q.x, q.y + (o.type === 'trou' ? .1 : 0), q.z); o.mesh.rotation.y = o.dirLat ? q.a + Math.sign(o.dirLat) * Math.PI / 2 : q.a;
    if (o.mesh.userData.modele) { const sg = Math.sign(o.dirLat); if (sg) regarder(o.mesh, -sg * q.dz, sg * q.dx); else { regarder(o.mesh, -q.dx, -q.dz); o.mesh.userData.jouer('idle'); } } // personnage réaliste (face à +z)
    if (o.type === 'jeton') { o.mesh.position.y = q.y + 1.1 + Math.sin(st.temps * 4 + o.s) * .15; o.mesh.rotation.y = st.temps * 3 + o.s; }
    if (o.type === 'egungun') {
      o.mesh.userData.anim(st.temps); o.mesh.rotation.y = q.a + Math.PI / 2;
      if (!o.annonce && ds < 70) { o.annonce = true; toast('Sortie d’Egungun ! Freine : on ne touche pas les revenants.', 2.6); son('klaxon'); }
      if (!o.respect && ds > 4 && ds < 32 && Math.abs(o.lat) < 7 && st.v < 3) { o.respect = true; st.argent += 100; toast('Respect aux Egungun : +100 F', 1.6, 'bien'); son('piece'); evenement('egungun'); progres('egungun', 1); }
    }
    const sepL = (o.T.long + V.long) / 2, sepT = (o.T.larg + V.larg) / 2, ecart = latO - latJ; // pleine largeur : on ne se chevauche pas
    if (Math.abs(ds) < sepL && Math.abs(ecart) < sepT) {
      if (o.type === 'jeton') { st.argent += 25; st.pieces++; son('piece'); vibrer('piece'); retirerObjet(o); if (st.pieces % 5 === 0) progres('pieces', st.pieces); continue; }
      if (o.T.saut && st.y > .55) { /* sauté */ }
      else if (o.type === 'trou') { if (!o.touche) { o.touche = true; st.v *= st.pneus > 0 ? .8 : .5; st.secousse = .35; if (!(st.pneus > 0)) { st.argent = Math.max(0, st.argent - 50); toast('Nid-de-poule ! −50 F', 1.2, 'mal'); } son('bosse'); evenement('trou'); } }
      else if (o.dirLat && st.v < 1.5) { // zém arrêté : la chèvre, la marchande ne le traversent pas
        const loin = Math.sign(ecart) || 1;
        if (Math.abs(ecart) < sepT * .7) o.dirLat = loin * Math.abs(o.dirLat); // déjà contre lui : elle s'écarte
        else if (Math.sign(o.dirLat) !== loin) o.lat -= o.dirLat * dt; // elle allait vers lui : elle attend qu'il reparte
      }
      else {
        // Solide : on sépare les deux, par le côté le moins enfoncé.
        const vo = o.T.v[1] ? o.v : 0, parCote = sepT - Math.abs(ecart) < (sepL - Math.abs(ds)) * .6;
        let fonce; // le joueur est-il celui qui rentre dans l'autre ?
        if (parCote) { // il s'est rabattu sur lui : retour dans sa file
          const cote = Math.sign(-ecart) || (st.lat >= o.lat ? 1 : -1);
          st.file = THREE.MathUtils.clamp(Math.round(o.lat / LANE) + cote, -2, 2); st.lat = (latO + cote * sepT) / kj;
          fonce = Math.abs(st.v - vo) > 3 || st.v > 6;
        } else if (ds > 0) { fonce = st.v - vo > 2.5; st.s = Math.max(1, o.s - sepL - .02); st.v = Math.min(st.v, vo); } // devant nous
        else { fonce = false; o.s = st.s - sepL - .02; o.v = Math.min(o.v, Math.max(0, st.v)); } // il nous rentre dedans par derrière : pas notre faute
        if (o.dirLat && !o.touche && fonce) o.dirLat = Math.sign(o.dirLat) * 3; // la chèvre, la marchande s'écartent en vitesse
        if (parCote && Math.abs(ecart) > sepT * .85) fonce = false; // on l'a juste frôlé de côté : ça racle, sans accident
        if (fonce && !o.touche && st.invul <= 0) {
          o.touche = true;
          if (st.casque > 0) { st.casque--; st.v *= .4; st.invul = 1.8; st.secousse = .4; son('choc'); toast('Le casque neuf a encaissé le choc !', 1.6, 'bien'); evenement('choc'); }
          else {
            st.vies--; st.v *= .2; st.invul = 1.8; st.secousse = .5; son('choc'); evenement('choc'); vibrer('choc');
            const noms = { zem: 'à l’autre zém', tokpa: 'au tokpa-tokpa', voiture: 'à la voiture', chevre: 'à la chèvre', marchande: 'à la marchande', travaux: 'aux travaux', egungun: ': on ne touche pas un Egungun' };
            toast(st.vies > 0 ? `Accident ! Attention ${noms[o.type]}` : 'Accident…', 1.6, 'mal');
            if (st.vies <= 0) { majHud(st, C, V); return finJeu(false); }
            accident(st);
          }
        } else if (!o.contact && st.v > .5) { o.contact = true; son('bosse'); } // simple contact au pas
      }
    }
    if (!o.frole && !o.touche && ds < 0 && ds > -3 && o.T.v[1] && Math.abs(ecart) < (o.T.larg + V.larg) / 2 + 1.1) { o.frole = true; st.frolements++; st.argent += 15; gainPetit('Ça passe ! +15 F'); evenement('frole'); progres('frolements', st.frolements); }
    restants.push(o);
  }
  JEU.objets = restants;
  if (corpsDuBord(st, C, V, dt)) return;
  // Arrêts : file de droite, presque à l'arrêt, dans la zone jaune.
  const a = L.arretsJ[st.prochain];
  if (a) {
    const dansZone = st.s > a.s - 32 && st.s < a.s + 6, sansClient = avecClients(JEU.veh) && !DISC.client;
    if (sansClient) { // pas de client : on passe, il faut en trouver un (quelqu'un fait signe plus loin)
      if (st.s > a.s + 6) { st.prochain++; if (st.prochain >= L.arretsJ.length) { majHud(st, C, V); return finJeu(true); } }
    } else if (dansZone && st.file >= 1 && st.v < 7.5 && st.service <= 0) {
      // Zém : le client descend et paie le prix discuté ; tokpa : l'apprenti encaisse.
      let gain;
      if (avecClients(JEU.veh)) { gain = deposerClient(); st.voyageurs++; }
      else { const n = 2 + Math.floor(Math.random() * 5); st.voyageurs += n; gain = n * (V.tarif[0] + Math.round(Math.random() * (V.tarif[1] - V.tarif[0]) / 25) * 25); st.passagers = Math.min(V.places, st.passagers + Math.floor(Math.random() * 4)); setTimeout(departApprenti, 1300); }
      st.argent += gain; st.servis++;
      st.service = 1.4; son('arret'); vibrer('arret'); toast(gain ? `${a.nom} : +${gain} F` : a.nom, 1.8, 'bien'); carteQuartier(a); st.prochain++;
      if (st.prochain >= L.arretsJ.length) { majHud(st, C, V); return setTimeout(() => finJeu(true), 1500); }
      if (avecClients(JEU.veh)) { if (JEU.veh === 'zem') collecte(st); afficherPaiement(); nouveauSigne(st.s + 140 + Math.random() * 120); }
      // Arrêt près d'un marché artisanal : la vendeuse appelle.
      const ea = pose(C, a.s, 0, { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 }), et = etalPres(ea.x, ea.z);
      if (et) {
        bulle(et.vendeuse, 'Zém ! Viens acheter un souvenir pour ta famille !', { duree: 3.2 });
        dialogue(et.nomVendeuse + ' · marché artisanal', '« Zém ! Viens acheter un souvenir pour ta famille ! »', [
          ['Voir ses objets', () => { JEU.pause = true; moteurMaj(0, false); ouvrirBoutique(et, () => { JEU.pause = false; }); }],
          ['Pas aujourd’hui', () => bulle(et.vendeuse, 'Une autre fois alors ! Bonne route !')],
        ], { defaut: 1 });
      }
    } else if (st.s > a.s + 6) {
      if (avecClients(JEU.veh)) { clientRate(a); st.passagers = 0; }
      st.manques++; st.argent = Math.max(0, st.argent - 100); toast(`Arrêt manqué : ${a.nom} −100 F${st.raisonArret === 'file' ? ' · il fallait serrer à droite' : st.raisonArret === 'vite' ? ' · trop vite' : ''}`, 2.4, 'mal'); st.prochain++;
      if (st.prochain >= L.arretsJ.length) { majHud(st, C, V); return finJeu(true); }
    } else indiceArret(st, a);
  }
  if (st.s >= C.L - 1) return finJeu(true);
  // Bord de route, monuments, plaques de rue, mini-carte.
  const rep = majBordure(st, C);
  majDiscussions(st, C, dt);
  majPietons(st, dt);
  // Carrefour devant : ce que fait le GPS, et les rues possibles en boutons (actifs une fois ralenti, juste avant).
  // Sans rien faire, on suit le GPS ; ← → (ou les boutons) prennent une autre rue, T (ou ↑ Tout droit) continue tout droit.
  const cf = JEU.carrefours?.find(c => c.s - st.s > -4 && c.s - st.s < 70), elC = $('#jhCarrefour');
  if (elC) {
    elC.hidden = !cf;
    if (cf) {
      const d = Math.max(0, Math.round(cf.s - st.s)), lent = st.v <= 12, ici = cf.s - st.s < 18, actif = ici && lent;
      const cle = `${cf.s}|${actif}|${ici}`;
      if (elC.dataset.cle !== cle) {
        elC.dataset.cle = cle; elC.className = 'jh-carrefour' + (actif ? ' maintenant' : '');
        const gps = cf.droit ? (cf.sens > 0 ? 'Le GPS tourne à droite' : 'Le GPS tourne à gauche') : 'Le GPS va tout droit';
        const b = (dir, sym, nom, k, ok) => `<button type="button" data-dir="${dir}"${ok && actif ? '' : ' disabled'} aria-label="${nom}"><i>${sym}</i><kbd>${k}</kbd></button>`;
        elC.innerHTML = `${b(-1, '↰', 'Tourner à gauche', '←', !!cf.gauche)}<span><b>${ici ? (lent ? 'À toi de choisir' : 'Ralentis pour choisir') : 'Carrefour'}<em></em></b><small>${gps}</small></span>${cf.droit ? b(0, '↑', 'Tout droit', 'T', true) : ''}${b(1, '↱', 'Tourner à droite', '→', !!cf.droite)}`;
      }
      const em = elC.querySelector('em'); if (em) em.textContent = ici ? '' : ` · ${d} m`;
    } else delete elC.dataset.cle;
  }
  majGuideJeu(st, dt);
  majInteractions(st, C, dt);
  if (st.pneus > 0) st.pneus -= dt;
  if (JEU.fini !== true && Math.floor(st.temps * 20) !== Math.floor((st.temps - dt) * 20)) majMiniCarte(st, C);
  // Caméra de poursuite : elle se lève et regarde le monument que l'on longe.
  const virageCam = JEU.capCam == null ? 0 : Math.abs(Math.atan2(Math.sin(Math.atan2(p.dx, p.dz) - JEU.capCam), Math.cos(Math.atan2(p.dx, p.dz) - JEU.capCam))); // en plein virage, on regarde la route
  const vise = rep && rep.d < 260 && rep.s > st.s - 15 && virageCam < .35 ? Math.max(0, 1 - Math.abs(st.s - rep.s) / 140) * THREE.MathUtils.clamp(st.v / 6, 0, 1) : 0; // à l'arrêt, on garde le zém dans l'image
  JEU.vise = (JEU.vise || 0) + (vise - (JEU.vise || 0)) * Math.min(1, dt * (vise < (JEU.vise || 0) ? 5 : 2.5));
  const pax = JEU.veh === 'zem' && st.passagers ? 1 : 0; // client assis derrière : la caméra se lève pour voir la route
  const [d0, h0] = V.cam, d = d0 + JEU.vise * 3 + pax * 1.1, h = h0 + JEU.vise * 2.6 + pax * .9, k = 1 - Math.exp(-dt * 5);
  const sh = st.secousse > 0 ? (Math.random() - .5) * .5 : 0;
  // Elle suit le cap du véhicule avec un temps de retard et tourne autour de lui, toujours à `d` mètres : placée d'un
  // coup dans l'axe de la route, elle passait au travers du zém dans un virage serré ou un demi-tour, et le perdait.
  const cap = Math.atan2(p.dx, p.dz); if (JEU.capCam == null) JEU.capCam = cap;
  JEU.capCam += Math.atan2(Math.sin(cap - JEU.capCam), Math.cos(cap - JEU.capCam)) * Math.min(1, dt * 3);
  const hx = Math.sin(JEU.capCam), hz = Math.cos(JEU.capCam);
  // Pas de caméra dans un mur : si une façade, un mur ou une maison se trouve entre le zém et elle, elle s'approche et se lève.
  let kc = 1; for (let i = 2; i <= 10; i++) { const f = i / 10, x = p.x - hx * d * f, z = p.z - hz * d * f; if (dansBatiment(x, z) || profondeurRue(x, z, .3) > 0) { kc = Math.max(.35, (i - 1) / 10); break; } }
  JEU.kCam = (JEU.kCam ?? 1) + (kc - (JEU.kCam ?? 1)) * Math.min(1, dt * (kc < (JEU.kCam ?? 1) ? 12 : 2));
  const cx = p.x - hx * d * JEU.kCam, cz = p.z - hz * d * JEU.kCam;
  camera.position.x += (cx - camera.position.x) * k; camera.position.z += (cz - camera.position.z) * k; camera.position.y += (h + (1 - JEU.kCam) * 2.5 + p.y + st.y * .5 - camera.position.y) * k;
  camera.position.y += sh;
  let rx = p.x + hx * 11, rz = p.z + hz * 11, ry = 1.5 + p.y;
  if (rep && JEU.vise > .01) { const w = JEU.vise * .22; rx += (rep.x - rx) * w; rz += (rep.z - rz) * w; ry += JEU.vise * 2.5; }
  JEU.regard.x = rx; JEU.regard.z = rz; JEU.regard.y += (ry - JEU.regard.y) * k; // le cap est déjà lissé : un second retard faisait regarder à côté pendant un demi-tour
  camera.lookAt(JEU.regard);
  camera.fov = 56 + st.v * .7; camera.updateProjectionMatrix();
  // Quartier traversé.
  if (Math.floor(st.temps * 4) !== Math.floor((st.temps - dt) * 4)) {
    let best = null, bd = 650; for (const [n, la, lo] of QUARTIERS_J) { const dd = Math.hypot(p.x - la, p.z - lo); if (dd < bd) { bd = dd; best = n; } }
    if (best && best !== st.quartier) { st.quartier = best; musiqueQuartier(best); const q = $('#jhQuartier'); q.textContent = `Quartier · ${best}`; q.classList.remove('on'); void q.offsetWidth; q.classList.add('on'); }
  }
  majHud(st, C, V);
}
export let QUARTIERS_J = [];
// ---------- Prise en main (la première fois) : une consigne à la fois, quand elle devient utile ----------
const G = { file: 0, changements: 0, cf: null, carrefours: 0, essence: 0, plein: false };
let guideJeu = null;
function etapesJeu() {
  const st = () => JEU.etat, clients = () => avecClients(JEU.veh), prochain = () => JEU.ligne?.arretsJ[st().prochain];
  return [
    { id: 'client', texte: () => coarse ? 'Ton client demande le prix : touche une réponse.' : 'Ton client demande le prix : clique sur une réponse, ou appuie sur [1] [2] [3].', quand: () => clients() && !!DISC.client && !DISC.client.accord && !$('#jhDialogue').hidden, fait: () => !clients() || !!DISC.client?.accord },
    { id: 'rouler', texte: () => auDoigt() ? 'Ton zém avance tout seul. Glisse le doigt vers le bas et garde-le posé pour freiner.' : coarse ? 'Maintiens « Gaz » pour rouler. Relâche pour ralentir, « Frein » pour freiner.' : 'Maintiens [↑] pour rouler. Relâche pour ralentir, [↓] pour freiner.', quand: () => true, fait: () => st().v > 8 },
    { id: 'arret', texte: () => `Bientôt l’arrêt ${prochain()?.nom || ''} : ${auDoigt() ? 'glisse à droite, puis vers le bas en gardant le doigt posé' : coarse ? 'mets-toi à droite avec ▶, puis « Frein »' : 'mets-toi à droite [→], puis freine [↓]'} dans la zone jaune. ${clients() ? 'Ton client descend et paie.' : 'L’apprenti encaisse les passagers.'}`, quand: () => { const a = prochain(); return !!a && a.s - st().s < 260 && (!clients() || !!DISC.client); }, fait: () => st().servis >= 1 },
    { id: 'files', texte: () => auDoigt() ? 'Glisse à gauche ou à droite pour changer de file et éviter les zems, les trous et les chèvres. Glisse vers le haut pour sauter par-dessus un trou.' : coarse ? '◀ ▶ : change de file pour éviter les zems, les trous et les chèvres. « Saut » : sauter par-dessus un trou.' : '[←] [→] : change de file pour éviter les zems, les trous et les chèvres. [Espace] : sauter par-dessus un trou.', quand: () => st().v > 5, fait: () => G.changements >= 1 },
    { id: 'signe', texte: () => `Pas de client à bord : quelqu’un te fait signe au bord de la route. Arrête-toi à sa hauteur, puis ${coarse ? 'le bouton E' : '[E]'}.`, quand: () => clients() && !DISC.client && st().servis >= 1, fait: () => !clients() || (st().servis >= 1 && !!DISC.client) },
    { id: 'carrefour', texte: () => `Carrefour : sans rien faire, tu suis le GPS. Pour prendre une autre rue, ralentis puis ${auDoigt() ? 'glisse à gauche ou à droite' : coarse ? '◀ ▶' : '[←] [→]'}, ou touche les boutons du panneau.`, quand: () => !$('#jhCarrefour').hidden, fait: () => G.carrefours >= 1 },
    { id: 'essence', texte: () => `Ton réservoir baisse : arrête-toi devant un vendeur de kpayo ou une station, puis ${coarse ? 'le bouton E' : '[E]'} pour faire le plein.`, quand: () => st().essence < 1, fait: () => G.plein },
    { id: 'bilan', texte: () => `Bien joué ! ${coarse ? '« Pause », en haut,' : '[Échap]'} met le jeu en pause. Quand tu quittes la course, tu vois ton bilan et ta recette va dans ta cagnotte.`, quand: () => st().servis >= 2, fait: () => false, duree: 8 },
  ];
}
function majGuideJeu(st, dt) {
  if (!guideJeu?.actif()) return;
  if (st.file !== G.file) { G.changements++; G.file = st.file; }
  const cf = JEU.carrefours?.find(c => c.s - st.s > -4 && c.s - st.s < 70); if (cf) G.cf = cf; else if (G.cf && st.s > G.cf.s) { G.carrefours++; G.cf = null; }
  if (st.essence > G.essence + .2) G.plein = true; G.essence = st.essence;
  guideJeu.maj(dt);
}
export function majHud(st, C, V) {
  $('#jhArgent').textContent = fmtF(st.argent);
  $('#jhVitesse').textContent = `${Math.round(Math.abs(st.v) * 3.6)} km/h${st.v < -.2 ? ' · marche arrière' : ''}`;
  $('#jhDemi').hidden = !(Math.abs(st.v) < 2.5 && st.service <= 0 && !st.auto && st.prochain < JEU.ligne.arretsJ.length);
  $('#jhVies').innerHTML = [0, 1, 2].map(i => `<i class="${i < st.vies ? '' : 'perdu'}"></i>`).join('');
  $('#jhProg').style.width = `${Math.min(100, st.s / C.L * 100).toFixed(1)}%`;
  const a = JEU.ligne.arretsJ[st.prochain];
  // Trop vite pour s'arrêter dans la zone jaune (freinage à 7 m/s²) : on prévient.
  const reste = a ? a.s - st.s : 0, ralentir = !!a && reste > 0 && st.v > 7.5 && reste < (st.v * st.v - 56) / 14 + 45;
  $('#jhProchain').textContent = a ? `Prochain arrêt : ${a.nom} · ${Math.max(0, Math.round(reste))} m${ralentir ? ' · Ralentis !' : ''}` : 'Terminus';
  $('#jhProchain').classList.toggle('alerte', ralentir);
  $('#jhPassagers').textContent = JEU.veh === 'tokpa' ? `${st.passagers}/${V.places} passagers` : etiquetteClient();
}
// Les gens et les étals du bord de la route (vendeuses, groupes qui causent, marcheurs, client qui fait signe) et les
// poteaux ne se traversent pas : sur le bas-côté (files ±2), on s'arrête devant eux ; trop vite, c'est l'accident.
const RAYONS = { poteau: .25, vendeuse: .7, kpayo: .7, momo: .7, vulca: .7, peinte: .5, zems: 1.1 }, vP = new THREE.Vector3();
function corpsDuBord(st, C, V, dt) {
  const j = JEU.joueur.position, c = pose(C, st.s, 0, tmpP2), hl = V.long / 2, hw = V.larg / 2, corps = [];
  for (const o of BORD.vivants) if (RAYONS[o.type]) corps.push([o.g.position, RAYONS[o.type], o.type === 'poteau' ? 'au poteau' : 'à l’étal']);
  for (const g of DISC.vivants) for (const m of g.membres) corps.push([m.getWorldPosition(vP).clone(), .3, 'aux passants']);
  for (const h of DISC.signes) if (h.m) corps.push([h.m.position, .3, 'au client qui te faisait signe']);
  for (const p of PT.marcheurs) corps.push([p.m.position, .3, 'au piéton']);
  for (const [q, r, nom] of corps) {
    const x = q.x - j.x, z = q.z - j.z; if (x * x + z * z > 9) continue;
    const u = x * c.dx + z * c.dz, v = -x * c.dz + z * c.dx;
    if (Math.abs(u) >= hl + r || Math.abs(v) >= hw + r) continue;
    const v0 = st.v;
    if (hw + r - Math.abs(v) < (hl + r - Math.abs(u)) * .6) { st.file = THREE.MathUtils.clamp(st.file - Math.sign(v), -2, 2); st.lat -= Math.sign(v) * (hw + r - Math.abs(v) + .05) / Math.max(kFiles(C, st.s), .3); } // de côté : on s'écarte
    else if (u > 0) { st.s = Math.max(1, st.s - (hl + r - u) - .02); st.v = Math.min(st.v, 0); } // devant : on s'arrête
    if (v0 > 4.2 && st.invul <= 0) {
      st.vies--; st.v = 0; st.invul = 1.8; st.secousse = .5; son('choc'); vibrer('choc'); evenement('choc');
      toast(st.vies > 0 ? `Accident ! Attention ${nom}` : 'Accident…', 1.6, 'mal');
      if (st.vies <= 0) { majHud(st, C, V); finJeu(false); return true; }
      accident(st);
    } else if (v0 > .5 && !st.bute) { st.bute = .6; son('bosse'); }
    break;
  }
  if (st.bute > 0) st.bute = Math.max(0, st.bute - dt); // à 0 pile : sinon un reste négatif bloquait le son des bosses suivantes
  return false;
}
/** Bilan de la course : au terminus (`arrive`), après trois accidents, ou quand on la quitte (`quitte`, menu Pause). */
export function finJeu(arrive, quitte = false) {
  const st = JEU.etat; if (!st || JEU.fini) return; JEU.fini = true; JEU.pause = true; moteurMaj(0, false); taire(); arreterMusique();
  const L = JEU.ligne, el = $('#jeuFin'), prochain = L.arretsJ[st.prochain];
  el.querySelector('h2').textContent = arrive ? 'Terminus !' : quitte ? 'Course arrêtée' : 'Fin de la course';
  el.querySelector('.jf-sous').textContent = arrive ? `${L.nom} : ${L.arretsJ[0].nom} → ${L.arretsJ[L.arretsJ.length - 1].nom}` : quitte ? `${L.nom}${prochain ? ` · arrêtée avant ${prochain.nom}` : ''}. Ta recette va dans ta cagnotte.` : 'Trois accidents : ta journée s’arrête là. Repars quand tu veux.';
  const duree = Math.round(st.temps), km = st.parcouru / 1000;
  const stats = [['Recette', fmtF(st.argent)], [JEU.veh === 'tokpa' ? 'Passagers payants' : 'Clients transportés', st.voyageurs], ['Arrêts desservis', `${st.servis}/${L.arretsJ.length - 1}`],
    ['Distance parcourue', `${km.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`], ['Durée', `${Math.floor(duree / 60)} min ${String(duree % 60).padStart(2, '0')} s`], ['Frôlements', st.frolements]];
  const duo = arriveeDuo(arrive); if (duo) stats.push(['Course à deux', duo]); // qui est arrivé le premier au terminus
  el.querySelector('.jf-stats').innerHTML = stats.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
  const qz = el.querySelector('.jf-quiz'), Q = QUIZ[L.id] || []; let i = 0, bonus = 0;
  const finir = () => {
    const total = st.argent + bonus, prev = JEU.meilleur[L.id] || 0, record = arrive && total > prev; if (record) JEU.meilleur[L.id] = total; // un record se fait au terminus
    JEU.prog.cagnotte += Math.max(0, total); if (arrive && st.vies === 3) progres('lignes', 1); assurerMissions(); sauver();
    qz.innerHTML = `<p class="jf-total">Total : <b>${fmtF(total)}</b>${bonus ? ` (dont ${fmtF(bonus)} de quiz)` : ''}<br><small>${record ? 'Nouveau record sur cette ligne !' : prev ? `Record : ${fmtF(prev)}` : 'Va jusqu’au terminus pour faire un record'} · versé dans ta cagnotte (${fmtF(JEU.prog.cagnotte)})</small></p>${arrive ? '<p class="jf-place" id="jfPlace"></p>' : ''}`;
    if (arrive) placeApresCourse(L.id, JEU.meilleur[L.id] || 0).then(t => { const p = $('#jfPlace'); if (p) p.textContent = t; }); // son record au classement, et sa place
    remplirLignes();
  };
  const poser = () => {
    if (!arrive || i >= Q.length) return finir();
    const [q, ch, bon] = Q[i];
    qz.innerHTML = `<p class="jf-q"><small>Question ${i + 1} sur ${Q.length} · +500 F par bonne réponse</small>${q}</p><div class="jf-choix">${ch.map((c, k) => `<button type="button" data-k="${k}">${c}</button>`).join('')}</div>`;
    qz.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const k = +b.dataset.k; qz.querySelectorAll('button').forEach(x => x.disabled = true);
      b.classList.add(k === bon ? 'bon' : 'faux'); if (k !== bon) qz.querySelectorAll('button')[bon].classList.add('bon'); else { bonus += 500; son('piece'); }
      setTimeout(() => { i++; poser(); }, 1000);
    }));
  };
  poser();
  // Terminus près d'un marché artisanal (la Porte du Non-Retour…) : on peut y passer.
  const fin = L.arretsJ[L.arretsJ.length - 1], pf = pose(JEU.chemin, fin.s, 0, { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 }), et = arrive ? etalPres(pf.x, pf.z) : null;
  $('#jfMarche').hidden = !et; $('#jfMarche').onclick = et ? () => ouvrirBoutique(et, () => rendreProgression()) : null;
  el.hidden = false; $('#jeuHud').hidden = true;
}
export function remplirLignes() {
  rendreProgression();
  const el = $('#jmLignes'); el.innerHTML = '';
  for (const L of JEU.lignes) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'jm-ligne';
    const km = (L.arrets[L.arrets.length - 1].s / 1000).toFixed(1), court = L === JEU.lignes.reduce((m, l) => l.arrets[l.arrets.length - 1].s < m.arrets[m.arrets.length - 1].s ? l : m, JEU.lignes[0]);
    const veh = L.veh === 'zem' && JEU.prog?.voiture && JEU.prog.vehicule === 'voiture' ? 'voiture' : L.veh;
    b.innerHTML = `<span class="jm-veh ${veh}">${veh === 'zem' ? 'Zém' : veh === 'voiture' ? 'Taxi' : 'Tokpa'}</span><b>${L.nom}</b>${court ? '<em class="jm-debut">Pour commencer</em>' : ''}<small>${L.arrets.map(a => a.nom).join(' → ')}</small><span class="jm-meta">${km} km · ${Math.max(5, Math.round(km * 2.6))} min environ · ${L.arrets.slice(1).reduce((n, a, k) => n + 1 + nbIntermediaires(a.s - L.arrets[k].s), 0)} arrêts${JEU.meilleur[L.id] ? ` · record ${fmtF(JEU.meilleur[L.id])}` : ''}</span>`;
    b.addEventListener('click', () => { JEU.numero = ($('#jmNumero').value || '1234').slice(0, 5); sauver(); JEU.fini = false; lancerLigne(L, veh); annoncerDepart(L.id, veh); }); // à deux : l'autre part sur la même ligne
    el.appendChild(b);
  }
}
export function ouvrirJeu() {
  geosJeu(); audioCtx();
  document.getElementById('app').classList.add('mode-jeu');
  $('#jeu').hidden = false; $('#jeuMenu').hidden = false; $('#jeuHud').hidden = true; $('#jeuFin').hidden = true; $('#jeuPause').hidden = true;
  $('#jmNumero').value = JEU.numero;
  remplirLignes();
}
/** Ligne express pour débuter : le début de « Sur la Marina », de Haie Vive au carrefour d'Erevan (1,6 km).
 *  Sur cette ligne, et tant qu'on n'a fini aucune course, la police est indulgente (voir `police`). */
function ligneExpress(lignes) {
  const M = lignes.find(l => l.id === 'marina'), fin = M?.arrets[1]; if (!fin) return null;
  const pts = [M.pts[0]]; let cum = 0;
  for (let i = 1; i < M.pts.length && cum < fin.s; i++) {
    const a = M.pts[i - 1], b = M.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (cum + l <= fin.s) pts.push(b); else { const t = (fin.s - cum) / l; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    cum += l;
  }
  return { ...M, id: 'express', nom: 'Ligne express', express: true, pts, arrets: M.arrets.slice(0, 2) };
}
const voirClassement = () => ouvrirClassement(JEU.lignes.map(l => ({ id: l.id, nom: l.nom })), JEU.ligne?.id, JEU.meilleur);
export function initJeu(data) {
  initClassement(); $('#jmClassement')?.addEventListener('click', voirClassement); $('#jfClassement')?.addEventListener('click', voirClassement);
  const ex = ligneExpress(data.L.lignes || []);
  JEU.lignes = ex ? [ex, ...data.L.lignes] : data.L.lignes || []; JEU.data = data;
  JEU.prog = Object.assign(progDefaut(), JEU.progSauve || {}); assurerMissions();
  QUARTIERS_J = [...QUARTIERS, ['Abomey-Calavi', 6.448, 2.355], ['Zogbadjè', 6.4236, 2.3348], ['Godomey', 6.3870, 2.3420], ['Togoudo', 6.4071, 2.3345]].map(([n, la, lo]) => { const [x, z] = toXZ(la, lo); return [n, x, z]; });
  JEU.quartiersNoms = [...new Set(QUARTIERS_J.map(q => q[0]))];
  $('#btnJouer').addEventListener('click', ouvrirJeu);
  const retourCarte = () => { $('#jeu').hidden = true; document.getElementById('app').classList.remove('mode-jeu'); };
  $('#jmRetour').addEventListener('click', retourCarte); $('#jmFermer').addEventListener('click', retourCarte); // la croix en haut : le bouton du bas sortait de l'écran
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !JEU.actif && !$('#jeu').hidden && !$('#jeuMenu').hidden) retourCarte(); });
  $('#jmPub').addEventListener('click', ouvrirOffre);
  $('#jfRejouer').addEventListener('click', () => { JEU.fini = false; lancerLigne(JEU.ligne, JEU.veh); });
  $('#jfLignes').addEventListener('click', () => { JEU.actif = false; moteurStop(); nettoyerBordure(); nettoyerDiscussions(); viderPietons(); remettreVegetation(); if (JEU.decor) { scene.remove(JEU.decor); JEU.decor = null; } ouvrirJeu(); });
  $('#jfCarte').addEventListener('click', quitterJeu);
  $('#jpReprendre').addEventListener('click', () => { JEU.pause = false; $('#jeuPause').hidden = true; });
  $('#jpQuitter').addEventListener('click', () => { $('#jeuPause').hidden = true; if (JEU.etat && !JEU.fini) finJeu(false, true); else quitterJeu(); }); // d'abord le bilan (et la recette versée dans la cagnotte)
  $('#jhPause').addEventListener('click', () => { if (JEU.fini) return; JEU.pause = true; moteurMaj(0, false); taire(); $('#jeuPause').hidden = false; });
  $('#jhSon').addEventListener('click', e => { AUDIO.muet = !AUDIO.muet; e.currentTarget.setAttribute('aria-pressed', String(!AUDIO.muet)); if (AUDIO.muet) { moteurMaj(0, false); radio(false); taire(); } });
  const st = () => JEU.etat;
  // Pas de file dans un mur : on le sent (bosse, secousse) et la moto reste où elle est.
  const changer = sens => { const e = st(), f = e.file + sens; if (Math.abs(f) > 2) return; if (JEU.chemin && !placeFile(JEU.chemin, e.s, f)) { son('bosse'); vibrer('piece'); e.secousse = .2; toast('Pas de place de ce côté : il y a un mur', 1.1, 'mal'); return; } e.file = f; };
  const gauche = () => { if (!st() || virage(-1)) return; changer(-1); }, droite = () => { if (!st() || virage(1)) return; changer(1); };

  window.addEventListener('keydown', e => {
    if (!JEU.actif || JEU.fini) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') { JEU.pause = !JEU.pause; $('#jeuPause').hidden = !JEU.pause; if (JEU.pause) taire(); e.preventDefault(); return; }
    if (JEU.pause) return;
    if (e.repeat && k !== ' ') { e.preventDefault(); return; }
    if (k === 'arrowleft' || k === 'a' || k === 'q') gauche();
    else if (k === 'arrowright' || k === 'd') droite();
    else if (k === 't') virage(0); // tout droit au carrefour où l'itinéraire tourne
    else if (k === 'u') demiTour();
    else if (k === 'arrowup' || k === 'w' || k === 'z') st().gaz = true;
    else if (k === ' ') sauter();
    else if (k === 'arrowdown' || k === 's') st().frein = true;
    else if (k === 'e' || k === 'enter') interagir();
    else if (k === 'h') klaxonner();
    else if (/^(Digit|Numpad)[1-3]$/.test(e.code)) repondre(+e.code.slice(-1) - 1); // 1, 2, 3 (aussi sur clavier AZERTY)
    else return;
    e.preventDefault(); e.stopPropagation();
  }, true);
  window.addEventListener('keyup', e => { if (!JEU.actif || !st()) return; const k = e.key.toLowerCase(); if (k === 'arrowdown' || k === 's') st().frein = false; if (k === 'arrowup' || k === 'w' || k === 'z') st().gaz = false; }, true);
  window.addEventListener('blur', () => { if (st()) { st().gaz = false; st().frein = false; } });
  // Écran tactile, façon Subway Surfers : glisser à gauche ou à droite change de file, vers le haut fait sauter, vers le bas
  // freine tant que le doigt reste posé (à l'arrêt, au feu rouge ; posé encore une fois arrêté : marche arrière). Le geste
  // part dès 28 px, sans attendre qu'on lève le doigt. En mode « au doigt », le zém avance seul (auDoigt).
  let t0 = null;
  const zone = $('#scene');
  zone.addEventListener('pointerdown', e => { if (JEU.actif) t0 = { x: e.clientX, y: e.clientY, id: e.pointerId, fait: false, frein: false }; });
  zone.addEventListener('pointermove', e => {
    if (!JEU.actif || JEU.pause || !t0 || t0.fait || e.pointerId !== t0.id) return;
    const dx = e.clientX - t0.x, dy = e.clientY - t0.y; if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
    t0.fait = true;
    if (Math.abs(dx) > Math.abs(dy)) (dx < 0 ? gauche : droite)(); else if (dy < 0) sauter(); else if (st()) { st().freinM = true; t0.frein = true; }
  });
  const lacher = () => { if (t0?.frein && st()) st().freinM = false; t0 = null; };
  zone.addEventListener('pointerup', lacher); zone.addEventListener('pointercancel', lacher);
  const btn = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
  btn('#jhDemi', demiTour);
  $('#jhCarrefour').addEventListener('pointerdown', e => { const b = e.target.closest('button[data-dir]'); if (b && !b.disabled) { e.preventDefault(); virage(+b.dataset.dir); } });
  guideJeu = creerGuide({ cle: 'zemrun.guide', el: $('#jhGuide'), titre: 'Prise en main', etapes: etapesJeu() });
  $('#jmGuide')?.addEventListener('click', () => { guideJeu.revoir(); $('#jmGuide').textContent = 'Le guide s’affichera à la prochaine course'; });
  btn('#jbG', gauche); btn('#jbD', droite); btn('#jbS', sauter); btn('#jbE', interagir); btn('#jhAction', interagir);
  const maintenu = (id, cle) => { const b = $(id); b.addEventListener('pointerdown', e => { e.preventDefault(); if (st()) st()[cle] = true; }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { if (st()) st()[cle] = false; }); };
  maintenu('#jbF', 'frein'); maintenu('#jbA', 'gaz');
  $('#jmVoix').checked = VOIX.on; $('#jmVoix').addEventListener('change', e => voixActives(e.target.checked)); $('#jmVoix').closest('label').hidden = !voixDispo();
  const glisser = $('#jmGlisser'); if (glisser) { glisser.closest('label').hidden = !coarse; glisser.checked = JEU.glisser; glisser.addEventListener('change', e => { JEU.glisser = e.target.checked; sauver(); $('#jeu').classList.toggle('au-doigt', auDoigt()); }); }
  $('#jeu').classList.toggle('au-doigt', auDoigt());
}

