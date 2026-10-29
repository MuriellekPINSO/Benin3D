import * as THREE from 'three';
import { majPortesDeNuit } from './interieurs.js';
import { reduceMotion } from './base.js';
import { E } from './etat.js';
import { U, hemi, renderer, scene, skyMat, sun } from './scene.js';

// ---------- Ambiances ----------
export const MOODS = {
  jour: { el: 50, az: 238, sun: '#fff1dc', sunI: 2.9, sky: '#cfe2f2', gnd: '#cbb993', hemiI: 1.25, top: '#3c7cc4', hor: '#d4e3ec', low: '#c9b99a', exp: 1.0, night: 0, glow: 0.25, foam: 1.0 },
  // La fin d'après-midi, comme la « Golden Hour » de Slop New York (mrdoob) : soleil bas et doré, longues ombres, ciel
  // encore bleu en haut et chaud à l'horizon (Murielle, 29/10). De 16 h à 17 h 30 au Bénin, ou au bouton « Fin d'après-midi ».
  doree: { el: 19, az: 252, sun: '#ffcf8a', sunI: 3.1, sky: '#d9cdb8', gnd: '#a8916f', hemiI: 1.0, top: '#4d7fc0', hor: '#f3c894', low: '#b89d7c', exp: 1.04, night: 0.04, glow: 0.75, foam: 0.95 },
  soir: { el: 7, az: 262, sun: '#ffb47a', sunI: 2.2, sky: '#b9b3c9', gnd: '#4a4042', hemiI: 1.05, top: '#2e4677', hor: '#f4a96d', low: '#6d5444', exp: 1.05, night: 0.32, glow: 1.0, foam: 0.85 },
  nuit: { el: 46, az: 140, sun: '#9db4e6', sunI: 0.38, sky: '#2a3d66', gnd: '#0b0e16', hemiI: 0.5, top: '#050914', hor: '#17233c', low: '#0b0f18', exp: 1.15, night: 1, glow: 0, foam: 0.32 },
};
export const colorKeys = ['sun', 'sky', 'gnd', 'top', 'hor', 'low'];
export const toMood = m => { const o = { ...m }; for (const k of colorKeys) o[k] = new THREE.Color(m[k]); return o; };
export let moodCur = toMood(MOODS.jour), moodTgt = toMood(MOODS.jour);

// ---------- L'heure de Cotonou ----------
// « Si je pars sur le site à 13 h, Kutɔnu Vibes doit être ensoleillé ; si je passe le soir, la simulation doit
// être le soir » (Murielle, 25/10). On lit l'heure réelle du Bénin (UTC+1), pas celle du navigateur : un
// visiteur à Paris ou à Montréal doit voir Cotonou telle qu'elle est à ce moment-là, puisque c'est la ville
// qu'on montre. Dès qu'on touche aux boutons Jour / Soir / Nuit, on reprend la main et l'heure n'y touche plus.
const H = { choisi: false, dernier: '' };
/** L'heure de Cotonou, en heures décimales (UTC+1, pas de changement d'heure au Bénin). */
export const heureCotonou = () => { const d = new Date(Date.now() + 3600e3); return d.getUTCHours() + d.getUTCMinutes() / 60; };
/** Le moment du jour qui va avec l'heure : nuit avant 6 h et après 19 h 30, soir de 17 h 30 à 19 h 30, fin d'après-midi de 16 h à 17 h 30. */
export function momentDeLHeure(h = heureCotonou()) { return h < 6 || h >= 19.5 ? 'nuit' : h >= 17.5 ? 'soir' : h >= 16 ? 'doree' : 'jour'; }
/** À appeler régulièrement : suit l'heure de Cotonou, tant que le joueur n'a pas choisi lui-même. */
export function suivreLHeure() {
  if (H.choisi) return;
  const m = momentDeLHeure(); if (m === H.dernier) return;
  H.dernier = m; setMood(m, true);
}
/** Le joueur reprend-il la main ? (pour l'étiquette « à l'heure de Cotonou » de l'interface) */
export const heureAutomatique = () => !H.choisi;

export function setMood(name, parLHeure = false) {
  if (!parLHeure) H.choisi = true; // un clic sur Jour / Soir / Nuit : on cesse de suivre l'horloge
  moodTgt = toMood(MOODS[name]);
  if (reduceMotion) moodCur = toMood(MOODS[name]);
  document.querySelectorAll('[data-mood]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mood === name)));
  const app = document.getElementById('app'); if (app) app.dataset.moment = name; // la Vue réelle s'assombrit aussi (style.css)
}
export const sunDir = new THREE.Vector3();
export function applyMood(dt) {
  const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 2.2);
  for (const key of ['el', 'az', 'sunI', 'hemiI', 'exp', 'night', 'glow', 'foam']) moodCur[key] += (moodTgt[key] - moodCur[key]) * k;
  for (const key of colorKeys) moodCur[key].lerp(moodTgt[key], k);
  const m = moodCur, el = m.el * Math.PI / 180, az = m.az * Math.PI / 180;
  sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  sun.color.copy(m.sun); sun.intensity = m.sunI;
  hemi.color.copy(m.sky); hemi.groundColor.copy(m.gnd); hemi.intensity = m.hemiI;
  skyMat.uniforms.uTop.value.copy(m.top); skyMat.uniforms.uHorizon.value.copy(m.hor); skyMat.uniforms.uGround.value.copy(m.low);
  skyMat.uniforms.uSunColor.value.copy(m.sun); skyMat.uniforms.uSunDir.value.copy(sunDir); skyMat.uniforms.uGlow.value = m.glow;
  scene.fog.color.copy(m.hor);
  renderer.toneMappingExposure = m.exp;
  U.uNight.value = m.night;
  if (E.foamMat) E.foamMat.uniforms.uBright.value = m.foam;
  if (E.lamps) { E.lamps.material.opacity = Math.min(1, m.night * 1.15); E.lamps.visible = m.night > 0.05; }
  if (E.zems) E.zems.material.emissiveIntensity = m.night * 0.9;
  majPortesDeNuit(m.night); // une ampoule au-dessus de chaque porte (interieurs.js)
  majCiel(m);
}

// ---------- La lumière du ciel : des reflets ----------
// Le ciel du moment, réduit en carte de reflets (PMREM) : les voitures, les vitres, le métal (les matières « Standard »)
// reflètent son bleu, son horizon et son soleil, au lieu de rester mates (« pourquoi sa ville est si réaliste ? »,
// Murielle, 29/10). Refaite quand l'ambiance change, toutes les 2 s au plus pendant la transition, une fois à la fin.
const CIEL = { pmrem: null, scene: null, rt: null, t: -1e9, signe: '' };
function majCiel(m) {
  const t = performance.now(); if (t - CIEL.t < 2000) return;
  const signe = `${m.el.toFixed(0)},${m.az.toFixed(0)},${m.glow.toFixed(2)},${m.top.getHexString()},${m.hor.getHexString()},${m.low.getHexString()},${m.sun.getHexString()}`;
  if (signe === CIEL.signe) return; CIEL.signe = signe; CIEL.t = t;
  CIEL.pmrem ??= new THREE.PMREMGenerator(renderer);
  CIEL.scene ??= (() => { const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat)); return s; })();
  const rt = CIEL.pmrem.fromScene(CIEL.scene, 0, .1, 200); CIEL.rt?.dispose(); CIEL.rt = rt;
  scene.environment = rt.texture; scene.environmentIntensity = .2 + .45 * (1 - m.night);
}

