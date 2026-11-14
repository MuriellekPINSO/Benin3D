// Les règles de la course à vélo payante de RideCorniche, partagées par la page (course-velo.js) et le serveur
// (api/course-velo.js, api/fedapay.js) : le prix de l'inscription, la vitesse la plus haute possible, et la vérification
// d'une arrivée. Le serveur ne croit pas la page sur parole : une 1re place ne donne un vrai ticket que si la course a
// duré ce qu'elle dit, et si le trajet relevé chaque seconde va bien du départ à l'arrivée sans saut impossible.
// « Avant de faire la course, tu dois payer 2000 francs avec les pièces que tu as et 500 en vraie monnaie » (Murielle, 14/11).

export const PRIX_JEU = 2000; // F du jeu, pris dans le porte-monnaie de « Ma vie »
export const PRIX_MOMO = 500; // F CFA, par Mobile Money (api/fedapay.js, objet 'courseVelo')
export const VMAX_VELO = 7; // m/s, le vélo du joueur (conduite.js, VEHICULES.velo)
export const ASPIRATION = .8; // m/s en plus, au plus, dans l'aspiration d'un autre cycliste
export const ELAN = 2; // m/s en plus pendant 3 s (puis 1 s qui retombe), en sortant de sa roue
export const DECOMPTE = 3; // s de « 3, 2, 1 » avant le départ

// Le parcours « De la Corniche à la cathédrale », tel que le jeu le trace (course-velo.js, trace()) : ses deux bouts et
// sa longueur, relevés dans le jeu le 14/11. Les tolérances couvrent un tracé recalculé un peu autrement.
export const PARCOURS_PAYANT = { id: 'cathedrale', depart: [4091, 1598], arrivee: [2638, 1507], longueur: 2032 };
// Le meilleur temps possible : tout le parcours à la vitesse de l'aspiration, sans un seul ralentissement (l'élan ne dure
// que quelques secondes : on ne le prend qu'en sortant d'une roue).
export const T_MIN = Math.floor(PARCOURS_PAYANT.longueur / (VMAX_VELO + ASPIRATION) * .97);
// Le temps habituel du premier des cyclistes du jeu (mesuré le 14/11) : un gagnant bien plus lent les a sans doute gênés.
export const T_IA = 282;

/**
 * Vérifie l'arrivée d'une course payée. `temps` : la durée de la course selon la page (s, sans le compte à rebours) ;
 * `ecoule` : le temps passé, selon le serveur, entre le départ enregistré et l'arrivée (s) ; `trace` : [[x, z], …], la
 * position du joueur à chaque seconde de course. Rend { refus, alertes } : un refus (code) empêche le ticket ; les
 * alertes ne l'empêchent pas, elles disent au tableau de bord ce qu'il faut regarder de plus près.
 */
export function verifierArrivee({ rang, temps, ecoule, trace }) {
  const alertes = [];
  if (!(rang >= 1 && rang <= 4) || !Number.isFinite(temps) || !Number.isFinite(ecoule)) return { refus: 'donnees', alertes };
  if (temps < T_MIN) return { refus: 'trop-rapide', alertes };
  if (temps > ecoule + 2) return { refus: 'temps-impossible', alertes }; // la page dit avoir roulé plus longtemps qu'il ne s'est passé de temps
  if (rang === 1) { // le trajet ne compte que pour un ticket
    const pts = Array.isArray(trace) ? trace.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [];
    if (pts.length < Math.min(temps * .7, 150)) return { refus: 'trace', alertes };
    const { depart, arrivee, longueur } = PARCOURS_PAYANT, loin = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (loin(pts[0], depart) > 45 || loin(pts.at(-1), arrivee) > 45) return { refus: 'trace', alertes };
    let total = 0, saut = 0;
    for (let i = 1; i < pts.length; i++) { const d = loin(pts[i], pts[i - 1]); total += d; saut = Math.max(saut, d); }
    if (saut > (VMAX_VELO + ELAN) * 1.4 + 2 || total < longueur * .85) return { refus: 'trace', alertes };
  }
  if (ecoule > temps + DECOMPTE + 60) alertes.push('pause'); // page cachée, ou arrivée envoyée bien plus tard
  if (rang === 1 && temps > T_IA + 15) alertes.push('lent');
  return { refus: null, alertes };
}
