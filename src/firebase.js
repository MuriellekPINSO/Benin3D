// ---------- Firebase du jeu (projet zem-run-cotonou) ----------
// Partagé par le salon entre amis et « Ma vie ». Le SDK n'est chargé qu'à la première utilisation.
// La configuration web est publique, c'est normal : la sécurité vient des règles de la base
// (database.rules.json). Connexion anonyme : le navigateur garde le même compte d'une visite à l'autre.
const CONFIG = {
  apiKey: 'AIzaSyBICBd5BGAGoLBgjRb78Zq-shfP9oij1rA', authDomain: 'zem-run-cotonou.firebaseapp.com', projectId: 'zem-run-cotonou',
  databaseURL: 'https://zem-run-cotonou-default-rtdb.europe-west1.firebasedatabase.app', appId: '1:655292147870:web:e6d7ab3d39a452adb8338f',
};
let FB = null;
/** { au, d, auth, db } : modules auth et database du SDK, et les instances du jeu. */
export function firebase() {
  FB ??= Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/database')]).then(([a, au, d]) => {
    const app = a.initializeApp(CONFIG, 'zemrun'); return { au, d, auth: au.getAuth(app), db: d.getDatabase(app) };
  });
  return FB;
}
/** Le joueur connecté : on attend que la session enregistrée soit relue, sinon chaque visite créerait un nouveau compte. */
export async function joueur() {
  const { au, auth } = await firebase();
  await auth.authStateReady();
  return auth.currentUser || (await au.signInAnonymously(auth)).user;
}
