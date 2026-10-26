import * as THREE from 'three';
import { $, toXZ } from './base.js';
import { moteurStop, son } from './audio.js';
import { construireReseau, noeudsPres, relie } from './carrefours.js';
import { VEHICULES, creerVehicule, itineraire, longueur, placer, pontPres, retirerRuban, retirerVehicule, ruban, suivreChemin, surRoute } from './conduite.js';
import { PLACES, QUARTIERS } from './donnees-lieux.js';
import { personne } from './discussions.js';
import { JEU } from './jeu.js';
import { texteToile } from './lieux.js';
import { remettre } from './remise.js';
import { dansBatiment, pietonOk } from './rue.js';
import { scene } from './scene.js';
import { roadLines } from './ville.js';
import { GRADES, METIERS, VIE, carriere, depenser, ecrire, gagner, gradeDe, nomMetier, posteDe, rendreVie, signaler, titreDans } from './vie.js';
import { actionsVille, arreterVille, demarrerVille, initVille, majVille, missionVille, optionsVille, reprendreVille, suiviVille } from './metiers-ville.js';

// ---------- Les métiers du transport (Vivre à Cotonou, étape 2, première vague) ----------
// Zémidjan et chauffeur de taxi : on roule, quelqu'un fait signe au bord de la rue, on s'arrête, il dit où il
// va et propose un prix (on peut demander plus), il monte, le GPS montre la route, il paie à l'arrivée, avec un
// pourboire si l'on n'a rien heurté. Tokpa-tokpa, sur la vraie ligne Godomey – Calavi (interdits dans Cotonou
// depuis 2021) : au volant, on s'arrête aux arrêts et l'apprenti fait monter les passagers ; apprenti, on est
// à la porte, on crie la destination pour remplir, on encaisse et on rend la monnaie, et on donne le départ.
// Sans véhicule à soi, on prend celui d'un patron et on lui doit un versement en fin de journée.

const JOUR = 864e5, PLACES_TOKPA = 14, PRIX_TOKPA = 200, PART_APPRENTI = 50;
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const W = { id: '', pause: false, patron: false, client: null, attente: 3, n: 0, gilet: null, ligne: null, tk: null, marcheurs: [], dests: [], mission: '' };
let S = null, T = null, X = {}; // salon, trajets et leurs fonctions (ligne, bulle, gps, choisir…)
export const enService = () => (W.pause ? '' : W.id); // en pause : on n'est plus « en service » (on peut commander au food court)

export function initMetiers(data, ctx) {
  S = ctx.S; T = ctx.T; X = ctx;
  const L = data.L.lignes?.find(l => l.id === 'calavi'); if (L) W.ligne = preparerLigne(L);
  const ici = new Set(['etoile', 'dantokpa', 'amazone', 'cathedrale', 'stade', 'haievive', 'fidjrosse', 'uac', 'cite', 'golden', 'novotel', 'mtn', 'moov', 'superu', 'martyrs', 'ganhi', 'aeroport', 'port', 'bioguera', 'seme', 'zongo']);
  if (import.meta.env.DEV) window.__metiers = { W, menuTravail, commencer: id => commencer(id), negocier: () => negocier(), accepter: p => accepter(p), crier: () => crierDestination(), encaisser: () => encaisser(), depart: () => depart(W.tk), finir: () => finirJournee(), dansBatiment, sens: () => { const V = W.tk?.V, r = V && routeSous(V.x, V.z, 6); return !r ? 'hors route' : !r.e.sens ? 'double sens' : r.e.dx * Math.sin(V.cap) + r.e.dz * Math.cos(V.cap) > 0 ? 'bon sens' : 'contresens'; } }; // pour les tests
  initVille({ S, T, X: ctx, A: { perso, retirerPerso, marcher, trottoir, experience, routeSous, routeProche } }, data); // commerce, restauration, entreprises
  W.dests = [...QUARTIERS.filter(q => q[2] > 2.2).map(([n, la, lo]) => [n, ...toXZ(la, lo)]), ...PLACES.filter(p => ici.has(p.id)).map(p => [p.name, ...toXZ(p.lat, p.lon)])]; // sans Ouidah : c'est l'avion
}

// ---------- Choisir un métier, finir sa journée ----------
const nomVeh = { moto: 'la moto', taxi: 'le taxi', tokpa: 'le tokpa-tokpa' };
export function menuTravail() {
  const v = VIE.data; if (!v) return;
  if (W.id) {
    const M = METIERS[W.id];
    X.choisir(`${nomMetier(M)} · ${W.pause ? 'en pause' : 'en service'}`, [
      W.pause ? { texte: 'Reprendre le travail', f: reprendre } : { texte: 'Continuer à travailler', f: () => { } },
      ...(W.pause ? [] : [{ texte: 'Prendre une pause', sous: 'Pour aller manger : plus de nouveaux clients jusqu’à ton retour', f: pause }, ...optionsVille()]),
      { texte: 'Finir la journée', sous: W.patron ? `Tu rends ${nomVeh[M.veh]} au patron et tu lui verses ${fmt(v.versement || 0)}` : 'Tu arrêtes le service pour aujourd’hui', f: finirJournee },
    ], { annuler: 'Fermer' });
    return;
  }
  // Tout n'est pas ouvert d'emblée : le taxi, le volant du tokpa-tokpa et les entreprises s'ouvrent au chapitre 2.
  // « Si tout est ouvert dès le début, l'envie d'évoluer disparaît » (un testeur, 26/10). Un métier déjà commencé
  // reste ouvert.
  const ferme = id => VIE.chapitre < (CHAPITRE_DE[id] || 0) && v.metier !== id && !carriere(id);
  const reprise = id => v.metier === id && v.journeeFin > Date.now() && v.versement > 0;
  const doit = v.versement > 0 && !(v.journeeFin > Date.now());
  const option = (id, sous) => {
    const M = METIERS[id], propre = M.propre && v.vehicule === M.propre, bloque = !propre && M.versement && doit;
    if (ferme(id)) return { texte: M.nom, desactive: true, sous: `S’ouvre au chapitre ${CHAPITRE_DE[id] + 1}` };
    return { texte: M.nom, desactive: bloque, sous: bloque ? `Rends d’abord ${fmt(v.versement)} à ton patron` : reprise(id) ? `Reprendre ta journée (versement convenu : ${fmt(v.versement)})` : propre ? `Avec ${M.propre === 'moto' ? 'ta moto' : 'ta voiture'} : toute la recette est pour toi` : sous, f: () => commencer(id) };
  };
  const nom = id => nomMetier(METIERS[id]);
  const poste = id => { const n = carriere(id), i = posteDe(n); return n ? `Tu es ${titreDans(i)} · ${n} client${n > 1 ? 's' : ''} servi${n > 1 ? 's' : ''}` : 'Tu commences comme agent au guichet'; };
  const familles = [
    ['Transport', 'Zémidjan, taxi, tokpa-tokpa', () => X.choisir('Travailler · le transport', [
      { ...option('zem', `Moto du patron · versement ${fmt(METIERS.zem.versement)} en fin de journée`), texte: nom('zem') },
      { ...option('taxi', `Taxi du patron · versement ${fmt(METIERS.taxi.versement)} · courses plus longues, mieux payées`), texte: nom('taxi') },
      { ...option('chauffeur', `Ligne Godomey – Calavi · versement ${fmt(METIERS.chauffeur.versement)} · ${fmt(PRIX_TOKPA)} par passager`), texte: nom('chauffeur') },
      { ...option('apprenti', `Ligne Godomey – Calavi · ${fmt(PART_APPRENTI)} par passager bien encaissé, rien à avancer`), texte: nom('apprenti') },
      ...(doit ? [{ texte: `Payer ton patron · ${fmt(v.versement)}`, desactive: v.argent <= 0, sous: v.argent < v.versement ? 'Tu lui donnes ce que tu as' : '', f: payerPatron }] : []),
    ], { annuler: 'Retour' })],
    ['Commerce et restauration', 'Marché Dantokpa, food court de la Cité', () => X.choisir('Travailler · commerce et restauration', [
      { texte: nom('marche'), sous: 'Achète ton stock (tomates, oranges, pagnes), fixe ton prix, rends la monnaie', f: () => commencer('marche') },
      { texte: nom('serveur'), sous: 'Prends les commandes à table et sers le bon plat · 150 F par table et pourboires', f: () => commencer('serveur') },
      { texte: nom('cuisinier'), sous: 'Prépare les plats béninois avec les bons ingrédients · 250 F par plat', f: () => commencer('cuisinier') },
    ], { annuler: 'Retour' })],
    ['Entreprises', `MTN, Moov, Cité ministérielle · carrière jusqu’à DG`, () => X.choisir('Travailler · en entreprise', ['mtn', 'moov', 'cite'].map(id => ({ texte: nom(id), sous: ferme(id) ? `S’ouvre au chapitre ${CHAPITRE_DE[id] + 1}` : poste(id), desactive: ferme(id), f: () => commencer(id) })), { annuler: 'Retour' })],
  ];
  X.choisir('Travailler à Cotonou', familles.map(([texte, sous, f]) => ({ texte, sous, f })));
}
// « Comment ça marche » : à la première prise de chaque métier, une fiche à l'écran. L'explication n'était que dans la
// discussion, souvent repliée sur téléphone : un testeur a attendu au guichet sans savoir qu'il fallait « Recevoir le
// client suivant » (22/10).
const GUIDE_METIER = {
  zem: ['Roule dans la ville : des clients te font signe au bord de la rue.', 'Arrête-toi à côté d’eux, discute le prix, puis emmène-les.', 'À l’arrivée, ils te paient. Avec la moto du patron, tu lui dois 1 000 F ce soir.'],
  taxi: ['Roule dans la ville : des clients te font signe au bord de la rue.', 'Arrête-toi à côté d’eux, puis emmène-les où ils veulent.', 'À l’arrivée, ils te paient. Avec le taxi du patron, tu lui dois 3 000 F ce soir.'],
  chauffeur: ['Va à la gare routière de Godomey : ton tokpa-tokpa t’y attend.', 'Suis la ligne et arrête-toi aux arrêts : les passagers montent, l’apprenti encaisse.', 'Ce soir, tu verses 3 000 F au patron.'],
  apprenti: ['À la gare de Godomey, monte à la porte du tokpa-tokpa.', 'Aux arrêts, « Crier » fait venir du monde et « Encaisser » fait payer chaque passager : rends la bonne monnaie.', 'Chaque passager bien encaissé te rapporte ta part.'],
  marche: ['Tu es derrière ton étal du marché Dantokpa.', 'Achète d’abord ton stock : bouton « Acheter du stock ».', 'Quand un client s’arrête, touche « Répondre au client » : annonce ton prix, il marchande, puis rends bien la monnaie.'],
  cuisinier: ['Tu es en cuisine au food court de la Cité, au comptoir « Chez Tantie Rose ».', 'Les clients font la queue devant toi : touche « Préparer », puis choisis les trois bons ingrédients du plat.', 'Chaque plat réussi te rapporte de l’argent.'],
  serveur: ['Au food court de la Cité, un client lève la main : va à sa table (étiquette « Commande »).', 'Touche « Prendre la commande », récupère le plat au bon comptoir, puis « Servir » à sa table.', 'Chaque client servi te rapporte de l’argent.'],
  entreprise: ['Tu es au guichet 1 : reste devant, les clients font la queue en face de toi.', 'Quand un client attend, touche « Recevoir le client suivant », puis choisis la bonne réponse à sa demande.', 'Chaque client bien servi te paie et te fait monter, d’agent jusqu’à DG.'],
};
function expliquerMetier(id) {
  let vus = []; try { vus = JSON.parse(localStorage.getItem('kutonu.metiers.vus') || '[]'); } catch { /* */ }
  if (vus.includes(id)) return;
  try { localStorage.setItem('kutonu.metiers.vus', JSON.stringify([...vus, id])); } catch { /* navigation privée */ }
  const etapes = GUIDE_METIER[id] || (METIERS[id]?.famille === 'entreprise' ? GUIDE_METIER.entreprise : null); if (!etapes) return;
  let el = document.getElementById('metierFiche');
  if (!el) { el = document.createElement('div'); el.id = 'metierFiche'; el.className = 'momo metier-fiche'; (document.getElementById('app') || document.body).append(el); }
  el.innerHTML = `<div class="momo-carte panel" role="dialog" aria-modal="true" aria-labelledby="metierTitre"><small class="ev-sur">Ton métier</small><h2 id="metierTitre"></h2><ol class="metier-etapes"></ol><div class="ev-actions"><button type="button" class="jouer">C’est parti !</button></div></div>`;
  el.querySelector('h2').textContent = nomMetier(METIERS[id]);
  el.querySelector('ol').append(...etapes.map(t => { const li = document.createElement('li'); li.textContent = t; return li; }));
  const fermer = () => { el.hidden = true; };
  el.querySelector('button').onclick = fermer; el.onclick = e => { if (e.target === el) fermer(); };
  el.hidden = false; el.querySelector('button').focus();
}
const CHAPITRE_DE = { taxi: 1, chauffeur: 1, mtn: 1, moov: 1, cite: 1 }; // le chapitre (0 : le premier) qui ouvre ce métier
/** Un refus se voit : au-dessus de son personnage, pas seulement dans la discussion (repliée sur téléphone). */
const refus = t => { X.ligne(t); X.bulle?.(S, t); };
async function commencer(id) {
  const v = VIE.data, M = METIERS[id];
  if (M.famille !== 'transport') { // commerce, restauration, entreprises : metiers-ville.js
    if (T.mode !== 'pied') { refus('Gare-toi et descends d’abord.'); return; }
    if (v.metier !== id) await ecrire({ metier: id });
    W.id = id; VIE.service = id; W.patron = false;
    if (!demarrerVille(id)) { W.id = ''; VIE.service = ''; }
    else expliquerMetier(id);
    rendreVie(); return;
  }
  // Depuis sa chambre, « Zémidjan » ne faisait rien : le refus n'était écrit que dans la discussion, repliée sur
  // téléphone, et le joueur croyait le jeu cassé (un testeur, 26/10). On sort, et la journée commence devant la porte.
  if (S.lieu) { X.dehors(); X.ligne('Tu sors pour aller travailler.'); }
  if (T.mode !== 'pied' && T.mode !== 'conduit') { refus('Termine d’abord ton trajet.'); return; }
  const ligneTokpa = id === 'chauffeur' || id === 'apprenti';
  if (ligneTokpa && !W.ligne) { refus('La ligne Godomey – Calavi n’est pas disponible.'); return; }
  if (ligneTokpa && T.mode === 'conduit') { refus('Gare-toi et descends d’abord : la gare de Godomey est loin.'); return; }
  const propre = !!M.propre && v.vehicule === M.propre, reprise = v.metier === id && v.journeeFin > Date.now() && v.versement > 0;
  W.patron = !propre && M.versement > 0;
  if (W.patron && !reprise) {
    if (v.versement > 0) { refus(`Ton patron attend encore ${fmt(v.versement)} : paie-le d’abord.`); return; }
    await ecrire({ metier: id, versement: M.versement, journeeFin: Date.now() + JOUR });
  } else if (v.metier !== id) await ecrire({ metier: id });
  W.id = id; VIE.service = id; W.attente = 3;
  if (id === 'zem' || id === 'taxi') {
    if (W.patron) {
      if (T.mode === 'conduit') descendreDe(T.veh);
      vehiculeDuPatron(M.veh);
      X.ligne(`${M.veh === 'moto' ? 'La moto' : 'Le taxi'} du patron t’attend sur la route, sous la colonne de lumière jaune. ${reprise ? 'Ta journée continue.' : `Ce soir, tu lui dois ${fmt(M.versement)}.`}`);
      // La consigne n'était que dans la discussion, souvent cachée : une bulle au-dessus de soi, et le GPS si le véhicule est loin.
      const Vp = T.veh; X.bulle?.(S, `${M.veh === 'moto' ? 'La moto' : 'Le taxi'} du patron : suis la lumière jaune !`);
      if (Vp && Math.hypot(Vp.x - S.x, Vp.z - S.z) > 5) X.gps?.(Vp.x, Vp.z, `${M.veh === 'moto' ? 'la moto' : 'le taxi'} du patron`);
    } else if (!T.veh) X.garerSonVehicule();
    if (id === 'zem') enfilerGilet();
    X.ligne(id === 'zem' ? `Tu es zémidjan, gilet n° ${numero()} sur le dos. Roule : les clients te font signe au bord de la rue. Arrête-toi à côté d’eux pour discuter le prix.` : 'Tu fais le taxi. Roule : les clients te font signe au bord de la rue. Arrête-toi à côté d’eux.');
  } else allerGare(id, reprise);
  expliquerMetier(id);
  rendreVie();
}
const numero = () => String(JEU.numero || '1234').slice(0, 5);
async function payerPatron() {
  const v = VIE.data, paye = Math.min(v.argent, v.versement); if (!(paye > 0)) return;
  if (!(await depenser(paye, 'versement au patron'))) return;
  await ecrire({ versement: v.versement - paye }); rendreVie();
  X.ligne(v.versement > 0 ? `Il reste ${fmt(v.versement)} à rendre au patron.` : 'Ton patron est payé : tu peux retravailler avec lui.');
}
/** Fin de journée : on rend le véhicule du patron et on lui paie le versement (ce qu'on peut, le reste est dû). */
// ---------- Pause : aller manger, puis reprendre ----------
// Plus de nouveaux clients, rien n'avance au poste ; on peut aller au food court de la Cité ou rentrer cuisiner.
// Pas au milieu d'une course, ni avec des passagers dans le tokpa-tokpa.
export function pause() {
  if (!W.id || W.pause) return;
  if (W.client?.etat === 'course') { X.ligne('Termine d’abord ta course : ton client est derrière toi.'); return; }
  if (T.mode === 'apprenti') { X.ligne('Descends d’abord du tokpa-tokpa, à un arrêt.'); return; }
  if (W.tk?.occ > 0 && W.id === 'chauffeur') { X.ligne('Dépose d’abord tes passagers à un arrêt.'); return; }
  retirerClient(); // celui qui faisait signe trouvera un autre zém
  W.pause = true; VIE.pause = true; rendreVie();
  X.ligne('C’est la pause ! Va manger : le food court de la Cité (« Aller »), un maquis, ou chez toi. Puis « Reprendre le travail ».');
}
export function reprendre() {
  if (!W.id || !W.pause) return;
  W.pause = false; VIE.pause = false; rendreVie();
  reprendreVille(); X.ligne('Au travail !');
}
/** Bouton « Pause » / « Reprendre le travail » de « Ma vie ». */
export const basculerPause = () => (W.pause ? reprendre() : pause());
export { finirJournee };
async function finirJournee() {
  const v = VIE.data, id = W.id, M = METIERS[id]; if (!id) return;
  W.pause = false; VIE.pause = false;
  if (W.tk?.part > 0) await gagner(W.tk.part, 'ta part d’apprenti'); // ce qu'on a encaissé depuis le dernier départ
  arreterService();
  if (W.patron && v.versement > 0) {
    const paye = Math.min(v.argent, v.versement);
    if (paye > 0) await depenser(paye, `versement au patron (${nomMetier(M).toLowerCase()})`);
    await ecrire({ versement: v.versement - paye, journeeFin: 0 });
    X.ligne(v.versement > 0 ? `Tu n’avais pas assez : tu dois encore ${fmt(v.versement)} à ton patron. Il ne te confiera rien d’autre avant d’être payé.` : 'Le patron a son versement. Bonne soirée !');
  } else X.ligne('Journée finie. Bonne soirée !');
  W.id = ''; VIE.service = ''; W.patron = false; rendreVie();
}
/** Arrête tout ce que le service a mis en place : clients, passagers, gilet, véhicule du patron, minibus. */
function arreterService() {
  arreterVille(); retirerClient(); retirerGilet(); for (const m of W.marcheurs) retirerPerso(m.p); W.marcheurs = [];
  const tk = W.tk;
  if (tk) {
    if (T.mode === 'apprenti') pieds(tk.V, -2.4); // côté porte
    for (const p of tk.attendent) retirerPerso(p);
    if (tk.aide) retirerPerso(tk.aide);
    retirerRuban(tk.ruban);
    if (T.veh === tk.V) { if (T.mode === 'conduit') descendreDe(tk.V); T.veh = null; }
    retirerVehicule(tk.V); W.tk = null;
  }
  if (T.veh?.travail) { if (T.mode === 'conduit') descendreDe(T.veh); retirerVehicule(T.veh); T.veh = null; }
  if (T.gps) { retirerRuban(T.gps.m); T.gps = null; }
  VIE.travail = null; VIE.mission = ''; W.mission = '';
  if (!T.veh) X.garerSonVehicule(); // ton véhicule à toi revient
}
/** Quitter le salon : on range tout, la journée (versement) reste enregistrée. */
export function quitterMetiers() { if (!W.id && !W.tk) return; arreterService(); W.id = ''; VIE.service = ''; W.pause = false; VIE.pause = false; }

// ---------- Véhicules de travail ----------
function routeProche(x, z, rMin = 0, rMax = 25) {
  for (let r = rMin; r <= rMax; r += 1.5) for (let a = 0; a < 16; a++) { const px = x + Math.cos(a * Math.PI / 8) * r, pz = z + Math.sin(a * Math.PI / 8) * r; if (surRoute(px, pz)) return [px, pz]; }
  return null;
}
/** Le sens de la rue en (x, z) : la direction où la chaussée continue le plus loin des deux côtés. */
function capRoute(x, z) {
  let best = 0, bl = -1;
  for (let a = 0; a < 16; a++) {
    const c = a * Math.PI / 16, dx = Math.sin(c), dz = Math.cos(c); let l = 0;
    for (const s of [1, -1]) for (let d = 1; d <= 12 && surRoute(x + dx * d * s, z + dz * d * s); d++) l++;
    if (l > bl) { bl = l; best = c; }
  }
  return best;
}
function vehiculeDuPatron(type) {
  if (T.veh) { retirerVehicule(T.veh); T.veh = null; } // ton véhicule à toi reste à la maison
  const p = routeProche(S.x + Math.sin(S.cap + Math.PI / 2) * 4, S.z + Math.cos(S.cap + Math.PI / 2) * 4, 0, 150) || [S.x, S.z];
  const V = creerVehicule(type); placer(V, p[0], p[1], capRoute(p[0], p[1])); V.travail = true;
  const e = X.etiquette(type === 'moto' ? 'Moto du patron' : 'Taxi du patron'); e.position.y = type === 'moto' ? 1.7 : 2.2; V.g.add(e); V.etiquette = e;
  // « Le soir, je n'ai pas trouvé la moto du patron, étiquette jaune » (un testeur, 26/10) : une colonne de
  // lumière jaune au-dessus d'elle, qu'on voit de loin et de nuit, jusqu'à ce qu'on monte dessus.
  const b = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd23a', transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  b.position.y = 20.5; b.renderOrder = 12; V.g.add(b); V.balise = b;
  T.veh = V; VIE.travail = { type, carburant: VEHICULES[type].reservoir }; // le patron le confie avec le plein
}
/** On descend du véhicule (fin de service, départ pour la gare). */
function descendreDe(V) { V.v = 0; moteurStop(); T.mode = 'pied'; pieds(V, V.D.cache ? 1.6 : 1); }
function pieds(V, cote) { S.x = V.x + Math.sin(V.cap + Math.PI / 2) * cote; S.z = V.z + Math.cos(V.cap + Math.PI / 2) * cote; S.cap = V.cap; S.y = 0; T.mode = 'pied'; if (S.moi) S.moi.visible = true; }

// ---------- Le gilet jaune numéroté du zémidjan ----------
// Posé chaque image entre le bas du dos et le cou du personnage (os Spine01 et NeckTwist01) : il suit la pose,
// debout comme assis sur la moto. Le numéro est celui de Zém Run (menu du jeu).
function enfilerGilet() {
  retirerGilet(); const p = S.moi, bas = p?.getObjectByName?.('Spine01'), haut = p?.getObjectByName?.('NeckTwist01'); if (!bas || !haut) return;
  // La chasuble jaune des zémidjans : plus étroite aux épaules, deux bretelles, le numéro derrière et devant.
  const jaune = new THREE.MeshLambertMaterial({ color: '#f2c21b', side: THREE.DoubleSide }), g = new THREE.Group(), corps = new THREE.Mesh(new THREE.CylinderGeometry(.4, .5, 1, 20, 1, true), jaune);
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(.16, .07, 1.02), jaune); b.position.set(s * .25, .5, 0); corps.add(b); } // bretelles, par-dessus les épaules
  const ourlet = new THREE.Mesh(new THREE.CylinderGeometry(.505, .505, .07, 20, 1, true), new THREE.MeshLambertMaterial({ color: '#1d5a2e', side: THREE.DoubleSide })); ourlet.position.y = -.47; corps.add(ourlet); // bande verte du bas
  const num = texteToile([numero()], 256, 160, '#f2c21b', '#1d5a2e', '900 120px system-ui, sans-serif');
  const dos = new THREE.Mesh(new THREE.PlaneGeometry(1, .62), new THREE.MeshBasicMaterial({ map: num })), face = new THREE.Mesh(new THREE.PlaneGeometry(1, .62), new THREE.MeshBasicMaterial({ map: num }));
  dos.rotation.y = Math.PI; g.add(corps, dos, face); scene.add(g);
  W.gilet = { p, g, corps, dos, face, bas, haut, a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), qy: new THREE.Quaternion() };
}
function retirerGilet() { if (W.gilet) { scene.remove(W.gilet.g); W.gilet.g.traverse(o => o.geometry?.dispose()); W.gilet.dos.material.map?.dispose(); W.gilet = null; } }
const HAUT = new THREE.Vector3(0, 1, 0);
function majGilet() {
  const G = W.gilet; if (!G) return;
  if (G.p !== S.moi) { enfilerGilet(); return; } // il vient de changer de tenue : on lui remet son gilet
  G.g.visible = !!S.moi?.visible; if (!G.g.visible) return;
  G.bas.getWorldPosition(G.a); G.haut.getWorldPosition(G.b);
  const d = G.a.distanceTo(G.b) || .4, w = d * 1.2;
  G.g.position.copy(G.a).lerp(G.b, .46);
  G.q.setFromUnitVectors(HAUT, G.b.clone().sub(G.a).normalize()); G.qy.setFromAxisAngle(HAUT, S.moi.rotation.y); G.g.quaternion.copy(G.q).multiply(G.qy);
  G.corps.scale.set(w, d * 1.3, w * .7); G.dos.scale.setScalar(w * .62); G.dos.position.set(0, d * .1, -w * .35 - .012);
  G.face.scale.setScalar(w * .42); G.face.position.set(0, -d * .05, w * .33 + .012); // devant, plus petit
}

// ---------- Zémidjan et taxi : les clients ----------
const PHRASES_CLIENT = ['Il fait chaud aujourd’hui !', 'Doucement aux carrefours, hein.', 'Tu connais bien le chemin ?', 'On arrive bientôt ?', 'Tu supportes quelle équipe ?', 'Cotonou a changé, dis donc.'];
function nouveauClient() {
  const V = T.veh, R = construireReseau(), ax = Math.sin(V.cap), az = Math.cos(V.cap);
  const cands = noeudsPres(V.x, V.z, 170).filter(([n, d]) => d > 50 && relie(n) && ((R.X[n] - V.x) * ax + (R.Z[n] - V.z) * az) / d > .55); // devant soi
  for (let essai = 0; essai < 6 && cands.length; essai++) {
    const [n] = cands[Math.floor(Math.random() * cands.length)], voisin = R.adj[n]?.[0]; if (!voisin) continue;
    const NX = R.X[n], NZ = R.Z[n]; let dx = R.X[voisin[0]] - NX, dz = R.Z[voisin[0]] - NZ; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const spot = trottoir(NX, NZ, dx, dz); if (!spot) continue;
    const dest = destinationDe(spot[0], spot[1]); if (!dest) continue;
    const p = perso(9000 + W.n++); p.position.set(spot[0], 0, spot[1]); p.rotation.y = Math.atan2(NX - spot[0], NZ - spot[1]); scene.add(p);
    const marque = X.etiquette(W.id === 'taxi' ? 'Client · taxi' : 'Client'); marque.position.y = .45; p.userData.tete.add(marque);
    p.userData.jouer('salut'); // il fait signe
    const bonus = 1 + .1 * gradeDe(VIE.data.xp || 0), base = W.id === 'taxi' ? Math.max(500, 250 * dest.km + 300) : Math.max(200, 120 * dest.km + 100);
    W.client = { p, g: p, marque, x: spot[0], z: spot[1], route: [NX, NZ], dest, prix: Math.ceil(base * bonus / 50) * 50, etat: 'signe', t: 0, chocs: 0, dit: 20, arret: 0 };
    return;
  }
}
/** Un point de trottoir au bord de la rue (x, z) de direction (dx, dz) : ni sur la chaussée, ni dans un mur. */
function trottoir(x, z, dx, dz, cotes = [1, -1]) {
  for (let off = 3.5; off <= 11; off += .5) for (const c of cotes) { const px = x - dz * off * c, pz = z + dx * off * c; if (!surRoute(px, pz) && pietonOk(px, pz)) return [px, pz]; }
  return null;
}
function destinationDe(x, z) {
  const [a, b] = W.id === 'taxi' ? [1500, 8000] : [600, 4000], ok = W.dests.filter(([, dx, dz]) => { const d = Math.hypot(dx - x, dz - z); return d > a && d < b; });
  for (let k = 0; k < 4 && ok.length; k++) {
    const [nom, dx, dz] = ok[Math.floor(Math.random() * ok.length)], p = routeProche(dx, dz, 0, 120); if (!p) continue;
    const pts = itineraire(x, z, 0, p[0], p[1]); if (!pts) continue;
    return { nom, x: p[0], z: p[1], km: longueur(pts) / 1000 };
  }
  return null;
}
function perso(graine, role) { const p = personne(graine, role ? { role } : {}); p.userData.jouer ??= () => { }; return p; }
function retirerPerso(p) { if (p) { scene.remove(p); p.userData.liberer?.(); } }
function retirerClient() { const C = W.client; if (!C) return; X.retirerBulle(C); retirerPerso(C.p); W.client = null; }
function dire(qui, texte) { if (qui?.g) X.bulle(qui, texte); }

/** Parler au client arrêté à côté de lui : il annonce sa destination et son prix, on peut demander plus. */
function negocier() {
  const C = W.client; if (!C || C.etat !== 'signe') return;
  C.p.userData.jouer('parle'); C.p.rotation.y = Math.atan2(T.veh.x - C.x, T.veh.z - C.z);
  const plus = W.id === 'taxi' ? 300 : 100, km = C.dest.km.toFixed(1).replace('.', ',');
  const proposer = (titre, prix, peutDemander) => X.choisir(titre, [
    { texte: `D’accord, monte ! · ${fmt(prix)}`, f: () => accepter(prix) },
    ...(peutDemander ? [{ texte: `Demander ${fmt(prix + plus)}`, sous: 'Il peut accepter… ou aller voir quelqu’un d’autre', f: () => {
      const r = Math.random();
      if (r < .45) { dire(C, 'Bon… d’accord.'); accepter(prix + plus); }
      else if (r < .85) proposer(`« Non non, ${fmt(prix)}, c’est le prix ! »`, prix, false);
      else { dire(C, 'Laisse, je vais prendre un autre.'); partir(C); }
    } }] : []),
    { texte: 'Refuser la course', f: () => { dire(C, 'Bon, tant pis.'); partir(C); } },
  ], { annuler: 'Réfléchir' });
  proposer(`« ${C.dest.nom}, ${fmt(C.prix)} ? » (${km} km)`, C.prix, true);
}
function accepter(prix) {
  const C = W.client, V = T.veh; if (!C || !V) return;
  C.prix = prix; C.etat = 'monte'; C.t = 0; C.marque.visible = false;
  C.vers = [V.x + Math.sin(V.cap - Math.PI / 2) * (V.D.cache ? 1.3 : .6), V.z + Math.cos(V.cap - Math.PI / 2) * (V.D.cache ? 1.3 : .6)];
}
function partir(C) { C.etat = 'part'; C.t = 0; C.marque.visible = false; W.attente = 6 + Math.random() * 6; }
/** Le choc compte pendant une course : au troisième, le client descend sans payer. */
export function chocMetier() {
  const C = W.client; if (!C || C.etat !== 'course') return;
  C.chocs++;
  if (C.chocs >= 3) { dire(C, 'Arrête-toi ! Je descends ici, je ne paie pas !'); X.ligne('Trois chocs : ton client descend sans payer.'); descendreClient(C); partir(C); return; }
  const t = C.chocs === 1 ? 'Eh ! Doucement !' : 'Tu veux nous tuer ou bien ?'; if (C.p.visible) dire(C, t); else X.ligne(`Ton client : « ${t} »`);
}
function descendreClient(C) {
  const V = T.veh; if (!V) return;
  const ecart = V.D.cache ? 1.9 : 1.7; // à 1,1 m du deux-roues, vu de derrière, il avait l'air encore assis dessus
  C.x = V.x + Math.sin(V.cap - Math.PI / 2) * ecart; C.z = V.z + Math.cos(V.cap - Math.PI / 2) * ecart;
  C.p.visible = true; C.p.position.set(C.x, 0, C.z); C.p.rotation.y = V.cap - Math.PI / 2; C.p.userData.jouer('idle');
  if (T.gps) { retirerRuban(T.gps.m); T.gps = null; }
}
async function arriveeClient(C) {
  C.etat = 'paie'; descendreClient(C);
  const attendu = C.dest.km * 1000 / 6.5, pourboire = C.chocs ? 0 : C.t < attendu ? 100 : 50;
  remettre(C.p, S.moi?.visible ? S.moi : new THREE.Vector3(T.veh.x, T.veh.y + 1.1, T.veh.z), 'billet', { hautDe: 1.2, garder: .4 });
  dire(C, pourboire === 100 ? 'Merci ! Tu roules bien, garde la monnaie.' : 'Merci, à la prochaine !');
  await gagner(C.prix + pourboire, `course jusqu’à ${C.dest.nom}${pourboire ? ` (dont ${pourboire} F de pourboire)` : ''}`);
  experience(); son('piece'); signaler('course');
  setTimeout(() => partir(C), 1200);
}
/** Une course ou un arrêt servi : un point d'expérience ; tous les quelques points, on monte en grade. */
async function experience() {
  const v = VIE.data, avant = gradeDe(v.xp || 0);
  await ecrire({ xp: (v.xp || 0) + 1, courses: (v.courses || 0) + 1 });
  const g = gradeDe(v.xp); if (g > avant) X.ligne(`Tu passes « ${GRADES[g][1]} » : +10 % sur tes recettes.`);
  rendreVie();
}
function majClient(dt) {
  const V = T.veh;
  if (!W.client) { if (T.mode === 'conduit' && V && !S.lieu) { W.attente -= dt; if (W.attente <= 0) { W.attente = 3; nouveauClient(); } } return; }
  const C = W.client; C.t += dt;
  if (C.bulle && performance.now() > C.bulleFin) X.retirerBulle(C);
  const d = V ? Math.hypot(C.x - V.x, C.z - V.z) : Infinity;
  if (C.etat === 'signe') {
    if (d < 32 && !C.appele) { C.appele = true; dire(C, W.id === 'taxi' ? 'Taxi ! Taxi !' : 'Zém ! Zém !'); }
    if (d > 260 || C.t > 90) { retirerClient(); W.attente = 2; }
  } else if (C.etat === 'monte') { // il marche jusqu'au véhicule puis s'assoit derrière (ou disparaît dans la voiture)
    if (marcher(C.p, C.vers, dt, 1.8) || C.t > 4) {
      C.etat = 'course'; C.t = 0; C.p.visible = !V.D.cache;
      X.gps(C.dest.x, C.dest.z, C.dest.nom); son('bosse');
    }
  } else if (C.etat === 'course') {
    if (C.p.visible) X.asseoirSur(C.p, V, true);
    C.dit -= dt; if (C.dit <= 0) { C.dit = 25 + Math.random() * 20; const t = PHRASES_CLIENT[Math.floor(Math.random() * PHRASES_CLIENT.length)]; if (C.p.visible) dire(C, t); else X.ligne(`Ton client : « ${t} »`); }
    if (T.mode !== 'conduit') { C.arret += dt; if (C.arret > 30) { X.ligne('Ton client en a eu assez d’attendre : il est parti sans payer.'); descendreClient(C); partir(C); } }
    else if (Math.hypot(C.dest.x - V.x, C.dest.z - V.z) < 25 && Math.abs(V.v) < 1.2) arriveeClient(C);
    W.mission = `Course : ${C.dest.nom} · ${fmt(C.prix)}${C.chocs ? ` · ${C.chocs} choc${C.chocs > 1 ? 's' : ''}` : ''}`;
    return;
  } else if (C.etat === 'part') { // il s'éloigne du bord de la route, puis s'en va
    const away = [C.x + Math.sin(C.p.rotation.y) * 3, C.z + Math.cos(C.p.rotation.y) * 3];
    if (C.t < 3 && pietonOk(C.p.position.x + Math.sin(C.p.rotation.y) * .5, C.p.position.z + Math.cos(C.p.rotation.y) * .5)) marcher(C.p, away, dt);
    if (C.t > 3) { retirerClient(); W.attente = Math.min(W.attente, 6); }
  }
  // Tant que le client est encore là, on ne dit pas d'en chercher un autre : il descend, il paie, il s'éloigne.
  // Les joueurs le voyaient « encore sur la moto » pendant que la consigne demandait déjà le suivant.
  W.mission = !W.client ? ''
    : C.etat === 'signe' ? `Un client te fait signe · ${Math.round(d / 5) * 5} m`
    : C.etat === 'monte' ? 'Ton client monte…'
    : C.etat === 'paie' ? 'Ton client descend et te paie…'
    : C.etat === 'part' ? 'Ton client s’en va…' : '';
}
function marcher(p, vers, dt, v = 1.4) {
  const dx = vers[0] - p.position.x, dz = vers[1] - p.position.z, d = Math.hypot(dx, dz); if (d < .15) return true;
  const k = Math.min(1, v * dt / d); p.position.x += dx * k; p.position.z += dz * k; p.rotation.y = Math.atan2(dx, dz); p.userData.jouer('marche'); return false;
}

// ---------- Tokpa-tokpa : la ligne Godomey – Calavi ----------
// Les arrêts de Zém Run (Carrefour Kpota, UAC, IITA, échangeur de Godomey), posés sur le tracé de la ligne.
function preparerLigne(L) {
  const P = L.pts, cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const tot = L.arrets[L.arrets.length - 1].s || 1, lt = cum[cum.length - 1];
  const point = s => {
    s = Math.max(.5, Math.min(lt - .5, s)); let i = 0; while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const t = (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1), dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], l = Math.hypot(dx, dz) || 1;
    return { i, x: P[i][0] + dx * t, z: P[i][1] + dz * t, dx: dx / l, dz: dz / l };
  };
  const arrets = L.arrets.map((a, k) => {
    // Un arrêt sous un échangeur (Godomey) : le minibus se poserait sur une bretelle et la caméra passerait sous le
    // tablier. On le décale le long de la ligne, vers l'intérieur, jusqu'à un endroit dégagé.
    const s0 = a.s / tot * lt, vers = k === L.arrets.length - 1 ? -1 : 1; let q = point(s0);
    for (let d = 10; d <= 600 && pontPres(q.x, q.z, 18); d += 10) q = point(s0 + vers * d);
    return { nom: a.nom, ...q };
  });
  return { nom: L.nom, pts: P, arrets, troncons: {} };
}
/** Le tracé de l'arrêt a à l'arrêt b (indices dans arrets), dans le sens du trajet, sur la bonne voie. */
function troncon(a, b) {
  const cle = a + '>' + b; if (W.ligne.troncons[cle]) return W.ligne.troncons[cle];
  const A = W.ligne.arrets[a], B = W.ligne.arrets[b], P = W.ligne.pts, out = [[A.x, A.z]];
  if (b > a) for (let i = A.i + 1; i <= B.i; i++) out.push(P[i]); else for (let i = A.i; i > B.i; i--) out.push(P[i]);
  out.push([B.x, B.z]);
  return W.ligne.troncons[cle] = rangerAuxArrets(voie(dense(out, 8)));
}
/** Aux deux bouts d'un tronçon (les arrêts), le minibus se range contre le bord droit de l'asphalte (là où la chaussée
 *  s'arrête, contre-allée comprise) : il s'en approche sur les 30 derniers mètres et regagne sa voie sur les 20 premiers,
 *  au lieu de s'arrêter au milieu de la voie. */
function rangerAuxArrets(pts) {
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], doux = u => u * u * (3 - 2 * u), rampe = (d, R) => (d < R ? doux(1 - d / R) : 0);
  const droite = i => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; };
  // Jusqu'où va l'asphalte à droite de l'arrêt (15 m au plus) ; on s’arrête à 1,3 m du bord (la demi-largeur du minibus et un peu).
  const ecart = i => { const [x, z] = pts[i], [nx, nz] = droite(i); let d = 0; while (d < 15 && surRoute(x + nx * (d + .25), z + nz * (d + .25))) d += .25; return d >= 15 ? 0 : Math.max(0, d - 1.3); };
  // Dans un virage (bretelle, entrée de campus), on ne se range pas : décalé vers la droite, le tracé couperait le virage.
  const cap = (i, j) => Math.atan2(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]), virage = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) > .45;
  const iFin = cum.findIndex(c => c > L - 30), iDeb = cum.findIndex(c => c > 20), n = pts.length - 1;
  const fin = n > 2 && iFin > 0 && iFin < n - 1 && virage(cap(iFin - 1, iFin), cap(n - 1, n)) ? 0 : ecart(n);
  const debut = n > 2 && iDeb > 1 && virage(cap(0, 1), cap(iDeb - 1, iDeb)) ? 0 : ecart(0);
  return pts.map(([x, z], i) => {
    let e = Math.max(fin * rampe(L - cum[i], 30), debut * rampe(cum[i], 20)); if (!e) return [x, z];
    e = Math.min(e, ecart(i)); // jamais au-delà du bord de l'asphalte à cet endroit (la chaussée se resserre parfois avant l'arrêt)
    const [nx, nz] = droite(i); return [x + nx * e, z + nz * e];
  });
}
/** Un point tous les `pas` mètres au plus (le tracé d'OSM a parfois des segments de 100 m). */
function dense(pts, pas) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / pas); for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); }
  return out;
}
/** Le bout d'un tracé et la direction dans laquelle on y arrive : là où le minibus s'arrête. */
function bout(pts, debut = false) {
  const a = debut ? pts[0] : pts[Math.max(0, pts.length - 4)], b = debut ? pts[Math.min(pts.length - 1, 3)] : pts[pts.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, p = debut ? a : b;
  return { x: p[0], z: p[1], dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l };
}
// On roule à droite. La ligne de Zém Run suit une seule chaussée des boulevards à deux chaussées : dans
// l'autre sens, on passe sur la chaussée d'en face (la chaussée à sens unique parallèle, à droite) ; sur une
// route à double sens, on se tient dans la voie de droite.
// Un tronçon traverse plusieurs cases : on n'y range que son numéro, et ses huit nombres tiennent une seule
// fois dans VG.s. Une copie de l'objet par case coûtait plus de cent octets, un entier en coûte huit — c'était
// le plus gros poste de mémoire du jeu au profileur de Chrome, 13,1 Mo à lui seul.
const VG = { g: null, s: null }, CV = 40, PAS = 8;
function grilleVoies() {
  if (VG.g) return VG.g;
  const g = new Map(), seg = [];
  for (const L of roadLines) {
    if (L.cls === 6 || L.cls >= 10) continue;
    for (let k = 1; k < L.pts.length; k++) {
      const [ax, az] = L.pts[k - 1], [bx, bz] = L.pts[k], l = Math.hypot(bx - ax, bz - az) || 1, n = seg.length / PAS;
      seg.push(ax, az, bx, bz, (bx - ax) / l, (bz - az) / l, (L.w || 6) / 2, L.sens ? 1 : 0);
      for (let cx = Math.floor(Math.min(ax, bx) / CV); cx <= Math.floor(Math.max(ax, bx) / CV); cx++) for (let cz = Math.floor(Math.min(az, bz) / CV); cz <= Math.floor(Math.max(az, bz) / CV); cz++) { const c = cx + ',' + cz; let li = g.get(c); if (!li) g.set(c, li = []); li.push(n); }
    }
  }
  VG.s = new Float32Array(seg); return VG.g = g;
}
/** Le tronçon n, sous la forme que les appelants attendent (on ne le reconstruit que pour les candidats retenus). */
const tronconVoie = n => { const S = VG.s, o = n * PAS; return { ax: S[o], az: S[o + 1], bx: S[o + 2], bz: S[o + 3], dx: S[o + 4], dz: S[o + 5], hw: S[o + 6], sens: !!S[o + 7] }; };
/** Le tronçon de route le plus proche de (x, z) à moins de r m (filtre éventuel), et le point projeté. */
function routeSous(x, z, r, ok = null) {
  const g = grilleVoies(), S = VG.s; let best = null, bd = r;
  for (let cx = Math.floor((x - r) / CV); cx <= Math.floor((x + r) / CV); cx++) for (let cz = Math.floor((z - r) / CV); cz <= Math.floor((z + r) / CV); cz++) for (const n of g.get(cx + ',' + cz) || []) {
    const o = n * PAS, ax = S[o], az = S[o + 1], ux = S[o + 2] - ax, uz = S[o + 3] - az;
    // La distance d'abord : elle ne coûte rien, alors que le filtre demande de reconstruire l'objet. L'ordre ne
    // change rien au résultat, bd ne bougeant que pour un candidat accepté.
    const t = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz || 1))), px = ax + ux * t, pz = az + uz * t, d = Math.hypot(px - x, pz - z);
    if (d >= bd) continue;
    const e = tronconVoie(n); if (ok && !ok(e)) continue;
    bd = d; best = { e, x: px, z: pz, d };
  }
  return best;
}
function voie(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l, nx = -dz, nz = dx; // (nx, nz) : à droite
    const [x, z] = pts[i], ici = routeSous(x, z, 6);
    if (ici?.e.sens && ici.e.dx * dx + ici.e.dz * dz < -.5) { // chaussée à sens unique prise à contresens : celle d'en face
      const face = routeSous(x + nx * 14, z + nz * 14, 22, e => e.sens && e.dx * dx + e.dz * dz > .7 && (e.ax - x) * nx + (e.az - z) * nz > 2);
      if (face) { out.push([face.x, face.z]); continue; }
    }
    const hw = ici?.e.hw ?? 3, d = ici?.e.sens ? 0 : Math.min(2, hw * .45); // à double sens : la voie de droite
    out.push([x + nx * d, z + nz * d]);
  }
  // Lissage léger : pas de saut d'une chaussée à l'autre en un mètre.
  return out.map((p, i) => { if (i === 0 || i === out.length - 1) return p; const q = out[i - 1], r = out[i + 1]; return [(q[0] + 2 * p[0] + r[0]) / 4, (q[1] + 2 * p[1] + r[1]) / 4]; });
}
const terminus = k => k === 0 || k === W.ligne.arrets.length - 1;
const crier = tk => (tk.sens < 0 ? 'Calavi ! Kpota !' : 'Godomey ! Godomey !');
/** Point de la porte latérale (à droite, un peu en arrière) : là où se tient l'apprenti. */
function porte(V, ecart = 1.2) { const r = V.cap - Math.PI / 2; return [V.x + Math.sin(r) * ecart - Math.sin(V.cap) * .4, V.z + Math.cos(r) * ecart - Math.cos(V.cap) * .4]; }

function allerGare(id, reprise) {
  const L = W.ligne, k = L.arrets.length - 1;
  if (T.veh) { retirerVehicule(T.veh); T.veh = null; } // ton véhicule à toi reste chez toi
  const ici = bout(troncon(k, k - 1), true), cap = Math.atan2(ici.dx, ici.dz);
  const V = creerVehicule('tokpa'); placer(V, ici.x, ici.z, cap); V.travail = true;
  const tk = W.tk = { V, k, cible: k, sens: -1, occ: 0, phase: 'gare', t: 0, attendent: [], file: 0, part: 0, cris: 0, encaissesArret: 0, aide: null, ruban: null, desc: 0, montes: 0, P: null, ici, fin: ici };
  const [px, pz] = porte(V, 4.2); S.x = px; S.z = pz; S.cap = cap + Math.PI / 2; S.y = 0; S.saut = true; S.geste = 'idle';
  attendreA(k, 9 + Math.floor(Math.random() * 4), ici);
  if (id === 'chauffeur') {
    T.veh = V; VIE.travail = { type: 'tokpa', carburant: VEHICULES.tokpa.reservoir };
    const e = X.etiquette('Tokpa-tokpa du patron'); e.position.y = 3; V.g.add(e); V.etiquette = e;
    tk.aide = perso(7700, 'jeune'); scene.add(tk.aide); tk.aide.g = tk.aide;
    X.ligne(`Gare routière de Godomey. Le tokpa-tokpa du patron t’attend${reprise ? '' : ` (versement ${fmt(METIERS.chauffeur.versement)} ce soir)`}. Monte au volant, attends que l’apprenti ait rempli, puis prends la route de Calavi en t’arrêtant à chaque arrêt.`);
  } else X.ligne('Gare routière de Godomey. Le chauffeur t’attend : monte à la porte, c’est toi l’apprenti. Crie la destination pour remplir, encaisse chaque passager (rends bien la monnaie !) et donne le départ.');
}
/** Des passagers attendent à l'arrêt k, sur le trottoir à droite de là où le minibus s'arrête (A : point et sens). */
function attendreA(k, n, A) {
  const tk = W.tk, { dx, dz } = A;
  for (const p of tk.attendent) retirerPerso(p); tk.attendent = [];
  for (let i = 0; i < Math.min(n, 8); i++) { // on n'en montre que huit, les autres attendent plus loin
    const along = (i - 3.5) * 1.3, s = trottoir(A.x + dx * along, A.z + dz * along, dx, dz); if (!s) continue; // trottoir de droite d'abord
    const p = perso(8000 + k * 40 + i + W.n++); p.position.set(s[0], 0, s[1]); p.rotation.y = Math.atan2(A.x - s[0], A.z - s[1]); scene.add(p); tk.attendent.push(p);
  }
  tk.nAttente = n; tk.attenteK = k;
}
/** Un passager marche jusqu'à la porte et monte (ou descend et s'éloigne). */
function faireMarcher(p, vers, fin, v = 1.6) { W.marcheurs.push({ p, vers, fin, v, t: 0 }); }
function majMarcheurs(dt) {
  for (let i = W.marcheurs.length - 1; i >= 0; i--) {
    const m = W.marcheurs[i]; m.t += dt;
    if (marcher(m.p, typeof m.vers === 'function' ? m.vers() : m.vers, dt, m.v) || m.t > 9) { W.marcheurs.splice(i, 1); m.fin?.(m.p); }
  }
}
/** Arrivée à l'arrêt : ceux qui descendent (tous au terminus), puis ceux qui attendaient montent. */
function arriverArret(tk) {
  const A = W.ligne.arrets[tk.cible]; tk.k = tk.cible; tk.phase = 'arret'; tk.t = 0; tk.cris = 0; tk.montes = 0; tk.part = 0; tk.encaissesArret = 0;
  tk.ici = { x: tk.V.x, z: tk.V.z, dx: Math.sin(tk.V.cap), dz: Math.cos(tk.V.cap) }; // là où il s'est vraiment arrêté
  if (tk.ruban) { retirerRuban(tk.ruban); tk.ruban = null; }
  if (T.gps && T.veh === tk.V) { retirerRuban(T.gps.m); T.gps = null; }
  const fin = terminus(tk.k);
  if (fin) tk.sens = tk.k === 0 ? 1 : -1; // demi-tour au terminus
  tk.desc = fin ? tk.occ : Math.round(tk.occ * (.25 + Math.random() * .35));
  if (fin && tk.file > 0) { X.ligne(`${tk.file} passager${tk.file > 1 ? 's sont descendus' : ' est descendu'} sans avoir payé : il fallait encaisser pendant le trajet.`); tk.file = 0; }
  else tk.file = Math.max(0, tk.file - Math.round(tk.desc * tk.file / Math.max(1, tk.occ))); // quelques-uns de ceux qui n'ont pas payé descendent ici
  tk.occ -= tk.desc;
  for (let i = 0; i < Math.min(tk.desc, 5); i++) { // on les voit descendre et s'éloigner
    const p = perso(8600 + W.n++), [px, pz] = porte(tk.V); p.position.set(px, 0, pz); scene.add(p);
    const s = trottoir(px, pz, Math.sin(tk.V.cap), Math.cos(tk.V.cap), [1, -1]) || [px, pz];
    setTimeout(() => faireMarcher(p, [s[0] + (Math.random() - .5) * 4, s[1] + (Math.random() - .5) * 4], retirerPerso, 1.3), i * 600);
  }
  if (tk.attenteK !== tk.k) attendreA(tk.k, fin ? 8 + Math.floor(Math.random() * 5) : 2 + Math.floor(Math.random() * 5), tk.ici);
  son('arret');
  const qui = T.mode === 'apprenti' ? 'apprenti' : 'chauffeur';
  X.ligne(`Arrêt ${A.nom}${tk.desc ? ` : ${tk.desc} passager${tk.desc > 1 ? 's descendent' : ' descend'}` : ''}.${qui === 'apprenti' ? ' Crie la destination, encaisse, puis « Chauffeur, on y va ! ».' : ''}`);
}
/** Les passagers qui attendaient montent un par un (l'apprenti du chauffeur s'en charge, ou le joueur apprenti). */
function monterPassager(tk, compte = true) {
  if (tk.occ >= PLACES_TOKPA || tk.nAttente <= 0) return false;
  tk.nAttente--; tk.occ++; tk.montes++; if (compte) tk.file++;
  const p = tk.attendent.shift();
  if (p) faireMarcher(p, () => porte(tk.V), retirerPerso, 1.8);
  return true;
}
function partirArret(tk) {
  const suivant = tk.k + tk.sens; tk.cible = suivant; tk.phase = 'route'; tk.t = 0;
  tk.P = { pts: troncon(tk.k, suivant), i: 0 }; tk.fin = bout(tk.P.pts);
  if (T.mode === 'apprenti') { tk.ruban = ruban(tk.P.pts); son('klaxon'); }
  else poserGps(tk);
  for (const p of tk.attendent) retirerPerso(p); tk.attendent = []; tk.nAttente = 0; tk.attenteK = -1; // ceux qui restent prendront le suivant
}
function poserGps(tk) {
  if (T.veh !== tk.V) return;
  if (T.gps) retirerRuban(T.gps.m);
  const pts = troncon(tk.k, tk.cible), B = W.ligne.arrets[tk.cible];
  T.gps = { pts, m: ruban(pts), nom: `arrêt ${B.nom}`, x: tk.fin.x, z: tk.fin.z }; T.gpsT = 0;
}

// Le chauffeur (joueur au volant) : on s'arrête à moins de 30 m de l'arrêt, l'apprenti fait monter, on gagne
// 200 F par passager ; on peut repartir quand on veut (ceux qui n'ont pas eu le temps de monter restent).
function majChauffeur(dt, tk) {
  const V = tk.V, A = W.ligne.arrets[tk.phase === 'route' ? tk.cible : tk.k], B = tk.phase === 'route' ? tk.fin : tk.ici, d = Math.hypot(B.x - V.x, B.z - V.z);
  const [ax, az] = porte(V); tk.aide.position.set(ax, V.y + .25, az); tk.aide.rotation.y = V.cap - Math.PI / 2; // l'apprenti, à la porte
  if (tk.aide.bulle && performance.now() > tk.aide.bulleFin) X.retirerBulle(tk.aide);
  if (tk.phase === 'route') {
    if (T.mode === 'conduit' && !T.gps && d > 40) poserGps(tk); // au volant : la ligne bleue jusqu'au prochain arrêt
    if (d < 180 && tk.attenteK !== tk.cible && !terminus(tk.cible)) attendreA(tk.cible, 2 + Math.floor(Math.random() * 5), tk.fin); // au terminus, on les fait venir à l'arrivée
    if (d < 30 && Math.abs(V.v) < .6) arriverArret(tk);
    W.mission = `Ligne Godomey – Calavi · prochain arrêt ${A.nom} · ${tk.occ}/${PLACES_TOKPA} passagers`;
    return;
  }
  // À l'arrêt (ou à la gare) : l'apprenti crie et fait monter, un passager par seconde, bus arrêté.
  tk.t += dt;
  if (tk.t > 1.5 && !tk.crie) { tk.crie = true; dire(tk.aide, crier(tk)); tk.aide.userData.jouer('salut'); }
  if (Math.abs(V.v) < .6 && d < 35 && tk.t > 2 && tk.nAttente > 0 && tk.occ < PLACES_TOKPA) { tk.monte = (tk.monte || 0) + dt; if (tk.monte > 1) { tk.monte = 0; monterPassager(tk, false); } }
  const fini = tk.nAttente <= 0 || tk.occ >= PLACES_TOKPA;
  if ((fini && tk.t > 3) || d > 35) { // tout le monde est monté (ou on est reparti) : on encaisse et on file au suivant
    const gain = tk.montes * PRIX_TOKPA * (1 + .1 * gradeDe(VIE.data.xp || 0));
    if (tk.montes) { gagner(Math.round(gain / 25) * 25, `tokpa-tokpa · ${tk.montes} passager${tk.montes > 1 ? 's' : ''} (arrêt ${A.nom})`); experience(); }
    dire(tk.aide, tk.occ >= PLACES_TOKPA ? 'On est au complet, on bouge !' : 'Chauffeur, on y va !'); tk.aide.userData.jouer('idle'); tk.crie = false;
    partirArret(tk);
  }
  W.mission = `Arrêt ${A.nom} · ${tk.occ}/${PLACES_TOKPA} passagers${tk.nAttente > 0 && tk.occ < PLACES_TOKPA ? ' · ça monte, reste arrêté' : ''}`;
}

// L'apprenti (joueur à la porte) : le chauffeur conduit tout seul le long de la ligne.
function majApprenti(dt, tk) {
  const V = tk.V;
  if (tk.phase === 'route') {
    for (let k = 0; k < (tk.vite ? 3 : 1); k++) if (suivreChemin(V, tk.P, dt, 19)) { arriverArret(tk); break; } // en accéléré : trois pas par image
    if (Math.hypot(tk.fin.x - V.x, tk.fin.z - V.z) < 180 && tk.attenteK !== tk.cible && !terminus(tk.cible)) attendreA(tk.cible, 1 + Math.floor(Math.random() * 3), tk.fin);
  } else {
    tk.t += dt;
    if (tk.t > 2 && tk.nAttente > 0 && tk.occ < PLACES_TOKPA) { tk.monte = (tk.monte || 0) + dt; if (tk.monte > .9) { tk.monte = 0; monterPassager(tk); } } // ceux qui attendaient montent
    if (tk.t > 50) { X.ligne('Le chauffeur : « On ne va pas attendre toute la journée ! » Il démarre.'); depart(tk); }
  }
  // Le joueur se tient à la marche de la porte, tourné vers le trottoir.
  const [px, pz] = porte(V); S.x = V.x; S.z = V.z; S.cap = V.cap; S.y = V.y; // pour les amis : le minibus
  if (S.moi) { S.moi.visible = true; S.moi.position.set(px, V.y + .25, pz); S.moi.rotation.y = V.cap - Math.PI / 2; S.moi.userData.jouer(tk.crieT > 0 ? 'salut' : 'idle'); }
  if (tk.crieT > 0) tk.crieT -= dt;
  const A = W.ligne.arrets[tk.phase === 'route' ? tk.cible : tk.k];
  W.mission = `${VIE.femme ? 'Apprentie' : 'Apprenti'} · ${tk.phase === 'route' ? `vers ${A.nom}` : `arrêt ${A.nom}`} · ${tk.occ}/${PLACES_TOKPA} · ${tk.file} à encaisser · ta part ${fmt(tk.part)}`;
  return { x: V.x, y: V.y, z: V.z, cap: V.cap, dist: 11, haut: 4 };
}
function monterApprenti() {
  const tk = W.tk; if (!tk) return;
  const [px, pz] = porte(tk.V);
  T.trans = { t: 0, duree: .9, de: [S.x, S.z], vers: [px, pz], fin: () => { T.mode = 'apprenti'; tk.phase = 'arret'; tk.t = 0; tk.k = tk.cible; X.ligne('Tu es à la porte. « Crier » fait venir du monde, « Encaisser » fait payer ceux qui sont montés.'); } };
}
function crierDestination() {
  const tk = W.tk; if (!tk) return;
  X.bulle(S, crier(tk)); tk.crieT = 2.2; tk.cris++;
  const libres = PLACES_TOKPA - tk.occ - tk.nAttente; if (libres <= 0) return;
  const n = tk.cris > 3 ? 0 : Math.min(libres, 1 + Math.floor(Math.random() * 3)); // les premiers cris rapportent, après il n'y a plus personne
  if (!n) { X.ligne('Plus personne ne vient : donne le départ.'); return; }
  const A = tk.ici;
  for (let i = 0; i < n; i++) { // ils arrivent en courant depuis le trottoir, derrière le minibus
    const s = trottoir(A.x - A.dx * (7 + i * 2), A.z - A.dz * (7 + i * 2), A.dx, A.dz) || porte(tk.V, 6);
    const p = perso(8800 + W.n++); p.position.set(s[0], 0, s[1]); scene.add(p); tk.nAttente++;
    tk.attendent.push(p);
  }
}
/** Encaisser le passager suivant : il tend un billet, on choisit la monnaie à rendre. */
function encaisser() {
  const tk = W.tk; if (!tk || tk.file <= 0) return;
  const billet = [500, 500, 1000, 1000, 2000, PRIX_TOKPA][Math.floor(Math.random() * 6)], juste = billet - PRIX_TOKPA;
  const options = [...new Set([juste, juste + 100, Math.max(0, juste - 100), juste + 50])].slice(0, 3).sort(() => Math.random() - .5);
  const proposer = (titre, essais) => X.choisir(titre, options.map(o => ({ texte: o ? `Rendre ${fmt(o)}` : 'Rien à rendre, c’est le compte', f: () => {
    if (o === juste) { tk.file--; tk.part += PART_APPRENTI; tk.encaissesArret++; son('piece'); X.bulle(S, o ? `Voilà ta monnaie : ${fmt(o)}.` : 'C’est bon, merci !'); }
    else if (o < juste) { X.ligne(`Le passager : « Eh, apprenti ! Il manque ${fmt(juste - o)} ! »`); proposer(`Il te tend ${fmt(billet)} pour ${fmt(PRIX_TOKPA)} · il manque de la monnaie`, essais + 1); }
    else { tk.file--; tk.part += PART_APPRENTI - (o - juste); tk.encaissesArret++; X.ligne(`Tu as rendu ${fmt(o - juste)} de trop : c’est retiré de ta part.`); }
  } })), { annuler: 'Plus tard' });
  proposer(`Un passager te tend ${fmt(billet)} pour ${fmt(PRIX_TOKPA)}. Tu rends combien ?`, 0);
}
function depart(tk) {
  if (tk.part > 0) gagner(tk.part, `ta part d’apprenti (arrêt ${W.ligne.arrets[tk.k].nom})`);
  else if (tk.part < 0) depenser(Math.min(VIE.data.argent, -tk.part), 'monnaie rendue en trop');
  if (tk.encaissesArret) experience();
  tk.part = 0; X.bulle(S, tk.occ >= PLACES_TOKPA ? 'On est au complet, on bouge !' : 'Chauffeur, on y va !');
  partirArret(tk);
}

// ---------- Actions et mise à jour ----------
/** Les actions du métier en cours (avant celles du trajet) : parler au client, monter à la porte, crier, encaisser… */
export function actionsMetier() {
  const out = []; if (!W.id || W.pause) return out;
  if (METIERS[W.id].famille !== 'transport') return actionsVille();
  const C = W.client, V = T.veh, tk = W.tk;
  if (C?.etat === 'signe' && T.mode === 'conduit' && Math.hypot(C.x - V.x, C.z - V.z) < 9 && Math.abs(V.v) < 1.5) out.push({ texte: 'Parler au client', f: negocier });
  if (tk && W.id === 'apprenti') {
    if (T.mode === 'pied' && Math.hypot(tk.V.x - S.x, tk.V.z - S.z) < 6) out.push({ texte: 'Monter à la porte (apprenti)', f: monterApprenti });
    if (T.mode === 'apprenti') {
      if (tk.file > 0) out.push({ texte: `Encaisser · ${tk.file} passager${tk.file > 1 ? 's' : ''}`, f: encaisser });
      if (tk.phase === 'arret') {
        if (tk.occ + tk.nAttente < PLACES_TOKPA && tk.cris < 5) out.push({ texte: `Crier « ${crier(tk)} »`, f: crierDestination });
        out.push({ texte: 'Chauffeur, on y va !', f: () => depart(tk) });
      } else out.push({ texte: tk.vite ? 'Vitesse normale' : 'Trajet en accéléré (×3)', f: () => { tk.vite = !tk.vite; } }); // entre deux arrêts, l'apprenti n'a qu'à encaisser
    }
  }
  return out;
}
/** À chaque image du salon. En apprenti, renvoie ce que la caméra suit (le minibus). */
export function majMetiers(dt) {
  if (!W.id) return null;
  majGilet(); majMarcheurs(dt);
  if (T.veh?.balise) T.veh.balise.visible = T.mode !== 'conduit'; // la colonne de lumière s'éteint quand on est dessus
  if (W.pause) { // rien n'avance au poste
    W.mission = `${METIERS[W.id].entreprise || nomMetier(METIERS[W.id])} · en pause`; // « Moov · en pause » : le titre (superviseure…) reste dans « Ma vie »
    if (W.mission !== VIE.mission) { VIE.mission = W.mission; const el = $('#vhMission'); if (el) { el.hidden = false; el.textContent = W.mission; } }
    return null;
  }
  let suivi = null;
  if (METIERS[W.id].famille !== 'transport') { majVille(dt); W.mission = missionVille(); suivi = suiviVille(); }
  else if (W.id === 'zem' || W.id === 'taxi') majClient(dt);
  else if (W.tk) {
    if (W.id === 'chauffeur') { if (W.tk.phase === 'gare' && T.mode === 'conduit') { W.tk.phase = 'arret'; W.tk.t = 0; } if (W.tk.phase !== 'gare') majChauffeur(dt, W.tk); else W.mission = 'Monte au volant du tokpa-tokpa (étiquette jaune).'; }
    else if (T.mode === 'apprenti') suivi = majApprenti(dt, W.tk);
    else W.mission = 'Monte à la porte du tokpa-tokpa : tu es l’apprenti.';
  }
  if (W.mission !== VIE.mission) { VIE.mission = W.mission; const el = $('#vhMission'); if (el) { el.hidden = !W.mission; el.textContent = W.mission; } }
  return suivi;
}
