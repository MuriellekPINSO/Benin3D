import { LITE, hash } from './base.js';
import { scene } from './scene.js';
import { maillageLot } from './ville.js';
import { surLaChaussee } from './chaussee.js';
import { ajouterEmprises } from './rue.js';
import { lireJsonGz } from './chargement.js';
import { rectSansConstruction } from './zones.js';
import { preparerGeometries } from './memoire.js';

// ---------- Bâtiments Google Open Buildings ----------
// Google détecte les bâtiments sur ses images satellite et publie leurs emprises
// (Google Open Buildings, CC BY 4.0). Ceux qu'OpenStreetMap n'a pas sont rangés en
// tuiles de 1 km (npm run donnees) et chargés autour de la caméra : toutes les maisons
// réelles du quartier où l'on se trouve, au lieu des maisons inventées.

const BG = { index: null, taille: 1000, tuiles: new Map(), emprises: new Set(), t: 0, enCours: 0, visible: true, retires: 0, lus: 0, parClasse: {} };

// Pas de maison sur la chaussée : les emprises qui mordent sur une rue sont retirées au chargement (chaussee.js).
/** Le lot sans les emprises posées sur une chaussée, et le numéro d'origine de celles qu'on garde. */
function horsChaussee(T) {
  const out = { n: [], h: [], c: [], x: [], z: [], p: [] }, ids = []; let o = 0, retires = 0;
  for (let i = 0; i < T.n.length; i++) {
    const n = T.n[i], cx = T.x[i] / 10, cz = T.z[i] / 10, r = new Float64Array(n * 2), bb = [1e9, 1e9, -1e9, -1e9];
    for (let j = 0; j < n; j++) { const x = cx + T.p[o + 2 * j] / 10, z = cz + T.p[o + 2 * j + 1] / 10; r[2 * j] = x; r[2 * j + 1] = z; bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], z); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], z); }
    const route = surLaChaussee(r, bb) || (rectSansConstruction(bb[0], bb[1], bb[2], bb[3]) ? 99 : 0); // 99 : piste de Ouidah (zones.js)
    if (route) { retires++; BG.parClasse[route - 1] = (BG.parClasse[route - 1] || 0) + 1; }
    else { out.n.push(n); out.h.push(T.h[i]); out.c.push(T.c[i]); out.x.push(T.x[i]); out.z.push(T.z[i]); for (let j = 0; j < n * 2; j++) out.p.push(T.p[o + j]); ids.push(i); }
    o += n * 2;
  }
  BG.retires += retires; BG.lus += T.n.length;
  return { T: out, ids };
}
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
    const brut = await lireJsonGz(import.meta.env.BASE_URL + `donnees/batiments/${k}.json.gz`);
    if (e.mort) return;
    const [tx, tz] = k.split('_').map(Number), { T, ids } = horsChaussee(brut);
    e.mesh = maillageLot(T, 2e6 + Math.floor(hash(tx * 977 + tz, 5) * 1e6), ids);
    e.mesh.castShadow = false; e.mesh.visible = BG.visible; scene.add(e.mesh);
    preparerGeometries(e.mesh); // sommets rendus une fois envoyés (memoire.js) : une tuile arrivée en marchant les gardait, 35 Mo en ville
    if (!BG.emprises.has(k)) { BG.emprises.add(k); ajouterEmprises(T, [tx * BG.taille, tz * BG.taille, (tx + 1) * BG.taille, (tz + 1) * BG.taille]); } // les emprises restent quand la tuile part : à son retour, on les rajoutait en double
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
/** Combien d'emprises posées sur une chaussée ont été retirées (pour les tests). */
export const batimentsRetires = () => BG.retires;
if (import.meta.env.DEV) window.__batimentsRetires = () => ({ retires: BG.retires, lus: BG.lus, parClasse: BG.parClasse });
/** Affichés avec la maquette, cachés en vue Google seule. */
export function batimentsGoogleVisibles(v) { BG.visible = v; for (const e of BG.tuiles.values()) if (e.mesh) e.mesh.visible = v; }
