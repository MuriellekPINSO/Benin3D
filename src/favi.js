import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import './favi.css';
import { $, toXZ } from './base.js';
import { personne } from './discussions.js';
import { INTERIEURS, arriveeDedans, arriveeDehors, declarerInterieur, etiquette, lampeIci, ouvrirInterieur } from './interieurs.js';
import { K, groupeLieu, panneauTexte } from './lieux.js';
import { chercherPorte } from './maison.js';
import { chargerActeur, modeleCharge, poserAssis, personnagesCharges } from './personnages.js';
import { creerZangbeto } from './egungun.js';
import { construireReseau, noeudRelie, noeudsPres, relie } from './carrefours.js';
import { hauteur, itineraire, longueur } from './conduite.js';
import { poserObstacles } from './rue.js';
import { camera, controls, scene } from './scene.js';
import { heureAutomatique, reprendreLHeure, setMood } from './ambiances.js';
import { VIE, depenser, gagner, surSignal } from './vie.js';
import { AUDIO, audioCtx, son } from './audio.js';
import { parler, taire } from './voix.js';

// ---------- Le Favi : le mode histoire de Kutɔnu Vibes ----------
// Chapitre 1, « L'éveil », à Cadjèhoun. Mémé Houéfa gardait les cinq lignes Vo de Cotonou (les lignes d'énergie
// vodoun de la ville) ; elle est morte la nuit où M. Dorval (Horizon Bleu) a posé la première pierre d'un hôtel à
// Fidjrossè, sur l'une d'elles. Le joueur est Koffi, son petit-fils, 22 ans, zémidjan.
// Déroulé : les funérailles dans la cour de Mémé → le tirage du profil (Débrouillard ou Fils à papa) → l'offre du Chef
// de quartier (signer la promesse de vente de la maison) → la journée de travail (gagner l'argent des funérailles avec
// « Travailler », compté sur le signal 'travail' de vie.js, comme chapitres.js) → le soir, payer ou signer → 22 h, un
// Zangbeto au carrefour, sous le lit : statuette, carnet, bracelet → la ligne Vo de Cadjèhoun s'allume au sol ; on
// observe le Zangbeto de loin (s'en approcher fait perdre le bracelet : on rejoue la nuit) → au bout de la ligne, la
// vision de Cadjèhoun dans dix ans (qui dépend de la signature) → la page du carnet.
// Le vodoun n'est jamais montré comme maléfique : le Zangbeto garde la nuit, les lignes sont l'âme de la ville. Le
// méchant, c'est l'avidité.
// Le mode vit dans « Vivre à Cotonou » (salon.js) : on y entre par l'icône « Histoire » ou par ?favi dans l'adresse.
// Progression : localStorage « kutonu.favi ». ?favi&rapide : but de 500 F et scènes plus courtes (essais).
// Les portraits viendront plus tard : public/favi/portraits/<id>.jpg, listés dans index.json (sans quoi : l'initiale).

const Q = new URLSearchParams(location.search);
export const RAPIDE = Q.has('rapide');
const VIT = RAPIDE ? .5 : 1; // les scènes, deux fois plus courtes en mode rapide
const CLE = 'kutonu.favi', ID = 'favi-houefa';
const OBSERVER = RAPIDE ? 4 : 10; // secondes à regarder le Zangbeto de loin
const PRES_ZB = 6, VUE_ZB = 30; // trop près du Zangbeto ; assez près pour l'observer
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// La maison de Mémé Houéfa : une parcelle de Cadjèhoun, au bord d'une rue de quartier, sans bâtiment sur la rue (rue.js
// y bâtit le mur de clôture) — relevée avec chercherPorte (maison.js) et gardée ici pour être toujours la même.
const PRES_DE = toXZ(6.3615, 2.3975); // le centre de Cadjèhoun
const FIDJROSSE = toXZ(6.3555, 2.3690);

const PERSONNES = {
  agnes: { nom: 'Maman Agnès', couleur: '#8e4b8a', femme: true, age: 'vieux', graine: 5101 },
  chef: { nom: 'Le Chef de quartier', couleur: '#2f5f8a', femme: false, graine: 5102 },
  pere: { nom: 'Ton père', couleur: '#7a5a2a', femme: false, graine: 5103 },
  meme: { nom: 'Mémé Houéfa', couleur: '#b8862b', femme: true, age: 'vieux', graine: 5104 },
  koffi: { nom: 'Koffi', couleur: '#1a7d52', femme: false, graine: 5105 },
  ayike: { nom: 'Ayiké', couleur: '#2a4a9a', femme: true, graine: 5106 },
  guerisseuse: { nom: 'La guérisseuse', couleur: '#6f8a4a', femme: true, graine: 5107 },
};
// Leur vrai corps en 3D (personnages.js, public/modeles/favi/), d'après les croquis de Murielle et les portraits Higgsfield (25/11).
// Tant qu'il n'est pas chargé, un habitant du jeu fait la doublure (le rôle passé à pnj()).
const ACTEURS = { koffi: 'favi-koffi', agnes: 'favi-agnes', chef: 'favi-chef', pere: 'favi-pere', ayike: 'favi-ayike', guerisseuse: 'favi-guerisseuse' };
const PROFILS = {
  debrouillard: { nom: 'Débrouillard', but: 10000, carte: 'Élevé par Mémé Houéfa · presque pas d’argent · un zém fatigué', texte: 'C’est Mémé Houéfa qui t’a élevé. Ton zém tousse, tes poches sont presque vides, mais tu connais chaque rue de Cadjèhoun.' },
  fils: { nom: 'Fils à papa', but: 5000, carte: 'De l’argent · mais ton père travaille pour Horizon Bleu', texte: 'Ton père a bien réussi : il travaille pour Horizon Bleu, la société de M. Dorval. Tu ne manques de rien… sauf de réponses.' },
};
const HEURE = { funerailles: 'jour', profil: 'jour', offre: 'jour', jour: 'jour', soir: 'soir', nuit: 'nuit', ligne: 'nuit', vision: 'nuit', fin: 'nuit' };

const neuf = () => ({ v: 1, etape: 'funerailles', profil: '', gagne: 0, signe: null, paye: false, fini: false, essais: 0 });
function lire() { try { const e = JSON.parse(localStorage.getItem(CLE) || 'null'); return e?.v === 1 ? { ...neuf(), ...e } : neuf(); } catch { return neuf(); } }
function sauver() { try { localStorage.setItem(CLE, JSON.stringify(F.e)); } catch { /* navigation privée */ } }

const F = {
  ctx: null, e: lire(), actif: false, venir: Q.has('favi'), jeton: 0, bloque: false, cam: null, t: 0,
  maison: null, pnj: {}, foule: null, nuitObjets: null, bougies: [], trace: null, ligne: null, zb: null, seuils: [], fin: null,
  vision: null, avant: null, dlg: null, observe: 0, dedans: false, enScene: false, portraits: new Set(), musique: null, ui: null,
};
if (Q.get('favi') === 'nouveau') { F.e = neuf(); sauver(); }
if (import.meta.env.DEV) window.__favi = { F, passer: e => passer(e), gagner: n => gagner(n, 'essai', { source: 'travail' }), vision: () => jouer(sceneVision), echec: () => jouer(echec), permission: () => jouer(permission) }; // pour les tests

/** Demandé par ?favi ou par l'icône « Histoire » avant d'entrer en ville : la partie commence dans la cour de Mémé. */
export const faviDemande = () => F.venir;
export function demanderFavi(on) { if (!F.actif) F.venir = !!on; }
export const faviActif = () => F.actif;
/** Pendant une scène, un dialogue ou une carte : le joueur ne marche pas (salon.js). */
export const faviBloque = () => F.actif && F.bloque;
const but = () => (RAPIDE ? 500 : PROFILS[F.e.profil]?.but ?? 10000);
const S = () => F.ctx.S;
const app = () => document.getElementById('app');

// ---------- Les attentes d'une scène ----------
// Une scène est une suite d'attentes (pause, dialogue, fondu) ; quitter la ville ou l'histoire l'interrompt : le jeton
// change, et la prochaine attente lève ANNULE, que jouer() attrape.
const ANNULE = Symbol('annulé');
function pause(s) { const j = F.jeton; return new Promise((ok, ko) => setTimeout(() => (j === F.jeton ? ok() : ko(ANNULE)), s * 1000 * VIT)); }
async function jouer(scene) {
  if (F.enScene) return; F.enScene = true; const j = F.jeton;
  try { await scene(); } catch (e) { if (e !== ANNULE) console.error('favi', e); } finally { if (j === F.jeton) F.enScene = false; } // une scène interrompue ne libère pas la suivante
}
const verifier = j => { if (j !== F.jeton) throw ANNULE; };

// ---------- Interface ----------
function creerInterface() {
  if (F.ui) return;
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); const n = t.content.firstChild; app().append(n); return n; };
  F.ui = {
    hud: el('<div class="favi-hud" id="faviHud" hidden role="status"><small>Le Favi · Chapitre 1 · L’éveil</small><span id="faviTxt"></span><i class="fh-barre" hidden><i></i></i></div>'),
    dlg: el('<div class="favi-dlg" id="faviDlg" hidden role="dialog" aria-live="polite"><span class="fd-portrait"><img alt="" hidden><b></b></span><div class="fd-corps"><small class="fd-nom"></small><p class="fd-texte"></p><div class="fd-choix"></div></div></div>'),
    voile: el('<div class="favi-voile" id="faviVoile" aria-hidden="true"></div>'),
    titre: el('<div class="favi-titre" id="faviTitre" hidden aria-live="polite"><small></small><h2></h2><p></p></div>'),
    fiche: el('<div class="favi-fond" id="faviFiche" hidden role="dialog" aria-modal="true"><div class="favi-fiche panel"></div></div>'),
    vision: el('<div class="favi-vision-voile" id="faviVisionVoile" aria-hidden="true"></div>'),
    vignette: el('<div class="favi-vignette" aria-hidden="true"></div>'),
  };
  // Clavier : 1 et 2 choisissent dans un dialogue, E ou Entrée prend le premier choix. Pris avant le salon (capture),
  // sinon E ferait aussi l'action du lieu (sortir, entrer) derrière le dialogue.
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && F.panneau) { e.preventDefault(); e.stopImmediatePropagation(); F.fermerFiche?.(); return; } // le panneau « Histoire » se ferme comme les autres fenêtres
    if (!F.actif) return;
    const D = F.dlg; if (!D) return;
    const k = /^(Digit|Numpad)([1-3])$/.exec(e.code), i = k ? +k[2] - 1 : (e.code === 'KeyE' || e.key === 'Enter' || e.code === 'Space') ? 0 : -1;
    if (i < 0) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) D.boutons[i]?.click();
  }, true);
}
function majHud() {
  const U = F.ui; if (!U) return;
  const e = F.e, txt = F.actif && !F.bloque ? texteEtape() : '';
  U.hud.hidden = !txt;
  if (!txt) return;
  const sp = U.hud.querySelector('#faviTxt'); if (sp.textContent !== txt) sp.textContent = txt;
  const barre = U.hud.querySelector('.fh-barre'), p = e.etape === 'jour' ? Math.min(1, e.gagne / but()) : e.etape === 'ligne' && F.zb && !F.zb.permis && F.observe > 0 ? Math.min(1, F.observe / OBSERVER) : -1;
  barre.hidden = p < 0; if (p >= 0) barre.firstChild.style.width = `${Math.round(p * 100)}%`;
}
function texteEtape() {
  const e = F.e, dans = F.dedans;
  switch (e.etape) {
    case 'jour': return `Gagne ${fmt(but())} avant la nuit pour les funérailles : le rond du menu, à droite, puis « Travailler ». ${fmt(Math.min(e.gagne, but()))} sur ${fmt(but())}.`;
    case 'soir': return dans ? 'La famille t’attend dans la cour.' : 'Le soir tombe. Rentre chez Mémé Houéfa, à Cadjèhoun : suis le chemin au sol.';
    case 'nuit': return dans ? 'Entre dans la chambre de Mémé Houéfa, au fond de la cour, et regarde sous son lit.' : '22 h. Entre chez Mémé Houéfa et regarde sous son lit.';
    case 'ligne':
      if (dans) return 'Sors dans la rue. Regarde le sol.';
      if (!F.zb || F.zb.permis) return 'Le Zangbeto t’a laissé passer. Suis la ligne jusqu’au bout.';
      return F.observe > 0 ? `Ne t’approche pas. Observe le Zangbeto… ${Math.max(0, Math.ceil(OBSERVER - F.observe))} s` : 'Suis la ligne. Un Zangbeto garde le carrefour : ne t’approche pas, observe-le de loin.';
    default: return '';
  }
}

/** Un portrait rond : l'image s'il y en a une (public/favi/portraits/<id>.jpg, listée dans index.json), sinon l'initiale. */
function portrait(span, id) {
  const P = PERSONNES[id] || { nom: '…', couleur: '#555' }, img = span.querySelector('img'), b = span.querySelector('b');
  span.style.setProperty('--c', P.couleur);
  const vrai = F.portraits.has(id);
  img.hidden = !vrai; if (vrai) img.src = `${import.meta.env.BASE_URL}favi/portraits/${id}.jpg`;
  b.hidden = vrai; b.textContent = (P.nom.replace(/^(Le |La |Ton |Maman |Mémé )/, '')[0] || '?').toUpperCase();
}
/**
 * Une carte de dialogue en bas de l'écran : le portrait, le nom, le texte, un à trois choix (1, 2, 3 ou E au clavier).
 * Rend l'indice du choix. `qui` : une clé de PERSONNES ; `pnj` : le personnage 3D qui parle (bulle et geste) ;
 * `desactives` : les choix grisés (payer sans l'argent).
 */
function dire(qui, texte, choix = ['Continuer'], { pnj = null, desactives = [], voix = true } = {}) {
  const j = F.jeton, U = F.ui, P = PERSONNES[qui] || {};
  portrait(U.dlg.querySelector('.fd-portrait'), qui);
  U.dlg.querySelector('.fd-nom').textContent = P.nom || '';
  U.dlg.querySelector('.fd-texte').textContent = texte;
  const zone = U.dlg.querySelector('.fd-choix'); zone.replaceChildren();
  if (pnj) { pnj.g.userData.jouer?.('parle'); pnj.parle = true; } // pas de bulle en plus : la carte porte le texte
  if (voix && P.nom && qui !== 'koffi') parler(texte, { femme: P.femme, graine: P.graine, age: P.age, fort: true }, 2);
  return new Promise((ok, ko) => {
    const boutons = choix.map((c, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-bouton';
      b.innerHTML = `${choix.length > 1 ? `<kbd>${i + 1}</kbd>` : ''}${esc(c)}`; b.disabled = desactives.includes(i);
      b.addEventListener('click', () => { if (b.disabled) return; fermer(); son('arret'); ok(i); });
      zone.append(b); return b;
    });
    const fermer = () => { F.dlg = null; U.dlg.hidden = true; if (pnj) { pnj.parle = false; pnj.g.userData.jouer?.('idle'); } };
    F.dlg = { boutons, annuler: () => { fermer(); ko(ANNULE); } };
    U.dlg.hidden = false; U.dlg.classList.remove('entre'); void U.dlg.offsetWidth; U.dlg.classList.add('entre');
    if (j !== F.jeton) F.dlg.annuler();
  });
}
/** Une fenêtre au milieu de l'écran (le tirage, les objets, le carnet) : rend l'indice du bouton choisi. */
function fiche(html, boutons, classe = '') {
  const U = F.ui, boite = U.fiche.firstChild;
  boite.className = `favi-fiche panel ${classe}`;
  boite.innerHTML = `${html}<div class="ff-boutons">${boutons.map((b, i) => `<button type="button" class="${i ? 'sl-lien' : 'jouer'}" data-i="${i}">${esc(b)}</button>`).join('')}</div>`;
  U.fiche.hidden = false;
  return new Promise((ok, ko) => {
    const j = F.jeton;
    boite.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { U.fiche.hidden = true; F.fermerFiche = null; ok(+b.dataset.i); }));
    F.fermerFiche = () => { U.fiche.hidden = true; F.fermerFiche = null; ko(ANNULE); };
    boite.querySelector('[data-i]')?.focus({ preventScroll: true });
    if (j !== F.jeton) F.fermerFiche();
  });
}
/** Fondu au noir (true) ou retour à l'image (false). */
function voile(noir, duree = .8) {
  const v = F.ui.voile; v.style.transitionDuration = `${duree * VIT}s`; v.classList.toggle('noir', noir);
  return pause(duree);
}
/** Un titre au milieu de l'écran, quelques secondes. */
async function titre(sur, h, p = '', duree = 3.2) {
  const t = F.ui.titre; t.querySelector('small').textContent = sur; t.querySelector('h2').textContent = h; t.querySelector('p').textContent = p;
  t.hidden = false; t.classList.remove('sort'); await pause(duree * (RAPIDE ? 1.5 : 1)); t.classList.add('sort'); await pause(.6); t.hidden = true; // les titres, à lire : à peine raccourcis en mode rapide
}

// ---------- La maison de Mémé Houéfa (dans la ville) ----------
function trouverPorte() { return chercherPorte(PRES_DE[0], PRES_DE[1], false, [4, 5]); }
function declarerMaison() {
  if (F.maison) return F.maison;
  const P = trouverPorte(); if (!P) return null;
  const dehors = Math.atan2(-P.nx, -P.nz), g = groupeLieu('porte-favi-houefa', P.x, P.z); g.rotation.y = dehors;
  K.into(g, () => portailHouefa(P));
  const etq = etiquette('Chez Mémé Houéfa'); etq.position.set(0, 3.7, .4); g.add(etq);
  declarerInterieur(ID, {
    nom: 'la cour de Mémé Houéfa', entrer: 'Entrer chez Mémé Houéfa', titre: 'dans la cour de Mémé Houéfa, à Cadjèhoun', discret: true, sansAmpoule: true, // pas « privée » : ce n'est pas un logement (maison.js) ; discrète : on ne l'annonce pas en ville
    plafond: 3.2, lampe: .6, // une ampoule sous la bâche : la nuit, la cour reste sombre
    porte: [P.x - P.nx * 1.4, P.z - P.nz * 1.4], dehors, centre: [P.x, 7800], w: 16, d: 14, entree: [0, -5.6, 0], construire: I => cour(I),
  });
  F.maison = { P, g, etq, I: INTERIEURS.get(ID), dehors };
  return F.maison;
}
function ouvrirMaison(on) {
  const M = declarerMaison(); if (!M) return null;
  if (on) INTERIEURS.set(ID, M.I); else INTERIEURS.delete(ID); // fermée : sa porte ne se propose plus (porteProche)
  M.g.visible = on; return M;
}
K.motif('pagneFavi', (c, t) => { // le pagne des funérailles, le même pour toute la famille : indigo, ronds blancs et or
  c.fillStyle = '#1f2f6e'; c.fillRect(0, 0, t, t);
  for (const [x, y] of [[64, 64], [192, 192]]) for (let r = 52, k = 0; r > 6; r -= 11, k++) { c.fillStyle = ['#f4efe2', '#1f2f6e', '#e2a72e', '#1f2f6e'][k % 4]; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#e2a72e'; for (const [x, y] of [[192, 64], [64, 192]]) { c.save(); c.translate(x, y); c.rotate(Math.PI / 4); c.fillRect(-22, -22, 44, 44); c.fillStyle = '#f4efe2'; c.fillRect(-10, -10, 20, 20); c.restore(); c.fillStyle = '#e2a72e'; }
});
K.motif('bacheFavi', (c, t) => { // la bâche de location : toile blanche à larges bandes bleues
  for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f4f4f0' : '#2e5ea8'; c.fillRect(i * t / 8, 0, t / 8, t); }
  for (let i = 0; i < 500; i++) { c.fillStyle = 'rgba(0,0,0,.035)'; c.fillRect((i * 97) % t, (i * 61 + i * i) % t, 3, 3); }
});
K.motif('lambrequin', (c, t) => { // le bord festonné de la bâche (toile de 256 × 128)
  c.clearRect(0, 0, t, 128); c.fillStyle = '#2e5ea8'; c.fillRect(0, 0, t, 62);
  for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(i * t / 4 + t / 8, 60, t / 8 - 2, 0, Math.PI); c.fill(); }
  c.fillStyle = '#e2a72e'; c.fillRect(0, 12, t, 8);
}, 256, 128);
// Portail vert dans le mur de la parcelle (repère local : la rue vers +z), et le faire-part collé à côté.
function portailHouefa(P) {
  const vert = K.mat('#2f6b4f', { rugosite: .55, metal: .2 }), enduit = K.mat('#e6d8bd', { rugosite: .95 });
  for (const s of [-1, 1]) { K.boite(.42, 2.75, .42, enduit, s * 1.45, 1.37, -.05); K.boite(1.6, 2.5, .24, enduit, s * 2.45, 1.25, -.12); }
  K.boite(1.22, 2.3, .06, vert, -.62, 1.17, .06); K.boite(1.22, 2.3, .06, vert, .62, 1.17, .06);
  for (const y of [.5, 1.2, 1.9]) K.boite(2.44, .05, .02, K.mat('#24523d'), 0, y, .1);
  panneauTexte([`C/${100 + Math.abs(Math.round(P.x * 7 + P.z * 3)) % 900}`], .5, .26, 1.45, 2.2, .17, 0, { fond: '#e6d8bd', encre: '#2f6b4f', px: 256, py: 133, police: '800 90px system-ui, sans-serif' });
  // Le faire-part : à Cotonou, on l'affiche sur le mur de la maison du défunt.
  panneauTexte(['AVIS DE DÉCÈS', 'Mémé HOUÉFA', 'Cadjèhoun', 'Veillée et inhumation'], .62, .86, -2.45, 1.55, .19, 0, { fond: '#f6f2ea', encre: '#1d1a16', px: 512, py: 710, police: '800 64px system-ui, sans-serif' });
  K.boite(.66, .05, .03, '#1d1a16', -2.45, 1.99, .2).castShadow = false; // le bandeau noir
  // L'ampoule au-dessus du portail : allumée le soir et la nuit (majFavi).
  K.boite(.06, .3, .06, '#2b2f33', 0, 2.75, .12); const b = K.sphere(.07, K.mat('#fff4d6', { emissif: '#ffd890' }), 0, 2.58, .2); b.castShadow = false;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: matLueur('#ffd890').map, color: '#ffd28a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo.position.set(0, 2.55, .3); halo.scale.setScalar(1.1); K.racine.add(halo); F.halo = halo;
}

// ---------- La cour (une pièce à ciel ouvert, construite en mer comme les autres intérieurs) ----------
// Repère local : la rue au nord (−z), le portail au milieu du mur nord ; la maison de Mémé au sud, sa chambre à l'ouest.
const sansOmbre = m => { m.castShadow = false; return m; };
let geoChaise = null;
function chaiseGeo(h = .475) {
  return mergeGeometries([
    new THREE.BoxGeometry(.46, .05, .44).translate(0, h - .025, 0), new THREE.BoxGeometry(.46, .48, .05).translate(0, h + .245, -.22),
    ...[[-.2, -.19], [.2, -.19], [-.2, .19], [.2, .19]].map(([a, b]) => new THREE.BoxGeometry(.04, h - .025, .04).translate(a, (h - .025) / 2, b)),
  ]);
}
function chaise(I, x, z, cap, couleur, h = .475) { // une chaise monobloc à la mesure de celui qui s'y assoit
  const m = new THREE.Mesh(chaiseGeo(h), K.mat(couleur, { rugosite: .5 })); m.position.set(x, 0, z); m.rotation.y = cap; m.castShadow = true; m.receiveShadow = true; K.racine.add(m);
  I.obstacles.push([x, z, .26, .26]);
}
// Un foulard (gèlè) ou une calotte taillés dans le même pagne : à Cotonou, la famille s'habille du même tissu pour les funérailles.
const GEO = {};
function coiffe(femme) {
  const m = K.tex('pagneFavi', 1.5, 1.5), g = new THREE.Group();
  if (femme) {
    GEO.gele ??= new THREE.SphereGeometry(.13, 18, 12, 0, Math.PI * 2, 0, Math.PI * .62);
    GEO.eventail ??= new THREE.CircleGeometry(.15, 16, 0, Math.PI);
    const b = new THREE.Mesh(GEO.gele, m); b.scale.set(.98, .88, 1.04); b.position.set(0, .015, -.01); g.add(b);
    const f = new THREE.Mesh(GEO.eventail, K.tex('pagneFavi', 1, 1, '#ffffff', { face2: true })); f.scale.setScalar(.72); f.position.set(0, .1, -.075); f.rotation.x = -.75; g.add(f);
  } else {
    GEO.calotte ??= new THREE.CylinderGeometry(.1, .108, .09, 18);
    const c = new THREE.Mesh(GEO.calotte, m); c.position.y = .085; g.add(c);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return g;
}
function habiller(p) { const femme = !!p.userData.femme; if (p.userData.coiffer) p.userData.coiffer(coiffe(femme)); return p; }
const FOULE_ASSIS = [['vendeuse', -1.6, -3.0], ['ancien', -2.2, -3.0], ['etudiante', 2.2, -3.0], ['jeune', 1.6, -1.9], ['vendeuse', -2.8, -1.9], ['ancien', 2.8, -1.9], ['etudiante', -1.0, -0.8], ['jeune', 3.4, -0.8]];
const FOULE_DEBOUT = [['jeune', -6.5, -2.4, Math.PI / 2], ['etudiante', 6.5, -1.0, -Math.PI / 2], ['ancien', -6.4, 0.5, Math.PI / 2.4], ['vendeuse', 6.4, -3.3, -Math.PI / 2.2]];
function cour(I) {
  const W = I.w, D = I.d, Hc = 2.4, Hm = 3;
  const enduit = K.mat('#e9dcc2', { rugosite: .95 }), ocre = K.mat('#d7a46a', { rugosite: .92 }), crepi = K.mat('#9d9585', { rugosite: 1 }), vert = K.mat('#2f6b4f', { rugosite: .55, metal: .2 });
  const bois = K.mat('#6b4a2f', { rugosite: .7 }), metal = K.mat('#8d969b', { rugosite: .45, metal: .5 }), tole = K.tex('tole', 2, 1.6, '#c9b8a4', { metal: .3 });
  const parpaing = n => K.tex('parpaing', n / .8, Hc / 1.2);
  // Le sol : du sable, et une dalle de ciment sous la bâche et devant la maison.
  sansOmbre(K.boite(W, .2, D, K.tex('sable', W / 2.5, D / 2.5), 0, -.1, 0));
  sansOmbre(K.boite(12, .02, 8.6, K.tex('cimentSol', 4, 3), 0, -.005, -1.2));
  // Les murs : la clôture de parpaings au nord (portail au milieu), à l'ouest et à l'est ; la maison au sud.
  for (const [w, d, x, z] of [[6.7, .25, -4.65, -D / 2], [6.7, .25, 4.65, -D / 2], [.25, 10, -W / 2, -2], [.25, 10, W / 2, -2]]) { sansOmbre(K.boite(w, Hc, d, parpaing(Math.max(w, d)), x, Hc / 2, z)); sansOmbre(K.boite(w + .06, .06, d + .06, '#8a867e', x, Hc + .03, z)); }
  K.boite(1.3, 2.3, .06, vert, -.65, 1.17, -D / 2 + .16).castShadow = false; K.boite(1.3, 2.3, .06, vert, .65, 1.17, -D / 2 + .16).castShadow = false; // le portail, vu de la cour
  for (const s of [-1, 1]) K.boite(.42, 2.75, .42, enduit, s * 1.5, 1.37, -D / 2);
  for (const [x, z] of [[-W / 2 - 2.5, -D / 2 - 2], [W / 2 + 1.5, -D / 2 - 5], [-W / 2 - 3, 3]]) K.cocotier(x, z, false); // par-dessus les murs
  // La maison de Mémé : façade ocre au sud, avancée de tôle sur trois poteaux, deux portes. La chambre (ouest) est ouverte.
  const zf = 3;
  for (const [x0, x1] of [[-W / 2, -4.55], [-3.45, W / 2]]) { const w = x1 - x0, x = (x0 + x1) / 2; sansOmbre(K.boite(w, Hm, .25, ocre, x, Hm / 2, zf)); I.obstacles.push([x, zf, w / 2, .2, Hm]); }
  sansOmbre(K.boite(1.1, .5, .25, ocre, -4, Hm - .25, zf)); // le linteau de la porte de la chambre
  sansOmbre(K.boite(W, .4, .27, crepi, 0, .2, zf - .01)); // soubassement
  K.boite(.9, 2.1, .05, K.mat('#5b3b25', { rugosite: .7 }), 3.2, 1.05, zf - .14).castShadow = false; // la porte du salon, fermée
  for (const x of [-6.4, 0.6, 5.6]) for (const s of [-1, 1]) K.boite(.9, .9, .01, K.mat('#9fc3d1', { emissif: '#4f6f7c' }), x + s * .48, 1.7, zf - .14).castShadow = false; // fenêtres à lames
  sansOmbre(K.boite(W + .4, .05, 1.1, tole, 0, Hm + .05, zf - .4)).rotation.x = .1; // l'avancée du toit, sans poteaux
  sansOmbre(K.boite(W + .4, .06, D / 2 - zf + .6, tole, 0, Hm + .6, (zf + D / 2) / 2)).rotation.x = -.14; // le toit de la maison
  sansOmbre(K.boite(W, Hm, .25, enduit, 0, Hm / 2, D / 2)); // le mur du fond
  for (const s of [-1, 1]) sansOmbre(K.boite(.25, Hm, D / 2 - zf, enduit, s * W / 2, Hm / 2, (zf + D / 2) / 2)); // les pignons de la maison
  // La chambre de Mémé Houéfa : carrelage, cloison avec l'est, plafond, ampoule, le lit, une cantine, le calendrier.
  sansOmbre(K.boite(6.2, .02, 3.8, K.tex('carreauxSol', 3, 2), -4.85, .01, 5));
  sansOmbre(K.boite(.2, Hm, 4, enduit, -1.7, Hm / 2, 5)); I.obstacles.push([-1.7, 5, .12, 2, Hm]);
  sansOmbre(K.boite(6.2, .05, 4, '#d9c7a4', -4.85, 2.75, 5));
  K.sphere(.06, K.mat('#fff6d8', { emissif: '#ffe9a8' }), -4.85, 2.62, 5);
  lit(I);
  K.boite(.8, .45, .5, K.mat('#2f5f8a', { rugosite: .55, metal: .2 }), -2.5, .23, 6.5); I.obstacles.push([-2.5, 6.5, .42, .28, .5]); // cantine
  K.boite(.5, .7, .4, bois, -7.6, .35, 3.6); I.obstacles.push([-7.6, 3.6, .28, .23, .7]); // la petite table de chevet
  K.cyl(.05, .06, .14, 10, K.mat('#efe7d4'), -7.6, .77, 3.6); // une bougie
  panneauTexte(['2026'], .4, .55, -3.2, 1.6, 6.86, Math.PI, { fond: '#f6f2ea', encre: '#7a1f2b', px: 256, py: 352, police: '800 90px system-ui, sans-serif' }); // le calendrier
  // La bâche : quatre pans de toile rayée sur huit poteaux, le bord festonné. Assez haute pour ne pas boucher la caméra.
  const bx = 5.6, z0 = -4.8, z1 = 1.5, zm = (z0 + z1) / 2, haut = 3.95, bord = 3.4;
  const toile = K.tex('bacheFavi', 3, 1, '#ffffff', { face2: true }), pan = (Math.hypot((z1 - z0) / 2, haut - bord));
  for (const s of [-1, 1]) { const p = sansOmbre(K.boite(bx * 2 + .3, .03, pan, toile, 0, (haut + bord) / 2, zm + s * (z1 - z0) / 4)); p.rotation.x = s * Math.atan2(haut - bord, (z1 - z0) / 2); p.castShadow = true; }
  const lamb = K.tex('lambrequin', 6, 1, '#ffffff', { face2: true });
  lamb.map.repeat.set(6, 1); lamb.transparent = true; lamb.alphaTest = .4;
  for (const [w, x, z, r] of [[bx * 2, 0, z0, 0], [bx * 2, 0, z1, 0], [z1 - z0, -bx, zm, Math.PI / 2], [z1 - z0, bx, zm, Math.PI / 2]]) { const m = sansOmbre(K.maillage(K.geo(`lamb${w}`, () => new THREE.PlaneGeometry(w, .28)), lamb, x, bord - .15, z)); m.rotation.y = r; }
  for (const x of [-bx, -1.9, 1.9, bx]) for (const z of [z0, z1]) { K.cyl(.035, .035, bord, 6, metal, x, bord / 2, z); I.obstacles.push([x, z, .08, .08]); }
  K.sphere(.07, K.mat('#fff6d8', { emissif: '#ffe9a8' }), 0, haut - .25, zm); K.cable([0, haut - .05, zm], [0, haut - .2, zm], .006, '#222');
  // Les chaises : trois rangs de part et d'autre de l'allée, face à la photo ; blanches, quelques rouges.
  const vides = [], assis = new Set(FOULE_ASSIS.map(([, x, z]) => `${x},${z}`));
  for (const z of [-3.0, -1.9, -0.8]) for (const x of [-3.4, -2.8, -2.2, -1.6, -1.0, 1.0, 1.6, 2.2, 2.8, 3.4]) if (!assis.has(`${x},${z}`)) vides.push([x, z]);
  geoChaise ??= chaiseGeo();
  const chaises = new THREE.InstancedMesh(geoChaise, K.mat('#ffffff', { rugosite: .5 }), vides.length), m4 = new THREE.Matrix4(), rouge = new THREE.Color('#c23b2a'), blanc = new THREE.Color('#f4f2ec');
  vides.forEach(([x, z], i) => { m4.makeTranslation(x, 0, z); chaises.setMatrixAt(i, m4); chaises.setColorAt(i, (i * 7) % 5 === 0 ? rouge : blanc); I.obstacles.push([x, z, .26, .26]); });
  chaises.castShadow = true; chaises.receiveShadow = true; K.racine.add(chaises);
  // La table de la photo : nappe blanche, le portrait encadré sur son chevalet, deux bougies, des fleurs.
  const tz = 2.0;
  K.boite(2, .05, .8, K.mat('#f7f5ef', { rugosite: .9 }), 0, .78, tz); K.boite(2.02, .64, .82, K.tex('pagneFavi', 3, 1), 0, .44, tz).castShadow = false; I.obstacles.push([0, tz, 1.05, .45, .8]);
  const cadre = new THREE.Group(); cadre.position.set(0, .81, tz + .1); cadre.rotation.x = .18; K.racine.add(cadre);
  K.boite(.66, .86, .04, K.mat('#3a2a1c', { rugosite: .5 }), 0, .45, 0, cadre);
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(.56, .74), new THREE.MeshStandardMaterial({ map: textureMeme(), roughness: .5 })); photo.position.set(0, .45, -.025); photo.rotation.y = Math.PI; cadre.add(photo);
  K.boite(.08, .3, .02, '#111', .26, .8, -.03, cadre).rotation.z = .7; // le crêpe noir sur le coin du cadre
  F.bougies = [];
  for (const s of [-1, 1]) {
    K.cyl(.04, .045, .22, 10, K.mat('#f3eee2'), s * .62, .92, tz - .05);
    const flamme = sansOmbre(K.sphere(.025, K.mat('#ffcf6a', { emissif: '#ffb43a' }), s * .62, 1.05, tz - .05)); flamme.scale.y = 1.6; F.bougies.push(flamme);
  }
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) K.sphere(.06, K.mat(k % 2 ? '#f4f1ea' : '#efe5c4'), s * (.4 + (k % 3) * .06), .9 + (k > 2 ? .07 : 0), tz + .22 - k * .03);
  // Une petite sono sous la bâche (la musique des funérailles).
  K.boite(.45, .8, .4, '#1d1d1f', 4.6, .4, 1.0); I.obstacles.push([4.6, 1.0, .25, .22]); K.cyl(.13, .13, .02, 16, '#3a3a3c', 4.6, .5, .79).rotation.x = Math.PI / 2;
  // La famille, dans le même pagne : assise, et debout le long des murs.
  F.foule = new THREE.Group(); K.racine.add(F.foule); F.obFoule = [];
  FOULE_ASSIS.forEach(([role, x, z], i) => {
    const p = personne(5200 + i, { role, assise: true }); p.userData.jouer?.('assis'); habiller(p);
    const A = p.userData.assise, h = A ? A.pieds - A.fesses : .475, hc = THREE.MathUtils.clamp(h, .38, .5);
    chaise(I, x, z, 0, i % 4 === 3 ? '#c23b2a' : '#f4f2ec', hc); poserAssis(p, x, hc, z, 0, .195); F.foule.add(p); // la chaise reste la nuit
  });
  FOULE_DEBOUT.forEach(([role, x, z, cap], i) => {
    const p = personne(5300 + i, { role }); p.position.set(x, 0, z); p.rotation.y = cap; habiller(p); F.foule.add(p);
    const ob = [x, z, .28, .28]; I.obstacles.push(ob); F.obFoule.push([ob, x, z]);
  });
  // La nuit : sous le lit, la statuette, le carnet, le bracelet de fer (cachés le jour).
  F.nuitObjets = new THREE.Group(); K.racine.add(F.nuitObjets); F.nuitObjets.visible = false;
  K.into(F.nuitObjets, () => {
    const lx = -6.1, lz = 4.88; // au bord du lit, à moitié dessous
    K.cyl(.05, .07, .32, 10, K.mat('#5a3a22', { rugosite: .6 }), lx - .4, .16, lz + .05).castShadow = false; K.sphere(.06, K.mat('#5a3a22', { rugosite: .6 }), lx - .4, .37, lz + .05); // la statuette
    const carnet = K.boite(.22, .03, .3, K.mat('#7a1f2b', { rugosite: .7 }), lx + .1, .016, lz + .02); carnet.rotation.y = .3; carnet.castShadow = false;
    const bracelet = K.maillage(K.geo('bracelet', () => new THREE.TorusGeometry(.075, .015, 10, 28)), K.mat('#6a655e', { rugosite: .3, metal: .85 }), lx + .48, .016, lz - .08); bracelet.rotation.x = Math.PI / 2; bracelet.castShadow = false;
    F.braceletMesh = bracelet;
    const lueur = sansOmbre(K.maillage(K.geo('lueurLit', () => new THREE.CircleGeometry(.85, 24).rotateX(-Math.PI / 2)), matLueur('#ffcf7a', .55), lx, .02, lz - .05)); F.lueurLit = lueur;
  });
}
// Le lit de Mémé, le long du mur du fond de la chambre, la tête à l'ouest. On regarde dessous depuis la chambre (z < 4,9).
const LIT = { x: -6.1, z: 5.75, long: 2, larg: 1.45 };
function lit(I) {
  const bois = K.mat('#6b4a2f', { rugosite: .7 }), g = new THREE.Group(); g.position.set(LIT.x, 0, LIT.z); K.racine.add(g);
  K.boite(LIT.long + .08, .3, LIT.larg + .06, bois, 0, .3, 0, g); // le cadre, sur pieds : on voit dessous
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.boite(.08, .3, .08, bois, a * LIT.long / 2, .15, b * LIT.larg / 2, g);
  K.boite(.07, .95, LIT.larg + .06, bois, -LIT.long / 2 - .03, .6, 0, g); // la tête de lit
  K.boite(LIT.long, .16, LIT.larg, '#f3efe6', 0, .53, 0, g);
  K.boite(LIT.long - .4, .015, LIT.larg + .01, K.tex('pagneFavi', 2, 1.5), .2, .62, 0, g); // le pagne plié sur le lit
  K.boite(.38, .1, .55, '#ffffff', -LIT.long / 2 + .28, .66, 0, g);
  I.obstacles.push([LIT.x, LIT.z, LIT.long / 2 + .06, LIT.larg / 2 + .05, .7]);
}
/** Le portrait de Mémé Houéfa : la photo si elle existe (public/favi/portraits/meme-cadre.jpg, en 3:4), sinon un portrait dessiné, sépia. */
function textureMeme() {
  const cv = document.createElement('canvas'); cv.width = 384; cv.height = 512; const c = cv.getContext('2d');
  const fond = c.createLinearGradient(0, 0, 0, 512); fond.addColorStop(0, '#d9c49a'); fond.addColorStop(1, '#a88a5c'); c.fillStyle = fond; c.fillRect(0, 0, 384, 512);
  c.fillStyle = '#4a3423'; c.beginPath(); c.ellipse(192, 420, 150, 110, 0, Math.PI, 0); c.fill(); // les épaules
  c.fillStyle = '#5b3d26'; c.beginPath(); c.ellipse(192, 250, 78, 96, 0, 0, Math.PI * 2); c.fill(); // le visage
  c.fillStyle = '#1f2f6e'; c.beginPath(); c.ellipse(192, 178, 98, 62, 0, Math.PI, 0); c.fill(); c.fillRect(94, 172, 196, 22); // le foulard
  c.fillStyle = '#e2a72e'; c.beginPath(); c.arc(150, 150, 12, 0, Math.PI * 2); c.arc(232, 150, 12, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#2a1a10'; c.fillRect(160, 245, 18, 6); c.fillRect(206, 245, 18, 6); c.fillRect(178, 300, 28, 5); // les yeux, la bouche, à peine
  c.fillStyle = '#f6f2ea'; c.fillRect(0, 470, 384, 42); c.fillStyle = '#1d1a16'; c.font = '700 26px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('Mémé Houéfa', 192, 499);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  if (F.portraits.has('meme-cadre')) new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}favi/portraits/meme-cadre.jpg`, img => { t.dispose(); t.image = img.image; t.needsUpdate = true; }, undefined, () => { }); // dispose : la place déjà prise sur la carte graphique (le dessin, 384 × 512) n'accepte pas une image d'une autre taille
  return t;
}
// Une lueur au sol, en dégradé : les seuils, le bout de la ligne, le pied du Zangbeto.
let texLueur = null;
function matLueur(couleur, opacite = .7) {
  if (!texLueur) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    texLueur = new THREE.CanvasTexture(cv);
  }
  return new THREE.MeshBasicMaterial({ map: texLueur, color: couleur, transparent: true, opacity: opacite, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
}

// ---------- Les personnages qui bougent dans la cour (Maman Agnès, le Chef, le père, Ayiké, la guérisseuse) ----------
function pnj(id, role, x, z, cap) {
  const I = F.maison.I, ancien = F.pnj[id]; if (ancien) retirerPnj(id);
  const P = PERSONNES[id], vrai = !!ACTEURS[id] && modeleCharge(ACTEURS[id]), g = personne(P.graine, { role: vrai ? ACTEURS[id] : role, femme: P.femme });
  if (id === 'agnes' && !vrai) habiller(g); // la doublure prend le foulard ; la vraie Agnès a le sien
  g.position.set(x, 0, z); g.rotation.y = cap; I.g.add(g);
  const ob = [x, z, .3, .3]; I.obstacles.push(ob);
  return (F.pnj[id] = { id, role, g, x, z, cap, ob, chemin: [], fin: null, vitesse: 1.15, regarde: true, bulle: null, bulleFin: 0, oreille: false });
}
/** Charge les vrais personnages de l'histoire (une seule fois) ; dès que Koffi est là, on le devient. */
function chargerActeurs() {
  F.acteurs ??= Promise.all(Object.values(ACTEURS).map(chargerActeur));
  F.acteurs.then(() => { if (!F.actif) return; if (modeleCharge(ACTEURS.koffi)) F.ctx.incarner?.(ACTEURS.koffi); rafraichirActeurs(); });
  return F.acteurs;
}
/** Arrivés en retard : hors d'une scène, les doublures immobiles laissent la place aux vrais personnages, au même endroit. */
function rafraichirActeurs() {
  if (!F.actif || F.bloque || F.dlg || !F.maison?.I?.g) return;
  for (const P of Object.values(F.pnj)) {
    const vrai = ACTEURS[P.id]; if (!vrai || P.g.userData.modele === vrai || !modeleCharge(vrai) || P.chemin.length) continue;
    const { id, role, x, z, cap, regarde, oreille } = P, N = pnj(id, role, x, z, cap);
    N.regarde = regarde; if (oreille) { N.oreille = true; N.g.userData.oreille?.(true); }
  }
}
/** Au téléphone (le Chef) : la main à l'oreille, retenu pour rafraichirActeurs. */
function oreille(P, on) { P.oreille = on; P.g.userData.oreille?.(on); }
function retirerPnj(id) {
  const P = F.pnj[id]; if (!P) return;
  F.ctx.retirerBulle(P); P.g.parent?.remove(P.g); P.g.userData.liberer?.();
  const I = F.maison?.I, k = I?.obstacles.indexOf(P.ob); if (k >= 0) I.obstacles.splice(k, 1);
  delete F.pnj[id];
}
function marcher(P, chemin) { return new Promise((ok, ko) => { const j = F.jeton; P.chemin = chemin.map(p => [...p]); P.fin = () => (j === F.jeton ? ok() : ko(ANNULE)); }); }
const tourner = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * Math.min(1, k);
function majPnj(dt) {
  const I = F.maison?.I, s = S(), now = performance.now();
  for (const P of Object.values(F.pnj)) {
    if (P.chemin.length) {
      const [tx, tz] = P.chemin[0], dx = tx - P.x, dz = tz - P.z, d = Math.hypot(dx, dz), pas = P.vitesse * dt;
      if (d <= pas) { P.x = tx; P.z = tz; P.chemin.shift(); if (!P.chemin.length) { P.g.userData.jouer?.('idle'); const f = P.fin; P.fin = null; f?.(); } }
      else { P.x += dx / d * pas; P.z += dz / d * pas; P.cap = tourner(P.cap, Math.atan2(dx, dz), dt * 7); P.g.userData.allure?.(P.vitesse); P.g.userData.jouer?.('marche'); }
    } else if (P.regarde && I && s.lieu === I) { const lx = s.x - I.centre[0] - P.x, lz = s.z - I.centre[1] - P.z; if (Math.hypot(lx, lz) < 6) P.cap = tourner(P.cap, Math.atan2(lx, lz), dt * 3); }
    P.g.position.set(P.x, 0, P.z); P.g.rotation.y = P.cap; P.ob[0] = P.x; P.ob[1] = P.z;
    if (P.bulle && now > P.bulleFin) F.ctx.retirerBulle(P);
  }
}
/** Le joueur, en coordonnées de la cour (null s'il n'y est pas). */
function joueurDansCour() { const I = F.maison?.I, s = S(); return I && s.lieu === I ? [s.x - I.centre[0], s.z - I.centre[1]] : null; }
/** Place le joueur dans la cour (coordonnées de la cour), face à `cap`. */
function placerDansCour(x, z, cap) {
  const I = F.maison.I, s = S();
  if (s.lieu && s.lieu !== I) F.ctx.dehors(false); // d'abord sortir de là où l'on est (chez soi, au lit…)
  if (s.lieu !== I) F.ctx.dedans(I, false);
  s.x = I.centre[0] + x; s.z = I.centre[1] + z; s.cap = cap; s.saut = true; s.geste = 'idle'; s.orbite = 0;
}
/** Place le joueur dans la rue, devant le portail de Mémé. */
function placerDevant() {
  const M = declarerMaison(), s = S();
  if (s.lieu) F.ctx.dehors(false);
  const a = arriveeDehors(M.I); s.x = a.x; s.z = a.z; s.y = 0; s.cap = a.cap; s.saut = true; s.geste = 'idle'; s.orbite = 0;
}
/** L'état de la cour selon l'étape : la famille le jour, la cour vide et les objets sous le lit la nuit. */
function preparerCour() {
  const M = F.maison; if (!M?.I.g) return;
  const nuit = ['nuit', 'ligne', 'vision', 'fin'].includes(F.e.etape);
  F.foule.visible = !nuit;
  for (const [ob, x, z] of F.obFoule) { ob[0] = nuit ? 1e4 : x; ob[1] = nuit ? 1e4 : z; }
  F.nuitObjets.visible = F.e.etape === 'nuit';
  for (const b of F.bougies) b.scale.setScalar(nuit ? 1.25 : 1);
  if (nuit) for (const id of Object.keys(F.pnj)) retirerPnj(id);
}

// ---------- La musique des funérailles : la cloche (gankogui) et un tambour grave, très doux ----------
// Aucun son de funérailles dans le jeu : on joue la cloche double des musiques fon (motif en douze temps) et un tambour,
// générés comme la musique de quartier (musique.js), à bas volume, tant qu'on est dans la cour le jour.
function musique(on) {
  if (!on) { const M = F.musique; if (M) { clearInterval(M.t); try { M.g.gain.setTargetAtTime(0, AUDIO.ctx.currentTime, .4); } catch { /* fermé */ } setTimeout(() => M.g.disconnect(), 2500); F.musique = null; } return; }
  if (F.musique || AUDIO.muet) return;
  const ctx = audioCtx(); if (!ctx) return;
  const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(.55, ctx.currentTime, 1.5); g.connect(ctx.destination);
  const PAS = .19, CLOCHE = [0, 2, 4, 5, 7, 9, 11], M = { g, pas: 0, t0: ctx.currentTime + .1 };
  const note = (t, f, d, v, type = 'triangle') => { const o = ctx.createOscillator(), e = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (type === 'sine') o.frequency.exponentialRampToValueAtTime(f * .6, t + d); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v, t + .005); e.gain.exponentialRampToValueAtTime(.0005, t + d); o.connect(e).connect(g); o.start(t); o.stop(t + d + .05); };
  M.t = setInterval(() => {
    while (M.t0 + M.pas * PAS < ctx.currentTime + .5) {
      const t = M.t0 + M.pas * PAS, k = M.pas % 12;
      if (CLOCHE.includes(k)) note(t, k === 0 || k === 7 ? 1180 : 1560, .16, .045);
      if (k === 0 || k === 6) note(t, 92, .5, .16, 'sine');
      if (k === 9 && (M.pas / 12 | 0) % 2) note(t, 120, .35, .09, 'sine');
      M.pas++;
    }
  }, 120);
  F.musique = M;
}

// ---------- La ligne Vo de Cadjèhoun ----------
// De la porte de Mémé jusqu'au carrefour le plus proche (le Zangbeto y tourne), puis vers Fidjrossè le long des vraies
// rues, 250 à 650 m. Un ruban doux, cyan et or, qui pulse ; au-delà du Zangbeto, il reste pâle tant qu'il n'a pas laissé passer.
function tracerLigne() {
  if (F.trace) return F.trace;
  const [px, pz] = F.maison.I.porte, R = construireReseau();
  const proches = noeudsPres(px, pz, 320).filter(([n, d]) => d > 24 && R.adj[n].length >= 3 && relie(n));
  for (const [n] of proches.slice(0, 8)) {
    const C = [R.X[n], R.Z[n]], a = itineraire(px, pz, null, C[0], C[1]); if (!a || a.length < 2 || longueur(a) > 280) continue;
    const base = Math.atan2(FIDJROSSE[0] - C[0], FIDJROSSE[1] - C[1]);
    for (const da of [0, .45, -.45, .9, -.9, 1.4, -1.4, 2, -2, 2.6, -2.6, Math.PI]) {
      const ang = base + da, m = noeudRelie(C[0] + Math.sin(ang) * 340, C[1] + Math.cos(ang) * 340, 130); if (!m) continue;
      const b = itineraire(C[0], C[1], null, R.X[m[0]], R.Z[m[0]]); if (!b || b.length < 2) continue;
      const L = longueur(b); if (L < 230 || L > 650) continue;
      if (b.slice(2).some(([x, z]) => Math.hypot(x - px, z - pz) < 22)) continue; // la suite ne repasse pas devant la porte
      const pts = [[px, pz], ...a.filter(([x, z]) => Math.hypot(x - px, z - pz) > 1), ...b.slice(1)];
      return (F.trace = { pts, C, L1: longueur([[px, pz], ...a]), fin: b[b.length - 1] });
    }
  }
  console.warn('favi : pas de ligne trouvée');
  return null;
}
function densifier(pts, pas = 2.5) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / pas)); for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); }
  return out;
}
/** Le point à `d` mètres le long de la ligne, et la direction de la ligne à cet endroit. */
function pointSur(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az);
    if (d <= l || i === pts.length - 1) { const k = Math.min(1, Math.max(0, d / (l || 1))); return { x: ax + (bx - ax) * k, z: az + (bz - az) * k, dx: (bx - ax) / (l || 1), dz: (bz - az) / (l || 1) }; }
    d -= l;
  }
  return { x: pts[0][0], z: pts[0][1], dx: 1, dz: 0 };
}
function allumerLigne() {
  if (F.ligne || !tracerLigne()) return;
  const T = F.trace, pts = densifier(T.pts), pos = [], uv = [], al = [], idx = [], w = .75; let l = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], n = Math.hypot(dx, dz) || 1, nx = -dz / n * w, nz = dx / n * w;
    const y = hauteur(pts[i][0], pts[i][1], 0) + .24;
    pos.push(pts[i][0] + nx, y, pts[i][1] + nz, pts[i][0] - nx, y, pts[i][1] - nz); uv.push(0, 0, 1, 0); al.push(l, l);
    if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('aL', new THREE.Float32BufferAttribute(al, 1)); geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uForce: { value: 0 }, uCoupe: { value: T.L1 }, uApres: { value: .25 }, uLong: { value: l } },
    vertexShader: 'attribute float aL; varying float vL; varying vec2 vUv; void main() { vL = aL; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT, uForce, uCoupe, uApres, uLong; varying float vL; varying vec2 vUv;
      void main() {
        float bord = 1.0 - abs(vUv.x * 2.0 - 1.0);
        float coeur = smoothstep(0.0, 0.7, bord), fil = smoothstep(0.82, 1.0, bord);
        float onde = 0.5 + 0.5 * sin(vL * 0.32 - uT * 2.2);
        float souffle = 0.8 + 0.2 * sin(uT * 1.3);
        vec3 cyan = vec3(0.35, 0.92, 1.0), ors = vec3(1.0, 0.78, 0.32);
        vec3 c = mix(ors, cyan, 0.5 + 0.5 * sin(vL * 0.045 - uT * 0.6));
        float a = (coeur * (0.17 + 0.33 * onde) + fil * 0.42) * souffle;
        a *= uForce * (vL > uCoupe ? uApres : 1.0) * smoothstep(0.0, 6.0, vL) * smoothstep(0.0, 4.0, uLong - vL + 1.0);
        gl_FragColor = vec4(c * (0.75 + 0.6 * onde), a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 5; m.frustumCulled = false; scene.add(m); F.ligne = m;
  // Le bout de la ligne : un anneau qui respire et une colonne de lumière.
  const [fx, fz] = T.fin, fy = hauteur(fx, fz, 0), g = new THREE.Group(); g.position.set(fx, fy, fz);
  const disque = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32).rotateX(-Math.PI / 2), matLueur('#7fe9ff', .8)); disque.position.y = .26; g.add(disque);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.3, 14, 20, 1, true), new THREE.MeshBasicMaterial({ map: degradeVertical(), color: '#bff4ff', transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  col.position.y = 7; g.add(col); scene.add(g); F.fin = g;
  // Quelques seuils de maisons le long de la ligne brillent un peu : d'autres familles qui la gardent, sans le savoir.
  const portes = []; chercherPorte(T.C[0], T.C[1], false, [4, 5], portes);
  const pres = portes.filter(P => Math.hypot(P.x - F.maison.P.x, P.z - F.maison.P.z) > 5 && pts.some(([x, z], i) => i % 4 === 0 && Math.hypot(x - P.x, z - P.z) < 26)).slice(0, 9);
  for (const P of [F.maison.P, ...pres]) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(P === F.maison.P ? 1.6 : 1.1, 24).rotateX(-Math.PI / 2), matLueur(P === F.maison.P ? '#ffd58a' : '#ffe2a6', .45));
    const x = P.x - P.nx * .8, z = P.z - P.nz * .8; d.position.set(x, hauteur(x, z, 0) + .25, z); d.renderOrder = 5; scene.add(d); F.seuils.push(d);
  }
}
let texDegrade = null;
function degradeVertical() {
  if (texDegrade) return texDegrade;
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 128; const c = cv.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,1)'); c.fillStyle = g; c.fillRect(0, 0, 4, 128);
  return (texDegrade = new THREE.CanvasTexture(cv));
}
function eteindreLigne() {
  for (const o of [F.ligne, F.fin, ...F.seuils]) if (o) { scene.remove(o); o.traverse(m => { m.geometry?.dispose(); if (m.material && m.material.map !== texLueur && m.material.map !== texDegrade) m.material.dispose?.(); }); }
  F.ligne = F.fin = null; F.seuils = [];
}

// ---------- Le Zangbeto du carrefour ----------
function poserZangbeto() {
  if (F.zb || !tracerLigne()) return;
  const [x, z] = F.trace.C, y = hauteur(x, z, 0), g = creerZangbeto(7, 2.5);
  g.traverse(o => { if (o.isMesh && o.material?.map) { o.material = o.material.clone(); o.material.emissive = new THREE.Color('#5a4424'); o.material.emissiveMap = o.material.map; o.material.emissiveIntensity = .55; } }); // visible la nuit
  g.position.set(x, y, z); scene.add(g);
  const pied = new THREE.Mesh(new THREE.CircleGeometry(2.3, 28).rotateX(-Math.PI / 2), matLueur('#ffb35a', .22)); pied.position.set(x, y + .2, z); pied.renderOrder = 5; scene.add(pied);
  // Le cercle à ne pas franchir : pointillé ambré, à 6 m.
  const anneau = new THREE.Mesh(new THREE.RingGeometry(PRES_ZB - .12, PRES_ZB, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffb35a', transparent: true, opacity: .35, depthWrite: false, toneMapped: false }));
  anneau.position.set(x, y + .22, z); anneau.visible = false; scene.add(anneau);
  F.zb = { g, pied, anneau, x, z, x0: x, z0: z, permis: false, part: 0, ob: '' };
  majObstacleZb();
}
function majObstacleZb() {
  const Z = F.zb, cle = Z ? `${Z.x.toFixed(1)},${Z.z.toFixed(1)}` : '';
  if (Z && Z.ob === cle) return;
  if (Z) Z.ob = cle;
  poserObstacles('favi', Z && Z.g.visible ? [[Z.x, Z.z, 0, 2.4, 2.4]] : []); // on ne le traverse pas
}
function retirerZangbeto() {
  const Z = F.zb; if (!Z) return;
  for (const o of [Z.g, Z.pied, Z.anneau]) scene.remove(o);
  Z.pied.geometry.dispose(); Z.anneau.geometry.dispose(); Z.anneau.material.dispose();
  F.zb = null; poserObstacles('favi', []);
}
function majZangbeto(dt) {
  const Z = F.zb; if (!Z) return;
  Z.g.userData.anim?.(F.t);
  if (Z.part > 0) { // il s'écarte et s'efface dans la nuit
    Z.part += dt; const k = Math.min(1, Z.part / 4);
    Z.x = Z.x0 + Z.dx * 16 * k; Z.z = Z.z0 + Z.dz * 16 * k; const y = hauteur(Z.x, Z.z, 0);
    Z.g.position.set(Z.x, y, Z.z); Z.pied.position.set(Z.x, y + .2, Z.z); const s = Math.max(.001, 1 - Math.max(0, k - .6) / .4); Z.g.scale.setScalar(s); Z.pied.material.opacity = .22 * s;
    if (k >= 1) { Z.g.visible = Z.pied.visible = false; }
    majObstacleZb();
  } else { // il tourne sur place, en dérivant un peu autour du carrefour
    Z.x = Z.x0 + Math.sin(F.t * .7) * 1.2; Z.z = Z.z0 + Math.cos(F.t * .5) * 1.2; const y = hauteur(Z.x, Z.z, 0);
    Z.g.position.set(Z.x, y, Z.z); Z.pied.position.set(Z.x, y + .2, Z.z); Z.anneau.position.set(Z.x0, y + .22, Z.z0);
    if (ecartOb(Z) > .25) majObstacleZb();
  }
}
const ecartOb = Z => { const [a, b] = (Z.ob || '0,0').split(',').map(Number); return Math.hypot(Z.x - a, Z.z - b); };

// ---------- La vision : Cadjèhoun dans dix ans ----------
function textureFacade(lignes, cols, couleurMur, couleurVitre, allumees) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512; const c = cv.getContext('2d'), e = document.createElement('canvas'); e.width = e.height = 512; const ce = e.getContext('2d');
  c.fillStyle = couleurMur; c.fillRect(0, 0, 512, 512); ce.fillStyle = '#000'; ce.fillRect(0, 0, 512, 512);
  const h = 512 / lignes, w = 512 / cols;
  for (let i = 0; i < lignes; i++) for (let j = 0; j < cols; j++) {
    c.fillStyle = couleurVitre; c.fillRect(j * w + w * .2, i * h + h * .25, w * .6, h * .5);
    if (((i * 31 + j * 17) % 100) / 100 < allumees) { ce.fillStyle = ['#ffd99a', '#fff1cf', '#ffc777'][(i + j) % 3]; ce.fillRect(j * w + w * .2, i * h + h * .25, w * .6, h * .5); }
  }
  const t = new THREE.CanvasTexture(cv), te = new THREE.CanvasTexture(e); t.colorSpace = te.colorSpace = THREE.SRGBColorSpace;
  return { t, te };
}
function construireAvenir() {
  const M = F.maison, P = M.P, out = new THREE.Group(); scene.add(out); F.jetables = [];
  const jeter = m => { F.jetables.push(m); return m; }; // ce qu'on a fabriqué pour la vision (pas les matières partagées de K)
  if (F.e.signe) {
    // La Résidence Horizon Bleu à la place de la cour : un bloc blanc et bleu de huit niveaux, un portail neuf, le panneau.
    const g = new THREE.Group(); g.position.set(P.x, 0, P.z); g.rotation.y = M.dehors; out.add(g);
    const f = textureFacade(8, 6, '#eef1f2', '#3b6fa8', .45); f.t.wrapS = f.te.wrapS = THREE.RepeatWrapping; f.t.repeat.x = f.te.repeat.x = 2;
    const mur = new THREE.MeshStandardMaterial({ map: f.t, emissiveMap: f.te, emissive: '#ffffff', emissiveIntensity: .55, roughness: .6 });
    const bloc = jeter(new THREE.Mesh(new THREE.BoxGeometry(19, 26, 15), mur)); bloc.position.set(0, 13, -10.5); bloc.castShadow = true; g.add(bloc);
    const toit = jeter(new THREE.Mesh(new THREE.BoxGeometry(19.6, .8, 15.6), new THREE.MeshStandardMaterial({ color: '#2e5ea8' }))); toit.position.set(0, 26.4, -10.5); g.add(toit);
    K.into(g, () => {
      K.boite(5.2, 2.6, .12, K.mat('#d9dde0', { rugosite: .4, metal: .5 }), 0, 1.3, .02); // le portail neuf, en aluminium
      jeter(panneauTexte(['RÉSIDENCE HORIZON BLEU'], 9, 1.1, 0, 6, -2.95, 0, { fond: '#2e5ea8', encre: '#ffffff', px: 1024, py: 125, police: '800 78px system-ui, sans-serif' }));
      for (const s of [-1, 1]) K.boite(.18, 4.2, .18, '#4a4f55', 4.2 + s * 2.1, 2.1, 2.4);
      const pan = jeter(panneauTexte(['HORIZON BLEU', 'Résidence de standing', 'Un projet de M. Dorval'], 5.4, 2.6, 4.2, 4.3, 2.52, 0, { fond: '#0f2f5f', encre: '#ffffff', px: 1024, py: 494, police: '800 96px system-ui, sans-serif' }));
      pan.material.emissive = new THREE.Color('#ffffff'); pan.material.emissiveMap = pan.material.map; pan.material.emissiveIntensity = .7;
    });
    M.g.visible = false; // la cour et son portail ont disparu
  }
  // Au loin, vers Fidjrossè : la tour de l'hôtel, toutes fenêtres allumées, l'enseigne en haut.
  const dx = FIDJROSSE[0] - P.x, dz = FIDJROSSE[1] - P.z, d = Math.hypot(dx, dz), hx = P.x + dx / d * 950, hz = P.z + dz / d * 950;
  const h = new THREE.Group(); h.position.set(hx, 0, hz); h.rotation.y = Math.atan2(-dx, -dz); out.add(h);
  const f = textureFacade(28, 10, '#1d2533', '#2b3a52', .7), mat = new THREE.MeshStandardMaterial({ map: f.t, emissiveMap: f.te, emissive: '#ffffff', emissiveIntensity: 1.4, roughness: .4, fog: false });
  const tour = jeter(new THREE.Mesh(new THREE.BoxGeometry(50, 130, 22), mat)); tour.position.y = 65; h.add(tour);
  const socle = jeter(new THREE.Mesh(new THREE.BoxGeometry(84, 14, 38), new THREE.MeshStandardMaterial({ color: '#2a3140', emissive: '#ffcf8a', emissiveIntensity: .25, fog: false }))); socle.position.y = 7; h.add(socle);
  const enseigne = jeter(K.into(h, () => panneauTexte(['HORIZON BLEU'], 44, 6.6, 0, 136, 11.2, 0, { fond: '#0f2f5f', encre: '#ffd27a', px: 1024, py: 154, police: '800 120px system-ui, sans-serif' })).children.at(-1));
  enseigne.material.emissive = new THREE.Color('#ffffff'); enseigne.material.emissiveMap = enseigne.material.map; enseigne.material.emissiveIntensity = 1.2; enseigne.material.fog = false;
  F.hotel = [hx, hz];
  F.vision = out;
}
function detruireAvenir() {
  if (!F.vision) return;
  scene.remove(F.vision); for (const o of F.jetables || []) { o.geometry?.dispose(); o.material.map?.dispose(); o.material.emissiveMap?.dispose(); o.material.dispose(); }
  F.vision = null; F.jetables = []; if (F.maison && F.actif) F.maison.g.visible = true;
}

// ---------- Les scènes ----------
function passer(etape) {
  F.e.etape = etape; sauver(); heure(); preparerCour(); majHud();
  if (etape === 'soir') gpsMaison();
  if (['nuit', 'ligne'].includes(etape)) poserZangbeto();
  if (F.zb) F.zb.anneau.visible = etape === 'ligne' && !F.zb.permis;
}
function heure() { setMood(HEURE[F.e.etape] || 'jour'); }
function gpsMaison() { const M = F.maison, s = S(); if (!M || s.lieu === M.I) return; const [x, z] = M.I.porte; if (Math.hypot(x - s.x, z - s.z) > 15) F.ctx.gps(x, z, 'chez Mémé Houéfa'); }
/** Une caméra posée (coordonnées de la cour) ; null rend la caméra au joueur. */
function plan(pos, vise, cour = true) {
  if (!pos) { F.cam = null; return; }
  const I = F.maison.I, y0 = arriveeDedans(I).y, c = cour ? [I.centre[0], y0, I.centre[1]] : [0, 0, 0];
  if (cour) pos = pos[2] > 3 // jamais dans un mur : dans la chambre de Mémé, ou dans la cour
    ? [THREE.MathUtils.clamp(pos[0], -7.7, -2), Math.min(pos[1], 2.45), THREE.MathUtils.clamp(pos[2], 3.25, 6.75)]
    : [THREE.MathUtils.clamp(pos[0], -7.4, 7.4), Math.min(pos[1], 2.9), THREE.MathUtils.clamp(pos[2], -6.5, 2.5)];
  F.cam = { pos: new THREE.Vector3(c[0] + pos[0], c[1] + pos[1], c[2] + pos[2]), vise: new THREE.Vector3(c[0] + vise[0], c[1] + vise[1], c[2] + vise[2]), coupe: true };
}

async function sceneFunerailles() {
  const j = F.jeton; F.bloque = true; majHud();
  F.ui.voile.classList.add('noir'); F.ui.voile.style.transitionDuration = '0s';
  const titreP = titre('Le Favi', 'Chapitre 1 · L’éveil', 'Cadjèhoun, le jour des funérailles de Mémé Houéfa.', 3.6);
  // Le temps du titre : les personnages réalistes finissent d'arriver (sinon la famille serait dessinée en code), Koffi et les siens aussi.
  await Promise.race([Promise.all([personnagesCharges(), chargerActeurs()]), pause(9)]); verifier(j);
  passer('funerailles'); placerDansCour(0, -4.4, 0); preparerCour(); musique(true);
  pnj('agnes', 'maman', 1.4, 1.1, Math.PI);
  pnj('ayike', 'etudiante', -4.6, -4.0, Math.PI / 2); // au fond, sous le bord de la bâche
  pnj('guerisseuse', 'vendeuse', -3.0, .9, Math.PI); // près de la photo, face à la famille
  plan([6.4, 2.3, -6.1], [-.6, 1.1, .4]);
  await titreP; verifier(j);
  await voile(false, 1.4);
  await pause(3.2);
  plan([-4.2, 1.7, -5.9], [1.5, 1.3, .9]); // de l'autre coin : la photo, les bougies
  await dire('koffi', 'Mémé Houéfa est partie la nuit où l’on a posé la première pierre d’un hôtel à Fidjrossè. Toute la famille est là, dans le même pagne.', ['…'], { voix: false });
  const A = F.pnj.agnes;
  plan([3.1, 1.6, -5.9], [-.3, 1.2, -2.4]); // de côté : elle descend l'allée vers Koffi
  await marcher(A, [[.2, .7], [0, -1.4], [0, -3.1]]);
  plan([-3.3, 1.65, -4.9], [.1, 1.35, -3.6]); // les deux, de profil
  await dire('agnes', 'Koffi… Viens, mon fils.', ['Maman Agnès…'], { pnj: A });
  const r = await dire('agnes', 'Houéfa t’a laissé quelque chose. Cherche sous son lit. Mais pas avant la nuit.', ['Pourquoi pas avant la nuit ?', 'D’accord, Maman Agnès.'], { pnj: A });
  if (r === 0) await dire('agnes', 'Certaines choses ne se montrent qu’à la nuit. Patiente.', ['D’accord.'], { pnj: A });
  // Ayiké, l'amie d'enfance, vient du fond de la bâche (elle tient un étal à Dantokpa : le chapitre 3).
  const Ay = F.pnj.ayike;
  if (Ay) {
    plan([-.5, 1.65, -6.4], [-.5, 1.35, -4.3]); // de dos à la photo : les deux de profil
    await marcher(Ay, [[-2.2, -4.2], [-1.1, -4.4]]);
    placerDansCour(0, -4.4, -Math.PI / 2); // Koffi se tourne vers elle
    await dire('ayike', 'Koffi… Mes condoléances. Mémé Houéfa m’a nourrie plus d’une fois, quand on était petits.', ['Merci d’être venue, Ayiké.'], { pnj: Ay });
    await dire('ayike', 'Si tu as besoin de quoi que ce soit, tu sais où me trouver : au marché Dantokpa.', ['Je n’oublierai pas.'], { pnj: Ay });
    marcher(Ay, [[-3.6, -4.1]]).then(() => { Ay.cap = Math.PI / 2; }).catch(() => { }); // elle laisse la place au Chef
  }
  plan(null);
  await sceneProfil();
}
async function sceneProfil() {
  const j = F.jeton; F.bloque = true; passer('profil');
  let p = F.e.profil;
  if (!p) { p = ['fils', 'debrouillard'].includes(Q.get('profil')) ? Q.get('profil') : Math.random() < .35 ? 'fils' : 'debrouillard'; F.e.profil = p; sauver(); } // tiré et gardé avant l'animation
  const html = `<small class="ev-sur">Le destin choisit pour toi</small><h2>Qui es-tu, Koffi ?</h2><div class="fv-cartes">${Object.entries(PROFILS).map(([id, P]) => `<div class="fv-carte" data-p="${id}"><b>${P.nom}</b><span>${P.carte}</span></div>`).join('')}</div><p class="fv-texte" aria-live="polite">Le destin tire ta carte…</p>`;
  const choix = fiche(html, ['Continuer'], 'fv-tirage'), boite = F.ui.fiche.firstChild, go = boite.querySelector('[data-i]');
  go.hidden = true;
  const cartes = [...boite.querySelectorAll('.fv-carte')]; let k = 0, pas = 90; const t0 = performance.now();
  await new Promise(fin => { const tour = () => { if (j !== F.jeton) return fin(); cartes.forEach((c, i) => c.classList.toggle('choisie', i === k % 2)); if (performance.now() - t0 < 2200 * VIT || cartes[k % 2].dataset.p !== p) { k++; pas *= 1.12; setTimeout(tour, pas); } else fin(); }; tour(); });
  verifier(j);
  son('piece'); boite.querySelector('.fv-texte').textContent = `Tu es Koffi, 22 ans. ${PROFILS[p].texte}`; go.hidden = false; go.focus({ preventScroll: true });
  await choix;
  await sceneOffre();
}
async function sceneOffre() {
  const j = F.jeton; F.bloque = true; passer('offre');
  const fils = F.e.profil === 'fils';
  placerDansCour(0, -4.4, Math.PI); // Koffi se retourne : on entre par le portail
  const C = pnj('chef', 'bureau', .4, -6.55, Math.PI); oreille(C, true); C.regarde = false;
  const Pe = fils ? pnj('pere', 'ancien', -.6, -6.6, Math.PI) : null;
  plan([2.4, 1.6, -3.6], [0, 1.3, -5.9]);
  await dire('chef', 'Oui, oui, Monsieur Dorval, je suis sur place… Je vous rappelle.', ['…'], { pnj: C });
  oreille(C, false); C.regarde = true;
  const marche = [marcher(C, [[.9, -5.6]])]; if (Pe) marche.push(marcher(Pe, [[-.95, -5.7]]));
  await Promise.all(marche); verifier(j);
  plan([-2.7, 1.7, -3.55], [.25, 1.3, -5.2]); // par-dessus l'épaule de Koffi
  if (Pe) await dire('pere', 'Koffi. Le Chef veut te parler. Écoute-le, c’est pour ton bien.', ['Papa…'], { pnj: Pe });
  await dire('chef', 'Mes condoléances, Koffi. Les funérailles coûtent cher. Signe cette promesse de vente de la maison, et je paie tout.', ['Je ne signe rien aujourd’hui.', 'Laissez-moi réfléchir.'], { pnj: C });
  if (Pe) await dire('pere', 'Horizon Bleu, c’est l’avenir, fils. Mais fais comme tu veux : j’ai déjà mis une partie pour les funérailles.', ['…'], { pnj: Pe });
  await dire('chef', `Comme tu veux. Mais ce soir, la famille attend ${fmt(but())}. Le papier reste dans ma poche. Tu sais où me trouver : ici.`, ['Je trouverai l’argent.'], { pnj: C });
  plan(null);
  if (Pe) { await marcher(Pe, [[-.4, -6.5]]); retirerPnj('pere'); }
  marcher(C, [[-4.9, -5.6]]).then(() => { C.cap = Math.PI / 2; oreille(C, true); }).catch(() => { });
  verifier(j);
  retirerPnj('ayike'); retirerPnj('guerisseuse'); // les invitées repartent : la journée commence
  F.e.gagne = 0; passer('jour'); S().cap = 0; S().orbite = 0; F.bloque = false; majHud(); // face à la famille
  rafraichirActeurs();
  F.ctx.ligne(`Le Favi : gagne ${fmt(but())} avant la nuit. Menu (le rond à droite) → « Travailler » : zémidjan, taxi… Le Chef attend dans la cour, si tu veux signer.`);
}
/** Le jour : le Chef attend dans la cour, avec son papier. */
async function parlerAuChef() {
  const C = F.pnj.chef; if (!C) return;
  F.bloque = true; majHud();
  const r = await dire('chef', `Alors, Koffi ? ${fmt(Math.max(0, but() - F.e.gagne))} à trouver avant ce soir… Une signature, et tout est réglé.`, ['Signer la promesse de vente', 'Non. Pas aujourd’hui.'], { pnj: C });
  if (r === 0) return conclureSoir(true);
  F.bloque = false; majHud();
}
async function sceneSoir() {
  const j = F.jeton; F.bloque = true; majHud();
  placerDansCour(0, -4.8, 0);
  const A = pnj('agnes', 'maman', -.8, -3.65, Math.PI), C = pnj('chef', 'bureau', .9, -3.7, Math.PI);
  plan([-2.8, 1.7, -6.3], [.1, 1.3, -3.9]);
  await pause(.4); verifier(j);
  await dire('agnes', 'Le soir tombe, Koffi. La famille attend.', ['Je suis là.'], { pnj: A });
  const manque = Math.max(0, but() - F.e.gagne), argent = VIE.data?.argent ?? 0, peut = manque === 0 && argent >= but();
  const payer = manque > 0 ? `Payer ${fmt(but())} (il te manque ${fmt(manque)})` : argent < but() ? `Payer ${fmt(but())} (tu n’as plus que ${fmt(argent)})` : `Payer ${fmt(but())} avec ton argent`;
  const r = await dire('chef', 'Alors ? Tu paies… ou tu signes ?', [payer, 'Signer le papier du Chef'], { pnj: C, desactives: peut ? [] : [0] });
  if (r === 0 && !(await depenser(but(), 'les funérailles de Mémé Houéfa'))) { F.ctx.ligne('Le paiement n’est pas passé : réessaie.'); F.bloque = false; majHud(); return; }
  await conclureSoir(r === 1);
}
/** Le choix du soir : payer avec son argent, ou signer. Il change la vision. */
async function conclureSoir(signe) {
  const j = F.jeton; F.bloque = true;
  F.e.signe = signe; F.e.paye = !signe; sauver();
  const A = F.pnj.agnes || pnj('agnes', 'maman', 1.4, 1.1, Math.PI), C = F.pnj.chef;
  if (signe) {
    son('piece');
    if (C) await dire('chef', 'Sage décision. Horizon Bleu s’occupe de tout. Monsieur Dorval sera content.', ['…'], { pnj: C });
    await dire('agnes', '… Que Houéfa te pardonne, mon fils. Ce soir, n’oublie pas : sous son lit.', ['…'], { pnj: A });
  } else {
    if (C) await dire('chef', 'Hm. Tu as trouvé l’argent. On se reverra, Koffi.', ['Au revoir, Chef.'], { pnj: C });
    await dire('agnes', 'Houéfa serait fière de toi. Ce soir, n’oublie pas : sous son lit.', ['Merci, Maman Agnès.'], { pnj: A });
  }
  verifier(j); plan(null);
  await sceneNuit();
}
async function sceneNuit() {
  const j = F.jeton; F.bloque = true; majHud();
  await voile(true, 1); verifier(j);
  musique(false); passer('nuit'); placerDevant(); preparerCour();
  F.observe = 0;
  const Z = F.zb, s = S();
  if (Z && F.trace) { // dans la rue, quelques mètres avant le carrefour : le Zangbeto qui tourne, de face
    const p = pointSur(F.trace.pts, Math.max(0, F.trace.L1 - 13)), y = hauteur(Z.x0, Z.z0, 0);
    plan([p.x - p.dz * 1.5, y + 2.4, p.z + p.dx * 1.5], [Z.x0, y + 1.5, Z.z0], false);
  }
  s.cap = F.maison.dehors + Math.PI; // face au portail
  await pause(.8); await voile(false, 1.2);
  await titre('Plus tard', '22 h', 'La cour s’est vidée. Au carrefour, un Zangbeto tourne : le gardien de la nuit.', 3.4); verifier(j);
  plan(null); F.bloque = false; majHud();
  F.ctx.ligne('22 h. Entre chez Mémé Houéfa et regarde sous son lit.');
}
async function sousLeLit() {
  const j = F.jeton; F.bloque = true; majHud();
  const items = [
    ['statuette', 'Une statuette de bois', 'Polie par les mains de Mémé. Elle la gardait toujours près d’elle.'],
    ['carnet', 'Un carnet', 'Couvert de son écriture : des noms de quartiers, des lignes tracées entre eux.'],
    ['bracelet', 'Un bracelet de fer', 'Forgé, lourd et froid. Il semble attendre ton poignet.'],
  ];
  plan([LIT.x + .9, .75, LIT.z - LIT.larg / 2 - 1.5], [LIT.x - .1, .12, LIT.z - LIT.larg / 2 + .05]); F.cacherMoi = true; // sous le lit, de près
  await pause(2); verifier(j);
  const html = `<small class="ev-sur">Sous le lit de Mémé Houéfa</small><h2>Ce qu’elle t’a laissé</h2><ul class="fv-objets">${items.map(([id, n, t]) => `<li><i class="fv-ic fv-ic-${id}" aria-hidden="true">${ICONES[id]}</i><div><b>${n}</b><span>${t}</span></div></li>`).join('')}</ul>`;
  await fiche(html, ['Mettre le bracelet']); verifier(j);
  F.nuitObjets.visible = false; son('arret'); F.cacherMoi = false;
  passer('ligne');
  const p = joueurDansCour() || [-5, 4.2], vb = [LIT.x - p[0], LIT.z - p[1]], nb = Math.hypot(...vb) || 1; // Koffi, de face, le lit derrière la caméra
  S().cap = Math.atan2(vb[0], vb[1]); plan([p[0] + vb[0] / nb * 1.3, 1.55, p[1] + vb[1] / nb * 1.3], [p[0], 1.45, p[1]]);
  await dire('meme', 'Vi cé… Cotonou a une âme. Tu peux la voir. Peu de gens peuvent.', ['Mémé ?'], {});
  plan(null);
  allumerLigne(); if (F.ligne) F.ligne.material.uniforms.uForce.value = 0; F.vueLigne = false;
  F.bloque = false; majHud();
}
const ICONES = {
  statuette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.6"/><path d="M9.5 9.5h5l-1 5h-3z"/><path d="M10.5 14.5 9 21h6l-1.5-6.5"/></svg>',
  carnet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6z"/><path d="M6 3v18M9 8h6M9 12h6M9 16h4"/></svg>',
  bracelet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="8" ry="5"/><ellipse cx="12" cy="12" rx="5.5" ry="2.8"/></svg>',
};
/** Première sortie avec le bracelet : la caméra monte, la ligne s'allume le long de la rue. */
async function montrerLigne() {
  const j = F.jeton; F.bloque = true; F.vueLigne = true; majHud();
  const T = F.trace, s = S(), m = pointSur(T.pts, T.L1 * .45), c = pointSur(T.pts, T.L1 * .62);
  plan([m.x - m.dz * 7 - m.dx * 16, s.y + 27, m.z + m.dx * 7 - m.dz * 16], [c.x, s.y, c.z], false); // de haut : la ligne de la porte au carrefour, et le Zangbeto
  await pause(.6);
  await titre('La ligne Vo de Cadjèhoun', 'Cotonou a une âme', '', 3); verifier(j);
  plan(null); F.bloque = false; majHud();
}
async function permission() {
  const j = F.jeton, Z = F.zb; if (!Z || Z.permis) return;
  Z.permis = true; F.bloque = true; Z.anneau.visible = false; majHud();
  const s = S(), dZ = Math.hypot(s.x - Z.x, s.z - Z.z) || 1; plan([s.x + (s.x - Z.x) / dZ * 3, s.y + 2.4, s.z + (s.z - Z.z) / dZ * 3], [Z.x, s.y + 1.4, Z.z], false);
  await dire('meme', 'Le Zangbeto garde la nuit. Sans sa permission, ne passe pas.', ['Je comprends, Mémé.'], {}); verifier(j);
  // Il s'écarte de la ligne, du côté où elle ne va pas, et s'efface.
  const T = F.trace, i = T.pts.findIndex(p => p[0] === T.C[0] && p[1] === T.C[1]), a = T.pts[Math.max(0, i - 1)], b = T.pts[Math.min(T.pts.length - 1, i + 1)];
  let dx = -(b[1] - a[1]), dz = b[0] - a[0]; const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n; if (dx * (s.x - Z.x0) + dz * (s.z - Z.z0) > 0) { dx = -dx; dz = -dz; }
  Z.dx = dx; Z.dz = dz; Z.part = .001;
  await pause(2.4); verifier(j);
  plan(null); F.bloque = false; majHud();
  F.ctx.ligne('Le Zangbeto t’a laissé passer. Suis la ligne jusqu’au bout.');
}
async function echec() {
  const j = F.jeton; F.bloque = true; majHud();
  son('choc');
  await dire('meme', 'Trop près, vi cé ! Sans sa permission, on ne passe pas…', ['…'], {});
  await voile(true, 1); verifier(j);
  eteindreLigne(); retirerZangbeto(); F.trace = null; F.observe = 0;
  F.e.essais = (F.e.essais || 0) + 1; F.e.etape = 'nuit'; sauver();
  setMood('jour'); placerDansCour(-5.4, 4.3, Math.PI); preparerCour(); F.nuitObjets.visible = false; plan([-3.2, 1.8, 3.6], [-5.8, .7, 5.2]);
  await pause(.6); await voile(false, 1.2);
  await fiche('<small class="ev-sur">Au matin</small><h2>Le bracelet a glissé de ton poignet</h2><p class="fv-texte">Tu te réveilles dans la chambre de Mémé. Le bracelet n’est plus là : il est retourné sous son lit. Il faudra rejouer la nuit, et laisser le Zangbeto faire son travail.</p>', ['Attendre la nuit']); verifier(j);
  await voile(true, .8);
  plan(null); passer('nuit'); placerDansCour(-3.9, 2.2, Math.PI);
  await pause(.5); await voile(false, 1);
  await titre('La nuit suivante', '22 h', 'Le bracelet t’attend sous le lit de Mémé.', 2.6); verifier(j);
  F.bloque = false; majHud();
}
async function sceneVision() {
  const j = F.jeton; F.bloque = true; majHud(); passer('vision');
  await voile(true, 1); verifier(j);
  construireAvenir(); app().classList.add('favi-vision'); F.cacherMoi = true;
  const M = F.maison, P = M.P, nx = P.nx, nz = P.nz, lat = [-nz, nx];
  const recul = F.e.signe ? 36 : 19, cam0 = [P.x - nx * recul + lat[0] * recul * .4, F.e.signe ? 21 : 16, P.z - nz * recul + lat[1] * recul * .4], vise0 = [P.x + nx * 8, F.e.signe ? 11 : 3, P.z + nz * 8];
  const [hx, hz] = F.hotel, vise1 = [cam0[0] + (hx - cam0[0]) * .04, 18, cam0[2] + (hz - cam0[2]) * .04];
  F.cam = { pos: new THREE.Vector3(...cam0), vise: new THREE.Vector3(...vise0), coupe: true };
  await pause(.5); await voile(false, 1.6);
  await titre('Le bracelet te montre', 'Cadjèhoun · dans 10 ans, si rien ne change', F.e.signe ? 'À la place de la cour de Mémé : la Résidence Horizon Bleu.' : 'La cour de Mémé est toujours là. Mais au loin, à Fidjrossè…', 4.4); verifier(j);
  // La caméra se tourne lentement vers Fidjrossè et l'hôtel.
  const de = F.cam.vise.clone(), vers = new THREE.Vector3(...vise1), t0 = performance.now(), duree = 4200 * VIT;
  F.cam.anim = () => { const k = Math.min(1, (performance.now() - t0) / duree), e = k * k * (3 - 2 * k); F.cam.vise.lerpVectors(de, vers, e); };
  await pause(4.4); verifier(j);
  await dire('meme', 'Ce que tu vois n’est pas encore arrivé.', ['…'], {}); verifier(j);
  await voile(true, 1.2);
  detruireAvenir(); app().classList.remove('favi-vision'); F.cam = null; F.cacherMoi = false;
  eteindreLigne(); retirerZangbeto();
  await pause(.5); await voile(false, 1);
  await sceneFin();
}
async function sceneFin() {
  const j = F.jeton; F.bloque = true; passer('fin');
  await fiche('<div class="fv-carnet"><small>Le carnet de Mémé Houéfa</small><p>Cinq lignes. Cinq gardiens.</p><p>Cadjèhoun, Fidjrossè, Dantokpa, Houéyiho, Akpakpa.</p><p class="fv-sossa">Méfie-toi de Sossa.</p><span class="fv-signe">— H.</span></div>', ['Tourner la page'], 'fv-page'); verifier(j);
  F.e.fini = true; sauver();
  const r = await fiche('<small class="ev-sur">Le Favi</small><h2>Chapitre 1 terminé</h2><p class="fv-texte">Tu portes le bracelet de Mémé Houéfa. La ligne de Cadjèhoun t’a montré ce qui pourrait arriver.</p><p class="fv-suite"><b>Chapitre 2 — Le Python disparu</b><span>bientôt</span></p>', ['Continuer en ville', 'Rejouer le chapitre 1']); verifier(j);
  terminer();
  if (r === 1) { F.e = neuf(); sauver(); lancer(); }
}

// ---------- Commencer, reprendre, arrêter ----------
/** À l'arrivée en ville par ?favi ou « Histoire » (salon.js) : à la place du réveil chez soi. */
export function entrerFavi() { F.venir = false; lancer(); }
function lancer() {
  if (!F.ctx) return;
  const T = F.ctx.T; if (T.mode !== 'pied') { F.ctx.ligne('Descends d’abord de ton véhicule pour commencer l’histoire.'); return; }
  if (F.e.fini) { F.e = neuf(); sauver(); }
  creerInterface();
  if (!declarerMaison()) { F.ctx.ligne('La maison de Mémé Houéfa est introuvable : l’histoire ne peut pas commencer.'); return; }
  F.jeton++; F.actif = true; F.dedans = false;
  F.avant ??= { auto: heureAutomatique(), moment: app().dataset.moment || 'jour' };
  app().classList.add('favi'); ouvrirMaison(true);
  chargerActeurs(); // Koffi, Agnès, le Chef… : on devient Koffi dès qu'il est là
  const e = F.e.etape;
  if (['funerailles', 'profil', 'offre'].includes(e)) jouer(e === 'funerailles' || !F.e.profil ? sceneFunerailles : sceneReprise);
  else if (e === 'jour' || e === 'soir') { passer(e); placerDevant(); preparerPnjJour(); F.bloque = false; majHud(); F.ctx.ligne(e === 'jour' ? `Le Favi : gagne ${fmt(but())} avant la nuit (${fmt(F.e.gagne)} déjà).` : 'Le soir tombe : la famille t’attend chez Mémé Houéfa.'); }
  else jouer(sceneNuit); // la nuit, la ligne, la vision : on rejoue la nuit
}
// Reprise après le tirage : on revient dans la cour, et le Chef arrive.
async function sceneReprise() {
  const j = F.jeton; F.bloque = true;
  await Promise.race([Promise.all([personnagesCharges(), chargerActeurs()]), pause(7)]); verifier(j);
  placerDansCour(0, -5.6, 0); passer('offre'); musique(true);
  pnj('agnes', 'maman', 1.4, 1.1, Math.PI);
  await sceneOffre();
}
/** Le jour et le soir, dans la cour : Maman Agnès près de la photo, le Chef près du portail, au téléphone. */
function preparerPnjJour() {
  const I = F.maison.I; if (!I.g) return; // construite à la première entrée (surEntree)
  if (!F.pnj.agnes) pnj('agnes', 'maman', 1.9, 1.0, Math.PI);
  if (!F.pnj.chef && F.e.etape === 'jour') { const C = pnj('chef', 'bureau', -4.9, -5.6, Math.PI / 2); oreille(C, true); }
}
/** Arrêter l'histoire (on la garde où elle en est) : quitter la ville, ou « Quitter l'histoire ». */
function arreter() {
  if (!F.actif) return;
  F.jeton++; F.dlg?.annuler(); F.fermerFiche?.(); F.actif = false; F.bloque = false; F.cam = null; F.enScene = false; F.cacherMoi = false; F.chambre = false;
  F.ctx.incarner?.(null); // on reprend sa propre tenue
  taire(); musique(false); detruireAvenir(); if (F.polaire !== undefined) { controls.maxPolarAngle = F.polaire; F.polaire = undefined; } eteindreLigne(); retirerZangbeto(); F.trace = null;
  for (const id of Object.keys(F.pnj)) retirerPnj(id);
  const U = F.ui; if (U) { U.hud.hidden = true; U.titre.hidden = true; U.voile.classList.remove('noir'); U.fiche.hidden = true; }
  app().classList.remove('favi', 'favi-vision', 'favi-bloque');
  if (S()?.lieu === F.maison?.I) F.ctx.dehors(true);
  ouvrirMaison(false); rendreHeure();
  if (F.e.etape === 'ligne' || F.e.etape === 'vision') { F.e.etape = 'nuit'; sauver(); }
}
function terminer() { arreter(); F.e.fini = true; sauver(); F.ctx.ligne('Le Favi · chapitre 1 terminé. Le chapitre 2, « Le Python disparu », arrive bientôt.'); }
function rendreHeure() { const A = F.avant; F.avant = null; if (!A) return; if (A.auto) reprendreLHeure(); else setMood(A.moment); }
/** En quittant la ville (salon.js) : l'histoire s'arrête où elle en est. */
export function quitterFavi() { arreter(); F.venir = false; }

/** Le panneau de l'icône « Histoire » : où l'on en est, commencer, reprendre, recommencer, arrêter. */
async function panneau() {
  if (!F.ctx?.S.actif) return;
  creerInterface();
  if (F.dlg || F.bloque) return;
  const e = F.e, enCours = e.etape !== 'funerailles' || e.profil, etat = e.fini ? 'Chapitre 1 terminé. Le chapitre 2, « Le Python disparu », arrive bientôt.' : enCours ? `En cours : ${({ profil: 'les funérailles', offre: 'l’offre du Chef', jour: `la journée de travail (${fmt(e.gagne)} sur ${fmt(but())})`, soir: 'le soir, chez Mémé', nuit: 'la nuit', ligne: 'la nuit', vision: 'la nuit', fin: 'la fin du chapitre' })[e.etape] || 'les funérailles'}.` : 'Pas encore commencé.';
  const html = `<small class="ev-sur">Histoire</small><h2>Le Favi</h2><p class="fv-texte"><b>Chapitre 1 · L’éveil.</b> Tu es Koffi, 22 ans, zémidjan à Cadjèhoun. Ta grand-mère, Mémé Houéfa, vient de mourir. Elle gardait un secret de la ville…</p><p class="fv-etat">${esc(etat)}${RAPIDE ? ' · mode rapide' : ''}</p>`;
  const boutons = F.actif ? ['Continuer', ...(RAPIDE && e.etape === 'jour' ? ['Raccourci de test : journée faite'] : []), 'Recommencer le chapitre', 'Arrêter l’histoire'] : e.fini ? ['Rejouer le chapitre 1', 'Fermer'] : enCours ? ['Reprendre l’histoire', 'Recommencer le chapitre', 'Fermer'] : ['Commencer l’histoire', 'Fermer'];
  let r; F.panneau = true; try { r = await fiche(html, boutons); } catch { return; } finally { F.panneau = false; }
  const b = boutons[r];
  if (b.startsWith('Raccourci')) { F.e.gagne = but(); passer('soir'); F.ctx.ligne('Raccourci de test : la journée est faite (rien n’est ajouté à ton argent). Le soir tombe.'); if (F.dedans) jouer(sceneSoir); return; }
  if (b === 'Recommencer le chapitre' || b === 'Rejouer le chapitre 1') { arreter(); F.e = neuf(); sauver(); lancer(); }
  else if (b === 'Arrêter l’histoire') { arreter(); F.ctx.ligne('Histoire arrêtée : elle t’attend où tu l’as laissée (icône « Histoire »).'); }
  else if (b === 'Reprendre l’histoire' || b === 'Commencer l’histoire') lancer();
}

// ---------- À chaque image (salon.js, après la caméra) ----------
export function majFavi(dt) {
  if (!F.actif) return;
  F.t += dt;
  const s = S(), M = F.maison, dedans = !!M && s.lieu === M.I;
  if (dedans !== F.dedans) { F.dedans = dedans; surEntree(dedans); }
  majPnj(dt); majZangbeto(dt);
  if (F.ligne) { const u = F.ligne.material.uniforms; u.uT.value = F.t; u.uForce.value = Math.min(1, u.uForce.value + dt * .5); u.uApres.value += ((F.zb && !F.zb.permis ? .22 : 1) - u.uApres.value) * Math.min(1, dt * 1.5); }
  for (const [i, d] of F.seuils.entries()) d.material.opacity = .3 + .18 * Math.sin(F.t * 1.6 + i * 1.3);
  if (F.fin) { F.fin.children[0].scale.setScalar(1 + .12 * Math.sin(F.t * 2)); F.fin.children[1].material.opacity = .3 + .15 * Math.sin(F.t * 1.4); }
  for (const b of F.bougies) b.scale.y = 1.6 * (1 + .12 * Math.sin(F.t * 13 + b.position.x * 9));
  // La nuit de la ligne : le Zangbeto, de loin.
  if (F.e.etape === 'ligne' && !dedans && !F.bloque && !F.enScene && F.zb) {
    if (!F.vueLigne && F.ligne) jouer(montrerLigne);
    else if (!F.zb.permis) {
      const d = Math.hypot(s.x - F.zb.x, s.z - F.zb.z);
      if (d < PRES_ZB) jouer(echec);
      else if (d < VUE_ZB) { F.observe += dt; if (F.observe >= OBSERVER) jouer(permission); }
    } else if (F.trace && Math.hypot(s.x - F.trace.fin[0], s.z - F.trace.fin[1]) < 7) jouer(sceneVision);
  }
  // Caméra des scènes : posée, ou animée ; la première image coupe net (sous un fondu), ensuite elle glisse.
  // Les plans des scènes regardent souvent à l'horizontale : les contrôles de la caméra (75° au plus, scene.js) la
  // relevaient de plusieurs mètres. On leur laisse l'horizon le temps de la scène.
  if (F.cam && F.polaire === undefined) { F.polaire = controls.maxPolarAngle; controls.maxPolarAngle = Math.PI - .05; }
  else if (!F.cam && F.polaire !== undefined) { controls.maxPolarAngle = F.polaire; F.polaire = undefined; }
  if (F.cam) {
    F.cam.anim?.();
    if (F.cam.coupe || !F.cam.ici) { F.cam.ici = F.cam.pos.clone(); F.cam.coupe = false; } else F.cam.ici.lerp(F.cam.pos, 1 - Math.exp(-dt * 2.5)); // sa propre position : le salon replace la caméra à chaque image
    camera.position.copy(F.cam.ici);
    controls.target.copy(F.cam.vise); camera.lookAt(F.cam.vise);
    if (s.moi) s.moi.visible = true;
  }
  if (M) { const loin = Math.hypot(M.I.porte[0] - s.x, M.I.porte[1] - s.z) > 8; M.etq.visible = !dedans && loin && !F.bloque && !F.vision; } // « Chez Mémé Houéfa » : de loin seulement
  if (F.halo) F.halo.material.opacity = ['soir', 'nuit', 'ligne', 'vision', 'fin'].includes(F.e.etape) ? .38 + .04 * Math.sin(F.t * 3) : 0;
  // Dans la chambre de Mémé, sous son toit : la lampe de la pièce passe dans la chambre (interieurs.js), sinon elle y fait noir.
  const pc = dedans ? joueurDansCour() : null, chambre = !!pc && pc[0] < -1.75 && pc[1] > 3.05;
  if (chambre !== !!F.chambre) { F.chambre = chambre; if (chambre) { const I = M.I; lampeIci(new THREE.Vector3(I.centre[0] - 4.9, arriveeDedans(I).y + 2.4, I.centre[1] + 4.9), 9, 7); } else if (dedans) ouvrirInterieur(M.I); }
  if (F.cacherMoi && s.moi) s.moi.visible = false; // plans sans Koffi : sous le lit, la vision
  app().classList.toggle('favi-bloque', F.bloque); // pendant une scène : ni boutons d'action, ni joystick, ni discussion (favi.css)
  F.majT = (F.majT || 0) - dt; if (F.majT <= 0) { F.majT = .25; majHud(); }
}
function surEntree(dedans) {
  musique(dedans && ['funerailles', 'offre', 'jour', 'soir'].includes(F.e.etape));
  if (!dedans) { majHud(); return; }
  preparerCour();
  if (F.e.etape === 'jour' || F.e.etape === 'soir') preparerPnjJour();
  if (F.e.etape === 'soir' && !F.enScene) jouer(sceneSoir);
  majHud();
}

/** Les actions du moment dans le salon (touche E) : parler au Chef, regarder sous le lit. */
export function actionsFavi() {
  if (!F.actif || F.bloque || F.enScene) return [];
  const p = joueurDansCour(); if (!p) return [];
  const out = [], e = F.e.etape, C = F.pnj.chef, A = F.pnj.agnes;
  if (e === 'jour' && C && Math.hypot(p[0] - C.x, p[1] - C.z) < 2.6) out.push({ texte: 'Parler au Chef', f: () => jouer(parlerAuChef) });
  if (A && e === 'jour' && Math.hypot(p[0] - A.x, p[1] - A.z) < 2.2) out.push({ texte: 'Parler à Maman Agnès', f: () => jouer(async () => { F.bloque = true; await dire('agnes', 'Va travailler, mon fils. Reviens avant la nuit. Et ne laisse personne te presser.', ['Oui, Maman.'], { pnj: A }); F.bloque = false; }) });
  if (Math.hypot(p[0] - LIT.x, p[1] - (LIT.z - LIT.larg / 2)) < 2) {
    if (e === 'nuit') out.push({ texte: 'Regarder sous le lit', f: () => jouer(sousLeLit) });
    else if (['jour', 'soir'].includes(e)) out.push({ texte: 'Regarder sous le lit', f: () => F.ctx.ligne('« Pas avant la nuit », a dit Maman Agnès.') });
  }
  return out;
}

// ---------- Branchement (salon.js) ----------
/** ctx : { S, T, ligne, dedans, dehors, bulle, retirerBulle, gps }. */
export function initFavi(ctx) {
  F.ctx = ctx; creerInterface();
  fetch(`${import.meta.env.BASE_URL}favi/portraits/index.json`).then(r => (r.ok && /json/.test(r.headers.get('content-type') || '') ? r.json() : [])).then(l => { if (Array.isArray(l)) for (const id of l) F.portraits.add(String(id)); }).catch(() => { });
  // L'argent gagné en travaillant (vie.js, comme chapitres.js) : la journée des funérailles.
  surSignal((evt, n) => {
    if (!F.actif || F.e.etape !== 'jour' || evt !== 'travail') return;
    F.e.gagne += n; sauver(); majHud();
    if (F.e.gagne >= but()) { passer('soir'); son('arret'); F.ctx.ligne(`Tu as gagné ${fmt(F.e.gagne)} : de quoi payer les funérailles. Le soir tombe, rentre chez Mémé Houéfa.`); if (F.dedans) jouer(sceneSoir); } // déjà dans la cour : la famille est là
  });
  $('#slHistoireBtn')?.addEventListener('click', panneau);
  $('#btnHistoire')?.addEventListener('click', () => document.dispatchEvent(new Event('kv:favi'))); // hors de la ville : la fenêtre d'entrée (salon.js)
}
