// ---------- Audio : radio, moteur, effets ----------
export const AUDIO = { ctx: null, buf: null, src: null, radio: false, moteur: null, gainR: null, muet: false };
export function audioCtx() { try { if (!AUDIO.ctx) AUDIO.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (AUDIO.ctx.state === 'suspended') AUDIO.ctx.resume(); } catch (e) { } return AUDIO.ctx; }
export async function radio(on) {
  const ctx = audioCtx(); if (!ctx) return false;
  AUDIO.radio = on;
  if (!on) { try { AUDIO.src?.stop(); } catch (e) { } AUDIO.src = null; return false; }
  try {
    if (!AUDIO.buf) { const res = await fetch(import.meta.env.BASE_URL + 'audio/radio.mp3'); if (!res.ok) return false; AUDIO.buf = await ctx.decodeAudioData(await res.arrayBuffer()); }
    if (AUDIO.src || !AUDIO.radio) return true;
    const src = ctx.createBufferSource(); src.buffer = AUDIO.buf; src.loop = true;
    AUDIO.gainR = ctx.createGain(); AUDIO.gainR.gain.value = .55; src.connect(AUDIO.gainR).connect(ctx.destination); src.start(); AUDIO.src = src; return true;
  } catch (e) { console.warn('radio', e); return false; }
}
// Musique de la visite (mode Présentation) : « Agolo » d'Angélique Kidjo.
const VISITE = { el: null, fondu: 0 };
export function dureeVisite() { const d = VISITE.el?.duration; return Number.isFinite(d) ? d : 248; }
/** Commence à charger le morceau, pour que la visite démarre sans attendre. */
export function prechargerMusique() { if (!VISITE.el) { VISITE.el = new Audio(import.meta.env.BASE_URL + 'audio/agolo.mp3'); VISITE.el.preload = 'auto'; } return VISITE.el; }
export async function musiqueVisite(on) {
  clearInterval(VISITE.fondu);
  if (on) {
    const a = prechargerMusique(); a.currentTime = 0; a.volume = .9;
    try { await a.play(); return true; } catch (e) { console.warn('musique', e); return false; }
  }
  const a = VISITE.el; if (!a || a.paused) return false;
  VISITE.fondu = setInterval(() => { a.volume = Math.max(0, a.volume - .06); if (a.volume <= 0) { clearInterval(VISITE.fondu); a.pause(); } }, 80);
  return false;
}
export function moteur(type) {
  const ctx = audioCtx(); if (!ctx) return;
  moteurStop();
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = type === 'tokpa' ? 420 : 700; g.gain.value = 0;
  o.connect(f); o2.connect(f); f.connect(g).connect(ctx.destination); o.start(); o2.start();
  AUDIO.moteur = { o, o2, g, base: type === 'tokpa' ? 42 : 68, k: type === 'tokpa' ? 2.4 : 4.2 };
}
export function moteurMaj(v, actif) { const m = AUDIO.moteur; if (!m) return; const t = AUDIO.ctx.currentTime; m.o.frequency.setTargetAtTime(m.base + v * m.k, t, .08); m.o2.frequency.setTargetAtTime((m.base + v * m.k) * .5, t, .08); m.g.gain.setTargetAtTime(actif ? .045 : 0, t, .1); }
export function moteurStop() { const m = AUDIO.moteur; if (!m) return; try { m.g.gain.value = 0; m.o.stop(); m.o2.stop(); } catch (e) { } AUDIO.moteur = null; }
export function son(nom, variante) {
  const ctx = AUDIO.ctx; if (!ctx || AUDIO.muet) return; const t = ctx.currentTime;
  const bip = (type, f0, f1, d, v = .12, t0 = 0) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t + t0); o.frequency.exponentialRampToValueAtTime(f1, t + t0 + d); g.gain.setValueAtTime(v, t + t0); g.gain.exponentialRampToValueAtTime(.001, t + t0 + d); o.connect(g).connect(ctx.destination); o.start(t + t0); o.stop(t + t0 + d + .02); };
  if (nom === 'piece') { bip('sine', 1320, 1760, .09, .1); bip('sine', 1760, 2200, .1, .08, .07); }
  else if (nom === 'saut') bip('sine', 300, 700, .18, .1);
  else if (nom === 'klaxon') { // klaxons du garage
    if (variante === 'trompette') { bip('sawtooth', 523, 520, .18, .06); bip('sawtooth', 659, 655, .26, .06, .2); }
    else if (variante === 'sifflet') { bip('sine', 2100, 2250, .12, .08); bip('sine', 2100, 2400, .36, .08, .16); }
    else if (variante === 'tamtam') { bip('sine', 220, 150, .14, .3); bip('sine', 260, 170, .14, .3, .17); bip('sine', 190, 320, .26, .3, .36); }
    else { bip('square', 430, 425, .16, .07); bip('square', 430, 425, .22, .07, .2); }
  }
  else if (nom === 'arret') { bip('triangle', 880, 880, .25, .14); bip('triangle', 1320, 1320, .35, .12, .18); }
  else if (nom === 'bosse') bip('sine', 120, 50, .2, .25);
  else if (nom === 'choc') { const n = ctx.createBufferSource(), b = ctx.createBuffer(1, ctx.sampleRate * .35, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2; n.buffer = b; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = ctx.createGain(); g.gain.value = .5; n.connect(f).connect(g).connect(ctx.destination); n.start(); }
}

