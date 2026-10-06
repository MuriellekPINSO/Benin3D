import * as THREE from 'three';
import { $, toXZ, toLL } from './base.js';
import { camera, controls, scene } from './scene.js';

// Sol satellite : les tuiles 2D satellite de Google (Map Tiles API) posées sous les
// bâtiments 3D, à la place du sable, des routes et de l'eau dessinés en aplat.
// Les tuiles sont chargées autour de la caméra, plus fines quand on s'approche.
// Mode test sans clé : ajouter ?satdebug à l'adresse (tuiles dessinées localement).

const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;
const DEBUG = new URLSearchParams(location.search).has('satdebug');
const SAT = { actif: false, session: null, tuiles: new Map(), groupe: new THREE.Group(), t: 0, zoom: 0, cle: '', copyright: '' };
SAT.groupe.visible = false; scene.add(SAT.groupe);
const chargeur = new THREE.TextureLoader(); chargeur.setCrossOrigin('anonymous');

const lon2x = (lon, z) => (lon + 180) / 360 * 2 ** z;
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z; };
const x2lon = (x, z) => x / 2 ** z * 360 - 180;
const y2lat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return 180 / Math.PI * Math.atan(Math.sinh(n)); };

export async function satelliteDispo() {
  if (DEBUG) return true;
  if (!KEY) return false;
  try { await session(); return true; } catch { return false; }
}
async function session() {
  if (SAT.session) return SAT.session;
  const r = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(KEY)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapType: 'satellite', language: 'fr-FR', region: 'BJ' }),
  });
  const j = await r.json();
  if (!r.ok) {
    const m = j.error?.message || '', projet = m.match(/project (\d+)/)?.[1];
    if (/has not been used|disabled/i.test(m)) throw new Error(`l'API « Map Tiles » n'est pas encore active sur le projet Google de la clé${projet ? ' (' + projet + ')' : ''}.`);
    if (/referer|referrer/i.test(m)) throw new Error("la clé refuse ce site : ajoutez son adresse dans les restrictions de la clé.");
    throw new Error(m || `erreur ${r.status}`);
  }
  SAT.session = j.session; return SAT.session;
}
function urlTuile(z, x, y) {
  return `https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}?session=${SAT.session}&key=${encodeURIComponent(KEY)}`;
}
function tuileTest(z, x, y) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = (x + y) % 2 ? '#9fb39a' : '#c9b99a'; c.fillRect(0, 0, 256, 256);
  c.strokeStyle = '#222'; c.lineWidth = 3; c.strokeRect(0, 0, 256, 256);
  c.fillStyle = '#111'; c.font = 'bold 26px system-ui'; c.fillText(`${z}/${x}/${y}`, 14, 40);
  c.beginPath(); c.moveTo(0, 0); c.lineTo(40, 0); c.lineTo(0, 40); c.closePath(); c.fill(); // coin nord-ouest
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const matBase = { depthWrite: false };
function creerTuile(z, x, y, ordre) {
  const pts = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].map(([tx, ty]) => toXZ(y2lat(ty, z), x2lon(tx, z)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([pts[0][0], 0, pts[0][1], pts[1][0], 0, pts[1][1], pts[2][0], 0, pts[2][1], pts[3][0], 0, pts[3][1]], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ ...matBase, color: '#ffffff', transparent: true, opacity: 0 }));
  m.renderOrder = ordre; m.receiveShadow = true; m.frustumCulled = true; g.computeBoundingSphere();
  const fini = tex => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; m.material.map = tex; m.material.opacity = 1; m.material.transparent = false; m.material.needsUpdate = true; };
  if (DEBUG) fini(tuileTest(z, x, y)); else chargeur.load(urlTuile(z, x, y), fini, undefined, () => {});
  SAT.groupe.add(m);
  return m;
}
function retirer(cle) { const m = SAT.tuiles.get(cle); if (!m) return; SAT.groupe.remove(m); m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); SAT.tuiles.delete(cle); }

// Tuiles voulues : une couche fine autour du point visé, une couche grossière plus large.
function tuilesVoulues() {
  const t = controls.target, [lat, lon] = toLL(t.x, t.z);
  const dist = camera.position.distanceTo(t);
  const zf = Math.max(13, Math.min(19, Math.round(Math.log2(40075016 * Math.cos(lat * Math.PI / 180) / (dist / 2.2)))));
  const out = [];
  for (const [z, n, ordre] of [[zf - 3, 3, 7.85], [zf, 3, 7.9]]) {
    const cx = Math.floor(lon2x(lon, z)), cy = Math.floor(lat2y(lat, z));
    for (let dx = -n; dx <= n; dx++) for (let dy = -n; dy <= n; dy++) out.push([z, cx + dx, cy + dy, ordre]);
  }
  return { out, zf, lat, lon };
}
export function majSatellite(dt) {
  if (!SAT.actif || !SAT.session && !DEBUG) return;
  SAT.t += dt; if (SAT.t < .35) return; SAT.t = 0;
  const { out, zf } = tuilesVoulues(), voulues = new Set();
  for (const [z, x, y, ordre] of out) {
    const cle = `${z}/${x}/${y}`; voulues.add(cle);
    if (!SAT.tuiles.has(cle)) SAT.tuiles.set(cle, creerTuile(z, x, y, ordre));
  }
  // On garde un peu de marge avant de libérer : évite de recharger en va-et-vient.
  if (SAT.tuiles.size > 260) for (const cle of [...SAT.tuiles.keys()]) if (!voulues.has(cle)) retirer(cle);
  if (zf !== SAT.zoom && !DEBUG) { SAT.zoom = zf; majCopyright(zf); }
}
async function majCopyright(z) {
  try {
    const t = controls.target, [lat, lon] = toLL(t.x, t.z), d = .02;
    const r = await fetch(`https://tile.googleapis.com/tile/v1/viewport?session=${SAT.session}&key=${encodeURIComponent(KEY)}&zoom=${z}&north=${lat + d}&south=${lat - d}&east=${lon + d}&west=${lon - d}`);
    const j = await r.json(); SAT.copyright = j.copyright || ''; $('#satCredit').textContent = `Images Google${SAT.copyright ? ' · ' + SAT.copyright : ''}`;
  } catch { }
}
/** Active ou coupe le sol satellite ; renvoie un message d'erreur, ou null. */
export async function basculerSatellite(on) {
  if (on) { try { if (!DEBUG) await session(); } catch (e) { return e.message; } }
  SAT.actif = on; SAT.groupe.visible = on; $('#satCredit').hidden = !on;
  if (DEBUG && on) $('#satCredit').textContent = 'Tuiles de test (mode ?satdebug)';
  if (!on) for (const cle of [...SAT.tuiles.keys()]) retirer(cle);
  return null;
}
/** Le jeu masque le sol satellite pendant une course (vue au ras du sol). */
export function satelliteVisible(v) { SAT.groupe.visible = SAT.actif && v; }
