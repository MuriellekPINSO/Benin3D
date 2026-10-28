// ---------- Le Faux Frère : les règles, les mots, le tirage ----------
// Partagé par l'arbitre (faux-frere-arbitre.js), qui tourne sur le serveur (api/faux-frere.js) et, en mode test
// (?salon-local), dans la page : les deux font tourner le même code. Le jeu lui-même (fauxfrere.js) n'y prend que les
// constantes, les thèmes et de quoi afficher.
//
// Les règles de Murielle (28/10). Tout le monde reçoit un mot secret : les frères ont tous le même, le faux frère (un,
// deux à partir de 8 joueurs) a un mot proche et ne sait pas qu'il est différent, l'Ignorant (à partir de 6 joueurs, une
// fois sur deux) n'en a pas. Personne ne sait dans quel camp il est, ni combien d'imposteurs se cachent.
// Une manche : chacun à son tour donne un seul mot d'indice (ordre retiré à chaque manche, l'Ignorant ne parle jamais en
// premier) ; puis la discussion et le vote, sans minuteur : chacun valide sa cible quand il est sûr, c'est définitif.
// Quand tout le monde a validé, on révèle qui a voté pour qui, et le plus de voix quitte la table, son rôle révélé.
// Égalité : les ex aequo donnent un indice de plus, puis on revote entre eux ; encore égalité, personne ne part.
// L'Ignorant éliminé a 20 s pour deviner le mot des frères : s'il le trouve, il gagne seul. Les frères gagnent quand tous
// les imposteurs sont partis ; les imposteurs, quand ils sont aussi nombreux que les frères encore en jeu.
// Filets : à 1 ou 2 votes près, 60 s pour les retardataires (puis abstention) ; 10 min de discussion au plus ; un joueur
// sans nouvelles depuis 25 s voit son tour d'indice passer, au bout d'une minute il est retiré (rôle révélé).
//
// L'état d'une partie (J) : ce que tout le monde voit, plus `J.s`, le secret (rôles, mots, votes pas encore révélés, la
// suite décidée), que seul l'arbitre lit ; publique(J) est ce qu'il en montre. Les heures sont celles du serveur.
import { grossier } from './moderation.js';

export const MIN_JOUEURS = 4, MAX_JOUEURS = 10, MANCHES_MAX = 8; // au-delà de 8 manches sans vainqueur, les imposteurs ont tenu
export const DUREES = [20, 30, 45], DUREE = 30; // un tour d'indice, en secondes (réglage de l'hôte)
// LECTURE : on découvre son mot ; ABSENT : sans nouvelles depuis 25 s, son tour passe ; PARTI : au bout d'une minute, retiré ;
// ATTENTE : le compte à rebours des derniers votes ; PLAFOND : la discussion la plus longue ; DEVINE : l'Ignorant cherche
// le mot ; RESULTAT : les votes et le rôle de l'éliminé ; FIN_CHAT : le chat de partie reste dans le récapitulatif, puis
// le serveur l'efface ; BATTEMENT : chaque joueur dit qu'il est là.
export const LECTURE = 10e3, ABSENT = 25e3, PARTI = 60e3, ATTENTE = 60e3, PLAFOND = 10 * 60e3, DEVINE = 20e3, RESULTAT = 8e3, FIN_CHAT = 5 * 60e3, BATTEMENT = 15e3;
export const XP_PARTIE = 10, XP_VICTOIRE = 15; // une partie jouée jusqu'au bout ; en plus pour le camp gagnant

// ---------- Les mots ----------
// L'hôte choisit un thème : il n'apprend rien sur les rôles, et évite les paires que personne ne connaît.
export const THEMES = { tous: 'Tous les thèmes', cuisine: 'Cuisine', boissons: 'Boissons', lieux: 'Lieux', transports: 'Transports', nature: 'Nature et animaux', vie: 'Vie de tous les jours' };
// Deux mots proches par paire ; le serveur tire la paire et son sens (quel mot aux frères, lequel au faux frère).
export const PAIRES = {
  cuisine: [
    ['Amiwo', 'Akassa'], ['Gari', 'Tapioca'], ['Igname pilée', 'Pâte rouge'], ['Moyo', 'Piment'], ['Klui-klui', 'Arachide'],
    ['Ablo', 'Beignet'], ['Atassi', 'Riz au gras'], ['Wagashi', 'Fromage'], ['Manioc', 'Igname'], ['Poisson braisé', 'Poulet bicyclette'],
    ['Tchatchanga', 'Soya'], ['Gboma', 'Épinards'], ['Crincrin', 'Gombo'], ['Wassa-wassa', 'Couscous'], ['Huile rouge', 'Huile d’arachide'],
    ['Arachide', 'Noix de cajou'],
  ],
  boissons: [
    ['Sodabi', 'Tchoukoutou'], ['Bissap', 'Gingembre'], ['Vin de palme', 'Bière'], ['Kinkéliba', 'Citronnelle'], ['Akpan', 'Yaourt'],
    ['Sucrerie', 'Jus de fruit'], ['Café', 'Thé'], ['Eau de coco', 'Jus d’ananas'], ['Eau en sachet', 'Eau minérale'],
  ],
  lieux: [
    ['Dantokpa', 'Missèbo'], ['Ganvié', 'Ouidah'], ['Cotonou', 'Porto-Novo'], ['Calavi', 'Godomey'], ['Grand-Popo', 'Ouidah'],
    ['Fidjrossè', 'Plage'], ['Bénin', 'Togo'], ['Marché', 'Supermarché'], ['Maquis', 'Buvette'], ['Lagune', 'Lac'],
    ['Abomey', 'Bohicon'], ['Akpakpa', 'Cadjèhoun'],
  ],
  transports: [
    ['Zém', 'Taxi'], ['Moto', 'Vélo'], ['Pirogue', 'Barque'], ['Taxi-brousse', 'Bus'], ['Tokpa-tokpa', 'Minibus'],
    ['Kpayo', 'Essence'], ['Voiture', 'Camion'], ['Casque', 'Gilet'], ['Feu rouge', 'Rond-point'], ['Vulcanisateur', 'Mécanicien'],
  ],
  nature: [
    ['Agouti', 'Lapin'], ['Hippopotame', 'Éléphant'], ['Lion', 'Panthère'], ['Mangue', 'Papaye'], ['Ananas', 'Orange'],
    ['Noix de coco', 'Banane'], ['Cocotier', 'Palmier'], ['Margouillat', 'Lézard'], ['Baobab', 'Fromager'], ['Pintade', 'Poule'],
    ['Crabe', 'Crevette'], ['Mouton', 'Chèvre'],
  ],
  vie: [
    ['Pagne', 'Bazin'], ['Tam-tam', 'Djembé'], ['Égoungoun', 'Zangbéto'], ['Tontine', 'Banque'], ['Fon', 'Yoruba'],
    ['Mobile Money', 'Espèces'], ['Tresses', 'Perruque'], ['Mariage', 'Baptême'], ['Football', 'Handball'], ['Tailleur', 'Cordonnier'],
    ['Ventilateur', 'Climatiseur'],
  ],
};
// D'autres façons d'écrire ou de dire le même mot : un indice qui s'en approche est refusé comme le mot lui-même. On n'a
// mis que les noms dont on est sûr (mieux vaut peu et juste) ; À COMPLÉTER ET À VÉRIFIER PAR DES BÉNINOIS, surtout les
// noms en fon et en goun. Les accents et les lettres ɔ ɛ ɖ ŋ ƒ ʋ n'y comptent pas (normaliser).
export const VARIANTES = {
  'Zém': ['Zémidjan', 'Zémi'], 'Dantokpa': ['Tokpa'], 'Klui-klui': ['Kuli-kuli'], 'Soya': ['Suya'], 'Tchatchanga': ['Chachanga'],
  'Amiwo': ['Pâte rouge'], 'Pâte rouge': ['Amiwo'], 'Wagashi': ['Waagashi', 'Wangashi'], 'Gari': ['Garri'], 'Tchoukoutou': ['Choukoutou'],
  'Kinkéliba': ['Kinkiliba'], 'Djembé': ['Jembé'], 'Égoungoun': ['Égoun', 'Egungun', 'Kouvito'], 'Huile rouge': ['Huile de palme'],
  'Noix de cajou': ['Anacarde'], 'Agouti': ['Aulacode'], 'Fromager': ['Kapokier'], 'Mobile Money': ['MoMo'],
  'Cotonou': ['Kutɔnu', 'Kutonou'], 'Porto-Novo': ['Hogbonou', 'Xɔgbonu', 'Adjatchè'], 'Ouidah': ['Glexwe', 'Gléhoué'],
  'Calavi': ['Abomey-Calavi'], 'Bénin': ['Dahomey'],
};
const toutes = () => Object.values(PAIRES).flat();
/** La paire, dans un sens comme dans l'autre (pour ne pas la rejouer tout de suite dans le même salon). */
export const cleDe = p => [...p].sort().join('|');

// ---------- Le mot secret, même mal orthographié ----------
const FON = { 'ɔ': 'o', 'ɛ': 'e', 'ɖ': 'd', 'ŋ': 'n', 'ƒ': 'f', 'ʋ': 'v', 'œ': 'oe', 'æ': 'ae', 'ß': 'ss' };
/** Un mot ramené à ses lettres : sans accents ni tons (fon, goun), en minuscules, ɔ ɛ ɖ ŋ ƒ ʋ devenus o e d n f v ; ni espace ni tiret. */
export const normaliser = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[ɔɛɖŋƒʋœæß]/g, c => FON[c]).replace(/[^a-z0-9]/g, '');
const VIDES = new Set(['les', 'des', 'aux', 'une', 'pour', 'avec', 'sur']);
/** Les morceaux d'un mot de plusieurs mots (« Poisson braisé » : poisson, braise), sans les petits mots. */
const morceaux = s => String(s || '').split(/[\s'’-]+/).map(normaliser).filter(m => m.length >= 3 && !VIDES.has(m));
/** Distance de Damerau-Levenshtein (lettres ajoutées, enlevées, changées, ou deux voisines inversées). */
export function distance(a, b) {
  const n = a.length, m = b.length; if (!n || !m) return n + m;
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i ? (j ? 0 : i) : j)));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[n][m];
}
const fautes = n => (n >= 7 ? 2 : n >= 4 ? 1 : 0); // les fautes permises, selon la longueur du mot secret
const singulier = s => (s.length > 3 ? s.replace(/[sx]$/, '') : s);
/** `a` (déjà normalisé) est-il le mot `f` : le même, au pluriel près, ou à une ou deux fautes près ? */
const pareil = (a, f) => a === f || singulier(a) === singulier(f) || distance(a, f) <= fautes(f.length);
/** Ce qu'un indice ne peut pas approcher : le mot entier, chacun de ses morceaux, ses autres noms. */
const formes = mot => [...new Set([normaliser(mot), ...morceaux(mot), ...(VARIANTES[mot] || []).map(normaliser)])].filter(Boolean);

/**
 * Pourquoi l'indice est refusé : 'un-mot' (un seul mot, 2 à 24 lettres), 'grossier', 'mot-secret' ; '' s'il est bon.
 * `mot` : le mot secret de CELUI QUI LE DONNE ('' pour l'Ignorant), jamais celui des autres : un refus apprendrait sinon au
 * faux frère que son mot n'est pas celui des frères, et à l'Ignorant le mot des frères. Le mot est refusé même mal écrit,
 * sans accents, au pluriel, contenu dans l'indice (ou l'indice dans le mot, à partir de 4 lettres), ou sous un autre nom.
 */
export function indiceRefuse(indice, mot) {
  const i = String(indice || '').trim(), a = normaliser(i);
  if (!/^[\p{L}\p{N}][\p{L}\p{N}'’-]{1,23}$/u.test(i) || a.length < 2) return 'un-mot';
  if (grossier(i)) return 'grossier';
  for (const f of formes(mot)) if (pareil(a, f) || (f.length >= 4 && a.includes(f)) || (a.length >= 4 && f.includes(a))) return 'mot-secret';
  return '';
}
/** L'Ignorant a-t-il trouvé le mot des frères ? Au pluriel, aux accents et à une ou deux fautes près, ou sous un autre nom. */
export function motDevine(proposition, mot) {
  const a = normaliser(proposition); if (a.length < 2 || !mot) return false;
  return [normaliser(mot), ...(VARIANTES[mot] || []).map(normaliser)].some(f => pareil(a, f));
}

// ---------- Le tirage ----------
/** Un entier de 0 à n − 1, tiré par Web Crypto (navigateur, Node 18 et plus), sans biais. */
export function hasard(n) {
  const lim = Math.floor(0x100000000 / n) * n, b = new Uint32Array(1);
  do crypto.getRandomValues(b); while (b[0] >= lim);
  return b[0] % n;
}
export const melanger = (l, alea = hasard) => { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { const j = alea(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
/** La composition, cachée à tous : un faux frère jusqu'à 7 joueurs, deux à partir de 8 ; l'Ignorant, une fois sur deux à partir de 6. */
export const composition = (n, alea = hasard) => ({ faux: n >= 8 ? 2 : 1, ignorant: n >= 6 && alea(2) === 1 });
/** L'ordre de parole : le premier tiré parmi ceux qui ne sont pas l'Ignorant, les autres mélangés. */
export function tirerOrdre(joueurs, roles, alea = hasard) {
  const premiers = joueurs.filter(u => roles[u] !== 'ignorant'); if (!premiers.length) return melanger(joueurs, alea);
  const p = premiers[alea(premiers.length)];
  return [p, ...melanger(joueurs.filter(u => u !== p), alea)];
}
/** [mot des frères, mot du faux frère] : une paire du thème pas jouée récemment dans ce salon, dans un sens ou dans l'autre. */
export function tirerPaire(theme, deja = [], alea = hasard) {
  const l = PAIRES[theme] || toutes(), libres = l.filter(p => !deja.includes(cleDe(p))), choix = libres.length ? libres : l, p = choix[alea(choix.length)];
  return alea(2) ? [p[1], p[0]] : [p[0], p[1]];
}

// ---------- La partie ----------
/** Une nouvelle partie : composition, rôles, paire de mots, tout tiré ici. `joueurs` : les identifiants, dans l'ordre d'arrivée. */
export function nouvellePartie({ joueurs, noms = {}, duree = DUREE, theme = 'tous', n = 1, deja = [] }, now, alea = hasard) {
  const C = composition(joueurs.length, alea), roles = {};
  melanger(joueurs, alea).forEach((u, i) => { roles[u] = i < C.faux ? 'faux' : i === C.faux && C.ignorant ? 'ignorant' : 'frere'; });
  const t = theme in PAIRES ? theme : 'tous', paire = tirerPaire(t, deja, alea);
  const mots = Object.fromEntries(joueurs.map(u => [u, roles[u] === 'frere' ? paire[0] : roles[u] === 'faux' ? paire[1] : '']));
  return {
    n, debut: now, duree: DUREES.includes(duree) ? duree : DUREE, theme: t, phase: 'lecture', manche: 0, jusqua: now + LECTURE,
    ordre: [], tour: 0, passe: 'n', candidats: [], joueurs: [...joueurs], noms: { ...noms },
    vivants: Object.fromEntries(joueurs.map(u => [u, true])), morts: {}, ind: [], valides: {}, attente: 0, plafond: 0,
    votes: [], resultat: null, ignorant: null, gagnant: '', journal: [{ t: now, k: 'debut', a: joueurs.length }],
    s: { roles, mots, paire, votes: {}, suite: '', gagnant: '' },
  };
}
// La base ne garde ni listes vides, ni objets vides, ni null, et rend parfois une liste en objet : on remet tout en place.
const liste = x => (Array.isArray(x) ? x.filter(v => v != null) : x && typeof x === 'object' ? Object.keys(x).sort((a, b) => a - b).map(k => x[k]) : []);
export function reparer(J) {
  if (!J || typeof J !== 'object') return null;
  for (const k of ['ordre', 'candidats', 'joueurs', 'ind', 'votes', 'journal']) J[k] = liste(J[k]);
  for (const k of ['noms', 'vivants', 'morts', 'valides']) J[k] = J[k] || {};
  J.s = J.s || {}; for (const k of ['roles', 'mots', 'votes']) J.s[k] = J.s[k] || {}; J.s.paire = liste(J.s.paire); J.s.suite ||= ''; J.s.gagnant ||= '';
  for (const v of J.votes) { v.v = v.v || {}; v.a = liste(v.a); }
  if (J.resultat) { J.resultat.egalite = liste(J.resultat.egalite); J.resultat.voix ||= {}; }
  J.resultat ||= null; J.ignorant ||= null; J.gagnant ||= ''; J.attente ||= 0; J.plafond ||= 0; J.jusqua ||= 0; J.tour ||= 0; J.manche ||= 0;
  return J;
}
/** Ce que tout le monde voit : tout, sauf le secret. À la fin, les mots et les rôles de tous y sont (J.fin). */
export function publique(J) { if (!J) return null; const { s, ...P } = J; return P; }

export const vivants = J => J.joueurs.filter(u => J.vivants[u]);
export const orateur = J => (J.phase === 'indice' ? J.ordre[J.tour] || '' : '');
const roleDe = (J, u) => J.s.roles[u] || 'frere';
const noter = (J, t, k, plus = {}) => { J.journal.push({ t, k, ...plus }); };
/** Qui gagne, d'après ceux encore en jeu ('' : la partie continue). */
export function gagnantDe(J) {
  const v = vivants(J), imp = v.filter(u => roleDe(J, u) !== 'frere').length;
  return !imp ? 'freres' : imp >= v.length - imp ? 'imposteurs' : '';
}

function manche(J, m, t, alea) {
  Object.assign(J, { phase: 'indice', manche: m, passe: 'n', candidats: [], ordre: tirerOrdre(vivants(J), J.s.roles, alea), tour: 0, jusqua: t + J.duree * 1000, resultat: null, ignorant: J.ignorant?.fini ? J.ignorant : null });
  noter(J, t, 'manche', { a: m + 1 });
}
/** Au suivant : le prochain orateur encore en jeu, ou, la passe finie, la discussion et le vote. */
function suivant(J, t) {
  do J.tour++; while (J.tour < J.ordre.length && !J.vivants[J.ordre[J.tour]]);
  if (J.tour < J.ordre.length) { J.jusqua = t + J.duree * 1000; return; }
  Object.assign(J, { phase: 'vote', jusqua: 0, valides: {}, attente: 0, plafond: t + PLAFOND }); J.s.votes = {};
  noter(J, t, 'vote');
}
/** Un indice, déjà vérifié (indiceRefuse) : c'est au suivant. */
export function donnerIndice(J, u, m, t) {
  if (orateur(J) !== u) return 'pas-ton-tour';
  J.ind.push({ u, m: String(m).trim().slice(0, 24), r: J.manche, d: J.passe === 'd' }); suivant(J, t);
  return '';
}
/** Un vote, définitif. On ne vote ni pour soi, ni pour un éliminé ; au départage, seulement pour un ex aequo. */
export function voter(J, u, c, t) {
  if (J.phase !== 'vote') return 'pas-de-vote';
  if (!J.vivants[u]) return 'hors-jeu';
  if (J.valides[u]) return 'deja-vote';
  if (c === u || !J.vivants[c] || (J.candidats.length && !J.candidats.includes(c))) return 'cible-invalide';
  J.s.votes[u] = c; J.valides[u] = t; noter(J, t, 'valide', { u });
  return '';
}
/** Le dépouillement : on révèle qui a voté pour qui ; le plus de voix part, à égalité on départage, puis personne. */
function depouiller(J, t, abstentions = []) {
  const v = { ...J.s.votes }, voix = {}; for (const c of Object.values(v)) voix[c] = (voix[c] || 0) + 1;
  const max = Math.max(0, ...Object.values(voix)), tete = Object.keys(voix).filter(u => voix[u] === max);
  J.votes.push({ r: J.manche, d: J.passe === 'd', v, a: abstentions });
  for (const u of abstentions) noter(J, t, 'abstention', { u });
  Object.assign(J, { phase: 'resultat', jusqua: t + RESULTAT, valides: {}, attente: 0, plafond: 0 }); J.s.votes = {};
  if (max && tete.length === 1) {
    const u = tete[0], r = roleDe(J, u);
    delete J.vivants[u]; J.resultat = { u, r, voix, egalite: [] }; noter(J, t, 'elimine', { u, r });
    if (r === 'ignorant') { J.s.suite = 'ignorant'; return; } // il ne rejoint les éliminés qu'après avoir tenté sa chance
    J.morts[u] = { r, m: J.manche, c: 'vote' };
  } else if (max && J.passe === 'n') { J.resultat = { u: '', r: '', voix, egalite: tete }; J.s.suite = 'departage'; noter(J, t, 'egalite', { a: tete }); return; }
  else { J.resultat = { u: '', r: '', voix, egalite: max ? tete : [] }; noter(J, t, 'personne'); }
  J.s.gagnant = gagnantDe(J); J.s.suite = J.s.gagnant ? 'fin' : 'manche';
}
/** L'Ignorant a proposé `m` (ou rien, le temps écoulé). */
function resoudreIgnorant(J, m, t) {
  const u = J.ignorant.u, ok = !!m && motDevine(m, J.s.paire[0]);
  J.ignorant = { u, m: String(m || '').slice(0, 40), ok, fini: true }; J.morts[u] = { r: 'ignorant', m: J.manche, c: 'vote' };
  noter(J, t, 'devine', { u, a: J.ignorant.m, ok });
  J.s.gagnant = ok ? 'ignorant' : gagnantDe(J); J.s.suite = J.s.gagnant ? 'fin' : 'manche';
  Object.assign(J, { phase: 'resultat', jusqua: t + RESULTAT });
}
export function deviner(J, u, m, t) {
  if (J.phase !== 'ignorant' || J.ignorant?.u !== u || J.ignorant.fini) return 'pas-a-toi';
  const p = String(m || '').trim(); if (normaliser(p).length < 2 || p.length > 40) return 'un-mot';
  resoudreIgnorant(J, p, t); return '';
}
function finir(J, t) {
  J.gagnant = J.s.gagnant || gagnantDe(J) || 'imposteurs';
  Object.assign(J, { phase: 'fin', jusqua: 0, fin: { mots: J.s.mots, roles: J.s.roles, paire: J.s.paire } });
  noter(J, t, 'fin', { a: J.gagnant });
}
/** Après le résultat : le mot de l'Ignorant, le départage, la manche suivante ou la fin. */
function enchainer(J, t, alea) {
  const s = J.s.suite; J.s.suite = '';
  if (s === 'ignorant') { Object.assign(J, { phase: 'ignorant', jusqua: t + DEVINE, ignorant: { u: J.resultat.u, m: '', ok: false, fini: false } }); noter(J, t, 'ignorant', { u: J.resultat.u }); return; }
  if (s === 'fin') { finir(J, t); return; }
  const c = s === 'departage' ? (J.resultat?.egalite || []).filter(u => J.vivants[u]) : [];
  if (c.length >= 2) {
    Object.assign(J, { phase: 'indice', passe: 'd', candidats: c, ordre: tirerOrdre(c, J.s.roles, alea), tour: 0, jusqua: t + J.duree * 1000, resultat: null });
    noter(J, t, 'departage', { a: c }); return;
  }
  if (J.manche + 1 >= MANCHES_MAX) { J.s.gagnant = 'imposteurs'; finir(J, t); return; }
  manche(J, J.manche + 1, t, alea);
}
/**
 * Un joueur quitte la partie (`cause` : 'parti', ou 'absent' quand il a perdu le réseau) : son rôle est révélé comme pour
 * une élimination. Son tour d'indice passe, les votes pour lui sont à refaire, et on regarde si un camp a gagné — sauf
 * pendant que l'Ignorant cherche le mot (il garde sa chance). Rend vrai si la partie a changé.
 */
export function retirer(J, u, cause, t) {
  if (J.phase === 'fin') return false;
  const ign = J.ignorant && !J.ignorant.fini && J.ignorant.u === u, attendu = J.s.suite === 'ignorant' && J.resultat?.u === u;
  if (ign || attendu) { // l'Ignorant éliminé s'en va avant d'avoir proposé un mot
    if (attendu) { J.ignorant = { u, m: '', ok: false, fini: false }; J.s.suite = ''; }
    noter(J, t, cause === 'absent' ? 'retire' : 'parti', { u, r: 'ignorant' }); resoudreIgnorant(J, '', t); J.morts[u].c = cause; return true;
  }
  if (!J.vivants[u]) return false;
  const r = roleDe(J, u), parlait = orateur(J) === u;
  delete J.vivants[u]; J.morts[u] = { r, m: J.manche, c: cause }; noter(J, t, cause === 'absent' ? 'retire' : 'parti', { u, r });
  delete J.valides[u]; delete J.s.votes[u];
  for (const [v, c] of Object.entries(J.s.votes)) if (c === u) { delete J.s.votes[v]; delete J.valides[v]; noter(J, t, 'revote', { u: v }); }
  if (J.candidats.includes(u)) J.candidats = J.candidats.filter(x => x !== u);
  const departageVide = J.passe === 'd' && J.candidats.length < 2 && (J.phase === 'indice' || J.phase === 'vote');
  if (departageVide) { Object.assign(J, { phase: 'resultat', jusqua: t + RESULTAT, valides: {}, attente: 0, plafond: 0, resultat: { u: '', r: '', voix: {}, egalite: [] } }); J.s.votes = {}; J.s.suite = 'manche'; noter(J, t, 'personne'); }
  else if (parlait) suivant(J, t);
  if (J.phase !== 'ignorant' && J.s.suite !== 'ignorant') {
    const g = gagnantDe(J);
    if (g) { J.s.gagnant = g; J.s.suite = 'fin'; if (J.phase !== 'resultat') Object.assign(J, { phase: 'resultat', jusqua: t + RESULTAT, valides: {}, attente: 0, plafond: 0, resultat: { u, r, c: cause, voix: {}, egalite: [] } }); }
  }
  return true;
}
/** Un pas du temps : une échéance passée, un absent, la fin du vote. Rend vrai si la partie a changé. */
function pas(J, t, vus, alea) {
  if (J.phase === 'fin') return false;
  if (vus) for (const u of J.joueurs) if ((J.vivants[u] || (J.ignorant?.u === u && !J.ignorant.fini)) && t - (vus[u] || 0) > PARTI) return retirer(J, u, 'absent', t);
  if (J.phase === 'lecture') { if (t < J.jusqua) return false; manche(J, 0, t, alea); return true; }
  if (J.phase === 'indice') {
    const u = orateur(J), d = J.passe === 'd';
    if (!J.vivants[u]) { suivant(J, t); return true; }
    const absent = vus && t - (vus[u] || 0) > ABSENT;
    if (!absent && t < J.jusqua) return false;
    J.ind.push({ u, m: '', r: J.manche, d, p: absent ? 'absent' : 'passe' }); noter(J, t, absent ? 'absent' : 'passe', { u }); suivant(J, t);
    return true;
  }
  if (J.phase === 'vote') {
    const restants = vivants(J).filter(u => !J.valides[u]);
    if (!restants.length) { depouiller(J, t); return true; }
    if ((J.attente && t >= J.attente) || t >= J.plafond) { depouiller(J, t, restants); return true; } // les retardataires : abstention
    if (J.attente && restants.length > 2) { J.attente = 0; return true; } // un vote à refaire (sa cible est partie)
    if (!J.attente && restants.length <= 2 && Object.keys(J.valides).length) { J.attente = t + ATTENTE; return true; }
    return false;
  }
  if (J.phase === 'ignorant') { if (t < J.jusqua) return false; resoudreIgnorant(J, '', t); return true; }
  if (J.phase === 'resultat') { if (t < J.jusqua) return false; enchainer(J, t, alea); return true; }
  return false;
}
/**
 * Fait avancer la partie jusqu'à l'heure `t` (du serveur) : toutes les échéances passées, l'une après l'autre. `vus` :
 * { [uid]: heure de son dernier signe de vie } (null : on ne regarde pas les absents). Rend vrai si quelque chose a changé.
 */
export function avancer(J, t, vus = null, alea = hasard) {
  let change = false;
  for (let k = 0; k < 60 && pas(J, t, vus, alea); k++) change = true;
  return change;
}
