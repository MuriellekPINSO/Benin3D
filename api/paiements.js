// Les paiements du jeu, pour le tableau de bord (public/tableau.html ; middleware.js exige le même code d'accès) : relus
// chez FedaPay avec la clé secrète, qui ne quitte jamais le serveur. Le compte FedaPay est partagé avec Qualiwo : on ne
// garde que les transactions du jeu, reconnues à leur custom_metadata.objet (concert, commerce, boutique).
// Aucune donnée du client (nom, numéro) n'est renvoyée.
//   GET /api/paiements → { recus, montant, aujourdhui, semaine, tentatives, parObjet, derniers, lu }
const OBJETS = ['concert', 'commerce', 'boutique'];
const PAYES = ['approved', 'transferred'];
const OPERATEURS = { mtn_open: 'MTN', moov: 'Moov', sbin: 'Celtiis', mtn_open_ci: 'MTN Côte d’Ivoire', moov_tg: 'Moov Togo' };
const B = 3600e3; // heure du Bénin (UTC+1)
let memo = { t: 0, corps: null }; // une minute de répit entre deux lectures chez FedaPay

export async function paiementsDuJeu(cle) {
  if (memo.corps && Date.now() - memo.t < 60e3) return memo.corps;
  const hote = cle.startsWith('sk_live_') ? 'https://api.fedapay.com' : 'https://sandbox-api.fedapay.com', tout = [];
  for (let page = 1; page <= 20; page++) { // les plus récentes d'abord, 100 par page
    const r = await fetch(`${hote}/v1/transactions/search?per_page=100&page=${page}`, { headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`fedapay-${r.status}`);
    const d = await r.json(); tout.push(...(d['v1/transactions'] || []));
    if (!d.meta?.next_page) break;
  }
  const jeu = tout.filter(t => OBJETS.includes(t.custom_metadata?.objet));
  const minuit = Math.floor((Date.now() + B) / 864e5) * 864e5 - B, lundi = minuit - ((new Date(minuit + B).getUTCDay() + 6) % 7) * 864e5;
  const payes = jeu.filter(t => PAYES.includes(t.status)), quand = t => Date.parse(t.created_at);
  const parObjet = Object.fromEntries(OBJETS.map(o => { const l = payes.filter(t => t.custom_metadata.objet === o); return [o, { recus: l.length, montant: l.reduce((s, t) => s + Number(t.amount || 0), 0) }]; }));
  const corps = {
    recus: payes.length, montant: payes.reduce((s, t) => s + Number(t.amount || 0), 0),
    aujourdhui: payes.filter(t => quand(t) >= minuit).length, semaine: payes.filter(t => quand(t) >= lundi).length,
    tentatives: jeu.length - payes.length - jeu.filter(t => t.status === 'pending' && Date.now() - quand(t) < 15 * 60e3).length, // en attente depuis peu : pas encore un échec
    parObjet,
    derniers: jeu.slice(0, 15).map(t => ({ t: t.created_at, objet: t.custom_metadata.objet, quoi: String(t.description || '').replace(/ · Kutɔnu Vibes$/, '').slice(0, 80), montant: Number(t.amount || 0), operateur: OPERATEURS[t.mode] || '', statut: t.status })),
    lu: new Date().toISOString(),
  };
  memo = { t: Date.now(), corps };
  return corps;
}

export default async function handler(req, res, cle = process.env.FEDAPAY_SECRET_KEY) { // en local, vite.config.js passe la clé de .env.local
  let code = 200, corps;
  if (!cle) { code = 503; corps = { erreur: 'non-configure' }; }
  else try { corps = await paiementsDuJeu(cle); } catch (e) { console.error('paiements', e?.message); code = 502; corps = { erreur: 'fedapay-injoignable' }; }
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(corps));
}
