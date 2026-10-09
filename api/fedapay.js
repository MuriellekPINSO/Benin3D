// Vérifie un paiement FedaPay (entrée du concert, commandes de la boutique de mode) payé par MTN MoMo ou
// Moov Money. La page envoie l'identifiant de la transaction et le montant attendu ; on la relit chez
// FedaPay avec la clé secrète, qui ne quitte jamais le serveur (FEDAPAY_SECRET_KEY sur Vercel et dans
// .env.local).
//   GET /api/fedapay?id=<transaction>&min=<montant attendu>  →  { paye: true | false, statut, montant }
// (Version de test : le montant attendu vient de la page. Pour de vraies ventes, le serveur devra
// connaître lui-même le prix des articles et créer la transaction.)
// La même fonction sert en local : vite.config.js la branche sur le serveur de développement.
export const MONTANT_MIN = 50;

export async function verifierPaiement(id, min = MONTANT_MIN, cle = process.env.FEDAPAY_SECRET_KEY) {
  if (!cle) return { code: 503, corps: { paye: false, statut: 'non-configure' } };
  if (!/^\d{1,15}$/.test(String(id ?? ''))) return { code: 400, corps: { paye: false, statut: 'identifiant-invalide' } };
  // sk_live_… : vrais paiements ; sk_sandbox_… : mode test.
  const hote = cle.startsWith('sk_live_') ? 'https://api.fedapay.com' : 'https://sandbox-api.fedapay.com';
  const r = await fetch(`${hote}/v1/transactions/${id}`, { headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json' } });
  if (!r.ok) return { code: 502, corps: { paye: false, statut: `fedapay-${r.status}` } };
  const d = await r.json(), t = d['v1/transaction'] || d.transaction || d;
  const attendu = Math.max(MONTANT_MIN, Number(min) || 0);
  return { code: 200, corps: { paye: t.status === 'approved' && Number(t.amount) >= attendu, statut: t.status, montant: Number(t.amount) } };
}

export default async function handler(req, res) {
  const q = new URL(req.url, 'http://local').searchParams;
  let r;
  try { r = await verifierPaiement(q.get('id'), q.get('min')); } catch { r = { code: 502, corps: { paye: false, statut: 'fedapay-injoignable' } }; }
  res.statusCode = r.code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(r.corps));
}
