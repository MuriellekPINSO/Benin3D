import * as THREE from 'three';
import { $ } from './base.js';
import { AUDIO, son } from './audio.js';
import { JEU, LANE, fmtF, pose, toast } from './jeu.js';
import { DISC, bulle, dialogue, nouveauSigne, personne } from './discussions.js';

// ---------- Code de la route : feux tricolores, police, accidents ----------
// Cahier des charges de Schekina, priorités 1 et 2 :
// - des feux aux carrefours (vert, orange, rouge) ; il faut s'arrêter au rouge ;
// - le zém qui brûle un feu rouge est arrêté par la police : dialogue et amende ;
// - un accident n'est plus un simple clignotement : la police vient faire le constat,
//   ou le client descend pour prendre un autre zém et la course est perdue.

const CYCLE = { vert: 9, orange: 2.5, rouge: 7 }, TOUR = CYCLE.vert + CYCLE.orange + CYCLE.rouge;
export const AMENDES = { feu: 2000, constat: 1500 };
const R = { feux: [], police: null };
const choisir = l => l[Math.floor(Math.random() * l.length)];
const etatFeu = (f, t) => { const u = ((t + f.dephase) % TOUR + TOUR) % TOUR; return u < CYCLE.vert ? 'vert' : u < CYCLE.vert + CYCLE.orange ? 'orange' : 'rouge'; };
const tmp = () => ({ x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 });

/** Paie `n` F : d'abord la recette de la course, puis la cagnotte. Faux si l'on n'a pas assez. */
export function payer(st, n) {
  const P = JEU.prog; if (st.argent + (P?.cagnotte || 0) < n) return false;
  const r = Math.min(Math.max(0, st.argent), n); st.argent -= r; if (n > r) P.cagnotte -= n - r; son('piece'); return true;
}

// Matériaux des feux (partagés) : éteint / allumé pour chaque couleur.
const COUL = { rouge: '#ff2a1a', orange: '#ffae1a', vert: '#2bff6a' };
const matsFeu = () => Object.fromEntries(Object.entries(COUL).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: '#202020', emissive: c, emissiveIntensity: 0, roughness: .4 })]));
const gris = new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: .6, metalness: .3 }), blanc = new THREE.MeshLambertMaterial({ color: '#f1f0ea' });
function entre(a, b, ep, mat) { // poutre entre deux points
  const m = new THREE.Mesh(new THREE.BoxGeometry(ep, ep, a.distanceTo(b)), mat); m.position.copy(a).add(b).multiplyScalar(.5); m.lookAt(b); return m;
}

/** Pose les feux sur les carrefours du trajet (ceux où croise une vraie rue), au plus un tous les 220 m. */
export function preparerFeux(C) {
  R.feux = []; R.police = null;
  const liste = (JEU.carrefours || []).filter(c => [c.gauche, c.droite, c.droit].some(b => b && b.cls <= 3)).sort((a, b) => a.s - b.s);
  let dernier = -1e9;
  for (const c of liste) {
    const s0 = c.s - 9; if (s0 < 120 || s0 - dernier < 220 || s0 > C.L - 60) continue;
    dernier = s0;
    const f = { s: s0, dephase: Math.random() * TOUR, passe: false, etat: '', mats: matsFeu() };
    const pied = pose(C, s0, LANE * 2.9, tmp()), haut = pose(C, s0, LANE * .4, tmp()), avant = pose(C, s0 - 25, LANE * .4, tmp());
    const g = new THREE.Group();
    const vPied = new THREE.Vector3(pied.x, pied.y, pied.z), vSommet = vPied.clone().setY(pied.y + 6), vTete = new THREE.Vector3(haut.x, haut.y + 6, haut.z);
    g.add(entre(vPied, vSommet, .18, gris), entre(vSommet, vTete, .12, gris));
    // Tête à trois feux au-dessus de la chaussée, tournée vers ceux qui arrivent.
    const tete = new THREE.Group(); tete.position.set(haut.x, haut.y + 5.1, haut.z); tete.lookAt(avant.x, haut.y + 5.1, avant.z);
    tete.add(new THREE.Mesh(new THREE.BoxGeometry(.5, 1.45, .32), gris));
    for (const [k, y] of [['rouge', .45], ['orange', 0], ['vert', -.45]]) { const d = new THREE.Mesh(new THREE.CircleGeometry(.16, 18), f.mats[k]); d.position.set(0, y, .17); tete.add(d); }
    g.add(tete, entre(vSommet, new THREE.Vector3(haut.x, haut.y + 5.8, haut.z), .05, gris));
    // Ligne d'arrêt blanche en travers de la chaussée.
    const l0 = pose(C, s0, 0, tmp()), l1 = pose(C, s0 + 4, 0, tmp());
    const ligne = new THREE.Mesh(new THREE.BoxGeometry(LANE * 5, .03, .45), blanc); ligne.position.set(l0.x, l0.y + .04, l0.z); ligne.lookAt(l1.x, l0.y + .04, l1.z);
    g.add(ligne);
    JEU.decor.add(g); f.g = g; R.feux.push(f);
  }
}

/** À chaque image : couleurs des feux, passage au rouge, voyant du prochain feu. */
export function majFeux(st) {
  for (const f of R.feux) {
    const e = etatFeu(f, st.temps);
    if (e !== f.etat) { f.etat = e; for (const k of Object.keys(f.mats)) f.mats[k].emissiveIntensity = k === e ? 2.2 : 0; }
    if (!f.passe && st.s >= f.s) {
      f.passe = true;
      if (e === 'rouge' && st.v > 1.5) police(st, 'feu');
      else if (e === 'orange' && st.v > 6) toast('Orange : passé de justesse !', 1.2);
    }
  }
  const f = R.feux.find(f => !f.passe && f.s - st.s < 90 && f.s - st.s > -2), el = $('#jhFeu');
  if (el) { el.hidden = !f; if (f) { el.className = 'jh-feu ' + f.etat; el.innerHTML = `<i></i><b>Feu ${f.etat}</b><span>${Math.max(0, Math.round(f.s - st.s))} m</span>`; } }
}

// Coup de sifflet de l'agent (deux notes aiguës).
function sifflet() {
  const ctx = AUDIO.ctx; if (!ctx || AUDIO.muet) return; const t = ctx.currentTime;
  for (const [t0, d] of [[0, .22], [.3, .45]]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(2900, t + t0); o.frequency.linearRampToValueAtTime(3150, t + t0 + d); g.gain.setValueAtTime(.0001, t + t0); g.gain.exponentialRampToValueAtTime(.12, t + t0 + .02); g.gain.exponentialRampToValueAtTime(.0001, t + t0 + d); o.connect(g).connect(ctx.destination); o.start(t + t0); o.stop(t + t0 + d + .05); }
}
/** L'agent de police au bord de la route, un peu devant le zém. */
function agent(st) {
  const C = JEU.chemin, p = pose(C, st.s + 12, LANE * 2.7, tmp()), q = pose(C, st.s + 12, 0, tmp());
  const m = personne(9000 + Math.floor(Math.random() * 999), { gilet: '#1f3a6e', femme: false });
  m.position.set(p.x, p.y, p.z); m.lookAt(q.x, p.y, q.z);
  const kepi = new THREE.Mesh(new THREE.CylinderGeometry(.14, .15, .1, 12), new THREE.MeshLambertMaterial({ color: '#16264a' })); kepi.position.y = 1.72; m.add(kepi);
  m.userData.voix = { femme: false, graine: 'police' };
  JEU.decor.add(m); return m;
}
/** Contrôle de police : « feu » (feu rouge brûlé) ou « constat » (après un accident). */
export function police(st, motif) {
  if (R.police) return;
  st.v = Math.min(st.v, 2);
  const m = agent(st), montant = AMENDES[motif]; R.police = m; sifflet();
  bulle(m, motif === 'feu' ? 'Hé, zém ! Arrête-toi là !' : 'Police ! On fait le constat.', { duree: 2.6, ton: 'fort' });
  const fin = () => { R.police = null; setTimeout(() => m.parent?.remove(m), 5000); };
  const regler = n => {
    if (payer(st, n)) { toast(`Amende payée : −${fmtF(n)}`, 1.8, 'mal'); bulle(m, motif === 'feu' ? 'C’est bon, circule. Et respecte les feux !' : 'C’est noté. Roule doucement maintenant.'); }
    else { st.service = Math.max(st.service, 6); toast('Pas assez d’argent : moto immobilisée un moment', 2.2, 'mal'); bulle(m, 'Tu restes ici un moment, alors !', { ton: 'fort' }); }
    fin();
  };
  if (motif === 'feu') dialogue('La police routière', `« Tu as brûlé le feu rouge. L’amende : ${fmtF(montant)}. »`, [
    [`Payer ${fmtF(montant)}`, () => regler(montant)],
    ['Pardon chef, c’est la première fois…', () => {
      if (Math.random() < .4) { bulle(m, 'Bon… avertissement pour cette fois. Fais attention !'); toast('Simple avertissement', 1.6, 'bien'); fin(); }
      else { bulle(m, 'Tout le monde dit ça. Tu paies.', { ton: 'fort' }); regler(montant); }
    }],
  ], { defaut: 0, duree: 14, bloquant: true });
  else dialogue('La police · constat d’accident', `« Il faut faire le constat. Les frais : ${fmtF(montant)}. »`, [
    [`Payer le constat · ${fmtF(montant)}`, () => regler(montant)],
    ['C’est lui qui m’a coupé la route !', () => {
      if (Math.random() < .5) { bulle(m, 'Bon, on partage les frais.'); regler(Math.round(montant / 2 / 25) * 25); }
      else { bulle(m, 'J’ai tout vu : c’est toi.', { ton: 'fort' }); regler(montant); }
    }],
  ], { defaut: 0, duree: 14, bloquant: true });
}

/** Après un choc : le client descend (course perdue) ou la police vient faire le constat. */
export function accident(st) {
  st.v = 0; st.service = Math.max(st.service, 1.2);
  const c = DISC.client;
  if (c && Math.random() < .5) {
    bulle(c.siege, choisir(['Je descends ! Je prends un autre zém.', 'Tu veux me tuer ? Je descends ici !', 'Arrête ! Je ne monte plus avec toi.']), { ton: 'fort', duree: 3 });
    toast(`${c.nom.split(' ').slice(-1)[0]} est descendu${c.femme ? 'e' : ''} : course perdue`, 2.4, 'mal');
    const s = c.siege; DISC.client = null; st.passagers = 0; setTimeout(() => { if (!DISC.client && s) s.visible = false; }, 1500);
    nouveauSigne(st.s + 160 + Math.random() * 120);
  } else setTimeout(() => { if (JEU.etat === st && JEU.actif) police(st, 'constat'); }, 900);
}
