// ---------- Les sols en hauteur où l'on marche : escaliers, estrades (Place des Martyrs, Palais des Congrès) ----------
// Dehors, le personnage marche au niveau du sol (y = 0) ; sur ces lieux, `hauteurSol` donne la hauteur du dessus des
// marches et de la plate-forme. Un mur, un parapet ou un socle répondent MUR : trop haut pour y monter. Le salon
// (salon.js) n'accepte qu'une marche de 0,45 m au plus vers le haut ; les véhicules ne montent pas les marches (conduite.js).
export const MUR = 99;
const SOLS = [];
/** `g` : le groupe du lieu (lieux.js, groupeLieu) ; `fn(lx, lz)` : la hauteur dans son repère, ou null hors du lieu. */
export function poserSol(g, fn, rayon) {
  SOLS.push({ x: g.position.x, z: g.position.z, a: g.rotation.y, fn, r2: rayon * rayon });
}
/** La hauteur du sol en (x, z) : 0 dans la rue, la marche ou la plate-forme sur un escalier, MUR contre un mur. */
export function hauteurSol(x, z) {
  for (const o of SOLS) {
    const dx = x - o.x, dz = z - o.z; if (dx * dx + dz * dz > o.r2) continue;
    const c = Math.cos(o.a), s = Math.sin(o.a), h = o.fn(dx * c - dz * s, dx * s + dz * c); // même repère que lieux.js (local)
    if (h !== null && h !== undefined) return h;
  }
  return 0;
}
