import * as THREE from 'three';
import { $, coarse } from './base.js';
import { E } from './etat.js';
import { camera, renderer, scene } from './scene.js';
import { joueurSalon } from './salon.js';
import { T } from './trajets.js';
import { saisieManette } from './saisie.js';
import { panneauOuvert } from './manette.js';

// ---------- Casque de réalité virtuelle (Meta Quest, Pico), WebXR ----------
// « Est-ce que je peux me balader dans Vivre à Cotonou avec un casque VR ? » (Murielle, 17/11). Le rond « Casque VR »
// du salon n'apparaît que si le navigateur sait ouvrir un casque (le navigateur du Quest, celui du Pico, un PC relié à
// un casque). On y est à la première personne, à hauteur d'yeux :
//   - la tête regarde, le stick gauche fait marcher là où l'on regarde (poussé à fond : courir),
//   - le stick droit tourne par crans de 30° (tourner en continu donne le mal des transports),
//   - A, X, B : les actions du moment (entrer, monter sur un zém…), Y : le menu, poignée gauche : « Aller à… »,
//     poignée droite : courir, gâchettes : gaz et frein au volant.
// Les manettes du casque sont présentées au reste du jeu comme une manette ordinaire (manette.js) : tout ce qui se
// fait à la manette se fait donc au casque, sans rien récrire.
// Les fenêtres du jeu (menu, passeport, boutiques, choix…) sont des pages HTML, invisibles dans un casque. On les
// recopie dans un tableau qui flotte devant soi, tel qu'il est à l'écran (boutons, textes, couleurs), et l'on y
// choisit au rayon des manettes (la gâchette clique) ou au stick gauche, comme à la manette. Les actions du moment
// et les derniers messages s'affichent sur une bande, plus bas.

export const VR = { actif: false, pad: null };

const OEIL = 1.6; // hauteur des yeux : le casque part de là, assis ou debout
const OEIL_ASSIS = 1.2; // assis (une chaise, un poste de la salle de jeux) : le personnage l'est, le regard aussi
const CRAN = Math.PI / 6;
const C = {
  session: null, base: null, image: null, demarre: false, debut: 0, n: 0,
  W: new THREE.Matrix4(), Wsuiv: new THREE.Matrix4(), psi: 0, psiSuiv: 0, lacet: 0, lacetVeh: 0, veh: false, tourne: false,
  tete: { pos: new THREE.Vector3(0, 0, 0), lacet: 0 }, panneau: null, fige: 0, suit: false, rafraichir: 0, region: null,
  survol: null, gachette: {}, messages: [], miroir: null, bande: null, ctrl: [], erreur: '',
};
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _l = new THREE.Matrix4();
const HAUT = new THREE.Vector3(0, 1, 0), UN = new THREE.Vector3(1, 1, 1);

/** main.js, au démarrage : `image` dessine une image du jeu (la même que hors du casque). */
export function initCasque(o) {
  C.image = o.image;
  const b = $('#slCasqueBtn'); if (!b) return;
  // Sur un téléphone, Chrome peut répondre oui (les visionneuses en carton) : le rond y troublerait les joueurs. On le
  // garde pour les casques (navigateur du Quest, du Pico…) et les ordinateurs reliés à un casque.
  const casque = /OculusBrowser|Quest|Pico|Wolvic|VR\b/i.test(navigator.userAgent);
  if (!coarse || casque) navigator.xr?.isSessionSupported?.('immersive-vr').then(ok => { b.hidden = !ok; }).catch(() => { });
  b.addEventListener('click', () => { if (VR.actif) C.session?.end(); else entrer(); });
  // Dans le menu, pendant la session : sinon on ne sort du casque que par le bouton Meta de la manette droite.
  $('#vhCasque')?.addEventListener('click', () => { $('#vhReprendre')?.click(); C.session?.end(); });
  // Les messages de la discussion (ceux du jeu et ceux des amis) : les derniers passent sur la bande.
  const ol = $('#slMessages');
  if (ol) new MutationObserver(l => {
    for (const m of l) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      const t = [...n.childNodes].filter(c => c.nodeName !== 'BUTTON').map(c => c.textContent).join('').replace(/\s+/g, ' ').trim();
      if (t) C.messages.push({ t: performance.now(), texte: t });
    }
    if (C.messages.length > 6) C.messages.splice(0, C.messages.length - 6);
  }).observe(ol, { childList: true });
}

async function entrer() {
  if (VR.actif || C.demarre || !joueurSalon()) return;
  C.demarre = true;
  try {
    const session = await navigator.xr.requestSession('immersive-vr');
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local'); // l'origine est la tête au départ : on y ajoute la hauteur des yeux
    renderer.setAnimationLoop(boucle);
    manettes(); // avant la session : les manettes s'annoncent (« connected ») dès qu'elle démarre
    await renderer.xr.setSession(session);
    C.session = session; C.base = renderer.xr.getReferenceSpace(); C.debut = performance.now(); C.n = 0;
    session.addEventListener('end', sortir);
    const S = joueurSalon();
    // On garde la direction que montrait la caméra : on se retrouve face à ce qu'on regardait.
    C.lacet = (S ? S.cap + S.orbite : 0) + Math.PI; C.psi = C.psiSuiv = C.lacet; C.lacetVeh = 0; C.veh = false;
    C.W.identity(); C.Wsuiv.identity();
    preparer();
    VR.actif = true;
    saisieManette(false); // les boutons s'affichent A, X, B (et non E, R, F)
    $('#slCasqueBtn')?.setAttribute('aria-pressed', 'true'); const q = $('#vhCasque'); if (q) q.hidden = false;
  } catch (e) {
    console.warn('casque VR', e);
    renderer.setAnimationLoop(null);
    const t = $('#manetteInfo'); if (t) { t.textContent = 'Le casque n’a pas pu démarrer. Réessaie dans le navigateur du casque.'; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 4000); }
  } finally { C.demarre = false; }
}

function sortir() {
  VR.actif = false; VR.pad = null; C.session = null; C.panneau = null; C.survol = null;
  renderer.setAnimationLoop(null);
  renderer.shadowMap.autoUpdate = true;
  for (const o of [C.miroir, C.bande, ...C.ctrl]) if (o) { o.visible = false; scene.remove(o); }
  const S = joueurSalon(); if (S?.moi) S.moi.visible = true;
  const r = $('#app')?.getBoundingClientRect(); if (r?.width) { camera.aspect = r.width / r.height; camera.zoom = 1; camera.updateProjectionMatrix(); }
  $('#slCasqueBtn')?.setAttribute('aria-pressed', 'false'); const q = $('#vhCasque'); if (q) q.hidden = true;
}

// La boucle du casque : le navigateur la cadence à 72, 90 ou 120 images par seconde, à la place de celle de main.js.
function boucle(t, frame) {
  if (!frame || !renderer.xr.isPresenting) return;
  C.W.copy(C.Wsuiv); C.psi = C.psiSuiv; // la place du casque choisie à l'image précédente, avec laquelle celle-ci est vue
  try { lire(frame); C.image(t); } catch (err) { const k = String(err?.message); if (k !== C.erreur) { C.erreur = k; console.error('casque', err); } }
}

function preparer() {
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; // les ombres, refaites toutes les 6 images
  C.miroir ??= tableau(1536, 1536); C.bande ??= tableau(1024, 512);
  scene.add(C.miroir, C.bande); C.miroir.visible = C.bande.visible = false;
  for (const g of C.ctrl) scene.add(g);
}
/** Les deux manettes du casque : un rayon jaune et un point au bout, visibles quand une fenêtre est ouverte. */
function manettes() {
  if (!C.ctrl.length) for (let i = 0; i < 2; i++) {
    const g = renderer.xr.getController(i);
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    const ligne = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf5b700, depthTest: false, transparent: true, opacity: .9, fog: false, toneMapped: false }));
    const point = new THREE.Mesh(new THREE.SphereGeometry(.008, 10, 8), new THREE.MeshBasicMaterial({ color: 0xf5b700, depthTest: false, fog: false, toneMapped: false }));
    ligne.renderOrder = point.renderOrder = 10001; ligne.frustumCulled = point.frustumCulled = false;
    g.add(ligne, point); g.userData = { ligne, point };
    g.addEventListener('connected', e => { g.userData.main = e.data?.handedness; });
    g.addEventListener('disconnected', () => { g.userData.main = null; });
    C.ctrl.push(g);
  }
}

/** Un tableau qui flotte devant soi : une toile dessinée, toujours au-dessus de la ville. */
function tableau(w, h) {
  const toile = document.createElement('canvas'); toile.width = w; toile.height = h;
  const tex = new THREE.CanvasTexture(toile); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  m.renderOrder = 10000; m.frustumCulled = false; m.matrixAutoUpdate = false;
  m.userData = { toile, ctx: toile.getContext('2d'), tex };
  return m;
}

// ---------- Les manettes du casque, vues comme une manette ordinaire ----------
const VIDE = { pressed: false, value: 0 };
const bouton = (gp, i) => { const b = gp?.buttons?.[i]; return b ? { pressed: b.pressed, value: b.value } : VIDE; };
// Disposition « xr-standard » : 0 gâchette, 1 poignée, 3 clic du stick, 4 A ou X, 5 B ou Y ; stick en axes 2 et 3.
// Disposition d'une manette ordinaire : 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Select, 9 Start.
function padDuCasque(g, d) {
  if (!g && !d) return null;
  const vib = d?.hapticActuators?.[0] || g?.hapticActuators?.[0];
  return {
    id: 'Casque VR (manettes Touch)', index: -1, connected: true, mapping: 'standard',
    axes: [g?.axes?.[2] ?? 0, g?.axes?.[3] ?? 0, 0, 0], // le stick droit tourne par crans (plus bas), il ne fait pas tourner la caméra
    buttons: [bouton(d, 4), bouton(d, 5), bouton(g, 4), bouton(g, 3), VIDE, bouton(d, 1), bouton(g, 0), bouton(d, 0), bouton(g, 1), bouton(g, 5), VIDE, bouton(d, 3), VIDE, VIDE, VIDE, VIDE, VIDE],
    hapticActuators: vib ? [{ pulse: (v, ms) => vib.pulse?.(v, ms) ?? Promise.resolve() }] : [],
  };
}

function lire(frame) {
  const pose = frame.getViewerPose(C.base);
  if (pose) {
    const p = pose.transform.position, o = pose.transform.orientation;
    C.tete.pos.set(p.x, p.y, p.z); _e.setFromQuaternion(_q.set(o.x, o.y, o.z, o.w), 'YXZ'); C.tete.lacet = _e.y;
  }
  let g = null, d = null;
  for (const s of C.session.inputSources) { if (!s.gamepad) continue; if (s.handedness === 'left') g = s.gamepad; else d = s.gamepad; }
  C.g = g; C.d = d;
  VR.pad = padDuCasque(g, d);
  const fenetre = panneauOuvert();
  // Tourner par crans : stick droit poussé, puis relâché avant le cran suivant. Pas quand une fenêtre est ouverte.
  const rx = d?.axes?.[2] ?? 0;
  if (!fenetre && !C.tourne && Math.abs(rx) > .7) { C.tourne = true; const pas = -Math.sign(rx) * CRAN; if (C.veh) C.lacetVeh += pas; else C.lacet += pas; }
  else if (Math.abs(rx) < .35) C.tourne = false;
  // À pied, pousser le stick fait aller là où l'on regarde : la « caméra » du salon (salon.js), c'est la tête.
  const S = joueurSalon();
  if (S && !C.veh) { S.orbite = C.psi + C.tete.lacet + Math.PI - S.cap; S.orbiteT = performance.now(); }
}

/** main.js, juste avant de dessiner : le casque suit le joueur (ou son véhicule), les tableaux suivent la tête. */
export function avantRenduVR(dt) {
  const S = joueurSalon();
  if (!S) { C.session?.end().catch(() => { }); return; } // sorti de Vivre à Cotonou
  if (E.pauseRendu) { C.session?.end().catch(() => { }); return; } // un jeu des créateurs (salle-jeux.js) : c'est une page, il se joue hors du casque
  const J = E.joueur, veh = !!J && J !== S;
  // En montant, on regarde vers l'avant du véhicule ; en descendant, on garde la direction où l'on regardait.
  if (veh !== C.veh) { if (veh) C.lacetVeh = -C.tete.lacet; else C.lacet = C.psi; C.veh = veh; }
  let x, y, z, psi;
  if (veh) {
    const cap = J.cap || 0; psi = cap + Math.PI + C.lacetVeh;
    if (J.oeil) { x = J.oeil.x; y = J.oeil.y; z = J.oeil.z; } // en avion, la place du hublot
    else {
      const long = (J.hl || 1) * 2, h = long < 2.6 ? 1.55 : long > 4.6 ? 1.8 : 1.2; // deux-roues, tokpa-tokpa, voiture
      const recul = T.mode === 'passager' || T.mode === 'ami' ? .45 : 0; // derrière le conducteur
      x = J.x - Math.sin(cap) * recul; z = J.z - Math.cos(cap) * recul; y = (J.y || 0) + h;
    }
  } else { psi = C.lacet; x = S.x; z = S.z; y = (S.y || 0) + (S.couche ? .5 : S.geste === 'assis' ? OEIL_ASSIS : OEIL); } // assis à un ordinateur de la salle de jeux : les yeux à hauteur d'écran
  // La place du casque dans la ville (Wsuiv = translation × rotation), donnée au navigateur pour l'image suivante.
  C.psiSuiv = psi;
  C.Wsuiv.compose(_p.set(x, y, z), _q.setFromAxisAngle(HAUT, psi), UN);
  _m.copy(C.Wsuiv).invert().decompose(_p, _q, _s);
  renderer.xr.setReferenceSpace(C.base.getOffsetReferenceSpace(new XRRigidTransform({ x: _p.x, y: _p.y, z: _p.z }, { x: _q.x, y: _q.y, z: _q.z, w: _q.w })));
  if (S.moi) S.moi.visible = false; // à la première personne : on ne se voit pas de l'intérieur
  const near = S.lieu ? .1 : .2; if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); } // un mur à 30 cm reste un mur
  if (++C.n % 6 === 0) renderer.shadowMap.needsUpdate = true;
  majTableaux(dt);
  majRayons(dt);
}

// ---------- Les tableaux : la fenêtre ouverte, recopiée ; sinon la bande des actions et des messages ----------
function poser(m, lacet, recul, dy, inclinaison, lw, lh) {
  _e.set(inclinaison, lacet, 0, 'YXZ'); _q.setFromEuler(_e);
  _p.set(0, dy, -recul).applyQuaternion(_q.setFromAxisAngle(HAUT, lacet)).add(C.tete.pos);
  _q.setFromEuler(_e);
  _l.compose(_p, _q, _s.set(lw, lh, 1));
  m.matrix.multiplyMatrices(C.W, _l); m.matrixWorldNeedsUpdate = true; m.updateMatrixWorld(true);
}

function majTableaux(dt) {
  const p = panneauOuvert();
  // Une fenêtre qui s'ouvre se pose droit devant ; ensuite elle ne suit la tête que si l'on se détourne franchement.
  if (p !== C.panneau) { C.panneau = p; C.fige = C.tete.lacet; C.suit = false; C.rafraichir = 0; }
  let d = C.tete.lacet - C.fige; d = Math.atan2(Math.sin(d), Math.cos(d));
  if (Math.abs(d) > (p ? .9 : .6)) C.suit = true;
  if (C.suit) { C.fige += d * (1 - Math.exp(-dt * 4)); if (Math.abs(d) < .05) C.suit = false; }
  if (p) {
    if ((C.rafraichir -= dt) <= 0) { C.rafraichir = .2; C.region = dessinerMiroir(cadre(p)); }
    const R = C.region; C.miroir.visible = !!R; C.bande.visible = false;
    if (R) { const s = Math.min(.0027, 1.05 / R.h, 1.4 / R.w); poser(C.miroir, C.fige, 1.2, -.08, 0, R.w * s, R.h * s); }
    return;
  }
  C.miroir.visible = false; C.region = null;
  if ((C.rafraichir -= dt) <= 0) { C.rafraichir = .25; C.bande.visible = dessinerBande(); }
  if (C.bande.visible) poser(C.bande, C.fige, 1.05, -.5, -.42, 1, .5);
}

const AIDE = ['Stick gauche : marcher (à fond : courir) · stick droit : tourner', 'A, X, B : les actions · Y : le menu · poignée gauche : aller à…'];
function dessinerBande() {
  const { ctx: x, toile, tex } = C.bande.userData, W = toile.width, now = performance.now();
  const lignes = [];
  for (const sel of ['#slEntrer', '#slAction2', '#slAction3']) { const b = $(sel); const t = b && !b.hidden ? b.textContent.trim() : ''; if (t) lignes.push({ t, genre: 'action' }); }
  if (now - C.debut < 45000) for (const t of AIDE) lignes.push({ t, genre: 'aide' }); // les premières secondes : comment on joue
  for (const m of C.messages.filter(m => now - m.t < 9000).slice(-2).reverse()) lignes.push({ t: m.texte, genre: 'message' }); // les deux derniers, le plus récent d'abord
  x.clearRect(0, 0, W, toile.height);
  if (!lignes.length) { tex.needsUpdate = true; return false; }
  const police = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  let y = 8;
  for (const l of lignes) {
    const taille = l.genre === 'action' ? 34 : l.genre === 'aide' ? 24 : 27;
    x.font = `${l.genre === 'action' ? 700 : 500} ${taille}px ${police}`;
    const rangs = couper(x, l.t, W - 70).slice(0, 3), h = rangs.length * taille * 1.25 + 22;
    if (y + h > toile.height) break;
    const larg = Math.min(W - 16, Math.max(...rangs.map(r => x.measureText(r).width)) + 44), x0 = (W - larg) / 2;
    x.fillStyle = l.genre === 'action' ? '#F5B700' : l.genre === 'aide' ? 'rgba(21,33,27,.82)' : 'rgba(255,255,255,.94)';
    x.beginPath(); x.roundRect(x0, y, larg, h, 18); x.fill();
    x.fillStyle = l.genre === 'aide' ? '#ffffff' : '#15211b'; x.textBaseline = 'middle'; x.textAlign = 'center';
    rangs.forEach((r, i) => x.fillText(r, W / 2, y + 11 + taille * 1.25 * (i + .5)));
    y += h + 10;
  }
  x.textAlign = 'left';
  tex.needsUpdate = true;
  return true;
}
function couper(x, t, max) {
  const mots = t.split(' '), rangs = []; let l = '';
  for (const m of mots) { const e = l ? `${l} ${m}` : m; if (l && x.measureText(e).width > max) { rangs.push(l); l = m; } else l = e; }
  if (l) rangs.push(l);
  return rangs;
}

/**
 * Ce qu'on recopie : la fenêtre, ou sa boîte quand elle couvre tout l'écran d'un voile (« Aller à… », les choix) ; le
 * voile gris prenait les deux tiers du tableau et la liste devenait illisible.
 */
function cadre(p) {
  const r = p.getBoundingClientRect(); if (r.width * r.height < innerWidth * innerHeight * .8) return p;
  return [...p.querySelectorAll('.panel, .sj-panneau, [class*="boite"]')].find(b => !b.hidden && b.getClientRects().length && b.getBoundingClientRect().width > 120) || p;
}
// La fenêtre telle qu'elle est à l'écran : fonds et bordures des éléments, textes à leur place, icônes, images de la
// même origine. Le bouton qui a le focus (manette ou rayon) est entouré de jaune, comme à l'écran.
const alpha = c => { if (!c || c === 'transparent') return 0; const m = c.match(/rgba?\(([^)]+)\)/); if (m) { const v = m[1].split(/[\s,/]+/).filter(Boolean); return v.length > 3 ? parseFloat(v[3]) : 1; } const s = c.split('/'); return s.length > 1 ? parseFloat(s[1]) : 1; };
const SVG = new Map(), SVG_NS = 'http://www.w3.org/2000/svg';
function dessinerMiroir(p, sansMedia = false) {
  const r = p.getBoundingClientRect();
  const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(innerWidth, r.right), y1 = Math.min(innerHeight, r.bottom);
  const w = x1 - x0, h = y1 - y0; if (w < 20 || h < 20) return null;
  const { ctx: x, toile, tex } = C.miroir.userData, k = Math.min(toile.width / w, toile.height / h, 3);
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, toile.width, toile.height);
  x.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
  x.save(); x.beginPath(); x.rect(x0, y0, w, h); x.clip();
  const csp = getComputedStyle(p), rp = Math.min(parseFloat(csp.borderTopLeftRadius) || 0, 28);
  x.fillStyle = '#fbfaf6'; x.beginPath(); x.roundRect(r.left, r.top, r.width, r.height, rp); x.fill(); boite(x, p, csp);
  const coupes = new Map();
  const coupe = el => { // la partie visible d'un élément, une fois retirés les débordements cachés (listes qui défilent)
    if (!el || el === p) return [x0, y0, x1, y1];
    if (coupes.has(el)) return coupes.get(el);
    let c = coupe(el.parentElement);
    const cs = getComputedStyle(el);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const q = el.getBoundingClientRect(); c = [Math.max(c[0], q.left), Math.max(c[1], q.top), Math.min(c[2], q.right), Math.min(c[3], q.bottom)]; }
    coupes.set(el, c); return c;
  };
  // Une icône (svg) se dessine d'un bloc : ce qu'elle contient n'est pas parcouru.
  const tw = document.createTreeWalker(p, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: nd => {
      if (nd.nodeType === 3) return nd.parentElement?.namespaceURI === SVG_NS ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      if (nd.namespaceURI === SVG_NS && nd.localName !== 'svg') return NodeFilter.FILTER_REJECT;
      if (nd.classList?.contains('tch')) return NodeFilter.FILTER_REJECT; // les touches de manette dessinées : celles du casque sont autres
      return nd.hidden || !nd.getClientRects().length ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  let n = 0;
  for (let nd = tw.nextNode(); nd && n < 4000; nd = tw.nextNode(), n++) {
    const el = nd.nodeType === 3 ? nd.parentElement : nd; if (!el) continue;
    const cs = getComputedStyle(el), op = parseFloat(cs.opacity);
    if (cs.visibility === 'hidden' || cs.display === 'none' || op < .05) continue;
    const c = coupe(nd.nodeType === 3 ? el : el.parentElement); if (c[2] <= c[0] || c[3] <= c[1]) continue;
    x.save(); x.beginPath(); x.rect(c[0], c[1], c[2] - c[0], c[3] - c[1]); x.clip();
    x.globalAlpha = Number.isFinite(op) ? Math.max(.3, op) : 1;
    if (nd.nodeType === 3) texte(x, nd, cs);
    else if (nd.localName === 'svg') icone(x, nd, cs, k);
    else {
      boite(x, nd, cs);
      if (!sansMedia && nd.tagName === 'IMG') image(x, nd);
      if (nd.tagName === 'INPUT' && (nd.value || nd.placeholder)) { x.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; x.fillStyle = nd.value ? cs.color : '#7a857f'; x.textBaseline = 'middle'; const q = nd.getBoundingClientRect(); x.fillText(nd.value || nd.placeholder, q.left + (parseFloat(cs.paddingLeft) || 6), q.top + q.height / 2); }
    }
    x.restore();
  }
  // Le bouton qui a le focus : cadre jaune.
  const a = document.activeElement;
  if (a && a !== p && p.contains(a)) { const q = a.getBoundingClientRect(); x.strokeStyle = '#F5B700'; x.lineWidth = 3.5; x.beginPath(); x.roundRect(q.left - 2, q.top - 2, q.width + 4, q.height + 4, Math.min(14, q.height / 2)); x.stroke(); }
  x.restore();
  try { x.getImageData(0, 0, 1, 1); } catch { if (!sansMedia) return dessinerMiroir(p, true); } // une image d'un autre site salit la toile : on redessine sans
  tex.needsUpdate = true;
  const tw2 = w * k / toile.width, th = h * k / toile.height;
  tex.repeat.set(tw2, th); tex.offset.set(0, 1 - th);
  return { x0, y0, w, h };
}
function boite(x, el, cs) {
  const bg = cs.backgroundColor, bw = parseFloat(cs.borderTopWidth) || 0, bc = cs.borderTopColor;
  const fond = alpha(bg) > .02, bord = bw > 0 && cs.borderTopStyle !== 'none' && alpha(bc) > .02;
  const deg = !fond && cs.backgroundImage.includes('gradient') ? cs.backgroundImage.match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8})/i)?.[1] : null;
  if (!fond && !bord && !deg) return;
  for (const q of el.getClientRects()) {
    if (q.width < 1 || q.height < 1) continue;
    const rr = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, q.height / 2, q.width / 2);
    x.beginPath(); x.roundRect(q.left, q.top, q.width, q.height, rr);
    if (fond || deg) { x.fillStyle = fond ? bg : deg; x.fill(); }
    if (bord) { x.strokeStyle = bc; x.lineWidth = bw; x.stroke(); }
  }
}
function texte(x, nd, cs) {
  let s = nd.nodeValue.replace(/\s+/g, ' '); if (!s.trim()) return;
  if (cs.textTransform === 'uppercase') s = s.toUpperCase();
  const rg = document.createRange(); rg.selectNodeContents(nd);
  const rects = [...rg.getClientRects()].filter(q => q.width > .5 && q.height > .5); if (!rects.length) return;
  x.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; x.fillStyle = cs.color; x.textBaseline = 'middle';
  const mots = s.trim().split(' '); let i = 0;
  rects.forEach((q, j) => { // une ligne par rectangle : on coupe les mots comme le navigateur
    let l = '';
    while (i < mots.length) { const e = l ? `${l} ${mots[i]}` : mots[i]; if (l && j < rects.length - 1 && x.measureText(e).width > q.width + 3) break; l = e; i++; }
    x.fillText(l, q.left, q.top + q.height / 2);
  });
}
function image(x, img) {
  try {
    if (!img.complete || !img.naturalWidth) return;
    const u = new URL(img.currentSrc || img.src, location.href);
    if (u.origin !== location.origin && u.protocol !== 'data:' && u.protocol !== 'blob:' && !img.crossOrigin) return;
    const q = img.getBoundingClientRect(); x.drawImage(img, q.left, q.top, q.width, q.height);
  } catch { }
}
function icone(x, svg, cs, k) {
  const q = svg.getBoundingClientRect(); if (q.width < 2 || q.height < 2) return;
  const cle = `${svg.outerHTML}|${cs.color}|${Math.round(q.width * k)}`;
  let im = SVG.get(cle);
  if (!im) {
    if (SVG.size > 300) SVG.clear();
    const c = svg.cloneNode(true); c.setAttribute('width', Math.round(q.width * k)); c.setAttribute('height', Math.round(q.height * k)); c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    im = new Image(); im.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(c).replace(/currentColor/g, cs.color))}`;
    SVG.set(cle, im);
  }
  if (im.complete && im.naturalWidth) x.drawImage(im, q.left, q.top, q.width, q.height);
}

// ---------- Les rayons des manettes : viser un bouton du tableau, la gâchette clique ----------
const CLIQUABLE = 'button, a[href], input, select, summary, label, [tabindex="0"], [role="button"], [role="radio"], [role="option"]';
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _inv = new THREE.Matrix4(), _lo = new THREE.Vector3(), _ld = new THREE.Vector3();
/**
 * Où le rayon (origine o, direction d unitaire, dans la ville) touche le tableau : u, v de 0 à 1 et la distance, ou null.
 * Calculé à la main : la mémoire rend les sommets des géométries une fois envoyées à la carte graphique (memoire.js),
 * un Raycaster de three n'aurait plus rien à lire.
 */
function toucher(m, o, d) {
  _inv.copy(m.matrixWorld).invert();
  _lo.copy(o).applyMatrix4(_inv); _ld.copy(o).add(d).applyMatrix4(_inv).sub(_lo);
  if (Math.abs(_ld.z) < 1e-6) return null;
  const t = -_lo.z / _ld.z; if (t <= 0) return null;
  const lx = _lo.x + _ld.x * t, ly = _lo.y + _ld.y * t;
  return Math.abs(lx) > .5 || Math.abs(ly) > .5 ? null : { u: lx + .5, v: ly + .5, distance: t };
}
function majRayons(dt) {
  const ouvert = C.miroir.visible && C.region && C.panneau;
  let vise = null;
  for (const g of C.ctrl) {
    const { ligne, point, main } = g.userData;
    ligne.visible = point.visible = !!ouvert && !!main;
    if (!ouvert || !main) continue;
    g.updateMatrixWorld(true);
    _o.setFromMatrixPosition(g.matrixWorld); _d.set(0, 0, -1).transformDirection(g.matrixWorld);
    const hit = toucher(C.miroir, _o, _d);
    const L = hit ? hit.distance : 1.5; ligne.scale.set(1, 1, L); point.position.set(0, 0, -L); point.visible = !!hit;
    const gp = main === 'left' ? C.g : C.d, v = gp?.buttons?.[0]?.value ?? 0, avant = !!C.gachette[main];
    C.gachette[main] = v > .6;
    if (!hit) continue;
    const R = C.region, px = R.x0 + hit.u * R.w, py = R.y0 + (1 - hit.v) * R.h;
    // Tous les éléments sous ce point, et non le seul du dessus : pendant la session, la toile de la 3D peut passer
    // devant la page (c'est le cas dans l'émulateur de Meta).
    const el = document.elementsFromPoint(px, py).find(n => C.panneau.contains(n))?.closest(CLIQUABLE);
    if (el && C.panneau.contains(el)) {
      vise = el;
      if (document.activeElement !== el && (main === 'right' || !C.survol)) { el.focus({ preventScroll: true }); C.rafraichir = 0; }
      if (v > .6 && !avant) { el.click(); C.rafraichir = 0; document.dispatchEvent(new CustomEvent('vibrer', { detail: 'selection' })); }
    }
  }
  C.survol = vise;
  // Le stick droit fait défiler la liste visée (ou celle du bouton qui a le focus) : « Aller à… » est longue.
  const ry = C.d?.axes?.[3] ?? 0;
  if (ouvert && Math.abs(ry) > .2) {
    for (let el = vise || document.activeElement; el && el !== C.panneau.parentElement; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (el.scrollHeight > el.clientHeight + 2 && /(auto|scroll)/.test(cs.overflowY)) { el.scrollTop += ry * 900 * dt; C.rafraichir = Math.min(C.rafraichir, .05); break; }
    }
  }
}

if (import.meta.env.DEV) window.__vr = { VR, C }; // pour les tests (banc d'essai avec un Quest simulé)
