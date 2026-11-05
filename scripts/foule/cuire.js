// Fige chaque personnage animé (public/modeles/personnages/<id>.glb) dans quelques poses de ses animations :
// les sommets sont calculés avec le squelette (comme le fait la carte graphique), puis rendus en simple maillage
// posé au sol, centré, à la taille voulue, face à +z. scripts/foule.mjs relit window.__foule.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const { ids, poses, tailles } = JSON.parse(decodeURIComponent(location.hash.slice(1)));
const L = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const sortie = { variantes: [], textures: {} };
const v = new THREE.Vector3();
for (const id of ids) {
  const g = await L.loadAsync(`/modeles/personnages/${id}.glb`);
  const mixer = new THREE.AnimationMixer(g.scene);
  let tex = null;
  for (const [nom, f] of poses) {
    const clip = g.animations.find(c => c.name === nom); if (!clip) { console.warn(id, 'sans', nom); continue; }
    mixer.stopAllAction(); const a = mixer.clipAction(clip); a.reset().play(); mixer.setTime(clip.duration * f);
    g.scene.updateMatrixWorld(true);
    const pos = [], uv = [], idx = []; let base = 0;
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const geo = o.geometry, n = geo.attributes.position.count, U = geo.attributes.uv;
      for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z); uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0); }
      const I = geo.index ? geo.index.array : [...Array(n).keys()];
      for (const k of I) idx.push(base + k);
      base += n;
      tex ||= o.material.map;
    });
    // Au sol, centré, à sa taille.
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
    const k = tailles[id] / (mx[1] - mn[1]), cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
    for (let i = 0; i < pos.length; i += 3) { pos[i] = (pos[i] - cx) * k; pos[i + 1] = (pos[i + 1] - mn[1]) * k; pos[i + 2] = (pos[i + 2] - cz) * k; }
    sortie.variantes.push({ id, pose: `${nom}@${f}`, pos, uv, idx });
  }
  if (tex?.image) {
    const im = tex.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const ctx = c.getContext('2d'); if (tex.flipY) { ctx.translate(0, c.height); ctx.scale(1, -1); } ctx.drawImage(im, 0, 0);
    sortie.textures[id] = c.toDataURL('image/png');
  }
}
window.__foule = sortie;
