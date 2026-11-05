import { toXZ } from './base.js';
import { EMPLACEMENTS } from './emplacements.js';
import { REPERES, SALLE_JEUX } from './reperes.js';

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
// ---------- Parcs : ni maison générée, ni bâtiment détecté par Google ----------
// « Il n'y a pas de maison aux alentours de l'Amazone, ni dans le Sofitel » (Murielle, 04/11). Vérifié sur l'image
// satellite (Esri World Imagery, 2025) : l'esplanade de l'Amazone, sa pelouse et le terrain de sable jusqu'à la plage
// sont vides, et à l'est, c'est le port ; le domaine du Sofitel n'est qu'un parc (l'hôtel, le Pavillon, le Dôme, un lac, une zone humide jusqu'à la
// plage) ; l'enclos du Palais des Congrès n'a que le palais et son parking. Les maisons qu'on y voyait étaient celles que
// rue.js invente le long des rues, et des emprises Google Open Buildings. Les bâtiments OpenStreetMap, eux, restent :
// ce sont les vrais (l'annexe du Sofitel, les bâtiments du personnel). Contours relevés en latitude, longitude.
const PARCS = [];
const PARCS_LATLON = [
  // Esplanade de l'Amazone, sa pelouse et le sable jusqu'à la plage : de la rue du Palais des Congrès à la clôture du port.
  [[6.34997, 2.40640], [6.34997, 2.40818], [6.34460, 2.40818], [6.34460, 2.40640]],
  // Le port, à l'est de l'Amazone : parcs à voitures et à camions, conteneurs, hangars, chantiers. Google y « voit » des
  // bâtiments dans les piles de conteneurs et les camions, rue.js y inventait des maisons le long des voies du port.
  [[6.34997, 2.40835], [6.34997, 2.41400], [6.34450, 2.41400], [6.34450, 2.40835]],
  // Enclos du Palais des Congrès, du boulevard à la rue du sud.
  [[6.34997, 2.40385], [6.34997, 2.40610], [6.34710, 2.40610], [6.34710, 2.40385]],
  // Domaine du Sofitel : le long du boulevard, de la rue des résidences (ouest) à la rue à l'est du Dôme, puis la rive sud
  // du lac et la zone humide jusqu'à la plage. Le bord nord passe une dizaine de mètres dans le boulevard : rue.js pose ses
  // maisons à quelques mètres de la bordure, juste au bord du parc.
  [[6.35130, 2.39198], [6.35131, 2.39360], [6.35123, 2.39506], [6.35094, 2.39604], [6.35052, 2.39679], [6.35018, 2.39754], [6.35005, 2.39796],
    [6.34876, 2.39796], [6.34869, 2.39604], [6.34570, 2.39604], [6.34570, 2.39198]],
];
function parc(latlon) {
  const r = latlon.map(([la, lo]) => toXZ(la, lo)), xs = r.map(p => p[0]), zs = r.map(p => p[1]);
  PARCS.push({ r, bb: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] });
}
/** (x, z) est-il dans un parc (Amazone, Palais des Congrès, Sofitel) ? */
export function dansParc(x, z) {
  for (const P of PARCS) {
    if (x < P.bb[0] || x > P.bb[2] || z < P.bb[1] || z > P.bb[3]) continue;
    const r = P.r; let d = false;
    for (let a = 0, j = r.length - 1; a < r.length; j = a++) { const [xa, za] = r[a], [xj, zj] = r[j]; if ((za > z) !== (zj > z) && x < (xj - xa) * (z - za) / (zj - za) + xa) d = !d; }
    if (d) return true;
  }
  return false;
}
/** Un rectangle touche-t-il un parc (son centre ou un de ses coins) ? */
export const rectDansParc = (x0, z0, x1, z1) => dansParc((x0 + x1) / 2, (z0 + z1) / 2) || dansParc(x0, z0) || dansParc(x1, z0) || dansParc(x0, z1) || dansParc(x1, z1);

// ---------- Places : le sol d'un lieu posé par-dessus des rues d'OpenStreetMap ----------
// Le parvis et l'enclos pavés de la Cité ministérielle (lieux-marina.js) recouvrent cinq allées de service d'OSM : en 3D, une
// grande esplanade vide ; sur la mini-carte, des rues ; au volant, on ne roulait que sur ces allées qu'on ne voit pas, et
// l'on butait partout ailleurs sur l'esplanade (« trop de murs invisibles », « des endroits supprimés figurent encore sur la
// carte », testeur en Roadster au-dessus de l'avenue Jean-Paul II, 04/11). Une place est dessinée telle quelle sur la carte
// (carte-salon.js), sans les rues qu'elle recouvre ; `roule` : on y roule partout où rien ne bloque (conduite.js, surRoute).
const PLACES = [];
/** Une place : anneau [[x, z], …] en mètres ; `roule` : les véhicules y circulent ; `teinte` : 'pave' ou 'jardin' sur la carte. */
export function ajouterPlace(ring, { roule = false, teinte = 'pave' } = {}) {
  if (!ring || ring.length < 3) return;
  const xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
  PLACES.push({ r: ring, roule, teinte, bb: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] });
}
/** (x, z) est-il sur une place (une place où l'on roule, si `roule`) ? */
export function dansPlace(x, z, roule = false) {
  for (const P of PLACES) {
    if ((roule && !P.roule) || x < P.bb[0] || x > P.bb[2] || z < P.bb[1] || z > P.bb[3]) continue;
    const r = P.r; let d = false;
    for (let a = 0, j = r.length - 1; a < r.length; j = a++) { const [xa, za] = r[a], [xj, zj] = r[j]; if ((za > z) !== (zj > z) && x < (xj - xa) * (z - za) / (zj - za) + xa) d = !d; }
    if (d) return true;
  }
  return false;
}
export const lesPlaces = () => PLACES;

/** À appeler avant de construire la ville (données des lieux : `data.L`). */
export function initZones(L) {
  if (!PARCS.length) for (const p of PARCS_LATLON) parc(p);
  // Les repères posés d'après photo (reperes.js) : le bâtiment de la carte cède sa place au modèle.
  if (!Z.some(b => b.repere)) for (const R of [...REPERES, { id: 'salle-jeux', ...SALLE_JEUX }]) if (R.vider) { const [x, z] = toXZ(...R.centre); disque(x, z, R.vider); Z.at(-1).repere = R.id; }
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
