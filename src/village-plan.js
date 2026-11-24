// ---------- Le Village de l'innovation : où il est, quand, ses onze espaces ----------
// Du 18 au 20 novembre 2026, sur l'esplanade du Palais des Congrès (digitalinnovationweek.bj). Le Village du jeu est la
// maquette 3D que Murielle a faite pour son site de visite (scripts/village.mjs) : posé sur le parking, devant les marches
// du palais, l'entrée vers le boulevard, comme sur le plan des organisateurs. Kevin, 15/11 : « Kotonou vibes ne peut pas
// organiser un événement sur le village ? Un truc innovant qui connecte tous ceux qui sont sur le village ».
//
// Ce module ne dépend de presque rien : la ville (ville.js, lieux.js, conduite.js) le lit pendant sa construction.
// Le Village en 3D, le passeport et la fenêtre sont dans village.js.
// « L'innovation est terminée, on enlève le Village » (Murielle, 22/11) : il s'est tenu du 18 au 20 novembre ; depuis le 21 à
// minuit (heure de Cotonou), le parking du Palais des Congrès redevient comme avant (chapiteau, voitures, rues, une seule salle
// de jeux, à Haie Vive). « Pourquoi je vois encore le truc du Village ? » (24/11) : le lien du QR code du stand (?village) le
// faisait revenir ; il ouvre maintenant le jeu comme tout le monde (statistiques.js le compte encore).
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const VILLAGE_ACTIF = Date.now() < Date.parse('2026-11-21T00:00:00+01:00');
export const VILLAGE_DATES = 'du 18 au 20 novembre';
// Venir au Village : par le lien du QR code du stand (?village), ou le bouton de l'accueil (salon.js). On arrive alors
// directement à l'entrée du Village au lieu de se réveiller chez soi.
export const VENIR = { village: Q.has('village') };

// L'origine de la maquette dans la ville : sur l'axe des marches du palais (le centre de son emprise OpenStreetMap), à 64,5 m
// au nord du pied des marches (le bord du parvis de la maquette touche la dernière marche, lieux.js palaisCongres).
// La maquette regarde l'autre sens : son palais est vers −z, le vrai est au sud (+z). Un demi-tour : (x, z) → (−x, −z).
const OX = -1097.95, OZ = 2307.8;
export const VILLAGE_ORIGINE = [OX, OZ];
export const versVille = (mx, mz) => [OX - mx, OZ - mz];
// Le parvis de la maquette : x ±35,9, z de −64,5 (pied des marches) à +29 (côté boulevard).
const [AX, AZ] = versVille(35.95, 29), [BX, BZ] = versVille(-35.95, -64.5);
export const EMPRISE = [Math.min(AX, BX), Math.min(AZ, BZ), Math.max(AX, BX), Math.max(AZ, BZ)];
/** (x, z) est-il sur le parvis du Village (à `m` mètres près) ? Zone piétonne : aucun véhicule n'y entre. */
export const dansVillage = (x, z, m = 0) => VILLAGE_ACTIF && x > EMPRISE[0] - m && x < EMPRISE[2] + m && z > EMPRISE[1] - m && z < EMPRISE[3] + m;
export const CENTRE_VILLAGE = [(EMPRISE[0] + EMPRISE[2]) / 2, (EMPRISE[1] + EMPRISE[3]) / 2];

// Les onze espaces, d'après le plan du site de visite (sources/village/visite-3d.js) : numéro, nom, zone, centre dans la
// maquette (x, et z = −y du plan) et rayon où l'on reçoit le tampon du passeport.
export const ZONES = { creer: 'Créer & innover', vivre: 'Bien-vivre', civique: 'Civique' };
export const ESPACES = [
  ['01', 'Le Musée', 'creer', 0, -29.4, 4.5],
  ['02', 'La Radio', 'creer', 0, -35.4, 4.5],
  ['03', 'L’Atelier', 'creer', 6.65, -46.1, 5.5],
  ['04', 'L’Arbre à palabre', 'creer', 0, -54.4, 6],
  ['05', 'Le Jardin', 'vivre', 9.8, -35.1, 5.5],
  ['06', 'Le Marché', 'vivre', 25.6, -48.3, 7.5],
  ['07', 'Le Centre de santé', 'vivre', 17.25, -21.7, 6.5],
  ['08', 'L’Arcade', 'vivre', 25.8, -34.9, 6.5],
  ['09', 'La Fabrique des talents', 'civique', -25.9, -34.9, 6.5],
  ['10', 'La Place du citoyen', 'civique', -17.4, -21.7, 6.5],
  ['11', 'La Maison des entrepreneurs', 'civique', -24, -48, 7.5],
].map(([n, nom, zone, mx, mz, r]) => { const [x, z] = versVille(mx, mz); return { n, nom, zone, x, z, r }; });
// L'arrivée : devant le portique d'entrée, côté boulevard, tourné vers le Village (vers le sud : cap 0).
const [EX, EZ] = versVille(.4, 23.6);
export const ENTREE_VILLAGE = [EX, EZ, 0];
// La salle de jeux du Village (salle-jeux.js, 18/11) : sur le parking à l'est du Village, entre ses deux allées (x ≈ −1056,6 et
// −1035,2), sa vitrine tournée vers l'ouest, à 1,5 m du bord de l'allée qui longe le Village. 16 m de façade, 11 m de fond.
export const SALLE_VILLAGE = { x: -1046.9, z: 2290, rot: -Math.PI / 2 };

// Les arbres de la maquette (coordonnées de la maquette) : scripts/village.mjs les retire, lieux.js plante ceux du jeu à leur
// place. Les deux du fond (−34/+34, −58) touchaient les portiques latéraux : on ne les replante pas.
export const ARBRES_VILLAGE = [[-36, -9], [-28, 9], [-23, 10], [36, -9], [28, 9], [23, 10]];

// ---------- Les rues qui passaient sous le Village ----------
// Deux voies de service d'OpenStreetMap passent là où se tient le Village : la boucle de dépose, qui descend du boulevard
// jusqu'au pied des marches, fait le tour de l'îlot et remonte, et une allée du parking qui le traverse d'est en ouest.
// La circulation (circulation.js) les empruntait, au travers des halles. Pendant le Village, une rue qui y entre s'arrête
// RECUL mètres avant le parvis ; la boucle de dépose, qui entre et ressort du même côté, y fait demi-tour : on dépose les
// visiteurs devant le portique d'entrée.
const RECUL = 13;
const longueur = pts => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; };
/** Raccourcit la suite de points `pts` de `d` mètres à son début (debut) ou à sa fin. */
function rogner(pts, d, debut) {
  const p = debut ? [...pts].reverse() : [...pts];
  while (p.length >= 2 && d > 0) {
    const a = p[p.length - 2], b = p[p.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > d) { const k = (l - d) / l; p[p.length - 1] = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; d = 0; }
    else { p.pop(); d -= l; }
  }
  return debut ? p.reverse() : p;
}
/** Les rues qu'il reste de L pendant le Village : [L] le plus souvent, [] si elle était tout entière dans le Village,
 *  ses morceaux (impasses) si elle le traversait, ou L avec un demi-tour (la boucle de dépose). Appelée par buildRoads. */
export function rueDuVillage(L) {
  if (!VILLAGE_ACTIF) return [L];
  const dedans = p => dansVillage(p[0], p[1], 2);
  // Des points tous les 2 m sur les tronçons qui passent près du Village : une allée droite n'a de points qu'à ses bouts.
  const P = [L.pts[0]];
  for (let i = 1; i < L.pts.length; i++) {
    const a = L.pts[i - 1], b = L.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(l / 2);
    let pres = false; for (let k = 0; k <= n && !pres; k++) pres = dedans([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    if (pres) for (let k = 1; k < n; k++) P.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    P.push(b);
  }
  if (!P.some(dedans)) return [L];
  // Les morceaux hors du Village, rognés de RECUL mètres là où ils y entraient.
  const morceaux = []; let cur = null;
  P.forEach((p, i) => { if (dedans(p)) { cur = null; return; } if (!cur) morceaux.push(cur = { pts: [], debut: i > 0 }); cur.pts.push(p); cur.fin = i < P.length - 1; });
  const restes = morceaux.map(m => { let p = m.pts; if (m.fin) p = rogner(p, RECUL, false); if (m.debut) p = rogner(p, RECUL, true); return p; }).filter(p => p.length >= 2 && longueur(p) >= 5);
  // La boucle : elle entre et ressort à moins de 30 m de là (le même côté du Village) → un demi-tour entre les deux bouts,
  // arrondi vers le Village sans y entrer (rayon : la moitié de l'écart, et l'on a reculé de 13 m).
  if (restes.length === 2 && !morceaux[0].debut && !morceaux[1].fin) {
    const A = restes[0].at(-1), B = restes[1][0], M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], r = Math.hypot(A[0] - M[0], A[1] - M[1]);
    if (r > 1 && r < 15) {
      const u = [(A[0] - M[0]) / r, (A[1] - M[1]) / r];
      let v = [CENTRE_VILLAGE[0] - M[0], CENTRE_VILLAGE[1] - M[1]]; const lv = Math.hypot(...v) || 1; v = [v[0] / lv, v[1] / lv];
      const arc = []; for (let k = 1; k < 10; k++) { const t = k * Math.PI / 10; arc.push([M[0] + r * (u[0] * Math.cos(t) + v[0] * Math.sin(t)), M[1] + r * (u[1] * Math.cos(t) + v[1] * Math.sin(t))]); }
      L.pts = [...restes[0], ...arc, ...restes[1]];
      return [L];
    }
  }
  return restes.map(pts => ({ ...L, pts }));
}
