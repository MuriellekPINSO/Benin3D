import { LITE, hash } from './base.js';
import { scene } from './scene.js';
import { maillageLot, roadLines } from './ville.js';
import { ajouterEmprises } from './rue.js';
import { lireJsonGz } from './chargement.js';
import { rectSansConstruction } from './zones.js';

// ---------- Bâtiments Google Open Buildings ----------
// Google détecte les bâtiments sur ses images satellite et publie leurs emprises
// (Google Open Buildings, CC BY 4.0). Ceux qu'OpenStreetMap n'a pas sont rangés en
// tuiles de 1 km (npm run donnees) et chargés autour de la caméra : toutes les maisons
// réelles du quartier où l'on se trouve, au lieu des maisons inventées.

const BG = { index: null, taille: 1000, tuiles: new Map(), t: 0, enCours: 0, visible: true, retires: 0, lus: 0, parClasse: {} };

// ---------- Pas de maison sur la chaussée ----------
// Google détecte aussi des « bâtiments » sur les routes (camions, auvents, gares routières) et ses emprises
// sont parfois décalées par rapport aux rues d'OpenStreetMap : une maison au milieu de la voie bloque la
// conduite et le tokpa-tokpa la traverse. On retire, au chargement, celles qui chevauchent une chaussée :
// l'axe de la rue passe dedans, ou un de leurs coins entre de plus de 1,5 m dans la chaussée.
const CR = 40, ROUTES = { grille: null };
function grilleRoutes() {
  if (ROUTES.grille) return ROUTES.grille;
  const g = new Map();
  for (const L of roadLines) {
    if (L.bridge || L.cls === 6 || L.cls >= 10) continue; // ni ponts, ni sentiers, ni pistes de l'aéroport
    const hw = (L.w || 6) / 2;
    for (let k = 1; k < L.pts.length; k++) {
      const [ax, az] = L.pts[k - 1], [bx, bz] = L.pts[k], s = [ax, az, bx, bz, hw, L.cls];
      for (let cx = Math.floor(Math.min(ax, bx) / CR); cx <= Math.floor(Math.max(ax, bx) / CR); cx++) for (let cz = Math.floor(Math.min(az, bz) / CR); cz <= Math.floor(Math.max(az, bz) / CR); cz++) { const c = cx + ',' + cz; let l = g.get(c); if (!l) g.set(c, l = []); l.push(s); }
    }
  }
  return ROUTES.grille = g;
}
const distSeg = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); return Math.hypot(ax + dx * t - x, az + dz * t - z); };
const croise = (ax, az, bx, bz, cx, cz, dx, dz) => { const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax), d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx); return d1 * d2 < 0 && d3 * d4 < 0; };
function dedans(x, z, r) { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if ((r[i + 1] > z) !== (r[j + 1] > z) && x < (r[j] - r[i]) * (z - r[i + 1]) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; return c; }
function surLaChaussee(r, bb) { // renvoie la classe de la route en cause, ou 0
  const g = grilleRoutes(), vus = new Set();
  for (let cx = Math.floor((bb[0] - 12) / CR); cx <= Math.floor((bb[2] + 12) / CR); cx++) for (let cz = Math.floor((bb[1] - 12) / CR); cz <= Math.floor((bb[3] + 12) / CR); cz++) for (const s of g.get(cx + ',' + cz) || []) {
    if (vus.has(s)) continue; vus.add(s);
    const [ax, az, bx, bz, hw, cls] = s, oui = cls + 1;
    if (Math.max(ax, bx) < bb[0] - hw || Math.min(ax, bx) > bb[2] + hw || Math.max(az, bz) < bb[1] - hw || Math.min(az, bz) > bb[3] + hw) continue;
    for (let i = 0; i < r.length; i += 2) if (distSeg(r[i], r[i + 1], ax, az, bx, bz) < hw - 1.5) return oui; // un coin bien dans la chaussée
    if (dedans(ax, az, r) || dedans(bx, bz, r)) return oui; // l'axe de la rue passe dans l'emprise
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (croise(ax, az, bx, bz, r[j], r[j + 1], r[i], r[i + 1])) return oui;
  }
  return 0;
}
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
/** Combien d'emprises posées sur une chaussée ont été retirées (pour les tests). */
export const batimentsRetires = () => BG.retires;
if (import.meta.env.DEV) window.__batimentsRetires = () => ({ retires: BG.retires, lus: BG.lus, parClasse: BG.parClasse });
/** Affichés avec la maquette, cachés en vue Google seule. */
export function batimentsGoogleVisibles(v) { BG.visible = v; for (const e of BG.tuiles.values()) if (e.mesh) e.mesh.visible = v; }
