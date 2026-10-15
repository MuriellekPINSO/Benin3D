import { EMPLACEMENTS } from './emplacements.js';

// ---------- Zones où rien ne se construit ----------
// La piste des vols découverte à Ouidah (vol.js) est posée à côté de la Porte du Non-Retour, sur un terrain où la carte a
// des maisons (OpenStreetMap, Google Open Buildings) et où rue.js en génère le long des rues : l'avion atterrissait au
// milieu des maisons. La ville (ville.js, rue.js) et les bâtiments Google (batiments-google.js) consultent ces zones.
const Z = [];

/** La piste de Ouidah, de A à B, à l'est de la Porte du Non-Retour `P` (vol.js la construit d'après ces points). */
export function pisteOuidah(P) { return { A: [P[0] + 470, P[1] - 30], B: [P[0] + 990, P[1] - 96] }; }

// Une bande le long de A → B : de tMin à tMax mètres de travers (positif vers le nord, côté parking), `bout` mètres
// au-delà de chaque extrémité.
function bande(A, B, tMin, tMax, bout) {
  const l = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / l, uz = (B[1] - A[1]) / l, b = { ax: A[0], az: A[1], ux, uz, l, tMin, tMax, bout };
  const coins = [[-bout, tMin], [-bout, tMax], [l + bout, tMin], [l + bout, tMax]].map(([s, t]) => [A[0] + ux * s + uz * t, A[1] + uz * s - ux * t]);
  b.bb = [Math.min(...coins.map(c => c[0])), Math.min(...coins.map(c => c[1])), Math.max(...coins.map(c => c[0])), Math.max(...coins.map(c => c[1]))];
  Z.push(b);
}
// Un disque (l'arène de Ouidah : son emprise OpenStreetMap faisait de toute l'arène un bâtiment plein, on n'y entrait pas).
function disque(x, z, r) { Z.push({ disque: true, x, z, r, bb: [x - r, z - r, x + r, z + r] }); }
/** Le centre de l'arène de Ouidah (ouidah.js la pose là). */
export const centreArene = A => [A[0] + 1.4, A[1]];
/** À appeler avant de construire la ville (données des lieux : `data.L`). */
export function initZones(L) {
  const P = L?.ouidah?.porte; if (!P) return;
  const { A, B } = pisteOuidah(P); bande(A, B, -25, 55, 35); // piste, bas-côtés, aire de stationnement, paillote, panneaux
  if (L.ouidah.arene) { const [x, z] = centreArene(L.ouidah.arene); disque(x, z, 80); } // jusqu'au mur d'enceinte (77 m)
}
/** (x, z) est-il dans une zone où rien ne se construit ? */
export function sansConstruction(x, z) {
  for (const b of Z) {
    if (x < b.bb[0] || x > b.bb[2] || z < b.bb[1] || z > b.bb[3]) continue;
    if (b.disque) { if ((x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r) return true; continue; }
    const dx = x - b.ax, dz = z - b.az, s = dx * b.ux + dz * b.uz, t = dx * b.uz - dz * b.ux;
    if (s > -b.bout && s < b.l + b.bout && t > b.tMin && t < b.tMax) return true;
  }
  return false;
}
// Les boutiques à louer (emplacements.js, commerces.js) : rue.js n'y génère ni mur ni maison. Les bâtiments réels
// (OpenStreetMap, Google) n'y sont pas touchés : les emplacements ont été choisis là où il n'y en a pas.
const B = EMPLACEMENTS.map(E => ({ x: E.x, z: E.z, c: Math.cos(E.cap), s: Math.sin(E.cap) }));
/** (x, z) est-il sur la parcelle d'une boutique à louer (avec une marge, et jusqu'au bord du trottoir) ? `m` : marge de plus. */
export function zoneBoutique(x, z, m = 0) {
  for (const b of B) {
    const dx = x - b.x, dz = z - b.z; if (dx * dx + dz * dz > (10 + m) ** 2) continue;
    const u = dx * b.c - dz * b.s, v = dx * b.s + dz * b.c; if (u > -6.5 - m && u < 6.5 + m && v > -5.5 - m && v < 3.6 + m) return true;
  }
  return false;
}
/** Un rectangle (x0, z0)–(x1, z1) touche-t-il une zone ? (son centre ou un de ses coins) */
export function rectSansConstruction(x0, z0, x1, z1) {
  if (!Z.length || !Z.some(b => x1 >= b.bb[0] && x0 <= b.bb[2] && z1 >= b.bb[1] && z0 <= b.bb[3])) return false;
  return sansConstruction((x0 + x1) / 2, (z0 + z1) / 2) || sansConstruction(x0, z0) || sansConstruction(x1, z0) || sansConstruction(x0, z1) || sansConstruction(x1, z1);
}
