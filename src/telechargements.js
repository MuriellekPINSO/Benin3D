// ---------- Téléchargements de fond : après l'arrivée dans la ville, trois à la fois ----------
// Les modèles détaillés (monuments Tripo, personnages animés, véhicules, avion) ne sont pas nécessaires pour
// voir la ville : le jeu a ses versions dessinées en code et les remplace dès qu'ils arrivent. Lancés tous
// ensemble pendant le chargement (une trentaine de mégaoctets), ils se partageaient la connexion avec ce que
// l'écran de chargement attend vraiment (données de la ville, zémidjans) et retardaient l'entrée de 20 à 30 s,
// davantage sur un téléphone en 4G.
const F = { demarre: false, attente: [], enCours: 0, max: 3 };

/** Lance `fn` (qui renvoie une promesse) quand la ville est affichée ; `prioritaire` : avant ceux qui attendent. */
export function plusTard(fn, prioritaire = false) {
  return new Promise((ok, ko) => { F.attente[prioritaire ? 'unshift' : 'push']({ fn, ok, ko }); suivant(); });
}
function suivant() {
  while (F.demarre && F.enCours < F.max && F.attente.length) {
    const t = F.attente.shift(); F.enCours++;
    Promise.resolve().then(t.fn).then(t.ok, t.ko).finally(() => { F.enCours--; suivant(); });
  }
}
/** Appelé quand l'écran de chargement disparaît (main.js). */
export function demarrerTelechargements() { F.demarre = true; suivant(); }
