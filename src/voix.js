import { hash } from './base.js';
import { AUDIO } from './audio.js';

// ---------- Les voix : les gens de Zém Run parlent à voix haute ----------
// Synthèse vocale du navigateur (Web Speech API) : gratuite, sans clé, en français.
// Chaque personne garde sa voix (femme ou homme, hauteur et débit tirés de sa graine).
// On n'entend que ceux qui sont près du zém, une phrase à la fois ; ce à quoi l'on
// répond (dialogue) passe devant les bavardages du bord de la route.

const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
export const VOIX = { on: true, femmes: [], hommes: [], toutes: [], courant: null, file: [], dernier: { cle: '', t: 0 }, garde: 0 };
try { VOIX.on = localStorage.getItem('cotonou3d.voix') !== '0'; } catch { }

const FEMMES = /amélie|amelie|audrey|aurélie|aurelie|marie|virginie|céline|celine|julie|denise|eloise|vivienne|brigitte|coralie|hortense|jacqueline|jos[ée]phine|yvette|ariane|sylvie|chantal|caroline|charline|\bflo\b|sandy|shelley|grandma|google français|female|femme/i;
const HOMMES = /thomas|daniel|nicolas|jacques|henri|paul|claude|r[ée]my|alain|j[ée]r[ôo]me|yves|maurice|antoine|fabrice|guillaume|eddy|reed|rocko|grandpa|\bmale\b|homme|lucien|olivier|mathieu|arnaud|tristan/i;
// Les voix « Eloquence » d'Apple (Eddy, Flo, Rocko…) sont très robotiques : en dernier recours.
const ROBOT = /\b(eddy|flo|reed|rocko|sandy|shelley|grandma|grandpa)\b/i;
const note = v => (/^fr[-_]FR/i.test(v.lang) ? 3 : /^fr[-_](BE|CH|LU)/i.test(v.lang) ? 2 : 1) + (/natural|neural|premium|enhanced|online/i.test(v.name) ? 3 : 0) + (/google/i.test(v.name) ? 1 : 0) - (ROBOT.test(v.name) ? 3 : 0);
const meilleures = l => { const n = l.length ? note(l[0]) : 0; return l.filter(v => note(v) >= n - 1).slice(0, 4); };

function chargerVoix() {
  if (!synth) return;
  const fr = synth.getVoices().filter(v => /^fr/i.test(v.lang)).sort((a, b) => note(b) - note(a));
  const f = fr.filter(v => FEMMES.test(v.name)), h = fr.filter(v => !FEMMES.test(v.name) && HOMMES.test(v.name)), autres = fr.filter(v => !FEMMES.test(v.name) && !HOMMES.test(v.name));
  Object.assign(VOIX, { femmes: meilleures([...f, ...autres]), hommes: meilleures([...h, ...autres]), toutes: fr });
}
if (synth) { chargerVoix(); synth.addEventListener?.('voiceschanged', chargerVoix); }
// Safari (iPhone) ne parle qu'après une première phrase dite pendant un geste : on la dit, muette.
const debloquer = () => { if (!synth) return; const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); };
addEventListener('pointerdown', debloquer, { once: true, capture: true });
addEventListener('keydown', debloquer, { once: true, capture: true });

const graineDe = g => typeof g === 'number' ? Math.abs(Math.round(g)) : [...String(g ?? '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;
/** La voix d'une personne : { femme, graine, age: '' | 'jeune' | 'vieux' | 'revenant' }. */
function profil({ femme = false, graine = 0, age = '' } = {}) {
  const g = graineDe(graine), propre = femme ? VOIX.femmes : VOIX.hommes, l = propre.length ? propre : VOIX.toutes;
  if (!l.length) return null;
  let pitch = femme ? 1.08 + hash(g, 82) * .28 : .8 + hash(g, 82) * .26, rate = .97 + hash(g, 83) * .15;
  if (!propre.length) pitch += femme ? .3 : -.25; // pas de voix du bon genre : on décale la hauteur
  if (age === 'jeune') { pitch += .08; rate += .07; } else if (age === 'vieux') { pitch -= .14; rate -= .1; } else if (age === 'revenant') { pitch = .3; rate = .78; }
  return { voix: l[Math.floor(hash(g, 81) * l.length)], pitch: Math.max(.1, Math.min(2, pitch)), rate };
}
/** Ce qui est écrit pour l'œil, dit pour l'oreille : sans guillemets ni traductions, les francs en toutes lettres. */
function pourLaVoix(t) {
  return String(t).replace(/[«»"“”]/g, '').replace(/\([^)]*\)/g, '')
    .replace(/(\d)[\s  ](?=\d{3}\b)/g, '$1').replace(/(\d+)\s*F\b/g, '$1 francs')
    .replace(/ɔ/g, 'o').replace(/Ɔ/g, 'O').replace(/ɛ/g, 'è').replace(/Ɛ/g, 'È')
    .replace(/\bTchrr+\b/gi, 'Tchip').replace(/\bdeh\b/gi, 'dè').replace(/\b([Zz])ém\b/g, '$1èm').replace(/\bMoMo\b/g, 'Momo')
    .replace(/\s+/g, ' ').trim();
}

function lancer(e, delai = 0) {
  VOIX.courant = e;
  const fini = () => {
    if (VOIX.courant !== e) return; VOIX.courant = null; clearTimeout(VOIX.garde);
    let n; while ((n = VOIX.file.shift()) && performance.now() - n.t > 6000); // trop tard : on ne dit plus
    if (n) lancer(n, 80);
  };
  e.u.onend = e.u.onerror = fini;
  setTimeout(() => { if (VOIX.courant === e) synth.speak(e.u); }, delai);
  clearTimeout(VOIX.garde); VOIX.garde = setTimeout(fini, delai + 2500 + e.u.text.length * 110); // filet si « end » n'arrive jamais
}
/** Dit `texte` avec la voix de `qui`. Priorité : 0 bavardage (dit seulement si personne ne parle), 1 ce qui s'adresse au zém, 2 dialogue. */
export function parler(texte, qui = {}, priorite = 0) {
  if (!synth || !VOIX.on || AUDIO.muet) return;
  const t = pourLaVoix(texte); if (!t) return;
  const cle = t.toLowerCase().replace(/[^a-zà-ÿ0-9]/g, ''), now = performance.now();
  if (cle === VOIX.dernier.cle && now - VOIX.dernier.t < 4000) return; // la bulle et le dialogue disent souvent la même chose
  if (VOIX.courant && priorite === 0) return;
  const P = profil(qui); if (!P) return;
  VOIX.dernier = { cle, t: now };
  const u = new SpeechSynthesisUtterance(t); u.voice = P.voix; u.lang = P.voix.lang; u.pitch = P.pitch; u.rate = P.rate; u.volume = qui.fort ? 1 : .92;
  const e = { u, priorite, t: now };
  if (!VOIX.courant) return lancer(e);
  if (priorite > VOIX.courant.priorite) { // on coupe le bavardage pour ce qui compte
    VOIX.file = VOIX.file.filter(x => x.priorite >= priorite); VOIX.courant = null; synth.cancel(); lancer(e, 80); return;
  }
  VOIX.file.push(e); if (VOIX.file.length > 3) VOIX.file.shift();
}
/** La voix rangée sur un objet 3D (userData.voix), ou déduite de la personne (personne() de discussions.js). */
export function voixDe(o) {
  const u = o?.userData || {};
  if (u.voix) return u.voix;
  if (u.femme !== undefined) return { femme: u.femme, graine: u.graine ?? o.id };
  return { femme: hash(o?.id ?? 0, 3) < .5, graine: o?.id ?? 0 };
}
/** Silence (pause, fin de partie, son coupé). */
export function taire() { VOIX.file = []; VOIX.courant = null; clearTimeout(VOIX.garde); synth?.cancel(); }
export function voixActives(on) { VOIX.on = on; if (!on) taire(); try { localStorage.setItem('cotonou3d.voix', on ? '1' : '0'); } catch { } }
export const voixDispo = () => !!synth;
