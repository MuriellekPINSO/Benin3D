import './style.css';
import { initEvenement } from './evenement.js';
import { initMultijoueur, majMultijoueur } from './multijoueur.js';
import { construireFeux, majFeuxVille } from './feux.js';
import { construireTerrePleins, initTerrePleins } from './terre-pleins.js';
import * as THREE from 'three';
import { applyMood, sunDir } from './ambiances.js';
import { $, LITE, reduceMotion } from './base.js';
import { decode, frame, loadTxt, status } from './chargement.js';
import { E } from './etat.js';
import { accueil, initExplorer } from './explorer.js';
import { chargerIndexTripo } from './batiments-tripo.js';
import { buildLabels, startFlight, updateFlight, updateHud, updateLabels } from './interface.js';
import { JEU, initJeu, majJeu } from './jeu.js';
import { VEGETATION, animerLieux, construireLieux, portailUAC, semeOne, visibiliteLieux } from './lieux.js';
import { U, camera, controls, renderer, scene, sky, sun } from './scene.js';
import { buildLamps, buildZems, zemsDetailles, construireTokpas, majTokpas, updateZems } from './trafic.js';
import { majMondeReel } from './monde-reel.js';
import { changerMeteo, majMeteo } from './meteo.js';
import { majManette } from './manette.js';
import { googleDispo } from './google.js';
import { majSatellite } from './satellite.js';
import { degagerChaussees, initRue, majRue } from './rue.js';
import { initBatimentsGoogle, majBatimentsGoogle } from './batiments-google.js';
import { construireLieuxVideos } from './lieux-videos.js';
import { animerOuidah, construireOuidah } from './ouidah.js';
import { animerEtals, construireEtals, initBoutique } from './artisans.js';
import { initOffre } from './publicites.js';
import { chargerZems } from './vehicules.js';
import { buildBuildings, buildContainers, buildFoam, buildPalms, buildRoads, buildShips, buildSurfaces, buildingMeshes } from './ville.js';

// ---------- Boucle ----------
let W = 1, H = 1;
function resize() {
  const r = $('#app').getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
  renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe($('#app'));
resize();

let last = performance.now();
const extras = [];
let shadowSize = 0;
// Une erreur dans une image ne doit pas figer la ville ni le jeu : on la signale une fois et on continue.
const erreursVues = new Set();
function loop(now) {
  requestAnimationFrame(loop);
  try { image(now); } catch (err) { const k = String(err?.message); if (!erreursVues.has(k)) { erreursVues.add(k); console.error('image', err); } }
}
function image(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; E.frameN++;
  majManette(dt);
  U.uTime.value += dt;
  if (!E.riseDone) {
    U.uRiseT.value += dt;
    if (U.uRiseT.value > 7.5) finishRise();
  }
  if (JEU.actif) majJeu(dt);
  else { updateFlight(now); controls.update(dt); }
  majSatellite(dt);
  if (JEU.actif) { if (JEU.joueur) { majRue(dt, JEU.joueur.position, 60); majBatimentsGoogle(dt, JEU.joueur.position, 60); } }
  else { majRue(dt); majBatimentsGoogle(dt, controls.target, camera.position.distanceTo(controls.target)); }
  const t = controls.target;
  // De Ouidah (≈ 36 km à l'ouest) jusqu'à Sèmè.
  if (t.x < -42000 || t.x > 16000 || t.z < -16000 || t.z > 9000) { t.x = THREE.MathUtils.clamp(t.x, -42000, 16000); t.z = THREE.MathUtils.clamp(t.z, -16000, 9000); }
  const dist = camera.position.distanceTo(t);
  applyMood(dt);
  sun.position.copy(t).addScaledVector(sunDir, 4000); sun.target.position.copy(t);
  const want = THREE.MathUtils.clamp(dist * 0.85, 300, 6000);
  if (Math.abs(want - shadowSize) / want > 0.15) {
    shadowSize = want; const c = sun.shadow.camera; c.left = c.bottom = -want; c.right = c.top = want; c.updateProjectionMatrix();
  }
  scene.fog.near = Math.min(dist * 1.3 + 1800, 26000); scene.fog.far = Math.min(dist * 4.2 + 9000, 62000);
  sky.position.copy(camera.position);
  if (E.foamMat) E.foamMat.uniforms.uTime.value = U.uTime.value;
  if (E.frameN % 12 === 0) visibiliteLieux(camera.position);
  animerLieux(U.uTime.value); animerOuidah(U.uTime.value, camera.position); animerEtals(U.uTime.value, camera.position);
  if (E.zems) { E.zems.visible = E.zemOn && E.riseDone && dist < 5000 && !JEU.actif; if (E.zemsProches) E.zemsProches.visible = E.zems.visible; if (E.zems.visible) updateZems(dt); }
  if (E.tokpas) { E.tokpas.visible = E.zemOn && E.riseDone && dist < 6000 && !JEU.actif; if (E.tokpas.visible) majTokpas(dt); }
  majMondeReel(JEU.actif && JEU.joueur ? JEU.joueur.position : t, JEU.actif);
  majMeteo(dt);
  majFeuxVille(U.uTime.value, JEU.actif);
  majMultijoueur(dt);
  renderer.render(scene, camera);
  updateLabels(dist, W, H, JEU.actif && JEU.joueur ? JEU.joueur.position : null); // en jeu : les lieux proches du zém, pour se repérer
  if (E.frameN % 6 === 0) updateHud(dist, H);
}
function finishRise() {
  E.riseDone = true; U.uRiseT.value = 999;
  for (const m of buildingMeshes) m.castShadow = !LITE;
  for (const e of extras) e.visible = true;
}

/*__LIEUX__*/
/*__JEU__*/


// ---------- Démarrage ----------
async function main() {
  status('Décompression des données OpenStreetMap…', 4); await frame();
  const data = await decode();
  $('#stats').innerHTML = `<span>${data.B.n.length.toLocaleString('fr-FR')} bâtiments</span><span>${data.R.c.length.toLocaleString('fr-FR')} voies</span><span>${(data.palms.length / 2).toLocaleString('fr-FR')} palmiers</span>`;
  status('Mise en eau du lac Nokoué et de la lagune…', 8); await frame();
  buildSurfaces(data.S); buildFoam();
  status('Tracé des routes…', 12); await frame();
  buildRoads(data.R);
  initTerrePleins(data.L.terrePleins); construireTerrePleins(); // terre-plein central des boulevards (gazon, haies, lampadaires)
  construireFeux(data.L.feux, data.L.passages); // feux tricolores et passages piétons réels (OSM)
  await buildBuildings(data.B);
  initRue(data);
  const nGoogle = await initBatimentsGoogle();
  if (nGoogle) $('#stats').innerHTML = `<span>${(data.B.n.length + nGoogle).toLocaleString('fr-FR')} bâtiments</span><span>${data.R.c.length.toLocaleString('fr-FR')} voies</span><span>${(data.palms.length / 2).toLocaleString('fr-FR')} palmiers</span>`;
  status('Cocotiers, conteneurs et pirogues…', 84); await frame();
  extras.push(buildPalms(data.palms), buildContainers(data.containers), buildShips());
  status('Monuments, Ganvié et marché de Dantokpa…', 90); await frame();
  await chargerIndexTripo(); // bâtiments reconnaissables générés par Tripo, s'il y en a
  await construireLieux(data);
  construireLieuxVideos(data); construireOuidah(data.L); construireEtals(data.L);
  semeOne(data.L.semeOne); portailUAC(data.L.campus, data.L.lignes?.find(l => l.id === 'calavi')?.pts); construireTokpas();
  const sansArbres = degagerChaussees(VEGETATION); // pas d'arbre au milieu de la rue
  if (import.meta.env.DEV) console.info(`arbres retirés des chaussées : ${sansArbres}`);
  status('Zémidjans de 3D monde…', 94); await frame();
  await chargerZems();
  buildZems(); zemsDetailles(); buildLamps(); buildLabels();
  initExplorer(); initJeu(data); initMultijoueur(); initEvenement(); initBoutique(); initOffre();
  if (reduceMotion) finishRise();
  status('Lever de la ville…', 100); await frame();
  // Vue d'ensemble depuis le large, au sud-est
  const target = new THREE.Vector3(600, 0, -900);
  controls.target.copy(target);
  camera.position.setFromSpherical(new THREE.Spherical(reduceMotion ? 12500 : 24000, reduceMotion ? 0.98 : 0.5, 0.42)).add(target);
  camera.lookAt(target);
  if (!reduceMotion) startFlight(target.clone(), 12500, 0.98, 0.42, 6.5);
  requestAnimationFrame(t => { last = t; loop(t); });
  setTimeout(() => $('#loader').classList.add('done'), 150);
  accueil(); // d'abord la visite en musique, ou la ville tout de suite
  // Le temps qu'il faisait la dernière fois.
  try { const m = localStorage.getItem('cotonou3d.meteo'); if (m && m !== 'soleil') changerMeteo(m); } catch { }
  // La vue réelle Google est la vue par défaut (sauf si on l'a coupée la dernière fois).
  let vueReelle = '1'; try { vueReelle = localStorage.getItem('cotonou3d.vueReelle') ?? '1'; } catch { }
  if (googleDispo && vueReelle !== '0') setTimeout(() => { if ($('#togGoogle').getAttribute('aria-pressed') !== 'true') $('#togGoogle').click(); }, reduceMotion ? 300 : 2500);
}
// En développement, l'état est accessible depuis la console : __cotonou.E, __cotonou.camera…
if (import.meta.env.DEV) Promise.all([import('./jeu.js'), import('./bordure.js'), import('./discussions.js')]).then(([j, b, d]) => { window.__cotonou = { E, camera, controls, JEU, scene, renderer, creerObjet: j.creerObjet, BORD: b.BORD, DISC: d.DISC }; });

main().catch(err => { console.error(err); loadTxt.innerHTML = `<span class="err">Impossible d'afficher la ville.</span> ${err.message || err}`; });
