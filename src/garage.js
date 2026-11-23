import * as THREE from 'three';
import { son } from './audio.js';
import { VEHICULES, placer, retirerVehicule } from './conduite.js';
import { etiquette } from './interieurs.js';
import { K, groupeLieu, panneauTexte } from './lieux.js';
import { maisonActuelle } from './maison.js';
import { ajouterZoneSansMur, dansBatiment, poserObstacles, surChaussee } from './rue.js';
import { T, descendre, nomSonVehicule, poserSonVehicule } from './trajets.js';
import { VIE } from './vie.js';

// ---------- Le garage de la maison ----------
// « Fais des garages dans les maisons pour mettre les voitures » (Murielle, 23/11). Sa voiture n'avait pas de chez-soi :
// garée dans la rue au réveil, elle disparaissait quand le patron confiait son taxi, et revenait d'on ne sait où le soir.
// Le garage est un grand portail de tôle dans le mur de la parcelle, à côté de sa porte (sur la façade de l'immeuble, un
// rideau de fer), comme partout à Cotonou, avec « DÉFENSE DE STATIONNER » peint à la main. On se réveille, sa voiture y a
// dormi : « Sortir ta voiture du garage », le portail s'ouvre et elle sort en marche arrière jusqu'au bord de la rue. Le
// soir, « Garer au garage » : elle entre, le portail se referme. Quand on prend le véhicule du patron (metiers.js) ou
// qu'on vole une voiture, la sienne rentre au garage : on l'y retrouve après.
// Le dedans n'est pas dessiné : derrière le portail ouvert, l'ombre du garage (un aplat sombre), où la voiture s'enfonce.

const GA = { S: null, ligne: () => { }, anim: null, dit: false };
const OUVRIR = .9; // secondes pour ouvrir ou fermer le portail
const lisse = k => k * k * (3 - 2 * k);

/** Appelé par le salon au démarrage : trajets.js sait alors s'il y a un garage (T.garage.existe). */
export function initGarage(ctx) {
  GA.S = ctx.S; GA.ligne = ctx.ligne;
  T.garage = { existe: () => !!garageMaison() };
  if (import.meta.env.DEV) window.__garage = { garage: garageMaison, GA }; // pour les tests
}
/** Le garage de son logement actuel (calculé et construit à la première demande), ou null s'il n'y a pas la place. */
function garageMaison() {
  const I = maisonActuelle(); if (!I?.seuil) return null;
  if (I.garage === undefined) { I.garage = calculer(I); if (I.garage) construire(I.garage, I); }
  if (I.garage && GA.G !== I.garage) { GA.G = I.garage; poserObstacles('garage', I.garage.obstacles); } // les murs du garage où l'on habite
  return I.garage;
}

// ---------- Où le mettre ----------
// À côté de la porte, à gauche ou à droite, dans le même mur (ou la même façade). Il faut : une rue droite devant (pas un
// carrefour), et, pour un mur de parcelle, pas de bâtiment sur la ligne du mur ; pour un immeuble, la façade qui continue.
function calculer(I) {
  const P = I.seuil, th = I.dehors, ux = [Math.cos(th), -Math.sin(th)], n = [P.nx, P.nz]; // n : de la rue vers la parcelle
  const pt = (o, a, b) => [o[0] + ux[0] * a + n[0] * b, o[1] + ux[1] * a + n[1] * b]; // a le long du mur, b vers l'intérieur
  const lat = [-1.6, 0, 1.6];
  for (const off of [5.2, 6.8]) for (const s of [1, -1]) {
    let G = pt([P.x, P.z], s * off, 0);
    if (P.facade) {
      // La façade n'est pas toujours dans l'alignement de la porte (un immeuble à décrochements) : on la cherche, droite sur
      // toute la largeur du rideau, sinon le garage se perdait dedans (essai du 23/11).
      let f = null; for (let k = -2.5; k <= 3; k += .1) if (lat.every(l => dansBatiment(...pt(G, l, k + .15)))) { f = k; break; }
      if (f === null || lat.some(l => dansBatiment(...pt(G, l, f - .4)))) continue;
      G = pt(G, 0, f - .02);
    } else if (lat.some(l => dansBatiment(...pt(G, l, .3)) || dansBatiment(...pt(G, l, -.6)))) continue; // un mur de parcelle, pas un bâtiment
    let bord = 0; for (let d = .4; d <= 6; d += .2) if (surChaussee(...pt(G, 0, -d), 0)) { bord = d; break; }
    if (!bord) continue;
    const C = pt(G, 0, -(bord + 1.25)), P1 = pt(C, s * 3.4, 0);
    if (!surChaussee(...pt(C, 4, 0), 0) || !surChaussee(...pt(C, -4, 0), 0) || !surChaussee(...P1, 0)) continue; // un bout de rue droit
    const cap1 = Math.atan2(-ux[0] * s, -ux[1] * s); // garée le long de la rue, l'avant à l'opposé de la porte
    const g = { G, C, P1, cap1, n, ux, s, th, facade: !!P.facade, o: 0, porte: null };
    // Le portail fermé, ses piliers et le bout de mur : on ne passe pas au travers.
    const m = pt(G, s * .45, 0); g.obstacles = [[m[0], m[1], th, 4.8, .4]];
    // Devant le portail, du mur au bord de la rue : ni voiture garée, ni boutique, ni poubelle de la rue (rue.js refait le
    // carré) ; le mur de la parcelle s'arrête aux piliers. Une voiture de décor garée devant bouchait la sortie (23/11).
    if (!P.facade) ajouterZoneSansMur({ x: G[0], z: G[1], r: th, x0: s > 0 ? -1.9 : -2.85, x1: s > 0 ? 2.85 : 1.9, z0: -1, z1: bord + .6 });
    else ajouterZoneSansMur({ x: G[0], z: G[1], r: th, x0: -1.9, x1: 1.9, z0: .3, z1: bord + .6 }); // devant l'immeuble : le trottoir seulement
    return g;
  }
  return null;
}

// ---------- Le portail ----------
K.motif('rideauGarage', (c, t) => {
  c.fillStyle = '#a3a9ab'; c.fillRect(0, 0, t, t);
  for (let i = 0; i < 16; i++) { const y = i * t / 16; c.fillStyle = '#7f8689'; c.fillRect(0, y, t, 3); c.fillStyle = '#c4c9cb'; c.fillRect(0, y + 4, t, 2); }
});
function construire(G, I) {
  const g = groupeLieu(`garage-${I.id}`, G.G[0], G.G[1]); g.rotation.y = G.th; // repère local : x le long du mur, +z vers la rue
  K.into(g, () => {
    // L'ombre du garage, derrière le portail ouvert ; cachée tant qu'il est fermé.
    G.ombre = K.boite(3, 2.45, .02, new THREE.MeshBasicMaterial({ color: '#1b1915' }), 0, 1.225, .022); G.ombre.castShadow = false; G.ombre.visible = false;
    if (G.facade) {
      const gris = K.mat('#6d7376', { rugosite: .5, metal: .4 });
      // Un encadrement de béton : la façade peinte (facades.js) a ses propres boutiques et enseignes au rez-de-chaussée.
      K.boite(3.9, 3.2, .03, K.mat('#cfc8ba', { rugosite: .95 }), 0, 1.6, 0).castShadow = false;
      K.boite(3.4, .32, .34, gris, 0, 2.62, .12); // le caisson où s'enroule le rideau
      for (const x of [-1.56, 1.56]) K.boite(.1, 2.5, .12, gris, x, 1.25, .06); // les glissières
      G.rideau = K.boite(3, 2.5, .04, K.tex('rideauGarage', 1, 1), 0, 1.25, .048);
      panneauTexte(['GARAGE'], .9, .22, 0, 2.98, .3, 0, { fond: '#1f3d4a', encre: '#f5c21b', px: 512, py: 125, police: '800 90px system-ui, sans-serif' });
    } else {
      const enduit = K.mat('#e6d8bd', { rugosite: .95 }), tole = K.mat('#3f5b52', { rugosite: .5, metal: .3 }), fer = K.mat('#2c433b', { rugosite: .5, metal: .3 }), s = G.s;
      for (const x of [-1.71, 1.71]) K.boite(.42, 2.75, .42, enduit, x, 1.375, -.05); // piliers
      K.boite(.9, 2.5, .24, enduit, s * 2.37, 1.25, -.12); // un bout de mur, côté rue
      panneauTexte(['DÉFENSE DE', 'STATIONNER'], .84, .46, s * 2.37, 1.75, .006, 0, { fond: '#e6d8bd', encre: '#b3261e', px: 512, py: 280, police: '800 96px system-ui, sans-serif' });
      // Deux battants de tôle, pendus aux piliers ; ils s'ouvrent vers l'intérieur de la parcelle.
      G.battants = [-1, 1].map(c => {
        const p = new THREE.Group(); p.position.set(c * 1.5, 0, .03); g.add(p);
        K.boite(1.5, 2.3, .05, tole, -c * .75, 1.17, 0, p);
        for (const y of [.45, 1.15, 1.85]) K.boite(1.46, .05, .02, fer, -c * .75, y, .035, p); // renforts
        K.boite(.04, .3, .03, fer, -c * 1.42, 1.1, .05, p); // la poignée
        return p;
      });
    }
    const e = etiquette('Ton garage'); e.position.set(0, 3.5, .4); e.visible = false; g.add(e); G.etiquette = e;
  });
}
/** Le portail ouvert à o (0 fermé, 1 ouvert). */
function ouverture(G, o) {
  G.o = o; G.ombre.visible = o > .02;
  if (G.rideau) { const k = 1 - .95 * o; G.rideau.scale.y = k; G.rideau.position.y = 2.5 - 1.25 * k; }
  if (G.battants) G.battants.forEach((p, i) => { p.rotation.y = (i ? -1 : 1) * 1.45 * o; });
}

// ---------- Sortir, rentrer ----------
const nomMin = type => { const n = nomSonVehicule(type); return n[0].toLowerCase() + n.slice(1); }; // « ta voiture », « ton vélo »
const pret = () => !GA.anim && !T.garageAnim && !T.trans && !GA.S?.lieu;
/** Les boutons du garage (salon.js) : sortir son véhicule, le rentrer, ou s'y garer depuis le volant. */
export function actionsGarage() {
  const S = GA.S, type = VIE.data?.vehicule; if (!S || !type || !VEHICULES[type] || !pret()) return [];
  const G = garageMaison(); if (!G) return [];
  const dJ = Math.hypot(S.x - G.G[0], S.z - G.G[1]), V = T.veh, sien = V && !V.travail && !V.vole && V.type === type;
  if (T.mode === 'pied') {
    if (T.auGarage && !V && dJ < 8) return [{ texte: `Sortir ${nomMin(type)} du garage`, f: sortir }];
    if (sien && dJ < 9 && Math.hypot(V.x - G.G[0], V.z - G.G[1]) < 30) return [{ texte: `Rentrer ${nomMin(type)} au garage`, f: () => rentrer(V) }];
  } else if (T.mode === 'conduit' && sien && Math.abs(V.v) < .8 && !V.vol && Math.hypot(V.x - G.G[0], V.z - G.G[1]) < 14) {
    return [{ texte: 'Garer au garage', f: () => { descendre(); if (T.mode === 'pied') rentrer(V); } }];
  }
  return [];
}
function sortir() {
  const G = garageMaison(); if (!G || !T.auGarage || T.veh) return;
  T.garageAnim = true; GA.anim = { sens: 'sortir', phase: 'ouvre', t: 0, G }; son('boite');
}
function rentrer(V) {
  const G = garageMaison(); if (!G || !V) return;
  T.veh = null; T.garageAnim = true; if (V.etiquette) V.etiquette.visible = false;
  GA.anim = { sens: 'rentrer', phase: 'ouvre', t: 0, G, V }; son('boite');
}
// Le chemin : une courbe de la place dans la rue (P1, ou là où elle est) au fond du garage, par le devant du portail (C).
function chemin(A) {
  const { G } = A, D = A.V.D, dedans = [G.G[0] + G.n[0] * (D.long / 2 + .6), G.G[1] + G.n[1] * (D.long / 2 + .6)];
  const a = A.sens === 'sortir' ? dedans : [A.V.x, A.V.z], b = A.sens === 'sortir' ? G.P1 : dedans;
  const L = Math.hypot(G.C[0] - a[0], G.C[1] - a[1]) + Math.hypot(b[0] - G.C[0], b[1] - G.C[1]);
  Object.assign(A, { a, b, duree: Math.min(5, Math.max(2.2, L / 3.2)), cap0: A.V.cap });
}
const bezier = (a, c, b, k) => [(1 - k) ** 2 * a[0] + 2 * (1 - k) * k * c[0] + k * k * b[0], (1 - k) ** 2 * a[1] + 2 * (1 - k) * k * c[1] + k * k * b[1]];
const tangente = (a, c, b, k) => [2 * (1 - k) * (c[0] - a[0]) + 2 * k * (b[0] - c[0]), 2 * (1 - k) * (c[1] - a[1]) + 2 * k * (b[1] - c[1])];
const versAngle = (de, vers, k) => { let d = vers - de; d = Math.atan2(Math.sin(d), Math.cos(d)); return de + d * k; };

/** Chaque image (salon.js) : l'étiquette « Ton garage », et le portail qui s'ouvre, la voiture qui roule, le portail qui se ferme. */
export function majGarage(dt) {
  const S = GA.S; if (!S?.actif) return;
  const I = maisonActuelle(), G = I?.garage; if (!G) return;
  const d = Math.hypot(S.x - G.G[0], S.z - G.G[1]);
  G.etiquette.visible = T.auGarage && !S.lieu && d < 60 && !GA.anim;
  // Au premier passage devant chez soi, sa voiture au garage : on le dit, une fois par partie.
  if (!GA.dit && T.auGarage && !S.lieu && d < 25 && VIE.data?.vehicule) { GA.dit = true; GA.ligne(`${nomSonVehicule(VIE.data.vehicule)} est dans ton garage, à côté de ta porte : « Sortir ${nomMin(VIE.data.vehicule)} du garage ».`); }
  const A = GA.anim; if (!A || A.G !== G) return;
  A.t += dt;
  if (A.phase === 'ouvre') {
    ouverture(G, lisse(Math.min(1, A.t / OUVRIR)));
    if (A.t < OUVRIR) return;
    if (A.sens === 'sortir') { // elle était là, dans l'ombre, l'avant vers le fond : elle sort en marche arrière
      const D = VEHICULES[VIE.data?.vehicule]; if (!D) { finir(A); return; }
      const x = G.G[0] + G.n[0] * (D.long / 2 + .6), z = G.G[1] + G.n[1] * (D.long / 2 + .6);
      A.V = poserSonVehicule(x, z, Math.atan2(G.n[0], G.n[1])); if (!A.V) { finir(A); return; }
      if (A.V.etiquette) A.V.etiquette.visible = false;
    }
    chemin(A); A.phase = 'roule'; A.t = 0;
  } else if (A.phase === 'roule') {
    const k = lisse(Math.min(1, A.t / A.duree)), [x, z] = bezier(A.a, G.C, A.b, k), [tx, tz] = tangente(A.a, G.C, A.b, Math.min(.999, Math.max(.001, k)));
    let cap = A.sens === 'sortir' ? Math.atan2(-tx, -tz) : Math.atan2(tx, tz); // en marche arrière, l'avant regarde d'où l'on vient
    if (A.sens === 'rentrer' && k < .3) cap = versAngle(A.cap0, cap, k / .3); // elle tourne en démarrant, sans saut
    placer(A.V, x, z, cap);
    if (A.t < A.duree) return;
    if (A.sens === 'sortir') { placer(A.V, G.P1[0], G.P1[1], G.cap1); if (A.V.etiquette) A.V.etiquette.visible = true; }
    else retirerVehicule(A.V); // au fond du garage, dans l'ombre : elle y reste
    A.phase = 'ferme'; A.t = 0; son('boite');
  } else {
    ouverture(G, lisse(Math.max(0, 1 - A.t / OUVRIR)));
    if (A.t >= OUVRIR) finir(A);
  }
}
function finir(A) {
  ouverture(A.G, 0); GA.anim = null; T.garageAnim = false;
  const type = VIE.data?.vehicule;
  if (A.sens === 'sortir') { T.auGarage = !T.veh; if (T.veh && type) GA.ligne(/^Ton /.test(nomSonVehicule(type)) ? `${nomSonVehicule(type)} est sorti du garage : approche-toi et monte.` : `${nomSonVehicule(type)} est sortie du garage : approche-toi et monte.`); }
  else { T.auGarage = true; if (type) GA.ligne(`${nomSonVehicule(type)} est au garage. Le portail est fermé.`); }
}
/** Quitter la ville au milieu d'un passage : la voiture finit là où elle allait. */
export function quitterGarage() {
  const A = GA.anim; if (!A) return;
  if (A.sens === 'rentrer') { retirerVehicule(A.V); T.auGarage = true; }
  ouverture(A.G, 0); GA.anim = null; T.garageAnim = false;
}
