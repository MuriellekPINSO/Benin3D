// ---------- L'eau : la mer, la lagune, le lac Nokoué ----------
// « On arrive à marcher sur la mer dans le jeu » (Murielle, 11/11). L'eau n'était qu'une surface peinte (ville.js,
// buildSurfaces) : rien n'empêchait d'y entrer, à pied, à vélo, ni la Roadster de s'y poser. Ici, ses contours, et pour un
// point la distance à la rive (positive dans l'eau, négative sur la terre). rue.js en fait un obstacle (dansLEau).
//  - Dedans ou dehors : un rayon vers l'est, qui croise les bords un nombre impair de fois pour chaque étendue d'eau
//    qui contient le point (les îles, trous de leur polygone, restent de la terre). Bords rangés par bandes de 8 m.
//  - La distance : les bords à moins de MARGE mètres, rangés par cases de 32 m. Loin de toute rive, la case retient le
//    bord le plus proche de son centre : la profondeur diminue toujours vers la rive, et qui se retrouve en pleine eau
//    (un ami rejoint là, un ancien chemin) peut en sortir.
const CE = 32, RB = 8, MARGE = 12;
const E = { bords: [], poly: [], n: 0, rangs: new Map(), cases: new Map(), infos: new Map(), nPoly: 0, parite: null };

/** Une étendue d'eau : son contour, puis ses îles (anneaux de points {x, y}, y étant le z du monde). */
export function ajouterEau(anneaux) {
  const p = E.nPoly++;
  for (const a of anneaux) for (let i = 0; i < a.length; i++) {
    const A = a[i], B = a[(i + 1) % a.length]; if (A.x === B.x && A.y === B.y) continue;
    const e = E.n++; E.bords.push(A.x, A.y, B.x, B.y); E.poly.push(p);
    for (let r = Math.floor(Math.min(A.y, B.y) / RB); r <= Math.floor(Math.max(A.y, B.y) / RB); r++) (E.rangs.get(r) || E.rangs.set(r, []).get(r)).push(e);
    // Les cases à moins de MARGE du bord : on le suit par pas de 8 m (un bord de la mer fait des kilomètres au large).
    const L = Math.hypot(B.x - A.x, B.y - A.y), n = Math.ceil(L / 8), vues = new Set();
    for (let k = 0; k <= n; k++) {
      const x = A.x + (B.x - A.x) * k / n, z = A.y + (B.y - A.y) * k / n;
      for (let cx = Math.floor((x - MARGE) / CE); cx <= Math.floor((x + MARGE) / CE); cx++) for (let cz = Math.floor((z - MARGE) / CE); cz <= Math.floor((z + MARGE) / CE); cz++) {
        const c = cx + ',' + cz; if (vues.has(c)) continue; vues.add(c); (E.cases.get(c) || E.cases.set(c, []).get(c)).push(e);
      }
    }
  }
}

function dedans(x, z) {
  const l = E.rangs.get(Math.floor(z / RB)); if (!l) return false;
  if (!E.parite || E.parite.length < E.nPoly) E.parite = new Uint8Array(E.nPoly);
  const P = E.parite, B = E.bords, touches = []; // P : bit 1 = croisé une fois au moins, bit 0 = parité
  for (const e of l) {
    const o = e * 4, ax = B[o], az = B[o + 1], bx = B[o + 2], bz = B[o + 3];
    if ((az > z) === (bz > z) || ax + (z - az) * (bx - ax) / (bz - az) <= x) continue;
    const p = E.poly[e]; if (!(P[p] & 2)) { P[p] = 2; touches.push(p); } P[p] ^= 1;
  }
  let oui = false; for (const p of touches) { if (P[p] & 1) oui = true; P[p] = 0; }
  return oui;
}
function distanceBord(e, x, z) {
  const o = e * 4, B = E.bords, ax = B[o], az = B[o + 1], ux = B[o + 2] - ax, uz = B[o + 3] - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz)));
  return Math.hypot(ax + ux * t - x, az + uz * t - z);
}
/** Combien de mètres dans l'eau (positif), ou loin d'elle sur la terre (négatif, -MARGE et au-delà : « loin »). */
export function profondeurEau(x, z) {
  if (!E.n) return -MARGE;
  const c = Math.floor(x / CE) + ',' + Math.floor(z / CE), proches = E.cases.get(c);
  if (proches) {
    let d = Infinity; for (const e of proches) d = Math.min(d, distanceBord(e, x, z));
    return dedans(x, z) ? d : -Math.min(d, MARGE);
  }
  let I = E.infos.get(c); // aucune rive dans la case : elle est toute dans l'eau, ou toute sur la terre
  if (!I) {
    const mx = (Math.floor(x / CE) + .5) * CE, mz = (Math.floor(z / CE) + .5) * CE, eau = dedans(mx, mz);
    let best = -1;
    if (eau) { let d = Infinity; for (let e = 0; e < E.n; e++) { const v = distanceBord(e, mx, mz); if (v < d) { d = v; best = e; } } }
    E.infos.set(c, I = { eau, best });
  }
  return I.eau ? Math.max(MARGE, distanceBord(I.best, x, z)) : -MARGE;
}
