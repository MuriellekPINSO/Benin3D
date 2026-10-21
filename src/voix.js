import { hash } from './base.js';
import { AUDIO } from './audio.js';

// ---------- Les voix : les gens de Zém Run parlent à voix haute ----------
// Synthèse vocale du navigateur (Web Speech API) : gratuite, sans clé, en français.
// Chaque personne garde sa voix (femme ou homme, hauteur et débit tirés de sa graine).
// On n'entend que ceux qui sont près du zém, une phrase à la fois ; ce à quoi l'on
// répond (dialogue) passe devant les bavardages du bord de la route.
// Les phrases des vendeuses (pure water, kpayo, MoMo, l'artisane…) sont enregistrées : public/audio/voix/, la voix de
// Murielle clonée sur son Mac à partir d'un enregistrement (Chatterbox, en local). Une femme qui dit l'une d'elles la dit
// avec ce fichier, un peu plus aiguë ou plus grave selon sa graine ; tout le reste passe par la synthèse du navigateur.

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

// ---------- Les phrases enregistrées ----------
// Dans l'ordre des fichiers : la première est 01.m4a. Elles sont comparées sans accents, ponctuation ni guillemets.
const ENREGISTREES = [
  'Pure water ! Pure water !', 'Akassa chaud !', 'Venez acheter, c’est pas cher !', 'Arachides grillées !', 'Ananas sucré !',
  'Kpayo ! Essence, essence !', 'Un litre, deux litres ?', 'Kpayo ! Un litre, deux litres ?', 'Merci ! Roule bien, mon frère !',
  'Une autre fois !', 'Il faut payer d’abord hein !', 'Dépôt, retrait MoMo !', 'Crédit, crédit !', 'Regarde bien, prends ton temps !',
  'Tu l’as déjà acheté chez nous ! Regarde les autres.', 'Bonne arrivée ! Viens voir, ma sœur, mon frère. Tout est fait à la main.',
  'Bonne arrivée ! Viens voir, mon client. Tout est fait à la main.', 'Kpayo ! 500 F le litre, c’est moins cher qu’à la station !',
  'Pure water, akassa, beignets ! Tu prends quoi ?', 'Bon, pour toi j’enlève un peu. Tu prends quoi ?', 'Une autre fois alors ! Bonne route !',
];
const cleDe = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const CLIPS = new Map(ENREGISTREES.map((t, i) => [cleDe(t), { n: String(i + 1).padStart(2, '0'), octets: null, decode: null, tampon: undefined }]));
/** Les fichiers sont petits (une vingtaine de Ko chacun) : on les télécharge au premier geste et on les décode tous à la première phrase dite. */
function telechargerClips() {
  if (!VOIX.on) return;
  for (const c of CLIPS.values()) c.octets ??= fetch(`${import.meta.env.BASE_URL}audio/voix/${c.n}.m4a`).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
}
/** L'enregistrement de cette phrase, s'il y en a un et que le son du jeu tourne. Le premier appel décode tous les fichiers
 * (quelques dizaines de millisecondes) : lancer() attend le sien plutôt que de passer à la synthèse. */
function clipDe(texte) {
  const c = CLIPS.get(cleDe(texte)), ctx = AUDIO.ctx;
  if (!c || !ctx || ctx.state !== 'running') return null;
  telechargerClips();
  for (const x of CLIPS.values()) x.decode ??= x.octets?.then(o => o && ctx.decodeAudioData(o)).then(b => { x.tampon = b || null; }).catch(() => { x.tampon = null; });
  return c.decode && c.tampon !== null ? c : null;
}
addEventListener('pointerdown', telechargerClips, { once: true, capture: true });
addEventListener('keydown', telechargerClips, { once: true, capture: true });

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
    // Les sons « kp » et « gb » du fon et du goun : la voix française dirait « kapayo », « toka-pa ». Au début d'un mot, on
    // garde la seconde consonne (kpayo → payo, Kpota → Pota, Gbégamey → Bégamey) ; au milieu, « kp » devient « cp »
    // (tokpa → tocpa, Dantokpa, Akpakpa). Et le « -ey » final des noms de lieux se dit « è » (Godomey, Abomey).
    .replace(/\b([Kk])p(?=[aeiouyàâéèêëîïôöùû])/g, (m, k) => (k === 'K' ? 'P' : 'p')).replace(/([a-zà-ÿ])kp/gi, '$1cp')
    .replace(/\b([Gg])b(?=[aeiouyàâéèêëîïôöùû])/g, (m, g) => (g === 'G' ? 'B' : 'b'))
    .replace(/\b(Godom|Abom|Bégam|Avotr)ey\b/g, '$1è')
    .replace(/\s+/g, ' ').trim();
}

function lancer(e, delai = 0) {
  VOIX.courant = e;
  const fini = () => {
    if (VOIX.courant !== e) return; VOIX.courant = null; clearTimeout(VOIX.garde);
    let n; while ((n = VOIX.file.shift()) && performance.now() - n.t0 > 6000); // trop tard : on ne dit plus
    if (n) lancer(n, 80);
  };
  clearTimeout(VOIX.garde);
  if (e.c && !e.c.tampon) { // le fichier se décode encore : on l'attend, la synthèse si le décodage échoue
    VOIX.garde = setTimeout(fini, 2500);
    e.c.decode.then(() => { if (VOIX.courant !== e) return; if (!e.c.tampon) { e.c = null; e.u = enonce(e); } if (e.c || e.u) lancer(e, delai); else fini(); });
    return;
  }
  if (e.c) { // l'enregistrement, joué par le Web Audio du jeu (débloqué au premier geste, iPhone compris)
    const ctx = AUDIO.ctx, src = ctx.createBufferSource(), g = ctx.createGain(), b = e.c.tampon;
    src.buffer = b; src.playbackRate.value = e.vitesse; g.gain.value = e.qui.fort ? 1 : .9; src.connect(g).connect(ctx.destination);
    src.onended = fini; e.src = src; src.start(ctx.currentTime + delai / 1000);
    VOIX.garde = setTimeout(fini, delai + b.duration / e.vitesse * 1000 + 1500);
    return;
  }
  e.u.onend = e.u.onerror = fini;
  setTimeout(() => { if (VOIX.courant === e) synth.speak(e.u); }, delai);
  VOIX.garde = setTimeout(fini, delai + 2500 + e.u.text.length * 110); // filet si « end » n'arrive jamais
}
/** La phrase pour la synthèse du navigateur, avec la voix de la personne (null sans voix française). */
function enonce({ t, qui }) {
  const P = synth && profil(qui); if (!P) return null;
  const u = new SpeechSynthesisUtterance(t); u.voice = P.voix; u.lang = P.voix.lang; u.pitch = P.pitch; u.rate = P.rate; u.volume = qui.fort ? 1 : .92;
  return u;
}
/** Coupe ce qui se dit (enregistrement ou synthèse). */
function couper(e) {
  if (e?.src) { e.src.onended = null; try { e.src.stop(); } catch { } }
  synth?.cancel();
}
/** Dit `texte` avec la voix de `qui`. Priorité : 0 bavardage (dit seulement si personne ne parle), 1 ce qui s'adresse au zém, 2 dialogue. */
export function parler(texte, qui = {}, priorite = 0) {
  if (!VOIX.on || AUDIO.muet) return;
  const t = pourLaVoix(texte); if (!t) return;
  const cle = t.toLowerCase().replace(/[^a-zà-ÿ0-9]/g, ''), now = performance.now();
  if (cle === VOIX.dernier.cle && now - VOIX.dernier.t < 4000) return; // la bulle et le dialogue disent souvent la même chose
  if (VOIX.courant && priorite === 0) return;
  const c = qui.femme && qui.age !== 'revenant' ? clipDe(texte) : null, e = { c, qui, t, priorite, t0: now };
  if (c) { const g = graineDe(qui.graine); e.vitesse = (.95 + hash(g, 84) * .12) * (qui.age === 'vieux' ? .93 : qui.age === 'jeune' ? 1.04 : 1); }
  else if (!(e.u = enonce(e))) return;
  VOIX.dernier = { cle, t: now };
  if (!VOIX.courant) return lancer(e);
  if (priorite > VOIX.courant.priorite) { // on coupe le bavardage pour ce qui compte
    VOIX.file = VOIX.file.filter(x => x.priorite >= priorite); couper(VOIX.courant); VOIX.courant = null; lancer(e, 80); return;
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
export function taire() { VOIX.file = []; couper(VOIX.courant); VOIX.courant = null; clearTimeout(VOIX.garde); }
export function voixActives(on) { VOIX.on = on; if (!on) taire(); try { localStorage.setItem('cotonou3d.voix', on ? '1' : '0'); } catch { } }
export const voixDispo = () => !!synth;
