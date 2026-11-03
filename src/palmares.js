import { $ } from './base.js';
import { fermerFiche } from './commerces.js';
import { titreRang } from './echelle.js';
import { firebase, joueur } from './firebase.js';
import { VIE } from './vie.js';

// ---------- Le classement de « Ma vie » : qui compte à Cotonou ----------
// Ce que Lagos Life montre à tous (le « Forbes » du 2/10, le « Who's Who » du 26/10) : on voit qui monte, et les autres
// voient ce qu'on fait. Quatre onglets : la réputation de la semaine (★ des missions du jour, journee.js ; remise à zéro
// chaque lundi), les plus riches (la fortune de l'échelle, echelle.js), les plus longues séries de journées réussies et
// les explorateurs (les cartes de l'album, album.js).
// Firebase : zem_rep/{uid} = { n: nom, w: 1 pour une femme, r: réputation, f: fortune, q: série, g: titre, a: cartes, t } et
// zem_rep_sem/{lundi}/{uid} = { n, w, s: réputation de la semaine, t }. Les règles (database.rules.json) bornent ce qu'un
// joueur peut écrire : la fortune ne dépasse pas son argent et son épargne enregistrés de plus de 1 000 000 F (voiture, commerces, objets de la maison), la réputation ne fait pas de
// bond, et pas plus d'une écriture toutes les 5 s.

const TOP = 20, ATTENTE = 6000;
const P = { dernier: '', t: 0, minuterie: 0, refuse: false, refus: 0, onglet: 'semaine' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const nombre = n => Math.round(n).toLocaleString('fr-FR');
// La semaine en cours (son lundi), comme journee.js : le jour du jeu change à 20 h à Cotonou.
const semaineActuelle = () => { const j = new Date(Date.now() + 5 * 36e5), k = (j.getUTCDay() + 6) % 7; return new Date(Date.parse(j.toISOString().slice(0, 10)) - k * 864e5).toISOString().slice(0, 10); };

/** Envoie ce que les autres verront ; rien si rien n'a changé, et pas plus d'une fois toutes les 6 s (la dernière version part). */
export function publier(e) {
  if (VIE.local || !VIE.ref || P.refuse || !VIE.data?.nom) return;
  // La base borne la fortune à l'argent et l'épargne enregistrés + 1 000 000 F : au-delà, tout l'envoi serait refusé.
  const borne = (VIE.data.argent || 0) + (VIE.data.epargne || 0) + 990000;
  const val = { n: VIE.data.nom, w: VIE.femme ? 1 : 0, r: Math.round(e.r), f: Math.round(Math.min(e.f, borne)), q: e.q | 0, g: e.g | 0, a: e.a | 0 }, cle = JSON.stringify([val, e.rs, e.sem]);
  if (cle === P.dernier) return;
  clearTimeout(P.minuterie);
  const attente = P.t + ATTENTE - Date.now();
  if (attente > 0) { P.minuterie = setTimeout(() => publier(e), attente); return; }
  P.dernier = cle; P.t = Date.now();
  // Refusé : souvent un autre appareil du joueur qui vient d'écrire (moins de 4 s) ; on réessaie au prochain envoi. Trois
  // refus de suite : les règles ne sont pas encore publiées, on n'insiste plus de la partie.
  envoyer(val, e).then(() => { P.refus = 0; }, err => { P.dernier = ''; if (/permission/i.test(err?.message || '')) P.refuse = ++P.refus >= 3; else console.warn('classement', err?.message); });
}
async function envoyer(val, e) {
  const { d, db } = await firebase(), uid = VIE.ref.key, t = d.serverTimestamp();
  await d.update(d.ref(db), { [`zem_rep/${uid}`]: { ...val, t }, [`zem_rep_sem/${e.sem}/${uid}`]: { n: val.n, w: val.w, s: Math.round(e.rs), t } });
}

// ---------- La fenêtre ----------
const ONGLETS = [['semaine', 'Cette semaine'], ['riches', 'Les plus riches'], ['series', 'Séries'], ['album', 'Explorateurs']];
async function lire(onglet) {
  const { d, db } = await firebase(); await joueur();
  const q = onglet === 'semaine' ? d.query(d.ref(db, `zem_rep_sem/${semaineActuelle()}`), d.orderByChild('s'), d.limitToLast(TOP))
    : onglet === 'riches' ? d.query(d.ref(db, 'zem_rep'), d.orderByChild('f'), d.limitToLast(TOP))
      : onglet === 'album' ? d.query(d.ref(db, 'zem_rep'), d.orderByChild('a'), d.limitToLast(TOP))
        : d.query(d.ref(db, 'zem_rep'), d.orderByChild('q'), d.limitToLast(TOP * 2));
  const l = []; (await d.get(q)).forEach(c => { l.push({ uid: c.key, ...c.val() }); });
  // Une série ne compte que si elle tient encore : son dernier passage date de moins de deux jours.
  const garder = onglet === 'series' ? l.filter(x => x.q > 0 && Date.now() - (x.t || 0) < 2 * 864e5) : onglet === 'album' ? l.filter(x => x.a > 0) : l;
  const cle = { semaine: 's', riches: 'f', series: 'q', album: 'a' }[onglet];
  return garder.sort((a, b) => b[cle] - a[cle] || a.t - b.t).slice(0, TOP);
}
/** Les premiers de chaque classement, pour la remise des prix de La Nuit Kutɔnu Vibes (nuit.js) : { riche, serie, album }, null s'il n'y a personne. */
export async function gagnants() {
  if (VIE.local) return {};
  const premier = async id => (await lire(id).catch(() => []))[0] || null;
  const [riche, serie, album] = await Promise.all(['riches', 'series', 'album'].map(premier));
  return { riche, serie, album };
}
export function ouvrirClassement() {
  const el = $('#vieFiche'); if (!el) return;
  fermerFiche();
  $('#vfContenu').innerHTML = `<div class="pm"><small class="vf-sur">Ma vie</small><h3 id="vfTitre">Qui compte à Cotonou</h3>
    <div class="pm-onglets" role="tablist">${ONGLETS.map(([id, nom]) => `<button type="button" role="tab" class="pm-onglet" data-pm="${id}">${nom}</button>`).join('')}</div>
    <p class="vf-intro" id="pmIntro"></p><ol class="pm-liste" id="pmListe"></ol></div>`;
  el.hidden = false;
  for (const b of el.querySelectorAll('[data-pm]')) b.addEventListener('click', () => onglet(b.dataset.pm));
  onglet(P.onglet);
}
async function onglet(id) {
  P.onglet = id;
  for (const b of document.querySelectorAll('[data-pm]')) b.setAttribute('aria-selected', String(b.dataset.pm === id));
  const intro = $('#pmIntro'), liste = $('#pmListe'); if (!liste) return;
  intro.textContent = id === 'semaine' ? 'La réputation gagnée cette semaine avec les missions du jour (★). Tout le monde repart de zéro lundi.'
    : id === 'riches' ? 'La fortune : l’argent, l’épargne, la voiture, les commerces et la maison de chacun.' : id === 'album' ? 'Les lieux de Cotonou et de Ouidah découverts pour l’album (34 cartes en tout).' : 'Les journées réussies de suite (les trois missions du jour). Une journée manquée, et la série repart à zéro.';
  if (VIE.local) { liste.innerHTML = '<li class="pm-vide">Le classement n’existe pas en mode test : il faut jouer en ligne.</li>'; return; }
  liste.innerHTML = '<li class="pm-vide">Chargement…</li>';
  let l; try { l = await lire(id); } catch (e) { console.warn('classement', e?.message); if (P.onglet === id) liste.innerHTML = '<li class="pm-vide">Le classement n’a pas pu être chargé. Réessaie dans un moment.</li>'; return; }
  if (P.onglet !== id || !$('#pmListe')) return; // un autre onglet a été choisi entre-temps
  const moi = VIE.ref?.key, valeur = x => (id === 'semaine' ? `★ ${nombre(x.s)}` : id === 'riches' ? `${nombre(x.f)} F` : id === 'album' ? `📸 ${x.a}` : `🔥 ${x.q}`);
  liste.innerHTML = l.length ? l.map((x, i) => `<li class="${x.uid === moi ? 'moi' : ''}"><b class="pm-rang">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</b><span><b>${esc(x.n || 'Joueur')}</b>${id !== 'semaine' && x.g !== undefined ? `<small>${esc(titreRang(x.g, x.w === 1))}</small>` : ''}</span><b class="pm-val">${valeur(x)}</b></li>`).join('')
    : `<li class="pm-vide">${id === 'semaine' ? 'Personne n’a encore de réputation cette semaine : réussis une mission du jour pour ouvrir le classement !' : 'Personne pour l’instant.'}</li>`;
  if (moi && !l.some(x => x.uid === moi)) liste.insertAdjacentHTML('beforeend', `<li class="pm-vide">Tu n’es pas encore dans les ${TOP} premiers : ${id === 'album' ? 'va découvrir des lieux pour ton album.' : 'les missions du jour te font monter.'}</li>`);
}
