import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { TRIPO, urlTripo } from './batiments-tripo.js';
import { construireReseau, itineraireCourt } from './carrefours.js';
import { personne } from './discussions.js';
import { dansBatiment, dansObstacleRue, pietonOk } from './rue.js';
import { hauteurSol } from './sols.js';
import { animerMoto } from './roues.js';
import { dansTerrePlein } from './terre-pleins.js';
import { dansCirculation } from './trafic.js';
import { scene } from './scene.js';
import { plusTard } from './telechargements.js';
import { TABLIERS, mergeColored, roadLines } from './ville.js';
import { TOKPA_3D, ZEMS_3D, gabaritDe, matVeh, partsTokpa, partsVelo, partsVoiture, partsZem } from './vehicules.js';

// ---------- Conduire dans la ville (Ma vie, salon entre amis) ----------
// On monte sur sa moto ou dans sa voiture et on roule où l'on veut, mais sur les routes : la chaussée et
// le bord du trottoir (pour se garer, prendre quelqu'un, s'arrêter à une station), jamais à travers les
// murs ni les bâtiments : on y bute. Marche arrière et demi-tour comme en vrai, ponts (on monte sur le
// tablier par sa rampe, on passe dessous en travers), essence qui baisse en roulant. Le GPS trace
// l'itinéraire jusqu'à la destination choisie ; le zém qu'on hèle le suit tout seul.

// Vitesses en m/s (13,9 = 50 km/h ; on roule plus vite qu'en vrai : la ville est grande), essence à l'échelle du jeu : des réservoirs de quelques litres, qu'on voit
// baisser en roulant, mais assez de kilomètres par litre pour qu'une course de zém ou de taxi rapporte plus que
// l'essence qu'elle coûte (metiers.js).
export const VEHICULES = {
  moto: { nom: 'moto', long: 2, larg: .8, vmax: 22, accel: 5.5, frein: 9, recul: 2.5, braquage: 1.9, reservoir: 3, kmParLitre: 12, selle: [1.02, -.08], arriere: -.62 },
  voiture: { nom: 'voiture', long: 4.4, larg: 1.8, vmax: 25, accel: 5, frein: 8.5, recul: 3.5, braquage: 1.3, reservoir: 6, kmParLitre: 6, cache: true },
  taxi: { nom: 'taxi', long: 4.3, larg: 1.8, vmax: 25, accel: 5, frein: 8.5, recul: 3.5, braquage: 1.3, reservoir: 6, kmParLitre: 6, cache: true },
  tokpa: { nom: 'tokpa-tokpa', long: 5, larg: 1.9, vmax: 20, accel: 3.8, frein: 7.5, recul: 2.5, braquage: 1.05, reservoir: 10, kmParLitre: 4, cache: true }, // l'apprenti se tient à la porte latérale, à droite (metiers.js)
  zem: { nom: 'zém', long: 2, larg: .8, vmax: 18, accel: 5, frein: 9, recul: 2, braquage: 1.9, reservoir: 3, kmParLitre: 12, selle: [1.02, -.08], arriere: -.62 },
  // Le vélo Caï Caï : lent, nerveux au démarrage, il tourne court. `pedale` : pas d'essence, donc jamais
  // de panne sèche et rien à consommer (trajets.js saute le carburant pour lui).
  velo: { nom: 'vélo', long: 1.8, larg: .6, vmax: 7, accel: 2.8, frein: 7, recul: 1.2, braquage: 2.3, reservoir: 0, kmParLitre: 0, pedale: true, selle: [.95, -.3], arriere: -.5 },
};
export const PRIX_LITRE = 680; // à la pompe (Zém Run : 680 F à la station, 500 F le kpayo)
const D_ACCEL = 4.5; // accélération du zém (ou du tokpa-tokpa) en pilote automatique

// Modèles réalistes : voiture et moto du joueur générées par Tripo (public/modeles/batiments/, sans pilote :
// c'est son personnage qu'on voit dessus), zémidjan de « 3D monde » (gilet jaune, casque). Gabarits : avant vers
// +x (vehicules.js). Tant qu'ils ne sont pas chargés, les modèles dessinés en code.
const MODELES = { voiture: null, moto: null, taxi: null };
const LONGUEURS = { voiture: 4.4, moto: 2, taxi: 4.3 };
const DEMI_TOUR = { voiture: true, moto: true, taxi: false }; // le redressement aligne l'axe long mais ne sait pas où est l'avant : vérifié en jeu (phare devant)
const SELLES = { moto: [.86, -.27] }; // selle du modèle Tripo, mesurée : dessus à 0,78 m, 0,2 à 0,3 m derrière le centre (avec [1,02 ; −0,08] du zém, on s'asseyait sur le réservoir)
export function chargerVehicules() {
  const ch = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  for (const [type, id] of [['voiture', 'voiture-perso'], ['moto', 'moto-perso'], ['taxi', 'voiture']]) { // taxi : celui de Zém Run
    if (!TRIPO.info[id]) continue;
    plusTard(() => ch.loadAsync(urlTripo(id))).then(g => { MODELES[type] = gabaritDe(g.scene, { largeur: LONGUEURS[type] }); }).catch(e => console.warn(`modèle ${id}`, e.message));
  }
}
/** Un véhicule : modèle (avant vers +z du groupe) et état de conduite. */
export function creerVehicule(type, { couleur } = {}) {
  const D = VEHICULES[type], g = new THREE.Group();
  const gabarit = type === 'zem' ? ZEMS_3D.moto : MODELES[type];
  let m;
  if (type === 'tokpa') { m = TOKPA_3D.geo ? new THREE.Mesh(TOKPA_3D.geo, TOKPA_3D.mat) : new THREE.Mesh(mergeColored(partsTokpa()), matVeh); m.castShadow = true; } // le minibus de Zém Run (Tripo)
  else if (gabarit) m = gabarit.clone();
  else { m = new THREE.Mesh(mergeColored(type === 'velo' ? partsVelo({}) : type === 'voiture' || type === 'taxi' ? partsVoiture(type === 'taxi' ? '#f2c21b' : couleur || '#7a1f2b') : partsZem({ pilote: type === 'zem', carrosserie: couleur, chemise: '#f2c21b' })), matVeh); m.castShadow = true; m.receiveShadow = true; } // le vélo est vide : c'est le personnage du joueur qu'on voit dessus
  m.rotation.y = -Math.PI / 2 + (gabarit && MODELES[type] && DEMI_TOUR[type] ? Math.PI : 0); g.add(m); // avant +x → +z
  scene.add(g);
  // Roues qui tournent, fumée, poussière (roues.js) : elles se posent dans le repère du véhicule, l'avant vers +x,
  // alors que le groupe a son avant en +z. Sans ce quart de tour, les quatre disques sortaient de chaque côté de la moto.
  let anim = null;
  if (type === 'moto' || type === 'zem') { const axe = new THREE.Group(); axe.rotation.y = -Math.PI / 2; g.add(axe); anim = animerMoto(axe, { parent: scene }); }
  return { type, D, g, x: 0, z: 0, y: 0, cap: 0, v: 0, km: 0, anim, selle: (gabarit && MODELES[type] && SELLES[type]) || D.selle };
}
export function retirerVehicule(V) { if (V) { scene.remove(V.g); V.anim?.liberer(); } } // les géométries sont partagées entre les copies : on ne les libère pas
export function placer(V, x, z, cap) { V.x = x; V.z = z; V.cap = cap; V.v = 0; V.y = hauteur(x, z, 0); V.g.position.set(V.x, V.y, V.z); V.g.rotation.y = V.cap; }
/** Où asseoir un personnage sur le véhicule (repère du véhicule) : pilote ou passager ; null : dans la voiture, on ne le voit pas. */
export function siege(V, passager = false) {
  const D = V.D; if (D.cache) return null;
  return { y: V.selle[0] - .48, z: passager ? D.arriere : V.selle[1] }; // .48 : hauteur du bassin d'un personnage assis
}

// ---------- Les routes : où l'on peut rouler ----------
const G = { cases: null, ponts: null }, CS = 32;
const cle = (x, z) => Math.floor(x / CS) + ',' + Math.floor(z / CS);
function indexer() {
  if (G.cases) return;
  const g = new Map(), p = new Map();
  const ranger = (m, ax, az, bx, bz, r, e) => {
    for (let cx = Math.floor((Math.min(ax, bx) - r) / CS); cx <= Math.floor((Math.max(ax, bx) + r) / CS); cx++)
      for (let cz = Math.floor((Math.min(az, bz) - r) / CS); cz <= Math.floor((Math.max(az, bz) + r) / CS); cz++) { const k = cx + ',' + cz; let l = m.get(k); if (!l) m.set(k, l = []); l.push(e); }
  };
  roadLines.forEach(L => {
    if (L.cls === 6 || L.cls >= 10) return; // ni les sentiers, ni les pistes de l'aéroport
    const hw = (L.w || 6) / 2 + 1.1; // la chaussée et le bord du trottoir
    for (let k = 1; k < L.pts.length; k++) { const [ax, az] = L.pts[k - 1], [bx, bz] = L.pts[k]; ranger(g, ax, az, bx, bz, hw, [ax, az, bx, bz, hw]); }
  });
  for (const T of TABLIERS) for (let j = 1; j < T.pts.length; j++) { const [ax, az] = T.pts[j - 1], [bx, bz] = T.pts[j]; ranger(p, ax, az, bx, bz, T.w / 2 + 1, [ax, az, bx, bz, T.w / 2 + .6, T.h[j - 1], T.h[j]]); }
  G.cases = g; G.ponts = p;
}
const projeter = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); return [Math.hypot(ax + dx * t - x, az + dz * t - z), t]; };
/** Vrai si l'on peut rouler en (x, z) : sur une route, hors des bâtiments et des terre-pleins. */
export function surRoute(x, z) {
  indexer();
  const l = G.cases.get(cle(x, z)); if (!l) return false;
  for (const [ax, az, bx, bz, hw] of l) if (projeter(x, z, ax, az, bx, bz)[0] <= hw) return !dansBatiment(x, z) && !dansTerrePlein(x, z, 0) && !dansObstacleRue(x, z, .2); // ni bâtiment, ni terre-plein central, ni mur de parcelle
  return false;
}
/** Hauteur sous les roues : le tablier d'un pont si l'on y est monté (par sa rampe), sinon le sol. */
export function hauteur(x, z, yPrec) {
  indexer();
  const l = G.ponts.get(cle(x, z)); if (!l) return 0;
  let best = -1;
  for (const [ax, az, bx, bz, hw, h0, h1] of l) { const [d, t] = projeter(x, z, ax, az, bx, bz); if (d <= hw) { const h = h0 + (h1 - h0) * t; if (Math.abs(h - yPrec) < 1.6 && h > best) best = h; } }
  return best >= 0 ? best : 0; // trop haut par rapport à là où l'on est : on passe dessous
}

/** Vrai si un pont (tablier ou rampe) passe à moins de r mètres de (x, z) : on n'y pose pas un arrêt de bus. */
export function pontPres(x, z, r = 20) {
  indexer();
  for (let cx = Math.floor((x - r) / CS); cx <= Math.floor((x + r) / CS); cx++) for (let cz = Math.floor((z - r) / CS); cz <= Math.floor((z + r) / CS); cz++)
    for (const [ax, az, bx, bz, hw] of G.ponts.get(cx + ',' + cz) || []) if (projeter(x, z, ax, az, bx, bz)[0] <= hw + r) return true;
  return false;
}

// ---------- Conduire ----------
/**
 * Une image de conduite. av : accélérateur (+1) ou frein puis marche arrière (−1) ; tour : volant (+1 à gauche).
 * Renvoie 'choc' si l'on vient de buter contre un mur ou un trottoir haut, sinon null.
 */
export function piloter(V, av, tour, dt, { panne = false } = {}) {
  const D = V.D, vmax = panne ? 1.2 : D.vmax;
  if (av > .05) V.v = V.v < -.2 ? Math.min(0, V.v + D.frein * dt) : Math.min(vmax, V.v + D.accel * av * dt * Math.max(.15, 1 - V.v / (vmax * 1.05)));
  else if (av < -.05) V.v = V.v > .2 ? Math.max(0, V.v - D.frein * -av * dt) : Math.max(-D.recul, V.v - D.accel * .6 * -av * dt);
  else V.v -= Math.sign(V.v) * Math.min(Math.abs(V.v), 1.4 * dt); // roue libre
  if (V.v > vmax) V.v = Math.max(vmax, V.v - D.frein * dt);
  // Volant : sans effet à l'arrêt, plus doux à pleine vitesse ; en marche arrière, l'avant part de l'autre côté.
  const a = Math.abs(V.v), k = Math.min(1, a / 3) * (1 - .45 * Math.min(1, a / D.vmax));
  V.cap += tour * D.braquage * k * Math.sign(V.v || 1) * dt;
  return avancer(V, dt, true);
}
// Le centre sur la route, et l'avant (l'arrière en marche arrière) avec ses deux coins hors des murs et des
// bâtiments : avant, seul le centre comptait, et tout le capot rentrait dans la clôture.
const horsMur = (x, z) => !dansBatiment(x, z) && !dansObstacleRue(x, z, .05) && !dansCirculation(x, z, .05) && hauteurSol(x, z) < .25; // ni dans un zém ou un tokpa qui roule, ni sur des marches (sols.js)
function passe(V, x, z) {
  // Un vélo n'est pas tenu à la chaussée : il roule partout où l'on marche — l'esplanade, les trottoirs —,
  // comme à Cotonou. Sans ça, celui qu'on loue sur l'esplanade de l'Amazone ne pouvait pas avancer d'un mètre.
  if (!surRoute(x, z) && !(V.D.pedale && pietonOk(x, z))) return false;
  const L = (V.D.long ?? 2) / 2 * .92 * (Math.sign(V.v) || 1), W = (V.D.larg ?? .8) / 2 * .9, sx = Math.sin(V.cap), cz = Math.cos(V.cap), fx = x + sx * L, fz = z + cz * L;
  return horsMur(fx, fz) && horsMur(fx + cz * W, fz - sx * W) && horsMur(fx - cz * W, fz + sx * W);
}
function avancer(V, dt, contraint) {
  const nx = V.x + Math.sin(V.cap) * V.v * dt, nz = V.z + Math.cos(V.cap) * V.v * dt; let choc = null;
  if (!contraint || passe(V, nx, nz)) { V.km += Math.hypot(nx - V.x, nz - V.z) / 1000; V.x = nx; V.z = nz; }
  else { if (Math.abs(V.v) > 3) choc = 'choc'; V.v *= Math.abs(V.v) > .3 ? -.2 : 0; }
  V.y = hauteur(V.x, V.z, V.y);
  V.g.position.set(V.x, V.y, V.z); V.g.rotation.y = V.cap;
  if (V.anim) { const a = (V.v - (V.vAvant ?? V.v)) / Math.max(dt, .001); V.vAvant = V.v; V.anim.maj(V.v, dt, a > .5); }
  return choc;
}
/** Point du chemin à `dist` mètres plus loin que (k, t) (segment pts[k-1] → pts[k], fraction t) ; et la distance qui restait jusqu'au bout. */
function leLong(pts, k, t, dist) {
  let [px, pz] = [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t], parcouru = 0;
  for (; k < pts.length; k++) {
    const l = Math.hypot(pts[k][0] - px, pts[k][1] - pz);
    if (parcouru + l >= dist) { const f = (dist - parcouru) / (l || 1); return [px + (pts[k][0] - px) * f, pz + (pts[k][1] - pz) * f, dist]; }
    parcouru += l; [px, pz] = pts[k];
  }
  return [px, pz, parcouru];
}
/**
 * Le zém (ou tout véhicule sans joueur au guidon) suit un chemin { pts, i } ; vrai à l'arrivée (arrêté).
 * On vise un point du chemin 3 à 9 m devant soi (plus loin quand on roule vite), à partir de l'endroit du chemin
 * le plus proche : on suit ainsi la rue, virages compris. Avant, on visait le point suivant du tracé, parfois des
 * dizaines de mètres après un virage, et le zém coupait le coin à travers les maisons.
 */
export function suivreChemin(V, P, dt, vmax = V.D.vmax) {
  const pts = P.pts; if (pts.length < 2) { V.v = 0; return true; }
  let k0 = Math.max(1, P.i), bk = k0, bt = 0, bd = Infinity; // où l'on est sur le chemin (jamais en arrière)
  for (let k = k0; k < Math.min(pts.length, k0 + 8); k++) {
    const [ax, az] = pts[k - 1], ux = pts[k][0] - ax, uz = pts[k][1] - az, l2 = ux * ux + uz * uz || 1;
    const t = THREE.MathUtils.clamp(((V.x - ax) * ux + (V.z - az) * uz) / l2, 0, 1), d = Math.hypot(ax + ux * t - V.x, az + uz * t - V.z);
    if (d < bd - .01) { bd = d; bk = k; bt = t; }
  }
  P.i = bk;
  const [tx, tz] = leLong(pts, bk, bt, THREE.MathUtils.clamp(2.5 + Math.abs(V.v) * .4, 3, 9));
  let da = Math.atan2(tx - V.x, tz - V.z) - V.cap; da = Math.atan2(Math.sin(da), Math.cos(da));
  V.cap += THREE.MathUtils.clamp(da, -2 * dt, 2 * dt);
  // Pleine vitesse en ligne droite ; on ralentit avant un virage, vu 15 à 45 m devant (plus loin quand on va vite).
  const [fx, fz] = leLong(pts, bk, bt, 15 + Math.abs(V.v) * 1.5);
  let dv = Math.atan2(fx - V.x, fz - V.z) - V.cap; dv = Math.atan2(Math.sin(dv), Math.cos(dv));
  const droit = Math.max(0, Math.cos(Math.max(Math.abs(da), Math.abs(dv)))) ** 3;
  const reste = leLong(pts, bk, bt, Infinity)[2] + bd; // le long du chemin jusqu'au bout
  const voulue = Math.min(vmax, Math.abs(da) > Math.PI / 2 ? 2.2 : 3.5 + (vmax - 3.5) * droit, Math.max(2, reste * .8)); // demi-tour au pas ; et on freine pour s'arrêter au bout
  V.v += THREE.MathUtils.clamp(voulue - V.v, -8 * dt, D_ACCEL * dt);
  if (reste < 2.5) { V.v = Math.max(0, V.v - 8 * dt); avancer(V, dt, false); return V.v === 0; }
  avancer(V, dt, false); return false;
}

// ---------- Itinéraires et GPS ----------
/** Chemin par les routes de (x, z), en regardant vers `cap`, jusqu'à (xb, zb) : [[x, z], …] ou null. */
/** Le segment (a → b) est-il libre pour un véhicule de demi-largeur r : ni bâtiment, ni mur, portail ou maison de rue.js ? */
export function segmentLibre(ax, az, bx, bz, r = .6) {
  const l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / .5));
  for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n; if (dansBatiment(x, z) || dansObstacleRue(x, z, r)) return false; }
  return true;
}
export function itineraire(x, z, cap, xb, zb) {
  construireReseau();
  const pts = itineraireCourt(x, z, x + Math.sin(cap) * 12, z + Math.cos(cap) * 12, [[xb, zb]], 300);
  // Dernier bout, hors de la route : jusqu'à la porte, la cour, le sable de la plage, seulement s'il n'y a ni mur ni bâtiment
  // entre les deux (sinon le véhicule s'arrête au bord de la route, et l'on finit à pied).
  if (pts) { const f = pts[pts.length - 1]; if (Math.hypot(f[0] - xb, f[1] - zb) > 4 && segmentLibre(f[0], f[1], xb, zb)) pts.push([xb, zb]); }
  return pts && sansAllerRetour(pts);
}
// Pas d'aller-retour dans un chemin : le carrefour devant soi quand la route part derrière, le dernier carrefour quand la
// porte est déjà passée, les points en double. Le véhicule fait demi-tour tout de suite ; sinon, partagé entre l'aller et
// le retour, il tournait sur place autour du carrefour (vu en arrivant à la Haie Vive).
function sansAllerRetour(pts) {
  for (let i = 1; i < pts.length - 1;) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], [cx, cz] = pts[i + 1], ux = bx - ax, uz = bz - az, vx = cx - bx, vz = cz - bz, lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
    if (lu < .5 || lv < .5 || (ux * vx + uz * vz) / (lu * lv) < -.85) { pts.splice(i, 1); if (i > 1) i--; } else i++;
  }
  return pts;
}
export const longueur = pts => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
// Le chemin à suivre : des chevrons blancs sur un fond bleu, peints au sol et qui défilent vers la
// destination. Un chevron tous les PAS mètres ; la texture est partagée par tous les rubans, et c'est son
// décalage qui les anime tous d'un coup (majRuban).
const PAS_CHEVRON = 2.4;
let texChevron = null;
function chevrons() {
  if (texChevron) return texChevron;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(24,116,198,.5)'; c.fillRect(0, 0, 64, 64);
  c.strokeStyle = 'rgba(255,255,255,.92)'; c.lineWidth = 12; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(7, 46); c.lineTo(32, 20); c.lineTo(57, 46); c.stroke(); // la pointe vers l'avant
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return (texChevron = t);
}
/** Ruban posé sur la route, du véhicule (ou de ses pieds) jusqu'à la destination. */
export function ruban(pts) {
  const pos = [], uv = [], idx = [], w = .85;
  let l = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], ln = Math.hypot(dx, dz) || 1, nx = -dz / ln * w, nz = dx / ln * w;
    const y = hauteur(pts[i][0], pts[i][1], 0) + .22;
    pos.push(pts[i][0] + nx, y, pts[i][1] + nz, pts[i][0] - nx, y, pts[i][1] - nz);
    uv.push(0, l / PAS_CHEVRON, 1, l / PAS_CHEVRON); // v court le long du chemin : les chevrons ne s'étirent pas
    if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: chevrons(), transparent: true, opacity: .92, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  m.renderOrder = 4; scene.add(m); return m;
}
/** Fait défiler les chevrons vers la destination (une seule texture pour tous les rubans). */
export function majRuban(dt) { if (texChevron) texChevron.offset.y = (texChevron.offset.y - dt * .55) % 1; }
export function retirerRuban(m) { if (m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } }
/** Distance restante le long du chemin depuis (x, z). */
export function reste(pts, x, z) {
  // Distance au segment le plus proche, et non au sommet le plus proche : sur une rue droite, deux nœuds sont
  // parfois à 80 m l'un de l'autre, et l'on se croyait à 40 m de son itinéraire en roulant pile dessus. Le GPS
  // ne pouvait donc se recalculer qu'au-delà d'un écart énorme, et le kilométrage restant sautait d'un nœud à
  // l'autre (un testeur : « il ne se met pas à jour en fonction de notre position »).
  if (!pts.length) return { ecart: Infinity, m: 0 };
  if (pts.length === 1) { const d = Math.hypot(pts[0][0] - x, pts[0][1] - z); return { ecart: d, m: d }; }
  let bi = 0, bd = Infinity, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], ux = pts[i + 1][0] - ax, uz = pts[i + 1][1] - az, l2 = ux * ux + uz * uz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / l2)) : 0;
    const d = Math.hypot(ax + ux * t - x, az + uz * t - z);
    if (d < bd) { bd = d; bi = i; bt = t; }
  }
  const [ax, az] = pts[bi], px = ax + (pts[bi + 1][0] - ax) * bt, pz = az + (pts[bi + 1][1] - az) * bt;
  return { ecart: bd, m: bd + Math.hypot(pts[bi + 1][0] - px, pts[bi + 1][1] - pz) + longueur(pts.slice(bi + 1)) };
}

// ---------- Stations-service (les 64 d'OpenStreetMap), construites quand on approche ----------
const ST = { liste: [], faites: new Map() };
export function initStations(stations) { ST.liste = stations || []; chargerVehicules(); }
function totem(nom) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 512; const c = cv.getContext('2d');
  c.fillStyle = '#1f3d4a'; c.fillRect(0, 0, 256, 512); c.fillStyle = '#f5c21b'; c.fillRect(0, 0, 256, 110);
  c.fillStyle = '#1f3d4a'; c.font = '800 34px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  nom.split(' ').reduce((l, m) => { const d = l[l.length - 1]; if ((d + ' ' + m).length > 13 && d) l.push(m); else l[l.length - 1] = (d + ' ' + m).trim(); return l; }, ['']).slice(0, 2).forEach((l, i, a) => c.fillText(l, 128, 55 + (i - (a.length - 1) / 2) * 38, 240));
  c.fillStyle = '#fff'; c.font = '700 36px system-ui, sans-serif'; c.fillText('SUPER', 128, 190); c.fillStyle = '#f5c21b'; c.font = '800 64px system-ui, sans-serif'; c.fillText(`${PRIX_LITRE} F`, 128, 260);
  c.fillStyle = '#cfd8dc'; c.font = '600 30px system-ui, sans-serif'; c.fillText('le litre', 128, 312);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.8, .25), [new THREE.MeshStandardMaterial({ color: '#1f3d4a' }), new THREE.MeshStandardMaterial({ color: '#1f3d4a' }), new THREE.MeshStandardMaterial({ color: '#1f3d4a' }), new THREE.MeshStandardMaterial({ color: '#1f3d4a' }), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })]);
  p.position.y = 3.3; g.add(p);
  const mat = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 2, 8), new THREE.MeshStandardMaterial({ color: '#8f979b', metalness: .4 })); mat.position.y = 1; g.add(mat);
  const pompe = new THREE.Mesh(new THREE.BoxGeometry(.6, 1.5, .45), new THREE.MeshStandardMaterial({ color: '#d8dee2' })); pompe.position.set(2.2, .75, 0); g.add(pompe);
  const ecran = new THREE.Mesh(new THREE.BoxGeometry(.4, .3, .47), new THREE.MeshStandardMaterial({ color: '#1f3d4a', emissive: '#1c5a3a' })); ecran.position.set(2.2, 1.2, 0); g.add(ecran);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
/** Construit les stations à moins de 500 m, retire les autres. */
export function majStations(x, z) {
  for (const [i, s] of ST.liste.entries()) {
    const d = Math.hypot(s[0] - x, s[1] - z), f = ST.faites.get(i);
    if (d < 500 && !f) {
      const g = totem(s[2]); g.position.set(s[0], hauteur(s[0], s[1], 0), s[1]); scene.add(g);
      const p = personne(900 + i, { role: 'jeune' }); p.position.set(s[0] + 2.2, 0, s[1] + 1); p.rotation.y = Math.PI; scene.add(p); // le pompiste
      ST.faites.set(i, { g, p, s });
    } else if (d > 650 && f) { scene.remove(f.g); scene.remove(f.p); f.p.userData.liberer?.(); ST.faites.delete(i); }
  }
}
/** La station la plus proche de (x, z) : [x, z, nom] (point de route devant elle), ou null. */
export function stationLaPlusProche(x, z) {
  let best = null, bd = Infinity; for (const st of ST.liste) { const d = Math.hypot(st[0] - x, st[1] - z); if (d < bd) { bd = d; best = st; } }
  return best;
}
/** La station à moins de 25 m (on s'y arrête pour faire le plein), sinon null. */
export function stationProche(x, z) { for (const f of ST.faites.values()) if (Math.hypot(f.s[0] - x, f.s[1] - z) < 25) return f; return null; }
