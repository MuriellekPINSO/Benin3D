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
//  - la course au passeport : les deux partent du portique d'entrée, le premier qui a les onze tampons gagne ;
//  - l'adji, qui existait déjà (adji.js).
// Tout passe par la discussion de la ville (salon.js) : des messages marqués `vj`, adressés à un joueur (`pour`), que la
// discussion n'affiche pas. Rien à changer dans les règles de Firebase. Le gagnant le dit à toute la ville.

const NOMS = { quiz: 'Le duel du savoir', cauris: 'Les cauris', course: 'La course au passeport' };
const SOUS = {
  quiz: 'Cinq questions sur Cotonou et le Village : le plus juste gagne, puis le plus rapide',
  cauris: 'Aligne trois cauris avant l’autre, chacun son tour',
  course: 'Départ du portique : le premier qui a les onze tampons gagne',
};
const ATTENTE = 30000, N_Q = 5, DUREE_Q = 15000;
const J = { ctx: { ligne: () => { }, envoyer: () => { }, direATous: () => { }, moi: () => '', nom: () => '', autres: () => [], position: () => null, aPied: () => true, poser: () => { }, annonce: () => { } }, p: null };
if (import.meta.env.DEV) window.__villageJeux = J; // pour les tests
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const nettoyer = n => filtrer(String(n ?? '').replace(/\s+/g, ' ').trim().slice(0, 16)) || 'Un joueur';
const envoyer = m => J.ctx.envoyer({ ...m, id: J.p?.id, pour: J.p?.lui });

export function initJeuxVillage(ctx) { Object.assign(J.ctx, ctx); }
export const partieEnCours = () => !!J.p && J.p.etat !== 'fini';

// ---------- Le hasard partagé : les deux joueurs tirent les mêmes questions avec la même graine ----------
function hasard(graine) { let a = graine >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const melanger = (l, r) => { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Les questions du Village, d'après le plan de ses organisateurs (village-plan.js), et celles des quartiers (jeu.js).
const QUESTIONS_VILLAGE = [
  ['Combien d’espaces compte le Village de l’innovation ?', ['11', '8', '15'], 0],
  ['Où se tient le Village de l’innovation ?', ['Sur l’esplanade du Palais des Congrès', 'Place de l’Amazone', 'Au stade de l’Amitié'], 0],
  ['Dans quel espace du Village trouve-t-on des bornes d’arcade ?', ['L’Arcade', 'Le Musée', 'Le Jardin'], 0],
  ['Dans quel espace du Village voit-on des imprimantes 3D ?', ['L’Atelier', 'Le Marché', 'Le Centre de santé'], 0],
  ['À quelle zone du Village appartient la Place du citoyen ?', ['Civique', 'Bien-vivre', 'Créer & innover'], 0],
  ['Quel espace du Village porte le nom du lieu où l’on se réunit pour discuter ?', ['L’Arbre à palabre', 'La Radio', 'La Fabrique des talents'], 0],
];
function questions(graine) {
  const r = hasard(graine), toutes = [...QUESTIONS_VILLAGE, ...Object.values(QUIZ).flat()];
  return melanger(toutes, r).slice(0, N_Q).map(([q, opts, bonne]) => { const ordre = melanger(opts.map((o, i) => i), r); return { q, opts: ordre.map(i => opts[i]), bonne: ordre.indexOf(bonne) }; });
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
  if (partieEnCours()) opts.push({ texte: `Reprendre : ${NOMS[J.p.jeu]}`, sous: `Contre ${J.p.nomLui}`, f: afficher });
  for (const jeu of Object.keys(NOMS)) opts.push({ texte: NOMS[jeu], sous: SOUS[jeu], desactive: partieEnCours(), f: () => inviter(jeu) });
  opts.push({ texte: 'L’adji', sous: 'L’awalé du Bénin : défie un joueur de la ville, ou Tonton Codjo', f: () => { fermerFiche(); ouvrirAdji(); } });
  choisir('Jouer à deux au Village', opts, { annuler: 'Fermer' });
}
function inviter(jeu) {
  const gens = adversaires(jeu);
  if (!gens.length) {
    J.ctx.ligne(jeu === 'course' ? 'Pour la course, il faut un autre joueur dans le Village : invite un ami (« Inviter ») ou attends qu’un visiteur arrive.' : 'Personne d’autre n’est en ville pour l’instant : invite un ami (« Inviter »), il arrive juste à côté de toi.');
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
function accepter(m, nom) {
  if (partieEnCours()) return;
  if (m.jeu === 'course' && !J.ctx.aPied()) { J.ctx.ligne('Pour la course, descends d’abord de ton véhicule.'); J.ctx.envoyer({ vj: 'non', id: m.id, pour: m.u }); return; }
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
/** Les messages `vj` de la discussion (salon.js) : jamais affichés. */
export function surMessageJeu(m) {
  const moi = J.ctx.moi();
  if (!moi || m.u === moi || m.pour !== moi) return;
  if (typeof m.t === 'number' && Date.now() - m.t > ATTENTE) return; // l'historique de la discussion, à l'arrivée
  const nom = nettoyer(m.n);
  if (m.vj === 'inv') {
    if (!NOMS[m.jeu]) return;
    if (partieEnCours()) { J.ctx.envoyer({ vj: 'occupe', id: m.id, pour: m.u }); return; }
    son('piece'); J.ctx.ligne(`🎮 ${nom} te propose « ${NOMS[m.jeu]} ».`);
    choisir(`${nom} te défie : ${NOMS[m.jeu]}`, [{ texte: 'Accepter', sous: SOUS[m.jeu], f: () => accepter(m, nom) }], { annuler: 'Refuser', puis: () => J.ctx.envoyer({ vj: 'non', id: m.id, pour: m.u }) });
    return;
  }
  const P = J.p; if (!P || P.id !== m.id || m.u !== P.lui) return;
  if (m.vj === 'oui' && P.etat === 'attente' && P.hote) { clearTimeout(P.minuterie); commencer(); return; }
  if ((m.vj === 'non' || m.vj === 'occupe') && P.etat === 'attente') { J.ctx.ligne(m.vj === 'occupe' ? `${P.nomLui} joue déjà une partie.` : `${P.nomLui} a refusé.`); terminer(); J.p = null; afficherSiOuvert(); return; }
  if (m.vj === 'fin' && P.etat !== 'fini') { J.ctx.ligne(`${P.nomLui} a quitté la partie : tu gagnes par forfait.`); terminer(); P.resultat = 'forfait'; afficherSiOuvert(); return; }
  if (P.etat !== 'en cours') return;
  if (P.jeu === 'quiz' && m.vj === 'q') quizReponseLui(m);
  if (P.jeu === 'cauris' && m.vj === 'c') caurisCoupLui(m.c | 0);
  if (P.jeu === 'course' && m.vj === 't') courseLui(m.n | 0);
}
function commencer() {
  const P = J.p; P.etat = 'en cours'; son('piece');
  if (P.jeu === 'quiz') { P.qs = questions(P.graine); P.k = 0; P.moi = []; P.luiR = []; P.debutK = Date.now(); P.tic = setInterval(quizTic, 250); }
  if (P.jeu === 'cauris') { P.g = Array(9).fill(0); P.tour = 1; }
  if (P.jeu === 'course') {
    // Les deux au portique d'entrée, tournés vers le Village ; trois secondes, puis le chrono.
    const [x, z, cap] = ENTREE_VILLAGE; J.ctx.poser(x + (P.hote ? -1.2 : 1.2), z, cap);
    P.faits = new Set(); P.nLui = 0; P.depart = Date.now() + 3000;
    [3, 2, 1].forEach((n, i) => setTimeout(() => { if (J.p === P && P.etat === 'en cours') J.ctx.annonce(`${n}…`, 900); }, i * 1000));
    setTimeout(() => { if (J.p === P && P.etat === 'en cours') { J.ctx.annonce('Partez ! Onze tampons, le plus vite possible.', 2500); son('piece'); } }, 3000);
    fermerFiche(); J.ctx.ligne(`🏁 Course au passeport contre ${P.nomLui} : départ dans 3 secondes, au portique d’entrée !`);
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
  P.g[c] = moiN(); P.tour = 3 - moiN(); envoyer({ vj: 'c', c }); son('piece'); caurisFin();
}
function caurisCoupLui(c) { const P = J.p, n = 3 - moiN(); if (c < 0 || c > 8 || P.tour !== n || P.g[c]) return; P.g[c] = n; P.tour = moiN(); caurisFin(); }
function caurisFin() {
  const P = J.p, l = LIGNES.find(([a, b, c]) => P.g[a] && P.g[a] === P.g[b] && P.g[a] === P.g[c]);
  if (l) { P.ligne = l; gagnant(P.g[l[0]] === moiN()); return; }
  if (P.g.every(Boolean)) { gagnant(false, true); return; }
  afficherSiOuvert();
}

// ---------- La course au passeport ----------
/** village.js : on entre dans l'espace k. Rend vrai si la course l'a compté. */
export function espaceCourse(k) {
  const P = J.p; if (!P || P.jeu !== 'course' || P.etat !== 'en cours' || Date.now() < P.depart || P.faits.has(k)) return false;
  P.faits.add(k); const n = P.faits.size; son('piece');
  envoyer({ vj: 't', n });
  J.ctx.annonce(`Course : ${n}/${ESPACES.length} · ${ESPACES[k].nom} · ${P.nomLui} en a ${P.nLui}`, 2200);
  if (n === ESPACES.length) gagnant(true);
  return true;
}
function courseLui(n) {
  const P = J.p; P.nLui = Math.max(P.nLui, n);
  if (P.nLui >= ESPACES.length) gagnant(false);
  else if (P.nLui % 3 === 0) J.ctx.annonce(`${P.nomLui} a ${P.nLui} tampons, toi ${P.faits.size}`, 1800);
}

// ---------- La fenêtre de la partie ----------
const ouverte = () => !$('#vieFiche')?.hidden && !!$('#vfContenu .vj');
const afficherSiOuvert = () => { if (ouverte()) afficher(); };
export function afficher() {
  const P = J.p, el = $('#vieFiche'); if (!el) return;
  if (!P) { fermerFiche(); return; }
  if (!ouverte()) fermerFiche();
  let corps = '';
  const fin = P.resultat ? `<p class="vj-fin ${P.resultat}">${P.resultat === 'gagne' ? `🏆 Tu as battu ${esc(P.nomLui)} !` : P.resultat === 'perdu' ? `${esc(P.nomLui)} a gagné cette fois.` : P.resultat === 'nul' ? 'Match nul !' : `${esc(P.nomLui)} est parti : tu gagnes par forfait.`}</p>` : '';
  if (P.etat === 'attente') corps = `<p class="vf-intro">En attente de la réponse de ${esc(P.nomLui)}…</p>`;
  else if (P.jeu === 'quiz') {
    const k = Math.min(P.k, N_Q - 1), Q = P.qs[k], a = P.moi[k], b = P.luiR[k], voir = P.correction || P.etat === 'fini';
    const pts = l => l.reduce((s, x, i) => s + (x?.r === P.qs[i].bonne ? 1 : 0), 0);
    corps = `<p class="vj-score"><span>Toi <b>${pts(P.moi)}</b></span><small>Question ${k + 1}/${N_Q}${!a && P.etat === 'en cours' ? ` · <b id="vjTemps"></b>` : ''}</small><span>${esc(P.nomLui)} <b>${pts(P.luiR)}</b></span></p>
      <p class="vj-question">${esc(Q.q)}</p><div class="vj-choix">${Q.opts.map((o, i) => `<button type="button" data-r="${i}" class="${voir && i === Q.bonne ? 'bonne' : ''} ${a?.r === i ? 'moi' : ''}" ${a || P.etat !== 'en cours' ? 'disabled' : ''}>${esc(o)}${voir && b?.r === i ? ` <small>· ${esc(P.nomLui)}</small>` : ''}</button>`).join('')}</div>
      ${a && !b && P.etat === 'en cours' ? `<p class="vj-attente">${esc(P.nomLui)} réfléchit…</p>` : ''}`;
  } else if (P.jeu === 'cauris') {
    const mon = P.tour === moiN() && P.etat === 'en cours';
    corps = `<p class="vj-score"><span>Toi <b>${P.hote ? '🐚' : '🌰'}</b></span><small>${P.etat !== 'en cours' ? '' : mon ? 'À toi de jouer' : `${esc(P.nomLui)} joue…`}</small><span>${esc(P.nomLui)} <b>${P.hote ? '🌰' : '🐚'}</b></span></p>
      <div class="vj-grille">${P.g.map((v, i) => `<button type="button" data-c="${i}" class="${P.ligne?.includes(i) ? 'ligne' : ''}" ${!mon || v ? 'disabled' : ''} aria-label="Case ${i + 1}">${v === 1 ? '🐚' : v === 2 ? '🌰' : ''}</button>`).join('')}</div>`;
  } else if (P.jeu === 'course') {
    corps = `<p class="vj-score"><span>Toi <b>${P.faits.size}/${ESPACES.length}</b></span><small>tampons</small><span>${esc(P.nomLui)} <b>${P.nLui}/${ESPACES.length}</b></span></p>
      <p class="vf-intro">Les espaces qui te manquent : ${ESPACES.filter((E, k) => !P.faits.has(k)).map(E => esc(E.nom)).join(', ') || 'aucun'}.</p>`;
  }
  const boutons = P.etat === 'fini' ? `<button type="button" class="vf-ouvrir" id="vjRejouer">Rejouer contre ${esc(P.nomLui)}</button>` : `<button type="button" class="vf-bouton" id="vjQuitter">${P.etat === 'attente' ? 'Annuler' : 'Abandonner'}</button>`;
  $('#vfContenu').innerHTML = `<div class="vj"><small class="vf-sur">Jouer à deux au Village</small><h3 id="vfTitre">${esc(NOMS[P.jeu])}</h3>${fin}${corps}<div class="vf-pied"><span>Contre ${esc(P.nomLui)}</span>${boutons}</div></div>`;
  el.hidden = false;
  for (const b of document.querySelectorAll('#vfContenu [data-r]')) b.addEventListener('click', () => quizRepondre(+b.dataset.r));
  for (const b of document.querySelectorAll('#vfContenu [data-c]')) b.addEventListener('click', () => caurisJouer(+b.dataset.c));
  $('#vjQuitter')?.addEventListener('click', abandonner);
  $('#vjRejouer')?.addEventListener('click', () => { const { jeu, lui, nomLui } = P; J.p = null; proposer(jeu, { id: lui, nom: nomLui }); });
}
