import { roadLines } from './ville.js';

// ---------- Pas de maison sur la chaussée ----------
// Google détecte aussi des « bâtiments » sur les routes (camions, auvents, gares routières) et ses emprises
// sont parfois décalées par rapport aux rues d'OpenStreetMap : une maison au milieu de la voie bloque la
// conduite et le tokpa-tokpa la traverse. On retire, au chargement, celles qui chevauchent une chaussée :
// l'axe de la rue passe dedans, ou un de leurs coins entre de plus de 1,5 m dans la chaussée.
// Les bâtiments d'OpenStreetMap eux-mêmes, jusqu'au 26/10, n'étaient pas vérifiés : 3 300 sur 88 000 mordent sur
// une rue de quartier, et le zém les traversait dès qu'il quittait la grande route (virage, raccourci) —
// « il y a des bâtiments sur la voie et on passe à travers pour avancer » (Murielle, 26/10).
const CR = 40, ROUTES = { grille: null };
function grilleRoutes() {
  if (ROUTES.grille) return ROUTES.grille;
  const g = new Map();
  for (const L of roadLines) {
    if (L.bridge || L.cls === 6 || L.cls >= 10) continue; // ni ponts, ni sentiers, ni pistes de l'aéroport
    const hw = (L.w || 6) / 2;
    for (let k = 1; k < L.pts.length; k++) {
      const [ax, az] = L.pts[k - 1], [bx, bz] = L.pts[k], s = [ax, az, bx, bz, hw, L.cls];
      for (let cx = Math.floor(Math.min(ax, bx) / CR); cx <= Math.floor(Math.max(ax, bx) / CR); cx++) for (let cz = Math.floor(Math.min(az, bz) / CR); cz <= Math.floor(Math.max(az, bz) / CR); cz++) { const c = cx + ',' + cz; let l = g.get(c); if (!l) g.set(c, l = []); l.push(s); }
    }
  }
  return ROUTES.grille = g;
}
const distSeg = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); return Math.hypot(ax + dx * t - x, az + dz * t - z); };
const croise = (ax, az, bx, bz, cx, cz, dx, dz) => { const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax), d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx); return d1 * d2 < 0 && d3 * d4 < 0; };
function dedans(x, z, r) { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if ((r[i + 1] > z) !== (r[j + 1] > z) && x < (r[j] - r[i]) * (z - r[i + 1]) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; return c; }
/** L'emprise `r` (x, z, x, z…, boîte `bb`) mord-elle sur une chaussée ? Renvoie la classe de la route en cause + 1, ou 0.
 *  `maxCls` : seulement les routes jusqu'à cette classe (5 : celles où l'on roule, celles du GPS). */
export function surLaChaussee(r, bb, maxCls = 99) {
  const g = grilleRoutes(), vus = new Set();
  for (let cx = Math.floor((bb[0] - 12) / CR); cx <= Math.floor((bb[2] + 12) / CR); cx++) for (let cz = Math.floor((bb[1] - 12) / CR); cz <= Math.floor((bb[3] + 12) / CR); cz++) for (const s of g.get(cx + ',' + cz) || []) {
    if (vus.has(s)) continue; vus.add(s);
    const [ax, az, bx, bz, hw, cls] = s, oui = cls + 1; if (cls > maxCls) continue;
    if (Math.max(ax, bx) < bb[0] - hw || Math.min(ax, bx) > bb[2] + hw || Math.max(az, bz) < bb[1] - hw || Math.min(az, bz) > bb[3] + hw) continue;
    for (let i = 0; i < r.length; i += 2) if (distSeg(r[i], r[i + 1], ax, az, bx, bz) < hw - 1.5) return oui; // un coin bien dans la chaussée
    if (dedans(ax, az, r) || dedans(bx, bz, r)) return oui; // l'axe de la rue passe dans l'emprise
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (croise(ax, az, bx, bz, r[j], r[j + 1], r[i], r[i + 1])) return oui;
  }
  return 0;
}
/** (x, z) est-il sur une chaussée où l'on roule (classes 0 à 5), à plus de `marge` m de son bord ? Pour les décors
 *  posés à la main près des lieux : les lampadaires du marché de Ganhi étaient plantés au milieu de la route de la
 *  ligne du centre, et le zém les traversait (relevé du 26/10). */
export function surChaussee(x, z, marge = .6) {
  const g = grilleRoutes(), cx = Math.floor(x / CR), cz = Math.floor(z / CR);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [ax, az, bx, bz, hw, cls] of g.get((cx + i) + ',' + (cz + j)) || []) if (cls <= 5 && distSeg(x, z, ax, az, bx, bz) < hw - marge) return true;
  return false;
}
/** Les bâtiments OpenStreetMap posés sur une rue où l'on roule (classes 0 à 5 : le GPS de Zém Run, les voitures) :
 *  `B.surRoute[i]` vaut 1. ville.js ne les dessine pas, rue.js n'en fait pas des obstacles. Renvoie leur nombre. */
export function marquerSurRoute(B) {
  const N = B.n.length, m = new Uint8Array(N), r = [], bb = [0, 0, 0, 0]; let o = 0, n = 0;
  for (let i = 0; i < N; i++) {
    const k = B.n[i], cx = B.x[i] / 10, cz = B.z[i] / 10; r.length = 0; bb[0] = bb[1] = 1e9; bb[2] = bb[3] = -1e9;
    for (let j = 0; j < k; j++) { const x = cx + B.p[o + 2 * j] / 10, z = cz + B.p[o + 2 * j + 1] / 10; r.push(x, z); if (x < bb[0]) bb[0] = x; if (z < bb[1]) bb[1] = z; if (x > bb[2]) bb[2] = x; if (z > bb[3]) bb[3] = z; }
    o += 2 * k;
    if (surLaChaussee(r, bb, 5)) { m[i] = 1; n++; }
  }
  B.surRoute = m; return n;
}
