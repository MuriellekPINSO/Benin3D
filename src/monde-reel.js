import * as THREE from 'three';
import { TP } from './terre-pleins.js';
import { $, toLL } from './base.js';
import { COUCHES_SOL, camera, scene, sky, sun } from './scene.js';
import { chargerGoogle } from './google.js';
import { altitudeSol } from './altitude.js';
import { buildingMeshes } from './ville.js';
import { rueActive } from './rue.js';
import { LIEUX, VEGETATION, visibiliteLieux } from './lieux.js';
import { batimentsGoogleVisibles } from './batiments-google.js';

// « Vue réelle » : la 3D de Google (images satellite et relief, bâtiments
// photoréalistes là où Google en a) s'affiche SOUS la maquette. La caméra Google
// suit la nôtre à chaque image : même position, même cap, même inclinaison, même
// champ de vision. Notre sol, notre eau et nos routes sont masqués ; restent nos
// bâtiments (si l'on veut), les monuments, la circulation, les étiquettes et tout
// le jeu Zém Run, qui roule ainsi sur les vraies rues vues par Google.

export const MR = { actif: false, m: null, alt: null, maquette: false, enJeu: false, visite: false, ombre: null, envoye: {} };
const v = new THREE.Vector3(), deg = 180 / Math.PI;

async function creerCarte() {
  const g = await chargerGoogle();
  const { Map3DElement } = await g.importLibrary('maps3d');
  const m = new Map3DElement({ mode: 'SATELLITE', defaultUIHidden: true, center: { lat: 6.37, lng: 2.42, altitude: 0 }, range: 2000, tilt: 45, heading: 0 });
  m.style.cssText = 'width:100%;height:100%;display:block';
  m.addEventListener('gmp-error', e => console.warn('Google 3D', e));
  $('#vueGoogle').append(m);
  return m;
}
// Vue réelle seule : Google remplace le sol, les bâtiments ordinaires et les arbres dessinés ;
// restent nos monuments (Google n'a pas de bâtiments en 3D à Cotonou : sans eux, le Palais des
// Congrès ou la cathédrale ne seraient qu'une photo à plat), la circulation et les étiquettes.
// Avec la maquette (bouton, ou toujours pendant Zém Run, où il faut des volumes au ras du sol) :
// tout sauf le sol.
function appliquerVisibilite() {
  const on = MR.actif, maquette = !on || MR.maquette || MR.enJeu;
  for (const c of COUCHES_SOL) c.visible = !on || (MR.enJeu && !!c.userData.route); // en jeu : nos routes, nettes au ras du sol
  sky.visible = !on;
  for (const b of buildingMeshes) b.visible = maquette;
  batimentsGoogleVisibles(maquette);
  for (const m of VEGETATION) m.visible = maquette;
  for (const m of TP.decor) m.visible = maquette; // haies, lampadaires et drapeaux des terre-pleins
  rueActive(maquette);
  LIEUX.caches = false; visibiliteLieux(camera.position); // nos monuments restent, même sur les images Google
  if (MR.ombre) MR.ombre.visible = on && maquette;
}
/** Active ou coupe la vue réelle ; renvoie un message d'erreur, ou null. */
export async function basculerMondeReel(on) {
  const app = document.getElementById('app'), el = $('#vueGoogle');
  if (on) {
    try { if (!MR.m) MR.m = await creerCarte(); }
    catch (e) { return e.message; }
    if (!MR.ombre) { // ombres de la maquette posées sur les images Google
      MR.ombre = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: .3, depthWrite: false }));
      MR.ombre.receiveShadow = true; MR.ombre.renderOrder = 2; MR.ombre.frustumCulled = false; scene.add(MR.ombre);
    }
  }
  MR.actif = on; el.hidden = !on; app.classList.toggle('vue-google', on);
  $('#togMaquette').hidden = !on; $('#togMaquette').setAttribute('aria-pressed', String(MR.maquette));
  appliquerVisibilite();
  return null;
}
/** Pendant la visite : les monuments dessinés (Porte du Non-Retour, Arène, BCEAO…) restent sur les images Google. */
export function monumentsEnVisite(on) { MR.visite = on; appliquerVisibilite(); }
/** Maquette (bâtiments et rues dessinés) au-dessus des images Google, ou Google seul. */
export function maquetteVisible(on) { MR.maquette = on; appliquerVisibilite(); }

/** À appeler juste avant le rendu : cale la caméra Google sur la nôtre. `centre` = point suivi au sol. */
export function majMondeReel(centre, enJeu = false) {
  if (!MR.actif || !MR.m) return;
  if (enJeu !== MR.enJeu) { MR.enJeu = enJeu; appliquerVisibilite(); }
  // Altitude du sol sous le point suivi (lissée), pour passer de « y » à « mètres au-dessus de la mer ».
  const [la, lo] = toLL(centre.x, centre.z), a = altitudeSol(la, lo);
  if (a !== null) MR.alt = MR.alt === null ? a : MR.alt + (a - MR.alt) * .04;
  const base = MR.alt ?? 5;
  camera.getWorldDirection(v);
  const [lat, lng] = toLL(camera.position.x, camera.position.z), m = MR.m, d = MR.envoye;
  // On n'envoie à Google que ce qui a changé, et jamais la distance au centre (range) : Google la recalcule
  // lui-même depuis la position de la caméra, un peu autrement que nous. La renvoyer à chaque image faisait
  // osciller sa caméra entre deux positions (11 m d'écart), et la carte clignotait sur les ordinateurs lents.
  const heading = ((Math.atan2(v.x, -v.z) * deg) + 360) % 360, tilt = Math.acos(THREE.MathUtils.clamp(-v.y, -1, 1)) * deg;
  const altitude = base + camera.position.y;
  if (d.fov === undefined || Math.abs(camera.fov - d.fov) > 1e-3) m.fov = d.fov = camera.fov;
  // Un changement de cap ou d'inclinaison seul ferait tourner la caméra Google autour de son centre :
  // on renvoie alors aussi la position, qui l'emporte quand les deux changent dans la même image.
  let tourne = false;
  if (d.heading === undefined || Math.abs(((heading - d.heading + 540) % 360) - 180) > 1e-4) { m.heading = d.heading = heading; tourne = true; }
  if (d.tilt === undefined || Math.abs(tilt - d.tilt) > 1e-4) { m.tilt = d.tilt = tilt; tourne = true; }
  if (d.roll === undefined) m.roll = d.roll = 0;
  if (tourne || Math.abs(lat - d.lat) > 1e-8 || Math.abs(lng - d.lng) > 1e-8 || Math.abs(altitude - d.alt) > .01) {
    d.lat = lat; d.lng = lng; d.alt = altitude; m.cameraPosition = { lat, lng, altitude };
  }
  // Le capteur d'ombres suit la zone couverte par l'ombre du soleil.
  if (MR.ombre) { const c = sun.shadow.camera, w = (c.right - c.left) * 1.2; MR.ombre.position.set(centre.x, .05, centre.z); MR.ombre.scale.set(w, 1, w); }
  // Moins de brume sur la maquette : le ciel et l'horizon sont ceux de Google.
  scene.fog.near *= 1.8; scene.fog.far *= 1.8;
}
