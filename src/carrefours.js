import { roadLines } from './ville.js';

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
