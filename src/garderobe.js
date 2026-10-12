import { $ } from './base.js';
import { JEU } from './jeu.js';
import { ARTICLES } from './mode.js';
import { VIE, depenser, ecrire } from './vie.js';

// ---------- Ton personnage : une femme ou un homme, et ses tenues ----------
// Chaque tenue est un personnage complet (Tripo) : on choisit d'abord femme ou homme, puis la tenue. Trois
// tenues de chaque sont offertes ; les trois autres viennent de la boutique de mode et s'achètent avec
// l'argent de « Ma vie » (gagné en travaillant). Ce qu'on a acheté reste dans la garde-robe.

const BASE = [
  ['vendeuse', 'Pagne et foulard', true], ['etudiante', 'Haut en wax et jean', true], ['maman', 'Grand boubou', true],
  ['jeune', 'Maillot vert et jean', false], ['bureau', 'Chemise de bureau', false], ['ancien', 'Boubou brodé et chéchia', false],
];
export const TENUES = [
  ...BASE.map(([id, nom, femme]) => ({ id, modele: id, nom, femme, prix: 0 })),
  ...Object.entries(ARTICLES).filter(([, A]) => A.type === 'tenue').map(([id, A]) => ({ id, modele: `t:${id}`, nom: A.nom, femme: !!A.femme, prix: (A.prixJeu || 800) * 10 })),
];
const vignette = id => `${import.meta.env.BASE_URL}modeles/mode/vignettes/${id}.webp`;
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
export const tenueDe = modele => TENUES.find(t => t.modele === modele);
export const estFemme = modele => tenueDe(modele)?.femme ?? true;
/** Tenues achetées : celles de « Ma vie » et celles de la boutique de Zém Run. */
function achetees() { return new Set([...(VIE.data?.garderobe || '').split(',').filter(Boolean), ...(JEU.prog?.garderobe || [])]); }
export const possede = t => !t.prix || achetees().has(t.id);

/** Grille de tenues (cartes avec vignette). `seulementPossedees` : à l'entrée du salon, avant d'avoir sa vie. */
export function grilleTenues(el, { femme, choisi, choisir, seulementPossedees = false }) {
  el.replaceChildren();
  for (const t of TENUES.filter(t => t.femme === femme && (!seulementPossedees || possede(t)))) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'gr-carte'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(t.modele === choisi));
    const img = new Image(); img.src = vignette(t.id); img.alt = ''; img.loading = 'lazy';
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
