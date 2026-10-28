import { joueur } from './firebase.js';
import { choisir } from './trajets.js';
import { FORMULES } from './recharge-formules.js';
import { echecCertain, paiementReel, payerMoMo } from './paiement.js';
import { VIE, ecrire, pendantRecharge, rendreVie } from './vie.js';

// ---------- Recharger son compte avec du vrai argent ----------
// « Si tu n'as pas l'argent dans ton compte et tu ne veux pas travailler, tu veux recharger ton compte avec du vrai
// argent » (Murielle, 28/10). On paie par Mobile Money (paiement.js), puis le serveur crédite (api/recharge.js), jamais
// la page. Une transaction pas encore créditée (fenêtre fermée avant de valider sur le téléphone, réseau coupé, serveur
// pas encore prêt…) reste gardée sur l'appareil : on la revérifie à chaque entrée en ville, et toutes les 20 s pendant
// 3 min après le paiement.
const CLE = 'kutonu.recharges', JOURS = 30;
const R = { ligne: () => { }, son: () => { }, enCours: false, relance: null };
const fmt = n => `${n.toLocaleString('fr-FR')} F`;
const enAttente = () => { try { return JSON.parse(localStorage.getItem(CLE) || '[]').filter(x => /^\d{1,15}$/.test(x?.id) && Date.now() - x.t < JOURS * 864e5); } catch { return []; } };
const garder = l => { try { localStorage.setItem(CLE, JSON.stringify(l)); } catch { /* navigation privée */ } };
// Le dernier mot du serveur : on ne redemande plus (créditée, déjà créditée, refusée, ou pas une recharge de ce joueur).
const FINIS = ['credite', 'deja', 'declined', 'canceled', 'refunded', 'autre-objet', 'autre-joueur', 'identifiant-invalide'];

// Le jeton Firebase du joueur, qui prouve au serveur à qui créditer. En mode test (?salon-local), la vie est dans le
// navigateur : pas de compte, rien que le serveur puisse créditer.
const jetonJoueur = () => (VIE.local ? Promise.resolve('') : Promise.race([joueur().then(u => u.getIdToken()), new Promise((_, ko) => setTimeout(() => ko(new Error('délai')), 10000))]));

export function initRecharge(ctx) { R.ligne = ctx.ligne; R.son = ctx.son || R.son; }

/** Demande au serveur de créditer la transaction `id` ; les gains du jeu attendent la réponse (vie.js). */
async function crediter(id) {
  let jeton = ''; try { jeton = await jetonJoueur(); } catch { return { statut: 'reseau' }; }
  const r = await pendantRecharge(async () => {
    try { return await (await fetch('/api/recharge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ id, jeton }) })).json(); }
    catch { return { statut: 'reseau' }; }
  });
  if (r?.statut === 'credite' && VIE.local) await ecrire({ argent: VIE.data.argent + r.credit }); // mode test (?salon-local) : la vie est dans le navigateur
  if (FINIS.includes(r?.statut)) garder(enAttente().filter(x => x.id !== id));
  if (r?.statut === 'credite') { R.son('piece'); R.ligne(`Ton compte est rechargé : +${fmt(r.credit)}. Merci !`); rendreVie(); }
  return r || { statut: 'reseau' };
}

/** Les recharges payées mais pas encore créditées : à chaque entrée en ville, et après un paiement pas encore validé. */
export async function verifierRecharges() {
  if (R.enCours || !VIE.data) return; R.enCours = true;
  try { for (const { id } of enAttente()) await crediter(id); }
  finally { R.enCours = false; }
}
function relancer() {
  clearInterval(R.relance); let n = 0;
  R.relance = setInterval(() => { if (++n > 9 || !enAttente().length) clearInterval(R.relance); else verifierRecharges(); }, 20000);
}

/**
 * Le choix d'une formule, puis le paiement. `manque` : ce qu'il manque pour `pour` (« la Tesla Roadster ») ; `puis` :
 * ce qu'on faisait, repris dès que l'argent est arrivé (acheter la voiture, la peindre).
 */
export function proposerRecharge({ manque = 0, pour = '', puis = null } = {}) {
  if (!VIE.data) return;
  if (!paiementReel()) { R.ligne('La recharge par Mobile Money n’est pas encore disponible sur ce site.'); return; }
  const titre = manque > 0 ? `Il te manque ${fmt(manque)}${pour ? ` pour ${pour}` : ''}. Recharger ton compte ?` : 'Recharger ton compte';
  choisir(titre, FORMULES.map(F => ({
    texte: `${fmt(F.credit)} dans le jeu`,
    sous: `Tu paies ${fmt(F.prix)} par Mobile Money${manque > F.credit ? ' · ne suffit pas' : ''}`,
    f: () => payer(F, manque <= F.credit ? puis : null),
  })), { annuler: manque > 0 ? 'Non, je vais travailler' : 'Pas maintenant' });
}

async function payer(F, puis) {
  let jeton = ''; try { jeton = await jetonJoueur(); } catch { R.ligne('Pas de connexion : réessaie dans un instant.'); return; }
  const r = await payerMoMo({ montant: F.prix, description: `Recharge de ton compte : ${fmt(F.credit)} dans le jeu`, objet: 'recharge', extra: { formule: F.id, jeton } });
  if (!r.id || echecCertain(r.statut)) return; // fermé avant l'envoi, ou refusé : rien n'a été prélevé, la fenêtre l'a dit
  garder([...enAttente().filter(x => x.id !== r.id), { id: r.id, t: Date.now() }]); // gardée AVANT de créditer : une coupure ici ne la perd pas
  const c = r.paye ? await crediter(r.id) : { statut: 'pending' };
  if (c.statut === 'credite' || c.statut === 'deja') { puis?.(); return; }
  if (FINIS.includes(c.statut)) { R.ligne('Ce paiement n’a pas pu être ajouté à ton compte.'); return; }
  R.ligne(r.paye ? 'Paiement reçu ! Ton argent arrive sur ton compte dans un instant.' : 'Dès que tu valides le paiement sur ton téléphone, ton argent arrive sur ton compte.');
  relancer();
}
