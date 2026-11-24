// Les courses du joueur (« entrer au Super U d'Akpakpa, payer des articles, aller vers ma voiture, mettre les trucs dans ma
// voiture », Murielle, 23/11) : le sac qu'on porte en sortant de la caisse, le coffre de son véhicule, et le placard de la
// maison, où les courses deviennent des repas (maison.js : on cuisine avec ses courses, sans racheter les ingrédients).
// Retenu sur l'appareil, comme la peinture des véhicules : la fiche de vie de Firebase refuse tout champ en plus.
const CLE = 'kutonu.courses';
export const COURSES = { sac: [], coffre: [], placard: 0 }; // sac, coffre : [{ id, nom, prix, repas }] ; placard : des repas
try { Object.assign(COURSES, JSON.parse(localStorage.getItem(CLE) || '{}')); } catch { }
export function sauverCourses() { try { localStorage.setItem(CLE, JSON.stringify(COURSES)); } catch { } }
export const nbArticles = l => l.length;
export const resume = l => { const n = {}; for (const a of l) n[a.nom] = (n[a.nom] || 0) + 1; return Object.entries(n).map(([nom, k]) => (k > 1 ? `${k} × ${nom}` : nom)).join(', '); };
/** Des repas au placard (maison.js) : un de moins quand on cuisine avec ses courses. */
export const repasAuPlacard = () => COURSES.placard;
export function prendreRepas() { if (COURSES.placard <= 0) return false; COURSES.placard--; sauverCourses(); return true; }
