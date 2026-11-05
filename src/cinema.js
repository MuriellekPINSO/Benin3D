import * as THREE from 'three';
import { $ } from './base.js';
import { camera, controls, renderer } from './scene.js';
import { startFlight } from './interface.js';
import { setMood } from './ambiances.js';
import { esplanadePourLeCine } from './evenement.js';
import { AUDIO, radio } from './audio.js';

// ---------- Le ciné de l'Amazone ----------
// « On passe des documentaires sur l'écran de l'Amazone, et l'écran est tactile ou on a une télécommande pour
// choisir le film » (Murielle, 05/11, après le film de Sally sur le Bénin, pour le pitch à Narratify).
//
// L'écran géant du concert (evenement.js) montre la liste des films : on touche une vignette, le film démarre
// sur l'écran. La télécommande, à droite, fait la même chose sans viser : précédent / suivant, lecture / pause,
// retour à la liste, quitter.
//
// LES DROITS. Les films ne sont jamais téléchargés ni copiés : c'est le lecteur officiel de YouTube qui les joue,
// avec le nom de leur chaîne, et tous ont été vérifiés « intégrables » (l'auteur autorise la lecture sur d'autres
// sites). Un film dont l'auteur retire ce droit affichera le message de YouTube à la place de l'image.
//
// LA TECHNIQUE. Une vidéo YouTube ne peut pas devenir une texture 3D (elle vit dans une iframe d'un autre site).
// L'iframe est donc posée PAR-DESSUS la 3D, exactement sur l'écran : à chaque image, ses quatre coins sont projetés
// à l'écran et une transformation en perspective (matrix3d) la plaque dessus. On peut tourner la caméra, elle suit.
export const FILMS = [
  { id: 'YGo7dl4IgnM', titre: 'Bienvenue au Bénin', auteur: 'Sally', duree: '53 min' },
  { id: 'zEqonPGyLcI', titre: 'Les Agoudas, les origines', auteur: 'Alain Foka', duree: '58 min' },
  { id: '5pZR6eY3Usw', titre: 'Abomey, les lieux sacrés', auteur: 'Cultures & Patrimoines Bénin', duree: '25 min' },
  { id: 'W5PrbWy0ZrQ', titre: 'Les Gardiens des Esprits', auteur: 'SLICE Peuples', duree: '51 min' },
  { id: 'prIth2CitnE', titre: 'Ouémé, le fleuve des dieux', auteur: 'Voyages du bout du monde', duree: '52 min' },
  { id: 'YTFQWkDgI3U', titre: '72 heures dans le vaudou', auteur: 'Tataki', duree: '26 min' },
  { id: 'OkF1Xz9a6LI', titre: 'La rivière Noire', auteur: 'RTBF', duree: '16 min' },
  { id: 'CK3sx_aTkR0', titre: 'Ganvié, la Venise d’Afrique', auteur: 'RTBF', duree: '16 min' },
  { id: 'TQS8Qa4KjZg', titre: 'Ganvié, le peuple du lac (VO)', auteur: 'SLICE', duree: '25 min' },
  { id: 'OeTbVmQ7azo', titre: 'Bénin, une autre Afrique', auteur: 'Échappées belles', duree: '1 h 30' },
  { id: 'Nm55uuIsN_c', titre: 'Cotonou, ville-monde', auteur: 'Voyages du bout du monde', duree: '52 min' },
  { id: 'ISyjljqUP1g', titre: 'Cotonou, la ville qui change', auteur: 'Tõnd Média', duree: '25 min' },
  { id: 'JPfRGEy57TU', titre: 'Kolèwa xwé, le retour', auteur: 'Marie Eton', duree: '21 min' },
];
const YT = 'https://www.youtube-nocookie.com';
const C = { actif: false, ecran: null, toile: null, ctx: null, tex: null, choix: 0, film: -1, pause: false, vignettes: [], raf: 0, boite: null, iframe: null, moment: 'jour', radio: false, minDist: 0, maxPolaire: 0, fov: 45, appui: null, titreT: 0 };

// ---------- La liste des films, dessinée sur l'écran ----------
const W = 1280, H = 640, COLS = 5, X0 = 28, Y0 = 74, GX = 18, GY = 14;
const TW = (W - 2 * X0 - (COLS - 1) * GX) / COLS, TH = (H - Y0 - 20 - 2 * GY) / 3, VH = TW * 9 / 16;
const caseDe = i => [X0 + (i % COLS) * (TW + GX), Y0 + Math.floor(i / COLS) * (TH + GY)];
function couper(c, txt, largeur) {
  if (c.measureText(txt).width <= largeur) return txt;
  while (txt.length > 1 && c.measureText(txt + '…').width > largeur) txt = txt.slice(0, -1);
  return txt + '…';
}
function dessinerListe() {
  const c = C.ctx; if (!c) return;
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#10141b'); g.addColorStop(1, '#07090d');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.textBaseline = 'alphabetic';
  c.fillStyle = '#fff'; c.font = '800 34px system-ui, sans-serif'; c.textAlign = 'left'; c.fillText('CINÉ DE L’AMAZONE', X0, 48);
  c.fillStyle = '#f2b705'; c.font = '700 22px system-ui, sans-serif'; c.textAlign = 'right'; c.fillText('Touche un film pour le lancer', W - X0, 48);
  FILMS.forEach((f, i) => {
    const [x, y] = caseDe(i), img = C.vignettes[i];
    c.save(); c.beginPath(); c.roundRect(x, y, TW, VH, 10); c.clip();
    if (img?.complete && img.naturalWidth) c.drawImage(img, x, y, TW, VH);
    else { c.fillStyle = '#1d222b'; c.fillRect(x, y, TW, VH); }
    c.restore();
    // Le triangle « lecture » au milieu de la vignette.
    c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.arc(x + TW / 2, y + VH / 2, 22, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(x + TW / 2 - 7, y + VH / 2 - 11); c.lineTo(x + TW / 2 + 12, y + VH / 2); c.lineTo(x + TW / 2 - 7, y + VH / 2 + 11); c.fill();
    c.fillStyle = 'rgba(0,0,0,.7)'; c.font = '700 14px system-ui, sans-serif';
    const dw = c.measureText(f.duree).width + 12; c.beginPath(); c.roundRect(x + TW - dw - 6, y + VH - 26, dw, 20, 5); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'right'; c.fillText(f.duree, x + TW - 12, y + VH - 11);
    c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = '700 19px system-ui, sans-serif'; c.fillText(couper(c, f.titre, TW), x, y + VH + 22);
    c.fillStyle = '#9aa3b2'; c.font = '600 15px system-ui, sans-serif'; c.fillText(couper(c, f.auteur, TW), x, y + VH + 41);
    if (i === C.choix) { c.strokeStyle = '#f2b705'; c.lineWidth = 5; c.beginPath(); c.roundRect(x - 4, y - 4, TW + 8, VH + 8, 13); c.stroke(); }
  });
  C.tex.needsUpdate = true;
}
// Pendant le film, l'écran est noir : le lecteur est posé par-dessus, et les deux bandes du bord restent sombres.
function dessinerNoir() { C.ctx.fillStyle = '#000'; C.ctx.fillRect(0, 0, W, H); C.tex.needsUpdate = true; }
function chargerVignettes() {
  if (C.vignettes.length) return;
  C.vignettes = FILMS.map(f => {
    const img = new Image(); img.crossOrigin = 'anonymous'; // i.ytimg.com répond avec Access-Control-Allow-Origin: *
    img.onload = () => { if (C.actif && C.film < 0) dessinerListe(); };
    img.src = `https://i.ytimg.com/vi/${f.id}/mqdefault.jpg`; return img;
  });
}

// ---------- Le lecteur YouTube, plaqué sur l'écran ----------
// Le film est en 16:9, l'écran en 2:1 (20 × 10 m) : le lecteur en occupe le milieu, 17,8 × 10 m.
const IW = 1280, IH = 720, DEMI_L = 10 * 16 / 9 / 2, DEMI_H = 5;
const COINS = [[-DEMI_L, DEMI_H], [DEMI_L, DEMI_H], [DEMI_L, -DEMI_H], [-DEMI_L, -DEMI_H]].map(([x, y]) => new THREE.Vector3(x, y, 0));
const p = new THREE.Vector3(), vue = new THREE.Vector3();
/** La transformation CSS qui envoie le rectangle IW × IH sur le quadrilatère q (haut-gauche, haut-droite, bas-droite, bas-gauche). */
function plaquer(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1; if (Math.abs(det) < 1e-9) return null;
  const g = (dx3 * dy2 - dx2 * dy3) / det, h = (dx1 * dy3 - dx3 * dy1) / det;
  // De face (le cas normal), la perspective est nulle : une transformation à plat suffit. Elle s'affiche partout,
  // alors qu'une iframe penchée en 3D reste noire dans certains navigateurs (Chrome sans écran, au moins).
  if (Math.abs(g) + Math.abs(h) < .002) return `matrix(${(x1 - x0) / IW},${(y1 - y0) / IW},${(x3 - x0) / IH},${(y3 - y0) / IH},${x0},${y0})`;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
  return `matrix3d(${a / IW},${d / IW},0,${g / IW},${b / IH},${e / IH},0,${h / IH},0,0,1,0,${x0},${y0},0,1)`;
}
function placerLecteur() {
  const el = C.boite; if (!el || C.film < 0) return;
  const toile = renderer.domElement.getBoundingClientRect(), app = el.parentElement.getBoundingClientRect();
  camera.updateMatrixWorld(); C.ecran.updateMatrixWorld();
  const q = [];
  for (const k of COINS) {
    p.copy(k).applyMatrix4(C.ecran.matrixWorld);
    if (vue.copy(p).applyMatrix4(camera.matrixWorldInverse).z > -camera.near) { el.style.visibility = 'hidden'; return; } // un coin derrière la caméra
    p.project(camera);
    q.push([toile.left - app.left + (p.x + 1) / 2 * toile.width, toile.top - app.top + (1 - p.y) / 2 * toile.height]);
  }
  const m = plaquer(q); if (!m) { el.style.visibility = 'hidden'; return; }
  C.iframe.style.transform = m; el.style.visibility = '';
}
function boucle() {
  if (!C.actif) return;
  placerLecteur();
  if (C.titreT && performance.now() > C.titreT) { $('#cineTitre').hidden = true; C.titreT = 0; }
  C.raf = requestAnimationFrame(boucle);
}
const commande = func => C.iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), YT);
// YouTube dit où en est le film (lecture, pause, fin) si on le lui demande une fois le lecteur chargé.
function ecouterLecteur() { C.iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'cine', channel: 'widget' }), YT); }
function surMessage(e) {
  if (!C.actif || e.origin !== YT || e.source !== C.iframe?.contentWindow) return;
  let m; try { m = JSON.parse(e.data); } catch { return; }
  if (m.event === 'onError') { C.erreur = m.info; titre('Ce film ne peut pas passer ici pour l’instant : choisis-en un autre', 0); return; }
  const etat = m.event === 'onStateChange' ? m.info : m.event === 'infoDelivery' ? m.info?.playerState : undefined;
  if (etat !== undefined) C.etat = etat;
  if (etat === 1 || etat === 2) { C.pause = etat === 2; majTele(); }
  else if (etat === 0) liste(); // film fini : retour à la liste
}

// ---------- Les commandes ----------
function titre(txt, duree = 5000) { const t = $('#cineTitre'); t.textContent = txt; t.hidden = false; C.titreT = duree ? performance.now() + duree : 0; }
function majTele() {
  const lecture = C.film >= 0 && !C.pause, b = $('#cineTele [data-cine="pause"]');
  b.classList.toggle('en-lecture', lecture); // (la propriété hidden n'existe pas sur les icônes SVG : on passe par une classe)
  const nom = C.film < 0 ? 'Lancer le film choisi' : lecture ? 'Pause' : 'Reprendre'; b.title = nom; b.setAttribute('aria-label', nom);
  $('#cineTele [data-cine="liste"]').setAttribute('aria-pressed', String(C.film < 0));
}
function lancer(i) {
  const n = FILMS.length; i = ((i % n) + n) % n;
  C.film = C.choix = i; C.pause = false; C.erreur = C.etat = null;
  const f = FILMS[i];
  C.iframe.title = `${f.titre} (${f.auteur})`;
  C.iframe.src = `${YT}/embed/${f.id}?autoplay=1&rel=0&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
  C.boite.hidden = false; C.boite.style.visibility = 'hidden'; // placé à l'image suivante
  dessinerNoir(); majTele(); titre(`${f.titre} · ${f.auteur}`);
}
function liste() {
  C.film = -1; C.pause = false;
  if (C.iframe) C.iframe.src = 'about:blank';
  if (C.boite) C.boite.hidden = true;
  dessinerListe(); majTele(); titre('Touche un film sur l’écran, ou choisis avec la télécommande', 0);
}
function choisir(pas) {
  if (C.film >= 0) return lancer(C.film + pas); // pendant un film : on zappe
  const n = FILMS.length; C.choix = ((C.choix + pas) % n + n) % n; dessinerListe();
  const f = FILMS[C.choix]; titre(`${f.titre} · ${f.auteur} · ${f.duree}`, 0);
}
function lectureOuPause() {
  if (C.film < 0) return lancer(C.choix);
  commande(C.pause ? 'playVideo' : 'pauseVideo'); C.pause = !C.pause; majTele();
}
const ACTIONS = { liste, prec: () => choisir(-1), suiv: () => choisir(1), pause: lectureOuPause, quitter: quitterCine };

// Toucher l'écran : un appui court sans glisser (glisser, c'est tourner la caméra) sur une vignette lance le film.
// Le point touché se calcule sur le plan de l'écran, pas sur sa géométrie : sur téléphone, le jeu libère les sommets
// des objets une fois envoyés à la carte graphique (memoire.js), et un lancer de rayon sur le maillage plantait.
const rayon = new THREE.Raycaster(), ndc = new THREE.Vector2(), plan = new THREE.Plane(), inverse = new THREE.Matrix4(), point = new THREE.Vector3(), normale = new THREE.Vector3();
function toucher(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  rayon.setFromCamera(ndc, camera); C.ecran.updateMatrixWorld();
  plan.setFromNormalAndCoplanarPoint(normale.set(0, 0, 1).transformDirection(C.ecran.matrixWorld), C.ecran.getWorldPosition(point));
  if (!rayon.ray.intersectPlane(plan, point)) return;
  point.applyMatrix4(inverse.copy(C.ecran.matrixWorld).invert()); // en mètres, sur l'écran de 20 × 10 m centré
  const x = (point.x / 20 + .5) * W, y = (.5 - point.y / 10) * H;
  const i = FILMS.findIndex((_, k) => { const [cx, cy] = caseDe(k); return x >= cx && x <= cx + TW && y >= cy && y <= cy + TH; });
  if (i >= 0) lancer(i);
}
function appui(e) { if (C.actif && C.film < 0 && e.isPrimary) C.appui = [e.clientX, e.clientY, performance.now()]; }
function relache(e) {
  const a = C.appui; C.appui = null;
  if (!a || !C.actif || C.film >= 0 || Math.hypot(e.clientX - a[0], e.clientY - a[1]) > 10 || performance.now() - a[2] > 700) return;
  toucher(e);
}

// ---------- Entrer, sortir ----------
/** Cadre l'écran entier, en face et à sa hauteur (vu d'en haut, il devient un trapèze), quelle que soit la forme de la
 *  fenêtre. En portrait, sur téléphone, l'écran (2:1) ne tient en largeur que de loin, or la statue est à 47 m devant
 *  lui : la caméra reste devant elle (36 m au plus) et élargit son champ de vision, et la télécommande passe en bas. */
function cadrer(duree = 2.2) {
  const centre = C.ecran.getWorldPosition(new THREE.Vector3());
  const el = renderer.domElement, w = el.clientWidth, h = Math.max(1, el.clientHeight), portrait = w < h;
  $('#app')?.classList.toggle('cine-portrait', portrait);
  const large = Math.max(.3, (portrait ? w : w - 96) / h); // 96 px : la télécommande, à droite hors portrait
  const haut = Math.max(.5, (h - (portrait ? 190 : 110)) / h); // le titre en haut (et la télécommande en bas, en portrait)
  let t = Math.tan(THREE.MathUtils.degToRad(22.5)), d = Math.max(5.4 / (t * haut), 10.8 / (t * large));
  if (d > 36) { t = Math.max(5.4 / haut, 10.8 / large) / 36; d = 36; }
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(t));
  if (Math.abs(camera.fov - fov) > .1) { camera.fov = fov; camera.updateProjectionMatrix(); }
  startFlight(centre, d, Math.PI / 2, Math.PI, duree); // θ = π : en face de l'écran, côté statue
}
export function entrerCinema() {
  if (C.actif) return;
  const ecran = esplanadePourLeCine(true); if (!ecran) return;
  C.actif = true; C.ecran = ecran;
  if (!C.ctx) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; C.ctx = cv.getContext('2d');
    C.tex = new THREE.CanvasTexture(cv); C.tex.colorSpace = THREE.SRGBColorSpace; C.tex.anisotropy = 4;
  }
  ecran.material.map = C.tex; ecran.material.needsUpdate = true;
  if (!C.boite) {
    C.boite = document.createElement('div'); C.boite.className = 'cine-video'; C.boite.hidden = true;
    C.iframe = document.createElement('iframe');
    C.iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; C.iframe.allowFullscreen = true;
    C.iframe.referrerPolicy = 'strict-origin-when-cross-origin'; C.iframe.width = IW; C.iframe.height = IH;
    C.iframe.addEventListener('load', ecouterLecteur);
    C.boite.append(C.iframe); renderer.domElement.after(C.boite);
  }
  chargerVignettes();
  const app = $('#app'); C.moment = app?.dataset.moment || 'jour'; app?.classList.add('cine-ouvert');
  setMood('nuit', true); // un ciné en plein air, le soir (sans couper l'heure automatique : on la remet en sortant)
  C.radio = AUDIO.radio; if (C.radio) radio(false); // le son du film, pas la radio par-dessus
  C.minDist = controls.minDistance; controls.minDistance = 8; C.fov = camera.fov;
  C.maxPolaire = controls.maxPolarAngle; controls.maxPolarAngle = Math.PI / 2 - .01; // en face de l'écran, pas seulement d'en haut
  $('#cineTele').hidden = false; $('#btnCine')?.setAttribute('aria-pressed', 'true');
  liste(); cadrer();
  C.raf = requestAnimationFrame(boucle);
}
export function quitterCine() {
  if (!C.actif) return;
  C.actif = false; cancelAnimationFrame(C.raf);
  if (C.iframe) C.iframe.src = 'about:blank';
  if (C.boite) C.boite.hidden = true;
  C.film = -1; C.titreT = 0;
  esplanadePourLeCine(false);
  $('#cineTele').hidden = true; $('#cineTitre').hidden = true; $('#btnCine')?.setAttribute('aria-pressed', 'false');
  $('#app')?.classList.remove('cine-ouvert');
  setMood(C.moment, true);
  if (C.radio) radio(true);
  if (C.minDist) controls.minDistance = C.minDist;
  if (C.maxPolaire) controls.maxPolarAngle = C.maxPolaire;
  if (camera.fov !== C.fov) { camera.fov = C.fov; camera.updateProjectionMatrix(); }
  $('#app')?.classList.remove('cine-portrait');
}
export const cinemaActif = () => C.actif;

export function initCinema() {
  $('#btnCine')?.addEventListener('click', () => (C.actif ? quitterCine() : entrerCinema()));
  $('#cineTele')?.addEventListener('click', e => { const b = e.target.closest('[data-cine]'); if (b) ACTIONS[b.dataset.cine]?.(); });
  // Le concert, la vie en ville, la visite et la boutique prennent toute la scène : on sort du ciné d'abord.
  for (const id of ['#btnConcert', '#btnSalon', '#btnVivre', '#btnJouer', '#btnPres', '#btnMode']) $(id)?.addEventListener('click', quitterCine, true);
  const toile = renderer.domElement;
  toile.addEventListener('pointerdown', appui); toile.addEventListener('pointerup', relache);
  window.addEventListener('message', surMessage);
  window.addEventListener('resize', () => { if (C.actif) cadrer(.6); }); // téléphone tourné : on recadre
  window.addEventListener('keydown', e => {
    if (!C.actif || e.target.closest?.('input, textarea, [contenteditable]')) return;
    if ((e.key === ' ' || e.key === 'Enter') && e.target.closest?.('button')) return; // le bouton touché fait déjà l'action
    const a = { ArrowLeft: 'prec', ArrowRight: 'suiv', ' ': 'pause', Enter: C.film < 0 ? 'pause' : null, Escape: 'quitter' }[e.key];
    if (a) { e.preventDefault(); ACTIONS[a](); }
  });
  // Copie de test seulement : ?cine ouvre le ciné au chargement.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('cine')) setTimeout(() => { $('#acPasser')?.click(); entrerCinema(); }, 2500);
}
if (import.meta.env.DEV) window.__cine = { C, FILMS, entrerCinema, quitterCine, lancer, liste, camera, controls };
