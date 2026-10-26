import { $, hash } from './base.js';
import { firebase, joueur } from './firebase.js';
import { choisirNom, nomJoueur } from './classement.js';
import { JEU, fmtF, lancerLigne, nbIntermediaires, sauver, toast } from './jeu.js';
import { annonce } from './missions.js';
import { dessinerPodium, partagerImage, telechargerImage } from './podium.js';
import { son } from './audio.js';

// ---------- Zém Run, le jeu du quotidien : le défi du jour ----------
// Chaque jour, tout le monde a la même mission, sur la même ligne et au zém : mêmes chances pour tous. Le score d'une
// course : client déposé +100, pièce +10, +1 par tranche de 10 F rapportés au patron (la recette de la course),
// mission réussie +500, trou pris −50. On garde la meilleure course du jour de chacun ; à égalité, la plus rapide.
// Le défi d'un jour court de 20 h la veille à 20 h (heure du Bénin) : à 20 h, le podium est figé, chacun peut en tirer
// l'image (podium.js), et la mission suivante commence aussitôt — le soir, quand on a le temps de jouer, il y a
// toujours un défi en cours. La semaine : les scores du lundi au dimanche additionnés, podium le dimanche à 20 h.
// Firebase (règles dans database.rules.json) :
//   zem_defi_departs/{uid}        { t: heure du serveur au départ, j: jour du défi, l: ligne }
//   zem_defi/{jour}/{uid}         la meilleure course du jour : score et ce qui le compose, durée, départ, envoi
//   zem_defi_traces/{jour}/{uid}  son trajet, un point toutes les 3 s de jeu (« t:x:z:clients:argent÷10 »)
// Le serveur refait l'addition du score, la compare au temps réellement écoulé depuis le départ qu'il a noté lui-même,
// et ne garde qu'un score qui monte. Avant de remettre un lot, le tableau de bord (public/tableau.html) montre la partie
// du gagnant : son trajet sur une carte, sa durée, et ce qui cloche.

export const POINTS = { client: 100, piece: 10, mission: 500, trou: -50 }; // et +1 par tranche de 10 F rapportés
// Le lot du premier de la semaine, une fois le sponsor trouvé (« 500 F de crédit offerts par … ») : vide, on n'en parle pas.
const LOT_SEMAINE = '';
// Les lignes du défi, tour à tour. Pas la ligne express (trop courte), ni Calavi (en tokpa-tokpa, un autre jeu).
const LIGNES_DEFI = ['centre', 'marina', 'corniche', 'plage', 'ouidah'];
const CONDITIONS = {
  trou: { txt: 'ne tombe dans aucun trou', court: r => `${r.tr} ${r.tr > 1 ? 'trous' : 'trou'}`, ok: r => r.tr === 0, il: 'aucun trou' },
  accident: { txt: 'n’aie aucun accident', court: r => `${r.x} accident${r.x > 1 ? 's' : ''}`, ok: r => r.x === 0, il: 'aucun accident' },
  arret: { txt: 'ne manque aucun arrêt', court: r => `${r.ma} ${r.ma > 1 ? 'arrêts manqués' : 'arrêt manqué'}`, ok: r => r.ma === 0, il: 'aucun arrêt manqué' },
};
const H = 3600e3, JOUR = 864e5, SITE = 'https://kotonuvibes.com';
const nb = n => Math.round(n).toLocaleString('fr-FR');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const place = r => r === 1 ? '1re place' : r === 2 ? '2e place' : r === 3 ? '3e place' : `${r}e place`; // en entier : la version anglaise dit 2nd, 3rd

// ---------- Les jours du défi ----------
/** Le jour du défi en cours à l'instant `t` : à partir de 20 h au Bénin (19 h UTC), c'est déjà celui du lendemain. */
export const jourDe = t => new Date(t + 5 * H).toISOString().slice(0, 10);
/** Fin du défi d'un jour (20 h au Bénin) et son début (20 h la veille). */
export const finDe = j => Date.parse(`${j}T19:00:00Z`);
export const debutDe = j => finDe(j) - JOUR;
const decaler = (j, n) => new Date(Date.parse(`${j}T12:00:00Z`) + n * JOUR).toISOString().slice(0, 10);
const lundiDe = j => decaler(j, -((new Date(`${j}T12:00:00Z`).getUTCDay() + 6) % 7));
const joli = (j, annee = false) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(annee ? { year: 'numeric' } : {}), timeZone: 'UTC' });
const semaineTexte = l => `du ${joli(l)} au ${joli(decaler(l, 6))}`;

const D = { decalage: 0, heure: null, depart: null, trace: [], traceT: -9, dernier: [0, 0], envoi: null, cache: new Map(), vue: 'jour', jourVu: '', lundiVu: '', format: 'publication', image: null, demande: 0, carte: 0, minuteur: 0 };
/** L'heure du serveur : un téléphone mal réglé ne doit pas voir le défi changer à la mauvaise heure. */
export const maintenant = () => Date.now() + D.decalage;
function heureServeur() {
  D.heure ??= firebase().then(({ d, db }) => new Promise(ok => { d.onValue(d.ref(db, '.info/serverTimeOffset'), s => { D.decalage = s.val() || 0; ok(); }, { onlyOnce: true }); setTimeout(ok, 4000); }))
    .catch(() => { D.heure = null; });
  return D.heure;
}

// ---------- La mission du jour, la même pour tous ----------
/** La mission du jour `j` : ligne, nombre de clients, argent à rapporter, et une condition. Tirée du jour lui-même. */
export function missionDu(j) {
  const lignes = LIGNES_DEFI.map(id => JEU.lignes.find(l => l.id === id)).filter(Boolean); if (!lignes.length) return null;
  const n = Math.round(Date.parse(`${j}T12:00:00Z`) / JOUR), L = lignes[n % lignes.length];
  // Un client par tronçon entre deux arrêts, arrêts intermédiaires compris (jeu.js) : la mission en demande la moitié
  // aux deux tiers, jamais tous (un client raté ne doit pas tout ruiner).
  const ecarts = L.arrets.slice(1).map((a, i) => a.s - L.arrets[i].s), depots = ecarts.length + ecarts.reduce((s, g) => s + nbIntermediaires(g), 0);
  const clients = Math.max(3, Math.min(depots - 1, Math.round(depots * (.5 + .2 * hash(n, 1)))));
  const argent = Math.max(1000, Math.round(clients * 375 / 500) * 500); // 8 clients : 3 000 F
  const cond = Object.keys(CONDITIONS)[Math.floor(hash(n, 2) * 3) % 3];
  return { j, ligne: L.id, nom: L.nom, clients, argent, cond, code: `${L.id}|${clients}|${argent}|${cond}` };
}
export const texteMission = M => `Sur « ${M.nom} » : dépose ${M.clients} clients, rapporte ${fmtF(M.argent)} au patron, ${CONDITIONS[M.cond].txt}.`;

/** Le score d'une course du défi, et ce qui le compose. */
export function resultat(st, M) {
  const r = { c: st.voyageurs | 0, p: st.pieces | 0, a: Math.max(0, Math.floor((st.argent || 0) / 10) * 10), tr: st.trous | 0, x: st.accidents | 0, ma: st.manques | 0 };
  r.ok = { clients: r.c >= M.clients, argent: r.a >= M.argent, cond: CONDITIONS[M.cond].ok(r) };
  r.m = r.ok.clients && r.ok.argent && r.ok.cond ? 1 : 0;
  r.s = r.c * POINTS.client + r.p * POINTS.piece + r.a / 10 + r.m * POINTS.mission + r.tr * POINTS.trou;
  return r;
}
// L'avatar du podium : la tenue de son personnage de « Vivre à Cotonou » (podium.js en tire la vignette), sinon rien.
function avatar() {
  try { const id = String(JSON.parse(localStorage.getItem('cotonou3d.salon') || '{}').modele || '').replace(/^t:/, ''); return /^[a-z0-9-]{1,24}$/.test(id) ? id : ''; } catch { return ''; }
}

// ---------- Une course du défi ----------
/** Au départ : la mission du moment (null si elle a changé à 20 h entre-temps), et l'heure notée par le serveur. */
export function departDefi(L) {
  const M = missionDu(jourDe(maintenant()));
  if (!M || M.ligne !== L.id) { toast('Le défi a changé à 20 h : la nouvelle mission t’attend dans le menu', 2.6, 'mal'); return null; }
  D.trace = []; D.traceT = -9; D.envoi = null; D.fait = false;
  D.depart = (async () => {
    const { d, db } = await firebase(), u = await joueur(), r = d.ref(db, `zem_defi_departs/${u.uid}`);
    await d.set(r, { t: d.serverTimestamp(), j: M.j, l: M.ligne });
    const t = (await d.get(r)).val()?.t; return typeof t === 'number' ? t : null;
  })().catch(e => { console.warn('défi', e.message); return null; });
  setTimeout(() => { if (JEU.defi === M && JEU.actif) annonce('Défi du jour', texteMission(M), 5200); }, 2600);
  const el = $('#jhDefi'); if (el) { el.hidden = true; el.dataset.h = ''; }
  return M;
}
/** À chaque image d'une course du défi : le trajet (un point toutes les 3 s) et la mission à l'écran. */
export function majDefi(st, x, z) {
  const M = JEU.defi; if (!M) return;
  D.dernier[0] = x; D.dernier[1] = z;
  if (st.temps - D.traceT >= 3 && D.trace.length < 2400) { D.traceT = st.temps; D.trace.push(`${Math.round(st.temps)}:${Math.round(x)}:${Math.round(z)}:${st.voyageurs | 0}:${Math.floor((st.argent || 0) / 10)}`); }
  const r = resultat(st, M), el = $('#jhDefi');
  if (r.m && !D.fait) { D.fait = true; annonce('Mission du jour réussie !', `+${POINTS.mission} points · continue jusqu’au terminus`); son('arret'); }
  if (!el) return;
  const h = `<b>Défi</b><span class="${r.ok.clients ? 'ok' : ''}">${r.c}/${M.clients} clients</span><span class="${r.ok.argent ? 'ok' : ''}">${nb(r.a)}/${fmtF(M.argent)}</span><span class="${r.ok.cond ? 'ok' : 'rate'}">${CONDITIONS[M.cond].court(r)}</span><em>${nb(r.s)} pts</em>`;
  if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; } el.hidden = false;
}
/** Au bilan d'une course : le score du défi, détaillé, puis envoyé. */
export function finDefi(st) {
  const M = JEU.defi, el = $('#jfDefi'); if (!el) return; el.hidden = !M; if (!M) return;
  const r = resultat(st, M); r.d = Math.min(7200, Math.max(1, Math.round(st.temps))); r.km = Math.round(st.parcouru || 0);
  const manque = [!r.ok.clients && `${M.clients - r.c} ${M.clients - r.c > 1 ? 'clients de plus' : 'client de plus'}`, !r.ok.argent && `${fmtF(M.argent - r.a)} de plus`, !r.ok.cond && CONDITIONS[M.cond].il].filter(Boolean);
  const ligne = (t, p, cls = '') => `<li class="${cls}"><span>${t}</span><b>${p > 0 ? '+' : p < 0 ? '−' : ''}${nb(Math.abs(p))}</b></li>`;
  el.innerHTML = `<div class="jd-score"><small>Défi du jour</small><b>${nb(r.s)} points</b></div><ul class="jd-detail">`
    + ligne(`${r.c} ${r.c > 1 ? 'clients déposés' : 'client déposé'}`, r.c * POINTS.client)
    + ligne(`${r.p} ${r.p > 1 ? 'pièces' : 'pièce'}`, r.p * POINTS.piece)
    + ligne(`${fmtF(r.a)} rapportés au patron`, r.a / 10)
    + ligne(r.m ? 'Mission réussie' : `Mission manquée : ${manque.join(', ')}`, r.m * POINTS.mission, r.m ? 'bon' : 'rate')
    + (r.tr ? ligne(`${r.tr} ${r.tr > 1 ? 'trous' : 'trou'}`, r.tr * POINTS.trou, 'rate') : '')
    + `</ul><p class="jd-etat" id="jfDefiEtat" role="status"></p><button type="button" class="btn-ghost" id="jfDefiReessayer" hidden>Réessayer l’envoi</button>`;
  $('#jfDefiReessayer').onclick = envoyer;
  D.envoi = { M, r, ns: JEU.ligne?.arretsJ?.length || 0, trace: [...D.trace, `${r.d}:${Math.round(D.dernier[0])}:${Math.round(D.dernier[1])}:${r.c}:${r.a / 10}`] };
  envoyer();
}
async function envoyer() {
  const E = D.envoi; if (!E) return;
  const dire = (t, reessayer = false) => { const p = $('#jfDefiEtat'), b = $('#jfDefiReessayer'); if (p) p.textContent = t; if (b) b.hidden = !reessayer; };
  const { M, r } = E, n = nomJoueur();
  if (r.s <= 0) return dire('Pas de points sur cette course : dépose des clients pour en marquer.');
  if (!n) return dire('Écris ton nom dans le défi du jour (menu de Zém Run) pour entrer au classement.');
  if (r.d < 20) return dire('Course trop courte pour compter au défi.');
  dire('Envoi de ton score…');
  try {
    await heureServeur();
    if (maintenant() >= finDe(M.j)) return dire('Le podium de 20 h est déjà publié : cette course ne compte plus. La mission suivante t’attend !');
    const dep = await D.depart;
    if (!dep) return dire('Ton départ n’a pas été enregistré (pas de réseau au départ) : cette course ne peut pas compter. Rejoue quand le réseau revient.');
    const { d, db } = await firebase(), u = await joueur(), chemin = `zem_defi/${M.j}/${u.uid}`;
    const avant = (await d.get(d.ref(db, chemin))).val();
    const mieux = !avant || r.s > avant.s || (r.s === avant.s && r.d < avant.d);
    if (mieux) {
      await d.update(d.ref(db), {
        [chemin]: { n, av: avatar(), z: String(JEU.numero || '').slice(0, 5), s: r.s, c: r.c, p: r.p, a: r.a, tr: r.tr, m: r.m, x: r.x, ma: r.ma, d: r.d, km: r.km, dep, t: d.serverTimestamp(), l: M.ligne, ns: E.ns, mi: M.code },
        [`zem_defi_traces/${M.j}/${u.uid}`]: { k: E.trace.join(';').slice(0, 40000), t: d.serverTimestamp() },
      });
      if (r.m) progresDefi();
    }
    D.cache.delete(M.j); D.envoi = null;
    const P = await lireJour(M.j), rang = P.findIndex(e => e.uid === u.uid) + 1;
    dire(`${mieux ? (avant ? 'Nouveau meilleur score du jour ! ' : 'Score enregistré. ') : `Ton meilleur score du jour reste ${nb(avant.s)} points. `}${rang ? `Tu es à la ${place(rang)} sur ${P.length}.` : ''}`);
  } catch (e) { console.warn('défi', e.message); dire('Ton score n’est pas parti : vérifie ta connexion, puis réessaie.', true); }
}
// Le nombre de missions du jour réussies, gardé avec la progression de Zém Run.
function progresDefi() { if (!JEU.prog) return; const P = JEU.prog; P.defis = (P.defis || 0) + 1; sauver(); }

// ---------- Lire les scores ----------
/** Les meilleures courses du jour `j`, de la première à la dernière ; celles d'avant 20 h la veille ou d'après 20 h ne comptent pas. */
async function lireJour(j, limite = 200) {
  const c = D.cache.get(j); if (c && (c.fige || Date.now() - c.t < 20e3)) return c.liste;
  const { d, db } = await firebase(); await joueur();
  const fige = finDe(j) <= maintenant(), snap = await d.get(d.query(d.ref(db, `zem_defi/${j}`), d.orderByChild('s'), d.limitToLast(limite)));
  const debut = debutDe(j), fin = finDe(j), liste = [];
  const ligne = missionDu(j)?.ligne; // une course d'une autre ligne ne vient pas du jeu : on ne la classe pas
  snap.forEach(e => { const v = e.val(); if (v && v.dep >= debut && v.t < fin && (!ligne || v.l === ligne)) liste.push({ uid: e.key, ...v }); });
  liste.sort((a, b) => b.s - a.s || a.d - b.d || a.t - b.t);
  D.cache.set(j, { t: Date.now(), liste, fige }); return liste;
}
/** La semaine du lundi `l` : les scores des jours déjà commencés, additionnés par joueur. */
async function lireSemaine(l) {
  const jours = Array.from({ length: 7 }, (_, k) => decaler(l, k)).filter(j => debutDe(j) <= maintenant());
  const tot = new Map();
  for (const liste of await Promise.all(jours.map(j => lireJour(j, 300)))) for (const e of liste) {
    const T = tot.get(e.uid) || { uid: e.uid, s: 0, d: 0, p: 0, jours: 0, t: 0 };
    T.s += e.s; T.d += e.d; T.p += e.p; T.jours++; if (e.t > T.t) Object.assign(T, { t: e.t, n: e.n, av: e.av, z: e.z }); // le nom de sa dernière course
    tot.set(e.uid, T);
  }
  return [...tot.values()].sort((a, b) => b.s - a.s || a.d - b.d);
}
const moi = async () => (await joueur()).uid;

// ---------- Le défi dans le menu de Zém Run ----------
function compteARebours(j) {
  const reste = Math.max(0, finDe(j) - maintenant()), h = Math.floor(reste / H), m = Math.floor(reste % H / 60e3);
  return `Podium à 20 h · encore ${h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`}`;
}
/** La carte du défi en tête du menu : mission, temps restant, sa place du jour, et le podium d'hier. */
export async function majCarte() {
  const el = $('#jmDefi'); if (!el) return;
  const j = jourDe(maintenant()), M = missionDu(j); el.hidden = !M; if (!M) return;
  $('#jdCompte').textContent = compteARebours(j);
  $('#jdMission').textContent = texteMission(M);
  $('#jdNomForm').hidden = !!nomJoueur();
  const k = ++D.carte;
  try {
    await heureServeur(); if (k !== D.carte) return;
    const j2 = jourDe(maintenant()); if (j2 !== j) return majCarte(); // l'heure du serveur a fait passer 20 h
    $('#jdCompte').textContent = compteARebours(j);
    const [P, id] = await Promise.all([lireJour(j), moi()]); if (k !== D.carte) return;
    const i = P.findIndex(e => e.uid === id);
    $('#jdMoi').textContent = i >= 0 ? `Ton meilleur score : ${nb(P[i].s)} points · ${place(i + 1)} sur ${P.length}` : P.length ? `${P.length} ${P.length > 1 ? 'joueurs ont déjà relevé le défi' : 'joueur a déjà relevé le défi'}. À toi !` : 'Personne n’a encore relevé le défi aujourd’hui : prends la tête !';
    const hier = decaler(j, -1), Q = await lireJour(hier); if (k !== D.carte) return;
    const b = $('#jdHier'), ceSoir = new Date(maintenant() + H).toISOString().slice(0, 10) === hier; b.hidden = !Q.length; // publié ce soir à 20 h, ou hier soir
    if (Q.length) b.innerHTML = `<small>Les heureux gagnants ${ceSoir ? 'de ce soir' : 'd’hier'}</small><span>${Q.slice(0, 3).map((e, n) => `<em>${['🥇', '🥈', '🥉'][n]} ${esc(e.n)}</em>`).join('')}</span>`;
  } catch (e) { if (k === D.carte) $('#jdMoi').textContent = 'Les scores ne répondent pas : vérifie ta connexion.'; console.warn('défi', e.message); }
}
function jouerDefi() {
  const M = missionDu(jourDe(maintenant())), L = M && JEU.lignes.find(l => l.id === M.ligne); if (!L) return;
  if (!nomJoueur()) {
    const f = $('#jdNomForm'), i = $('#jdNom'), n = choisirNom(i.value);
    if (!n) { f.hidden = false; $('#jdNomEtat').textContent = i.value.trim() ? 'Choisis un autre nom : il sera affiché devant tous les joueurs.' : 'Écris ton nom : il s’affichera sur le podium.'; i.focus(); return; }
    f.hidden = true;
  }
  JEU.numero = ($('#jmNumero').value || JEU.numero || '1234').slice(0, 5); sauver(); JEU.fini = false;
  lancerLigne(L, 'zem', M); // le zém pour tous, même avec un taxi ou le bolide au garage
}

// ---------- La fenêtre « Podium et scores » ----------
/** vue : 'jour' (en direct), 'podium' (un jour fini) ou 'semaine' ; `quand` : le jour (ou un jour de la semaine) à montrer. */
export function ouvrirDefi(vue = 'jour', quand = '') {
  D.vue = vue; const j = jourDe(maintenant());
  D.jourVu = quand && finDe(quand) <= maintenant() ? quand : decaler(j, -1);
  D.lundiVu = lundiDe(quand || j);
  $('#jeuDefi').hidden = false; montrer();
}
const fermerDefi = () => { $('#jeuDefi').hidden = true; D.demande++; };
async function montrer() {
  const k = ++D.demande, j = jourDe(maintenant()), vue = D.vue;
  for (const b of $('#jdVues').children) b.setAttribute('aria-pressed', String(b.dataset.vue === vue));
  const liste = $('#jdListe'), texte = $('#jdTexte'), moiEl = $('#jdMoiListe'), nav = $('#jdNav'), fig = $('#jdImage');
  liste.innerHTML = '<li class="jc-vide">Chargement des scores…</li>'; moiEl.textContent = ''; fig.hidden = true; D.image = null; texte.hidden = false;
  const img = $('#jdImg'); if (img.src) { URL.revokeObjectURL(img.src); img.removeAttribute('src'); } // pas l'image de la vue d'avant
  nav.hidden = vue === 'jour';
  const M = vue === 'semaine' ? null : missionDu(vue === 'jour' ? j : D.jourVu);
  if (vue === 'jour') texte.textContent = M ? `${texteMission(M)} ${compteARebours(j)}.` : '';
  else if (vue === 'podium') { $('#jdQuand').textContent = joli(D.jourVu); texte.textContent = M ? `Les heureux gagnants. Mission du jour : ${texteMission(M).replace(/^Sur/, 'sur')}` : ''; }
  else {
    const fin = decaler(D.lundiVu, 6), finie = finDe(fin) <= maintenant();
    $('#jdQuand').textContent = semaineTexte(D.lundiVu);
    texte.textContent = `${finie ? 'Les champions de la semaine' : 'Les points de chaque jour, additionnés du lundi au dimanche. Podium dimanche à 20 h'}.${LOT_SEMAINE ? ` Le premier de la semaine gagne ${LOT_SEMAINE}.` : ''}`;
  }
  $('#jdAvant').disabled = false;
  $('#jdApres').disabled = vue === 'podium' ? finDe(decaler(D.jourVu, 1)) > maintenant() : decaler(D.lundiVu, 7) > j;
  let P, id;
  try { [P, id] = await Promise.all([vue === 'semaine' ? lireSemaine(D.lundiVu) : lireJour(vue === 'jour' ? j : D.jourVu), moi()]); }
  catch (e) { if (k === D.demande) liste.innerHTML = '<li class="jc-vide">Les scores ne répondent pas : vérifie ta connexion, puis rouvre cette fenêtre.</li>'; console.warn('défi', e.message); return; }
  if (k !== D.demande) return;
  liste.innerHTML = P.length ? P.slice(0, 50).map((e, i) => `<li class="${e.uid === id ? 'moi' : ''}${i < 3 ? ' podium p' + (i + 1) : ''}"><span class="jc-rang">${i + 1}</span><span class="jc-nom">${esc(e.n)}${e.uid === id ? ' <em>toi</em>' : ''}<small>${vue === 'semaine' ? `${e.jours} ${e.jours > 1 ? 'jours joués' : 'jour joué'}` : `${e.c} ${e.c > 1 ? 'clients' : 'client'} · ${e.p} ${e.p > 1 ? 'pièces' : 'pièce'}${e.m ? ' · mission réussie' : ''}`}</small></span><b>${nb(e.s)} pts</b></li>`).join('')
    : `<li class="jc-vide">${vue === 'jour' ? 'Personne n’a encore relevé le défi aujourd’hui : prends la tête !' : vue === 'podium' ? 'Personne n’a joué le défi ce jour-là.' : 'Personne n’a encore joué cette semaine.'}</li>`;
  const i = P.findIndex(e => e.uid === id);
  moiEl.textContent = i >= 0 && i < 3 && vue !== 'jour' && (vue === 'podium' || finDe(decaler(D.lundiVu, 6)) <= maintenant()) ? `Tu es sur le podium, à la ${place(i + 1)} ! Partage l’image.`
    : i >= 0 ? `Tu es à la ${place(i + 1)} sur ${P.length}.` : vue === 'jour' ? 'Joue le défi pour apparaître ici.' : '';
  // L'image, une fois le podium figé (le jour fini, ou la semaine finie).
  const fige = vue === 'podium' || (vue === 'semaine' && finDe(decaler(D.lundiVu, 6)) <= maintenant());
  if (fige && P.length) {
    D.image = { P: P.slice(0, 3), M, vue, j: D.jourVu, l: D.lundiVu, moi: i >= 0 && i < 3 ? i + 1 : 0 };
    fig.hidden = false; texte.hidden = vue === 'podium'; dessiner(k); // la mission est écrite sur l'image
  }
}
async function dessiner(k = D.demande) {
  const I = D.image; if (!I) return;
  for (const b of $('#jdFormats').children) b.setAttribute('aria-pressed', String(b.dataset.format === D.format));
  const semaine = I.vue === 'semaine';
  const blob = await dessinerPodium({
    eyebrow: semaine ? 'Le défi de la semaine' : 'Le défi du jour', titre: semaine ? 'Les champions de la semaine' : 'Les heureux gagnants',
    date: semaine ? semaineTexte(I.l) : joli(I.j, true), mission: semaine ? 'Les scores du défi du jour, additionnés du lundi au dimanche.' : I.M ? `Mission : ${texteMission(I.M).replace(/^Sur/, 'sur')}` : '',
    gagnants: I.P, unite: 'points',
  }, D.format).catch(() => null);
  if (k !== D.demande || !blob) return;
  I.blob = blob; const img = $('#jdImg'); if (img.src) URL.revokeObjectURL(img.src); img.src = URL.createObjectURL(blob);
  img.alt = `Podium : ${I.P.map((e, n) => `${n + 1}. ${e.n}, ${nb(e.s)} points`).join(' ; ')}`;
}
function fichier() { const I = D.image; return `zem-run-${I.vue === 'semaine' ? `semaine-${I.l}` : `podium-${I.j}`}${D.format === 'story' ? '-story' : ''}.png`; }
function texteDuPartage() {
  const I = D.image, quand = I.vue === 'semaine' ? `de la semaine ${semaineTexte(I.l)}` : `du ${joli(I.j)}`;
  return I.moi ? `J’ai pris la ${place(I.moi)} du défi Zém Run ${quand} ! Fais mieux sur ${SITE}`
    : `Les heureux gagnants du défi Zém Run ${quand} : ${I.P.map((e, n) => `${n + 1}. ${e.n}`).join(', ')}. Joue sur ${SITE}`;
}

/** Ouvre le podium demandé dans l'adresse (?podium=2026-10-26, ou ?podium=semaine-2026-10-20) : lien du tableau de bord. */
export function podiumDemande() {
  const q = new URLSearchParams(location.search).get('podium'); if (q === null) return;
  const s = /^semaine-(\d{4}-\d{2}-\d{2})$/.exec(q), j = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : '';
  ($('#acZemRun') || $('#btnJouer'))?.click();
  heureServeur().then(() => ouvrirDefi(s ? 'semaine' : 'podium', s ? s[1] : j));
}

export function initDefi() {
  $('#jdJouer')?.addEventListener('click', jouerDefi);
  $('#jdVoir')?.addEventListener('click', () => ouvrirDefi('jour'));
  $('#jdHier')?.addEventListener('click', () => ouvrirDefi('podium'));
  $('#jdNomForm')?.addEventListener('submit', e => { e.preventDefault(); jouerDefi(); });
  $('#jdFermer')?.addEventListener('click', fermerDefi);
  for (const b of $('#jdVues')?.children || []) b.addEventListener('click', () => { D.vue = b.dataset.vue; montrer(); });
  $('#jdAvant')?.addEventListener('click', () => { if (D.vue === 'semaine') D.lundiVu = decaler(D.lundiVu, -7); else D.jourVu = decaler(D.jourVu, -1); montrer(); });
  $('#jdApres')?.addEventListener('click', () => { if (D.vue === 'semaine') D.lundiVu = decaler(D.lundiVu, 7); else D.jourVu = decaler(D.jourVu, 1); montrer(); });
  for (const b of $('#jdFormats')?.children || []) b.addEventListener('click', () => { D.format = b.dataset.format; dessiner(); });
  $('#jdPartager')?.addEventListener('click', async e => {
    const I = D.image; if (!I?.blob) return; const b = e.currentTarget; b.disabled = true;
    const r = await partagerImage(I.blob, fichier(), texteDuPartage()); b.disabled = false;
    if (r === 'partage') son('piece'); else if (r === 'telecharge') toast('Image enregistrée dans tes téléchargements', 2);
  });
  $('#jdEnregistrer')?.addEventListener('click', () => { if (D.image?.blob) telechargerImage(D.image.blob, fichier()); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#jeuDefi').hidden) { fermerDefi(); e.stopPropagation(); } }, true);
  // Le temps qui reste avant le podium, tant que le menu est ouvert ; à 20 h, la nouvelle mission.
  clearInterval(D.minuteur);
  D.minuteur = setInterval(() => { if (!$('#jeu').hidden && !$('#jeuMenu').hidden) majCarte(); }, 30e3);
  if (import.meta.env.DEV) window.__defi = { D, missionDu, resultat, jourDe, finDe, lireJour, lireSemaine, ouvrirDefi, majCarte }; // pour les tests
}
