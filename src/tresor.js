import * as THREE from 'three';
import { $, toXZ } from './base.js';
import { son } from './audio.js';
import { fermerFiche } from './commerces.js';
import { PLACES } from './donnees-lieux.js';
import { firebase } from './firebase.js';
import { gagnerReputation, jourDe, lundiDe, rangSemaine } from './journee.js';
import { scene } from './scene.js';
import { hauteurSol } from './sols.js';
import { surRoute } from './conduite.js';
import { VIE, ecrireEnPlus, gagner, lireEnPlus, signaler } from './vie.js';

// ---------- La chasse au trésor de la semaine ----------
// Chaque semaine, un coffre est caché près d'un lieu de la ville (ou à Ouidah) : le même pour tout le monde. Trois indices,
// de plus en plus clairs : à l'ouverture de la semaine, puis mardi et jeudi à 20 h (le jour du jeu change à 20 h, journee.js).
// Les premiers à le trouver gagnent le plus ; on voit qui l'a déjà trouvé. Le coffre n'apparaît qu'à l'approche : une colonne
// de lumière dorée à 120 m, le coffre à 60 m ; on l'ouvre en le touchant, à pied.
// Firebase : zem_tresor/{lundi}/{uid} = { n, w, t } (écrit une fois, l'heure du serveur fait le rang). Enregistré aussi avec
// la vie (champ `tresor`) : { s: semaine, r: rang, v: indices déjà lus }.

// [lieu (donnees-lieux.js), décalage en mètres depuis le centre du lieu (x vers l'est, z vers le sud), trois indices]. Le
// dernier nomme le lieu. Les décalages sortent le coffre des monuments, que les règles de passage ne connaissent pas
// (l'Étoile Rouge, la cathédrale, la tour BCEAO, le palais des Congrès, la statue de Bio Guéra : vérifiés vus du ciel).
const CACHETTES = [
  ['amazone', [0, -62], ['Elle veille sur l’océan, fusil dressé, sabre à la main, plus haute qu’un immeuble de dix étages.', 'Une guerrière de bronze de 30 mètres, en hommage aux Agoodjié du Dahomey. Le trésor dort à ses pieds.', 'Sur l’esplanade de l’Amazone, boulevard de la Marina : cherche la lueur dorée sur les dalles.']],
  ['etoile', [22, 24], ['Cinq routes s’y donnent rendez-vous, et un homme de bronze y porte sa houe depuis les années 1970.', 'Deux étoiles couchées à plat, une flèche blanche dressée vers le ciel.', 'Le trésor est à la place de l’Étoile Rouge, au grand carrefour.']],
  ['cathedrale', [20, 8], ['Rayée de rouge et de blanc de la base au pignon, on dirait un sucre d’orge géant.', 'Son clocher carré se dresse à côté de la nef, à Ganhi, à deux pas de l’ancien pont.', 'Le trésor est devant la cathédrale Notre-Dame.']],
  ['fidjrosse', [0, 0], ['Là où le sable rencontre la barre, entre les cocotiers et les paillotes, à l’ouest de la ville.', 'Des pirogues tirées sur le sable, la route des Pêches juste derrière. Ne te baigne pas : la barre est forte.', 'Le trésor est sur la plage de Fidjrossè.']],
  ['bceao', [18, 20], ['Le plus haut immeuble du pays porte sur ses façades l’ancienne monnaie, en or.', 'Des cauris dorés en colonnes de treize, et une fontaine entourée de sept bassins.', 'Le trésor est au pied de la tour BCEAO.']],
  ['haievive', [-65, -153], ['Là où Cotonou sort le soir : des terrasses sous les parasols, tout près des avions.', 'La rue des maquis, des bars et des restaurants, à deux pas de l’aéroport.', 'Le trésor est à la Haie Vive, dans la rue des maquis.']],
  ['martyrs', [0, 0], ['Trois combattants de bronze, dont un porte-drapeau, se souviennent d’un matin de janvier 1977.', 'En haut d’un grand escalier blanc, au bord du boulevard de la Marina.', 'Le trésor est à la place des Martyrs.']],
  ['dantokpa', [15, -15], ['On y trouve de tout, des oignons aux pagnes, sauf le silence : l’un des plus grands marchés à ciel ouvert d’Afrique de l’Ouest.', 'Des parasols à perte de vue au bord de la lagune, et tout le monde l’appelle par son petit nom.', 'Le trésor est au marché Dantokpa.']],
  ['congres', [-20, 28], ['Ses tambours blancs rappellent les maisons-forteresses du nord du Bénin.', 'Des tata somba de béton, ceints de triangles sombres et percés chacun d’un œil doré.', 'Le trésor est devant le palais des Congrès, sur la Marina.']],
  ['corniche', [0, 24], ['Une piste couleur brique, des lampadaires à double crosse et des épis de roches noires dans l’Atlantique.', 'La promenade du bord de mer, côté Akpakpa, où l’on court le matin.', 'Le trésor est sur la Corniche Est.']],
  ['bioguera', [9, 6], ['Un cavalier de bronze qui a résisté à la colonisation, au milieu d’un des carrefours les plus fréquentés de la ville.', 'Le carrefour d’Erevan, juste à côté du grand magasin.', 'Le trésor est au carrefour Bio Guéra, près de la statue équestre.']],
  ['porte', [0, 0], ['Une grande arche face à l’océan, au bout d’une route de mémoire longue de près de 4 kilomètres.', 'Ce n’est pas à Cotonou : il faudra prendre l’avion. Tout près, l’arène des Vodun Days.', 'Le trésor est à la Porte du Non-Retour, à Ouidah.']],
  ['murport', [0, 4], ['Un kilomètre et demi de couleurs sur un mur, peint par des artistes venus de treize pays.', 'Le long du port, côté boulevard de la Marina : la grande fresque d’Eduardo Kobra y veille.', 'Le trésor est le long du mur des fresques du port.']],
  ['jardin', [0, 0], ['Des pelouses en forme de feuilles et seize grands pylônes effilés le long de la route.', 'Juste en face de la guerrière de bronze, de l’autre côté du boulevard.', 'Le trésor est dans le jardin de l’Amazone.']],
];
// Rangs de la semaine (0 : lundi). Le jour du jeu commence la veille à 20 h : l'indice de « mercredi » arrive mardi à 20 h.
const JOURS_INDICES = [0, 2, 4], ARRIVEES = ['', 'Il arrive mardi à 20 h.', 'Il arrive jeudi à 20 h.'];
const PRIMES = [15000, 10000, 7500], PRIME = 3000, REPS = [100, 80, 60], REP = 40;
const H = 36e5, JOUR = 864e5, SEM0 = Date.parse('2026-10-26'); // un lundi : la semaine 0 du tour des cachettes
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rangTxt = r => (r === 1 ? '1er' : r === 2 ? '2e' : r === 3 ? '3e' : `${r}e`); // en entier : la version anglaise dit 1st, 2nd, 3rd, 4th
const primeDe = r => PRIMES[r - 1] || PRIME, repDe = r => REPS[r - 1] || REP;

const TR = { force: -1, charge: false, sem: '', jour: '', r: 0, v: 0, t: 0, g: null, pos: null, ajuste: 0, ouvre: 0, dit: false, liste: null, listeT: 0, ligne: () => { }, position: () => null, libre: () => true, aPied: () => true };
const ouverte = () => !$('#vieFiche')?.hidden && !!$('#vfContenu .tz');
/** La cachette de la semaine : un tour de toutes les cachettes, sans revenir deux semaines de suite au même endroit. */
const cachette = sem => (TR.force >= 0 ? CACHETTES[TR.force] : CACHETTES[((Math.round((Date.parse(sem) - SEM0) / (7 * JOUR)) * 5) % CACHETTES.length + CACHETTES.length) % CACHETTES.length]);
const indicesOuverts = () => JOURS_INDICES.filter(k => rangSemaine(TR.jour) >= k).length;
const finSemaine = () => Date.parse(TR.sem) + 6 * JOUR + 19 * H; // dimanche, 20 h à Cotonou

export function initTresor({ ligne, position, libre, aPied }) {
  Object.assign(TR, { ligne, position, libre, aPied });
  $('#slTresor')?.addEventListener('click', ouvrirTresor);
  if (import.meta.env.DEV) window.__tresor = { TR, CACHETTES, cachette: () => lieuDe(cachette(TR.sem)) }; // pour les tests (TR.force : une autre cachette)
}
export function entrerTresor() {
  const d = lireEnPlus('tresor');
  TR.jour = jourDe(Date.now()); TR.sem = lundiDe(TR.jour);
  Object.assign(TR, { r: d?.s === TR.sem ? d.r || 0 : 0, v: d?.s === TR.sem ? d.v || 0 : 0, charge: true, t: 0, dit: false, ouvre: 0, liste: null });
  annoncerIndice();
}
export function quitterTresor() { TR.charge = false; retirer(); }
const sauver = () => ecrireEnPlus('tresor', { s: TR.sem, r: TR.r, v: TR.v });

/** Un indice qu'on n'a pas encore lu : on le dit dans le fil, une fois. */
function annoncerIndice() {
  const n = indicesOuverts(); if (TR.r || n <= TR.v) return;
  const [, , ind] = cachette(TR.sem);
  TR.ligne(!TR.v ? `🗝️ Un trésor est caché cette semaine ! ${['Premier indice', 'Deuxième indice', 'Dernier indice'][n - 1]} : « ${ind[n - 1]} » (menu, « Trésor »).` : `🗝️ Nouvel indice pour le trésor de la semaine : « ${ind[n - 1]} »`);
  TR.v = n; sauver();
}
/** Le point du coffre : le lieu et son décalage. */
function lieuDe(C) { const P = PLACES.find(p => p.id === C[0]); if (!P) return null; const [x, z] = toXZ(P.lat, P.lon); return [x + C[1][0], z + C[1][1]]; }

// ---------- Le coffre, dans la ville ----------
function construire(x, z) {
  const g = new THREE.Group(), bois = new THREE.MeshStandardMaterial({ color: '#7a4a22', roughness: .8 }), or = new THREE.MeshStandardMaterial({ color: '#d9a520', roughness: .3, metalness: .8, emissive: '#5a3c00' });
  const boite = (w, h, d, m, px, py, pz, p = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py, pz); o.castShadow = true; p.add(o); return o; };
  boite(.9, .5, .6, bois, 0, .25, 0);
  for (const bx of [-.3, .3]) boite(.07, .52, .62, or, bx, .25, 0);
  const couvercle = new THREE.Group(); couvercle.position.set(0, .5, -.3); g.add(couvercle);
  boite(.92, .2, .62, bois, 0, .1, .3, couvercle);
  for (const bx of [-.3, .3]) boite(.07, .22, .64, or, bx, .1, .3, couvercle);
  boite(.14, .16, .04, or, 0, .38, .32);
  // Une colonne de lumière, visible de loin : sans vraie lumière (elle obligerait à recompiler tous les matériaux de la ville).
  const colonne = new THREE.Mesh(new THREE.CylinderGeometry(.35, .9, 26, 18, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  colonne.position.y = 13; g.add(colonne);
  const etincelles = []; const mEt = new THREE.MeshBasicMaterial({ color: '#fff1b0' }), gEt = new THREE.OctahedronGeometry(.06);
  for (let i = 0; i < 10; i++) { const e = new THREE.Mesh(gEt, mEt); e.userData = { a: i / 10 * Math.PI * 2, r: .7 + (i % 3) * .15, h: .3 + (i % 4) * .35 }; g.add(e); etincelles.push(e); }
  g.position.set(x, hauteurSol(x, z), z); g.rotation.y = Math.random() * Math.PI * 2;
  g.userData = { couvercle, colonne, etincelles, pieces: [] };
  scene.add(g); return g;
}
function retirer() {
  if (!TR.g) return;
  scene.remove(TR.g);
  TR.g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  TR.g = null; TR.pos = null; TR.ajuste = 0; TR.ouvre = 0; TR.dit = false; // quitté pendant l'ouverture : sinon plus aucun coffre jusqu'au rechargement
}
/** Le point prévu peut tomber sur un banc, un étal, la chaussée : le coffre va au point libre le plus proche, hors de la route. */
function ajuster() {
  const [x, z] = TR.pos, bon = (px, pz) => TR.libre(px, pz) && TR.libre(px + .7, pz) && TR.libre(px - .7, pz) && TR.libre(px, pz + .7) && TR.libre(px, pz - .7) && !surRoute(px, pz);
  if (bon(x, z)) return;
  for (let r = 1.5; r <= 30; r += 1.5) for (let a = 0; a < 16; a++) {
    const px = x + Math.cos(a * Math.PI / 8) * r, pz = z + Math.sin(a * Math.PI / 8) * r;
    if (bon(px, pz)) { TR.pos = [px, pz]; TR.g.position.set(px, hauteurSol(px, pz), pz); return; }
  }
}

/** À chaque image du salon : le coffre apparaît à l'approche, s'ouvre quand on le touche. */
export function majTresor(dt) {
  if (!TR.charge || !VIE.data) return;
  TR.t -= dt;
  if (TR.t <= 0) {
    TR.t = .5;
    const jour = jourDe(Date.now());
    if (jour !== TR.jour) { const sem = lundiDe(jour); TR.jour = jour; if (sem !== TR.sem) { TR.sem = sem; TR.r = 0; TR.v = 0; TR.liste = null; retirer(); } annoncerIndice(); }
    if (!TR.r && !TR.ouvre) {
      const p = TR.position(), but = lieuDe(cachette(TR.sem)), d = p && but ? Math.hypot((TR.pos || but)[0] - p[0], (TR.pos || but)[1] - p[1]) : Infinity; // dans une salle : nulle part
      if (!TR.g && d < 120) { TR.pos = but; TR.g = construire(...but); }
      else if (TR.g && d >= 160) retirer();
      // Deux fois : à 45 m, puis à 20 m, quand les bancs et les étals du coin sont posés (rue.js les pose à l'approche).
      if (TR.g && TR.ajuste < 2 && d < (TR.ajuste ? 20 : 45)) { TR.ajuste++; ajuster(); }
    }
  }
  const g = TR.g; if (!g) return;
  const u = g.userData, t = performance.now() / 1000, p = TR.position(), d = p ? Math.hypot(TR.pos[0] - p[0], TR.pos[1] - p[1]) : 1e9;
  g.children.forEach(o => { if (o.isMesh && o !== u.colonne && !u.etincelles.includes(o) && !u.pieces.includes(o)) o.visible = d < 60; });
  u.couvercle.visible = d < 60;
  u.colonne.material.opacity = .14 + Math.sin(t * 2) * .05;
  for (const e of u.etincelles) { const k = e.userData; e.position.set(Math.cos(k.a + t * .8) * k.r, k.h + Math.sin(t * 2 + k.a) * .15, Math.sin(k.a + t * .8) * k.r); e.rotation.y = t * 3; e.visible = d < 60; }
  if (TR.ouvre) { animerOuverture(dt); return; }
  if (d < 1.6 && TR.aPied()) ouvrir();
  else if (d < 5 && !TR.aPied() && !TR.dit) { TR.dit = true; TR.ligne('Le coffre est là ! Descends pour l’ouvrir.'); }
}
function animerOuverture(dt) {
  const u = TR.g.userData; TR.ouvre += dt;
  u.couvercle.rotation.x = -Math.min(1, TR.ouvre / .7) * 1.9;
  if (!u.pieces.length && TR.ouvre > .3) {
    const m = new THREE.MeshStandardMaterial({ color: '#f2c230', metalness: .9, roughness: .25, emissive: '#6b4a00' }), geo = new THREE.CylinderGeometry(.06, .06, .015, 12);
    for (let i = 0; i < 18; i++) { const c = new THREE.Mesh(geo, m); c.position.set(0, .55, 0); c.userData = { v: [(Math.random() - .5) * 2.4, 3 + Math.random() * 2.5, (Math.random() - .5) * 2.4] }; TR.g.add(c); u.pieces.push(c); }
  }
  for (const c of u.pieces) { const v = c.userData.v; v[1] -= 9.8 * dt; c.position.x += v[0] * dt; c.position.y = Math.max(.02, c.position.y + v[1] * dt); c.position.z += v[2] * dt; c.rotation.x += dt * 8; }
  u.colonne.scale.x = u.colonne.scale.z = 1 + TR.ouvre * .8; u.colonne.material.opacity = Math.max(0, .3 - TR.ouvre * .08);
  if (TR.ouvre > 3.5) { TR.ouvre = 0; retirer(); }
}

// ---------- Ouvrir : le rang, la prime ----------
async function ouvrir() {
  TR.ouvre = .001; TR.r = -1; son('piece'); signaler('tresor');
  // Dix secondes au plus : un réseau mort ne doit pas bloquer le coffre (rang 4, la prime de base).
  const { r, deja } = await Promise.race([inscrire(), new Promise(ok => setTimeout(() => ok({ r: 4, deja: false }), 10000))]);
  TR.r = r; sauver();
  if (deja) { TR.ligne(`🗝️ Tu avais déjà ouvert ce coffre cette semaine (${rangTxt(r)}), sur un autre appareil.`); TR.liste = null; if (ouverte()) afficher(); return; }
  gagnerReputation(repDe(r));
  for (let reste = primeDe(r); reste > 0; reste -= 5000) gagner(Math.min(5000, reste), 'trésor de la semaine', { source: 'prime', silencieux: true }); // la base refuse plus de 5 000 F d'un coup
  TR.ligne(`🗝️ Trésor trouvé ! Tu es ${r === 1 ? 'la première personne' : `la ${rangTxt(r)} personne`} à l’ouvrir cette semaine : +${fmt(primeDe(r))}, +${repDe(r)} ★. Un nouveau trésor dimanche à 20 h.`);
  TR.liste = null; if (ouverte()) afficher();
}
/** Écrit sa trouvaille (l'heure du serveur) et compte ceux d'avant : { r: rang, deja }. Sans serveur (mode test) : premier.
 *  deja : la base avait déjà sa trouvaille (ouverte sur un autre appareil) ; elle refuse de la réécrire, et l'on ne paie pas deux fois. */
async function inscrire() {
  if (VIE.local || !VIE.ref) return { r: 1, deja: false };
  try {
    const { d, db } = await firebase(), uid = VIE.ref.key, ref = d.ref(db, `zem_tresor/${TR.sem}`);
    const deja = await d.set(d.child(ref, uid), { n: VIE.data.nom, w: VIE.femme ? 1 : 0, t: d.serverTimestamp() }).then(() => false, async () => (await d.get(d.child(ref, uid))).exists());
    const l = []; (await d.get(d.query(ref, d.orderByChild('t'), d.limitToFirst(200)))).forEach(c => { l.push(c.key); });
    const i = l.indexOf(uid); return { r: i >= 0 ? i + 1 : l.length + 1, deja };
  } catch (e) { console.warn('trésor', e?.message); return { r: 4, deja: false }; }
}
async function chercheurs() {
  if (VIE.local) return TR.r > 0 ? [{ n: VIE.data?.nom || 'Toi', moi: true }] : [];
  const { d, db } = await firebase(), l = [];
  (await d.get(d.query(d.ref(db, `zem_tresor/${TR.sem}`), d.orderByChild('t'), d.limitToFirst(10)))).forEach(c => { l.push({ ...c.val(), moi: c.key === VIE.ref?.key }); });
  return l;
}

// ---------- La fenêtre ----------
export function ouvrirTresor() { if (TR.charge) afficher(); }
function restant() { const ms = Math.max(0, finSemaine() - Date.now()), j = Math.floor(ms / JOUR), h = Math.floor(ms % JOUR / H); return j ? `${j} j ${h} h` : `${h} h`; }
async function afficher() {
  const el = $('#vieFiche'); if (!el) return;
  if (!ouverte()) fermerFiche();
  const [, , ind] = cachette(TR.sem), n = indicesOuverts();
  const indices = ind.map((x, k) => `<li class="${k < n ? '' : 'ferme'}"><i class="vf-icone">${k < n ? '🗝️' : '🔒'}</i><span><small>Indice ${k + 1}</small><b>${k < n ? esc(x) : ARRIVEES[k]}</b></span></li>`).join('');
  const etat = TR.r > 0 ? `<p class="tz-trouve">Tu l’as trouvé : ${rangTxt(TR.r)} de la semaine ! Un nouveau trésor sera caché dimanche à 20 h.</p>` : TR.r < 0 ? '<p class="tz-trouve">Ouverture du coffre…</p>' : '';
  $('#vfContenu').innerHTML = `<div class="tz"><small class="vf-sur">Ma vie</small><h3 id="vfTitre">Le trésor de la semaine</h3>
    <p class="vf-intro">Un coffre est caché quelque part, le même pour tout le monde. Trois indices : le premier en début de semaine, puis mardi et jeudi à 20 h. Une colonne de lumière dorée le signale quand tu approches ; touche-le pour l’ouvrir.</p>
    ${etat}<ol class="jr-missions tz-indices">${indices}</ol>
    <p class="tz-primes">1er : ${fmt(PRIMES[0])} · 2e : ${fmt(PRIMES[1])} · 3e : ${fmt(PRIMES[2])} · ensuite : ${fmt(PRIME)}</p>
    <h4 class="tz-h">Déjà trouvé par</h4><ol class="pm-liste" id="tzListe"><li class="pm-vide">Chargement…</li></ol>
    <div class="vf-pied"><span id="tzRebours">Nouveau trésor dans ${restant()}</span></div></div>`;
  el.hidden = false;
  try {
    if (!TR.liste || Date.now() - TR.listeT > 30000) { TR.liste = await chercheurs(); TR.listeT = Date.now(); }
    const liste = $('#tzListe'); if (!liste || !ouverte()) return;
    liste.innerHTML = TR.liste.length ? TR.liste.map((x, i) => `<li class="${x.moi ? 'moi' : ''}"><b class="pm-rang">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</b><span><b>${esc(x.n || 'Joueur')}</b></span><b class="pm-val">${fmt(primeDe(i + 1))}</b></li>`).join('')
      : '<li class="pm-vide">Personne ne l’a encore trouvé : à toi de jouer !</li>';
  } catch (e) { console.warn('trésor', e?.message); const liste = $('#tzListe'); if (liste) liste.innerHTML = '<li class="pm-vide">La liste n’a pas pu être chargée.</li>'; }
}
