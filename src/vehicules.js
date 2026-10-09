import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { LITE } from './base.js';

// ---------- Véhicules : zémidjan, tokpa-tokpa, voitures, chèvres, marchandes ----------
// Zém : moto rouge à selle longue, conducteur en chemise jaune numérotée (Cotonou), casque.
// Tokpa-tokpa : vieux minibus blanc, porte latérale ouverte, apprenti, galerie chargée sous filet.
export const B3 = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const C3 = (r1, r2, h, s = 10) => new THREE.CylinderGeometry(r1, r2, h, s);
export function partsZem(c = {}) {
  const P = [], add = (g, hex) => P.push([g, hex]);
  const caro = c.carrosserie || '#a32b26', chemise = c.chemise || '#f2c21b';
  for (const x of [-0.66, 0.68]) { add(new THREE.TorusGeometry(0.29, 0.075, 6, 14).translate(x, 0.33, 0), '#1c1c1e'); add(C3(0.16, 0.16, 0.1, 10).rotateX(Math.PI / 2).translate(x, 0.33, 0), '#b9bdc1'); }
  add(B3(0.62, 0.07, 0.16).translate(0.68, 0.66, 0), caro);
  add(B3(0.5, 0.28, 0.27).translate(0.2, 0.86, 0), caro);
  add(B3(0.42, 0.3, 0.24).translate(-0.02, 0.52, 0), '#6f7377');
  add(C3(0.04, 0.04, 0.8, 6).rotateZ(Math.PI / 2).translate(-0.36, 0.42, 0.17), '#c9ccd0');
  add(B3(0.98, 0.12, 0.3).translate(-0.33, 0.97, 0), c.selle || '#2f5f86');
  add(B3(0.5, 0.05, 0.3).translate(-0.86, 0.92, 0), '#3a3a3c');
  add(B3(0.72, 0.18, 0.2).translate(-0.6, 0.72, 0), caro);
  for (const z of [0.09, -0.09]) add(C3(0.028, 0.028, 0.78, 6).rotateZ(-0.38).translate(0.6, 0.72, z), '#c9ccd0');
  add(C3(0.022, 0.022, 0.74, 6).rotateX(Math.PI / 2).translate(0.47, 1.12, 0), '#c9ccd0');
  add(new THREE.SphereGeometry(0.1, 8, 6).translate(0.66, 1.0, 0), '#f6efd6');
  add(B3(0.05, 0.08, 0.2).translate(-1.1, 0.84, 0), '#d8342a');
  if (c.pilote !== false) {
    for (const z of [0.13, -0.13]) { add(B3(0.44, 0.15, 0.14).rotateZ(-0.25).translate(0.1, 0.98, z), '#2d3e5a'); add(B3(0.12, 0.44, 0.12).translate(0.31, 0.66, z + Math.sign(z) * 0.04), '#2d3e5a'); add(B3(0.2, 0.08, 0.1).translate(0.36, 0.43, z + Math.sign(z) * 0.04), '#1a1a1a'); }
    add(B3(0.28, 0.58, 0.42).rotateZ(-0.28).translate(-0.08, 1.34, 0), chemise);
    for (const z of [0.22, -0.22]) add(C3(0.055, 0.05, 0.52, 6).rotateZ(1.15).translate(0.2, 1.38, z), chemise);
    add(C3(0.06, 0.06, 0.12, 8).translate(0.0, 1.66, 0), '#4a2f22');
    add(new THREE.SphereGeometry(0.17, 10, 8).scale(1.12, 0.95, 1).translate(0.02, 1.8, 0), c.casque || '#1d2733');
    add(B3(0.03, 0.08, 0.26).translate(0.19, 1.78, 0), '#0f1418');
  }
  if (c.passager) {
    add(B3(0.32, 0.5, 0.44).rotateZ(-0.1).translate(-0.62, 1.3, 0), c.passager);
    add(B3(0.4, 0.14, 0.42).translate(-0.5, 1.02, 0), c.passager);
    add(new THREE.SphereGeometry(0.13, 8, 6).translate(-0.6, 1.68, 0), '#4a2f22');
    add(new THREE.SphereGeometry(0.15, 8, 6).scale(1, 0.7, 1).translate(-0.6, 1.8, 0), c.foulard || '#e2672a');
  }
  return P;
}
export function partsTokpa(c = {}) {
  const P = [], add = (g, hex) => P.push([g, hex]);
  const s = new THREE.Shape();
  s.moveTo(-2.45, 0.42); s.lineTo(2.2, 0.42); s.lineTo(2.45, 0.62); s.lineTo(2.45, 1.05); s.lineTo(2.22, 1.17); s.lineTo(1.72, 2.05); s.lineTo(-2.38, 2.1); s.lineTo(-2.45, 1.92); s.closePath();
  add(new THREE.ExtrudeGeometry(s, { depth: 1.86, bevelEnabled: false }).translate(0, 0, -0.93), c.couleur || '#e9e6dc');
  add(B3(3.5, 0.55, 1.9).translate(-0.4, 1.63, 0), '#27323a');
  add(B3(0.05, 1.02, 1.7).rotateZ(0.507).translate(1.99, 1.6, 0), '#2b3a44');
  add(B3(0.06, 0.5, 1.6).translate(-2.46, 1.6, 0), '#27323a');
  add(B3(1.0, 1.4, 0.05).translate(0.45, 1.18, 0.94), '#121619');
  add(B3(4.9, 0.1, 1.9).translate(0, 0.98, 0), c.bande || '#3d8f5a');
  for (const [x, z] of [[1.0, -0.94], [-1.4, 0.94], [-0.2, -0.94]]) add(B3(0.4, 0.2, 0.02).translate(x, 0.65, z), '#9a6a45');
  add(B3(0.14, 0.22, 1.92).translate(2.5, 0.56, 0), '#4a4a4a'); add(B3(0.14, 0.22, 1.92).translate(-2.5, 0.56, 0), '#4a4a4a');
  for (const z of [0.66, -0.66]) { add(B3(0.05, 0.15, 0.3).translate(2.47, 0.86, z), '#f4efd8'); add(B3(0.05, 0.12, 0.2).translate(-2.47, 0.86, z), '#c8382f'); }
  for (const x of [1.55, -1.6]) for (const z of [0.86, -0.86]) { add(C3(0.36, 0.36, 0.24, 12).rotateX(Math.PI / 2).translate(x, 0.36, z), '#1c1c1e'); add(C3(0.18, 0.18, 0.26, 8).rotateX(Math.PI / 2).translate(x, 0.36, z), '#a7abaf'); }
  add(B3(3.4, 0.06, 1.7).translate(-0.5, 2.2, 0), '#3a3a3a');
  for (const z of [0.82, -0.82]) add(B3(3.4, 0.12, 0.05).translate(-0.5, 2.3, z), '#3a3a3a');
  const bag = ['#2f6fb0', '#c8382f', '#e9b62c', '#4a7a3f', '#8e3c8f', '#e2672a', '#f2efe6'];
  let k = 0; for (let x = -2; x < 1.1; x += 0.62) for (const z of [-0.42, 0.4]) { const h = 0.35 + ((k * 7) % 5) * 0.08; add(B3(0.55, h, 0.7).translate(x, 2.25 + h / 2, z), bag[k++ % bag.length]); }
  add(C3(0.4, 0.3, 0.22, 12).translate(0.6, 2.8, 0), '#d9d2c2');
  add(B3(3.3, 0.04, 1.6).translate(-0.5, 2.92, 0), '#3d7a46');
  if (c.apprenti !== false) {
    add(B3(0.3, 0.55, 0.3).rotateX(-0.35).translate(0.45, 1.45, 1.12), '#c8382f');
    add(new THREE.SphereGeometry(0.13, 8, 6).translate(0.45, 1.86, 1.25), '#4a2f22');
    add(B3(0.12, 0.6, 0.12).translate(0.4, 0.9, 1.05), '#2d3e5a');
    add(C3(0.04, 0.04, 0.5, 5).rotateX(-1.1).translate(0.55, 1.6, 1.32), '#c8382f');
  }
  for (let x = -1.9; x < 1.2; x += 0.62) add(new THREE.SphereGeometry(0.12, 6, 5).translate(x, 1.66, -0.75), '#4a2f22');
  return P;
}
export function partsVoiture(couleur) {
  const P = [], add = (g, hex) => P.push([g, hex]);
  add(B3(4.3, 0.72, 1.8).translate(0, 0.68, 0), couleur); add(B3(2.3, 0.6, 1.62).translate(-0.25, 1.32, 0), '#2e3a40');
  add(B3(2.2, 0.08, 1.66).translate(-0.25, 1.65, 0), couleur);
  for (const x of [1.35, -1.35]) for (const z of [0.86, -0.86]) add(C3(0.33, 0.33, 0.22, 10).rotateX(Math.PI / 2).translate(x, 0.33, z), '#1c1c1e');
  for (const z of [0.6, -0.6]) add(B3(0.05, 0.14, 0.32).translate(2.16, 0.78, z), '#f4efd8');
  return P;
}
export function partsChevre() {
  const P = [], add = (g, hex) => P.push([g, hex]);
  add(B3(0.85, 0.38, 0.34).translate(0, 0.62, 0), '#e8e2d4'); add(B3(0.3, 0.38, 0.34).translate(-0.25, 0.62, 0), '#6a4a32');
  add(B3(0.24, 0.28, 0.2).rotateZ(0.5).translate(0.5, 0.9, 0), '#e8e2d4');
  for (const x of [0.32, -0.32]) for (const z of [0.12, -0.12]) add(B3(0.07, 0.45, 0.07).translate(x, 0.22, z), '#6a4a32');
  for (const z of [0.06, -0.06]) add(C3(0.01, 0.03, 0.2, 4).rotateZ(-0.6).translate(0.5, 1.1, z), '#4a3a2a');
  return P;
}
export function partsMarchande(pagne) {
  const P = [], add = (g, hex) => P.push([g, hex]);
  add(C3(0.2, 0.3, 1.1, 8).translate(0, 0.56, 0), pagne); add(C3(0.17, 0.2, 0.4, 8).translate(0, 1.3, 0), pagne);
  add(new THREE.SphereGeometry(0.14, 8, 6).translate(0, 1.66, 0), '#4a2f22');
  add(C3(0.42, 0.3, 0.16, 12).translate(0, 1.88, 0), '#c9ccd0');
  for (const [x, z, c] of [[0.12, 0, '#d8432f'], [-0.12, 0.08, '#e9b23a'], [0, -0.14, '#5d9b3a']]) add(new THREE.SphereGeometry(0.11, 6, 5).translate(x, 2.02, z), c);
  return P;
}
export const matVeh = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: .05 });


// ---------- Zémidjans détaillés de « 3D monde » ----------
// moto-taxi.glb : conducteur scanné au gilet jaune, casque, moto sombre.
// zem.glb : moto rouge, conducteur en chemise jaune et passagère au chapeau.
// Gabarits : origine au sol au centre du véhicule, avant tourné vers +x.
export const ZEMS_3D = { moto: null, zem: null, motoLod: null };
const chargeur = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/**
 * Remet un véhicule droit sur sa route (repris de Rues.redresser, 3D monde) :
 * l'axe long, mesuré sur les sommets vus de dessus, est aligné sur z par la plus
 * petite rotation, la gîte est annulée, puis le véhicule est reposé au sol, centré.
 */
function redresser(groupe) {
  const points = [], v = new THREE.Vector3();
  groupe.updateMatrixWorld(true);
  groupe.traverse(n => { if (!n.isMesh) return; const pos = n.geometry.getAttribute('position'); const pas = Math.max(1, Math.floor(pos.count / 4000)); for (let i = 0; i < pos.count; i += pas) points.push(v.fromBufferAttribute(pos, i).applyMatrix4(n.matrixWorld).clone()); });
  if (points.length < 10) return;
  const moy = f => points.reduce((a, p) => a + f(p), 0) / points.length;
  const mx = moy(p => p.x), mz = moy(p => p.z);
  const xx = moy(p => (p.x - mx) ** 2), zz = moy(p => (p.z - mz) ** 2), xz = moy(p => (p.x - mx) * (p.z - mz));
  let cap = Math.PI / 2 - .5 * Math.atan2(2 * xz, xx - zz);
  cap = Math.atan2(Math.sin(cap), Math.cos(cap)); if (cap > Math.PI / 2) cap -= Math.PI; if (cap <= -Math.PI / 2) cap += Math.PI;
  groupe.rotation.y = -cap; groupe.updateMatrixWorld(true);
  const droits = points.map(p => p.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -cap));
  const my = droits.reduce((a, p) => a + p.y, 0) / droits.length, lx = droits.reduce((a, p) => a + p.x, 0) / droits.length;
  const yy = droits.reduce((a, p) => a + (p.y - my) ** 2, 0) / droits.length, xy = droits.reduce((a, p) => a + (p.x - lx) * (p.y - my), 0) / droits.length;
  const gite = Math.atan2(xy, yy);
  if (Math.abs(gite) < .5) groupe.rotation.z = gite;
  groupe.updateMatrixWorld(true);
  const boite = new THREE.Box3().setFromObject(groupe), c = boite.getCenter(new THREE.Vector3());
  groupe.position.set(-c.x, -boite.min.y, -c.z);
}
/** La passagère de zem.glb n'a pas de haut : corsage en wax ajusté sur le buste (3D monde). */
function habillerPassagere(gabarit) {
  const toile = document.createElement('canvas'); toile.width = toile.height = 128; const c = toile.getContext('2d');
  c.fillStyle = '#1f4f8f'; c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = i * 32 + (j % 2) * 16 + 16, y = j * 32 + 16; c.fillStyle = '#f0a228'; c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.fill(); c.fillStyle = '#b8322a'; c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill(); }
  const carte = new THREE.CanvasTexture(toile); carte.colorSpace = THREE.SRGBColorSpace; carte.wrapS = carte.wrapT = THREE.RepeatWrapping; carte.repeat.set(3, 1);
  const mat = new THREE.MeshStandardMaterial({ map: carte, roughness: .85, side: THREE.DoubleSide });
  const corsage = new THREE.Mesh(new THREE.CylinderGeometry(.18, .21, .5, 16, 1, true), mat); corsage.scale.set(1.05, 1, .78); corsage.position.set(0, 1.37, -.5);
  const epaules = new THREE.Mesh(new THREE.CylinderGeometry(.08, .185, .09, 16, 1, true), mat); epaules.scale.set(1.05, 1, .78); epaules.position.set(0, 1.665, -.5);
  gabarit.add(corsage, epaules);
}
function gabaritDe(objet, { largeur, hauteur, passagere }) {
  const s = new THREE.Box3().setFromObject(objet).getSize(new THREE.Vector3());
  objet.scale.multiplyScalar(largeur ? largeur / Math.max(s.x, s.z) : hauteur / s.y);
  const redresse = new THREE.Group(); redresse.add(objet);
  redresser(redresse);
  const avantZ = new THREE.Group(); avantZ.add(redresse);
  if (passagere) habillerPassagere(avantZ);
  const tourne = new THREE.Group(); tourne.add(avantZ); tourne.rotation.y = Math.PI / 2; // avant +z → +x
  const g = new THREE.Group(); g.add(tourne);
  g.traverse(n => { if (n.isMesh) { n.castShadow = !LITE; n.receiveShadow = true; } });
  return g;
}
/** Géométrie unique (transformations appliquées) pour l'instanciation dans la circulation. */
// Les modèles allégés ont des coordonnées compressées (entiers 16 bits normalisés) : on les remet en
// flottants avant de les transformer, sinon tout ce qui dépasse 1 est écrasé.
function enFlottants(geo) {
  for (const [nom, a] of Object.entries(geo.attributes)) {
    if (a.array instanceof Float32Array && !a.normalized) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
    geo.setAttribute(nom, new THREE.BufferAttribute(f, a.itemSize));
  }
  return geo;
}
function geometrieDe(gabarit) {
  gabarit.updateMatrixWorld(true);
  let geo = null, mat = null;
  gabarit.traverse(n => { if (n.isMesh && !geo) { geo = enFlottants(n.geometry.clone()).applyMatrix4(n.matrixWorld); mat = n.material; } });
  return geo ? { geo, mat } : null;
}
// tokpa.glb (Tripo, d'après une description) : le minibus Toyota des lignes de tokpa-tokpa.
export const TOKPA_3D = { geo: null, mat: null };
export async function chargerTokpa(version = 0) {
  try {
    const g = (await chargeur.loadAsync(import.meta.env.BASE_URL + `modeles/batiments/tokpa.glb?v=${version}`)).scene;
    const r = geometrieDe(gabaritDe(g, { largeur: 5 })); if (r) { TOKPA_3D.geo = r.geo; TOKPA_3D.mat = r.mat; }
  } catch (e) { console.warn('modèle tokpa indisponible', e.message); }
  return TOKPA_3D;
}
export async function chargerZems() {
  const url = f => import.meta.env.BASE_URL + 'modeles/' + f;
  const charge = f => chargeur.loadAsync(url(f)).then(g => g.scene).catch(e => { console.warn(`modèle ${f} indisponible`, e); return null; });
  const [moto, zem, motoLod] = await Promise.all([charge('moto-taxi.glb'), charge('zem-lod.glb'), charge('moto-taxi-lod.glb')]);
  if (moto) ZEMS_3D.moto = gabaritDe(moto, { largeur: 1.95 });
  if (zem) ZEMS_3D.zem = gabaritDe(zem, { hauteur: 2.05, passagere: true });
  if (motoLod) ZEMS_3D.motoLod = geometrieDe(gabaritDe(motoLod, { largeur: 1.95 }));
  return ZEMS_3D;
}
