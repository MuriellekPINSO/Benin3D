import { $, toXZ } from './base.js';
import { QUARTIERS } from './donnees-lieux.js';
import { roadLines } from './ville.js';

// ---------- La carte du salon : une mini-carte ronde (façon GTA) et la grande carte ----------
// La mini-carte, en haut à droite, tourne avec la caméra (en haut : là où l'on regarde) : les rues autour de soi, sa
// flèche, son itinéraire GPS, ses amis, son zém, sa maison et ses commerces. La toucher ouvre la grande carte, le nord
// en haut, qu'on fait glisser et qu'on zoome ; toucher un lieu y emmène (comme « Aller à »).
// ctx : { S, T, lieux() → [{ id, nom, x, z, type }], aller(id) }.

let X = null;
const CELL = 200, M = { u: 1, grille: null, t: 0, grande: false, centre: [0, 0], echelle: 6, glisse: null, cibles: [] };
const COUL = { fond: '#e7dfcd', route: '#ffffff', bord: '#c9bfa8', gps: '#2e8fd6', moi: '#1a7d52', ami: '#2e86c1', zem: '#f2c21b', maison: '#c8553d', commerce: '#1a7d52', lieu: '#3a3f44' };
const LARG = c => (c <= 1 ? 7 : c <= 2 ? 5.5 : c <= 3 ? 4.5 : c <= 4 ? 3.5 : 2.5); // largeur dessinée (m) selon la classe de route

function grille() {
  if (M.grille) return M.grille;
  const g = new Map();
  for (const L of roadLines) {
    if (L.cls >= 10 || L.pts.length < 2) continue;
    for (let k = 1; k < L.pts.length; k++) {
      const [ax, az] = L.pts[k - 1], [bx, bz] = L.pts[k], cle = Math.floor((ax + bx) / 2 / CELL) + ',' + Math.floor((az + bz) / 2 / CELL);
      let l = g.get(cle); if (!l) g.set(cle, l = []); l.push(ax, az, bx, bz, L.cls);
    }
  }
  return M.grille = g;
}
/** Les rues autour de (x, z) à r mètres, par classe (les petites d'abord, les grandes par-dessus). */
function dessinerRues(c, x, z, r, k) {
  const g = grille(), n = Math.ceil(r / CELL), ix = Math.floor(x / CELL), iz = Math.floor(z / CELL), parClasse = new Map();
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const l = g.get((ix + i) + ',' + (iz + j)); if (!l) continue;
    for (let q = 0; q < l.length; q += 5) { const cl = l[q + 4]; let a = parClasse.get(cl); if (!a) parClasse.set(cl, a = []); a.push(l[q], l[q + 1], l[q + 2], l[q + 3]); }
  }
  const classes = [...parClasse.keys()].sort((a, b) => b - a);
  c.lineCap = 'round';
  for (const passe of [0, 1]) for (const cl of classes) { // un liseré, puis la chaussée
    const a = parClasse.get(cl); c.beginPath();
    for (let q = 0; q < a.length; q += 4) { c.moveTo(a[q], a[q + 1]); c.lineTo(a[q + 2], a[q + 3]); }
    c.strokeStyle = passe ? COUL.route : COUL.bord; c.lineWidth = Math.max(LARG(cl), (passe ? 2.4 : 3.8) * M.u / k) + (passe ? 0 : 1.6 * M.u / k); c.stroke();
  }
}
// Tailles en pixels de l'écran (M.u : pixels du canevas par pixel d'écran, et un peu plus sur la mini-carte d'un téléphone).
function point(c, x, z, rayonPx, couleur, k, contour = '#ffffff') {
  c.beginPath(); c.arc(x, z, rayonPx * M.u / k, 0, Math.PI * 2); c.fillStyle = couleur; c.fill(); c.lineWidth = 2 * M.u / k; c.strokeStyle = contour; c.stroke();
}
function fleche(c, x, z, cap, k, couleur = COUL.moi) {
  const L = 9 * M.u / k, s = Math.sin(cap), co = Math.cos(cap);
  c.beginPath(); c.moveTo(x + s * L, z + co * L); c.lineTo(x - s * L * .7 + co * L * .65, z - co * L * .7 - s * L * .65); c.lineTo(x - s * L * .3, z - co * L * .3); c.lineTo(x - s * L * .7 - co * L * .65, z - co * L * .7 + s * L * .65); c.closePath();
  c.fillStyle = couleur; c.fill(); c.lineWidth = 2 * M.u / k; c.strokeStyle = '#ffffff'; c.stroke();
}
function gps(c, k) {
  const G = X.T.gps; if (!G?.pts?.length) return;
  c.beginPath(); G.pts.forEach(([x, z], i) => (i ? c.lineTo(x, z) : c.moveTo(x, z))); c.strokeStyle = COUL.gps; c.lineWidth = 4 * M.u / k; c.lineJoin = 'round'; c.stroke();
  const [dx, dz] = G.pts[G.pts.length - 1]; point(c, dx, dz, 6, COUL.gps, k);
}
/** Les repères : amis, zém, maison, commerces (et sur la grande carte, tous les lieux). */
function reperes(c, k, tous) {
  const S = X.S, out = [];
  for (const L of X.lieux()) {
    if (!tous && L.type === 'lieu') continue;
    point(c, L.x, L.z, L.type === 'lieu' ? 4.5 : 6.5, COUL[L.type] || COUL.lieu, k); out.push(L);
  }
  for (const A of S.autres.values()) if (A.g && A.etat && !A.etat.i) point(c, A.x, A.z, 5.5, COUL.ami, k);
  if (X.T.zem?.V) point(c, X.T.zem.V.x, X.T.zem.V.z, 5.5, COUL.zem, k, '#1d1a16');
  return out;
}
function positionJoueur() { const S = X.S, V = X.T.mode === 'conduit' ? X.T.veh : null; return V ? [V.x, V.z, V.cap] : [S.x, S.z, S.cap]; }

// ---------- La mini-carte ----------
function dessinerMini() {
  const cv = $('#miniCarte'), dpr = Math.min(2, devicePixelRatio || 1), taille = Math.round(cv.getBoundingClientRect().width * dpr) || 380;
  if (cv.width !== taille) { cv.width = cv.height = taille; }
  const c = cv.getContext('2d'), S = X.S, D = cv.width, R = D / 2, [px, pz, cap] = positionJoueur();
  M.u = Math.max(dpr, D / 190); // les repères gardent une taille lisible sur la petite mini-carte du téléphone
  const k = (X.T.mode === 'pied' ? .62 : .42) * D / 190, lacet = cap + (S.orbite || 0); // pixels par mètre (environ 150 m de rayon à pied, 225 m en roulant)
  c.save(); c.clearRect(0, 0, D, D); c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.clip();
  c.fillStyle = COUL.fond; c.fillRect(0, 0, D, D);
  c.translate(R, R); c.rotate(lacet + Math.PI); c.scale(k, k); c.translate(-px, -pz); // en haut : là où regarde la caméra
  dessinerRues(c, px, pz, R / k * 1.5, k); gps(c, k); reperes(c, k, false); fleche(c, px, pz, cap, k);
  c.restore();
  // Le nord, sur le bord : la direction (0, −1) tournée comme la carte.
  const a = lacet + Math.PI, u = M.u, b = R - 11 * u, sx = R + b * Math.sin(a), sy = R - b * Math.cos(a);
  c.beginPath(); c.arc(sx, sy, 8 * u, 0, Math.PI * 2); c.fillStyle = '#15211b'; c.fill();
  c.fillStyle = '#ffffff'; c.font = `800 ${10 * u}px "Google Sans", system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', sx, sy + .5);
  c.beginPath(); c.arc(R, R, R - 1.5 * u, 0, Math.PI * 2); c.lineWidth = 3 * u; c.strokeStyle = '#ffffff'; c.stroke();
}

// ---------- La grande carte ----------
function dessinerGrande() {
  const cv = $('#carteGrandeCanvas'), r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  const c = cv.getContext('2d'), W = cv.width, H = cv.height, k = dpr / M.echelle, [cx, cz] = M.centre, [px, pz, cap] = positionJoueur(); M.u = dpr;
  c.save(); c.fillStyle = COUL.fond; c.fillRect(0, 0, W, H);
  c.translate(W / 2, H / 2); c.scale(k, k); c.translate(-cx, -cz); // le nord en haut
  dessinerRues(c, cx, cz, Math.hypot(W, H) / 2 / k, k); gps(c, k);
  // Les noms : ses lieux d'abord, puis les quartiers ; un nom qui en chevaucherait un autre n'est pas écrit.
  c.textAlign = 'center'; c.textBaseline = 'middle';
  M.cibles = reperes(c, k, true);
  const pris = [], libre = (x, y, w, h) => { if (pris.some(r => x < r[2] && x + w > r[0] && y < r[3] && y + h > r[1])) return false; pris.push([x, y, x + w, y + h]); return true; };
  const ecrire = (txt, x, z, taille, poids, couleur, contour) => {
    c.font = `${poids} ${taille * dpr / k}px "Google Sans", system-ui, sans-serif`; const w = c.measureText(txt).width, h = taille * 1.3 * dpr / k;
    if (!libre(x - w / 2, z - h / 2, w, h)) return; if (contour) { c.lineWidth = 3 * dpr / k; c.strokeStyle = '#ffffff'; c.strokeText(txt, x, z); } c.fillStyle = couleur; c.fillText(txt, x, z);
  };
  const ordre = { commerce: 0, maison: 1, lieu: 2 };
  for (const L of [...M.cibles].sort((a, b) => ordre[a.type] - ordre[b.type])) ecrire(L.nom, L.x, L.z - 14 * dpr / k, 12, 700, '#15211b', true);
  for (const [nom, la, lo] of QUARTIERS) { const [x, z] = toXZ(la, lo); if (Math.abs(x - cx) < W / k && Math.abs(z - cz) < H / k) ecrire(nom.toUpperCase(), x, z, 11, 800, 'rgba(21, 33, 27, .5)', false); }
  fleche(c, px, pz, cap, k / 1.3);
  c.restore();
}
function ouvrirGrande() {
  const [px, pz] = positionJoueur(); M.centre = [px, pz]; M.echelle = 6; M.grande = true;
  $('#carteGrande').hidden = false; dessinerGrande();
}
function fermerGrande() { M.grande = false; $('#carteGrande').hidden = true; }
function versMonde(e) {
  const cv = $('#carteGrandeCanvas'), r = cv.getBoundingClientRect();
  return [M.centre[0] + (e.clientX - r.left - r.width / 2) * M.echelle, M.centre[1] + (e.clientY - r.top - r.height / 2) * M.echelle];
}

/** À chaque image du salon : la mini-carte (dix fois par seconde), la grande si elle est ouverte. */
export function majCarteSalon() {
  if (!X) return;
  const mini = $('#miniCarte'), dehors = !X.S.lieu && X.T.mode !== 'avion';
  if (mini.hidden === dehors) mini.hidden = !dehors;
  const t = performance.now(); if (t - M.t < 100) return; M.t = t;
  if (dehors) dessinerMini();
  if (M.grande) dessinerGrande();
}
export function basculerCarte() { if (M.grande) fermerGrande(); else if (X && !X.S.lieu) ouvrirGrande(); }
export function quitterCarteSalon() { fermerGrande(); const m = $('#miniCarte'); if (m) m.hidden = true; }
export function initCarteSalon(ctx) {
  X = ctx;
  $('#miniCarte')?.addEventListener('click', ouvrirGrande);
  $('#miniCarte')?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrirGrande(); } });
  $('#cgFermer')?.addEventListener('click', fermerGrande);
  $('#cgPlus')?.addEventListener('click', () => { M.echelle = Math.max(1.2, M.echelle / 1.6); dessinerGrande(); });
  $('#cgMoins')?.addEventListener('click', () => { M.echelle = Math.min(40, M.echelle * 1.6); dessinerGrande(); });
  $('#cgMoi')?.addEventListener('click', () => { const [px, pz] = positionJoueur(); M.centre = [px, pz]; dessinerGrande(); });
  const cv = $('#carteGrandeCanvas');
  cv?.addEventListener('pointerdown', e => { M.glisse = { x: e.clientX, y: e.clientY, depart: [...M.centre], bouge: false, id: e.pointerId }; cv.setPointerCapture(e.pointerId); });
  cv?.addEventListener('pointermove', e => {
    if (!M.glisse || e.pointerId !== M.glisse.id) return; const dx = e.clientX - M.glisse.x, dy = e.clientY - M.glisse.y;
    if (Math.hypot(dx, dy) > 4) M.glisse.bouge = true;
    M.centre = [M.glisse.depart[0] - dx * M.echelle, M.glisse.depart[1] - dy * M.echelle]; dessinerGrande();
  });
  cv?.addEventListener('pointerup', e => {
    const G = M.glisse; M.glisse = null; if (!G || G.bouge) return;
    // Un lieu touché : on y va (comme « Aller à »).
    const [x, z] = versMonde(e), L = M.cibles.map(l => [l, Math.hypot(l.x - x, l.z - z)]).sort((a, b) => a[1] - b[1])[0];
    if (L && L[1] < 18 * M.echelle) { fermerGrande(); X.aller(L[0].id); }
  });
  cv?.addEventListener('wheel', e => { e.preventDefault(); M.echelle = Math.min(40, Math.max(1.2, M.echelle * (e.deltaY > 0 ? 1.15 : 1 / 1.15))); dessinerGrande(); }, { passive: false });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && M.grande) { fermerGrande(); e.stopPropagation(); } }, true);
  if (import.meta.env.DEV) window.__carte = { M, ouvrirGrande, fermerGrande };
}
