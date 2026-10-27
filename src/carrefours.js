import { roadLines } from './ville.js';
import { dansTerrePlein } from './terre-pleins.js';

// ---------- Réseau routier : carrefours et itinéraires ----------
// Graphe des rues d'OpenStreetMap (routes principales à rues de quartier). Les lignes ont
// été simplifiées, et les nœuds des carrefours avec : on recalcule les croisements
// géométriquement (sauf entre un pont et ce qui passe dessous). Sert à tourner aux
// carrefours dans Zém Run, puis à recalculer l'itinéraire jusqu'aux arrêts suivants.

const R = { pret: false, X: null, Z: null, adj: null, grille: null, n: 0 };
// Les voies de service et les pistes (classe 5) sont dans le réseau pour que le zém vienne jusqu'aux endroits
// qui n'ont pas de vraie rue (le food court de la Cité ministérielle), mais très pénalisées : on ne les prend
// qu'au bout du trajet, faute de mieux. Zem Run les ignore (carrefoursDe).
const FUSION = 1.6, CASE = 25, FACTEUR = [1, 1, 1.05, 1.2, 1.6, 4];
// Pour remettre une ligne dans le bon sens : jamais par une voie de service (allées du marché Dantokpa, parkings) — souvent
// pas dessinées, sous les toits des étals ; le trajet passait dans les bâtiments.
const SANS_SERVICE = [1, 1, 1.05, 1.2, 1.6, Infinity];
const cle = (x, z, c) => Math.floor(x / c) + ',' + Math.floor(z / c);

export function construireReseau() {
  if (R.pret) return R;
  const t0 = performance.now();
  // 1. Segments, rangés dans une grille de 40 m.
  const segs = [], g = new Map(), C = 40;
  roadLines.forEach((L, li) => {
    if (L.cls > 5) return;
    for (let k = 1; k < L.pts.length; k++) {
      const [ax, az] = L.pts[k - 1], [bx, bz] = L.pts[k], i = segs.length; segs.push([li, k, ax, az, bx, bz, []]);
      for (let cx = Math.floor((Math.min(ax, bx) - 2) / C); cx <= Math.floor((Math.max(ax, bx) + 2) / C); cx++)
        for (let cz = Math.floor((Math.min(az, bz) - 2) / C); cz <= Math.floor((Math.max(az, bz) + 2) / C); cz++) { const q = cx + ',' + cz; let l = g.get(q); if (!l) g.set(q, l = []); l.push(i); }
    }
  });
  // 2. Croisements (et fins de rue posées sur une autre rue, à 1,5 m près).
  for (const l of g.values()) for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) {
    const S = segs[l[a]], T = segs[l[b]];
    if (S[0] === T[0] && Math.abs(S[1] - T[1]) <= 1) continue;
    const pS = roadLines[S[0]].bridge, pT = roadLines[T[0]].bridge;
    const rx = S[4] - S[2], rz = S[5] - S[3], sx = T[4] - T[2], sz = T[5] - T[3], den = rx * sz - rz * sx; if (Math.abs(den) < 1e-6) continue;
    const qx = T[2] - S[2], qz = T[3] - S[3], t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
    const lS = Math.hypot(rx, rz) || 1, lT = Math.hypot(sx, sz) || 1, eS = 1.5 / lS, eT = 1.5 / lT;
    if (t < -eS || t > 1 + eS || u < -eT || u > 1 + eT) continue;
    const auBout = t <= eS || t >= 1 - eS || u <= eT || u >= 1 - eT;
    if (pS !== pT && !auBout) continue; // un pont passe au-dessus : pas de carrefour
    S[6].push(Math.max(0, Math.min(1, t))); T[6].push(Math.max(0, Math.min(1, u)));
  }
  // 3. Nœuds (fusion à 1,6 m) et arêtes le long de chaque rue.
  const X = [], Z = [], fin = new Map(), adj = [];
  const noeud = (x, z) => {
    const cx = Math.floor(x / FUSION), cz = Math.floor(z / FUSION);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = fin.get((cx + i) + ',' + (cz + j)); if (l) for (const n of l) if (Math.hypot(X[n] - x, Z[n] - z) < FUSION) return n; }
    const n = X.length; X.push(x); Z.push(z); adj.push([]); const q = cx + ',' + cz; let l = fin.get(q); if (!l) fin.set(q, l = []); l.push(n); return n;
  };
  // Quatrième champ de l'arête : 0 à double sens, 1 dans le sens autorisé d'une rue à sens unique, −1 à contresens.
  // On garde l'arête interdite dans le graphe (le réseau reste connexe pour noeudsPres, rueSous et le demi-tour) ;
  // c'est l'itinéraire qui refuse de l'emprunter. Les rues de Cotonou sont à sens unique dans l'ordre de L.pts.
  const lier = (a, b, cls, sens) => { if (a === b || adj[a].some(e => e[0] === b)) return; const d = Math.hypot(X[a] - X[b], Z[a] - Z[b]); adj[a].push([b, d, cls, sens ? 1 : 0]); adj[b].push([a, d, cls, sens ? -1 : 0]); };
  let precLigne = -1, prec = -1;
  for (const S of segs) {
    const [li, , ax, az, bx, bz, coupes] = S, cls = roadLines[li].cls, sens = !!roadLines[li].sens;
    if (li !== precLigne) { precLigne = li; prec = noeud(ax, az); }
    for (const t of [...new Set(coupes.map(v => Math.round(v * 1000) / 1000))].sort((p, q) => p - q)) { const n = noeud(ax + (bx - ax) * t, az + (bz - az) * t); lier(prec, n, cls, sens); prec = n; }
    const n = noeud(bx, bz); lier(prec, n, cls, sens); prec = n;
  }
  const grille = new Map(); for (let n = 0; n < X.length; n++) { const q = cle(X[n], Z[n], CASE); let l = grille.get(q); if (!l) grille.set(q, l = []); l.push(n); }
  // 4. Morceaux de rue reliés à rien (parkings, allées privées : une cinquantaine, 1 % des nœuds). On part et on
  //    arrive par le grand réseau : la rue la plus proche du hall de l'aéroport est un parking, et ni le zém ni le
  //    GPS ne trouvaient d'itinéraire jusque-là.
  //    Sans tenir compte du sens unique : la question est « cette rue tient-elle au reste de la ville ? », pas
  //    « peut-on y aller sans faire demi-tour ». Un boulevard à sens unique isolerait sinon tout un quartier.
  const comp = new Int32Array(X.length).fill(-1), tailles = [];
  for (let s = 0; s < X.length; s++) {
    if (comp[s] >= 0) continue;
    const pile = [s], c = tailles.length; let t = 0; comp[s] = c;
    while (pile.length) { const n = pile.pop(); t++; for (const [m] of adj[n]) if (comp[m] < 0) { comp[m] = c; pile.push(m); } }
    tailles.push(t);
  }
  Object.assign(R, { pret: true, X, Z, adj, grille, n: X.length, comp, principal: tailles.indexOf(Math.max(...tailles)) });
  console.info(`réseau routier : ${X.length} nœuds en ${Math.round(performance.now() - t0)} ms`);
  return R;
}

export function noeudsPres(x, z, r) {
  const out = [], cx = Math.floor(x / CASE), cz = Math.floor(z / CASE), k = Math.ceil(r / CASE);
  for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) { const l = R.grille.get((cx + i) + ',' + (cz + j)); if (l) for (const n of l) { const d = Math.hypot(R.X[n] - x, R.Z[n] - z); if (d < r) out.push([n, d]); } }
  return out.sort((a, b) => a[1] - b[1]);
}
/** Le nœud du grand réseau le plus proche de (x, z), à moins de r mètres : [n, d], ou undefined. */
export const noeudRelie = (x, z, r) => noeudsPres(x, z, r).find(([n]) => R.comp[n] === R.principal);
/** Le nœud du réseau où finir un itinéraire vers un arrêt : à 80 m (ou `r`), sinon jusqu'à 400 m (sur la Marina, un
 *  arrêt est à plus de 80 m de toute rue du réseau : ni virage ni demi-tour possible avant lui). */
const cible = (x, z, r = 80) => noeudRelie(x, z, r) || noeudRelie(x, z, 400);
/** Le nœud n est-il sur le grand réseau (pas sur un parking isolé) ? */
export const relie = n => R.comp[n] === R.principal;

/**
 * Plus court chemin (pondéré : on préfère les grands axes), en évitant éventuellement un nœud. `contresens` à
 * vrai autorise à remonter une rue à sens unique : c'est le repli quand le bon sens ne mène nulle part (une
 * cour, un parking dont la seule sortie est mal étiquetée dans OpenStreetMap), plutôt que « pas d'itinéraire ».
 */
function dijkstra(depart, arrivee, interdit = -1, fac = FACTEUR, contresens = false) {
  const N = R.n, dist = new Float64Array(N).fill(Infinity), prec = new Int32Array(N).fill(-1), tas = [[0, depart]]; dist[depart] = 0;
  const pousser = e => { tas.push(e); let i = tas.length - 1; while (i) { const p = (i - 1) >> 1; if (tas[p][0] <= tas[i][0]) break; [tas[p], tas[i]] = [tas[i], tas[p]]; i = p; } };
  const tirer = () => { const h = tas[0], d = tas.pop(); if (tas.length) { tas[0] = d; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < tas.length && tas[a][0] < tas[m][0]) m = a; if (b < tas.length && tas[b][0] < tas[m][0]) m = b; if (m === i) break; [tas[m], tas[i]] = [tas[i], tas[m]]; i = m; } } return h; };
  while (tas.length) {
    const [d, n] = tirer(); if (d > dist[n]) continue; if (n === arrivee) break;
    for (const [m, l, c, sens] of R.adj[n]) { if (m === interdit || (sens === -1 && !contresens)) continue; const nd = d + l * fac[c]; if (nd < dist[m]) { dist[m] = nd; prec[m] = n; pousser([nd, m]); } }
  }
  if (!isFinite(dist[arrivee])) return null;
  const out = []; for (let n = arrivee; n !== -1; n = prec[n]) out.push(n); return out.reverse();
}

/**
 * Le chemin de `de` à `vers`, du plus propre au moins propre : dans le bon sens et sans le nœud `evite`, puis
 * en acceptant `evite`, puis en remontant une rue à sens unique. Les replis repassent par FACTEUR : `fac` peut
 * être DIRECT, qui ne cote pas les voies de service, et l'on s'interdirait les cours et les parkings.
 */
function chemin(de, vers, evite = -1, fac = FACTEUR) {
  return dijkstra(de, vers, evite, fac) || dijkstra(de, vers, evite, FACTEUR) || dijkstra(de, vers, -1, FACTEUR)
    || dijkstra(de, vers, evite, FACTEUR, true) || dijkstra(de, vers, -1, FACTEUR, true);
}

// Direction d'une branche : on suit la rue depuis le carrefour sur `dist` mètres, au plus droit.
function suivre(n, m, dist) {
  const chemin = [n, m]; let total = Math.hypot(R.X[m] - R.X[n], R.Z[m] - R.Z[n]), a = n, b = m;
  while (total < dist && chemin.length < 40) {
    const dx = R.X[b] - R.X[a], dz = R.Z[b] - R.Z[a], l = Math.hypot(dx, dz) || 1; let best = -1, bc = -2;
    for (const [c, , , sens] of R.adj[b]) { if (c === a || sens === -1) continue; const ex = R.X[c] - R.X[b], ez = R.Z[c] - R.Z[b], el = Math.hypot(ex, ez) || 1, cos = (dx * ex + dz * ez) / (l * el); if (cos > bc) { bc = cos; best = c; } }
    if (best < 0 || bc < .3) break; total += Math.hypot(R.X[best] - R.X[b], R.Z[best] - R.Z[b]); chemin.push(best); a = b; b = best;
  }
  return chemin;
}

/** Carrefours le long d'un chemin C : position s, les branches possibles à gauche / à droite, et « tout droit »
 *  (`droit`) quand l'itinéraire prévu tourne là (`sens` : +1 s'il tourne à droite, −1 à gauche). */
export function carrefoursDe(C) {
  if (!R.pret) return [];
  const out = [], vus = new Set(), dir = (i, j) => { const dx = C.X[j] - C.X[i], dz = C.Z[j] - C.Z[i], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  for (let i = 30; i < C.n - 15; i += 3) { // pas le carrefour où l'on vient de tourner
    for (const [n] of noeudsPres(C.X[i], C.Z[i], 4)) {
      if (vus.has(n) || R.adj[n].filter(e => e[2] <= 4).length < 3) continue; vus.add(n); // les voies de service ne font pas un carrefour
      const dIn = dir(i - 12, i), dOut = dir(i, i + 12), cotes = {};
      // L'itinéraire tourne-t-il ici ? (plus de 35° entre l'arrivée et la sortie)
      const tourne = dIn[0] * dOut[0] + dIn[1] * dOut[1] < .82, sens = dIn[0] * dOut[1] - dIn[1] * dOut[0] > 0 ? 1 : -1;
      for (const [m, , cls, sens] of R.adj[n]) {
        if (cls > 4 || sens === -1) continue; // ni dans une allée de parking, ni à contresens d'une rue à sens unique
        const ch = suivre(n, m, 16), f = ch[ch.length - 1], ex = R.X[f] - R.X[n], ez = R.Z[f] - R.Z[n], el = Math.hypot(ex, ez); if (el < 6) continue;
        const ux = ex / el, uz = ez / el, dot = ux * dIn[0] + uz * dIn[1], croix = dIn[0] * uz - dIn[1] * ux;
        if (ux * dOut[0] + uz * dOut[1] > .82 || -dot > .82) continue; // la route suivie, ou celle d'où l'on vient
        // Angle par rapport à l'arrivée : à moins de 35°, c'est « tout droit » (proposé seulement si la route, elle, tourne).
        const cote = tourne && dot > .82 ? 'droit' : croix > 0 ? 'droite' : 'gauche', score = cls * 2 + Math.abs(dot);
        if (!cotes[cote] || score < cotes[cote].score) cotes[cote] = { m, cls, score };
      }
      if (cotes.gauche || cotes.droite || cotes.droit) out.push({ s: i, n, tourne, sens, ...cotes });
    }
  }
  return out.sort((a, b) => a.s - b.s);
}

/** Itinéraire après un virage : du point (x, z) par le carrefour n, la branche m, puis les arrêts `cibles` [[x, z], …]. */
export function itineraire(x, z, n, m, cibles) {
  const debut = suivre(n, m, 35), pts = [[x, z], ...debut.map(k => [R.X[k], R.Z[k]])];
  let cur = debut[debut.length - 1], avant = debut[debut.length - 2];
  for (const [cx, cz] of cibles) {
    const t = cible(cx, cz); if (!t) return null;
    const ch = chemin(cur, t[0], avant); if (!ch) return null;
    for (const k of ch.slice(1)) pts.push([R.X[k], R.Z[k]]);
    if (ch.length > 1) { avant = ch[ch.length - 2]; cur = ch[ch.length - 1]; }
  }
  return pts;
}

/** Le tronçon de rue du réseau sous (x, z), dans l'axe (fx, fz), à 25 m près : [nœud derrière, nœud devant] ou null. */
export function rueSous(x, z, fx, fz) {
  if (!R.pret) return null;
  let rue = null, bd = 25;
  for (const [a] of noeudsPres(x, z, 80)) for (const [b] of R.adj[a]) {
    if (!relie(a)) continue;
    const ux = R.X[b] - R.X[a], uz = R.Z[b] - R.Z[a], l = Math.hypot(ux, uz) || 1; if (Math.abs((ux * fx + uz * fz) / l) < .7) continue;
    const t = Math.max(0, Math.min(1, ((x - R.X[a]) * ux + (z - R.Z[a]) * uz) / (l * l))), d = Math.hypot(R.X[a] + ux * t - x, R.Z[a] + uz * t - z);
    if (d < bd) { bd = d; rue = (ux * fx + uz * fz) > 0 ? [a, b] : [b, a]; }
  }
  return rue;
}
/**
 * Demi-tour : en (x, z), sur la rue `rue` (rueSous) où l'on roulait vers (fx, fz), on repart en sens inverse, puis on
 * rejoint les arrêts `cibles`. `debut` : les points déjà décidés jusqu'à (x, z) (le U lui-même).
 */
export function itineraireDemiTour(x, z, rue, cibles, debut = []) {
  if (!R.pret || !rue || !cibles.length) return null;
  // On remonte la rue derrière soi tant que le chemin vers l'arrêt y ferait aussitôt demi-tour (l'arrêt est devant :
  // le plus court serait de revenir sur ses pas), jusqu'au carrefour d'où l'on peut repartir par ailleurs.
  const [derriere, devant] = rue, tete = [derriere]; let prec = devant, de = [x, z];
  for (let essai = 0; ; essai++) {
    const pts = [...debut, ...tete.map(n => [R.X[n], R.Z[n]])];
    let cur = tete[tete.length - 1], avant = prec, premier = -1;
    for (const [cx, cz] of cibles) {
      const t = cible(cx, cz); if (!t) return null;
      const ch = chemin(cur, t[0], avant); if (!ch) return null;
      if (premier < 0 && ch.length > 1) premier = ch[1];
      for (const n of ch.slice(1)) pts.push([R.X[n], R.Z[n]]);
      if (ch.length > 1) { avant = ch[ch.length - 2]; cur = ch[ch.length - 1]; }
    }
    const s0 = tete[tete.length - 1], ax = R.X[s0] - de[0], az = R.Z[s0] - de[1], la = Math.hypot(ax, az) || 1;
    const revient = premier >= 0 && ((R.X[premier] - R.X[s0]) * ax + (R.Z[premier] - R.Z[s0]) * az) / (la * (Math.hypot(R.X[premier] - R.X[s0], R.Z[premier] - R.Z[s0]) || 1)) < -.7;
    if (!revient || essai >= 15) return pts;
    let suiv = -1, bc = .5; // la suite de la rue, dans le même sens
    for (const [m, l] of R.adj[s0]) { if (m === prec || l < .5) continue; const c = ((R.X[m] - R.X[s0]) * ax + (R.Z[m] - R.Z[s0]) * az) / (la * l); if (c > bc) { bc = c; suiv = m; } }
    if (suiv < 0) return pts; // derrière, une impasse : on y refera demi-tour (cheminDe en fait un U)
    de = [R.X[s0], R.Z[s0]]; prec = s0; tete.push(suiv);
  }
}

/**
 * Le trajet d'une ligne remis sur la bonne chaussée. Les lignes de scripts/donnees.mjs sont calculées sans tenir compte
 * des sens uniques : sur les boulevards à deux chaussées, elles prenaient souvent celle d'en face — le zém roulait à
 * contresens, le trottoir à sa gauche (« c'est pas normal qu'on roule ailleurs que sur la route… on voit clairement
 * qu'il est à contresens. Normalement, au tournant du carrefour, on doit se retrouver sur la route opposée », Carlos,
 * 26/10 ; 1 615 m sur les 1 647 de la ligne express). Tous les 4 m, si la rue sous le trajet est à sens unique dans
 * l'autre sens, le point passe sur la chaussée jumelle qui va dans le bon sens, à 35 m au plus, de l'autre côté du
 * terre-plein (TP, terre-pleins.js : il faut qu'il y en ait un entre les deux). Le trajet garde sa longueur, ses monuments et ses arrêts ; le passage d'une chaussée à l'autre se fait
 * là où la ligne arrive sur le boulevard, au carrefour — comme un vrai tourne-à-gauche. Un recalcul par le plus court
 * chemin dans le bon sens a été essayé : les nœuds du réseau sont trop espacés, il faisait des détours de 50 à 70 %.
 */
export function surLaBonneChaussee(pts, cles = []) {
  const CG = 40, g = new Map();
  // Les ponts comptent : les grands ponts de la lagune ont un tablier par sens, et la ligne prenait celui d'en face.
  roadLines.forEach((L, li) => { if (L.cls > 5) return; for (let k = 1; k < L.pts.length; k++) { const [ax, az] = L.pts[k - 1], [bx, bz] = L.pts[k]; for (let cx = Math.floor((Math.min(ax, bx) - 35) / CG); cx <= Math.floor((Math.max(ax, bx) + 35) / CG); cx++) for (let cz = Math.floor((Math.min(az, bz) - 35) / CG); cz <= Math.floor((Math.max(az, bz) + 35) / CG); cz++) { const q = cx + ',' + cz; (g.get(q) || g.set(q, []).get(q)).push([li, ax, az, bx, bz]); } } });
  // Rue sous (x, z) dans l'axe (dx, dz) — à moins de sa demi-largeur — et la plus proche des chaussées qui vont dans ce sens.
  // Une rue qui tourne de plus de 90° en moins de 600 m : un anneau de rond-point ou une bretelle, pas un boulevard.
  const courbe = L => L.courbe ??= (() => { let t = 0, l = 0; for (let k = 1; k < L.pts.length; k++) { l += Math.hypot(L.pts[k][0] - L.pts[k - 1][0], L.pts[k][1] - L.pts[k - 1][1]); if (k > 1) { const a1 = Math.atan2(L.pts[k - 1][0] - L.pts[k - 2][0], L.pts[k - 1][1] - L.pts[k - 2][1]), a2 = Math.atan2(L.pts[k][0] - L.pts[k - 1][0], L.pts[k][1] - L.pts[k - 1][1]); t += Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))); } } return l < 600 && t > Math.PI / 2; })();
  // La rue sous (x, z) va-t-elle dans l'autre sens que (dx, dz) ? (à sens unique, à moins de sa demi-largeur)
  const aContresens = (x, z, dx, dz) => {
    let rue = null, bd = Infinity;
    for (const [li, ax, az, bx, bz] of g.get(Math.floor(x / CG) + ',' + Math.floor(z / CG)) || []) {
      const L = roadLines[li], ux = bx - ax, uz = bz - az, l = Math.hypot(ux, uz) || 1, c = (ux * dx + uz * dz) / l; if (Math.abs(c) < .8) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / (l * l))), d = Math.hypot(ax + ux * t - x, az + uz * t - z);
      if (d < L.w / 2 && d < bd) { bd = d; rue = { L, c }; }
    }
    return !!rue && rue.L.sens && rue.c < 0;
  };
  const sous = (x, z, dx, dz) => {
    let rue = null, bd = Infinity, bonne = null, bb = 35; const cand = [];
    for (const [li, ax, az, bx, bz] of g.get(Math.floor(x / CG) + ',' + Math.floor(z / CG)) || []) {
      const L = roadLines[li], ux = bx - ax, uz = bz - az, l = Math.hypot(ux, uz) || 1, c = (ux * dx + uz * dz) / l; if (Math.abs(c) < .8) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / (l * l))), px = ax + ux * t, pz = az + uz * t, d = Math.hypot(px - x, pz - z);
      if (d < L.w / 2 && d < bd) { bd = d; rue = { L, c, li }; }
      if (L.sens && c > .8 && d < 35) cand.push([d, px, pz, L.cls, li]);
    }
    if (!rue || !rue.L.sens || rue.c > 0) return null; // la rue sous le trajet va dans notre sens (ou dans les deux)
    // La jumelle : la plus proche des chaussées qui vont dans notre sens, de la même classe à un cran près (pas une bretelle),
    // une autre rue que celle sous le trajet, à 18 m au plus — ou plus loin, mais de l'autre côté d'un terre-plein. Pas
    // l'autre côté d'un rond-point (le trajet traversait l'île et ses maisons : 20 à 60 m), ni une rue parallèle
    // derrière un pâté de maisons.
    const milieu = (px, pz) => [.3, .5, .7].some(f => dansTerrePlein(x + (px - x) * f, z + (pz - z) * f, 1.5));
    const large = rue.L.cls <= 1 && !courbe(rue.L); // les grandes artères ont des terre-pleins larges, pas toujours relevés
    for (const [d, px, pz, cls, li] of cand) if (d < bb && li !== rue.li && Math.abs(cls - rue.L.cls) <= 1 && (d <= 18 || large || milieu(px, pz))) { bb = d; bonne = [px, pz]; }
    return bonne;
  };
  const ech = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az); if (!l) continue;
    const dx = (bx - ax) / l, dz = (bz - az) / l;
    // Tous les 4 m, et le sommet au bout du segment : sans lui, le trajet coupait le coin des virages (jusqu'à 4 m).
    for (let d = i === 1 ? 0 : 4; d < l; d += 4) { const x = ax + dx * d, z = az + dz * d; ech.push([x, z, sous(x, z, dx, dz)]); }
    ech.push([bx, bz, sous(bx, bz, dx, dz)]);
  }
  // Pas de bascule de moins de 40 m (10 échantillons) : les étiquettes de sens unique changent d'un tronçon OSM à
  // l'autre, et le trajet sautait d'une chaussée à l'autre en travers du terre-plein, au milieu du pâté de maisons.
  const bas = ech.map(e => !!e[2]);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < bas.length;) { let j = i; while (j < bas.length && bas[j] === bas[i]) j++; if (j - i < 10 && i > 0 && j < bas.length) for (let k = i; k < j; k++) bas[k] = !bas[k]; i = j; }
  const out = []; let n = 0;
  for (const [i, [x, z, q]] of ech.entries()) { if (bas[i] && q) { n++; out.push([q[0], q[1]]); } else out.push([x, z]); }
  if (!out.length) return pts;
  if (import.meta.env.DEV) console.info(`ligne : ${n * 4} m remis sur la bonne chaussée`);
  return contourner(out, cles, aContresens);
}
/**
 * Ce qui reste à contresens après la bascule — une rue à sens unique sans chaussée jumelle (le centre, autour de
 * Dantokpa et de Ganhi), un boulevard dont les deux chaussées sont à plus de 18 m, des maisons sur le terre-plein — est
 * contourné par le réseau des rues, dans le bon sens (« corrige aussi les contresens qui restent », 27/10). Pour chaque
 * tronçon, on repart 32 m avant, du carrefour devant soi, et l'on rejoint la ligne 32 m après par le plus court chemin
 * qui ne prend aucune rue à contresens, en passant par les arrêts du tronçon. Le passage d'une chaussée à l'autre se
 * fait donc toujours à un carrefour. Pas de détour de plus de trois fois le tronçon (et 700 m), ni plus de 25 % de
 * route en plus sur toute la ligne.
 */
function contourner(pts, cles, aContresens) {
  construireReseau();
  const E = []; let cum = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az); if (!l) continue;
    const dx = (bx - ax) / l, dz = (bz - az) / l;
    for (let d = 0; d < l; d += 4) { const x = ax + dx * d, z = az + dz * d; E.push({ x, z, dx, dz, s: cum + d, c: aContresens(x, z, dx, dz) }); }
    cum += l;
  }
  // Les tronçons à contresens (12 m au moins), réunis s'ils sont à moins de 72 m l'un de l'autre.
  const tr = [];
  for (let k = 0; k < E.length;) { if (!E[k].c) { k++; continue; } let j = k; while (j + 1 < E.length && E[j + 1].c) j++; const d = tr[tr.length - 1]; if (d && k - d[1] < 18) d[1] = j; else tr.push([k, j]); k = j + 1; }
  const sArrets = cles.map(([x, z]) => { let b = null, bd = 900; for (const e of E) { const d = (e.x - x) ** 2 + (e.z - z) ** 2; if (d < bd) { bd = d; b = e; } } return b ? [b.s, x, z] : null; }).filter(Boolean);
  const lon = ch => { let s = 0; for (let i = 1; i < ch.length; i++) s += Math.hypot(R.X[ch[i]] - R.X[ch[i - 1]], R.Z[ch[i]] - R.Z[ch[i - 1]]); return s; };
  const sections = []; let gagne = 0;
  for (const [k0, k1] of tr) {
    if (k1 - k0 < 2) continue;
    const A = E[Math.max(0, k0 - 8)], B = E[Math.min(E.length - 1, k1 + 8)], ra = rueSous(A.x, A.z, A.dx, A.dz), rb = rueSous(B.x, B.z, B.dx, B.dz);
    // La rue où l'on quitte la ligne, et celle où on la rejoint : sous le trajet (6 m), pas une parallèle derrière les maisons.
    const loin = (P, e) => { const [a, b] = e, ux = R.X[b] - R.X[a], uz = R.Z[b] - R.Z[a], l2 = ux * ux + uz * uz || 1, t = Math.max(0, Math.min(1, ((P.x - R.X[a]) * ux + (P.z - R.Z[a]) * uz) / l2)); return Math.hypot(R.X[a] + ux * t - P.x, R.Z[a] + uz * t - P.z) > 6; };
    if (!ra || !rb || loin(A, ra) || loin(B, rb)) continue;
    const etapes = [ra[1], ...sArrets.filter(([s]) => s > A.s && s < B.s).map(([, x, z]) => cible(x, z)?.[0]).filter(n => n !== undefined), rb[0]];
    let route = [etapes[0]], avant = ra[0], ok = true;
    for (const n of etapes.slice(1)) {
      const cur = route[route.length - 1]; if (n === cur) continue;
      const ch = dijkstra(cur, n, avant, SANS_SERVICE); if (!ch) { ok = false; break; } // jamais à contresens : pas de repli ici
      route.push(...ch.slice(1)); avant = ch[ch.length - 2];
    }
    if (!ok) continue;
    const l = Math.hypot(R.X[route[0]] - A.x, R.Z[route[0]] - A.z) + lon(route) + Math.hypot(B.x - R.X[route[route.length - 1]], B.z - R.Z[route[route.length - 1]]), span = B.s - A.s;
    if (l > 3 * span + 700) { if (import.meta.env.DEV) console.info(`ligne : ${Math.round((k1 - k0 + 1) * 4)} m à contresens laissés (détour de ${Math.round(l)} m pour ${Math.round(span)} m)`); continue; }
    sections.push([A.s, B.s, [[A.x, A.z], ...route.map(n => [R.X[n], R.Z[n]]), [B.x, B.z]], l - span, (k1 - k0 + 1) * 4]);
  }
  // Au total, pas plus de 25 % de route en plus sur la ligne : les détours les moins chers d'abord (mètres ajoutés par
  // mètre de contresens évité). Les autres tronçons restent à contresens.
  let budget = cum * .25; const gardees = [];
  for (const S of [...sections].sort((a, b) => a[3] / a[4] - b[3] / b[4])) if (S[3] <= budget) { budget -= Math.max(0, S[3]); gardees.push(S); gagne += S[4]; }
  sections.length = 0; sections.push(...gardees.sort((a, b) => a[0] - b[0]));
  if (!sections.length) return parEtapes(pts, cles, aContresens);
  if (import.meta.env.DEV) console.info(`ligne : ${gagne} m de contresens contournés par ${sections.length} détours`);
  return parEtapes(recoudre(pts, sections), cles, aContresens);
}
/** Remplace dans pts les sections [début, fin, points] (abscisses le long de pts), rangées dans l'ordre. */
function recoudre(pts, sections) {
  const out = []; let c = 0, si = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) c += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    while (si < sections.length && c >= sections[si][0]) { out.push(...sections[si][2]); si++; }
    if (!sections.some(([a, b]) => c >= a && c <= b)) out.push(pts[i]); // bornes comprises : la section commence et finit par elles
  }
  while (si < sections.length) out.push(...sections[si++][2]);
  return out;
}
/**
 * Dernier recours, d'un arrêt au suivant : s'il reste plus de 60 m à contresens entre deux arrêts (un quartier de sens
 * uniques, où aucun petit détour ne suffit — la fin de la ligne de la plage au stade, vers l'Étoile Rouge), l'étape
 * entière est refaite par le plus court chemin dans le bon sens, d'un arrêt à l'autre, si elle ne s'allonge pas de plus
 * de 60 % (et 400 m). Les points de passage devant les monuments de cette étape sont alors perdus : rouler dans le bon
 * sens passe avant.
 */
function parEtapes(pts, cles, aContresens) {
  const E = []; let cum = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az); if (!l) continue;
    const dx = (bx - ax) / l, dz = (bz - az) / l;
    for (let d = 0; d < l; d += 4) { const x = ax + dx * d, z = az + dz * d; E.push({ x, z, s: cum + d, c: aContresens(x, z, dx, dz) }); }
    cum += l;
  }
  if (!E.length) return pts;
  // Chaque arrêt au point le plus proche APRÈS le précédent : une ligne qui repasse près d'un arrêt (aller et retour)
  // faisait sinon commencer l'étape au mauvais passage, et le trajet traversait les pâtés de maisons.
  const bornes = [0]; for (const [x, z] of cles) { let b = bornes[bornes.length - 1], bd = Infinity; for (let k = b; k < E.length; k++) { const d = (E[k].x - x) ** 2 + (E[k].z - z) ** 2; if (d < bd) { bd = d; b = k; } } bornes.push(b); }
  bornes.push(E.length - 1); const sections = [];
  for (let k = 1; k < bornes.length; k++) {
    const i0 = bornes[k - 1], i1 = bornes[k]; let contre = 0; for (let i = i0; i < i1; i++) if (E[i].c) contre += 4;
    if (contre <= 60 || i1 - i0 < 3) continue;
    // Les nœuds les plus proches de chaque bout (60 m) : le plus proche peut être une rue à sens unique qui ne fait que
    // partir de l'arrêt (vers l'Étoile Rouge, on n'arrivait par aucune). On garde le premier couple qui se rejoint.
    const pres = P => noeudsPres(P.x, P.z, 60).filter(([n]) => relie(n)).slice(0, 6).map(([n]) => n);
    let ch = null, a = -1, b = -1;
    for (const na of pres(E[i0])) { for (const nb of pres(E[i1])) { if (na === nb) continue; ch = dijkstra(na, nb, -1, SANS_SERVICE); if (ch) { a = na; b = nb; break; } } if (ch) break; } // jamais à contresens
    if (!ch) { if (import.meta.env.DEV) console.info(`ligne : étape à ${contre} m de contresens, aucun chemin dans le bon sens`); continue; }
    let l = Math.hypot(R.X[a] - E[i0].x, R.Z[a] - E[i0].z) + Math.hypot(E[i1].x - R.X[b], E[i1].z - R.Z[b]);
    for (let i = 1; i < ch.length; i++) l += Math.hypot(R.X[ch[i]] - R.X[ch[i - 1]], R.Z[ch[i]] - R.Z[ch[i - 1]]);
    const span = E[i1].s - E[i0].s;
    if (import.meta.env.DEV) console.info(`ligne : étape à ${contre} m de contresens, refaite en ${Math.round(l)} m pour ${Math.round(span)} m${l > 1.6 * span + 400 ? ' (refusé)' : ''}`);
    if (l > 1.6 * span + 400) continue;
    sections.push([E[i0].s, E[i1].s, [[E[i0].x, E[i0].z], ...ch.map(n => [R.X[n], R.Z[n]]), [E[i1].x, E[i1].z]]]);
  }
  return sections.length ? recoudre(pts, sections) : pts;
}

// Raccourci du client pressé : distance pure, petites rues comprises (pas de préférence pour les grands axes).
const DIRECT = [1, 1, 1, 1, 1, 4]; // six classes : sans le dernier, fac[5] valait undefined et les voies de service devenaient infranchissables
/** Itinéraire le plus court de (x, z) jusqu'à la première cible, en partant du nœud le plus proche de (xa, za)
 *  (un point un peu devant le zém), puis les cibles suivantes par les grands axes comme d'habitude.
 *  `rayon` : jusqu'où chercher la rue la plus proche d'une cible (une cour, un parking en retrait). */
export function itineraireCourt(x, z, xa, za, cibles, rayon = 80) {
  if (!R.pret || !cibles.length) return null;
  const d0 = noeudRelie(xa, za, 150); if (!d0) return null;
  const pts = [[x, z], [R.X[d0[0]], R.Z[d0[0]]]];
  let cur = d0[0], avant = -1;
  for (const [k, [cx, cz]] of cibles.entries()) {
    const t = cible(cx, cz, rayon); if (!t) return null;
    const ch = chemin(cur, t[0], avant, k === 0 ? DIRECT : FACTEUR); if (!ch) return null;
    for (const n of ch.slice(1)) pts.push([R.X[n], R.Z[n]]);
    if (ch.length > 1) { avant = ch[ch.length - 2]; cur = ch[ch.length - 1]; }
  }
  return pts;
}
