import { $ } from './base.js';
import { son } from './audio.js';
import { fermerFiche, nbCommerces } from './commerces.js';
import { ECHELLE, fortune, rangDe, titreRang } from './echelle.js';
import { cartesTrouvees, TOTAL_ALBUM } from './album.js';
import { firebase } from './firebase.js';
import { ouvrirClassement, publier } from './palmares.js';
import { VIE, ecrireEnPlus, gagner, lireEnPlus, ouvertAu, premierVol, surSignal } from './vie.js';

// ---------- Ma journée : trois missions par jour, une série, le coffre du dimanche ----------
// Ce qui fait revenir chaque jour sur Lagos Life (« Today's Hustle », mise à jour du 8/10) : trois missions nouvelles
// chaque jour, une série de jours qu'on ne veut pas casser, et un coffre le dimanche qui grossit avec les jours réussis
// de la semaine. Chaque mission rapporte des francs et de la réputation (★, leur « Lagos Rep ») ; la réputation de la
// semaine fait le classement (palmares.js), remis à zéro chaque lundi.
// Le jour du jeu est celui du défi de Zém Run (defi.js) : il change à 20 h, heure de Cotonou, quand on joue le plus.
// Les missions se comptent avec les signaux de « Ma vie » (vie.js signaler : 'travail', 'mange', 'course'…) ; les lieux
// à visiter, le salon les signale ('visite:amazone', salon.js). Tirées pour chacun (son identifiant et le jour) parmi
// celles qu'il peut faire : pas de « ventes du commerce » sans commerce.
// Enregistré avec la vie (champ `journee` de zem_vies, comme `chapitres`) : { j, m: [[id, n, fait]], s, b, dj, sem, jr, co, r, rs }.

const H = 36e5, JOUR = 864e5;
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const jourDe = t => new Date(t + 5 * H).toISOString().slice(0, 10);
const veille = j => new Date(Date.parse(j) - JOUR).toISOString().slice(0, 10);
export const rangSemaine = j => (new Date(Date.parse(j)).getUTCDay() + 6) % 7; // 0 : lundi … 6 : dimanche
export const lundiDe = j => new Date(Date.parse(j) - rangSemaine(j) * JOUR).toISOString().slice(0, 10);
const finDuJour = j => Date.parse(j) + 19 * H; // 20 h à Cotonou (UTC+1)

// f : la famille (une mission de chaque par jour). court : pour le fil du salon.
const motorise = () => !!VIE.data?.vehicule && VIE.data.vehicule !== 'velo';
export const MISSIONS = [
  { id: 'manger', f: 'vie', icone: '🍲', court: 'un bon plat', texte: 'Mange un bon plat : au maquis, au food court de la Cité ou chez toi.', compte: 'mange', but: 1, prime: 300, rep: 10 },
  { id: 'plein', f: 'vie', icone: '⛽', court: 'le plein', texte: 'Fais le plein dans une station-service.', compte: 'plein', but: 1, prime: 300, rep: 10, si: motorise },
  { id: 'tenue', f: 'vie', icone: '👗', court: 'une nouvelle tenue', texte: 'Change de tenue : « M’habiller », dans le menu.', compte: 'tenue', but: 1, prime: 200, rep: 10 },
  { id: 'message', f: 'vie', icone: '💬', court: 'bonjour aux autres', texte: 'Dis bonjour aux autres dans la discussion.', compte: 'message', but: 1, prime: 200, rep: 10 },
  { id: 'deco', f: 'vie', icone: '🛋️', court: 'un objet pour ta maison', texte: 'Achète un objet pour ta maison : « Ma maison », dans le menu.', compte: 'deco', but: 1, prime: 300, rep: 15, si: () => (VIE.data?.argent || 0) >= 3000 },
  { id: 'cite', f: 'vie', icone: '🏛️', court: 'le food court de la Cité', texte: 'Passe au food court de la Cité ministérielle (« Aller »).', compte: 'visite:cite', but: 1, prime: 400, rep: 15 },
  { id: 'gagner3', f: 'travail', icone: '💼', court: '3 000 F de travail', texte: 'Gagne 3 000 F en travaillant.', compte: 'travail', but: 3000, F: true, prime: 600, rep: 20 },
  { id: 'gagner8', f: 'travail', icone: '💼', court: '8 000 F de travail', texte: 'Gagne 8 000 F en travaillant.', compte: 'travail', but: 8000, F: true, prime: 1200, rep: 30, si: () => ouvertAu(1) },
  { id: 'courses', f: 'travail', icone: '🏍️', court: '3 courses', texte: 'Fais 3 courses de zém, de taxi ou de tokpa-tokpa (« Travailler »).', compte: 'course', but: 3, prime: 800, rep: 20 },
  { id: 'ventes', f: 'travail', icone: '🏪', court: '5 000 F de ventes', texte: 'Encaisse 5 000 F de ventes dans tes commerces.', compte: 'commerce', but: 5000, F: true, prime: 800, rep: 20, si: () => nbCommerces() >= 1 },
  { id: 'reappro', f: 'travail', icone: '📦', court: 'le réapprovisionnement', texte: 'Réapprovisionne un de tes commerces.', compte: 'reappro', but: 1, prime: 400, rep: 15, si: () => nbCommerces() >= 1 },
  { id: 'amazone', f: 'sortie', icone: '🗿', court: 'l’Amazone', texte: 'Va saluer l’Amazone, sur son esplanade (« Aller »).', compte: 'visite:amazone', but: 1, prime: 400, rep: 15 },
  { id: 'haievive', f: 'sortie', icone: '🎶', court: 'la Haie Vive', texte: 'Fais un tour à la Haie Vive, la rue des maquis (« Aller »).', compte: 'visite:haievive', but: 1, prime: 400, rep: 15 },
  { id: 'fidjrosse', f: 'sortie', icone: '🌊', court: 'la plage de Fidjrossè', texte: 'Va voir la mer à la plage de Fidjrossè (« Aller »).', compte: 'visite:fidjrosse', but: 1, prime: 400, rep: 15 },
  { id: 'album', f: 'sortie', icone: '📸', court: 'une nouvelle carte d’album', texte: 'Découvre un lieu qui manque à ton album : va le voir (« Album », dans le menu).', compte: 'album', but: 1, prime: 500, rep: 20, si: () => cartesTrouvees() < TOTAL_ALBUM },
  { id: 'adji', f: 'sortie', icone: '🎲', court: 'une partie d’adji', texte: 'Joue une partie d’adji, contre l’ordinateur ou un joueur (« Adji », dans le menu).', compte: 'adji', but: 1, prime: 400, rep: 15 },
  { id: 'lancepierre', f: 'sortie', icone: '🎯', court: 'une partie de lance-pierre', texte: 'Fais une partie de lance-pierre, au stand de la plage de Fidjrossè.', compte: 'lancePierre', but: 1, prime: 500, rep: 20 },
  { id: 'ouidah', f: 'sortie', icone: '✈️', court: 'le vol pour Ouidah', texte: 'Prends l’avion pour Ouidah (« Aller » : l’aéroport) : ton premier vol est offert.', compte: 'vol', but: 1, prime: 1000, rep: 30, si: premierVol },
];
const mission = id => MISSIONS.find(M => M.id === id);
// Le coffre du dimanche : 1 000 F par journée réussie dans la semaine, 3 000 F de plus pour une semaine complète.
const coffre = n => 1000 * n + (n >= 7 ? 3000 : 0);
const bonusJournee = s => 500 + 100 * Math.min(s, 10); // la série en cours, celle-ci comprise
const REP_JOURNEE = 25;
// « 3 journées réussies » : la phrase entière dans les deux nombres, pour que la version anglaise se traduise bien.
const reussies = n => `${n} ${n > 1 ? 'journées réussies' : 'journée réussie'}`;

const J = { ouvre: false, charge: false, rang: 0, jour: '', m: [], s: 0, b: 0, dj: '', sem: '', jr: '0000000', co: '', r: 0, rs: 0, t: 0, pubT: 0, ligne: () => { } };
/** La fenêtre « Ma journée » est à l'écran (une autre fiche peut l'avoir remplacée, commerces.js). */
const ouverte = () => !$('#vieFiche')?.hidden && !!$('#vfContenu .jr');

function fnv(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h >>> 0; }
/** Les trois missions du jour du joueur : une de chaque famille, parmi celles qu'il peut faire. */
function tirer(jour) {
  let g = fnv(`${jour}~${VIE.ref?.key || 'local'}`);
  const alea = () => { g = (Math.imul(g, 1664525) + 1013904223) >>> 0; return g / 4294967296; };
  return ['vie', 'travail', 'sortie'].map(f => {
    const l = MISSIONS.filter(M => M.f === f && (!M.si || M.si()));
    return { id: l[Math.floor(alea() * l.length)].id, n: 0, fait: false };
  });
}
/** La série affichée : elle tient tant que la journée réussie la plus récente est aujourd'hui ou hier. */
export const serieActuelle = () => (J.charge && (J.dj === J.jour || J.dj === veille(J.jour)) ? J.s : 0);
const joursReussis = () => [...J.jr].filter(c => c === '1').length;
const toutFait = () => J.m.length > 0 && J.m.every(m => m.fait);

function sauver() {
  if (!J.charge) return;
  ecrireEnPlus('journee', { j: J.jour, m: J.m.map(m => [m.id, Math.round(m.n), m.fait ? 1 : 0]), s: J.s, b: J.b, dj: J.dj, sem: J.sem, jr: J.jr, co: J.co, r: J.r, rs: J.rs });
}
/** Le jour du jeu a changé (à l'entrée, ou à 20 h en jouant) : nouvelles missions, et lundi une nouvelle semaine. */
function nouveauJour(jour) {
  J.jour = jour; J.m = tirer(jour);
  const sem = lundiDe(jour); if (sem !== J.sem) { J.sem = sem; J.jr = '0000000'; J.rs = 0; }
  sauver();
}

export function initJournee({ ligne }) {
  J.ligne = ligne;
  surSignal((evt, n) => {
    if (!J.charge) return;
    for (const m of J.m) {
      const M = mission(m.id); if (m.fait || M?.compte !== evt) continue;
      m.n += n; if (m.n >= M.but) reussir(m, M); else { sauver(); majPastille(); if (ouverte()) afficher(); }
    }
  });
  $('#slJourneeBtn')?.addEventListener('click', ouvrirJournee);
  $('#slClassement')?.addEventListener('click', ouvrirClassement);
  if (import.meta.env.DEV) window.__journee = { J, reussir: i => { const m = J.m[i]; if (m && !m.fait) reussir(m, mission(m.id)); }, jour: j => nouveauJour(j) }; // pour les tests
}
/** À l'entrée dans le salon : la journée enregistrée, ou de nouvelles missions. */
export function entrerJournee() {
  const d = lireEnPlus('journee');
  Object.assign(J, { jour: d?.j || '', m: (d?.m || []).filter(x => mission(x[0])).map(([id, n, f]) => ({ id, n: n || 0, fait: !!f })), s: d?.s || 0, b: d?.b || 0, dj: d?.dj || '', sem: d?.sem || '', jr: /^[01]{7}$/.test(d?.jr) ? d.jr : '0000000', co: d?.co || '', r: d?.r || 0, rs: d?.rs || 0 });
  J.charge = true; J.t = 0; J.rang = rangDe(fortune());
  const jour = jourDe(Date.now()), neuf = jour !== J.jour || J.m.length !== 3;
  if (neuf) nouveauJour(jour);
  majPastille(); publierEtat();
  if (neuf) J.ligne(`Tes missions du jour sont là : ${J.m.map(m => mission(m.id).court).join(', ')}. Touche ☀ « Ma journée », à droite.`);
  else if (!toutFait()) J.ligne(`Ma journée : ${J.m.filter(m => m.fait).length} mission${J.m.filter(m => m.fait).length > 1 ? 's' : ''} sur 3. Encore ${J.m.filter(m => !m.fait).map(m => mission(m.id).court).join(', ')}.`);
  if (rangSemaine(J.jour) === 6 && J.co !== J.sem && joursReussis() > 0) J.ligne(`C’est dimanche : ton coffre de la semaine t’attend (${fmt(coffre(joursReussis()))}). Ouvre-le dans « Ma journée ».`);
}
export function quitterJournee() { if (J.charge) { sauver(); publierEtat(); } J.charge = false; }

/** Les lieux que les missions en cours demandent de visiter (le salon regarde si l'on y est). */
export const visitesVoulues = () => (J.charge ? J.m.filter(m => !m.fait).map(m => mission(m.id).compte).filter(c => c.startsWith('visite:')).map(c => c.slice(7)) : []);

function reussir(m, M) {
  m.fait = true; m.n = M.but; J.r += M.rep; J.rs += M.rep;
  son('piece'); gagner(M.prime, `mission du jour : ${M.court}`, { source: 'prime', silencieux: true });
  J.ligne(`Mission du jour réussie : ${M.court} ! +${fmt(M.prime)}, +${M.rep} ★ de réputation.`);
  if (toutFait()) {
    J.s = J.dj === veille(J.jour) ? J.s + 1 : J.dj === J.jour ? J.s : 1; J.dj = J.jour; J.b = Math.max(J.b, J.s);
    const k = rangSemaine(J.jour); J.jr = J.jr.slice(0, k) + '1' + J.jr.slice(k + 1);
    J.r += REP_JOURNEE; J.rs += REP_JOURNEE;
    gagner(bonusJournee(J.s), 'journée réussie', { source: 'prime', silencieux: true });
    J.ligne(`Journée réussie ! 🔥 ${J.s} jour${J.s > 1 ? 's' : ''} de suite. +${fmt(bonusJournee(J.s))}, +${REP_JOURNEE} ★. Nouvelles missions demain à 20 h : reviens garder ta série.`);
    if (k === 6 && J.co !== J.sem) J.ligne(`C’est dimanche : ouvre ton coffre de la semaine (${fmt(coffre(joursReussis()))}) avant 20 h, dans « Ma journée ».`);
  }
  sauver(); majPastille(); publierEtat(); if (ouverte()) afficher();
}
/** De la réputation gagnée ailleurs (l'album, le trésor de la semaine) : elle compte aussi pour la semaine. */
export function gagnerReputation(n) {
  if (!J.charge || !(n > 0)) return;
  J.r += n; J.rs += n; sauver(); publierEtat(); if (ouverte()) afficher();
}
async function ouvrirCoffre() {
  const n = joursReussis(); if (rangSemaine(J.jour) !== 6 || J.co === J.sem || !n || J.ouvre) return;
  // Joué sur deux appareils : l'autre a peut-être déjà ouvert le coffre. On relit la journée enregistrée dans la base.
  J.ouvre = true; const co = await coffreDejaOuvert(); J.ouvre = false;
  if (co === J.sem) { J.co = co; sauver(); J.ligne('Ton coffre de la semaine est déjà ouvert (sur un autre appareil).'); if (ouverte()) afficher(); return; }
  J.co = J.sem; J.r += 10 * n; J.rs += 10 * n; sauver(); son('piece');
  // La base refuse plus de 5 000 F d'un coup (vie.js gagner) : un gros coffre se verse en deux fois.
  let reste = coffre(n); while (reste > 0) { const m = Math.min(5000, reste); reste -= m; await gagner(m, 'coffre du dimanche', { source: 'prime', silencieux: true }); }
  J.ligne(`Coffre du dimanche ouvert : ${reussies(n)} cette semaine, ${fmt(coffre(n))} et ${10 * n} ★ !${n >= 7 ? ' Semaine parfaite !' : ''}`);
  publierEtat(); if (ouverte()) afficher();
}

async function coffreDejaOuvert() {
  if (VIE.local || !VIE.ref) return '';
  try { const { d } = await firebase(), v = (await d.get(d.child(VIE.ref, 'journee'))).val(); return JSON.parse(v || '{}').co || ''; }
  catch { return ''; } // hors ligne : on fait confiance à cet appareil
}

// ---------- Le classement : ce que les autres voient ----------
// Le nom, la réputation, la série, le titre, la fortune et les cartes de l'album vont dans le classement (palmares.js, qui n'envoie que ce qui change).
function publierEtat() {
  if (!J.charge || !VIE.data) return;
  const f = fortune();
  publier({ r: J.r, rs: J.rs, sem: J.sem || lundiDe(jourDe(Date.now())), q: serieActuelle(), g: rangDe(f), f, a: cartesTrouvees() });
}

/** À chaque image du salon : le jour qui change à 20 h, la fortune qui monte (le classement, toutes les 30 s). */
export function majJournee(dt) {
  if (!J.charge || !VIE.data) return;
  J.t -= dt; if (J.t > 0) return; J.t = 1;
  const jour = jourDe(Date.now());
  if (jour !== J.jour) { nouveauJour(jour); majPastille(); J.ligne(`Il est 20 h à Cotonou : nouvelles missions du jour ! ${J.m.map(m => mission(m.id).court).join(', ')}.`); son('piece'); }
  // Un nouveau titre de l'échelle : on le fête (les autres le lisent sous ton nom, salon.js).
  const rg = rangDe(fortune()); if (rg > J.rang) { J.ligne(`Nouveau titre : ${titreRang(rg)} ! Ta fortune dépasse ${fmt(ECHELLE[rg][0])}. Tout le monde le lit sous ton nom.`); son('piece'); J.pubT = 0; }
  J.rang = rg;
  J.pubT -= 1; if (J.pubT <= 0) { J.pubT = 30; publierEtat(); }
  if (ouverte()) majCompteARebours();
}

// ---------- L'icône et la fenêtre ----------
function majPastille() {
  const pt = $('#slJourneePt'); if (!pt) return;
  const reste = J.m.filter(m => !m.fait).length;
  pt.hidden = !J.charge; pt.classList.toggle('ok', J.charge && !reste); pt.textContent = reste ? String(reste) : '✓';
  $('#slJourneeBtn')?.setAttribute('aria-label', reste ? `Ma journée : encore ${reste} mission${reste > 1 ? 's' : ''}` : 'Ma journée : toutes les missions sont faites');
}
const restant = () => { const ms = Math.max(0, finDuJour(J.jour) - Date.now()), h = Math.floor(ms / H), mn = Math.floor(ms % H / 6e4); return h ? `${h} h ${String(mn).padStart(2, '0')}` : `${mn} min`; };
function majCompteARebours() { const el = $('#jrRebours'); if (el) el.textContent = `Nouvelles missions dans ${restant()} (20 h à Cotonou)`; }

export function ouvrirJournee() { if (J.charge) afficher(); }
function afficher() {
  const el = $('#vieFiche'); if (!el) return;
  if (!ouverte()) fermerFiche();
  const serie = serieActuelle(), n = joursReussis(), dimanche = rangSemaine(J.jour) === 6;
  const f = fortune(), rg = rangDe(f), suiv = ECHELLE[rg + 1], bas = ECHELLE[rg][0];
  const pctEchelle = suiv ? Math.round(Math.min(1, (f - bas) / (suiv[0] - bas)) * 100) : 100;
  const lignes = J.m.map(m => {
    const M = mission(m.id), p = Math.round(Math.min(1, m.n / M.but) * 100);
    const avance = M.but > 1 ? (M.F ? `${fmt(Math.min(m.n, M.but))} sur ${fmt(M.but)}` : `${Math.min(m.n, M.but)} sur ${M.but}`) : '';
    return `<li class="${m.fait ? 'fait' : ''}"><i class="vf-icone">${M.icone}</i><span><b>${esc(M.texte)}</b>${avance && !m.fait ? `<small>${avance}</small>` : ''}<i class="jr-barre" style="--p:${m.fait ? 100 : p}%"></i></span><small class="jr-prime">${m.fait ? 'Réussie' : `+${fmt(M.prime)}<br>+${M.rep} ★`}</small></li>`;
  }).join('');
  const jours = [...'LMMJVSD'].map((x, k) => `<i class="${J.jr[k] === '1' ? 'ok' : ''}${k === rangSemaine(J.jour) ? ' auj' : ''}${k === 6 ? ' coffre' : ''}" title="${k === 6 ? 'Dimanche : le coffre' : ''}">${k === 6 ? '🎁' : x}</i>`).join('');
  const texteCoffre = J.co === J.sem ? 'Coffre de la semaine ouvert. Le prochain, dimanche prochain.'
    : dimanche ? (n ? `C’est dimanche : ${reussies(n)} cette semaine, ton coffre contient ${fmt(coffre(n))}.` : 'C’est dimanche, mais aucune journée réussie cette semaine : le coffre est vide.')
      : `Le coffre s’ouvre dimanche : ${n ? `déjà ${reussies(n)}, ${fmt(coffre(n))}` : '1 000 F par journée réussie'}${n < 7 ? ', et 3 000 F de plus pour une semaine complète' : ''}.`;
  $('#vfContenu').innerHTML = `<div class="jr"><small class="vf-sur">Ma vie</small><h3 id="vfTitre">Ma journée</h3>
    <div class="jr-tete"><span class="jr-serie${serie ? '' : ' eteinte'}"><b>🔥 ${serie}</b><small>jour${serie > 1 ? 's' : ''} de suite${J.b > 1 ? ` · record ${J.b}` : ''}</small></span><span class="jr-rep"><b>★ ${J.r.toLocaleString('fr-FR')}</b><small>réputation · ${J.rs.toLocaleString('fr-FR')} cette semaine</small></span></div>
    <p class="vf-intro">${toutFait() ? `Journée réussie ! Reviens après 20 h pour tes nouvelles missions : ta série passera à ${serie + 1} et la prochaine journée réussie rapportera ${fmt(bonusJournee(serie + 1))} de plus.` : `Trois missions par jour, nouvelles chaque soir à 20 h. Réussis les trois pour faire grandir ta série et gagner ${fmt(bonusJournee(serie + 1))} de plus.`}</p>
    <ol class="jr-missions">${lignes}</ol>
    <div class="jr-semaine"><div class="jr-jours" aria-label="Journées réussies cette semaine">${jours}</div><p>${texteCoffre}</p>${dimanche && n && J.co !== J.sem ? `<button type="button" class="jouer" data-jr="coffre">Ouvrir le coffre · ${fmt(coffre(n))}</button>` : ''}</div>
    <div class="jr-echelle"><span><small>Ton titre à Cotonou</small><b>${esc(titreRang(rg))}</b></span><i class="jr-barre" style="--p:${pctEchelle}%"></i><small>${suiv ? `Prochain titre : « ${esc(titreRang(rg + 1))} » à ${fmt(suiv[0])} de fortune (tu as ${fmt(f)} : ton argent, ton épargne, ta voiture, tes commerces, ta maison).` : `Tu es tout en haut de l’échelle, avec ${fmt(f)}.`} Les autres le lisent sous ton nom.</small></div>
    <div class="vf-pied"><span id="jrRebours"></span><button type="button" class="vf-bouton" data-jr="classement">Classement</button></div></div>`;
  majCompteARebours();
  el.hidden = false;
  el.querySelector('[data-jr="coffre"]')?.addEventListener('click', ouvrirCoffre);
  el.querySelector('[data-jr="classement"]')?.addEventListener('click', ouvrirClassement);
}
