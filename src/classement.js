import { $ } from './base.js';
import { firebase, joueur } from './firebase.js';

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
const C = { lignes: [], ligne: '', meilleurs: {}, ouvert: false, demande: 0 };

/** Le nom du joueur au classement : le sien, sinon celui du salon (« Vivre à Cotonou »). */
export function nomJoueur() { return lire(CLE_NOM, '') || nettoyer(lire('cotonou3d.salon', {})?.nom || '') || ''; }
const nomChoisi = () => !!lire(CLE_NOM, '');

// ---------- Le serveur (ou le classement d'essai) ----------
async function moi() { return LOCAL ? 'moi' : (await joueur()).uid; }
// Classement d'essai : quelques joueurs fictifs sur chaque ligne, pour voir où l'on se place (jamais en ligne).
const ESSAI = [['Kofi', 1.6], ['Afi', 1.25], ['Rachidi', .9], ['Mireille', .6], ['Sènan', .35]];
function essai() {
  const t = lire(CLE_LOCAL, null); if (t) return t;
  const n = {}; for (const L of C.lignes) n[L.id] = Object.fromEntries(ESSAI.map(([nom, k], i) => [`essai${i}`, { n: `${nom} (essai)`, s: Math.round(k * (L.id === 'express' ? 2500 : 8000) / 50) * 50, t: i }]));
  ecrireLS(CLE_LOCAL, n); return n;
}
async function lireLigne(ligne) {
  if (LOCAL) return Object.entries(essai()[ligne] || {}).map(([uid, e]) => ({ uid, ...e }));
  const { d, db } = await firebase(); await joueur();
  const snap = await d.get(d.query(d.ref(db, `zem_classement/${ligne}`), d.orderByChild('s'), d.limitToLast(TOP)));
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
  const liste = (await lireLigne(ligne)).filter(e => e.s > 0).sort((a, b) => b.s - a.s || (a.t || 0) - (b.t || 0)), id = await moi();
  const i = liste.findIndex(e => e.uid === id);
  return { rang: i >= 0 ? i + 1 : null, nb: liste.length, liste, moi: id };
}

// ---------- La fenêtre du classement ----------
/** `lignes` : celles de Zém Run ({ id, nom }) ; `ligne` : celle à montrer d'abord ; `meilleurs` : les records de ce navigateur. */
export function ouvrirClassement(lignes, ligne, meilleurs) {
  C.lignes = lignes; C.meilleurs = meilleurs || {}; C.ligne = lignes.some(l => l.id === ligne) ? ligne : (Object.keys(C.meilleurs)[0] || lignes[0]?.id || '');
  $('#jcNom').value = nomJoueur(); $('#jcNomEtat').textContent = '';
  const tabs = $('#jcLignes'); tabs.replaceChildren();
  for (const L of lignes) {
    const b = document.createElement('button'); b.type = 'button'; b.role = 'tab'; b.dataset.ligne = L.id; b.textContent = L.nom;
    b.addEventListener('click', () => { C.ligne = L.id; montrerLigne(); }); tabs.append(b);
  }
  $('#jeuClassement').hidden = false; C.ouvert = true;
  montrerLigne();
  synchroniser(C.meilleurs).then(() => { if (C.ouvert) montrerLigne(); });
}
export function fermerClassement() { $('#jeuClassement').hidden = true; C.ouvert = false; }
async function montrerLigne() {
  const k = ++C.demande, liste = $('#jcListe'), moiEl = $('#jcMoi');
  for (const b of $('#jcLignes').children) { const on = b.dataset.ligne === C.ligne; b.setAttribute('aria-selected', String(on)); if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  liste.innerHTML = '<li class="jc-vide">Chargement du classement…</li>'; moiEl.textContent = '';
  let P;
  try { P = await place(C.ligne); } catch (e) { if (k === C.demande) liste.innerHTML = '<li class="jc-vide">Le classement ne répond pas : vérifie ta connexion, puis rouvre-le.</li>'; console.warn('classement', e.message); return; }
  if (k !== C.demande) return; // une autre ligne a été choisie entre-temps
  const record = C.meilleurs[C.ligne] || 0;
  liste.innerHTML = P.liste.length ? P.liste.map((e, i) => `<li class="${e.uid === P.moi ? 'moi' : ''}${i < 3 ? ' podium p' + (i + 1) : ''}"><span class="jc-rang">${i + 1}</span><span class="jc-nom">${esc(e.n)}${e.uid === P.moi ? ' <em>toi</em>' : ''}</span><b>${fmt(e.s)}</b></li>`).join('')
    : '<li class="jc-vide">Personne n’a encore fini cette ligne. Va jusqu’au terminus et sois le premier !</li>';
  moiEl.textContent = !nomChoisi() ? (record ? `Ton record sur cette ligne : ${fmt(record)}. Écris ton nom ci-dessus pour entrer au classement.` : 'Écris ton nom ci-dessus, puis va jusqu’au terminus pour entrer au classement.')
    : P.rang ? `Tu es ${P.rang === 1 ? '1er' : `${P.rang}e`} sur ${P.nb}${P.nb >= TOP ? ' (les 50 premiers)' : ''}.`
    : record ? `Ton record (${fmt(record)}) n’est pas encore dans les ${TOP} premiers : refais la ligne pour monter.` : 'Pas encore de record sur cette ligne : va jusqu’au terminus.';
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
    ecrireLS(CLE_NOM, n); $('#jcNom').value = n; etat.textContent = 'Nom enregistré.';
    await synchroniser(C.meilleurs); // le nouveau nom sur ses records déjà envoyés
    if (C.ouvert) montrerLigne();
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && C.ouvert) { fermerClassement(); e.stopPropagation(); } }, true);
  if (import.meta.env.DEV) window.__classement = { C, place, envoyerScore, nomJoueur, ouvrirClassement }; // pour les tests
}
