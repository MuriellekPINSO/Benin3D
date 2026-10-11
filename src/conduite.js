import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { TRIPO } from './batiments-tripo.js';
import { construireReseau, itineraireCourt } from './carrefours.js';
import { personne } from './discussions.js';
import { dansBatiment } from './rue.js';
import { dansTerrePlein } from './terre-pleins.js';
import { scene } from './scene.js';
import { TABLIERS, mergeColored, roadLines } from './ville.js';
import { ZEMS_3D, gabaritDe, matVeh, partsVoiture, partsZem } from './vehicules.js';

// ---------- Conduire dans la ville (Ma vie, salon entre amis) ----------
// On monte sur sa moto ou dans sa voiture et on roule où l'on veut, mais sur les routes : la chaussée et
// le bord du trottoir (pour se garer, prendre quelqu'un, s'arrêter à une station), jamais à travers les
// murs ni les bâtiments : on y bute. Marche arrière et demi-tour comme en vrai, ponts (on monte sur le
// tablier par sa rampe, on passe dessous en travers), essence qui baisse en roulant. Le GPS trace
// l'itinéraire jusqu'à la destination choisie ; le zém qu'on hèle le suit tout seul.

// Vitesses en m/s (13,9 = 50 km/h), essence à l'échelle du jeu (comme Zém Run : quelques km par litre).
export const VEHICULES = {
  moto: { nom: 'moto', vmax: 13.9, accel: 3.6, frein: 8, recul: 2.2, braquage: 1.9, reservoir: 3, kmParLitre: 3, selle: [1.02, -.08], arriere: -.62 },
  voiture: { nom: 'voiture', vmax: 16.7, accel: 3, frein: 7, recul: 3, braquage: 1.25, reservoir: 6, kmParLitre: 2, cache: true },
  zem: { nom: 'zém', vmax: 11, accel: 3.4, frein: 8, recul: 2, braquage: 1.9, reservoir: 3, kmParLitre: 3, selle: [1.02, -.08], arriere: -.62 },
};
export const PRIX_LITRE = 680; // à la pompe (Zém Run : 680 F à la station, 500 F le kpayo)
const D_ACCEL = 3.2; // accélération du zém en pilote automatique

// Modèles réalistes : voiture et moto du joueur générées par Tripo (public/modeles/batiments/, sans pilote :
// c'est son personnage qu'on voit dessus), zémidjan de « 3D monde » (gilet jaune, casque). Gabarits : avant vers
// +x (vehicules.js). Tant qu'ils ne sont pas chargés, les modèles dessinés en code.
const MODELES = { voiture: null, moto: null };
const LONGUEURS = { voiture: 4.4, moto: 2 };
const DEMI_TOUR = { voiture: true, moto: true }; // le redressement aligne l'axe long mais ne sait pas où est l'avant : vérifié en jeu (phare devant)
const SELLES = { moto: [.86, -.27] }; // selle du modèle Tripo, mesurée : dessus à 0,78 m, 0,2 à 0,3 m derrière le centre (avec [1,02 ; −0,08] du zém, on s'asseyait sur le réservoir)
export function chargerVehicules() {
  const ch = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  for (const [type, id] of [['voiture', 'voiture-perso'], ['moto', 'moto-perso']]) {
    const info = TRIPO.info[id]; if (!info) continue;
    ch.loadAsync(`${import.meta.env.BASE_URL}modeles/batiments/${id}.glb?v=${info.octets}`).then(g => { MODELES[type] = gabaritDe(g.scene, { largeur: LONGUEURS[type] }); }).catch(e => console.warn(`modèle ${id}`, e.message));
  }
}
/** Un véhicule : modèle (avant vers +z du groupe) et état de conduite. */
export function creerVehicule(type, { couleur } = {}) {
  const D = VEHICULES[type], g = new THREE.Group();
  const gabarit = type === 'zem' ? ZEMS_3D.moto : MODELES[type];
  let m;
  if (gabarit) m = gabarit.clone();
  else { m = new THREE.Mesh(mergeColored(type === 'voiture' ? partsVoiture(couleur || '#7a1f2b') : partsZem({ pilote: type === 'zem', carrosserie: couleur, chemise: '#f2c21b' })), matVeh); m.castShadow = true; m.receiveShadow = true; }
  m.rotation.y = -Math.PI / 2 + (gabarit && MODELES[type] && DEMI_TOUR[type] ? Math.PI : 0); g.add(m); // avant +x → +z
  scene.add(g);
  return { type, D, g, x: 0, z: 0, y: 0, cap: 0, v: 0, km: 0, selle: (gabarit && MODELES[type] && SELLES[type]) || D.selle };
}
export function retirerVehicule(V) { if (V) scene.remove(V.g); } // les géométries sont partagées entre les copies : on ne les libère pas
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
  for (const [ax, az, bx, bz, hw] of l) if (projeter(x, z, ax, az, bx, bz)[0] <= hw) return !dansBatiment(x, z) && !dansTerrePlein(x, z, 0); // ni bâtiment, ni terre-plein central
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
function avancer(V, dt, contraint) {
  const nx = V.x + Math.sin(V.cap) * V.v * dt, nz = V.z + Math.cos(V.cap) * V.v * dt; let choc = null;
  if (!contraint || surRoute(nx, nz)) { V.km += Math.hypot(nx - V.x, nz - V.z) / 1000; V.x = nx; V.z = nz; }
  else { if (Math.abs(V.v) > 3) choc = 'choc'; V.v *= Math.abs(V.v) > .3 ? -.2 : 0; }
  V.y = hauteur(V.x, V.z, V.y);
  V.g.position.set(V.x, V.y, V.z); V.g.rotation.y = V.cap;
  return choc;
}
/** Le zém (ou tout véhicule sans joueur au guidon) suit un chemin { pts, i } ; vrai à l'arrivée (arrêté). */
export function suivreChemin(V, P, dt, vmax = V.D.vmax) {
  const pts = P.pts;
  while (P.i < pts.length - 1 && Math.hypot(pts[P.i][0] - V.x, pts[P.i][1] - V.z) < 7) P.i++;
  const [tx, tz] = pts[P.i], dx = tx - V.x, dz = tz - V.z, d = Math.hypot(dx, dz), dernier = P.i === pts.length - 1;
  let da = Math.atan2(dx, dz) - V.cap; da = Math.atan2(Math.sin(da), Math.cos(da));
  V.cap += THREE.MathUtils.clamp(da, -2 * dt, 2 * dt);
  const voulue = dernier ? Math.min(vmax, d * .8) : Math.min(vmax, 2.5 + 9 * Math.max(0, Math.cos(da)) ** 2);
  V.v += THREE.MathUtils.clamp(voulue - V.v, -7 * dt, D_ACCEL * dt);
  if (dernier && d < 2.5) { V.v = Math.max(0, V.v - 8 * dt); avancer(V, dt, false); return V.v === 0; }
  avancer(V, dt, false); return false;
}

// ---------- Itinéraires et GPS ----------
/** Chemin par les routes de (x, z), en regardant vers `cap`, jusqu'à (xb, zb) : [[x, z], …] ou null. */
export function itineraire(x, z, cap, xb, zb) {
  construireReseau();
  const pts = itineraireCourt(x, z, x + Math.sin(cap) * 12, z + Math.cos(cap) * 12, [[xb, zb]], 300);
  if (pts) { const f = pts[pts.length - 1]; if (Math.hypot(f[0] - xb, f[1] - zb) > 4) pts.push([xb, zb]); } // dernier bout : jusqu'à la porte, la cour
  return pts;
}
export const longueur = pts => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
/** Ruban bleu posé sur la route, du véhicule à la destination. */
export function ruban(pts) {
  const pos = [], idx = [], w = .7;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * w, nz = dx / l * w;
    const y = hauteur(pts[i][0], pts[i][1], 0) + .22;
    pos.push(pts[i][0] + nx, y, pts[i][1] + nz, pts[i][0] - nx, y, pts[i][1] - nz);
    if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#2ea8ff', transparent: true, opacity: .75, depthWrite: false, side: THREE.DoubleSide }));
  m.renderOrder = 4; scene.add(m); return m;
}
export function retirerRuban(m) { if (m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } }
/** Distance restante le long du chemin depuis (x, z). */
export function reste(pts, x, z) {
  let bi = 0, bd = Infinity; for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - x, pts[i][1] - z); if (d < bd) { bd = d; bi = i; } }
  return { ecart: bd, m: bd + longueur(pts.slice(bi)) };
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
