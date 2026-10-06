import { LITE, hash } from './base.js';
import { scene } from './scene.js';
import { maillageLot } from './ville.js';
import { ajouterEmprises } from './rue.js';
import { lireJsonGz } from './chargement.js';

// ---------- Bâtiments Google Open Buildings ----------
// Google détecte les bâtiments sur ses images satellite et publie leurs emprises
// (Google Open Buildings, CC BY 4.0). Ceux qu'OpenStreetMap n'a pas sont rangés en
// tuiles de 1 km (npm run donnees) et chargés autour de la caméra : toutes les maisons
// réelles du quartier où l'on se trouve, au lieu des maisons inventées.

const BG = { index: null, taille: 1000, tuiles: new Map(), t: 0, enCours: 0, visible: true };
export async function initBatimentsGoogle() {
  try {
    const r = await fetch(import.meta.env.BASE_URL + 'donnees/batiments/index.json'); if (!r.ok) return 0;
    const j = await r.json(); BG.index = j.tuiles; BG.taille = j.taille / 10;
    return Object.values(BG.index).reduce((s, n) => s + n, 0);
  } catch { return 0; }
}
async function charger(k) {
  const e = { mesh: null, mort: false }; BG.tuiles.set(k, e); BG.enCours++;
  try {
    const T = await lireJsonGz(import.meta.env.BASE_URL + `donnees/batiments/${k}.json.gz`);
    if (e.mort) return;
    const [tx, tz] = k.split('_').map(Number);
    e.mesh = maillageLot(T, 2e6 + Math.floor(hash(tx * 977 + tz, 5) * 1e6));
    e.mesh.castShadow = false; e.mesh.visible = BG.visible; scene.add(e.mesh);
    ajouterEmprises(T, [tx * BG.taille, tz * BG.taille, (tx + 1) * BG.taille, (tz + 1) * BG.taille]);
  } catch (err) { console.warn('tuile', k, err); }
  finally { BG.enCours--; }
}
function liberer(k) { const e = BG.tuiles.get(k); if (!e) return; e.mort = true; if (e.mesh) { scene.remove(e.mesh); e.mesh.geometry.dispose(); } BG.tuiles.delete(k); }
/** Charge les tuiles autour de `centre` quand on est assez près (`dist` : distance de la caméra). */
export function majBatimentsGoogle(dt, centre, dist) {
  if (!BG.index || !BG.visible) return; // vue Google seule : rien à charger
  BG.t -= dt; if (BG.t > 0) return; BG.t = .2;
  const R = dist < 2200 ? (LITE || dist < 120 ? 1 : 2) : -1, T = BG.taille, cx = Math.floor(centre.x / T), cz = Math.floor(centre.z / T);
  for (const k of [...BG.tuiles.keys()]) { const [a, b] = k.split('_').map(Number); if (R < 0 || Math.max(Math.abs(a - cx), Math.abs(b - cz)) > R + 1) liberer(k); }
  if (R < 0 || BG.enCours >= 2) return;
  let best = null, bd = 1e9;
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
    const k = (cx + i) + '_' + (cz + j); if (!BG.index[k] || BG.tuiles.has(k)) continue;
    const d = i * i + j * j; if (d < bd) { bd = d; best = k; }
  }
  if (best) charger(best);
}
/** Affichés avec la maquette, cachés en vue Google seule. */
export function batimentsGoogleVisibles(v) { BG.visible = v; for (const e of BG.tuiles.values()) if (e.mesh) e.mesh.visible = v; }
