import * as THREE from 'three';
import { LITE } from './base.js';
import { chargerVrai, creerVehicule, departLibre, estVrai, placer, retirerVehicule, sensRoute, surRoute } from './conduite.js';
import { personne } from './discussions.js';
import { personnagesCharges } from './personnages.js';
import { poserObstacles } from './rue.js';
import { camera, scene } from './scene.js';
import { hauteurSol } from './sols.js';
import { CENTRE_VILLAGE, VILLAGE_ACTIF, dansVillage, versVille } from './village-plan.js';

// ---------- Les gens du Village de l'innovation : les exposants sur leurs stands, les voitures des visiteurs ----------
// « Donne la possibilité de voler la voiture des gens au Village d'innovation et mets des gens sur les stands » (Murielle,
// 18/11, jour de l'ouverture).
//
// Les exposants : un par stand du Marché et de la Maison des entrepreneurs (derrière les marchandises ou l'ordinateur posés
// sur le comptoir), des hôtesses aux banques d'accueil, deux animateurs au micro de la Radio, un guide au Musée, des
// infirmières au Centre de santé, des makers à l'Atelier, un conteur sous l'Arbre à palabre. Leurs places sont lues dans la
// maquette (sources/village/maquette-village.glb : « Le Marché · stand 1 », « Marchandises 0 », « Banque d'accueil »…), dans
// son repère (versVille). Ils saluent qui passe devant eux et lui disent un mot de leur espace. On ne les traverse pas.
//
// Les voitures : celles des visiteurs, garées sur la boucle de dépose devant le portique et dans les allées du parking, de
// part et d'autre du Village, leur propriétaire debout à côté, le dos tourné. « Voler la voiture de … » : on monte et on
// part (trajets.js, volerVehicule) ; le propriétaire crie, puis appelle la police. Son véhicule à soi rentre à la maison
// comme quand le patron confie le sien, et revient quand on lâche la voiture volée : en la laissant à plus de 60 m, en
// entrant quelque part, ou en la ramenant à son propriétaire. Une voiture partie, une autre se gare à sa place un peu plus
// tard, hors de la vue du joueur.
// Tout est local : chacun a ses exposants (les mêmes pour tous) et ses voitures à voler ; les autres voient seulement la
// voiture sous le voleur, comme un véhicule à lui.

const R = { pret: false, enCours: false, groupe: null, exposants: [], voitures: [], ctx: null, t: 0, salut: 0 };
if (import.meta.env.DEV) window.__villageGens = R; // pour les tests
const PRES = 300; // on installe tout le monde quand le joueur passe à moins de 300 m du Village

// ---------- Les exposants ----------
// Le Marché : [centre du stand, marchandises sur le comptoir] (repère de la maquette). La Maison des entrepreneurs est son
// reflet (x → −x), avec un ordinateur à la place des marchandises.
const MARCHE = [[28.1, -43.9, 27.5, -43.8], [27.5, -46.3, 26.9, -46.1], [26.1, -48.5, 25.6, -48.2], [24.1, -50.5, 23.6, -50.1], [21.6, -52.1, 21.2, -51.6], [18.6, -53.1, 18.3, -52.6], [15.3, -53.7, 15.3, -53.1]];
const MAISON = [[-28.1, -43.9, -27.4, -43.9], [-27.5, -46.3, -26.8, -46.2], [-26.1, -48.5, -25.5, -48.3], [-24.1, -50.5, -23.6, -50.1], [-21.6, -52.1, -21.1, -51.6], [-18.6, -53.1, -18.2, -52.6], [-15.3, -53.7, -15.1, -53.0]];
const PHRASES = {
  accueil: ['Bienvenue au Village de l’innovation !', 'Bonne visite ! Le plan est juste là.', 'Onze espaces à découvrir : amuse-toi bien !'],
  marche: ['Viens goûter, c’est fait au Bénin !', 'Bienvenue au Marché !', 'Tout ici est fait à Cotonou.', 'Approche, approche !'],
  maison: ['Tu as un projet ? Parlons-en !', 'Bienvenue chez les entrepreneurs !', 'Viens voir notre start-up !', 'On cherche des testeurs : ça te dit ?'],
  radio: ['On est en direct !', 'Un mot pour nos auditeurs ?', 'Salut à toute la ville !'],
  musee: ['Bienvenue au Musée. Regarde ces pièces !', 'Cette collection vient de tout le Bénin.'],
  sante: ['Un petit contrôle de tension ?', 'Bienvenue au Centre de santé.'],
  atelier: ['Regarde l’imprimante 3D !', 'Ce robot, c’est nous qui l’avons fait.'],
  citoyen: ['Tes démarches en ligne, c’est ici.', 'Bienvenue à la Place du citoyen !'],
  fabrique: ['Viens apprendre à coder !', 'Bienvenue à la Fabrique des talents !'],
  palabre: ['Approche, je te raconte une histoire.', 'Sous l’arbre à palabre, on prend le temps.'],
};
/** [x, z, vers x, vers z, espace, geste, femme (null : au hasard), rôle] dans le repère de la maquette ; `lite` : gardé au téléphone. */
function exposants() {
  const L = [];
  const derriere = (c, m, espace, k) => { const ux = c[0] - m[0], uz = c[1] - m[1], l = Math.hypot(ux, uz) || 1; L.push({ m: [m[0] + ux / l * .95, m[1] + uz / l * .95], vers: [m[0] - ux / l, m[1] - uz / l], espace, geste: k % 3 === 1 ? 'parle' : 'idle', femme: espace === 'marche' ? k % 3 !== 2 : k % 2 === 0, lite: k % 2 === 0 }); };
  MARCHE.forEach(([cx, cz, mx, mz], k) => derriere([cx, cz], [mx, mz], 'marche', k));
  MAISON.forEach(([cx, cz, mx, mz], k) => derriere([cx, cz], [mx, mz], 'maison', k));
  const un = (x, z, vx, vz, espace, geste = 'idle', femme = null, lite = false, role = null) => L.push({ m: [x, z], vers: [vx, vz], espace, geste, femme, lite, role });
  // Les quatre banques d'accueil du portique : l'hôtesse derrière, face à ceux qui entrent (+z, côté boulevard).
  un(5.2, 11.15, 5.2, 14, 'accueil', 'idle', true, true); un(-5.2, 11.15, -5.2, 14, 'accueil', 'idle', true);
  un(4.7, 5.35, 4.7, 8, 'accueil', 'idle', false); un(-4.7, 5.35, -4.7, 8, 'accueil', 'idle', true, true);
  // La Place du citoyen : derrière ses deux banques (tournées de −68°), face aux ordinateurs.
  un(-18.1, -16.9, -15.5, -17.95, 'citoyen', 'idle', false); un(-20.4, -22.5, -17.8, -23.55, 'citoyen', 'idle', true);
  // La Fabrique des talents : derrière ses deux banques, face à l'allée.
  un(-21.7, -34.0, -21.7, -31, 'fabrique', 'idle', true); un(-27.8, -34.0, -27.8, -31, 'fabrique', 'idle', false);
  // La Radio : deux animateurs face à face, de part et d'autre de la table aux micros.
  un(.3, -33.35, .3, -34.1, 'radio', 'parle', true, true); un(-.3, -34.85, -.3, -34.1, 'radio', 'parle', false);
  un(0, -31.6, 0, -27, 'musee', 'idle', true, true); // le guide du Musée, entre les deux vitrines
  un(15.85, -18.75, 14.5, -18.3, 'sante', 'idle', true, true); un(18.05, -24.35, 16.7, -23.9, 'sante', 'idle', true); // au chevet des tables d'examen
  un(-6.7, -45.45, -6.7, -44.6, 'atelier', 'idle', false, true); un(6.7, -46.35, 6.7, -47.2, 'atelier', 'idle', true); // derrière les imprimantes
  un(0, -51.8, 0, -48, 'palabre', 'parle', false, false, 'ancien'); // le conteur, sous l'Arbre à palabre
  return LITE ? L.filter(e => e.lite) : L;
}

// ---------- Les voitures des visiteurs ----------
// Sur la boucle de dépose (rue 620 d'OpenStreetMap, à sens unique) et dans les allées du parking à l'ouest (x ≈ −1141) et à
// l'est (x ≈ −1056,6) du Village : au bord de la chaussée, pour que la circulation passe à côté (elle les contourne, E.garees).
const PLACES = [
  // « J'espère que la Tesla Roadster, on peut la voler ? » (Murielle, 18/11) : oui, garée la première en venant du boulevard ;
  // volée, elle garde ses propulseurs (conduite.js) : un bond, ou le vol à 110 m.
  { x: -1109.6, z: 2248.5, cap: 0, type: 'roadster', nom: 'Romuald', femme: false },
  { x: -1109.6, z: 2256, cap: 0, type: 'berline', nom: 'Koffi', femme: false },
  { x: -1086.3, z: 2256, cap: Math.PI, type: 'citadine', nom: 'Bintou', femme: true },
  { x: -1139.7, z: 2270, cap: 0, type: 'supercar', nom: 'Rachidi', femme: false },
  { x: -1058.1, z: 2272, cap: Math.PI, type: 'jetour', nom: 'Fifamè', femme: true, loin: true },
  { x: -1139.7, z: 2297, cap: 0, type: 'voiture', nom: 'Sèna', femme: false, loin: true },
  { x: -1058.1, z: 2298, cap: Math.PI, type: 'suv', nom: 'Nadège', femme: true },
].filter(p => !LITE || !p.loin);
// Des Roadster à voler dans la ville (19/11, « je veux voler la voiture de n'importe quelle personne, et même voler en haut si
// c'est une Roadster ») : une garée au bord de la rue près de cinq lieux où l'on va (salon.js, lieuxRoadster), son
// propriétaire à côté. Comme celles du Village, chacune ne se gare que quand on passe à moins de 260 m.
const ROADSTERS = [['Landry', false], ['Carine', true], ['Josué', false], ['Bénédicte', true], ['Florent', false]];
const ACTIVE = 260, RANGE = 420;
function placesEnVille() {
  (ctx.lieuxRoadster?.() || []).forEach(([x0, z0], i) => {
    const [nom, femme] = ROADSTERS[i % ROADSTERS.length];
    for (let r = 4; r <= 130; r += 3) for (let a = 0; a < 12; a++) { // la plage de Fidjrossè : la rue est à ~60 m du sable
      const s = sensRoute(x0 + Math.cos(a * Math.PI / 6) * r, z0 + Math.sin(a * Math.PI / 6) * r); if (!s) continue;
      const off = Math.max(1.1, s.hw - 2.25), x = s.px + Math.cos(s.cap) * off, z = s.pz - Math.sin(s.cap) * off; // au bord de la chaussée (hw compte le trottoir)
      if (!surRoute(x, z) || dansVillage(x, z, 4)) continue;
      R.voitures.push({ x, z, cap: s.cap, type: 'roadster', nom, femme, ville: true, k: 20 + i, V: null, etat: 'vide', depuis: -1e9, proprio: null, cris: [] });
      return;
    }
  });
}
const DIMS = { roadster: [4.4, 2], berline: [4.6, 1.84], citadine: [3.9, 1.75], supercar: [4.7, 2], jetour: [4.75, 1.95], voiture: [4.9, 2], suv: [4.37, 1.86] };

/** Une personne debout à (x, z), tournée vers (vx, vz) — repère de la ville. */
function debout(graine, x, z, vx, vz, { femme = null, role = null, geste = 'idle', dans = R.groupe } = {}) {
  const g = personne(graine, { femme, role }) || personne(graine, { femme });
  g.position.set(x, Math.max(.04, hauteurSol(x, z)), z); g.rotation.y = Math.atan2(vx - x, vz - z);
  g.userData.jouer?.(geste, 0); dans.add(g);
  return { g, x, z, cap: g.rotation.y, geste, bulle: null, bulleFin: 0 };
}

async function installerExposants() {
  R.enCours = true;
  await personnagesCharges(); // les vrais personnages, s'ils viennent ; sinon ceux dessinés en code
  exposants().forEach((e, k) => {
    const [x, z] = versVille(...e.m), [vx, vz] = versVille(...e.vers);
    const p = debout(9100 + k * 37, x, z, vx, vz, { femme: e.femme, role: e.role, geste: e.geste, dans: R.expo });
    R.exposants.push(Object.assign(p, { espace: e.espace, prochain: 0 }));
  });
  majObstacles();
}
/** Une voiture garée loin du joueur (plus de 420 m) rentre : elle et son propriétaire ne coûtent rien pendant ce temps. */
function ranger(v) {
  retirerVehicule(v.V); v.V = null; v.etat = 'vide'; v.depuis = -1e9; v.cris = [];
  if (v.proprio) { ctx.finBulle(v.proprio); R.groupe.remove(v.proprio.g); v.proprio.g.userData.liberer?.(); v.proprio = null; }
  majObstacles();
}

// ---------- Obstacles : on ne traverse ni les exposants, ni les propriétaires, ni les voitures garées ----------
function majObstacles() {
  const L = R.exposants.map(e => [e.x, e.z, 0, .55, .55]);
  for (const v of R.voitures) {
    if (v.proprio) L.push([v.proprio.x, v.proprio.z, 0, .55, .55]);
    if (v.etat === 'garee') { const [l, w] = DIMS[v.type]; L.push([v.V.x, v.V.z, v.V.cap - Math.PI / 2, l, w]); } // [x, z, angle, longueur, épaisseur] : la longueur suit le cap
  }
  poserObstacles('village-gens', L);
}

/** Les voitures garées du Village, que la circulation doit contourner (salon.js, majGarees). */
export const voituresDuVillage = () => (R.pret ? R.voitures.filter(v => v.etat === 'garee').map(v => v.V) : []);

// Une voiture qui se gare à sa place : jamais sous les yeux du joueur, ni sur une voiture de la circulation.
const horsDeVue = (x, z) => { const dx = x - camera.position.x, dz = z - camera.position.z; if (dx * dx + dz * dz > 90 * 90) return true; const v = new THREE.Vector3(x, 1, z).project(camera); return v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1; };
function garer(v, premiere) {
  if (estVrai(v.type)) { chargerVrai(v.type); if (!v.attendu) { v.attendu = true; return; } } // le vrai modèle d'abord (une seconde de plus)
  if (!premiere && !horsDeVue(v.x, v.z)) return;
  const [l, w] = DIMS[v.type];
  if (!departLibre({ long: l, larg: w }, v.x, v.z, v.cap, { devant: .3, cote: w / 2 + .1 })) return;
  const V = creerVehicule(v.type);
  // Le modèle de la voiture n'est pas encore là (celles de la ville se chargent après l'affichage) : on réessaiera, plutôt
  // que de garer une voiture dessinée en blocs. Au bout d'une minute, tant pis.
  if (V.dessin && (v.essais = (v.essais || 0) + 1) < 240) { retirerVehicule(V); return; } // 240 essais, un toutes les 0,25 s
  placer(V, v.x, v.z, v.cap); V.duVillage = v; v.V = V; v.etat = 'garee'; v.cris = [];
  // Le propriétaire, à côté de la portière du conducteur, du côté hors de la chaussée, le dos tourné à sa voiture.
  const sx = Math.cos(v.cap), sz = -Math.sin(v.cap), fx = Math.sin(v.cap), fz = Math.cos(v.cap);
  const sens = surRoute(v.x + sx * 2.6, v.z + sz * 2.6) && !surRoute(v.x - sx * 2.6, v.z - sz * 2.6) ? -1 : 1, d = w / 2 + .75;
  const px = v.x + sx * d * sens + fx * l * .3, pz = v.z + sz * d * sens + fz * l * .3;
  if (v.proprio) { R.groupe.remove(v.proprio.g); v.proprio.g.userData.liberer?.(); }
  v.proprio = debout(9700 + v.k * 53, px, pz, px + sx * sens, pz + sz * sens, { femme: v.femme, geste: 'idle' });
  majObstacles();
}

// ---------- Voler ----------
let voler = () => false, lacher = () => false, ctx = { ligne: () => { }, bulle: () => { }, finBulle: () => { }, joueur: () => null, aPied: () => false, vehicule: () => null };
/** ctx : ligne, bulle(qui, texte), finBulle(qui), joueur() → { x, z, lieu, mode }, aPied(), vehicule() (T.veh), voler(V), lacher() (trajets.js). */
export function initVillageGens(c) { Object.assign(ctx, c); voler = c.voler; lacher = c.lacher; }

/** Les actions du joueur près d'une voiture garée du Village. */
export function actionsVillageGens() {
  if (!R.pret || !ctx.aPied()) return [];
  const J = ctx.joueur(); if (!J) return [];
  let best = null, dm = 3.4;
  for (const v of R.voitures) if (v.etat === 'garee') { const d = Math.hypot(v.V.x - J.x, v.V.z - J.z); if (d < dm) { dm = d; best = v; } }
  return best ? [{ texte: best.type === 'roadster' ? `Voler la Tesla Roadster de ${best.nom}` : `Voler la voiture de ${best.nom}`, f: () => volerVoiture(best) }] : [];
}
function volerVoiture(v) {
  if (v.etat !== 'garee') return;
  v.V.vole = v.nom; // trajets.js : « la voiture de Koffi », ni essence ni panne
  if (!voler(v.V)) { delete v.V.vole; ctx.ligne('Pas maintenant : termine d’abord ce que tu fais.'); return; } // au travail, déjà en route…
  v.etat = 'volee'; v.t = 0; majObstacles();
  v.cris = [[.4, 'Hé ! Ma voiture !', 'parle'], [3.6, 'Au voleur ! Rattrapez ma voiture !', 'parle'], [9, v.ville ? 'Allô, la police ? On m’a volé ma Roadster !' : 'Allô, la police ? On m’a volé ma voiture au Village !', 'parle']]; // « telephone » est une pose assise : il se tassait sur place
  if (v.type === 'roadster') ctx.ligne(`Tu voles la Tesla Roadster de ${v.nom} ! Appuie sur « Propulseurs » pour sauter, tiens 5 s pour t’envoler.`);
  else ctx.ligne(`Tu voles la voiture de ${v.nom} ! Démarre vite… Laisse-la plus loin, ou ramène-la à ${v.femme ? 'sa propriétaire' : 'son propriétaire'}.`);
}
function dire(p, texte, geste) { if (!p) return; ctx.bulle(p, texte); if (geste) { p.g.userData.jouer?.(geste); p.geste = geste; } }

// ---------- Chaque image ----------
export function majVillageGens(dt) {
  const J = ctx.joueur();
  if (!R.groupe) { R.groupe = new THREE.Group(); R.groupe.name = 'village-gens'; R.expo = new THREE.Group(); R.groupe.add(R.expo); scene.add(R.groupe); }
  if (!R.pret) { // les places des voitures : celles du Village pendant l'événement, et les Roadster de la ville
    if (!J) return;
    if (VILLAGE_ACTIF) for (const [k, P] of PLACES.entries()) R.voitures.push({ ...P, k, V: null, etat: 'vide', depuis: -1e9, proprio: null, cris: [] });
    placesEnVille(); R.pret = true;
  }
  if (VILLAGE_ACTIF && !R.enCours && J && Math.hypot(J.x - CENTRE_VILLAGE[0], J.z - CENTRE_VILLAGE[1]) < PRES) installerExposants();
  const now = performance.now();
  R.expo.visible = Math.hypot(camera.position.x - CENTRE_VILLAGE[0], camera.position.z - CENTRE_VILLAGE[1]) < 600;
  for (const p of [...R.exposants, ...R.voitures.map(v => v.proprio)]) if (p?.bulle && now > p.bulleFin) ctx.finBulle(p);
  // Les propriétaires volés se tournent vers leur voiture qui part, crient, puis appellent la police.
  for (const v of R.voitures) {
    if (v.etat !== 'volee' || !v.proprio) continue;
    v.t += dt; const P = v.proprio;
    if (v.V && v.t < 12) P.g.rotation.y = Math.atan2(v.V.x - P.x, v.V.z - P.z);
    while (v.cris.length && v.t > v.cris[0][0]) { const [, t, g] = v.cris.shift(); dire(P, t, g); }
  }
  R.t -= dt; if (R.t > 0) return; R.t = .25;
  // Les voitures : garer celles qui manquent, rendre celles qu'on a lâchées.
  const V0 = ctx.vehicule();
  for (const v of R.voitures) {
    const d = J ? Math.hypot(v.x - J.x, v.z - J.z) : Infinity;
    if (v.etat === 'vide' && d < ACTIVE && now - v.depuis > 20000) garer(v, v.depuis < 0);
    else if (v.etat === 'garee' && d > RANGE) ranger(v);
    if (v.etat !== 'volee') continue;
    if (V0 !== v.V) { v.etat = 'vide'; v.depuis = now; v.V = null; continue; } // retirée par trajets.js (quitter la ville, un métier, une autre voiture volée)
    if (!J || J.mode !== 'pied') continue; // au volant : on la garde ; à pied, même dans un bâtiment, on regarde où elle est
    const loin = Math.hypot(v.V.x - J.x, v.V.z - J.z) > 60 || J.lieu;
    const rendue = Math.hypot(v.V.x - v.x, v.V.z - v.z) < 12;
    if ((loin || rendue) && lacher()) {
      v.etat = 'vide'; v.depuis = rendue ? now - 19000 : now; v.V = null; v.cris = [];
      if (rendue) { dire(v.proprio, 'Ah, ma voiture ! Merci… mais ne recommence pas !', 'idle'); ctx.ligne(`Tu as rendu sa voiture à ${v.nom}.`); }
      else { ctx.ligne(`${v.nom} a récupéré sa voiture.`); v.proprio?.g.userData.jouer?.('idle'); }
    }
  }
  // Les exposants saluent qui passe devant eux (le plus proche, une fois toutes les 45 s chacun).
  if (!J || !ctx.aPied() || now < R.salut) return;
  let best = null, dm = 3.3;
  for (const e of R.exposants) { const d = Math.hypot(e.x - J.x, e.z - J.z); if (d < dm && now > e.prochain) { dm = d; best = e; } }
  if (!best) return;
  const L = PHRASES[best.espace]; best.prochain = now + 45000; R.salut = now + 2500;
  ctx.bulle(best, L[Math.floor(Math.random() * L.length)]);
  best.g.userData.jouer?.('salut'); setTimeout(() => best.g.userData.jouer?.(best.geste), 2400);
}

export function quitterVillageGens() {
  for (const v of R.voitures) { if (v.etat === 'garee') retirerVehicule(v.V); v.V = null; v.etat = 'vide'; v.depuis = -1e9; v.cris = []; v.essais = 0; }
  if (R.pret) majObstacles();
}
