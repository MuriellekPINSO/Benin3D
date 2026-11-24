// Les lieux d'Akpakpa dessinés à la main (akpakpa.js) : leurs repères et les terrains qu'ils occupent.
// « Retournons à Akpakpa : fais le centre EYA, la société La Béninoise, l'hôtel 8 Janvier, et on doit pouvoir entrer
// dedans et faire la visite » (Murielle, 23/11). Ce module ne fait que des calculs : zones.js le lit avant de construire
// la ville (les maisons de la carte, de Google et de rue.js cèdent la place), akpakpa.js y prend ses mesures.
import { toXZ } from './base.js';

/** Point du repère (o, ang) → monde (même convention que groupeLieu : x local = (cos ang, sin ang)). */
export const monde = ({ o, ang }, x, z) => [o[0] + x * Math.cos(ang) - z * Math.sin(ang), o[1] + x * Math.sin(ang) + z * Math.cos(ang)];
const rect = (R, x0, z0, x1, z1) => [monde(R, x0, z0), monde(R, x1, z0), monde(R, x1, z1), monde(R, x0, z1)];

// ---------- Centre communautaire EYA (ouvert en 2021) ----------
// Place Québec, en face du stade René Pleven, entre le mur du stade (au nord) et la route de Porto-Novo (RNIE1, au sud).
// Position : le lien Google Maps du site officiel (eyacenter.com), 6.3659025 N, 2.4508309 E. Le campus est une bande
// d'environ 140 m sur 50 le long de la route (relevés du 23/11 : OpenStreetMap — le terrain de basket « Aigle Skaters »,
// 973966992 — et image satellite Esri). Repère : x le long de la route vers l'est-nord-est (cap ~70°), z vers la route.
// Le bord nord de la chaussée est à z ≈ 30 (route du jeu : ville.js, classe 0, 10,7 m) ; la clôture du campus à z = 26,5.
export const EYA = { o: toXZ(6.3659025, 2.4508309), ang: -0.3433 };
export const EYA_BORDS = { x0: -78, x1: 64, z0: -26, z1: 26.5 };

// ---------- SOBEBRA, la brasserie de La Béninoise ----------
// Siège et usine au PK 2,5 de la route de Porto-Novo (RNIE1). Zone « Sobebra » d'OpenStreetMap (325358052, 435 × 191 m),
// centre 6.36514 N, 2.45437 E ; les bâtiments d'après l'image satellite Esri (relevé du 23/11, 0,29 m par pixel) et la
// photo de drone de la brochure Africa Outlook. Repère : x vers l'est le long de la rue du sud, z vers cette rue (sud).
// La RNIE1 passe au nord (z ≈ −100), la rue du sud et la voie ferrée à z ≈ 84-90 ; le carrefour La Béninoise (le
// rond-point de la bouteille géante) au nord-est, sur la RNIE1.
export const SOB = { o: toXZ(6.36514, 2.45437), ang: -0.107 };
export const SOB_BORDS = { x0: -158, x1: 212, z0: -77, z1: 80 };
export const ROND_POINT_BENINOISE = toXZ(6.36634, 2.45576);

// ---------- Hôtel 8 Janvier (Missessin, N'vènamèdé) ----------
// Fiche de l'annuaire GoAfrica Online (« Hôtel 8 Janvier Cotonou ») : 6.3718532 N, 2.4600339 E, au nord du nouveau marché
// PK3, sur un immeuble en béton à toit plat, au bord du boulevard du canal (sa chaussée est passe à 11 m à l'ouest du point,
// ville.js, classe 3). Aucune photo publique : l'hôtel est dessiné comme un hôtel de Cotonou de cette taille (R+3, 33 × 14 m
// d'après l'image satellite). Repère : x le long du boulevard vers le sud, z vers le boulevard (ouest) ; façade à z = 7.
export const HOTEL = { o: [toXZ(6.3718532, 2.4600339)[0] + 3, toXZ(6.3718532, 2.4600339)[1] - 2], ang: 1.5048 };

// ---------- Super U Akpakpa (ex-Erevan), au carrefour PK3 ----------
// Nœud OSM « Super U Akpakpa » (supermarket) et son bâtiment (421068652, ≈ 120 × 37 m) ; le parking (827812152) au nord,
// devant l'entrée. Repère : origine au milieu de la façade nord, z vers le parking (dehors), x vers l'ouest le long de la
// façade ; le bâtiment va de z = 0 à z = −37.
const SU0 = toXZ(6.3674588, 2.4651295);
export const SUPER_U = { o: [SU0[0], SU0[1] - 14.5], ang: Math.PI - .0886 };

/** Les terrains à vider (anneaux [x, z]) : rien de la carte, de Google ni de rue.js ne s'y construit. */
export function terrainsAkpakpa() {
  const B = EYA_BORDS, S = SOB_BORDS;
  return [rect(EYA, B.x0 - 1, B.z0 - 1, B.x1 + 1, B.z1 + 1), rect(SOB, S.x0 - 1, S.z0 - 1, S.x1 + 1, S.z1 + 1), rect(HOTEL, -17.5, -8, 17.5, 8.4), rect(SUPER_U, -62, -38, 62, 40)]; // le Super U et son parking (une rue de service le traverse, à 6 m de la façade)
}

// ---------- Les rues qui passaient où le campus est bâti ----------
// Les données des rues du jeu (octobre) ont encore un chemin qui traversait le terrain en diagonale, du mur du stade au mur
// ouest : le Centre EYA (2021) a été bâti dessus et il n'est plus dans OpenStreetMap. Il s'arrête maintenant aux murs.
const local = ({ o, ang }, x, z) => { const dx = x - o[0], dz = z - o[1], c = Math.cos(ang), s = Math.sin(ang); return [dx * c + dz * s, -dx * s + dz * c]; };
const dansEya = p => { const [x, z] = local(EYA, p[0], p[1]), B = EYA_BORDS; return x > B.x0 - 2 && x < B.x1 + 2 && z > B.z0 - 2 && z < B.z1 + 1; };
/** Les morceaux de la rue L hors des terrains d'Akpakpa (ville.js, au chargement des rues) ; [L] si elle n'y passe pas. */
let BB = null; // l'emprise du campus dans le monde (avec sa marge), pour écarter d'un coup les rues lointaines
export function rueHorsAkpakpa(L) {
  if (!BB) { const r = terrainsAkpakpa()[0]; BB = [Math.min(...r.map(p => p[0])) - 4, Math.min(...r.map(p => p[1])) - 4, Math.max(...r.map(p => p[0])) + 4, Math.max(...r.map(p => p[1])) + 4]; }
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of L.pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  if (x1 < BB[0] || x0 > BB[2] || z1 < BB[1] || z0 > BB[3]) return [L];
  const P = [L.pts[0]];
  for (let i = 1; i < L.pts.length; i++) {
    const a = L.pts[i - 1], b = L.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(l / 2);
    let pres = false; for (let k = 0; k <= n && !pres; k++) pres = dansEya([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    if (pres) for (let k = 1; k < n; k++) P.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    P.push(b);
  }
  if (!P.some(dansEya)) return [L];
  const morceaux = []; let cur = null;
  for (const p of P) { if (dansEya(p)) { cur = null; continue; } if (!cur) morceaux.push(cur = []); cur.push(p); }
  const lg = p => p.reduce((s, q, i) => i ? s + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0, 0);
  return morceaux.filter(p => p.length >= 2 && lg(p) >= 5).map(pts => ({ ...L, pts }));
}
