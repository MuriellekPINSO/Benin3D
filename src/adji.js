import { $ } from './base.js';
import { son } from './audio.js';
import { fermerFiche } from './commerces.js';
import { firebase } from './firebase.js';
import { gagnerReputation, jourDe } from './journee.js';
import { coupOrdinateur, coups, depart, jouer, lettre, rejouer } from './adji-regles.js';
import { VIE, ecrireEnPlus, gagner, lireEnPlus, signaler } from './vie.js';

// ---------- L'adji : l'awalé du Bénin, contre un joueur de la ville ou contre l'ordinateur ----------
// Les jeux de société de Lagos Life (le 15/10), sans les mises : l'argent du jeu se recharge avec du vrai argent
// (recharge.js), une mise en ferait un jeu d'argent. On joue pour la réputation (★) et une petite prime, trois fois par
// jour au plus. Les règles (le semis, les prises, ne pas affamer) sont dans adji-regles.js.
// Contre l'ordinateur : Fifamè (elle débute) ou Tonton Codjo (il voit cinq coups à l'avance). Contre un joueur de la ville :
// « Défier » dans la liste, il reçoit l'invitation (zem_adji_inv/{lui}/{moi}) ; la partie est zem_adji/{id} = { a, b, na,
// nb, e, c, t } — a et b les deux joueurs (a commence), e l'état (0 invitation, 1 en jeu, 2 finie, 3 abandon ou refus,
// 4 temps dépassé), c les coups joués (une lettre chacun). Les règles de la base n'acceptent un coup que de celui dont
// c'est le tour, et le « temps dépassé » qu'après trois minutes sans coup (l'heure t ne change qu'avec un coup ou un
// changement d'état : on ne peut pas la rafraîchir pour gagner du temps). Chacun rejoue les coups chez lui.

const PRIME = 500, REP = 20, REP_ORDI = 10, PRIMES_PAR_JOUR = 3, ATTENTE = 180000, SEMIS = 130;
const ORDIS = { fifame: { nom: 'Fifamè', prof: 1, sous: 'Elle apprend : idéale pour commencer' }, codjo: { nom: 'Tonton Codjo', prof: 5, sous: 'Il joue à l’adji depuis cinquante ans' } };
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const graines = n => (n > 1 ? `${n} graines` : `${n} graine`);

// P : la partie en cours. moi : 0 ou 1 (a ou b) ; E : l'état tel qu'affiché ; c : les coups déjà rejoués ; ordi : sa clé.
const AD = { charge: false, ligne: () => { }, autres: () => [], P: null, anim: false, file: [], off: null, offInv: null, s: { j: '', v: 0, g: 0, p: 0 }, invit: null, vue: '' };
const ouverte = () => !$('#vieFiche')?.hidden && !!$('#vfContenu .ad');

export function initAdji({ ligne, autres }) {
  Object.assign(AD, { ligne, autres });
  $('#slAdji')?.addEventListener('click', ouvrirAdji);
  if (import.meta.env.DEV) window.__adji = { AD, jouerTrou: i => jouerMoi(i) }; // pour les tests
}
export async function entrerAdji() {
  const d = lireEnPlus('adji'); AD.s = { j: d?.j || '', v: d?.v || 0, g: d?.g || 0, p: d?.p || 0 };
  AD.charge = true;
  if (VIE.local || !VIE.ref) return;
  try { // les invitations qu'on reçoit
    const { d: f, db } = await firebase(), moi = VIE.ref.key, ref = f.ref(db, `zem_adji_inv/${moi}`);
    // Aussi « modifiée » : une invitation du même joueur, pas encore effacée (réseau), arrive en remplaçant l'ancienne.
    // Dix minutes de marge : l'heure du téléphone peut être fausse.
    const prendre = s => { const x = s.val(); f.remove(s.ref).catch(() => { }); if (x && Math.abs(Date.now() - (x.t || 0)) < 600000) recevoir(s.key, x); };
    const offA = f.onChildAdded(ref, prendre), offC = f.onChildChanged(ref, prendre); AD.offInv = () => { offA(); offC(); };
  } catch (e) { console.warn('adji', e?.message); }
}
export function quitterAdji() {
  if (AD.P && !AD.P.ordi && !AD.P.E.fin && AD.P.e <= 1) abandonner(); // en jeu, ou un défi sans réponse
  AD.off?.(); AD.off = null; AD.offInv?.(); AD.offInv = null; AD.P = null; AD.charge = false;
}
const sauver = () => ecrireEnPlus('adji', AD.s);

// ---------- Les parties ----------
function commencer(P) {
  AD.off?.(); AD.off = null;
  AD.P = { E: depart(), c: '', e: 1, ...P }; AD.file = []; AD.anim = false; AD.vue = 'jeu';
  afficher();
  if (AD.P.ordi && AD.P.moi === 1) setTimeout(tourOrdi, 700);
}
export function contreOrdi(cle) { commencer({ ordi: cle, moi: 0, noms: ['', ORDIS[cle].nom] }); }

async function defier(uid, nom) {
  if (!VIE.ref || VIE.local) return;
  try {
    const { d, db } = await firebase(), moi = VIE.ref.key, ref = d.push(d.ref(db, 'zem_adji'));
    await d.set(ref, { a: moi, b: uid, na: VIE.data.nom, nb: nom, e: 0, c: '', t: d.serverTimestamp() });
    await d.set(d.ref(db, `zem_adji_inv/${uid}/${moi}`), { p: ref.key, n: VIE.data.nom, t: d.serverTimestamp() });
    AD.P = { id: ref.key, moi: 0, autre: uid, noms: [VIE.data.nom, nom], E: depart(), c: '', e: 0, cree: Date.now() }; AD.vue = 'jeu';
    suivre(ref.key); afficher();
    AD.ligne(`🎲 Tu as défié ${nom} à l’adji. On attend sa réponse…`);
  } catch (e) { console.warn('adji', e?.message); AD.ligne('Le défi n’a pas pu partir. Réessaie dans un moment.'); }
}
function recevoir(de, x) {
  // Déjà en partie, ou une invitation encore à l'écran : on décline sans déranger (et sans laisser déborder le fil).
  if ((AD.P && !AD.P.E.fin && AD.P.e <= 1) || AD.invit) { repondre(x.p, false); return; }
  AD.invit = { de, id: x.p, nom: x.n };
  AD.ligne(`🎲 ${x.n} te défie à l’adji ! Ouvre « Adji » dans le menu pour répondre.`); son('piece');
  if ($('#vieFiche')?.hidden) { AD.vue = 'invit'; afficher(); }
}
async function repondre(id, oui) {
  try {
    const { d, db } = await firebase();
    await d.update(d.ref(db, `zem_adji/${id}`), { e: oui ? 1 : 3, t: d.serverTimestamp(), ...(oui ? {} : { q: VIE.ref.key }) });
    if (oui) { const nom = AD.invit?.nom || '', autre = AD.invit?.de || ''; AD.invit = null; AD.off?.(); AD.off = null; AD.P = { id, moi: 1, autre, noms: [nom, VIE.data.nom], E: depart(), c: '', e: 1 }; AD.vue = 'jeu'; suivre(id); afficher(); }
  } catch (e) { console.warn('adji', e?.message); }
  if (!oui && AD.invit?.id === id) { AD.invit = null; if (ouverte()) { AD.vue = ''; afficher(); } } // une autre invitation déclinée d'office ne ferme pas celle qu'on regarde
}
/** La partie dans la base : les coups de l'autre arrivent ici (les siens aussi, déjà joués chez soi). */
async function suivre(id) {
  const { d, db } = await firebase();
  AD.off = d.onValue(d.ref(db, `zem_adji/${id}`), s => {
    const v = s.val(), P = AD.P; if (!v || !P || P.id !== id) return;
    P.t = v.t; P.noms = [v.na, v.nb];
    const avant = P.e; P.e = v.e;
    if (avant === 0 && v.e === 1) { AD.ligne(`🎲 ${v.nb} accepte : à toi de commencer !`); son('piece'); }
    // Un coup impossible (écrit à la main dans la base : elle ne vérifie que le tour) : la partie est annulée, sans gagnant.
    if (!rejouer(v.c)) return annuler();
    if (!v.c.startsWith(P.c)) { AD.file = []; P.c = v.c; P.E = rejouer(v.c); if (ouverte()) afficher(); } // un de ses coups refusé par la base : on repart de la partie qu'elle a
    // Les coups pas encore vus : rejoués à la suite (ceux de l'autre seulement ; les siens sont déjà joués)
    for (const k of v.c.slice(P.c.length)) { const i = parseInt(k, 12); P.c += k; AD.file.push(i); }
    animer();
    // Abandon, ou temps dépassé : jugés d'après les coups de la base. Celui qui devait jouer (a si leur nombre est pair) a perdu.
    if (v.e === 3 && avant !== 3) return finAbandon(v.q);
    if (v.e === 4 && avant !== 4) return finAbandon(v.c.length % 2 === P.moi ? VIE.ref.key : '-', true);
    if (ouverte()) majBas();
  }, e => console.warn('adji', e?.message));
}
function jouerMoi(i) {
  const P = AD.P; if (!P || P.E.fin || AD.anim || AD.file.length || P.e !== 1 || P.E.j !== P.moi || !coups(P.E).includes(i)) return;
  P.c += lettre(i); AD.file.push(i); animer();
  if (P.id) envoyer(P);
}
async function envoyer(P) {
  try {
    const { d, db } = await firebase(), fin = rejouer(P.c)?.fin;
    await d.update(d.ref(db, `zem_adji/${P.id}`), { c: P.c, t: d.serverTimestamp(), ...(fin ? { e: 2 } : {}) });
  } catch (e) { console.warn('adji', e?.message); AD.ligne('Ton coup n’est pas passé (connexion ?). Réessaie.'); resynchroniser(P); }
}
/** Un coup refusé ou perdu : on reprend la partie telle que la base l'a, sinon les deux plateaux ne seraient plus les mêmes. */
async function resynchroniser(P) {
  try {
    const { d, db } = await firebase(), v = (await d.get(d.ref(db, `zem_adji/${P.id}`))).val(); if (!v || AD.P !== P) return;
    AD.file = []; P.c = v.c || ''; P.E = rejouer(P.c) || depart(); P.e = v.e;
    if (ouverte()) afficher();
  } catch (e) { console.warn('adji', e?.message); }
}
function tourOrdi() {
  const P = AD.P; if (!P?.ordi || P.E.fin || P.E.j === P.moi) return;
  if (AD.anim || AD.file.length) { setTimeout(tourOrdi, 300); return; }
  const i = coupOrdinateur(P.E, ORDIS[P.ordi].prof); P.c += lettre(i); AD.file.push(i); animer();
}
async function abandonner() {
  const P = AD.P; if (!P) return;
  if (P.ordi) { AD.P = null; AD.vue = ''; if (ouverte()) afficher(); return; }
  try { const { d, db } = await firebase(); await d.update(d.ref(db, `zem_adji/${P.id}`), { e: 3, q: VIE.ref.key, t: d.serverTimestamp() }); } catch (e) { console.warn('adji', e?.message); }
}
async function reclamer() { // l'autre ne joue plus depuis trois minutes
  const P = AD.P; if (!P?.id) return;
  try { const { d, db } = await firebase(); await d.update(d.ref(db, `zem_adji/${P.id}`), { e: 4, t: d.serverTimestamp() }); } catch (e) { console.warn('adji', e?.message); AD.ligne('Pas encore : il reste un peu de temps à ton adversaire.'); }
}

// ---------- Le semis, graine par graine ----------
async function animer() {
  if (AD.anim) return; AD.anim = true;
  while (AD.file.length && AD.P) {
    const P = AD.P, i = AD.file.shift(), r = jouer(P.E, i); if (!r) { console.warn('adji : coup refusé', i); continue; }
    const t = P.E.t.slice(); t[i] = 0;
    for (const k of r.chemin) { if (!ouverte()) break; t[k]++; dessiner({ ...P.E, t }, { de: i, ici: k }); son('bosse'); await attendre(SEMIS); }
    if (r.prises.length && ouverte()) { dessiner({ ...P.E, t: r.t.map((x, p) => (r.prises.includes(p) ? t[p] : x)) }, { prises: r.prises }); son('piece'); await attendre(450); }
    if (AD.P !== P) break;
    P.E = r.E;
    if (ouverte()) afficher();
    if (P.E.fin) { fin(P); break; }
    if (P.ordi && P.E.j !== P.moi) setTimeout(tourOrdi, 500);
  }
  AD.anim = false;
}
const attendre = ms => new Promise(r => setTimeout(r, ms));

// ---------- La fin ----------
function compter(gagne, humain, prime = humain) {
  const auj = jourDe(Date.now()); if (AD.s.j !== auj) { AD.s.j = auj; AD.s.v = 0; }
  AD.s.p++; if (gagne) AD.s.g++;
  let texte = '';
  if (gagne && AD.s.v < PRIMES_PAR_JOUR) {
    AD.s.v++;
    if (humain && prime) { gagner(PRIME, 'adji', { source: 'prime', silencieux: true }); gagnerReputation(REP); texte = ` +${fmt(PRIME)}, +${REP} ★.`; }
    else if (humain) { gagnerReputation(REP); texte = ` +${REP} ★.`; }
    else { gagnerReputation(REP_ORDI); texte = ` +${REP_ORDI} ★.`; }
  }
  sauver(); return texte;
}
function fin(P) {
  const E = P.E, autre = P.noms[1 - P.moi] || 'ton adversaire', gagne = E.gagnant === P.moi;
  const texte = compter(gagne, !P.ordi);
  AD.ligne(E.gagnant === 2 ? `🎲 Adji : partie nulle avec ${autre}, 24 graines partout.` : gagne ? `🎲 Adji : tu bats ${autre}, ${E.g[P.moi]} graines à ${E.g[1 - P.moi]} !${texte}` : `🎲 Adji : ${autre} gagne, ${E.g[1 - P.moi]} graines à ${E.g[P.moi]}. Prends ta revanche !`);
  son(gagne ? 'trompette' : 'arret'); signaler('adji'); // la mission du jour (journee.js), après le résultat
  AD.off?.(); AD.off = null;
  if (ouverte()) afficher();
}
function annuler() {
  const P = AD.P; if (!P || P.E.fin) return;
  AD.file = []; P.E = { ...P.E, fin: true, gagnant: -1, abandon: true }; AD.off?.(); AD.off = null;
  AD.ligne('🎲 Partie d’adji annulée : un coup impossible est arrivé.');
  if (ouverte()) afficher();
}
function finAbandon(q, temps = false) {
  const P = AD.P; if (!P || P.E.fin) return;
  P.E = { ...P.E, fin: true, gagnant: q === VIE.ref?.key ? 1 - P.moi : P.moi, abandon: true };
  AD.off?.(); AD.off = null;
  if (P.e === 3 && !P.c && q !== VIE.ref?.key) AD.ligne(`🎲 ${P.noms[1 - P.moi] || 'Ton adversaire'} ne veut pas jouer pour l’instant.`);
  else if (q === VIE.ref?.key) AD.ligne(temps ? '🎲 Adji : tu n’as pas joué pendant trois minutes, la partie est perdue.' : '🎲 Tu as quitté la partie d’adji.');
  // Gagné sans finir la partie : la réputation, pas la prime.
  else { const texte = P.c.length >= 6 ? compter(true, true, false) : ''; AD.ligne(`🎲 ${P.noms[1 - P.moi] || 'Ton adversaire'} ${temps ? 'ne jouait plus' : 'a quitté la partie'} : tu gagnes.${texte}`); if (P.c.length >= 6) signaler('adji'); }
  if (ouverte()) afficher();
}

// ---------- La fenêtre ----------
export function ouvrirAdji() { if (!AD.charge) return; AD.vue = AD.P ? 'jeu' : AD.invit ? 'invit' : ''; afficher(); }
function afficher() {
  const el = $('#vieFiche'); if (!el) return;
  if (!ouverte()) fermerFiche();
  const corps = AD.vue === 'jeu' && AD.P ? jeu() : AD.vue === 'invit' && AD.invit ? invitation() : accueil();
  $('#vfContenu').innerHTML = `<div class="ad"><small class="vf-sur">Jeux</small><h3 id="vfTitre">L’adji</h3>${corps}</div>`;
  el.hidden = false;
  for (const b of el.querySelectorAll('[data-ad-ordi]')) b.addEventListener('click', () => contreOrdi(b.dataset.adOrdi));
  for (const b of el.querySelectorAll('[data-ad-defi]')) b.addEventListener('click', () => defier(b.dataset.adDefi, b.dataset.nom));
  for (const b of el.querySelectorAll('[data-ad-trou]')) b.addEventListener('click', () => jouerMoi(+b.dataset.adTrou));
  el.querySelector('[data-ad="oui"]')?.addEventListener('click', () => repondre(AD.invit.id, true));
  el.querySelector('[data-ad="non"]')?.addEventListener('click', () => repondre(AD.invit.id, false));
  el.querySelector('[data-ad="quitter"]')?.addEventListener('click', abandonner);
  el.querySelector('[data-ad="reclamer"]')?.addEventListener('click', reclamer);
  el.querySelector('[data-ad="menu"]')?.addEventListener('click', () => { if (AD.P?.E.fin || AD.P?.e >= 2) AD.P = null; AD.vue = ''; afficher(); });
  el.querySelector('[data-ad="revanche"]')?.addEventListener('click', () => { const P = AD.P; if (P.ordi) contreOrdi(P.ordi); else { const uid = AD.autres().some(x => x.id === P.autre) ? P.autre : ''; AD.P = null; if (uid) defier(uid, P.noms[1 - P.moi]); else { AD.vue = ''; afficher(); } } });
}
function accueil() {
  const gens = VIE.local ? [] : AD.autres().filter(x => x.id && x.nom);
  const ordis = Object.entries(ORDIS).map(([k, o]) => `<div class="vf-ligne"><span class="vf-icone">${k === 'codjo' ? '👴🏿' : '👧🏾'}</span><span><b>${esc(o.nom)}</b><small>${esc(o.sous)}</small></span><button type="button" class="vf-bouton" data-ad-ordi="${k}">Jouer</button></div>`).join('');
  const joueurs = gens.length ? gens.map(x => `<div class="vf-ligne"><span class="vf-icone">🙂</span><span><b>${esc(x.nom)}</b><small>Dans la ville en ce moment</small></span><button type="button" class="vf-bouton" data-ad-defi="${esc(x.id)}" data-nom="${esc(x.nom)}">Défier</button></div>`).join('')
    : `<p class="ad-vide">${VIE.local ? 'Défier un joueur : en ligne seulement.' : 'Personne d’autre dans la ville pour l’instant. Invite un ami (« Inviter », en haut) ou joue contre l’ordinateur.'}</p>`;
  const s = AD.s, restant = Math.max(0, PRIMES_PAR_JOUR - (s.j === jourDe(Date.now()) ? s.v : 0));
  const gagnees = s.p ? ` · parties gagnées : ${s.g} sur ${s.p}` : '';
  return `<p class="vf-intro">Le jeu de semailles du Bénin : deux rangées de six trous, quatre graines dans chacun. Sème, prends les trous où ta dernière graine fait 2 ou 3 chez l’autre. Le premier à 25 graines gagne. Pas de mise : on joue pour l’honneur et la réputation.</p>
    <p class="ad-primes">${restant ? `${restant > 1 ? `Encore ${restant} victoires récompensées aujourd’hui` : 'Encore une victoire récompensée aujourd’hui'} : +${fmt(PRIME)} et +${REP} ★ contre un joueur, +${REP_ORDI} ★ contre l’ordinateur.` : 'Tes trois victoires récompensées du jour sont faites. Tu peux toujours jouer pour le plaisir !'}${gagnees}</p>
    <h4 class="tz-h">Contre l’ordinateur</h4>${ordis}<h4 class="tz-h">Contre un joueur de la ville</h4>${joueurs}`;
}
function invitation() {
  return `<p class="vf-intro">${esc(AD.invit.nom)} te défie à l’adji ! C’est lui ou elle qui commence. Pas de mise : le gagnant gagne de la réputation.</p>
    <div class="ep-actions"><button type="button" class="jouer" data-ad="oui">J’accepte</button><button type="button" class="vf-bouton" data-ad="non">Pas maintenant</button></div>`;
}
/** Le plateau vu de chez soi : sa rangée en bas, de gauche à droite dans le sens du semis ; celle de l'autre en haut, à l'envers. */
function plateau(E, P, marque = {}) {
  const bas = P.moi === 0 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11], haut = bas.map(i => (i + 6) % 12).reverse();
  const jouables = !E.fin && P.e === 1 && E.j === P.moi && !AD.anim && !AD.file.length ? coups(E) : [];
  const trou = i => {
    const n = E.t[i], pts = Array.from({ length: Math.min(n, 14) }, (_, k) => { const a = k * 2.4, r = k ? 9 + (k % 5) * 3.2 : 0; return `<i style="left:${50 + Math.cos(a) * r}%;top:${50 + Math.sin(a) * r}%"></i>`; }).join('');
    const cl = [jouables.includes(i) ? 'jouable' : '', marque.ici === i ? 'ici' : '', marque.de === i ? 'de' : '', marque.prises?.includes(i) ? 'prise' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="ad-trou ${cl}" ${jouables.includes(i) ? `data-ad-trou="${i}"` : 'tabindex="-1"'} aria-label="${graines(n)}">${pts}<b>${n}</b></button>`;
  };
  return `<div class="ad-plateau"><div class="ad-rang">${haut.map(trou).join('')}</div><div class="ad-rang">${bas.map(trou).join('')}</div></div>`;
}
function dessiner(E, marque) { const p = $('#vfContenu .ad-plateau'); if (p && AD.P) p.outerHTML = plateau(E, AD.P, marque); }
function jeu() {
  const P = AD.P, E = P.E, nomAutre = P.noms[1 - P.moi] || '…';
  const enAttente = P.e === 0, finie = E.fin || P.e >= 2;
  const tete = (nom, g, actif) => `<div class="ad-joueur${actif ? ' actif' : ''}"><b>${esc(nom)}</b><span>${g > 1 ? `${g} graines prises` : `${g} graine prise`}</span></div>`;
  const etat = enAttente ? `On attend la réponse de ${esc(nomAutre)}…`
    : finie ? (E.gagnant === 2 ? 'Partie nulle, 24 graines partout !' : E.gagnant === P.moi ? (E.abandon ? `${esc(nomAutre)} est parti : tu gagnes !` : `Tu as gagné, ${E.g[P.moi]} graines à ${E.g[1 - P.moi]} !`) : (E.abandon ? 'Partie arrêtée.' : `${esc(nomAutre)} a gagné, ${E.g[1 - P.moi]} graines à ${E.g[P.moi]}.`))
      : E.j === P.moi ? 'À toi : touche un de tes trous (en bas).' : `${esc(nomAutre)} réfléchit…`;
  const boutons = finie ? '<button type="button" class="jouer" data-ad="revanche">Revanche</button><button type="button" class="vf-bouton" data-ad="menu">Autre partie</button>'
    : `<button type="button" class="vf-bouton" data-ad="quitter">${P.ordi ? 'Arrêter' : 'Abandonner'}</button><span id="adAttente"></span>`;
  return `${tete(nomAutre, E.g[1 - P.moi], !finie && E.j !== P.moi)}${plateau(E, P)}${tete('Toi', E.g[P.moi], !finie && E.j === P.moi)}
    <p class="ad-etat" role="status">${etat}</p><div class="ep-actions">${boutons}</div>`;
}
/** Le bouton « Il ne joue plus », quand l'autre ne joue plus depuis trois minutes (la base vérifie l'heure). */
function majBas() {
  const P = AD.P, el = $('#adAttente'); if (!el || !P?.id || P.E.fin || P.e !== 1 || P.E.j === P.moi) { if (el) el.innerHTML = ''; return; }
  const reste = (P.t || Date.now()) + ATTENTE - Date.now();
  el.innerHTML = reste <= 0 ? '<button type="button" class="vf-bouton" data-ad="reclamer">Il ne joue plus : gagner la partie</button>' : '';
  el.querySelector('[data-ad="reclamer"]')?.addEventListener('click', reclamer);
}
export function majAdji(dt) {
  if (!AD.charge || !AD.P?.id) return;
  AD.tAtt = (AD.tAtt || 0) - dt; if (AD.tAtt > 0) return; AD.tAtt = 5;
  // Un défi sans réponse au bout de deux minutes : on le retire (l'autre est peut-être parti, ou ne l'a pas vu).
  if (AD.P.e === 0 && AD.P.cree && Date.now() - AD.P.cree > 120000) { const nom = AD.P.noms[1]; abandonner(); AD.P = null; AD.ligne(`🎲 ${nom} n’a pas répondu à ton défi.`); if (ouverte()) { AD.vue = ''; afficher(); } return; }
  if (ouverte()) majBas();
}
