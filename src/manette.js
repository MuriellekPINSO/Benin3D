import * as THREE from 'three';
import { $ } from './base.js';
import { E } from './etat.js';
import { camera, controls } from './scene.js';
import { JEU, sauter, virage } from './jeu.js';
import { DISC, klaxonner, repondre } from './discussions.js';
import { interagir } from './interactions.js';
import { changerMeteo } from './meteo.js';

// ---------- Manettes (Xbox, PlayStation, génériques), API Gamepad ----------
// Reprise de 3D monde (Manette.ts) : lecture normalisée (PlayStation en mode brut
// remappée, zone morte), vibrations. Dans Zém Run :
//   gâchette droite (RT/R2) : gaz · gâchette gauche (LT/L2) : frein · stick gauche / croix : files ou virage, haut : tout droit
//   A/✕ : sauter · B/○ : klaxon · X/□ : interagir (plein, vendeuse…) · Y/△ : interagir
//   pendant un dialogue : A/✕ = réponse 1, B/○ = 2, X/□ = 3 · Start : pause · Select : météo
// Dans la ville : stick gauche pour se déplacer, stick droit pour tourner et incliner,
// gâchettes pour zoomer, Start pour jouer. Dans les menus : croix ou stick pour choisir, A pour valider.

const M = { index: null, prec: [], dernier: null, lateral: 0, haut: false, roulement: 0, nom: '' };
const zone = (v, s = .16) => { const a = Math.abs(v); return a <= s ? 0 : Math.sign(v) * Math.min(1, (a - s) / (1 - s)); };
function manette() {
  const l = navigator.getGamepads?.(); if (!l) return null;
  const ok = g => g && g.connected !== false && g.axes.length >= 2 && g.buttons.length >= 4;
  if (M.index !== null && ok(l[M.index])) return l[M.index];
  const dispo = Array.from(l).filter(ok); M.index = dispo[0]?.index ?? null; return dispo[0] || null;
}
function actionneur() { const g = manette(); return g?.vibrationActuator ?? g?.hapticActuators?.[0] ?? null; }
/** Vibration courte : 'piece', 'choc', 'arret', 'selection'. */
export function vibrer(type) {
  const a = actionneur(); if (!a) return;
  const [faible, forte, duree] = { selection: [.12, .08, 55], piece: [.25, .1, 70], arret: [.55, .38, 220], choc: [1, .9, 480] }[type] || [.3, .2, 100];
  if (a.playEffect) a.playEffect('dual-rumble', { startDelay: 0, duration: duree, weakMagnitude: faible, strongMagnitude: forte }).catch(() => { });
  else a.pulse?.(Math.max(faible, forte), duree).catch(() => { });
}

// Menus : la croix déplace le focus parmi les boutons visibles du panneau ouvert, A valide.
function panneauOuvert() {
  for (const s of ['#accueil', '#boutique', '#jeuPause', '#jeuFin', '#jeuMenu', '#offrePub', '#reel']) { const el = $(s); if (el && !el.hidden && el.offsetParent !== null) return el; }
  return null;
}
function deplacerFocus(p, sens) {
  const btns = [...p.querySelectorAll('button:not([disabled]):not([hidden]), input, summary')].filter(b => b.offsetParent !== null);
  if (!btns.length) return;
  const i = btns.indexOf(document.activeElement), j = i < 0 ? 0 : (i + sens + btns.length) % btns.length;
  btns[j].focus(); btns[j].scrollIntoView?.({ block: 'nearest' }); vibrer('selection');
}

const sph = new THREE.Spherical(), off = new THREE.Vector3(), avant = new THREE.Vector3();
/** À appeler à chaque image. */
export function majManette(dt) {
  const g = manette();
  if (!g) { if (M.nom) { M.nom = ''; } return; }
  if (!M.nom) { M.nom = g.id; const t = $('#manetteInfo'); if (t) { t.textContent = `Manette connectée · ${g.id.split('(')[0].trim().slice(0, 40)}`; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 3500); } }
  const ps = g.mapping !== 'standard' && /dualsense|wireless controller|playstation|sony/i.test(g.id);
  const brut = i => (ps ? [1, 2, 0, 3][i] ?? i : i);
  const enfonce = g.buttons.map(b => b.pressed || b.value > .35), val = i => g.buttons[brut(i)]?.value ?? 0;
  const appuye = i => !!enfonce[brut(i)] && !M.prec[brut(i)];
  const ax = i => zone(g.axes[i] ?? 0);
  let lx = ax(0), ly = ax(1); if (!lx) lx = Number(enfonce[15]) - Number(enfonce[14]); if (!ly) ly = Number(enfonce[13]) - Number(enfonce[12]);
  const rx = ax(2), ry = ax(3), rt = val(7), lt = val(6);
  const p = panneauOuvert();
  if (p && !(JEU.actif && !JEU.pause && p.id !== 'jeuFin' && p.id !== 'boutique')) {
    // Navigation dans un menu.
    if (appuye(12) || appuye(14) || (ly < -.6 && M.lateral >= 0)) deplacerFocus(p, -1);
    if (appuye(13) || appuye(15) || (ly > .6 && M.lateral <= 0)) deplacerFocus(p, 1);
    M.lateral = ly < -.6 ? -1 : ly > .6 ? 1 : 0;
    if (appuye(0) && document.activeElement && p.contains(document.activeElement)) document.activeElement.click();
    if (appuye(1)) (p.querySelector('.bq-x, .op-x, #reelFermer, #jpReprendre, #jmRetour, #acPasser') || {}).click?.();
    if (appuye(9) && p.id === 'jeuPause') $('#jpReprendre').click();
  } else if (JEU.actif && JEU.etat && !JEU.fini) {
    const st = JEU.etat;
    if (!JEU.pause) {
      st.gazM = rt > .15; st.freinM = lt > .15; // à côté du clavier, sans l'écraser
      // Changement de file : un coup de stick ou de croix = une file.
      const dir = lx > .55 ? 1 : lx < -.55 ? -1 : 0;
      if (dir && dir !== M.lateral && !virage(dir)) st.file = Math.max(-2, Math.min(2, st.file + dir));
      M.lateral = dir;
      if (appuye(5) && !virage(1)) st.file = Math.min(2, st.file + 1); if (appuye(4) && !virage(-1)) st.file = Math.max(-2, st.file - 1);
      // Stick ou croix vers le haut : continuer tout droit au carrefour où l'itinéraire tourne.
      const haut = ly < -.6; if (haut && !M.haut) virage(0); M.haut = haut;
      const dialogue = !!DISC.courant;
      if (appuye(0)) { if (dialogue) repondre(0); else sauter(); }
      if (appuye(1)) { if (dialogue) repondre(1); else klaxonner(); }
      if (appuye(2)) { if (dialogue) repondre(2); else interagir(); }
      if (appuye(3)) interagir();
      // Le moteur se sent sous les doigts.
      M.roulement -= dt; if (st.v > 3 && M.roulement <= 0) { M.roulement = .16; const a = actionneur(); a?.playEffect?.('dual-rumble', { startDelay: 0, duration: 90, weakMagnitude: Math.min(.35, st.v / 80), strongMagnitude: .05 }).catch(() => { }); }
    }
    if (appuye(9)) $('#jhPause').click();
    if (appuye(8)) changerMeteo();
  } else if (!JEU.actif) {
    // Ville : se déplacer, tourner, incliner, zoomer.
    if (lx || ly || rx || ry || rt > .05 || lt > .05) {
      E.flight = null; controls.autoRotate = false;
      off.copy(camera.position).sub(controls.target); sph.setFromVector3(off);
      const d = sph.radius;
      avant.set(-off.x, 0, -off.z).normalize();
      const droite = new THREE.Vector3(-avant.z, 0, avant.x), vit = Math.max(20, d * .9) * dt;
      controls.target.addScaledVector(avant, -ly * vit).addScaledVector(droite, lx * vit);
      sph.theta -= rx * 1.6 * dt; sph.phi = THREE.MathUtils.clamp(sph.phi + ry * 1.1 * dt, .15, controls.maxPolarAngle);
      sph.radius = THREE.MathUtils.clamp(d * (1 + (lt - rt) * 1.4 * dt), controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(off.setFromSpherical(sph));
    }
    if (appuye(9)) $('#btnJouer')?.click();
    if (appuye(8)) changerMeteo();
  }
  M.prec = enfonce;
}
window.addEventListener('gamepadconnected', e => { M.index = e.gamepad.index; });
window.addEventListener('gamepaddisconnected', e => { if (M.index === e.gamepad.index) { M.index = null; M.nom = ''; } });
