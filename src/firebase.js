// ---------- Firebase du jeu (projet zem-run-cotonou) ----------
// Partagé par le salon entre amis et « Ma vie ». Le SDK n'est chargé qu'à la première utilisation.
// La configuration web est publique, c'est normal : la sécurité vient des règles de la base
// (database.rules.json). Connexion anonyme : le navigateur garde le même compte d'une visite à l'autre.
const CONFIG = {
  apiKey: 'AIzaSyBICBd5BGAGoLBgjRb78Zq-shfP9oij1rA', authDomain: 'zem-run-cotonou.firebaseapp.com', projectId: 'zem-run-cotonou',
  databaseURL: 'https://zem-run-cotonou-default-rtdb.europe-west1.firebasedatabase.app', appId: '1:655292147870:web:e6d7ab3d39a452adb8338f',
};
// En développement, ?emulateur : les émulateurs Firebase de ce Mac (base et comptes), pour essayer les règles sans
// toucher aux vraies données : npx firebase-tools emulators:start --only database,auth --project zem-run-cotonou
const EMULATEUR = import.meta.env.DEV && new URLSearchParams(location.search).has('emulateur');
let FB = null;
/** { au, d, auth, db } : modules auth et database du SDK, et les instances du jeu. */
export function firebase() {
  FB ??= Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/database')]).then(([a, au, d]) => {
    const app = a.getApps().find(x => x.name === 'zemrun') || a.initializeApp(CONFIG, 'zemrun'), auth = au.getAuth(app), db = d.getDatabase(app);
    if (EMULATEUR) { au.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); d.connectDatabaseEmulator(db, '127.0.0.1', 9000); }
    return { au, d, auth, db };
  }).catch(e => { FB = null; throw e; }); // un chargement raté (réseau faible) était gardé pour toute la visite : plus rien ne s'enregistrait
  return FB;
}
/** Le joueur connecté : on attend que la session enregistrée soit relue, sinon chaque visite créerait un nouveau compte.
 *  Une seule demande à la fois : la vie et le salon se connectent en même temps, et deux connexions anonymes simultanées
 *  d'un nouveau joueur lui donneraient deux comptes (sa vie serait perdue à la visite suivante). */
let JOUEUR = null;
export function joueur() {
  JOUEUR ??= (async () => {
    const { au, auth } = await firebase();
    await auth.authStateReady();
    return auth.currentUser || (await au.signInAnonymously(auth)).user;
  })().catch(e => { JOUEUR = null; throw e; }); // en cas d'échec (hors ligne), on réessaiera
  return JOUEUR;
}
