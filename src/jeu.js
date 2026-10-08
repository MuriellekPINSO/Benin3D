import * as THREE from 'three';
import { poserTripo, tripoDispo } from './batiments-tripo.js';
import { AUDIO, audioCtx, moteur, moteurMaj, moteurStop, radio, son } from './audio.js';
import { VOIX, taire, voixActives, voixDispo } from './voix.js';
import { accident, majFeux, preparerFeux } from './regles.js';
import { majPietons, marchandeReelle, preparerPietons, regarder, viderPietons } from './pietons.js';
import { arreterMusique, demarrerMusique, musiqueQuartier } from './musique.js';
import { $, LITE, hash, toXZ } from './base.js';
import { QUARTIERS } from './donnees-lieux.js';
import { E } from './etat.js';
import { startFlight } from './interface.js';
import { VEGETATION, texteToile } from './lieux.js';
import { camera, controls, scene } from './scene.js';
import { ZEMS_3D, B3, C3, matVeh, partsChevre, partsMarchande, partsTokpa, partsVoiture, partsZem } from './vehicules.js';
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
import { carrefoursDe, construireReseau, itineraire, itineraireCourt } from './carrefours.js';
import { ouvrirOffre } from './publicites.js';
import { rueRouteJeu } from './rue.js';

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
export const LANE = 2.7;
export const JEU = { actif: false, pause: false, etat: null, objets: [], decor: null, joueur: null, ligne: null, veh: 'zem', numero: '1234', lignes: [], meilleur: {} };
JEU.prog = null; JEU.autoGaz = false; // le zém n'avance que si le joueur accélère (↑) ; relâché, il ralentit jusqu'à l'arrêt
try { const s = JSON.parse(localStorage.getItem('zemrun') || '{}'); JEU.meilleur = s.meilleur || {}; JEU.numero = s.numero || '1234'; JEU.progSauve = s.prog; } catch (e) { }
export const sauver = () => { try { localStorage.setItem('zemrun', JSON.stringify({ meilleur: JEU.meilleur, numero: JEU.numero, prog: JEU.prog || JEU.progSauve, autoGaz: JEU.autoGaz })); } catch (e) { } };
export const fmtF = n => `${Math.round(n).toLocaleString('fr-FR')} F`;

export function cheminDe(pts) {
  let p = pts.map(q => [q[0], q[1]]);
  for (let it = 0; it < 3; it++) { const o = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; o.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } o.push(p[p.length - 1]); p = o; }
  const cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.floor(L) + 1, X = new Float32Array(n), Z = new Float32Array(n);
  let j = 0; for (let d = 0; d < n; d++) { while (j < p.length - 2 && cum[j + 1] < d) j++; const t = (d - cum[j]) / ((cum[j + 1] - cum[j]) || 1); X[d] = p[j][0] + (p[j + 1][0] - p[j][0]) * t; Z[d] = p[j][1] + (p[j + 1][1] - p[j][1]) * t; }
  return { X, Z, n, L: n - 1 };
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
  GJ.trou = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2).scale(1.3, 1, .8);
  GJ.travaux = mergeColored([[B3(2.2, .9, .3).translate(0, .75, 0), '#e2672a'], [B3(2.2, .22, .32).translate(0, .95, 0), '#f4f1ea'], [C3(.04, .04, .7, 6).translate(-.9, .35, 0), '#555'], [C3(.04, .04, .7, 6).translate(.9, .35, 0), '#555'], [new THREE.ConeGeometry(.22, .6, 8).translate(1.4, .3, .5), '#e2672a'], [new THREE.ConeGeometry(.22, .6, 8).translate(-1.4, .3, -.5), '#e2672a']]);
  GJ.jeton = new THREE.CylinderGeometry(.42, .42, .1, 18).rotateZ(Math.PI / 2);
  GJ.matJeton = new THREE.MeshStandardMaterial({ color: '#f2c21b', metalness: .6, roughness: .3, emissive: '#5a4300' });
  GJ.matTrou = new THREE.MeshStandardMaterial({ color: '#3d3a33', roughness: .3, metalness: .1 });
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
  else if (type === 'tokpa') mesh = new THREE.Mesh(GJ.tokpa, matVeh);
  else if (type === 'voiture') mesh = new THREE.Mesh(GJ.voit[Math.floor(hash(s, 2) * 5)], matVeh);
  else if (type === 'chevre') mesh = new THREE.Mesh(GJ.chevre, matVeh);
  else if (type === 'marchande') mesh = marchandeReelle(Math.floor(hash(s, 3) * 1e5), true) || new THREE.Mesh(GJ.marchande[Math.floor(hash(s, 3) * 4)], matVeh);
  else if (type === 'trou') mesh = new THREE.Mesh(GJ.trou, GJ.matTrou);
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
    const z = new THREE.Mesh(new THREE.PlaneGeometry(30, LANE * .9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f2c21b', transparent: true, opacity: .55, depthWrite: false }));
    const p = pose(C, s - 12, LANE); z.position.set(p.x, p.y + .12, p.z); z.rotation.y = p.a; g.add(z);
    const q = pose(C, s, LANE * 2.2); const post = new THREE.Group(); post.position.set(q.x, q.y, q.z); post.rotation.y = Math.atan2(q.dz * .6 - q.dx * .8, -q.dx * .6 - q.dz * .8);
    const mat = new THREE.Mesh(C3(.08, .08, 3.6, 6), new THREE.MeshStandardMaterial({ color: '#555' })); mat.position.set(0, 1.8, 0); post.add(mat);
    const t = texteToile(['ARRÊT', a.nom.toUpperCase()], 1024, 400, '#1d1a16', '#f2c21b', '800 110px "Bricolage Grotesque", system-ui, sans-serif');
    const pan = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.25), new THREE.MeshBasicMaterial({ map: t })); pan.position.set(0, 3.9, 0); post.add(pan);
    const dos = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.25), new THREE.MeshBasicMaterial({ color: '#2b2f33' })); dos.position.set(0, 3.9, -.02); dos.rotation.y = Math.PI; post.add(dos); g.add(post);
    for (let i = 0; i < (JEU.veh === 'tokpa' ? 5 : 2); i++) {
      const r = pose(C, s - 4 - i * 1.5, LANE * 2.4 + (i % 2) * .6), vraie = marchandeReelle(k * 31 + i * 7 + 3);
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
export function lancerLigne(L, veh) {
  geosJeu(); chargerMasques(); // les processions d'Egungun prennent les modèles 3D dès qu'ils sont là
  JEU.ligne = L; JEU.veh = veh; JEU.chemin = cheminDe(L.pts);
  const C = JEU.chemin; C.H = calerSurPonts(C);
  // Recale les arrêts sur le chemin lissé.
  const tot = L.arrets[L.arrets.length - 1].s || 1; L.arretsJ = L.arrets.map(a => ({ ...a, s: Math.min(C.L - 2, a.s / tot * C.L) }));
  L.arretsJ[0].s = 0;
  L.arretsXZ = L.arretsJ.map(a => { const p = pose(C, a.s, 0, { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 }); return [p.x, p.z]; });
  if (JEU.decor) scene.remove(JEU.decor);
  JEU.decor = new THREE.Group(); JEU.decor.renderOrder = 11; scene.add(JEU.decor);
  satelliteVisible(false);
  installerTrajet(L, C, 1, false);
  const V = VEH[veh];
  // Zém du joueur : moto-taxi détaillée de 3D monde (conducteur au gilet jaune), sinon le modèle en code.
  const detaille = veh === 'zem' && ZEMS_3D.moto;
  const taxiTripo = veh === 'voiture' && tripoDispo('voiture');
  const j = detaille ? ZEMS_3D.moto.clone() : taxiTripo ? new THREE.Group() : new THREE.Mesh(mergeColored(veh === 'zem' ? partsZem({ passager: false }) : veh === 'voiture' ? partsVoiture('#f2c21b') : partsTokpa()), matVeh); j.castShadow = !LITE;
  const grp = new THREE.Group(); grp.add(j);
  if (taxiTripo) poserTripo('voiture', j, { largeur: 4.3, rot: Math.PI / 2 }); // taxi généré par Tripo
  if (veh === 'zem') { // numéro au dos du gilet
    const t = texteToile([JEU.numero || '0000'], 256, 160, '#f2c21b', '#1d5a2e', '900 120px system-ui, sans-serif');
    const d = new THREE.Mesh(new THREE.PlaneGeometry(.3, .19), new THREE.MeshBasicMaterial({ map: t })); d.rotation.y = -Math.PI / 2;
    if (detaille) d.position.set(NUMERO_DOS.x, NUMERO_DOS.y, 0); else { d.position.set(-.27, 1.38, 0); d.rotation.x = .28; }
    grp.add(d);
  }
  JEU.decor.add(grp); JEU.joueur = grp;
  JEU.etat = { s: 4, v: 0, file: 0, lat: 0, y: 0, vy: 0, vies: 3, argent: 0, passagers: veh === 'tokpa' ? 6 : 0, prochain: 1, servis: 0, manques: 0, frolements: 0, pieces: 0, invul: 0, service: 0, secousse: 0, frein: false, spawn: 40, quartier: '', temps: 0, carte: 0, casque: 0, superSaut: false };
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
  audioCtx(); moteur(veh); if (AUDIO.radio) radio(true); demarrerMusique();
  const p = pose(C, 0); camera.position.set(p.x - p.dx * 30, 14, p.z - p.dz * 30); JEU.regard = new THREE.Vector3(p.x, 1, p.z);
  if (METEO.pluie > .3) setTimeout(() => toast('Il pleut : la route glisse, freine plus tôt', 2.4, 'mal'), 3200);
  toast(`${L.arretsJ[0].nom} · ↑ accélérer (relâche pour ralentir), ↓ freiner, E interagir · arrête-toi au feu rouge`, 3.4);
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
    if (it.type === 'station') { const p = pose(C, it.s, it.side * (it.off + 6), { x: 0, z: 0, dx: 1, dz: 0, a: 0 }); occupees.push([p.x, p.z, 10]); }
    else if (it.type === 'enseigne' && /mode|coiffure|telephone|boutique|quincaillerie|garage/.test(it.t)) { const p = pose(C, it.s, it.side * (it.off + 3.4), { x: 0, z: 0, dx: 1, dz: 0, a: 0 }); occupees.push([p.x, p.z, 4.6]); }
  }
  rueRouteJeu(C, occupees);
  degagerVegetation(C);
  const bar = $('#jhArrets'); if (bar) bar.innerHTML = L.arretsJ.map((a, k) => k < debut && k ? '' : `<i style="left:${(a.s / C.L * 100).toFixed(2)}%" title="${a.nom}"></i>`).join('');
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
  const p = pose(C, st.s, st.lat, { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 });
  const pts = itineraire(p.x, p.z, j.n, br.m, L.arretsXZ.slice(st.prochain));
  if (!pts || pts.length < 3) { toast('Pas de route par là', 1.2, 'mal'); return false; }
  appliquerItineraire(pts);
  son('piece'); toast(`${droit ? '↑ Tout droit' : dir < 0 ? '↰ À gauche' : '↱ À droite'} · itinéraire recalculé`, 1.6, 'bien');
  return true;
}
/** Remplace le trajet par `pts` (à partir de la position du zém) et recale les arrêts restants. */
function appliquerItineraire(pts) {
  const st = JEU.etat, L = JEU.ligne;
  const C2 = cheminDe(pts); C2.H = calerSurPonts(C2);
  let depuis = 0;
  L.arretsJ = L.arretsJ.map((a, k) => {
    if (k < st.prochain) return { ...a, s: 0 };
    const [x, z] = L.arretsXZ[k]; let best = depuis, bd = 1e18;
    for (let i = depuis; i < C2.n; i += 2) { const d = (C2.X[i] - x) ** 2 + (C2.Z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    depuis = best; return { ...a, s: Math.min(C2.L - 2, best) };
  });
  L.arretsJ[L.arretsJ.length - 1].s = C2.L - 2;
  JEU.chemin = C2; st.s = 1; st.spawn = 40; st.lat = 0; st.file = 0; st.plein = -1;
  installerTrajet(L, C2, st.prochain, true);
}
/** Client pressé (cahier des charges, priorité 3) : le GPS prend le plus court, petites rues comprises. */
export function prendreRaccourci() {
  const st = JEU.etat, C = JEU.chemin, L = JEU.ligne; if (!st || st.prochain >= L.arretsJ.length) return false;
  const p = pose(C, st.s, st.lat, { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 }), q = pose(C, Math.min(C.L - 1, st.s + 18), 0, { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 });
  const avant = Math.max(0, L.arretsJ[st.prochain].s - st.s);
  const pts = itineraireCourt(p.x, p.z, q.x, q.z, L.arretsXZ.slice(st.prochain));
  if (!pts || pts.length < 3) { toast('Pas de raccourci par ici', 1.4, 'mal'); return false; }
  appliquerItineraire(pts);
  const apres = Math.max(0, L.arretsJ[st.prochain].s - st.s);
  toast(`Raccourci par les petites rues : ${Math.round(apres)} m au lieu de ${Math.round(avant)} m`, 2.4, 'bien'); son('piece');
  return true;
}
export function quitterJeu() {
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
export function toast(txt, d = 1.6, cls = '') { const el = $('#jhToast'); el.textContent = txt; el.className = 'jh-toast on ' + cls; toastT = d; }
export function carteQuartier(a) {
  const c = $('#jhCarte'); c.querySelector('h3').textContent = a.nom; c.querySelector('p').textContent = a.fait; c.hidden = false; JEU.etat.carte = 5.5;
  const p = pose(JEU.chemin, a.s, 0, { x: 0, z: 0, dx: 1, dz: 0, a: 0 }); photoJeu($('#jhArretPhoto'), p.x, p.z);
}

export const tmpP2 = { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 };
export function sauter() { const s = JEU.etat; if (s && s.y === 0 && s.service <= 0) { s.vy = s.superSaut ? 10.5 : 7.8; son('saut'); evenement('saut'); } }
/** Le zém se range à l'abscisse `s`, du côté `side`, puis exécute `action`. */
export function arretAuto(s, side, action) { const st = JEU.etat; if (st) st.auto = { s, side, action }; }
export function majJeu(dt) {
  const st = JEU.etat, C = JEU.chemin, L = JEU.ligne, V = VEH[JEU.veh];
  if (!st || JEU.pause) return;
  st.temps += dt;
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('#jhToast').className = 'jh-toast'; }
  if (st.carte > 0) { st.carte -= dt; if (st.carte <= 0) $('#jhCarte').hidden = true; }
  // Vitesse, file, saut.
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
    const vmax = V.vmax * (1 + Math.min(.15, st.s / C.L * .2)) * facteurEssence(st) * (Math.abs(st.file) === 2 ? .3 : 1);
    if (st.frein || st.freinM) st.v = Math.max(0, st.v - 15 * (1 - .35 * METEO.pluie) * dt); // route mouillée : on freine moins bien
    else if (st.gaz || st.gazM || JEU.autoGaz) st.v = st.v > vmax ? Math.max(vmax, st.v - 8 * dt) : Math.min(vmax, st.v + V.accel * dt * (st.v < 6 ? 1.6 : 1));
    else st.v = Math.max(0, st.v - (st.v > vmax ? 8 : 2.4) * dt);
  }
  st.s += st.v * dt;
  majFeux(st);
  majEssence(st, dt);
  const latAv = st.lat; st.lat += (st.file * LANE - st.lat) * Math.min(1, dt * 9);
  if (st.y > 0 || st.vy > 0) { st.vy -= 24 * dt; st.y = Math.max(0, st.y + st.vy * dt); if (st.y === 0) st.vy = 0; }
  if (st.invul > 0) st.invul -= dt;
  if (st.secousse > 0) st.secousse -= dt;
  const p = pose(C, st.s, st.lat);
  const j = JEU.joueur; j.position.set(p.x, p.y + st.y, p.z); j.rotation.set(0, p.a, 0);
  j.rotateX(JEU.veh === 'zem' ? Math.max(-.32, Math.min(.32, -(st.lat - latAv) / Math.max(dt, .001) * .014)) : 0);
  if (C.H) { const i = Math.max(2, Math.min(C.n - 3, Math.floor(st.s))); j.rotateZ(Math.atan((C.H[i + 2] - C.H[i - 2]) / 4)); } // penché dans la rampe du pont
  j.visible = true; // un accident n'est plus un clignotement : voir regles.js (constat de police ou client perdu)
  controls.target.set(p.x, 0, p.z);
  moteurMaj(st.v, true);
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
  // Mise à jour et collisions.
  const restants = [];
  for (const o of JEU.objets) {
    if (o.T.v[1]) o.s += o.v * dt;
    if (o.dirLat) o.lat += o.dirLat * dt;
    const ds = o.s - st.s;
    if (ds < -25 || Math.abs(o.lat) > (o.type === 'egungun' ? 11 : 9)) { retirerObjet(o); continue; }
    const q = pose(C, o.s, o.lat, tmpP2);
    o.mesh.position.set(q.x, q.y + (o.type === 'trou' ? .1 : 0), q.z); o.mesh.rotation.y = o.dirLat ? q.a + Math.sign(o.dirLat) * Math.PI / 2 : q.a;
    if (o.mesh.userData.modele) { const sg = Math.sign(o.dirLat); if (sg) regarder(o.mesh, -sg * q.dz, sg * q.dx); else { regarder(o.mesh, -q.dx, -q.dz); o.mesh.userData.jouer('idle'); } } // personnage réaliste (face à +z)
    if (o.type === 'jeton') { o.mesh.position.y = q.y + 1.1 + Math.sin(st.temps * 4 + o.s) * .15; o.mesh.rotation.y = st.temps * 3 + o.s; }
    if (o.type === 'egungun') {
      o.mesh.userData.anim(st.temps); o.mesh.rotation.y = q.a + Math.PI / 2;
      if (!o.annonce && ds < 70) { o.annonce = true; toast('Sortie d’Egungun ! Freine : on ne touche pas les revenants.', 2.6); son('klaxon'); }
      if (!o.respect && ds > 4 && ds < 32 && Math.abs(o.lat) < 7 && st.v < 3) { o.respect = true; st.argent += 100; toast('Respect aux Egungun : +100 F', 1.6, 'bien'); son('piece'); evenement('egungun'); progres('egungun', 1); }
    }
    const proche = Math.abs(ds) < (o.T.long + V.long) / 2 && Math.abs(o.lat - st.lat) < (o.T.larg + V.larg) / 2 * .85;
    if (!o.touche && proche) {
      if (o.type === 'jeton') { st.argent += 25; st.pieces++; son('piece'); vibrer('piece'); retirerObjet(o); if (st.pieces % 5 === 0) progres('pieces', st.pieces); continue; }
      if (o.T.saut && st.y > .55) { /* sauté */ }
      else if (o.type === 'trou') { o.touche = true; st.v *= st.pneus > 0 ? .8 : .5; st.secousse = .35; if (!(st.pneus > 0)) { st.argent = Math.max(0, st.argent - 50); toast('Nid-de-poule ! −50 F', 1.2, 'mal'); } son('bosse'); evenement('trou'); }
      else if (st.invul <= 0 && st.casque > 0) { o.touche = true; st.casque--; st.v *= .4; st.invul = 1.8; st.secousse = .4; son('choc'); toast('Le casque neuf a encaissé le choc !', 1.6, 'bien'); evenement('choc'); }
      else if (st.invul <= 0) {
        o.touche = true; st.vies--; st.v *= .2; st.invul = 1.8; st.secousse = .5; son('choc'); evenement('choc'); vibrer('choc');
        const noms = { zem: 'à l’autre zém', tokpa: 'au tokpa-tokpa', voiture: 'à la voiture', chevre: 'à la chèvre', marchande: 'à la marchande', travaux: 'aux travaux', egungun: ': on ne touche pas un Egungun' };
        toast(st.vies > 0 ? `Accident ! Attention ${noms[o.type]}` : 'Accident…', 1.6, 'mal');
        if (st.vies <= 0) { majHud(st, C, V); return finJeu(false); }
        accident(st);
      }
    }
    if (!o.frole && !o.touche && ds < 0 && ds > -3 && o.T.v[1] && Math.abs(o.lat - st.lat) < (o.T.larg + V.larg) / 2 + 1.1) { o.frole = true; st.frolements++; st.argent += 15; toast('Ça passe ! +15 F', .9, 'bien'); evenement('frole'); progres('frolements', st.frolements); }
    restants.push(o);
  }
  JEU.objets = restants;
  // Arrêts : file de droite, presque à l'arrêt, dans la zone jaune.
  const a = L.arretsJ[st.prochain];
  if (a) {
    const dansZone = st.s > a.s - 32 && st.s < a.s + 6, sansClient = avecClients(JEU.veh) && !DISC.client;
    if (sansClient) { // pas de client : on passe, il faut en trouver un (quelqu'un fait signe plus loin)
      if (st.s > a.s + 6) { st.prochain++; if (st.prochain >= L.arretsJ.length) { majHud(st, C, V); return finJeu(true); } }
    } else if (dansZone && st.file >= 1 && st.v < 7.5 && st.service <= 0) {
      // Zém : le client descend et paie le prix discuté ; tokpa : l'apprenti encaisse.
      let gain;
      if (avecClients(JEU.veh)) gain = deposerClient();
      else { const n = 2 + Math.floor(Math.random() * 5); gain = n * (V.tarif[0] + Math.round(Math.random() * (V.tarif[1] - V.tarif[0]) / 25) * 25); st.passagers = Math.min(V.places, st.passagers + Math.floor(Math.random() * 4)); setTimeout(departApprenti, 1300); }
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
      st.manques++; st.argent = Math.max(0, st.argent - 100); toast(`Arrêt manqué : ${a.nom} −100 F`, 1.8, 'mal'); st.prochain++;
      if (st.prochain >= L.arretsJ.length) { majHud(st, C, V); return finJeu(true); }
    }
  }
  if (st.s >= C.L - 1) return finJeu(true);
  // Bord de route, monuments, plaques de rue, mini-carte.
  const rep = majBordure(st, C);
  majDiscussions(st, C, dt);
  majPietons(st, dt);
  // Carrefour devant : « ← / → pour tourner » (ralentir d'abord).
  const cf = JEU.carrefours?.find(c => c.s - st.s > -4 && c.s - st.s < 70), elC = $('#jhCarrefour');
  if (elC) {
    elC.hidden = !cf;
    if (cf) {
      const d = Math.max(0, Math.round(cf.s - st.s)), lent = st.v <= 12, ici = cf.s - st.s < 18;
      elC.className = 'jh-carrefour' + (ici && lent ? ' maintenant' : '');
      // La flèche opposée au virage prévu sert à continuer tout droit quand il n'y a pas de rue de ce côté.
      const gDroit = cf.droit && !cf.gauche && cf.sens > 0, dDroit = cf.droit && !cf.droite && cf.sens < 0;
      const titre = ici ? (lent ? 'À toi de choisir' : 'Ralentis pour choisir') : `Carrefour · ${d} m`;
      // C'est le joueur qui décide : ← / → pour les rues de côté, T (ou manette ↑) pour continuer tout droit quand le GPS voulait tourner.
      const aide = cf.droit ? (gDroit ? ' · ← ou T : tout droit' : dDroit ? ' · → ou T : tout droit' : ' · T : tout droit') : '';
      elC.innerHTML = `<span class="${cf.gauche || gDroit ? '' : 'non'}">${gDroit ? '↑' : '↰'}</span><b>${titre}${aide}</b><span class="${cf.droite || dDroit ? '' : 'non'}">${dDroit ? '↑' : '↱'}</span>`;
    }
  }
  majInteractions(st, C, dt);
  if (st.pneus > 0) st.pneus -= dt;
  if (JEU.fini !== true && Math.floor(st.temps * 20) !== Math.floor((st.temps - dt) * 20)) majMiniCarte(st, C);
  // Caméra de poursuite : elle se lève et regarde le monument que l'on longe.
  const vise = rep && rep.d < 260 && rep.s > st.s - 15 ? Math.max(0, 1 - Math.abs(st.s - rep.s) / 140) : 0;
  JEU.vise = (JEU.vise || 0) + (vise - (JEU.vise || 0)) * Math.min(1, dt * 2.5);
  const pax = JEU.veh === 'zem' && st.passagers ? 1 : 0; // client assis derrière : la caméra se lève pour voir la route
  const [d0, h0] = V.cam, d = d0 + JEU.vise * 3 + pax * 1.1, h = h0 + JEU.vise * 2.6 + pax * .9, k = 1 - Math.exp(-dt * 5);
  const sh = st.secousse > 0 ? (Math.random() - .5) * .5 : 0;
  const cx = p.x - p.dx * d, cz = p.z - p.dz * d;
  camera.position.x += (cx - camera.position.x) * k; camera.position.z += (cz - camera.position.z) * k; camera.position.y += (h + p.y + st.y * .5 - camera.position.y) * k;
  camera.position.y += sh;
  let rx = p.x + p.dx * 11, rz = p.z + p.dz * 11, ry = 1.5 + p.y;
  if (rep && JEU.vise > .01) { const w = JEU.vise * .22; rx += (rep.x - rx) * w; rz += (rep.z - rz) * w; ry += JEU.vise * 2.5; }
  JEU.regard.x += (rx - JEU.regard.x) * k * .8; JEU.regard.z += (rz - JEU.regard.z) * k * .8; JEU.regard.y += (ry - JEU.regard.y) * k;
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
export function majHud(st, C, V) {
  $('#jhArgent').textContent = fmtF(st.argent);
  $('#jhVitesse').textContent = `${Math.round(st.v * 3.6)} km/h`;
  $('#jhVies').innerHTML = [0, 1, 2].map(i => `<i class="${i < st.vies ? '' : 'perdu'}"></i>`).join('');
  $('#jhProg').style.width = `${Math.min(100, st.s / C.L * 100).toFixed(1)}%`;
  const a = JEU.ligne.arretsJ[st.prochain];
  $('#jhProchain').textContent = a ? `Prochain arrêt : ${a.nom} · ${Math.max(0, Math.round(a.s - st.s))} m` : 'Terminus';
  $('#jhPassagers').textContent = JEU.veh === 'tokpa' ? `${st.passagers}/${V.places} passagers` : etiquetteClient();
}
export function finJeu(arrive) {
  const st = JEU.etat; if (!st || JEU.fini) return; JEU.fini = true; JEU.pause = true; moteurMaj(0, false); taire(); arreterMusique();
  const L = JEU.ligne, el = $('#jeuFin');
  el.querySelector('h2').textContent = arrive ? 'Terminus !' : 'Fin de la course';
  el.querySelector('.jf-sous').textContent = arrive ? `${L.nom} : ${L.arretsJ[0].nom} → ${L.arretsJ[L.arretsJ.length - 1].nom}` : 'Trois accidents : le casque a servi. Repars quand tu veux.';
  const stats = [['Recette', fmtF(st.argent)], ['Arrêts desservis', `${st.servis}/${L.arretsJ.length - 1}`], ['Frôlements', st.frolements], ['Distance', `${(st.s / 1000).toFixed(1)} km`]];
  el.querySelector('.jf-stats').innerHTML = stats.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
  const qz = el.querySelector('.jf-quiz'), Q = QUIZ[L.id] || []; let i = 0, bonus = 0;
  const finir = () => {
    const total = st.argent + bonus, prev = JEU.meilleur[L.id] || 0; if (total > prev) JEU.meilleur[L.id] = total;
    JEU.prog.cagnotte += Math.max(0, total); if (arrive && st.vies === 3) progres('lignes', 1); assurerMissions(); sauver();
    qz.innerHTML = `<p class="jf-total">Total : <b>${fmtF(total)}</b>${bonus ? ` (dont ${fmtF(bonus)} de quiz)` : ''}<br><small>${total > prev ? 'Nouveau record sur cette ligne !' : `Record : ${fmtF(prev)}`} · versé dans ta cagnotte (${fmtF(JEU.prog.cagnotte)})</small></p>`;
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
    const km = (L.arrets[L.arrets.length - 1].s / 1000).toFixed(1);
    const veh = L.veh === 'zem' && JEU.prog?.voiture && JEU.prog.vehicule === 'voiture' ? 'voiture' : L.veh;
    b.innerHTML = `<span class="jm-veh ${veh}">${veh === 'zem' ? 'Zém' : veh === 'voiture' ? 'Taxi' : 'Tokpa'}</span><b>${L.nom}</b><small>${L.arrets.map(a => a.nom).join(' → ')}</small><span class="jm-meta">${km} km · ${L.arrets.length - 1} arrêts${JEU.meilleur[L.id] ? ` · record ${fmtF(JEU.meilleur[L.id])}` : ''}</span>`;
    b.addEventListener('click', () => { JEU.numero = ($('#jmNumero').value || '1234').slice(0, 5); sauver(); JEU.fini = false; lancerLigne(L, veh); });
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
export function initJeu(data) {
  JEU.lignes = data.L.lignes || []; JEU.data = data;
  JEU.prog = Object.assign(progDefaut(), JEU.progSauve || {}); assurerMissions();
  QUARTIERS_J = [...QUARTIERS, ['Abomey-Calavi', 6.448, 2.355], ['Zogbadjè', 6.4236, 2.3348], ['Godomey', 6.3870, 2.3420], ['Togoudo', 6.4071, 2.3345]].map(([n, la, lo]) => { const [x, z] = toXZ(la, lo); return [n, x, z]; });
  JEU.quartiersNoms = [...new Set(QUARTIERS_J.map(q => q[0]))];
  $('#btnJouer').addEventListener('click', ouvrirJeu);
  $('#jmRetour').addEventListener('click', () => { $('#jeu').hidden = true; document.getElementById('app').classList.remove('mode-jeu'); });
  $('#jmPub').addEventListener('click', ouvrirOffre);
  $('#jfRejouer').addEventListener('click', () => { JEU.fini = false; lancerLigne(JEU.ligne, JEU.veh); });
  $('#jfLignes').addEventListener('click', () => { JEU.actif = false; moteurStop(); nettoyerBordure(); nettoyerDiscussions(); viderPietons(); remettreVegetation(); if (JEU.decor) { scene.remove(JEU.decor); JEU.decor = null; } ouvrirJeu(); });
  $('#jfCarte').addEventListener('click', quitterJeu);
  $('#jpReprendre').addEventListener('click', () => { JEU.pause = false; $('#jeuPause').hidden = true; });
  $('#jpQuitter').addEventListener('click', quitterJeu);
  $('#jhPause').addEventListener('click', () => { if (JEU.fini) return; JEU.pause = true; moteurMaj(0, false); taire(); $('#jeuPause').hidden = false; });
  $('#jhSon').addEventListener('click', e => { AUDIO.muet = !AUDIO.muet; e.currentTarget.setAttribute('aria-pressed', String(!AUDIO.muet)); if (AUDIO.muet) { moteurMaj(0, false); radio(false); taire(); } });
  const st = () => JEU.etat;
  const gauche = () => { if (!st() || virage(-1)) return; if (st().file > -2) st().file--; }, droite = () => { if (!st() || virage(1)) return; if (st().file < 2) st().file++; };

  window.addEventListener('keydown', e => {
    if (!JEU.actif || JEU.fini) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') { JEU.pause = !JEU.pause; $('#jeuPause').hidden = !JEU.pause; if (JEU.pause) taire(); e.preventDefault(); return; }
    if (JEU.pause) return;
    if (e.repeat && k !== ' ') { e.preventDefault(); return; }
    if (k === 'arrowleft' || k === 'a' || k === 'q') gauche();
    else if (k === 'arrowright' || k === 'd') droite();
    else if (k === 't') virage(0); // tout droit au carrefour où l'itinéraire tourne
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
  // Écran tactile : glisser à gauche, à droite, vers le haut ; maintenir le bouton Frein.
  let t0 = null;
  const zone = $('#scene');
  zone.addEventListener('pointerdown', e => { if (JEU.actif) t0 = [e.clientX, e.clientY]; });
  zone.addEventListener('pointerup', e => { if (!JEU.actif || !t0) return; const dx = e.clientX - t0[0], dy = e.clientY - t0[1]; t0 = null; if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; if (Math.abs(dx) > Math.abs(dy)) (dx < 0 ? gauche : droite)(); else if (dy < 0) sauter(); });
  const btn = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
  btn('#jbG', gauche); btn('#jbD', droite); btn('#jbS', sauter); btn('#jbK', klaxonner); btn('#jbE', interagir); btn('#jhAction', interagir);
  const maintenu = (id, cle) => { const b = $(id); b.addEventListener('pointerdown', e => { e.preventDefault(); if (st()) st()[cle] = true; }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { if (st()) st()[cle] = false; }); };
  maintenu('#jbF', 'frein'); maintenu('#jbA', 'gaz');
  $('#jmVoix').checked = VOIX.on; $('#jmVoix').addEventListener('change', e => voixActives(e.target.checked)); $('#jmVoix').closest('label').hidden = !voixDispo();
}

