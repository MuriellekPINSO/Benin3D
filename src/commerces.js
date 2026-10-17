import * as THREE from 'three';
import { $ } from './base.js';
import { son } from './audio.js';
import { creerVehicule, retirerVehicule } from './conduite.js';
import { personne } from './discussions.js';
import { echecCertain, paiementReel, paiementTest, payerMoMo, verifierTransaction } from './paiement.js';
import { EMPLACEMENTS, LOT } from './emplacements.js';
import { texteToile } from './lieux.js';
import { poserObstacles } from './rue.js';
import { scene } from './scene.js';
import { VIE, depenser, ecrireEnPlus, gagner, lireEnPlus, rendreVie, signaler } from './vie.js';

// ---------- Devenir patron : ses commerces à Cotonou (Vivre à Cotonou) ----------
// Des boutiques à louer dans plusieurs quartiers (emplacements.js). On y ouvre un commerce : cabine Mobile Money, maquis,
// salon de coiffure, atelier de couture, boutique de pagnes ou garage de motos. L'installation comprend les meubles,
// l'équipe et un premier stock ; ensuite les employés servent les clients, même quand on est ailleurs : chaque vente
// vide un peu le stock et l'argent arrive dans le portefeuille. On rachète du stock, et l'on paie chaque jour les
// salaires et le loyer (les charges) : trois jours sans payer, et l'équipe s'en va pour de bon.
// Quand on est loin de Cotonou (ou hors du jeu), les employés vendent trois fois moins vite, douze heures au plus.
// Les commerces sont enregistrés avec la vie (vie.js, « données en plus »).
// Ouvrir un commerce se paie aussi pour de vrai : 100 F par Mobile Money (FedaPay, comme l'entrée du concert), vérifiés
// par /api/fedapay. Un paiement reçu mais pas encore utilisé (page fermée, argent du jeu qui manquait) reste acquis dans ce
// navigateur pour la prochaine ouverture ; un paiement pas encore confirmé y est gardé pour être vérifié plus tard.

const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const JOUR = 864e5, ABSENCE_MAX = 12 * 36e5, RALENTI = 3, VOIR = 140; // à moins de VOIR m, la boutique est construite
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const etoiles = n => '★'.repeat(n) + '☆'.repeat(4 - n);

/**
 * Les commerces : installation (F, meubles + équipe + stock plein), charges (salaires par jour, sans le loyer), prix et
 * coût d'une vente (F), f : nom féminin (« ta cabine »), intervalle entre deux clients (s, à affluence 1), stock (ventes), service : durée de la visite
 * d'un client (s). postes : où se tiennent les employés, places : où vont les clients (repère de la parcelle ; a : le
 * regard, 0 vers la rue ; assis : sur une chaise ; dx : on y va en passant à côté, pour contourner une table).
 */
export const TYPES = {
  momo: { nom: 'Cabine Mobile Money', court: 'cabine MoMo', f: true, icone: '📱', install: 8000, charges: 1000, prix: 50, cout: 25, intervalle: 30, stock: 120, unite: ['opération', 'opérations'], stockNom: 'crédit', equipe: ['Agente'], difficulte: 1, potentiel: 1, couleur: '#e3b21c', service: 6,
    texte: 'Dépôts, retraits et crédit : une petite commission sur chaque opération. Facile à tenir.', enseigne: n => `Mobile Money · ${n}`,
    postes: [{ x: 2.2, z: .45, a: 0, assis: true, f: true }], places: [{ x: 2.2, z: 1.7, a: Math.PI }, { x: 2.2, z: 2.6, a: Math.PI }] },
  maquis: { nom: 'Maquis', court: 'maquis', icone: '🍲', install: 25000, charges: 3000, prix: 500, cout: 350, intervalle: 50, stock: 50, unite: ['plat', 'plats'], stockNom: 'ingrédients', equipe: ['Cuisinière', 'Serveuse'], difficulte: 3, potentiel: 4, couleur: '#c8553d', service: 40,
    texte: 'Pâte, sauce gombo, poisson braisé et boissons fraîches. Beaucoup de clients, mais il faut racheter souvent.', enseigne: n => `Maquis chez ${n}`,
    postes: [{ x: -3.8, z: -.6, a: 0, f: true }, { x: -.4, z: -.75, a: 0, f: true }],
    places: [-1.6, .9, 3.4].flatMap(x => [{ x, z: 1.72, a: Math.PI, assis: true }, { x, z: .48, a: 0, assis: true, dx: .8 }]) },
  coiffure: { nom: 'Salon de coiffure', court: 'salon de coiffure', icone: '💇', install: 18000, charges: 2500, prix: 800, cout: 250, intervalle: 180, stock: 30, unite: ['coiffure', 'coiffures'], stockNom: 'produits et mèches', equipe: ['Coiffeuse', 'Coiffeuse'], difficulte: 2, potentiel: 3, couleur: '#8e5bb5', service: 70,
    texte: 'Tresses, coupes et défrisages. Des clients plus rares, mais une belle marge.', enseigne: n => `Coiffure ${n}`,
    postes: [{ x: -1.5, z: 1.4, a: Math.PI, f: true }, { x: 1.5, z: 1.4, a: Math.PI, f: true }], places: [{ x: -1.5, z: .55, a: Math.PI, assis: true, dx: -.75 }, { x: 1.5, z: .55, a: Math.PI, assis: true, dx: .75 }] },
  couture: { nom: 'Atelier de couture', court: 'atelier de couture', icone: '🧵', install: 20000, charges: 2000, prix: 3500, cout: 1500, intervalle: 600, stock: 12, unite: ['tenue', 'tenues'], stockNom: 'fil, boutons et doublure', equipe: ['Couturier', 'Apprentie'], difficulte: 2, potentiel: 3, couleur: '#2f7d6d', service: 12,
    texte: 'Des tenues sur mesure en pagne pour les fêtes. Peu de clients, mais chaque tenue rapporte.', enseigne: n => `Couture ${n}`,
    postes: [{ x: -1.6, z: -.3, a: 0, assis: true, f: false }, { x: 2.7, z: -.6, a: 0, f: true }], places: [{ x: -1.6, z: 1.3, a: Math.PI }, { x: 1, z: 1.15, a: Math.PI }] },
  pagnes: { nom: 'Boutique de pagnes', court: 'boutique de pagnes', f: true, icone: '👗', install: 30000, charges: 1500, prix: 3000, cout: 2400, intervalle: 200, stock: 20, unite: ['pagne', 'pagnes'], stockNom: 'pagnes', equipe: ['Vendeuse'], difficulte: 2, potentiel: 2, couleur: '#d9a521', service: 12,
    texte: 'Wax, kanvô et bazin. Le stock coûte cher, mais il part vite près d’un marché.', enseigne: n => `Pagnes chez ${n}`,
    postes: [{ x: 0, z: -.75, a: 0, f: true }], places: [{ x: -2.1, z: 1.6, a: Math.PI }, { x: 2.1, z: 1.6, a: Math.PI }, { x: 0, z: .2, a: Math.PI }] },
  garage: { nom: 'Garage de motos', court: 'garage', icone: '🏍️', install: 35000, charges: 3500, prix: 1500, cout: 700, intervalle: 180, stock: 25, unite: ['réparation', 'réparations'], stockNom: 'pièces et huile', equipe: ['Mécanicien', 'Apprenti'], difficulte: 3, potentiel: 4, couleur: '#3d6fa8', service: 25,
    texte: 'Vidanges, pneus et freins : à Cotonou, les zems ne manquent pas.', enseigne: n => `Garage ${n}`,
    postes: [{ x: -1.8, z: 1.7, a: Math.PI, f: false }, { x: 1.6, z: .45, a: 0, f: false }], places: [{ x: 0, z: 2.3, a: Math.PI }, { x: 3.3, z: 2.4, a: Math.PI }] },
};

export const PRIX_MOMO = 100; // F, en vrai, à chaque ouverture
const CLE_ATTENTE = 'cotonou3d-paiement-commerce', CLE_ACQUIS = 'cotonou3d-commerce-paye', CLE_UTILISES = 'cotonou3d-paiements-utilises';
const lireLS = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const ecrireLS = (k, v) => { try { if (v) localStorage.setItem(k, String(v)); else localStorage.removeItem(k); } catch { /* navigation privée */ } };
const utilises = () => { try { return JSON.parse(lireLS(CLE_UTILISES) || '[]'); } catch { return []; } };
const MESSAGES_MOMO = {
  annule: ['Paiement annulé : rien n’a été prélevé.', ''],
  canceled: ['Paiement annulé : rien n’a été prélevé.', ''],
  reseau: ['FedaPay ne répond pas. Vérifie ta connexion, puis réessaie.', 'mal'],
  pending: ['Paiement pas encore confirmé. Valide-le sur ton téléphone, puis touche « Vérifier mon paiement ».', ''],
  'non-configure': ['Le paiement MoMo n’est pas encore activé sur ce site.', 'mal'],
  declined: ['Paiement refusé par l’opérateur : rien n’a été prélevé. Tu peux réessayer.', 'mal'],
  'cles-incoherentes': ['Le paiement est mal réglé sur ce site : ton paiement ne peut pas être vérifié pour l’instant. Ne repaie pas ; touche « Vérifier mon paiement » un peu plus tard.', 'mal'],
  deja: ['Ce paiement a déjà servi à ouvrir un commerce : il faut en faire un nouveau.', 'mal'],
};
const DOUTE_MOMO = ['Ton paiement n’a pas encore pu être vérifié. Ne repaie pas : si ton compte MoMo a été débité, touche « Vérifier mon paiement » dans un moment.', 'mal'];

let X = null; // le salon : { S, T, ligne, choisir, allerVers }
const CM = { liste: [], charge: false, attente: 0, depotT: 0, enVol: false, sauveT: 0, verifT: 0, lots: new Map(), choix: '', fiche: null, paie: false, etatPaie: null };
export const nbCommerces = () => CM.liste.length;
export const commerceDe = id => CM.liste.find(c => c.e === id);
const lot = id => EMPLACEMENTS.find(E => E.id === id);
const jour = () => new Date().toLocaleDateString('fr-CA');
const vitesse = (c, E = lot(c.e)) => (E?.affluence || 1) * (E?.atout?.[c.t] || 1);
const chargesDe = c => TYPES[c.t].charges + (lot(c.e)?.loyer || 0);
/** Bénéfice d'une heure de jeu, avant les charges (affiché pour choisir). */
const parHeure = (t, E) => Math.round(3600 / TYPES[t].intervalle * (E.affluence || 1) * (E.atout?.[t] || 1) * (TYPES[t].prix - TYPES[t].cout) / 100) * 100;
const unite = (T, n) => T.unite[n > 1 ? 1 : 0];
const ton = (T, maj = false) => (maj ? (T.f ? 'Ta' : 'Ton') : T.f ? 'ta' : 'ton'); // « ton maquis », « ta cabine MoMo »
const mon = T => (T.f ? 'Ma ' : 'Mon ') + T.court;

// ---------- Repère d'une parcelle ----------
function versMonde(E, lx, lz) { const c = Math.cos(E.cap), s = Math.sin(E.cap); return [E.x + lx * c + lz * s, E.z - lx * s + lz * c]; }
function versLot(E, x, z) { const dx = x - E.x, dz = z - E.z, c = Math.cos(E.cap), s = Math.sin(E.cap); return [dx * c - dz * s, dx * s + dz * c]; }

// ---------- Enregistrement ----------
const compact = c => ({ e: c.e, t: c.t, s: c.s, v: c.v, r: c.r, j: c.j, vj: c.vj, rj: c.rj, d: c.d, c: c.c, m: c.m });
function sauver() { if (CM.charge) ecrireEnPlus('commerces', { l: CM.liste.map(compact), a: Math.round(CM.attente) }); } // a : ventes encaissées pas encore versées

// ---------- Les ventes ----------
function vendre(c, visible = true) {
  const T = TYPES[c.t]; if (c.s <= 0) return;
  c.s--; c.v++; c.r += T.prix;
  if (c.j !== jour()) { c.j = jour(); c.vj = 0; c.rj = 0; }
  c.vj++; c.rj += T.prix; CM.attente += T.prix;
  if (visible) visiteClient(c);
  if (c.s === 0) { X.ligne(`${ton(T, true)} ${T.court} (${lot(c.e).nom}) n’a plus de ${T.stockNom} : réapprovisionne-${T.f ? 'la' : 'le'} dans « Mon bureau ».`); }
  else if (c.s === Math.ceil(T.stock * .2)) X.ligne(`${ton(T, true)} ${T.court} (${lot(c.e).nom}) n’a presque plus de ${T.stockNom} : pense à réapprovisionner.`);
}
/** Les salaires et le loyer de chaque jour ; sans argent, ils s'accumulent : à trois jours de dette, l'équipe part. */
function payerCharges(c, silencieux = false) {
  const m = chargesDe(c), T = TYPES[c.t], E = lot(c.e);
  c.c += JOUR;
  if (!c.d && VIE.data.argent >= m) { depenser(m, silencieux ? '' : `salaires et loyer · ${T.court} (${E.nom})`); return ''; }
  c.d += m;
  if (c.d >= 3 * m) { fermer(c); return `Trois jours sans salaires : l’équipe de ${ton(T)} ${T.court} (${E.nom}) est partie, la boutique est de nouveau à louer.`; }
  return `${ton(T, true)} ${T.court} (${E.nom}) est ${T.f ? 'fermée' : 'fermé'} : tes employés attendent leurs salaires (${fmt(c.d)}). Paie-les dans « Mon bureau ».`;
}
/** Ce qui s'est passé pendant l'absence (hors du salon, page fermée) : quelques ventes et les charges des jours écoulés. */
function rattraper(c, maintenant) {
  const T = TYPES[c.t], absence = Math.min(ABSENCE_MAX, Math.max(0, maintenant - c.m)), msgs = [];
  let n = 0;
  if (!c.d) { const k = Math.min(c.s, Math.floor(absence / 1000 * vitesse(c) / (T.intervalle * RALENTI))); for (let i = 0; i < k; i++) vendre(c, false); n = k; }
  if (n) msgs.push(`Pendant ton absence, ${ton(T)} ${T.court} (${lot(c.e).nom}) a servi ${n} client${n > 1 ? 's' : ''} : +${fmt(n * T.prix)}.`);
  let dernier = ''; for (let k = 0; k < 30 && maintenant >= c.c && CM.liste.includes(c); k++) dernier = payerCharges(c, true) || dernier;
  if (dernier) msgs.push(dernier);
  c.m = maintenant;
  return msgs;
}
/** Verse dans le portefeuille ce que les commerces ont encaissé (5 000 F au plus à la fois, règles de la base). */
function deposer() {
  if (CM.enVol || CM.attente <= 0 || !VIE.data) return;
  const m = Math.min(5000, CM.attente); CM.attente -= m; CM.enVol = true;
  gagner(m, '', { source: 'commerce', silencieux: true }).then(ok => { CM.enVol = false; if (!ok) CM.attente += m; else flashGain(m); sauver(); }, () => { CM.enVol = false; CM.attente += m; });
}
function majBouton() {
  const b = $('#vhCommerces'); if (!b) return;
  const t = CM.liste.length ? `Mon bureau (${CM.liste.length})` : 'Commerces'; if (b.textContent !== t) b.textContent = t;
  b.classList.toggle('alerte', CM.liste.some(c => statut(c)[1] === 'rouge'));
}
function flashGain(m) {
  const el = $('#vhGain'); if (!el) return;
  el.textContent = `+${fmt(m)}`; el.classList.remove('vu'); void el.offsetWidth; el.classList.add('vu');
}

// ---------- Ouvrir, réapprovisionner, payer, céder ----------
async function ouvrir(E, t) {
  const T = TYPES[t];
  if (commerceDe(E.id)) return;
  if (!(await depenser(T.install, `ouverture : ${T.nom.toLowerCase()} (${E.nom})`))) { X.ligne(`Il te faut ${fmt(T.install)} pour ouvrir ce commerce.`); return; }
  const maintenant = Date.now(), c = { e: E.id, t, s: T.stock, v: 0, r: 0, j: jour(), vj: 0, rj: 0, d: 0, c: maintenant + JOUR, m: maintenant };
  CM.liste.push(c); sauver(); son('piece'); prevenir();
  reconstruire(E);
  signaler('commerceOuvert');
  fermerFiche();
  X.ligne(`${ton(T, true)} ${T.court} est ${T.f ? 'ouverte' : 'ouvert'} à ${E.nom} ! Tes employés servent les clients, même quand tu es ailleurs. Suis tes ventes dans « Mon bureau ».`);
  rendreVie();
}
/** « Ouvrir » : 100 F par MoMo (sauf paiement déjà acquis), puis l'installation avec l'argent du jeu. */
async function payerEtOuvrir(E, t) {
  const T = TYPES[t]; if (CM.paie || commerceDe(E.id) || (VIE.data?.argent || 0) < T.install) return;
  if (paiementReel()) {
    CM.paie = true; CM.etatPaie = [lireLS(CLE_ATTENTE) || lireLS(CLE_ACQUIS) ? 'Vérification du paiement…' : 'Ouverture de FedaPay…', '']; choixCommerce(E);
    let id = lireLS(CLE_ACQUIS), r = null;
    if (id && (utilises().includes(id) || !(await verifierTransaction(id, PRIX_MOMO)).paye)) { id = ''; ecrireLS(CLE_ACQUIS, ''); } // on revérifie ce qui est gardé
    if (!id) {
      const attente = lireLS(CLE_ATTENTE);
      CM.etatPaie = [attente ? 'Vérification du paiement…' : 'Ouverture de FedaPay…', '']; if (!$('#vieFiche').hidden) choixCommerce(E);
      r = attente ? await verifierTransaction(attente, PRIX_MOMO) : await payerMoMo({ montant: PRIX_MOMO, description: `Ouverture d’un commerce : ${T.nom} (${E.nom})`, objet: 'commerce', infos: { commerce: t, quartier: E.id } });
      ecrireLS(CLE_ATTENTE, !r.paye && r.id && !echecCertain(r.statut) ? r.id : ''); // en attente ou vérification impossible : on garde le numéro
      if (r.paye && utilises().includes(String(r.id))) r = { ...r, paye: false, statut: 'deja' };
      if (r.paye) { id = String(r.id); ecrireLS(CLE_ACQUIS, id); son('piece'); }
    }
    CM.paie = false;
    if (!id) { CM.etatPaie = MESSAGES_MOMO[r?.statut] || DOUTE_MOMO; if (CM.choix === E.id && !$('#vieFiche').hidden) choixCommerce(E); return; } // jamais « rien n'a été prélevé » sans que FedaPay l'ait dit
    await ouvrir(E, t);
    if (commerceDe(E.id)) { ecrireLS(CLE_UTILISES, JSON.stringify([...utilises(), id].slice(-50))); ecrireLS(CLE_ACQUIS, ''); CM.etatPaie = null; }
    else if (CM.choix === E.id) choixCommerce(E);
    return;
  }
  await ouvrir(E, t);
}
async function reapprovisionner(c, n) {
  const T = TYPES[c.t], prix = n * T.cout; if (n <= 0) return;
  if (!(await depenser(prix, `stock : ${n} ${unite(T, n)} (${T.court}, ${lot(c.e).nom})`))) { X.ligne(`Il te faut ${fmt(prix)} pour ce stock.`); return; }
  c.s = Math.min(T.stock, c.s + n); sauver(); son('piece'); signaler('reappro');
  if (CM.fiche === c) ficheCommerce(c);
}
async function payerDette(c) {
  const m = c.d; if (!m) return;
  if (!(await depenser(m, `salaires en retard (${TYPES[c.t].court}, ${lot(c.e).nom})`))) { X.ligne(`Il te faut ${fmt(m)} pour payer tes employés.`); return; }
  c.d = 0; sauver(); son('piece'); X.ligne('Tes employés sont payés : la boutique rouvre.');
  if (CM.fiche === c) ficheCommerce(c);
}
function fermer(c) {
  CM.liste = CM.liste.filter(x => x !== c); sauver(); prevenir();
  const E = lot(c.e); if (E) reconstruire(E);
}
async function ceder(c) {
  const T = TYPES[c.t], rendu = Math.round(T.install * .4 / 100) * 100;
  fermer(c); fermerFiche();
  X.ligne(`Tu as cédé ${ton(T)} ${T.court} (${lot(c.e).nom}) : le repreneur te donne ${fmt(rendu)}.`);
  for (let r = rendu; r > 0; r -= 5000) await gagner(Math.min(5000, r), '', { source: 'cession', silencieux: true });
}

// ---------- À chaque image du salon ----------
export function majCommerces(dt) {
  if (!CM.charge || !VIE.data || !X) return;
  const S = X.S, maintenant = Date.now();
  for (const c of [...CM.liste]) {
    if (maintenant - c.m > 5000) { for (const m of rattraper(c, maintenant)) X.ligne(m); continue; } // page en arrière-plan, avion…
    c.m = maintenant;
    if (maintenant >= c.c) { const m = payerCharges(c); if (m) X.ligne(m); }
    if (c.d || c.s <= 0) continue;
    const E = lot(c.e), [lx, lz] = versLot(E, S.x, S.z), present = !S.lieu && Math.abs(lx) < 7 && lz > -5 && lz < 3 + E.trottoir + 4; // le patron sur place : les clients achètent plus
    c.acc = (c.acc || Math.random() * TYPES[c.t].intervalle * .5) + dt * vitesse(c, E) * (present ? 1.5 : 1);
    if (c.acc >= TYPES[c.t].intervalle) { c.acc -= TYPES[c.t].intervalle; vendre(c); }
  }
  CM.depotT -= dt; if (CM.depotT <= 0) { CM.depotT = 4; deposer(); }
  CM.sauveT += dt; if (CM.sauveT > 30) { CM.sauveT = 0; sauver(); }
  // Les boutiques proches : construites (et solides), les autres retirées.
  CM.verifT -= dt;
  if (CM.verifT <= 0) {
    CM.verifT = .5; majBouton();
    for (const E of EMPLACEMENTS) {
      const d = Math.hypot(E.x - S.x, E.z - S.z), B = CM.lots.get(E.id);
      if (d < VOIR && !B) construire(E); else if (d > VOIR + 60 && B) detruire(E.id);
    }
  }
  for (const B of CM.lots.values()) { B.g.visible = !S.lieu; majVisites(B, dt); }
}

// ---------- Le salon s'ouvre, se ferme ----------
export function initCommerces(ctx) {
  X = ctx;
  $('#vfFermer')?.addEventListener('click', fermerFiche);
  $('#vieFiche')?.addEventListener('click', e => { if (e.target === e.currentTarget) fermerFiche(); });
  $('#vieFiche')?.addEventListener('click', e => { const b = e.target.closest('[data-cm]'); if (b) actionFiche(b.dataset.cm, b.dataset.v); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#vieFiche')?.hidden) { fermerFiche(); e.stopPropagation(); } }, true);
  $('#vhCommerces')?.addEventListener('click', listeCommerces);
  if (import.meta.env.DEV) window.__commerces = { CM, TYPES, EMPLACEMENTS, ouvrir: (id, t) => ouvrir(lot(id), t), vendre: id => vendre(commerceDe(id)), rattraper, listeCommerces, ficheCommerce, choixCommerce: id => choixCommerce(lot(id)) }; // pour les tests
}
/** À l'entrée dans le salon (la vie est chargée) : les commerces enregistrés, et ce qui s'est passé depuis. */
export function entrerCommerces() {
  const d = lireEnPlus('commerces'), maintenant = Date.now();
  CM.liste = (d?.l || []).filter(c => TYPES[c.t] && lot(c.e)).map(c => ({ ...c }));
  CM.charge = true; CM.attente = Math.max(0, d?.a || 0);
  const msgs = []; for (const c of [...CM.liste]) msgs.push(...rattraper(c, maintenant));
  sauver(); rendreVie(); majBouton(); prevenir();
  return msgs;
}
export function quitterCommerces() {
  if (!CM.charge) return;
  for (const c of CM.liste) c.m = Date.now();
  sauver(); CM.charge = false; prevenir();
  for (const id of [...CM.lots.keys()]) detruire(id);
  fermerFiche();
}
/** Les actions près d'une boutique : la louer, ou gérer la sienne. */
export function actionsCommerces() {
  if (!CM.charge || !X || X.S.lieu || X.T.mode !== 'pied') return [];
  for (const E of EMPLACEMENTS) {
    if (Math.abs(E.x - X.S.x) > 12 || Math.abs(E.z - X.S.z) > 12) continue;
    const [lx, lz] = versLot(E, X.S.x, X.S.z); if (Math.abs(lx) > 5.5 || lz < -1.5 || lz > 3 + E.trottoir + 2.5) continue;
    const c = commerceDe(E.id);
    if (!c) return [{ texte: 'Louer cette boutique', f: () => choixCommerce(E) }];
    const T = TYPES[c.t], manque = T.stock - c.s;
    return [{ texte: mon(T), f: () => ficheCommerce(c) }, ...(manque > T.stock * .3 && !c.d ? [{ texte: `Réapprovisionner · ${fmt(manque * T.cout)}`, f: () => reapprovisionner(c, Math.min(manque, Math.floor(VIE.data.argent / T.cout))) }] : [])];
  }
  return [];
}
/** Ses commerces comme lieux où aller (salon.js : « Aller à », GPS, zém) : devant la boutique, face à elle. */
export function lieuxCommerces() {
  if (!CM.charge) return [];
  return CM.liste.map(c => { const E = lot(c.e), T = TYPES[c.t], [x, z] = versMonde(E, 0, 2.2); return { id: 'cm:' + E.id, nom: `${mon(T)} · ${E.nom}`, dit: `${mon(T)} · ${E.nom}`, x, z, cap: E.cap + Math.PI }; });
}
const prevenir = () => document.dispatchEvent(new CustomEvent('commerces'));
/** De combien (x, z) entre dans un employé ou un client (les meubles sont des obstacles de rue.js). */
export function corpsCommerces(x, z) {
  let p = 0;
  for (const B of CM.lots.values()) {
    if (Math.abs(B.E.x - x) > 14 || Math.abs(B.E.z - z) > 14) continue;
    for (const P of [...B.employes, ...B.visites.map(v => v.p)]) { if (!P) continue; const d = Math.hypot(x - P.position.x, z - P.position.z); if (d < .55) p = Math.max(p, .55 - d); }
  }
  return p;
}

// ---------- Les boutiques en 3D ----------
const M = new Map(); // matériaux par couleur
const mat = c => { if (!M.has(c)) M.set(c, new THREE.MeshLambertMaterial({ color: c })); return M.get(c); };
const TEX = new Map();
function toile(cle, w, h, dessin) {
  if (TEX.has(cle)) return TEX.get(cle);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; dessin(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; TEX.set(cle, t); return t;
}
const rayures = coul => toile('r' + coul, 256, 32, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f3ead8' : coul; c.fillRect(i * w / 8, 0, w / 8, h); } });
const PAGNES = [['#1f5fa8', '#f2c21b', '#d6372b'], ['#d6372b', '#1d1a16', '#f2c21b'], ['#2f8a4a', '#f3ead8', '#d9a521'], ['#8e3c8f', '#f2c21b', '#f3ead8'], ['#e2672a', '#1f5fa8', '#f3ead8'], ['#1d1a16', '#d9a521', '#c8553d']];
const wax = k => { const [a, b, d] = PAGNES[k % PAGNES.length]; return toile('w' + k, 128, 256, (c, w, h) => { c.fillStyle = a; c.fillRect(0, 0, w, h); for (let y = 16; y < h; y += 32) for (let x = (y / 32 % 2) * 16 + 8; x < w; x += 32) { c.fillStyle = b; c.beginPath(); c.arc(x, y, 11, 0, 7); c.fill(); c.fillStyle = d; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); } }); };

function construire(E) {
  const c = commerceDe(E.id), T = c && TYPES[c.t], g = new THREE.Group(), obst = [];
  g.position.set(E.x, 0, E.z); g.rotation.y = E.cap; g.name = 'boutique-' + E.id;
  const boite = (sx, sy, sz, coul, x, y, z, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), o.mat || mat(coul)); m.position.set(x, y, z); if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; m.castShadow = o.ombre !== false; m.receiveShadow = true; g.add(m); return m; };
  const cyl = (r1, r2, h, coul, x, y, z, n = 10) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, n), mat(coul)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const solide = (x, z, sx, sz) => obst.push([...versMonde(E, x, z), E.cap, sx, sz]);
  // Le sol de la parcelle et le trottoir devant (rue.js n'en dessine pas ici).
  boite(10.2, .1, 7 + E.trottoir, '#c9bda9', 0, .02, (LOT.fond + LOT.avant + E.trottoir) / 2, { ombre: false });
  // Le conteneur aménagé, ouvert sur la rue, et son comptoir.
  const coque = T ? T.couleur : '#5b6f7d';
  boite(6.2, 2.7, .12, coque, 0, 1.35, -3.94); for (const s of [-1, 1]) boite(.12, 2.7, 2.6, coque, s * 3.04, 1.35, -2.7);
  const nervure = '#' + new THREE.Color(coque).multiplyScalar(.8).getHexString();
  for (let i = -5; i <= 5; i++) for (const s of [-1, 1]) boite(.05, 2.6, .06, nervure, s * 3.11, 1.35, -2.7 + i * .24, { ombre: false }); // nervures de la tôle
  boite(6.5, .14, 3.2, '#8d8d86', 0, 2.77, -2.6); boite(6.2, .15, 2.6, '#6e6a62', 0, .08, -2.7, { ombre: false });
  boite(6.08, 2.55, .04, '#3a3530', 0, 1.35, -3.86, { ombre: false }); // le fond, sombre
  solide(0, -2.55, 6.3, 2.95);
  if (!T) { // à louer : rideau de fer baissé, panneau
    const rideau = boite(6, 2.5, .08, '#9aa3a8', 0, 1.3, -1.42);
    rideau.material = new THREE.MeshLambertMaterial({ map: toile('rideau', 64, 256, (k, w, h) => { k.fillStyle = '#9aa3a8'; k.fillRect(0, 0, w, h); k.fillStyle = '#7e878c'; for (let y = 0; y < h; y += 8) k.fillRect(0, y, w, 2); }) });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.1), new THREE.MeshLambertMaterial({ map: texteToile(['BOUTIQUE À LOUER', 'Approche-toi pour la visiter'], 1024, 330, '#f3ead8', '#c8553d', '800 110px "Google Sans", system-ui, sans-serif') }));
    p.position.set(0, 1.55, -1.37); g.add(p);
  } else {
    boite(6, 1, .5, '#8a5a2b', 0, .5, -1.6); boite(6.1, .06, .62, '#6b4423', 0, 1.03, -1.6); // comptoir
    for (const y of [1.3, 1.9]) boite(5.6, .05, .4, '#6b4423', 0, y, -3.6, { ombre: false }); // étagères
    for (let i = 0; i < 14; i++) boite(.28, .32, .26, ['#d6372b', '#f2c21b', '#2f8a4a', '#1f5fa8', '#f3ead8'][i % 5], -2.6 + (i % 7) * .85, (i < 7 ? 1.3 : 1.9) + .19, -3.6, { ombre: false });
    const auvent = boite(6.6, .05, 1.7, '', 0, 2.5, -.6, { mat: new THREE.MeshLambertMaterial({ map: rayures(T.couleur) }), rx: -.22 }); auvent.castShadow = true;
    const nom = (VIE.data?.nom || '').toUpperCase(), panneau = new THREE.Mesh(new THREE.PlaneGeometry(5.6, .9), new THREE.MeshLambertMaterial({ map: texteToile([T.enseigne(nom).toUpperCase()], 1024, 164, T.couleur, '#ffffff', '800 92px "Google Sans", system-ui, sans-serif') }));
    panneau.position.set(0, 3.32, -1.02); g.add(panneau); boite(5.8, 1.02, .08, '#3a3530', 0, 3.32, -1.08);
    decor(c.t, { boite, cyl, solide, g, E });
  }
  scene.add(g);
  const B = { E, g, c, employes: [], visites: [], vehicules: [], obst };
  if (T) for (const [i, P] of T.postes.entries()) { // l'équipe à son poste
    const p = personne(7000 + E.id.length * 31 + i * 7 + Object.keys(TYPES).indexOf(c.t), { assise: !!P.assis, femme: P.f });
    const [wx, wz] = versMonde(E, P.x, P.z); p.position.set(wx, P.assis ? .45 : 0, wz); p.rotation.y = E.cap + P.a; scene.add(p); B.employes.push(p);
  }
  if (T === TYPES.garage) for (const [x, z, k] of [[-1.8, .95, 0], [1.6, 1.35, 1]]) { const V = creerVehicule('moto', { couleur: ['#2a2a2e', '#7a1f2b'][k] }), [wx, wz] = versMonde(E, x, z); V.g.position.set(wx, 0, wz); V.g.rotation.y = E.cap + Math.PI / 2; B.vehicules.push(V); solide(x, z, 2.1, .8); }
  poserObstacles('boutique-' + E.id, obst);
  CM.lots.set(E.id, B);
}
/** Le mobilier propre à chaque commerce, devant le conteneur (repère de la parcelle). */
function decor(t, { boite, cyl, solide, g, E }) {
  const T = TYPES[t];
  if (T === TYPES.momo) {
    cyl(.035, .035, 2.4, '#5a5a5a', 2.2, 1.2, 1); const ombrelle = cyl(.02, 1.5, .55, '#e3b21c', 2.2, 2.45, 1, 12); ombrelle.material = new THREE.MeshLambertMaterial({ color: '#e3b21c', side: THREE.DoubleSide });
    boite(1.1, .75, .6, '#f3ead8', 2.2, .375, 1.05); boite(.45, .45, .45, '#2f6fb0', 2.2, .22, .45, { ombre: false }); solide(2.2, .85, 1.1, 1.1);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), new THREE.MeshLambertMaterial({ map: texteToile(['MOBILE', 'MONEY', 'Dépôt · Retrait', 'Crédit'], 512, 600, '#e3b21c', '#1d1a16', '800 70px "Google Sans", system-ui, sans-serif'), side: THREE.DoubleSide }));
    p.position.set(-2.2, .85, 2); p.rotation.x = -.15; g.add(p); boite(1.15, .06, .5, '#3a3530', -2.2, .2, 2, { ombre: false }); solide(-2.2, 2, 1.2, .5);
  } else if (T === TYPES.maquis) {
    for (const x of [-4.55, 4.55]) for (const z of [-.9, 2.8]) { cyl(.05, .05, 2.6, '#6b6b6b', x, 1.3, z, 6); solide(x, z, .15, .15); }
    const bache = boite(9.3, .05, 3.9, '', 0, 2.62, .95, { mat: new THREE.MeshLambertMaterial({ map: rayures('#2f6fb0') }) }); bache.castShadow = true;
    for (const x of [-1.6, .9, 3.4]) {
      cyl(.45, .45, .05, '#f3f3f0', x, .74, 1.1, 14); cyl(.05, .05, .72, '#e0e0dc', x, .37, 1.1, 6);
      for (const s of [-1, 1]) { boite(.42, .05, .42, '#d6372b', x, .45, 1.1 + s * .62); boite(.42, .45, .05, '#d6372b', x, .68, 1.1 + s * .82); for (const [a, b] of [[-.18, -.18], [.18, -.18], [-.18, .18], [.18, .18]]) boite(.04, .45, .04, '#b52d22', x + a, .22, 1.1 + s * .62 + b, { ombre: false }); }
      for (let i = 0; i < 2; i++) cyl(.035, .035, .26, i ? '#2f8a4a' : '#c76a1a', x - .15 + i * .3, .9, 1.1, 8); // bouteilles
      solide(x, 1.1, 1.05, 1.95);
    }
    boite(.95, .8, .5, '#2a2622', -3.8, .4, .15); const braise = boite(.85, .05, .4, '#ff6a2a', -3.8, .82, .15, { ombre: false }); braise.material = new THREE.MeshBasicMaterial({ color: '#ff6a2a' }); solide(-3.8, .15, 1, .55);
    for (let i = 0; i < 3; i++) boite(.36, .06, .12, '#c8a066', -4.05 + i * .25, .87, .15, { ombre: false }); // poissons
  } else if (T === TYPES.coiffure) {
    for (const s of [-1, 1]) {
      boite(.55, .45, .55, '#1d1a16', s * 1.5, .23, .55); boite(.55, .65, .1, '#1d1a16', s * 1.5, .8, .27); // fauteuil, dossier côté miroir
      boite(.9, 1.4, .06, '#c9e3f0', s * 1.5, 1.25, -.45); boite(1, 1.5, .04, '#6b4423', s * 1.5, 1.25, -.49); boite(.08, .55, .08, '#6b4423', s * 1.5, .27, -.45);
      solide(s * 1.5, .05, 1, 1.25);
    }
    boite(.45, .42, 1.7, '#8a5a2b', 3.9, .21, 1.6); solide(3.9, 1.6, .5, 1.75); // banc d'attente
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .9), new THREE.MeshLambertMaterial({ map: texteToile(['Tresses', 'Coupes', 'Défrisage'], 512, 330, '#8e5bb5', '#ffffff', '800 76px "Google Sans", system-ui, sans-serif') }));
    p.position.set(-3.9, 1.4, -1.05); g.add(p);
  } else if (T === TYPES.couture) {
    boite(1.4, .06, .7, '#8a5a2b', -1.6, .76, .4); for (const [a, b] of [[-.62, -.3], [.62, -.3], [-.62, .3], [.62, .3]]) boite(.05, .76, .05, '#6b4423', -1.6 + a, .38, .4 + b, { ombre: false });
    boite(.45, .28, .2, '#1d1a16', -1.75, .93, .45); boite(.1, .2, .2, '#1d1a16', -1.95, 1.05, .45); boite(.4, .02, .5, '', -1.2, .8, .42, { mat: new THREE.MeshLambertMaterial({ map: wax(2) }) });
    solide(-1.6, .4, 1.45, .75);
    cyl(.04, .04, 1, '#3a3530', 1, .5, .3, 6); const robe = new THREE.Mesh(new THREE.CylinderGeometry(.2, .32, .9, 10), new THREE.MeshLambertMaterial({ map: wax(4) })); robe.position.set(1, 1.25, .3); robe.castShadow = true; g.add(robe); cyl(.13, .15, .3, '#3a3530', 1, 1.82, .3, 8);
    solide(1, .3, .6, .6);
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(.9, 1.1), new THREE.MeshLambertMaterial({ map: wax(i), side: THREE.DoubleSide })); m.position.set(-2.1 + i * 1.4, 1.75, -1.25); g.add(m); }
    boite(5.6, .03, .03, '#3a3530', 0, 2.32, -1.25, { ombre: false });
  } else if (T === TYPES.pagnes) {
    for (const s of [-1, 1]) {
      for (const x of [.6, 3.6]) cyl(.04, .04, 2.4, '#3a3530', s * x, 1.2, .9, 6);
      boite(3.1, .04, .04, '#3a3530', s * 2.1, 2.36, .9, { ombre: false });
      for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(.85, 1.75), new THREE.MeshLambertMaterial({ map: wax(i + (s > 0 ? 3 : 0)), side: THREE.DoubleSide })); m.position.set(s * (1.1 + i * 1), 1.42, .9); m.castShadow = true; g.add(m); }
      solide(s * 2.1, .9, 3.15, .3);
    }
    for (let i = 0; i < 8; i++) boite(.5, .12, .35, '', -1.6 + (i % 4) * 1.05, 1.11 + Math.floor(i / 4) * .13, -1.6, { mat: new THREE.MeshLambertMaterial({ map: wax(i) }), ombre: false }); // piles sur le comptoir
  } else if (T === TYPES.garage) {
    for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.TorusGeometry(.3, .1, 6, 14), mat('#1d1a16')); p.rotation.x = Math.PI / 2; p.position.set(-3.9, .1 + i * .2, -.4); p.castShadow = true; g.add(p); }
    solide(-3.9, -.4, .85, .85);
    cyl(.3, .3, .9, '#2f6fb0', 3.9, .45, -.5, 12); solide(3.9, -.5, .65, .65);
    boite(1.2, .05, .5, '#6e6a62', -.2, .03, 1.3, { ombre: false }); // tache d'huile, caisse à outils
    boite(.5, .25, .25, '#d6372b', 2.6, .13, -.6); solide(2.6, -.6, .55, .3);
  }
}
function detruire(id) {
  const B = CM.lots.get(id); if (!B) return;
  scene.remove(B.g); B.g.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  for (const p of [...B.employes, ...B.visites.map(v => v.p)]) if (p) { scene.remove(p); p.userData.liberer?.(); }
  for (const V of B.vehicules) retirerVehicule(V);
  poserObstacles('boutique-' + id, null); CM.lots.delete(id);
}
function reconstruire(E) { detruire(E.id); if (Math.hypot(E.x - X.S.x, E.z - X.S.z) < VOIR) construire(E); }

// ---------- Les clients qu'on voit venir ----------
function visiteClient(c) {
  const B = CM.lots.get(c.e); if (!B || B.c !== c) return;
  const T = TYPES[c.t], libres = T.places.map((P, i) => i).filter(i => !B.visites.some(v => v.k === i)); if (!libres.length) { pop(B, T.prix); return; }
  const k = libres[Math.floor(Math.random() * libres.length)], P = T.places[k], E = B.E, cote = Math.random() < .5 ? -1 : 1;
  const graine = 9000 + Math.floor(Math.random() * 900), p = personne(graine), zr = LOT.avant + E.trottoir * .5;
  const [x0, z0] = versMonde(E, cote * 9, zr); p.position.set(x0, 0, z0); scene.add(p);
  const px = P.x + (P.dx || 0), devant = Math.max(P.z, 2.6), chemin = [versMonde(E, px, devant), ...(P.dx ? [versMonde(E, px, P.z)] : []), versMonde(E, P.x, P.z)];
  B.visites.push({ k, P, p, graine, t: 0, etat: 'vient', chemin, retour: [...chemin.slice(0, -1).reverse(), versMonde(E, -cote * 9, zr)], prix: T.prix });
}
function marcher(p, cible, dt, v = 1.3) {
  const dx = cible[0] - p.position.x, dz = cible[1] - p.position.z, d = Math.hypot(dx, dz); if (d < .12) return true;
  const k = Math.min(1, v * dt / d); p.position.x += dx * k; p.position.z += dz * k; p.rotation.y = Math.atan2(dx, dz); p.userData.jouer?.('marche'); return false;
}
function majVisites(B, dt) {
  const T = B.c && TYPES[B.c.t]; if (!T) return;
  for (const V of [...B.visites]) {
    V.t += dt;
    if (V.etat === 'vient') {
      if (V.t > 40) { const f = V.chemin[V.chemin.length - 1]; V.p.position.set(f[0], 0, f[1]); V.chemin = [f]; } // bloqué en route : il arrive quand même
      if (marcher(V.p, V.chemin[0], dt) && V.chemin.shift() && !V.chemin.length) {
        V.etat = 'service'; V.t = 0; pop(B, V.prix);
        if (V.P.assis) { scene.remove(V.p); V.p.userData.liberer?.(); V.p = personne(V.graine, { assise: true }); const [x, z] = versMonde(B.E, V.P.x, V.P.z); V.p.position.set(x, .45, z); scene.add(V.p); }
        V.p.rotation.y = B.E.cap + V.P.a; if (!V.P.assis) V.p.userData.jouer?.('parle');
      }
    } else if (V.etat === 'service') {
      if (!V.P.assis && V.t > 3) V.p.userData.jouer?.('idle');
      if (V.t > T.service) {
        if (V.P.assis) { scene.remove(V.p); V.p.userData.liberer?.(); V.p = personne(V.graine); const [x, z] = versMonde(B.E, V.P.x, V.P.z); V.p.position.set(x, 0, z); scene.add(V.p); }
        V.etat = 'part'; V.t = 0;
      }
    } else if (marcher(V.p, V.retour[0], dt) && V.retour.shift() && !V.retour.length || V.t > 40) {
      scene.remove(V.p); V.p.userData.liberer?.(); B.visites.splice(B.visites.indexOf(V), 1);
    }
  }
}
/** « +800 F » qui s'envole au-dessus de la boutique. */
function pop(B, m) {
  if (!B.g.visible) return;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const k = cv.getContext('2d');
  k.font = '800 58px "Google Sans", system-ui, sans-serif'; k.textAlign = 'center'; k.textBaseline = 'middle'; k.lineWidth = 10; k.strokeStyle = '#ffffff'; k.strokeText(`+${fmt(m)}`, 128, 48); k.fillStyle = '#1f8a3a'; k.fillText(`+${fmt(m)}`, 128, 48);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(1.9, .71, 1); s.renderOrder = 10;
  const [x, z] = versMonde(B.E, (Math.random() - .5) * 2, .2); s.position.set(x, 3.2, z); scene.add(s);
  const t0 = performance.now(), anim = () => { const k2 = (performance.now() - t0) / 1800; if (k2 >= 1 || !s.parent) { scene.remove(s); t.dispose(); s.material.dispose(); return; } s.position.y = 3.2 + k2 * 1.6; s.material.opacity = 1 - Math.max(0, k2 - .6) / .4; requestAnimationFrame(anim); };
  requestAnimationFrame(anim);
}

// ---------- Fenêtres : la liste, le choix d'un commerce, la fiche ----------
function montrer(html) { const el = $('#vieFiche'); $('#vfContenu').innerHTML = html; el.hidden = false; el.querySelector('[data-cm]:not(:disabled)')?.focus(); }
export function fermerFiche() { const el = $('#vieFiche'); if (el) el.hidden = true; CM.fiche = null; CM.choix = ''; }
const statut = c => c.d ? ['Fermé : salaires en retard', 'rouge'] : c.s <= 0 ? ['Plus de stock', 'rouge'] : c.s <= TYPES[c.t].stock * .2 ? ['Stock presque vide', 'orange'] : ['Ouvert', 'vert'];
export function listeCommerces() {
  if (!VIE.data) return;
  const lignes = [...EMPLACEMENTS].sort((a, b) => !!commerceDe(b.id) - !!commerceDe(a.id)).map(E => { // les siens d'abord
    const c = commerceDe(E.id), T = c && TYPES[c.t];
    if (c) { const [st, k] = statut(c); return `<div class="vf-ligne"><span class="vf-icone" style="--c:${T.couleur}">${T.icone}</span><span><b>${esc(T.nom)} · ${esc(E.nom)}</b><small><i class="vf-pt ${k}"></i>${esc(st)} · aujourd’hui ${c.j === jour() ? c.vj : 0} client${(c.j === jour() ? c.vj : 0) > 1 ? 's' : ''}, ${fmt(c.j === jour() ? c.rj : 0)}</small></span><span class="vf-deux"><button type="button" class="vf-bouton" data-cm="aller" data-v="${E.id}">Y aller</button><button type="button" class="vf-bouton" data-cm="fiche" data-v="${E.id}">Gérer</button></span></div>`; }
    return `<div class="vf-ligne"><span class="vf-icone vide">🏪</span><span><b>Boutique à louer · ${esc(E.nom)}</b><small>Loyer ${fmt(E.loyer)} par jour · clients ×${String(E.affluence).replace('.', ',')}</small></span><button type="button" class="vf-bouton" data-cm="voir" data-v="${E.id}">Voir</button></div>`;
  }).join('');
  const n = CM.liste.length, auj = CM.liste.filter(c => c.j === jour()), clients = auj.reduce((s, c) => s + c.vj, 0), ventes = auj.reduce((s, c) => s + c.rj, 0), charges = CM.liste.reduce((s, c) => s + chargesDe(c), 0);
  const bilan = n ? `<div class="vf-stats"><div><small>Aujourd’hui</small><b>${fmt(ventes)}</b><span>${clients} client${clients > 1 ? 's' : ''} dans tes commerces</span></div><div><small>Charges</small><b>${fmt(charges)} / jour</b><span>salaires et loyers</span></div></div>` : '';
  montrer(`<small class="vf-sur">Ma vie · patron</small><h3 id="vfTitre">${n ? 'Mon bureau' : 'Ouvrir un commerce'}</h3><p class="vf-intro">${n ? 'Tes employés vendent même quand tu es ailleurs. « Y aller » t’emmène devant ta boutique ; rachète du stock avant qu’il soit vide, et garde de quoi payer les salaires chaque jour.' : 'Loue une boutique, choisis ce que tu y vends, et tes employés travaillent pour toi : l’argent arrive même quand tu fais autre chose.'}</p>${bilan}<div class="vf-liste">${lignes}</div>`);
}
function choixCommerce(E) {
  if (commerceDe(E.id)) { ficheCommerce(commerceDe(E.id)); return; }
  signaler('voirLot'); if (CM.choix !== E.id) { CM.choixType = Object.keys(E.atout || {})[0]; if (!CM.paie) CM.etatPaie = null; } CM.choix = E.id;
  const t = CM.choixType || 'momo', argent = VIE.data?.argent || 0;
  const cartes = Object.entries(TYPES).map(([id, T]) => `<button type="button" class="vf-carte${id === t ? ' choisie' : ''}" data-cm="type" data-v="${id}" aria-pressed="${id === t}">
    <span class="vf-carte-tete"><span class="vf-icone" style="--c:${T.couleur}">${T.icone}</span><b>${esc(T.nom)}</b></span>
    ${E.atout?.[id] ? '<em class="vf-atout">Bon emplacement</em>' : ''}
    <span class="vf-chiffres"><small>Installation</small><b>${fmt(T.install)}</b><small>Charges / jour</small><b>${fmt(T.charges + E.loyer)}</b><small>Bénéfice / heure</small><b>≈ ${fmt(parHeure(id, E))}</b></span>
    <span class="vf-etoiles"><small>Difficulté</small><i>${etoiles(T.difficulte)}</i><small>Potentiel</small><i>${etoiles(T.potentiel)}</i></span></button>`).join('');
  const T = TYPES[t], manque = T.install - argent, momo = paiementReel(), acquis = momo && !!lireLS(CLE_ACQUIS), attente = momo && !acquis && !!lireLS(CLE_ATTENTE);
  const libelle = CM.paie ? 'Paiement en cours…' : manque > 0 ? `Il te manque ${fmt(manque)}` : !momo || acquis ? `Ouvrir · ${fmt(T.install)}` : attente ? 'Vérifier mon paiement' : `Ouvrir · ${fmt(T.install)} + ${PRIX_MOMO} F MoMo`;
  montrer(`<small class="vf-sur">Boutique à louer · ${esc(E.nom)}</small><h3 id="vfTitre">Que vas-tu ouvrir ici ?</h3><p class="vf-intro">${esc(E.texte)} Loyer ${fmt(E.loyer)} par jour, compris dans les charges.</p>
    <div class="vf-cartes">${cartes}</div>
    <div class="vf-detail"><p><b>${T.icone} ${esc(T.nom)}</b> · ${esc(T.texte)}</p><p class="vf-puces"><small>Équipe</small>${T.equipe.map(r => `<span>${esc(r)}</span>`).join('')}</p><p class="vf-note">Démarrage rapide : les meubles, l’équipe et un stock plein (${T.stock} ${unite(T, T.stock)}) sont compris. Une vente rapporte ${fmt(T.prix)}, et chaque ${unite(T, 1)} de stock coûte ${fmt(T.cout)} à racheter.</p>
    ${momo ? `<p class="vf-note vf-momo">${acquis ? 'Ton paiement MoMo est déjà reçu : il te reste l’installation, payée avec l’argent du jeu.' : `L’ouverture se paie aussi ${PRIX_MOMO} F en vrai, par Mobile Money (MTN ou Moov). L’installation, elle, se paie avec l’argent du jeu.`}</p>` : ''}
    ${momo && paiementTest() ? '<p class="ev-test-momo">Mode test : choisis « Momo Test » et le numéro 0164000001. Aucun vrai argent n’est débité.</p>' : ''}
    </div><div class="vf-pied">${CM.etatPaie?.[0] ? `<p class="vf-etat ${CM.etatPaie[1]}" role="status">${esc(CM.etatPaie[0])}</p>` : ''}<span>${T.icone} <b>${esc(T.nom)}</b></span><button type="button" class="jouer vf-ouvrir" data-cm="ouvrir" data-v="${t}"${manque > 0 || CM.paie ? ' disabled' : ''}>${libelle}</button></div>`);
}
export function ficheCommerce(c) {
  const T = TYPES[c.t], E = lot(c.e), [st, k] = statut(c), manque = T.stock - c.s, h = Math.max(0, Math.ceil((c.c - Date.now()) / 36e5)), aujourdhui = c.j === jour();
  const peut = Math.min(manque, Math.floor((VIE.data?.argent || 0) / T.cout));
  CM.fiche = c;
  montrer(`<small class="vf-sur">${esc(E.nom)} · ${esc(T.nom)}</small><h3 id="vfTitre">${T.icone} ${esc(T.enseigne(VIE.data?.nom || ''))}</h3><p class="vf-statut ${k}"><i class="vf-pt ${k}"></i>${esc(st)}</p>
    <div class="vf-stats">
      <div><small>Aujourd’hui</small><b>${aujourdhui ? c.vj : 0} client${(aujourdhui ? c.vj : 0) > 1 ? 's' : ''}</b><span>${fmt(aujourdhui ? c.rj : 0)} de ventes</span></div>
      <div><small>Stock</small><b>${c.s} / ${T.stock}</b><i class="vf-barre" style="--p:${Math.round(c.s / T.stock * 100)}%"></i><span>${esc(T.stockNom)}</span></div>
      <div><small>Charges</small><b>${fmt(chargesDe(c))} / jour</b><span>${c.d ? `En retard : ${fmt(c.d)}` : `Prochaine paie dans ${h} h`}</span></div>
      <div><small>Depuis l’ouverture</small><b>${c.v} client${c.v > 1 ? 's' : ''}</b><span>${fmt(c.r)} de ventes</span></div>
    </div>
    <p class="vf-puces"><small>Équipe</small>${T.equipe.map(r => `<span>${esc(r)}</span>`).join('')}</p>
    <div class="vf-actions">
      ${c.d ? `<button type="button" class="jouer" data-cm="dette">Payer les salaires · ${fmt(c.d)}</button>` : ''}
      ${manque > 0 ? `<button type="button" class="${c.d ? 'vf-bouton' : 'jouer'}" data-cm="stock" data-v="${manque}"${peut < manque ? ' disabled' : ''}>Remplir le stock · ${fmt(manque * T.cout)}</button>` : '<span class="vf-note">Stock plein.</span>'}
      ${manque > 0 && peut > 0 && peut < manque ? `<button type="button" class="vf-bouton" data-cm="stock" data-v="${peut}">Acheter ${peut} ${unite(T, peut)} · ${fmt(peut * T.cout)}</button>` : ''}
      <button type="button" class="vf-bouton" data-cm="aller" data-v="${E.id}">Y aller</button>
    </div>
    <button type="button" class="vf-lien" data-cm="ceder">Céder la boutique (le repreneur te donne ${fmt(Math.round(T.install * .4 / 100) * 100)})</button>`);
}
function actionFiche(a, v) {
  const E = lot(v) || lot(CM.choix);
  if (a === 'fiche') ficheCommerce(commerceDe(v));
  else if (a === 'voir') choixCommerce(E);
  else if (a === 'type') { CM.choixType = v; choixCommerce(lot(CM.choix)); }
  else if (a === 'ouvrir') payerEtOuvrir(lot(CM.choix), v);
  else if (a === 'stock' && CM.fiche) reapprovisionner(CM.fiche, Number(v));
  else if (a === 'dette' && CM.fiche) payerDette(CM.fiche);
  else if (a === 'ceder' && CM.fiche) { const c = CM.fiche; X.choisir(`Céder ${ton(TYPES[c.t])} ${TYPES[c.t].court} ?`, [{ texte: 'Oui, je cède la boutique', sous: 'L’équipe part et la boutique est de nouveau à louer', f: () => ceder(c) }], { annuler: 'Non, je la garde' }); }
  else if (a === 'aller' && E) { fermerFiche(); const [x, z] = versMonde(E, 0, 2.2); X.allerVers(x, z, E.cap + Math.PI, E.nom); }
}
