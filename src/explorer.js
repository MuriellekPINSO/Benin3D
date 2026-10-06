import * as THREE from 'three';
import { dureeVisite, musiqueVisite, radio } from './audio.js';
import { $ } from './base.js';
import { PLACES } from './donnees-lieux.js';
import { E } from './etat.js';
import { startFlight } from './interface.js';
import { camera, controls } from './scene.js';

// ---------- Explorer : catégories, radio, présentation ----------
export const CATS = { hotel: 'Hôtels', monument: 'Monuments', institution: 'Monuments', culte: 'Monuments', marche: 'Marchés', eau: 'Mer et lagune', plage: 'Mer et lagune', transport: 'Transport', savoir: 'Savoir', quartier: 'Quartiers' };
export const catDe = p => p.id === 'stade' ? 'Sport' : CATS[p.k] || 'Autres';
export let filtre = 'Tout';
export function initCategories() {
  const el = $('#chips'); if (!el) return;
  const noms = ['Tout', ...new Set(PLACES.map(catDe))];
  el.innerHTML = noms.map(n => `<button type="button" class="chip" data-c="${n}" aria-pressed="${n === 'Tout'}">${n}<span>${n === 'Tout' ? PLACES.length : PLACES.filter(p => catDe(p) === n).length}</span></button>`).join('');
  el.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { filtre = b.dataset.c; el.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); appliquerFiltre(); }));
}
export function appliquerFiltre() { for (const p of PLACES) { const ok = filtre === 'Tout' || catDe(p) === filtre; p.btn.parentElement.hidden = !ok; if (p.label) p.label.style.display = ok ? '' : 'none'; } }
export const PRES = { actif: false };
export const attendre = ms => new Promise(r => setTimeout(r, ms));
export const finVol = () => new Promise(r => { const chk = () => (!E.flight || !PRES.actif) ? r() : requestAnimationFrame(chk); chk(); });
export async function presentation() {
  if (PRES.actif) return; PRES.actif = true;
  const app = document.getElementById('app'); app.classList.add('mode-pres'); $('#pres').hidden = false;
  const titre = (h, p) => { const t = $('#presTitre'), s = $('#presSous'); t.textContent = h; s.textContent = p; const box = $('#pres .pres-titre'); box.classList.remove('on'); void box.offsetWidth; box.classList.add('on'); };
  // La radio s'efface : la visite se fait sur « Agolo » d'Angélique Kidjo.
  const ancien = $('#btnRadio').getAttribute('aria-pressed') === 'true'; if (ancien) await radio(false);
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
  for (const id of seq) {
    if (!PRES.actif) break;
    const p = PLACES.find(q => q.id === id); if (!p) continue;
    titre(p.name, p.kind);
    const [d, phi, th] = p.view; startFlight(new THREE.Vector3(p.x, 0, p.z), d, phi, th, id === 'porte' ? 4.5 : 3.2); await finVol();
    controls.autoRotate = true; controls.autoRotateSpeed = -.9; await attendre(pause); controls.autoRotate = false;
  }
  if (PRES.actif) { titre('LE BÉNIN EN 3D', 'Explore les villes · joue dans leurs rues'); startFlight(centre.clone(), 13000, .9, .9, 4); await finVol(); await attendre(3500); }
  finPresentation(ancien);
}
export function finPresentation(remettreRadio) {
  if (!PRES.actif) return; PRES.actif = false; controls.autoRotate = $('#togTour').getAttribute('aria-pressed') === 'true'; controls.autoRotateSpeed = -.35;
  document.getElementById('app').classList.remove('mode-pres'); $('#pres').hidden = true;
  musiqueVisite(false);
  if (remettreRadio) radio(true);
}
export function initExplorer() {
  initCategories();
  $('#btnRadio').addEventListener('click', async e => { const b = e.currentTarget, on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); const ok = await radio(on); if (on && !ok) b.setAttribute('aria-pressed', 'false'); });
  $('#btnPres').addEventListener('click', () => presentation());
  $('#pres').addEventListener('click', () => finPresentation($('#btnRadio').getAttribute('aria-pressed') === 'true'));
  window.addEventListener('keydown', e => { if (PRES.actif && e.key === 'Escape') finPresentation($('#btnRadio').getAttribute('aria-pressed') === 'true'); });
}
