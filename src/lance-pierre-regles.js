// ---------- Tir au lance-pierre : les règles, les mêmes sur le téléphone et sur le serveur ----------
// Le jeu (lancepierre.js) dessine le stand et écoute le doigt, la manette, la souris ; ici, rien que le calcul : le stand
// du jour, le vent de chaque tir, le vol du caillou, les cibles qui tombent, les points. Tout avance par pas fixes de
// 1/240 s, sans Math.random ni horloge : rejouée par le serveur (api/lance-pierre.js) à partir des seuls tirs (le pas où
// le caillou part, la visée, la tension), une partie redonne exactement le même score. C'est lui qui l'inscrit au
// classement, pas la page (plan « Tir au lance-pierre — visée, contrôles », 28/10 : vérifier la partie avant tout lot).
// Un tir, c'est trois nombres : le lacet (gauche-droite), la hausse (haut-bas, à la manette et à la souris ; 0 au doigt)
// et la tension p, de 0 à 1. La tension règle la hauteur du coup (voir tangageDe) : tous les lance-pierres et tous les
// appareils ont la même précision et la même puissance, seule la façon de viser change.
// Repère du stand : l'origine est la ligne de tir, +z vers les cibles (le sud, la mer), donc la droite de l'écran est −x.
// Ce fichier tourne aussi sous Node : aucun import du navigateur (base.js, defi.js touchent au document).

export const PAS = 1 / 240, DUREE = 60, RECHARGE = .7, CHARIOT = 15, MAX_TIRS = 90;
export const PTS = { boite: 10, bouteille: 20, mangue: 30, chariot: 40, grosse: 0 };
export const G = 9.81, R_CAILLOU = .03, SEUIL = .12, LACET_MAX = .42, HAUSSE_MAX = .12;
export const ETAGERES = [.8, 1.3, 1.8], Z_ETAGERE = 7.45, Z_BACHE = 7.9, Z_MANGUES = 7.15, Y_BARRE = 2.62, Y_RAIL = .42, Z_RAIL = 6.85;
// La fourche : le caillou part de là, à 90 cm devant l'œil. Elle suivait l'angle de la caméra, donc la taille de l'écran :
// un téléphone en hauteur ne tirait pas du même point qu'un ordinateur.
export const DEPART = { x: 0, y: 1.32, z: .55 };
// L'entraînement de la première fois : trois grosses boîtes sur une haute table, à 3 m (plus bas, le caillou passe
// au-dessus : la tension est réglée pour les étagères, à 7 m).
export const CAISSE = { z: 3.6, y: 1.12, l: 1.7, p: .5 };

// Les mêmes que defi.js (le défi change à 20 h au Bénin), recopiées pour le serveur.
const HEURE = 36e5, JOUR = 24 * HEURE;
export const jourDe = t => new Date(t + 5 * HEURE).toISOString().slice(0, 10);
export const finDe = j => Date.parse(`${j}T19:00:00Z`);
export const debutDe = j => finDe(j) - JOUR;
// Le même que base.js.
const hash = (i, s = 0) => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(s + 1, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

// ---------- Le tir ----------
/** La vitesse du caillou (m/s) selon la tension. */
export const vitesse = p => 12 + 10 * p;
// La hauteur visée monte avec la tension, en ligne droite : au droit des étagères, du sable (à peine tendu) à 2,55 m (à
// fond). Un peu tendu vise le chariot, à moitié l'étagère du milieu, fort les mangues. Avant, le même geste levait la visée ET
// donnait de la vitesse : les deux montaient ensemble, un millimètre de doigt déplaçait le coup de 15 cm.
const Z_REF = Z_ETAGERE - DEPART.z, H_BAS = -.15, H_HAUT = 2.55;
export function tangageDe(p) {
  const v = vitesse(p), y = H_BAS + (H_HAUT - H_BAS) * p - DEPART.y, a = G * Z_REF * Z_REF / (2 * v * v);
  return Math.atan((Z_REF - Math.sqrt(Math.max(0, Z_REF * Z_REF - 4 * a * (a + y)))) / (2 * a));
}
/** La vitesse de départ d'un tir { lacet, hausse, p }, dans le repère du stand. */
export function elan({ lacet, hausse = 0, p }) {
  const t = tangageDe(p) + hausse, v = vitesse(p);
  return { x: -Math.sin(lacet) * Math.cos(t) * v, y: Math.sin(t) * v, z: Math.cos(lacet) * Math.cos(t) * v };
}

// ---------- Le stand du jour ----------
const numeroJour = j => Math.round(Date.parse(`${j}T12:00:00Z`) / 864e5);
/** Le vent du tir `i` (m/s, positif : il pousse vers la droite de l'écran), le même pour tous ce jour-là. */
export const ventDu = (j, i) => Math.round((hash(numeroJour(j) * 131 + i, 31) - .5) * 16) / 2;
/** Le vent en trois forces, pas en chiffres : 0 aucun, 1 faible, 2 moyen, 3 fort. */
export const forceDu = w => { const a = Math.abs(w); return a === 0 ? 0 : a <= 1.5 ? 1 : a <= 3 ? 2 : 3; };
/** Six places sur les étagères (deux par étagère), un rangement par jour : pyramides de boîtes, bouteilles. */
export function rangement(j) {
  const n = numeroJour(j), types = ['pyramide', 'bouteilles', 'petite', 'bouteilles', 'pyramide', 'petite'];
  for (let i = types.length - 1; i > 0; i--) { const k = Math.floor(hash(n, 60 + i) * (i + 1)); [types[i], types[k]] = [types[k], types[i]]; }
  // L'étagère du haut n'a pas la place d'une grande pyramide sous les mangues : on l'échange avec une place plus basse.
  for (const i of [4, 5]) if (types[i] === 'pyramide') { const k = types.findIndex((t, m) => m < 4 && t !== 'pyramide'); [types[i], types[k]] = [types[k], types[i]]; }
  return types.map((type, i) => ({ type, x: (i % 2 ? .62 : -.62) + (hash(n, 70 + i) - .5) * .16, y: ETAGERES[Math.floor(i / 2)] }));
}
/** Les mangues : trois, chacune avec sa ficelle, son balancement et sa phase. */
const manguesDu = j => [-.75, 0, .75].map((x, i) => ({ x: x + (hash(numeroJour(j), 80 + i) - .5) * .2, amp: .12 + hash(numeroJour(j), 83 + i) * .3, w: 1.4 + hash(numeroJour(j), 86 + i) * 1.4, ph: hash(numeroJour(j), 89 + i) * 6.28, fil: .3 + hash(numeroJour(j), 92 + i) * .12 }));

// ---------- Une partie ----------
/**
 * L'état d'une partie, que le jeu dessine et que le serveur rejoue. `tuto` : l'entraînement (trois grosses boîtes, pas de
 * points) ; `vitrine` : le stand au repos, dont les mangues se balancent. Le jeu vide `evts` à chaque image : ce qui
 * vient d'arriver (une cible posée, touchée, partie ; un tir, un coup, un impact), pour les sons et les éclats.
 */
export function creerPartie(j, { tuto = false, vitrine = false, muet = false } = {}) {
  const J = { j, tuto, vitrine, muet, k: 0, t: 0, tirs: 0, recharge: 0, score: 0, comptes: { b: 0, u: 0, g: 0, c: 0, k: 0 }, serie: false, chariot: false, caillou: null, groupes: [], cibles: [], journal: [], evts: [], n: 0, vent: 0, ventPour: 0, pretK: 0, fin: false };
  if (tuto) J.groupes.push({ type: 'tuto', cibles: [] });
  else J.groupes.push(...rangement(j).map(p => ({ ...p, cibles: [] })), { type: 'mangues', mangues: manguesDu(j), cibles: [] });
  for (const Gr of J.groupes) remplir(J, Gr);
  J.vent = ventPour(J, 0);
  bouger(J);
  return J;
}
const ventPour = (J, i) => (J.tuto ? (i < 2 ? 0 : 1.5) : ventDu(J.j, i)); // à l'entraînement : le vent n'arrive qu'au 3e tir
const evt = (J, e) => { if (!J.muet) J.evts.push(e); };

function nouvelleCible(J, type, x, y, z, Gr, support = []) {
  const r = type === 'bouteille' ? .045 : type === 'mangue' ? .078 : type === 'grosse' ? .14 : .072, h = type === 'bouteille' ? .28 : type === 'grosse' ? .3 : .15;
  const C = { id: J.n++, type, x, y, z, r, h, rot: 0, etat: 'debout', t: 0, groupe: Gr, support };
  J.cibles.push(C); Gr.cibles.push(C); evt(J, { e: 'pose', C }); return C;
}
/** Pose (ou repose) les cibles d'une place : la pyramide 3-2-1, la petite 2-1, trois bouteilles, les mangues, le chariot. */
function remplir(J, Gr) {
  for (const C of Gr.cibles) evt(J, { e: 'retire', C });
  J.cibles = J.cibles.filter(C => C.groupe !== Gr); Gr.cibles = []; Gr.vide = 0;
  const z = Z_ETAGERE - .02;
  if (Gr.type === 'pyramide' || Gr.type === 'petite') {
    const rangs = Gr.type === 'pyramide' ? [3, 2, 1] : [2, 1]; let dessous = [];
    rangs.forEach((n, r) => {
      const rang = [];
      for (let k = 0; k < n; k++) rang.push(nouvelleCible(J, 'boite', Gr.x + (k - (n - 1) / 2) * .148, Gr.y + r * .15, z, Gr, r ? [dessous[k], dessous[k + 1]] : []));
      dessous = rang;
    });
  } else if (Gr.type === 'bouteilles') for (let k = 0; k < 3; k++) nouvelleCible(J, 'bouteille', Gr.x + (k - 1) * .24, Gr.y, z, Gr);
  else if (Gr.type === 'mangues') for (const d of Gr.mangues) nouvelleCible(J, 'mangue', d.x, Y_BARRE - d.fil, Z_MANGUES, Gr).balance = d;
  else if (Gr.type === 'chariot') nouvelleCible(J, 'chariot', 0, Y_RAIL + .06, Z_RAIL, Gr); // la boîte posée sur son chariot, qui va et vient sur le rail
  else if (Gr.type === 'tuto') for (const x of [-.55, 0, .55]) nouvelleCible(J, 'grosse', x, CAISSE.y, CAISSE.z, Gr);
}
/** Les cibles qui bougent : les mangues au bout de leur ficelle, la boîte du chariot. */
function bouger(J) {
  const t = J.t;
  for (const C of J.cibles) {
    if (C.etat !== 'debout') continue;
    if (C.balance) { const b = C.balance, a = b.amp * Math.sin(t * b.w + b.ph); C.x = b.x + Math.sin(a) * b.fil; C.y = Y_BARRE - Math.cos(a) * b.fil - .08; C.rot = -a; }
    else if (C.type === 'chariot') C.x = Math.sin(t * 1.1) * 1.05;
  }
}

/** Le caillou peut-il partir ? Pas pendant que le précédent vole, ni pendant la recharge, ni après la minute. */
export const pret = J => !J.fin && !J.vitrine && !J.caillou && J.recharge <= 0 && (J.tuto || J.t < DUREE);
/** Un tir : refusé (false) s'il n'est pas prêt, ou hors des bornes que le jeu permet. */
export function tirer(J, { lacet, hausse = 0, p }) {
  if (!pret(J) || !(Math.abs(lacet) <= LACET_MAX) || !(Math.abs(hausse) <= HAUSSE_MAX) || !(p >= SEUIL && p <= 1)) return false;
  J.caillou = { p: { ...DEPART }, v: elan({ lacet, hausse, p }), vent: J.vent, age: 0, touches: 0, points: 0 };
  J.tirs++; J.recharge = RECHARGE; J.journal.push([J.k, lacet, hausse, p]);
  evt(J, { e: 'tir' });
  return true;
}

const touche = (C, p) => (C.type === 'mangue'
  ? Math.hypot(p.x - C.x, p.y - C.y, p.z - C.z) < C.r + R_CAILLOU
  : Math.hypot(p.x - C.x, p.z - C.z) < C.r + R_CAILLOU && p.y > C.y - R_CAILLOU && p.y < C.y + C.h + R_CAILLOU);
/** Une cible touchée (ou dont le support vient de tomber) : les points, puis elle tombe ou éclate. */
function abattre(J, C, v) {
  if (C.etat !== 'debout') return;
  const c = J.caillou, pts = PTS[C.type];
  if (c) { c.touches++; c.points += pts; if (C.type !== 'grosse') J.comptes[{ boite: 'b', bouteille: 'u', mangue: 'g', chariot: 'c' }[C.type]]++; }
  if (C.type === 'bouteille' || C.type === 'mangue') { C.etat = 'parti'; evt(J, { e: 'eclat', C, pts }); }
  else { C.etat = 'tombe'; C.t = 0; evt(J, { e: 'touche', C, pts, v: { ...v } }); }
  // Ceux qui reposaient dessus tombent aussi.
  for (const D of C.groupe.cibles) if (D.etat === 'debout' && D.support.includes(C)) abattre(J, D, { x: 0, y: 0, z: 3 });
}
/** Le caillou est retombé : on compte le tir, doublé s'il suit un tir réussi. */
function finCoup(J, ou) {
  const c = J.caillou; J.caillou = null;
  if (c.touches) {
    const bonus = J.serie && !J.tuto ? c.points : 0; J.comptes.k += bonus; J.score += c.points + bonus; J.serie = true;
    evt(J, { e: 'coup', points: c.points, bonus, touches: c.touches });
  } else { J.serie = false; evt(J, { e: 'rate', p: { ...c.p }, ou }); }
}
/** Le vol du caillou pendant un pas : le poids, le vent, puis ce qu'il rencontre. */
function voler(J) {
  const c = J.caillou, v = c.v, p = c.p;
  v.y -= G * PAS; v.x += -c.vent * .55 * PAS; // le vent pousse vers la droite de l'écran, soit −x
  p.x += v.x * PAS; p.y += v.y * PAS; p.z += v.z * PAS; c.age += PAS;
  for (const C of J.cibles) if (C.etat === 'debout' && touche(C, p)) { abattre(J, C, v); v.x *= -.15; v.y = .5; v.z *= -.15; break; }
  let ou = '';
  if (p.z >= Z_BACHE - .02) ou = 'bache';
  else if (p.y <= R_CAILLOU) ou = 'sable';
  else if (ETAGERES.some(y => Math.abs(p.y - (y - .02)) < .03 && Math.abs(p.z - Z_ETAGERE) < .17 && Math.abs(p.x) < 1.25)) ou = 'planche';
  else if (J.tuto && p.y < CAISSE.y && p.y > CAISSE.y - .07 && Math.abs(p.z - CAISSE.z) < CAISSE.p / 2 && Math.abs(p.x) < CAISSE.l / 2) ou = 'planche'; // dans le plateau de la table
  else if (c.age > 2.5 || Math.abs(p.x) > 4) ou = 'loin';
  if (ou) { evt(J, { e: 'impact', p: { ...p }, ou }); finCoup(J, ou); }
}

/** Un pas de 1/240 s. */
export function pas(J) {
  J.k++; J.t = J.k * PAS;
  bouger(J);
  if (!J.tuto && !J.vitrine && !J.chariot && J.t >= DUREE - CHARIOT) { J.chariot = true; const Gr = { type: 'chariot', cibles: [] }; J.groupes.push(Gr); remplir(J, Gr); evt(J, { e: 'chariot' }); }
  if (J.caillou) voler(J);
  if (J.recharge > 0) J.recharge -= PAS;
  for (const C of J.cibles) if (C.etat === 'tombe' && (C.t += PAS) > 2.2) { C.etat = 'parti'; evt(J, { e: 'parti', C }); } // tombée, roulée, disparue dans le sable
  // Une place vidée : le forain la remonte un instant plus tard (pas à l'entraînement : on s'arrête quand tout est tombé).
  for (const Gr of J.groupes) {
    if (J.tuto || !Gr.cibles.length || Gr.cibles.some(C => C.etat === 'debout')) continue;
    if ((Gr.vide += PAS) > 1.6 && (Gr.type !== 'chariot' || J.chariot)) remplir(J, Gr);
  }
  // Prêt pour le tir suivant : le vent change.
  if (!J.caillou && J.recharge <= 0 && J.ventPour !== J.tirs) { J.ventPour = J.tirs; J.vent = ventPour(J, J.tirs); J.pretK = J.k; evt(J, { e: 'vent' }); }
  if (!J.caillou && !J.vitrine && !J.fin && (J.tuto ? J.cibles.every(C => C.etat !== 'debout') || J.tirs >= 8 : J.t >= DUREE)) { J.fin = true; evt(J, { e: 'fin' }); }
}

/**
 * Rejoue une partie du jour `j` à partir de ses tirs [[pas, lacet, hausse, tension], …] : le score et ce qui le compose,
 * ou la raison du refus. `vifs` : les tirs partis moins de 10 ms après que le caillou était prêt (un robot tire aussitôt).
 */
export function rejouer(j, tirs) {
  if (!/^20\d\d-\d\d-\d\d$/.test(String(j)) || !Array.isArray(tirs) || tirs.length > MAX_TIRS) return { ok: false, raison: 'demande' };
  if (!tirs.every(t => Array.isArray(t) && t.length === 4 && Number.isInteger(t[0]) && t[0] >= 0 && t.slice(1).every(Number.isFinite))) return { ok: false, raison: 'demande' };
  const J = creerPartie(j, { muet: true }), max = Math.round((DUREE + 4) / PAS); let i = 0, vifs = 0;
  while (!J.fin && J.k < max) {
    for (; i < tirs.length && tirs[i][0] === J.k; i++) {
      const [, lacet, hausse, p] = tirs[i];
      if (!tirer(J, { lacet, hausse, p })) return { ok: false, raison: 'tir-impossible', i };
      if (J.k - J.pretK <= 2) vifs++;
    }
    if (i < tirs.length && tirs[i][0] < J.k) return { ok: false, raison: 'ordre', i };
    pas(J);
  }
  if (i < tirs.length) return { ok: false, raison: 'apres-la-fin', i };
  return { ok: true, score: J.score, comptes: { ...J.comptes }, tirs: J.tirs, vifs };
}
