import { AUDIO, audioCtx } from './audio.js';
import { JEU } from './jeu.js';

// ---------- Musique selon la zone (Zém Run) ----------
// Cahier des charges de Schekina, priorité 2 : la bande-son change selon le quartier traversé.
// Pour éviter tout problème de droits, la musique est composée à la volée par le jeu (Web Audio) :
// chaque zone a son tempo, sa gamme, ses percussions et son instrument ; on passe de l'une à
// l'autre en fondu. Rien n'est enregistré : ce sont des motifs originaux, joués par des oscillateurs.

// Motifs sur 16 doubles-croches (1 = coup). basse : degrés de la gamme (null = silence).
const AMB = {
  ville:  { bpm: 108, gamme: [0, 2, 4, 7, 9], tonique: 196, kick: '1000100010001000', shaker: '0111011101110111', cloche: '1001001000101000', basse: [0, null, null, 0, null, 4, null, 3], lead: 'triangle', densite: .3, pad: false },
  marina: { bpm: 92, gamme: [0, 2, 4, 7, 9], tonique: 220, kick: '1000000010000000', shaker: '0010001000100010', cloche: '0000000000000000', basse: [0, null, null, null, 3, null, null, null], lead: 'sine', densite: .22, pad: true },
  marche: { bpm: 126, gamme: [0, 3, 5, 7, 10], tonique: 185, kick: '1000101010001010', shaker: '1111111111111111', cloche: '1011010110110101', basse: [0, null, 0, null, 3, null, 4, null], lead: 'square', densite: .35, pad: false },
  plage:  { bpm: 96, gamme: [0, 2, 4, 7, 9], tonique: 233, kick: '1000000010000000', shaker: '0101010101010101', cloche: '0000100000001000', basse: [0, null, null, 4, null, null, 3, null], lead: 'sine', densite: .25, pad: true },
  calavi: { bpm: 116, gamme: [0, 2, 4, 5, 7, 9], tonique: 208, kick: '1000100010001000', shaker: '0010001000100010', cloche: '1010110101101010', basse: [0, null, 2, null, 4, null, 5, null], lead: 'triangle', densite: .4, pad: false },
  concert: { bpm: 118, gamme: [0, 2, 3, 5, 7, 10], tonique: 196, kick: '1000100010001000', shaker: '0110011101100111', cloche: '1001010010010100', basse: [0, null, 0, 3, null, 5, null, 3], lead: 'square', densite: .5, pad: true },
  ouidah: { bpm: 100, gamme: [0, 3, 5, 7, 10], tonique: 165, kick: '1001001010010010', shaker: '0000000000000000', cloche: '1010110101101010', basse: [0, null, null, null, null, null, null, null], lead: null, densite: 0, pad: false, tom: '0010010001001001' },
};
const ZONES = [
  ['marina', /Cocotiers|Cadjèhoun|Haie|Marina|Fidjrossè.*Plage/i],
  ['marche', /Missèbo|Ganhi|Zogbo|Sainte-Rita|Gbégamey|Jonquet|Placodji|Dantokpa|Midombo|Tokplégbé/i],
  ['plage', /Fidjrossè|Akpakpa|Agla|Donaten|Avotrou|Houéyiho/i],
  ['calavi', /Calavi|Godomey|Zogbadjè|Togoudo|Kpota|Aïbatin|Fifadji|Vossa|Ladji|Mènontin|Kouhounou|Gbèdjromèdé/i],
  ['ouidah', /Ouidah|Zoungbodji/i],
];
export const zoneDe = quartier => (ZONES.find(([, r]) => r.test(quartier || '')) || ['ville'])[0];

const M = { actif: false, force: false, zone: 'ville', amb: AMB.ville, pas: 0, prochain: 0, minuteur: 0, maitre: null, bruit: null, accord: 0 };
function bruit(ctx) { if (!M.bruit) { const b = ctx.createBuffer(1, ctx.sampleRate * .5, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; M.bruit = b; } return M.bruit; }
const freq = (amb, degre, octave = 0) => { const g = amb.gamme, n = g.length, o = Math.floor(degre / n), k = ((degre % n) + n) % n; return amb.tonique * 2 ** ((g[k] + 12 * (o + octave)) / 12); };
function note(ctx, t, { type = 'sine', f, f2, dur, vol, filtre }) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  let fin = g; if (filtre) { const b = ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = filtre; g.connect(b); fin = b; }
  o.connect(g); fin.connect(M.maitre); o.start(t); o.stop(t + dur + .05);
}
function shaker(ctx, t, vol) {
  const s = ctx.createBufferSource(), h = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = bruit(ctx); h.type = 'highpass'; h.frequency.value = 6500;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + .05); s.connect(h).connect(g).connect(M.maitre); s.start(t, Math.random() * .4); s.stop(t + .07);
}
// Joue la double-croche `k` de la mesure à l'instant `t`.
function jouer(ctx, t, k) {
  const a = M.amb, dc = 60 / a.bpm / 4, on = (motif, i) => motif && motif[i] === '1';
  if (on(a.kick, k)) note(ctx, t, { f: 120, f2: 42, dur: .18, vol: .5 });
  if (on(a.tom, k)) note(ctx, t, { f: 190, f2: 120, dur: .16, vol: .32 });
  if (on(a.shaker, k)) shaker(ctx, t, k % 4 === 2 ? .07 : .045);
  if (on(a.cloche, k)) note(ctx, t, { type: 'triangle', f: k % 3 ? 980 : 1320, dur: .08, vol: .05 });
  const b = a.basse[k >> 1]; if (k % 2 === 0 && b !== null && b !== undefined) note(ctx, t, { type: 'triangle', f: freq(a, b, -2), dur: dc * 1.8, vol: .22, filtre: 600 });
  if (a.lead && k % 2 === 0 && Math.random() < a.densite) { M.accord = Math.max(0, Math.min(9, M.accord + Math.floor(Math.random() * 5) - 2)); note(ctx, t, { type: a.lead, f: freq(a, M.accord, 0), dur: dc * 1.6, vol: a.lead === 'square' ? .025 : .05, filtre: 2400 }); }
  if (a.pad && k === 0) for (const d of [0, 2, 4]) note(ctx, t, { type: 'sawtooth', f: freq(a, d + (M.pas >> 4) % 2, -1), dur: dc * 15, vol: .018, filtre: 800 });
}
function programmer() {
  const ctx = AUDIO.ctx; if (!ctx || !M.maitre) return;
  const muet = AUDIO.muet || (!M.force && (AUDIO.radio || !JEU.actif || JEU.pause || JEU.fini));
  M.maitre.gain.setTargetAtTime(muet ? 0 : .5, ctx.currentTime, .3);
  if (muet) { M.prochain = ctx.currentTime + .1; return; }
  if (M.prochain < ctx.currentTime) M.prochain = ctx.currentTime + .05;
  const dc = 60 / M.amb.bpm / 4;
  while (M.prochain < ctx.currentTime + .15) { jouer(ctx, M.prochain, M.pas % 16); M.pas++; M.prochain += dc; }
}
/** Lance la musique (au départ d'une course). */
export function demarrerMusique() {
  const ctx = audioCtx(); if (!ctx || M.actif) return;
  M.maitre = ctx.createGain(); M.maitre.gain.value = 0; M.maitre.connect(ctx.destination);
  M.actif = true; M.prochain = ctx.currentTime + .2; M.minuteur = setInterval(programmer, 25);
}
/** Arrête la musique (fin de course, retour à la ville). */
export function arreterMusique() {
  if (!M.actif) return; M.actif = false; clearInterval(M.minuteur);
  const ctx = AUDIO.ctx, m = M.maitre; if (ctx && m) { m.gain.setTargetAtTime(0, ctx.currentTime, .2); setTimeout(() => m.disconnect(), 1500); }
  M.maitre = null;
}
/** Change d'ambiance quand on change de quartier (fondu par le volume général). */
export function musiqueQuartier(quartier) {
  const z = zoneDe(quartier); if (z === M.zone) return z;
  M.zone = z; const ctx = AUDIO.ctx;
  if (ctx && M.maitre) { M.maitre.gain.cancelScheduledValues(ctx.currentTime); M.maitre.gain.setTargetAtTime(0, ctx.currentTime, .25); }
  setTimeout(() => { M.amb = AMB[z]; M.pas = 0; }, 900); // la nouvelle ambiance remonte avec programmer()
  return z;
}
export const NOMS_ZONES = { ville: 'Ville', marina: 'Marina', marche: 'Marchés', plage: 'Bord de mer', calavi: 'Calavi', ouidah: 'Ouidah' };
/** Concert de l'événement (hors course) : ambiance « concert » jouée même sans partie en cours. */
export function musiqueEvenement(on) {
  if (on) { M.force = true; demarrerMusique(); M.amb = AMB.concert; M.zone = 'concert'; M.pas = 0; }
  else { M.force = false; arreterMusique(); M.zone = 'ville'; M.amb = AMB.ville; }
}
/** Musique jouée hors course (démonstration, vidéo de présentation) : l'ambiance `zone`, ou null pour l'arrêter. */
export function musiqueForcee(zone) {
  if (zone) { M.force = true; demarrerMusique(); if (M.zone !== zone) { M.amb = AMB[zone] || AMB.ville; M.zone = zone; M.pas = 0; } }
  else { M.force = false; arreterMusique(); M.zone = 'ville'; M.amb = AMB.ville; }
}
