import * as THREE from 'three';
import { $, LITE, reduceMotion } from './base.js';
import { AUDIO, audioCtx } from './audio.js';
import { camera, controls, hemi, renderer, scene, skyMat, sun } from './scene.js';

// ---------- Météo : nuages, pluie tropicale, orage ----------
// Reprise de 3D monde (Meteo.ts) à l'échelle de la ville : un ciel qui se couvre (couverture
// de 0 à 1), des nuages au-dessus de la ville, une averse en traits obliques autour de la
// caméra (et un voile de pluie quand on la regarde de haut), des éclairs et le tonnerre
// de synthèse, sans fichier son.

export const MODES = ['soleil', 'nuages', 'pluie', 'orage'];
const NOMS = { soleil: 'Soleil', nuages: 'Nuageux', pluie: 'Pluie', orage: 'Orage' };
export const METEO = { mode: 'soleil', couverture: 0, pluie: 0, flash: 0, prochainEclair: 6, nuages: null, gouttes: null, voile: null, son: null };
const GRIS = new THREE.Color('#9aa3a8'), GRIS_HORIZON = new THREE.Color('#b7bec0'), SOMBRE = new THREE.Color('#5d666b'), BLANC = new THREE.Color('#ffffff');

// --- Nuages : des panneaux tournés vers la caméra, texture douce dessinée une fois ---
function texNuage() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 60 + Math.random() * 136, y = 90 + Math.random() * 70, r = 26 + Math.random() * 46, g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.6, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function creerNuages() {
  const n = LITE ? 70 : 140, tex = texNuage(), g = new THREE.Group(); g.name = 'nuages';
  for (let i = 0; i < n; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m), taille = 900 + Math.random() * 1500;
    s.scale.set(taille * 1.8, taille * .7, 1);
    s.userData = { x: (Math.random() - .5) * 26000, z: (Math.random() - .5) * 26000, y: 1100 + Math.random() * 900, base: .55 + Math.random() * .4 };
    s.renderOrder = 30; g.add(s);
  }
  scene.add(g); return g;
}
// --- Pluie près de la caméra : traits obliques ---
const N_GOUTTES = LITE ? 900 : 2200, BOITE = 70;
function creerGouttes() {
  const pos = new Float32Array(N_GOUTTES * 6);
  for (let i = 0; i < N_GOUTTES; i++) { const x = (Math.random() - .5) * BOITE * 2, y = Math.random() * BOITE, z = (Math.random() - .5) * BOITE * 2; pos.set([x, y, z, x - .15, y - 1.3, z + .2], i * 6); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c9dde4', transparent: true, opacity: .55, depthWrite: false }));
  l.frustumCulled = false; l.visible = false; l.renderOrder = 31; scene.add(l); return l;
}
// --- Voile de pluie en 2D, pour les vues hautes ---
function creerVoile() {
  const cv = document.createElement('canvas'); cv.className = 'voile-pluie'; cv.setAttribute('aria-hidden', 'true');
  $('#app').insertBefore(cv, $('#scene').nextSibling); return cv;
}
function dessinerVoile(dt, force) {
  const cv = METEO.voile; if (!cv) return;
  cv.style.opacity = force.toFixed(2); if (force < .02) return;
  const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== w) cv.width = w; if (cv.height !== h) cv.height = h;
  const c = cv.getContext('2d'); c.clearRect(0, 0, w, h); c.strokeStyle = 'rgba(220,232,236,.5)'; c.lineWidth = 1;
  c.beginPath(); const n = Math.round(w * h / 2600);
  for (let i = 0; i < n; i++) { const x = Math.random() * w, y = Math.random() * h, l = 10 + Math.random() * 18; c.moveTo(x, y); c.lineTo(x - l * .25, y + l); }
  c.stroke();
}
// --- Sons : averse (bruit filtré en continu) et tonnerre ---
function bruit(ctx, duree) { const b = ctx.createBuffer(1, ctx.sampleRate * duree, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
function sonPluie(volume) {
  const ctx = AUDIO.ctx; if (!ctx) return;
  if (!METEO.son) {
    const src = ctx.createBufferSource(); src.buffer = bruit(ctx, 2); src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = .5;
    const g = ctx.createGain(); g.gain.value = 0; src.connect(f).connect(g).connect(ctx.destination); src.start(); METEO.son = g;
  }
  METEO.son.gain.setTargetAtTime(AUDIO.muet ? 0 : volume, ctx.currentTime, .4);
}
function tonnerre(force) {
  const ctx = AUDIO.ctx; if (!ctx || AUDIO.muet) return; const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = bruit(ctx, 4);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(90, t + 3.2);
  const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.55 * force, t + .08); g.gain.exponentialRampToValueAtTime(.18 * force, t + .6); g.gain.exponentialRampToValueAtTime(.0001, t + 3.8);
  src.connect(f).connect(g).connect(ctx.destination); src.start(); src.stop(t + 4);
}

/** Change de temps : soleil → nuages → pluie → orage, ou le mode demandé. */
export function changerMeteo(mode) {
  METEO.mode = mode || MODES[(MODES.indexOf(METEO.mode) + 1) % MODES.length];
  if (!METEO.nuages) { METEO.nuages = creerNuages(); METEO.gouttes = creerGouttes(); METEO.voile = creerVoile(); }
  if (METEO.mode !== 'soleil') audioCtx();
  const b = $('#togMeteo'); if (b) { b.setAttribute('aria-pressed', String(METEO.mode !== 'soleil')); b.querySelector('.t-long').textContent = NOMS[METEO.mode]; }
  try { localStorage.setItem('cotonou3d.meteo', METEO.mode); } catch { }
  return METEO.mode;
}

const v = new THREE.Vector3();
/** À appeler après les ambiances (jour, soir, nuit), avant le rendu. */
export function majMeteo(dt) {
  if (!METEO.nuages) return;
  const M = METEO, cible = { soleil: 0, nuages: .55, pluie: .9, orage: 1 }[M.mode], pluieCible = M.mode === 'pluie' ? .8 : M.mode === 'orage' ? 1 : 0;
  const k = reduceMotion ? 1 : 1 - Math.exp(-dt * .5);
  M.couverture += (cible - M.couverture) * k; M.pluie += (pluieCible - M.pluie) * k;
  const cov = M.couverture;
  // Ciel, brume, lumière : on part de l'ambiance du moment et on la voile de gris.
  const U2 = skyMat.uniforms;
  U2.uTop.value.lerp(M.mode === 'orage' ? SOMBRE : GRIS, cov * .85); U2.uHorizon.value.lerp(GRIS_HORIZON, cov * .8); U2.uGlow.value *= 1 - cov;
  scene.fog.color.lerp(GRIS_HORIZON, cov * .75);
  scene.fog.near *= 1 - .55 * M.pluie; scene.fog.far *= 1 - .5 * M.pluie;
  sun.intensity *= 1 - .72 * cov; hemi.intensity *= 1 - .18 * cov; sun.shadow.intensity = 1 - .7 * cov;
  renderer.toneMappingExposure *= 1 - .08 * M.pluie;
  // Éclairs (orage) : trois pulsations rapides, puis le tonnerre un peu plus tard.
  if (M.mode === 'orage' && M.pluie > .6) {
    M.prochainEclair -= dt;
    if (M.prochainEclair <= 0) { M.flash = 1; M.prochainEclair = 5 + Math.random() * 10; const r = .3 + Math.random() * 1.2; setTimeout(() => tonnerre(1 - r / 2), r * 1000); }
  }
  if (M.flash > 0) {
    M.flash = Math.max(0, M.flash - dt * 3); const f = M.flash > .66 || (M.flash > .2 && M.flash < .4) ? M.flash : M.flash * .3;
    hemi.intensity += f * 3; U2.uTop.value.lerp(BLANC, f * .5); U2.uHorizon.value.lerp(BLANC, f * .5); scene.fog.color.lerp(BLANC, f * .3);
  }
  // Nuages : dérive lente autour du point visé, plus nombreux et plus gris quand ça se couvre.
  const t = controls.target, haut = camera.position.y;
  for (const [i, s] of M.nuages.children.entries()) {
    const u = s.userData; u.x += dt * 9; if (u.x > 13000) u.x -= 26000;
    s.position.set(t.x + u.x, u.y, t.z + u.z);
    const vis = i / M.nuages.children.length < .25 + cov * .75 ? 1 : 0;
    s.material.opacity += ((vis * u.base * Math.min(1, .25 + cov) * (haut > u.y ? .55 : 1)) - s.material.opacity) * Math.min(1, dt * 1.5);
    s.material.color.copy(BLANC).lerp(M.mode === 'orage' ? SOMBRE : GRIS, cov * .7);
  }
  M.nuages.visible = cov > .01 || M.nuages.children[0].material.opacity > .01;
  // Pluie : traits 3D près de la caméra quand on est bas, voile 2D quand on est haut.
  const g = M.gouttes, bas = M.pluie > .02 && haut < 220;
  g.visible = bas;
  if (bas) {
    camera.getWorldDirection(v); g.position.set(camera.position.x + v.x * 30, Math.max(0, camera.position.y - BOITE * .5), camera.position.z + v.z * 30);
    const p = g.geometry.attributes.position.array, vit = 34 * dt, n = Math.floor(N_GOUTTES * M.pluie);
    for (let i = 0; i < N_GOUTTES; i++) {
      const o = i * 6;
      if (i >= n) { p[o + 1] = p[o + 4] = -999; continue; }
      p[o + 1] -= vit; p[o] += vit * .1;
      if (p[o + 1] < 0 || p[o + 1] > BOITE + 2) { p[o] = (Math.random() - .5) * BOITE * 2; p[o + 1] = BOITE * (.6 + Math.random() * .4); p[o + 2] = (Math.random() - .5) * BOITE * 2; }
      p[o + 3] = p[o] - .15; p[o + 4] = p[o + 1] - 1.3; p[o + 5] = p[o + 2] + .2;
    }
    g.geometry.attributes.position.needsUpdate = true;
  }
  dessinerVoile(dt, M.pluie * Math.min(1, Math.max(0, (haut - 120) / 300)) * .8);
  sonPluie(M.pluie * .12);
}
