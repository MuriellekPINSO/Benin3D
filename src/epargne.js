import { $ } from './base.js';
import { son } from './audio.js';
import { fermerFiche } from './commerces.js';
import { joueur } from './firebase.js';
import { DEPOT_MIN, JOURS_MAX, MAX_EPARGNE, PLAFOND_JOUR, TAUX, interetDuJour, jourDe, operer } from './epargne-regles.js';
import { VIE, ecrire, pendantRecharge, rendreVie } from './vie.js';

// ---------- Mon épargne : l'argent mis de côté rapporte chaque jour ----------
// La banque de Lagos Life, à la mode d'ici : on met de côté ce qu'on gagne, et chaque soir à 20 h l'épargne grandit
// (2 %, 2 000 F par jour au plus, src/epargne-regles.js). Les intérêts attendent trois jours : au-delà, ils s'arrêtent
// jusqu'à son retour. C'est le serveur qui tient l'épargne (api/epargne.js) : un retrait arrive d'un coup, et personne ne
// s'invente des intérêts. Avec ?salon-local (mode test, sans serveur), les mêmes règles tournent dans la page.

const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const MESSAGES = {
  montant: `Le dépôt commence à ${fmt(DEPOT_MIN)}.`,
  'pas-assez': 'Tu n’as pas autant.',
  plafond: `L’épargne s’arrête à ${fmt(MAX_EPARGNE)}.`,
  'trop-d-essais': 'Doucement : réessaie dans une minute.',
};
const EP = { charge: false, occupe: false, jour: '', t: 0, msg: '', ligne: () => { } };
const ouverte = () => !$('#vieFiche')?.hidden && !!$('#vfContenu .ep');
const solde = () => VIE.data?.epargne || 0;

/** Une opération : au serveur, ou dans la page en mode test. Pendant l'appel, les gains du jeu attendent (vie.js pendantRecharge). */
async function appeler(action, montant = 0) {
  if (VIE.local) {
    const r = operer(VIE.data, action, montant, jourDe(Date.now()));
    if (r.refus) return { statut: r.refus };
    if (r.change) await ecrire(r.patch);
    return { statut: 'ok', ...r.patch, interets: r.interets, jours: r.jours };
  }
  return pendantRecharge(async () => {
    try {
      const jeton = await (await joueur()).getIdToken();
      const j = await (await fetch('/api/epargne', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ jeton, action, montant }) })).json();
      if ('epargne' in j) Object.assign(VIE.data, { epargne: j.epargne, eJ: j.eJ, eI: j.eI }); // l'argent, pendantRecharge le relit
      return j;
    } catch (e) { console.warn('épargne', e?.message); return { statut: 'serveur-injoignable' }; }
  });
}
/** Les intérêts des jours passés : versés à l'entrée dans le salon, et à 20 h si l'on joue. */
async function toucher() {
  if (!(solde() > 0) || VIE.data.eJ === jourDe(Date.now()) || EP.occupe) return;
  EP.occupe = true;
  const r = await appeler('etat'); EP.occupe = false; rendreVie();
  if (r.statut === 'ok' && r.interets > 0) { son('piece'); EP.ligne(`🏦 Ton épargne t’a rapporté +${fmt(r.interets)}${r.jours > 1 ? ` (${r.jours} jours)` : ''}. Elle est à ${fmt(r.epargne)}.`); }
  if (ouverte()) afficher();
}

export function initEpargne({ ligne }) {
  EP.ligne = ligne;
  $('#slEpargne')?.addEventListener('click', ouvrirEpargne);
  if (import.meta.env.DEV) window.__epargne = { EP, toucher }; // pour les tests
}
export function entrerEpargne() { EP.charge = true; EP.jour = jourDe(Date.now()); EP.msg = ''; toucher(); }
export function quitterEpargne() { EP.charge = false; }
export function majEpargne(dt) {
  if (!EP.charge || !VIE.data) return;
  EP.t -= dt; if (EP.t > 0) return; EP.t = 2;
  const jour = jourDe(Date.now()); if (jour !== EP.jour) { EP.jour = jour; toucher(); }
}

// ---------- La fenêtre ----------
export function ouvrirEpargne() { if (EP.charge && VIE.data) { EP.msg = ''; afficher(); } }
function afficher() {
  const el = $('#vieFiche'); if (!el) return;
  if (!ouverte()) fermerFiche();
  const e = solde(), argent = VIE.data.argent || 0, ce = interetDuJour(e);
  $('#vfContenu').innerHTML = `<div class="ep"><small class="vf-sur">Ma vie</small><h3 id="vfTitre">Mon épargne</h3>
    <div class="jr-tete"><span class="ep-solde"><b>${fmt(e)}</b><small>mis de côté</small></span><span><b>${fmt(argent)}</b><small>en poche</small></span></div>
    <p class="vf-intro">Ton épargne grandit de ${Math.round(TAUX * 100)} % chaque soir à 20 h, ${fmt(PLAFOND_JOUR)} par jour au plus. ${e ? `Ce soir : +${fmt(ce)}.` : 'Mets de l’argent de côté pour commencer.'} Reviens au moins tous les ${JOURS_MAX} jours : au-delà, les intérêts s’arrêtent jusqu’à ton retour.</p>
    ${VIE.data.eI ? `<p class="ep-total">Intérêts reçus en tout : ${fmt(VIE.data.eI)}</p>` : ''}
    <div class="ep-saisie"><input id="epMontant" type="number" inputmode="numeric" min="0" step="500" placeholder="Montant (F)" aria-label="Montant en francs"><div class="ep-vite">${[1000, 5000, 20000].map(m => `<button type="button" class="vf-bouton" data-ep-m="${m}">${fmt(m)}</button>`).join('')}<button type="button" class="vf-bouton" data-ep-m="tout">Tout</button></div></div>
    <div class="ep-actions"><button type="button" class="jouer" data-ep="deposer">Déposer</button><button type="button" class="vf-bouton" data-ep="retirer">Retirer</button></div>
    <p class="ep-msg" id="epMsg" role="status">${EP.msg}</p></div>`;
  el.hidden = false;
  const champ = $('#epMontant');
  // « Tout » : tout son argent pour un dépôt (jusqu'au plafond), toute l'épargne pour un retrait ; le bouton suivant décide.
  for (const b of el.querySelectorAll('[data-ep-m]')) b.addEventListener('click', () => { champ.value = b.dataset.epM === 'tout' ? '' : b.dataset.epM; champ.dataset.tout = b.dataset.epM === 'tout' ? '1' : ''; champ.placeholder = b.dataset.epM === 'tout' ? 'Tout' : 'Montant (F)'; });
  champ.addEventListener('input', () => { champ.dataset.tout = ''; });
  for (const b of el.querySelectorAll('[data-ep]')) b.addEventListener('click', () => agir(b.dataset.ep, champ.dataset.tout ? 'tout' : champ.value));
}
async function agir(action, saisie) {
  if (EP.occupe) return;
  const montant = saisie === 'tout' ? (action === 'deposer' ? Math.min(VIE.data.argent || 0, MAX_EPARGNE - solde()) : solde()) : Math.floor(Number(saisie) || 0);
  if (!(montant > 0)) { EP.msg = 'Choisis un montant.'; afficher(); return; }
  EP.occupe = true; EP.msg = action === 'deposer' ? 'Dépôt en cours…' : 'Retrait en cours…'; afficher();
  const r = await appeler(action, montant); EP.occupe = false; rendreVie();
  if (r.statut === 'ok') { son('piece'); EP.msg = action === 'deposer' ? `${fmt(montant)} mis de côté.` : `${fmt(montant)} retirés : ils sont dans ta poche.`; }
  else EP.msg = MESSAGES[r.statut] || 'Le guichet ne répond pas. Réessaie dans un moment.';
  if (ouverte()) afficher();
}
