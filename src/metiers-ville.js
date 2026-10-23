import * as THREE from 'three';
import { $, toXZ } from './base.js';
import { son } from './audio.js';
import { PLACES } from './donnees-lieux.js';
import { INTERIEURS, comptoirProche, dansLaPiece, declarerAgence, guichetProche } from './interieurs.js';
import { chargerDanses, personnagesPrets } from './personnages.js';
import { remettre } from './remise.js';
import { dansBatiment, pietonOk } from './rue.js';
import { scene } from './scene.js';
import { CARRIERE, METIERS, VIE, carriere, depenser, ecrire, gagner, nomMetier, posteDe, rendreVie, titreDans, titrePoste } from './vie.js';

// ---------- Les métiers de la ville : commerce, restauration, entreprises (Vivre à Cotonou, vagues 2 et 3) ----------
// Vendeuse ou vendeur à Dantokpa : on achète son stock, on annonce son prix au client (qui marchande) et on
// rend la monnaie. Au food court de la Cité ministérielle : serveuse ou serveur (prendre la commande à table,
// récupérer le bon plat au bon comptoir, servir), cuisinière ou cuisinier (les bons ingrédients de chaque plat
// béninois). En entreprise (MTN, Moov, accueil de la Cité) : on reçoit les clients au guichet et on choisit la
// bonne réponse ; chaque client bien servi fait avancer la carrière, d'agent jusqu'à DG.

const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const hasard = l => l[Math.floor(Math.random() * l.length)];
const melanger = l => l.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(e => e[1]);
let S = null, T = null, X = {}, A = {}; // salon, trajets, fonctions du salon (ligne, bulle, choisir, dedans…), outils de metiers.js
const V = { id: '', mission: '' }; // le métier en cours et son état
export const missionVille = () => V.mission;

export function initVille(ctx, data) {
  ({ S, T, X, A } = ctx);
  if (import.meta.env.DEV) window.__ville = { V, RECETTES, DEMANDES, PRODUITS, INTERIEURS }; // pour les tests
  declarerAgences(data);
}

// ---------- Commun ----------
const ALT = 40; // hauteur du sol des intérieurs (interieurs.js)
function pnj(graine, role, x, y, z, cap = 0) { const p = A.perso(graine, role); p.position.set(x, y, z); p.rotation.y = cap; scene.add(p); p.g = p; return p; }
function marcherVers(p, x, z, dt, v = 1.4) { return A.marcher(p, [x, z], dt, v); }
/**
 * Jeu à deux, même métier : si un ami occupe déjà la place (même pièce, à moins de 0,9 m), on se met à côté, le long de
 * (dx, dz). Au guichet 1, les deux personnages se superposaient ; chez l'autre joueur, l'ami, caché dans son propre corps,
 * semblait absent (testeurs, 22/10).
 */
function placeLibre(x, z, dx, dz, pas = [1, -1, 2, -2]) {
  const ici = S.lieu?.id || '', amis = [...(S.autres?.values() || [])].filter(a => a.etat && (a.etat.i || '') === ici);
  const pris = (px, pz) => amis.some(a => Math.hypot(a.etat.x - px, a.etat.z - pz) < .9);
  for (const k of [0, ...pas]) { const px = x + dx * k, pz = z + dz * k; if (!pris(px, pz)) return [px, pz]; }
  return [x, z];
}
function finBulles(...qui) { const t = performance.now(); for (const q of qui) if (q?.bulle && t > q.bulleFin) X.retirerBulle(q); }
/** La monnaie à rendre : options autour de la bonne somme ; `fini(rendu)` reçoit la somme choisie (rejouée si trop peu). */
function rendreMonnaie(billet, prix, titre, fini) {
  const juste = billet - prix, pas = prix >= 2000 ? 500 : 100;
  const options = melanger([...new Set([juste, juste + pas, Math.max(0, juste - pas)])]);
  const proposer = t => X.choisir(t, options.map(o => ({ texte: o ? `Rendre ${fmt(o)}` : 'Rien à rendre, c’est le compte', f: () => {
    if (o < juste) { X.ligne(`« Eh ! Il manque ${fmt(juste - o)} ! »`); proposer(`Il t’a donné ${fmt(billet)} pour ${fmt(prix)} : il manque de la monnaie`); }
    else fini(o - juste); // 0 : juste ; plus : rendu en trop
  } })), { annuler: 'Plus tard' });
  proposer(titre);
}
function billetPour(prix) { return hasard([500, 1000, 2000, 5000, 10000].filter(b => b >= prix).slice(0, 3)); }
function mission(t) { V.mission = t; }

// ---------- Vendeuse / vendeur au marché Dantokpa ----------
const PRODUITS = {
  tomates: { nom: 'Tomates', lot: 10, cout: 2000, ref: 300, pas: 50, couleur: '#d6372b', unite: 'le tas', question: 'Combien le tas de tomates ?', objet: 'sac' },
  oranges: { nom: 'Oranges', lot: 10, cout: 1500, ref: 250, pas: 50, couleur: '#f08a24', unite: 'le tas', question: 'Les oranges, c’est combien le tas ?', objet: 'sac' },
  pagnes: { nom: 'Pagnes wax', lot: 4, cout: 10000, ref: 3500, pas: 500, couleur: '#2f6fb0', unite: 'le pagne', question: 'Ton pagne là, tu le fais à combien ?', objet: 'sac' },
};
function etal(produit) {
  const g = new THREE.Group(), m = (geo, c, x, y, z) => { const o = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: c })); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  m(new THREE.BoxGeometry(2.2, .08, 1), '#8a5a2b', 0, .82, 0); for (const [x, z] of [[-1, -.4], [1, -.4], [-1, .4], [1, .4]]) m(new THREE.BoxGeometry(.07, .8, .07), '#6b4423', x, .4, z);
  m(new THREE.CylinderGeometry(.03, .03, 2.4, 6), '#5a5a5a', 1.05, 1.2, -.45); m(new THREE.ConeGeometry(1.7, .6, 8, 1, true), '#e2672a', 1.05, 2.5, -.45).material.side = THREE.DoubleSide; // parasol, planté au coin côté vendeuse
  const P = PRODUITS[produit], tas = new THREE.Group(); g.add(tas); g.userData.tas = tas;
  for (let k = 0; k < 5; k++) {
    const x = -.8 + k * .4;
    if (produit === 'pagnes') for (let j = 0; j < 3; j++) { const o = new THREE.Mesh(new THREE.BoxGeometry(.34, .06, .5), new THREE.MeshLambertMaterial({ color: ['#2f6fb0', '#d6372b', '#2f8a4a', '#d9a521', '#8e3c8f'][(k + j) % 5] })); o.position.set(x, .9 + j * .06, 0); tas.add(o); }
    else for (const [dx, dy, dz] of [[-.045, 0, -.04], [.045, 0, -.04], [-.045, 0, .04], [.045, 0, .04], [0, .06, 0]]) { const o = new THREE.Mesh(new THREE.SphereGeometry(.042, 10, 8), new THREE.MeshLambertMaterial({ color: P.couleur })); o.position.set(x + dx, .9 + dy, dz); tas.add(o); } // un tas : quatre fruits et un dessus
  }
  return g;
}
function demarrerMarche() {
  const p = PLACES.find(q => q.id === 'dantokpa'), [x0, z0] = toXZ(p.lat, p.lon);
  // L'étal : sur le trottoir de la rue la plus proche du marché, tourné vers la rue.
  const r = A.routeSous(x0, z0, 220) || A.routeSous(x0, z0, 500); if (!r) { X.ligne('Le marché Dantokpa n’est pas disponible.'); return false; }
  const spot = A.trottoir(r.x, r.z, r.e.dx, r.e.dz) || [r.x + 5, r.z]; const versRue = Math.atan2(r.x - spot[0], r.z - spot[1]);
  if (S.lieu) X.dehors(false);
  const l = Math.hypot(r.e.dx, r.e.dz) || 1, [px, pz] = placeLibre(spot[0] - Math.sin(versRue) * 1.1, spot[1] - Math.cos(versRue) * 1.1, r.e.dx / l * 3, r.e.dz / l * 3); // l'étal d'un ami : le sien à côté, le long de la rue
  V.m = { x: px + Math.sin(versRue) * 1.1, z: pz + Math.cos(versRue) * 1.1, cap: versRue, rx: r.x, rz: r.z, dx: r.e.dx, dz: r.e.dz, stock: 0, produit: '', g: null, client: null, attente: 3, ventes: 0 };
  S.x = px; S.z = pz; S.cap = versRue; S.y = 0; S.saut = true; S.geste = 'idle'; // derrière l'étal, face aux clients
  X.ligne('Te voilà au marché Dantokpa, derrière ton étal. Achète d’abord ton stock (« Acheter du stock »), puis vends aux clients qui passent : annonce ton prix, ils marchandent, et rends bien la monnaie.');
  return true;
}
function acheterStock() {
  X.choisir('Ton stock du jour', Object.entries(PRODUITS).map(([id, P]) => ({
    texte: `${P.nom} · ${P.lot} ${P.unite === 'le tas' ? 'tas' : 'pagnes'} pour ${fmt(P.cout)}`, desactive: VIE.data.argent < P.cout,
    sous: VIE.data.argent < P.cout ? `Il te faut ${fmt(P.cout)}` : `Au marché, ça se vend autour de ${fmt(P.ref)} ${P.unite}`,
    f: async () => {
      if (!(await depenser(P.cout, `stock de ${P.nom.toLowerCase()}`))) return;
      const M = V.m; M.produit = id; M.stock = P.lot; if (M.g) scene.remove(M.g);
      M.g = etal(id); M.g.position.set(M.x, 0, M.z); M.g.rotation.y = M.cap; scene.add(M.g); son('piece');
      X.ligne(`Ton étal est prêt : ${P.lot} ${P.unite === 'le tas' ? 'tas' : 'pagnes'} de ${P.nom.toLowerCase()}. Les clients arrivent.`);
    },
  })));
}
function majMarche(dt) {
  const M = V.m; if (!M) return;
  const P = PRODUITS[M.produit], C = M.client;
  finBulles(C);
  if (!C && M.stock > 0) { M.attente -= dt; if (M.attente <= 0) nouveauClientMarche(); }
  if (C) {
    C.t += dt;
    if (C.etat === 'vient') { if (marcherVers(C.p, C.fx, C.fz, dt) || C.t > 14) { C.etat = 'attend'; C.p.rotation.y = M.cap + Math.PI; C.p.userData.jouer('parle'); X.bulle(C, P.question); } }
    else if (C.etat === 'attend' && C.t > 60) { X.bulle(C, 'Bon, je reviendrai.'); partirClient(C); }
    else if (C.etat === 'part') { if (marcherVers(C.p, C.px, C.pz, dt) || C.t > 8) { A.retirerPerso(C.p); X.retirerBulle(C); M.client = null; M.attente = 4 + Math.random() * 6; } }
  }
  mission(!M.produit ? 'Achète ton stock pour ouvrir ton étal.' : M.stock <= 0 ? 'Étal vide : rachète du stock.' : `Étal de ${P.nom.toLowerCase()} · ${M.stock} ${P.unite === 'le tas' ? 'tas' : 'pagnes'} · ${M.ventes} vente${M.ventes > 1 ? 's' : ''}${C?.etat === 'attend' ? ' · un client attend' : ''}`);
}
function nouveauClientMarche() {
  const M = V.m, s = (Math.random() < .5 ? -1 : 1) * (14 + Math.random() * 6);
  const dep = A.trottoir(M.rx + M.dx * s, M.rz + M.dz * s, M.dx, M.dz) || [M.x + M.dx * s, M.z + M.dz * s];
  const fx = M.x + Math.sin(M.cap) * 1.1, fz = M.z + Math.cos(M.cap) * 1.1; // devant l'étal, côté rue
  const p = pnj(9500 + Math.floor(Math.random() * 400), null, dep[0], 0, dep[1]);
  M.client = { p, g: p, etat: 'vient', t: 0, fx, fz, px: dep[0] - M.dx * s * 2, pz: dep[1] - M.dz * s * 2 };
}
function partirClient(C) { C.etat = 'part'; C.t = 0; }
/** Le client demande le prix : on l'annonce, il accepte ou marchande ; puis il paie et l'on rend la monnaie. */
function vendre() {
  const M = V.m, C = M.client, P = PRODUITS[M.produit]; if (!C || C.etat !== 'attend') return;
  const prix = [P.ref - P.pas, P.ref, P.ref + 2 * P.pas, P.ref + 5 * P.pas];
  const reponse = p => {
    const e = (p - P.ref) / P.ref, ok = Math.random() < (e < 0 ? 1 : e === 0 ? .92 : e < .4 ? .5 : .15);
    if (ok) { X.bulle(C, 'D’accord, mets-moi ça.'); payer(p); return; }
    if (Math.random() < .6) { // il marchande
      const contre = Math.max(P.ref - P.pas, Math.round((P.ref - (e > .4 ? 0 : P.pas)) / P.pas) * P.pas);
      X.bulle(C, `Fais-moi ${fmt(contre)}, c’est bon ?`);
      X.choisir(`« Fais-moi ${fmt(contre)}. »`, [{ texte: `D’accord pour ${fmt(contre)}`, f: () => payer(contre) }, { texte: 'Non, c’est mon prix', sous: 'Il peut partir', f: () => { if (Math.random() < .3) { X.bulle(C, 'Bon… d’accord.'); payer(p); } else { X.bulle(C, 'C’est trop cher, je vais voir ailleurs.'); partirClient(C); } } }]);
    } else { X.bulle(C, 'Hé, c’est trop cher ! Je vais voir ailleurs.'); partirClient(C); }
  };
  const payer = p => {
    const billet = billetPour(p);
    C.p.userData.jouer('idle');
    rendreMonnaie(billet, p, `Il te donne ${fmt(billet)} pour ${fmt(p)}. Tu rends combien ?`, async trop => {
      remettre(S.moi, C.p, P.objet, { garder: .6 });
      const net = p - trop;
      if (trop) X.ligne(`Tu as rendu ${fmt(trop)} de trop.`); else X.bulle(C, 'Merci, à bientôt !');
      M.stock--; M.ventes++; if (M.g) M.g.userData.tas.children.forEach((o, i) => { o.visible = i < Math.ceil(M.g.userData.tas.children.length * M.stock / P.lot); });
      if (net > 0) await gagner(net, `vente : ${P.nom.toLowerCase()}`); else if (net < 0) await depenser(Math.min(VIE.data.argent, -net));
      A.experience(); son('piece'); partirClient(C);
      if (!M.stock) X.ligne('Tout est vendu ! Rachète du stock pour continuer.');
    });
  };
  X.choisir(`« ${P.question} »`, prix.map((p, i) => ({ texte: `${fmt(p)} ${P.unite}`, sous: ['Petit prix : il achète à coup sûr', 'Le prix du marché', 'Un peu cher : il va marchander', 'Cher : il risque de partir'][i], f: () => reponse(p) })), { annuler: 'Attendre' });
}

// ---------- Food court de la Cité : serveuse / serveur ----------
// Un client assis appelle ; on prend sa commande à table, on va la chercher au bon comptoir et on la lui sert.
function foodCourt() { return INTERIEURS.get('cite-foodcourt'); }
function entrerFoodCourt(x, z, cap) {
  const I = foodCourt(); if (!I) { X.ligne('Le food court de la Cité n’est pas disponible.'); return null; }
  if (S.lieu !== I) { if (S.lieu) X.dehors(false); X.dedans(I); }
  const p = dansLaPiece(I, x, z, cap); [S.x, S.z] = placeLibre(p.x, p.z, 1, 0, [1, 2]); S.cap = cap; S.y = p.y; S.saut = true; // côté salle : à gauche, la cuisinière du comptoir
  return I;
}
function assiette() {
  const g = new THREE.Group(), m = (geo, c) => { const o = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: c })); g.add(o); return o; };
  m(new THREE.CylinderGeometry(.14, .11, .03, 18), '#f4f1ea'); m(new THREE.SphereGeometry(.1, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), '#c8642c').position.y = .015;
  return g;
}
function porterAssiette(on) {
  if (V.plat) { V.plat.parent?.remove(V.plat); V.plat = null; }
  if (on && S.moi) { V.plat = assiette(); (S.moi.userData.main || S.moi).add(V.plat); V.plat.position.set(0, .05, .05); }
}
function demarrerServeur() {
  const I = entrerFoodCourt(0, -6, Math.PI); if (!I) return false;
  V.sv = { appel: null, attente: 3, commande: null, porte: null, servis: 0 };
  X.ligne('Au food court de la Cité. Quand un client lève la main (étiquette « Commande »), va à sa table et prends sa commande, puis va la chercher au bon comptoir et sers-la-lui.');
  return true;
}
function majServeur(dt) {
  const I = foodCourt(), Sv = V.sv; if (!I || !Sv) return;
  finBulles(Sv.appel, Sv.commande, Sv.fini);
  if (!Sv.appel && !Sv.commande) { Sv.attente -= dt; if (Sv.attente <= 0 && I.assis.length) {
    const a = hasard(I.assis); Sv.appel = { ...a, g: a.p, t: 0 };
    Sv.appel.marque = X.etiquette('Commande'); Sv.appel.marque.position.y = .45; a.p.userData.tete.add(Sv.appel.marque);
    X.bulle(Sv.appel, VIE.femme === false ? 'Serveur, s’il vous plaît !' : 'Serveuse, s’il vous plaît !'); a.p.userData.jouer?.('salut');
  } }
  const C = Sv.commande;
  mission(C ? `Commande : ${C.plat} (${C.comptoir}) · ${Sv.porte ? 'porte-la à la table' : 'va la chercher au comptoir'}` : Sv.appel ? 'Un client t’appelle : va à sa table (étiquette « Commande »).' : `En attente de clients · ${Sv.servis} servi${Sv.servis > 1 ? 's' : ''}`);
}
const posTable = (I, a) => [I.centre[0] + a.x, I.centre[1] + a.z];
function prendreCommande() {
  const I = foodCourt(), Sv = V.sv, a = Sv.appel; if (!a) return;
  const c = hasard(I.comptoirs), [plat] = hasard(c.plats);
  X.retirerBulle(a); Sv.commande = { ...a, bulle: null, comptoir: c.nom, plat, t: performance.now() }; Sv.appel = null;
  a.p.userData.tete.remove(a.marque); X.bulle(Sv.commande, `${plat}, au comptoir « ${c.nom} », s’il te plaît.`);
  X.ligne(`Commande : ${plat}, au comptoir « ${c.nom} ».`);
}
function recupererPlat(c) {
  X.choisir(`${c.nom} · Quelle commande récupères-tu ?`, c.plats.map(([p]) => ({ texte: p, f: () => { V.sv.porte = { comptoir: c.nom, plat: p }; porterAssiette(true); c.vendeur.userData.jouer?.('parle'); } })));
}
async function servir() {
  const Sv = V.sv, C = Sv.commande; if (!C || !Sv.porte) return;
  porterAssiette(false);
  if (Sv.porte.plat !== C.plat || Sv.porte.comptoir !== C.comptoir) { X.bulle(C, 'Ce n’est pas ce que j’ai commandé !'); X.ligne(`Ce n’était pas la commande : ${C.plat}, au comptoir « ${C.comptoir} ». Retourne la chercher.`); Sv.porte = null; return; }
  const s = (performance.now() - C.t) / 1000, pourboire = s < 40 ? 200 : s < 80 ? 100 : 0;
  X.bulle(C, pourboire ? 'Merci, c’est rapide ! Tiens, pour toi.' : 'Merci.'); C.p.userData.jouer?.('idle'); Sv.fini = C; // sa bulle s'efface toute seule
  Sv.commande = null; Sv.porte = null; Sv.servis++; Sv.attente = 5 + Math.random() * 5;
  await gagner(150 + pourboire, `service à table${pourboire ? ` (dont ${pourboire} F de pourboire)` : ''}`); A.experience(); son('piece');
}

// ---------- Food court : cuisinière / cuisinier, au comptoir « Chez Tantie Rose » ----------
const RECETTES = {
  'Amiwo au poulet': ['Farine de maïs', 'Tomate, oignon et ail', 'Poulet'],
  'Akassa, sauce poisson': ['Akassa (pâte de maïs fermenté)', 'Poisson', 'Sauce tomate pimentée'],
  'Riz au gras': ['Riz', 'Tomate concentrée et oignon', 'Huile et viande'],
  'Haricots, gari, huile rouge': ['Haricots', 'Gari', 'Huile rouge'],
};
const AUTRES_INGREDIENTS = ['Lait caillé (dèguè)', 'Sucre', 'Pâte d’arachide', 'Ananas', 'Igname pilée', 'Fleurs de bissap'];
function demarrerCuisinier() {
  const I = foodCourt(); if (!I) { X.ligne('Le food court de la Cité n’est pas disponible.'); return false; }
  // Derrière le premier comptoir, à côté de la cuisinière qui y travaille déjà.
  const x = -14.4 + .9, z = I.d / 2 - 1.3; if (!entrerFoodCourt(x, z, Math.PI)) return false;
  V.cu = { x, z, file: [], attente: 2, faits: 0 };
  X.ligne('Tu es en cuisine, au comptoir « Chez Tantie Rose ». Les clients commandent au comptoir : prépare chaque plat avec les bons ingrédients (trois par plat).');
  return true;
}
function majCuisinier(dt) {
  const I = foodCourt(), Cu = V.cu; if (!I || !Cu) return;
  if (Cu.file.length < 3) { Cu.attente -= dt; if (Cu.attente <= 0) { Cu.attente = 9 + Math.random() * 8;
    const e = dansLaPiece(I, (Math.random() - .5) * 6, -I.d / 2 + 2), p = pnj(9700 + Math.floor(Math.random() * 300), null, e.x, ALT, e.z);
    Cu.file.push({ p, g: p, plat: hasard(Object.keys(RECETTES)), etat: 'vient', t: 0 });
  } }
  Cu.file.forEach((c, k) => { // ils font la queue devant le comptoir
    finBulles(c); c.t += dt;
    const q = dansLaPiece(I, Cu.x, Cu.z - 2.2 - k * 1.1);
    if (c.etat === 'vient') { if (marcherVers(c.p, q.x, q.z, dt) || c.t > 15) { c.etat = 'attend'; c.p.rotation.y = 0; if (!k) { X.bulle(c, `${c.plat}, s’il vous plaît !`); c.p.userData.jouer('parle'); } } }
    else if (c.etat === 'attend') { marcherVers(c.p, q.x, q.z, dt, 1); if (!k && !c.dit) { c.dit = true; X.bulle(c, `${c.plat}, s’il vous plaît !`); } }
    else if (c.etat === 'part') { const s = dansLaPiece(I, 0, -I.d / 2 + 1); if (marcherVers(c.p, s.x, s.z, dt, 1.6) || c.t > 12) { A.retirerPerso(c.p); X.retirerBulle(c); c.fini = true; } }
  });
  Cu.file = Cu.file.filter(c => !c.fini);
  const premier = Cu.file.find(c => c.etat === 'attend');
  mission(premier ? `À préparer : ${premier.plat} · ${Cu.faits} plat${Cu.faits > 1 ? 's' : ''} servi${Cu.faits > 1 ? 's' : ''}` : `En attente de commandes · ${Cu.faits} plat${Cu.faits > 1 ? 's' : ''} servi${Cu.faits > 1 ? 's' : ''}`);
}
function preparer() {
  const Cu = V.cu, c = Cu.file.find(e => e.etat === 'attend'); if (!c) return;
  const recette = RECETTES[c.plat], mis = new Set(); let erreurs = 0;
  const choix = melanger([...recette, ...melanger([...AUTRES_INGREDIENTS, ...Object.values(RECETTES).flat().filter(i => !recette.includes(i))]).slice(0, 3)]);
  const etape = () => X.choisir(`${c.plat} · ingrédient ${mis.size + 1} sur 3`, choix.filter(i => !mis.has(i)).map(i => ({ texte: i, f: () => {
    if (!recette.includes(i)) { erreurs++; X.ligne(`${i} ? Ce n’est pas dans ${c.plat.toLowerCase()} !`); choix.splice(choix.indexOf(i), 1); etape(); return; }
    mis.add(i); son('bosse');
    if (mis.size < 3) { etape(); return; }
    servirPlat(c, erreurs);
  } })), { annuler: 'Plus tard' });
  etape();
}
async function servirPlat(c, erreurs) {
  remettre(S.moi, c.p, 'plat', { garder: .5 });
  X.bulle(c, erreurs ? 'Merci.' : 'Hmm, ça sent bon ! Merci.');
  c.etat = 'part'; c.t = 0; V.cu.faits++;
  await gagner(erreurs ? 200 : 250, `${c.plat.toLowerCase()} préparé${erreurs ? '' : ' sans faute'}`); A.experience(); son('piece');
}

// ---------- Entreprises : MTN, Moov, accueil de la Cité ministérielle ----------
// Les demandes sont des situations courantes, pas des offres réelles : aucun prix ni forfait de l'opérateur.
// Elles apprennent aussi à repérer les arnaques (on ne donne jamais son code secret) et à refuser un billet.
const DEMANDES = {
  operateur: [
    ['« Je veux acheter du crédit pour 1 000 F. »', 'Recharger 1 000 F sur son numéro et lui donner le reçu', ['Lui vendre un nouveau téléphone', 'Lui dire de revenir demain']],
    ['« J’ai perdu mon téléphone. Je veux garder mon numéro. »', 'Bloquer l’ancienne puce et lui refaire une puce au même numéro, avec sa pièce d’identité', ['Lui donner un nouveau numéro', 'Lui conseiller d’attendre de retrouver le téléphone']],
    ['« Je veux ouvrir un compte Mobile Money. »', 'Vérifier sa pièce d’identité, enregistrer le compte et lui faire choisir son code secret, sans le regarder', ['Lui demander son code secret pour l’écrire dans le dossier', 'Ouvrir le compte sans pièce d’identité']],
    ['« Quelqu’un m’a appelé de « l’agence » pour me demander mon code Mobile Money. »', 'Lui expliquer que c’est une arnaque : l’agence ne demande jamais le code secret, et changer son code', ['Lui dire de donner le code si l’appel venait bien de l’agence', 'Lui dire que ce n’est pas grave']],
    ['« Je veux envoyer 10 000 F à ma mère à Parakou. »', 'Faire le transfert et lui faire vérifier le numéro du destinataire avant de valider', ['Envoyer sans vérifier le numéro', 'Lui dire que Parakou est trop loin']],
    ['« Internet ne marche plus sur mon téléphone. »', 'Vérifier son forfait internet et que les données mobiles sont activées', ['Lui dire de racheter un téléphone', 'Lui couper sa ligne']],
    ['« J’ai envoyé de l’argent au mauvais numéro ! »', 'Noter la réclamation avec le numéro et l’heure, et lancer la procédure d’annulation', ['Lui dire que c’est perdu, tant pis', 'Lui rendre l’argent de ta poche']],
  ],
  cite: [
    ['« Je viens déposer mon dossier. »', 'Vérifier que le dossier est complet, l’enregistrer et lui remettre un récépissé daté', ['Le prendre sans rien vérifier', 'Lui dire de revenir la semaine prochaine']],
    ['« Il me manque une pièce, mais je peux vous donner un petit quelque chose… »', 'Refuser le billet, lui expliquer la pièce manquante et lui donner la liste écrite', ['Accepter le billet et fermer les yeux', 'Accepter le billet et lui promettre d’arranger ça']],
    ['« Je veux voir le directeur tout de suite ! »', 'Rester calme, noter sa demande et lui proposer un rendez-vous', ['Le laisser entrer sans rendez-vous', 'Hausser le ton et le faire sortir']],
    ['« Ce courrier est pour le ministère de l’Économie. »', 'L’enregistrer au courrier « arrivée » et le transmettre au bon ministère', ['Le poser sur un bureau au hasard', 'Lui dire de le porter lui-même']],
    ['« Où se trouve le service des ressources humaines ? »', 'Lui indiquer le bon bâtiment et le bon étage, et lui donner un badge visiteur', ['Lui dire que ce n’est pas ton travail', 'Le laisser chercher seul']],
    ['« Mon dossier est déposé depuis un mois, je n’ai pas de nouvelles. »', 'Chercher son numéro d’enregistrement et lui dire où en est le dossier', ['Lui dire que tous les dossiers sont perdus', 'Lui demander de tout redéposer']],
  ],
};
// anneaux : où trouver l'emprise du bâtiment dans les données (la porte se pose sur sa façade côté rue).
const AGENCES = {
  mtn: { place: 'mtn', anneaux: L => [L.marinaLieux?.mtn], nom: 'l’agence MTN', enseigne: 'AGENCE MTN', titre: 'MTN · AGENCE DE COTONOU', couleur: '#f8c200', encre: '#1d1a16', siege: '#3a3f44', affiche: ['Mobile Money', 'Ne donnez jamais', 'votre code secret,', 'même à un agent.'], demandes: 'operateur', salaire: 300 },
  moov: { place: 'moov', anneaux: L => [L.detailles?.moov], nom: 'l’agence Moov Africa', enseigne: 'AGENCE MOOV AFRICA', titre: 'MOOV AFRICA · AGENCE DE COTONOU', couleur: '#0b5aa2', encre: '#ffffff', siege: '#e26b1b', affiche: ['Moov Money', 'Ne donnez jamais', 'votre code secret,', 'même à un conseiller.'], demandes: 'operateur', salaire: 300 },
  cite: { place: 'cite', anneaux: L => L.marinaLieux?.cite?.bats || [], nom: 'l’accueil de la Cité ministérielle', enseigne: 'ACCUEIL · COURRIER', titre: 'CITÉ MINISTÉRIELLE · ACCUEIL ET COURRIER', couleur: '#1f7a3e', encre: '#ffffff', siege: '#2b4f7a', affiche: ['Service public', 'Aucun paiement', 'n’est demandé', 'au guichet.'], demandes: 'cite', salaire: 300 },
};
/** Une porte sur la façade du bâtiment, côté rue : on part de la rue la plus proche et l'on avance vers le bâtiment. */
function porteDevant(x, z, eviter = null) {
  for (const r of [A.routeSous(x, z, 150), A.routeSous(x, z, 300)].filter(Boolean)) {
    const d = Math.hypot(x - r.x, z - r.z) || 1, ux = (x - r.x) / d, uz = (z - r.z) / d; let p = null;
    for (let t = 3; t < d; t += .5) { const px = r.x + ux * t, pz = r.z + uz * t; if (dansBatiment(px, pz)) break; if (pietonOk(px, pz)) p = [px, pz]; }
    if (p && (!eviter || Math.hypot(p[0] - eviter[0], p[1] - eviter[1]) > 15)) return { porte: p, dehors: Math.atan2(-ux, -uz) };
  }
  return null;
}
/** Sur une emprise (anneau [[x, z]…]) : le milieu de la façade la plus proche d'une rue, un mètre devant. */
function porteSurAnneaux(anneaux, eviter = null) {
  let best = null, bd = Infinity;
  for (const r of anneaux) {
    if (!r?.length) continue;
    const cx = r.reduce((t, p) => t + p[0], 0) / r.length, cz = r.reduce((t, p) => t + p[1], 0) / r.length;
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length], l = Math.hypot(bx - ax, bz - az); if (l < 6) continue; // une vraie façade, pas un coin
      let nx = (bz - az) / l, nz = -(bx - ax) / l; const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; } // vers l'extérieur
      const px = mx + nx * 1.2, pz = mz + nz * 1.2, route = A.routeSous(px, pz, 90); if (!route) continue;
      if (eviter && Math.hypot(px - eviter[0], pz - eviter[1]) < 15) continue;
      if (route.d < bd) { bd = route.d; best = { porte: [px, pz], dehors: Math.atan2(nx, nz) }; }
    }
  }
  return best;
}
function declarerAgences(data) {
  for (const [id, Ag] of Object.entries(AGENCES)) {
    const p = PLACES.find(q => q.id === Ag.place); if (!p) continue;
    const [x, z] = toXZ(p.lat, p.lon), fc = INTERIEURS.get('cite-foodcourt'), eviter = id === 'cite' && fc ? fc.porte : null;
    const d = porteSurAnneaux(Ag.anneaux(data?.L || {}), eviter) || porteDevant(x, z, eviter); if (!d) continue;
    declarerAgence(`agence-${id}`, { nom: Ag.nom, ...d, ...Ag });
  }
}
function demarrerAgence(id) {
  const I = INTERIEURS.get(`agence-${id}`); if (!I) { X.ligne('Cette agence n’est pas disponible.'); return false; }
  if (S.lieu !== I) { if (S.lieu) X.dehors(false); X.dedans(I); }
  const poste = I.guichets.find(g => g.id === 'poste'), p = dansLaPiece(I, poste.x, poste.z + .3, Math.PI);
  [S.x, S.z] = placeLibre(p.x, p.z, 1.1, 0); S.cap = Math.PI; S.y = p.y; S.saut = true; // toujours derrière le guichet 1 (3,4 m de large)
  V.ag = { id, I, file: [], attente: 1, servis: 0, fete: null };
  const n = carriere(id), M = METIERS[id];
  X.ligne(`Bienvenue chez ${M.entreprise} : tu es ${titreDans(posteDe(n))} au guichet 1. Reçois les clients un par un et choisis la bonne réponse. Chaque client bien servi te rapporte ${fmt(salaireAgence(id))} et fait avancer ta carrière.`);
  return true;
}
const salaireAgence = id => Math.round(AGENCES[id].salaire * CARRIERE[posteDe(carriere(id))][3] / 25) * 25;
function majAgence(dt) {
  const G = V.ag; if (!G) return; const I = G.I, poste = I.guichets.find(g => g.id === 'poste');
  if (G.file.length < 4) { G.attente -= dt; if (G.attente <= 0) { G.attente = G.file.length < 2 ? 3 + Math.random() * 3 : 6 + Math.random() * 6; // file courte : le suivant ne tarde pas (un testeur attendait, 22/10)
    const e = G.servis || G.file.length ? dansLaPiece(I, (Math.random() - .5) * 3, -I.d / 2 + 1.5) : dansLaPiece(I, poste.x + (Math.random() - .5) * 2, 0), p = pnj(9900 + Math.floor(Math.random() * 300), null, e.x, ALT, e.z); // le premier attend déjà dans la salle, près du guichet 1 : de la porte, il mettait 8 s
    G.file.push({ p, g: p, etat: 'vient', t: 0 });
  } }
  G.file.forEach((c, k) => {
    finBulles(c); c.t += dt;
    const q = dansLaPiece(I, poste.x, poste.z - 2.2 - k * 1.1);
    if (c.etat === 'vient' || c.etat === 'attend') { if (marcherVers(c.p, q.x, q.z, dt, c.etat === 'vient' ? 1.4 : 1)) { if (c.etat === 'vient') { c.etat = 'attend'; c.p.rotation.y = 0; c.p.userData.jouer('idle'); } } }
    else if (c.etat === 'part') { const s = dansLaPiece(I, 0, -I.d / 2 + .8); if (marcherVers(c.p, s.x, s.z, dt, 1.5) || c.t > 12) { A.retirerPerso(c.p); X.retirerBulle(c); c.fini = true; } }
  });
  G.file = G.file.filter(c => !c.fini);
  if (G.fete) majFete(dt, G);
  const n = carriere(G.id), i = posteDe(n), suiv = CARRIERE[i + 1];
  const attend = G.file.filter(c => c.etat === 'attend').length, auPoste = S.lieu === I && guichetProche(I, S.x, S.z)?.id === 'poste';
  mission(`${METIERS[G.id].entreprise} · ${titrePoste(i)}${suiv ? ` · ${suiv[0] - n} client${suiv[0] - n > 1 ? 's' : ''} avant ${titreDans(i + 1)}` : ''} · ${!attend ? 'un client arrive…' : `${attend} en attente${auPoste ? '' : ' : retourne au guichet 1'}`}`);
}
function servirClient() {
  const G = V.ag, c = G.file.find(e => e.etat === 'attend'); if (!c) return;
  const [question, juste, faux] = hasard(DEMANDES[AGENCES[G.id].demandes]);
  c.p.userData.jouer('parle'); X.bulle(c, question.replace(/^« |»$/g, '').slice(0, 80));
  X.choisir(question, melanger([juste, ...faux]).map(r => ({ texte: r, f: async () => {
    c.etat = 'part'; c.t = 0; c.p.userData.jouer('idle');
    if (r !== juste) { X.bulle(c, 'Ce n’est pas sérieux, ça !'); X.ligne(`Le client repart mécontent. La bonne réponse : ${juste.charAt(0).toLowerCase() + juste.slice(1)}.`); return; }
    X.bulle(c, 'Merci beaucoup !'); G.servis++;
    const avant = posteDe(carriere(G.id)), salaire = salaireAgence(G.id);
    await ecrire({ carrieres: majCarriere(G.id, carriere(G.id) + 1) });
    await gagner(salaire, `client servi (${METIERS[G.id].entreprise})`); son('piece');
    const apres = posteDe(carriere(G.id));
    if (apres > avant) X.ligne(`Promotion ! Tu es maintenant ${titreDans(apres)} chez ${METIERS[G.id].entreprise} : ${fmt(salaireAgence(G.id))} par client.${apres === CARRIERE.length - 1 ? ' Le bureau de la direction générale est à toi, et tu peux organiser la fête de l’entreprise.' : ''}`);
    rendreVie();
  } })), { annuler: 'Plus tard' });
}
function majCarriere(id, n) {
  const m = new Map((VIE.data.carrieres || '').split(';').filter(Boolean).map(e => e.split(':')));
  m.set(id, String(n)); return [...m].map(([k, v]) => `${k}:${v}`).join(';').slice(0, 120);
}
// La fête de l'entreprise, organisée par le DG : les employés dansent dans le hall une minute.
async function organiserFete() {
  const G = V.ag; if (!G || G.fete) return;
  if (!(await depenser(20000, `fête de l’entreprise (${METIERS[G.id].entreprise})`))) { X.ligne('Il te faut 20 000 F pour organiser la fête.'); return; }
  if (personnagesPrets()) chargerDanses();
  const I = G.I, danseurs = [];
  for (let k = 0; k < 10; k++) { const p = dansLaPiece(I, -6 + (k % 5) * 3, -1 + Math.floor(k / 5) * 2.4); danseurs.push(pnj(9300 + k, k % 3 ? null : 'bureau', p.x, ALT, p.z, Math.random() * 6)); }
  G.fete = { danseurs, t: 0 };
  X.ligne('C’est la fête de l’entreprise ! Invite tes amis : ils peuvent entrer dans l’agence.');
  S.dire?.(`Fête de l’entreprise chez ${METIERS[G.id].entreprise} ! Venez !`);
}
function majFete(dt, G) {
  const F = G.fete; F.t += dt;
  for (const p of F.danseurs) p.userData.jouer('danse1');
  if (F.t > 60) { for (const p of F.danseurs) A.retirerPerso(p); G.fete = null; X.ligne('La fête est finie. Bon retour au travail !'); }
}

// ---------- Ce que metiers.js appelle ----------
export function demarrerVille(id) {
  V.id = id; V.mission = '';
  const ok = id === 'marche' ? demarrerMarche() : id === 'serveur' ? demarrerServeur() : id === 'cuisinier' ? demarrerCuisinier() : AGENCES[id] ? demarrerAgence(id) : false;
  if (!ok) V.id = '';
  return ok;
}
/** En cuisine, la caméra regarde depuis la salle (derrière le comptoir, elle serait collée au mur) ; null sinon. */
export function suiviVille() {
  if (V.id !== 'cuisinier' || !V.cu || T.mode !== 'pied' || !S.lieu) return null;
  if (S.moi) { S.moi.position.set(S.x, S.y, S.z); S.moi.rotation.y = S.cap; S.moi.userData.jouer('idle'); }
  return { x: S.x, y: S.y, z: S.z, cap: S.cap + Math.PI, dist: 6.5, haut: 2.4 };
}
export function majVille(dt) {
  if (!V.id) return;
  if (V.id === 'marche') majMarche(dt); else if (V.id === 'serveur') majServeur(dt); else if (V.id === 'cuisinier') majCuisinier(dt); else majAgence(dt);
}
export function actionsVille() {
  const out = []; if (!V.id || T.mode !== 'pied') return out;
  if (V.id === 'marche' && V.m) {
    const M = V.m, pres = Math.hypot(S.x - M.x, S.z - M.z) < 4;
    if (pres && M.client?.etat === 'attend') out.push({ texte: 'Répondre au client', f: vendre });
    if (pres && M.stock <= 0) out.push({ texte: 'Acheter du stock', f: acheterStock });
  } else if (V.id === 'serveur' && V.sv && S.lieu) {
    const Sv = V.sv, I = S.lieu, pres = a => { const [x, z] = posTable(I, a); return Math.hypot(S.x - x, S.z - z) < 2.4; };
    if (Sv.appel && !Sv.commande && pres(Sv.appel)) out.push({ texte: 'Prendre la commande', f: prendreCommande });
    if (Sv.commande && Sv.porte && pres(Sv.commande)) out.push({ texte: `Servir : ${Sv.porte.plat}`, f: servir });
    const c = comptoirProche(I, S.x, S.z); if (c && Sv.commande && !Sv.porte) out.push({ texte: `Récupérer une commande · ${c.nom}`, f: () => recupererPlat(c) });
  } else if (V.id === 'cuisinier' && V.cu && S.lieu) {
    const p = dansLaPiece(S.lieu, V.cu.x, V.cu.z), c = V.cu.file.find(e => e.etat === 'attend');
    if (c && Math.hypot(S.x - p.x, S.z - p.z) < 3.5) out.push({ texte: `Préparer : ${c.plat}`, f: preparer });
  } else if (V.ag && S.lieu === V.ag.I) {
    const g = guichetProche(S.lieu, S.x, S.z);
    if (g?.id === 'poste' && V.ag.file.some(e => e.etat === 'attend')) out.push({ texte: 'Recevoir le client suivant', f: servirClient });
    const dg = S.lieu.dg && dansLaPiece(S.lieu, S.lieu.dg.x, S.lieu.dg.z);
    if (posteDe(carriere(V.ag.id)) === CARRIERE.length - 1 && dg && Math.hypot(S.x - dg.x, S.z - dg.z) < 3 && !V.ag.fete) out.push({ texte: 'Organiser la fête de l’entreprise · 20 000 F', f: organiserFete });
  }
  return out;
}
/** Le menu « Mon travail » : ce qu'on peut faire en plus de « Finir la journée ». */
export function optionsVille() {
  if (V.id === 'marche') return [{ texte: 'Acheter du stock', sous: V.m?.stock ? `Il te reste ${V.m.stock} ${PRODUITS[V.m.produit].unite === 'le tas' ? 'tas' : 'pagnes'}` : '', f: acheterStock }];
  if (V.ag) return [{ texte: 'Retourner à mon guichet', f: () => demarrerAgence(V.ag.id) }];
  return [];
}
/** Fin de la pause : à l'agence, on retrouve son guichet (on avait pu aller manger ailleurs). */
export function reprendreVille() { if (V.ag) demarrerAgence(V.ag.id); }
export function arreterVille() {
  if (!V.id) return;
  if (V.m) { if (V.m.g) scene.remove(V.m.g); if (V.m.client) { A.retirerPerso(V.m.client.p); X.retirerBulle(V.m.client); } if (V.m.stock && V.m.produit !== 'pagnes') X.ligne('Ce qui reste de ton stock ne se garde pas : il est perdu.'); V.m = null; }
  if (V.sv) { if (V.sv.appel?.marque) V.sv.appel.p.userData.tete.remove(V.sv.appel.marque); porterAssiette(false); V.sv = null; }
  if (V.cu) { for (const c of V.cu.file) { A.retirerPerso(c.p); X.retirerBulle(c); } V.cu = null; }
  if (V.ag) { for (const c of V.ag.file) { A.retirerPerso(c.p); X.retirerBulle(c); } if (V.ag.fete) for (const p of V.ag.fete.danseurs) A.retirerPerso(p); V.ag = null; }
  V.id = ''; V.mission = '';
  const el = $('#vhMission'); if (el) el.hidden = true;
}
export const nomVille = id => nomMetier(METIERS[id]);
