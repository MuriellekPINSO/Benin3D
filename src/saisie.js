// ---------- Clavier ou manette : les touches qu'on affiche ----------
// « Sur manette, je ne peux pas choisir les E… ni même les gestes : je dois encore utiliser ma souris » (Murielle,
// 26/10) : les invites disaient « E », « 1 2 3 », « ← → » même quand on jouait à la manette, et rien ne disait quel
// bouton presser. La page retient d'où vient la dernière saisie : un bouton ou un stick de la manette la passe en
// « manette » (classe .manette sur <html>, et .pad-ps pour une PlayStation), une touche du clavier, un clic ou un doigt
// la rendent au clavier. Chaque touche dessinée porte ses trois versions (un <kbd> à trois <span>), et la feuille de
// style montre la bonne : rien à redessiner quand on change de main.

export const SAISIE = { manette: false, ps: false };
const racine = document.documentElement;
const annoncer = () => document.dispatchEvent(new Event('saisie'));
/** Un bouton ou un stick de la manette vient de bouger (manette.js). `ps` : une manette PlayStation. */
export function saisieManette(ps) {
  if (SAISIE.manette && SAISIE.ps === ps) return;
  SAISIE.manette = true; SAISIE.ps = ps; racine.classList.add('manette'); racine.classList.toggle('pad-ps', ps); annoncer();
}
export function saisieClavier() {
  if (!SAISIE.manette) return;
  SAISIE.manette = false; racine.classList.remove('manette'); annoncer();
}
addEventListener('keydown', saisieClavier, true);
addEventListener('pointerdown', saisieClavier, true);

// Le même geste ne prend pas le même bouton dans Zém Run et dans le salon : en course, A saute et Y interagit (X répond
// « 3 » pendant un dialogue) ; à pied, A fait l'action du moment, comme E. [clavier, Xbox, PlayStation].
const MENU = ['Échap', '☰', 'Options'];
const JEU_T = { E: ['E', 'Y', '△'], 1: ['1', 'A', '✕'], 2: ['2', 'B', '○'], 3: ['3', 'X', '□'], '↑': ['↑', 'RT', 'R2'], '↓': ['↓', 'LT', 'L2'], '←': ['←', '◀', '◀'], '→': ['→', '▶', '▶'], T: ['T', '▲', '▲'], U: ['U', '▼', '▼'], Espace: ['Espace', 'A', '✕'], H: ['H', 'B', '○'], Échap: MENU };
JEU_T.Space = JEU_T.Espace; JEU_T.Esc = MENU; // la version anglaise traduit le texte des consignes, pas les clés
const SALON_T = { E: ['E', 'A', '✕'], R: ['R', 'X', '□'], F: ['F', 'B', '○'], V: ['V', 'LB', 'L1'], G: ['1-5', 'Y', '△'], Échap: MENU, Esc: MENU };
const enJeu = () => !!document.getElementById('app')?.classList.contains('mode-jeu');
const versions = (cle, jeu = enJeu()) => (jeu ? JEU_T : SALON_T)[cle] || [cle, cle, cle];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** La touche dessinée (HTML) : ses trois versions, la feuille de style montre celle de la dernière saisie. */
export function kbd(cle, jeu) {
  const [c, x, p] = versions(cle, jeu);
  return `<kbd class="tch"><span class="tc">${esc(c)}</span><span class="tx">${esc(x)}</span><span class="tp">${esc(p)}</span></kbd>`;
}
/** La touche en texte, pour un message (« … puis Y ») : celle de la saisie du moment. */
export function glyphe(cle, jeu) { const v = versions(cle, jeu); return SAISIE.manette ? v[SAISIE.ps ? 2 : 1] : v[0]; }
