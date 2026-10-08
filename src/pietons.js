import * as THREE from 'three';
import { LITE } from './base.js';
import { JEU, demiChaussee, kFiles, latTrottoir, pose, toast } from './jeu.js';
import { pietonOk } from './rue.js';
import { accessoire, personnage3d, personnagesPrets } from './personnages.js';
import { accident } from './regles.js';
import { C3, matVeh } from './vehicules.js';
import { mergeColored } from './ville.js';

// ---------- Les passants de Zém Run ----------
// Des gens qui marchent sur le bas-côté de la vraie rue (entre la chaussée et les murs, jamais
// dedans), dans les deux sens, et d'autres qui traversent sur le passage piéton quand le feu est
// rouge pour les motos. Sur la chaussée, on ne voit que ceux qui traversent ou qui font signe.
// Qui brûle le feu et touche un piéton a un accident (constat de police ou client qui descend).
// Ce sont les personnages réalistes de personnages.js : sans eux, pas de passants.

const PT = { C: null, marcheurs: [], traversees: [] };
const NB = LITE ? 8 : 22, tmp = { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 };

/** Une bassine de fruits ou de légumes, à poser sur la tête (userData.tete d'un personnage) :
 *  le modèle Tripo (oranges, tomates et piments) s'il est chargé, sinon une bassine dessinée ici. */
export function bassine(k = 0) {
  const vraie = accessoire('bassine', k); if (vraie) return vraie;
  const fruit = ['#f08a1c', '#d8432f', '#e9b23a'][k % 3], P = [[C3(.28, .19, .12, 24).translate(0, .06, 0), '#c9ccd0']];
  for (let i = 0; i < 9; i++) { const a = i * 2.4, r = i ? .15 : 0; P.push([new THREE.SphereGeometry(.055, 10, 8).translate(Math.cos(a) * r, .13 + (i ? 0 : .04), Math.sin(a) * r), fruit]); }
  return new THREE.Mesh(mergeColored(P), matVeh);
}
/** Une marchande réaliste, bassine sur la tête (null si les personnages ne sont pas chargés). */
export function marchandeReelle(graine, marche = false) {
  const m = personnage3d(graine, { femme: true }); if (!m) return null;
  const b = bassine(graine); b.position.y = -.045; b.rotation.y = graine; m.userData.tete.add(b);
  m.userData.jouer(marche ? 'marche' : 'idle', 0);
  return m;
}
/** Oriente un personnage (face à +z) dans le sens (mx, mz). */
export const regarder = (m, mx, mz) => { m.rotation.y = Math.atan2(mx, mz); };

function marcheur(st, loin) {
  const C = PT.C;
  // Une place libre sur le bas-côté (pas dans une rue qui croise, pas dans un bâtiment).
  for (let essai = 0; essai < 8; essai++) {
    const cote = Math.random() < .5 ? -1 : 1, s = st.s + (loin ? 130 + Math.random() * 90 : -10 + Math.random() * 220), recul = .9 + Math.random() * 1.6;
    const lat = latTrottoir(C, s, cote, recul); if (lat === null) continue;
    const m = personnage3d(Math.floor(Math.random() * 1e6)); if (!m) return null;
    m.userData.jouer('marche', 0); JEU.decor.add(m);
    return { m, s, cote, recul, lat, sens: Math.random() < .5 ? -1 : 1, v: 1.05 + Math.random() * .45, case: Math.round(s) };
  }
  return null;
}
// Où poser le pied en avançant : à `recul` du bord, ou plus près s'il y a un obstacle ; les rues qui
// croisent se traversent. Null : plus de passage (mur, bâtiment, terre-plein) — on fait demi-tour.
function pas(C, p, q) {
  const hw = demiChaussee(C, p.s), front = C.front ? C.front[Math.max(0, Math.min(C.n - 1, Math.round(p.s)))] : 9.8;
  for (const r of [Math.min(p.recul, front - hw - .5), .6]) {
    if (r < .3) continue;
    const lat = p.cote * (hw + r);
    if (pietonOk(q.x - q.dz * lat, q.z + q.dx * lat, q.dx, q.dz)) return lat;
  }
  return null;
}
const retirer = p => { p.m.parent?.remove(p.m); p.m.userData.liberer(); };

/** Au départ d'une course (ou après un virage) : nouveaux passants le long du nouveau trajet. */
export function preparerPietons(C) { viderPietons(); PT.C = C; }
export function viderPietons() { for (const p of [...PT.marcheurs, ...PT.traversees]) retirer(p); PT.marcheurs = []; PT.traversees = []; PT.C = null; }

/** Des piétons traversent au passage piéton `s` pendant que le feu `feu` est rouge pour les motos. */
export function traverser(s, feu = null) {
  if (!personnagesPrets() || !PT.C || PT.traversees.length > 6) return;
  const n = 2 + Math.floor(Math.random() * 3);
  for (let k = 0; k < n; k++) {
    const depuis = Math.random() < .5 ? -1 : 1, m = Math.random() < .25 ? marchandeReelle(Math.floor(Math.random() * 1e6), true) : personnage3d(Math.floor(Math.random() * 1e6));
    if (!m) return;
    m.userData.jouer('marche', 0); JEU.decor.add(m);
    const sp = s + 1.5 + Math.random() * 3, hw = demiChaussee(PT.C, sp);
    PT.traversees.push({ m, feu, s: sp, hw, lat: depuis * (hw + .7 + k * .5 + Math.random() * .4), dir: -depuis, v: 1.3 + Math.random() * .35, attente: k * .4 + Math.random() * .5 });
  }
}

/** À chaque image du jeu. */
export function majPietons(st, dt) {
  const C = PT.C; if (!C || !personnagesPrets()) return;
  // Trottoirs : on garde NB marcheurs autour du zém ; ceux qui sortent de la zone repartent devant.
  while (PT.marcheurs.length < NB) { const p = marcheur(st, PT.marcheurs.length >= NB / 2); if (!p) break; PT.marcheurs.push(p); }
  PT.marcheurs = PT.marcheurs.filter(p => {
    const s0 = p.s; p.s += p.sens * p.v * dt;
    if (p.s < st.s - 30 || p.s > st.s + 240) { retirer(p); return false; }
    const q = pose(C, p.s, 0, tmp);
    if (Math.round(p.s) !== p.case) { // un pas de plus : y a-t-il encore la place ?
      p.case = Math.round(p.s); const lat = pas(C, p, q);
      if (lat === null) { p.s = s0; p.sens = -p.sens; p.case = Math.round(s0); } else p.cible = lat; // demi-tour devant le mur
    }
    if (p.cible !== undefined) p.lat += (p.cible - p.lat) * Math.min(1, dt * 2.5);
    const r = pose(C, p.s, p.lat, tmp); p.m.position.set(r.x, r.y, r.z); regarder(p.m, p.sens * r.dx, p.sens * r.dz);
    return true;
  });
  // Passages piétons : ils traversent d'un trottoir à l'autre, puis s'en vont.
  PT.traversees = PT.traversees.filter(p => {
    // Le feu repasse au vert : ceux qui sont encore sur la chaussée pressent le pas vers le trottoir le plus proche.
    if (p.feu && p.feu.etat !== 'rouge' && !p.presse) {
      p.presse = true;
      if (p.attente > 0) { p.attente = 0; p.dir = Math.sign(p.lat) || 1; }
      else if (Math.abs(p.lat) < p.hw) { p.dir = Math.sign(p.lat) || p.dir; p.v = 2.6; }
    }
    if (p.attente > 0) { p.attente -= dt; p.m.userData.jouer(p.attente > 0 ? 'idle' : 'marche'); }
    else p.lat += p.dir * p.v * dt;
    if ((Math.sign(p.lat) === p.dir && Math.abs(p.lat) > p.hw + 1.6) || p.s < st.s - 40) { retirer(p); return false; } // arrivé sur l'autre bas-côté
    const q = pose(C, p.s, p.lat, tmp); p.m.position.set(q.x, q.y, q.z); regarder(p.m, p.dir * -q.dz, p.dir * q.dx);
    // Le zém qui fonce sur le passage piéton au rouge : accident. Au vert, le piéton s'écarte d'un bond.
    const latJ = st.lat * kFiles(C, st.s); // le zém, en vrais mètres
    if (!p.touche && Math.abs(p.s - st.s) < 1.3 && Math.abs(p.lat - latJ) < .9 && st.v > 2) {
      p.touche = true; p.dir = Math.sign(p.lat - latJ) || 1; p.v = 3; p.attente = 0; p.m.userData.jouer('marche');
      if (p.feu?.etat === 'rouge') { toast('Tu as failli renverser un piéton !', 1.8, 'mal'); accident(st); }
      else toast('Le piéton s’écarte de justesse', 1.4);
    }
    return true;
  });
}
