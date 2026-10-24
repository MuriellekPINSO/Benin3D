import * as THREE from 'three';
import { AUDIO, STATIONS, dureeVisite, musiqueVisite, prechargerMusique, radio } from './audio.js';
import { CHANSONS, arreterChanson, chansonActive, initLecteur, jouerChanson, suspendreChanson } from './lecteur.js';
import { $, coarse } from './base.js';
import { PLACES } from './donnees-lieux.js';
import { E } from './etat.js';
import { startFlight } from './interface.js';
import { basculerMondeReel, monumentsEnVisite } from './monde-reel.js';
import { camera, controls } from './scene.js';

// ---------- Explorer : catégories, radio, présentation ----------
export const CATS = { hotel: 'Hôtels', monument: 'Monuments', institution: 'Institutions', culte: 'Monuments', marche: 'Marchés', eau: 'Mer et lagune', plage: 'Mer et lagune', transport: 'Transport', savoir: 'Savoir', quartier: 'Quartiers' };
// Ouidah a son filtre (la Porte et l'Arène étaient noyées en bas de la liste) ; sièges, ambassade et ministères ne sont pas des monuments.
const LOISIRS = new Set(['stade', 'jardin']), ENTREPRISES = new Set(['mtn', 'moov', 'agl']);
export const catDe = p => /Ouidah/.test(p.kind) ? 'Ouidah' : LOISIRS.has(p.id) ? 'Sport et loisirs' : ENTREPRISES.has(p.id) ? 'Entreprises' : CATS[p.k] || 'Autres';
export let filtre = 'Tout';
export function initCategories() {
  const el = $('#chips'); if (!el) return;
  const noms = ['Tout', ...new Set(PLACES.map(catDe))];
  el.innerHTML = noms.map(n => `<button type="button" class="chip" data-c="${n}" aria-pressed="${n === 'Tout'}">${n}<span>${n === 'Tout' ? PLACES.length : PLACES.filter(p => catDe(p) === n).length}</span></button>`).join('');
  el.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { filtre = b.dataset.c; el.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); appliquerFiltre(); }));
}
export function appliquerFiltre() { for (const p of PLACES) { const ok = filtre === 'Tout' || catDe(p) === filtre; p.btn.parentElement.hidden = !ok; if (p.label) p.label.style.display = ok ? '' : 'none'; } }
export const PRES = { actif: false, reelle: false };
export const attendre = ms => new Promise(r => setTimeout(r, ms));
export const finVol = () => new Promise(r => { const chk = () => (!E.flight || !PRES.actif) ? r() : requestAnimationFrame(chk); chk(); });
export async function presentation() {
  if (PRES.actif) return; PRES.actif = true;
  const app = document.getElementById('app'); app.classList.add('mode-pres'); $('#pres').hidden = false; monumentsEnVisite(true);
  // La visite montre la ville telle qu'on l'a reconstruite : on coupe la Vue réelle (les photos de Google) le temps
  // du survol, et on la remet à la fin. Sans ça, la maquette survolait des images satellite.
  const btnG = $('#togGoogle');
  PRES.reelle = btnG?.getAttribute('aria-pressed') === 'true';
  if (PRES.reelle) { btnG.setAttribute('aria-pressed', 'false'); await basculerMondeReel(false); }
  $('#presSortie').textContent = coarse ? 'Touche l’écran pour quitter' : 'Cliquer ou Échap pour quitter';
  const titre = (h, p) => { const t = $('#presTitre'), s = $('#presSous'); t.textContent = h; s.textContent = p; const box = $('#pres .pres-titre'); box.classList.remove('on'); void box.offsetWidth; box.classList.add('on'); };
  // La radio s'efface : la visite se fait sur « Agolo » d'Angélique Kidjo.
  const ancien = $('#btnRadio').getAttribute('aria-pressed') === 'true'; if (chansonActive() >= 0) suspendreChanson(true); else if (ancien) await radio(false);
  await musiqueVisite(true);
  controls.autoRotate = false;
  const centre = new THREE.Vector3(600, 0, -900);
  camera.position.setFromSpherical(new THREE.Spherical(30000, .35, .42)).add(centre); controls.target.copy(centre);
  titre('LE BÉNIN EN 3D', 'Cotonou, Abomey-Calavi, Ganvié et Ouidah');
  startFlight(centre.clone(), 11000, .95, .42, 5); await finVol(); await attendre(1200);
  // Tournée géographique : le centre, la côte, l'ouest, le nord, le lac, puis Ouidah.
  const seq = ['etoile', 'dantokpa', 'chenal', 'cathedrale', 'zongo', 'bceao', 'port', 'corniche', 'marina', 'amazone', 'congres', 'bioguera', 'aeroport', 'haievive', 'seme', 'fidjrosse', 'stade', 'uac', 'calavi', 'ganvie', 'porte', 'arene'];
  // Le temps passé sur chaque lieu suit la durée du morceau, pour finir avec lui.
  const pause = THREE.MathUtils.clamp(((dureeVisite() - 16) / seq.length - 3.4) * 1000, 2600, 6500);
  for (const [n, id] of seq.entries()) {
    if (!PRES.actif) break;
    const p = PLACES.find(q => q.id === id); if (!p) continue;
    titre(p.name, `${p.kind} · ${n + 1}/${seq.length}`);
    const [d, phi, th] = p.view; startFlight(new THREE.Vector3(p.x, 0, p.z), d, phi, th, id === 'porte' ? 4.5 : 3.2); await finVol();
    controls.autoRotate = true; controls.autoRotateSpeed = -.9; await attendre(pause); controls.autoRotate = false;
  }
  if (PRES.actif) { titre('LE BÉNIN EN 3D', 'Explore les villes · joue dans leurs rues'); startFlight(centre.clone(), 13000, .9, .9, 4); await finVol(); await attendre(3500); }
  finPresentation(ancien);
}
export function finPresentation(remettreRadio) {
  if (!PRES.actif) return; PRES.actif = false; controls.autoRotate = $('#togTour').getAttribute('aria-pressed') === 'true'; controls.autoRotateSpeed = -.35;
  document.getElementById('app').classList.remove('mode-pres'); $('#pres').hidden = true; monumentsEnVisite(false);
  if (PRES.reelle) { PRES.reelle = false; const b = $('#togGoogle'); b?.setAttribute('aria-pressed', 'true'); basculerMondeReel(true); }
  musiqueVisite(false);
  if (remettreRadio) { if (chansonActive() >= 0) suspendreChanson(false); else radio(true); }
}
/** Accueil : on propose d'abord la visite. Le clic sur « Lancer la visite » autorise aussi le son
 *  (les navigateurs refusent de jouer de la musique avant un geste). « Explorer librement » ou Échap : la ville tout de suite. */
export function accueil() {
  const el = $('#accueil'), app = document.getElementById('app'); if (!el) return;
  app.classList.add('mode-accueil'); el.hidden = false; prechargerMusique();
  const clavier = e => { if (e.key === 'Escape') fermer(); };
  const fermer = () => {
    if (el.hidden || el.classList.contains('sort')) return;
    window.removeEventListener('keydown', clavier); app.classList.remove('mode-accueil'); el.classList.add('sort');
    setTimeout(() => { el.hidden = true; el.classList.remove('sort'); }, 500);
  };
  $('#acVisite').addEventListener('click', () => { fermer(); presentation(); }, { once: true });
  $('#acPasser').addEventListener('click', fermer, { once: true });
  $('#acVivre')?.addEventListener('click', () => { fermer(); $('#btnSalon')?.click(); }, { once: true }); // la vie à Cotonou (salon.js)
  $('#acZemRun')?.addEventListener('click', () => { fermer(); $('#btnJouer')?.click(); }, { once: true }); // le menu de Zém Run
  window.addEventListener('keydown', clavier);
  ($('#acVivre') || $('#acVisite')).focus({ preventScroll: true });
}
export function initExplorer() {
  initCategories();
  // Crédits : la liste complète s'ouvre au clic sur « Crédits » et se referme au clic ailleurs ou avec Échap.
  const btnCredits = $('.credits-btn'), detail = $('#creditsDetail');
  const credits = ouvert => { detail.hidden = !ouvert; btnCredits.setAttribute('aria-expanded', String(ouvert)); };
  btnCredits?.addEventListener('click', () => credits(detail.hidden));
  document.addEventListener('click', e => { if (!detail.hidden && !e.target.closest('.credits')) credits(false); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !detail.hidden) credits(false); });
  // Musique : une liste qui se déroule (chansons béninoises, radios en direct, ambiance du jeu) ; on choisit, ou on arrête.
  const btnR = $('#btnRadio'), menuR = $('#radioMenu');
  const fermerMenu = () => { menuR.hidden = true; btnR.setAttribute('aria-expanded', 'false'); };
  const marquer = (on, titre) => { btnR.setAttribute('aria-pressed', String(on)); btnR.title = on ? titre : 'Écouter de la musique béninoise'; };
  const remplirMenu = (erreur = '') => {
    const radioOn = AUDIO.radio, ch = chansonActive(), coche = v => `aria-checked="${v}"`;
    menuR.innerHTML = (erreur ? `<p class="rm-erreur">${erreur}</p>` : '')
      + '<p class="rm-titre">Musique du Bénin</p>' + CHANSONS.map(([, t, a], i) => `<button type="button" role="menuitemradio" ${coche(ch === i)} data-chanson="${i}"><b>${t}</b><small>${a}</small></button>`).join('')
      + '<p class="rm-titre">Radios en direct</p>' + STATIONS.map(st => `<button type="button" role="menuitemradio" ${coche(radioOn && AUDIO.station === st.id)} data-station="${st.id}"><b>${st.nom}</b><small>${st.sous}</small></button>`).join('')
      + (radioOn || ch >= 0 ? '<button type="button" role="menuitem" class="rm-stop" data-station="">Arrêter la musique</button>' : '');
  };
  btnR.addEventListener('click', e => { e.stopPropagation(); if (!menuR.hidden) return fermerMenu(); remplirMenu(); menuR.hidden = false; btnR.setAttribute('aria-expanded', 'true'); (menuR.querySelector('[aria-checked="true"]') || menuR.querySelector('button'))?.focus(); });
  menuR.addEventListener('click', async e => {
    const b = e.target.closest('button[data-station], button[data-chanson]'); if (!b) return; e.stopPropagation(); fermerMenu();
    if (b.dataset.chanson !== undefined) { // une chanson : la radio s'arrête, le lecteur s'ouvre
      await radio(false); const i = +b.dataset.chanson, ok = await jouerChanson(i);
      if (!ok) marquer(false);
      if (!ok) { remplirMenu('YouTube ne répond pas pour le moment : réessaie, ou choisis une radio.'); menuR.hidden = false; btnR.setAttribute('aria-expanded', 'true'); }
      return;
    }
    arreterChanson();
    const id = b.dataset.station, ok = id ? await radio(true, id) : (await radio(false), false);
    marquer(!!ok, `Radio : ${STATIONS.find(st => st.id === id)?.nom}`);
    if (id && !ok) { remplirMenu('Cette radio ne répond pas pour le moment : essaie-en une autre.'); menuR.hidden = false; btnR.setAttribute('aria-expanded', 'true'); }
  });
  document.addEventListener('musique-arretee', () => marquer(false));
  document.addEventListener('chanson', e => marquer(true, `Musique : ${e.detail[1]} · ${e.detail[2]}`));
  document.addEventListener('click', e => { if (!menuR.hidden && !menuR.contains(e.target)) fermerMenu(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !menuR.hidden) { fermerMenu(); btnR.focus(); } });
  initLecteur();
  // « Plus » : visite en musique, boutique, météo, survol. Le menu se referme après un choix.
  const btnP = $('#btnPlus'), menuP = $('#plusMenu');
  const fermerPlus = () => { menuP.hidden = true; btnP.setAttribute('aria-expanded', 'false'); };
  btnP.addEventListener('click', e => { e.stopPropagation(); if (!menuP.hidden) return fermerPlus(); fermerMenu(); menuP.hidden = false; btnP.setAttribute('aria-expanded', 'true'); menuP.querySelector('button')?.focus(); });
  menuP.addEventListener('click', e => { if (e.target.closest('button')) setTimeout(fermerPlus, 0); });
  document.addEventListener('click', e => { if (!menuP.hidden && !menuP.contains(e.target) && e.target !== btnP) fermerPlus(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !menuP.hidden) { fermerPlus(); btnP.focus(); } });
  $('#btnPres').addEventListener('click', () => presentation());
  $('#pres').addEventListener('click', () => finPresentation($('#btnRadio').getAttribute('aria-pressed') === 'true'));
  window.addEventListener('keydown', e => { if (PRES.actif && e.key === 'Escape') finPresentation($('#btnRadio').getAttribute('aria-pressed') === 'true'); });
}
