import * as THREE from 'three';
import { moteur, moteurMaj, moteurStop, son } from './audio.js';
import { $ } from './base.js';
import { construireReseau, noeudRelie, noeudsPres, relie } from './carrefours.js';
import { PRIX_LITRE, VEHICULES, atterrir, creerVehicule, decoller, peindre, enCroisiere, initStations, peutDecoller, itineraire, longueur, majRuban, majStations, piloter, placer, reste, retirerRuban, retirerVehicule, ruban, siege, stationProche, suivreChemin, surRoute } from './conduite.js';
import { dansBatiment, dansObstacleRue, decalee } from './rue.js';
import { E } from './etat.js';
import { dansCirculation } from './trafic.js';
import { allumerLesPortes, arriveeDehors, comptoirProche, devantChaise, siegeProche } from './interieurs.js';
import { payerEtRecevoir, remettre } from './remise.js';
import { scene } from './scene.js';
import { porterCasque } from './casque.js';
import { VIE, carburant, consommer, depenser, faireLePlein, manger, reservoir, sauverVie } from './vie.js';
import { actionsVol, arreterVol, initVol, majAeroports, majVol } from './vol.js';
import { actionsMetier, chocMetier, enService, initMetiers, majMetiers, quitterMetiers } from './metiers.js';

// ---------- Se déplacer et vivre en ville : véhicule, zém, essence, GPS, repas ----------
// Appelé par le salon (S : position, personnage, pièce où l'on est). On voit son personnage monter sur sa
// moto ou dans sa voiture, rouler sur les routes (conduite.js), s'arrêter à une station et payer le pompiste,
// héler un zém, négocier, monter derrière et payer à l'arrivée, commander au food court, porter son assiette,
// s'asseoir et manger, prendre l'avion pour Ouidah (vol.js). Chaque paiement est débité du portefeuille de
// « Ma vie » et se voit (billet, objet).

export const T = { mode: 'pied', veh: null, zem: null, gps: null, plat: null, repas: null, trans: null, conso: 0, panneDite: false, ctx: null, gpsT: 0 };
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const v3 = new THREE.Vector3();
let S = null, ligne = () => { }, bulleLocale = null;

export function initTrajets(data, ctx) {
  initStations(data.L.stations); S = ctx.S; ligne = ctx.ligne; bulleLocale = ctx.bulle; initVol(data, { ...ctx, T });
  initMetiers(data, { ...ctx, T, gps, choisir, asseoirSur, garerSonVehicule, etiquette }); // zém, taxi, tokpa-tokpa (metiers.js)
  allumerLesPortes(); // toutes les portes sont déclarées : on pose l'ampoule du soir au-dessus de chacune
}
// Comment on nomme le véhicule : monter dans…, descendre de…
const NOMS = { voiture: ['ta voiture', 'de la voiture'], moto: ['ta moto', 'de la moto'], velo: ['ton vélo', 'du vélo'], taxi: ['le taxi', 'du taxi'], tokpa: ['le tokpa-tokpa', 'du tokpa-tokpa'], citadine: ['ta citadine', 'de la citadine'], bolide: ['ton bolide', 'du bolide'] };
const nomDe = V => (V.travail && V.type === 'moto' ? ['la moto du patron', 'de la moto'] : NOMS[V.type] || NOMS.voiture);

// Un point de route libre près de (x, z), pour garer un véhicule ou faire venir un zém.
export function pointDeRoute(x, z, rMin = 0, rMax = 25) {
  for (let r = rMin; r <= rMax; r += 1.5) for (let a = 0; a < 16; a++) { const px = x + Math.cos(a * Math.PI / 8) * r, pz = z + Math.sin(a * Math.PI / 8) * r; if (surRoute(px, pz)) return [px, pz]; }
  return null;
}
/** La couleur de son véhicule à soi : la même chez soi et chez les autres (le bolide rouge passait blanc chez eux). */
const couleurPerso = type => (['zem', 'tokpa', 'taxi'].includes(type) ? undefined : type === 'voiture' ? '#7a1f2b' : '#a32b26');

// ---------- La peinture de son véhicule (menu « Peindre ma voiture ») ----------
// Retenue sur l'appareil, type par type : la fiche de vie enregistrée chez Firebase refuse tout champ en plus
// (database.rules.json, `$autre`). Les autres la reçoivent avec sa position (salon.js, `vc`), garée comme au volant.
export const PEINTURES = [
  { nom: 'Couleur d’origine', c: null }, { nom: 'Blanc nacré', c: '#f1f1ec' }, { nom: 'Gris argent', c: '#a6acb2' }, { nom: 'Noir brillant', c: '#16181b' },
  { nom: 'Bleu roi', c: '#1d4fb8' }, { nom: 'Bleu ciel', c: '#5cb3ea' }, { nom: 'Vert Kutɔnu', c: '#1a7d52' }, { nom: 'Jaune soleil', c: '#f2b705' },
  { nom: 'Orange', c: '#ef7a1a' }, { nom: 'Rose', c: '#db7093' }, { nom: 'Violet', c: '#6f3fb0' }, { nom: 'Bordeaux', c: '#6b1426' },
];
export const PEIGNABLES = ['voiture', 'citadine', 'bolide', 'roadster', 'moto']; // le vélo et les véhicules de travail gardent leurs couleurs
export const PRIX_PEINTURE = 5000; // F la couleur (Murielle, 28/10) ; revenir à la couleur d'origine est gratuit
const CLE_PEINTURE = 'kutonu.peinture';
/** Une couleur reçue d'un autre joueur : un code « #rrggbb », sinon rien. */
export const couleurValide = c => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);
export function peintureDe(type) { try { return couleurValide(JSON.parse(localStorage.getItem(CLE_PEINTURE) || '{}')[type]); } catch { return null; } }
/** Repeint son véhicule de ce type (garé ou sous soi) et le retient pour la prochaine fois. */
export function peindreSonVehicule(type, c) {
  try { const m = JSON.parse(localStorage.getItem(CLE_PEINTURE) || '{}'); if (c) m[type] = c; else delete m[type]; localStorage.setItem(CLE_PEINTURE, JSON.stringify(m)); } catch { /* navigation privée : pour cette partie seulement */ }
  if (T.veh?.type === type && !T.veh.travail) peindre(T.veh, c);
}
/** À l'arrivée dans le salon : son véhicule (Fils à papa : voiture ; moto louée) garé sur la route la plus proche. */
export function entrerMonde() {
  quitterMonde(); T.mode = 'pied';
  garerSonVehicule();
}
/** Le loueur reprend le véhicule : il disparaît de la rue. Seulement à pied, pas en roulant dessus. */
export function reprendreVehicule() { if (T.mode !== 'pied') return false; retirerVehicule(T.veh); T.veh = null; return true; }
/** `ou` ({ x, z, cap }) : un emplacement imposé — le vélo qu'on loue est posé devant la boutique, pas sur la
 *  route la plus proche, qui pouvait être à 15 m de l'autre côté d'une haie. */
export function garerSonVehicule(ou = null) {
  const type = VIE.data?.vehicule; if (!type || !VEHICULES[type] || T.veh) return;
  const o = S.lieu ? arriveeDehors(S.lieu) : S; // dans un bâtiment (chez soi au réveil) : dans la rue, devant la porte
  const p = ou ? [ou.x, ou.z] : pointDeRoute(o.x + Math.sin(o.cap + Math.PI / 2) * 4, o.z + Math.cos(o.cap + Math.PI / 2) * 4, 0, 150); if (!p) return;
  T.veh = creerVehicule(type, { couleur: couleurPerso(type), peinture: peintureDe(type) }); placer(T.veh, p[0], p[1], ou ? ou.cap : Math.atan2(p[0] - o.x, p[1] - o.z));
  const nom = type === 'voiture' ? 'Ta voiture' : type === 'velo' ? 'Ton vélo' : type === 'citadine' ? 'Ta citadine' : type === 'bolide' ? 'Ton bolide' : 'Ta moto', e = etiquette(nom); e.position.y = ['voiture', 'citadine', 'bolide'].includes(type) ? 2.2 : 1.7; T.veh.g.add(e); T.veh.etiquette = e;
  const d = Math.round(Math.hypot(p[0] - o.x, p[1] - o.z) / 5) * 5;
  if (d > 8 && !S.lieu) ligne(type === 'velo' ? `Ton vélo est posé sur la route, à ${d} m : suis l’étiquette jaune.` : `${nom} est garée sur la route, à ${d} m : suis l’étiquette jaune.`);
}
// Étiquette au-dessus de son véhicule, pour le retrouver (cachée quand on est dessus).
function etiquette(texte) {
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 72; const c = cv.getContext('2d');
  c.font = '800 30px system-ui, sans-serif'; const w = Math.min(300, c.measureText(texte).width + 44);
  c.fillStyle = '#f2b705'; c.beginPath(); c.roundRect(160 - w / 2, 8, w, 54, 27); c.fill(); c.fillStyle = '#17130c'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(texte, 160, 36);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false })); sp.scale.set(.145, .033, 1); sp.renderOrder = 30; return sp;
}
export function quitterMonde() {
  quitterMetiers(); arreterVol(); moteurStop(); S.moi?.userData.velo?.(null); retirerVehicule(T.veh); T.veh = null; if (T.zem) retirerVehicule(T.zem.V); T.zem = null;
  retirerRuban(T.gps?.m); T.gps = null; jeterPlat(); T.repas = null; T.trans = null; T.mode = 'pied';
  if (S?.moi) S.moi.visible = true;
}

// ---------- Actions possibles (bouton principal et secondaire, touche E) ----------
export function actions() {
  const out = [], V = T.veh, D = VIE.data;
  if (T.trans) return out;
  if (T.mode === 'avion') return actionsVol();
  out.push(...actionsMetier()); // le métier d'abord : parler au client, encaisser, crier la destination…
  if (T.mode === 'apprenti') return out;
  if (T.mode === 'conduit') {
    const st = stationProche(V.x, V.z), R = reservoir(), manque = Math.round((R - carburant()) * 10) / 10;
    if (st && Math.abs(V.v) < .6 && manque > .05) {
      const prix = Math.ceil(manque * PRIX_LITRE / 25) * 25, un = Math.min(manque, 1);
      if (D.argent >= prix) out.push({ texte: `Faire le plein · ${manque.toLocaleString('fr-FR')} L · ${fmt(prix)}`, f: () => plein(st, manque, prix) });
      else if (D.argent >= Math.ceil(un * PRIX_LITRE / 25) * 25) out.push({ texte: `Mettre ${un.toLocaleString('fr-FR')} L · ${fmt(Math.ceil(un * PRIX_LITRE / 25) * 25)}`, f: () => plein(st, un, Math.ceil(un * PRIX_LITRE / 25) * 25) });
    }
    // La Roadster décolle sur ses propulseurs et vole à 110 m (conduite.js) ; on choisit où se poser.
    if (V.vol) {
      if (enCroisiere(V)) {
        const G = T.gps;
        if (G && !(V.vol.phase === 'approche' && V.vol.vers === G.nom)) out.push({ texte: `Voler jusqu’à ${G.nom}`, f: () => volerVers(G) });
        out.push({ texte: 'Atterrir ici', f: () => { if (atterrir(V)) { V.vol.vers = null; ligne('Tu descends sur la route la plus proche.'); } else ligne('Pas de route où se poser ici : vole un peu plus loin.'); } });
      }
      return out;
    }
    if (peutDecoller(V)) out.push({ texte: 'Décoller · propulseurs', f: () => { if (decoller(V)) { son('saut'); ligne(T.gps ? `Tu montes à 110 m. Puis « Voler jusqu’à ${T.gps.nom} », ou pilote toi-même.` : 'Tu montes à 110 m. Pilote comme au sol, puis « Aller » pour choisir où te poser, ou « Atterrir ici ».'); } } });
    if (Math.abs(V.v) < .8) out.push({ texte: `Descendre ${nomDe(V)[1]}`, f: descendre });
    return out;
  }
  if (T.mode === 'passager') { // on peut toujours descendre : à l'arrivée (prix convenu), ou avant (le bout de chemin fait)
    const Z = T.zem; if (Z?.phase !== 'course') return out;
    const pres = Math.hypot(Z.dest[0] - Z.V.x, Z.dest[1] - Z.V.z) < 60, prix = pres ? Z.prix : prixFait(Z), m = reste(Z.P.pts, Z.V.x, Z.V.z).m;
    if (m > 300 && !Z.saute) out.push({ texte: `Passer le trajet · ${Math.max(1, Math.round(m / 15.5 / 60))} min`, f: passerTrajet });
    out.push({ texte: pres ? `Descendre · ${fmt(Z.prix)}` : `Descendre ici · ${fmt(prix)}`, f: () => finCourse(prix, !pres) });
    return out;
  }
  if (T.zem?.phase === 'attend' && Math.hypot(T.zem.V.x - S.x, T.zem.V.z - S.z) < 4.5) out.push({ texte: `Monter sur le zém · ${fmt(T.zem.prix)}`, f: monterZem });
  if (V && !S.lieu && Math.hypot(V.x - S.x, V.z - S.z) < (V.type === 'tokpa' ? 4.8 : 3.2)) out.push({ texte: `Monter ${V.D.cache ? 'dans' : 'sur'} ${nomDe(V)[0]}`, f: monter });
  if (S.lieu && !['serveur', 'cuisinier'].includes(enService())) { const c = comptoirProche(S.lieu, S.x, S.z); if (c && !T.plat) out.push({ texte: `Commander · ${c.nom}`, f: () => commander(c) }); } // en service au food court, on ne commande pas
  out.push(...actionsVol()); // billetterie, porte d'embarquement, monter dans l'avion
  return out;
}

// ---------- Monter, descendre ----------
// Le personnage marche jusqu'au véhicule (moins d'une seconde), puis s'assoit sur la selle, ou ouvre la
// portière et disparaît dans la voiture.
function monter() {
  const V = T.veh; if (!V) return;
  const cote = V.type === 'tokpa' ? 1.5 : V.D.cache ? 1.3 : .55, bx = V.x + Math.sin(V.cap + Math.PI / 2) * cote, bz = V.z + Math.cos(V.cap + Math.PI / 2) * cote;
  // Un vélo n'a pas de moteur : pas de ronflement quand on l'enfourche, et rien à faire monter en régime.
  T.trans = { t: 0, duree: .9, de: [S.x, S.z], vers: [bx, bz], fin: () => {
    T.mode = 'conduit'; S.cap = V.cap; if (!V.D.pedale) moteur(V.type === 'tokpa' || V.type === 'taxi' ? 'voiture' : V.type); son('bosse');
    ligne(V.D.pedale ? `Tu montes sur ${nomDe(V)[0]}. Flèches ou ZQSD : pédaler, freiner, tourner.` : `Tu montes ${V.D.cache ? 'dans' : 'sur'} ${nomDe(V)[0]}. Flèches ou ZQSD : accélérer, freiner puis reculer, tourner.`);
  } };
}
function descendre() {
  const V = T.veh; if (!V || Math.abs(V.v) > .8) return;
  V.v = 0; moteurStop(); T.mode = 'pied'; S.moi?.userData.velo?.(null); // sinon il marche les bras tendus
  const cote = V.type === 'tokpa' ? 1.9 : V.D.cache ? 1.6 : 1; S.x = V.x + Math.sin(V.cap + Math.PI / 2) * cote; S.z = V.z + Math.cos(V.cap + Math.PI / 2) * cote; S.cap = V.cap; S.y = 0;
  if (S.moi) S.moi.visible = true;
  sauverVie();
}

// ---------- Essence : on paie le pompiste et on voit l'essence passer dans le réservoir ----------
async function plein(st, litres, prix) {
  if (!(await depenser(prix, `essence (${litres.toLocaleString('fr-FR')} L) à ${st.s[2]}`))) { ligne('Pas assez d’argent pour l’essence.'); return; }
  const V = T.veh, reservoirPt = new THREE.Vector3(V.x, V.y + (V.D.cache ? .9 : 1), V.z);
  payerEtRecevoir(V.D.cache ? reservoirPt : S.moi, st.p, 'essence', reservoirPt, { hautVers: 0, garder: 1.4, verser: true });
  st.p.userData.jouer?.('salut'); setTimeout(() => st.p.userData.jouer?.('idle'), 2500);
  setTimeout(() => { faireLePlein(litres); son('piece'); T.panneDite = false; }, 1600);
}

// ---------- GPS : itinéraire par les routes jusqu'à la destination ----------
/** Trace l'itinéraire depuis le véhicule (ou d'où l'on est) jusqu'à (x, z). */
export function gps(x, z, nom) {
  const from = T.mode === 'conduit' ? T.veh : S, pts = itineraire(from.x, from.z, from.cap, x, z);
  retirerRuban(T.gps?.m); T.gps = null;
  if (!pts || pts.length < 2) { ligne(`Pas d’itinéraire trouvé jusqu’à ${nom}.`); return false; }
  T.gps = { pts, m: ruban(pts), nom, x, z }; T.gpsT = 0;
  const km = longueur(pts) / 1000;
  // À pied, au-delà de 800 m, la marche n'est plus raisonnable : on dit tout de suite quoi faire.
  ligne(`${nom} · ${km < .95 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1).replace('.', ',')} km`} · ${T.mode === 'pied' && km > .8 ? 'loin à pied : prends un zém.' : 'suis les chevrons.'}`);
  return true;
}
/** La Roadster en vol file vers la destination du GPS et se pose seule sur la route où finit l'itinéraire. */
function volerVers(G) {
  const V = T.veh, [fx, fz] = G.pts[G.pts.length - 1];
  if (atterrir(V, fx, fz, 60) || atterrir(V, G.x, G.z, 200)) { V.vol.vers = G.nom; ligne(`Cap sur ${G.nom} : la Roadster s’y pose seule. Touche les commandes pour reprendre la main.`); }
  else ligne(`Pas de route où se poser près de ${G.nom}.`);
}
const distance = m => m > 950 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 10) * 10} m`;
function majGps(dt, x, z, cap, vol = false) {
  const G = T.gps; if (!G) { $('#vhGps').hidden = true; return; }
  majRuban(dt);
  // En vol, ni itinéraire à recalculer ni arrivée : la distance à vol d'oiseau ; le GPS reprend une fois posé.
  if (vol) { $('#vhGps').hidden = false; $('#vhGps').textContent = `→ ${G.nom} · ${distance(Math.hypot(G.x - x, G.z - z))} à vol d’oiseau`; return; }
  const r = reste(G.pts, x, z);
  // À pied on arrive sur le pas de la porte ; au volant, 22 m suffisent (on se gare au bord).
  if (Math.hypot(G.x - x, G.z - z) < (T.mode === 'pied' ? 7 : 22)) { ligne(`Tu es arrivé : ${G.nom}.`); son('arret'); retirerRuban(G.m); T.gps = null; $('#vhGps').hidden = true; return; }
  T.gpsT += dt;
  // L'écart est maintenant mesuré au segment, pas au sommet : on peut redescendre le seuil de 35 m à 12, donc
  // recalculer dès qu'on a pris la mauvaise rue au lieu d'attendre d'être à un demi-pâté de maisons.
  if (r.ecart > 12 && T.gpsT > 1.5) { T.gpsT = 0; const pts = itineraire(x, z, cap, G.x, G.z); if (pts) { retirerRuban(G.m); G.pts = pts; G.m = ruban(pts); } } // on s'est écarté : nouvel itinéraire
  $('#vhGps').hidden = false; $('#vhGps').textContent = `→ ${G.nom} · ${distance(r.m)}`;
}

// ---------- Héler un zém : on négocie, il vient, on monte derrière, on paie à l'arrivée ----------
export function prixZem(x, z, cap, dx, dz) {
  construireReseau(); const pts = itineraire(x, z, cap, dx, dz); if (!pts) return null;
  const km = longueur(pts) / 1000; return { pts, km, prix: Math.max(200, Math.ceil((120 * km + 100) / 50) * 50) };
}
/** Le zém accepté arrive (il part d'une rue à 30-60 m). */
export function appelerZem(dx, dz, nom, prix) {
  if (T.zem) retirerVehicule(T.zem.V);
  // Sur une rue (à 30 m près) ; sinon il vient jusqu'à soi, comme il dépose sur le sable de Fidjrossè, mais seulement si aucun
  // mur ni bâtiment ne l'en sépare (itineraire) : sinon il attend au bord de la route, et l'on va jusqu'à lui.
  const ici = pointDeRoute(S.x, S.z, 0, 30) || (noeudRelie(S.x, S.z, 150) && [S.x + Math.sin(S.cap) * 2.5, S.z + Math.cos(S.cap) * 2.5]);
  const pres = ici ? noeudsPres(ici[0], ici[1], 160).filter(([k]) => relie(k)) : [], n = pres.find(([, d]) => d > 30) || pres.pop();
  if (!n) { ligne('Pas de route ici : approche-toi d’une rue pour héler un zém.'); return; }
  const [X, Z] = noeudPos(n[0]), V = creerVehicule('zem'); placer(V, X, Z, Math.atan2(ici[0] - X, ici[1] - Z));
  const pts = itineraire(X, Z, V.cap, ici[0], ici[1]); if (!pts) { retirerVehicule(V); ligne('Le zém ne trouve pas de route jusqu’à toi : approche-toi d’une rue.'); return; }
  // Une étiquette jaune au-dessus de lui, visible à travers les murs : il attend souvent au bord de la rue, hors de vue.
  const et = etiquette('Ton zém'); et.position.y = 1.7; V.g.add(et); V.etiquette = et;
  T.zem = { V, phase: 'vient', P: { pts: surSaFile(pts), i: 0 }, dest: [dx, dz], nom, prix, attente: 0 };
  const f = pts[pts.length - 1], loin = Math.hypot(f[0] - S.x, f[1] - S.z);
  ligne(loin > 8 ? `Un zém arrive… (${fmt(prix)} jusqu’à ${nom}). Il t’attendra au bord de la rue, à ${Math.round(loin)} m : suis l’étiquette jaune.` : `Un zém arrive… (${fmt(prix)} jusqu’à ${nom})`);
}
const noeudPos = n => { const R = construireReseau(); return [R.X[n], R.Z[n]]; };
function monterZem() {
  const Z = T.zem; if (!Z) return;
  const bx = Z.V.x + Math.sin(Z.V.cap + Math.PI / 2) * .6, bz = Z.V.z + Math.cos(Z.V.cap + Math.PI / 2) * .6;
  T.trans = { t: 0, duree: .8, de: [S.x, S.z], vers: [bx, bz], fin: () => {
    T.mode = 'passager'; Z.phase = 'course'; if (Z.V.etiquette) Z.V.etiquette.visible = false; // on est dessus : plus besoin de l'étiquette
    const pts = itineraire(Z.V.x, Z.V.z, Z.V.cap, Z.dest[0], Z.dest[1]) || [[Z.V.x, Z.V.z], [Z.V.x + Math.sin(Z.V.cap) * 3, Z.V.z + Math.cos(Z.V.cap) * 3]]; // sans route connue : il ne coupe pas tout droit à travers la ville
    Z.P = { pts: surSaFile(pts), i: 0 }; Z.longueur = longueur(pts); retirerRuban(T.gps?.m); T.gps = { pts, m: ruban(pts), nom: Z.nom, x: Z.dest[0], z: Z.dest[1] };
    son('klaxon'); ligne('« On y va ! Tiens-toi bien. »');
  } };
}
// Le zém hélé suit son itinéraire sans voir la circulation : au départ, il traversait le camion arrêté à côté de lui.
// Il freine maintenant derrière ce qui roule devant lui (voitures, camions, zéms, tokpas proches : E.circulation)
// et, si le freinage n'a pas suffi, il s'arrête net au contact au lieu d'entrer dans la carrosserie.
// Pas ceux d'en face (ils sont sur l'autre file), ni les zéms et tokpas qui coupent sa route : eux s'arrêtent
// aussi pour le joueur, et les deux s'attendraient sans fin. Les voitures, elles, s'en vont au bout de 5 s (circulation.js).
function vitesseLibre(V, vmax) {
  const s = Math.sin(V.cap), c = Math.cos(V.cap), hl = (V.D?.long ?? 2) / 2, hw = (V.D?.larg ?? .8) / 2; let v = vmax;
  for (const W of E.circulation) {
    const meme = Math.cos(W.cap - V.cap); if (meme < -.5 || (meme < .3 && !W.type)) continue;
    const ax = W.px - V.x, az = W.pz - V.z, devant = ax * s + az * c, cote = Math.abs(ax * c - az * s);
    const tr = Math.abs(Math.sin(W.cap - V.cap)), lng = W.hl * (1 - tr) + W.hw * tr, lrg = W.hw * (1 - tr) + W.hl * tr; // W vu de face ou de travers
    // On visait (écart − 1,5) × 1,1, sans regarder si celui de devant roulait : collé à un camion lancé à 9 m/s,
    // le zém tombait à 2 m/s et décrochait, puis réaccélérait — « mon zém roule très lentement sans raison ».
    // On se cale maintenant sur sa vitesse (sa part dans notre axe), plus ce que l'écart permet de gagner.
    const ecart = devant - hl - lng;
    if (devant > 0 && ecart < 12 && cote < hw + lrg + .4) v = Math.min(v, ecart < 1.5 ? 0 : Math.max(0, (W.v || 0) * meme) + (ecart - 1.5) * .9);
  }
  return v;
}
// Sur sa file, à droite (comme les zéms de la circulation) : au milieu de la chaussée, il frôlait les voitures d'en face.
const FILE_ZEM = 1.1;
const surSaFile = pts => pts.length > 1 ? decalee(pts, FILE_ZEM) : pts;
function suivreSansTraverser(V, P, dt, vmax) {
  const L = (V.D?.long ?? 2) * .45, corpsEn = (x, z, cap) => { const s = Math.sin(cap), c = Math.cos(cap); let p = 0; for (const k of [-L, 0, L]) p = Math.max(p, dansCirculation(x + s * k, z + c * k, .35)); return p; };
  const corps = () => corpsEn(V.x, V.z, V.cap);
  const x = V.x, z = V.z, cap = V.cap, avant = corps();
  const libre = vitesseLibre(V, vmax), fini = suivreChemin(V, P, dt, V.passe > 0 ? Math.min(vmax, 6) : libre);
  let retenu = libre < .5;
  if (corps() > avant + .01) {
    V.x = x; V.z = z; V.cap = cap; V.v = 0; retenu = true; // ni en avançant, ni en tournant
    // Retenu plus de 4 s (un camion arrêté en travers) : le zém se faufile. Il passait auparavant à travers la
    // carrosserie — un testeur s'est vu assis dans un camion jaune (24/10). Il longe maintenant l'obstacle sur
    // le côté, comme un vrai zém, et reste solide : s'il n'y a pas la place, il attend.
    if (V.passe > 0) {
      const d = 1.6 * dt, s = Math.sin(cap + Math.PI / 2), c = Math.cos(cap + Math.PI / 2);
      for (const cote of V.cote > 0 ? [1, -1] : [-1, 1]) {
        const nx = x + s * d * cote, nz = z + c * d * cote;
        if (corpsEn(nx, nz, cap) <= avant + .01) { V.x = nx; V.z = nz; V.cote = cote; break; }
      }
    }
    V.g.position.set(V.x, V.y, V.z); V.g.rotation.y = V.cap;
  }
  if (V.passe > 0) V.passe -= dt;
  V.retenu = retenu ? (V.retenu || 0) + dt : 0;
  if (V.retenu > 4) { V.retenu = 0; V.passe = 1.5; V.cote = Math.random() < .5 ? 1 : -1; }
  return fini;
}
function majZem(dt) {
  const Z = T.zem; if (!Z) return;
  if (Z.phase === 'vient') { if (suivreSansTraverser(Z.V, Z.P, dt, 12)) { Z.phase = 'attend'; son('klaxon'); ligne('Ton zém est là : monte derrière lui !'); } }
  else if (Z.phase === 'attend') { Z.attente += dt; if (Z.attente > 90) { ligne('Le zém est reparti : tu l’as fait trop attendre.'); Z.phase = 'repart'; Z.repart = 0; } }
  else if (Z.phase === 'course') {
    const arrive = suivreSansTraverser(Z.V, Z.P, dt, 17) || (Math.hypot(Z.dest[0] - Z.V.x, Z.dest[1] - Z.V.z) < 6 && Z.V.v < 3); // à quelques mètres et presque arrêté : on y est
    if (arrive) finCourse(Z.prix, false);
  } else if (Z.phase === 'repart') { // il s'en va tout droit ; devant un mur ou une maison, il a déjà tourné au coin : on ne le voit plus
    Z.repart += dt;
    if (Z.repart > 1.2) { Z.V.v = Math.min(9, Z.V.v + 3 * dt); const nx = Z.V.x + Math.sin(Z.V.cap) * Z.V.v * dt, nz = Z.V.z + Math.cos(Z.V.cap) * Z.V.v * dt; if (dansBatiment(nx, nz) || dansObstacleRue(nx, nz, .5)) Z.repart = 9; else { Z.V.x = nx; Z.V.z = nz; Z.V.g.position.set(Z.V.x, Z.V.y, Z.V.z); Z.V.anim?.maj(Z.V.v, dt, true); } }
    if (Z.repart > 8) { retirerVehicule(Z.V); T.zem = null; }
  }
}

/** Ce que vaut le bout de chemin déjà fait, si l'on descend avant l'arrivée (au moins 100 F). */
function prixFait(Z) {
  const fait = Z.longueur ? 1 - reste(Z.P.pts, Z.V.x, Z.V.z).m / Z.longueur : 0;
  return Math.min(Z.prix, Math.max(100, Math.ceil(Z.prix * THREE.MathUtils.clamp(fait, 0, 1) / 50) * 50));
}
// Passer le trajet : la course se fait en temps réel, à 60 km/h (2 min de Moov à la Haie Vive, 8 d'Akpakpa à
// l'Amazone, 15 jusqu'à Fidjrossè). On peut la regarder, ou sauter au bout : fondu au noir, et l'on se retrouve à
// 80 m de l'arrivée, le zém roulant encore.
function passerTrajet() {
  const Z = T.zem; if (Z?.phase !== 'course' || Z.saute) return;
  Z.saute = true; fondu(true);
  setTimeout(() => {
    if (T.zem === Z && Z.phase === 'course') {
      const pts = Z.P.pts; let k = pts.length - 1, d = 0;
      while (k > 1) { const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); if (d + l >= 80) break; d += l; k--; }
      const [ax, az] = pts[k - 1], [bx, bz] = pts[k], l = Math.hypot(bx - ax, bz - az) || 1, f = Math.max(0, 1 - (80 - d) / l);
      placer(Z.V, ax + (bx - ax) * f, az + (bz - az) * f, Math.atan2(bx - ax, bz - az)); Z.V.v = 8; Z.P.i = k;
      S.saut = true; ligne(`Quelques minutes plus tard… On arrive : ${Z.nom}.`);
    }
    setTimeout(() => fondu(false), 500);
  }, 450);
}
function fondu(noir) {
  let f = $('#fondu'); if (!f) { f = document.createElement('div'); f.id = 'fondu'; f.className = 'fondu'; document.body.append(f); }
  f.classList.toggle('noir', noir);
}
/** Fin de la course : le zém s'arrête, on descend et on paie (`avant` : on descend avant d'être arrivé). */
function finCourse(prix, avant) {
  const Z = T.zem; if (!Z || Z.phase !== 'course') return;
  T.mode = 'pied'; Z.phase = 'paie'; Z.V.v = 0;
  const [px, pz] = [Math.PI / 2, -Math.PI / 2, Math.PI].map(a => [Z.V.x + Math.sin(Z.V.cap + a) * 1.1, Z.V.z + Math.cos(Z.V.cap + a) * 1.1]).find(([x, z]) => !dansBatiment(x, z) && !dansObstacleRue(x, z, .3)) || [Z.V.x, Z.V.z]; // du côté libre, jamais dans un mur
  S.x = px; S.z = pz; S.cap = Z.V.cap; S.y = 0; if (S.moi) S.moi.visible = true;
  retirerRuban(T.gps?.m); T.gps = null;
  depenser(prix, avant ? 'zém (descendu en route)' : `zém jusqu’à ${Z.nom}`).then(ok => {
    if (S.moi) remettre(S.moi, new THREE.Vector3(Z.V.x, Z.V.y + 1.3, Z.V.z), 'billet', { hautDe: 1.25, garder: .3 });
    ligne(!ok ? 'Tu n’as pas de quoi payer : le zém râle et repart…' : avant ? `Tu descends en route et tu paies le bout de chemin : ${fmt(prix)}.` : `Tu paies le zém : ${fmt(prix)}. « Merci, à la prochaine ! »`);
    Z.phase = 'repart'; Z.repart = 0;
  });
}

// ---------- Manger : commander, payer, porter son assiette, s'asseoir, manger ----------
const faimDe = prix => (prix <= 500 ? 8 : prix <= 900 ? 18 : Math.min(55, 35 + (prix - 1000) / 100));
function commander(c) {
  const ouvrir = $('#choix'); if (!ouvrir) return;
  choisir(`${c.nom} · Que veux-tu manger ?`, c.plats.map(([p, prix]) => ({ texte: p, sous: `${fmt(prix)} · faim +${Math.round(faimDe(prix))}`, f: () => payerPlat(c, p, prix) })));
}
async function payerPlat(c, plat, prix) {
  if (!(await depenser(prix, `${plat} (${c.nom})`))) { ligne(`Il te faut ${fmt(prix)} pour ça.`); return; }
  c.vendeur.userData.jouer?.('parle');
  payerEtRecevoir(S.moi, c.vendeur, 'plat', S.moi, { garder: .2, apres: () => { c.vendeur.userData.jouer?.('idle'); tenirPlat(plat, faimDe(prix)); } });
}
function assiette() {
  const g = new THREE.Group(), m = (geo, c) => { const o = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: c })); o.castShadow = false; g.add(o); return o; };
  m(new THREE.CylinderGeometry(.14, .11, .03, 18), '#f4f1ea');
  const repas = m(new THREE.SphereGeometry(.1, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), '#c8642c'); repas.position.y = .015; g.userData.repas = repas;
  return g;
}
/** Une assiette dans la main (commandée au food court, ou cuisinée chez soi : maison.js). */
export function tenirPlat(nom, points) {
  jeterPlat();
  const g = assiette(); (S.moi?.userData.main || scene).add(g); g.position.set(0, .05, .05);
  T.plat = { g, nom, points, reste: 1 };
  ligne(`Tu as ton ${nom.toLowerCase()} : assieds-toi pour manger, à une table ou sur ton tabouret.`);
}
function jeterPlat() { if (T.plat) { T.plat.g.parent?.remove(T.plat.g); T.plat = null; } }
/**
 * Appelé quand on s'assoit : l'assiette qu'on porte se pose devant soi, et on mange. `haut` est la hauteur
 * du plat : la table par défaut, les genoux (55 cm) quand on s'assoit sur son tabouret dans la rue.
 */
export function asseoir(c, haut) {
  if (!T.plat) return;
  const p = devantChaise(c.x, c.z, c.cap); T.plat.g.parent?.remove(T.plat.g); scene.add(T.plat.g); T.plat.g.position.set(p.x, S.y + (haut ?? p.y), p.z);
  T.repas = { t: 0, duree: 24, dit: 0, chaise: [c.x, c.z] };
}
function majRepas(dt) {
  const R = T.repas, P = T.plat; if (!R || !P) return;
  if (S.anim !== 'assis' || Math.hypot(S.x - R.chaise[0], S.z - R.chaise[1]) > .3) return; // on mange assis
  R.t += dt; manger(P.points * dt / R.duree); P.g.userData.repas.scale.setScalar(Math.max(.05, 1 - R.t / R.duree));
  R.dit += dt; if (R.dit > 7) { R.dit = 0; bulleLocale?.(S, (['Hmm, c’est bon !', 'Ça, c’est du bon.', 'Il faut revenir ici.'][Math.floor(Math.random() * 3)])); } // une bulle, pas un message à tout le salon
  if (R.t >= R.duree) { jeterPlat(); T.repas = null; sauverVie(); ligne(`Tu as bien mangé : faim ${Math.round(VIE.data.faim)} %.`); }
}

// ---------- Fenêtre de choix (zém, menu) ----------
export function choisir(titre, options, { annuler = 'Annuler' } = {}) {
  const el = $('#choix'); $('#chTitre').textContent = titre; const l = $('#chListe'); l.replaceChildren();
  l.classList.toggle('ch-pastilles', options.length > 0 && options.every(o => o.couleur)); // des couleurs : une grille de pastilles
  for (const o of options) {
    const b = document.createElement('button'); b.type = 'button'; const t = document.createElement('b'); t.textContent = o.texte; b.append(t);
    if (o.couleur) { const p = document.createElement('i'); p.className = 'ch-pastille'; p.style.background = o.couleur; p.setAttribute('aria-hidden', 'true'); b.prepend(p); }
    if (o.sous) { const s = document.createElement('small'); s.textContent = o.sous; b.append(s); }
    b.disabled = !!o.desactive; b.addEventListener('click', () => { el.hidden = true; o.f(); }); l.append(b);
  }
  $('#chAnnuler').textContent = annuler; $('#chAnnuler').onclick = () => { el.hidden = true; };
  el.hidden = false; l.querySelector('button:not(:disabled)')?.focus();
}

// ---------- À chaque image ----------
/**
 * av, tour : manette. Renvoie null à pied (le salon fait marcher le personnage), sinon le point suivi par la
 * caméra { x, y, z, cap, dist, haut }.
 */
export function majTrajets(dt, av, tour) {
  majStations(S.x, S.z); majZem(dt); majRepas(dt); majAeroports();
  const metier = majMetiers(dt); // apprenti de tokpa-tokpa : la caméra suit le minibus
  if (T.plat && !T.repas && S.anim === 'assis') { // l'assiette arrive alors qu'on est déjà assis (à une table, ou sur son tabouret dans la rue)
    const c = S.lieu ? siegeProche(S.lieu, S.x, S.z) : S.tabouret && { x: S.tabouret.x, z: S.tabouret.z, cap: S.cap };
    if (c && Math.hypot(c.x - S.x, c.z - S.z) < .3) asseoir(c, S.lieu ? undefined : .55);
  }
  if (T.trans) { // on marche jusqu'au véhicule (ya, yb : on monte sur l'aile de l'avion, on en descend)
    const A = T.trans; A.t += dt; const k = Math.min(1, A.t / A.duree);
    S.x = A.de[0] + (A.vers[0] - A.de[0]) * k; S.z = A.de[1] + (A.vers[1] - A.de[1]) * k; S.cap = Math.atan2(A.vers[0] - A.de[0], A.vers[1] - A.de[1]) || S.cap; S.anim = 'marche';
    if (A.ya !== undefined) S.y = A.ya + (A.yb - A.ya) * k;
    if (S.moi) { S.moi.position.set(S.x, S.y, S.z); S.moi.rotation.y = S.cap; S.moi.userData.jouer('marche'); }
    if (k >= 1) { T.trans = null; A.fin(); }
    return { x: S.x, y: S.y, z: S.z, cap: S.cap, dist: 6, haut: 2.6 };
  }
  if (metier) return metier;
  if (T.mode === 'avion') { const suivi = majVol(dt); if (suivi) return suivi; } // en vol (à l'arrivée : on redescend à pied)
  if (T.mode === 'conduit') {
    const V = T.veh, panne = !V.D.pedale && !(carburant() > 0); // un vélo ne tombe jamais en panne sèche
    if (panne && !T.panneDite) { T.panneDite = true; ligne(V.vol ? 'Panne sèche en plein vol ! La Roadster descend se poser.' : 'Panne sèche ! Tu avances au pas : « Aller » → « Station-service la plus proche » pour le GPS.'); }
    if (panne && V.vol?.phase === 'croisiere' && performance.now() > (T.poseT || 0)) { T.poseT = performance.now() + 1000; atterrir(V); } // plus d'essence : elle va se poser sur la route la plus proche
    const vol = V.vol, km0 = V.km, choc = piloter(V, av, tour, dt, { panne }); if (choc) { son('choc'); document.dispatchEvent(new CustomEvent('vibrer', { detail: 'choc' })); chocMetier(); }
    if (vol && !V.vol) { son('bosse'); ligne(vol.vers ? `Posée près de ${vol.vers}.` : 'La Roadster est posée.'); }
    if (!V.D.pedale) { T.conso += (V.km - km0) / V.D.kmParLitre; if (T.conso > .01) { consommer(T.conso); T.conso = 0; } }
    if (!V.D.pedale) moteurMaj(Math.abs(V.v), true);
    S.x = V.x; S.z = V.z; S.cap = V.cap; S.y = V.y; S.anim = 'assis';
    asseoirSur(S.moi, V, false); if (V.etiquette) V.etiquette.visible = false;
    const kmh = Math.round(Math.abs(V.v) * 3.6); $('#vhVitesse').hidden = false; $('#vhVitesse').textContent = `${kmh} km/h${V.vol ? ` · à ${Math.round(V.alt)} m` :V.v < -.2 ? ' · marche arrière' : ''}`;
    majGps(dt, V.x, V.z, V.cap, !!V.vol);
    if (V.vol) return { x: V.x, y: V.y, z: V.z, cap: V.cap, dist: 8 + V.alt * .11, haut: 3.2, libre: V.alt > 12 }; // de haut : on recule pour voir la ville sous la voiture
    return { x: V.x, y: V.y, z: V.z, cap: V.cap, dist: V.type === 'tokpa' ? 11 : V.D.cache ? 8 : 6, haut: V.type === 'tokpa' ? 4 : V.D.cache ? 3.2 : 2.6 };
  }
  $('#vhVitesse').hidden = true; for (const E of [T.veh, T.mode === 'passager' ? null : T.zem?.V]) if (E?.etiquette) E.etiquette.visible = !S.lieu && Math.hypot(E.x - S.x, E.z - S.z) > 4.5; // dedans, elle se verrait à travers les murs ; tout près, elle couvrait le nom du joueur et « Chez toi »
  if (T.mode === 'passager' && T.zem) {
    const V = T.zem.V; S.x = V.x; S.z = V.z; S.cap = V.cap; S.y = V.y; S.anim = 'assis';
    asseoirSur(S.moi, V, true); majGps(dt, V.x, V.z, V.cap);
    return { x: V.x, y: V.y, z: V.z, cap: V.cap, dist: 6, haut: 2.6 };
  }
  porterCasque(S.moi, false); // à pied : on l'a ôté en descendant
  majGps(dt, S.x, S.z, S.cap);
  return null;
}
/** Pose un personnage sur la selle (pilote ou passager), ou le cache dans la voiture. */
// Un tour de pédalier tous les 2,2 m environ : la phase suit la distance, donc les jambes s'arrêtent avec le vélo.
const phaseVelo = V => V.km * 1000 / 2.2 * Math.PI * 2;
export function asseoirSur(p, V, passager) {
  if (!p) return;
  const s = siege(V, passager); p.visible = !!s; porterCasque(p, !!s && (V.type === 'moto' || V.type === 'zem')); if (!s) return; // le casque intégral : sur une moto, pas à vélo
  v3.set(0, s.y, s.z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, V.cap);
  p.position.set(V.x + v3.x, V.y + v3.y, V.z + v3.z); p.rotation.y = V.cap; p.userData.jouer?.('assis');
  // Au guidon, « assis » ne suffit pas — c'est la pose d'une chaise : bras au guidon, et les jambes qui
  // tournent à vélo ou posées sur les cale-pieds à moto (personnages.js). Le passager, lui, reste assis.
  p.userData.velo?.(passager || V.D.cache ? null : V.D.pedale ? phaseVelo(V) : 'moto');
}
/** Pour les amis : leur véhicule sous eux (créé à la demande), dans la couleur qu'ils lui ont choisie (`vc`). */
export function vehiculeDe(A, type, vc = null) {
  if (!type) { if (A.veh) { retirerVehicule(A.veh); A.veh = null; if (A.g) { A.g.visible = true; porterCasque(A.g, false); } } return null; }
  if (!A.veh || A.veh.type !== type) { retirerVehicule(A.veh); A.veh = creerVehicule(type, { couleur: couleurPerso(type), peinture: vc }); }
  else peindre(A.veh, vc);
  return A.veh;
}
/** Pour les autres : leur véhicule garé (`gv` = [type, x, z, cap]), qu'on voit dans la rue et où l'on peut monter. */
export function vehiculeGareDe(A, gv, vc = null) {
  if (!gv) { if (A.garee) { retirerVehicule(A.garee); A.garee = null; } return null; }
  const [type, x, z, cap] = gv;
  if (!A.garee || A.garee.type !== type) { retirerVehicule(A.garee); A.garee = creerVehicule(type, { couleur: couleurPerso(type), peinture: vc }); A.garee.ou = ''; }
  else peindre(A.garee, vc);
  const ou = `${x},${z},${cap}`; if (A.garee.ou !== ou) { placer(A.garee, x, z, cap); A.garee.ou = ou; } // posée sur le sol une fois, pas à chaque image
  return A.garee;
}
