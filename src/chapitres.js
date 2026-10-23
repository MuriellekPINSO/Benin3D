import { $ } from './base.js';
import { son } from './audio.js';
import { fermerFiche, listeCommerces, nbCommerces } from './commerces.js';
import { VIE, ecrireEnPlus, gagner, lireEnPlus, surSignal } from './vie.js';

// ---------- Les chapitres de « Ma vie » : toujours une prochaine étape ----------
// De la débrouille jusqu'à patron de trois commerces, en quatre chapitres. La prochaine étape reste affichée en bas de
// l'écran (sauf pendant la prise en main, guide.js) ; chaque étape réussie rapporte une prime, et la suivante
// s'affiche. Une étape est faite quand son état est atteint (`fait`) ou quand son compteur arrive au but (`compte` :
// les signaux de vie.js — argent gagné en travaillant, ventes des commerces, repas, plein, courses…, comptés depuis le
// début de l'étape). Toucher la carte montre tous les chapitres.

const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const CHAPITRES = [
  { titre: 'Se débrouiller', etapes: [
    { texte: 'Trouve un travail : touche « Travailler », en haut à gauche.', prime: 500, fait: () => !!VIE.data?.metier },
    { texte: 'Gagne 2 000 F en travaillant.', prime: 500, compte: 'travail', but: 2000, F: true },
    { texte: 'Mange un bon plat : au maquis, au food court de la Cité, ou chez toi.', prime: 300, compte: 'mange', but: 1 },
    { texte: 'Gagne 10 000 F en travaillant.', prime: 1000, compte: 'travail', but: 10000, F: true },
  ] },
  { titre: 'Avoir sa moto', etapes: [
    { texte: 'Aie ton propre véhicule : « Menu », en haut à gauche, puis « Louer une moto ».', prime: 500, fait: () => !!VIE.data?.vehicule },
    { texte: 'Fais le plein dans une station-service (« Aller à » : la station la plus proche).', prime: 300, compte: 'plein', but: 1 },
    { texte: 'Fais 3 courses de zém ou de taxi : « Travailler », puis Zémidjan ou Chauffeur de taxi.', prime: 1500, compte: 'course', but: 3 }, // 5, c'était trop : un testeur a abandonné là (22/10)
    { texte: 'Mets 10 000 F de côté pour ouvrir ton commerce.', prime: 0, fait: () => (VIE.data?.argent || 0) >= 10000 },
  ] },
  { titre: 'Ouvrir son commerce', etapes: [
    { texte: 'Va voir une boutique à louer : « Menu », en haut à gauche, puis « Commerces ».', prime: 200, compte: 'voirLot', but: 1 },
    { texte: 'Ouvre ton premier commerce : choisis ce que tu vends, ton équipe s’installe.', prime: 1000, fait: () => nbCommerces() >= 1 },
    { texte: 'Ton commerce travaille pour toi : encaisse 5 000 F de ventes.', prime: 1000, compte: 'commerce', but: 5000, F: true },
    { texte: 'Réapprovisionne ton commerce avant que son stock soit vide.', prime: 500, compte: 'reappro', but: 1 },
  ] },
  { titre: 'Devenir quelqu’un', etapes: [
    { texte: 'Ouvre un deuxième commerce, dans un autre quartier.', prime: 2000, fait: () => nbCommerces() >= 2 },
    { texte: 'Prends l’avion pour Ouidah (« Aller à » : l’aéroport).', prime: 1000, fait: () => (VIE.data?.vols || 0) >= 1 },
    { texte: 'Encaisse 50 000 F de ventes dans tes commerces.', prime: 3000, compte: 'commerce', but: 50000, F: true },
    { texte: 'Ouvre trois commerces : te voilà patron à Cotonou !', prime: 5000, fait: () => nbCommerces() >= 3 },
  ] },
];
const ETAPES = CHAPITRES.flatMap((C, c) => C.etapes.map((e, k) => ({ ...e, c, k })));
const CH = { i: 0, n: 0, charge: false, t: 0, fete: 0, guide: () => false, ligne: () => { } };
const etape = () => ETAPES[CH.i];
export const chapitreFini = () => CH.i >= ETAPES.length;

export function initChapitres({ ligne, guide }) {
  CH.ligne = ligne; CH.guide = guide;
  surSignal((evt, n) => { const e = etape(); if (CH.charge && e?.compte === evt) { CH.n += n; if (CH.n < e.but) sauver(); afficher(); } });
  $('#chapOuvrir')?.addEventListener('click', montrerChapitres);
  // Replié, il ne reste que le chapitre et la barre : sur téléphone, le panneau entier cachait le jeu (testeur, 22/10).
  let replie = false; try { replie = localStorage.getItem('kutonu.chap.replie') === '1'; } catch { /* navigation privée */ }
  const plier = r => { replie = r; $('#chapHud')?.classList.toggle('replie', r); const b = $('#chapReplier'); if (b) { b.setAttribute('aria-expanded', String(!r)); b.setAttribute('aria-label', r ? 'Déplier l’étape' : 'Replier l’étape'); } };
  plier(replie);
  $('#chapReplier')?.addEventListener('click', () => { plier(!replie); try { localStorage.setItem('kutonu.chap.replie', replie ? '1' : '0'); } catch { /* */ } });
  if (import.meta.env.DEV) window.__chapitres = { CH, ETAPES, reussir: () => reussir() }; // pour les tests
}
/** À l'entrée dans le salon : la progression enregistrée. */
export function entrerChapitres() {
  const d = lireEnPlus('chapitres'); CH.i = Math.min(ETAPES.length, d?.i || 0); CH.n = d?.n || 0; CH.charge = true; CH.fete = 0; afficher();
}
export function quitterChapitres() { if (CH.charge) sauver(); CH.charge = false; const el = $('#chapHud'); if (el) el.hidden = true; }
function sauver() { ecrireEnPlus('chapitres', { i: CH.i, n: Math.round(CH.n) }); }

/** À chaque image du salon : l'étape est-elle faite ? (une à la fois, le temps de fêter la précédente) */
export function majChapitres(dt) {
  if (!CH.charge || !VIE.data) return;
  if (CH.fete > 0) { CH.fete -= dt; if (CH.fete <= 0) afficher(); return; }
  CH.t -= dt; if (CH.t > 0) { masquerSiGuide(); return; } CH.t = .5;
  const e = etape(); if (!e) { masquerSiGuide(); return; }
  if (e.fait ? e.fait() : CH.n >= e.but) reussir(); else afficher();
}
function reussir() {
  const e = etape(); if (!e) return;
  CH.i++; CH.n = 0; sauver(); son('piece');
  if (e.prime) gagner(e.prime, 'étape réussie', { source: 'prime' });
  const finChapitre = e.k === CHAPITRES[e.c].etapes.length - 1, el = $('#chapHud');
  if (el && !CH.guide()) {
    el.hidden = false; el.classList.add('reussi');
    $('#chapTitre').textContent = finChapitre ? `Chapitre ${e.c + 1} terminé !` : 'Étape réussie !';
    $('#chapCompte').textContent = ''; $('#chapBarre').style.setProperty('--p', '100%');
    $('#chapEtape').textContent = e.texte; $('#chapPrime').textContent = e.prime ? `+${fmt(e.prime)}` : '';
  }
  CH.fete = 3.2;
  if (finChapitre) CH.ligne(CH.i < ETAPES.length ? `Chapitre ${e.c + 1} terminé : « ${CHAPITRES[e.c].titre} ». Place au chapitre ${e.c + 2} : « ${CHAPITRES[e.c + 1].titre} ».` : 'Tu as fini tous les chapitres : bravo, tu es quelqu’un à Cotonou !');
}
// Après les quatre chapitres : des paliers de fortune, chacun avec son titre (un but de long terme, au lieu de « continue »).
const PALIERS = [[50000, 'Petit patron', 'Petite patronne'], [150000, 'Commerçant reconnu', 'Commerçante reconnue'], [400000, 'Magnat de Dantokpa', 'Magnate de Dantokpa'], [1000000, 'Roi de Cotonou', 'Reine de Cotonou']];
let palierVu = null; // le palier déjà montré : seul un nouveau palier pendant la partie est annoncé
function afficherPaliers() {
  const argent = VIE.data?.argent || 0, titre = i => PALIERS[i][VIE.femme ? 2 : 1];
  const atteint = PALIERS.reduce((r, [seuil], i) => (argent >= seuil ? i : r), -1), suivant = PALIERS[atteint + 1];
  if (palierVu !== null && atteint > palierVu) { CH.ligne(`Nouveau titre : ${titre(atteint)} ! Ta fortune dépasse ${fmt(PALIERS[atteint][0])}.`); son('piece'); }
  palierVu = atteint;
  $('#chapTitre').textContent = atteint >= 0 ? titre(atteint) : 'Tous les chapitres terminés'; $('#chapCompte').textContent = '';
  const bas = atteint >= 0 ? PALIERS[atteint][0] : 0;
  $('#chapBarre').style.setProperty('--p', `${suivant ? Math.round(Math.min(1, (argent - bas) / (suivant[0] - bas)) * 100) : 100}%`);
  $('#chapEtape').textContent = suivant ? `Prochain titre : « ${titre(atteint + 1)} » à ${fmt(suivant[0])} (tu as ${fmt(argent)}). Tes commerces travaillent pour toi : ${nbCommerces()} ouvert${nbCommerces() > 1 ? 's' : ''}.` : `Tu es au sommet de Cotonou avec ${fmt(argent)}.`;
  $('#chapPrime').textContent = '';
}
function masquerSiGuide() { const el = $('#chapHud'); if (el && CH.guide() && !el.hidden) el.hidden = true; }
function afficher() {
  const el = $('#chapHud'); if (!el) return;
  el.classList.remove('reussi');
  if (!CH.charge || CH.guide()) { el.hidden = true; return; }
  const e = etape(); el.hidden = false;
  if (!e) return afficherPaliers();
  const C = CHAPITRES[e.c];
  $('#chapTitre').textContent = `Chapitre ${e.c + 1} · ${C.titre}`;
  $('#chapCompte').textContent = `${e.k}/${C.etapes.length}`;
  $('#chapBarre').style.setProperty('--p', `${Math.round(e.k / C.etapes.length * 100)}%`);
  $('#chapEtape').textContent = e.texte + (e.but > 1 ? ` (${e.F ? `${fmt(Math.min(CH.n, e.but))} sur ${fmt(e.but)}` : `${Math.min(CH.n, e.but)} sur ${e.but}`})` : '');
  $('#chapPrime').textContent = e.prime ? `Prime : ${fmt(e.prime)}` : '';
}
/** Tous les chapitres et leurs étapes : faites, en cours, à venir. */
function montrerChapitres() {
  const el = $('#vieFiche'); if (!el) return;
  const blocs = CHAPITRES.map((C, c) => `<div class="vf-chap${ETAPES.findIndex(e => e.c === c) > CH.i ? ' avenir' : ''}"><b>Chapitre ${c + 1} · ${esc(C.titre)}</b><ol>${C.etapes.map((e, k) => {
    const i = ETAPES.findIndex(x => x.c === c && x.k === k), etat = i < CH.i ? 'fait' : i === CH.i ? 'encours' : '';
    return `<li class="${etat}"><span>${esc(e.texte)}</span>${e.prime ? `<small>${fmt(e.prime)}</small>` : ''}</li>`;
  }).join('')}</ol></div>`).join('');
  fermerFiche();
  $('#vfContenu').innerHTML = `<small class="vf-sur">Ma vie</small><h3 id="vfTitre">Tes chapitres</h3><p class="vf-intro">Chaque étape réussie rapporte une prime. ${chapitreFini() ? 'Tu as tout terminé : bravo !' : `Tu en es à l’étape ${CH.i + 1} sur ${ETAPES.length}.`}</p>${blocs}${etape()?.compte === 'voirLot' || etape()?.fait === ETAPES[9].fait ? '<button type="button" class="jouer vf-ouvrir" data-chap="commerces">Voir les boutiques à louer</button>' : ''}`;
  el.hidden = false;
  el.querySelector('[data-chap]')?.addEventListener('click', listeCommerces);
}
