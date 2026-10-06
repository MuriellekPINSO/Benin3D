import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { $, LITE, toXZ } from './base.js';
import { son } from './audio.js';
import { PLACES } from './donnees-lieux.js';
import { groupeLieu } from './lieux.js';
import { personne } from './discussions.js';
import { JEU, fmtF, sauver } from './jeu.js';
import { parler, voixDe } from './voix.js';

// ---------- Marchés artisanaux des sites touristiques ----------
// Des étals d'objets d'art (modèles 3D fournis, allégés par scripts/masques.mjs) près
// de la Porte du Non-Retour, de l'Arène de Ouidah et de la Place de l'Amazone. On
// discute le prix avec la vendeuse et on paie avec la cagnotte gagnée en zém ; l'objet
// rejoint « Mes souvenirs ».

export const OBJETS = {
  'tete-sculptee': { nom: 'Masque Guèlèdè', prix: 25000, h: .62, desc: 'Masque-heaume des cérémonies Guèlèdè du pays nago (Kétou, Savè), coiffé de petites figures sculptées.' },
  statue: { nom: 'Statuette en bronze', prix: 18000, h: .68, desc: 'Fondue à la cire perdue, dans la tradition des bronziers d’Abomey.' },
  'portrait-cubiste': { nom: 'Buste de femme au foulard', prix: 12000, h: .52, desc: 'Sculpture de bois peinte de couleurs vives, comme on en trouve au marché artisanal.' },
  'creature-paille': { nom: 'Masque de raphia à cornes', prix: 10000, h: .45, desc: 'Masque de bois noirci sous une crinière de raphia, avec ses deux cornes.' },
  'sphere-rouge': { nom: 'Coussin rouge aux cauris', prix: 6000, h: .26, desc: 'Coussin de tissu rouge cousu de cauris, les coquillages qui servaient autrefois de monnaie.' },
};
const VENDEUSES = ['Maman Akpénè', 'Tanti Houéfa', 'Maman Sènami', 'Tanti Ablawa'];
const ART = { modeles: null, promesse: null };
function chargerArt() {
  if (ART.promesse) return ART.promesse;
  const L = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  ART.promesse = Promise.all(Object.keys(OBJETS).map(id => L.loadAsync(import.meta.env.BASE_URL + `modeles/${id}.glb`)
    .then(g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = !LITE; o.receiveShadow = true; if (o.material.metalness > .5) o.material.metalness = id === 'statue' ? .55 : .1; } }); return [id, g.scene]; })
    .catch(() => [id, null]))).then(l => (ART.modeles = Object.fromEntries(l)));
  return ART.promesse;
}
/** Une copie de l'objet, posée au sol, haute de `h` m (modèles normalisés à ~1 m). */
function objet(id, h) {
  const src = ART.modeles?.[id]; if (!src) return null;
  const b = new THREE.Box3().setFromObject(src), haut = b.max.y - b.min.y || 1, o = src.clone();
  o.scale.setScalar(h / haut); return o;
}

// ---------- L'étal ----------
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .8, ...o });
function wax() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = '#c8382f'; c.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const cx = x * 64 + 32, cy = y * 64 + 32; c.fillStyle = (x + y) % 2 ? '#f2c21b' : '#1f6f8b'; c.beginPath(); c.arc(cx, cy, 22, 0, 7); c.fill(); c.fillStyle = '#f4efe6'; c.beginPath(); c.arc(cx, cy, 9, 0, 7); c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1); return t;
}
const ETALS = [];
function etal(nom, graine) {
  const g = new THREE.Group(), add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = !LITE; o.receiveShadow = true; g.add(o); return o; };
  const bois = mat('#7a5232'), tole = mat('#9aa3a8', { metalness: .3, roughness: .5 });
  add(new THREE.BoxGeometry(3, .08, 1.1), bois, 0, .82, 0);
  add(new THREE.BoxGeometry(3.05, .55, .02), new THREE.MeshStandardMaterial({ map: wax(), roughness: .9 }), 0, .55, .56);
  for (const x of [-1.4, 1.4]) for (const z of [-.45, .45]) add(new THREE.BoxGeometry(.07, .82, .07), bois, x, .41, z);
  for (const x of [-1.65, 1.65]) for (const z of [-1.3, .8]) add(new THREE.CylinderGeometry(.04, .04, 2.6, 6), bois, x, 1.3, z);
  const toit = add(new THREE.BoxGeometry(3.7, .05, 2.6), tole, 0, 2.62, -.25); toit.rotation.x = .12;
  // Panneau peint.
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const c = cv.getContext('2d');
  c.fillStyle = '#f4efe6'; c.fillRect(0, 0, 512, 128); c.fillStyle = '#7a1f2b'; c.font = '900 50px Impact, "Arial Black", sans-serif'; c.textAlign = 'center'; c.fillText('ART · SOUVENIRS', 256, 72); c.font = '700 26px system-ui, sans-serif'; c.fillStyle = '#1d1a16'; c.fillText(nom.toUpperCase(), 256, 110, 490);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const p = add(new THREE.PlaneGeometry(2.4, .6), new THREE.MeshBasicMaterial({ map: t }), 0, 2.25, .82); p.castShadow = false;
  const v = personne(graine, { femme: true }); v.position.set(.4, 0, -.95); g.add(v);
  const e = { g, nom, vendeuse: v, nomVendeuse: VENDEUSES[graine % VENDEUSES.length], places: [], charge: false };
  // Emplacements des objets : sur la table, et les plus grands devant, au sol.
  e.places = [['tete-sculptee', -1.05, .86, .05], ['portrait-cubiste', -.35, .86, .1], ['sphere-rouge', .3, .86, .12], ['creature-paille', .95, .86, .05], ['statue', 2.1, 0, .6]];
  ETALS.push(e); return e;
}
function monter(e) {
  for (const [id, x, y, z] of e.places) {
    const o = objet(id, id === 'statue' ? .95 : OBJETS[id].h); if (!o) continue;
    o.position.set(x, y, z); o.rotation.y = (Math.random() - .5) * .5; e.g.add(o);
  }
}

/** Pose les étals près des sites touristiques. */
export function construireEtals(L) {
  const place = (siteId, dx, dz, rot, nom, graine, pres) => {
    const p = PLACES.find(q => q.id === siteId); if (!p) return null;
    const [x, z] = toXZ(p.lat, p.lon), gl = groupeLieu('Marché artisanal · ' + nom, x + dx, z + dz, -rot);
    gl.userData.portee = 2500; gl.userData.site = siteId;
    const e = etal(nom, graine); gl.add(e.g); e.lieu = gl; e.site = siteId; e.pres = pres; return e;
  };
  // Porte du Non-Retour : sur l'esplanade, côté ouest, tournés vers le passage.
  place('porte', -22, -24, Math.PI / 2, 'Porte du Non-Retour', 0, 'de la Porte du Non-Retour');
  place('porte', -22, -31, Math.PI / 2, 'Porte du Non-Retour', 1, 'de la Porte du Non-Retour');
  // Arène de Ouidah : sur l'esplanade du sud-ouest.
  place('arene', -80, 45, Math.PI / 2, 'Arène de Ouidah', 2, 'de l’Arène de Ouidah');
  // Place de l'Amazone : au bord de l'esplanade.
  if (L.amazone) place('amazone', 42, 30, -Math.PI / 2, 'Place de l’Amazone', 3, 'de la place de l’Amazone');
}
/** Charge les objets à l'approche et anime les vendeuses. */
export function animerEtals(t, cam) {
  for (const e of ETALS) {
    const d = cam.distanceTo(e.lieu.userData.centre);
    if (!e.charge && d < 1500) { e.charge = true; chargerArt().then(() => monter(e)); }
    if (d < 400) e.vendeuse.userData.anim(t, BQ.etal === e && BQ.parle > 0);
  }
  if (BQ.parle > 0) BQ.parle -= 1 / 60;
}
/** Étal à moins de `r` mètres de (x, z), ou null. */
export function etalPres(x, z, r = 250) {
  let best = null, bd = r;
  for (const e of ETALS) { const c = e.lieu.userData.centre, d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = e; } }
  return best;
}
export const sitesAvecEtal = () => new Set(ETALS.map(e => e.site));

// ---------- La boutique : discuter, payer ----------
const BQ = { etal: null, objet: null, rendu: null, scene: null, cam: null, vue: null, boucle: 0, parle: 0, apres: null };
const arrondi = p => Math.round(p / 500) * 500;
function dit(txt) { $('#bqDit').textContent = `« ${txt} »`; BQ.parle = 2; parler(txt, voixDe(BQ.etal?.vendeuse), 2); }
function choix(liste) {
  const box = $('#bqChoix'); box.innerHTML = '';
  liste.forEach(([t, f], k) => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<kbd>${k + 1}</kbd>${t}`; b.addEventListener('click', f); box.append(b); });
}
function bourse() { $('#bqBourse').textContent = `Ta cagnotte : ${fmtF(JEU.prog.cagnotte)}`; }
function possede(id) { return JEU.prog.souvenirs?.some(s => s.id === id); }
function listeObjets() {
  const box = $('#bqObjets'); box.innerHTML = '';
  for (const [id, O] of Object.entries(OBJETS)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = BQ.objet === id ? 'actif' : '';
    b.innerHTML = `<b>${O.nom}</b><small>${possede(id) ? '✓ dans tes souvenirs' : fmtF(O.prix)}</small>`;
    b.addEventListener('click', () => choisirObjet(id)); box.append(b);
  }
}
function payer(id, prix) {
  const P = JEU.prog;
  if (P.cagnotte < prix) { dit(`Il te manque ${fmtF(prix - P.cagnotte)}… Fais encore quelques courses de zém et reviens !`); choix([['D’accord, je reviens', accueil]]); son('bosse'); return; }
  P.cagnotte -= prix; (P.souvenirs ||= []).push({ id, prix, lieu: BQ.etal.nom, date: new Date().toISOString().slice(0, 10) }); sauver();
  son('piece'); son('arret'); dit(`Merci ! Que Dieu te bénisse. Ton ${OBJETS[id].nom.toLowerCase()} va bien décorer ta maison !`);
  bourse(); listeObjets(); choix([['Voir un autre objet', accueil], ['Au revoir', fermerBoutique]]);
}
function choisirObjet(id) {
  BQ.objet = id; const O = OBJETS[id], prix = O.prix;
  apercu(id); listeObjets();
  $('#bqDesc').textContent = O.desc;
  if (possede(id)) { dit(`Tu l’as déjà acheté chez nous ! Regarde les autres.`); choix([['Voir les autres', accueil]]); return; }
  dit(`${O.nom} ? C’est ${fmtF(prix)}. C’est fait à la main, ici, près ${BQ.etal.pres} !`);
  const p60 = arrondi(prix * .6), p80 = arrondi(prix * .8), p70 = arrondi(prix * .7);
  choix([
    [`Je prends à ${fmtF(prix)}`, () => payer(id, prix)],
    [`C’est trop cher… ${fmtF(p60)} ?`, () => {
      dit(`Eh ! Ajoute un peu. ${fmtF(p80)}, c’est mon dernier prix.`);
      choix([
        [`D’accord, ${fmtF(p80)}`, () => payer(id, p80)],
        [`${fmtF(p70)}, sinon je pars`, () => {
          if (Math.random() < .55) { dit(`Bon… prends-le, c’est pour toi. ${fmtF(p70)}.`); choix([[`Payer ${fmtF(p70)}`, () => payer(id, p70)], ['Finalement non', accueil]]); }
          else { dit(`Non vraiment, je ne gagne rien. ${fmtF(p80)}.`); choix([[`D’accord, ${fmtF(p80)}`, () => payer(id, p80)], ['Non merci', accueil]]); }
        }],
        ['Non merci', accueil],
      ]);
    }],
    ['Je regarde seulement', () => { dit('Regarde bien, prends ton temps !'); choix([['Voir un autre objet', accueil]]); }],
  ]);
}
function accueil() {
  BQ.objet = null; listeObjets(); $('#bqDesc').textContent = '';
  dit(`Bonne arrivée ! Viens voir, ${JEU.prog.souvenirs?.length ? 'mon client' : 'ma sœur, mon frère'}. Tout est fait à la main.`);
  choix([['Choisis un objet dans la liste', () => choisirObjet(Object.keys(OBJETS)[0])]]);
  apercu(null);
}
/** Ouvre la boutique d'un étal (ou du plus proche du point donné). `apres` : appelé à la fermeture. */
export async function ouvrirBoutique(e, apres = null) {
  if (!e) return;
  BQ.etal = e; BQ.apres = apres;
  const el = $('#boutique'); el.hidden = false;
  $('#bqNom').textContent = e.nomVendeuse; $('#bqLieu').textContent = `Marché artisanal · ${e.nom}`;
  bourse(); accueil();
  await chargerArt(); initApercu(); apercu(BQ.objet);
}
export function fermerBoutique() {
  $('#boutique').hidden = true; cancelAnimationFrame(BQ.boucle); BQ.boucle = 0;
  const f = BQ.apres; BQ.apres = null; f?.();
}
function initApercu() {
  if (BQ.rendu) return;
  const cv = $('#bqVue'); BQ.rendu = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); BQ.rendu.setPixelRatio(Math.min(devicePixelRatio, 2));
  BQ.rendu.toneMapping = THREE.NeutralToneMapping; BQ.rendu.setSize(cv.clientWidth || 220, cv.clientHeight || 220, false);
  BQ.scene = new THREE.Scene(); BQ.scene.add(new THREE.HemisphereLight('#fff8ec', '#7a6248', 1.5)); const d = new THREE.DirectionalLight('#ffffff', 2.4); d.position.set(1.5, 3, 2.5); BQ.scene.add(d);
  BQ.cam = new THREE.PerspectiveCamera(30, 1, .05, 50);
}
function apercu(id) {
  if (!BQ.scene) return;
  if (BQ.vue) { BQ.scene.remove(BQ.vue); BQ.vue = null; }
  const ids = id ? [id] : Object.keys(OBJETS), g = new THREE.Group();
  ids.forEach((k, i) => { const o = objet(k, id ? 1 : .55); if (!o) return; o.position.x = id ? 0 : (i - (ids.length - 1) / 2) * .62; g.add(o); });
  BQ.vue = g; BQ.scene.add(g);
  const b = new THREE.Box3().setFromObject(g), c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() * .62;
  BQ.cam.position.set(c.x, c.y + r * .35, c.z + r * (id ? 2.2 : 3.1)); BQ.cam.lookAt(c);
  cancelAnimationFrame(BQ.boucle);
  const tour = t => { if ($('#boutique').hidden) return; if (BQ.vue) BQ.vue.rotation.y = id ? t / 1600 : Math.sin(t / 2400) * .4; BQ.rendu.render(BQ.scene, BQ.cam); BQ.boucle = requestAnimationFrame(tour); };
  BQ.boucle = requestAnimationFrame(tour);
}
export function initBoutique() {
  $('#bqFermer').addEventListener('click', fermerBoutique);
  $('#boutique').addEventListener('keydown', e => { if (e.key === 'Escape') fermerBoutique(); const k = +e.key; if (k >= 1 && k <= 3) $('#bqChoix').querySelectorAll('button')[k - 1]?.click(); });
}
/** Liste des souvenirs achetés (menu du jeu). */
export function souvenirsHTML() {
  const s = JEU.prog?.souvenirs || []; if (!s.length) return '';
  return `<div class="jp-souvenirs"><small>Mes souvenirs</small>${s.map(x => `<span>${OBJETS[x.id]?.nom || x.id}<i>${x.lieu}</i></span>`).join('')}</div>`;
}
