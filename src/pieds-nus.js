// ---------- Pieds nus (la mosquée) ----------
// « Dans la mosquée faut enlever chaussures » (Murielle, 25/11). Les personnages (modèles Tripo, personnages.js) ont leurs
// chaussures dans le modèle même : on ne peut pas les ôter. On repeint donc couleur de peau ce que le squelette fait bouger
// avec les pieds (L_Foot, R_Foot, L_ToeBase, R_ToeBase), plus la cheville, sous 6 % de la hauteur ; la peau est celle des
// mains du personnage, prise dans sa texture. Les coutures et les lacets dessinés en relief disparaissent avec.
// Seul le matériau change (une copie par matériau, gardée) : les personnages d'un même modèle partagent toujours le reste.
import * as THREE from 'three';

const PIED = /Foot|Toe/, MAIN = /Hand|Finger|Thumb/;
const NUS = new WeakMap(); // matériau d'origine → sa copie pieds nus
const lisse = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** La couleur moyenne de la texture `map` aux sommets choisis (uv), ou null. */
function moyenne(map, uv, choisis) {
  const img = map?.image; if (!img?.width || !choisis.length) return null;
  const T = 128, cv = document.createElement('canvas'); cv.width = cv.height = T;
  const c = cv.getContext('2d', { willReadFrequently: true });
  try { c.drawImage(img, 0, 0, T, T); } catch { return null; }
  const px = c.getImageData(0, 0, T, T).data, s = [0, 0, 0];
  for (const i of choisis) {
    let u = uv.getX(i) % 1, v = uv.getY(i) % 1; if (u < 0) u += 1; if (v < 0) v += 1;
    if (map.flipY) v = 1 - v;
    const k = (Math.min(T - 1, Math.floor(v * T)) * T + Math.min(T - 1, Math.floor(u * T))) * 4;
    s[0] += px[k]; s[1] += px[k + 1]; s[2] += px[k + 2];
  }
  return new THREE.Color().setRGB(s[0] / choisis.length / 255, s[1] / choisis.length / 255, s[2] / choisis.length / 255, THREE.SRGBColorSpace);
}

/** Une fois par géométrie : l'attribut aNu (1 = pied, 0 = le reste) et la couleur de la peau. */
function preparer(m) {
  const geo = m.geometry; if (geo.userData.nu) return geo.userData.nu;
  const os = m.skeleton.bones, J = geo.attributes.skinIndex, W = geo.attributes.skinWeight, P = geo.attributes.position, uv = geo.attributes.uv, n = P.count;
  const pied = os.map(b => PIED.test(b.name)), main = os.map(b => MAIN.test(b.name));
  let bas = Infinity, haut = -Infinity; for (let i = 0; i < n; i++) { const y = P.getY(i); if (y < bas) bas = y; if (y > haut) haut = y; }
  const a = new Float32Array(n), mains = [];
  for (let i = 0; i < n; i++) {
    let wp = 0, wm = 0; for (let k = 0; k < 4; k++) { const j = J.getComponent(i, k), w = W.getComponent(i, k); if (pied[j]) wp += w; if (main[j]) wm += w; }
    const rel = (P.getY(i) - bas) / (haut - bas);
    a[i] = Math.max(lisse(.3, .6, wp), rel < .06 ? 1 - lisse(.05, .06, rel) : 0);
    if (wm > .8 && uv) mains.push(i);
  }
  geo.setAttribute('aNu', new THREE.BufferAttribute(a, 1));
  const peau = (uv && moyenne(m.material.map, uv, mains))?.multiplyScalar(.85) || new THREE.Color('#5a3a28'); // le dessus des pieds, un peu plus sombre que la paume
  return (geo.userData.nu = { peau });
}

/** La copie pieds nus d'un matériau : la peau à la place de la chaussure, plus mate, sans le relief de la chaussure. */
function materiauNu(mat, peau) {
  let nu = NUS.get(mat); if (nu) return nu;
  nu = mat.clone(); nu.name = `${mat.name || 'corps'} (pieds nus)`;
  const uPeau = { value: peau.clone() };
  nu.onBeforeCompile = sh => {
    sh.uniforms.uPeau = uPeau;
    sh.vertexShader = 'attribute float aNu;\nvarying float vNu;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvNu = aNu;');
    sh.fragmentShader = 'uniform vec3 uPeau;\nvarying float vNu;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n\tfloat nu = smoothstep( .35, .65, vNu );\n\tdiffuseColor.rgb = mix( diffuseColor.rgb, uPeau, nu );')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, .62, nu );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = mix( metalnessFactor, 0., nu );')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n\tnormal = normalize( mix( normal, nonPerturbedNormal, nu ) );');
  };
  nu.customProgramCacheKey = () => 'pieds-nus';
  NUS.set(mat, nu); return nu;
}

/** Pieds nus (`oui`) ou chaussés : un personnage de personnages.js. Ne fait rien s'il l'est déjà, ni s'il est dessiné en code. */
export function piedsNus(g, oui = true) {
  if (!g || !!g.userData.piedsNus === !!oui) return;
  g.userData.piedsNus = !!oui;
  g.traverse(o => {
    if (!o.isSkinnedMesh || Array.isArray(o.material)) return;
    if (!oui) { if (o.userData.chausse) { o.material = o.userData.chausse; delete o.userData.chausse; } return; }
    const { peau } = preparer(o);
    o.userData.chausse = o.material; o.material = materiauNu(o.material, peau);
  });
}

/** La couleur des chaussures d'un personnage (pour les poser à l'entrée), ou null. */
export function couleurChaussures(g) {
  let c = null;
  g?.traverse(o => {
    if (c || !o.isSkinnedMesh || Array.isArray(o.material)) return;
    const m = o.userData.chausse || o.material, geo = o.geometry, uv = geo.attributes.uv; if (!uv) return;
    if (!geo.attributes.aNu) preparer(o);
    const a = geo.attributes.aNu.array, choisis = []; for (let i = 0; i < a.length; i += 3) if (a[i] > .9) choisis.push(i);
    c = moyenne(m.map, uv, choisis);
  });
  return c;
}
