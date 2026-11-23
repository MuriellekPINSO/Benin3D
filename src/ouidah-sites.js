// Les lieux du centre de Ouidah dessinés à la main (ouidah-ville.js) : leurs emprises et les terrains qu'ils occupent.
// « Je veux qu'on passe à Ouidah et qu'on modélise tout » (Murielle, 22/11). Relevés le 22/11 dans OpenStreetMap (extraits
// osm/ouidah_*.json d'octobre et Overpass), vérifiés sur l'image satellite Esri World Imagery (assez récente pour montrer
// la place Chacha rénovée) et sur la vidéo de 4U Tourisme (Benin4U, 10/11/2026 : le nouveau Temple des Pythons).
// Ce module ne fait que des calculs : zones.js le lit avant de construire la ville (les maisons de la carte, de Google et
// de rue.js cèdent la place), ouidah-ville.js y prend ses mesures.
import { toXZ } from './base.js';

const XZ = r => r.map(([la, lo]) => toXZ(la, lo));
const sur = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// ---------- Basilique de l'Immaculée-Conception ----------
// Bâtiment OSM 402951938 : la nef (14 m sur 47) et, au nord, le clocher arrière (marches du contour). La façade et sa tour
// sont au sud, sur le parvis (vue aérienne de la vidéo et image satellite : le parvis va jusqu'à la rue, le temple est en
// face, de l'autre côté). A et B : les angles de la façade ; N : le bout nord.
const BAS = XZ([[6.360377, 2.084859], [6.360413, 2.084981], [6.360819, 2.084859], [6.360787, 2.084759], [6.36078, 2.084738], [6.360881, 2.08479]]);
export const BASILIQUE = { A: BAS[0], B: BAS[1], C: BAS[2], L: BAS[4], N: BAS[5] };

// ---------- Temple des Pythons ----------
// La case ronde du python (OSM 654211346) est à 19 m au sud de l'axe de la rue (OSM 205394414, tertiaire), qui sépare
// le temple du parvis de la basilique. Le nouveau bâtiment (vidéo du 10/11) fait face à la rue ; la rue, entre les deux,
// est pavée de briques rouges comme le devant du temple.
export const TEMPLE = { hutte: toXZ(6.35997, 2.08504), rue: [-36511.7, 1091.5], angleRue: -22.7 * Math.PI / 180 };

// ---------- Place Chacha (place des enchères) ----------
// Contour OSM 388148384 (place piétonne), rond central relevé sur l'image satellite (2,5 m à l'est et 8 m au nord du
// nœud « Place CHACHA » 6330840854).
export const CHACHA = {
  contour: XZ([[6.356368, 2.084506], [6.356925, 2.085418], [6.356942, 2.085504], [6.356612, 2.085303], [6.356351, 2.085432], [6.356211, 2.085154], [6.356066, 2.085131], [6.356034, 2.085096], [6.355994, 2.085024], [6.356115, 2.084951], [6.356086, 2.084881]]),
  centre: [toXZ(6.35647, 2.08501)[0] + 2.5, toXZ(6.35647, 2.08501)[1] - 8],
};

// ---------- Fort portugais (São João Baptista de Ajudá), musée d'Histoire de Ouidah ----------
// Enceinte OSM 402954433 : quatre bastions ronds aux angles (ouest, nord, est, sud). Dedans : le musée (606175470),
// la chapelle (403596855) et une annexe (362355908).
export const FORT = {
  bastions: XZ([[6.35925, 2.089725], [6.35959, 2.09041], [6.35894, 2.09076], [6.35850, 2.09018]]),
  musee: XZ([[6.359116, 2.090634], [6.35903, 2.09048], [6.359018, 2.090486], [6.35909, 2.090615], [6.358946, 2.090697], [6.358857, 2.090537], [6.358921, 2.090501], [6.358991, 2.090626], [6.35903, 2.090603], [6.358963, 2.090484], [6.359016, 2.090454], [6.359012, 2.090447], [6.359276, 2.090298], [6.35938, 2.090484]]),
  chapelle: XZ([[6.359153, 2.090184], [6.359074, 2.090228], [6.35915, 2.090362], [6.359228, 2.090318]]),
  annexe: XZ([[6.358959, 2.090182], [6.358844, 2.090246], [6.358768, 2.090108], [6.358883, 2.090044], [6.358903, 2.09008], [6.358918, 2.090072], [6.358949, 2.090127], [6.358933, 2.090135]]),
};

// ---------- Villa Ajavon (1922), musée de la Fondation Zinsou ----------
// Bâtiment OSM 481180739 ; la rue (OSM 229225542) passe au sud.
export const ZINSOU = {
  emprise: XZ([[6.361591, 2.085247], [6.361664, 2.085357], [6.361615, 2.085389], [6.361604, 2.085373], [6.3615, 2.085443], [6.361517, 2.085487], [6.361458, 2.085506], [6.361425, 2.085408], [6.361413, 2.085364], [6.361463, 2.085331], [6.361469, 2.08534], [6.361544, 2.08529], [6.361539, 2.085282]]),
  rue: [-36465.7, 953.1],
};

// ---------- La Route des Esclaves (de la place Chacha à la Porte du Non-Retour) ----------
// Points OSM (ouidah_poi) : l'Arbre de l'Oubli, au bord de la route ; à Zoungbodji, le mémorial Zomachi et la stèle de la
// case de Zomaï, le mémorial de la fosse commune, l'Arbre du Retour. `rue` : le point le plus proche de la rue voisine et
// la direction de la rue (radians, x → z), pour tourner les enclos vers elle.
export const ROUTE = {
  oubli: { p: toXZ(6.34810, 2.08688), rue: [-36313.4, 2423.4] },
  zomachi: { p: [-36061, 3192], rue: [-36046.5, 3192], angleRue: -87.4 * Math.PI / 180, zomai: toXZ(6.34110, 2.08907) },
  zoungbodji: { p: [-36022, 3341], stele: toXZ(6.33984, 2.08938), rueNord: 3315 },
  retour: { p: toXZ(6.34017, 2.08895), rue: [-36072.7, 3304.3] },
};

// ---------- Forêt sacrée de Kpassè ----------
// Contour OSM 389348719 (landuse=forest) ; sentier en boucle 413578804 ; entrée au coin sud, au carrefour.
export const KPASSE = {
  contour: XZ([[6.366306, 2.096707], [6.365588, 2.095521], [6.3652, 2.095521], [6.365146, 2.095575], [6.364986, 2.095404], [6.364879, 2.095384], [6.36443, 2.095624], [6.364311, 2.095744], [6.36407, 2.096023], [6.363978, 2.096159], [6.363908, 2.096302], [6.364926, 2.097413], [6.365327, 2.09756]]),
  boucle: XZ([[6.365125, 2.096545], [6.365115, 2.096671], [6.365176, 2.096715], [6.365123, 2.096777], [6.36486, 2.096667], [6.364751, 2.096612], [6.364677, 2.096558], [6.364595, 2.096499], [6.364587, 2.096432], [6.364472, 2.096315], [6.364588, 2.096294], [6.364594, 2.096329], [6.364725, 2.096341], [6.364871, 2.096339], [6.364957, 2.096386], [6.365017, 2.096514], [6.365125, 2.096545]]),
  entree: toXZ(6.363908, 2.096302),
  iroko: toXZ(6.36484, 2.09637),
};

// ---------- Repères communs ----------
/** Le repère de la façade de la basilique : origine au milieu de AB, x de A vers B, z vers le parvis (le sud). */
export function repereBasilique() {
  const { A, B } = BASILIQUE, o = sur(A, B, .5), ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
  return { o, ang, largeur: Math.hypot(B[0] - A[0], B[1] - A[1]) };
}
/** Le repère du temple : origine sur l'axe de la rue au droit de la case, x le long de la rue, z vers le temple. */
export function repereTemple() {
  const { hutte, rue } = TEMPLE, d = Math.hypot(hutte[0] - rue[0], hutte[1] - rue[1]), nz = [(hutte[0] - rue[0]) / d, (hutte[1] - rue[1]) / d];
  return { o: rue, ang: Math.atan2(-nz[0], nz[1]), nz }; // groupeLieu : z local = (−sin ang, cos ang) = nz
}
/** Point du repère (o, ang) → monde. */
export const monde = ({ o, ang }, x, z) => [o[0] + x * Math.cos(ang) - z * Math.sin(ang), o[1] + x * Math.sin(ang) + z * Math.cos(ang)];
const rect = (R, x0, z0, x1, z1) => [monde(R, x0, z0), monde(R, x1, z0), monde(R, x1, z1), monde(R, x0, z1)];
const gonfler = (r, m) => { const c = [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]; return r.map(([x, z]) => { const d = Math.hypot(x - c[0], z - c[1]) || 1; return [x + (x - c[0]) / d * m, z + (z - c[1]) / d * m]; }); };

/** Le pavé de briques devant le temple, rue comprise, jusqu'au parvis de la basilique (repère du temple) : on y roule toujours. */
export function placeBasiliqueTemple() { return rect(repereTemple(), -32, -5, 32, 9); }

/** Les terrains à vider (anneaux [x, z]) : rien de la carte, de Google ni de rue.js ne s'y construit. */
export function terrainsOuidah() {
  const RB = repereBasilique(), RT = repereTemple();
  return [
    rect(RB, -14, -57, 14, 24), // la basilique, son clocher arrière et le parvis jusqu'à la rue
    rect(RT, -25, 5, 25, 31), // le temple, sa cour et la case du python
    CHACHA.contour,
    FORT.bastions.length && gonfler(FORT.bastions, 8), // l'enceinte et ses bastions
    gonfler(ZINSOU.emprise, 3),
    KPASSE.contour,
  ].filter(Boolean);
}
/** Les disques à vider [x, z, rayon] : le rond de la place Chacha déborde un peu du contour OSM ; les mémoriaux de la
 *  Route des Esclaves ; l'entrée de la forêt de Kpassè. */
export const disquesOuidah = () => [[CHACHA.centre[0], CHACHA.centre[1], 21], [...ROUTE.oubli.p, 12], [...ROUTE.zomachi.p, 17], [...ROUTE.zoungbodji.p, 21], [...ROUTE.retour.p, 8], [...KPASSE.entree, 12]];
