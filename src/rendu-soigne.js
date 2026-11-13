import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { N8AOPass } from 'n8ao';

// ---------- Le rendu soigné (ordinateur) : l'ombre des recoins et les halos des lumières ----------
// « Pourquoi dans sa ville c'est trop réaliste, pas comme chez nous ? » (Murielle, 29/10, devant Slop New York de mrdoob).
// Deux effets sur l'image entière, comme lui, réservés aux ordinateurs (le téléphone, LITE, garde le rendu direct) :
//  - l'ombre des recoins (N8AO, « ambient occlusion ») : le pied des murs, le dessous des voitures, l'angle des toits
//    s'assombrissent un peu, et c'est ce qui donne du volume. Calculée d'après la profondeur de l'image, en demi-résolution :
//    la ville n'est pas dessinée une seconde fois.
//  - les halos (UnrealBloomPass) : ce qui est très lumineux — le soleil, les lampadaires et les phares la nuit — déborde un
//    peu. Le seuil suit l'ambiance : de jour, un mur blanc en plein soleil ne doit pas baver.
// Le ton (NeutralToneMapping) et l'exposition de l'ambiance passent par OutputPass, comme le rendu direct.
// Chargé à part (main.js, import dynamique) : le téléphone ne télécharge rien de tout ça.
//
// La haute qualité (« regarde comment GTA 6, les trucs sont clairs et waouh », Murielle, 13/11), sur les ordinateurs qui
// suivent : l'ombre des recoins en pleine résolution, et une dernière passe sur l'image finie, comme l'étalonnage d'un film
// ou d'un jeu de console — un peu de netteté (les bords ressortent), un peu plus de contraste et de couleur, un soleil
// légèrement plus chaud, les coins de l'image à peine assombris. L'image en pleine résolution et les ombres plus fines
// sont dans main.js (qualite).
const ETALONNAGE = {
  uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) }, nettete: { value: .24 }, contraste: { value: 1.07 }, couleur: { value: 1.14 }, chaud: { value: new THREE.Vector3(1.02, 1.005, .975) }, vignette: { value: .12 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 texel; uniform float nettete, contraste, couleur, vignette; uniform vec3 chaud; varying vec2 vUv;
    void main() {
      vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb;
      // La netteté : l'écart avec ses quatre voisins, ajouté (les bords ressortent, les aplats ne bougent pas).
      vec3 v = texture2D(tDiffuse, vUv + vec2(texel.x, 0.)).rgb + texture2D(tDiffuse, vUv - vec2(texel.x, 0.)).rgb
             + texture2D(tDiffuse, vUv + vec2(0., texel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0., texel.y)).rgb;
      c = clamp(c + (c - v * .25) * nettete, 0., 1.);
      // Le contraste autour du gris moyen, puis la couleur (saturation), puis la teinte du soleil.
      c = (c - .5) * contraste + .5;
      float l = dot(c, vec3(.2126, .7152, .0722));
      c = mix(vec3(l), c, couleur) * chaud;
      vec2 d = vUv - .5; c *= 1. - vignette * dot(d, d) * 1.6;
      gl_FragColor = vec4(clamp(c, 0., 1.), t.a);
    }`,
};
export function creerRenduSoigne(renderer, scene, camera) {
  const t = renderer.getDrawingBufferSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  const ao = new N8AOPass(scene, camera, t.x, t.y);
  // gammaCorrection : non, OutputPass s'en charge ; sinon les couleurs passaient deux fois en sRGB et l'image sortait délavée.
  Object.assign(ao.configuration, { aoRadius: 3, distanceFalloff: 1.2, intensity: 3.2, halfRes: true, aoSamples: 12, denoiseSamples: 8, denoiseRadius: 10, gammaCorrection: false });
  ao.beautyRenderTarget.samples = 4; // l'anticrénelage, que le rendu direct demandait au canevas
  const halo = new UnrealBloomPass(new THREE.Vector2(t.x, t.y), .25, .45, 3);
  const etal = new ShaderPass(ETALONNAGE); etal.enabled = false; // l'image est déjà en sRGB (OutputPass) : la passe n'y touche pas
  composer.addPass(ao); composer.addPass(halo); composer.addPass(new OutputPass()); composer.addPass(etal);
  const taille = () => {
    composer.setPixelRatio(renderer.getPixelRatio()); const s = renderer.getSize(new THREE.Vector2()); composer.setSize(s.x, s.y);
    const b = renderer.getDrawingBufferSize(new THREE.Vector2()); etal.uniforms.texel.value.set(1 / b.x, 1 / b.y);
  };
  taille();
  /** Haute qualité : l'ombre des recoins en pleine résolution, et l'étalonnage. */
  const qualite = hq => { ao.configuration.halfRes = !hq; etal.enabled = hq; };
  /** `nuit` : 0 le jour, 1 la nuit (ambiances.js) ; la nuit, les lumières font des halos plus francs. */
  // Dans la cabine du jet (caméra à 10 cm : vol.js), un rayon de 3 m assombrissait tout, en taches : on le réduit.
  let proche = false;
  const rendre = nuit => {
    if (proche !== camera.near < .2) { proche = !proche; Object.assign(ao.configuration, proche ? { aoRadius: .35, distanceFalloff: .3, intensity: 1.6 } : { aoRadius: 3, distanceFalloff: 1.2, intensity: 3.2 }); }
    halo.threshold = THREE.MathUtils.lerp(3.2, .8, nuit); halo.strength = THREE.MathUtils.lerp(.18, .5, nuit);
    composer.render();
  };
  return { composer, ao, halo, etal, taille, rendre, qualite };
}
