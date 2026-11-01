// ---------- Les règles de l'épargne : les mêmes pour la page (mode test, src/epargne.js) et pour le serveur (api/epargne.js) ----------
// L'argent mis de côté grandit de 2 % chaque soir à 20 h (le jour du jeu change à 20 h, comme les missions, journee.js),
// 2 000 F par jour au plus. Les intérêts attendent trois jours : au-delà, ils s'arrêtent jusqu'au retour du joueur.
export const TAUX = .02, PLAFOND_JOUR = 2000, MAX_EPARGNE = 500000, JOURS_MAX = 3, DEPOT_MIN = 100;
export const jourDe = t => new Date(t + 5 * 36e5).toISOString().slice(0, 10);
const ecart = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const entier = x => Math.max(0, Math.floor(Number(x) || 0));
export const interetDuJour = e => Math.min(PLAFOND_JOUR, Math.floor(entier(e) * TAUX));

/** L'épargne avec les intérêts des jours passés depuis `eJ` (trois au plus) : { e, interets, jours }. */
export function cumuler(epargne, eJ, jour) {
  const e = entier(epargne); if (!e || !/^\d{4}-\d\d-\d\d$/.test(eJ || '')) return { e, interets: 0, jours: 0 };
  const jours = Math.max(0, Math.min(JOURS_MAX, ecart(eJ, jour)));
  let i = 0; for (let k = 0; k < jours; k++) i += interetDuJour(e + i);
  return { e: e + i, interets: i, jours };
}
/**
 * Une opération sur la vie `v` ({ argent, epargne, eJ, eI }) le jour `jour` : 'etat' (les intérêts dus, rien d'autre),
 * 'deposer' ou 'retirer' `montant`. Rend { refus } ou { patch, change, interets, jours } ; `patch` remplace ces quatre champs.
 */
export function operer(v, action, montant, jour) {
  const argent = entier(v?.argent), c = cumuler(v?.epargne, v?.eJ, jour), m = entier(montant);
  let e = c.e, a = argent;
  if (action === 'deposer') {
    if (m < DEPOT_MIN) return { refus: 'montant' };
    if (m > argent) return { refus: 'pas-assez' };
    if (e + m > MAX_EPARGNE) return { refus: 'plafond' };
    e += m; a -= m;
  } else if (action === 'retirer') {
    if (m < 1) return { refus: 'montant' };
    if (m > e) return { refus: 'pas-assez' };
    e -= m; a += m;
  } else if (action !== 'etat') return { refus: 'action' };
  const patch = { argent: a, epargne: e, eJ: e > 0 ? jour : '', eI: entier(v?.eI) + c.interets };
  const change = a !== argent || e !== entier(v?.epargne) || patch.eJ !== (v?.eJ || '') || patch.eI !== entier(v?.eI);
  return { patch, change, interets: c.interets, jours: c.jours };
}
