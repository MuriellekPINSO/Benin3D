// La base en administrateur, depuis une fonction Vercel : l'API REST de Firebase avec le secret de la base
// (FIREBASE_DB_SECRET, console Firebase → Comptes de service → Secrets de la base de données ; réglages Vercel, en local
// .env.local), qui passe outre les règles. Comme api/recharge.js : les lectures rendent leur ETag, les écritures
// conditionnelles (if-match) échouent en 412 si quelqu'un a écrit entre-temps — on relit et on recommence.
// Le nom commence par « _ » : Vercel n'en fait pas une adresse.

/** { lire, ecrireSi, ecrire, supprimer } sur la base `url`, avec le secret `secret` (jamais écrit dans un journal). */
export function baseAdmin(url, secret) {
  const acces = `auth=${encodeURIComponent(secret)}`;
  const appel = (chemin, o = {}) => fetch(`${url}/${chemin}.json?${acces}`, { ...o, signal: AbortSignal.timeout(8000) });
  const verifier = (r, quoi) => { if (!r.ok) throw new Error(`${quoi} ${r.status}`); };
  return {
    async lire(chemin) {
      const r = await appel(chemin, { headers: { 'X-Firebase-ETag': 'true' } }); verifier(r, 'lecture');
      return { val: await r.json(), etag: r.headers.get('etag') };
    },
    async ecrireSi(chemin, val, etag) {
      const r = await appel(chemin, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'if-match': etag }, body: JSON.stringify(val) });
      if (r.status === 412) return false; // quelqu'un a écrit entre-temps
      verifier(r, 'écriture'); return true;
    },
    async ecrire(chemin, val) { verifier(await appel(chemin, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(val) }), 'écriture'); },
    async supprimer(chemin) { verifier(await appel(chemin, { method: 'DELETE' }), 'suppression'); },
  };
}

/**
 * L'identifiant du joueur dans son jeton Firebase, si la base accepte ce jeton : on lit avec lui un petit bout du salon
 * (que tout joueur connecté peut lire). Acceptée, la lecture prouve que le jeton est vrai, et donc l'identifiant qu'il porte.
 */
export async function uidDuJeton(jeton, url, chemin) {
  jeton = String(jeton || ''); if (!jeton || jeton.length > 4000) return '';
  let uid = ''; try { const p = JSON.parse(Buffer.from(jeton.split('.')[1], 'base64url').toString()); uid = String(p.user_id || p.sub || ''); } catch { return ''; }
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) return '';
  try { const r = await fetch(`${url}/${chemin}.json?auth=${encodeURIComponent(jeton)}`, { signal: AbortSignal.timeout(8000) }); return r.ok ? uid : ''; }
  catch { return ''; }
}
