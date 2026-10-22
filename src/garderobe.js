import { $ } from './base.js';
import { JEU } from './jeu.js';
import { ARTICLES } from './mode.js';
import { VIE, depenser, ecrire } from './vie.js';

// ---------- Ton personnage : une femme ou un homme, et ses tenues ----------
// Depuis le 22/10, comme dans GTA : le joueur incarne une jeune femme ou un jeune homme, toujours les mêmes, et ne change
// que d'habits. Ce sont les personnes de la boutique de mode (une même description Tripo par genre, scripts/personnages.mjs) :
// deux tenues offertes chacun, les autres s'achètent avec l'argent de « Ma vie ». Les passants, clients et vendeuses
// n'utilisent jamais ces modèles (personnages.js, choisirId) : on ne croise pas son sosie en ville.

const BASE = [['top-f', 'Haut et jean', true], ['pagne-f', 'Pagne du quotidien', true], ['tshirt-h', 'T-shirt et jean', false], ['maillot-h', 'Maillot et short', false]];
// Les personnages choisis avant le 22/10 : on garde le genre, avec la première tenue offerte.
const ANCIENS = { vendeuse: true, etudiante: true, maman: true, jeune: false, bureau: false, ancien: false };
export const TENUES = [
  ...BASE.map(([id, nom, femme]) => ({ id, modele: `t:${id}`, nom, femme, prix: 0 })),
  ...Object.entries(ARTICLES).filter(([, A]) => A.type === 'tenue').map(([id, A]) => ({ id, modele: `t:${id}`, nom: A.nom, femme: !!A.femme, prix: (A.prixJeu || 800) * 10 })),
];
const vignette = id => `${import.meta.env.BASE_URL}modeles/mode/vignettes/${id}.webp`;
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
export const tenueDe = modele => TENUES.find(t => t.modele === modele);
export const estFemme = modele => tenueDe(modele)?.femme ?? ANCIENS[modele] ?? true;
/** Le personnage enregistré, mis à jour : un ancien personnage devient la tenue offerte de son genre ; null si inconnu. */
export const modeleActuel = m => tenueDe(m) ? m : m in ANCIENS ? TENUES.find(t => t.femme === ANCIENS[m] && !t.prix).modele : null;
/** Tenues achetées : celles de « Ma vie » et celles de la boutique de Zém Run. */
function achetees() { return new Set([...(VIE.data?.garderobe || '').split(',').filter(Boolean), ...(JEU.prog?.garderobe || [])]); }
export const possede = t => !t.prix || achetees().has(t.id);

/** Grille de tenues (cartes avec vignette). `seulementPossedees` : à l'entrée du salon, avant d'avoir sa vie. */
export function grilleTenues(el, { femme, choisi, choisir, seulementPossedees = false }) {
  el.replaceChildren();
  for (const t of TENUES.filter(t => t.femme === femme && (!seulementPossedees || possede(t)))) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'gr-carte'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(t.modele === choisi));
    const img = new Image(); img.src = vignette(t.id); img.alt = ''; // 5 à 8 Ko : pas de chargement différé (la carte du grand boubou restait vide)
    const nom = document.createElement('b'); nom.textContent = t.nom;
    const sous = document.createElement('small'); sous.textContent = t.modele === choisi ? 'Tu la portes' : possede(t) ? (t.prix ? 'Dans ta garde-robe' : 'Offerte') : fmt(t.prix);
    if (!possede(t)) b.classList.add('a-acheter');
    b.append(img, nom, sous); b.addEventListener('click', () => choisir(t)); el.append(b);
  }
}
/** Le choix femme / homme (deux boutons). */
export function choixGenre(el, femme, changer) {
  el.replaceChildren();
  for (const [f, txt] of [[true, 'Une femme'], [false, 'Un homme']]) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(f === femme));
    b.addEventListener('click', () => changer(f)); el.append(b);
  }
}

// ---------- La garde-robe, dans le salon ----------
const G = { femme: true, porter: null, ligne: () => { } };
export function initGarderobe({ porter, ligne }) {
  G.porter = porter; G.ligne = ligne;
  $('#grFermer')?.addEventListener('click', () => { $('#garderobe').hidden = true; });
}
export function ouvrirGarderobe(modele) {
  G.femme = estFemme(modele); G.modele = modele; rendre(); $('#garderobe').hidden = false;
}
function rendre() {
  $('#grArgent').textContent = VIE.data ? `Tu as ${fmt(VIE.data.argent)}` : '';
  choixGenre($('#grGenre'), G.femme, f => { G.femme = f; rendre(); });
  grilleTenues($('#grTenues'), { femme: G.femme, choisi: G.modele, choisir });
}
async function choisir(t) {
  if (!possede(t)) {
    if (!VIE.data || VIE.data.argent < t.prix) { $('#grArgent').textContent = `Il te faut ${fmt(t.prix)} pour « ${t.nom} » : travaille un peu !`; return; }
    if (!(await depenser(t.prix, `tenue « ${t.nom} »`))) return;
    await ecrire({ garderobe: [...achetees()].filter(id => TENUES.some(x => x.id === id)).concat(t.id).join(',').slice(0, 200) });
  }
  G.modele = t.modele; rendre();
  G.porter?.(t.modele);
}
