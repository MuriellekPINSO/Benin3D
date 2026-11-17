import { $ } from './base.js';
import { son } from './audio.js';
import { ouvrirAdji } from './adji.js';
import { fermerFiche } from './commerces.js';
import { QUIZ } from './jeu.js';
import { filtrer } from './moderation.js';
import { choisir } from './trajets.js';
import { ENTREE_VILLAGE, ESPACES, dansVillage } from './village-plan.js';

// ---------- Les jeux à deux du Village de l'innovation ----------
// Kevin, 15/11 : « quel jeu fun entre participants du village ? », « si deux personnes sont là au même moment, y a-t-il des
// choses à faire ? », puis « ajoute plusieurs jeux qu'on peut faire à deux ». Aux bornes de L'Arcade (espace 08), ou depuis le
// passeport, on défie un autre joueur de la ville :
//  - le duel du savoir : cinq questions sur Cotonou et le Village, les mêmes pour les deux ; le plus juste, puis le plus rapide ;
//  - les cauris : aligner trois cauris avant l'autre (un morpion), chacun son tour ;
//  - la visite des stands (« la course au passeport » jusqu'au 17/11) : les deux partent du portique d'entrée, le premier qui
//    est entré dans les onze stands gagne ; dix minutes au plus ;
//  - l'adji, qui existait déjà (adji.js).
// Tout passe par la discussion de la ville (salon.js) : des messages marqués `vj`, adressés à un joueur (`pour`), que la
// discussion n'affiche pas. Rien à changer dans les règles de Firebase. Le gagnant le dit à toute la ville.
//
// 17/11, au stand : « après une première invitation acceptée, on quitte la partie et on ne peut plus accepter d'invitation ».
// Deux causes : (1) la fenêtre d'invitation (#choix) s'ouvrait SOUS la fenêtre du jeu (#vieFiche, plus bas dans la page) :
// le résultat de la partie restait affiché et cachait « Accepter » (corrigé dans style.css) ; (2) fermer la fenêtre avec la
// croix, sortir de la ville ou fermer l'onglet ne terminait pas la partie : elle restait « en cours » pour toujours, et
// chaque invitation suivante recevait « il joue déjà une partie » sans même s'afficher. Désormais : la croix demande « Quitter
// la partie ? », sortir de la ville abandonne, un adversaire parti de la ville (15 s) ou qui ne joue plus (une minute aux
// cauris) perd par forfait, la visite des stands dure dix minutes au plus, et une invitation reçue en pleine partie s'affiche
// quand même (« Accepter et quitter ma partie »).

// La clé `course` reste (les messages entre joueurs la portent) ; son nom est « La visite des stands » depuis le 17/11.
const NOMS = { quiz: 'Le duel du savoir', cauris: 'Les cauris', course: 'La visite des stands' };
// Comment on joue et comment on gagne, en deux phrases (le menu, l'invitation) : « explique ça » (Murielle, 17/11).
const SOUS = {
  quiz: 'Dix questions sur le Village et Cotonou, les mêmes pour vous deux. Le plus de bonnes réponses gagne ; à égalité, le plus rapide.',
  cauris: 'Chacun son tour, pose un cauri sur la grille. Le premier qui en aligne trois gagne : en ligne, en colonne ou en diagonale.',
  course: 'Vous partez ensemble de l’entrée du Village. Entre dans ses onze stands : le premier qui les a tous visités gagne.',
};
// Rappelé en haut de la fenêtre pendant la partie.
const REGLE = {
  quiz: '15 secondes par question : touche la bonne réponse.',
  cauris: 'Touche une case vide quand c’est ton tour. Une minute par coup.',
  course: 'Marche jusqu’à chaque stand : il compte quand tu y entres. Dix minutes au plus.',
};
const ATTENTE = 30000, N_Q = 10, N_VILLAGE = 6, DUREE_Q = 15000, TOUR = 60000, DUREE_VISITE = 10 * 60000, ABSENT = 15000;
const J = { ctx: { ligne: () => { }, envoyer: () => { }, direATous: () => { }, moi: () => '', nom: () => '', autres: () => [], position: () => null, aPied: () => true, poser: () => { }, annonce: () => { } }, p: null };
if (import.meta.env.DEV) window.__villageJeux = J; // pour les tests
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const nettoyer = n => filtrer(String(n ?? '').replace(/\s+/g, ' ').trim().slice(0, 16)) || 'Un joueur';
const envoyer = m => J.ctx.envoyer({ ...m, id: J.p?.id, pour: J.p?.lui });

export function initJeuxVillage(ctx) {
  Object.assign(J.ctx, ctx);
  // La croix, un clic à côté, Échap (commerces.js fermerFiche) : la fenêtre se cache ; en pleine partie, on demande.
  const el = $('#vieFiche'); if (el) new MutationObserver(surFermeture).observe(el, { attributes: true, attributeFilter: ['hidden'] });
  setInterval(veiller, 1000);
}
export const partieEnCours = () => !!J.p && J.p.etat !== 'fini';

// ---------- Le hasard partagé : les deux joueurs tirent les mêmes questions avec la même graine ----------
function hasard(graine) { let a = graine >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const melanger = (l, r) => { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Les questions du Village, d'après le plan de ses organisateurs et la maquette de Murielle (village-plan.js, ce qu'il y a
// dans chaque halle : scripts/village.mjs), et celles des quartiers (jeu.js). Dix par duel (cinq jusqu'au 17/11) : six sur le
// Village, quatre sur Cotonou.
const QUESTIONS_VILLAGE = [
  ['Combien d’espaces compte le Village de l’innovation ?', ['11', '8', '15'], 0],
  ['Où se tient le Village de l’innovation ?', ['Sur l’esplanade du Palais des Congrès', 'Place de l’Amazone', 'Au stade de l’Amitié'], 0],
  ['Quand se tient le Village de l’innovation ?', ['Du 18 au 20 novembre', 'Du 1er au 3 décembre', 'Du 10 au 12 octobre'], 0],
  ['Combien de zones compte le Village ?', ['3', '2', '5'], 0],
  ['Dans quel espace du Village trouve-t-on des bornes d’arcade ?', ['L’Arcade', 'Le Musée', 'Le Jardin'], 0],
  ['Dans quel espace du Village voit-on des imprimantes 3D ?', ['L’Atelier', 'Le Marché', 'Le Centre de santé'], 0],
  ['Quels petits démonstrateurs voit-on à L’Atelier ?', ['Des robots', 'Des drones', 'Des voitures'], 0],
  ['Dans quel espace trouve-t-on des micros et une console de mixage ?', ['La Radio', 'Le Musée', 'Le Marché'], 0],
  ['Dans quel espace du Village voit-on des tables d’examen ?', ['Le Centre de santé', 'La Fabrique des talents', 'L’Atelier'], 0],
  ['Dans quel espace des vitrines montrent une collection ?', ['Le Musée', 'La Radio', 'L’Arcade'], 0],
  ['Où les entrepreneurs ont-ils leurs stands ?', ['À la Maison des entrepreneurs', 'Au Jardin', 'À la Radio'], 0],
  ['Quel espace du Village porte le nom du lieu où l’on se réunit pour discuter ?', ['L’Arbre à palabre', 'La Radio', 'La Fabrique des talents'], 0],
  ['À quelle zone du Village appartient la Place du citoyen ?', ['Civique', 'Bien-vivre', 'Créer & innover'], 0],
  ['À quelle zone du Village appartient L’Arcade ?', ['Bien-vivre', 'Civique', 'Créer & innover'], 0],
  ['À quelle zone du Village appartient La Radio ?', ['Créer & innover', 'Bien-vivre', 'Civique'], 0],
  ['Quelle zone réunit La Fabrique des talents et La Maison des entrepreneurs ?', ['Civique', 'Bien-vivre', 'Créer & innover'], 0],
  ['Quelle zone réunit Le Jardin, Le Marché et Le Centre de santé ?', ['Bien-vivre', 'Civique', 'Créer & innover'], 0],
  ['Dans le jeu, que reçoit-on en entrant dans un espace du Village ?', ['Un tampon sur son passeport', 'Un billet de tombola', 'Une photo'], 0],
];
function questions(graine) {
  const r = hasard(graine), village = melanger(QUESTIONS_VILLAGE, r).slice(0, N_VILLAGE), ville = melanger(Object.values(QUIZ).flat(), r).slice(0, N_Q - N_VILLAGE);
  return melanger([...village, ...ville], r).map(([q, opts, bonne]) => { const ordre = melanger(opts.map((o, i) => i), r); return { q, opts: ordre.map(i => opts[i]), bonne: ordre.indexOf(bonne) }; });
}

// ---------- Inviter, répondre ----------
/** Les autres joueurs de la ville (pour la course : seulement ceux qui sont au Village), du plus proche au plus loin. */
function adversaires(jeu) {
  const p = J.ctx.position(), ici = p ? [p[0], p[1]] : null;
  return J.ctx.autres().filter(A => A.id && A.nom && typeof A.e?.x === 'number' && (jeu !== 'course' || dansVillage(A.e.x, A.e.z)))
    .map(A => ({ ...A, d: ici ? Math.hypot(A.e.x - ici[0], A.e.z - ici[1]) : 0, auVillage: dansVillage(A.e.x, A.e.z) }))
    .sort((a, b) => a.d - b.d).slice(0, 12);
}
/** « Jouer à deux » : le menu des jeux (bornes de L'Arcade, passeport). */
export function ouvrirJeux() {
  const opts = [];
  if (partieEnCours()) {
    opts.push({ texte: `Reprendre : ${NOMS[J.p.jeu]}`, sous: `Contre ${J.p.nomLui}`, f: afficher });
    opts.push({ texte: J.p.etat === 'attente' ? 'Annuler mon invitation' : 'Quitter la partie', sous: J.p.etat === 'attente' ? `Invitation à ${J.p.nomLui}` : `${J.p.nomLui} gagne par forfait`, f: abandonner });
  }
  for (const jeu of Object.keys(NOMS)) opts.push({ texte: NOMS[jeu], sous: SOUS[jeu], desactive: partieEnCours(), f: () => inviter(jeu) });
  opts.push({ texte: 'L’adji', sous: 'L’awalé du Bénin : défie un joueur de la ville, ou Tonton Codjo', f: () => { fermerFiche(); ouvrirAdji(); } });
  choisir('Jouer à deux au Village', opts, { annuler: 'Fermer' });
}
function inviter(jeu) {
  const gens = adversaires(jeu);
  if (!gens.length) {
    J.ctx.ligne(jeu === 'course' ? 'Pour la visite des stands, il faut un autre joueur dans le Village : invite un ami (« Inviter ») ou attends qu’un visiteur arrive.' : 'Personne d’autre n’est en ville pour l’instant : invite un ami (« Inviter »), il arrive juste à côté de toi.');
    return;
  }
  choisir(`${NOMS[jeu]} : avec qui ?`, gens.map(g => ({ texte: g.nom, sous: g.auVillage ? 'Au Village' : g.d < 950 ? `À ${Math.round(g.d / 50) * 50} m` : `À ${(g.d / 1000).toFixed(1).replace('.', ',')} km`, f: () => proposer(jeu, g) })));
}
function proposer(jeu, g) {
  if (partieEnCours()) return;
  const id = Math.random().toString(36).slice(2, 10), graine = Math.floor(Math.random() * 1e9);
  J.p = { id, jeu, hote: true, lui: g.id, nomLui: g.nom, etat: 'attente', graine };
  J.ctx.envoyer({ vj: 'inv', jeu, id, pour: g.id, graine });
  J.p.minuterie = setTimeout(() => { if (J.p?.id === id && J.p.etat === 'attente') { J.ctx.ligne(`${g.nom} n’a pas répondu.`); terminer(); } }, ATTENTE);
  J.ctx.ligne(`🎮 Tu proposes « ${NOMS[jeu]} » à ${g.nom}…`);
  afficher();
}
function accepter(m, nom, recu) {
  // L'invitation est restée à l'écran plus de 30 s : celui qui l'a envoyée a cessé d'attendre (proposer).
  if (Date.now() - recu > ATTENTE) { J.ctx.ligne(`Trop tard : l’invitation de ${nom} a expiré. Propose-lui une partie à ton tour !`); return; }
  if (m.jeu === 'course' && !J.ctx.aPied()) { J.ctx.ligne('Pour la visite des stands, descends d’abord de ton véhicule.'); J.ctx.envoyer({ vj: 'non', id: m.id, pour: m.u }); return; }
  if (partieEnCours()) abandonner(); // « Accepter et quitter ma partie » : l'autre partie s'arrête d'abord (il gagne par forfait)
  J.p = { id: m.id, jeu: m.jeu, hote: false, lui: m.u, nomLui: nom, etat: 'attente', graine: m.graine | 0 };
  envoyer({ vj: 'oui' });
  commencer();
}
function terminer() { if (!J.p) return; clearTimeout(J.p.minuterie); clearInterval(J.p.tic); J.p.etat = 'fini'; }
function abandonner() {
  if (!J.p || J.p.etat === 'fini') return;
  if (J.p.etat !== 'attente' || J.p.hote) envoyer({ vj: 'fin' });
  J.ctx.ligne(J.p.etat === 'attente' ? 'Invitation annulée.' : `Tu as quitté la partie contre ${J.p.nomLui}.`);
  terminer(); J.p = null; fermerFiche();
}
/** L'autre est parti, ou ne joue plus : on gagne par forfait. */
function forfait(texte) {
  const P = J.p; if (!P || P.etat === 'fini') return;
  J.ctx.ligne(texte); terminer(); P.resultat = 'forfait'; P.motif = texte; son('piece'); afficherSiOuvert();
}
/** salon.js : on sort de la ville. La partie s'arrête aussi chez l'autre (avant : elle restait « en cours » chez les deux). */
export function quitterJeuxVillage() {
  const P = J.p; if (!P) return;
  if (P.etat !== 'fini' && (P.etat !== 'attente' || P.hote)) envoyer({ vj: 'fin' });
  terminer(); J.p = null;
  if (ouverte()) fermerFiche();
}
/** La fenêtre de la partie vient d'être fermée (croix, clic à côté, Échap) en plein jeu : on demande. */
function surFermeture() {
  const P = J.p;
  if (!P || P.etat !== 'en cours' || P.jeu === 'course' || !$('#vieFiche')?.hidden || !$('#vfContenu .vj')) return;
  choisir(`Quitter la partie contre ${P.nomLui} ?`, [{ texte: 'Oui, je quitte la partie', sous: `${P.nomLui} gagne par forfait.`, prudent: true, f: abandonner }],
    { annuler: 'Non, je continue', puis: () => { if (J.p === P) afficher(); } });
}
/** Chaque seconde : l'autre est-il encore là, joue-t-il encore, le temps de la visite est-il fini ? */
function veiller() {
  const P = J.p; if (!P || P.etat !== 'en cours') return;
  const t = Date.now();
  // Parti de la ville (sortie, onglet fermé, réseau perdu : salon.js l'oublie) : la partie ne pourrait plus finir.
  if (J.ctx.autres().some(A => A.id === P.lui)) P.vuT = t;
  else if (t - P.vuT > ABSENT) { forfait(`${P.nomLui} a quitté la ville : tu gagnes par forfait.`); return; }
  if (P.jeu === 'cauris') {
    const depuis = t - P.tourT, aMoi = P.tour === moiN();
    if (aMoi && depuis > TOUR) { envoyer({ vj: 'fin', temps: 1 }); J.ctx.ligne(`Tu n’as pas joué pendant une minute : ${P.nomLui} gagne.`); terminer(); P.resultat = 'perdu'; afficherSiOuvert(); return; }
    if (!aMoi && depuis > TOUR + 5000) { forfait(`${P.nomLui} ne joue plus : tu gagnes par forfait.`); return; }
    const el = $('#vjTemps'); if (el) el.textContent = aMoi ? ` · ${Math.max(0, Math.ceil((TOUR - depuis) / 1000))} s` : '';
  }
  if (P.jeu === 'course' && t >= P.depart) {
    const reste = P.depart + DUREE_VISITE - t;
    if (reste <= 0) { const a = P.faits.size, b = P.nLui; J.ctx.annonce(`Temps écoulé : ${a} stands pour toi, ${b} pour ${P.nomLui}.`, 3500); gagnant(a > b, a === b); return; }
    if (reste < 60000 && !P.uneMinute) { P.uneMinute = true; J.ctx.annonce('Plus qu’une minute !', 2200); }
    const el = $('#vjTemps'); if (el) el.textContent = mmss(reste);
  }
}
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
/** Les messages `vj` de la discussion (salon.js) : jamais affichés. */
export function surMessageJeu(m) {
  const moi = J.ctx.moi();
  if (!moi || m.u === moi || m.pour !== moi) return;
  if (typeof m.t === 'number' && Date.now() - m.t > ATTENTE) return; // l'historique de la discussion, à l'arrivée
  const nom = nettoyer(m.n);
  if (m.vj === 'inv') {
    if (!NOMS[m.jeu]) return;
    // Même en pleine partie, l'invitation s'affiche (avant : « il joue déjà » partait tout seul, sans rien montrer).
    const occupe = partieEnCours() ? J.p : null, recu = Date.now();
    son('piece'); J.ctx.ligne(`🎮 ${nom} te propose « ${NOMS[m.jeu]} ».`);
    const texte = !occupe ? 'Accepter' : occupe.etat === 'attente' ? `Accepter (j’annule mon invitation à ${occupe.nomLui})` : `Accepter et quitter ma partie contre ${occupe.nomLui}`;
    choisir(`${nom} te défie : ${NOMS[m.jeu]}`, [{ texte, sous: SOUS[m.jeu], prudent: !!occupe, f: () => accepter(m, nom, recu) }], { annuler: 'Refuser', puis: () => J.ctx.envoyer({ vj: partieEnCours() ? 'occupe' : 'non', id: m.id, pour: m.u }) });
    return;
  }
  const P = J.p;
  if (m.vj === 'oui') {
    if (P && P.id === m.id && m.u === P.lui && P.hote && P.etat === 'attente') { clearTimeout(P.minuterie); commencer(); }
    // Une réponse à une invitation qu'on n'attend plus (annulée, expirée) : on le lui dit, sinon il attendrait pour rien.
    else if (!P || P.id !== m.id || (P.etat === 'fini' && !P.resultat)) J.ctx.envoyer({ vj: 'annule', id: m.id, pour: m.u });
    return;
  }
  if (!P || P.id !== m.id || m.u !== P.lui) return;
  if (m.vj === 'annule' && !P.hote && P.etat !== 'fini') { J.ctx.ligne(`${P.nomLui} n’attendait plus ta réponse : l’invitation a expiré.`); terminer(); J.p = null; afficherSiOuvert(); return; }
  if ((m.vj === 'non' || m.vj === 'occupe') && P.etat === 'attente') { J.ctx.ligne(m.vj === 'occupe' ? `${P.nomLui} joue déjà une partie.` : `${P.nomLui} a refusé.`); terminer(); J.p = null; afficherSiOuvert(); return; }
  if (m.vj === 'fin' && P.etat !== 'fini') { forfait(m.temps ? `${P.nomLui} n’a pas joué pendant une minute : tu gagnes.` : `${P.nomLui} a quitté la partie : tu gagnes par forfait.`); return; }
  if (P.etat !== 'en cours') return;
  if (P.jeu === 'quiz' && m.vj === 'q') quizReponseLui(m);
  if (P.jeu === 'cauris' && m.vj === 'c') caurisCoupLui(m.c | 0);
  if (P.jeu === 'course' && m.vj === 't') courseLui(m.n | 0);
}
function commencer() {
  const P = J.p; P.etat = 'en cours'; P.vuT = Date.now(); son('piece');
  if (P.jeu === 'quiz') { P.qs = questions(P.graine); P.k = 0; P.moi = []; P.luiR = []; P.debutK = Date.now(); P.tic = setInterval(quizTic, 250); }
  if (P.jeu === 'cauris') { P.g = Array(9).fill(0); P.tour = 1; P.tourT = Date.now(); }
  if (P.jeu === 'course') {
    // Les deux au portique d'entrée, tournés vers le Village ; trois secondes, puis le chrono.
    const [x, z, cap] = ENTREE_VILLAGE; J.ctx.poser(x + (P.hote ? -1.2 : 1.2), z, cap);
    P.faits = new Set(); P.nLui = 0; P.depart = Date.now() + 3000;
    [3, 2, 1].forEach((n, i) => setTimeout(() => { if (J.p === P && P.etat === 'en cours') J.ctx.annonce(`${n}…`, 900); }, i * 1000));
    setTimeout(() => { if (J.p === P && P.etat === 'en cours') { J.ctx.annonce('Partez ! Entre dans les onze stands, le plus vite possible.', 2500); son('piece'); } }, 3000);
    fermerFiche(); J.ctx.ligne(`🏁 Visite des stands contre ${P.nomLui} : départ dans 3 secondes, à l’entrée du Village ! Le premier qui entre dans les onze stands gagne (dix minutes au plus). Ta partie : « Passeport » → « Jouer à deux ».`);
    return;
  }
  afficher();
}
function gagnant(moiGagne, nul = false) {
  const P = J.p; terminer(); P.resultat = nul ? 'nul' : moiGagne ? 'gagne' : 'perdu'; son('piece');
  // Le gagnant le dit à toute la ville (une seule fois : c'est lui qui l'envoie).
  if (moiGagne && !nul) J.ctx.direATous(`🏆 J’ai battu ${P.nomLui} : ${NOMS[P.jeu].toLowerCase()} !`);
  J.ctx.ligne(nul ? `Match nul contre ${P.nomLui}.` : moiGagne ? `🏆 Tu as battu ${P.nomLui} !` : `${P.nomLui} a gagné cette fois.`);
  afficher();
}

// ---------- Le duel du savoir ----------
function quizRepondre(r) {
  const P = J.p; if (!P || P.jeu !== 'quiz' || P.etat !== 'en cours' || P.moi[P.k]) return;
  const ms = Math.min(DUREE_Q, Date.now() - P.debutK);
  P.moi[P.k] = { r, ms }; envoyer({ vj: 'q', k: P.k, r, ms });
  quizSuite();
}
function quizReponseLui(m) { const P = J.p; if (m.k >= 0 && m.k < N_Q && !P.luiR[m.k]) P.luiR[m.k] = { r: m.r | 0, ms: Math.min(DUREE_Q, Math.max(0, +m.ms || DUREE_Q)) }; quizSuite(); }
function quizTic() {
  const P = J.p; if (!P || P.jeu !== 'quiz' || P.etat !== 'en cours' || P.correction) return;
  const ecoule = Date.now() - P.debutK; let change = false;
  if (ecoule > DUREE_Q && !P.moi[P.k]) { P.moi[P.k] = { r: -1, ms: DUREE_Q }; envoyer({ vj: 'q', k: P.k, r: -1, ms: DUREE_Q }); change = true; }
  if (ecoule > DUREE_Q + 4000 && !P.luiR[P.k]) { P.luiR[P.k] = { r: -1, ms: DUREE_Q }; change = true; } // il ne répond plus (réseau) : la question compte faux pour lui
  if (change) quizSuite();
  const t = $('#vjTemps'); if (t && !P.moi[P.k]) t.textContent = `${Math.max(0, Math.ceil((DUREE_Q - ecoule) / 1000))} s`; // le compte à rebours, sans redessiner la fenêtre
}
function quizSuite() {
  const P = J.p; if (!P.moi[P.k] || !P.luiR[P.k] || P.correction) { afficherSiOuvert(); return; }
  // Les deux ont répondu : la correction 2 s, puis la question suivante (ou le résultat).
  P.correction = true; afficherSiOuvert();
  setTimeout(() => {
    if (J.p !== P || P.etat !== 'en cours') return;
    P.correction = false; P.k++; P.debutK = Date.now();
    if (P.k < N_Q) { afficherSiOuvert(); return; }
    const score = l => l.reduce((s, x, k) => s + (x?.r === P.qs[k].bonne ? 1 : 0), 0), temps = l => l.reduce((s, x, k) => s + (x?.r === P.qs[k].bonne ? x.ms : 0), 0);
    const a = score(P.moi), b = score(P.luiR);
    gagnant(a > b || (a === b && a > 0 && temps(P.moi) < temps(P.luiR)), a === b && (a === 0 || temps(P.moi) === temps(P.luiR)));
  }, 2000);
}

// ---------- Les cauris (trois en ligne) ----------
const LIGNES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const moiN = () => (J.p.hote ? 1 : 2);
function caurisJouer(c) {
  const P = J.p; if (!P || P.jeu !== 'cauris' || P.etat !== 'en cours' || P.tour !== moiN() || P.g[c]) return;
  P.g[c] = moiN(); P.tour = 3 - moiN(); P.tourT = Date.now(); envoyer({ vj: 'c', c }); son('piece'); caurisFin();
}
function caurisCoupLui(c) { const P = J.p, n = 3 - moiN(); if (c < 0 || c > 8 || P.tour !== n || P.g[c]) return; P.g[c] = n; P.tour = moiN(); P.tourT = Date.now(); caurisFin(); }
function caurisFin() {
  const P = J.p, l = LIGNES.find(([a, b, c]) => P.g[a] && P.g[a] === P.g[b] && P.g[a] === P.g[c]);
  if (l) { P.ligne = l; gagnant(P.g[l[0]] === moiN()); return; }
  if (P.g.every(Boolean)) { gagnant(false, true); return; }
  afficherSiOuvert();
}

// ---------- La visite des stands (ex-« course au passeport ») ----------
/** village.js : on entre dans l'espace k. Rend vrai si la course l'a compté. */
export function espaceCourse(k) {
  const P = J.p; if (!P || P.jeu !== 'course' || P.etat !== 'en cours' || Date.now() < P.depart || P.faits.has(k)) return false;
  P.faits.add(k); const n = P.faits.size; son('piece');
  envoyer({ vj: 't', n });
  J.ctx.annonce(`Stands : ${n}/${ESPACES.length} · ${ESPACES[k].nom} · ${P.nomLui} en a ${P.nLui}`, 2200);
  if (n === ESPACES.length) gagnant(true);
  return true;
}
function courseLui(n) {
  const P = J.p; P.nLui = Math.max(P.nLui, n);
  if (P.nLui >= ESPACES.length) gagnant(false);
  else if (P.nLui % 3 === 0) J.ctx.annonce(`${P.nomLui} a visité ${P.nLui} stands, toi ${P.faits.size}`, 1800);
}

// ---------- La fenêtre de la partie ----------
const ouverte = () => !$('#vieFiche')?.hidden && !!$('#vfContenu .vj');
const afficherSiOuvert = () => { if (ouverte()) afficher(); };
export function afficher() {
  const P = J.p, el = $('#vieFiche'); if (!el) return;
  if (!P) { fermerFiche(); return; }
  if (!ouverte()) fermerFiche();
  let corps = '';
  const fin = P.resultat ? `<p class="vj-fin ${P.resultat}">${P.resultat === 'gagne' ? `🏆 Tu as battu ${esc(P.nomLui)} !` : P.resultat === 'perdu' ? `${esc(P.nomLui)} a gagné cette fois.` : P.resultat === 'nul' ? 'Match nul !' : esc(P.motif || `${P.nomLui} est parti : tu gagnes par forfait.`)}</p>` : '';
  const regle = P.etat === 'fini' ? '' : `<p class="vj-regle">${P.etat === 'attente' ? esc(SOUS[P.jeu]) : esc(REGLE[P.jeu])}</p>`;
  if (P.etat === 'attente') corps = `<p class="vf-intro">En attente de la réponse de ${esc(P.nomLui)}…</p>`;
  else if (P.jeu === 'quiz') {
    const k = Math.min(P.k, N_Q - 1), Q = P.qs[k], a = P.moi[k], b = P.luiR[k], voir = P.correction || P.etat === 'fini';
    const pts = l => l.reduce((s, x, i) => s + (x?.r === P.qs[i].bonne ? 1 : 0), 0);
    corps = `<p class="vj-score"><span>Toi <b>${pts(P.moi)}</b></span><small>Question ${k + 1}/${N_Q}${!a && P.etat === 'en cours' ? ` · <b id="vjTemps"></b>` : ''}</small><span>${esc(P.nomLui)} <b>${pts(P.luiR)}</b></span></p>
      <p class="vj-question">${esc(Q.q)}</p><div class="vj-choix">${Q.opts.map((o, i) => `<button type="button" data-r="${i}" class="${voir && i === Q.bonne ? 'bonne' : ''} ${a?.r === i ? 'moi' : ''}" ${a || P.etat !== 'en cours' ? 'disabled' : ''}>${esc(o)}${voir && b?.r === i ? ` <small>· ${esc(P.nomLui)}</small>` : ''}</button>`).join('')}</div>
      ${a && !b && P.etat === 'en cours' ? `<p class="vj-attente">${esc(P.nomLui)} réfléchit…</p>` : ''}`;
  } else if (P.jeu === 'cauris') {
    const mon = P.tour === moiN() && P.etat === 'en cours';
    corps = `<p class="vj-score"><span>Toi <b>${P.hote ? '🐚' : '🌰'}</b></span><small>${P.etat !== 'en cours' ? '' : mon ? 'À toi de jouer<b id="vjTemps"></b>' : `${esc(P.nomLui)} joue…`}</small><span>${esc(P.nomLui)} <b>${P.hote ? '🌰' : '🐚'}</b></span></p>
      <div class="vj-grille">${P.g.map((v, i) => `<button type="button" data-c="${i}" class="${P.ligne?.includes(i) ? 'ligne' : ''}" ${!mon || v ? 'disabled' : ''} aria-label="Case ${i + 1}">${v === 1 ? '🐚' : v === 2 ? '🌰' : ''}</button>`).join('')}</div>`;
  } else if (P.jeu === 'course') {
    const reste = P.depart + DUREE_VISITE - Date.now();
    corps = `<p class="vj-score"><span>Toi <b>${P.faits.size}/${ESPACES.length}</b></span><small>stands${P.etat === 'en cours' ? ` · <b id="vjTemps">${mmss(Math.min(reste, DUREE_VISITE))}</b>` : ''}</small><span>${esc(P.nomLui)} <b>${P.nLui}/${ESPACES.length}</b></span></p>
      <p class="vf-intro">Les stands qui te manquent : ${ESPACES.filter((E, k) => !P.faits.has(k)).map(E => esc(E.nom)).join(', ') || 'aucun'}.</p>`;
  }
  const boutons = P.etat === 'fini' ? `<button type="button" class="vf-ouvrir" id="vjRejouer">Rejouer contre ${esc(P.nomLui)}</button>` : `<button type="button" class="vf-bouton" id="vjQuitter" data-prudent>${P.etat === 'attente' ? 'Annuler' : 'Abandonner'}</button>`;
  $('#vfContenu').innerHTML = `<div class="vj"><small class="vf-sur">Jouer à deux au Village</small><h3 id="vfTitre">${esc(NOMS[P.jeu])}</h3>${regle}${fin}${corps}<div class="vf-pied"><span>Contre ${esc(P.nomLui)}</span>${boutons}</div></div>`;
  el.hidden = false;
  for (const b of document.querySelectorAll('#vfContenu [data-r]')) b.addEventListener('click', () => quizRepondre(+b.dataset.r));
  for (const b of document.querySelectorAll('#vfContenu [data-c]')) b.addEventListener('click', () => caurisJouer(+b.dataset.c));
  $('#vjQuitter')?.addEventListener('click', abandonner);
  $('#vjRejouer')?.addEventListener('click', () => { const { jeu, lui, nomLui } = P; J.p = null; proposer(jeu, { id: lui, nom: nomLui }); });
}
