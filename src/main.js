import './style.css';
import { initEvenement, majConcertDehors } from './evenement.js';
import { initMultijoueur, majMultijoueur } from './multijoueur.js';
import { construireFeux, majFeuxVille } from './feux.js';
import { construireTerrePleins, initTerrePleins } from './terre-pleins.js';
import * as THREE from 'three';
import { applyMood, sunDir } from './ambiances.js';
import { $, LITE, reduceMotion } from './base.js';
import { arreterConseils, conseils, decode, frame, loadTxt, status } from './chargement.js';
import { surveillerIncidents } from './incidents.js';
import { envoyerParCarres, preparerGeometries } from './memoire.js';
import { marquerSurRoute } from './chaussee.js';
import { E } from './etat.js';
import { accueil, initExplorer } from './explorer.js';
import { TRIPO, chargerIndexTripo, urlTripo } from './batiments-tripo.js';
import { chargerPersonnages, majPersonnages } from './personnages.js';
import { buildLabels, startFlight, updateFlight, updateHud, updateLabels } from './interface.js';
import { JEU, initJeu, majJeu } from './jeu.js';
import { podiumDemande } from './defi.js';
import { VEGETATION, animerLieux, construireLieux, portailUAC, prechargerAmazone, semeOne, visibiliteLieux } from './lieux.js';
import { COUCHES_SOL, U, camera, controls, renderer, scene, sky, sun } from './scene.js';
import { buildLamps, buildZems, zemsDetailles, construireTokpas, majTokpas, updateZems } from './trafic.js';
import { majCirculation } from './circulation.js';
import { majMondeReel, vueReelleSeule } from './monde-reel.js';
import { avionsVisibles } from './vol.js';
import { changerMeteo, majMeteo } from './meteo.js';
import { majManette } from './manette.js';
import { googleDispo } from './google.js';
import { majSatellite } from './satellite.js';
import { degagerChaussees, initRue, majRue } from './rue.js';
import { initBatimentsGoogle, majBatimentsGoogle } from './batiments-google.js';
import { construireLieuxVideos } from './lieux-videos.js';
import { animerOuidah, construireOuidah } from './ouidah.js';
import { animerEtals, construireEtals, initBoutique } from './artisans.js';
import { construireCaiCai } from './caicai.js';
import { construireStand } from './lancepierre.js';
import { construireMaquis } from './fauxfrere.js';
import { initOffre } from './publicites.js';
import { initMode } from './mode.js';
import { horsDeLaPiece } from './interieurs.js';
import { ouvrirCompte, synchroniserAuDemarrage } from './compte.js';
import { initSalon, majSalon, pieceDuSalon, salonActif } from './salon.js';
import { chargerTokpa, chargerZems, prechargerZems } from './vehicules.js';
import { demarrerTelechargements, plusTard } from './telechargements.js';
import { demarrerStats } from './statistiques.js';
import { initZones } from './zones.js';
import { initLeger } from './leger.js';
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
  else { majSalon(dt); updateFlight(now); controls.update(dt); } // salon entre amis : la caméra suit son personnage
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
  // Téléphone, au ras du sol (à pied, en course, ou de près) : le brouillard se rapproche, 4 km au lieu de 9. Entre les
  // bâtiments, on ne voit guère plus loin, et ce qui est au-delà n'est plus dessiné (Danfo Run en montre bien moins).
  if (LITE && dist < 200) { scene.fog.near = Math.min(scene.fog.near, 1400 + dist * 4); scene.fog.far = Math.min(scene.fog.far, 4000 + dist * 20); }
  // À pied et en course, rien n'est dessiné au-delà du brouillard, où tout a déjà la couleur de l'horizon : depuis les rues de Cotonou,
  // les 30 000 pilotis de Ganvié et Ouidah passaient sinon par la carte graphique. Le ciel est ramené en deçà.
  const loin = salonActif() || JEU.actif ? Math.ceil(scene.fog.far / 500) * 500 : 130000; // à pied et en course
  if (camera.far !== loin) { camera.far = loin; camera.updateProjectionMatrix(); sky.scale.setScalar(Math.min(1, loin * .9 / 100000)); }
  sky.position.copy(camera.position);
  if (E.foamMat) E.foamMat.uniforms.uTime.value = U.uTime.value;
  if (E.frameN % 12 === 0) visibiliteLieux(camera.position);
  animerLieux(U.uTime.value); animerOuidah(U.uTime.value, camera.position); animerEtals(U.uTime.value, camera.position);
  const reelle = vueReelleSeule(); for (const e of extras) e.visible = E.riseDone && !reelle; avionsVisibles(!reelle); // Vue réelle seule : ni palmiers, ni conteneurs, ni bateaux, ni avions
  E.circulation.length = 0; E.zemsPres.length = 0; // refaites par updateZems / majTokpas, vides quand la circulation est cachée
  if (E.zems) { E.zems.visible = E.zemOn && E.riseDone && dist < 5000 && !JEU.actif && !reelle; if (E.zemsProches) E.zemsProches.visible = E.zems.visible; if (E.zems.visible) updateZems(dt); }
  if (E.tokpas) { E.tokpas.visible = E.zemOn && E.riseDone && dist < 6000 && !JEU.actif && !reelle; if (E.tokpas.visible) majTokpas(dt); }
  majCirculation(dt, E.joueur); // dans « Vivre à Cotonou » : voitures, taxis, camions, vélos autour du joueur (circulation.js)
  majConcertDehors(camera.position, dt); // les soirs de concert : la scène de l'Amazone se voit de loin (evenement.js)
  majMondeReel(JEU.actif && JEU.joueur ? JEU.joueur.position : t, JEU.actif);
  majMeteo(dt);
  majFeuxVille(U.uTime.value, JEU.actif || reelle); // feux tricolores cachés en jeu (le jeu a les siens) et en Vue réelle seule
  majMultijoueur(dt);
  majPersonnages(dt);
  const hors = horsDeLaPiece(pieceDuSalon(), camera.position), avant = hors.map(o => o.visible); // dans une pièce : la ville n'est pas dessinée
  for (const o of hors) o.visible = false;
  renderer.render(scene, camera);
  hors.forEach((o, i) => { o.visible = avant[i]; });
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
  surveillerIncidents(renderer.domElement); // compter les plantages, et survivre à une perte du contexte WebGL
  conseils(); // de quoi lire pendant que la ville arrive, sur une connexion lente
  status('Téléchargement de la ville…', 2); await frame();
  const mo = n => (n / 1048576).toFixed(1).replace('.', ',');
  // Zémidjans et statue : téléchargés pendant la construction de la ville (le réseau est libre, le processeur occupé).
  const prechargerModeles = () => { prechargerZems(); prechargerAmazone().catch(() => { }); };
  const data = await decode((lu, total) => {
    if (total && lu >= total) { status('Décompression des données OpenStreetMap…', 7); prechargerModeles(); } // fini : on passe à la suite
    else status(total ? `Téléchargement de la ville… ${mo(lu)} / ${mo(total)} Mo` : `Téléchargement de la ville… ${mo(lu)} Mo`, total ? 2 + 5 * lu / total : null);
  });
  prechargerModeles(); // taille inconnue (serveur qui décompresse en route) : pas de signal de fin plus tôt
  $('#stats').innerHTML = `<span>${data.B.n.length.toLocaleString('fr-FR')} bâtiments</span><span>${data.R.c.length.toLocaleString('fr-FR')} voies</span><span>${(data.palms.length / 2).toLocaleString('fr-FR')} palmiers</span>`;
  status('Mise en eau du lac Nokoué et de la lagune…', 8); await frame();
  buildSurfaces(data.S); buildFoam();
  status('Tracé des routes…', 12); await frame();
  buildRoads(data.R);
  initTerrePleins(data.L.terrePleins); construireTerrePleins(); // terre-plein central des boulevards (gazon, haies, lampadaires)
  construireFeux(data.L.feux, data.L.passages); // feux tricolores et passages piétons réels (OSM)
  initZones(data.L); // zones où rien ne se construit (piste de Ouidah)
  const surRoute = marquerSurRoute(data.B); // les bâtiments OSM posés sur une rue où l'on roule : ni dessinés, ni obstacles (chaussee.js)
  if (import.meta.env.DEV) console.info(`bâtiments OSM sur une chaussée, retirés : ${surRoute}`);
  await buildBuildings(data.B);
  initRue(data);
  const nGoogle = await initBatimentsGoogle();
  if (nGoogle) $('#stats').innerHTML = `<span>${(data.B.n.length + nGoogle).toLocaleString('fr-FR')} bâtiments</span><span>${data.R.c.length.toLocaleString('fr-FR')} voies</span><span>${(data.palms.length / 2).toLocaleString('fr-FR')} palmiers</span>`;
  status('Cocotiers, conteneurs et pirogues…', 84); await frame();
  extras.push(buildPalms(data.palms), buildContainers(data.containers), buildShips());
  status('Monuments, Ganvié et marché de Dantokpa…', 90); await frame();
  await chargerIndexTripo(); // bâtiments reconnaissables générés par Tripo, s'il y en a
  chargerPersonnages(); // personnages animés (en tâche de fond : le jeu garde ses personnages en code en attendant)
  await construireLieux(data);
  construireLieuxVideos(data); construireOuidah(data.L); construireEtals(data.L); construireCaiCai(); construireStand(); construireMaquis();
  semeOne(data.L.semeOne); portailUAC(data.L.campus, data.L.lignes?.find(l => l.id === 'calavi')?.pts); construireTokpas();
  const sansArbres = degagerChaussees(VEGETATION); // pas d'arbre au milieu de la rue
  if (import.meta.env.DEV) console.info(`arbres retirés des chaussées : ${sansArbres}`);
  status('Zémidjans et tokpa-tokpa…', 94); await frame();
  await chargerZems();
  // Le vrai minibus des tokpa-tokpa (Tripo) remplace celui dessiné en code dans la circulation de la ville.
  if (TRIPO.info.tokpa) plusTard(() => chargerTokpa(urlTripo('tokpa'))).then(t => { if (t.geo && E.tokpas) { E.tokpas.geometry = t.geo; E.tokpas.material = t.mat; E.tokpas.castShadow = !LITE; } });
  buildZems(); zemsDetailles(); buildLamps(); buildLabels();
  initExplorer(); initJeu(data); initMultijoueur(); initEvenement(); initBoutique(); initOffre(); initMode(); initSalon(data); initLeger();
  if (reduceMotion) finishRise();
  // Les routes, marquages, terre-pleins et surfaces sont posés à quelques centimètres du sol sans écrire leur profondeur.
  // Sur un téléphone, au loin, le test de profondeur hésitait entre eux et le sol d'une image à l'autre : ils clignotaient.
  // Un décalage de profondeur (polygonOffset), plus fort pour les couches du dessus, les fait toujours passer devant.
  for (const m of COUCHES_SOL.slice(1)) for (const mat of [].concat(m.material)) Object.assign(mat, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -Math.round((m.renderOrder || 6) * 2) });
  status('Lever de la ville…', 100); await frame();
  // Vue d'ensemble depuis le large, au sud-est
  const target = new THREE.Vector3(600, 0, -900);
  controls.target.copy(target);
  camera.position.setFromSpherical(new THREE.Spherical(reduceMotion ? 12500 : 24000, reduceMotion ? 0.98 : 0.5, 0.42)).add(target);
  camera.lookAt(target);
  if (!reduceMotion) startFlight(target.clone(), 12500, 0.98, 0.42, 6.5);
  // Avant le tout premier rendu : chaque géométrie rendra sa copie JavaScript dès qu'elle aura été envoyée à la
  // carte graphique (memoire.js). Puis de nouveau, pour les modèles détaillés qui arrivent après coup.
  preparerGeometries();
  if (LITE) { const t0 = performance.now(), n = await envoyerParCarres(renderer, camera, frame); if (import.meta.env.DEV) console.info(`ville envoyée en ${n} carrés, ${Math.round(performance.now() - t0)} ms`); } // téléphone : la ville part vers la carte graphique par morceaux (memoire.js)
  requestAnimationFrame(t => { last = t; loop(t); });
  arreterConseils();
  for (const ms of [8000, 30000, 90000]) setTimeout(() => preparerGeometries(), ms);
  setTimeout(() => { $('#loader').classList.add('done'); demarrerTelechargements(); }, 150); // les modèles détaillés, une fois la ville affichée
  setTimeout(demarrerStats, 2500); // présence et compteurs du tableau de bord (statistiques.js)
  setTimeout(synchroniserAuDemarrage, 1500); // avec un compte : la partie jouée sur un autre téléphone (compte.js)
  accueil(); // d'abord la visite en musique, ou la ville tout de suite
  podiumDemande(); // ?podium=… (lien du tableau de bord) : le podium du défi de Zém Run, à publier
  // Le temps qu'il faisait la dernière fois.
  try { const m = localStorage.getItem('cotonou3d.meteo'); if (m && m !== 'soleil') changerMeteo(m); } catch { }
  // La Vue réelle (les tuiles 3D de Google) ne s'allume plus toute seule, nulle part : ce qu'on montre d'abord,
  // c'est la ville telle qu'on l'a reconstruite. Sur téléphone elle faisait en plus exploser la mémoire, l'onglet
  // était tué par le navigateur et la page se rechargeait en boucle. Et chaque visiteur coûtait des tuiles Google.
  // Elle reste à un clic du bouton, et le choix est gardé d'une visite à l'autre.
  let vueReelle = '0'; try { vueReelle = localStorage.getItem('cotonou3d.vueReelle') ?? '0'; } catch { }
  if (googleDispo && vueReelle !== '0') setTimeout(() => { if ($('#togGoogle').getAttribute('aria-pressed') !== 'true' && !JEU.actif && !document.getElementById('app').classList.contains('mode-salon') && $('#salon')?.hidden !== false) $('#togGoogle').click(); }, reduceMotion ? 300 : 2500); // pas si l'on est déjà entré dans le salon : à pied, il faut la maquette
}
// En développement, l'état est accessible depuis la console : __cotonou.E, __cotonou.camera…
if (import.meta.env.DEV) Promise.all([import('./jeu.js'), import('./bordure.js'), import('./discussions.js'), import('./personnages.js'), import('./pietons.js')]).then(([j, b, d, p, pi]) => { window.__cotonou = { E, camera, controls, JEU, scene, renderer, latTrottoir: j.latTrottoir, creerObjet: j.creerObjet, BORD: b.BORD, DISC: d.DISC, personnage3d: p.personnage3d, personnagesPrets: p.personnagesPrets, personne: d.personne, traverser: pi.traverser, marchandeReelle: pi.marchandeReelle }; });
// …et de quoi tourner la vidéo de présentation (survols, ambiance, musique) depuis un script.
if (import.meta.env.DEV) Promise.all([import('./explorer.js'), import('./interface.js'), import('./donnees-lieux.js'), import('./ambiances.js'), import('./monde-reel.js'), import('./musique.js')]).then(([ex, it, dl, am, mr, mu]) => { window.__video = { finVol: ex.finVol, startFlight: it.startFlight, PLACES: dl.PLACES, setMood: am.setMood, monumentsEnVisite: mr.monumentsEnVisite, musique: mu.musiqueForcee, THREE }; });

// Appli installable (public/manifest.webmanifest, public/sw.js), pas en développement : le cache gênerait Vite.
if (!import.meta.env.DEV && 'serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => { }));
// « Installer l'appli » sur l'accueil, quand le navigateur le propose (Chrome sur Android, comme Danfo Run).
let invitation = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); invitation = e; const b = $('#acInstaller'); if (b) b.hidden = false; });
addEventListener('appinstalled', () => { invitation = null; const b = $('#acInstaller'); if (b) b.hidden = true; });
for (const id of ['#acCompte', '#vhCompte', '#jmCompte', '#vtCompte']) $(id)?.addEventListener('click', () => ouvrirCompte()); // #vtCompte : au tirage du départ, avant de recommencer une vie à zéro sans le savoir
$('#acInstaller')?.addEventListener('click', async () => { if (!invitation) return; invitation.prompt(); await invitation.userChoice.catch(() => { }); invitation = null; $('#acInstaller').hidden = true; });

main().catch(err => {
  console.error(err);
  const coupe = /fetch|network|réseau|load failed|connexion/i.test(err.message || ''); // la connexion a lâché (« Load failed » sur iPhone) : on propose de recommencer
  loadTxt.innerHTML = `<span class="err">Impossible d'afficher la ville.</span> ${coupe ? 'La connexion a coupé pendant le chargement.' : err.message || err} <button type="button" class="btn-ghost" onclick="location.reload()">Réessayer</button>`;
});
