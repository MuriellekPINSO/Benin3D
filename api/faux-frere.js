// L'arbitre du Faux Frère (fauxfrere.js) : le seul à savoir qui a quel mot. Rien de secret n'est écrit dans la base.
// Les mots se déduisent d'un HMAC du secret FAUX_FRERE_SECRET (réglages Vercel ; en local, .env.local), de la partie, des
// joueurs inscrits et de l'heure du départ (src/faux-frere-regles.js) : l'arbitre les retrouve à chaque appel, sans rien
// garder.
//   POST /api/faux-frere { partie, jeton, quoi: 'mot' }      →  { mot }  (le sien seulement, une fois la partie lancée)
//   POST /api/faux-frere { partie, jeton, quoi: 'verdicts' } →  { verdicts: { [manche]: bool }, fin?: { gagnant, faux, mots } }
// `jeton` : le jeton Firebase du joueur. On lit la partie dans la base AVEC ce jeton : si la base l'accepte, il est vrai,
// et l'identifiant qu'il porte est bien celui du joueur. Un verdict (le joueur éliminé était-il le faux frère ?) n'est
// donné qu'une fois le vote de sa manche clos, d'après les votes de la base et l'heure du serveur.
import { deroule, motsDe } from '../src/faux-frere-regles.js';

const BASE = 'https://zem-run-cotonou-default-rtdb.europe-west1.firebasedatabase.app';
const ORIGINES_EN_LIGNE = /^https:\/\/((www\.)?(xn--kutnuvibes-ghe|kotonuvibes)\.com|tours[\w-]*\.vercel\.app)$/;
const ORIGINES_LOCALES = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|100\.\d+\.\d+\.\d+)(:\d+)?$/;
const origineAdmise = o => ORIGINES_EN_LIGNE.test(o) || (!process.env.VERCEL && ORIGINES_LOCALES.test(o));

/** L'identifiant du joueur dans son jeton (déjà accepté par la base, donc authentique). */
function uidDe(jeton) {
  try { const p = JSON.parse(Buffer.from(String(jeton).split('.')[1], 'base64url').toString()); return String(p.user_id || p.sub || ''); } catch { return ''; }
}
async function lireCorps(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let brut = ''; for await (const morceau of req) { brut += morceau; if (brut.length > 6000) break; }
  try { return JSON.parse(brut || '{}'); } catch { return {}; }
}

export async function arbitrer(q, secret, base = BASE) {
  if (!secret) return { code: 503, corps: { erreur: 'arbitre-sans-secret' } };
  const partie = String(q.partie || ''), jeton = String(q.jeton || '');
  if (!/^[A-Za-z0-9_-]{6,24}$/.test(partie) || !jeton) return { code: 400, corps: { erreur: 'demande-invalide' } };
  const r = await fetch(`${base}/zem_ff/${partie}.json?auth=${encodeURIComponent(jeton)}`, { signal: AbortSignal.timeout(8000) });
  if (r.status === 401) return { code: 401, corps: { erreur: 'jeton-refuse' } };
  if (!r.ok) return { code: 502, corps: { erreur: 'base-injoignable' } };
  const P = await r.json(), uid = uidDe(jeton);
  if (!P) return { code: 404, corps: { erreur: 'partie-introuvable' } };
  if (!uid || !P.joueurs?.[uid]) return { code: 403, corps: { erreur: 'pas-a-la-table' } };
  if (P.etat === 'inscription' || typeof P.debut !== 'number') return { code: 409, corps: { erreur: 'pas-commencee' } };
  const { mots, faux } = await motsDe(secret, partie, P);
  if (q.quoi === 'mot') return { code: 200, corps: { mot: mots[uid] } };
  // Les verdicts : on déroule la partie à l'heure du serveur, en sachant qui est le faux frère.
  const verdicts = {}, now = Date.now();
  let E = deroule(P, now, verdicts);
  for (let k = 0; k < 6 && E.phase === 'verdict'; k++) { const el = elimineDe(P, E.manche, now); verdicts[E.manche] = el === faux; E = deroule(P, now, verdicts); }
  return { code: 200, corps: { verdicts, ...(E.phase === 'fin' ? { fin: { gagnant: E.gagnant, faux, mots } } : {}) } };
}
/** Le joueur éliminé à la manche `m` : refait par deroule, qui s'arrête au verdict de cette manche-là. */
function elimineDe(P, m, now) {
  // deroule() n'expose le joueur éliminé qu'après le verdict : on le lui demande avec un verdict « faux frère pas encore
  // trouvé » pour cette manche, ce qui ne change rien à qui a été éliminé.
  const E = deroule(P, now, Object.fromEntries(Array.from({ length: m + 1 }, (_, k) => [k, false])));
  return E.elimines.find(e => e.manche === m)?.u ?? null;
}

export default async function handler(req, res, secret = process.env.FAUX_FRERE_SECRET) { // en local, vite.config.js passe le secret de .env.local
  let r;
  try {
    if (req.method !== 'POST') r = { code: 405, corps: { erreur: 'post-seulement' } };
    else if (!origineAdmise(req.headers.origin || '')) r = { code: 403, corps: { erreur: 'origine-refusee' } };
    else r = await arbitrer(await lireCorps(req), secret);
  } catch (e) { console.error('faux-frere', e?.message); r = { code: 502, corps: { erreur: 'arbitre-en-panne' } }; }
  res.statusCode = r.code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(r.corps));
}
