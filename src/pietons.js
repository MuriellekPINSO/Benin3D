import * as THREE from 'three';
import { LITE } from './base.js';
import { JEU, LANE, pose, toast } from './jeu.js';
import { accessoire, personnage3d, personnagesPrets } from './personnages.js';
import { accident } from './regles.js';
import { C3, matVeh } from './vehicules.js';
import { mergeColored } from './ville.js';

// ---------- Les passants de Zém Run ----------
// Des gens qui marchent sur les trottoirs le long de la course, dans les deux sens, et d'autres
// qui traversent sur le passage piéton quand le feu est rouge pour les motos. Qui brûle le feu
// et touche un piéton a un accident (constat de police ou client qui descend, regles.js).
// Ce sont les personnages réalistes de personnages.js : sans eux, pas de passants.

const PT = { C: null, marcheurs: [], traversees: [] };
const NB = LITE ? 8 : 22, tmp = { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 };
let BORD = 0; // bord de la chaussée du jeu (5 files), lu au départ : jeu.js et ce module s'importent l'un l'autre

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
  const m = personnage3d(Math.floor(Math.random() * 1e6)); if (!m) return null;
  const cote = Math.random() < .5 ? -1 : 1, sens = Math.random() < .5 ? -1 : 1;
  const p = { m, s: st.s + (loin ? 130 + Math.random() * 90 : -10 + Math.random() * 220), lat: cote * (BORD + 1.8 + Math.random() * 1.4), sens, v: 1.05 + Math.random() * .45 };
  m.userData.jouer('marche', 0); JEU.decor.add(m); return p;
}
const retirer = p => { p.m.parent?.remove(p.m); p.m.userData.liberer(); };

/** Au départ d'une course (ou après un virage) : nouveaux passants le long du nouveau trajet. */
export function preparerPietons(C) { viderPietons(); PT.C = C; BORD = LANE * 2.5; }
export function viderPietons() { for (const p of [...PT.marcheurs, ...PT.traversees]) retirer(p); PT.marcheurs = []; PT.traversees = []; PT.C = null; }

/** Des piétons traversent au passage piéton `s` pendant que le feu `feu` est rouge pour les motos. */
export function traverser(s, feu = null) {
  if (!personnagesPrets() || !PT.C || PT.traversees.length > 6) return;
  const n = 2 + Math.floor(Math.random() * 3);
  for (let k = 0; k < n; k++) {
    const depuis = Math.random() < .5 ? -1 : 1, m = Math.random() < .25 ? marchandeReelle(Math.floor(Math.random() * 1e6), true) : personnage3d(Math.floor(Math.random() * 1e6));
    if (!m) return;
    m.userData.jouer('marche', 0); JEU.decor.add(m);
    PT.traversees.push({ m, feu, s: s + 1.5 + Math.random() * 3, lat: depuis * (BORD + .8 + k * .9 + Math.random()), dir: -depuis, v: 1.3 + Math.random() * .35, attente: k * .4 + Math.random() * .5 });
  }
}

/** À chaque image du jeu. */
export function majPietons(st, dt) {
  const C = PT.C; if (!C || !personnagesPrets()) return;
  // Trottoirs : on garde NB marcheurs autour du zém ; ceux qui sortent de la zone repartent devant.
  while (PT.marcheurs.length < NB) { const p = marcheur(st, PT.marcheurs.length >= NB / 2); if (!p) break; PT.marcheurs.push(p); }
  PT.marcheurs = PT.marcheurs.filter(p => {
    p.s += p.sens * p.v * dt;
    if (p.s < st.s - 30 || p.s > st.s + 240) { retirer(p); return false; }
    const q = pose(C, p.s, p.lat, tmp); p.m.position.set(q.x, q.y, q.z); regarder(p.m, p.sens * q.dx, p.sens * q.dz);
    return true;
  });
  // Passages piétons : ils traversent d'un trottoir à l'autre, puis s'en vont.
  PT.traversees = PT.traversees.filter(p => {
    // Le feu repasse au vert : ceux qui sont encore sur la chaussée pressent le pas vers le trottoir le plus proche.
    if (p.feu && p.feu.etat !== 'rouge' && !p.presse) {
      p.presse = true;
      if (p.attente > 0) { p.attente = 0; p.dir = Math.sign(p.lat) || 1; }
      else if (Math.abs(p.lat) < BORD) { p.dir = Math.sign(p.lat) || p.dir; p.v = 2.6; }
    }
    if (p.attente > 0) { p.attente -= dt; p.m.userData.jouer(p.attente > 0 ? 'idle' : 'marche'); }
    else p.lat += p.dir * p.v * dt;
    if (Math.abs(p.lat) > BORD + 6 || p.s < st.s - 40) { retirer(p); return false; }
    const q = pose(C, p.s, p.lat, tmp); p.m.position.set(q.x, q.y, q.z); regarder(p.m, p.dir * -q.dz, p.dir * q.dx);
    // Le zém qui fonce sur le passage piéton au rouge : accident. Au vert, le piéton s'écarte d'un bond.
    if (!p.touche && Math.abs(p.s - st.s) < 1.3 && Math.abs(p.lat - st.lat) < .9 && st.v > 2) {
      p.touche = true; p.dir = Math.sign(p.lat - st.lat) || 1; p.v = 3; p.attente = 0; p.m.userData.jouer('marche');
      if (p.feu?.etat === 'rouge') { toast('Tu as failli renverser un piéton !', 1.8, 'mal'); accident(st); }
      else toast('Le piéton s’écarte de justesse', 1.4);
    }
    return true;
  });
}
