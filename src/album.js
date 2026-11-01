import { $, toXZ } from './base.js';
import { son } from './audio.js';
import { montrerDestination } from './carte-salon.js';
import { fermerFiche } from './commerces.js';
import { KCOL, PLACES } from './donnees-lieux.js';
import { gagnerReputation } from './journee.js';
import { camera, renderer, scene } from './scene.js';
import { pointDeRoute } from './trajets.js';
import { VIE, ecrireEnPlus, gagner, lireEnPlus, signaler } from './vie.js';

// ---------- L'album de Cotonou : une carte par lieu, qu'on découvre en y allant ----------
// Lagos Life fait collectionner ; ici, ce qu'on collectionne, c'est la ville elle-même. 34 lieux de la carte
// (donnees-lieux.js) en cinq pages : Ganvié et le lac Nokoué n'y sont pas, on ne peut pas y aller. On découvre une carte en
// passant près du lieu, à pied, au volant ou derrière un zém : elle se retourne avec la photo prise à ce moment-là (son
// personnage devant le lieu), l'histoire du lieu et la date. Chaque carte, chaque page complète et l'album entier rapportent
// des francs et de la réputation (★, journee.js). Le nombre de cartes va au classement, onglet « Explorateurs » (palmares.js).
// Enregistré avec la vie (champ `album` de zem_vies) : { c: { id: jour } }, le jour en nombre de jours depuis 1970. Les
// photos (15 Ko environ chacune) restent sur l'appareil, trop lourdes pour la base : sur un autre téléphone, la carte
// s'affiche sans sa photo.

// [id, rayon] : on découvre la carte à moins de `rayon` mètres du lieu. Le rayon tient compte de la rue la plus proche
// (le centre du stade est à 185 m de la route) et de la taille du lieu (un port, un campus, une ville).
export const PAGES = [
  ['coeur', 'Le cœur de Cotonou', [['etoile', 120], ['dantokpa', 120], ['ganhi', 70], ['cathedrale', 70], ['bceao', 70], ['zongo', 75], ['chenal', 90], ['moov', 70]]],
  ['marina', 'La Marina', [['amazone', 100], ['jardin', 110], ['martyrs', 75], ['marina', 105], ['congres', 120], ['cite', 120], ['usa', 125], ['golden', 85], ['novotel', 80], ['mtn', 70]]],
  ['mer', 'Le bord de mer', [['fidjrosse', 100], ['dome', 70], ['murport', 150], ['agl', 70], ['port', 200], ['corniche', 120]]],
  ['quartiers', 'Les quartiers', [['haievive', 150], ['seme', 70], ['aeroport', 200], ['bioguera', 70], ['superu', 95], ['stade', 240]]],
  ['loin', 'Plus loin', [['uac', 200], ['calavi', 300], ['porte', 70], ['arene', 145]]],
];
const CARTES = PAGES.flatMap(([page, , l]) => l.map(([id, rayon]) => ({ id, rayon, page, P: PLACES.find(p => p.id === id) }))).filter(c => c.P);
export const TOTAL_ALBUM = CARTES.length;
const OUIDAH = new Set(['porte', 'arene']);
// Dans une salle du jeu (interieurs.js), la carte du bâtiment se découvre aussi.
const SALLES = { cite: 'cite-foodcourt', aeroport: 'aeroport-hall' };
const ICONES = { hotel: '🏨', savoir: '🎓', monument: '🗿', marche: '🧺', eau: '🌊', transport: '⚓', culte: '🕊️', plage: '🏖️', institution: '🏛️', quartier: '🏘️' };
const PRIME = 200, REP = 10, PRIME_PAGE = 2000, REP_PAGE = 50, PRIME_ALBUM = 10000, REP_ALBUM = 200;
const JOUR = 864e5;
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const dateDe = j => new Date(j * JOUR + 12 * 36e5).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const centre = C => toXZ(C.P.lat, C.P.lon);

const A = { charge: false, c: {}, photos: null, t: 0, vue: '', ligne: () => { }, position: () => null, salle: () => '', libre: () => true };
const ouverte = () => !$('#vieFiche')?.hidden && !!$('#vfContenu .ab');
export const cartesTrouvees = () => Object.keys(A.c).filter(id => CARTES.some(C => C.id === id)).length;

// ---------- Les photos : sur l'appareil seulement ----------
const clePhotos = () => `cotonou3d.album.photos${VIE.local ? '.local' : VIE.ref?.key ? `.${VIE.ref.key}` : ''}`;
function photos() {
  if (!A.photos) { try { A.photos = JSON.parse(localStorage.getItem(clePhotos()) || '{}') || {}; } catch { A.photos = {}; } }
  return A.photos;
}
function garderPhoto(id, url) {
  if (!url) return; photos()[id] = url;
  try { localStorage.setItem(clePhotos(), JSON.stringify(A.photos)); } catch { /* plus de place ou navigation privée : la photo vit le temps de la partie */ }
}
/**
 * La photo du lieu, prise d'un peu derrière le personnage, tournée vers le lieu : on s'y voit devant. Rendue à part avec un
 * double de la caméra (le jeu redessine l'image juste après) et lue tout de suite, avant que le navigateur n'efface l'image.
 */
function prendrePhoto(C) {
  try {
    const pos = A.position(), cam = camera.clone();
    if (pos) {
      const [px, pz, py] = pos, [cx, cz] = centre(C), d = Math.hypot(cx - px, cz - pz), ux = (cx - px) / (d || 1), uz = (cz - pz) / (d || 1);
      let recul = 4.5; while (recul > 1 && !A.libre(px - ux * recul, pz - uz * recul)) recul -= 1.2; // pas dans un mur
      cam.position.set(px - ux * recul, py + 2.3, pz - uz * recul);
      cam.up.set(0, 1, 0); cam.lookAt(cx, py + Math.min((C.P.h || 20) * .45, 4 + d * .18), cz);
      cam.fov = 58; cam.near = .3;
    }
    const src = renderer.domElement; cam.aspect = src.width / src.height; cam.updateProjectionMatrix();
    renderer.render(scene, cam);
    const L = 384, H = 240, c = document.createElement('canvas'); c.width = L; c.height = H;
    let w = src.width, h = w * H / L; if (h > src.height) { h = src.height; w = h * L / H; }
    c.getContext('2d').drawImage(src, (src.width - w) / 2, (src.height - h) / 2, w, h, 0, 0, L, H);
    return c.toDataURL('image/jpeg', .74);
  } catch (e) { console.warn('album', e?.message); return ''; }
}

// ---------- Découvrir ----------
export function initAlbum({ ligne, position, salle, libre }) {
  Object.assign(A, { ligne, position, salle, libre });
  $('#slAlbum')?.addEventListener('click', () => ouvrirAlbum());
  if (import.meta.env.DEV) window.__album = { A, decouvrir: id => { const C = CARTES.find(x => x.id === id); if (C && !A.c[id]) decouvrir(C); } }; // pour les tests
}
export function entrerAlbum() {
  const d = lireEnPlus('album'); A.c = d?.c && typeof d.c === 'object' ? d.c : {};
  A.photos = null; A.charge = true; A.t = 1.5; // laisse le temps à la ville de se poser avant la première photo
}
export function quitterAlbum() { A.charge = false; }
const sauver = () => ecrireEnPlus('album', { c: A.c });

/** Toutes les demi-secondes : est-on près d'un lieu qui manque à l'album ? */
export function majAlbum(dt) {
  if (!A.charge || !VIE.data) return;
  A.t -= dt; if (A.t > 0) return; A.t = .5;
  const pos = A.position(), salle = A.salle();
  for (const C of CARTES) {
    if (A.c[C.id]) continue;
    const [x, z] = centre(C);
    if ((salle && SALLES[C.id] === salle) || (pos && Math.hypot(x - pos[0], z - pos[1]) < C.rayon)) { decouvrir(C); return; } // une à la fois : chacune sa photo, son annonce
  }
}
function decouvrir(C) {
  A.c[C.id] = Math.floor((Date.now() + 36e5) / JOUR); sauver(); // le jour du calendrier à Cotonou (UTC+1)
  garderPhoto(C.id, prendrePhoto(C));
  const n = cartesTrouvees(), page = PAGES.find(p => p[0] === C.page), pleine = CARTES.filter(x => x.page === C.page).every(x => A.c[x.id]);
  son('piece');
  gagner(PRIME, `album : ${C.P.name}`, { source: 'prime', silencieux: true }); gagnerReputation(REP);
  A.ligne(`📸 Nouvelle carte pour ton album : ${C.P.name} ! +${fmt(PRIME)}, +${REP} ★ (${n} sur ${TOTAL_ALBUM}).`);
  signaler('album'); // la mission du jour, s'il y en a une (journee.js) : après l'annonce de la carte
  if (pleine) {
    gagner(PRIME_PAGE, `album : page « ${page[1]} »`, { source: 'prime', silencieux: true }); gagnerReputation(REP_PAGE);
    A.ligne(`Page complète : « ${page[1]} » ! +${fmt(PRIME_PAGE)}, +${REP_PAGE} ★.`);
  }
  if (n === TOTAL_ALBUM) {
    for (let reste = PRIME_ALBUM; reste > 0; reste -= 5000) gagner(Math.min(5000, reste), 'album complet', { source: 'prime', silencieux: true });
    gagnerReputation(REP_ALBUM);
    A.ligne(`Album complet : tu as vu tout Cotonou, et Ouidah ! +${fmt(PRIME_ALBUM)}, +${REP_ALBUM} ★.`);
  }
  if (ouverte()) afficher();
}

// ---------- La fenêtre ----------
export function ouvrirAlbum(vue = '') { if (!A.charge) return; A.vue = vue; afficher(); }
function carteHtml(C) {
  const j = A.c[C.id], ph = j && photos()[C.id], coul = KCOL[C.P.k] || '#c96f3b';
  return `<button type="button" class="ab-carte${j ? '' : ' cachee'}" data-ab="${C.id}" style="--c:${coul}">${j ? (ph ? `<img src="${ph}" alt="">` : `<i class="ab-ic">${ICONES[C.P.k] || '📍'}</i>`) : '<i class="ab-ic">?</i>'}<b>${j ? esc(C.P.name) : esc(C.P.kind)}</b></button>`;
}
function afficher() {
  const el = $('#vieFiche'); if (!el) return;
  if (!ouverte()) fermerFiche();
  const C = A.vue && CARTES.find(x => x.id === A.vue);
  $('#vfContenu').innerHTML = `<div class="ab"><small class="vf-sur">Ma vie</small><h3 id="vfTitre">${C ? esc(C.P.name) : 'Mon album de Cotonou'}</h3>${C ? detail(C) : grille()}</div>`;
  el.hidden = false;
  for (const b of el.querySelectorAll('[data-ab]')) b.addEventListener('click', () => { A.vue = b.dataset.ab; afficher(); });
  el.querySelector('[data-ab-retour]')?.addEventListener('click', () => { A.vue = ''; afficher(); });
  el.querySelector('[data-ab-carte]')?.addEventListener('click', () => voirSurCarte(C));
  el.querySelector('[data-ab-photo]')?.addEventListener('click', () => { garderPhoto(C.id, prendrePhoto(C)); son('piece'); afficher(); });
}
function grille() {
  const n = cartesTrouvees();
  const pages = PAGES.map(([id, nom, l]) => {
    const cs = CARTES.filter(C => C.page === id), k = cs.filter(C => A.c[C.id]).length;
    return `<section class="ab-page"><h4>${esc(nom)} <small>${k === cs.length ? '✓ complète' : `${k} sur ${cs.length}`}</small></h4><div class="ab-cartes">${cs.map(carteHtml).join('')}</div></section>`;
  }).join('');
  return `<p class="vf-intro">${!n ? 'Ton album est vide.' : n > 1 ? `${n} cartes sur ${TOTAL_ALBUM}.` : `${n} carte sur ${TOTAL_ALBUM}.`} Va voir les lieux de Cotonou : la carte se retourne quand tu arrives, avec ta photo. +${fmt(PRIME)} par carte, +${fmt(PRIME_PAGE)} par page complète, +${fmt(PRIME_ALBUM)} pour l’album entier.</p>
    <i class="jr-barre ab-barre" style="--p:${Math.round(n / TOTAL_ALBUM * 100)}%"></i>${pages}`;
}
function detail(C) {
  const j = A.c[C.id], ph = j && photos()[C.id], pos = A.position(), [x, z] = centre(C);
  const ici = j && pos && Math.hypot(x - pos[0], z - pos[1]) < C.rayon;
  const image = j ? (ph ? `<img class="ab-photo" src="${ph}" alt="">` : `<div class="ab-photo vide" style="--c:${KCOL[C.P.k] || '#c96f3b'}"><i>${ICONES[C.P.k] || '📍'}</i><small>Photo prise sur un autre appareil</small></div>`)
    : `<div class="ab-photo vide cachee"><i>?</i></div>`;
  const texte = j ? `<p class="ab-texte">${esc(C.P.text)}</p><small class="ab-date">${esc(C.P.kind)} · découvert le ${dateDe(j)}</small>`
    : `<p class="ab-texte">${esc(C.P.kind)}. Pas encore dans ton album : ${OUIDAH.has(C.id) ? 'c’est à Ouidah, prends l’avion à l’aéroport (« Aller »).' : 'va sur place : la carte se retournera à ton arrivée.'}</p>`;
  const boutons = [OUIDAH.has(C.id) ? '' : '<button type="button" class="vf-bouton" data-ab-carte>Voir sur la carte</button>', ici ? '<button type="button" class="vf-bouton" data-ab-photo>Reprendre la photo</button>' : ''].join('');
  return `${image}${texte}<div class="vf-pied"><button type="button" class="vf-bouton" data-ab-retour>Retour à l’album</button>${boutons}</div>`;
}
/** La grande carte de la ville, ouverte sur le lieu (carte-salon.js) : le chemin, un zém ou la téléportation. */
function voirSurCarte(C) {
  const [x, z] = centre(C), r = pointDeRoute(x, z, 0, C.rayon) || [x, z];
  fermerFiche();
  if (!montrerDestination({ nom: C.P.name, sous: C.P.kind, x: r[0], z: r[1], type: 'point' })) A.ligne('Sors d’abord pour y aller.');
}
