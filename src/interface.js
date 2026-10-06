import * as THREE from 'three';
import { setMood } from './ambiances.js';
import { $, fmtLL, reduceMotion, small, toXZ } from './base.js';
import { KCOL, PLACES, QUARTIERS, WATER_LABELS } from './donnees-lieux.js';
import { E } from './etat.js';
import { camera, controls } from './scene.js';
import { initVoirEnVrai } from './google.js';
import { basculerMondeReel, maquetteVisible } from './monde-reel.js';
import { etalPres, ouvrirBoutique, sitesAvecEtal } from './artisans.js';
import { changerMeteo } from './meteo.js';
import { basculerSatellite } from './satellite.js';

// ---------- Étiquettes ----------
export const labelsEl = $('#labels');
export const labels = [];
export function addLabel(el, x, y, z, prio, kind) { labelsEl.appendChild(el); labels.push({ el, pos: new THREE.Vector3(x, y, z), prio, kind, w: 0, h: 0, shown: false }); }
export function buildLabels() {
  PLACES.forEach((p, i) => {
    const [x, z] = toXZ(p.lat, p.lon); p.x = x; p.z = z;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'lbl lbl-place'; b.tabIndex = -1;
    b.style.setProperty('--k', KCOL[p.k]);
    b.innerHTML = `<span class="pill"><span class="dot"></span>${p.name}</span><span class="stem"></span>`;
    b.addEventListener('click', () => select(p));
    p.label = b; addLabel(b, x, p.h, z, 100 - i, 'p');
  });
  for (const [n, la, lo] of WATER_LABELS) { const [x, z] = toXZ(la, lo); const d = document.createElement('div'); d.className = 'lbl lbl-water'; d.textContent = n; addLabel(d, x, 0, z, 20, 'w'); }
  for (const [n, la, lo] of QUARTIERS) { const [x, z] = toXZ(la, lo); const d = document.createElement('div'); d.className = 'lbl lbl-q'; d.textContent = n; addLabel(d, x, 4, z, 10, 'q'); }
  labels.sort((a, b) => b.prio - a.prio);
  const measure = () => { for (const L of labels) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; } };
  measure(); document.fonts?.ready.then(measure);
}
export const vtmp = new THREE.Vector3();
export let obstacles = [];
export function measureObstacles() {
  const app = $('#app').getBoundingClientRect();
  obstacles = [...document.querySelectorAll('.brand, .places, .hud, .dock, .credits, .card')].filter(e => !e.hidden && e.offsetParent !== null)
    .map(e => { const r = e.getBoundingClientRect(); return [r.left - app.left, r.top - app.top, r.right - app.left, r.bottom - app.top]; })
    .filter(r => r[2] - r[0] > 0 && r[3] - r[1] > 0);
  if (small) { const pl = $('#placeList').getBoundingClientRect(); obstacles.push([0, pl.top - app.top, app.width, pl.bottom - app.top]); }
}
export function updateLabels(dist, W, H) {
  if (E.frameN % 20 === 1) measureObstacles();
  const placed = obstacles.slice();
  for (const L of labels) {
    let show = true;
    if (L.kind === 'q' && (!E.showQ || dist > 6500)) show = false;
    if (L.kind === 'w' && dist < 900) show = false;
    let sx = 0, sy = 0;
    if (show) {
      vtmp.copy(L.pos).project(camera);
      if (vtmp.z > 1 || vtmp.x < -1.15 || vtmp.x > 1.15 || vtmp.y < -1.15 || vtmp.y > 1.15) show = false;
      else {
        sx = (vtmp.x * 0.5 + 0.5) * W; sy = (-vtmp.y * 0.5 + 0.5) * H;
        const anchorY = L.kind === 'p' ? 1 : 0.5;
        const r = [sx - L.w / 2 - 4, sy - L.h * anchorY - 3, sx + L.w / 2 + 4, sy + L.h * (1 - anchorY) + 3];
        const isSel = E.selected && L.el === E.selected.label;
        if (!isSel && placed.some(o => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])) show = false;
        else { placed.push(r); L.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, ${L.kind === 'p' ? '-100%' : '-50%'})`; }
      }
    }
    if (show !== L.shown) { L.shown = show; L.el.classList.toggle('on', show); L.el.classList.toggle('off', !show); }
  }
}

// ---------- Interface ----------
export const list = $('#placeList');
for (const p of PLACES) {
  const li = document.createElement('li');
  const b = document.createElement('button'); b.type = 'button'; b.className = 'place-btn'; b.setAttribute('aria-pressed', 'false');
  b.style.setProperty('--k', KCOL[p.k]);
  b.innerHTML = `<span class="dot"></span><span class="nm">${p.name}</span><span class="kd">${p.kind}</span>`;
  b.addEventListener('click', () => select(p));
  p.btn = b; li.appendChild(b); list.appendChild(li);
}
export const card = $('#card');
export function select(p) {
  E.selected = p;
  for (const q of PLACES) { q.btn.setAttribute('aria-pressed', String(q === p)); q.label?.classList.toggle('sel', q === p); }
  $('#cardKind').textContent = p.kind; $('#cardName').textContent = p.name; $('#cardText').textContent = p.text;
  $('#cardDot').style.setProperty('--k', KCOL[p.k]);
  $('#cardCoords').textContent = fmtLL(p.x ?? toXZ(p.lat, p.lon)[0], p.z ?? toXZ(p.lat, p.lon)[1]);
  $('#cardMarche').hidden = !sitesAvecEtal().has(p.id);
  card.hidden = false; document.dispatchEvent(new Event('lieu-choisi'));
  p.btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  flyTo(p.x, p.z, p.view);
}
$('#cardClose').addEventListener('click', () => { card.hidden = true; E.selected = null; for (const q of PLACES) { q.btn.setAttribute('aria-pressed', 'false'); q.label?.classList.remove('sel'); } });
$('#cardGo').addEventListener('click', () => E.selected && flyTo(E.selected.x, E.selected.z, E.selected.view));
// Marché artisanal : on vole jusqu'à l'étal, puis la vendeuse accueille.
$('#cardMarche').addEventListener('click', () => {
  const p = E.selected; if (!p) return; const e = etalPres(p.x, p.z, 400); if (!e) return;
  const c = e.lieu.userData.centre; flyTo(c.x, c.z, [26, 1.18, -e.lieu.rotation.y + Math.PI * .1]);
  setTimeout(() => ouvrirBoutique(e), 1400);
});
document.querySelectorAll('[data-mood]').forEach(b => b.addEventListener('click', () => setMood(b.dataset.mood)));
export const toggle = (id, fn) => { const b = $(id); b.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); fn(on); }); };
toggle('#togZem', on => { E.zemOn = on; });
const erreurGoogle = msg => { const n = $('#googleErreur'); n.textContent = msg; n.hidden = false; setTimeout(() => { n.hidden = true; }, 7000); };
toggle('#togGoogle', async on => {
  try { localStorage.setItem('cotonou3d.vueReelle', on ? '1' : '0'); } catch { }
  const err = await basculerMondeReel(on); if (err) { $('#togGoogle').setAttribute('aria-pressed', 'false'); erreurGoogle(`Vue réelle indisponible : ${err}`); }
});
toggle('#togMaquette', on => maquetteVisible(on));
toggle('#togSat', async on => { const err = await basculerSatellite(on); if (err) { $('#togSat').setAttribute('aria-pressed', 'false'); erreurGoogle(`Sol satellite indisponible : ${err}`); } });
initVoirEnVrai(() => E.selected);
toggle('#togQ', on => { E.showQ = on; });
$('#togMeteo').addEventListener('click', () => changerMeteo());
window.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'm' && !e.target.closest?.('input, textarea')) changerMeteo(); });
toggle('#togTour', on => { controls.autoRotate = on; });
$('#compass').addEventListener('click', () => { const t = controls.target; const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(t)); startFlight(t.clone(), sph.radius, sph.phi, 0); });

// ---------- Caméra : vols ----------
export const sph = new THREE.Spherical();
export function startFlight(target, radius, phi, theta, dur = 1.8) {
  sph.setFromVector3(camera.position.clone().sub(controls.target));
  let dTheta = theta - sph.theta; dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
  const from = { t: controls.target.clone(), r: sph.radius, phi: sph.phi, theta: sph.theta };
  const hop = from.t.distanceTo(target);
  if (reduceMotion) dur = 0.001;
  E.flight = { from, to: { t: target, r: radius, phi, theta: from.theta + dTheta }, t0: performance.now(), dur: dur * 1000, lift: Math.min(1.2, hop / Math.max(radius, from.r) * 0.6) };
}
export function flyTo(x, z, [d, phi, theta]) {
  startFlight(new THREE.Vector3(x, 0, z), d, phi, theta, 2.2);
}
export const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export function updateFlight(now) {
  if (!E.flight) return;
  let t = Math.min(1, (now - E.flight.t0) / E.flight.dur); const e = ease(t);
  const a = E.flight.from, b = E.flight.to;
  controls.target.lerpVectors(a.t, b.t, e);
  const r = Math.exp(Math.log(a.r) + (Math.log(b.r) - Math.log(a.r)) * e) * (1 + E.flight.lift * Math.sin(Math.PI * e));
  sph.set(r, a.phi + (b.phi - a.phi) * e, a.theta + (b.theta - a.theta) * e);
  camera.position.setFromSpherical(sph).add(controls.target);
  camera.lookAt(controls.target);
  if (t >= 1) E.flight = null;
}
controls.addEventListener('start', () => { E.flight = null; });

// ---------- HUD ----------
export const needle = $('#needle'), scaleBar = $('#scaleBar'), scaleTxt = $('#scaleTxt'), coordsEl = $('#coords'), clockEl = $('#clock');
export const clockFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Porto-Novo', hour: '2-digit', minute: '2-digit' });
export function updateHud(dist, H) {
  needle.style.transform = `rotate(${(controls.getAzimuthalAngle() * 180 / Math.PI).toFixed(1)}deg)`;
  const mpp = 2 * dist * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, H);
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  const target = (small ? 50 : 80) * mpp; let best = steps[0]; for (const s of steps) if (s <= target * 1.4) best = s;
  scaleBar.style.width = (best / mpp).toFixed(0) + 'px';
  scaleTxt.textContent = best >= 1000 ? `${best / 1000} km` : `${best} m`;
  coordsEl.textContent = fmtLL(controls.target.x, controls.target.z);
  clockEl.textContent = 'Heure de Cotonou ' + clockFmt.format(new Date());
}

