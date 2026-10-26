// ---------- Mon compte : garder sa partie et la retrouver sur un autre téléphone ----------
// Chaque joueur a déjà un compte anonyme Firebase (firebase.js) : sa vie (zem_vies/{uid}), ses commerces, sa garde-robe
// y sont rangés. Créer un compte (Google, ou e-mail et mot de passe) relie ce compte anonyme à une vraie identité : même
// identifiant, rien à copier. La progression de Zém Run et quelques réglages, jusqu'ici gardés dans le navigateur
// seulement, sont copiés en ligne (zem_progres/{uid}, lisible par son seul propriétaire) dès qu'on a un compte. Sur un
// autre téléphone, « J'ai déjà un compte » remet tout en place.
import { firebase, joueur } from './firebase.js';

const CLES = ['zemrun', 'cotonou3d.salon', 'zemrun-nom', 'kutonu.salon.serie']; // ce qui n'est que dans le navigateur
const CLE_T = 'kutonu.compte.t', CLE_RECHARGE = 'kutonu.compte.recharge';
const lire = k => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrire = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* navigation privée */ } };
const instantane = () => JSON.stringify(Object.fromEntries(CLES.map(k => [k, lire(k)]).filter(([, v]) => v != null)));
const navigateurIntegre = () => /\bwv\b|FBAN|FBAV|Instagram|Line\//.test(navigator.userAgent); // WhatsApp, Facebook… : Google y refuse la connexion

/** Le compte de ce navigateur : { anonyme, email, nom, uid }. */
export async function compte() { const u = await joueur(); return { anonyme: u.isAnonymous, email: u.email || '', nom: u.displayName || '', uid: u.uid }; }

// ---------- La sauvegarde en ligne ----------
let attente = 0;
/** À appeler quand la progression change (jeu.js sauver…) : envoyée quelques secondes plus tard, si l'on a un compte. */
export function sauvegarderEnLigne() { clearTimeout(attente); attente = setTimeout(envoyer, 4000); }
// L'appli fermée, le téléphone verrouillé : la sauvegarde qui attendait ses quatre secondes part tout de suite.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && attente) { clearTimeout(attente); attente = 0; envoyer(); } });
async function envoyer() {
  try {
    // Aussi sans compte : la progression de Zém Run n'était que dans le navigateur, et se perdait avec lui.
    const { d, db, auth } = await firebase(), u = auth.currentUser; if (!u) return;
    await d.set(d.ref(db, `zem_progres/${u.uid}`), { d: instantane(), t: d.serverTimestamp() }); ecrire(CLE_T, String(Date.now()));
  } catch (e) { console.warn('compte', e.message); }
}
async function recuperer(uid) { const { d, db } = await firebase(); const s = await d.get(d.ref(db, `zem_progres/${uid}`)); return s.exists() ? s.val() : null; }
function appliquer(p) {
  let o = {}; try { o = JSON.parse(p.d || '{}'); } catch { /* sauvegarde abîmée : on garde ce qu'on a */ }
  for (const k of CLES) ecrire(k, o[k] ?? null);
  ecrire('zemrun-classement-envoyes', null); ecrire(CLE_T, String(p.t || Date.now()));
}
/** Au démarrage : avec un compte, si la partie en ligne est plus récente (jouée sur un autre téléphone), on la reprend.
 *  La page se recharge seulement si l'on est encore sur l'accueil ; sinon ce sera à la prochaine visite. */
export async function synchroniserAuDemarrage() {
  try {
    const u = await joueur(); if (u.isAnonymous) return;
    const p = await recuperer(u.uid);
    if (!p) return envoyer(); // compte créé avant la sauvegarde de Zém Run : on envoie ce qu'on a
    if ((p.t || 0) <= Number(lire(CLE_T) || 0) || p.d === instantane()) return;
    const surAccueil = document.getElementById('app')?.classList.contains('mode-accueil');
    let deja = null; try { deja = sessionStorage.getItem(CLE_RECHARGE); } catch { /* */ }
    if (!surAccueil || deja) return;
    appliquer(p); try { sessionStorage.setItem(CLE_RECHARGE, '1'); } catch { /* */ }
    location.reload();
  } catch (e) { console.warn('compte', e.message); }
}

// ---------- La fenêtre « Mon compte » ----------
const ERREURS = {
  'auth/invalid-email': 'Cette adresse e-mail n’est pas valide.',
  'auth/missing-password': 'Écris un mot de passe.',
  'auth/weak-password': 'Mot de passe trop court : 6 caractères au moins.',
  'auth/email-already-in-use': 'Cette adresse a déjà un compte : touche « J’ai déjà un compte ».',
  'auth/credential-already-in-use': 'Ce compte Google est déjà utilisé : touche « J’ai déjà un compte ».',
  'auth/provider-already-linked': 'Ta partie a déjà un compte.',
  'auth/invalid-credential': 'Adresse ou mot de passe incorrect.',
  'auth/wrong-password': 'Adresse ou mot de passe incorrect.',
  'auth/user-not-found': 'Pas de compte avec cette adresse : touche « Créer mon compte ».',
  'auth/too-many-requests': 'Trop d’essais : attends quelques minutes, puis réessaie.',
  'auth/network-request-failed': 'Pas de connexion. Vérifie ton réseau, puis réessaie.',
  'auth/popup-blocked': 'Le navigateur a bloqué la fenêtre Google : autorise-la, ou utilise ton e-mail.',
  'auth/unauthorized-domain': 'La connexion Google n’est pas ouverte sur cette adresse : utilise ton e-mail.',
  'auth/operation-not-supported-in-this-environment': 'Google refuse la connexion dans cette fenêtre : ouvre le site dans Chrome, ou utilise ton e-mail.',
  'auth/web-storage-unsupported': 'Google refuse la connexion dans cette fenêtre : ouvre le site dans Chrome, ou utilise ton e-mail.',
};
const message = e => ERREURS[e?.code] || 'Ça n’a pas marché. Réessaie dans un instant.';

function fenetre() {
  let el = document.getElementById('compte');
  if (el) return el;
  el = document.createElement('div'); el.id = 'compte'; el.className = 'momo compte'; el.hidden = true;
  el.innerHTML = `<form class="momo-carte panel" role="dialog" aria-modal="true" aria-labelledby="compteTitre" novalidate>
    <small class="ev-sur">Mon compte</small>
    <h2 id="compteTitre"></h2>
    <p class="momo-objet" id="compteTexte"></p>
    <div class="compte-formulaire">
      <button type="button" class="compte-google" id="compteGoogle"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg><span>Continuer avec Google</span></button>
      <p class="compte-ou"><span>ou avec ton e-mail</span></p>
      <label class="momo-label" for="compteEmail">Adresse e-mail</label>
      <input id="compteEmail" class="compte-champ" type="email" autocomplete="email" inputmode="email" placeholder="toi@exemple.com" maxlength="120">
      <label class="momo-label" for="compteMdp">Mot de passe</label>
      <input id="compteMdp" class="compte-champ" type="password" autocomplete="new-password" placeholder="6 caractères au moins" maxlength="100">
      <button type="button" class="compte-lien" id="compteOubli">Mot de passe oublié ?</button>
    </div>
    <p class="ev-etat momo-etat" id="compteEtat" role="status" aria-live="polite" hidden></p>
    <div class="ev-actions"><button type="submit" class="jouer" id="compteValider"></button><button type="button" class="btn-ghost" id="compteBascule"></button><button type="button" class="btn-ghost" id="compteFermer">Fermer</button></div>
  </form>`;
  (document.getElementById('app') || document.body).append(el);
  return el;
}

/** Ouvre « Mon compte » : créer son compte, se connecter, ou voir à quel compte la partie est rattachée. */
export async function ouvrirCompte() {
  const el = fenetre(), f = el.querySelector('form'), $ = s => el.querySelector(s);
  const dire = (txt, cls = '') => { const p = $('#compteEtat'); p.textContent = txt; p.className = `ev-etat momo-etat ${cls}`; p.hidden = !txt; };
  const occupe = on => { for (const b of el.querySelectorAll('button, input')) if (b.id !== 'compteFermer') b.disabled = on; $('#compteValider').classList.toggle('charge', on); };
  let mode = 'creer', C = null;
  const rendre = () => {
    const connecte = C && !C.anonyme;
    $('.compte-formulaire').hidden = connecte;
    $('#compteBascule').hidden = connecte;
    $('#compteOubli').hidden = mode !== 'connexion';
    $('#compteMdp').autocomplete = mode === 'connexion' ? 'current-password' : 'new-password';
    if (connecte) {
      $('#compteTitre').textContent = 'Ta partie est sauvegardée';
      // « Téléphone » partout : la moitié des joueurs sont sur ordinateur et ne se reconnaissaient pas dans le
      // bouton (« ceux qui sont sur PC vont pas comprendre » — Murielle, 25/10). « Appareils », et « Me déconnecter ».
      $('#compteTexte').textContent = `Connecté${C.nom ? ` : ${C.nom}` : ''}${C.email ? ` (${C.email})` : ''}. Ton argent, ta maison, tes commerces et ta progression de Zém Run te suivent sur tous tes appareils.`;
      $('#compteValider').textContent = 'Me déconnecter';
    } else {
      $('#compteTitre').textContent = mode === 'creer' ? 'Garde ta partie' : 'Retrouve ta partie';
      $('#compteTexte').textContent = mode === 'creer'
        ? 'Crée ton compte : ton argent, ta maison, tes commerces et ta progression de Zém Run te suivront sur n’importe quel appareil. Gratuit.'
        : 'Connecte-toi pour retrouver ta partie sur cet appareil. Celle qui y est maintenant sera remplacée par celle de ton compte.';
      $('#compteValider').textContent = mode === 'creer' ? 'Créer mon compte' : 'Me connecter';
      $('#compteBascule').textContent = mode === 'creer' ? 'J’ai déjà un compte' : 'Créer un compte';
      if (navigateurIntegre()) dire('Ouvert depuis WhatsApp ou Facebook ? Google peut y refuser la connexion : ton e-mail marche partout.');
    }
  };
  el.hidden = false; dire('Un instant…'); occupe(true);
  try { C = await compte(); dire(''); } catch { dire(ERREURS['auth/network-request-failed'], 'mal'); }
  occupe(false); rendre();
  setTimeout(() => (C && !C.anonyme ? $('#compteFermer') : $('#compteEmail')).focus(), 60);

  const { au, auth } = await firebase().catch(() => ({}));
  const fini = async (nouveau, uidAvant) => { // connecté : même identifiant (compte créé) ou un autre (compte retrouvé)
    if (nouveau.uid === uidAvant) { await envoyer(); C = await compte(); dire('Compte créé : ta partie est sauvegardée.', 'bien'); rendre(); return; }
    dire('Compte retrouvé : on remet ta partie en place…', 'bien');
    const p = await recuperer(nouveau.uid).catch(() => null);
    if (p) appliquer(p); else await envoyer(); // pas encore de Zém Run en ligne : on garde celui de ce téléphone
    setTimeout(() => location.reload(), 900);
  };
  $('#compteBascule').onclick = () => { mode = mode === 'creer' ? 'connexion' : 'creer'; dire(''); rendre(); };
  $('#compteFermer').onclick = () => { el.hidden = true; };
  el.onkeydown = e => { if (e.key === 'Escape') el.hidden = true; };
  $('#compteGoogle').onclick = async () => {
    if (!au) return dire(ERREURS['auth/network-request-failed'], 'mal');
    occupe(true); dire('');
    const fournisseur = new au.GoogleAuthProvider(), avant = auth.currentUser?.uid;
    try {
      const r = mode === 'creer' && auth.currentUser?.isAnonymous ? await au.linkWithPopup(auth.currentUser, fournisseur) : await au.signInWithPopup(auth, fournisseur);
      await fini(r.user, avant);
    } catch (e) { if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') dire(message(e), 'mal'); }
    occupe(false);
  };
  $('#compteOubli').onclick = async () => {
    const email = $('#compteEmail').value.trim(); if (!email) { $('#compteEmail').focus(); return dire('Écris ton adresse e-mail, puis touche « Mot de passe oublié ? ».', 'mal'); }
    occupe(true);
    try { await au.sendPasswordResetEmail(auth, email); dire('Un e-mail pour changer ton mot de passe est parti. Regarde aussi dans les indésirables.', 'bien'); } catch (e) { dire(message(e), 'mal'); }
    occupe(false);
  };
  f.onsubmit = async e => {
    e.preventDefault(); if (!au) return dire(ERREURS['auth/network-request-failed'], 'mal');
    if (C && !C.anonyme) { // se déconnecter : ce téléphone redevient une partie neuve ; tout reste dans le compte
      if (!confirm('Te déconnecter de ce téléphone ? Ta partie reste dans ton compte : tu la retrouveras en te reconnectant.')) return;
      occupe(true); await envoyer(); await au.signOut(auth).catch(() => { });
      for (const k of [...CLES, CLE_T, 'zemrun-classement-envoyes']) ecrire(k, null);
      location.reload(); return;
    }
    const email = $('#compteEmail').value.trim(), mdp = $('#compteMdp').value;
    if (!email) { $('#compteEmail').focus(); return dire(ERREURS['auth/invalid-email'], 'mal'); }
    if (mdp.length < 6) { $('#compteMdp').focus(); return dire(ERREURS['auth/weak-password'], 'mal'); }
    occupe(true); dire('Un instant…');
    const avant = auth.currentUser?.uid;
    try {
      const r = mode === 'creer' && auth.currentUser?.isAnonymous
        ? await au.linkWithCredential(auth.currentUser, au.EmailAuthProvider.credential(email, mdp))
        : mode === 'creer' ? await au.createUserWithEmailAndPassword(auth, email, mdp) : await au.signInWithEmailAndPassword(auth, email, mdp);
      await fini(r.user, avant);
    } catch (err) { dire(message(err), 'mal'); }
    occupe(false);
  };
}
