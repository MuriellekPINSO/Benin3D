// ---------- Paiement réel par Mobile Money (FedaPay, sans redirection) ----------
// Notre propre petite fenêtre : le joueur choisit MTN MoMo, Moov Money ou Celtiis Cash et tape son numéro. Au clic sur
// « Payer », /api/fedapay crée la transaction et l'envoie à l'opérateur : la demande de validation s'affiche aussitôt sur
// le téléphone du joueur, qui la valide avec son code secret. Plus de formulaire FedaPay (choix du moyen, e-mail du reçu).
// Le paiement est ensuite vérifié par /api/fedapay (clé secrète côté serveur).
// Sans clé publique (VITE_FEDAPAY_PUBLIC_KEY dans .env.local et sur Vercel), le jeu n'en parle pas.
const CLE = import.meta.env.VITE_FEDAPAY_PUBLIC_KEY || '';
export const paiementReel = () => !!CLE;
/** Clé de test (sandbox) : aucun vrai argent ; le joueur paie avec un numéro de test. */
export const paiementTest = () => CLE.startsWith('pk_sandbox_');
const MODE = CLE.startsWith('pk_live_') ? 'live' : 'sandbox';
/** Seuls ces statuts disent que rien n'a été prélevé ; les autres (réseau, vérification impossible…) laissent un doute :
 *  on garde alors le numéro de la transaction pour la vérifier de nouveau. */
export const echecCertain = statut => ['annule', 'declined', 'canceled'].includes(statut);

const pause = ms => new Promise(r => setTimeout(r, ms));
const OPERATEURS = [['mtn', 'MTN MoMo'], ['moov', 'Moov Money'], ['celtiis', 'Celtiis Cash']];
const CLE_MEMO = 'kutonu.momo'; // dernier opérateur et numéro utilisés, gardés sur l'appareil du joueur seulement
const lireMemo = () => { try { return JSON.parse(localStorage.getItem(CLE_MEMO) || '{}'); } catch { return {}; } };
const ecrireMemo = m => { try { localStorage.setItem(CLE_MEMO, JSON.stringify(m)); } catch { /* navigation privée */ } };
/** Les 10 chiffres d'un numéro béninois (01XXXXXXXX ; un ancien numéro à 8 chiffres reçoit le 01), ou null. */
const numeroBenin = n => { let c = String(n).replace(/[^\d+]/g, '').replace(/^(\+|00)229/, ''); if (/^\d{8}$/.test(c)) c = '01' + c; return /^01\d{8}$/.test(c) ? c : null; };
const fmt = n => `${n.toLocaleString('fr-FR')} F`;
// Ce que le serveur peut répondre quand la demande ne part pas : le joueur corrige et réessaie, rien n'a été prélevé.
const REFUS = {
  'numero-invalide': 'Ce numéro ne semble pas béninois. Tape tes 10 chiffres, en commençant par 01.',
  'operateur-invalide': 'Choisis ton opérateur.',
  'trop-d-essais': 'Trop d’essais d’affilée. Attends quelques minutes, puis réessaie.',
  'non-configure': 'Le paiement Mobile Money n’est pas encore activé sur ce site.',
  'cles-incoherentes': 'Le paiement est mal réglé sur ce site. Réessaie plus tard.',
  reseau: 'Pas de connexion. Vérifie ton réseau, puis réessaie.',
};

function fenetre() {
  let el = document.getElementById('momo');
  if (el) return el;
  el = document.createElement('div'); el.id = 'momo'; el.className = 'momo'; el.hidden = true;
  el.innerHTML = `<form class="momo-carte panel" role="dialog" aria-modal="true" aria-labelledby="momoTitre" novalidate>
    <small class="ev-sur">Mobile Money</small>
    <h2 id="momoTitre"></h2>
    <p class="momo-objet"></p>
    <p class="momo-label" id="momoOpLabel">Ton opérateur</p>
    <div class="momo-ops" role="group" aria-labelledby="momoOpLabel">${OPERATEURS.map(([k, nom]) => `<button type="button" aria-pressed="false" data-op="${k}">${nom}</button>`).join('')}</div>
    <label class="momo-label" for="momoNumero">Ton numéro</label>
    <input id="momoNumero" class="momo-numero" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="01 XX XX XX XX" maxlength="20">
    <p class="ev-etat momo-etat" role="status" aria-live="polite" hidden></p>
    <div class="ev-actions"><button type="submit" class="jouer momo-payer"></button><button type="button" class="btn-ghost momo-fermer">Annuler</button></div>
    <p class="momo-note">Tu valides sur ton téléphone avec ton code secret Mobile Money. Paiement sécurisé par FedaPay.</p>
  </form>`;
  (document.getElementById('app') || document.body).append(el);
  return el;
}

const appelerApi = async corps => {
  try { return await (await fetch('/api/fedapay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify(corps) })).json(); }
  catch { return { statut: 'reseau' }; }
};
let enCours = null; // la fenêtre ne sert qu'à un paiement à la fois : un nouvel appel termine le précédent

/**
 * Ouvre notre fenêtre de paiement. Résout { paye, statut, id } : statut 'annule' si le joueur ferme avant que la demande
 * parte, 'reseau' si le serveur ne répond pas, sinon le statut FedaPay (approved, pending, declined…). Dès que la
 * transaction existe, fermer la fenêtre rend 'pending' avec son numéro : le paiement peut encore aboutir.
 */
export function payerMoMo({ montant, description, objet, infos = {} }) {
  enCours?.({ paye: false, statut: 'annule' });
  const el = fenetre(), f = el.querySelector('form'), num = el.querySelector('#momoNumero'), etat = el.querySelector('.momo-etat');
  const payer = el.querySelector('.momo-payer'), fermer = el.querySelector('.momo-fermer'), ops = [...el.querySelectorAll('[data-op]')];
  const memo = lireMemo(); let op = OPERATEURS.some(([k]) => k === memo.op) ? memo.op : '';
  const choisir = k => { op = k; ops.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.op === k))); };
  const dire = (txt, cls = '') => { etat.textContent = txt; etat.className = `ev-etat momo-etat ${cls}`; etat.hidden = !txt; };
  const saisie = actif => { payer.disabled = !actif; num.disabled = !actif; ops.forEach(b => { b.disabled = !actif; }); };
  el.querySelector('#momoTitre').textContent = `Payer ${fmt(montant)}`;
  el.querySelector('.momo-objet').textContent = description;
  payer.textContent = `Payer ${fmt(montant)}`; payer.hidden = false; payer.classList.remove('charge');
  fermer.textContent = 'Annuler'; num.value = memo.numero || ''; saisie(true);
  choisir(op); dire(paiementTest() ? 'Mode test : choisis MTN et le numéro 0164000001. Aucun vrai argent n’est débité.' : '');
  el.hidden = false; setTimeout(() => (op && num.value ? payer : num).focus(), 50);

  return new Promise(fini => {
    let id = null, fin = false;
    const terminer = r => {
      if (fin) return; fin = true; el.hidden = true; enCours = null;
      ops.forEach(b => { b.onclick = null; }); f.onsubmit = fermer.onclick = null; document.removeEventListener('keydown', clavier, true);
      fini(r);
    };
    enCours = terminer;
    // Échap ferme, où que soit le focus ; Tab reste dans la fenêtre.
    const clavier = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer.click(); return; }
      if (e.key !== 'Tab') return;
      const l = [...f.querySelectorAll('button, input')].filter(x => !x.disabled && !x.hidden), i = l.indexOf(document.activeElement);
      if (i < 0 || (e.shiftKey && i === 0) || (!e.shiftKey && i === l.length - 1)) { e.preventDefault(); l[e.shiftKey ? l.length - 1 : 0]?.focus(); }
    };
    document.addEventListener('keydown', clavier, true);
    ops.forEach(b => { b.onclick = () => choisir(b.dataset.op); });
    fermer.onclick = () => terminer(id ? { paye: false, statut: 'pending', id } : { paye: false, statut: 'annule' });
    f.onsubmit = async e => {
      e.preventDefault();
      if (id || payer.disabled) return;
      const numero = numeroBenin(num.value);
      if (!op) return dire(REFUS['operateur-invalide'], 'mal');
      if (!numero) { num.focus(); return dire(REFUS['numero-invalide'], 'mal'); }
      saisie(false); payer.classList.add('charge'); dire('Envoi de la demande de paiement…');
      // 1. La transaction : rien ne part encore vers le téléphone, donc un échec ici n'a rien prélevé.
      const c = await appelerApi({ etape: 'creer', objet, operateur: op, numero, mode: MODE, montant, description, infos });
      if (fin) return;
      if (!c?.id || !c.jeton) { payer.classList.remove('charge'); saisie(true); return dire(REFUS[c?.statut] || 'Le paiement n’a pas pu être préparé : rien n’a été prélevé. Réessaie dans un instant.', 'mal'); }
      id = c.id; ecrireMemo({ op, numero });
      // 2. L'envoi à l'opérateur. Si la réponse se perd, la demande est peut-être partie : on garde la transaction et on vérifie.
      const r = await appelerApi({ etape: 'envoyer', id, jeton: c.jeton, operateur: op, numero });
      payer.classList.remove('charge');
      if (fin) return;
      if (r?.statut === 'trop-d-essais' || /^fedapay-envoi-4/.test(r?.statut || '') || ['numero-invalide', 'operateur-invalide'].includes(r?.statut)) {
        id = null; saisie(true); // l'opérateur a refusé la demande : elle n'est pas partie, on peut corriger et réessayer
        return dire(r.statut === 'trop-d-essais' ? REFUS['trop-d-essais'] : 'L’opérateur a refusé la demande : rien n’a été prélevé. Vérifie ton numéro et ton opérateur, puis réessaie.', 'mal');
      }
      payer.hidden = true; fermer.textContent = 'Fermer';
      dire(r?.statut === 'pending'
        ? `Regarde ton téléphone : une demande de paiement de ${fmt(montant)} arrive. Valide-la avec ton code secret Mobile Money.`
        : 'La demande est peut-être partie. Si elle s’affiche sur ton téléphone, valide-la : on vérifie pendant 2 minutes.');
      // On attend la validation sur le téléphone (2 min au plus) ; fermer la fenêtre n'annule pas le paiement.
      const v = await verifierTransaction(id, montant, { objet, essais: 40, tant: () => !fin, patient: true });
      if (fin) return;
      if (v.paye) { dire('Paiement reçu, merci !', 'bien'); await pause(900); }
      terminer(v);
    };
  });
}

// Statuts qui disent le dernier mot ; tout autre statut de FedaPay (inconnu, intermédiaire) se revérifie.
const DEFINITIFS = ['approved', 'transferred', 'declined', 'canceled', 'refunded', 'autre-objet', 'identifiant-invalide', 'cles-incoherentes', 'non-configure'];
/** Demande au serveur si la transaction est payée (et payée pour `objet`). Tant qu'elle n'a pas de statut définitif
 *  (validation sur le téléphone pas encore faite), on redemande toutes les 3 s : 8 fois par défaut (24 s), `essais` fois
 *  sinon, tant que `tant()` le permet. `patient` : une coupure de réseau pendant l'attente n'arrête pas la vérification. */
export async function verifierTransaction(id, montant = 0, { objet = '', essais = 8, tant = () => true, patient = false } = {}) {
  let r = { paye: false, statut: 'reseau' };
  for (let essai = 0; essai < essais && tant(); essai++) {
    try { r = await (await fetch(`/api/fedapay?id=${encodeURIComponent(id)}&min=${montant}&objet=${encodeURIComponent(objet)}&mode=${MODE}`, { cache: 'no-store' })).json(); }
    catch { r = { paye: false, statut: 'reseau' }; }
    const s = r.statut || '';
    if (r.paye || DEFINITIFS.includes(s) || (!patient && /^(reseau|fedapay-|trop-d-essais)/.test(s))) break;
    await pause(3000);
  }
  return { ...r, id };
}
