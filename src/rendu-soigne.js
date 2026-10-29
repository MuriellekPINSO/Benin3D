import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
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
export function creerRenduSoigne(renderer, scene, camera) {
  const t = renderer.getDrawingBufferSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  const ao = new N8AOPass(scene, camera, t.x, t.y);
  // gammaCorrection : non, OutputPass s'en charge ; sinon les couleurs passaient deux fois en sRGB et l'image sortait délavée.
  Object.assign(ao.configuration, { aoRadius: 3, distanceFalloff: 1.2, intensity: 3.2, halfRes: true, aoSamples: 12, denoiseSamples: 8, denoiseRadius: 10, gammaCorrection: false });
  ao.beautyRenderTarget.samples = 4; // l'anticrénelage, que le rendu direct demandait au canevas
  const halo = new UnrealBloomPass(new THREE.Vector2(t.x, t.y), .25, .45, 3);
  composer.addPass(ao); composer.addPass(halo); composer.addPass(new OutputPass());
  const taille = () => { composer.setPixelRatio(renderer.getPixelRatio()); const s = renderer.getSize(new THREE.Vector2()); composer.setSize(s.x, s.y); };
  taille();
  /** `nuit` : 0 le jour, 1 la nuit (ambiances.js) ; la nuit, les lumières font des halos plus francs. */
  const rendre = nuit => {
    halo.threshold = THREE.MathUtils.lerp(3.2, .8, nuit); halo.strength = THREE.MathUtils.lerp(.18, .5, nuit);
    composer.render();
  };
  return { composer, ao, halo, taille, rendre };
}
