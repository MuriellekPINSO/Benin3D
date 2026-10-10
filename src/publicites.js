import * as THREE from 'three';
import { $ } from './base.js';

// ---------- Publicité : un seul catalogue pour toute la ville et pour Zém Run ----------
// Chaque campagne alimente les panneaux 4 × 3 des grands axes (rue.js) et les grands
// panneaux posés le long des trajets du jeu (bordure.js). Les affiches sont dessinées
// (texte et couleurs de la marque, sans logo) : pour une vraie campagne, mettre le
// visuel fourni par l'annonceur dans sources/pubs/, `npm run pubs` le met au format 4:3
// (public/pubs/, 1024 × 768 px), puis l'indiquer dans `image`. Les marques réelles ne
// doivent être affichées dans une version publique qu'avec l'accord de l'annonceur.

export const CONTACT_PUB = ''; // adresse ou numéro à afficher dans l'offre (à renseigner)

// Visuels réels de Moov Africa (sources/pubs/moov/, mis au format par `npm run pubs`).
const moov = (id, titre, sous) => ({ id: `moov-${id}`, marque: 'Moov Africa', titre, sous, fond: '#0a5aa8', encre: '#ffffff', accent: '#f58220', poids: 2, image: `pubs/moov-${id}.jpg` });
export const CAMPAGNES = [
  { id: 'mtn-momo', marque: 'MTN', titre: 'MoMo', sous: 'Envoyez, payez, retirez partout au Bénin', fond: '#ffcc00', encre: '#111111', accent: '#111111', poids: 3 },
  moov('sayaa', 'Moov Sayaa', '2 500 F : 102 minutes vers tous les réseaux'),
  moov('meilleur', 'Le meilleur du Bénin', 'Le meilleur du Bénin est avec toi !'),
  moov('199', '*199#', 'Un seul code pour tous les services Moov Africa'),
  moov('canal', 'Canal+', 'Les offres Canal+ sans consommer ton forfait internet'),
  moov('fidelis', 'Moov Fidelis', 'Ta fidélité récompensée !'),
  moov('depistage', '#UnPasContreLeCancer', 'Je me dépiste, et toi ?'),
  moov('gaming', 'Moov Gaming League', 'Panel innovation technologique et gaming'),
  moov('vacances', 'Le meilleur des vacances', 'Moov Cash+ et Mia'),
  { id: 'vodun-days', marque: 'Ouidah', titre: 'VODUN DAYS', sous: '9 et 10 janvier · Ouidah', fond: '#7a1f2b', encre: '#ffffff', accent: '#f2c21b', poids: 2 },
  { id: 'benin-revele', marque: 'Tourisme', titre: 'LE BÉNIN RÉVÉLÉ', sous: 'Visitez, découvrez, vivez', fond: '#14532d', encre: '#ffffff', accent: '#facc15', poids: 2 },
  { id: 'qualiwo', marque: 'Qualiwo', titre: 'QUALIWO', sous: 'Commandez en un geste', fond: '#c75b39', encre: '#ffffff', accent: '#ffe7a8', poids: 2 },
  { id: 'votre-pub', marque: 'Annonceurs', titre: 'VOTRE PUB ICI', sous: 'Panneaux dans la ville 3D et dans Zém Run', fond: '#1d1a16', encre: '#f2c21b', accent: '#f2c21b', poids: 2, offre: true },
  { id: 'bissap', marque: 'Exemple', titre: 'JUS DE BISSAP', sous: '100 % naturel', fond: '#9d174d', encre: '#ffffff', accent: '#fde68a', poids: 1 },
  { id: 'ciment', marque: 'Exemple', titre: 'CIMENT SOLIDE', sous: 'Bâtir pour durer', fond: '#4b5563', encre: '#ffffff', accent: '#facc15', poids: 1 },
];
// Grands panneaux sur mât (place de l'Amazone, siège Moov) : visuels 2:1, deux affiches Moov par face.
export const GRANDES_AFFICHES = [1, 2, 3, 4, 5, 6].map(n => ({ ...moov(`grand-${n}`, 'Moov Africa', 'Un monde nouveau vous appelle'), poids: 0 }));
const total = CAMPAGNES.reduce((s, c) => s + c.poids, 0);
/** Une campagne au hasard (pondérée), à partir d'un nombre entre 0 et 1. */
export function campagne(r) { let x = r * total; for (const c of CAMPAGNES) { x -= c.poids; if (x <= 0) return c; } return CAMPAGNES[0]; }

const cache = new Map();
/** Texture de l'affiche (dessinée, ou visuel de l'annonceur si `image` est fourni). */
export function affiche(c) {
  if (cache.has(c.id)) return cache.get(c.id);
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 768; const g = cv.getContext('2d'), w = 1024, h = 768;
  const fond = g.createLinearGradient(0, 0, w, h); fond.addColorStop(0, c.fond); fond.addColorStop(1, ombre(c.fond)); g.fillStyle = fond; g.fillRect(0, 0, w, h);
  g.fillStyle = c.accent; g.globalAlpha = .22; g.beginPath(); g.arc(w * .86, h * .2, 230, 0, 7); g.fill(); g.globalAlpha = 1;
  g.fillStyle = c.encre; g.font = '700 40px "Plus Jakarta Sans", system-ui, sans-serif'; g.fillText(c.marque.toUpperCase(), 64, 110);
  let t = 150; g.font = `900 ${t}px "Bricolage Grotesque", Impact, sans-serif`; while (g.measureText(c.titre).width > w - 128 && t > 70) { t -= 8; g.font = `900 ${t}px "Bricolage Grotesque", Impact, sans-serif`; }
  g.fillText(c.titre, 60, 360);
  g.font = '600 52px "Plus Jakarta Sans", system-ui, sans-serif'; ligneCoupee(g, c.sous, 64, 470, w - 128, 62);
  g.fillStyle = c.accent; g.fillRect(64, 600, 220, 14);
  // bande aux couleurs du drapeau, comme sur beaucoup de panneaux de Cotonou
  g.fillStyle = '#008751'; g.fillRect(0, h - 40, w * .34, 40); g.fillStyle = '#fcd116'; g.fillRect(w * .34, h - 40, w * .33, 40); g.fillStyle = '#e8112d'; g.fillRect(w * .67, h - 40, w * .33, 40);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  if (c.image) new THREE.TextureLoader().load(import.meta.env.BASE_URL + c.image, img => { tex.image = img.image; tex.needsUpdate = true; });
  cache.set(c.id, tex); return tex;
}
const mats = new Map();
export function matAffiche(c) { if (!mats.has(c.id)) mats.set(c.id, new THREE.MeshBasicMaterial({ map: affiche(c), toneMapped: false })); return mats.get(c.id); }
function ombre(hex) { const col = new THREE.Color(hex); col.multiplyScalar(.62); return '#' + col.getHexString(); }
function ligneCoupee(g, txt, x, y, l, dy) { const mots = txt.split(' '); let ligne = ''; for (const m of mots) { const t = ligne ? ligne + ' ' + m : m; if (g.measureText(t).width > l && ligne) { g.fillText(ligne, x, y); ligne = m; y += dy; } else ligne = t; } g.fillText(ligne, x, y); }

// ---------- Affichages comptés (sur cet appareil) ----------
const CLE = 'cotonou3d.pubs';
let vues = {}; try { vues = JSON.parse(localStorage.getItem(CLE) || '{}'); } catch { vues = {}; }
export function compterVue(id) { vues[id] = (vues[id] || 0) + 1; try { localStorage.setItem(CLE, JSON.stringify(vues)); } catch { } }

// ---------- L'offre aux annonceurs ----------
export function ouvrirOffre() {
  const el = $('#offrePub'); if (!el) return;
  el.querySelector('.op-stats').innerHTML = CAMPAGNES.filter(c => !c.offre).map(c => `<li><i style="background:${c.fond}"></i>${c.marque} · ${c.titre}<b>${(vues[c.id] || 0).toLocaleString('fr-FR')}</b></li>`).join('');
  el.querySelector('.op-contact').textContent = CONTACT_PUB ? `Contact : ${CONTACT_PUB}` : 'Contact : à renseigner dans src/publicites.js (CONTACT_PUB).';
  el.hidden = false;
}
export function initOffre() {
  const el = $('#offrePub'); if (!el) return;
  el.querySelector('.op-x').addEventListener('click', () => { el.hidden = true; });
  el.addEventListener('click', e => { if (e.target === el) el.hidden = true; });
}
