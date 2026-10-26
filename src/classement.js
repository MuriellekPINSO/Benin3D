import { $ } from './base.js';
import { firebase, joueur } from './firebase.js';
import { grossier } from './moderation.js';

// ---------- Classement de Zém Run : son nom, et sa place parmi tous les joueurs ----------
// Un classement par ligne (elles n'ont pas la même longueur) : le meilleur total de chaque joueur au terminus, recette et
// quiz compris (le record de jeu.js). Firebase : zem_classement/{ligne}/{uid} = { n: nom, s: total, t: heure du serveur } ;
// les règles de la base (database.rules.json) n'acceptent qu'un total qui monte. Le nom est gardé dans ce navigateur.
// En développement, ?classement-local : un classement d'essai dans ce navigateur, sans serveur.

const CLE_NOM = 'zemrun-nom', CLE_ENVOYES = 'zemrun-classement-envoyes', CLE_LOCAL = 'zemrun-classement-local', TOP = 50;
const LOCAL = import.meta.env.DEV && new URLSearchParams(location.search).has('classement-local');
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const lire = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* navigation privée */ } };
const nettoyer = t => String(t || '').replace(/[<>&"\\/]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
const C = { lignes: [], ligne: '', meilleurs: {}, ouvert: false, demande: 0, periode: 'tout' };
// Onglets « Aujourd'hui » et « Cette semaine », comme Danfo Run : chaque joueur n'a qu'un total par ligne (son record), daté
// du moment où il l'a battu (t, heure du serveur) ; on montre donc les records battus aujourd'hui ou cette semaine, à
// l'heure du Bénin (UTC+1, semaine du lundi).
const PERIODES = { tout: 'Tous les temps', semaine: 'Cette semaine', jour: 'Aujourd’hui' };
// Zém Run se joue au score (22/10) : trois classements de toutes les lignes, en tête, rangés comme des « lignes » dans la
// base (mêmes règles : un total par joueur, qui ne fait que monter). km : dixièmes de kilomètre roulés, toutes courses.
export const GLOBAUX = [{ id: 'score', nom: 'Meilleur score' }, { id: 'km', nom: 'Kilomètres' }, { id: 'quartiers', nom: 'Quartiers visités' }];
const valeur = (ligne, s) => ligne === 'km' ? `${(s / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km` : ligne === 'quartiers' ? `${s} quartier${s > 1 ? 's' : ''}` : fmt(s);
const AIDES = {
  score: 'Ce qui compte : ta meilleure course arrivée au terminus, recette et quiz compris, toutes lignes confondues.',
  km: 'Ce qui compte : tous les kilomètres roulés dans Cotonou, course après course.',
  quartiers: 'Ce qui compte : les quartiers où tu as déposé au moins un client (tes tampons).',
  ligne: 'Ce qui compte : ton meilleur total au terminus de la ligne, recette et quiz compris.',
};
function depuis(periode) {
  if (periode === 'tout') return 0;
  const B = 3600e3, jour = Math.floor((Date.now() + B) / 864e5) * 864e5 - B; // minuit au Bénin
  return periode === 'jour' ? jour : jour - ((new Date(jour + B).getUTCDay() + 6) % 7) * 864e5;
}

/** Le nom du joueur au classement : le sien, sinon celui du salon (« Vivre à Cotonou »). */
export function nomJoueur() { return lire(CLE_NOM, '') || nettoyer(lire('cotonou3d.salon', {})?.nom || '') || ''; }
const nomChoisi = () => !!lire(CLE_NOM, '');
/** Enregistre son nom (classement et défi du jour) ; '' si le nom est vide ou grossier. */
export function choisirNom(t) { const n = nettoyer(t); if (!n || grossier(n)) return ''; ecrireLS(CLE_NOM, n); return n; }

// ---------- Le serveur (ou le classement d'essai) ----------
async function moi() { return LOCAL ? 'moi' : (await joueur()).uid; }
// Classement d'essai : quelques joueurs fictifs sur chaque ligne, pour voir où l'on se place (jamais en ligne).
const ESSAI = [['Kofi', 1.6], ['Afi', 1.25], ['Rachidi', .9], ['Mireille', .6], ['Sènan', .35]];
function essai() {
  const t = lire(CLE_LOCAL, null); if (t) return t;
  const n = {}; for (const L of C.lignes) n[L.id] = Object.fromEntries(ESSAI.map(([nom, k], i) => [`essai${i}`, { n: `${nom} (essai)`, s: Math.round(k * (L.id === 'express' ? 2500 : 8000) / 50) * 50, t: i }]));
  ecrireLS(CLE_LOCAL, n); return n;
}
async function lireLigne(ligne, t0 = 0) {
  if (LOCAL) return Object.entries(essai()[ligne] || {}).map(([uid, e]) => ({ uid, ...e })).filter(e => (e.t || 0) >= t0);
  const { d, db } = await firebase(); await joueur();
  const ref = d.ref(db, `zem_classement/${ligne}`);
  const snap = await d.get(t0 ? d.query(ref, d.orderByChild('t'), d.startAt(t0)) : d.query(ref, d.orderByChild('s'), d.limitToLast(TOP)));
  const out = []; snap.forEach(e => { out.push({ uid: e.key, ...e.val() }); }); return out;
}
async function ecrireScore(ligne, n, s) {
  if (LOCAL) { const t = essai(); (t[ligne] ||= {}).moi = { n, s, t: Date.now() }; ecrireLS(CLE_LOCAL, t); return; }
  const { d, db } = await firebase(), u = await joueur();
  await d.set(d.ref(db, `zem_classement/${ligne}/${u.uid}`), { n, s, t: d.serverTimestamp() });
}

/** Envoie son meilleur total sur une ligne s'il n'est pas déjà au classement (avec son nom actuel). */
export async function envoyerScore(ligne, s) {
  const n = nomJoueur(), env = lire(CLE_ENVOYES, {}); if (!nomChoisi() || !n || !(s > 0)) return false;
  if (env[ligne]?.s >= s && env[ligne]?.n === n) return true;
  try { await ecrireScore(ligne, n, Math.round(s)); env[ligne] = { s: Math.round(s), n }; ecrireLS(CLE_ENVOYES, env); return true; }
  catch (e) { console.warn('classement', e.message); return false; }
}
/** Les records gardés dans ce navigateur (faits avant le classement, ou hors ligne) partent au classement. */
export async function synchroniser(meilleurs) { for (const [l, s] of Object.entries(meilleurs || {})) await envoyerScore(l, s); }
/** Sa place sur une ligne : { rang (null au-delà des 50 premiers), nb (joueurs lus), liste }. */
export async function place(ligne) {
  const liste = (await lireLigne(ligne, depuis(C.periode))).filter(e => e.s > 0).sort((a, b) => b.s - a.s || (a.t || 0) - (b.t || 0)).slice(0, TOP), id = await moi();
  const i = liste.findIndex(e => e.uid === id);
  return { rang: i >= 0 ? i + 1 : null, nb: liste.length, liste, moi: id };
}

// ---------- La fenêtre du classement ----------
/** `lignes` : celles de Zém Run ({ id, nom }) ; `ligne` : celle à montrer d'abord ; `meilleurs` : les records de ce navigateur. */
export function ouvrirClassement(lignes, ligne, meilleurs) {
  C.lignes = [...GLOBAUX, ...lignes]; C.meilleurs = meilleurs || {}; C.ligne = C.lignes.some(l => l.id === ligne) ? ligne : 'score';
  lignes = C.lignes;
  $('#jcNom').value = nomJoueur(); $('#jcNomEtat').textContent = '';
  const tabs = $('#jcLignes'); tabs.replaceChildren();
  for (const L of lignes) {
    const b = document.createElement('button'); b.type = 'button'; b.role = 'tab'; b.dataset.ligne = L.id; b.textContent = L.nom;
    b.addEventListener('click', () => { C.ligne = L.id; montrerLigne(); }); tabs.append(b);
  }
  const per = $('#jcPeriodes');
  if (per) {
    per.replaceChildren();
    for (const [k, nom] of Object.entries(PERIODES)) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.periode = k; b.textContent = nom;
      b.addEventListener('click', () => { C.periode = k; montrerLigne(); }); per.append(b);
    }
  }
  $('#jeuClassement').hidden = false; C.ouvert = true;
  montrerLigne();
  synchroniser(C.meilleurs).then(() => { if (C.ouvert) montrerLigne(); });
}
export function fermerClassement() { $('#jeuClassement').hidden = true; C.ouvert = false; }
async function montrerLigne() {
  const k = ++C.demande, liste = $('#jcListe'), moiEl = $('#jcMoi');
  for (const b of $('#jcLignes').children) { const on = b.dataset.ligne === C.ligne; b.setAttribute('aria-selected', String(on)); if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  for (const b of $('#jcPeriodes')?.children || []) b.setAttribute('aria-pressed', String(b.dataset.periode === C.periode));
  liste.innerHTML = '<li class="jc-vide">Chargement du classement…</li>'; moiEl.textContent = '';
  let P;
  try { P = await place(C.ligne); } catch (e) { if (k === C.demande) liste.innerHTML = '<li class="jc-vide">Le classement ne répond pas : vérifie ta connexion, puis rouvre-le.</li>'; console.warn('classement', e.message); return; }
  if (k !== C.demande) return; // une autre ligne a été choisie entre-temps
  const record = C.meilleurs[C.ligne] || 0;
  liste.innerHTML = P.liste.length ? P.liste.map((e, i) => `<li class="${e.uid === P.moi ? 'moi' : ''}${i < 3 ? ' podium p' + (i + 1) : ''}"><span class="jc-rang">${i + 1}</span><span class="jc-nom">${esc(e.n)}${e.uid === P.moi ? ' <em>toi</em>' : ''}</span><b>${valeur(C.ligne, e.s)}</b></li>`).join('')
    : C.periode !== 'tout' ? `<li class="jc-vide">Aucun record battu ${C.periode === 'jour' ? 'aujourd’hui' : 'cette semaine'} sur cette ligne. À toi de jouer !</li>`
    : GLOBAUX.some(g => g.id === C.ligne) ? '<li class="jc-vide">Personne n’est encore classé ici. Joue une course et sois le premier !</li>'
    : '<li class="jc-vide">Personne n’a encore fini cette ligne. Va jusqu’au terminus et sois le premier !</li>';
  const aide = $('.jc-aide'); if (aide) aide.textContent = AIDES[GLOBAUX.some(g => g.id === C.ligne) ? C.ligne : 'ligne'];
  moiEl.textContent = !nomChoisi() ? (record ? `Ton total ici : ${valeur(C.ligne, record)}. Écris ton nom ci-dessus pour entrer au classement.` : 'Écris ton nom ci-dessus, puis va jusqu’au terminus pour entrer au classement.')
    : P.rang ? `Tu es ${P.rang === 1 ? '1er' : `${P.rang}e`} sur ${P.nb}${P.nb >= TOP ? ' (les 50 premiers)' : ''}.`
    : C.periode !== 'tout' ? `Fais monter ton total ${C.periode === 'jour' ? 'aujourd’hui' : 'cette semaine'} pour apparaître ici.`
    : record ? `Ton total (${valeur(C.ligne, record)}) n’est pas encore dans les ${TOP} premiers : rejoue pour monter.` : 'Pas encore de total ici : va jusqu’au terminus.';
}
/** Le bilan d'une course : son total part au classement, et l'on dit sa place. Renvoie un texte (ou '' si rien à dire). */
export async function placeApresCourse(ligne, meilleur) {
  if (!nomChoisi()) return 'Écris ton nom dans « Classement » pour te comparer aux autres joueurs.';
  if (!(await envoyerScore(ligne, meilleur))) return '';
  try { const P = await place(ligne); return P.rang ? `Classement de la ligne : tu es ${P.rang === 1 ? '1er' : `${P.rang}e`} sur ${P.nb}.` : ''; } catch { return ''; }
}

export function initClassement() {
  $('#jcFermer')?.addEventListener('click', fermerClassement);
  $('#jcNomForm')?.addEventListener('submit', async e => {
    e.preventDefault(); const n = nettoyer($('#jcNom').value), etat = $('#jcNomEtat');
    if (!n) { etat.textContent = 'Écris un nom d’au moins une lettre.'; return; }
    if (!choisirNom(n)) { etat.textContent = 'Choisis un autre nom : il sera affiché devant tous les joueurs.'; return; }
    $('#jcNom').value = n; etat.textContent = 'Nom enregistré.';
    await synchroniser(C.meilleurs); // le nouveau nom sur ses records déjà envoyés
    if (C.ouvert) montrerLigne();
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && C.ouvert) { fermerClassement(); e.stopPropagation(); } }, true);
  if (import.meta.env.DEV) window.__classement = { C, place, envoyerScore, nomJoueur, ouvrirClassement }; // pour les tests
}
