import * as THREE from 'three';
import { moteur, moteurMaj, moteurStop, son } from './audio.js';
import { $ } from './base.js';
import { construireReseau, noeudsPres } from './carrefours.js';
import { PRIX_LITRE, VEHICULES, creerVehicule, initStations, itineraire, longueur, majStations, piloter, placer, reste, retirerRuban, retirerVehicule, ruban, siege, stationProche, suivreChemin, surRoute } from './conduite.js';
import { comptoirProche, devantChaise, siegeProche } from './interieurs.js';
import { payerEtRecevoir, remettre } from './remise.js';
import { scene } from './scene.js';
import { VIE, consommer, depenser, faireLePlein, manger, reservoir, sauverVie } from './vie.js';

// ---------- Se déplacer et vivre en ville : véhicule, zém, essence, GPS, repas ----------
// Appelé par le salon (S : position, personnage, pièce où l'on est). On voit son personnage monter sur sa
// moto ou dans sa voiture, rouler sur les routes (conduite.js), s'arrêter à une station et payer le pompiste,
// héler un zém, négocier, monter derrière et payer à l'arrivée, commander au food court, porter son assiette,
// s'asseoir et manger. Chaque paiement est débité du portefeuille de « Ma vie » et se voit (billet, objet).

export const T = { mode: 'pied', veh: null, zem: null, gps: null, plat: null, repas: null, trans: null, conso: 0, panneDite: false, ctx: null, gpsT: 0 };
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const v3 = new THREE.Vector3();
let S = null, ligne = () => { };

export function initTrajets(data, ctx) { initStations(data.L.stations); S = ctx.S; ligne = ctx.ligne; }

// Un point de route libre près de (x, z), pour garer un véhicule ou faire venir un zém.
function pointDeRoute(x, z, rMin = 0, rMax = 25) {
  for (let r = rMin; r <= rMax; r += 1.5) for (let a = 0; a < 16; a++) { const px = x + Math.cos(a * Math.PI / 8) * r, pz = z + Math.sin(a * Math.PI / 8) * r; if (surRoute(px, pz)) return [px, pz]; }
  return null;
}
/** À l'arrivée dans le salon : son véhicule (Fils à papa : voiture ; moto louée) garé sur la route la plus proche. */
export function entrerMonde() {
  quitterMonde(); T.mode = 'pied';
  garerSonVehicule();
}
export function garerSonVehicule() {
  const type = VIE.data?.vehicule; if (!type || !VEHICULES[type] || T.veh) return;
  const p = pointDeRoute(S.x + Math.sin(S.cap + Math.PI / 2) * 4, S.z + Math.cos(S.cap + Math.PI / 2) * 4, 0, 150); if (!p) return;
  T.veh = creerVehicule(type, { couleur: type === 'voiture' ? '#7a1f2b' : '#a32b26' }); placer(T.veh, p[0], p[1], Math.atan2(p[0] - S.x, p[1] - S.z));
  const nom = type === 'voiture' ? 'Ta voiture' : 'Ta moto', e = etiquette(nom); e.position.y = type === 'voiture' ? 2.2 : 1.7; T.veh.g.add(e); T.veh.etiquette = e;
  const d = Math.round(Math.hypot(p[0] - S.x, p[1] - S.z) / 5) * 5; if (d > 8) ligne(`${nom} est garée sur la route, à ${d} m : suis l’étiquette jaune.`);
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
  moteurStop(); retirerVehicule(T.veh); T.veh = null; if (T.zem) retirerVehicule(T.zem.V); T.zem = null;
  retirerRuban(T.gps?.m); T.gps = null; jeterPlat(); T.repas = null; T.trans = null; T.mode = 'pied';
  if (S?.moi) S.moi.visible = true;
}

// ---------- Actions possibles (bouton principal et secondaire, touche E) ----------
export function actions() {
  const out = [], V = T.veh, D = VIE.data;
  if (T.trans) return out;
  if (T.mode === 'conduit') {
    const st = stationProche(V.x, V.z), R = reservoir(), manque = Math.round((R - (D?.carburant || 0)) * 10) / 10;
    if (st && Math.abs(V.v) < .6 && manque > .05) {
      const prix = Math.ceil(manque * PRIX_LITRE / 25) * 25, un = Math.min(manque, 1);
      if (D.argent >= prix) out.push({ texte: `Faire le plein · ${manque.toLocaleString('fr-FR')} L · ${fmt(prix)}`, f: () => plein(st, manque, prix) });
      else if (D.argent >= Math.ceil(un * PRIX_LITRE / 25) * 25) out.push({ texte: `Mettre ${un.toLocaleString('fr-FR')} L · ${fmt(Math.ceil(un * PRIX_LITRE / 25) * 25)}`, f: () => plein(st, un, Math.ceil(un * PRIX_LITRE / 25) * 25) });
    }
    if (Math.abs(V.v) < .8) out.push({ texte: V.D.cache ? 'Descendre de la voiture' : 'Descendre de la moto', f: descendre });
    return out;
  }
  if (T.mode === 'passager') return out;
  if (T.zem?.phase === 'attend' && Math.hypot(T.zem.V.x - S.x, T.zem.V.z - S.z) < 4.5) out.push({ texte: `Monter sur le zém · ${fmt(T.zem.prix)}`, f: monterZem });
  if (V && !S.lieu && Math.hypot(V.x - S.x, V.z - S.z) < 3.2) out.push({ texte: V.D.cache ? 'Monter dans ta voiture' : 'Monter sur ta moto', f: monter });
  if (S.lieu) { const c = comptoirProche(S.lieu, S.x, S.z); if (c && !T.plat) out.push({ texte: `Commander · ${c.nom}`, f: () => commander(c) }); }
  return out;
}

// ---------- Monter, descendre ----------
// Le personnage marche jusqu'au véhicule (moins d'une seconde), puis s'assoit sur la selle, ou ouvre la
// portière et disparaît dans la voiture.
function monter() {
  const V = T.veh; if (!V) return;
  const cote = V.D.cache ? 1.3 : .55, bx = V.x + Math.sin(V.cap + Math.PI / 2) * cote, bz = V.z + Math.cos(V.cap + Math.PI / 2) * cote;
  T.trans = { t: 0, duree: .9, de: [S.x, S.z], vers: [bx, bz], fin: () => { T.mode = 'conduit'; S.cap = V.cap; moteur(V.type); son('bosse'); ligne(V.D.cache ? 'Tu montes dans ta voiture. Flèches ou ZQSD : accélérer, freiner puis reculer, tourner.' : 'Tu montes sur ta moto. Flèches ou ZQSD : accélérer, freiner puis reculer, tourner.'); } };
}
function descendre() {
  const V = T.veh; if (!V || Math.abs(V.v) > .8) return;
  V.v = 0; moteurStop(); T.mode = 'pied';
  const cote = V.D.cache ? 1.6 : 1; S.x = V.x + Math.sin(V.cap + Math.PI / 2) * cote; S.z = V.z + Math.cos(V.cap + Math.PI / 2) * cote; S.cap = V.cap; S.y = 0;
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
  ligne(`Itinéraire jusqu’à ${nom} : ${(longueur(pts) / 1000).toFixed(1).replace('.', ',')} km. Suis la ligne bleue.`);
  return true;
}
function majGps(dt, x, z, cap) {
  const G = T.gps; if (!G) { $('#vhGps').hidden = true; return; }
  const r = reste(G.pts, x, z);
  if (Math.hypot(G.x - x, G.z - z) < 22) { ligne(`Tu es arrivé : ${G.nom}.`); son('arret'); retirerRuban(G.m); T.gps = null; $('#vhGps').hidden = true; return; }
  T.gpsT += dt;
  if (r.ecart > 35 && T.gpsT > 2) { T.gpsT = 0; const pts = itineraire(x, z, cap, G.x, G.z); if (pts) { retirerRuban(G.m); G.pts = pts; G.m = ruban(pts); } } // on s'est écarté : nouvel itinéraire
  $('#vhGps').hidden = false; $('#vhGps').textContent = `→ ${G.nom} · ${r.m > 950 ? `${(r.m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(r.m / 10) * 10} m`}`;
}

// ---------- Héler un zém : on négocie, il vient, on monte derrière, on paie à l'arrivée ----------
export function prixZem(x, z, cap, dx, dz) {
  construireReseau(); const pts = itineraire(x, z, cap, dx, dz); if (!pts) return null;
  const km = longueur(pts) / 1000; return { pts, km, prix: Math.max(200, Math.ceil((120 * km + 100) / 50) * 50) };
}
/** Le zém accepté arrive (il part d'une rue à 30-60 m). */
export function appelerZem(dx, dz, nom, prix) {
  if (T.zem) retirerVehicule(T.zem.V);
  const ici = pointDeRoute(S.x, S.z, 0, 30); if (!ici) { ligne('Pas de route ici : approche-toi d’une rue pour héler un zém.'); return; }
  const n = noeudsPres(ici[0], ici[1], 90).find(([, d]) => d > 30) || noeudsPres(ici[0], ici[1], 90).pop(); if (!n) return;
  const [X, Z] = noeudPos(n[0]), V = creerVehicule('zem'); placer(V, X, Z, Math.atan2(ici[0] - X, ici[1] - Z));
  const pts = itineraire(X, Z, V.cap, ici[0], ici[1]) || [[X, Z], ici];
  T.zem = { V, phase: 'vient', P: { pts, i: 0 }, dest: [dx, dz], nom, prix, attente: 0 };
  ligne(`Un zém arrive… (${fmt(prix)} jusqu’à ${nom})`);
}
const noeudPos = n => { const R = construireReseau(); return [R.X[n], R.Z[n]]; };
function monterZem() {
  const Z = T.zem; if (!Z) return;
  const bx = Z.V.x + Math.sin(Z.V.cap + Math.PI / 2) * .6, bz = Z.V.z + Math.cos(Z.V.cap + Math.PI / 2) * .6;
  T.trans = { t: 0, duree: .8, de: [S.x, S.z], vers: [bx, bz], fin: () => {
    T.mode = 'passager'; Z.phase = 'course';
    const pts = itineraire(Z.V.x, Z.V.z, Z.V.cap, Z.dest[0], Z.dest[1]) || [[Z.V.x, Z.V.z], Z.dest];
    Z.P = { pts, i: 0 }; retirerRuban(T.gps?.m); T.gps = { pts, m: ruban(pts), nom: Z.nom, x: Z.dest[0], z: Z.dest[1] };
    son('klaxon'); ligne('« On y va ! Tiens-toi bien. »');
  } };
}
function majZem(dt) {
  const Z = T.zem; if (!Z) return;
  if (Z.phase === 'vient') { if (suivreChemin(Z.V, Z.P, dt, 8)) { Z.phase = 'attend'; son('klaxon'); ligne('Ton zém est là : monte derrière lui !'); } }
  else if (Z.phase === 'attend') { Z.attente += dt; if (Z.attente > 90) { ligne('Le zém est reparti : tu l’as fait trop attendre.'); Z.phase = 'repart'; Z.repart = 0; } }
  else if (Z.phase === 'course') {
    if (suivreChemin(Z.V, Z.P, dt, 11)) { // arrivé : on descend et on paie
      T.mode = 'pied'; Z.phase = 'paie';
      S.x = Z.V.x + Math.sin(Z.V.cap + Math.PI / 2) * 1.1; S.z = Z.V.z + Math.cos(Z.V.cap + Math.PI / 2) * 1.1; S.cap = Z.V.cap; S.y = 0; if (S.moi) S.moi.visible = true;
      retirerRuban(T.gps?.m); T.gps = null;
      depenser(Z.prix, `zém jusqu’à ${Z.nom}`).then(ok => {
        if (S.moi) remettre(S.moi, new THREE.Vector3(Z.V.x, Z.V.y + 1.3, Z.V.z), 'billet', { hautDe: 1.25, garder: .3 });
        ligne(ok ? `Tu paies le zém : ${fmt(Z.prix)}. « Merci, à la prochaine ! »` : 'Tu n’as pas de quoi payer : le zém râle et repart…');
        Z.phase = 'repart'; Z.repart = 0;
      });
    }
  } else if (Z.phase === 'repart') { Z.repart += dt; if (Z.repart > 1.2) { Z.V.v = Math.min(9, Z.V.v + 3 * dt); Z.V.x += Math.sin(Z.V.cap) * Z.V.v * dt; Z.V.z += Math.cos(Z.V.cap) * Z.V.v * dt; Z.V.g.position.set(Z.V.x, Z.V.y, Z.V.z); } if (Z.repart > 8) { retirerVehicule(Z.V); T.zem = null; } }
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
function tenirPlat(nom, points) {
  jeterPlat();
  const g = assiette(); (S.moi?.userData.main || scene).add(g); g.position.set(0, .05, .05);
  T.plat = { g, nom, points, reste: 1 };
  ligne(`Tu as ton ${nom.toLowerCase()} : assieds-toi à une table pour manger.`);
}
function jeterPlat() { if (T.plat) { T.plat.g.parent?.remove(T.plat.g); T.plat = null; } }
/** Appelé quand on s'assoit sur une chaise : l'assiette qu'on porte se pose sur la table, et on mange. */
export function asseoir(c) {
  if (!T.plat) return;
  const p = devantChaise(c.x, c.z, c.cap); T.plat.g.parent?.remove(T.plat.g); scene.add(T.plat.g); T.plat.g.position.set(p.x, S.y + p.y, p.z);
  T.repas = { t: 0, duree: 24, dit: 0, chaise: [c.x, c.z] };
}
function majRepas(dt) {
  const R = T.repas, P = T.plat; if (!R || !P) return;
  if (S.anim !== 'assis' || Math.hypot(S.x - R.chaise[0], S.z - R.chaise[1]) > .3) return; // on mange assis
  R.t += dt; manger(P.points * dt / R.duree); P.g.userData.repas.scale.setScalar(Math.max(.05, 1 - R.t / R.duree));
  R.dit += dt; if (R.dit > 7) { R.dit = 0; S.dire?.(['Hmm, c’est bon !', 'Ça, c’est du bon.', 'Il faut revenir ici.'][Math.floor(Math.random() * 3)]); }
  if (R.t >= R.duree) { jeterPlat(); T.repas = null; sauverVie(); ligne(`Tu as bien mangé : faim ${Math.round(VIE.data.faim)} %.`); }
}

// ---------- Fenêtre de choix (zém, menu) ----------
export function choisir(titre, options, { annuler = 'Annuler' } = {}) {
  const el = $('#choix'); $('#chTitre').textContent = titre; const l = $('#chListe'); l.replaceChildren();
  for (const o of options) {
    const b = document.createElement('button'); b.type = 'button'; const t = document.createElement('b'); t.textContent = o.texte; b.append(t);
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
  majStations(S.x, S.z); majZem(dt); majRepas(dt);
  if (T.plat && !T.repas && S.anim === 'assis' && S.lieu) { const c = siegeProche(S.lieu, S.x, S.z); if (c && Math.hypot(c.x - S.x, c.z - S.z) < .3) asseoir(c); } // l'assiette arrive alors qu'on est déjà assis
  if (T.trans) { // on marche jusqu'au véhicule
    const A = T.trans; A.t += dt; const k = Math.min(1, A.t / A.duree);
    S.x = A.de[0] + (A.vers[0] - A.de[0]) * k; S.z = A.de[1] + (A.vers[1] - A.de[1]) * k; S.cap = Math.atan2(A.vers[0] - A.de[0], A.vers[1] - A.de[1]) || S.cap; S.anim = 'marche';
    if (S.moi) { S.moi.position.set(S.x, S.y, S.z); S.moi.rotation.y = S.cap; S.moi.userData.jouer('marche'); }
    if (k >= 1) { T.trans = null; A.fin(); }
    return { x: S.x, y: S.y, z: S.z, cap: S.cap, dist: 6, haut: 2.6 };
  }
  if (T.mode === 'conduit') {
    const V = T.veh, D = VIE.data, panne = !(D?.carburant > 0);
    if (panne && !T.panneDite) { T.panneDite = true; ligne('Panne sèche ! Tu avances au pas : « Aller à » → « Station-service la plus proche » pour le GPS.'); }
    const km0 = V.km, choc = piloter(V, av, tour, dt, { panne }); if (choc) { son('choc'); document.dispatchEvent(new CustomEvent('vibrer', { detail: 'choc' })); }
    T.conso += (V.km - km0) / V.D.kmParLitre; if (T.conso > .01) { consommer(T.conso); T.conso = 0; }
    moteurMaj(Math.abs(V.v), true);
    S.x = V.x; S.z = V.z; S.cap = V.cap; S.y = V.y; S.anim = 'assis';
    asseoirSur(S.moi, V, false); if (V.etiquette) V.etiquette.visible = false;
    const kmh = Math.round(Math.abs(V.v) * 3.6); $('#vhVitesse').hidden = false; $('#vhVitesse').textContent = `${kmh} km/h${V.v < -.2 ? ' · marche arrière' : ''}`;
    majGps(dt, V.x, V.z, V.cap);
    return { x: V.x, y: V.y, z: V.z, cap: V.cap, dist: V.D.cache ? 8 : 6, haut: V.D.cache ? 3.2 : 2.6 };
  }
  $('#vhVitesse').hidden = true; if (T.veh?.etiquette) T.veh.etiquette.visible = true;
  if (T.mode === 'passager' && T.zem) {
    const V = T.zem.V; S.x = V.x; S.z = V.z; S.cap = V.cap; S.y = V.y; S.anim = 'assis';
    asseoirSur(S.moi, V, true); majGps(dt, V.x, V.z, V.cap);
    return { x: V.x, y: V.y, z: V.z, cap: V.cap, dist: 6, haut: 2.6 };
  }
  majGps(dt, S.x, S.z, S.cap);
  return null;
}
/** Pose un personnage sur la selle (pilote ou passager), ou le cache dans la voiture. */
export function asseoirSur(p, V, passager) {
  if (!p) return;
  const s = siege(V, passager); p.visible = !!s; if (!s) return;
  v3.set(0, s.y, s.z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, V.cap);
  p.position.set(V.x + v3.x, V.y + v3.y, V.z + v3.z); p.rotation.y = V.cap; p.userData.jouer?.('assis');
}
/** Pour les amis : leur véhicule sous eux (créé à la demande). */
export function vehiculeDe(A, type) {
  if (!type) { if (A.veh) { retirerVehicule(A.veh); A.veh = null; if (A.g) A.g.visible = true; } return null; }
  if (!A.veh || A.veh.type !== type) { retirerVehicule(A.veh); A.veh = creerVehicule(type); }
  return A.veh;
}
