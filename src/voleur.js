import * as THREE from 'three';
import { creerVehicule, placer, retirerVehicule } from './conduite.js';
import { personne } from './discussions.js';
import { retirerDeLaCirculation, vehiculeArrete } from './circulation.js';
import { poserObstacles } from './rue.js';
import { camera, scene } from './scene.js';
import { hauteurSol } from './sols.js';

// ---------- Voler n'importe quel véhicule de la circulation ----------
// « Je veux voler la voiture de n'importe quelle personne dans le jeu, et même voler en haut si c'est une Roadster »
// (Murielle, 19/11). Les voitures, taxis, motos et zémidjans de la circulation (circulation.js) s'arrêtent devant le joueur ;
// à pied, à moins de 3,4 m de l'un d'eux arrêté ou au pas : « Voler cette voiture ». Le conducteur descend, crie, puis appelle
// la police ; on monte et on part (trajets.js, volerVehicule). Le véhicule garde son allure : la voiture volée est dessinée
// avec le maillage même de la circulation (sa couleur, son modèle). Une moto prend le modèle de la moto du joueur (celle de la
// circulation porte son pilote). Comme au Village (village-gens.js), on la garde tant qu'on ne la laisse pas à plus de 60 m.
// Les Roadster à voler, elles, sont garées dans plusieurs quartiers (village-gens.js) : volées, elles s'envolent.

const R = { vole: null, chauffeurs: [], ctx: null, t: 0 };
if (import.meta.env.DEV) window.__voleur = R; // pour les tests
const PRENOMS = [['Codjo', false], ['Nafissatou', true], ['Fernand', false], ['Fifonsi', true], ['Romaric', false], ['Mariam', true], ['Mahougnon', false], ['Sèdami', true], ['Yélian', false], ['Gisèle', true]]; // pas de voyelle au début : « la voiture de … »
// Le véhicule de la circulation → celui qu'on conduit, et comment on le nomme (trajets.js, nomDe ; les mêmes mots ici).
const JOUEUR = { voiture: 'voiture', taxi: 'taxi', moto: 'moto', zem: 'zem' };
const ACTION = { voiture: 'Voler cette voiture', taxi: 'Voler ce taxi', moto: 'Voler cette moto', zem: 'Voler ce zém' };
const QUOI = { voiture: 'la voiture de ', taxi: 'le taxi de ', moto: 'la moto de ', zem: 'la moto de ' };
const CRIS = { voiture: 'Hé ! Ma voiture !', taxi: 'Hé ! Mon taxi !', moto: 'Hé ! Ma moto !', zem: 'Hé ! Ma moto ! Mon gagne-pain !' };

let ctx = { ligne: () => { }, bulle: () => { }, finBulle: () => { }, joueur: () => null, aPied: () => false, vehicule: () => null, voler: () => false, lacher: () => false };
/** Mêmes fonctions que village-gens.js (salon.js). */
export function initVoleur(c) { Object.assign(ctx, c); }

/** L'action du joueur à pied près d'un véhicule de la circulation arrêté. */
export function actionsVoleur() {
  if (!ctx.aPied()) return [];
  const J = ctx.joueur(); if (!J) return [];
  const V = vehiculeArrete(J.x, J.z); if (!V || !JOUEUR[V.type.id]) return [];
  return [{ texte: ACTION[V.type.id], f: () => voler(V) }];
}

function voler(V) {
  const t = V.type.id, [nom, femme] = PRENOMS[Math.floor(Math.random() * PRENOMS.length)];
  const PV = creerVehicule(JOUEUR[t]);
  if (t === 'voiture' || t === 'taxi') { // la même voiture, pas une autre : le maillage de la circulation, avant vers +x comme les gabarits
    const m = new THREE.Mesh(V.mesh.geometry, V.mesh.material); m.rotation.y = -Math.PI / 2; m.castShadow = V.mesh.castShadow; m.receiveShadow = true;
    PV.g.remove(PV.modele); PV.g.add(m); PV.modele = m; PV.habitacle = null; // ses vitres sont peintes : on ne voit pas dedans
  }
  placer(PV, V.px, V.pz, V.cap); PV.vole = nom;
  if (!ctx.voler(PV)) { retirerVehicule(PV); ctx.ligne('Pas maintenant : termine d’abord ce que tu fais.'); return; }
  retirerDeLaCirculation(V);
  // Le conducteur descend du côté de sa portière (à gauche), et se retourne vers son véhicule.
  const sx = Math.cos(V.cap), sz = -Math.sin(V.cap), x = V.px + sx * 1.7, z = V.pz + sz * 1.7;
  const g = personne(8800 + Math.floor(Math.random() * 1e5), t === 'zem' ? { role: 'zem' } : { femme }) || personne(8800, { femme });
  g.position.set(x, Math.max(.04, hauteurSol(x, z)), z); g.rotation.y = Math.atan2(V.px - x, V.pz - z); g.userData.jouer?.('parle', 0); scene.add(g);
  const P = { g, x, z, t: 0, bulle: null, bulleFin: 0, cris: [[.3, CRIS[t]], [3.5, 'Au voleur ! Rattrapez-le !'], [9, 'Allô, la police ? On vient de me voler mon véhicule !']] };
  R.chauffeurs.push(P); R.vole = PV; majObstacles();
  ctx.ligne(`Tu voles ${QUOI[t]}${nom} ! Démarre vite… Laisse-la à plus de 60 m pour qu’on te la reprenne.`);
}
function majObstacles() { poserObstacles('voleur', R.chauffeurs.map(P => [P.x, P.z, 0, .55, .55])); }
const horsDeVue = (x, z) => { const dx = x - camera.position.x, dz = z - camera.position.z; if (dx * dx + dz * dz > 120 * 120) return true; const v = new THREE.Vector3(x, 1, z).project(camera); return v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1; };

export function majVoleur(dt) {
  const now = performance.now(), J = ctx.joueur();
  // Les conducteurs volés : ils regardent partir leur véhicule, crient, appellent la police, puis s'en vont quand on ne les voit plus.
  for (const P of R.chauffeurs) {
    P.t += dt;
    if (P.bulle && now > P.bulleFin) ctx.finBulle(P);
    if (R.vole && P.t < 12) P.g.rotation.y = Math.atan2(R.vole.x - P.x, R.vole.z - P.z);
    while (P.cris.length && P.t > P.cris[0][0]) { ctx.bulle(P, P.cris.shift()[1]); P.g.userData.jouer?.('parle'); }
  }
  R.t -= dt; if (R.t > 0) return; R.t = .5;
  const partis = R.chauffeurs.filter(P => P.t > 30 && horsDeVue(P.x, P.z));
  if (partis.length) { for (const P of partis) { ctx.finBulle(P); scene.remove(P.g); P.g.userData.liberer?.(); } R.chauffeurs = R.chauffeurs.filter(P => !partis.includes(P)); majObstacles(); }
  // Le véhicule volé : retiré ailleurs (une autre voiture volée, quitter la ville, un métier) on l'oublie ; laissé loin, il retourne à son propriétaire.
  const V = R.vole; if (!V) return;
  if (ctx.vehicule() !== V) { R.vole = null; return; }
  if (!J || J.mode !== 'pied') return;
  if ((Math.hypot(V.x - J.x, V.z - J.z) > 60 || J.lieu) && ctx.lacher()) { R.vole = null; ctx.ligne(`${V.vole} a récupéré son véhicule.`); }
}

export function quitterVoleur() {
  for (const P of R.chauffeurs) { scene.remove(P.g); P.g.userData.liberer?.(); }
  R.chauffeurs = []; R.vole = null; majObstacles();
}
