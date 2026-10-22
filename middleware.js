// Le tableau de bord (public/tableau.html) est réservé : Vercel passe ici avant de servir la page, et demande un code.
// Le dépôt est public : il ne contient que l'empreinte du code (PBKDF2), jamais le code lui-même.
// Changer le code : node scripts/code-tableau.mjs <nouveau code>, puis remplacer SEL et EMPREINTE ci-dessous.
// Une fois le bon code donné, un cookie le garde 90 jours sur l'appareil.
import { next } from '@vercel/functions';

export const config = { matcher: ['/tableau.html', '/tableau'] };

const SEL = 'ece9a2f5d556d8b4c502be71', EMPREINTE = '161ad9006c4aa650278acbd968ff19f3b4521a92111a2972accb891c0027dd0e';
const TOURS = 100000, COOKIE = 'kv_tableau', JOURS = 90;

async function empreinte(code) {
  const t = new TextEncoder(), cle = await crypto.subtle.importKey('raw', t.encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: t.encode(SEL), iterations: TOURS }, cle, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const bonCode = async code => !!code && code.length <= 100 && (await empreinte(code.trim())) === EMPREINTE;
const lireCookie = (h, nom) => { const m = (h || '').match(new RegExp(`(?:^|;\\s*)${nom}=([^;]*)`)); try { return m ? decodeURIComponent(m[1]) : null; } catch { return null; } };

const PAGE = erreur => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Tableau de bord · Kutɔnu Vibes</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;background:#f6f1e6;color:#242824;font:16px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
form{width:100%;max-width:360px;background:#fffdf8;border-radius:22px;padding:28px 24px;box-shadow:0 10px 30px rgba(60,40,10,.12)}
h1{margin:0 0 6px;font-size:22px}p{margin:0 0 18px;color:#6b6457}
input{width:100%;font:inherit;padding:13px 16px;border:1.5px solid #d9cfbb;border-radius:14px;background:#fff;outline:none}input:focus{border-color:#1a7d52}
button{margin-top:12px;width:100%;font:inherit;font-weight:700;padding:13px;border:0;border-radius:999px;background:#1a7d52;color:#fff;cursor:pointer}
.err{margin:12px 0 0;color:#b3261e;font-weight:600}</style></head><body>
<form method="post" action="/tableau.html"><h1>Tableau de bord</h1><p>Kutɔnu Vibes · réservé à l’équipe</p>
<input name="code" type="password" placeholder="Code d’accès" autocomplete="current-password" autocapitalize="none" autofocus required>
<button>Entrer</button>${erreur ? '<p class="err">Code incorrect.</p>' : ''}</form></body></html>`;
const pageCode = (erreur, statut = 401) => new Response(PAGE(erreur), { status: statut, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

export default async function middleware(request) {
  if (request.method === 'POST') {
    const code = (await request.formData().catch(() => null))?.get('code')?.toString().trim();
    if (!(await bonCode(code))) return pageCode(true);
    return new Response(null, { status: 303, headers: { location: '/tableau.html', 'cache-control': 'no-store',
      'set-cookie': `${COOKIE}=${encodeURIComponent(code)}; Path=/; Max-Age=${JOURS * 86400}; HttpOnly; Secure; SameSite=Lax` } });
  }
  if (await bonCode(lireCookie(request.headers.get('cookie'), COOKIE))) return next({ headers: { 'cache-control': 'no-store' } });
  return pageCode(false);
}
