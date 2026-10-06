import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { $, LITE, coarse, reduceMotion, toXZ } from './base.js';

// ---------- Scène ----------
export const canvas = $('#scene');
export function creerRendu() {
  // Fond transparent possible : en « Vue réelle », la 3D Google s'affiche sous la maquette.
  try { return new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch (e) {
    document.querySelector('#loadTxt').innerHTML = '<span class="err">WebGL n\'a pas pu démarrer.</span> Activez l\'accélération matérielle du navigateur, puis rechargez la page.';
    throw e;
  }
}
export const renderer = creerRendu();
renderer.setPixelRatio(Math.min(devicePixelRatio, LITE ? 1.5 : 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = !LITE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(45, 1, 2, 130000);
export const controls = new MapControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 20; controls.maxDistance = 32000;
controls.maxPolarAngle = 1.38; controls.zoomToCursor = true;
controls.screenSpacePanning = false; controls.autoRotateSpeed = -0.35;
controls.listenToKeyEvents(window);
if (coarse) $('#help').innerHTML = '<b>Un doigt</b> pour se déplacer · <b>deux doigts</b> pour pivoter et zoomer';

// Uniformes partagés
export const U = { uRiseT: { value: reduceMotion ? 999 : 0 }, uRiseO: { value: new THREE.Vector2(...toXZ(6.366, 2.422)) }, uNight: { value: 0 }, uTime: { value: 0 } };

// Ciel
export const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() }, uSunColor: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uGlow: { value: 0 } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 uTop, uHorizon, uGround, uSunColor, uSunDir; uniform float uGlow; varying vec3 vDir;
    void main(){ vec3 d = normalize(vDir); float h = d.y;
      vec3 c = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
      c = mix(uGround, c, smoothstep(-0.06, 0.0, h));
      float s = max(dot(d, normalize(uSunDir)), 0.0);
      c += uSunColor * (pow(s, 900.0) * 4.0 + pow(s, 10.0) * 0.45 * uGlow);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
export const sky = new THREE.Mesh(new THREE.SphereGeometry(100000, 32, 16), skyMat);
sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
scene.fog = new THREE.Fog(0xffffff, 5000, 50000);

export const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1); scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xffffff, 2.5); scene.add(sun, sun.target);
sun.castShadow = !LITE;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.00003; sun.shadow.normalBias = 0.4;
sun.shadow.camera.near = 100; sun.shadow.camera.far = 9000;

// Grain du sol, calculé en coordonnées monde : taches de sable plus ou moins tassé,
// plaques de latérite rouge et touffes d'herbe (sol nu seulement), traces plus sombres.
// S'efface avec la distance pour ne pas scintiller vu de haut.
const GLSL_BRUIT = `
  float hS(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float bS(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hS(i), hS(i + vec2(1.0, 0.0)), f.x), mix(hS(i + vec2(0.0, 1.0)), hS(i + vec2(1.0, 1.0)), f.x), f.y); }`;
export function grainSol(mat, nu = false) {
  mat.onBeforeCompile = s => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSolW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSolW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSolW;' + GLSL_BRUIT)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vSolW.xz; float d = length(vSolW - cameraPosition);
          float pres = 1.0 - smoothstep(80.0, 420.0, d), moyen = 1.0 - smoothstep(700.0, 3200.0, d);
          float n1 = bS(p * 0.06), n2 = bS(p * 0.45 + 3.7), n3 = bS(p * 3.1 + 9.1);
          vec3 c = diffuseColor.rgb * (0.9 + 0.16 * n1 + (0.1 * n2 - 0.05) * moyen + (0.1 * n3 - 0.05) * pres);
          ${nu ? `float lat = smoothstep(0.6, 0.82, bS(p * 0.018 + 7.0)) * (0.55 + 0.45 * n2);
          c = mix(c, c * vec3(1.1, 0.78, 0.62), lat * 0.6);
          float herbe = smoothstep(0.68, 0.86, bS(p * 0.03 + 31.0)) * smoothstep(0.35, 0.75, n2 + 0.3 * n3);
          c = mix(c, vec3(0.2, 0.26, 0.09) * (0.75 + 0.5 * n3), herbe * 0.55);` : ''}
          diffuseColor.rgb = c;
        }`);
  };
  mat.customProgramCacheKey = () => 'grainSol' + nu;
  return mat;
}

// Sol sableux
export const flatMat = (hex, extra = {}) => new THREE.MeshLambertMaterial({ color: hex, depthWrite: false, ...extra });
export const ground = new THREE.Mesh(new THREE.PlaneGeometry(150000, 150000).rotateX(-Math.PI / 2), grainSol(flatMat('#d5cbb4'), true));
ground.renderOrder = 1; ground.receiveShadow = true; scene.add(ground);
// Couches dessinées à plat (sol, eau, routes) : masquées quand la vue Google les remplace.
export const COUCHES_SOL = [ground];

