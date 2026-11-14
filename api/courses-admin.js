// Les courses à vélo payantes, pour le tableau de bord (public/tableau.html ; même code d'accès, vérifié par middleware.js
// et ici, voir api/_tableau.js) : qui a couru, qui a gagné, les tickets RideCorniche et leur numéro pour joindre le gagnant.
//   GET  /api/courses-admin                          → { courses: [...], totaux }
//   POST /api/courses-admin { id, utilise: true|false } → marque le ticket comme donné (la balade a eu lieu), ou pas
// Le registre est écrit par api/course-velo.js dans zem_courses_velo, fermé aux joueurs.
import { accesTableau, refuser } from './_tableau.js';
import { BASE, lireCorps } from './fedapay.js';
import { RACINE } from './course-velo.js';

const ABANDON = 20 * 60e3; // une course « en cours » depuis 20 minutes : le joueur est parti sans finir

export async function courses({ secret, base = BASE, now = Date.now() }) {
  const r = await fetch(`${base}/${RACINE}.json?auth=${encodeURIComponent(secret)}&orderBy=%22%24key%22&limitToLast=300`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`lecture ${r.status}`);
  const tout = Object.entries((await r.json()) || {}).map(([id, f]) => ({
    id, nom: f.nom || '', depart: f.depart, fin: f.fin || null, montant: f.montant || 0,
    statut: f.statut === 'en-course' && now - f.depart > ABANDON ? 'abandon' : f.statut,
    rang: f.rang || null, temps: f.temps ?? null, ecoule: f.ecoule ?? null, alertes: f.alertes || '', refus: f.refus || '',
    ticket: f.ticket || '', utilise: f.utilise || null,
    ...(f.ticket || f.statut === 'refuse' ? { tel: f.tel || '', trace: f.trace || [] } : {}), // le numéro et le trajet : seulement pour une 1re place
  })).sort((a, b) => b.depart - a.depart);
  const B = 3600e3, minuit = Math.floor((now + B) / 864e5) * 864e5 - B, lundi = minuit - ((new Date(minuit + B).getUTCDay() + 6) % 7) * 864e5;
  const gagnes = tout.filter(c => c.ticket);
  return {
    courses: tout,
    totaux: {
      courses: tout.length, semaine: tout.filter(c => c.depart >= lundi).length, montant: tout.reduce((s, c) => s + c.montant, 0),
      gagnants: gagnes.length, aDonner: gagnes.filter(c => !c.utilise).length, aVerifier: tout.filter(c => c.statut === 'refuse' || (c.ticket && c.alertes)).length,
    },
  };
}

export default async function handler(req, res, secrets = {}) { // en local, vite.config.js passe { secret } de .env.local
  if (!(await accesTableau(req))) return refuser(res);
  const secret = String(secrets.secret ?? process.env.FIREBASE_DB_SECRET ?? '').trim();
  let code = 200, corps;
  try {
    if (!secret) { code = 503; corps = { erreur: 'non-configure' }; }
    else if (req.method === 'POST') {
      const q = await lireCorps(req), id = String(q.id ?? '');
      if (!/^\d{1,15}$/.test(id) || typeof q.utilise !== 'boolean') { code = 400; corps = { erreur: 'demande' }; }
      else {
        const lien = `${BASE}/${RACINE}/${id}`, acces = `auth=${encodeURIComponent(secret)}`;
        const f = await (await fetch(`${lien}/ticket.json?${acces}`, { signal: AbortSignal.timeout(8000) })).json();
        if (!f) { code = 404; corps = { erreur: 'sans-ticket' }; }
        else {
          const w = await fetch(`${lien}/utilise.json?${acces}`, { method: 'PUT', body: JSON.stringify(q.utilise ? Date.now() : null), signal: AbortSignal.timeout(8000) });
          if (!w.ok) throw new Error(`écriture ${w.status}`);
          corps = { ok: true };
        }
      }
    } else corps = await courses({ secret });
  } catch (e) { console.error('courses-admin', e?.message); code = 502; corps = { erreur: 'base-injoignable' }; }
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(corps));
}
