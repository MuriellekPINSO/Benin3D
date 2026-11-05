// ---------- Sur les toits-terrasses : citernes, paraboles, fers à béton (05/11) ----------
// « Dalles plates avec citernes bleues, paraboles, fers à béton qui dépassent » : ce que les agents ont relevé sur les
// vidéos de drone de Cotonou (relevés du 05/11, ~/Projects/cotonou-realisme/agents/sortie/toits.md). Posés sur les toits
// plats des maisons OpenStreetMap (ville.js, TOITS_PLATS) ; instanciés découpés en carrés et cachés de loin (lieux.js,
// semer). Les maisons générées le long des rues ont déjà leurs citernes (rue.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LITE, SECOURS, hash } from './base.js';
import { TOITS_PLATS } from './ville.js';
import { semer } from './lieux.js';

export const STATS_TOITS = { cuves: 0, paraboles: 0, fers: 0 };

export function detailsToits() {
  const liste = TOITS_PLATS.liste; TOITS_PLATS.liste = []; // les contours ne servent qu'ici
  if (SECOURS) return;
  const cuves = [], paraboles = [], fers = [];
  for (const [x, z, h, k, cote, xs, zs] of liste) {
    const r = Math.min(cote * .3, 3);
    if (hash(k, 61) < .38) { const a = hash(k, 62) * 6.28, d = r * hash(k, 63); cuves.push([x + Math.cos(a) * d, h, z + Math.sin(a) * d, hash(k, 64) < .55]); }
    if (LITE) continue;
    if (hash(k, 65) < .18) { const a = hash(k, 66) * 6.28, d = r * (.5 + .5 * hash(k, 67)); paraboles.push([x + Math.cos(a) * d, h, z + Math.sin(a) * d, hash(k, 68) * 6.28]); }
    // L'étage à venir : deux fers qui sortent de chaque poteau d'angle, un peu en retrait du bord.
    if (hash(k, 69) < .14 && xs.length >= 4) for (let j = 0; j < Math.min(xs.length, 6); j++) {
      const px = xs[j] + (x - xs[j]) * .06, pz = zs[j] + (z - zs[j]) * .06;
      for (let b = 0; b < 2; b++) fers.push([px + (b - .5) * .16, h, pz + (b - .5) * .1, .6 + hash(k * 7 + j, b) * .7]);
    }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  const poser = (geo, mat, l, f, proche, ombre) => {
    if (!l.length) return;
    const m = new THREE.InstancedMesh(geo, mat, l.length);
    l.forEach((e, i) => f(e, i, m));
    m.castShadow = ombre && !LITE; m.receiveShadow = true; m.userData.proche = proche; m.name = 'toits-details';
    semer(m, 600);
  };
  // Citernes en plastique, bleues ou noires.
  const bleu = new THREE.Color('#2f6fb0'), noir = new THREE.Color('#2a2b2d');
  poser(new THREE.CylinderGeometry(.55, .55, 1.15, 10).translate(0, .575, 0), new THREE.MeshLambertMaterial(), cuves,
    ([x, y, z, b], i, m) => { m4.makeTranslation(x, y, z); m.setMatrixAt(i, m4); m.setColorAt(i, b ? bleu : noir); }, 1100, true);
  // Paraboles : un mât court et une coupelle tournée vers le ciel du sud.
  const coupelle = new THREE.SphereGeometry(.42, 10, 4, 0, Math.PI * 2, 0, Math.PI * .32).scale(1, .45, 1).rotateX(-.8).translate(0, .9, 0);
  const mat = new THREE.CylinderGeometry(.03, .03, .9, 5).translate(0, .45, 0);
  poser(mergeGeometries([coupelle.toNonIndexed(), mat.toNonIndexed()]), new THREE.MeshLambertMaterial({ color: '#d9dcdd', side: THREE.DoubleSide }), paraboles,
    ([x, y, z, a], i, m) => { m4.compose(p.set(x, y, z), q.setFromAxisAngle(Y, a), s.set(1, 1, 1)); m.setMatrixAt(i, m4); }, 700, false);
  // Fers à béton rouillés.
  poser(new THREE.BoxGeometry(.035, 1, .035).translate(0, .5, 0), new THREE.MeshLambertMaterial({ color: '#5a3d2b' }), fers,
    ([x, y, z, l], i, m) => { m4.compose(p.set(x, y, z), q.identity(), s.set(1, l, 1)); m.setMatrixAt(i, m4); }, 450, false);
  Object.assign(STATS_TOITS, { cuves: cuves.length, paraboles: paraboles.length, fers: fers.length, toits: liste.length });
}
