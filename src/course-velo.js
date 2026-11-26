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
import { VIE, depenser, gagner } from './vie.js';
import { DANS_APPLI, echecCertain, paiementReel, payerMoMo } from './paiement.js';
import { jetonJoueur, proposerRecharge } from './recharge.js';
import { ASPIRATION, DECOMPTE, ELAN, PRIX_JEU, PRIX_MOMO } from './course-velo-regles.js';

// ---------- Les courses à vélo de RideCorniche (ex-Caï Caï Vélo, « Vivre à Cotonou ») ----------
// « Ajoute les courses de vélo aussi dans Vivre à Cotonou, avec des ordinateurs » (Murielle, 11/11). Comme la course de
// motos de Zém Run (course.js), mais en ville, sur son vélo loué : devant la boutique, « Course à vélo », un parcours, et
// l'on part au milieu de trois cyclistes conduits par le jeu, chacun avec son nom et sa façon de rouler. Le parcours suit
// les vraies rues, jusqu'à un lieu du jeu ; les chevrons au sol le montrent. Les trois premiers sont payés.
// Les cyclistes du jeu suivent le parcours (conduite.js, suivreChemin), chacun dans sa file ; ils gardent leur vitesse dans
// les virages, ne traversent ni le joueur, ni les autres, ni la circulation (ils attendent derrière, ou doublent par une
// autre file), et la circulation s'arrête pour eux comme pour le joueur (E.garees). Chaque victoire les rend un peu plus forts.
// Seul le joueur les voit : en ville ou entre amis, les autres joueurs voient seulement son vélo.
//
// Depuis le 14/11, la course est payante et le gagnant reçoit un vrai ticket RideCorniche : « rends les joueurs de
// l'ordinateur plus rapides, plus efficaces ; on n'a pas beaucoup de tickets à partager en vrai, donc la personne qui gagne
// doit être trop smart ; qu'ils soient trop forts dans les ralentissements, dans tout » (Murielle). Donc :
// - ils roulent plus vite que le vélo du joueur, ne ralentissent presque pas dans les virages, doublent vite, et lancent
//   un sprint dans les 250 derniers mètres ; plus d'élastique : ils n'attendent plus le joueur ;
// - l'aspiration : juste derrière un cycliste, on roule plus vite (pour eux comme pour le joueur). Le joueur ne gagne
//   qu'en roulant sans faute ET en profitant de leur roue, puis en sortant au bon moment ;
// - l'inscription : PRIX_JEU du porte-monnaie de « Ma vie » et PRIX_MOMO par Mobile Money (course-velo-regles.js) ; le
//   serveur (api/course-velo.js) enregistre le départ, vérifie l'arrivée et donne le ticket à la 1re place.

// Un seul parcours depuis le 12/11 : « pour la course, c'est de la Corniche à l'église cathédrale, c'est tout » (Murielle),
// la boutique étant passée de l'Amazone à la Corniche Est. Environ 2 km, par l'ancien pont.
const PARCOURS = [
  // `arrivee` : décalage depuis le point de la cathédrale (donnees-lieux.js). Sans lui, l'arrivée tombait sur la route la
  // plus proche du centre, un sentier derrière la nef, d'où on ne la voyait pas ; ici, la grande rue du côté de sa façade
  // (l'ouest), au rendez-vous « Cathédrale Notre-Dame » de salon.js.
  // `prix` : l'argent du jeu pour les trois premiers (l'inscription coûte PRIX_JEU : le 2e la récupère) ; le 1er gagne aussi le ticket.
  { id: 'cathedrale', nom: 'De la Corniche à la cathédrale', vers: 'cathedrale', arrivee: [-32, 2], prix: [4000, 2000, 1000] },
];
// vmax en m/s (le vélo du joueur : 7), accel en m/s², virage : la vitesse gardée au plus fort d'un virage, sprint : le
// coup d'accélérateur des SPRINT derniers mètres ; et la graine de leur personnage.
const RIVAUX = [
  { nom: 'Rachidi', titre: 'le sprinteur', vmax: 7.2, accel: 3.3, virage: 6.2, sprint: 1.07, graine: 4411, femme: false },
  { nom: 'Akouavi', titre: 'la régulière', vmax: 7.15, accel: 3.1, virage: 6.7, sprint: 1.03, graine: 5127, femme: true },
  { nom: 'Tonton Basile', titre: 'le vieux routier', vmax: 7.05, accel: 2.9, virage: 6.5, sprint: 1.04, graine: 6203, femme: false },
];
const SPRINT = 250;
// L'aspiration : juste derrière un autre cycliste (de 0,8 à 9 m, à moins de 0,75 m de côté, dans le même sens), on roule
// jusqu'à ASPIRATION m/s plus vite ; elle monte en 1 s. En sortant de sa roue après au moins 0,9 s dedans, on prend
// l'élan : ELAN m/s de plus pendant 3 s, qui retombe en 1 s. C'est la seule façon de passer devant eux : il faut rester
// collé au premier, puis sortir au bon moment, ni trop tôt (ils repassent), ni trop tard (pas le temps de passer).
// Réglé sur une course simulée le 14/11 (scratchpad velo/sim1d.mjs, puis dans le jeu) : rouler seul, même sans faute,
// perd de 10 s ; rester dans la roue du premier et sortir entre 60 et 130 m de l'arrivée gagne, de moins d'une seconde
// (sortir à 30-50 m, ou à 170 m et plus : 2e ou 3e).
const ASP = { de: .8, a: 9, cote: .75, monte: 1, descend: 1.25, elan: 3, elanFin: 1 };
const FILES = [-1.5, -.5, .5, 1.5]; // m, de part et d'autre du parcours ; le joueur part dans la 3e
// La grille de départ, comme dans Zém Run (course.js) : les trois cyclistes partent DEVANT le joueur, à gauche et à droite
// de sa file, pour qu'il les voie dès le départ et leur coure après. Côte à côte, ils sortaient du cadre, puis roulaient
// derrière lui (« je ne vois pas les autres vélos qui font la course avec moi, comme sur Zém Run », Murielle, 13/11).
// Une place par rival, dans l'ordre de RIVAUX : sa file et son avance sur le joueur, en mètres.
const GRILLE = [{ file: 1, avance: 6 }, { file: 3, avance: 6 }, { file: 0, avance: 3 }];
const FILE_JOUEUR = 2, PRES = 30; // m de la boutique pour s'inscrire
const LONG = 1.8, LARG = .6; // le vélo (conduite.js, VEHICULES.velo)
const CLE_VICTOIRES = 'kutonu.velo.victoires';
const CLE_INSCRIPTION = 'kutonu.velo.inscription'; // { id, t, paye } : une inscription payée (ou en attente) pas encore courue
const CLE_TICKETS = 'kutonu.velo.tickets'; // [{ code, t }] : les tickets gagnés sur cet appareil
const CLE_RESULTAT = 'kutonu.velo.resultat'; // une arrivée que le serveur n'a pas encore reçue (réseau coupé)

let X = { S: null, ligne: () => { }, choisir: () => { } };
let C = null; // la course en cours
const victoires = () => { try { return +localStorage.getItem(CLE_VICTOIRES) || 0; } catch { return 0; } };
const lireL = (cle, def) => { try { return JSON.parse(localStorage.getItem(cle) || 'null') ?? def; } catch { return def; } };
const ecrireL = (cle, v) => { try { if (v === null) localStorage.removeItem(cle); else localStorage.setItem(cle, JSON.stringify(v)); } catch { /* navigation privée */ } };
const inscription = () => { const i = lireL(CLE_INSCRIPTION, null); return i && /^\d{1,15}$/.test(i.id) && Date.now() - i.t < 7 * 864e5 ? i : null; };
const tickets = () => (Array.isArray(lireL(CLE_TICKETS, [])) ? lireL(CLE_TICKETS, []) : []);
const pause = ms => new Promise(r => setTimeout(r, ms));
// Les essais (serveur de développement seulement) : window.__cvEssai = { payant: true, jeton } fait passer l'inscription
// payante en mode test (?salon-local), avec un faux jeton ; Playwright imite alors FedaPay et le serveur.
const essai = () => (import.meta.env.DEV && window.__cvEssai) || {};
const jeton = () => (essai().jeton ? Promise.resolve(essai().jeton) : jetonJoueur());
const duree = t => `${Math.floor(t / 60)} min ${String(Math.round(t % 60)).padStart(2, '0')} s`;
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
/** Le point à `s` mètres le long de `pts` : [x, z, cap, k], k étant l'indice du point suivant (pour suivreChemin). */
function aDistance(pts, s) {
  for (let k = 1; k < pts.length; k++) {
    const [ax, az] = pts[k - 1], [bx, bz] = pts[k], l = Math.hypot(bx - ax, bz - az);
    if (s <= l || k === pts.length - 1) { const f = Math.min(1, s / (l || 1)); return [ax + (bx - ax) * f, az + (bz - az) * f, Math.atan2(bx - ax, bz - az), k]; }
    s -= l;
  }
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
  renvoyerResultat();
  const P = PARCOURS[0], t = trace(P), ins = inscription(), tk = tickets();
  const options = [ins
    ? { texte: ins.paye ? 'Partir : ta course est payée' : 'Vérifier mon paiement', sous: `${P.nom} · l’inscription par MoMo est déjà faite`, desactive: !t, f: () => reprendre(P) }
    : { texte: P.nom, sous: t ? `${Math.round(t.total / 10) * 10} m · inscription ${fmt(PRIX_JEU)} du jeu + ${fmt(PRIX_MOMO)} par MoMo · 1re place : une vraie balade RideCorniche offerte` : 'Parcours indisponible', desactive: !t, f: () => inscrire(P) }];
  if (tk.length) options.push({ texte: 'Mes tickets RideCorniche', sous: tk.map(x => x.code).join(' · '), f: montrerTickets });
  X.choisir('Course à vélo', options, { annuler: 'Pas maintenant' });
}

// ---------- L'inscription : PRIX_JEU du jeu, puis PRIX_MOMO par Mobile Money ----------
// L'argent du jeu est pris au départ, une fois le paiement MoMo validé ; le paiement est gardé sur l'appareil tant que la
// course n'est pas partie (fenêtre fermée avant de valider sur le téléphone, réseau coupé) : on le reprend ensuite.
async function inscrire(P) {
  if (C) arreter();
  if (DANS_APPLI) return X.ligne('La course à vélo se paie par Mobile Money : elle n’est pas proposée dans l’appli.'); // paiement.js
  if ((VIE.local && !essai().payant) || !paiementReel()) return X.ligne('La course à vélo se paie par Mobile Money : elle n’est pas disponible sur cette copie du jeu.');
  if (!VIE.data || VIE.data.argent < PRIX_JEU) return proposerRecharge({ manque: PRIX_JEU - (VIE.data?.argent || 0), pour: 'l’inscription à la course à vélo', puis: () => inscrire(P) });
  let jt = ''; try { jt = await jeton(); } catch { return X.ligne('Pas de connexion : réessaie dans un instant.'); }
  const r = await payerMoMo({ montant: PRIX_MOMO, description: `Inscription à la course à vélo RideCorniche : ${P.nom} (et ${fmt(PRIX_JEU)} de ton argent du jeu au départ)`, objet: 'courseVelo', extra: { jeton: jt } });
  if (!r.id || echecCertain(r.statut)) return; // fermé avant l'envoi, ou refusé : rien n'a été prélevé, la fenêtre l'a dit
  ecrireL(CLE_INSCRIPTION, { id: r.id, t: Date.now(), paye: !!r.paye }); // gardé AVANT le départ : une coupure ici ne le perd pas
  if (!r.paye) return X.ligne('Dès que tu as validé le paiement sur ton téléphone, reviens devant RideCorniche : « Course à vélo », puis « Vérifier mon paiement ».');
  await prendreLeDepart(P, r.id, jt);
}
async function reprendre(P) {
  const ins = inscription(); if (!ins) return choisirParcours();
  if (!VIE.data || VIE.data.argent < PRIX_JEU) return proposerRecharge({ manque: PRIX_JEU - (VIE.data?.argent || 0), pour: 'l’inscription à la course à vélo', puis: () => reprendre(P) });
  let jt = ''; try { jt = await jeton(); } catch { return X.ligne('Pas de connexion : réessaie dans un instant.'); }
  X.ligne('Vérification de ton inscription…');
  await prendreLeDepart(P, ins.id, jt);
}
const appeler = async corps => {
  try { const r = await fetch('/api/course-velo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify(corps) }); return await r.json(); }
  catch { return { statut: 'reseau' }; }
};
// Ce que le serveur peut répondre au départ, quand la course ne part pas.
const OUBLIER = ['deja', 'declined', 'canceled', 'refunded', 'autre-objet', 'autre-joueur', 'identifiant-invalide'];
async function prendreLeDepart(P, id, jt) {
  if (!surVelo() || Math.hypot(X.S.x - CAI_LIEU.x, X.S.z - CAI_LIEU.z) > PRES * 2) return X.ligne('Ta course est payée : reviens devant RideCorniche, sur ton vélo, puis « Course à vélo » pour partir.');
  const r = await appeler({ etape: 'depart', id, jeton: jt });
  if (r.statut === 'ok') {
    ecrireL(CLE_INSCRIPTION, null);
    await depenser(PRIX_JEU, 'inscription à la course à vélo');
    if (!surVelo()) return X.ligne('Remonte sur ton vélo : la course est partie sans toi.');
    partir(P, { id });
    return;
  }
  if (r.statut === 'pending') { ecrireL(CLE_INSCRIPTION, { ...inscription(), paye: false }); return X.ligne('Ton paiement n’est pas encore validé. Valide-le sur ton téléphone, puis « Course à vélo » et « Vérifier mon paiement ».'); }
  if (OUBLIER.includes(r.statut)) { ecrireL(CLE_INSCRIPTION, null); return X.ligne(r.statut === 'deja' ? 'Cette inscription a déjà servi pour une course. Une nouvelle course demande une nouvelle inscription.' : 'Ce paiement ne peut pas servir pour la course. Si ton compte MoMo a été débité, écris à Kutɔnu Vibes.'); }
  X.ligne('Le serveur ne répond pas : ta course reste payée. Réessaie dans un instant avec « Course à vélo ».');
}

// ---------- Le départ ----------
function partir(P, paye = null) { // paye : { id } d'une course payée (le serveur a enregistré son départ)
  const tr = trace(P); if (!tr || !surVelo()) return;
  arreter(); // une course d'avant, au cas où
  // Les files continuent 10 m après la ligne : les cyclistes la passent lancés, au lieu de s'arrêter juste avant (suivreChemin
  // s'arrête au bout de son chemin ; deux d'entre eux restaient à 1 m de l'arrivée).
  const [ya, za] = tr.pts.at(-2), [yb, zb] = tr.pts.at(-1), lf = Math.hypot(yb - ya, zb - za) || 1;
  const files = FILES.map(d => decaler([...tr.pts, [yb + (yb - ya) / lf * 10, zb + (zb - za) / lf * 10]], d)), [ax, az] = tr.pts[0], [bx, bz] = tr.pts[1], cap = Math.atan2(bx - ax, bz - az);
  const force = 1 + .02 * Math.min(4, victoires()); // un peu plus forts à chaque victoire (+8 % au plus)
  C = { P, tr, files, paye, force, velo: T.veh, trace: [], phase: 'decompte', t: DECOMPTE, n: 0, msgT: 0, temps: 0, ruban: ruban(tr.pts), rivaux: [], joueur: { k: 1, s: 0, fini: 0, asp: 0, elan: 0 }, horsT: 0, horsDit: 0, hudT: 0, finT: 0 };
  // Le joueur dans sa file, face au parcours ; les autres devant lui, sur le parcours (GRILLE).
  const [jx, jz] = files[FILE_JOUEUR][0]; placer(T.veh, jx, jz, cap); T.gel = true;
  E.routeFermee = true; // la rue est fermée : plus de voitures, de zéms ni de tokpas jusqu'à la fin (circulation.js, main.js)
  RIVAUX.forEach((st, r) => {
    const { file, avance } = GRILLE[r], [x, z, c, k] = aDistance(files[file], avance), V = creerVehicule('velo'), p = personne(st.graine, { femme: st.femme });
    placer(V, x, z, c);
    const et = etiquette(st.nom); et.position.y = 2.05; V.g.add(et);
    scene.add(p); asseoirSur(p, V, false);
    C.rivaux.push({ ...st, V, p, file, P: { pts: files[file], i: k }, k, s: avance, fini: 0, asp: 0, elan: 0, bloque: 0 });
  });
  $('#vhCourse').hidden = false;
  X.ligne(`Course « ${P.nom} » : ${Math.round(tr.total / 10) * 10} m contre ${RIVAUX.map(s => `${s.nom} (${s.titre})`).join(', ')}. Ils sont plus rapides que toi : colle-toi juste derrière l’un d’eux pour profiter de son aspiration. En sortant de sa roue, tu prends de l’élan : c’est le moment de le doubler. Suis les chevrons jusqu’à l’arrivée. La rue est fermée aux voitures pendant la course.`);
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
  // L'aspiration du joueur : son vélo roule plus vite juste derrière un cycliste (conduite.js, piloter : V.bonus).
  const enCourse = C.phase === 'course' && !C.joueur.fini;
  roue(C.joueur, enCourse && aspire(J, C.rivaux.map(R => R.V)), dt);
  T.veh.bonus = enCourse ? bonus(C.joueur) : 0;
  // Le joueur : où il en est, et s'il a quitté le parcours ; sa position à chaque seconde, que le serveur vérifiera.
  if (enCourse && C.temps >= C.trace.length && C.trace.length < 900) C.trace.push([Math.round(J.x), Math.round(J.z)]);
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
/** Vrai si un vélo en (V.x, V.z), tourné vers V.cap, est dans la roue d'un des `autres` : juste derrière, dans le même sens. */
function aspire(V, autres) {
  const sx = Math.sin(V.cap), cz = Math.cos(V.cap);
  return autres.some(O => {
    if (!O || O === V || Math.abs(O.v ?? 0) < 3) return false;
    const dx = O.x - V.x, dz = O.z - V.z, av = dx * sx + dz * cz, lat = Math.abs(dx * cz - dz * sx);
    return av > ASP.de && av < ASP.a && lat < ASP.cote && Math.cos(O.cap - V.cap) > .8;
  });
}
/** L'aspiration et l'élan d'un cycliste (le joueur ou un rival) : `dedans`, s'il est dans une roue en ce moment. */
function roue(Q, dedans, dt) {
  const avant = Q.asp;
  Q.asp = THREE.MathUtils.clamp(Q.asp + (dedans ? ASP.monte : -ASP.descend) * dt, 0, 1);
  if (!dedans && avant >= .9 && Q.elan <= 0) Q.elan = ASP.elan + ASP.elanFin; // il sort de la roue : l'élan
  if (Q.elan > 0) Q.elan = Math.max(0, Q.elan - dt);
}
const bonus = Q => Math.max(ASPIRATION * Q.asp, Q.elan > 0 ? ELAN * Math.min(1, Q.elan / ASP.elanFin) : 0);
/** Les cyclistes du jeu : suivre sa file, ne rien traverser, doubler ce qui bloque. */
function rouler(dt, J) {
  const obst = [{ x: J.x, z: J.z, cap: J.cap, v: J.v, hl: (T.veh.D.long ?? LONG) / 2, hw: (T.veh.D.larg ?? LARG) / 2 }, ...C.rivaux.map(R => ({ x: R.V.x, z: R.V.z, cap: R.V.cap, v: R.V.v, hl: LONG / 2, hw: LARG / 2, R })),
    ...E.circulation.map(O => ({ x: O.px, z: O.pz, cap: O.cap, v: O.v ?? 0, hl: O.hl, hw: O.hw }))];
  for (const R of C.rivaux) {
    const V = R.V;
    if (R.fini) { V.v = Math.max(0, V.v - 4 * dt); if (V.v > 0) suivreChemin(V, R.P, dt, V.v); asseoirSur(R.p, V, false); continue; }
    // Sa vitesse : la sienne, son sprint à la fin, et l'aspiration s'il est dans la roue de quelqu'un (le joueur compris).
    // Plus d'élastique depuis le 14/11 : ils ne lèvent plus le pied quand le joueur est derrière.
    roue(R, aspire(V, [T.veh]), dt); // dans la roue du joueur seulement : entre eux, chacun garde sa file et son allure
    let vmax = (R.vmax * (C.tr.total - R.s < SPRINT ? R.sprint : 1) + bonus(R)) * C.force;
    // Ce qu'il y a devant lui, dans sa file : il ralentit derrière, et cherche vite à doubler.
    const sx = Math.sin(V.cap), cz = Math.cos(V.cap); let devant = Infinity, vDevant = 0;
    for (const O of obst) {
      if (O.R === R) continue;
      const dx = O.x - V.x, dz = O.z - V.z, av = dx * sx + dz * cz, lat = Math.abs(dx * cz - dz * sx);
      if (av > 0 && av < 8 && lat < LARG / 2 + O.hw + .15 && av - O.hl < devant) { devant = av - O.hl - LONG / 2; vDevant = O.v; }
    }
    if (devant < 3) { vmax = Math.min(vmax, Math.max(0, vDevant - .1 + devant * .5)); R.bloque += dt; } else R.bloque = Math.max(0, R.bloque - dt);
    if (R.bloque > .3) doubler(R, obst);
    const x = V.x, z = V.z, cap = V.cap, km = V.km;
    // Il pédale : son accélération faiblit près de sa vitesse la plus haute, comme le vélo du joueur (conduite.js, piloter) ;
    // sans ça, ils prenaient 10 m au joueur dans les premières secondes. Dans les virages, il garde R.virage.
    suivreChemin(V, R.P, dt, Math.min(vmax, V.v + R.accel * Math.max(.15, 1 - V.v / (vmax * 1.05)) * dt), R.virage);
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
  C.joueur.fini = C.temps; T.veh.bonus = 0;
  C.trace.push([Math.round(T.veh.x), Math.round(T.veh.z)]);
  const devant = C.rivaux.filter(R => R.fini || R.s > C.joueur.s).length, rang = horsDelai ? C.rivaux.length + 1 : devant + 1, prix = rang <= 3 ? C.P.prix[rang - 1] : 0;
  const temps = duree(C.temps);
  C.phase = 'fin'; C.finT = 8; decompte(rang === 1 ? 'Gagné !' : place(rang)); son(rang === 1 ? 'piece' : 'arret');
  if (rang === 1) { try { localStorage.setItem(CLE_VICTOIRES, String(victoires() + 1)); } catch { } }
  // Pas le signal « course » : il compte les courses de zém et de taxi (missions du jour, chapitres), et le prix passait pour 800 courses.
  if (prix && VIE.data) gagner(prix, `course à vélo, ${place(rang)} place`, { source: 'courseVelo' });
  X.ligne(horsDelai ? `Course terminée : les trois autres sont arrivés depuis longtemps. Tu finis ${place(rang)}.`
    : `Arrivée en ${temps} : tu finis ${place(rang)} sur ${C.rivaux.length + 1}.${prix ? ` Tu gagnes ${fmt(prix)}.` : ''}`);
  // L'arrivée part au serveur (api/course-velo.js) : pour une 1re place, avec le trajet ; il répond par le ticket.
  const paye = C.paye, corps = paye && { etape: 'arrivee', id: paye.id, rang, temps: Math.round(C.temps * 10) / 10, ...(rang === 1 ? { trace: C.trace } : {}) };
  const rejouer = { texte: 'Rejouer', sous: `Nouvelle inscription : ${fmt(PRIX_JEU)} du jeu + ${fmt(PRIX_MOMO)} par MoMo`, f: () => { arreter(); if (!surVelo()) return X.ligne('Remonte sur ton vélo pour rejouer.'); choisirParcours(); } };
  (async () => {
    const t0 = performance.now(), r = corps ? await envoyerResultat(corps) : null;
    await pause(Math.max(0, 1500 - (performance.now() - t0)));
    if (rang === 1 && r?.ticket) return montrerTicket(r.ticket, temps);
    if (rang === 1 && r?.statut === 'refuse') { X.ligne('Ta victoire n’a pas pu être validée par le serveur : l’équipe de Kutɔnu Vibes va regarder ta course.'); return X.choisir(`1re place, en ${temps}`, [rejouer], { annuler: 'Fermer' }); }
    if (rang === 1 && corps && !r) X.ligne('Ta victoire n’a pas encore pu être envoyée (pas de réseau) : on réessaie à ta prochaine visite chez RideCorniche. Ton ticket arrivera alors.');
    X.choisir(rang === 1 ? `1re place, en ${temps} !` : `${place(rang)} place, en ${temps}`, [rejouer], { annuler: 'Fermer' });
  })();
}
/** Envoie une arrivée (3 essais) ; sans réponse, elle est gardée et renvoyée à la prochaine visite. Rend la réponse ou null. */
async function envoyerResultat(corps) {
  for (let essai = 0; essai < 3; essai++) {
    let jt = ''; try { jt = await jeton(); } catch { /* le réseau, sans doute */ }
    const r = jt ? await appeler({ ...corps, jeton: jt }) : { statut: 'reseau' };
    if (!/^(reseau|serveur-injoignable|occupe|trop-d-essais)$/.test(r.statut || '')) { ecrireL(CLE_RESULTAT, null); return r; }
    await pause(3000);
  }
  ecrireL(CLE_RESULTAT, corps); return null;
}
let renvoi = false;
async function renvoyerResultat() {
  const corps = lireL(CLE_RESULTAT, null); if (!corps || renvoi) return; renvoi = true;
  try { const r = await envoyerResultat(corps); if (r?.ticket) montrerTicket(r.ticket); } finally { renvoi = false; }
}
/** Le ticket du gagnant : gardé sur l'appareil, montré en grand, à présenter chez RideCorniche. */
function montrerTicket(code, temps = '') {
  if (!tickets().some(x => x.code === code)) ecrireL(CLE_TICKETS, [...tickets(), { code, t: Date.now() }].slice(-20));
  son('piece');
  X.ligne(`Bravo ! Ton ticket RideCorniche : ${code}. Fais une capture d’écran et montre ce code chez RideCorniche : ta balade est offerte, en vrai. Tu retrouves tes tickets dans « Course à vélo ».`);
  X.choisir(`${temps ? `Gagné en ${temps} ! ` : ''}Ton ticket RideCorniche : ${code}`, [{ texte: 'Mes tickets RideCorniche', sous: 'Fais une capture d’écran, et montre le code chez RideCorniche', f: montrerTickets }], { annuler: 'Fermer' });
}
function montrerTickets() {
  X.choisir('Mes tickets RideCorniche', tickets().slice().reverse().map(x => ({ texte: x.code, sous: `Gagné le ${new Date(x.t).toLocaleDateString('fr-FR')} · une balade offerte, à montrer chez RideCorniche`, f: () => { } })), { annuler: 'Fermer' });
}
/** Le gros texte du milieu de l'écran : 3, 2, 1, Partez !, la place à l'arrivée. */
function decompte(txt) { const el = $('#cvDecompte'); if (!el) return; el.textContent = txt; el.hidden = !txt; el.classList.remove('cv-pop'); void el.offsetWidth; if (txt) el.classList.add('cv-pop'); } // relancée à chaque texte
function hud() {
  const el = $('#vhCourse'); if (!el || !C) return;
  const tous = [{ s: C.joueur.fini ? Infinity : C.joueur.s, fini: C.joueur.fini, moi: true }, ...C.rivaux.map(R => ({ s: R.s, fini: R.fini }))];
  tous.sort((a, b) => (a.fini && b.fini ? a.fini - b.fini : a.fini ? -1 : b.fini ? 1 : b.s - a.s));
  const rang = tous.findIndex(t => t.moi) + 1, reste = Math.max(0, Math.round((C.tr.total - C.joueur.s) / 10) * 10);
  const html = C.phase === 'decompte' ? '<small>Course</small> Prêt…' : `<small>Course</small><span>${place(rang)}</span> / ${tous.length}${C.joueur.fini ? ' · arrivé' : ` · ${reste} m`}${C.joueur.fini ? '' : C.joueur.elan > 0 ? ' <em class="vh-asp">élan !</em>' : C.joueur.asp > .3 ? ' <em class="vh-asp">aspiration</em>' : ''}`;
  if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
}

/** Arrête la course et retire les cyclistes du jeu (aussi en quittant la ville : trajets.js, quitterMonde). */
export function arreterCourseVelo(message = '') { arreter(message); }
function arreter(message = '') {
  if (!C) return;
  if (C.velo) delete C.velo.bonus; // l'aspiration ne survit pas à la course
  if (C.paye && !C.joueur.fini) { const id = C.paye.id; jeton().then(jt => appeler({ etape: 'arrivee', id, jeton: jt, abandon: true })).catch(() => { }); } // une course payée abandonnée : le registre le dit
  for (const R of C.rivaux) { retirerVehicule(R.V); scene.remove(R.p); R.p.userData.liberer?.(); }
  retirerRuban(C.ruban); C = null; T.gel = false; E.routeFermee = false; // la circulation revient, loin, hors de vue
  const h = $('#vhCourse'); if (h) h.hidden = true; const d = $('#cvDecompte'); if (d) d.hidden = true;
  if (message) X.ligne(message);
}
export const courseVeloEnCours = () => !!C;

export function initCourseVelo(ctx) {
  X = ctx;
  if (import.meta.env.DEV) window.__cv = { get C() { return C; }, PARCOURS, RIVAUX, ASP, partir: id => partir(PARCOURS.find(P => P.id === id) || PARCOURS[0]), trace, arreter }; // sans inscription : pour les essais
}
