// Le code d'accès du tableau de bord (public/tableau.html), en un seul endroit.
// middleware.js le demande avant la page et avant les fonctions réservées ; ces fonctions (api/jeux-admin.js,
// api/paiements.js) le revérifient elles-mêmes, car Vercel les sert aussi à /api/<nom>.js, une adresse que le matcher
// du middleware ne voit pas (13/11/2026 : un visiteur a signalé des failles ; celle-ci ouvrait le tableau sans code).
// Le dépôt est public : il ne contient que l'empreinte du code (PBKDF2), jamais le code lui-même.
// Changer le code : node scripts/code-tableau.mjs <nouveau code>, puis remplacer SEL et EMPREINTE ci-dessous.
// Le nom commence par « _ » : Vercel n'en fait pas une adresse.

export const COOKIE = 'kv_tableau', JOURS = 90;
const SEL = 'ece9a2f5d556d8b4c502be71', EMPREINTE = '161ad9006c4aa650278acbd968ff19f3b4521a92111a2972accb891c0027dd0e';
const TOURS = 100000;

async function empreinte(code) {
  const t = new TextEncoder(), cle = await crypto.subtle.importKey('raw', t.encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: t.encode(SEL), iterations: TOURS }, cle, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const bonCode = async code => !!code && code.length <= 100 && (await empreinte(code.trim())) === EMPREINTE;
export const lireCookie = (h, nom = COOKIE) => { const m = (h || '').match(new RegExp(`(?:^|;\\s*)${nom}=([^;]*)`)); try { return m ? decodeURIComponent(m[1]) : null; } catch { return null; } };

/** Pour une fonction réservée : vrai si la requête porte le bon code dans son cookie. `req.tableauLocal` n'est posé que
 *  par le serveur de développement (vite.config.js) : en local, le tableau marche sans code, comme avant. */
export async function accesTableau(req) {
  if (req?.tableauLocal === true) return true;
  const h = req?.headers, cookie = typeof h?.get === 'function' ? h.get('cookie') : h?.cookie;
  return bonCode(lireCookie(cookie));
}

/** La réponse 401 d'une fonction réservée appelée sans le code. */
export function refuser(res) {
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end('{"erreur":"code"}');
}
