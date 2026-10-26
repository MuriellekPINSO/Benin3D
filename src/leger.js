import { $, LITE } from './base.js';

// ---------- Mode léger ----------
// Sur téléphone, la ville se construit d'office en version allégée (LITE : moins d'ombres, de détails, de gens).
// Ailleurs on peut la choisir (menu Plus), et le jeu la propose une fois quand les images par seconde chutent.
// LITE est fixé au démarrage : le choix est gardé (base.js) et la page se recharge.
const CLE = 'cotonou-leger', PROPOSE = 'cotonou-leger-propose';
const lire = k => { try { return localStorage.getItem(k); } catch { return null; } };
const garder = (k, v) => { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } };
// « Mode complet » met aussi fin au mode de secours (base.js), qui sinon reste d'une visite à l'autre.
const choisir = leger => { garder(CLE, leger ? '1' : '0'); if (!leger) try { localStorage.removeItem('cotonou3d.secours'); } catch { /* navigation privée */ } location.reload(); };

export function initLeger() {
  const b = $('#togLeger'); if (!b) return;
  b.setAttribute('aria-pressed', String(LITE));
  b.addEventListener('click', () => choisir(!LITE));
  if (!LITE && !lire(CLE) && !lire(PROPOSE)) surveiller();
}

// Moins de 20 images par seconde sur trois mesures de 2 s d'affilée (page visible, ville chargée depuis 5 s : les
// premières images, pendant que le reste arrive, sont toujours lentes) : on propose.
function surveiller() {
  let pret = 0, t0 = 0, n = 0, lent = 0;
  const image = t => {
    if (!pret && $('#loader.done')) pret = t;
    if (document.hidden || !pret || t - pret < 5000) { t0 = 0; lent = 0; requestAnimationFrame(image); return; }
    if (!t0) { t0 = t; n = 0; }
    n++;
    if (t - t0 >= 2000) { lent = n * 1000 / (t - t0) < 20 ? lent + 1 : 0; t0 = t; n = 0; if (lent >= 3) { proposer(); return; } }
    requestAnimationFrame(image);
  };
  requestAnimationFrame(image);
}
function proposer() {
  garder(PROPOSE, '1'); // une seule fois
  const el = document.createElement('div'); el.className = 'leger-offre panel'; el.setAttribute('role', 'status');
  el.innerHTML = '<p>Ça rame un peu ? Le <b>mode léger</b> retire des détails pour que le jeu tourne mieux. La page va se recharger.</p><div class="leger-btns"><button type="button" class="leger-oui">Passer en mode léger</button><button type="button" class="leger-non">Non merci</button></div>';
  el.querySelector('.leger-oui').addEventListener('click', () => choisir(true));
  el.querySelector('.leger-non').addEventListener('click', () => el.remove());
  document.body.append(el);
}
