// ---------- Paiement réel par Mobile Money (FedaPay Checkout) ----------
// Une petite fenêtre FedaPay : le joueur choisit MTN MoMo ou Moov Money, tape son numéro, puis valide
// sur son téléphone. Le paiement est ensuite vérifié par /api/fedapay (clé secrète côté serveur).
// Sans clé publique (VITE_FEDAPAY_PUBLIC_KEY dans .env.local et sur Vercel), le jeu n'en parle pas.
const CLE = import.meta.env.VITE_FEDAPAY_PUBLIC_KEY || '';
export const paiementReel = () => !!CLE;

let script = null;
const chargerCheckout = () => script ??= new Promise((ok, ko) => {
  const s = document.createElement('script');
  s.src = 'https://cdn.fedapay.com/checkout.js?v=1.1.7';
  s.onload = () => ok(window.FedaPay);
  s.onerror = () => { script = null; s.remove(); ko(new Error('checkout.js')); };
  document.head.appendChild(s);
});
const pause = ms => new Promise(r => setTimeout(r, ms));

/**
 * Ouvre la fenêtre FedaPay. Résout { paye, statut, id } : statut 'annule' si le joueur ferme la fenêtre,
 * 'reseau' si FedaPay ou le serveur ne répondent pas, sinon le statut FedaPay (approved, pending, declined…).
 */
export async function payerMoMo({ montant, description, objet, infos = {} }) {
  let FedaPay;
  try { FedaPay = await chargerCheckout(); } catch { return { paye: false, statut: 'reseau' }; }
  const transaction = await new Promise(fini => FedaPay.init({
    public_key: CLE,
    environment: CLE.startsWith('pk_live_') ? 'live' : 'sandbox',
    locale: document.documentElement.lang === 'en' ? 'en' : 'fr',
    transaction: { amount: montant, description, custom_metadata: { objet, ...infos } },
    currency: { iso: 'XOF' },
    onComplete: ({ reason, transaction }) => fini(reason === FedaPay.CHECKOUT_COMPLETED ? transaction : null),
  }).open());
  if (!transaction?.id) return { paye: false, statut: 'annule' };
  return verifierTransaction(transaction.id, montant);
}

/** Demande au serveur si la transaction est payée. La validation sur le téléphone peut arriver quelques
 *  secondes après la fermeture de la fenêtre : tant qu'elle est « pending », on redemande (24 s au plus). */
export async function verifierTransaction(id, montant = 0) {
  let r = { paye: false, statut: 'reseau' };
  for (let essai = 0; essai < 8; essai++) {
    try { r = await (await fetch(`/api/fedapay?id=${encodeURIComponent(id)}&min=${montant}`, { cache: 'no-store' })).json(); }
    catch { r = { paye: false, statut: 'reseau' }; }
    if (r.paye || r.statut !== 'pending') break;
    await pause(3000);
  }
  return { ...r, id };
}
