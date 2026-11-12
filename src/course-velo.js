import * as THREE from 'three';
import { $, toXZ } from './base.js';
import { son } from './audio.js';
import { E } from './etat.js';
import { CAI_LIEU } from './caicai.js';
import { creerVehicule, itineraire, longueur, placer, retirerRuban, retirerVehicule, ruban, suivreChemin } from './conduite.js';
import { PLACES } from './donnees-lieux.js';
import { personne } from './discussions.js';
import { etiquette } from './interieurs.js';
import { scene } from './scene.js';
import { chevauchement } from './trafic.js';
import { T, asseoirSur, pointDeRoute } from './trajets.js';
import { VIE, gagner } from './vie.js';

// ---------- Les courses à vélo de RideCorniche (ex-Caï Caï Vélo, « Vivre à Cotonou ») ----------
// « Ajoute les courses de vélo aussi dans Vivre à Cotonou, avec des ordinateurs » (Murielle, 11/11). Comme la course de
// motos de Zém Run (course.js), mais en ville, sur son vélo loué : devant la boutique, « Course à vélo », un parcours, et
// l'on part au milieu de trois cyclistes conduits par le jeu, chacun avec son nom et sa façon de rouler. Le parcours suit
// les vraies rues, jusqu'à un lieu du jeu ; les chevrons au sol le montrent. Les trois premiers sont payés.
// Les cyclistes du jeu suivent le parcours (conduite.js, suivreChemin), chacun dans sa file ; ils ralentissent dans les
// virages, ne traversent ni le joueur, ni les autres, ni la circulation (ils attendent derrière, ou doublent par une autre
// file), et la circulation s'arrête pour eux comme pour le joueur (E.garees). Un peu d'élastique garde la course serrée :
// devant, ils lèvent le pied ; derrière, ils appuient. Chaque victoire les rend un peu plus forts.
// Seul le joueur les voit : en ville ou entre amis, les autres joueurs voient seulement son vélo.

// Un seul parcours depuis le 12/11 : « pour la course, c'est de la Corniche à l'église cathédrale, c'est tout » (Murielle),
// la boutique étant passée de l'Amazone à la Corniche Est. Environ 2 km, par l'ancien pont.
const PARCOURS = [
  // `arrivee` : décalage depuis le point de la cathédrale (donnees-lieux.js). Sans lui, l'arrivée tombait sur la route la
  // plus proche du centre, un sentier derrière la nef, d'où on ne la voyait pas ; ici, la grande rue du côté de sa façade
  // (l'ouest), au rendez-vous « Cathédrale Notre-Dame » de salon.js.
  { id: 'cathedrale', nom: 'De la Corniche à la cathédrale', vers: 'cathedrale', arrivee: [-32, 2], prix: [1500, 750, 300] },
];
// vmax en m/s (le vélo du joueur : 7), accel en m/s², et la graine de leur personnage.
const RIVAUX = [
  { nom: 'Rachidi', titre: 'le sprinteur', vmax: 7.3, accel: 3.1, graine: 4411, femme: false },
  { nom: 'Akouavi', titre: 'la régulière', vmax: 7.05, accel: 2.8, graine: 5127, femme: true },
  { nom: 'Tonton Basile', titre: 'le vieux routier', vmax: 6.75, accel: 2.5, graine: 6203, femme: false },
];
const FILES = [-1.5, -.5, .5, 1.5]; // m, de part et d'autre du parcours ; le joueur part dans la 3e
const FILE_JOUEUR = 2, DECOMPTE = 3, PRES = 30; // s de compte à rebours ; m de la boutique pour s'inscrire
const LONG = 1.8, LARG = .6; // le vélo (conduite.js, VEHICULES.velo)
const CLE_VICTOIRES = 'kutonu.velo.victoires';

let X = { S: null, ligne: () => { }, choisir: () => { } };
let C = null; // la course en cours
const victoires = () => { try { return +localStorage.getItem(CLE_VICTOIRES) || 0; } catch { return 0; } };
const surVelo = () => T.mode === 'conduit' && T.veh?.type === 'velo';
const fmt = n => `${n.toLocaleString('fr-FR')} F`;
const PLACES_TXT = ['1re', '2e', '3e', '4e'], place = n => PLACES_TXT[n - 1] ?? `${n}e`; // un texte par place : la version anglaise les traduit un à un

/** Le tracé d'un parcours (au départ de la boutique) : { pts, cum, total } ou null. Calculé une fois. */
const TRACES = new Map();
function trace(P) {
  if (TRACES.has(P.id)) return TRACES.get(P.id);
  const dep = pointDeRoute(CAI_LIEU.x, CAI_LIEU.z + 8, 0, 60), lieu = PLACES.find(q => q.id === P.vers);
  let t = null;
  if (dep && lieu) {
    const [x, z] = toXZ(lieu.lat, lieu.lon), [ax, az] = P.arrivee || [0, 0], arr = pointDeRoute(x + ax, z + az, 0, 80);
    const pts = arr && itineraire(dep[0], dep[1], null, arr[0], arr[1]);
    if (pts && pts.length > 1) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); t = { pts, cum, total: longueur(pts) }; }
  }
  TRACES.set(P.id, t); return t;
}
/** Le même tracé, décalé de `d` mètres sur le côté : une file par cycliste, avec les mêmes indices de points. */
function decaler(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return [p[0] + dz / l * d, p[1] - dx / l * d];
  });
}
/** Où en est (x, z) sur le tracé, en mètres depuis le départ ; `k` : le segment trouvé la dernière fois (jamais en arrière). */
function progres(tr, x, z, k) {
  let bk = k, bt = 0, bd = Infinity;
  for (let i = Math.max(1, k); i < Math.min(tr.pts.length, k + 8); i++) {
    const [ax, az] = tr.pts[i - 1], ux = tr.pts[i][0] - ax, uz = tr.pts[i][1] - az, l2 = ux * ux + uz * uz || 1;
    const t = THREE.MathUtils.clamp(((x - ax) * ux + (z - az) * uz) / l2, 0, 1), d = Math.hypot(ax + ux * t - x, az + uz * t - z);
    if (d < bd - .01) { bd = d; bk = i; bt = t; }
  }
  return { k: bk, s: tr.cum[bk - 1] + (tr.cum[bk] - tr.cum[bk - 1]) * bt, ecart: bd };
}

// ---------- S'inscrire ----------
export function actionsCourseVelo(S) {
  if (C) return C.phase === 'fin' ? [] : [{ texte: 'Abandonner la course', f: () => arreter('Course abandonnée.') }];
  if (S.lieu || !surVelo() || Math.hypot(S.x - CAI_LIEU.x, S.z - CAI_LIEU.z) > PRES || Math.abs(T.veh.v) > 1.5) return [];
  return [{ texte: 'Course à vélo', f: choisirParcours }];
}
function choisirParcours() {
  const v = victoires();
  X.choisir('Course à vélo : quel parcours ?', PARCOURS.map(P => {
    const t = trace(P);
    return { texte: P.nom, sous: t ? `${Math.round(t.total / 10) * 10} m · 1re place ${fmt(P.prix[0])}, 2e ${fmt(P.prix[1])}, 3e ${fmt(P.prix[2])}` : 'Parcours indisponible', desactive: !t, f: () => partir(P) };
  }), { annuler: v ? `Pas maintenant (${v} victoire${v > 1 ? 's' : ''})` : 'Pas maintenant' });
}

// ---------- Le départ ----------
function partir(P) {
  const tr = trace(P); if (!tr || !surVelo()) return;
  arreter(); // une course d'avant, au cas où
  // Les files continuent 10 m après la ligne : les cyclistes la passent lancés, au lieu de s'arrêter juste avant (suivreChemin
  // s'arrête au bout de son chemin ; deux d'entre eux restaient à 1 m de l'arrivée).
  const [ya, za] = tr.pts.at(-2), [yb, zb] = tr.pts.at(-1), lf = Math.hypot(yb - ya, zb - za) || 1;
  const files = FILES.map(d => decaler([...tr.pts, [yb + (yb - ya) / lf * 10, zb + (zb - za) / lf * 10]], d)), [ax, az] = tr.pts[0], [bx, bz] = tr.pts[1], cap = Math.atan2(bx - ax, bz - az);
  const force = 1 + .02 * Math.min(4, victoires()); // un peu plus forts à chaque victoire (+8 % au plus)
  C = { P, tr, files, phase: 'decompte', t: DECOMPTE, n: 0, msgT: 0, temps: 0, ruban: ruban(tr.pts), rivaux: [], joueur: { k: 1, s: 0, fini: 0 }, horsT: 0, horsDit: 0, hudT: 0, finT: 0 };
  // Le joueur dans sa file, face au parcours ; les autres de part et d'autre.
  const pose = (i, recul = 0) => { const [x, z] = files[i][0]; return [x - Math.sin(cap) * recul, z - Math.cos(cap) * recul]; };
  const [jx, jz] = pose(FILE_JOUEUR); placer(T.veh, jx, jz, cap); T.gel = true;
  E.routeFermee = true; // la rue est fermée : plus de voitures, de zéms ni de tokpas jusqu'à la fin (circulation.js, main.js)
  let r = 0;
  for (let i = 0; i < FILES.length; i++) {
    if (i === FILE_JOUEUR) continue;
    const st = RIVAUX[r++], V = creerVehicule('velo'), [x, z] = pose(i), p = personne(st.graine, { femme: st.femme });
    placer(V, x, z, cap);
    const et = etiquette(st.nom); et.position.y = 2.05; V.g.add(et);
    scene.add(p); asseoirSur(p, V, false);
    C.rivaux.push({ ...st, V, p, file: i, P: { pts: files[i], i: 1 }, k: 1, s: 0, fini: 0, vmax: st.vmax * force, bloque: 0 });
  }
  $('#vhCourse').hidden = false;
  X.ligne(`Course « ${P.nom} » : ${Math.round(tr.total / 10) * 10} m contre ${RIVAUX.map(s => `${s.nom} (${s.titre})`).join(', ')}. Suis les chevrons jusqu’à l’arrivée ! La rue est fermée aux voitures pendant la course.`);
}

// ---------- À chaque image ----------
/** Appelé par le salon après la mise à jour des véhicules garés, avant que le joueur ne roule (salon.js). */
export function majCourseVelo(dt, S) {
  if (!C) return;
  if (S.lieu || !surVelo()) { arreter(T.mode === 'conduit' || T.mode === 'pied' ? 'Tu es descendu du vélo : course abandonnée.' : ''); return; }
  const J = { x: T.veh.x, z: T.veh.z, cap: T.veh.cap, v: T.veh.v };
  if (C.phase === 'decompte') { // 3, 2, 1 : le vélo du joueur est tenu (trajets.js, T.gel)
    C.t -= dt; T.gel = true;
    const n = Math.ceil(C.t);
    if (C.t <= 0) { decompte('Partez !'); C.msgT = 1; son('klaxon'); T.gel = false; C.phase = 'course'; }
    else if (n !== C.n) { C.n = n; decompte(String(n)); son('arret'); }
  } else if (C.phase === 'course') {
    C.temps += dt;
    if (C.msgT > 0 && (C.msgT -= dt) <= 0) decompte('');
  } else if (C.phase === 'fin') { C.finT -= dt; if (C.finT <= 0) { arreter(); return; } }
  if (C.phase !== 'decompte') rouler(dt, J);
  // Le joueur : où il en est, et s'il a quitté le parcours.
  if (C.phase === 'course' && !C.joueur.fini) {
    const pr = progres(C.tr, J.x, J.z, C.joueur.k); C.joueur.k = pr.k;
    if (pr.ecart < 30) { C.joueur.s = Math.max(C.joueur.s, pr.s); C.horsT = 0; }
    else if ((C.horsT += dt) > 2 && performance.now() > C.horsDit) { C.horsDit = performance.now() + 6000; X.ligne('Tu sors du parcours : reviens sur les chevrons, sinon les autres te passent devant.'); }
    if (C.joueur.s >= C.tr.total - 5 && Math.hypot(J.x - C.tr.pts.at(-1)[0], J.z - C.tr.pts.at(-1)[1]) < 15) arrivee();
    else if (C.rivaux.every(R => R.fini) && C.temps - Math.max(...C.rivaux.map(R => R.fini)) > 60) arrivee(true); // une minute après le dernier : on arrête
  }
  // Solides : le joueur bute contre eux (conduite.js, E.circulation) et la circulation s'arrête devant eux (E.garees).
  for (const R of C.rivaux) {
    E.circulation.push({ px: R.V.x, pz: R.V.z, cap: R.V.cap, hl: LONG / 2, hw: LARG / 2, v: R.V.v, type: 'velo' });
    E.garees.push({ x: R.V.x, z: R.V.z, cap: R.V.cap, hl: LONG / 2, hw: LARG / 2 });
  }
  if ((C.hudT -= dt) <= 0) { C.hudT = .2; hud(); }
}
/** Les cyclistes du jeu : suivre sa file, ne rien traverser, doubler ce qui bloque. */
function rouler(dt, J) {
  const obst = [{ x: J.x, z: J.z, cap: J.cap, v: J.v, hl: (T.veh.D.long ?? LONG) / 2, hw: (T.veh.D.larg ?? LARG) / 2 }, ...C.rivaux.map(R => ({ x: R.V.x, z: R.V.z, cap: R.V.cap, v: R.V.v, hl: LONG / 2, hw: LARG / 2, R })),
    ...E.circulation.map(O => ({ x: O.px, z: O.pz, cap: O.cap, v: O.v ?? 0, hl: O.hl, hw: O.hw }))];
  for (const R of C.rivaux) {
    const V = R.V;
    if (R.fini) { V.v = Math.max(0, V.v - 4 * dt); if (V.v > 0) suivreChemin(V, R.P, dt, V.v); asseoirSur(R.p, V, false); continue; }
    // L'élastique : 25 m devant le joueur, il lève le pied (jusqu'à −12 %) ; 25 m derrière, il appuie (jusqu'à +6 %).
    const ecart = R.s - C.joueur.s, el = ecart > 0 ? 1 - .12 * Math.min(1, Math.max(0, ecart - 10) / 30) : 1 + .06 * Math.min(1, Math.max(0, -ecart - 10) / 25);
    let vmax = R.vmax * el;
    // Ce qu'il y a devant lui, dans sa file : il ralentit derrière, et cherche à doubler.
    const sx = Math.sin(V.cap), cz = Math.cos(V.cap); let devant = Infinity, vDevant = 0;
    for (const O of obst) {
      if (O.R === R) continue;
      const dx = O.x - V.x, dz = O.z - V.z, av = dx * sx + dz * cz, lat = Math.abs(dx * cz - dz * sx);
      if (av > 0 && av < 6 && lat < LARG / 2 + O.hw + .15 && av - O.hl < devant) { devant = av - O.hl - LONG / 2; vDevant = O.v; }
    }
    if (devant < 3.5) { vmax = Math.min(vmax, Math.max(0, vDevant - .2 + devant * .5)); R.bloque += dt; } else R.bloque = Math.max(0, R.bloque - dt);
    if (R.bloque > .6) doubler(R, obst);
    const x = V.x, z = V.z, cap = V.cap, km = V.km;
    suivreChemin(V, R.P, dt, Math.min(vmax, V.v + R.accel * dt)); // il pédale : pas l'accélération d'un moteur
    // Entré dans quelqu'un malgré tout (un virage serré, un joueur qui se rabat) : il reste où il était.
    if (obst.some(O => O.R !== R && Math.abs(O.x - V.x) < 4 && Math.abs(O.z - V.z) < 4 && chevauchement(V.x, V.z, V.cap, LONG / 2, LARG / 2, O.x, O.z, O.cap, O.hl, O.hw) > 0)) {
      V.x = x; V.z = z; V.cap = cap; V.km = km; V.v = 0; V.g.position.x = x; V.g.position.z = z; V.g.rotation.y = cap; R.bloque += dt;
    }
    asseoirSur(R.p, V, false);
    const pr = progres(C.tr, V.x, V.z, R.k); R.k = pr.k; R.s = Math.max(R.s, pr.s);
    if (R.s >= C.tr.total - 5) { R.fini = C.temps; if (!C.joueur.fini) X.ligne(`${R.nom} passe la ligne d’arrivée.`); }
  }
}
/** Changer de file pour passer : la plus proche qui est libre sur 7 m devant et 2 m derrière. */
function doubler(R, obst) {
  const V = R.V;
  for (const f of [R.file + 1, R.file - 1, R.file + 2, R.file - 2]) {
    if (f < 0 || f >= FILES.length) continue;
    const d = FILES[f] - FILES[R.file], sx = Math.sin(V.cap), cz = Math.cos(V.cap), x = V.x + cz * d, z = V.z - sx * d;
    const libre = obst.every(O => { if (O.R === R) return true; const dx = O.x - x, dz = O.z - z, av = dx * sx + dz * cz, lat = Math.abs(dx * cz - dz * sx); return !(av > -2 && av < 7 && lat < LARG / 2 + O.hw + .25); }); // files à 1 m : avec 1 + O.hw, la voisine n'était jamais libre (relecteur, 12/11)
    if (libre) { R.file = f; R.P.pts = C.files[f]; R.bloque = 0; return; }
  }
  R.bloque = 0; // pas de place : il attend un peu avant de réessayer
}

// ---------- L'arrivée ----------
function arrivee(horsDelai = false) {
  if (C.joueur.fini) return;
  C.joueur.fini = C.temps;
  const devant = C.rivaux.filter(R => R.fini || R.s > C.joueur.s).length, rang = horsDelai ? C.rivaux.length + 1 : devant + 1, prix = rang <= 3 ? C.P.prix[rang - 1] : 0;
  const temps = `${Math.floor(C.temps / 60)} min ${String(Math.round(C.temps % 60)).padStart(2, '0')} s`;
  C.phase = 'fin'; C.finT = 8; decompte(rang === 1 ? 'Gagné !' : place(rang)); son(rang === 1 ? 'piece' : 'arret');
  if (rang === 1) { try { localStorage.setItem(CLE_VICTOIRES, String(victoires() + 1)); } catch { } }
  // Pas le signal « course » : il compte les courses de zém et de taxi (missions du jour, chapitres), et le prix passait pour 800 courses.
  if (prix && VIE.data) gagner(prix, `course à vélo, ${place(rang)} place`, { source: 'courseVelo' });
  X.ligne(horsDelai ? `Course terminée : les trois autres sont arrivés depuis longtemps. Tu finis ${place(rang)}.`
    : `Arrivée en ${temps} : tu finis ${place(rang)} sur ${C.rivaux.length + 1}.${prix ? ` Tu gagnes ${fmt(prix)}.` : ''}${rang === 1 ? ' Les autres s’entraîneront pour la prochaine fois.' : ''}`);
  const P = C.P;
  setTimeout(() => X.choisir(rang === 1 ? `1re place, en ${temps} !` : `${place(rang)} place, en ${temps}`, [
    { texte: 'Rejouer ce parcours', sous: 'Retour au départ, devant RideCorniche', f: () => { if (!surVelo()) return X.ligne('Remonte sur ton vélo pour rejouer.'); arreter(); partir(P); } },
  ], { annuler: 'Fermer' }), 1500);
}
/** Le gros texte du milieu de l'écran : 3, 2, 1, Partez !, la place à l'arrivée. */
function decompte(txt) { const el = $('#cvDecompte'); if (!el) return; el.textContent = txt; el.hidden = !txt; el.classList.remove('cv-pop'); void el.offsetWidth; if (txt) el.classList.add('cv-pop'); } // relancée à chaque texte
function hud() {
  const el = $('#vhCourse'); if (!el || !C) return;
  const tous = [{ s: C.joueur.fini ? Infinity : C.joueur.s, fini: C.joueur.fini, moi: true }, ...C.rivaux.map(R => ({ s: R.s, fini: R.fini }))];
  tous.sort((a, b) => (a.fini && b.fini ? a.fini - b.fini : a.fini ? -1 : b.fini ? 1 : b.s - a.s));
  const rang = tous.findIndex(t => t.moi) + 1, reste = Math.max(0, Math.round((C.tr.total - C.joueur.s) / 10) * 10);
  const html = C.phase === 'decompte' ? '<small>Course</small> Prêt…' : `<small>Course</small><span>${place(rang)}</span> / ${tous.length}${C.joueur.fini ? ' · arrivé' : ` · ${reste} m`}`;
  if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
}

/** Arrête la course et retire les cyclistes du jeu (aussi en quittant la ville : trajets.js, quitterMonde). */
export function arreterCourseVelo(message = '') { arreter(message); }
function arreter(message = '') {
  if (!C) return;
  for (const R of C.rivaux) { retirerVehicule(R.V); scene.remove(R.p); R.p.userData.liberer?.(); }
  retirerRuban(C.ruban); C = null; T.gel = false; E.routeFermee = false; // la circulation revient, loin, hors de vue
  const h = $('#vhCourse'); if (h) h.hidden = true; const d = $('#cvDecompte'); if (d) d.hidden = true;
  if (message) X.ligne(message);
}
export const courseVeloEnCours = () => !!C;

export function initCourseVelo(ctx) {
  X = ctx;
  if (import.meta.env.DEV) window.__cv = { get C() { return C; }, PARCOURS, partir: id => partir(PARCOURS.find(P => P.id === id) || PARCOURS[0]), trace, arreter };
}
