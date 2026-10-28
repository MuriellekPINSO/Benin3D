// Paiements FedaPay (entrée du concert, ouverture d'un commerce, commandes de la boutique de mode, recharge du compte) par MTN MoMo, Moov Money
// ou Celtiis Cash. La clé secrète ne quitte jamais le serveur (FEDAPAY_SECRET_KEY sur Vercel et dans .env.local).
//
// Paiement « sans redirection » : plus de fenêtre FedaPay. La page de jeu demande l'opérateur et le numéro, puis :
// 1. POST /api/fedapay { etape: 'creer', objet, operateur, numero, mode, montant?, description?, infos? }  →  { id, jeton, montant }
//    Crée la transaction et son jeton. Rien ne part encore vers le téléphone : la page garde l'identifiant AVANT l'envoi,
//    pour retrouver le paiement même si la réponse de l'étape 2 se perd.
// 2. POST /api/fedapay { etape: 'envoyer', id, jeton, operateur, numero }  →  { id, statut: 'pending' }  ou  { statut: <erreur> }
//    Envoie la demande à l'opérateur : elle s'affiche sur le téléphone, le joueur la valide avec son code secret.
// 3. GET /api/fedapay?id=<transaction>&min=<montant attendu>&objet=<objet>&mode=live|sandbox  →  { paye, statut, montant }
//    Relit la transaction : la page la redemande jusqu'à la validation. Un paiement ne vaut que pour son objet.
//
// Le montant de l'entrée du concert et d'un commerce est fixé ici, jamais par la page ; la boutique ne se paie qu'en mode
// test (le serveur ne connaît pas encore les prix des articles). Une recharge (`formule`, src/recharge-formules.js) porte
// l'identifiant du joueur, lu dans son jeton Firebase : seul lui pourra se la faire créditer (api/recharge.js).
// `mode` : celui de la clé publique de la page ; s'il ne
// correspond pas à la clé secrète, on le dit (« cles-incoherentes ») au lieu de laisser croire au joueur qu'il n'a rien payé.
// La même fonction sert en local : vite.config.js la branche sur le serveur de développement.
import { formule } from '../src/recharge-formules.js';

export const MONTANT_MIN = 100;

// Codes FedaPay du paiement sans redirection pour le Bénin (docs v1, « Paiement sans redirection »).
export const OPERATEURS = { mtn: 'mtn_open', moov: 'moov', celtiis: 'sbin' };
const PRIX = { concert: 100, commerce: 100 };
const DESCRIPTIONS = { concert: 'Entrée au concert de l’Esplanade · Kutɔnu Vibes', commerce: 'Ouverture d’un commerce · Kutɔnu Vibes' };
export const PAYES = ['approved', 'transferred']; // « transferred » : payé, puis reversé sur le solde du marchand

const hoteDe = cle => cle.startsWith('sk_live_') ? 'https://api.fedapay.com' : 'https://sandbox-api.fedapay.com';
const modeDe = cle => cle.startsWith('sk_live_') ? 'live' : 'sandbox';

async function appeler(cle, methode, chemin, corps) {
  try {
    const r = await fetch(`${hoteDe(cle)}/v1${chemin}`, {
      method: methode, headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: corps ? JSON.stringify(corps) : undefined, signal: AbortSignal.timeout(10000), // FedaPay ou l'opérateur qui ne répond pas
    });
    let d = null; try { d = await r.json(); } catch { /* corps vide */ }
    return { ok: r.ok, statut: r.status, d };
  } catch { return { ok: false, statut: 0, d: null }; } // délai dépassé, réseau
}
// Journal Vercel : l'étape, le code et le message d'erreur de FedaPay ; jamais le jeton ni le numéro du joueur.
const erreurFedaPay = (etape, r, extra = {}) => {
  console.error(`fedapay ${etape} ${r.statut}`, String(r.d?.message || r.d?.error || '').slice(0, 200));
  return { code: 502, corps: { statut: r.statut ? `fedapay-${etape}-${r.statut}` : 'fedapay-injoignable', ...extra } };
};

/** La transaction telle que FedaPay la connaît (statut, montant, custom_metadata), ou null si FedaPay ne répond pas. */
export async function lireTransaction(id, cle) {
  const r = await appeler(cle, 'GET', `/transactions/${id}`);
  return { ok: r.ok, statut: r.statut, t: r.ok ? r.d?.['v1/transaction'] || r.d?.transaction || r.d || {} : null };
}
export async function verifierPaiement(id, min = MONTANT_MIN, cle = process.env.FEDAPAY_SECRET_KEY, mode = '', objet = '') {
  if (!cle) return { code: 503, corps: { paye: false, statut: 'non-configure' } };
  if (mode && mode !== modeDe(cle)) return { code: 500, corps: { paye: false, statut: 'cles-incoherentes' } };
  if (!/^\d{1,15}$/.test(String(id ?? ''))) return { code: 400, corps: { paye: false, statut: 'identifiant-invalide' } };
  const r = await appeler(cle, 'GET', `/transactions/${id}`);
  if (!r.ok) return { code: 502, corps: { paye: false, statut: r.statut ? `fedapay-${r.statut}` : 'fedapay-injoignable' } };
  const t = r.d?.['v1/transaction'] || r.d?.transaction || r.d || {};
  // Un paiement ne vaut que pour ce qu'il a payé : le billet du concert n'ouvre pas un commerce.
  const pour = t.custom_metadata?.objet;
  if (objet && pour && pour !== objet) return { code: 200, corps: { paye: false, statut: 'autre-objet' } };
  const attendu = Math.max(MONTANT_MIN, Number(min) || 0);
  return { code: 200, corps: { paye: PAYES.includes(t.status) && Number(t.amount) >= attendu, statut: t.status, montant: Number(t.amount) } };
}

// Le jeton Firebase du joueur : la base ne laisse lire sa vie (zem_vies/<uid>) qu'à lui. Si elle accepte de la lire avec
// ce jeton, il est authentique, et l'identifiant qu'il porte est bien le sien (même vérification que api/faux-frere.js).
export const BASE = 'https://zem-run-cotonou-default-rtdb.europe-west1.firebasedatabase.app';
export async function uidVerifie(jeton, base = BASE) {
  jeton = String(jeton || ''); if (!jeton || jeton.length > 4000) return '';
  let uid = ''; try { const p = JSON.parse(Buffer.from(jeton.split('.')[1], 'base64url').toString()); uid = String(p.user_id || p.sub || ''); } catch { return ''; }
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) return '';
  try { const r = await fetch(`${base}/zem_vies/${uid}/nom.json?auth=${encodeURIComponent(jeton)}`, { signal: AbortSignal.timeout(8000) }); return r.ok && (await r.json()) ? uid : ''; } // sans vie, pas de compte à recharger
  catch { return ''; }
}

/** Numéro béninois → 10 chiffres « 01XXXXXXXX » (les anciens numéros à 8 chiffres reçoivent le 01 du nouveau plan), ou null. */
export function numeroBenin(n) {
  let c = String(n ?? '').replace(/[^\d+]/g, '').replace(/^(\+|00)229/, '');
  if (/^\d{8}$/.test(c)) c = '01' + c;
  return /^01\d{8}$/.test(c) ? c : null;
}

// Garde-fou contre les demandes de paiement en rafale vers n'importe quel numéro, et contre le balayage des transactions :
// quelques essais par adresse IP et par numéro sur 10 minutes. En mémoire de l'instance seulement (une fonction Vercel peut
// en avoir plusieurs) : ça freine un abus, ça ne l'empêche pas complètement.
const ESSAIS = new Map(), FENETRE = 10 * 60e3;
function tropDEssais(cle, max) {
  const t = Date.now(), l = (ESSAIS.get(cle) || []).filter(x => t - x < FENETRE);
  l.push(t); ESSAIS.set(cle, l);
  if (ESSAIS.size > 5000) for (const [k, v] of ESSAIS) if (t - v.at(-1) > FENETRE) ESSAIS.delete(k);
  return l.length > max;
}

/** Étape 1 : la transaction et son jeton, sans rien envoyer au téléphone. */
export async function creerPaiement(q, cle = process.env.FEDAPAY_SECRET_KEY, ip = '') {
  if (!cle) return { code: 503, corps: { statut: 'non-configure' } };
  if (q.mode && q.mode !== modeDe(cle)) return { code: 500, corps: { statut: 'cles-incoherentes' } };
  const numero = numeroBenin(q.numero);
  if (!OPERATEURS[q.operateur]) return { code: 400, corps: { statut: 'operateur-invalide' } };
  if (!numero) return { code: 400, corps: { statut: 'numero-invalide' } };
  let montant = PRIX[q.objet], description = DESCRIPTIONS[q.objet], serveur = {};
  if (q.objet === 'boutique' && modeDe(cle) === 'sandbox') { montant = Math.round(Number(q.montant)); description = String(q.description || 'Boutique de mode · Kutɔnu Vibes').slice(0, 140); }
  if (q.objet === 'recharge') {
    const F = formule(q.formule); if (!F) return { code: 400, corps: { statut: 'objet-invalide' } };
    const uid = await uidVerifie(q.jeton); if (!uid) return { code: 401, corps: { statut: 'jeton-refuse' } };
    montant = F.prix; description = `Recharge : ${F.credit.toLocaleString('fr-FR')} F dans le jeu · Kutɔnu Vibes`; serveur = { formule: F.id, uid };
  }
  if (!montant || montant < MONTANT_MIN || montant > 200000) return { code: 400, corps: { statut: 'objet-invalide' } };
  if (tropDEssais(`ip:${ip}`, 8) || tropDEssais(`no:${numero}`, 4)) return { code: 429, corps: { statut: 'trop-d-essais' } };
  const infos = Object.fromEntries(Object.entries(q.infos && typeof q.infos === 'object' ? q.infos : {}).slice(0, 10).map(([k, v]) => [String(k).slice(0, 30), String(v).slice(0, 80)]));
  const t = await appeler(cle, 'POST', '/transactions', {
    description, amount: montant, currency: { iso: 'XOF' }, custom_metadata: { ...infos, objet: q.objet, ...serveur }, // la page ne réécrit ni l'objet, ni la formule, ni le joueur
    customer: { firstname: 'Joueur', lastname: 'Kutonu Vibes', phone_number: { number: numero, country: 'bj' } },
  });
  const id = (t.d?.['v1/transaction'] || t.d?.transaction || t.d)?.id;
  if (!t.ok || !id) return erreurFedaPay('creation', t);
  const j = await appeler(cle, 'POST', `/transactions/${id}/token`);
  if (!j.ok || !j.d?.token) return erreurFedaPay('jeton', j);
  return { code: 200, corps: { id: String(id), jeton: j.d.token, montant } };
}

/** Étape 2 : la demande de validation part sur le téléphone du joueur. */
export async function envoyerPaiement(q, cle = process.env.FEDAPAY_SECRET_KEY, ip = '') {
  if (!cle) return { code: 503, corps: { statut: 'non-configure' } };
  const methode = OPERATEURS[q.operateur], numero = numeroBenin(q.numero), id = String(q.id ?? ''), jeton = String(q.jeton ?? '');
  if (!methode) return { code: 400, corps: { statut: 'operateur-invalide' } };
  if (!numero) return { code: 400, corps: { statut: 'numero-invalide' } };
  if (!/^\d{1,15}$/.test(id) || !jeton || jeton.length > 2000) return { code: 400, corps: { statut: 'identifiant-invalide' } };
  if (tropDEssais(`envoi:${ip}`, 10) || tropDEssais(`envoi-no:${numero}`, 5)) return { code: 429, corps: { statut: 'trop-d-essais' } };
  // Le SDK officiel poste sur /v1/<mode> ; la référence d'API récente parle de /v1/transactions/<mode> : on essaie le
  // second seulement si le premier n'existe pas.
  const corps = { token: jeton, phone_number: { number: numero, country: 'bj' } };
  let e = await appeler(cle, 'POST', `/${methode}`, corps);
  if (e.statut === 404) e = await appeler(cle, 'POST', `/transactions/${methode}`, corps);
  if (!e.ok) return erreurFedaPay('envoi', e, { id });
  return { code: 200, corps: { id, statut: 'pending' } };
}

export async function lireCorps(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel a déjà lu le JSON
  let brut = ''; for await (const morceau of req) { brut += morceau; if (brut.length > 10000) break; }
  try { return JSON.parse(brut || '{}'); } catch { return {}; }
}
// Seules les pages du jeu demandent un paiement (les navigateurs envoient toujours Origin sur un POST) : en ligne, le
// domaine et les aperçus Vercel du projet « tours » ; en local (vite.config.js), localhost et le wifi de la maison.
const ORIGINES_EN_LIGNE = /^https:\/\/((www\.|test\.)?(xn--kutnuvibes-ghe|kotonuvibes)\.com|tours[\w-]*\.vercel\.app)$/; // les deux noms de domaine du site, et le site de test (test.kotonuvibes.com, branche staging)
const ORIGINES_LOCALES = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/;
export const origineAdmise = o => ORIGINES_EN_LIGNE.test(o) || (!process.env.VERCEL && ORIGINES_LOCALES.test(o));

export default async function handler(req, res, cle = process.env.FEDAPAY_SECRET_KEY) { // en local, vite.config.js passe la clé de .env.local
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  let r;
  try {
    if (req.method === 'POST') {
      const q = await lireCorps(req);
      if (!origineAdmise(req.headers.origin || '')) r = { code: 403, corps: { statut: 'origine-refusee' } };
      else if (q.etape === 'envoyer') r = await envoyerPaiement(q, cle, ip);
      else r = await creerPaiement(q, cle, ip);
    } else if (tropDEssais(`verif:${ip}`, 300)) r = { code: 429, corps: { paye: false, statut: 'trop-d-essais' } };
    else {
      const q = new URL(req.url, 'http://local').searchParams;
      r = await verifierPaiement(q.get('id'), q.get('min'), cle, q.get('mode') || '', q.get('objet') || '');
    }
  } catch (e) { console.error('fedapay', e?.message); r = { code: 502, corps: { paye: false, statut: 'fedapay-injoignable' } }; }
  res.statusCode = r.code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(r.corps));
}
