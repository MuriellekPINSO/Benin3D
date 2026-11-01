// ---------- Les règles de l'adji (l'awalé, la variante abapa qu'on joue au Bénin) ----------
// Deux rangées de six trous, quatre graines dans chacun (48 en tout). Le joueur 0 a les trous 0 à 5, le joueur 1 les
// trous 6 à 11 ; on sème dans le sens 0 → 11 → 0 (celui des aiguilles d'une montre inversé, vu du joueur 0).
//  - Semer : on prend toutes les graines d'un de ses trous et on en pose une dans chacun des trous suivants. Avec 12
//    graines ou plus, on saute le trou de départ.
//  - Prendre : si la dernière graine tombe chez l'adversaire et y fait 2 ou 3, on les prend, puis celles des trous
//    précédents tant qu'ils font 2 ou 3 et sont chez l'adversaire.
//  - Ne pas affamer : un coup qui prendrait toutes les graines de l'adversaire se joue, mais ne prend rien. Si l'adversaire
//    n'a plus rien, on doit jouer un coup qui lui en donne ; si c'est impossible, la partie s'arrête et l'on garde ses graines.
//  - Fin : 25 graines prises (plus de la moitié), plus aucun coup, ou 60 coups de suite sans prise (les graines tournent
//    en rond) : chacun garde alors celles de son camp.
// Le même code sert à la page (les coups, l'ordinateur) et à vérifier une partie rejouée.
export const N = 12, GAGNE = 25, SANS_PRISE = 60;
export const depart = () => ({ t: Array(N).fill(4), g: [0, 0], j: 0, n: 0, sp: 0, fin: false, gagnant: -1 });
export const chezSoi = (j, i) => (j === 0 ? i < 6 : i >= 6);
const graines = (E, j) => E.t.reduce((s, x, i) => s + (chezSoi(j, i) ? x : 0), 0);

/** Sème le trou `i` (sans vérifier que le coup est permis) : { t, chemin, prises, pris }. */
export function semer(E, i) {
  const t = E.t.slice(), chemin = []; let k = i, n = t[i]; t[i] = 0;
  while (n > 0) { k = (k + 1) % N; if (k === i) continue; t[k]++; n--; chemin.push(k); }
  const adv = 1 - E.j; let prises = [];
  for (let p = k; chezSoi(adv, p) && (t[p] === 2 || t[p] === 3); p = (p + N - 1) % N) prises.push(p);
  // Prendre tout ce que l'adversaire a sur le plateau : le coup se joue, sans prise.
  if (prises.length && prises.reduce((s, p) => s + t[p], 0) === t.reduce((s, x, p) => s + (chezSoi(adv, p) ? x : 0), 0)) prises = [];
  let pris = 0; for (const p of prises) { pris += t[p]; t[p] = 0; }
  return { t, chemin, prises, pris };
}
/** Les trous que le joueur dont c'est le tour peut jouer. */
export function coups(E) {
  if (E.fin) return [];
  const miens = [...Array(N).keys()].filter(i => chezSoi(E.j, i) && E.t[i] > 0);
  if (graines(E, 1 - E.j) > 0) return miens;
  return miens.filter(i => semer(E, i).t.some((x, p) => chezSoi(1 - E.j, p) && x > 0)); // il faut nourrir l'adversaire
}
function finir(E) {
  E.fin = true;
  E.gagnant = E.g[0] > E.g[1] ? 0 : E.g[1] > E.g[0] ? 1 : 2; // 2 : partie nulle (24 partout)
  return E;
}
/** Joue le trou `i` ; rend le nouvel état et ce qui s'est passé, ou null si le coup n'est pas permis. */
export function jouer(E, i) {
  if (!coups(E).includes(i)) return null;
  const s = semer(E, i), F = { t: s.t, g: E.g.slice(), j: 1 - E.j, n: E.n + 1, sp: s.pris ? 0 : E.sp + 1, fin: false, gagnant: -1 };
  F.g[E.j] += s.pris;
  if (F.g[0] >= GAGNE || F.g[1] >= GAGNE) return { E: finir(F), ...s };
  // Plus de coup pour celui qui doit jouer, ou des graines qui tournent en rond : chacun garde celles de son camp.
  if (!coups(F).length || F.sp >= SANS_PRISE) {
    for (let p = 0; p < N; p++) { F.g[chezSoi(0, p) ? 0 : 1] += F.t[p]; F.t[p] = 0; }
    return { E: finir(F), ...s };
  }
  return { E: F, ...s };
}
/** Rejoue une suite de coups (une lettre par coup : 0-9, a, b) ; null au premier coup interdit. */
export function rejouer(suite) {
  let E = depart();
  for (const c of suite) { const r = jouer(E, parseInt(c, 12)); if (!r) return null; E = r.E; }
  return E;
}
export const lettre = i => i.toString(12);

// ---------- L'ordinateur : il regarde quelques coups à l'avance ----------
function valeur(E, moi, prof, a, b) {
  if (E.fin) return E.gagnant === moi ? 1000 : E.gagnant === 2 ? 0 : -1000;
  if (!prof) return E.g[moi] - E.g[1 - moi];
  const l = coups(E), max = E.j === moi; let v = max ? -Infinity : Infinity;
  for (const i of l) {
    const x = valeur(jouer(E, i).E, moi, prof - 1, a, b);
    if (max) { v = Math.max(v, x); a = Math.max(a, v); } else { v = Math.min(v, x); b = Math.min(b, v); }
    if (b <= a) break;
  }
  return v;
}
/** Le coup de l'ordinateur ; `prof` : combien de coups il voit venir. Entre deux coups aussi bons, au hasard. */
export function coupOrdinateur(E, prof = 4, alea = Math.random) {
  let meilleur = -Infinity, choix = [];
  for (const i of coups(E)) {
    const v = valeur(jouer(E, i).E, E.j, prof - 1, -Infinity, Infinity);
    if (v > meilleur) { meilleur = v; choix = [i]; } else if (v === meilleur) choix.push(i);
  }
  return choix[Math.floor(alea() * choix.length)];
}
