import * as THREE from 'three';
import { reduceMotion } from './base.js';
import { E } from './etat.js';
import { U, hemi, renderer, scene, skyMat, sun } from './scene.js';

// ---------- Ambiances ----------
export const MOODS = {
  jour: { el: 50, az: 238, sun: '#fff1dc', sunI: 2.9, sky: '#cfe2f2', gnd: '#cbb993', hemiI: 1.25, top: '#3c7cc4', hor: '#d4e3ec', low: '#c9b99a', exp: 1.0, night: 0, glow: 0.25, foam: 1.0 },
  soir: { el: 7, az: 262, sun: '#ffb47a', sunI: 2.2, sky: '#b9b3c9', gnd: '#4a4042', hemiI: 1.05, top: '#2e4677', hor: '#f4a96d', low: '#6d5444', exp: 1.05, night: 0.32, glow: 1.0, foam: 0.85 },
  nuit: { el: 46, az: 140, sun: '#9db4e6', sunI: 0.38, sky: '#2a3d66', gnd: '#0b0e16', hemiI: 0.5, top: '#050914', hor: '#17233c', low: '#0b0f18', exp: 1.15, night: 1, glow: 0, foam: 0.32 },
};
export const colorKeys = ['sun', 'sky', 'gnd', 'top', 'hor', 'low'];
export const toMood = m => { const o = { ...m }; for (const k of colorKeys) o[k] = new THREE.Color(m[k]); return o; };
export let moodCur = toMood(MOODS.jour), moodTgt = toMood(MOODS.jour);
export function setMood(name) {
  moodTgt = toMood(MOODS[name]);
  if (reduceMotion) moodCur = toMood(MOODS[name]);
  document.querySelectorAll('[data-mood]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mood === name)));
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
}

