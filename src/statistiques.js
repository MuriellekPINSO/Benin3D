// ---------- Statistiques du tableau de bord (public/tableau.html) ----------
// Qui est en ligne en ce moment, et où (zem_presence/<compte> : retiré tout seul à la déconnexion, et rafraîchi toutes les
// 5 minutes : le tableau ignore ce qui n'a pas bougé depuis 20 minutes), et des compteurs par jour
// (zem_stats/jours/<AAAA-MM-JJ>) : vues (chaque ouverture du site), visiteurs (un par appareil et par jour),
// nouveaux (premier passage de l'appareil), et, une fois par appareil et par jour, où l'on est entré : salon (Vivre à
// Cotonou), zemrun, village (entré à pied dans le Village de l'innovation, village.js), village_qr (arrivé par le QR code
// du stand, ?village) et carte (« Juste explorer la carte » à l'accueil, explorer.js). Les règles de la base n'acceptent
// que +1. Rien ne part avant que la ville soit affichée : le chargement n'en est pas ralenti.
import { firebase, joueur } from './firebase.js';

const jour = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10); // heure du Bénin (UTC+1)
const lire = k => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } };
const P = { ref: null, d: null, ou: 'carte', connecte: false };
// Lu dès le chargement du module : plus tard, l'adresse a pu être nettoyée.
const PAR_LE_QR = new URLSearchParams(location.search).has('village');
// En développement (localhost, tests automatiques), rien n'est compté ni lu, sauf avec ?stats dans l'adresse.
const actif = () => !import.meta.env.DEV || new URLSearchParams(location.search).has('stats');

/** +1 au compteur `cle` du jour (les règles de la base n'acceptent que ça). */
export async function compter(cle) {
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
      P.connecte = !!s.val(); if (!P.connecte) return;
      d.onDisconnect(P.ref).remove().then(() => d.set(P.ref, { ou: P.ou, t: d.serverTimestamp() })).catch(() => {});
    });
    // Toutes les 5 minutes, « toujours là » : une présence que la base n'a pas su retirer (onglet tué, réseau coupé
    // pendant des jours…) cesse de compter sur le tableau au bout de 20 minutes au lieu de rester « en ligne » pour toujours.
    setInterval(() => { if (P.connecte && !document.hidden) d.set(P.ref, { ou: P.ou, t: d.serverTimestamp() }).catch(() => {}); }, 5 * 60e3);
  } catch { return; }
  compter('vues');
  if (!lire('cotonou3d.premiere')) { ecrire('cotonou3d.premiere', jour()); compter('nouveaux'); }
  compterUneFois('visiteurs');
  if (PAR_LE_QR) compterUneFois('village_qr');
}
/** Où l'on est : 'carte', 'salon', 'village' ou 'zemrun' (le tableau de bord le montre). */
export function lieuStats(ou) { if (P.ou === ou) return; P.ou = ou; if (P.ref && P.connecte) P.d.set(P.ref, { ou, t: P.d.serverTimestamp() }).catch(() => {}); }
/** Combien de personnes sont en ligne (lu une fois), ou null si l'on ne peut pas le savoir. */
export async function nombreEnLigne() {
  if (!actif()) return null;
  try { const { d, db } = await firebase(); await joueur(); return (await d.get(d.ref(db, 'zem_presence'))).size; } catch { return null; }
}
