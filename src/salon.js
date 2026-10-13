import * as THREE from 'three';
import { $, coarse, toXZ } from './base.js';
import { PLACES } from './donnees-lieux.js';
import { creerGuide } from './guide.js';
import { personne } from './discussions.js';
import { INTERIEURS, arriveeDedans, arriveeDehors, cacherInterieurs, limiter, murEntre, ouvrirInterieur, porteProche, profondeurInterieur, siegeProche } from './interieurs.js';
import { actionsMaison, initMaison, maisonActuelle, majMaison, occupe, quitterMaison, reveil } from './maison.js';
import { E } from './etat.js';
import { firebase, joueur } from './firebase.js';
import { startFlight } from './interface.js';
import { JEU } from './jeu.js';
import { chargerDanses, chargerTenue, personnage3d, personnagesCharges, personnagesPrets } from './personnages.js';
import { stationLaPlusProche, surRoute } from './conduite.js';
import { dansBatiment, obstaclesPres, profondeurRue } from './rue.js';
import { T, actions, appelerZem, asseoir, asseoirSur, choisir, entrerMonde, garerSonVehicule, gps, initTrajets, majTrajets, prixZem, quitterMonde, vehiculeDe } from './trajets.js';
import { creerAvion, etatVol, poserAvion, retirerAvion } from './vol.js';
import { VIE, alerteDuJour, assurerVie, ecrire as ecrireVie, louerMoto, majVie, prechargerVie, rendreVie, sauverVie, surAnnonce, vitesseFaim } from './vie.js';
const ecrireModele = modele => ecrireVie({ modele });
import { basculerPause, finirJournee, menuTravail } from './metiers.js';
import { TENUES, choixGenre, estFemme, grilleTenues, initGarderobe, ouvrirGarderobe } from './garderobe.js';
import { son } from './audio.js';
import { camera, canvas, controls, scene } from './scene.js';

// ---------- Salon entre amis : se retrouver dans Cotonou ----------
// Jusqu'à 8 amis dans la même ville : chacun se promène à pied avec son personnage, voit les autres,
// discute (chat et bulles au-dessus des têtes), salue, danse, rit, s'assoit, et propose d'aller ensemble
// à l'Amazone, à la Haie Vive, à la plage ou au siège de Moov, ou en avion jusqu'à Ouidah (vol.js). On invite
// ses amis par un lien (WhatsApp).
// En ligne : Firebase Realtime Database du projet zem-run-cotonou, connexion anonyme, règles dans
// database.rules.json. Avec ?salon-local dans l'adresse, les onglets du même navigateur se relient sans
// serveur (BroadcastChannel) : c'est le mode de test.

const MAX = 8, ENVOI = .2, LETTRES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', CLE = 'cotonou3d.salon';
const GESTES = [['salut', 'Saluer'], ['danse1', 'Danser'], ['rire', 'Rire'], ['assis', 'S’asseoir'], ['telephone', 'Téléphoner']];
const ANIMS = new Set(['idle', 'marche', 'parle', ...GESTES.map(g => g[0])]);
const PHRASES = ['Ça va ?', 'On y va !', 'On mange où ?', 'Attends-moi !', 'Trop bien ici', 'Viens voir !'];
// Lieux de rendez-vous : id dans PLACES, nom dans le menu, « je vais … », décalage du point d'arrivée (mètres,
// x vers l'est, z vers le sud) et direction du regard (0 = vers le sud). Toujours dans un espace dégagé : la
// caméra se tient 7 m derrière. Haie Vive : rue Les Cocotiers, celle des maquis (Le Lambi's, Cordon Bleu…).
const LIEUX = [['maison', 'Chez moi', 'chez moi', 0, 0, 0], ['station', 'Station-service la plus proche', 'faire le plein', 0, 0, 0], ['amazone', 'Esplanade de l’Amazone', 'à l’esplanade de l’Amazone', 0, -62, 0], ['cite', 'Cité ministérielle (food court)', 'au food court de la Cité ministérielle', 0, 0, 0, 'cite-foodcourt'], ['haievive', 'Haie Vive (rue des maquis)', 'à la Haie Vive', -65, -153, Math.PI / 2], ['fidjrosse', 'Plage de Fidjrossè', 'à la plage de Fidjrossè', 0, 0, 0], ['moov', 'Siège de Moov Africa', 'au siège de Moov', 5, -22, 0], ['aeroport', 'Aéroport (vols pour Ouidah)', 'à l’aéroport', 0, 0, 0, 'aeroport-hall'], ['porte', 'Porte du Non-Retour (Ouidah)', 'à la Porte du Non-Retour, à Ouidah', 0, -30, 0]]; // 7e : intérieur dont on arrive devant la porte
const CLAVIER = { KeyV: 'vue', KeyE: 'porte', KeyR: 'action2', KeyF: 'action3', ArrowUp: 'avant', KeyW: 'avant', ArrowDown: 'arriere', KeyS: 'arriere', ArrowLeft: 'gauche', KeyA: 'gauche', ArrowRight: 'droite', KeyD: 'droite', ShiftLeft: 'court', ShiftRight: 'court' }; // touches physiques : WASD en QWERTY = ZQSD en AZERTY

const S = { actif: false, local: false, vueReelle: false, nonLus: 0, pad: null, tangage: .4, vue: 0, lieu: null, y: 0, devant: null, canal: null, code: '', nom: '', modele: 'vendeuse', moi: null, bulle: null, bulleFin: 0, x: 0, z: 0, cap: 0, anim: 'idle', geste: 'idle', gesteFin: 0, touches: new Set(), joy: null, glisse: null, envoi: 0, depuis: 0, dernier: '', dist: 7, saut: false, minDist: 20, autres: new Map(), vus: new Set() };
export const salonActif = () => S.actif;
const cible = new THREE.Vector3(), voulue = new THREE.Vector3();
const r2 = v => Math.round(v * 100) / 100;
const nettoyer = (t, n) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const graine = id => { let h = 0; for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h % 100000; };
const codeAleatoire = () => Array.from({ length: 6 }, () => LETTRES[Math.floor(Math.random() * LETTRES.length)]).join('');
const statut = (t, ton = '') => { const el = $('#slEtat'); if (!el) return; el.hidden = !t; el.textContent = t || ''; el.className = `ev-etat ${ton}`; };
const attendre = ms => new Promise(r => setTimeout(r, ms));

// ---------- Connexion : Firebase, ou les onglets du même navigateur (mode test) ----------
// Une connexion : { id, envoyer(etat), dire(message), quitter() } ; R.etat(id, etat | null), R.message(m).
function canalLocal(code, R) {
  const id = Math.random().toString(36).slice(2, 10), bc = new BroadcastChannel(`zemrun-salon-${code}`), vus = new Map();
  R.id = id;
  bc.onmessage = ({ data: d }) => {
    if (!d || d.id === id) return;
    if (d.type === 'etat') { vus.set(d.id, performance.now()); R.etat(d.id, d.etat); }
    else if (d.type === 'part') { vus.delete(d.id); R.etat(d.id, null); }
    else if (d.type === 'msg') R.message(d.msg);
  };
  const veille = setInterval(() => { const t = performance.now(); for (const [k, v] of vus) if (t - v > 6000) { vus.delete(k); R.etat(k, null); } }, 2000);
  return {
    id, envoyer: etat => bc.postMessage({ type: 'etat', id, etat }),
    dire: msg => { const m = { ...msg, u: id, t: Date.now(), cle: `${id}-${Date.now()}` }; bc.postMessage({ type: 'msg', id, msg: m }); R.message(m); },
    quitter: () => { bc.postMessage({ type: 'part', id }); clearInterval(veille); bc.close(); },
  };
}
async function canalFirebase(code, R) {
  const { d, db } = await firebase(), user = await joueur();
  R.id = user.uid;
  const base = d.ref(db, `zem_salons/${code}`), joueurs = d.child(base, 'joueurs'), moi = d.child(joueurs, user.uid), msgs = d.child(base, 'messages');
  const deja = await d.get(joueurs);
  if (deja.size >= MAX && !deja.hasChild(user.uid)) throw Object.assign(new Error('complet'), { code: 'complet' });
  await d.onDisconnect(moi).remove(); // téléphone éteint, 4G coupée : on disparaît du salon tout seul
  const autre = f => s => { if (s.key !== user.uid) f(s); };
  const off = [
    d.onChildAdded(joueurs, autre(s => R.etat(s.key, s.val()))),
    d.onChildChanged(joueurs, autre(s => R.etat(s.key, s.val()))),
    d.onChildRemoved(joueurs, s => R.etat(s.key, null)),
    d.onChildAdded(d.query(msgs, d.limitToLast(30)), s => R.message({ ...s.val(), cle: s.key })),
  ];
  return {
    id: user.uid,
    envoyer: etat => d.set(moi, etat).catch(() => { }),
    dire: msg => d.push(msgs, { ...msg, u: user.uid, t: d.serverTimestamp() }).catch(() => ligne('Message non envoyé : vérifie ta connexion.')),
    quitter: () => { off.forEach(f => f()); d.onDisconnect(moi).cancel().catch(() => { }); d.remove(moi).catch(() => { }); },
  };
}
function erreur(e) {
  const c = e?.code || '';
  if (c === 'complet') return `Ce salon est complet (${MAX} amis au maximum).`;
  if (/operation-not-allowed|admin-restricted/.test(c)) return 'Le salon en ligne n’est pas encore activé (connexion anonyme Firebase).';
  if (/network|unavailable/.test(c) || !navigator.onLine) return 'Pas de connexion internet : réessaie dans un instant.';
  if (/permission|PERMISSION_DENIED/i.test(c + e?.message)) return 'Le salon en ligne n’est pas encore prêt (base Firebase).';
  return `Connexion impossible (${c || e?.message || 'erreur'}).`;
}

// ---------- Personnages ----------
async function creerAvatar(modele, i) {
  for (let k = 0; k < 6 && !personnagesPrets(); k++) await attendre(250); // les modèles se chargent en tâche de fond : pas plus d'une seconde et demie, le personnage animé remplacera le dessiné à son arrivée
  let id = modele;
  if (id.startsWith('t:')) { id = id.slice(2); if (!(await chargerTenue(id))) id = 'jeune'; } // tenue de la boutique de mode
  const g = personnage3d(i, { role: id }) || personnage3d(i) || personne(i);
  g.userData.jouer ??= () => { };
  return g;
}
function etiquette(texte, moi = false) {
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 72; const c = cv.getContext('2d');
  c.font = '700 30px system-ui, sans-serif'; const w = Math.min(300, c.measureText(texte).width + 44);
  c.fillStyle = moi ? '#f2b705' : 'rgba(20, 24, 32, .84)'; c.beginPath(); c.roundRect(160 - w / 2, 8, w, 54, 27); c.fill();
  c.fillStyle = moi ? '#17130c' : '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(texte, 160, 36);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  // Taille fixe à l'écran (comme dans les jeux) : lisible de loin, pas envahissant de près ni sur un téléphone en hauteur.
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false })); s.scale.set(.145, .033, 1); s.position.y = .36; s.renderOrder = 30; return s;
}
// Bulle de discussion au-dessus de la tête, six secondes.
function bulle(qui, texte) {
  if (!qui.g) return;
  retirerBulle(qui);
  const mots = nettoyer(texte, 90).split(' '), lignes = ['']; for (const m of mots) { const l = lignes[lignes.length - 1]; if ((l + ' ' + m).trim().length > 28 && l) { if (lignes.length === 3) break; lignes.push(m); } else lignes[lignes.length - 1] = (l + ' ' + m).trim(); }
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64 + 48 * lignes.length; const c = cv.getContext('2d');
  c.fillStyle = '#fffaf0'; c.beginPath(); c.roundRect(8, 8, 496, cv.height - 30, 28); c.fill();
  c.beginPath(); c.moveTo(236, cv.height - 23); c.lineTo(256, cv.height - 4); c.lineTo(276, cv.height - 23); c.fill();
  c.fillStyle = '#1f1b16'; c.font = '600 34px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  lignes.forEach((l, k) => c.fillText(l, 256, 44 + k * 48));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false })); s.scale.set(.26, .26 * cv.height / 512, 1); s.center.set(.5, 0); s.position.y = .62; s.renderOrder = 31; // posée au-dessus du nom
  qui.g.userData.tete.add(s); qui.bulle = s; qui.bulleFin = performance.now() + 6000;
}
function retirerBulle(qui) { if (!qui.bulle) return; qui.bulle.parent?.remove(qui.bulle); qui.bulle.material.map.dispose(); qui.bulle.material.dispose(); qui.bulle = null; }
function retirer(A) { if (A.g) { retirerBulle(A); scene.remove(A.g); A.g.userData.liberer?.(); A.g = null; } retirerAvion(A.avion); A.avion = null; }

// ---------- Les autres joueurs ----------
function surEtat(id, e) {
  let A = S.autres.get(id);
  if (!e) { if (A) { retirer(A); S.autres.delete(id); majListe(); if (A.nom) ligne(`${A.nom} a quitté le salon.`); } return; }
  if (typeof e.x !== 'number' || typeof e.z !== 'number') return;
  if (!A) { A = { id, x: e.x, z: e.z, cap: e.h || 0, nom: '', modele: '', g: null, enCours: false, bulle: null, bulleFin: 0 }; S.autres.set(id, A); }
  A.etat = e;
  const nom = nettoyer(e.n, 16) || 'Ami';
  if (nom !== A.nom) { const nouveau = !A.nom; A.nom = nom; if (A.g) { A.g.userData.tete.remove(A.etiquette); A.etiquette = etiquette(nom); A.g.userData.tete.add(A.etiquette); } majListe(); if (nouveau) ligne(`${nom} est arrivé dans le salon.`); }
  if (e.m !== A.modele && !A.enCours) habiller(A);
}
async function habiller(A) {
  A.enCours = true; const m = nettoyer(A.etat.m, 40) || 'jeune';
  const g = await creerAvatar(m, graine(A.id));
  A.enCours = false;
  if (!S.actif || S.autres.get(A.id) !== A) { g.userData.liberer?.(); return; }
  retirer(A); A.g = g; A.modele = m; g.position.set(A.x, 0, A.z); g.rotation.y = A.cap; scene.add(g);
  A.etiquette = etiquette(A.nom); g.userData.tete.add(A.etiquette);
  if (A.etat.m !== m) habiller(A); // il a changé de personnage entre-temps
}
function majListe() {
  const el = $('#slNb'); if (!el) return;
  const n = S.autres.size + 1; el.textContent = n === 1 ? 'Tu es seul pour l’instant' : `${n} amis : ${[S.nom, ...[...S.autres.values()].map(A => A.nom)].filter(Boolean).join(', ')}`;
}

// ---------- Chat ----------
function ligne(texte, { nom = '', lieu = null, moi = false } = {}) {
  const ol = $('#slMessages'); if (!ol) return;
  const li = document.createElement('li'); li.className = nom ? (moi ? 'moi' : '') : 'systeme';
  if (nom) { const b = document.createElement('b'); b.textContent = nom; li.append(b, ' '); }
  li.append(texte);
  if (lieu && !moi) { const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = 'Y aller'; bt.addEventListener('click', () => aller(lieu, false)); li.append(' ', bt); }
  ol.append(li); while (ol.children.length > 40) ol.firstChild.remove();
  if (nom && !moi && !$('#slChat').classList.contains('ouvert') && matchMedia('(max-width: 720px)').matches) { S.nonLus++; const n = $('#slNonLus'); n.textContent = S.nonLus; n.hidden = false; }
  ol.scrollTop = ol.scrollHeight;
}
function surMessage(m) {
  if (!m || S.vus.has(m.cle)) return; S.vus.add(m.cle);
  const moi = m.u === S.R?.id, texte = nettoyer(m.txt, 140), lieu = LIEUX.some(l => l[0] === m.lieu) ? m.lieu : null;
  if (!texte) return;
  ligne(texte, { nom: nettoyer(m.n, 16) || 'Ami', lieu, moi });
  if (typeof m.t === 'number' && Date.now() - m.t > 15000) return; // l'historique ne fait pas de bulles
  if (moi) bulle(S, texte); else { const A = S.autres.get(m.u); if (A) bulle(A, texte); }
}
function dire(texte) {
  texte = nettoyer(texte, 140); if (!texte || !S.canal) return;
  S.canal.dire({ n: S.nom, txt: texte });
}
function geste(nom) {
  if (nom === 'telephone') { // l'animation du téléphone est une pose assise : sur une chaise s'il y en a une, sinon debout, le téléphone à la main
    const c = S.lieu && siegeProche(S.lieu, S.x, S.z);
    if (c) { S.x = c.x; S.z = c.z; S.cap = c.cap; } else { telephoneEnMain(); bulle(S, 'Allô ? Oui, je suis à Cotonou !'); S.geste = 'idle'; S.gesteFin = 0; return; }
  }
  if (nom === 'assis') { // sur la chaise libre la plus proche (il n'y a des chaises que dans les lieux où l'on entre)
    const c = S.lieu && siegeProche(S.lieu, S.x, S.z); if (!c) { ligne(S.lieu ? 'Approche-toi d’une table pour t’asseoir.' : 'Entre dans un lieu (le food court de la Cité…) pour t’asseoir à une table.'); return; }
    S.x = c.x; S.z = c.z; S.cap = c.cap; asseoir(c); // si l'on porte une assiette, on la pose et on mange
  }
  S.geste = nom; S.gesteFin = nom === 'salut' || nom === 'rire' ? performance.now() + 3200 : 0; // saluer et rire durent un moment, danser et s'asseoir jusqu'au prochain pas
  if (nom === 'danse1' && personnagesPrets()) chargerDanses();
}
// Un téléphone dans la main, quelques secondes.
function telephoneEnMain() {
  if (!S.moi) return; S.tel?.parent?.remove(S.tel);
  const t = new THREE.Mesh(new THREE.BoxGeometry(.07, .14, .015), new THREE.MeshLambertMaterial({ color: '#1d2024' })); t.position.set(0, .04, .03);
  (S.moi.userData.main || S.moi).add(t); S.tel = t; clearTimeout(S.telFin); S.telFin = setTimeout(() => { t.parent?.remove(t); t.geometry.dispose(); }, 6000);
}
/** Point d'arrivée d'un lieu de rendez-vous : [x, z, regard] (devant la porte pour un lieu où l'on entre). */
function destination(L) {
  if (L[0] === 'station') { const st = stationLaPlusProche(S.x, S.z); return st && [st[0], st[1], 0]; }
  if (L[0] === 'maison') { const I = maisonActuelle(); if (!I) return null; const a = arriveeDehors(I); return [a.x, a.z, a.cap + Math.PI]; } // devant sa porte (maison.js)
  const p = PLACES.find(q => q.id === L[0]), I = L[6] && INTERIEURS.get(L[6]); if (!p) return null;
  if (I) { const a = arriveeDehors(I); return [a.x, a.z, a.cap + Math.PI]; }
  const [x, z] = toXZ(p.lat, p.lon); return [x + L[3], z + L[4], L[5]];
}
/** Se rend à un lieu de rendez-vous ; `proposer` : prévient les autres, qui peuvent suivre d'un clic. En voiture
 *  ou à moto, on n'y saute pas : le GPS trace l'itinéraire par les routes. */
function aller(id, proposer = true) {
  const L = LIEUX.find(l => l[0] === id), p = PLACES.find(q => q.id === id) || ((id === 'station' || id === 'maison') && {}); if (!L || !p) return;
  if (T.mode === 'conduit') { const d = destination(L); if (d) gps(d[0], d[1], id === 'station' ? (stationLaPlusProche(S.x, S.z)?.[2] || L[1]) : L[1]); return; }
  if (T.mode !== 'pied') return;
  const I = id === 'maison' ? maisonActuelle() : L[6] && INTERIEURS.get(L[6]);
  if (I && S.lieu === I) return; // on y est déjà
  if (S.lieu) dehors(false);
  if (id === 'station') { const d = destination(L); if (!d) return; S.x = d[0] + 6; S.z = d[1]; S.cap = -Math.PI / 2; }
  else if (I) { const a = arriveeDehors(I); S.x = a.x + (Math.random() - .5) * 2; S.z = a.z; S.cap = a.cap + Math.PI; } // devant la porte, face à elle
  else { const [x, z] = toXZ(p.lat, p.lon); S.x = x + L[3] + (Math.random() - .5) * 4; S.z = z + L[4] + (Math.random() - .5) * 4; S.cap = L[5]; }
  S.saut = true; S.geste = 'idle';
  if (proposer && id !== 'station' && id !== 'maison') S.canal?.dire({ n: S.nom, txt: `Je vais ${L[2]}, venez !`, lieu: id });
}

// ---------- Intérieurs : entrer dans un bâtiment, en sortir ----------
function dedans(I) {
  ouvrirInterieur(I); const a = arriveeDedans(I);
  S.lieu = I; S.y = a.y; S.x = a.x; S.z = a.z; S.cap = a.cap; S.saut = true; S.geste = 'idle'; S.dist = Math.min(S.dist, I.prive ? 3.2 : 4.5);
  document.getElementById('app').classList.add('dedans');
  if (!I.prive) S.canal?.dire({ n: S.nom, txt: `Je suis dans ${I.nom}, venez !`, lieu: LIEUX.find(l => l[6] === I.id)?.[0] }); // chez soi : on ne l'annonce pas
}
function dehors(replacer = true) {
  const I = S.lieu; if (!I) return;
  quitterMaison(); // plus couché ni sous la douche
  S.lieu = null; S.y = 0; S.geste = 'idle'; // assis à table dedans : debout dans la rue
  cacherInterieurs(); document.getElementById('app').classList.remove('dedans');
  if (replacer) { const a = arriveeDehors(I); S.x = a.x; S.z = a.z; S.cap = a.cap; S.saut = true; }
}
function porte() { S.actions?.[0]?.f(); } // touche E : l'action principale du moment

// ---------- Entrer, quitter ----------
async function entrer(code) {
  if (S.actif) return;
  const nom = nettoyer($('#slNom').value, 16); if (!nom) { statut('Écris ton nom pour que tes amis te reconnaissent.', 'mal'); $('#slNom').focus(); return; }
  S.nom = nom; try { localStorage.setItem(CLE, JSON.stringify({ nom, modele: S.modele })); } catch { /* navigation privée */ }
  statut('Chargement de ta vie…');
  VIE.femme = estFemme(S.modele); // les métiers au féminin ou au masculin
  S.autres.clear(); S.vus.clear();
  const R = S.R = { etat: surEtat, message: surMessage }; // R.id : mon identifiant, connu avant les premiers messages
  // Le salon se connecte pendant que la vie se charge (et pendant le tirage du départ, la première fois).
  const canal = (S.local ? Promise.resolve().then(() => canalLocal(code, R)) : canalFirebase(code, R)).then(c => ({ c }), e => ({ e }));
  const vie = await assurerVie(S.local, { nom, modele: S.modele }); // la première fois : tirage du départ
  if (!vie) { (await canal).c?.quitter(); statut('Impossible de charger ta vie : vérifie ta connexion.', 'mal'); return; }
  statut('Connexion au salon…');
  const { c, e } = await canal;
  if (e) { console.warn('salon', e); statut(erreur(e), 'mal'); return; }
  S.canal = c;
  S.code = code; S.actif = true; statut('');
  $('#salon').hidden = true; $('#salonHud').hidden = false; $('#slCodeAff').textContent = code; $('#slJoy').hidden = !coarse;
  document.getElementById('app').classList.add('mode-salon');
  // À pied, il faut la ville en 3D autour de soi : la « Vue réelle » (images Google à plat) attendra la sortie.
  S.vueReelle = $('#togGoogle')?.getAttribute('aria-pressed') === 'true'; if (S.vueReelle) $('#togGoogle').click();
  E.flight = null; S.minDist = controls.minDistance; controls.minDistance = 1.5; controls.enabled = false; controls.autoRotate = false;
  camera.near = .3; camera.updateProjectionMatrix(); // caméra proche du personnage (comme dans Zém Run)
  const maison = maisonActuelle(); // la partie commence chez soi, au lit (maison.js)
  if (maison) { dedans(maison); reveil(maison); } else aller('amazone', false);
  majListe(); rendreVie();
  ligne(`Bienvenue dans le salon ${code}${S.local ? ' (mode test : seuls les onglets de ce navigateur se voient)' : ''} ! Invite tes amis avec « Inviter ».`);
  const alerte = alerteDuJour(); if (alerte) ligne(alerte);
  if (personnagesPrets()) chargerDanses();
  const g = await creerAvatar(S.modele, graine(S.canal.id));
  if (!S.actif) { g.userData.liberer?.(); return; }
  S.moi = g; S.g = g; g.userData.tete.add(etiquette(S.nom, true)); scene.add(g);
  entrerMonde(); // son véhicule garé à côté (Fils à papa, moto louée)
  if (!personnagesPrets()) personnagesCharges().then(ok => { // arrivés après nous : le personnage animé remplace le dessiné, le sien et ceux des amis
    if (!ok || !S.actif) return;
    porter(S.modele, true);
    for (const A of S.autres.values()) if (!A.enCours && A.etat) { A.modele = ''; habiller(A); }
  });
}
/** Change de tenue pendant le salon : le nouveau personnage remplace l'ancien, là où il est ; les amis le voient. */
async function porter(modele, forcer = false) {
  if (!S.actif || modele === S.modele && S.moi && !forcer) return;
  S.modele = modele; VIE.femme = estFemme(modele); rendreVie(); try { localStorage.setItem(CLE, JSON.stringify({ nom: S.nom, modele })); } catch { /* navigation privée */ }
  if (VIE.data && VIE.data.modele !== modele) ecrireModele(modele);
  const g = await creerAvatar(modele, graine(S.canal?.id || S.nom));
  if (!S.actif || S.modele !== modele) { g.userData.liberer?.(); return; }
  if (S.moi) { retirerBulle(S); scene.remove(S.moi); S.moi.userData.liberer?.(); }
  g.position.set(S.x, S.y, S.z); g.rotation.y = S.cap; g.visible = S.moi?.visible ?? true;
  S.moi = S.g = g; g.userData.tete.add(etiquette(S.nom, true)); scene.add(g);
  if (!forcer) ligne('Nouvelle tenue !');
}
function quitter() {
  if (!S.actif) return;
  quitterMonde(); dehors(); sauverVie(); S.actif = false;
  for (const I of INTERIEURS.values()) if (I.etiquette) I.etiquette.visible = false; // « Chez toi »
  S.canal?.quitter(); S.canal = null; $('#slEntrer').hidden = true;
  for (const A of S.autres.values()) retirer(A); S.autres.clear();
  if (S.moi) { retirerBulle(S); scene.remove(S.moi); S.moi.userData.liberer?.(); S.moi = S.g = null; }
  for (const A of S.autres.values()) vehiculeDe(A, null);
  $('#salonHud').hidden = true; $('#slMessages').replaceChildren(); S.touches.clear(); S.joy = null;
  document.getElementById('app').classList.remove('mode-salon');
  controls.enabled = true; controls.minDistance = S.minDist; camera.near = 2; camera.updateProjectionMatrix();
  if (S.vueReelle && $('#togGoogle')?.getAttribute('aria-pressed') !== 'true') $('#togGoogle').click();
  startFlight(new THREE.Vector3(S.x, 0, S.z), 160, 1.05, S.cap + Math.PI, 1.6);
}
/** Inviter : le partage du téléphone, sinon le lien copié (pour le coller où l'on veut) et WhatsApp ouvert. */
async function inviter() {
  const url = `${location.origin}${location.pathname}?salon=${S.code}`, texte = `Viens vivre à Cotonou avec moi ! Salon ${S.code} :`;
  try { if (navigator.share) { await navigator.share({ title: 'Vivre à Cotonou', text: texte, url }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); ligne('Lien du salon copié : colle-le où tu veux, ou envoie-le sur WhatsApp.'); } catch { ligne(`Envoie ce lien à tes amis : ${url}`); }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${texte} ${url}`)}`, '_blank', 'noopener');
}
async function copier() {
  const url = `${location.origin}${location.pathname}?salon=${S.code}`;
  try { await navigator.clipboard.writeText(url); ligne('Lien copié : colle-le dans WhatsApp pour tes amis.'); } catch { ligne(`Envoie ce lien à tes amis : ${url}`); }
}

// ---------- À chaque image (avant controls.update, qui fait regarder la caméra vers la cible) ----------
// ---------- Prise en main du salon (la première fois) : se lever, marcher, la maison, la rue, « Ma vie » ----------
const GS = { vuCouche: false, marche: 0, px: null, pz: 0, activite: false, dehorsT: 0 };
let guideSalon = null;
const etapesSalon = () => [
  { id: 'lever', texte: 'Tu te réveilles chez toi. Appuie sur [E] (ou le bouton jaune en bas) pour te lever.', quand: () => !!S.couche, fait: () => GS.vuCouche && !S.couche },
  { id: 'marcher', texte: 'Marche avec les flèches ou [Z] [Q] [S] [D] (sur téléphone, le joystick). Les boutons jaunes en bas changent selon ce qui est près de toi.', quand: () => !S.couche && !!S.lieu?.prive, fait: () => GS.marche > 2.5 },
  { id: 'maison', texte: 'Chez toi, approche-toi de la douche ou du fourneau et appuie sur le bouton pour te laver ou cuisiner, puis mange à table. Le bouton « Sortir » t’emmène dans la rue.', quand: () => !S.couche && !!S.lieu?.prive, fait: () => GS.activite || GS.dehorsT > 0 },
  { id: 'rue', texte: 'Te voilà dans la rue. En bas à droite, « Aller à » t’emmène vers un lieu et « Prendre un zém » appelle un zém. En haut à gauche, « Travailler » te trouve un métier pour gagner de l’argent.', quand: () => !S.lieu && T.mode === 'pied', fait: () => !!T.zem || T.mode !== 'pied' || !!VIE.data?.metier, duree: 15 },
  { id: 'vie', texte: 'En haut à gauche, « Ma vie » : ton argent, ta faim et ta mission. Mange quand la faim baisse : au maquis, au food court de la Cité ou chez toi.', quand: () => GS.dehorsT > 16, fait: () => false, duree: 10 },
];
function majGuideSalon(dt) {
  if (!guideSalon?.actif()) return;
  if (S.couche) GS.vuCouche = true;
  if (S.activite) GS.activite = true;
  if (!S.lieu) GS.dehorsT += dt;
  if (GS.px !== null && T.mode === 'pied') GS.marche += Math.min(2, Math.hypot(S.x - GS.px, S.z - GS.pz)); // les sauts (entrer, sortir) ne comptent pas
  GS.px = S.x; GS.pz = S.z;
  guideSalon.maj(dt);
}
export function majSalon(dt) {
  if (!S.actif) return;
  majGuideSalon(dt);
  const t = S.touches, j = S.joy;
  const pad = S.pad && performance.now() - S.padT < 250 ? S.pad : null; // manette (voir manette.js), si elle vient de parler : débranchée ou menu ouvert, on n'avance plus
  const av = THREE.MathUtils.clamp((t.has('avant') ? 1 : 0) - (t.has('arriere') ? 1 : 0) + (j ? j.y : 0) + (pad ? -pad.ly + (T.mode === 'conduit' ? pad.rt - pad.lt : 0) : 0), -1, 1);
  const tour = THREE.MathUtils.clamp((t.has('gauche') ? 1 : 0) - (t.has('droite') ? 1 : 0) - (j ? j.x : 0) - (pad ? pad.lx : 0), -1, 1);
  majVie(dt);
  const suivi = majTrajets(dt, av, tour); // en voiture, à moto, derrière un zém : c'est le véhicule qui bouge
  if (!suivi && !majMaison(dt, av, tour)) { // chez soi, couché, sous la douche ou aux fourneaux : la maison place le personnage
    S.cap += tour * 2.4 * dt - (pad ? pad.rx * 2 * dt : 0); // stick droit : tourner
    const v = av * (t.has('court') || (j && Math.hypot(j.x, j.y) > .95) || (pad && (pad.court || Math.hypot(pad.lx, pad.ly) > .95)) ? 4.6 : 1.7) * (av < 0 ? .55 : 1) * vitesseFaim(); // trop faim : au ralenti
    deplacer(S.x + Math.sin(S.cap) * v * dt, S.z + Math.cos(S.cap) * v * dt);
    const marche = Math.abs(v) > .05;
    if (marche || Math.abs(tour) > .05) { S.geste = 'idle'; S.gesteFin = 0; }
    else if (S.gesteFin && performance.now() > S.gesteFin) { S.geste = 'idle'; S.gesteFin = 0; }
    S.anim = marche ? 'marche' : S.geste;
    if (S.moi) { S.moi.visible = true; S.moi.position.set(S.x, S.y, S.z); S.moi.rotation.y = S.cap; S.moi.userData.jouer(S.anim); }
  }
  // Caméra derrière soi (ou derrière le véhicule), à la distance et l'inclinaison choisies : glisser vers le haut ou
  // le bas, molette, touche V, stick droit de la manette. De très haut, on voit le quartier comme sur une carte.
  if (pad) S.tangage = THREE.MathUtils.clamp(S.tangage + pad.ry * 1.2 * dt, .05, 1.48);
  const P = suivi || S, dist = suivi ? Math.max(S.dist, suivi.dist) : S.dist, inc = S.lieu ? Math.min(S.tangage, S.couche ? .9 : .35) : S.tangage; // dedans, à hauteur d'yeux ; couché, on regarde le lit d'en haut
  const hc = S.couche ? .6 : 1.55; // hauteur visée : la tête, ou le lit
  cible.set(P.x, P.y + hc, P.z);
  voulue.set(P.x - Math.sin(P.cap) * dist * Math.cos(inc), P.y + hc + dist * Math.sin(inc), P.z - Math.cos(P.cap) * dist * Math.cos(inc));
  if (S.lieu) { // la caméra reste dans la pièce, sous le plafond, et ne passe pas au travers des cloisons
    const [cx, cz] = limiter(S.lieu, voulue.x, voulue.z, .35); voulue.set(cx, Math.min(voulue.y, S.y + (S.lieu.plafond ? S.lieu.plafond - .3 : 4)), cz);
    const k = murEntre(S.lieu, cible.x, cible.z, voulue.x, voulue.z); if (k < 1) voulue.set(cible.x + (voulue.x - cible.x) * k, voulue.y, cible.z + (voulue.z - cible.z) * k);
  }
  else if (!suivi?.libre && voulue.y - P.y < 14) { // dehors, au ras des toits : si un bâtiment se trouve entre le personnage et la caméra, elle s'approche (jamais dans un mur) ; pas en avion
    let k = 1; for (let i = 1; i <= 12; i++) { const f = i / 12; if (dansBatiment(cible.x + (voulue.x - cible.x) * f, cible.z + (voulue.z - cible.z) * f)) { k = Math.max(.15, (i - 1) / 12); break; } }
    if (k < 1) voulue.set(cible.x + (voulue.x - cible.x) * k, cible.y + (voulue.y - cible.y) * k + .4, cible.z + (voulue.z - cible.z) * k);
  }
  if (S.saut || suivi?.libre) { camera.position.copy(voulue); S.saut = false; } else camera.position.lerp(voulue, 1 - Math.exp(-dt * (suivi ? 5 : 7))); // en avion (temps accéléré), la caméra reste collée derrière
  controls.target.copy(cible);
  // Sa position aux autres, cinq fois par seconde (et au moins toutes les 2,5 s pour rester « présent »).
  S.envoi -= dt; S.depuis += dt;
  if (S.envoi <= 0 && S.canal) {
    S.envoi = ENVOI;
    const vh = T.mode === 'conduit' ? T.veh.type : T.mode === 'passager' ? 'zem' : T.mode === 'avion' ? 'avion' : T.mode === 'apprenti' ? 'tokpa' : ''; // le véhicule sous soi, pour les amis
    const e = { n: S.nom, m: S.modele, x: r2(S.x), z: r2(S.z), h: r2(S.cap), a: S.anim, i: S.lieu ? (S.lieu.prive ? `${S.lieu.id}~${S.R?.id || ''}` : S.lieu.id) : '', y: r2(S.y), vh, ...(vh === 'avion' ? etatVol() : {}) }, k = JSON.stringify(e);
    if (k !== S.dernier || S.depuis > 2.5) { S.dernier = k; S.depuis = 0; S.canal.envoyer(e); }
  }
  // Les autres, lissés entre deux nouvelles.
  const kk = 1 - Math.exp(-dt * 8), now = performance.now();
  for (const A of S.autres.values()) {
    const e = A.etat; if (!e) continue;
    const enAvion = e.vh === 'avion' && !(e.i || S.lieu), ey = typeof e.y === 'number' ? e.y : 0;
    if (Math.hypot(e.x - A.x, e.z - A.z) > (enAvion ? 400 : 30)) { A.x = e.x; A.z = e.z; A.y = ey; } // il vient d'utiliser « Aller à »
    const dx = e.x - A.x, dz = e.z - A.z; A.x += dx * kk; A.z += dz * kk; A.y = (A.y ?? ey) + (ey - (A.y ?? ey)) * kk;
    let da = (e.h || 0) - A.cap; da = Math.atan2(Math.sin(da), Math.cos(da)); A.cap += da * kk;
    if (A.g) A.g.visible = (e.i || '') === (S.lieu?.id || '') && !enAvion; // seulement ceux qui sont dans la même pièce (ou dehors) ; en avion, on voit l'avion
    if (enAvion) { A.avion ??= creerAvion(); poserAvion(A.avion, A.x, A.y, A.z, A.cap, e.ta || 0, e.ro || 0); A.avion.helice.visible = true; }
    else if (A.avion) { retirerAvion(A.avion); A.avion = null; }
    const V = vehiculeDe(A, ['moto', 'voiture', 'zem', 'taxi', 'tokpa'].includes(e.vh) && !(e.i || S.lieu) ? e.vh : null);
    if (enAvion) { /* dans l'avion : on ne le voit pas */ }
    else if (V) { V.x = A.x; V.z = A.z; V.cap = A.cap; V.y = typeof e.y === 'number' ? e.y : 0; V.g.position.set(V.x, V.y, V.z); V.g.rotation.y = V.cap; asseoirSur(A.g, V, e.vh === 'zem'); }
    else if (A.g) { A.g.position.set(A.x, typeof e.y === 'number' ? e.y : 0, A.z); A.g.rotation.y = A.cap; A.g.userData.jouer(Math.hypot(dx, dz) > .2 ? 'marche' : ANIMS.has(e.a) ? e.a : 'idle'); }
    if (A.bulle && now > A.bulleFin) retirerBulle(A);
  }
  if (S.bulle && now > S.bulleFin) retirerBulle(S);
  // Les actions du moment : entrer, sortir, monter, descendre, faire le plein, commander… (jusqu'à trois boutons, touche E).
  S.devant = S.lieu || T.mode !== 'pied' ? null : porteProche(S.x, S.z);
  S.actions = occupe() ? actionsMaison() // couché : se lever ; sous la douche, aux fourneaux : arrêter
    : [...(S.devant ? [{ texte: S.devant.entrer || `Entrer dans ${S.devant.nom}`, f: () => dedans(S.devant) }] : []), ...actions(), ...actionsMaison(), ...(S.lieu && T.mode === 'pied' ? [{ texte: 'Sortir', f: () => dehors() }] : [])]; // l'action du lieu d'abord, « Sortir » en dernier
  // La touche de chaque bouton : celle de la manette si elle est branchée (✕ □ ○ sur PlayStation, A X B sur Xbox), sinon E, R, F.
  const touches = S.pad && performance.now() - S.padT < 1000 ? (S.pad.ps ? ['✕', '□', '○'] : ['A', 'X', 'B']) : coarse ? null : ['E', 'R', 'F'];
  ['#slEntrer', '#slAction2', '#slAction3'].forEach((sel, k) => { // trois au plus (apprenti à l'arrêt : encaisser, crier, donner le départ)
    const b = $(sel), a = S.actions[k], txt = a ? `${a.texte}${touches ? ` (${touches[k]})` : ''}` : '';
    if (b && b.textContent !== txt) { b.textContent = txt; b.hidden = !txt; }
  });
}

// ---------- Marcher sans traverser les murs ----------
// Dehors : bâtiments, murs de clôture, portails et maisons des parcelles (rue.js) ; dedans : murs de la pièce et
// meubles (comptoirs, tables, guichets). Contre un mur, on glisse le long au lieu de s'arrêter net ; si l'on s'y
// trouve déjà (arrivée par « Aller à »), on peut seulement en sortir.
function gene(x, z) { return S.lieu ? profondeurInterieur(S.lieu, x, z) : dansBatiment(x, z) ? 99 : profondeurRue(x, z); }
function deplacer(nx, nz) {
  const ici = gene(S.x, S.z);
  for (const [x, z] of [[nx, nz], [nx, S.z], [S.x, nz]]) {
    const [cx, cz] = S.lieu ? limiter(S.lieu, x, z) : [x, z], p = gene(cx, cz);
    if (p === 0 || p < ici - 1e-4) { S.x = cx; S.z = cz; return; }
  }
}

// ---------- Vues : derrière soi, de haut, très haut (touche V, bouton « Vue », LB de la manette) ----------
const VUES = [['Derrière toi', 7, .4], ['De haut', 45, 1], ['Très haut', 140, 1.38]];
function changerVue() {
  S.vue = (S.vue + 1) % VUES.length; const [, d, t] = VUES[S.vue];
  S.dist = S.lieu ? Math.min(d, 6) : d; S.tangage = t;
  const b = $('#slVue'); if (b) b.textContent = `Vue : ${VUES[(S.vue + 1) % VUES.length][0].toLowerCase()}`;
}

// ---------- Manette : boutons ----------
/** Appelé par manette.js à chaque image quand le salon est ouvert et qu'aucune fenêtre n'attend un choix. */
export function manetteSalon(m) {
  S.pad = m; S.padT = performance.now();
  if (!S.padVu) { S.padVu = true; const a = $('.sl-aide'); if (a) a.textContent = m.ps ? 'Manette : stick gauche pour marcher ou conduire · stick droit pour tourner et prendre de la hauteur · L1 vue · R2/L2 gaz et frein · ✕ □ ○ : les actions affichées sur les boutons (○ klaxonne en roulant) · △ gestes, travail, habits · Select aller à · Start phrases' : 'Manette : stick gauche pour marcher ou conduire · stick droit pour tourner et prendre de la hauteur · LB vue · RT/LT gaz et frein · A X B : les actions affichées sur les boutons (B klaxonne en roulant) · Y gestes, travail, habits · Select aller à · Start phrases'; }
  if (m.lb) changerVue();
  if (m.a) S.actions?.[0]?.f();
  if (m.x) S.actions?.[1]?.f();
  if (m.b) { if (T.mode === 'conduit') son('klaxon'); else S.actions?.[2]?.f(); } // à pied : la 3e action
  if (m.y) choisir('Gestes', [...GESTES.map(([id, nom]) => ({ texte: nom, f: () => geste(id) })), { texte: 'Prendre un zém', f: helerZem }, { texte: 'Travailler', f: menuTravail }, { texte: 'M’habiller', f: () => ouvrirGarderobe(S.modele) }]);
  if (m.select) choisir(T.mode === 'conduit' ? 'GPS : où vas-tu ?' : 'Aller à…', LIEUX.map(L => ({ texte: L[1], f: () => aller(L[0]) })));
  if (m.start) choisir('Dire à tes amis', PHRASES.map(p => ({ texte: p, f: () => dire(p) })));
}

// ---------- Héler un zém : choisir où aller, négocier le prix ----------
function helerZem() {
  if (T.mode !== 'pied' || S.lieu) { ligne(S.lieu ? 'Sors d’abord pour héler un zém.' : 'Tu es déjà en route.'); return; }
  const proches = LIEUX.filter(L => { if (L[0] === 'station') return false; const d = destination(L); return d && Math.hypot(d[0] - S.x, d[1] - S.z) < 15000; }); // Ouidah ↔ Cotonou : 35 km, c'est l'avion
  choisir('Zém ! Où vas-tu ?', proches.map(L => ({ texte: L[1], f: () => {
    const d = destination(L); if (!d) return;
    const q = prixZem(S.x, S.z, S.cap, d[0], d[1]); if (!q) { ligne('Le zém ne connaît pas la route jusque-là.'); return; }
    if (q.km < .15) { ligne('Tu y es déjà !'); return; }
    let prix = q.prix; const argent = VIE.data?.argent ?? 0;
    const proposer = (txt, marchande) => choisir(`${txt} (${q.km.toFixed(1).replace('.', ',')} km)`, [
      { texte: `D’accord pour ${prix.toLocaleString('fr-FR')} F`, desactive: argent < prix, sous: argent < prix ? 'Tu n’as pas assez d’argent' : '', f: () => appelerZem(d[0], d[1], L[1], prix) },
      ...(marchande ? [] : [{ texte: 'Marchander', sous: 'Il peut accepter… ou pas', f: () => { if (Math.random() < .55) { prix = Math.max(150, prix - (prix > 500 ? 100 : 50)); proposer(`« Bon, ${prix.toLocaleString('fr-FR')} F, c’est mon dernier prix. »`, true); } else proposer(`« Non non, ${prix.toLocaleString('fr-FR')} F, c’est le prix ! »`, true); } }]),
    ]);
    proposer(`« ${L[1]} ? Ça fait ${prix.toLocaleString('fr-FR')} F. »`, false);
  } })));
}

// ---------- Interface ----------
function ouvrir() {
  if (JEU.actif) return;
  if (S.actif) { $('#salonHud').hidden = false; return; }
  let p = {}; try { p = JSON.parse(localStorage.getItem(CLE) || '{}'); } catch { /* rien */ }
  if (p.nom && !$('#slNom').value) $('#slNom').value = p.nom;
  // Ton personnage : une femme ou un homme, puis une tenue (les offertes, et celles déjà achetées à la boutique).
  S.modele = TENUES.some(t => t.modele === p.modele) ? p.modele : JEU.prog?.tenue ? `t:${JEU.prog.tenue}` : S.modele;
  let femme = estFemme(S.modele);
  const rendre = () => {
    choixGenre($('#slGenre'), femme, f => { femme = f; if (estFemme(S.modele) !== f) S.modele = TENUES.find(t => t.femme === f && !t.prix).modele; rendre(); });
    grilleTenues($('#slAvatars'), { femme, choisi: S.modele, seulementPossedees: true, choisir: t => { S.modele = t.modele; rendre(); } });
  };
  rendre();
  statut(''); $('#salon').hidden = false;
  prechargerVie(S.local); // la connexion à Firebase commence pendant qu'on écrit son nom
}
export function initSalon(data) {
  surAnnonce(t => ligne(t)); // argent gagné ou dépensé, faim : dans le fil du salon
  S.dire = dire; initTrajets(data, { S, ligne, dedans, dehors, bulle, retirerBulle });
  initMaison({ S, ligne, geste, guide: () => !!guideSalon?.actif() }); // chez soi : se lever, se doucher, cuisiner (maison.js)
  guideSalon = creerGuide({ cle: 'cotonou3d.guide', el: $('#slGuide'), titre: 'Prise en main', etapes: etapesSalon() });
  if (import.meta.env.DEV) window.__salon = { S, T, VIE, surRoute, profondeurRue, dansBatiment, profondeurInterieur, obstaclesPres }; // pour les tests (console, scripts)
  S.local = new URLSearchParams(location.search).has('salon-local');
  $('#btnSalon')?.addEventListener('click', ouvrir); $('#btnVivre')?.addEventListener('click', ouvrir);
  $('#slGestesTog')?.addEventListener('click', e => { const o = !$('#slActions').classList.contains('gestes'); $('#slActions').classList.toggle('gestes', o); e.currentTarget.setAttribute('aria-expanded', String(o)); });
  $('#slFermer')?.addEventListener('click', () => { $('#salon').hidden = true; });
  $('#slCreer')?.addEventListener('click', () => entrer(codeAleatoire()));
  const rejoindre = () => { const c = nettoyer($('#slCode').value, 6).toUpperCase(); if (!/^[A-Z2-9]{6}$/.test(c)) return statut('Le code du salon fait 6 caractères (lettres et chiffres).', 'mal'); entrer(c); };
  $('#slRejoindre')?.addEventListener('click', rejoindre);
  $('#slCode')?.addEventListener('keydown', e => { if (e.key === 'Enter') rejoindre(); });
  $('#slNom')?.addEventListener('keydown', e => { if (e.key === 'Enter') ($('#slCode').value ? rejoindre() : entrer(codeAleatoire())); });
  $('#slInviter')?.addEventListener('click', inviter);
  $('#slCopier')?.addEventListener('click', copier);
  $('#slQuitter')?.addEventListener('click', quitter);
  $('#slVue')?.addEventListener('click', changerVue); $('#slVue2')?.addEventListener('click', changerVue);
  $('#slEntrer')?.addEventListener('click', () => S.actions?.[0]?.f());
  $('#slAction2')?.addEventListener('click', () => S.actions?.[1]?.f());
  $('#slAction3')?.addEventListener('click', () => S.actions?.[2]?.f());
  $('#slZem')?.addEventListener('click', helerZem);
  $('#vhTravail')?.addEventListener('click', menuTravail);
  $('#vhPause')?.addEventListener('click', basculerPause);
  $('#vhFinir')?.addEventListener('click', () => choisir('Finir ta journée ?', [{ texte: 'Oui, j’arrête pour aujourd’hui', f: finirJournee }], { annuler: 'Non, je continue' }));
  $('#slHabiller')?.addEventListener('click', () => ouvrirGarderobe(S.modele));
  initGarderobe({ porter, ligne });
  $('#vhLouer')?.addEventListener('click', () => louerMoto().then(ok => { if (ok) { garerSonVehicule(); ligne('Ta moto louée t’attend à côté : approche-toi et « Monter sur ta moto ».'); } }));
  const bascule = (bouton, panneau, autre) => $(bouton)?.addEventListener('click', () => {
    const ouvert = !$(panneau).classList.contains('ouvert'); $(panneau).classList.toggle('ouvert', ouvert); $(bouton).setAttribute('aria-expanded', String(ouvert));
    if (ouvert) { $(autre[1]).classList.remove('ouvert'); $(autre[0]).setAttribute('aria-expanded', 'false'); }
    if (panneau === '#slChat' && ouvert) { S.nonLus = 0; $('#slNonLus').hidden = true; $('#slMessages').scrollTop = 1e6; }
  });
  bascule('#slChatBtn', '#slChat', ['#slGestesBtn', '#slActions']); bascule('#slGestesBtn', '#slActions', ['#slChatBtn', '#slChat']);
  $('#slForm')?.addEventListener('submit', e => { e.preventDefault(); dire($('#slTexte').value); $('#slTexte').value = ''; });
  const ph = $('#slPhrases'); if (ph) for (const p of PHRASES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = p; b.addEventListener('click', () => dire(p)); ph.append(b); }
  const ge = $('#slGestes'); if (ge) for (const [id, nom] of GESTES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = nom; b.addEventListener('click', () => geste(id)); ge.append(b); }
  const al = $('#slAller');
  if (al) { al.append(new Option('Aller à…', '')); for (const [id, nom] of LIEUX) al.append(new Option(nom, id)); al.addEventListener('change', () => { if (al.value) aller(al.value); al.value = ''; al.blur(); }); }
  // Clavier : capté avant les raccourcis de l'exploration (qui écoutent window), sauf quand on écrit.
  window.addEventListener('keydown', e => {
    if (!S.actif) return;
    const champ = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (champ) { if (e.key === 'Escape') e.target.blur(); e.stopPropagation(); return; }
    if (e.key === 'Enter') { $('#slTexte').focus(); e.preventDefault(); e.stopPropagation(); return; }
    const k = CLAVIER[e.code]; if (k === 'vue') { if (!e.repeat) changerVue(); e.preventDefault(); e.stopPropagation(); } else if (k === 'porte') { if (!e.repeat) porte(); e.preventDefault(); e.stopPropagation(); }
    else if (k === 'action2' || k === 'action3') { if (!e.repeat) S.actions?.[k === 'action2' ? 1 : 2]?.f(); e.preventDefault(); e.stopPropagation(); } else if (k) { S.touches.add(k); e.preventDefault(); e.stopPropagation(); }
  }, true);
  window.addEventListener('keyup', e => { const k = CLAVIER[e.code]; if (k) S.touches.delete(k); }, true);
  window.addEventListener('blur', () => S.touches.clear());
  // Glisser sur la ville pour tourner, molette pour s'approcher ou s'éloigner.
  canvas.addEventListener('pointerdown', e => { if (S.actif) S.glisse = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  window.addEventListener('pointermove', e => { if (S.glisse && e.pointerId === S.glisse.id) { S.cap -= (e.clientX - S.glisse.x) * .006; S.tangage = THREE.MathUtils.clamp(S.tangage + (e.clientY - S.glisse.y) * .005, .05, 1.48); S.glisse.x = e.clientX; S.glisse.y = e.clientY; } }); // vers le bas : on prend de la hauteur
  window.addEventListener('pointerup', e => { if (S.glisse?.id === e.pointerId) S.glisse = null; });
  canvas.addEventListener('wheel', e => { if (!S.actif) return; S.dist = THREE.MathUtils.clamp(S.dist * (1 + Math.sign(e.deltaY) * .12), 2.5, S.lieu ? 6 : 150); e.preventDefault(); }, { passive: false });
  // Manette tactile : un rond qu'on pousse avec le pouce.
  const joy = $('#slJoy');
  if (joy) {
    const pousser = e => { const r = joy.getBoundingClientRect(), R = r.width / 2; let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } S.joy = { x, y: -y }; joy.style.setProperty('--jx', `${x * 34}px`); joy.style.setProperty('--jy', `${y * 34}px`); };
    joy.addEventListener('pointerdown', e => { joy.setPointerCapture(e.pointerId); pousser(e); e.stopPropagation(); });
    joy.addEventListener('pointermove', e => { if (joy.hasPointerCapture(e.pointerId)) pousser(e); });
    const lacher = () => { S.joy = null; joy.style.setProperty('--jx', '0px'); joy.style.setProperty('--jy', '0px'); };
    joy.addEventListener('pointerup', lacher); joy.addEventListener('pointercancel', lacher);
  }
  // Lien d'invitation (?salon=CODE) : on ouvre le salon avec le code rempli, une fois la ville prête.
  const code = new URLSearchParams(location.search).get('salon');
  if (code && /^[A-Za-z2-9]{6}$/.test(code)) {
    const t = setInterval(() => {
      if (!document.querySelector('#loader.done')) return;
      if (document.getElementById('app')?.classList.contains('mode-accueil')) document.querySelector('#acPasser')?.click();
      clearInterval(t); ouvrir(); $('#slCode').value = code.toUpperCase(); statut('Écris ton nom, choisis ton personnage, puis « Rejoindre ».'); $('#slNom').focus();
    }, 300);
  }
}
