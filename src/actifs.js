// ---------- D'où viennent les fichiers du jeu ----------
// En ligne, les fichiers lourds (modèles, données de la ville, images, sons, vidéos) viennent de jsDelivr (11/11) :
// le compte Vercel gratuit n'a que 100 Go par mois, il les avait épuisés, et une première visite téléchargeait ~36 Mo,
// presque tout en modèles. jsDelivr sert gratuitement, sans limite, les fichiers des dépôts GitHub publics : ceux du
// jeu (MuriellekPINSO/Benin3D), au commit mis en ligne. Vercel ne sert plus que la page, le code et l'API.
//
// VITE_ACTIFS = ce commit, donné à la construction (`vercel deploy --build-env VITE_ACTIFS=$(git rev-parse HEAD)`).
// Il doit être sur GitHub (une étiquette suffit) ; un commit figé est servi par jsDelivr comme immuable, un an.
// Sans VITE_ACTIFS (en local, ou une mise en ligne qui l'oublie), tout vient du site, comme avant.
//
// Un fichier que jsDelivr n'a pas (commit pas poussé) ou ne donne pas (panne, réseau qui le bloque) est repris sur
// le site ; après trois échecs de suite, tout vient du site jusqu'à la fin de la visite.
// Restent toujours sur le site : les petites images d'interface (vignettes de la garde-robe, favicon) dessinées
// dans des canevas, qu'une image d'un autre domaine rendrait illisibles.

const VERSION = /^[0-9a-f]{7,40}$/.test(import.meta.env.VITE_ACTIFS || '') ? import.meta.env.VITE_ACTIFS : '';
const CDN = VERSION ? `https://cdn.jsdelivr.net/gh/MuriellekPINSO/Benin3D@${VERSION}/public/` : '';
const SITE = import.meta.env.BASE_URL;
const A = { echecs: 0 };
const cdnActif = () => CDN && A.echecs < 3;

/** L'adresse d'un fichier de public/ (`chemin` : 'modeles/x.glb?v=…', sans « / » au début). */
export const actif = chemin => (cdnActif() ? CDN : SITE) + chemin;
/** Le même fichier sur le site, si `url` est une adresse jsDelivr ; sinon null (rien d'autre à essayer). */
export const surSite = url => (CDN && typeof url === 'string' && url.startsWith(CDN) ? SITE + url.slice(CDN.length) : null);
const reussi = url => { if (url.startsWith?.(CDN)) A.echecs = 0; };
const rate = () => { if (navigator.onLine !== false) A.echecs++; }; // hors ligne, le site ne répondrait pas mieux

/** `charger(url)` → promesse, essayée sur jsDelivr puis sur le site. Pour les chargeurs de three (images, modèles). */
export async function avecRepli(url, charger) {
  try { const r = await charger(url); if (CDN) reussi(url); return r; } catch (e) {
    const site = surSite(url); if (!site) throw e;
    rate(); return charger(site);
  }
}

/** fetch() d'un fichier de public/, avec repli sur le site. jsDelivr qui ne répond pas en 12 s compte comme un échec. */
export async function fetchActif(chemin, init) {
  const url = actif(chemin);
  if (!url.startsWith(CDN) || !CDN) return fetch(url, init);
  const ctl = new AbortController(), minuterie = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    clearTimeout(minuterie);
    if (r.ok) { reussi(url); return r; }
  } catch { clearTimeout(minuterie); }
  rate(); return fetch(SITE + chemin, init);
}

/** Une <img> d'interface : chaque image que jsDelivr ne donne pas est reprise sur le site (une fois : celle du site
 *  qui échoue à son tour n'est pas une adresse jsDelivr). */
export function imageRepli(img) {
  img.addEventListener('error', () => { const site = surSite(img.src); if (site) { rate(); img.src = site; } });
  return img;
}

/** Un <video> ou <audio> : `src` sur jsDelivr, le site si le fichier n'arrive pas. `crossOrigin` : une vidéo
 *  posée en texture doit être lisible par WebGL, ce qu'un autre domaine n'autorise qu'avec CORS. */
export function sourceMedia(el, chemin) {
  if (el.dataset) el.dataset.actif = chemin;
  const url = actif(chemin), site = surSite(url);
  if (site) {
    el.crossOrigin = 'anonymous';
    el.addEventListener('error', () => { rate(); el.src = site; el.load(); }, { once: true });
  }
  el.src = url;
  return el;
}
