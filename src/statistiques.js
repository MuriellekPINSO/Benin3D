// ---------- Statistiques du tableau de bord (public/tableau.html) ----------
// Qui est en ligne en ce moment, et où (zem_presence/<compte> : retiré tout seul à la déconnexion), et des compteurs par
// jour (zem_stats/jours/<AAAA-MM-JJ>) : vues (chaque ouverture du site), visiteurs (un par appareil et par jour),
// nouveaux (premier passage de l'appareil), salon et zemrun (un par appareil et par jour). Les règles de la base
// n'acceptent que +1. Rien ne part avant que la ville soit affichée : le chargement n'en est pas ralenti.
import { firebase, joueur } from './firebase.js';

const jour = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10); // heure du Bénin (UTC+1)
const lire = k => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } };
const P = { ref: null, d: null, ou: 'carte' };
// En développement (localhost, tests automatiques), rien n'est compté ni lu, sauf avec ?stats dans l'adresse.
const actif = () => !import.meta.env.DEV || new URLSearchParams(location.search).has('stats');

async function compter(cle) {
  try { const { d, db } = await firebase(); await joueur(); await d.set(d.ref(db, `zem_stats/jours/${jour()}/${cle}`), d.increment(1)); }
  catch { /* hors ligne, ou règles pas encore déployées : tant pis pour ce compteur */ }
}
/** +1 au compteur `cle` du jour, une seule fois par appareil et par jour. */
export function compterUneFois(cle) { if (!actif()) return; const k = `cotonou3d.stat.${cle}`; if (lire(k) === jour()) return; ecrire(k, jour()); compter(cle); }

/** À l'arrivée dans la ville : présence en ligne et compteurs de visite. */
export async function demarrerStats() {
  if (!actif()) return;
  try {
    const { d, db } = await firebase(), u = await joueur();
    P.d = d; P.ref = d.ref(db, `zem_presence/${u.uid}`);
    d.onValue(d.ref(db, '.info/connected'), s => { // à chaque (re)connexion : on se déclare, et la base nous retire si l'on part
      if (!s.val()) return;
      d.onDisconnect(P.ref).remove().then(() => d.set(P.ref, { ou: P.ou, t: d.serverTimestamp() })).catch(() => {});
    });
  } catch { return; }
  compter('vues');
  if (!lire('cotonou3d.premiere')) { ecrire('cotonou3d.premiere', jour()); compter('nouveaux'); }
  compterUneFois('visiteurs');
}
/** Où l'on est : 'carte', 'salon' ou 'zemrun' (le tableau de bord le montre). */
export function lieuStats(ou) { P.ou = ou; if (P.ref) P.d.update(P.ref, { ou }).catch(() => {}); }
/** Combien de personnes sont en ligne (lu une fois), ou null si l'on ne peut pas le savoir. */
export async function nombreEnLigne() {
  if (!actif()) return null;
  try { const { d, db } = await firebase(); await joueur(); return (await d.get(d.ref(db, 'zem_presence'))).size; } catch { return null; }
}
