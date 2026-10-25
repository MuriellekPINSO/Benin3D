import { AUDIO } from './audio.js';
import { densiteCirculation } from './circulation.js';
import { fouleProche } from './lieux.js';
import { chantierProche } from './rue.js';
import { chansonActive } from './lecteur.js';

// ---------- Les bruits de la ville autour du joueur (« Vivre à Cotonou ») ----------
// Fabriqués dans le navigateur (Web Audio, aucun fichier) : la rumeur de la circulation et ses klaxons, selon le nombre de
// véhicules proches (circulation.js) ; le vent, plus fort vers la mer ; les coups de marteau et la meuleuse près d'un
// chantier (rue.js) ; le brouhaha des gens près de la foule (lieux.js), des clients d'un commerce et dans les lieux
// publics. Tout suit le bouton Son du jeu (AUDIO.muet).

const A = { pret: false, couches: null, coup: 0, klaxon: 0, meule: 0, voix: 0, t: 0 };
/** Une boucle de bruit de 4 s : blanc, rose (plus doux) ou brun (sourd, la rumeur lointaine). */
function bruitBoucle(ctx, couleur) {
  const n = ctx.sampleRate * 4, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  let l = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (couleur === 'brun') { l = (l + .02 * w) / 1.02; d[i] = l * 3.5; }
    else if (couleur === 'rose') { b0 = .997 * b0 + w * .029; b1 = .985 * b1 + w * .032; b2 = .95 * b2 + w * .048; d[i] = (b0 + b1 + b2 + w * .1) * .9; }
    else d[i] = w;
  }
  const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; return s;
}
function couche(ctx, sortie, couleur, filtre, freq, q) {
  const s = bruitBoucle(ctx, couleur), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = filtre; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0;
  s.connect(f).connect(g).connect(sortie); s.start(); return { s, f, g };
}
function creer() {
  const ctx = AUDIO.ctx; if (!ctx) return false;
  const maitre = ctx.createGain(); maitre.gain.value = 1; maitre.connect(ctx.destination);
  A.couches = {
    maitre,
    circulation: couche(ctx, maitre, 'brun', 'lowpass', 420, .7),
    vent: couche(ctx, maitre, 'rose', 'bandpass', 650, .45),
    foule: couche(ctx, maitre, 'rose', 'bandpass', 950, 1.1),
    // La radio du lieu : un poste qui grésille au fond d'un maquis ou d'un food court. Bande étroite autour de
    // 1,2 kHz — ce qu'il reste d'une chanson passée par un petit haut-parleur. On n'y met pas la vraie radio :
    // elle couperait la musique que le joueur a lancée lui-même, et ce serait un flux de plus à télécharger.
    radio: couche(ctx, maitre, 'rose', 'bandpass', 1200, 6),
  };
  A.pret = true; return true;
}
const vers = (p, v, t = .6) => p.setTargetAtTime(v, AUDIO.ctx.currentTime, t);
/** Un bruit bref : coup de marteau (métallique), klaxon, ou un éclat de voix (une syllabe du brouhaha). */
function bref(type, volume) {
  const ctx = AUDIO.ctx, t = ctx.currentTime, g = ctx.createGain(); g.connect(A.couches.maitre);
  if (type === 'marteau') {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(1900 + Math.random() * 500, t); o.frequency.exponentialRampToValueAtTime(600, t + .06);
    g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.0005, t + .12); o.connect(g); o.start(t); o.stop(t + .14);
  } else if (type === 'klaxon') {
    const f = 380 + Math.random() * 160, d = .12 + Math.random() * .25;
    for (const [k, t0] of [[1, 0], ...(Math.random() < .5 ? [[1, d + .08]] : [])]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * k; const gg = ctx.createGain(); gg.gain.setValueAtTime(0, t + t0); gg.gain.linearRampToValueAtTime(volume, t + t0 + .02); gg.gain.setValueAtTime(volume, t + t0 + d); gg.gain.linearRampToValueAtTime(0, t + t0 + d + .03);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; o.connect(lp).connect(gg).connect(g); o.start(t + t0); o.stop(t + t0 + d + .05);
    }
  } else if (type === 'meuleuse') {
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(2400, t); o.frequency.linearRampToValueAtTime(3100, t + 1.6); lp.type = 'bandpass'; lp.frequency.value = 3000; lp.Q.value = 2;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(volume, t + .25); g.gain.setValueAtTime(volume, t + 1.4); g.gain.linearRampToValueAtTime(0, t + 1.9); o.connect(lp).connect(g); o.start(t); o.stop(t + 2);
  } else if (type === 'voix') { // une syllabe : une voix qui monte ou descend, filtrée comme de loin
    const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), f0 = 150 + Math.random() * 180, d = .12 + Math.random() * .22;
    o.type = 'triangle'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (.85 + Math.random() * .35), t + d);
    bp.type = 'bandpass'; bp.frequency.value = 700 + Math.random() * 600; bp.Q.value = 1.5;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(volume, t + .03); g.gain.linearRampToValueAtTime(0, t + d); o.connect(bp).connect(g); o.start(t); o.stop(t + d + .02);
  }
  setTimeout(() => g.disconnect(), 2500);
}

/**
 * À chaque image du salon. `ou` : { x, z, dedans (dans une pièce), public (pièce ouverte à tous : food court, agence…),
 * clients (gens qui parlent à côté : commerces) } ; null quand le salon est fermé.
 */
export function majAmbianceSalon(dt, ou) {
  if (!AUDIO.ctx) return;
  if (!A.pret && (!ou || !creer())) return;
  const C = A.couches, muet = AUDIO.muet || !ou || AUDIO.ctx.state !== 'running';
  A.t -= dt; if (A.t > 0 && !muet) { evenements(dt, ou); return; } A.t = .25; // les volumes, quatre fois par seconde
  if (muet) { for (const k of ['circulation', 'vent', 'foule', 'radio']) vers(C[k].g.gain, 0, .3); return; }
  const dedans = ou.dedans, trafic = dedans ? 0 : densiteCirculation(ou.x, ou.z, 70), mer = Math.min(1, Math.max(0, (ou.z - 2050) / 350)); // la côte, au sud de la ville
  const gens = dedans ? (ou.public ? 14 : 0) : fouleProche(ou.x, ou.z, 30) + (ou.clients || 0) * 3;
  A.trafic = trafic; A.gens = gens; A.chantier = dedans ? Infinity : chantierProche(ou.x, ou.z);
  vers(C.circulation.g.gain, Math.min(.24, trafic * .016) * (dedans ? 0 : 1));
  vers(C.vent.g.gain, dedans ? 0 : .035 + mer * .11); vers(C.vent.f.frequency, 500 + Math.random() * 350, 2);
  vers(C.foule.g.gain, Math.min(.16, gens * .009));
  // « Quand les gens vont à une place publique, ils écoutent la radio de cette place » (Murielle, 25/10). Dans
  // un lieu ouvert à tous — food court, maquis, agence — un poste joue au fond. Elle baisse quand le joueur a
  // mis sa propre musique : chez nous comme à Cotonou, on ne fait pas jouer deux musiques dans la même pièce.
  const sienne = AUDIO.radio || chansonActive() >= 0;
  vers(C.radio.g.gain, dedans && ou.public && !sienne ? .055 : 0, 1.2);
  if (dedans && ou.public && !sienne) vers(C.radio.f.frequency, 950 + Math.random() * 500, 3); // le poste dérive, comme une onde mal calée
  evenements(dt, ou);
}
function evenements(dt, ou) {
  if (ou.dedans && !ou.public) return;
  // Klaxons : plus il y a de monde sur la route, plus souvent.
  A.klaxon -= dt; if (A.klaxon <= 0) { A.klaxon = 3 + Math.random() * Math.max(4, 26 - (A.trafic || 0) * 1.5); if ((A.trafic || 0) > 3) bref('klaxon', Math.min(.05, .012 + A.trafic * .002)); }
  // Chantier à moins de 45 m : coups de marteau en rafales, et la meuleuse de temps en temps.
  const ch = A.chantier ?? Infinity;
  if (ch < 45) {
    const v = .07 * (1 - ch / 45);
    A.coup -= dt; if (A.coup <= 0) { A.coup = Math.random() < .25 ? 1.2 + Math.random() * 2 : .32 + Math.random() * .2; bref('marteau', v); }
    A.meule -= dt; if (A.meule <= 0) { A.meule = 7 + Math.random() * 12; bref('meuleuse', v * .5); }
  }
  // Brouhaha : des éclats de voix par-dessus le murmure, là où il y a du monde.
  if ((A.gens || 0) > 2) { A.voix -= dt; if (A.voix <= 0) { A.voix = .08 + Math.random() * Math.max(.15, 1.2 - A.gens * .04); bref('voix', Math.min(.035, .006 + A.gens * .0015)); } }
}
if (import.meta.env.DEV) window.__ambiance = A;
