import * as THREE from 'three';
import { $ } from './base.js';
import { E } from './etat.js';
import { camera, controls } from './scene.js';
import { JEU, demiTour, sauter, virage } from './jeu.js';
import { DISC, klaxonner, repondre } from './discussions.js';
import { interagir } from './interactions.js';
import { changerMeteo } from './meteo.js';
import { manetteSalon, salonActif } from './salon.js';
import { manetteLancePierre, tirEnCours } from './lancepierre.js';
import { SAISIE, saisieClavier, saisieManette } from './saisie.js';

// ---------- Manettes (Xbox, PlayStation, génériques), API Gamepad ----------
// Reprise de 3D monde (Manette.ts) : lecture normalisée (PlayStation en mode brut
// remappée, zone morte), vibrations. Dans Zém Run :
//   gâchette droite (RT/R2) : gaz · gâchette gauche (LT/L2) : frein · stick gauche / croix : files ou virage, haut : tout droit
//   A/✕ : sauter · B/○ : klaxon · X/□ et Y/△ : interagir (la touche E) · croix bas : demi-tour (quand il est proposé)
//   pendant un dialogue : A/✕ = réponse 1, B/○ = 2, X/□ = 3 (le bouton est écrit sur la réponse) · Start : pause · Select : météo
// Dans la ville : stick gauche pour se déplacer, stick droit pour tourner et incliner, gâchettes pour zoomer, Start pour jouer.
// Dans les fenêtres (menus, choix, boutiques, pause, fin de course) : croix ou stick pour promener le focus (cadre jaune),
// A pour valider, B pour fermer.
// Salon entre amis (Ma vie) : stick gauche pour marcher (à fond ou RB : courir), stick droit pour tourner et
// prendre de la hauteur, LB : changer de vue (derrière soi, de haut, très haut) ;
// en voiture ou à moto, RT : gaz, LT : frein puis marche arrière, stick gauche : volant ; A : action
// (entrer, monter, faire le plein, commander…), X : 2e action, B : 3e action ou klaxon, Y : gestes et phrases,
// Select : aller à (GPS en roulant), Start : le menu (comme Échap).
// Au stand du lance-pierre, pendant la partie : stick gauche (ou croix) pour viser, stick droit pour viser finement,
// gâchette droite plus ou moins enfoncée (ou A gardé) pour tendre l'élastique, la relâcher pour tirer ; B : annuler le
// tir, Start : la pause.

const M = { index: null, prec: [], dernier: null, lateral: 0, haut: false, roulement: 0, nom: '', sens: '', repete: 0 };
const zone = (v, s = .16) => { const a = Math.abs(v); return a <= s ? 0 : Math.sign(v) * Math.min(1, (a - s) / (1 - s)); };
// « Xbox Wireless Controller » contient « Wireless Controller », le nom de la manette PS4 : la manette Xbox s'affichait
// en ✕ □ ○. On reconnaît Sony à son numéro de fabricant (054c) ou à son nom, jamais une manette qui se dit Xbox.
const estPS = id => /054c|dualsense|dualshock|playstation|sony/i.test(id) || (/wireless controller/i.test(id) && !/xbox|045e/i.test(id));
function manette() {
  const l = navigator.getGamepads?.(); if (!l) return null;
  const ok = g => g && g.connected !== false && g.axes.length >= 2 && g.buttons.length >= 4;
  if (M.index !== null && ok(l[M.index])) return l[M.index];
  const dispo = Array.from(l).filter(ok); M.index = dispo[0]?.index ?? null; return dispo[0] || null;
}
function actionneur() { const g = manette(); return g?.vibrationActuator ?? g?.hapticActuators?.[0] ?? null; }
/** Vibration courte : 'piece', 'choc', 'arret', 'selection', ou [faible, forte, durée en ms] (le lance-pierre qu'on tend). */
export function vibrer(type) {
  const a = actionneur(); if (!a) return;
  const [faible, forte, duree] = Array.isArray(type) ? type : { selection: [.12, .08, 55], piece: [.25, .1, 70], arret: [.55, .38, 220], choc: [1, .9, 480] }[type] || [.3, .2, 100];
  if (a.playEffect) a.playEffect('dual-rumble', { startDelay: 0, duration: duree, weakMagnitude: faible, strongMagnitude: forte }).catch(() => { });
  else a.pulse?.(Math.max(faible, forte), duree).catch(() => { });
}

// ---------- Fenêtres : la croix promène le focus, A valide, B ferme ----------
// De la plus haute à la plus basse : une fenêtre de choix s'ouvre par-dessus le menu, la fiche d'un métier par-dessus le
// choix. Le menu « Ma vie », les gestes, la garde-robe, les fiches des commerces, la carte et le compte n'y étaient pas :
// on ne pouvait ni y choisir ni en sortir sans la souris (Murielle et Carlos, 26/10).
const PANNEAUX = ['#metierFiche', '#choix', '#compte', '#momo', '#vieFiche', '#garderobe', '#carteGrande', '#vieTirage', '#salon', '#vieHud.ouvert', '#slActions.ouvert', '#accueil', '#boutique', '#mode', '#evenement', '#jeuPause', '#jeuFin', '#jeuClassement', '#jeuDefi', '#jeuMenu', '#offrePub', '#reel'];
const FERMER = '.bq-x, .op-x, #reelFermer, #jpReprendre, #jmRetour, #acPasser, #chAnnuler, #slFermer, #grFermer, #vfFermer, #vhReprendre, #slGestesFermer, #cgFermer, #jcFermer, #jdFermer, #modeFermer, #compteFermer, .momo-fermer, #evAnnuler';
// Le premier bouton où poser le focus en ouvrant : la ligne de Zém Run, « Reprendre », « Rejouer », les tuiles du menu…
const FAVORIS = '.jm-ligne, #jpReprendre, #jfRejouer, #slCreer, #vtCommencer, .vh-tuile, .ac-mode';
const CIBLES = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), summary, a[href], [tabindex="0"]';
// Visible pour de vrai : `offsetParent` vaut null pour un élément en position fixe (le menu ouvert), qu'on ne trouvait donc jamais.
const vu = el => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
function panneauOuvert() { for (const s of PANNEAUX) { const el = $(s); if (vu(el)) return el; } return null; }
const cibles = p => [...p.querySelectorAll(CIBLES)].filter(vu);
const dedans = (p, a) => !!a && a !== p && p.contains(a);
/** Le bouton utile par où commencer : pas la croix de fermeture, pas un champ de texte (il faudrait un clavier). */
function prefere(p) {
  const f = [...p.querySelectorAll(FAVORIS)].find(b => vu(b) && !b.disabled); if (f) return f;
  const l = cibles(p); return l.find(b => b.tagName !== 'INPUT' && !/fermer|annuler|close|-x\b/i.test(`${b.id} ${b.className}`)) || l[0] || null;
}
function focaliser(b, vibre = true) { if (!b) return; b.focus({ preventScroll: true }); b.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); if (vibre) vibrer('selection'); }
/**
 * Le focus va dans le sens poussé : le bouton le plus proche de ce côté (d'un bord à l'autre), en pénalisant l'écart de
 * côté. Une grille (tuiles du menu, tenues, objets de la boutique) se parcourt comme on la voit ; avant, gauche et droite
 * faisaient monter et descendre dans l'ordre du code. Rien en bas ou en haut : le suivant ou le précédent, en bouclant
 * (« Reprendre | Quitter » se parcourt aussi vers le bas) ; rien à gauche ou à droite : on reste au bord.
 */
function deplacerFocus(p, dx, dy) {
  const l = cibles(p); if (!l.length) return;
  const a = document.activeElement, i = l.indexOf(a);
  if (i < 0) return focaliser(prefere(p));
  const r = a.getBoundingClientRect(); let best = null, bs = Infinity;
  for (const b of l) {
    if (b === a) continue;
    const q = b.getBoundingClientRect();
    const av = dy > 0 ? q.top - r.bottom : dy < 0 ? r.top - q.bottom : dx > 0 ? q.left - r.right : r.left - q.right;
    if (av < -6) continue; // pas de ce côté
    const cote = dy ? Math.max(0, Math.max(r.left, q.left) - Math.min(r.right, q.right)) : Math.max(0, Math.max(r.top, q.top) - Math.min(r.bottom, q.bottom));
    const centre = dy ? Math.abs(q.left + q.right - r.left - r.right) / 2 : Math.abs(q.top + q.bottom - r.top - r.bottom) / 2;
    const s = Math.max(0, av) + cote * 3 + centre * .1;
    if (s < bs) { bs = s; best = b; }
  }
  if (best || dy) focaliser(best || l[(i + dy + l.length) % l.length]);
}
function fermerPanneau(p) { const f = [...p.querySelectorAll(FERMER)].find(vu) || (p.id === 'metierFiche' ? p.querySelector('button') : null); f?.click(); }

const sph = new THREE.Spherical(), off = new THREE.Vector3(), avant = new THREE.Vector3();
/** À appeler à chaque image. */
export function majManette(dt) {
  const g = manette();
  if (!g) { if (M.nom) { M.nom = ''; } return; }
  if (!M.nom) { M.nom = g.id; const t = $('#manetteInfo'); if (t) { t.textContent = `Manette connectée · ${g.id.split('(')[0].trim().slice(0, 40)}`; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 3500); } }
  const ps = estPS(g.id), brutPS = g.mapping !== 'standard' && ps;
  const brut = i => (brutPS ? [1, 2, 0, 3][i] ?? i : i);
  const enfonce = g.buttons.map(b => b.pressed || b.value > .35), val = i => g.buttons[brut(i)]?.value ?? 0;
  const appuye = i => !!enfonce[brut(i)] && !M.prec[brut(i)];
  // Un bouton qu'on vient d'enfoncer ou un stick poussé : on joue à la manette, les invites montrent ses boutons.
  if (enfonce.some((v, i) => v && !M.prec[i]) || (g.mapping === 'standard' && [0, 1, 2, 3].some(i => Math.abs(g.axes[i] ?? 0) > .5))) saisieManette(ps);
  const ax = i => zone(g.axes[i] ?? 0);
  let lx = ax(0), ly = ax(1); if (!lx) lx = Number(enfonce[15]) - Number(enfonce[14]); if (!ly) ly = Number(enfonce[13]) - Number(enfonce[12]);
  const rx = ax(2), ry = ax(3), rt = val(7), lt = val(6);
  const p = panneauOuvert();
  if (p && !(JEU.actif && !JEU.pause && p.id !== 'jeuFin' && p.id !== 'boutique')) {
    // Fenêtre ouverte à la manette : le focus y est toujours, bien visible (une liste refaite le perdait).
    if (SAISIE.manette && !dedans(p, document.activeElement)) focaliser(prefere(p), false);
    // Un pas par coup de croix ou de stick ; tenu, un pas toutes les 0,14 s après 0,4 s (la longue liste « Aller à »).
    const sens = Math.abs(lx) > Math.abs(ly) ? (lx > .6 ? [1, 0] : lx < -.6 ? [-1, 0] : null) : (ly > .6 ? [0, 1] : ly < -.6 ? [0, -1] : null), cle = sens ? sens.join() : '';
    if (cle !== M.sens) { M.sens = cle; M.repete = .4; if (sens) deplacerFocus(p, ...sens); }
    else if (sens && (M.repete -= dt) <= 0) { M.repete = .14; deplacerFocus(p, ...sens); }
    M.lateral = lx > .55 ? 1 : lx < -.55 ? -1 : 0; // le stick encore poussé en fermant : pas de changement de file
    if (appuye(0)) { const a = document.activeElement; if (dedans(p, a)) a.click(); else focaliser(prefere(p)); }
    if (appuye(1)) fermerPanneau(p);
    if (appuye(9)) { if (p.id === 'jeuPause') $('#jpReprendre').click(); else if (p.id === 'vieHud') $('#vhReprendre').click(); else if (p.id === 'choix' && tirEnCours()) $('#chAnnuler').click(); } // Start referme la pause du lance-pierre
  } else if (salonActif() && tirEnCours()) {
    // La partie de lance-pierre prend la manette : passée au salon, A y faisait l'action du moment, « Arrêter la partie ».
    // Start met en pause ; Select et Y n'ouvrent rien pendant la minute de jeu (« Aller à » finirait la partie).
    M.sens = '';
    manetteLancePierre({ dt, lx, ly, rx, ry, rt, a: !!enfonce[brut(0)], aAppui: appuye(0), b: appuye(1), start: appuye(9) });
  } else if (salonActif()) {
    M.sens = '';
    manetteSalon({ lx, ly, rx, ry, rt, lt, court: !!enfonce[5], lb: appuye(4), a: appuye(0), b: appuye(1), x: appuye(2), y: appuye(3), select: appuye(8), start: appuye(9), ps }); // ps : les boutons s'affichent ✕ □ ○
  } else if (JEU.actif && JEU.etat && !JEU.fini) {
    M.sens = '';
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
      // Croix vers le bas (pas le stick, qu'on pousse sans le vouloir) : le demi-tour, quand son bouton est affiché.
      if (appuye(13) && $('#jhDemi') && !$('#jhDemi').hidden) demiTour();
      // Le moteur se sent sous les doigts.
      M.roulement -= dt; if (st.v > 3 && M.roulement <= 0) { M.roulement = .16; const a = actionneur(); a?.playEffect?.('dual-rumble', { startDelay: 0, duration: 90, weakMagnitude: Math.min(.35, st.v / 80), strongMagnitude: .05 }).catch(() => { }); }
    }
    if (appuye(9)) $('#jhPause').click();
    if (appuye(8)) changerMeteo();
  } else if (!JEU.actif) {
    M.sens = '';
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
document.addEventListener('vibrer', e => vibrer(e.detail)); // demandé par les modules qui n'importent pas celui-ci (trajets.js)
window.addEventListener('gamepaddisconnected', e => { if (M.index === e.gamepad.index) { M.index = null; M.nom = ''; saisieClavier(); } });
