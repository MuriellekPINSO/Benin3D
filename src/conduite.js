import * as THREE from 'three';
import { TRIPO, urlTripo } from './batiments-tripo.js';
import { construireReseau, itineraireCourt } from './carrefours.js';
import { personne } from './discussions.js';
import { dansBatiment, dansObstacleRue, pietonOk } from './rue.js';
import { hauteurSol } from './sols.js';
import { animerMoto } from './roues.js';
import { dansTerrePlein } from './terre-pleins.js';
import { dansCirculation } from './trafic.js';
import { scene } from './scene.js';
import { plusTard } from './telechargements.js';
import { TABLIERS, mergeColored, roadLines } from './ville.js';
import { B3, PEDALIER, TOKPA_3D, VITRE, ZEMS_3D, gabaritDe, matVeh, partsBolide, partsPedalier, partsRoadster, partsCitadine, partsTokpa, partsVelo, partsVoiture, partsZem } from './vehicules.js';
import { chargeurGLB } from './textures.js';

// ---------- Conduire dans la ville (Ma vie, salon entre amis) ----------
// On monte sur sa moto ou dans sa voiture et on roule où l'on veut, mais sur les routes : la chaussée et
// le bord du trottoir (pour se garer, prendre quelqu'un, s'arrêter à une station), jamais à travers les
// murs ni les bâtiments : on y bute. Marche arrière et demi-tour comme en vrai, ponts (on monte sur le
// tablier par sa rampe, on passe dessous en travers), essence qui baisse en roulant. Le GPS trace
// l'itinéraire jusqu'à la destination choisie ; le zém qu'on hèle le suit tout seul.

// Vitesses en m/s (13,9 = 50 km/h ; on roule plus vite qu'en vrai : la ville est grande), essence à l'échelle du jeu : des réservoirs de quelques litres, qu'on voit
// baisser en roulant, mais assez de kilomètres par litre pour qu'une course de zém ou de taxi rapporte plus que
// l'essence qu'elle coûte (metiers.js). `cache` : on est dedans (portières, toit) — on le voit à travers les vitres (HABITACLES).
export const VEHICULES = {
  moto: { nom: 'moto', long: 2, larg: .8, vmax: 22, accel: 5.5, frein: 9, recul: 2.5, braquage: 1.9, reservoir: 3, kmParLitre: 12, selle: [1.02, -.08], arriere: -.8 }, // le passager au fond de la selle, derrière la pilote reculée (03/11)
  voiture: { nom: 'voiture', long: 4.4, larg: 1.8, vmax: 25, accel: 5, frein: 8.5, recul: 3.5, braquage: 1.3, reservoir: 6, kmParLitre: 6, cache: true },
  taxi: { nom: 'taxi', long: 4.3, larg: 1.8, vmax: 25, accel: 5, frein: 8.5, recul: 3.5, braquage: 1.3, reservoir: 6, kmParLitre: 6, cache: true },
  tokpa: { nom: 'tokpa-tokpa', long: 5, larg: 1.9, vmax: 20, accel: 3.8, frein: 7.5, recul: 2.5, braquage: 1.05, reservoir: 10, kmParLitre: 4, cache: true }, // l'apprenti se tient à la porte latérale, à droite (metiers.js)
  zem: { nom: 'zém', long: 2, larg: .8, vmax: 18, accel: 5, frein: 9, recul: 2, braquage: 1.9, reservoir: 3, kmParLitre: 12, selle: [1.02, -.08], arriere: -.62 },
  // Le vélo Caï Caï : lent, nerveux au démarrage, il tourne court. `pedale` : pas d'essence, donc jamais
  // de panne sèche et rien à consommer (trajets.js saute le carburant pour lui).
  velo: { nom: 'vélo', long: 1.8, larg: .6, vmax: 7, accel: 2.8, frein: 7, recul: 1.2, braquage: 2.3, reservoir: 0, kmParLitre: 0, pedale: true, selle: [.95, -.3], arriere: -.5 },
  // Deux voitures à s'offrir quand on a de quoi. La citadine, celle qu'on croise par milliers à Cotonou :
  // courte, haute, économe. Le bolide électrique, qui existait déjà dans Zém Run et qu'on peut enfin conduire
  // en ville : silencieux et vif. Pas de `pedale` sur l'électrique, malgré la tentation de dire qu'elle ne
  // consomme pas : ce drapeau autorise aussi à rouler sur les trottoirs. On lui donne une grosse réserve et
  // beaucoup de kilomètres au litre — une charge qui dure.
  citadine: { nom: 'citadine', long: 3.7, larg: 1.7, vmax: 23, accel: 4.6, frein: 8.2, recul: 3.2, braquage: 1.5, reservoir: 5, kmParLitre: 14, cache: true },
  bolide: { nom: 'bolide électrique', long: 4.3, larg: 1.9, vmax: 33, accel: 9, frein: 11, recul: 4, braquage: 1.45, reservoir: 9, kmParLitre: 60, cache: true },
  roadster: { nom: 'Roadster', long: 4.4, larg: 2, vmax: 38, accel: 11, frein: 12, recul: 4.2, braquage: 1.4, reservoir: 10, kmParLitre: 70, cache: true, propulseurs: true },
};
export const PRIX_LITRE = 680; // à la pompe (Zém Run : 680 F à la station, 500 F le kpayo)
const D_ACCEL = 4.5; // accélération du zém (ou du tokpa-tokpa) en pilote automatique

// Modèles réalistes : voiture et moto du joueur générées par Tripo (public/modeles/batiments/, sans pilote :
// c'est son personnage qu'on voit dessus), zémidjan de « 3D monde » (gilet jaune, casque). Gabarits : avant vers
// +x (vehicules.js). Tant qu'ils ne sont pas chargés, les modèles dessinés en code.
const MODELES = { voiture: null, moto: null, taxi: null };
if (import.meta.env.DEV) window.__vehicules = { MODELES }; // pour les tests : la voiture dessinée en code, en vidant MODELES
const LONGUEURS = { voiture: 4.4, moto: 2, taxi: 4.3 };
const DEMI_TOUR = { voiture: true, moto: true, taxi: false }; // le redressement aligne l'axe long mais ne sait pas où est l'avant : vérifié en jeu (phare devant)
// Selle du modèle Tripo, mesurée : avec [1,02 ; −0,08] du zém, on s'asseyait sur le réservoir ; avec [0,86 ; −0,27], encore
// au bord du réservoir, les hanches 15 cm au-dessus de la selle (profil relevé le 03/11). Le bassin au milieu de la selle.
const SELLES = { moto: [.83, -.43] };
export function chargerVehicules() {
  const ch = chargeurGLB({ liberer: true });
  for (const [type, id] of [['voiture', 'voiture-perso'], ['moto', 'moto-perso'], ['taxi', 'voiture']]) { // taxi : celui de Zém Run
    if (!TRIPO.info[id]) continue;
    plusTard(() => ch.loadAsync(urlTripo(id))).then(g => { MODELES[type] = gabaritDe(g.scene, { largeur: LONGUEURS[type] }); }).catch(e => console.warn(`modèle ${id}`, e.message));
  }
}
/** Un véhicule : modèle (avant vers +z du groupe) et état de conduite. `peinture` : la couleur choisie par son
 *  propriétaire (menu « Peindre mon véhicule ») ; sans elle, la couleur d'origine (`couleur`, ou la texture du modèle). */
export function creerVehicule(type, { couleur, peinture } = {}) {
  const D = VEHICULES[type], g = new THREE.Group();
  const gabarit = type === 'zem' ? ZEMS_3D.moto : MODELES[type];
  let m, dessin = null;
  const H = HABITACLES[type + ((type === 'tokpa' ? TOKPA_3D.geo : gabarit && MODELES[type]) ? ':tripo' : '')] || null; // les places, les vitres et l'intérieur d'une voiture (plus bas)
  if (type === 'tokpa') { m = TOKPA_3D.geo ? new THREE.Mesh(TOKPA_3D.geo, TOKPA_3D.mat) : new THREE.Mesh(mergeColored(partsTokpa({ passagers: false })), matVeh); m.castShadow = true; } // le minibus de Zém Run (Tripo)
  else if (gabarit) m = gabarit.clone();
  else {
    // Les voitures dessinées : leurs vitres à part (VITRE), transparentes, pour qu'on voie qui est dedans.
    const pieces = c => (type === 'velo' ? partsVelo({ pedalier: false }) : type === 'citadine' ? partsCitadine(c || '#c9342c', { vitres: true }) : type === 'bolide' ? partsBolide(c || '#eceff2', { vitres: true }) : type === 'roadster' ? partsRoadster(c || '#dfe3e7', { vitres: true }) : type === 'voiture' || type === 'taxi' ? partsVoiture(type === 'taxi' ? '#f2c21b' : c || '#7a1f2b', { vitres: true }) : partsZem({ pilote: type === 'zem', carrosserie: c, chemise: '#f2c21b' }));
    dessin = c => mergeColored(pieces(c).filter(([, h]) => h !== VITRE));
    m = new THREE.Mesh(dessin(peinture || couleur), matVeh); m.castShadow = true; m.receiveShadow = true; // le vélo est vide : c'est le personnage du joueur qu'on voit dessus
    const vitres = pieces(couleur).filter(([, h]) => h === VITRE);
    if (vitres.length) m.add(new THREE.Mesh(mergeColored(vitres.map(([v]) => [v, '#000000'])), MAT_VITRE));
  }
  m.rotation.y = -Math.PI / 2 + (gabarit && MODELES[type] && DEMI_TOUR[type] ? Math.PI : 0); g.add(m); // avant +x → +z
  if (H?.miroir) m.scale.z = -1; // le taxi de Zém Run a son volant à droite : en miroir, il l'a à gauche, comme au Bénin
  if (H) g.add(amenager(H));
  scene.add(g);
  // Roues qui tournent, fumée, poussière (roues.js) : elles se posent dans le repère du véhicule, l'avant vers +x,
  // alors que le groupe a son avant en +z. Sans ce quart de tour, les quatre disques sortaient de chaque côté de la moto.
  let anim = null;
  if (type === 'moto' || type === 'zem') { const axe = new THREE.Group(); axe.rotation.y = -Math.PI / 2; g.add(axe); anim = animerMoto(axe, { parent: scene }); }
  const V = { type, D, g, x: 0, z: 0, y: 0, cap: 0, v: 0, km: 0, anim, selle: (gabarit && MODELES[type] && SELLES[type]) || D.selle, modele: m, dessin, couleur, peinture: null, habitacle: H };
  // Le vélo : son pédalier à part, qui tourne sous les pieds du cycliste (trajets.js, asseoirSur ; personnages.js, poserVelo).
  if (type === 'velo') { V.pedalier = new THREE.Mesh(mergeColored(partsPedalier()), matVeh); V.pedalier.position.set(PEDALIER.x, PEDALIER.y, 0); V.pedalier.castShadow = true; m.add(V.pedalier); }
  if (H?.vitres) vitrer(V, peinture);
  else if (peinture && gabarit && type !== 'zem') peindre(V, peinture); else V.peinture = peinture || null;
  return V;
}

// ---------- Repeindre son véhicule ----------
// Un véhicule dessiné en code (citadine, bolide, Roadster) se refait simplement dans la nouvelle couleur. La voiture et
// la moto Tripo, elles, n'ont qu'une texture : sur l'une comme sur l'autre, la carrosserie est le seul rouge franc
// (mesuré : vert et bleu sous 16 % du rouge, une fois en couleurs linéaires), quand vitres, pneus et chromes sont
// gris ou noirs, les feux orange et la peau du pilote tirent vers le jaune. Le nuanceur remplace donc ce rouge-là par
// la peinture, en gardant ses reflets et ses ombres (sa clarté, rapportée à celle d'un rouge moyen, 0,35).
const PEINTS = new Map(), ORIGINES = new WeakMap(); // un matériau par (matériau d'origine, couleur) : deux joueurs en bleu roi se le partagent
/** Le matériau d'origine `mat`, repeint de `couleur` et/ou percé à ses vitres (`Z` : ses uniformes, vitrer). */
function materiauPeint(mat, couleur, Z = null) {
  if (!couleur && !Z) return mat;
  const cle = `${mat.uuid}|${couleur || ''}|${Z ? 'v' : ''}`; let p = PEINTS.get(cle); if (p) return p;
  p = mat.clone(); const u = { value: new THREE.Color(couleur || '#000') }; // Color() passe le code en couleurs linéaires, comme la texture lue
  p.onBeforeCompile = sh => {
    sh.uniforms.uPeinture = u;
    if (couleur) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uPeinture;').replace('#include <map_fragment>', `#include <map_fragment>
  { vec3 c = diffuseColor.rgb; float r = max(c.r, 1e-4);
    float k = (1. - smoothstep(.12, .2, max(c.g, c.b) / r)) * (1. - smoothstep(.06, .1, (c.g - c.b) / r)) * smoothstep(.015, .04, c.r);
    diffuseColor.rgb = mix(c, min(uPeinture * (c.r / .35), vec3(1.)), k); }`);
    // Après la peinture dans le code, donc avant elle dans le nuanceur : c'est la texture d'origine qui dit où est la vitre (en
    // noir brillant, toute la carrosserie aurait passé pour une vitre). La vitre est dessinée à part (materiauVerre).
    if (Z) percer(sh, Z, 'if (vitreIci(diffuseColor.rgb)) discard;');
  };
  p.customProgramCacheKey = () => `peinture|${couleur ? 'p' : ''}|${Z ? 'v' : ''}`; // un seul programme pour toutes les couleurs : seule la variable change
  PEINTS.set(cle, p); return p;
}
/** Repeint un véhicule déjà posé ; `couleur` nulle : il retrouve sa couleur d'origine. */
export function peindre(V, couleur) {
  if (!V || (V.peinture || null) === (couleur || null)) return;
  V.peinture = couleur || null;
  if (V.dessin) { const vieille = V.modele.geometry; V.modele.geometry = V.dessin(couleur || V.couleur); vieille.dispose(); return; }
  V.modele.traverse(n => {
    if (!n.isMesh || n.userData.verre) return; // la vitre ne se peint pas
    if (!ORIGINES.has(n)) ORIGINES.set(n, n.material);
    n.material = materiauPeint(ORIGINES.get(n), couleur, V.habitacle?.vitres ? VITRES_U.get(ORIGINES.get(n)) : null);
  });
}

// ---------- Dedans : les places, les vitres, l'intérieur ----------
// « On ne voit pas le joueur dans le taxi » (testeur, 04/11, capture : un taxi jaune et vert qui roule, vide) : en voiture,
// le personnage était caché (siege() rendait null), et « le client n'apparaît pas non plus dans la voiture ». On le voit
// maintenant assis au volant, à GAUCHE — on roule à droite au Bénin —, ses passagers chacun à sa place : l'avant droite,
// puis les trois de l'arrière. Places, plafond, plancher et volant mesurés au rayon sur chaque modèle (le taxi Tripo de
// Zém Run, la voiture du joueur) ou relevés sur les pièces des voitures dessinées en code (vehicules.js), dans le repère du
// véhicule : la gauche vers +x, le haut vers +y, l'avant vers +z. Une place : [x, dessus de l'assise, z, plafond au-dessus
// de la tête]. L'ordre : 0 le conducteur, 1 l'avant droite, 2 l'arrière droite, 3 l'arrière gauche, 4 l'arrière milieu.
// `incline` : le dossier renversé (radians), dans les voitures basses, sinon aucune tête n'y tient ; `pied` : jusqu'où
// les pieds vont devant les fesses ; `miroir` : le modèle retourné de gauche à droite.
const cinq = (av, ar) => [av, [-av[0], ...av.slice(1)], [-ar[0], ...ar.slice(1)], ar, [0, ...ar.slice(1)]];
const deux = av => [av, [-av[0], ...av.slice(1)]];
const HABITACLES = {
  // Le taxi Tripo a son intérieur (sièges à 0,68 m, plancher à 0,50 m, toit intérieur à 1,57-1,62 m, volant à droite : on le
  // retourne). Ses vitres de côté sont ouvertes, comme celles des taxis de Cotonou ; le pare-brise et la lunette arrière
  // sont percés à leur plan, mesuré sur le toit (point de la vitre sous le toit et au ras du capot ou du coffre).
  'taxi:tripo': { miroir: true, places: cinq([.38, .68, .14, 1.56], [.44, .69, -.62, 1.59]), plancher: .5, volant: [.38, 1.04, .5], pied: .62,
    vitres: { zones: [[[-.72, 1.16, .28], [.72, 1.72, 1.25], [0, .825, .566, 1.546]], [[-.74, 1.34, -1.78], [.74, 1.72, -.96], [0, .842, -.539, 1.957]]], teinte: [.24, .5, 0] } }, // le joint du bas reste noir : percé, il s'effilochait
  // La voiture du joueur (Tripo) est une coque fermée, vitres teintées comprises : on perce tout ce qui est sombre et gris
  // entre le bas des vitres (1,12 m) et le toit, et l'on pose dedans un habitacle (bac sombre, sièges, tableau de bord, volant).
  'voiture:tripo': { places: cinq([.38, .55, 0, 1.57], [.42, .55, -.86, 1.52]), plancher: .45, volant: [.38, 1.1, .46], pied: .6,
    vitres: { zones: [[[-1.1, 1.12, -2.25], [1.1, 1.62, 1.4], null]], teinte: [.24, .55, 0] },
    interieur: { bac: [.72, .95, 1.12, -1.85, .95], dos: 1.42, dosAr: 1.32, tableau: [.62, 1.0, .95, 1.17] } }, // le bac va jusqu'au coffre, sous la lunette
  // Les voitures dessinées sont des blocs pleins jusqu'au bas des vitres : une plaque sombre fait le plancher visible.
  voiture: { places: cinq([.38, .6, .12, 1.6], [.42, .6, -.9, 1.6]), plancher: .4, volant: [.38, 1.18, .5], pied: .6,
    interieur: { plaque: [.79, 1.045, -1.38, .88], dos: 1.42, dosAr: 1.34, tableau: [.62, .88, 1.045, 1.18] } },
  citadine: { places: cinq([.37, .5, .08, 1.5], [.4, .5, -.78, 1.5]), plancher: .34, volant: [.37, 1.07, .45], pied: .58,
    interieur: { plaque: [.76, .935, -1.13, .89], dos: 1.32, dosAr: 1.25, tableau: [.62, .89, .935, 1.06] } },
  // Le bolide (verrière relevée à 1,18 m, vehicules.js) et la Roadster : deux places, assis bas et renversés.
  bolide: { places: deux([.33, .26, -.05, 1.15]), plancher: .2, volant: [.33, .86, .4], pied: .72, incline: .55,
    interieur: { plaque: [.68, .66, -1.0, .7], tableau: [.42, .7, .66, .8] } },
  roadster: { places: deux([.34, .24, -.1, 1.16]), plancher: .2, volant: [.34, .93, .36], pied: .72, incline: .6,
    interieur: { plaque: [.7, .865, -.95, .55], tableau: [.3, .6, .865, .96] } },
  // Le tokpa-tokpa Tripo : le chauffeur seul, assis haut derrière le pare-brise (de 1,82 m à z = 2,0 jusqu'à 2,37 m à z = 1,6),
  // le toit à 2,5 m. Ses vitres sont peintes en bleu ciel dans la texture : on perce celles de la cabine (pare-brise et deux
  // portières), et une cloison (le fond du bac) cache l'arrière, où les passagers ne sont pas dessinés.
  'tokpa:tripo': { places: [[.45, 1.1, 1.3, 2.38]], plancher: .78, volant: [.45, 1.58, 1.66], pied: .5,
    vitres: { zones: [[[-.96, 1.7, 1.45], [.96, 2.46, 2.15], [0, .588, .809, 2.688]], [[.75, 1.55, 1.3], [1.06, 2.42, 2.12], null], [[-1.06, 1.55, 1.3], [-.75, 2.42, 2.12], null]], teinte: [0, 0, 1] }, // les rétroviseurs, bleutés eux aussi, dépassent à 1,2 m : on les garde
    interieur: { bac: [.8, .75, 2.3, 1.12, 1.55], tableau: [1.55, 1.98, .75, 1.75] } }, // sous le toit bombé, qui descend à 2,35 m sur les bords
};
HABITACLES.taxi = HABITACLES.voiture; // le taxi dessiné : la voiture dessinée, en jaune
/** Combien de places compte le véhicule, conducteur compris : 5 dans une voiture, 2 dans les coupés et sur une moto. */
export const placesDe = V => V?.habitacle?.places.length ?? (V?.D.cache ? 1 : 2);
const MAT_VITRE = new THREE.MeshStandardMaterial({ color: '#1d2b34', roughness: .08, metalness: .25, transparent: true, opacity: .32, depthWrite: false });
const MAT_BAC = new THREE.MeshLambertMaterial({ color: '#232120', side: THREE.BackSide });
/** L'intérieur d'une voiture (repère du véhicule) : le plancher visible, les dossiers, le tableau de bord et le volant. */
function amenager(H) {
  const g = new THREE.Group(), I = H.interieur; if (!I) return g;
  const P = [], add = (geo, hex) => P.push([geo, hex]), sombre = '#262526', siege = '#3b3632', av = H.places[0], ar = H.places[2];
  // Un bac vu de l'intérieur (faces arrière) : par les vitres, on voit son fond et ses flancs, et rien de la rue au travers
  // de la coque — la voiture Tripo n'a pas d'intérieur, et ses faces ne se voient que du dehors.
  if (I.bac) { const [l, b, h, z0, z1] = I.bac, m = new THREE.Mesh(new THREE.BoxGeometry(2 * l, h - b, z1 - z0), MAT_BAC); m.position.set(0, (b + h) / 2, (z0 + z1) / 2); g.add(m); }
  const [l, sol, z0, z1] = I.plaque || [I.bac[0], I.bac[1], I.bac[3], I.bac[4]];
  if (I.plaque) add(B3(2 * l, .02, z1 - z0).translate(0, sol + .01, (z0 + z1) / 2), sombre);
  // Les dossiers, juste derrière le dos des personnages (qui recule jusqu'à 22 cm derrière le bassin) ; pas dans les coupés,
  // où l'on est renversé : le siège bas disparaît sous le flanc.
  if (I.dos) for (const s of [1, -1]) { add(B3(.5, I.dos - sol, .1).translate(s * av[0], (sol + I.dos) / 2, av[2] - .3), siege); add(B3(.26, .14, .08).translate(s * av[0], I.dos + .08, av[2] - .31), siege); }
  if (I.dosAr && H.places.length > 2) add(B3(2 * l - .08, I.dosAr - sol, .1).translate(0, (sol + I.dosAr) / 2, ar[2] - .32), siege);
  const [ta, tb, ty0, ty1] = I.tableau; add(B3(2 * l - .04, ty1 - ty0, tb - ta).translate(0, (ty0 + ty1) / 2, (ta + tb) / 2), sombre);
  // Le volant devant le conducteur, tourné vers lui.
  const [vx, vy, vz] = H.volant;
  add(new THREE.TorusGeometry(.17, .022, 6, 18).rotateX(.47).translate(vx, vy, vz), '#161617');
  const m = new THREE.Mesh(mergeColored(P), matVeh); m.receiveShadow = true; g.add(m);
  return g;
}
// Les vitres d'un modèle Tripo, percées dans sa texture : un texel est une vitre s'il est sombre et gris (pas la peinture
// jaune, verte ou rouge ; `teinte` [clarté, saturation], ou bleuté pour le tokpa-tokpa, [0, 0, 1]) et s'il est dans une
// des zones de vitres (boîte, et plan de la vitre à 6 cm près). La carrosserie y
// est trouée (materiauPeint), et une copie du modèle n'y dessine qu'un verre teinté, transparent (materiauVerre).
const VITRES_U = new WeakMap(); // matériau d'origine → ses uniformes (repère du véhicule, zones)
function percer(sh, Z, quoi) {
  Object.assign(sh.uniforms, Z);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uVeh;\nvarying vec3 vVeh;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvVeh = (uVeh * vec4(transformed, 1.)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform vec3 uBas[3]; uniform vec3 uHaut[3]; uniform vec4 uPlan[3]; uniform vec3 uTeinte; varying vec3 vVeh;
bool vitreIci(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  if (uTeinte.z > .5 ? c.b < max(c.r, c.g) * 1.06 : mx > uTeinte.x || mx - mn > uTeinte.y * mx + .004) return false;
  for (int i = 0; i < 3; i++) if (all(greaterThanEqual(vVeh, uBas[i])) && all(lessThanEqual(vVeh, uHaut[i])) && abs(dot(uPlan[i].xyz, vVeh) - uPlan[i].w) < .06) return true;
  return false;
}`).replace('#include <map_fragment>', `#include <map_fragment>\n${quoi}`);
}
const VERRES = new Map();
function materiauVerre(mat, Z) {
  let p = VERRES.get(mat.uuid); if (p) return p;
  p = mat.clone(); p.transparent = true; p.depthWrite = false; p.opacity = .34; p.roughness = .08; p.metalness = .25;
  p.onBeforeCompile = sh => percer(sh, Z, 'if (!vitreIci(diffuseColor.rgb)) discard;\ndiffuseColor.rgb = vec3(.035, .05, .06);');
  p.customProgramCacheKey = () => 'verre';
  VERRES.set(mat.uuid, p); return p;
}
function vitrer(V, peinture) {
  const H = V.habitacle, meshes = []; V.g.updateMatrixWorld(true);
  const inv = V.g.matrixWorld.clone().invert();
  V.modele.traverse(n => { if (n.isMesh) meshes.push(n); });
  for (const n of meshes) {
    if (!ORIGINES.has(n)) ORIGINES.set(n, n.material);
    const mat = ORIGINES.get(n);
    if (!VITRES_U.has(mat)) {
      const zone = i => H.vitres.zones[i] || [[1e3, 1e3, 1e3], [-1e3, -1e3, -1e3], null];
      VITRES_U.set(mat, {
        uVeh: { value: inv.clone().multiply(n.matrixWorld) }, // du modèle au repère du véhicule (le même pour toutes ses copies)
        uBas: { value: [0, 1, 2].map(i => new THREE.Vector3(...zone(i)[0])) }, uHaut: { value: [0, 1, 2].map(i => new THREE.Vector3(...zone(i)[1])) },
        uPlan: { value: [0, 1, 2].map(i => new THREE.Vector4(...(zone(i)[2] || [0, 0, 0, 0]))) }, uTeinte: { value: new THREE.Vector3(...H.vitres.teinte) },
      });
    }
    const Z = VITRES_U.get(mat);
    n.material = materiauPeint(mat, peinture, Z);
    const verre = new THREE.Mesh(n.geometry, materiauVerre(mat, Z)); verre.userData.verre = true; verre.renderOrder = 3; n.add(verre);
  }
  V.peinture = peinture || null;
}
export function retirerVehicule(V) { if (V) { scene.remove(V.g); V.anim?.liberer(); } } // les géométries sont partagées entre les copies : on ne les libère pas
export function placer(V, x, z, cap) { V.x = x; V.z = z; V.cap = cap; V.v = 0; V.y = V.sol = hauteur(x, z, 0); V.g.position.set(V.x, V.y, V.z); V.g.rotation.y = V.cap; }
/**
 * Où asseoir un personnage sur le véhicule (repère du véhicule). `place` : 0 (ou faux) le conducteur, vrai le passager (sur
 * une moto, derrière ; en voiture, l'avant droite), ou le numéro de la place en voiture (HABITACLES). Dans une voiture :
 * { voiture, x, y (l'assise), z, toit, plancher, volant (le conducteur seul), incline, pied } ; null : on ne le voit pas
 * (le tokpa-tokpa, qui n'a pas encore d'habitacle).
 */
export function siege(V, place = false) {
  const D = V.D, n = place === true ? 1 : place || 0, H = V.habitacle;
  if (H) { const p = H.places[Math.min(n, H.places.length - 1)]; return { voiture: true, place: n, x: p[0], y: p[1], z: p[2], toit: p[3], plancher: H.plancher, volant: n === 0 ? H.volant : null, incline: H.incline || 0, pied: n < 2 ? H.pied : .5 }; }
  if (D.cache) return null;
  return { y: V.selle[0] - .48, z: n ? D.arriere : V.selle[1] }; // .48 : hauteur du bassin d'un personnage assis
}

// ---------- Les routes : où l'on peut rouler ----------
const G = { cases: null, seg: null, ponts: null }, CS = 32;
const cle = (x, z) => Math.floor(x / CS) + ',' + Math.floor(z / CS);
/**
 * Les tronçons de route rangés par cases de 32 m. Un tronçon traverse souvent plusieurs cases : on n'y range
 * que son numéro, et ses cinq nombres tiennent une seule fois dans G.seg. Avant, chaque case gardait sa propre
 * copie du tableau [ax, az, bx, bz, hw] — plus de cent octets chacune, contre huit pour un entier. Mesuré au
 * profileur de Chrome : 16,7 Mo pour ce seul index, sur les 368 Mo qui font planter l'onglet des téléphones.
 */
function indexer() {
  if (G.cases) return;
  const g = new Map(), p = new Map(), seg = [];
  const ranger = (m, ax, az, bx, bz, r, e) => {
    for (let cx = Math.floor((Math.min(ax, bx) - r) / CS); cx <= Math.floor((Math.max(ax, bx) + r) / CS); cx++)
      for (let cz = Math.floor((Math.min(az, bz) - r) / CS); cz <= Math.floor((Math.max(az, bz) + r) / CS); cz++) { const k = cx + ',' + cz; let l = m.get(k); if (!l) m.set(k, l = []); l.push(e); }
  };
  roadLines.forEach(L => {
    if (L.cls === 6 || L.cls >= 10) return; // ni les sentiers, ni les pistes de l'aéroport
    const hw = (L.w || 6) / 2 + 1.1; // la chaussée et le bord du trottoir
    for (let k = 1; k < L.pts.length; k++) {
      const [ax, az] = L.pts[k - 1], [bx, bz] = L.pts[k], n = seg.length / 5;
      seg.push(ax, az, bx, bz, hw); ranger(g, ax, az, bx, bz, hw, n);
    }
  });
  // Les ponts sont une poignée de tabliers : ils gardent leurs tableaux, ça ne pèse rien.
  for (const T of TABLIERS) for (let j = 1; j < T.pts.length; j++) { const [ax, az] = T.pts[j - 1], [bx, bz] = T.pts[j]; ranger(p, ax, az, bx, bz, T.w / 2 + 1, [ax, az, bx, bz, T.w / 2 + .6, T.h[j - 1], T.h[j]]); }
  G.cases = g; G.seg = new Float32Array(seg); G.ponts = p;
}
const projeter = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); return [Math.hypot(ax + dx * t - x, az + dz * t - z), t]; };
/** Vrai si l'on peut rouler en (x, z) : sur une route, hors des bâtiments et des terre-pleins. */
export function surRoute(x, z) {
  indexer();
  const l = G.cases.get(cle(x, z)); if (!l) return false;
  const S = G.seg;
  for (const n of l) { const o = n * 5; if (projeter(x, z, S[o], S[o + 1], S[o + 2], S[o + 3])[0] <= S[o + 4]) return !dansBatiment(x, z) && !dansTerrePlein(x, z, 0) && !dansObstacleRue(x, z, .2); } // ni bâtiment, ni terre-plein central, ni mur de parcelle
  return false;
}
/** Hauteur sous les roues : le tablier d'un pont si l'on y est monté (par sa rampe), sinon le sol. */
export function hauteur(x, z, yPrec) {
  indexer();
  const l = G.ponts.get(cle(x, z)); if (!l) return 0;
  let best = -1;
  for (const [ax, az, bx, bz, hw, h0, h1] of l) { const [d, t] = projeter(x, z, ax, az, bx, bz); if (d <= hw) { const h = h0 + (h1 - h0) * t; if (Math.abs(h - yPrec) < 1.6 && h > best) best = h; } }
  return best >= 0 ? best : 0; // trop haut par rapport à là où l'on est : on passe dessous
}

/** Vrai si un pont (tablier ou rampe) passe à moins de r mètres de (x, z) : on n'y pose pas un arrêt de bus. */
export function pontPres(x, z, r = 20) {
  indexer();
  for (let cx = Math.floor((x - r) / CS); cx <= Math.floor((x + r) / CS); cx++) for (let cz = Math.floor((z - r) / CS); cz <= Math.floor((z + r) / CS); cz++)
    for (const [ax, az, bx, bz, hw] of G.ponts.get(cx + ',' + cz) || []) if (projeter(x, z, ax, az, bx, bz)[0] <= hw + r) return true;
  return false;
}

// ---------- Conduire ----------
/**
 * Une image de conduite. av : accélérateur (+1) ou frein puis marche arrière (−1) ; tour : volant (+1 à gauche).
 * Renvoie 'choc' si l'on vient de buter contre un mur ou un trottoir haut, sinon null.
 */
export function piloter(V, av, tour, dt, { panne = false, aide = false } = {}) {
  if (V.vol) return voler(V, av, tour, dt);
  if (V.redresse !== undefined) { // remis dans le sens de la rue (degager) : il pivote sur place, puis on reprend la main
    const e = angle(V.redresse - V.cap); V.cap += Math.sign(e) * Math.min(Math.abs(e), 3.5 * dt); V.v = 0;
    if (Math.abs(e) < .02) delete V.redresse;
    return avancer(V, dt, true);
  }
  const D = V.D, vmax = panne ? 1.2 : D.vmax;
  if (av > .05) V.v = V.v < -.2 ? Math.min(0, V.v + D.frein * dt) : Math.min(vmax, V.v + D.accel * av * dt * Math.max(.15, 1 - V.v / (vmax * 1.05)));
  else if (av < -.05) V.v = V.v > .2 ? Math.max(0, V.v - D.frein * -av * dt) : Math.max(-D.recul, V.v - D.accel * .6 * -av * dt);
  else V.v -= Math.sign(V.v) * Math.min(Math.abs(V.v), 1.4 * dt); // roue libre
  if (V.v > vmax) V.v = Math.max(vmax, V.v - D.frein * dt);
  // Volant : sans effet à l'arrêt, plus doux à pleine vitesse ; en marche arrière, l'avant part de l'autre côté.
  const a = Math.abs(V.v), k = Math.min(1, a / 3) * (1 - .45 * Math.min(1, a / D.vmax));
  V.cap += tour * D.braquage * k * Math.sign(V.v || 1) * dt;
  if (aide && Math.abs(tour) < .35 && V.v > 1.5) suivreRue(V, dt);
  return avancer(V, dt, true);
}
/** Le tronçon de route le plus proche sous (x, z) : son sens (cap), la distance à son axe, sa demi-largeur avec le trottoir, le point de l'axe le plus proche. */
export function sensRoute(x, z) {
  indexer();
  const l = G.cases.get(cle(x, z)); if (!l) return null;
  const S = G.seg; let best = null;
  for (const n of l) {
    const o = n * 5, ax = S[o], az = S[o + 1], bx = S[o + 2], bz = S[o + 3], [d, t] = projeter(x, z, ax, az, bx, bz);
    if (d <= S[o + 4] && (!best || d < best.d)) best = { cap: Math.atan2(bx - ax, bz - az), d, hw: S[o + 4], px: ax + (bx - ax) * t, pz: az + (bz - az) * t };
  }
  return best;
}
// Au doigt, la moto suit la rue d'elle-même tant qu'on ne tourne pas franchement : « la moto bouge plus ou c'est dur de
// guider » (Honey, 03/11) — mesuré au doigt : 82° de virage en 3 s dans une ruelle, puis le mur. Elle se remet dans l'axe
// de la rue (dans un sens ou dans l'autre) et s'écarte du trottoir quand elle le frôle. En travers d'un carrefour, ou dès
// qu'on pousse le rond sur le côté, c'est le joueur qui tourne.
function suivreRue(V, dt) {
  const r = sensRoute(V.x, V.z); if (!r) return;
  let e = angle(r.cap - V.cap); if (Math.abs(e) > Math.PI / 2) e = angle(e + Math.PI);
  if (Math.abs(e) > .6) return;
  let cible = V.cap + e;
  if (r.d > r.hw - 1.6) cible += Math.max(-.25, Math.min(.25, angle(Math.atan2(r.px - V.x, r.pz - V.z) - cible))); // contre le trottoir : un peu vers le milieu
  V.cap += angle(cible - V.cap) * Math.min(1, dt * 2.5);
}
/**
 * Bloqué contre un mur ou un trottoir, gaz ouvert : le véhicule pivote sur place vers la direction libre la plus proche,
 * le sens de la rue d'abord. Il fallait penser à tirer le rond vers le bas pour reculer, puis tourner ; mesuré au doigt :
 * 10 s gaz à fond contre le mur, 0 m parcouru. Faux s'il n'y a nulle part où repartir.
 */
export function degager(V) {
  if (V.vol || V.redresse !== undefined) return false;
  const c0 = V.cap, v0 = V.v, r = sensRoute(V.x, V.z), rue = r ? [r.cap, r.cap + Math.PI].sort((a, b) => Math.abs(angle(a - c0)) - Math.abs(angle(b - c0))) : [];
  const autour = []; for (let k = 1; k <= 12; k++) autour.push(c0 + k * Math.PI / 12, c0 - k * Math.PI / 12);
  V.v = 1; // passe() regarde l'avant
  const libre = cap => { V.cap = cap; for (const d of [1.5, 3, 4.5]) if (!passe(V, V.x + Math.sin(cap) * d, V.z + Math.cos(cap) * d)) return false; return true; };
  let ok = null; for (const cap of [...rue, ...autour]) if (Math.abs(angle(cap - c0)) > .05 && libre(cap)) { ok = cap; break; }
  V.cap = c0; V.v = v0;
  if (ok === null) return false;
  V.redresse = c0 + angle(ok - c0); return true;
}
// Le centre sur la route, et l'avant (l'arrière en marche arrière) avec ses deux coins hors des murs et des
// bâtiments : avant, seul le centre comptait, et tout le capot rentrait dans la clôture.
const horsMur = (x, z, vole = false) => !dansBatiment(x, z) && !dansObstacleRue(x, z, .05) && (vole || hauteurSol(x, z) < .25); // ni sur des marches (sols.js) ; en vol, on passe au-dessus
// Les autres véhicules : toute la caisse compte (les quatre coins, le milieu des côtés, les deux bouts), pas seulement
// l'avant — en tournant, l'arrière et les flancs entraient dans les voitures arrêtées. Et si l'on est déjà dedans
// (posé sur une voiture, ou serré par elle), on peut toujours s'en écarter : avant, tout mouvement était refusé tant
// qu'on la touchait, et la Roadster restait coincée entre deux voitures, « ni monter, ni avancer » (26/10).
const CAISSE = [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1], [1, 0], [-1, 0]];
function dansLeTrafic(V, x, z) {
  const L = (V.D.long ?? 2) / 2 * .92, W = (V.D.larg ?? .8) / 2 * .9, sx = Math.sin(V.cap), cz = Math.cos(V.cap);
  let p = 0;
  for (const [a, b] of CAISSE) p = Math.max(p, dansCirculation(x + sx * a * L + cz * b * W, z + cz * a * L - sx * b * W, .05));
  return p;
}
function passe(V, x, z) {
  // Un vélo n'est pas tenu à la chaussée : il roule partout où l'on marche — l'esplanade, les trottoirs —,
  // comme à Cotonou. Sans ça, celui qu'on loue sur l'esplanade de l'Amazone ne pouvait pas avancer d'un mètre.
  if (!surRoute(x, z) && !(V.D.pedale && pietonOk(x, z))) return false;
  const L = (V.D.long ?? 2) / 2 * .92 * (Math.sign(V.v) || 1), W = (V.D.larg ?? .8) / 2 * .9, sx = Math.sin(V.cap), cz = Math.cos(V.cap), fx = x + sx * L, fz = z + cz * L;
  const vole = (V.alt || 0) > 1.5;
  if (!(horsMur(fx, fz, vole) && horsMur(fx + cz * W, fz - sx * W, vole) && horsMur(fx - cz * W, fz + sx * W, vole))) return false;
  if (vole) return true; // en vol, on passe au-dessus des zémidjans et des voitures
  const p = dansLeTrafic(V, x, z); return p === 0 || p < dansLeTrafic(V, V.x, V.z) - 1e-3;
}
function avancer(V, dt, contraint) {
  const nx = V.x + Math.sin(V.cap) * V.v * dt, nz = V.z + Math.cos(V.cap) * V.v * dt; let choc = null;
  if (!contraint || passe(V, nx, nz)) { V.km += Math.hypot(nx - V.x, nz - V.z) / 1000; V.x = nx; V.z = nz; }
  else { if (Math.abs(V.v) > 3) choc = 'choc'; V.v *= Math.abs(V.v) > .3 ? -.2 : 0; }
  if (V.vol) { V.sol = V.vol.base; V.alt = V.vol.alt; } // en vol, la hauteur vient des propulseurs (voler)
  else { V.sol = hauteur(V.x, V.z, V.sol ?? V.y); V.alt = 0; } // le tablier d'un pont, sinon le sol
  V.y = V.sol + V.alt;
  V.g.position.set(V.x, V.y, V.z); V.g.rotation.y = V.cap;
  if (V.anim) { const a = (V.v - (V.vAvant ?? V.v)) / Math.max(dt, .001); V.vAvant = V.v; V.anim.maj(V.v, dt, a > .5); }
  return choc;
}
// ---------- Les propulseurs de la Roadster ----------
// « Est-ce que ma Tesla Roadster peut monter en haut comme la vraie ? » (Murielle, 26/10) : d'abord un bond de 4,5 m,
// le « pack SpaceX » annoncé pour la vraie. Puis : « je dois aller plus haut que ça, c'est comme un avion, je peux
// voler en haut pour aller à ma destination ». Elle décolle donc à la verticale au-dessus de sa rue, monte à 110 m
// — plus haut que tout ce qui est bâti à Cotonou (80 m au plus) —, vole où l'on veut, et se pose à la verticale sur
// une route, alignée sur la rue : elle ne passe jamais au travers d'un mur. En vol, pas de marche arrière, mais on
// peut faire du sur-place. Phases : monte → croisiere → approche (vers le point de pose) → descend.
const VOL = { croisiere: 110, montee: 22, descente: 18, vmax: 70, accel: 14, frein: 18, virage: 1, recharge: 3 };
export const peutDecoller = V => !!V?.D.propulseurs && !V.vol && performance.now() > (V.rechargeT || 0);
export function decoller(V) { if (!peutDecoller(V)) return false; V.vol = { phase: 'monte', alt: 0, base: V.sol || 0, t: 0, roulis: 0, cible: null }; flammes(V).visible = true; return true; }
/** En vol et libre de ses mouvements (ni en train de monter ni de se poser) : on peut choisir où atterrir. */
export const enCroisiere = V => V?.vol?.phase === 'croisiere' || V?.vol?.phase === 'approche';
/** Va se poser sur la route la plus proche de (x, z) — par défaut, sous soi. Faux s'il n'y a nulle part où se poser. */
export function atterrir(V, x = V.x, z = V.z, rayon = 220) {
  if (!enCroisiere(V)) return false;
  const p = pointDePose(V, x, z, rayon); if (!p) return false;
  V.vol.phase = 'approche'; V.vol.cible = p; return true;
}
let BORNES = null; // le rectangle des routes, à 400 m près : on ne s'envole pas au-dessus de l'océan sans fin
function bornes() {
  if (BORNES) return BORNES;
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const L of roadLines) for (const [x, z] of L.pts) { if (x < b[0]) b[0] = x; if (z < b[1]) b[1] = z; if (x > b[2]) b[2] = x; if (z > b[3]) b[3] = z; }
  return (BORNES = [b[0] - 400, b[1] - 400, b[2] + 400, b[3] + 400]);
}
const angle = a => Math.atan2(Math.sin(a), Math.cos(a));
function voler(V, av, tour, dt) {
  const W = V.vol, borne = (v, a) => Math.max(-a, Math.min(a, v));
  W.t += dt;
  let contraint = false, poussee = .8;
  if (W.phase === 'monte') {
    // À la verticale de sa rue : on freine en montant, et tant qu'on monte, la route et les murs nous tiennent.
    V.v *= Math.exp(-dt * 2.5); V.cap += tour * VOL.virage * dt; contraint = true; poussee = 1.3;
    W.alt = Math.min(VOL.croisiere, W.alt + VOL.montee * Math.min(1, .3 + W.alt / 15) * dt);
    if (W.alt >= VOL.croisiere) { W.phase = W.ailleurs ? 'approche' : 'croisiere'; W.cible = W.ailleurs || null; W.ailleurs = null; } // remonté d'une place prise : on file vers la suivante
  } else if (W.phase === 'approche' && (Math.abs(av) > .3 || Math.abs(tour) > .3)) { W.phase = 'croisiere'; W.cible = null; } // on reprend les commandes
  if (W.phase === 'croisiere') {
    if (av > .05) V.v = Math.min(VOL.vmax, V.v + VOL.accel * av * dt);
    else if (av < -.05) V.v = Math.max(0, V.v - VOL.frein * -av * dt);
    else V.v = Math.max(0, V.v - 2 * dt);
    V.cap += tour * VOL.virage * dt;
  } else if (W.phase === 'approche') { // pilote automatique jusqu'au-dessus du point de pose
    const [cx, cz] = W.cible, d = Math.hypot(cx - V.x, cz - V.z), e = angle(Math.atan2(cx - V.x, cz - V.z) - V.cap);
    if (d > 40) { // de loin : on vire vers le point (plus vite si on lui tourne le dos) et l'on file droit dessus
      V.cap += borne(e, (Math.abs(e) > 1 ? 2 : 1.2) * dt);
      const voulue = Math.min(VOL.vmax, d * .6) * Math.max(.15, Math.cos(e));
      V.v += borne(voulue - V.v, (voulue > V.v ? VOL.accel : VOL.frein) * dt);
    } else { // les 40 derniers mètres : on glisse droit au-dessus du point, quel que soit le cap (elle tournait en rond à 7 km/h)
      W.glisse = Math.max(4, Math.min(W.glisse ?? V.v, d * 1.2));
      const pas = Math.min(d, W.glisse * dt); V.x += (cx - V.x) / (d || 1) * pas; V.z += (cz - V.z) / (d || 1) * pas; V.v = 0;
      if (d - pas < .05) { V.x = cx; V.z = cz; W.phase = 'descend'; W.glisse = null; }
    }
  } else if (W.phase === 'descend') { // à la verticale, en s'alignant sur la rue
    V.v = 0; V.cap += angle(W.cible[2] - V.cap) * (1 - Math.exp(-dt * 2)); poussee = .6;
    // Pas sur une voiture : à 5 m, on attend en l'air que la place soit libre (la circulation passe dessous). Une
    // place qui ne se libère pas en 6 s (un embouteillage) : on remonte et l'on va se poser un peu plus loin.
    const occupe = W.alt <= 5 && dansLeTrafic(V, V.x, V.z) > 0;
    W.attente = occupe ? (W.attente || 0) + dt : 0;
    if (!occupe) W.alt = Math.max(0, W.alt - Math.min(VOL.descente, 1.5 + W.alt * .8) * dt); // on ralentit en approchant du sol
    if (W.attente > 6) { W.attente = 0; W.ailleurs = pointDePose(V, V.x + Math.sin(V.cap) * 40, V.z + Math.cos(V.cap) * 40, 120, [V.x, V.z]); W.phase = 'monte'; }
  }
  W.base *= Math.exp(-dt * 1.5); // décollé d'un pont : on rejoint la hauteur du sol pendant le vol (pointDePose : jamais sur un pont)
  const tourne = W.phase === 'croisiere' ? tour : W.phase === 'approche' ? borne(angle(Math.atan2(W.cible[0] - V.x, W.cible[1] - V.z) - V.cap), 1) : 0;
  W.roulis += (-tourne * Math.min(1, V.v / 20) * .35 - W.roulis) * (1 - Math.exp(-dt * 3)); // elle s'incline dans les virages
  for (const f of flammes(V).children) f.scale.set(1, poussee * (.8 + Math.random() * .4), 1);
  let choc = null;
  if (W.phase === 'descend' && W.alt <= 0) { // posée
    V.vol = null; V.rechargeT = performance.now() + VOL.recharge * 1000; flammes(V).visible = false; V.g.rotation.z = 0;
  } else {
    W.alt += W.phase === 'croisiere' ? Math.sin(W.t * 1.7) * .25 * dt : 0;
    choc = avancer(V, dt, contraint);
    if (!contraint) { const b = bornes(); V.x = Math.max(b[0], Math.min(b[2], V.x)); V.z = Math.max(b[1], Math.min(b[3], V.z)); }
    V.g.rotation.z = W.roulis; return choc;
  }
  return avancer(V, 0, false);
}
/** Où poser la Roadster près de (x, z) : sur l'axe d'une route, ni sur un pont ni dessous, avec la place pour la
 *  caisse, et dans le sens de la rue le plus proche de son cap. [x, z, cap], ou null. */
export function pointDePose(V, x, z, rayon = 220, sauf = null) {
  indexer();
  const S = G.seg, vus = new Set(), cands = [];
  for (let cx = Math.floor((x - rayon) / CS); cx <= Math.floor((x + rayon) / CS); cx++) for (let cz = Math.floor((z - rayon) / CS); cz <= Math.floor((z + rayon) / CS); cz++) for (const n of G.cases.get(cx + ',' + cz) || []) {
    if (vus.has(n)) continue; vus.add(n);
    const o = n * 5, ax = S[o], az = S[o + 1], dx = S[o + 2] - ax, dz = S[o + 3] - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(.1, Math.min(.9, ((x - ax) * dx + (z - az) * dz) / l2)), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
    if (d > rayon) continue;
    let cap = Math.atan2(dx, dz); if (Math.cos(cap - V.cap) < 0) cap += Math.PI;
    cands.push([d, px, pz, cap]);
  }
  cands.sort((a, b) => a[0] - b[0]);
  for (const [, px, pz, cap] of cands.slice(0, 80)) if ((!sauf || Math.hypot(px - sauf[0], pz - sauf[1]) > 15) && assezDePlace(V, px, pz, cap)) return [px, pz, cap];
  return null;
}
function assezDePlace(V, x, z, cap) {
  if (hauteur(x, z, 0) > 0 || pontPres(x, z, 3)) return false;
  const L = V.D.long / 2 + .3, W = V.D.larg / 2 + .3, sx = Math.sin(cap), cz = Math.cos(cap);
  for (const [a, b] of [[0, 0], [L, W], [L, -W], [-L, W], [-L, -W]]) { const px = x + sx * a + cz * b, pz = z + cz * a - sx * b; if (!surRoute(px, pz) || hauteurSol(px, pz) >= .25) return false; }
  return true;
}
/**
 * Peut-on partir d'ici, au cap `cap`, avec un véhicule de gabarit D : sa caisse et `devant` mètres droit devant, sur
 * `cote` mètres de chaque côté, tout sur la route, sans mur, bâtiment, voiture garée de la rue ni marche (horsMur), ni
 * véhicule de la circulation (dansCirculation) — les épreuves mêmes de passe(), quand on roule. `gares` : les véhicules
 * garés des autres joueurs, qui ne sont dans E.circulation que pendant l'image du salon, pas lors d'un clic sur un menu.
 * Pour poser le véhicule du patron (metiers.js) ailleurs que contre un taxi arrêté (testeur, 03/11).
 */
export function departLibre(D, x, z, cap, { devant = 6, cote = 1.2, gares = [] } = {}) {
  const s = Math.sin(cap), c = Math.cos(cap), L = (D.long ?? 2) / 2;
  const garee = (px, pz) => gares.some(G => { const dx = px - G.x, dz = pz - G.z, gs = Math.sin(G.cap), gc = Math.cos(G.cap); return Math.abs(dx * gs + dz * gc) < G.D.long / 2 + .05 && Math.abs(dx * gc - dz * gs) < G.D.larg / 2 + .05; });
  for (let a = -L; a <= L + devant; a += .5) for (const b of [-cote, 0, cote]) {
    const px = x + s * a + c * b, pz = z + c * a - s * b;
    if (!surRoute(px, pz) || !horsMur(px, pz) || dansCirculation(px, pz, .05) > 0 || garee(px, pz)) return false;
  }
  return true;
}
// Quatre jets bleus sous la caisse, créés au premier vol.
const FLAMME = { geo: null, mat: null };
function flammes(V) {
  if (V.flammes) return V.flammes;
  FLAMME.geo ??= new THREE.ConeGeometry(.24, 1.5, 10, 1, true).rotateX(Math.PI).translate(0, -.75, 0); // pointe vers le bas
  FLAMME.mat ??= new THREE.MeshBasicMaterial({ color: '#3fb4ff', transparent: true, opacity: .78, depthWrite: false }); // bleu franc : en mélange additif, en plein jour, les jets sortaient blancs
  const g = new THREE.Group(), x = V.D.larg / 2 - .35, z = V.D.long / 2 - .7;
  for (const [a, b] of [[x, z], [-x, z], [x, -z], [-x, -z]]) { const m = new THREE.Mesh(FLAMME.geo, FLAMME.mat); m.position.set(a, .28, b); g.add(m); }
  g.visible = false; V.g.add(g); return (V.flammes = g);
}
/** Point du chemin à `dist` mètres plus loin que (k, t) (segment pts[k-1] → pts[k], fraction t) ; et la distance qui restait jusqu'au bout. */
function leLong(pts, k, t, dist) {
  let [px, pz] = [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t], parcouru = 0;
  for (; k < pts.length; k++) {
    const l = Math.hypot(pts[k][0] - px, pts[k][1] - pz);
    if (parcouru + l >= dist) { const f = (dist - parcouru) / (l || 1); return [px + (pts[k][0] - px) * f, pz + (pts[k][1] - pz) * f, dist]; }
    parcouru += l; [px, pz] = pts[k];
  }
  return [px, pz, parcouru];
}
/**
 * Le zém (ou tout véhicule sans joueur au guidon) suit un chemin { pts, i } ; vrai à l'arrivée (arrêté).
 * On vise un point du chemin 3 à 9 m devant soi (plus loin quand on roule vite), à partir de l'endroit du chemin
 * le plus proche : on suit ainsi la rue, virages compris. Avant, on visait le point suivant du tracé, parfois des
 * dizaines de mètres après un virage, et le zém coupait le coin à travers les maisons.
 */
export function suivreChemin(V, P, dt, vmax = V.D.vmax) {
  const pts = P.pts; if (pts.length < 2) { V.v = 0; return true; }
  let k0 = Math.max(1, P.i), bk = k0, bt = 0, bd = Infinity; // où l'on est sur le chemin (jamais en arrière)
  for (let k = k0; k < Math.min(pts.length, k0 + 8); k++) {
    const [ax, az] = pts[k - 1], ux = pts[k][0] - ax, uz = pts[k][1] - az, l2 = ux * ux + uz * uz || 1;
    const t = THREE.MathUtils.clamp(((V.x - ax) * ux + (V.z - az) * uz) / l2, 0, 1), d = Math.hypot(ax + ux * t - V.x, az + uz * t - V.z);
    if (d < bd - .01) { bd = d; bk = k; bt = t; }
  }
  P.i = bk;
  const [tx, tz] = leLong(pts, bk, bt, THREE.MathUtils.clamp(2.5 + Math.abs(V.v) * .4, 3, 9));
  let da = Math.atan2(tx - V.x, tz - V.z) - V.cap; da = Math.atan2(Math.sin(da), Math.cos(da));
  V.cap += THREE.MathUtils.clamp(da, -2 * dt, 2 * dt);
  // Pleine vitesse en ligne droite ; on ralentit avant un virage, vu 15 à 45 m devant (plus loin quand on va vite).
  const [fx, fz] = leLong(pts, bk, bt, 15 + Math.abs(V.v) * 1.5);
  let dv = Math.atan2(fx - V.x, fz - V.z) - V.cap; dv = Math.atan2(Math.sin(dv), Math.cos(dv));
  const droit = Math.max(0, Math.cos(Math.max(Math.abs(da), Math.abs(dv)))) ** 3;
  const reste = leLong(pts, bk, bt, Infinity)[2] + bd; // le long du chemin jusqu'au bout
  const voulue = Math.min(vmax, Math.abs(da) > Math.PI / 2 ? 2.2 : 3.5 + (vmax - 3.5) * droit, Math.max(2, reste * .8)); // demi-tour au pas ; et on freine pour s'arrêter au bout
  V.v += THREE.MathUtils.clamp(voulue - V.v, -8 * dt, D_ACCEL * dt);
  if (reste < 2.5) { V.v = Math.max(0, V.v - 8 * dt); avancer(V, dt, false); return V.v === 0; }
  avancer(V, dt, false); return false;
}

// ---------- Itinéraires et GPS ----------
/** Chemin par les routes de (x, z), en regardant vers `cap`, jusqu'à (xb, zb) : [[x, z], …] ou null. */
/** Le segment (a → b) est-il libre pour un véhicule de demi-largeur r : ni bâtiment, ni mur, portail ou maison de rue.js ? */
export function segmentLibre(ax, az, bx, bz, r = .6) {
  const l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / .5));
  for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n; if (dansBatiment(x, z) || dansObstacleRue(x, z, r)) return false; }
  return true;
}
export function itineraire(x, z, cap, xb, zb) {
  construireReseau();
  const pts = itineraireCourt(x, z, x + Math.sin(cap) * 12, z + Math.cos(cap) * 12, [[xb, zb]], 300);
  // Dernier bout, hors de la route : jusqu'à la porte, la cour, le sable de la plage, seulement s'il n'y a ni mur ni bâtiment
  // entre les deux (sinon le véhicule s'arrête au bord de la route, et l'on finit à pied).
  if (pts) { const f = pts[pts.length - 1]; if (Math.hypot(f[0] - xb, f[1] - zb) > 4 && segmentLibre(f[0], f[1], xb, zb)) pts.push([xb, zb]); }
  return pts && sansAllerRetour(pts);
}
// Pas d'aller-retour dans un chemin : le carrefour devant soi quand la route part derrière, le dernier carrefour quand la
// porte est déjà passée, les points en double. Le véhicule fait demi-tour tout de suite ; sinon, partagé entre l'aller et
// le retour, il tournait sur place autour du carrefour (vu en arrivant à la Haie Vive).
function sansAllerRetour(pts) {
  for (let i = 1; i < pts.length - 1;) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], [cx, cz] = pts[i + 1], ux = bx - ax, uz = bz - az, vx = cx - bx, vz = cz - bz, lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
    if (lu < .5 || lv < .5 || (ux * vx + uz * vz) / (lu * lv) < -.85) { pts.splice(i, 1); if (i > 1) i--; } else i++;
  }
  return pts;
}
export const longueur = pts => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
// Le chemin à suivre : des chevrons blancs sur un fond bleu, peints au sol et qui défilent vers la
// destination. Un chevron tous les PAS mètres ; la texture est partagée par tous les rubans, et c'est son
// décalage qui les anime tous d'un coup (majRuban).
const PAS_CHEVRON = 2.4;
let texChevron = null;
function chevrons() {
  if (texChevron) return texChevron;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(24,116,198,.5)'; c.fillRect(0, 0, 64, 64);
  c.strokeStyle = 'rgba(255,255,255,.92)'; c.lineWidth = 12; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(7, 46); c.lineTo(32, 20); c.lineTo(57, 46); c.stroke(); // la pointe vers l'avant
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return (texChevron = t);
}
/** Ruban posé sur la route, du véhicule (ou de ses pieds) jusqu'à la destination. */
export function ruban(pts) {
  const pos = [], uv = [], idx = [], w = .85;
  let l = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], ln = Math.hypot(dx, dz) || 1, nx = -dz / ln * w, nz = dx / ln * w;
    const y = hauteur(pts[i][0], pts[i][1], 0) + .22;
    pos.push(pts[i][0] + nx, y, pts[i][1] + nz, pts[i][0] - nx, y, pts[i][1] - nz);
    uv.push(0, l / PAS_CHEVRON, 1, l / PAS_CHEVRON); // v court le long du chemin : les chevrons ne s'étirent pas
    if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: chevrons(), transparent: true, opacity: .92, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  m.renderOrder = 4; scene.add(m); return m;
}
/** Fait défiler les chevrons vers la destination (une seule texture pour tous les rubans). */
export function majRuban(dt) { if (texChevron) texChevron.offset.y = (texChevron.offset.y - dt * .55) % 1; }
export function retirerRuban(m) { if (m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } }
/** Distance restante le long du chemin depuis (x, z). */
export function reste(pts, x, z) {
  // Distance au segment le plus proche, et non au sommet le plus proche : sur une rue droite, deux nœuds sont
  // parfois à 80 m l'un de l'autre, et l'on se croyait à 40 m de son itinéraire en roulant pile dessus. Le GPS
  // ne pouvait donc se recalculer qu'au-delà d'un écart énorme, et le kilométrage restant sautait d'un nœud à
  // l'autre (un testeur : « il ne se met pas à jour en fonction de notre position »).
  if (!pts.length) return { ecart: Infinity, m: 0 };
  if (pts.length === 1) { const d = Math.hypot(pts[0][0] - x, pts[0][1] - z); return { ecart: d, m: d }; }
  let bi = 0, bd = Infinity, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], ux = pts[i + 1][0] - ax, uz = pts[i + 1][1] - az, l2 = ux * ux + uz * uz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / l2)) : 0;
    const d = Math.hypot(ax + ux * t - x, az + uz * t - z);
    if (d < bd) { bd = d; bi = i; bt = t; }
  }
  const [ax, az] = pts[bi], px = ax + (pts[bi + 1][0] - ax) * bt, pz = az + (pts[bi + 1][1] - az) * bt;
  return { ecart: bd, m: bd + Math.hypot(pts[bi + 1][0] - px, pts[bi + 1][1] - pz) + longueur(pts.slice(bi + 1)) };
}

// ---------- Stations-service (les 64 d'OpenStreetMap), construites quand on approche ----------
const ST = { liste: [], faites: new Map() };
export function initStations(stations) { ST.liste = stations || []; chargerVehicules(); }
function totem(nom) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 512; const c = cv.getContext('2d');
  c.fillStyle = '#1f3d4a'; c.fillRect(0, 0, 256, 512); c.fillStyle = '#f5c21b'; c.fillRect(0, 0, 256, 110);
  c.fillStyle = '#1f3d4a'; c.font = '800 34px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  nom.split(' ').reduce((l, m) => { const d = l[l.length - 1]; if ((d + ' ' + m).length > 13 && d) l.push(m); else l[l.length - 1] = (d + ' ' + m).trim(); return l; }, ['']).slice(0, 2).forEach((l, i, a) => c.fillText(l, 128, 55 + (i - (a.length - 1) / 2) * 38, 240));
  c.fillStyle = '#fff'; c.font = '700 36px system-ui, sans-serif'; c.fillText('SUPER', 128, 190); c.fillStyle = '#f5c21b'; c.font = '800 64px system-ui, sans-serif'; c.fillText(`${PRIX_LITRE} F`, 128, 260);
  c.fillStyle = '#cfd8dc'; c.font = '600 30px system-ui, sans-serif'; c.fillText('le litre', 128, 312);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.8, .25), [new THREE.MeshStandardMaterial({ color: '#1f3d4a' }), new THREE.MeshStandardMaterial({ color: '#1f3d4a' }), new THREE.MeshStandardMaterial({ color: '#1f3d4a' }), new THREE.MeshStandardMaterial({ color: '#1f3d4a' }), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })]);
  p.position.y = 3.3; g.add(p);
  const mat = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 2, 8), new THREE.MeshStandardMaterial({ color: '#8f979b', metalness: .4 })); mat.position.y = 1; g.add(mat);
  const pompe = new THREE.Mesh(new THREE.BoxGeometry(.6, 1.5, .45), new THREE.MeshStandardMaterial({ color: '#d8dee2' })); pompe.position.set(2.2, .75, 0); g.add(pompe);
  const ecran = new THREE.Mesh(new THREE.BoxGeometry(.4, .3, .47), new THREE.MeshStandardMaterial({ color: '#1f3d4a', emissive: '#1c5a3a' })); ecran.position.set(2.2, 1.2, 0); g.add(ecran);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
/** Construit les stations à moins de 500 m, retire les autres. */
export function majStations(x, z) {
  for (const [i, s] of ST.liste.entries()) {
    const d = Math.hypot(s[0] - x, s[1] - z), f = ST.faites.get(i);
    if (d < 500 && !f) {
      const g = totem(s[2]); g.position.set(s[0], hauteur(s[0], s[1], 0), s[1]); scene.add(g);
      const p = personne(900 + i, { role: 'jeune' }); p.position.set(s[0] + 2.2, 0, s[1] + 1); p.rotation.y = Math.PI; scene.add(p); // le pompiste
      ST.faites.set(i, { g, p, s });
    } else if (d > 650 && f) { scene.remove(f.g); scene.remove(f.p); f.p.userData.liberer?.(); ST.faites.delete(i); }
  }
}
/** La station la plus proche de (x, z) : [x, z, nom] (point de route devant elle), ou null. */
export function stationLaPlusProche(x, z) {
  let best = null, bd = Infinity; for (const st of ST.liste) { const d = Math.hypot(st[0] - x, st[1] - z); if (d < bd) { bd = d; best = st; } }
  return best;
}
/**
 * La station à moins de 35 m (on s'y arrête pour faire le plein), sinon null. Son point est le centre de son emprise dans
 * OpenStreetMap, pas un point de la route : à 25 m, une station Ewell restait hors d'atteinte (27,6 m entre son centre et
 * le bord de la chaussée la plus proche) et six autres se jouaient à quelques mètres près, murs comptés (mesure du 03/11).
 * Un « Vendeur d'essence » perdu à 3 km de toute route reste, lui, inaccessible.
 */
export function stationProche(x, z) { for (const f of ST.faites.values()) if (Math.hypot(f.s[0] - x, f.s[1] - z) < 35) return f; return null; }
