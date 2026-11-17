import * as THREE from 'three';
import { $, LITE } from './base.js';
import { actif, fetchActif } from './actifs.js';
import { son } from './audio.js';
import { fermerFiche } from './commerces.js';
import { firebase } from './firebase.js';
import { poserObstacles } from './rue.js';
import { camera, scene } from './scene.js';
import { plusTard } from './telechargements.js';
import { chargeurGLB } from './textures.js';
import { VIE, ecrireEnPlus, gagner, lireEnPlus } from './vie.js';
import { CENTRE_VILLAGE, ESPACES, VILLAGE_ACTIF, VILLAGE_DATES, VILLAGE_ORIGINE, ZONES, dansVillage } from './village-plan.js';
import { espaceCourse, ouvrirJeux } from './village-jeux.js';
import { addLabel, labels } from './interface.js';

// ---------- Le Village de l'innovation dans le jeu : la maquette en 3D, et le passeport ----------
// Le plan (où, quand, les onze espaces, la zone piétonne) est dans village-plan.js ; la maquette, dans scripts/village.mjs.
//
// Le passeport : un tampon par espace, qu'on reçoit en y entrant à pied. Les onze, et l'on a « rempli son passeport » :
// une prime dans la cagnotte, un message à toute la ville, et sa place parmi les plus rapides du jour. C'est le jeu de ceux
// qui sont au Village en vrai (le QR code du stand ouvre le jeu à l'entrée, ?village) comme de ceux qui le visitent de chez
// eux : tout le monde est dans la même ville et se croise dans les allées.
// Firebase : zem_village_dep/{uid} = { t, j } (l'heure du serveur au premier tampon du jour, écrite une fois par jour) ;
// zem_village/{jour}/{uid} = { n, dep, t } (écrit une fois : le serveur vérifie que dep est bien son premier tampon, et
// t − dep donne le temps). Enregistré aussi avec la vie (champ `village`) : { j, s (tampons, un bit par espace), d, f }.

const PRIME = 2000, TOUS = (1 << ESPACES.length) - 1;
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const nbTampons = s => { let n = 0; for (let k = 0; k < ESPACES.length; k++) if (s & (1 << k)) n++; return n; };
const duree = ms => { const s = Math.max(1, Math.round(ms / 1000)), m = Math.floor(s / 60); return m ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`; };
// Le jour du Village : celui du calendrier à Cotonou (UTC+1), pas le « jour du jeu » qui change à 20 h (journee.js).
const jourCotonou = (t = Date.now()) => new Date(t + 36e5).toISOString().slice(0, 10);

const VG = {
  modele: null, charge: null, pret: false, // la maquette en 3D
  ctx: { ligne: () => { }, dire: () => { }, position: () => null, aPied: () => true, autres: () => [], aller: () => { }, nom: () => '' },
  actif: false, j: '', s: 0, d: 0, f: 0, dep: 0, ici: -1, dedans: false, bienvenue: false, t: 0, liste: null, listeT: 0,
};
if (import.meta.env.DEV) window.__village = VG; // pour les tests

// ---------- La maquette en 3D ----------
// Téléchargée seulement quand on approche (900 m) : 1,2 Mo que les joueurs d'Akpakpa ou de Ouidah n'ont pas à payer.
const chargeur = chargeurGLB({ liberer: true, max: 1024 });
function chargerVillage(prioritaire = false) {
  if (!VILLAGE_ACTIF || VG.charge) return VG.charge;
  const [ox, oz] = VILLAGE_ORIGINE;
  VG.charge = Promise.all([
    plusTard(() => chargeur.loadAsync(actif('modeles/village/village.glb?v=1')), prioritaire ? true : { ou: () => [ox, oz] }),
    fetchActif('modeles/village/collisions.json?v=1').then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([gltf, col]) => {
    const g = gltf.scene;
    // Un demi-tour (le palais de la maquette est au nord, le vrai au sud), posé à 4 cm du sol.
    g.position.set(ox, .04, oz); g.rotation.y = Math.PI; g.name = 'village-innovation';
    g.traverse(n => {
      if (!n.isMesh) return;
      n.receiveShadow = true; n.castShadow = !LITE;
      // Le parvis, le médaillon et les jardins sont à plat : décalés en profondeur pour passer devant le sol de la ville
      // sans clignoter (comme les couches de sol, main.js), et sans ombre portée.
      const m = n.material;
      if (m && /· sol$/.test(m.name || '')) { n.castShadow = false; n.material = Object.assign(m.clone(), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -40 }); }
    });
    scene.add(g); VG.modele = g;
    // Ce qu'on ne traverse pas, à pied comme en voiture ou avec la caméra (rue.js) : [x, z, angle, longueur, épaisseur].
    if (col?.boites) poserObstacles('village', col.boites.map(([x, z, l, e]) => [ox - x, oz - z, 0, l, e]));
    VG.pret = true;
    return g;
  }).catch(e => { console.warn('Village non chargé', e?.message); VG.charge = null; });
  return VG.charge;
}
const pres = (x, z, d) => { const [ox, oz] = VILLAGE_ORIGINE; return Math.hypot(x - ox, z - oz) < d; };

// ---------- Le passeport ----------
const sauver = () => ecrireEnPlus('village', { j: VG.j, s: VG.s, d: VG.d, f: VG.f });
function lire() {
  const v = lireEnPlus('village'), j = jourCotonou();
  Object.assign(VG, v?.j === j ? { j, s: v.s | 0, d: v.d || 0, f: v.f || 0 } : { j, s: 0, d: 0, f: 0 }, { dep: 0 });
}
/** Le premier tampon du jour : le serveur note l'heure (une fois par jour), c'est le départ du chrono. */
async function depart() {
  if (VIE.local || !VIE.ref) return;
  try {
    const { d, db } = await firebase(), ref = d.ref(db, `zem_village_dep/${VIE.ref.key}`);
    let v = (await d.get(ref)).val();
    if (v?.j !== VG.j) { await d.set(ref, { t: d.serverTimestamp(), j: VG.j }); v = (await d.get(ref)).val(); }
    if (v?.j === VG.j) VG.dep = v.t;
  } catch (e) { console.warn('village : départ', e?.message); } // règles pas encore publiées : le temps reste celui du téléphone
}
async function inscrire() {
  if (VIE.local || !VIE.ref) return;
  try {
    const { d, db } = await firebase();
    if (!VG.dep) await depart();
    if (!VG.dep) return;
    const ref = d.ref(db, `zem_village/${VG.j}/${VIE.ref.key}`);
    if ((await d.get(ref)).exists()) return;
    await d.set(ref, { n: (VG.ctx.nom() || 'Joueur').slice(0, 16), dep: VG.dep, t: d.serverTimestamp() });
    VG.liste = null;
  } catch (e) { console.warn('village : classement', e?.message); }
}
/** Les plus rapides du jour (temps vérifié par le serveur), le plus rapide d'abord. */
async function lesPlusRapides() {
  if (VIE.local) return [];
  const { d, db } = await firebase(), l = [];
  (await d.get(d.ref(db, `zem_village/${VG.j}`))).forEach(c => { const v = c.val(); if (v?.t && v?.dep) l.push({ n: v.n, ms: v.t - v.dep, moi: c.key === VIE.ref?.key }); });
  return l.sort((a, b) => a.ms - b.ms);
}
function tamponner(k, discret = false) {
  const E = ESPACES[k], premier = !VG.s;
  VG.s |= 1 << k; if (premier) { VG.d = Date.now(); depart(); }
  const n = nbTampons(VG.s);
  son('piece'); majBouton();
  if (VG.s === TOUS) { finir(); return; }
  if (!discret) annonce(`Tampon ${n}/${ESPACES.length} : ${E.n} · ${E.nom}`);
  VG.ctx.ligne(`🎫 Tampon ${n}/${ESPACES.length} : ${E.nom} (${ZONES[E.zone]}). ${n === 1 ? 'Le chrono est parti : visite les onze espaces du Village le plus vite possible !' : `Encore ${ESPACES.length - n}.`}`);
  sauver();
}
async function finir() {
  VG.f = Date.now(); sauver();
  const t = duree(VG.f - VG.d);
  annonce(`Passeport rempli en ${t} !`, 6000);
  son('piece');
  VG.ctx.ligne(`🎉 Ton passeport du Village de l’innovation est rempli, en ${t} ! +${fmt(PRIME)}.`);
  VG.ctx.dire(`🎫 J’ai rempli le Passeport du Village de l’innovation en ${t} ! Qui fait mieux ?`); // toute la ville le lit
  gagner(PRIME, 'passeport du Village rempli', { source: 'jeu' }).catch(() => { });
  await inscrire();
  ouvrirPasseport();
}
// Un mot en haut de l'écran (le même bandeau que les astuces de trajets.js).
let annonceT = 0;
export function annonce(texte, ms = 3200) {
  let el = $('#slAstuce');
  if (!el) { el = document.createElement('p'); el.id = 'slAstuce'; el.className = 'sl-astuce panel'; el.setAttribute('role', 'status'); ($('#salonHud') || document.body).append(el); }
  el.textContent = texte; el.hidden = false; clearTimeout(annonceT); annonceT = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- Le salon (salon.js) : entrer, chaque image, sortir ----------
export function initVillage(ctx) {
  Object.assign(VG.ctx, ctx);
  const b = $('#slVillageBtn'); if (!b) return;
  b.hidden = !VILLAGE_ACTIF;
  b.addEventListener('click', ouvrirPasseport);
  // La même chose dans le menu (Start à la manette, Échap) : l'icône de la colonne de droite n'est pas atteignable à la manette.
  const t = $('#slVillageTuile'); if (t) { t.hidden = !VILLAGE_ACTIF; t.addEventListener('click', ouvrirPasseport); }
  if (!VILLAGE_ACTIF) return;
  // « Village visible » (Murielle, 15/11) : pendant l'événement, la maquette se télécharge pour tout le monde, après le reste
  // (le plus proche d'abord : telechargements.js), et se voit aussi du ciel ; au-delà de 6 km, on ne la dessine plus.
  chargerVillage();
  setInterval(() => { if (VG.modele) VG.modele.visible = VG.actif || pres(camera.position.x, camera.position.z, 6000); }, 1000);
  // Son étiquette au-dessus de la ville, comme celles des lieux (interface.js), placée la première ; un clic y emmène.
  const e = document.createElement('button'); e.type = 'button'; e.className = 'lbl lbl-place lbl-village'; e.tabIndex = -1;
  e.style.setProperty('--k', '#1f3f95');
  e.innerHTML = `<span class="pill"><span class="dot"></span>Village de l’innovation · ${VILLAGE_DATES}</span><span class="stem"></span>`;
  e.addEventListener('click', () => document.dispatchEvent(new Event('kv:village')));
  addLabel(e, CENTRE_VILLAGE[0], 14, CENTRE_VILLAGE[1], 200, 'p'); labels.unshift(labels.pop());
  const mesurer = () => { labels[0].w = e.offsetWidth; labels[0].h = e.offsetHeight; }; mesurer(); document.fonts?.ready.then(mesurer);
  // Le bouton de l'accueil.
  const a = $('#acVillage'); if (a) a.hidden = false; // son clic : explorer.js (il ferme l'accueil)
}
export function entrerVillage() { if (!VILLAGE_ACTIF) return; VG.actif = true; lire(); VG.bienvenue = false; majBouton(); }
export function quitterVillage() { VG.actif = false; VG.ici = -1; VG.dedans = false; }
export function majVillage(dt) {
  if (!VG.actif) return;
  VG.t -= dt; if (VG.t > 0) return; VG.t = .25;
  const p = VG.ctx.position(); if (!p) return;
  const [x, z] = p;
  if (!VG.charge && pres(x, z, 900)) chargerVillage(pres(x, z, 250));
  if (jourCotonou() !== VG.j) { lire(); majBouton(); } // minuit : un nouveau passeport
  const dedans = dansVillage(x, z) && VG.ctx.aPied();
  if (dedans && !VG.dedans && !VG.bienvenue) {
    VG.bienvenue = true;
    const n = nbTampons(VG.s);
    if (VG.s === TOUS) VG.ctx.ligne('Te revoilà au Village de l’innovation ! Ton passeport du jour est rempli : regarde les plus rapides avec l’icône 🎫.');
    else VG.ctx.ligne(`Bienvenue au Village de l’innovation (${VILLAGE_DATES}, esplanade du Palais des Congrès) ! Ton passeport : un tampon dans chacun des onze espaces${n ? ` (tu en as ${n})` : ''}. Le chrono part au premier. L’icône 🎫 montre ceux qui manquent.`);
  }
  VG.dedans = dedans;
  // L'espace où l'on est : son nom en haut de l'écran en y entrant, et son tampon s'il manque.
  let ici = -1;
  if (dedans) for (let k = 0; k < ESPACES.length; k++) { const E = ESPACES[k]; if (Math.hypot(x - E.x, z - E.z) < E.r) { ici = k; break; } }
  if (ici !== VG.ici && ici >= 0) {
    const course = espaceCourse(ici); // une visite des stands à deux (village-jeux.js) : elle a son propre bandeau
    if (!(VG.s & (1 << ici))) tamponner(ici, course);
    else if (!course) annonce(`${ESPACES[ici].n} · ${ESPACES[ici].nom} · ${ZONES[ESPACES[ici].zone]}`, 2200);
  }
  VG.ici = ici;
}
/** Combien de joueurs de la même ville sont dans le Village en ce moment (soi compris). */
const auVillage = () => VG.ctx.autres().filter(e => typeof e?.x === 'number' && dansVillage(e.x, e.z)).length + (VG.dedans ? 1 : 0);

// ---------- Le bouton de la barre et la fenêtre ----------
function majBouton() {
  const b = $('#slVillageBtn'), pt = $('#slVillagePt'); if (!b) return;
  const n = nbTampons(VG.s), reste = ESPACES.length - n;
  b.setAttribute('aria-label', VG.s === TOUS ? 'Passeport du Village : rempli' : `Passeport du Village : ${n} tampon${n > 1 ? 's' : ''} sur ${ESPACES.length}`);
  if (pt) { pt.hidden = !VG.actif || !n || reste === 0; pt.textContent = String(reste); }
}
const ouverte = () => !$('#vieFiche')?.hidden && !!$('#vfContenu .vg');
export async function ouvrirPasseport() {
  const el = $('#vieFiche'); if (!el) return;
  if (!ouverte()) fermerFiche();
  if (VG.actif && jourCotonou() !== VG.j) lire();
  const n = nbTampons(VG.s), plein = VG.s === TOUS;
  const cases = Object.keys(ZONES).map(z => `<div class="vg-zone vg-${z}"><small>${esc(ZONES[z])}</small><ol>${ESPACES.map((E, k) => [E, k]).filter(([E]) => E.zone === z)
    .map(([E, k]) => `<li class="${VG.s & (1 << k) ? 'fait' : ''}"><b>${E.n}</b><span>${esc(E.nom)}</span><i aria-label="${VG.s & (1 << k) ? 'tamponné' : 'à visiter'}">${VG.s & (1 << k) ? '✓' : ''}</i></li>`).join('')}</ol></div>`).join('');
  const ici = VG.actif ? auVillage() : 0;
  const etat = plein ? `<p class="vg-fini"><b>Passeport rempli en ${duree(VG.f - VG.d)}</b><span>Montre cet écran au stand Kutɔnu Vibes du Village !</span></p>`
    : n ? `<p class="vg-chrono">Chrono parti au premier tampon : ${n}/${ESPACES.length}. Plus que ${ESPACES.length - n} espace${ESPACES.length - n > 1 ? 's' : ''}.</p>` : '';
  const aller = VG.actif && !VG.dedans ? '<button type="button" class="vf-ouvrir" id="vgAller">Aller au Village</button>' : VG.actif ? '<button type="button" class="vf-ouvrir" id="vgDeux">Jouer à deux</button>' : '';
  $('#vfContenu').innerHTML = `<div class="vg"><small class="vf-sur">Le Village de l’innovation · ${esc(VILLAGE_DATES)}</small><h3 id="vfTitre">Ton passeport du Village</h3>
    <p class="vf-intro">Le vrai Village est sur l’esplanade du Palais des Congrès. Ici, son double : entre dans chacun des onze espaces pour recevoir son tampon. Le chrono part au premier tampon ; les onze rapportent ${fmt(PRIME)}.</p>
    ${etat}<div class="vg-barre" style="--p:${Math.round(n / ESPACES.length * 100)}%"><i></i><span>${n} / ${ESPACES.length} tampons</span></div>
    <div class="vg-cases">${cases}</div>
    ${VG.actif ? `<p class="vg-ici">${ici > 1 ? `${ici} joueurs sont au Village en ce moment : salue-les !` : ici === 1 ? 'Tu es seul au Village pour l’instant : invite tes amis (« Inviter »).' : 'Personne de ta ville n’est au Village pour l’instant.'}</p>` : ''}
    ${VG.actif ? '<p class="vg-ici">À deux, dans le Village : aux bornes de L’Arcade (08) ou avec « Jouer à deux », défie un autre joueur au duel du savoir (dix questions), aux cauris, à la visite des stands ou à l’adji.</p>' : ''}
    <h4 class="tz-h">Les plus rapides aujourd’hui</h4><ol class="pm-liste" id="vgListe"><li class="pm-vide">Chargement…</li></ol>
    <div class="vf-pied"><span>${plein ? 'Un nouveau passeport demain matin.' : 'Les tampons arrivent quand tu entres dans un espace.'}</span>${aller}</div></div>`;
  el.hidden = false;
  $('#vgAller')?.addEventListener('click', () => { fermerFiche(); VG.ctx.aller('village'); });
  $('#vgDeux')?.addEventListener('click', () => { fermerFiche(); ouvrirJeux(); });
  try {
    if (!VG.liste || Date.now() - VG.listeT > 20000) { VG.liste = await lesPlusRapides(); VG.listeT = Date.now(); }
    const liste = $('#vgListe'); if (!liste || !ouverte()) return;
    liste.innerHTML = VG.liste.length ? VG.liste.slice(0, 10).map((x, i) => `<li class="${x.moi ? 'moi' : ''}"><b class="pm-rang">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</b><span><b>${esc(x.n || 'Joueur')}</b></span><b class="pm-val">${duree(x.ms)}</b></li>`).join('')
      : '<li class="pm-vide">Personne n’a encore rempli son passeport aujourd’hui : à toi de jouer !</li>';
  } catch (e) { console.warn('village', e?.message); const liste = $('#vgListe'); if (liste) liste.innerHTML = '<li class="pm-vide">Le classement n’a pas pu être chargé.</li>'; }
}
/** Pour l'arrivée par le QR code : la maquette tout de suite, avant même d'entrer en ville. */
export const prechargerVillage = () => chargerVillage(true);
