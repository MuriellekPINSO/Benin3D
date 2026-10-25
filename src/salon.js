import * as THREE from 'three';
import { $, LITE, coarse, toXZ } from './base.js';
import { PLACES } from './donnees-lieux.js';
import { creerGuide } from './guide.js';
import { BALADES, DEVANT_CAI, POSE_VELO, PRES_DE_CAI } from './caicai.js';
import { compterUneFois, lieuStats } from './statistiques.js';
import { obstacleArene, siegeGradins } from './ouidah.js';
import { dansArbre, dansFoule } from './lieux.js';
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
import { hauteurSol } from './sols.js';
import { actions, appelerZem, asseoir, asseoirSur, choisir, entrerMonde, garerSonVehicule, gps, initTrajets, majTrajets, prixZem, quitterMonde, reprendreVehicule, T, vehiculeDe } from './trajets.js';
import { dansCirculation } from './trafic.js';
import { creerAvion, etatVol, obstacleAvions, poserAvion, retirerAvion } from './vol.js';
import { alerteDuJour, assurerVie, bonjourDuJour, ecrire as ecrireVie, HEURES_VELO, LOCATION_VELO, louerMoto, louerVelo, majVie, prechargerVie, rendreLocation, rendreVie, sauverVie, surAnnonce, VIE, vitesseFaim } from './vie.js';
const ecrireModele = modele => ecrireVie({ modele });
import { basculerPause, finirJournee, menuTravail } from './metiers.js';
import { actionsCommerces, corpsCommerces, entrerCommerces, genteCommerces, initCommerces, lieuxCommerces, listeCommerces, majCommerces, quitterCommerces } from './commerces.js';
import { majAmbianceSalon } from './ambiance-salon.js';
import { entrerChapitres, initChapitres, majChapitres, quitterChapitres } from './chapitres.js';
import { basculerCarte, initCarteSalon, majCarteSalon, quitterCarteSalon } from './carte-salon.js';
import { TENUES, choixGenre, estFemme, grilleTenues, initGarderobe, modeleActuel, ouvrirGarderobe } from './garderobe.js';
import { AUDIO, audioCtx, moteurMaj, son } from './audio.js';
import { taire } from './voix.js';
import { camera, canvas, controls, scene } from './scene.js';

// ---------- Salon entre amis : se retrouver dans Cotonou ----------
// Jusqu'à 8 amis dans la même ville : chacun se promène à pied avec son personnage, voit les autres,
// discute (chat et bulles au-dessus des têtes), salue, danse, rit, s'assoit, et propose d'aller ensemble
// à l'Amazone, à la Haie Vive, à la plage ou au siège de Moov, ou en avion jusqu'à Ouidah (vol.js). On invite
// ses amis par un lien (WhatsApp).
// En ligne : Firebase Realtime Database du projet zem-run-cotonou, connexion anonyme, règles dans
// database.rules.json. Avec ?salon-local dans l'adresse, les onglets du même navigateur se relient sans
// serveur (BroadcastChannel) : c'est le mode de test.

// Huit par ville : on n'y croisait presque jamais personne, alors que c'est tout l'intérêt (« 30 personnes pour
// la même map », « même sans inviter d'amis, il faut que je voie d'autres personnes : il faut remplir le jeu »).
// Trente, donc, avec deux garde-fous plus bas : on n'envoie pas sa position plus souvent parce qu'on est plus
// nombreux, et on ne dessine que ceux qui sont assez près pour être autre chose qu'un point.
const MAX = 30, ENVOI = .2, VU = LITE ? 90 : 160, LETTRES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', CLE = 'cotonou3d.salon';
// La ville publique : on y entre sans invitation, au lieu d'un code que l'on s'envoie entre amis. Ces codes-là
// sont connus d'avance et les mêmes pour tout le monde. On remplit la première ville qui a de la place, dans
// l'ordre : mieux vaut huit personnes dans une ville que une personne dans huit villes. Douze villes de 8 font
// 96 places, à peu près la limite du plan gratuit de Firebase (100 connexions en même temps).
const PUBLICS = ['VILLEA', 'VILLEB', 'VILLEC', 'VILLED', 'VILLEE', 'VILLEF', 'VILLEG', 'VILLEH', 'VILLEJ', 'VILLEK', 'VILLEM', 'VILLEN'];
const GESTES = [['salut', 'Saluer'], ['danse1', 'Danser'], ['rire', 'Rire'], ['assis', 'S’asseoir'], ['telephone', 'Téléphoner']];
const ANIMS = new Set(['idle', 'marche', 'parle', ...GESTES.map(g => g[0])]);
const PHRASES = ['Salut !', 'Ça va ?', 'On y va !', 'On mange où ?', 'Attends-moi !', 'Trop bien ici', 'Viens voir !', 'Merci !', 'À plus !'];
// Lieux de rendez-vous : id dans PLACES, nom dans le menu, « je vais … », décalage du point d'arrivée (mètres,
// x vers l'est, z vers le sud) et direction du regard (0 = vers le sud). Toujours dans un espace dégagé : la
// caméra se tient 7 m derrière. Haie Vive : rue Les Cocotiers, celle des maquis (Le Lambi's, Cordon Bleu…).
const LIEUX = [['maison', 'Chez moi', 'chez moi', 0, 0, 0], ['station', 'Station-service la plus proche', 'faire le plein', 0, 0, 0], ['amazone', 'Esplanade de l’Amazone', 'à l’esplanade de l’Amazone', 0, -62, 0], ['caicai', 'Caï Caï Vélo (location)', 'chez Caï Caï Vélo', 0, 0, 0], ['cite', 'Cité ministérielle (food court)', 'au food court de la Cité ministérielle', 0, 0, 0, 'cite-foodcourt'], ['haievive', 'Haie Vive (rue des maquis)', 'à la Haie Vive', -65, -153, Math.PI / 2], ['fidjrosse', 'Plage de Fidjrossè', 'à la plage de Fidjrossè', 0, 0, 0], ['moov', 'Siège de Moov Africa', 'au siège de Moov', 5, -22, 0], ['aeroport', 'Aéroport (vols pour Ouidah)', 'à l’aéroport', 0, 0, 0, 'aeroport-hall'], ['porte', 'Porte du Non-Retour (Ouidah)', 'à la Porte du Non-Retour, à Ouidah', 0, -30, 0]]; // 7e : intérieur dont on arrive devant la porte
const CLAVIER = { KeyM: 'carte', KeyV: 'vue', KeyE: 'porte', KeyR: 'action2', KeyF: 'action3', ArrowUp: 'avant', KeyW: 'avant', ArrowDown: 'arriere', KeyS: 'arriere', ArrowLeft: 'gauche', KeyA: 'gauche', ArrowRight: 'droite', KeyD: 'droite', ShiftLeft: 'court', ShiftRight: 'court' }; // touches physiques : WASD en QWERTY = ZQSD en AZERTY

const S = { orbite: 0, orbiteT: 0, actif: false, public: false, balade: null, local: false, vueReelle: false, nonLus: 0, pad: null, tangage: .4, vue: 0, lieu: null, y: 0, devant: null, canal: null, code: '', nom: '', modele: 't:top-f', moi: null, bulle: null, bulleFin: 0, x: 0, z: 0, cap: 0, anim: 'idle', geste: 'idle', gesteFin: 0, touches: new Set(), joy: null, glisse: null, envoi: 0, depuis: 0, dernier: '', dist: 7, saut: false, minDist: 20, bras: 1, autres: new Map(), vus: new Set() };
export const salonActif = () => S.actif;
export const pieceDuSalon = () => S.actif ? S.lieu : null; // la pièce où l'on est (main.js n'y dessine que ses abords)
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
/** La première ville publique où il reste une place. Les villes déjà pleines à notre arrivée sont passées. */
async function villeLibre(pleines = []) {
  if (S.local) return PUBLICS[0];
  const { d, db } = await firebase(); await joueur();
  for (const code of PUBLICS) {
    if (pleines.includes(code)) continue;
    try { if ((await d.get(d.ref(db, `zem_salons/${code}/joueurs`))).size < MAX) return code; }
    catch { return code; } // on n'a pas pu compter : on tente quand même, canalFirebase refusera si c'est plein
  }
  return null;
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
  // Ancrée par le bas (center), juste au-dessus du crâne : centrée à 36 cm, elle flottait loin de la tête vue de près et la couvrait vue de haut.
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false })); s.scale.set(.145, .033, 1); s.center.set(.5, .05); s.position.y = .08; s.renderOrder = 30; return s;
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
  if (!e) { if (A) { retirer(A); S.autres.delete(id); majListe(); if (A.nom) ligne(S.public ? `${A.nom} a quitté la ville.` : `${A.nom} a quitté le salon.`); } return; }
  if (typeof e.x !== 'number' || typeof e.z !== 'number') return;
  if (!A) { A = { id, x: e.x, z: e.z, cap: e.h || 0, nom: '', modele: '', g: null, enCours: false, bulle: null, bulleFin: 0 }; S.autres.set(id, A); }
  const avant = A.etat?.sur; A.etat = e;
  const nom = nettoyer(e.n, 16) || 'Ami';
  if (nom !== A.nom) { const nouveau = !A.nom; A.nom = nom; if (A.g) { A.g.userData.tete.remove(A.etiquette); A.etiquette = etiquette(nom); A.g.userData.tete.add(A.etiquette); } majListe(); if (nouveau) ligne(S.public ? `${nom} est arrivé en ville.` : `${nom} est arrivé dans le salon.`); }
  const moi = S.R?.id; if (moi && (e.sur === moi) !== (avant === moi)) ligne(e.sur === moi ? `${nom} monte avec toi : roule, tu l’emmènes.` : `${nom} descend.`);
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
  const n = S.autres.size + 1, gens = [S.nom, ...[...S.autres.values()].map(A => A.nom)].filter(Boolean).join(', ');
  el.textContent = n === 1 ? 'Tu es seul pour l’instant' : S.public ? `${n} personnes : ${gens}` : `${n} amis : ${gens}`;
}

/** En ville, le menu « Aller à » dit combien de gens sont déjà sur place : on va là où il y a du monde.
 *  « Chez moi » et « Station-service » sont propres à chacun, on ne les compte pas. */
function majLieuxMonde() {
  const al = $('#slAller'); if (!al || !S.actif || !S.public) return;
  const gens = [...S.autres.values()].map(A => A.etat).filter(e => e && typeof e.x === 'number');
  for (const L of LIEUX) {
    const o = [...al.options].find(o => o.value === L[0]); if (!o || L[0] === 'maison' || L[0] === 'station') continue;
    const d = destination(L);
    const n = d ? gens.filter(e => Math.hypot(e.x - d[0], e.z - d[1]) < 70).length : 0;
    o.textContent = n ? `${L[1]} · ${n === 1 ? '1 personne' : `${n} personnes`}` : L[1];
  }
}

// ---------- Chat ----------
function ligne(texte, { nom = '', lieu = null, moi = false } = {}) {
  const ol = $('#slMessages'); if (!ol) return;
  const li = document.createElement('li'); li.className = nom ? (moi ? 'moi' : '') : 'systeme';
  if (nom) { const b = document.createElement('b'); b.textContent = nom; li.append(b, ' '); }
  li.append(texte);
  if (lieu && !moi) { const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = 'Y aller'; bt.addEventListener('click', () => aller(lieu, false)); li.append(' ', bt); }
  ol.append(li); while (ol.children.length > 40) ol.firstChild.remove();
  if (nom && !moi && (matchMedia('(max-width: 720px)').matches ? !$('#slChat').classList.contains('ouvert') : document.getElementById('app').classList.contains('chat-ferme'))) { S.nonLus++; const n = $('#slNonLus'); n.textContent = S.nonLus; n.hidden = false; }
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
// Dans la rue, pas de chaise : on pose son tabouret en plastique (comme partout à Cotonou) ; il disparaît quand on se lève.
function poserTabouret() {
  retirerTabouret();
  const g = new THREE.Group(), rouge = new THREE.MeshLambertMaterial({ color: '#c8352b' }), bloc = (sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), rouge); m.position.set(x, y, z); m.castShadow = true; g.add(m); };
  bloc(.44, .05, .42, 0, .44, -.04); bloc(.44, .4, .04, 0, .66, -.25); // assise, dossier (derrière soi)
  for (const [x, z] of [[-.19, .14], [.19, .14], [-.19, -.22], [.19, -.22]]) bloc(.035, .44, .035, x, .22, z);
  g.position.set(S.x, S.y, S.z); g.rotation.y = S.cap; scene.add(g); S.tabouret = { g, x: S.x, z: S.z };
}
function retirerTabouret() { if (!S.tabouret) return; scene.remove(S.tabouret.g); S.tabouret.g.traverse(o => o.geometry?.dispose()); S.tabouret = null; }
function geste(nom) {
  if (nom === 'telephone') { // l'animation du téléphone est une pose assise : sur une chaise s'il y en a une, sinon sur son tabouret dehors
    const c = S.lieu && siegeProche(S.lieu, S.x, S.z);
    if (c) { S.x = c.x; S.z = c.z; S.cap = c.cap; }
    else if (!S.lieu && T.mode === 'pied') poserTabouret();
    else { telephoneEnMain(); bulle(S, 'Allô ? Oui, je suis à Cotonou !'); S.geste = 'idle'; S.gesteFin = 0; return; }
    telephoneEnMain(); bulle(S, 'Allô ? Oui, je suis à Cotonou !');
  }
  if (nom === 'assis') { // sur la chaise libre la plus proche, dans les gradins de l'arène, ou sur son tabouret dans la rue
    if (!S.lieu && siegeGradins(S.x, S.z)) { assoirGradins(); return; }
    const c = S.lieu && siegeProche(S.lieu, S.x, S.z);
    if (c) { S.x = c.x; S.z = c.z; S.cap = c.cap; asseoir(c); } // si l'on porte une assiette, on la pose et on mange
    // Dehors, on s'assoit sur son tabouret : l'assiette se posait nulle part et restait collée à la main pour
    // toujours, même en changeant de quartier (retour d'un testeur, 24/10). On mange dessus, sur les genoux.
    else if (!S.lieu && T.mode === 'pied') { poserTabouret(); asseoir({ x: S.x, z: S.z, cap: S.cap }, .55); }
    else { ligne('Approche-toi d’une table pour t’asseoir.'); return; }
  }
  S.geste = nom; S.gesteFin = nom === 'salut' || nom === 'rire' ? performance.now() + 3200 : 0; // saluer et rire durent un moment, danser et s'asseoir jusqu'au prochain pas
  if (nom === 'danse1' && personnagesPrets()) chargerDanses();
}
// Gradins de l'arène de Ouidah : on s'assoit face à la piste pour regarder les danses des Vodun ; « Se lever » (ou
// avancer) ramène au bord de la piste.
function assoirGradins() {
  const g = siegeGradins(S.x, S.z); if (!g) return;
  S.x = g.x; S.z = g.z; S.y = g.y; S.cap = g.cap; S.gradin = g; S.saut = true; S.geste = 'assis'; S.gesteFin = 0;
  S.dist = Math.min(S.dist, 4.5); S.tangage = Math.max(S.tangage, .62); // au-dessus de l'épaule, vers la piste (plus bas, on ne verrait que les dossiers)
  ligne(`Tu t’assois dans les gradins (rang ${g.rang}) : regarde les danses des Vodun.`);
}
function leverGradins() {
  const g = S.gradin; if (!g) return;
  S.gradin = null; S.x = g.bas[0]; S.z = g.bas[1]; S.y = 0; S.geste = 'idle'; S.saut = true;
}
// Un téléphone dans la main, quelques secondes.
function telephoneEnMain() {
  if (!S.moi) return; S.tel?.parent?.remove(S.tel);
  const t = new THREE.Mesh(new THREE.BoxGeometry(.07, .14, .015), new THREE.MeshLambertMaterial({ color: '#1d2024' })); t.position.set(0, .04, .03);
  (S.moi.userData.main || S.moi).add(t); S.tel = t; clearTimeout(S.telFin); S.telFin = setTimeout(() => { t.parent?.remove(t); t.geometry.dispose(); }, 6000);
}
/** Point d'arrivée d'un lieu de rendez-vous : [x, z, regard] (devant la porte pour un lieu où l'on entre). */
// Ses commerces (commerces.js) s'ajoutent aux lieux : « Aller à », GPS et zém y mènent comme ailleurs.
const tousLieux = () => [...LIEUX, ...lieuxCommerces().map(c => [c.id, c.nom, c.dit, 0, 0, 0])];
function destination(L) {
  if (L[0].startsWith('cm:')) { const c = lieuxCommerces().find(c => c.id === L[0]); return c && [c.x, c.z, c.cap]; }
  if (L[0] === 'station') { const st = stationLaPlusProche(S.x, S.z); return st && [st[0], st[1], 0]; }
  if (L[0] === 'caicai') return DEVANT_CAI; // devant le comptoir, face à la boutique
  if (L[0] === 'maison') { const I = maisonActuelle(); if (!I) return null; const a = arriveeDehors(I); return [a.x, a.z, a.cap + Math.PI]; } // devant sa porte (maison.js)
  const p = PLACES.find(q => q.id === L[0]), I = L[6] && INTERIEURS.get(L[6]); if (!p) return null;
  if (I) { const a = arriveeDehors(I); return [a.x, a.z, a.cap + Math.PI]; }
  const [x, z] = toXZ(p.lat, p.lon); return [x + L[3], z + L[4], L[5]];
}
// ---------- Caï Caï Vélo : louer au comptoir ----------
function actionsCaiCai() {
  if (T.mode !== 'pied' || S.lieu || !PRES_DE_CAI(S.x, S.z)) return [];
  if (VIE.data?.vehicule === 'velo') return [...(S.balade ? [] : [{ texte: 'Partir en balade', f: choisirBalade }]), { texte: 'Rendre le vélo', f: rendreVelo }];
  if (VIE.data?.vehicule) return []; // on a déjà une moto ou une voiture : pas deux véhicules à la fois
  return [{ texte: `Louer un vélo · ${LOCATION_VELO.toLocaleString('fr-FR')} F`, f: prendreVelo }];
}
async function prendreVelo() {
  if (!(await louerVelo())) return;
  garerSonVehicule(POSE_VELO); son('piece');
  ligne(`Vélo loué pour ${HEURES_VELO} h. Il est posé devant la boutique : approche-toi et « Monter sur ton vélo ».`);
}
async function rendreVelo() {
  if (!reprendreVehicule()) return ligne('Descends d’abord du vélo.');
  S.balade = null; await rendreLocation(); ligne('Vélo rendu. Merci, à bientôt chez Caï Caï !');
}
// ---------- Les balades en groupe ----------
// Le meneur annonce chaque étape dans la discussion ; les autres n'ont qu'à cliquer « Y aller ». Rien à
// synchroniser entre les navigateurs : le fil du salon suffit, et il marche aussi bien entre inconnus.
function choisirBalade() {
  choisir('Quelle balade ?', BALADES.map(B => ({
    texte: B.nom, sous: `${B.etapes.length} étape${B.etapes.length > 1 ? 's' : ''} · ${B.etapes.map(e => LIEUX.find(l => l[0] === e)?.[1]).filter(Boolean).join(', ')}`,
    f: () => lancerBalade(B),
  })), { annuler: 'Pas maintenant' });
}
function lancerBalade(B) {
  S.balade = { id: B.id, etape: 0 };
  annoncerEtape(B, 0, `Je pars en balade « ${B.nom} » avec Caï Caï`);
}
function annoncerEtape(B, i, debut) {
  const id = B.etapes[i], L = LIEUX.find(l => l[0] === id); if (!L) return;
  S.canal?.dire({ n: S.nom, txt: `${debut || `Étape ${i + 1} de la balade « ${B.nom} »`} : rendez-vous ${L[2]} !`, lieu: id });
  aller(id, false);
}
function actionsBalade() {
  const b = S.balade; if (!b) return [];
  const B = BALADES.find(x => x.id === b.id); if (!B) return [];
  const out = [];
  if (b.etape < B.etapes.length - 1) out.push({ texte: `Balade : annoncer l’étape ${b.etape + 2}`, f: () => { b.etape++; annoncerEtape(B, b.etape); } });
  else out.push({ texte: 'Finir la balade', f: () => { S.balade = null; S.canal?.dire({ n: S.nom, txt: `Fin de la balade « ${B.nom} ». Merci à tous !` }); } });
  return out;
}
/** Se rend à un lieu de rendez-vous ; `proposer` : prévient les autres, qui peuvent suivre d'un clic.
 *  On n'y saute plus, à pied non plus : le chemin s'allume au sol et l'on y va à pied, en zém ou au volant.
 *  Seuls les lieux qu'aucune route ne relie (Ouidah, à 35 km) gardent l'ancien saut. */
function aller(id, proposer = true) {
  if (id.startsWith('cm:')) { const c = lieuxCommerces().find(c => c.id === id); if (c) allerVers(c.x, c.z, c.cap, c.nom); return; } // chez soi, au travail : on ne l'annonce pas
  const L = LIEUX.find(l => l[0] === id), p = PLACES.find(q => q.id === id) || ((id === 'station' || id === 'maison' || id === 'caicai') && {}); if (!L || !p) return;
  if (T.mode === 'conduit') { const d = destination(L); if (d) gps(d[0], d[1], id === 'station' ? (stationLaPlusProche(S.x, S.z)?.[2] || L[1]) : L[1]); return; }
  if (T.mode === 'ami') { const A = S.autres.get(S.ami); S.canal?.dire({ n: S.nom, txt: `${A ? `${A.nom}, emmène-moi` : 'Emmène-moi'} ${L[2]} !`, lieu: id }); return; }
  if (T.mode !== 'pied') return;
  const I = id === 'maison' ? maisonActuelle() : L[6] && INTERIEURS.get(L[6]);
  if (I && S.lieu === I) return; // on y est déjà
  if (S.lieu) dehors(false);
  const d0 = destination(L), nom0 = id === 'station' ? (stationLaPlusProche(S.x, S.z)?.[2] || L[1]) : L[1];
  if (d0 && Math.hypot(d0[0] - S.x, d0[1] - S.z) > 12 && gps(d0[0], d0[1], nom0)) {
    if (proposer && id !== 'station' && id !== 'maison') S.canal?.dire({ n: S.nom, txt: `Je vais ${L[2]}, venez !`, lieu: id });
    return;
  }
  if (id === 'caicai') { const d = destination(L); S.x = d[0] + (Math.random() - .5) * 3; S.z = d[1]; S.cap = d[2]; }
  else if (id === 'station') { const d = destination(L); if (!d) return; S.x = d[0] + 6; S.z = d[1]; S.cap = -Math.PI / 2; }
  else if (I) { const a = arriveeDehors(I); S.x = a.x + (Math.random() - .5) * 2; S.z = a.z; S.cap = a.cap + Math.PI; } // devant la porte, face à elle
  else { const [x, z] = toXZ(p.lat, p.lon); S.x = x + L[3] + (Math.random() - .5) * 4; S.z = z + L[4] + (Math.random() - .5) * 4; S.cap = L[5]; }
  S.saut = true; S.geste = 'idle';
  if (proposer && id !== 'station' && id !== 'maison') S.canal?.dire({ n: S.nom, txt: `Je vais ${L[2]}, venez !`, lieu: id });
}

/** Va jusqu'à un point de la ville (une boutique, commerces.js) : le chemin s'allume au sol, à pied comme au volant. */
function allerVers(x, z, cap, nom) {
  if (T.mode === 'conduit') { gps(x, z, nom); return; }
  if (T.mode !== 'pied') { ligne('Termine d’abord ton trajet.'); return; }
  if (S.lieu) dehors(false);
  if (Math.hypot(x - S.x, z - S.z) > 12 && gps(x, z, nom)) return;
  S.x = x; S.z = z; S.y = 0; S.cap = cap; S.saut = true; S.geste = 'idle';
}

// ---------- Intérieurs : entrer dans un bâtiment, en sortir ----------
function dedans(I) {
  ouvrirInterieur(I); const a = arriveeDedans(I);
  S.lieu = I; S.y = a.y; S.x = a.x; S.z = a.z; S.cap = a.cap; S.saut = true; S.geste = 'idle'; S.dist = Math.min(S.dist, I.prive ? 3.6 : 4.5);
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
// Touche E : l'action principale du moment. Pas deux d'affilée en moins de 0,7 s : E, E au réveil levait le joueur puis
// le faisait sortir aussitôt (la deuxième action arrive à la place de la première).
function porte() { const t = performance.now(); if (t - (S.actionT || 0) < 700) return; S.actionT = t; S.actions?.[0]?.f(); }

// ---------- Entrer, quitter ----------
// Un double clic sur « Créer » (ou Entrée puis clic) lançait deux entrées pendant le chargement de la vie, chacune avec
// son code : deux salons ouverts, deux messages de bienvenue. Une seule entrée à la fois.
let entreeEnCours = false;
async function entrer(code) {
  if (S.actif || entreeEnCours) return;
  entreeEnCours = true;
  try { await entrerSalon(code); } finally { entreeEnCours = false; }
}
/** « Entrer en ville » : la ville publique, sans code ni invitation. */
async function entrerVille() {
  if (S.actif || entreeEnCours) return;
  entreeEnCours = true;
  try {
    const pleines = [];
    for (let essai = 0; essai < 3; essai++) {
      const code = await villeLibre(pleines);
      if (!code) break;
      const e = await entrerSalon(code);
      if (e?.code !== 'complet') return; // entré, ou une autre erreur déjà affichée
      pleines.push(code); // quelqu'un a pris la dernière place pendant qu'on arrivait
    }
    statut('Il y a beaucoup de monde en ce moment : toutes les villes sont pleines. Réessaie dans un instant, ou crée un salon entre amis.', 'mal');
  } finally { entreeEnCours = false; }
}
/** Entre dans un salon ; rend l'erreur si la connexion a échoué (le message est déjà affiché). */
async function entrerSalon(code) {
  // Sans nom, on en propose un (il se change dans la fenêtre du salon) : refuser « Commencer » faisait partir des joueurs.
  if (!nettoyer($('#slNom').value, 16)) $('#slNom').value = nomAuHasard(estFemme(S.modele));
  const nom = nettoyer($('#slNom').value, 16);
  S.nom = nom; try { localStorage.setItem(CLE, JSON.stringify({ nom, modele: S.modele })); } catch { /* navigation privée */ }
  audioCtx(); // le clic « Entrer » permet le son : les bruits de la ville (ambiance-salon.js), les pièces, les klaxons
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
  if (e) { console.warn('salon', e); statut(erreur(e), 'mal'); return e; }
  S.canal = c;
  S.code = code; S.public = PUBLICS.includes(code); S.actif = true; statut(''); compterUneFois('salon'); lieuStats('salon');
  $('#salon').hidden = true; $('#salonHud').hidden = false; $('#slJoy').hidden = !coarse; $('#slCourir').hidden = !coarse;
  mesurerBandeau();
  // En ville, pas de code à montrer. Le chat libre reste ouvert : on vient justement pour se présenter
  // et se parler, ce que des phrases toutes faites ne permettent pas.
  $('#slSalonLbl').textContent = S.public ? 'En ville' : `Salon ${code}`;
  $('#slTexte').placeholder = S.public ? 'Écris à tout le monde… (Entrée)' : 'Écris à tes amis… (Entrée)';
  document.getElementById('app').classList.add('mode-salon');
  // À pied, il faut la ville en 3D autour de soi : la « Vue réelle » (images Google à plat) attendra la sortie.
  S.vueReelle = $('#togGoogle')?.getAttribute('aria-pressed') === 'true'; if (S.vueReelle) $('#togGoogle').click();
  E.flight = null; S.minDist = controls.minDistance; controls.minDistance = 1.5; controls.enabled = false; controls.autoRotate = false;
  camera.near = .3; camera.updateProjectionMatrix(); // caméra proche du personnage (comme dans Zém Run)
  const maison = maisonActuelle(); // la partie commence chez soi, au lit (maison.js)
  if (maison) { dedans(maison); reveil(maison); } else aller('amazone', false);
  majListe(); rendreVie();
  const test = S.local ? ' (mode test : seuls les onglets de ce navigateur se voient)' : '';
  ligne(S.public
    ? `Bienvenue en ville${test} ! Ici tu croises des gens que tu ne connais pas. Salue-les, et regarde « Aller à » : il dit où il y a du monde.`
    : `Bienvenue dans le salon ${code}${test} ! Invite tes amis avec « Inviter ».`);
  const alerte = alerteDuJour(); if (alerte) ligne(alerte);
  bonjourDuJour().then(b => { if (b && S.actif) { ligne(b); son('piece'); } }).catch(() => { });
  for (const m of entrerCommerces()) ligne(m); // ce que les commerces ont vendu pendant l'absence (commerces.js)
  entrerChapitres(); // la prochaine étape (chapitres.js)
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
  lieuStats('carte');
  menu(false); if (document.pointerLockElement) document.exitPointerLock(); quitterMonde(); S.ami = null; S.balade = null; dehors(); sauverVie(); quitterCommerces(); quitterChapitres(); quitterCarteSalon(); retirerTabouret(); S.actif = false;
  for (const I of INTERIEURS.values()) if (I.etiquette) I.etiquette.visible = false; // « Chez toi »
  S.canal?.quitter(); S.canal = null; $('#slEntrer').hidden = true;
  for (const A of S.autres.values()) retirer(A); S.autres.clear();
  if (S.moi) { retirerBulle(S); scene.remove(S.moi); S.moi.userData.liberer?.(); S.moi = S.g = null; }
  for (const A of S.autres.values()) vehiculeDe(A, null);
  $('#salonHud').hidden = true; $('#slMessages').replaceChildren(); S.touches.clear(); S.joy = null;
  document.getElementById('app').classList.remove('mode-salon');
  controls.enabled = true; controls.minDistance = S.minDist; camera.near = 2; camera.fov = 45; if (camera.view?.enabled) camera.clearViewOffset(); camera.updateProjectionMatrix();
  if (S.vueReelle && $('#togGoogle')?.getAttribute('aria-pressed') !== 'true') $('#togGoogle').click();
  startFlight(new THREE.Vector3(S.x, 0, S.z), 160, 1.05, S.cap + Math.PI, 1.6);
}
/** Inviter : le partage du téléphone, sinon le lien copié (pour le coller où l'on veut) et WhatsApp ouvert. */
const lienSalon = () => `${location.origin}${location.pathname}${S.public ? '' : `?salon=${S.code}`}`;
async function inviter() {
  const url = lienSalon(), texte = S.public ? 'Viens vivre à Cotonou avec moi, on se retrouve en ville :' : `Viens vivre à Cotonou avec moi ! Salon ${S.code} :`;
  try { if (navigator.share) { await navigator.share({ title: 'Vivre à Cotonou', text: texte, url }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); ligne('Lien du salon copié : colle-le où tu veux, ou envoie-le sur WhatsApp.'); } catch { ligne(`Envoie ce lien à tes amis : ${url}`); }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${texte} ${url}`)}`, '_blank', 'noopener');
}
async function copier() {
  const url = lienSalon();
  try { await navigator.clipboard.writeText(url); ligne('Lien copié : colle-le dans WhatsApp pour tes amis.'); } catch { ligne(`Envoie ce lien à tes amis : ${url}`); }
}

// ---------- À chaque image (avant controls.update, qui fait regarder la caméra vers la cible) ----------
const PRENOMS = { f: ['Akpénè', 'Fifamè', 'Sèna', 'Afi', 'Houéfa', 'Rosine', 'Nadège', 'Chancelle', 'Bénédicte', 'Gisèle'], h: ['Codjo', 'Kossi', 'Sèdjro', 'Rodrigue', 'Fiacre', 'Gildas', 'Romaric', 'Prince', 'Arnaud', 'Euloge'] };
const nomAuHasard = femme => { const l = PRENOMS[femme ? 'f' : 'h']; return l[Math.floor(Math.random() * l.length)]; };

// ---------- Prise en main du salon (la première fois) : se lever, marcher, la maison, la rue, « Ma vie » ----------
const GS = { vuCouche: false, marche: 0, px: null, pz: 0, activite: false, dehorsT: 0 };
let guideSalon = null;
const etapesSalon = () => [
  { id: 'lever', texte: () => coarse ? 'Tu te réveilles chez toi. Touche « Se lever ».' : 'Tu te réveilles chez toi. [E] pour te lever.', quand: () => !!S.couche, fait: () => GS.vuCouche && !S.couche },
  { id: 'marcher', texte: () => coarse ? 'Le joystick pour marcher, « Courir » pour courir.' : 'Flèches ou [Z] [Q] [S] [D] pour marcher. Glisse dans la ville pour tourner la caméra.', quand: () => !S.couche && !!S.lieu?.prive, fait: () => GS.marche > 2.5 },
  { id: 'maison', texte: 'Approche-toi de la douche, du fourneau ou de la table : le bouton vert fait le reste.', quand: () => !S.couche && !!S.lieu?.prive, fait: () => GS.activite || GS.dehorsT > 0 },
  { id: 'rue', texte: () => coarse ? '« Aller · gestes », en bas à droite : choisis où aller, le chemin s’allume au sol. « Travailler », en haut à gauche, te trouve un métier.' : '« Aller à », en bas à droite : choisis où aller, le chemin s’allume au sol. « Travailler », en haut à gauche, te trouve un métier.', quand: () => !S.lieu && T.mode === 'pied', fait: () => !!T.zem || T.mode !== 'pied' || !!VIE.data?.metier },
  { id: 'vie', texte: 'En haut à gauche : ton argent et ta faim. Mange quand elle baisse — maquis, food court, ou chez toi.', quand: () => GS.dehorsT > 16 && !!VIE.data?.metier, fait: () => !!VIE.service, duree: 40 }, // se ferme quand on commence à travailler
];
function majGuideSalon(dt) {
  if (!guideSalon?.actif()) return;
  if (S.couche) GS.vuCouche = true;
  if (S.activite) GS.activite = true;
  if (!S.lieu) GS.dehorsT += dt;
  if (GS.px !== null && T.mode === 'pied') { const d = Math.hypot(S.x - GS.px, S.z - GS.pz); if (d < .8) GS.marche += d; } // les sauts (entrer, sortir, se lever) ne comptent pas
  GS.px = S.x; GS.pz = S.z;
  guideSalon.maj(dt);
}
/**
 * Le bandeau du haut — la barre du salon, l'argent, la mini-carte — ne fait pas la même hauteur partout : la
 * barre passe sur deux lignes dès que l'écran se resserre. Le guide, le chapitre et la carte se calaient sous une
 * hauteur écrite en dur (50, 56, 58, 84 px selon les endroits) et se retrouvaient dessus : sur un téléphone tout
 * se chevauchait, en portrait comme à l'horizontale (retours des testeurs du 24/10). On mesure le bas réel du
 * bandeau, et le reste se place dessous (--sl-bandeau).
 */
function mesurerBandeau() {
  if (bandeauVu) return;
  const els = ['.sl-haut', '.vie-hud:not(.ouvert)', '.mini-carte'].map(s => $(s)).filter(Boolean);
  if (!els.length) return;
  bandeauVu = true;
  const poser = () => {
    let bas = 0;
    for (const e of els) { if (e.hidden || !e.offsetParent) continue; const r = e.getBoundingClientRect(); if (r.top < innerHeight * .35) bas = Math.max(bas, r.bottom); }
    document.documentElement.style.setProperty('--sl-bandeau', `${Math.round(bas)}px`);
  };
  const ro = new ResizeObserver(poser); for (const e of els) ro.observe(e);
  addEventListener('resize', poser); poser();
}
let bandeauVu = false;

/** L'appel du bouton « Aller · gestes » s'arrête dès qu'on l'a ouvert une fois. */
function vuGestes() {
  $('#slGestesBtn')?.classList.remove('appel');
  try { localStorage.setItem('cotonou3d.vuGestes', '1'); } catch { /* navigation privée */ }
}

export function majSalon(dt) {
  if (!S.actif) { E.joueur = null; majAmbianceSalon(dt, null); return; }
  majGuideSalon(dt);
  const t = S.touches, j = S.joy;
  const pad = S.pad && performance.now() - S.padT < 250 ? S.pad : null; // manette (voir manette.js), si elle vient de parler : débranchée ou menu ouvert, on n'avance plus
  const av = S.menu ? 0 : THREE.MathUtils.clamp((t.has('avant') ? 1 : 0) - (t.has('arriere') ? 1 : 0) + (j ? j.y : 0) + (pad ? -pad.ly + (T.mode === 'conduit' ? pad.rt - pad.lt : 0) : 0), -1, 1);
  const tour = S.menu ? 0 : THREE.MathUtils.clamp((t.has('gauche') ? 1 : 0) - (t.has('droite') ? 1 : 0) - (j ? j.x : 0) - (pad ? pad.lx : 0), -1, 1);
  majVie(dt); majCommerces(dt); majChapitres(dt); majCarteSalon();
  let suivi = majTrajets(dt, av, tour); // en voiture, à moto, derrière un zém : c'est le véhicule qui bouge
  if (T.mode === 'ami') suivi = majAmi(); // derrière un ami : c'est lui qui conduit
  // La circulation s'arrête devant lui (trafic.js, circulation.js) ; dedans, elle l'ignore. Elle doit connaître sa taille :
  // au volant, ce n'est plus un piéton mais une voiture de 4,4 m, et les autres s'arrêtaient à son milieu, déjà dans sa carrosserie.
  const J = S.lieu ? null : suivi ?? S;
  if (J) { const Vj = T.mode === 'conduit' ? T.veh : T.mode === 'passager' ? T.zem?.V : T.mode === 'ami' ? S.autres.get(S.ami)?.veh : null; J.hl = Vj ? (Vj.D?.long ?? 2) / 2 : .3; J.hw = Vj ? (Vj.D?.larg ?? .8) / 2 : .3; }
  E.joueur = J;
  if (!suivi && !majMaison(dt, av, tour)) { // chez soi, couché, sous la douche ou aux fourneaux : la maison place le personnage
    if (S.gradin && Math.abs(av) > .05) leverGradins(); // assis dans les gradins : avancer, c'est se lever
    if (S.gradin && Math.hypot(S.x - S.gradin.x, S.z - S.gradin.z) > 1.5) { S.gradin = null; if (!S.lieu) S.y = 0; } // parti autrement (« Aller à », zém…)
    // On va là où regarde la caméra, pas là où le personnage tourne le dos : pousser vers l'avant, c'est aller
    // vers le fond de l'écran, quel que soit l'angle de la caméra. Le personnage pivote vers sa direction, et
    // l'on retire le même angle à l'orbite pour que la caméra reste où elle est pendant qu'il tourne sous elle ;
    // elle revient d'elle-même dans son dos quelques instants plus tard (plus bas). En voiture ou à moto, rien
    // ne change : c'est majTrajets qui pilote, avec un guidon.
    const pousse = Math.min(1, Math.hypot(av, tour));
    if (pousse > .05) {
      const vise = S.cap + S.orbite + Math.atan2(tour, av);
      let ecart = vise - S.cap; ecart = Math.atan2(Math.sin(ecart), Math.cos(ecart));
      const pas = ecart * Math.min(1, dt * 9);
      S.cap += pas; S.orbite -= pas;
    }
    // Courir : Maj au clavier, le bouton « Courir » ou le joystick poussé jusqu'au bord sur téléphone, la manette à fond.
    const court = t.has('court') || S.court || (j && Math.hypot(j.x, j.y) > .95) || (pad && (pad.court || Math.hypot(pad.lx, pad.ly) > .95));
    const v = pousse * (court ? 5.2 : 1.7) * vitesseFaim(); // trop faim : au ralenti
    deplacer(S.x + Math.sin(S.cap) * v * dt, S.z + Math.cos(S.cap) * v * dt);
    const marche = Math.abs(v) > .05;
    if (marche || Math.abs(tour) > .05) { S.geste = 'idle'; S.gesteFin = 0; }
    if (S.tabouret && (S.lieu || (S.geste !== 'assis' && S.geste !== 'telephone') || Math.hypot(S.x - S.tabouret.x, S.z - S.tabouret.z) > .3)) retirerTabouret();
    else if (S.gesteFin && performance.now() > S.gesteFin) { S.geste = 'idle'; S.gesteFin = 0; }
    S.anim = marche ? (court && S.moi?.userData.peut?.('course') ? 'course' : 'marche') : S.geste;
    if (S.moi) { S.moi.visible = true; S.moi.position.set(S.x, S.y, S.z); S.moi.rotation.y = S.cap; S.moi.userData.jouer(S.anim); }
  }
  // Caméra derrière soi (ou derrière le véhicule), à la distance et l'inclinaison choisies : glisser vers le haut ou
  // le bas, molette, touche V, stick droit de la manette. De très haut, on voit le quartier comme sur une carte.
  if (pad) S.tangage = THREE.MathUtils.clamp(S.tangage + pad.ry * 1.2 * dt, -.15, 1.48);
  const P = suivi || S, dist = suivi ? Math.max(S.dist, suivi.dist) : S.dist, inc = S.lieu ? Math.min(S.tangage, S.couche ? .9 : .35) : S.tangage; // dedans, à hauteur d'yeux ; couché, on regarde le lit d'en haut
  const hc = S.couche ? .6 : 1.55; // hauteur visée : la tête, ou le lit
  // Couché, on vise la tête sur l'oreiller (1,45 m des pieds) et non le milieu du lit : sur un téléphone en hauteur, elle sortait du cadre.
  const O = S.couche ? { x: S.couche.x - Math.sin(S.couche.a) * 1.45, y: P.y, z: S.couche.z - Math.cos(S.couche.a) * 1.45, cap: P.cap } : P;
  cible.set(O.x, O.y + hc, O.z);
  // Glisser sur la ville (ou le stick droit) fait tourner la caméra autour de soi ou de son véhicule, sans les faire tourner :
  // on se regarde de face, de côté. Quand on avance, elle revient doucement derrière (pas pendant qu'on la tourne).
  if (pad && Math.abs(pad.rx) > .05) { S.orbite -= pad.rx * 2 * dt; S.orbiteT = performance.now(); }
  S.orbite = Math.atan2(Math.sin(S.orbite), Math.cos(S.orbite));
  const bouge = Math.abs(av) > .05 || Math.abs(tour) > .05 || (Math.abs(suivi?.v ?? T.veh?.v ?? 0) > 1 && T.mode !== 'pied');
  if (S.lieu) { // dans une pièce : on marche vers le fond de l'écran, la caméra n'a pas à revenir dans le dos ; à l'arrêt, elle glisse vers l'angle qui laisse le plus de recul
    if (!bouge && performance.now() - S.orbiteT > 1200) { const d = angleDedans(O, dist, inc); S.orbite += Math.atan2(Math.sin(d - S.orbite), Math.cos(d - S.orbite)) * (1 - Math.exp(-dt * 1.6)); }
  } else if (bouge && performance.now() - S.orbiteT > 1200) S.orbite *= Math.exp(-dt * 2.2);
  const lacet = P.cap + S.orbite;
  voulue.set(O.x - Math.sin(lacet) * dist * Math.cos(inc), O.y + hc + dist * Math.sin(inc), O.z - Math.cos(lacet) * dist * Math.cos(inc));
  if (S.lieu) { // la caméra reste dans la pièce, sous le plafond, et ne passe pas au travers des cloisons
    const k = perche(S.lieu, cible, voulue);
    voulue.set(cible.x + (voulue.x - cible.x) * k, cible.y + (voulue.y - cible.y) * k, cible.z + (voulue.z - cible.z) * k);
    const [lx, lz] = limiter(S.lieu, voulue.x, voulue.z, MARGE_PIECE); voulue.set(lx, Math.min(voulue.y, plafondDe(S.lieu)), lz); // filet, si la cible elle-même touche une cloison
  }
  else if (!suivi?.libre && voulue.y - P.y < 14) { // dehors, au ras des toits : si un bâtiment se trouve entre le personnage et la caméra, elle s'approche (jamais dans un mur) ; pas en avion
    // Douze rayons et un pas de 58 cm à 7 m de recul : la caméra pouvait s'arrêter dans la façade, et comme le
    // plan rapproché est à 60 cm, on voyait l'intérieur du bâtiment (retour d'un testeur, 24/10). Vingt-quatre
    // rayons, la caméra testée comme une bulle de 55 cm (pas comme un point), et on recule de 50 cm en plus.
    const lg = Math.hypot(voulue.x - cible.x, voulue.z - cible.z), marge = lg > .5 ? .5 / lg : 0;
    let k = 1;
    for (let i = 1; i <= 24; i++) {
      const f = i / 24, px = cible.x + (voulue.x - cible.x) * f, pz = cible.z + (voulue.z - cible.z) * f;
      const dedans = dansBatiment(px, pz) || BULLE.some(([u, v]) => dansBatiment(px + u, pz + v)) || profondeurRue(px, pz, .55) > 0 || obstacleArene(px, pz, .55) > 0; // ni bâtiment, ni mur de parcelle ou portail, ni mur de l'arène
      if (dedans) { k = Math.max(.15, f - marge); break; }
    }
    // Le long d'un mur, le rayon y entrait et en sortait d'une image à l'autre : la caméra avançait et reculait sans cesse
    // (vidéo d'un testeur, 22/10). Elle se rapproche aussitôt (jamais dans le mur), mais ne recule que doucement.
    S.bras = k < S.bras ? k : S.bras + (k - S.bras) * (1 - Math.exp(-dt * 2.5));
    if (S.bras < .999) voulue.set(cible.x + (voulue.x - cible.x) * S.bras, cible.y + (voulue.y - cible.y) * S.bras + .4 * Math.min(1, (1 - S.bras) * 6), cible.z + (voulue.z - cible.z) * S.bras);
  } else S.bras = 1;
  if (S.saut || suivi?.libre) { camera.position.copy(voulue); S.saut = false; } else camera.position.lerp(voulue, 1 - Math.exp(-dt * (suivi ? 6.5 : 7))); // en avion (temps accéléré), la caméra reste collée derrière
  controls.target.copy(cible);
  for (const b of [$('#slVue'), $('#slVue2')]) if (b && b.disabled !== !!S.lieu) { b.disabled = !!S.lieu; b.title = S.lieu ? 'La vue change une fois dehors' : 'Changer de vue (V)'; } // dedans, la caméra reste près de soi : le premier clic ne faisait rien
  const near = S.lieu ? .3 : .6; if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); } // dehors : deux fois plus de précision de profondeur au loin
  // Dans une pièce, téléphone en hauteur : à 45°, l'image ne fait que 21° de large et le personnage la remplit ; les murs
  // empêchent de reculer, alors on ouvre l'angle (jusqu'à 70°, ~60° de large visés). Ordinateur, paysage : 45°, inchangé.
  const fov = S.lieu ? THREE.MathUtils.clamp(2 * Math.atan(Math.tan(Math.PI / 6) / camera.aspect) * 180 / Math.PI, 45, 70) : 45;
  if (Math.abs(camera.fov - fov) > .1) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // Téléphone en hauteur : le bas de l'écran est pris par le joystick, les boutons et le guide. On remonte l'image de 12 %
  // (le personnage passe au tiers supérieur) au lieu de le laisser au milieu, derrière la carte du guide.
  const haut = coarse && innerHeight > innerWidth * 1.2;
  // setViewOffset fixe aussi camera.aspect (largeur / hauteur données) : avec (1, 1…), l'image devenait carrée, étirée deux fois en hauteur.
  if (haut !== !!camera.view?.enabled) { if (haut) camera.setViewOffset(camera.aspect, 1, 0, .12, camera.aspect, 1); else camera.clearViewOffset(); }
  majAmbianceSalon(dt, { x: P.x, z: P.z, dedans: !!S.lieu, public: !!S.lieu && !S.lieu.prive, clients: S.lieu ? 0 : genteCommerces(S.x, S.z) }); // les bruits de la ville (ambiance-salon.js)
  // Où il y a du monde, dans le menu « Aller à » : toutes les deux secondes, c'est bien assez.
  S.lieuxT = (S.lieuxT || 0) - dt; if (S.lieuxT <= 0) { S.lieuxT = 2; majLieuxMonde(); }
  // Sa position aux autres, cinq fois par seconde (et au moins toutes les 2,5 s pour rester « présent »).
  S.envoi -= dt; S.depuis += dt;
  if (S.envoi <= 0 && S.canal) {
    S.envoi = ENVOI * (1 + S.autres.size / 30); // à trente en ville, 0,4 s : l'interpolation (kk) comble le reste
    const vh = T.mode === 'conduit' ? T.veh.type : T.mode === 'passager' ? 'zem' : T.mode === 'avion' ? 'avion' : T.mode === 'apprenti' ? 'tokpa' : ''; // le véhicule sous soi, pour les amis
    const e = { n: S.nom, m: S.modele, x: r2(S.x), z: r2(S.z), h: r2(S.cap), a: S.anim, i: S.lieu ? (S.lieu.prive ? `${S.lieu.id}~${S.R?.id || ''}` : S.lieu.id) : '', y: r2(S.y), vh, ...(vh === 'avion' ? etatVol() : {}), ...(T.mode === 'ami' ? { sur: S.ami } : {}) }, k = JSON.stringify(e);
    if (k !== S.dernier || S.depuis > 2.5) { S.dernier = k; S.depuis = 0; S.canal.envoyer(e); }
  }
  // Les autres, lissés entre deux nouvelles.
  const kk = 1 - Math.exp(-dt * 8), now = performance.now();
  for (const A of S.autres.values()) {
    const e = A.etat; if (!e) continue;
    const enAvion = e.vh === 'avion' && !(e.i || S.lieu), ey = typeof e.y === 'number' ? e.y : 0;
    if (Math.hypot(e.x - A.x, e.z - A.z) > (enAvion ? 400 : 30)) { A.x = e.x; A.z = e.z; A.y = ey; } // il vient d'utiliser « Aller à »
    const dx = e.x - A.x, dz = e.z - A.z; A.x += dx * kk; A.z += dz * kk; A.y = (A.y ?? ey) + (ey - (A.y ?? ey)) * kk;
    A.vitesse = Math.hypot(dx * kk, dz * kk) / Math.max(dt, .001); // à l'arrêt, la position lissée rattrape la dernière reçue et la vitesse tombe à 0
    let da = (e.h || 0) - A.cap; da = Math.atan2(Math.sin(da), Math.cos(da)); A.cap += da * kk;
    const pres = (A.x - S.x) ** 2 + (A.z - S.z) ** 2 < VU * VU;
    if (A.g) A.g.visible = pres && (e.i || '') === (S.lieu?.id || '') && !enAvion; // dans la même pièce (ou dehors) et assez près ; en avion, on voit l'avion
    if (enAvion) { A.avion ??= creerAvion(); poserAvion(A.avion, A.x, A.y, A.z, A.cap, e.ta || 0, e.ro || 0); A.avion.helice.visible = true; }
    else if (A.avion) { retirerAvion(A.avion); A.avion = null; }
    const V = vehiculeDe(A, ['moto', 'voiture', 'zem', 'taxi', 'tokpa'].includes(e.vh) && !(e.i || S.lieu) ? e.vh : null);
    if (enAvion) { /* dans l'avion : on ne le voit pas */ }
    else if (V) { V.x = A.x; V.z = A.z; V.cap = A.cap; V.y = typeof e.y === 'number' ? e.y : 0; V.g.position.set(V.x, V.y, V.z); V.g.rotation.y = V.cap; asseoirSur(A.g, V, e.vh === 'zem'); }
    else if (e.sur && A.g && !(e.i || S.lieu)) { // passager d'un ami : assis derrière lui (dans la voiture, on ne le voit pas)
      const Vd = e.sur === S.R?.id ? (T.mode === 'conduit' ? T.veh : null) : S.autres.get(e.sur)?.veh;
      if (Vd) asseoirSur(A.g, Vd, true); else { A.g.position.set(A.x, ey, A.z); A.g.rotation.y = A.cap; }
    }
    else if (A.g) { A.g.position.set(A.x, typeof e.y === 'number' ? e.y : 0, A.z); A.g.rotation.y = A.cap; A.g.userData.jouer(Math.hypot(dx, dz) > .2 ? (e.a === 'course' && A.g.userData.peut?.('course') ? 'course' : 'marche') : ANIMS.has(e.a) ? e.a : 'idle'); } // l'ami qui court, court aussi chez soi
    if (A.bulle && now > A.bulleFin) retirerBulle(A);
  }
  if (S.bulle && now > S.bulleFin) retirerBulle(S);
  // Les actions du moment : entrer, sortir, monter, descendre, faire le plein, commander… (jusqu'à trois boutons, touche E).
  S.devant = S.lieu || T.mode !== 'pied' ? null : porteProche(S.x, S.z);
  // La porte se voit de 7 m, le véhicule de 3 à 4,5 m : la moto du patron ou le zém hélé, arrêtés devant la maison,
  // faisaient rentrer chez soi avec [E] au lieu de monter dessus. Le plus proche des deux passe en premier.
  const entrer = S.devant ? [{ texte: S.devant.entrer || `Entrer dans ${S.devant.nom}`, f: () => dedans(S.devant) }] : [];
  const vehAvant = !!S.devant && [T.veh, T.zem?.phase === 'attend' ? T.zem.V : null].some(V => V && Math.hypot(V.x - S.x, V.z - S.z) < Math.hypot(S.devant.porte[0] - S.x, S.devant.porte[1] - S.z));
  S.actions = T.mode === 'ami' ? actionsAmi()
    : occupe() ? actionsMaison() // couché : se lever ; sous la douche, aux fourneaux : arrêter
    : S.gradin ? [{ texte: 'Se lever', f: leverGradins }]
    : [...amisAuVolant(), ...(vehAvant ? [] : entrer), ...(!S.lieu && T.mode === 'pied' && siegeGradins(S.x, S.z) ? [{ texte: 'S’asseoir dans les gradins', f: assoirGradins }] : []), ...actions(), ...(vehAvant ? entrer : []), ...actionsBalade(), ...actionsCaiCai(), ...actionsCommerces(), ...actionsMaison(), ...(S.lieu && T.mode === 'pied' ? [{ texte: 'Sortir', f: () => dehors() }] : [])]; // l'action du lieu d'abord, « Sortir » en dernier
  // La touche de chaque bouton : celle de la manette si elle est branchée (✕ □ ○ sur PlayStation, A X B sur Xbox), sinon E, R, F.
  const touches = S.pad && performance.now() - S.padT < 1000 ? (S.pad.ps ? ['✕', '□', '○'] : ['A', 'X', 'B']) : coarse ? null : ['E', 'R', 'F'];
  ['#slEntrer', '#slAction2', '#slAction3'].forEach((sel, k) => { // trois au plus (apprenti à l'arrêt : encaisser, crier, donner le départ)
    const b = $(sel), a = S.actions[k], txt = a ? `${a.texte}${touches ? ` (${touches[k]})` : ''}` : '';
    if (b && b.textContent !== txt) { b.textContent = txt; b.hidden = !txt; }
  });
  // « Prendre un zém » : pas quand on roule déjà, ni quand on est soi-même zémidjan ou taximan en service.
  const zem = $('#slZem'), sansZem = T.mode !== 'pied' || VIE.service === 'zem' || VIE.service === 'taxi';
  if (zem && zem.hidden !== sansZem) zem.hidden = sansZem;
}

// Dans une petite pièce, reculer derrière soi collait la caméra au dos (au réveil, on ne voyait que la couverture) :
// on cherche autour du personnage l'angle qui laisse le plus de recul, murs et cloisons compris. L'angle déjà choisi
// garde un avantage, pour que la caméra n'hésite pas entre deux coins.
/**
 * Quelle part de la perche caméra (de `c` vers `v`) tient dans la pièce : 1 si tout y tient. On rabattait la
 * caméra sur le bord (limiter) au lieu de la rapprocher : elle quittait l'axe du personnage et finissait plaquée
 * dans un angle, à 42 cm d'une cloison alors que son plan rapproché est à 30, et le mur occupait la moitié de
 * l'écran — « espace vide », « c'est bizarre et vilain » (deux testeurs, 24/10, au réveil dans la chambre).
 * Maintenant elle se rapproche en restant derrière lui, comme le fait déjà la caméra du dehors.
 */
// 60 cm de marge ne suffisaient pas : l'enduit à 60 cm d'un objectif grand angle remplit encore le tiers de
// l'écran. Et la caméra, calée juste sous le plafond, regardait la cloison de haut. On la garde à 2 m du sol.
const MARGE_PIECE = .95;
const plafondDe = I => S.y + Math.min(I.plafond ? I.plafond - .35 : 4, 2.05);
function perche(I, c, v) {
  const [px, pz] = I.centre;
  // Jusqu'où aller avant de sortir : les deux cloisons extérieures, les cloisons intérieures, puis le plafond.
  const borne = (a, b, h) => (Math.abs(b) <= h || b === a ? 1 : Math.max(0, ((b > 0 ? h : -h) - a) / (b - a)));
  // murEntre s'arrête au dernier échantillon avant la cloison, sans marge : la caméra finissait à 86 cm d'un
  // enduit, qui remplissait l'écran. On recule d'autant que pour les murs de la pièce.
  const lg = Math.hypot(v.x - c.x, v.z - c.z) || 1;
  let k = murEntre(I, c.x, c.z, v.x, v.z); if (k < 1) k = Math.max(0, k - MARGE_PIECE / lg);
  k = Math.min(k, borne(c.x - px, v.x - px, I.w / 2 - MARGE_PIECE), borne(c.z - pz, v.z - pz, I.d / 2 - MARGE_PIECE));
  const haut = plafondDe(I); if (v.y > haut && v.y !== c.y) k = Math.min(k, Math.max(0, (haut - c.y) / (v.y - c.y)));
  return THREE.MathUtils.clamp(k, .22, 1); // jamais dans la tête du personnage
}

function angleDedans(P, dist, inc) {
  const L = S.lieu; if (S.dedansL !== L) { S.dedansL = L; S.dedansD = 0; }
  const c = { x: P.x, y: P.y + 1.35, z: P.z }, v = { x: 0, y: P.y + 1.35 + dist * Math.sin(inc), z: 0 };
  const recul = d => { const l = P.cap + d; v.x = P.x - Math.sin(l) * dist * Math.cos(inc); v.z = P.z - Math.cos(l) * dist * Math.cos(inc); return dist * perche(L, c, v); };
  let best = S.dedansD, bs = recul(best) - .3 * Math.abs(best) + .4;
  for (const d of [0, .5, -.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI]) { const s = recul(d) - .3 * Math.abs(d); if (s > bs) { bs = s; best = d; } }
  return (S.dedansD = best);
}

// ---------- Menu : argent, logement, travail, commerces, inviter, quitter (bouton « Menu » ou Échap) ----------
// Demande du 21/10 : moins de choses à l'écran. Replié, le panneau du haut à gauche ne garde que l'argent, la faim,
// l'essence et la vitesse en conduisant, la mission, « Travailler » et « Menu » (le reste : CSS .vie-hud:not(.ouvert)).
function menu(ouvrir) {
  const el = $('#vieHud'); if (!el || (ouvrir && el.hidden)) return;
  el.classList.toggle('ouvert', ouvrir); $('#vhVoile').hidden = !ouvrir; $('#vhMenu')?.setAttribute('aria-expanded', String(ouvrir));
  S.menu = ouvrir; if (ouvrir) { S.touches.clear(); majSon(); }
}
// Son : le même interrupteur que le bouton Son de Zém Run (AUDIO.muet). La ville, les pièces et les voix s'y plient.
function majSon() {
  const b = $('#vhSon'); if (b) { b.textContent = AUDIO.muet ? 'Son : coupé' : 'Son : activé'; b.setAttribute('aria-pressed', String(!AUDIO.muet)); }
  $('#jhSon')?.setAttribute('aria-pressed', String(!AUDIO.muet));
}

// ---------- Avec un ami : il conduit sa moto ou sa voiture, on monte avec lui ----------
// Il s'arrête à côté de soi : « Monter derrière … » (une place sur la moto, trois dans la voiture). On est alors porté par
// son véhicule tel que ses messages le placent ; il voit son passager assis derrière lui. « Aller à » lui demande de
// nous emmener (son message a un bouton « Y aller » qui trace son GPS). Il descend, entre quelque part ou s'en va : on
// descend aussi.
const AMI_VEH = ['moto', 'voiture', 'taxi'];
function amisAuVolant() {
  if (S.lieu || T.mode !== 'pied' || T.trans) return [];
  const out = [];
  for (const A of S.autres.values()) {
    const e = A.etat, V = A.veh; if (!e || !V || !AMI_VEH.includes(e.vh) || e.i) continue;
    if (Math.hypot(V.x - S.x, V.z - S.z) > (V.D.cache ? 3.6 : 3) || (A.vitesse ?? 0) > 1) continue; // à côté, et arrêté
    const places = V.D.cache ? 3 : 1, pris = [...S.autres.values()].filter(B => B.etat?.sur === A.id).length;
    if (pris < places) out.push({ texte: V.D.cache ? `Monter dans la voiture de ${A.nom}` : `Monter derrière ${A.nom}`, f: () => monterAmi(A) });
  }
  return out;
}
function monterAmi(A) {
  const V = A.veh; if (!V) return;
  const cote = V.D.cache ? 1.3 : .55, bx = V.x + Math.sin(V.cap + Math.PI / 2) * cote, bz = V.z + Math.cos(V.cap + Math.PI / 2) * cote;
  T.trans = { t: 0, duree: .8, de: [S.x, S.z], vers: [bx, bz], fin: () => {
    if (!S.autres.has(A.id)) return;
    T.mode = 'ami'; S.ami = A.id; son('bosse');
    ligne(`Tu montes ${V.D.cache ? 'dans la voiture de' : 'derrière'} ${A.nom}. « Aller à » lui demande de t’emmener ; « Descendre » quand il s’arrête.`);
  } };
}
function majAmi() {
  const A = S.autres.get(S.ami), e = A?.etat, V = A?.veh;
  if (!A || !e || !V || !AMI_VEH.includes(e.vh) || e.i) { descendreAmi(A ? `Fin du trajet avec ${A.nom} : tu descends.` : 'Ton ami a quitté le salon : tu descends.'); return null; }
  S.x = V.x; S.z = V.z; S.cap = V.cap; S.y = V.y; S.anim = 'assis';
  asseoirSur(S.moi, V, true);
  return { x: V.x, y: V.y, z: V.z, cap: V.cap, dist: V.D.cache ? 8 : 6, haut: V.D.cache ? 3.2 : 2.6 };
}
function actionsAmi() {
  const A = S.autres.get(S.ami);
  return A && (A.vitesse ?? 0) < 1.5 ? [{ texte: 'Descendre', f: () => descendreAmi() }] : []; // on ne saute pas d'une moto qui roule
}
function descendreAmi(message = '') {
  const A = S.autres.get(S.ami), V = A?.veh;
  T.mode = 'pied'; S.ami = null; S.y = 0; S.anim = 'idle';
  if (V) { const cote = V.D.cache ? 1.6 : 1; S.x = V.x + Math.sin(V.cap + Math.PI / 2) * cote; S.z = V.z + Math.cos(V.cap + Math.PI / 2) * cote; S.cap = V.cap; }
  if (S.moi) { S.moi.visible = true; S.moi.position.set(S.x, S.y, S.z); S.moi.rotation.y = S.cap; }
  if (message) ligne(message);
}

// ---------- Marcher sans traverser les murs ----------
// Dehors : bâtiments, murs de clôture, portails et maisons des parcelles (rue.js) ; dedans : murs de la pièce et
// meubles (comptoirs, tables, guichets). Contre un mur, on glisse le long au lieu de s'arrêter net ; si l'on s'y
// trouve déjà (arrivée par « Aller à »), on peut seulement en sortir.
// Dehors, aussi : l'épaisseur du corps contre les façades (huit points autour de lui), l'arène de Ouidah, la foule, les
// amis, le zém qui attend, les véhicules garés et les avions.
const ANNEAU = Array.from({ length: 8 }, (_, k) => [Math.sin(k * Math.PI / 4) * .3, Math.cos(k * Math.PI / 4) * .3]);
// La caméra n'est pas un point : on la teste comme une bulle d'un rayon un peu plus grand que son plan rapproché.
const BULLE = Array.from({ length: 8 }, (_, k) => [Math.sin(k * Math.PI / 4) * .55, Math.cos(k * Math.PI / 4) * .55]);
function boite(x, z, cx, cz, cap, hl, hw, r = .3) { const dx = x - cx, dz = z - cz, u = Math.abs(dx * Math.sin(cap) + dz * Math.cos(cap)), v = Math.abs(dx * Math.cos(cap) - dz * Math.sin(cap)); return u < hl + r && v < hw + r ? Math.min(hl + r - u, hw + r - v) : 0; }
function corps(x, z) {
  let p = Math.max(dansFoule(x, z), dansArbre(x, z), obstacleAvions(x, z), corpsCommerces(x, z), dansCirculation(x, z)); // + l'équipe et les clients des commerces, les zems et tokpas qui roulent
  for (const A of S.autres.values()) if (A.g?.visible) { const d = Math.hypot(x - A.g.position.x, z - A.g.position.z); if (d < .6) p = Math.max(p, .6 - d); }
  const zem = T.zem?.phase === 'attend' ? T.zem.V : null, garee = T.mode === 'pied' ? T.veh : null;
  for (const V of [zem, garee]) if (V?.g?.visible !== false && V) p = Math.max(p, boite(x, z, V.x, V.z, V.cap, (V.D?.long ?? 2) / 2, (V.D?.larg ?? .8) / 2));
  return p;
}
function gene(x, z) {
  if (S.lieu) return profondeurInterieur(S.lieu, x, z);
  if (dansBatiment(x, z)) return 99;
  const bord = ANNEAU.reduce((n, [u, v]) => n + (dansBatiment(x + u, z + v) ? 1 : 0), 0) * .04; // le corps frôle une façade
  return Math.max(bord, profondeurRue(x, z), obstacleArene(x, z), corps(x, z));
}
// Dehors, des marches et des estrades (sols.js) : on monte une marche de 0,45 m au plus ; plus haut, c'est un mur.
// Contre un mur en biais, essayer seulement les deux axes ne suffisait pas, et le corps qui frôlait la façade ne pouvait
// que s'en écarter : on restait collé, comme devant un « mur invisible » (testeurs, 22/10). On essaie donc aussi le même
// pas tourné de 30°, 60° puis 80° (raccourci d'autant), et l'on peut longer un mur sans s'y enfoncer davantage.
const GLISSE = [.52, 1.05, 1.4].flatMap(a => [a, -a]).map(a => [Math.cos(a), Math.sin(a)]);
function deplacer(nx, nz) {
  const ici = gene(S.x, S.z), dx = nx - S.x, dz = nz - S.z;
  const essais = [[nx, nz], ...GLISSE.map(([c, s]) => [S.x + (dx * c - dz * s) * c, S.z + (dx * s + dz * c) * c]), [nx, S.z], [S.x, nz]];
  for (const [x, z] of essais) {
    const [cx, cz] = S.lieu ? limiter(S.lieu, x, z) : [x, z], p = gene(cx, cz);
    if (!S.lieu && hauteurSol(cx, cz) - S.y > .45) continue;
    if (p === 0 || p < ici - 1e-4 || (p < 1 && p <= ici + 1e-4)) { S.x = cx; S.z = cz; if (!S.lieu) S.y = hauteurSol(cx, cz); return; } // à 99, on est dans un bâtiment : on peut seulement en sortir
  }
}

// ---------- Vues : derrière soi, de haut, très haut (touche V, bouton « Vue », LB de la manette) ----------
const VUES = [['Derrière toi', 7, .4], ['De haut', 45, 1], ['Très haut', 140, 1.38], ['Du bas', 4.5, -.15]]; // du bas : en contre-plongée, la caméra à 50 cm du sol (demande des testeurs)
function changerVue() {
  if (S.lieu) { ligne('À l’intérieur, la caméra reste près de toi : la vue de haut revient dehors.'); return; }
  S.vue = (S.vue + 1) % VUES.length; const [, d, t] = VUES[S.vue];
  S.dist = S.lieu ? Math.min(d, 6) : d; S.tangage = t;
  const b = $('#slVue'); if (b) b.textContent = `Voir ${VUES[(S.vue + 1) % VUES.length][0].toLowerCase()}`; // ce que fera le prochain clic
}

// ---------- Manette : boutons ----------
/** Appelé par manette.js à chaque image quand le salon est ouvert et qu'aucune fenêtre n'attend un choix. */
export function manetteSalon(m) {
  S.pad = m; S.padT = performance.now();
  if (!S.padVu) { S.padVu = true; const a = $('.sl-aide'); if (a) a.textContent = m.ps ? 'Manette : stick gauche pour marcher ou conduire · stick droit pour tourner et prendre de la hauteur · L1 vue · R2/L2 gaz et frein · ✕ □ ○ : les actions affichées sur les boutons (○ klaxonne en roulant) · △ gestes, travail, habits · Select aller à · Start phrases' : 'Manette : stick gauche pour marcher ou conduire · stick droit pour tourner et prendre de la hauteur · LB vue · RT/LT gaz et frein · A X B : les actions affichées sur les boutons (B klaxonne en roulant) · Y gestes, travail, habits · Select aller à · Start phrases'; }
  if (m.lb) changerVue();
  if (m.a) porte();
  if (m.x) S.actions?.[1]?.f();
  if (m.b) { if (T.mode === 'conduit') son('klaxon'); else S.actions?.[2]?.f(); } // à pied : la 3e action
  if (m.y) choisir('Gestes', [...GESTES.map(([id, nom]) => ({ texte: nom, f: () => geste(id) })), { texte: 'Prendre un zém', f: helerZem }, { texte: 'Travailler', f: menuTravail }, { texte: 'Mes commerces', f: listeCommerces }, { texte: 'M’habiller', f: () => ouvrirGarderobe(S.modele) }]);
  if (m.select) choisir(T.mode === 'conduit' ? 'GPS : où vas-tu ?' : 'Aller à…', tousLieux().map(L => ({ texte: L[1], f: () => aller(L[0]) })));
  if (m.start) choisir('Dire à tes amis', PHRASES.map(p => ({ texte: p, f: () => dire(p) })));
}

// ---------- Héler un zém : choisir où aller, négocier le prix ----------
function helerZem() {
  if (T.mode !== 'pied' || S.lieu) { ligne(S.lieu ? 'Sors d’abord pour héler un zém.' : 'Tu es déjà en route.'); return; }
  const proches = tousLieux().filter(L => { if (L[0] === 'station') return false; const d = destination(L); return d && Math.hypot(d[0] - S.x, d[1] - S.z) < 15000; }); // Ouidah ↔ Cotonou : 35 km, c'est l'avion
  // Un chemin est déjà tracé : c'est là qu'on veut aller, donc il passe en tête de la liste.
  const vise = T.gps && proches.find(L => { const d = destination(L); return d && Math.hypot(d[0] - T.gps.x, d[1] - T.gps.z) < 25; });
  if (vise) proches.splice(0, 0, ...proches.splice(proches.indexOf(vise), 1));
  choisir('Zém ! Où vas-tu ?', proches.map(L => ({ texte: L === vise ? `${L[1]} · ta destination` : L[1], f: () => {
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
  S.modele = modeleActuel(p.modele) ?? (JEU.prog?.tenue ? `t:${JEU.prog.tenue}` : S.modele); // un ancien personnage passe à la tenue offerte de son genre
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
  initCommerces({ S, T, ligne, choisir, allerVers }); // devenir patron (commerces.js)
  initChapitres({ ligne, guide: () => !$('#slGuide').hidden }); // la prochaine étape, toujours affichée (chapitres.js)
  initCarteSalon({ S, T, aller, lieux: () => [ // la mini-carte et la grande carte (carte-salon.js) : les lieux, sa maison, ses commerces
    ...LIEUX.filter(L => L[0] !== 'station').map(L => { const d = destination(L); return d && { id: L[0], nom: L[1], x: d[0], z: d[1], type: L[0] === 'maison' ? 'maison' : 'lieu' }; }).filter(Boolean),
    ...lieuxCommerces().map(c => ({ id: c.id, nom: c.nom, x: c.x, z: c.z, type: 'commerce' })),
  ] });
  if (import.meta.env.DEV) window.__salon = { S, T, VIE, LIEUX, surRoute, profondeurRue, dansBatiment, profondeurInterieur, obstaclesPres, porter, destination, majLieuxMonde }; // pour les tests (console, scripts)
  S.local = new URLSearchParams(location.search).has('salon-local');
  $('#btnSalon')?.addEventListener('click', ouvrir); $('#btnVivre')?.addEventListener('click', ouvrir);
  $('#slGestesTog')?.addEventListener('click', e => { const o = !$('#slActions').classList.contains('gestes'); $('#slActions').classList.toggle('gestes', o); e.currentTarget.setAttribute('aria-expanded', String(o)); });
  $('#slFermer')?.addEventListener('click', () => { $('#salon').hidden = true; });
  $('#slCreer')?.addEventListener('click', entrerVille);
  $('#slPrive')?.addEventListener('click', () => entrer(codeAleatoire()));
  const rejoindre = () => { const c = nettoyer($('#slCode').value, 6).toUpperCase(); if (!/^[A-Z2-9]{6}$/.test(c)) return statut('Le code du salon fait 6 caractères (lettres et chiffres).', 'mal'); entrer(c); };
  $('#slRejoindre')?.addEventListener('click', rejoindre);
  $('#slCode')?.addEventListener('keydown', e => { if (e.key === 'Enter') rejoindre(); });
  $('#slNom')?.addEventListener('keydown', e => { if (e.key === 'Enter') ($('#slCode').value ? rejoindre() : entrerVille()); });
  $('#slNom')?.addEventListener('input', e => e.target.setCustomValidity(''));
  $('#slInviter')?.addEventListener('click', inviter);
  $('#slCopier')?.addEventListener('click', copier);
  $('#slQuitter')?.addEventListener('click', () => choisir('Quitter la partie ?', [{ texte: 'Quitter', sous: 'Ton argent, ton logement et ta journée de travail sont gardés.', f: quitter }], { annuler: 'Rester' }));
  $('#slVue')?.addEventListener('click', changerVue); $('#slVue2')?.addEventListener('click', changerVue);
  $('#slEntrer')?.addEventListener('click', () => porte());
  $('#slAction2')?.addEventListener('click', () => S.actions?.[1]?.f());
  $('#slAction3')?.addEventListener('click', () => S.actions?.[2]?.f());
  $('#slZem')?.addEventListener('click', helerZem);
  $('#vhTravail')?.addEventListener('click', menuTravail);
  $('#vhMenu')?.addEventListener('click', () => menu(true)); $('#vhReprendre')?.addEventListener('click', () => menu(false)); $('#vhVoile')?.addEventListener('click', () => menu(false));
  $('#vhSon')?.addEventListener('click', () => { AUDIO.muet = !AUDIO.muet; if (AUDIO.muet) { taire(); moteurMaj(0, false); } else audioCtx(); majSon(); });
  $('#vhInviter')?.addEventListener('click', () => { menu(false); $('#slInviter')?.click(); }); $('#vhQuitter')?.addEventListener('click', () => { menu(false); $('#slQuitter')?.click(); });
  $('#vieHud')?.addEventListener('click', e => { if (S.menu && e.target.closest('.vh-boutons button:not(.vh-menu)')) menu(false); }); // Commerces, Louer, Pause… : la fenêtre qui s'ouvre passe devant
  $('#vhPause')?.addEventListener('click', basculerPause);
  $('#vhFinir')?.addEventListener('click', () => choisir('Finir ta journée ?', [{ texte: 'Oui, j’arrête pour aujourd’hui', f: finirJournee }], { annuler: 'Non, je continue' }));
  $('#slHabiller')?.addEventListener('click', () => ouvrirGarderobe(S.modele));
  initGarderobe({ porter, ligne });
  $('#vhLouer')?.addEventListener('click', () => louerMoto().then(ok => { if (ok) { garerSonVehicule(); ligne('Ta moto louée t’attend à côté : approche-toi et « Monter sur ta moto ».'); } }));
  const bascule = (bouton, panneau, autre) => $(bouton)?.addEventListener('click', () => {
    const ouvert = !$(panneau).classList.contains('ouvert'); $(panneau).classList.toggle('ouvert', ouvert); $(bouton).setAttribute('aria-expanded', String(ouvert));
    if (ouvert) { $(autre[1]).classList.remove('ouvert'); $(autre[0]).setAttribute('aria-expanded', 'false'); }
    if (panneau === '#slChat' && ouvert) { S.nonLus = 0; $('#slNonLus').hidden = true; $('#slMessages').scrollTop = 1e6; }
    if (panneau === '#slActions' && ouvert) vuGestes();
  });
  // « La discussion et l'icône des gestes sont fermées par défaut : tu pourrais faire clignoter l'icône » (un
  // testeur, 24/10) : le bouton « Aller · gestes » bat doucement tant qu'on ne l'a pas ouvert une fois. C'est
  // derrière lui que se trouvent « M'habiller », « Prendre un zém » et « Aller à » — tout ce qu'on cherche au
  // début sans le trouver. Retenu d'une partie à l'autre.
  try { if (!localStorage.getItem('cotonou3d.vuGestes')) $('#slGestesBtn')?.classList.add('appel'); } catch { /* navigation privée */ }
  bascule('#slChatBtn', '#slChat', ['#slGestesBtn', '#slActions']); bascule('#slGestesBtn', '#slActions', ['#slChatBtn', '#slChat']);
  // Fermer la discussion (×) : sur ordinateur, elle laisse place à un bouton « Discussion » ; sur téléphone, elle se replie. Retenu.
  const app = document.getElementById('app'), chatFerme = on => { app.classList.toggle('chat-ferme', on); try { localStorage.setItem('cotonou3d.chatFerme', on ? '1' : ''); } catch { /* navigation privée */ } if (!on) { S.nonLus = 0; $('#slNonLus').hidden = true; } };
  try { if (localStorage.getItem('cotonou3d.chatFerme')) app.classList.add('chat-ferme'); } catch { /* rien */ }
  $('#slChatFermer')?.addEventListener('click', () => { if (matchMedia('(max-width: 720px)').matches) $('#slChatBtn').click(); else chatFerme(true); });
  $('#slChatBtn')?.addEventListener('click', () => { if (!matchMedia('(max-width: 720px)').matches) { chatFerme(false); $('#slTexte').focus(); } });
  $('#slForm')?.addEventListener('submit', e => { e.preventDefault(); dire($('#slTexte').value); $('#slTexte').value = ''; });
  const ph = $('#slPhrases'); if (ph) for (const p of PHRASES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = p; b.addEventListener('click', () => dire(p)); ph.append(b); }
  const ge = $('#slGestes'); if (ge) for (const [i, [id, nom]] of GESTES.entries()) { const b = document.createElement('button'); b.type = 'button'; b.textContent = coarse ? nom : `${i + 1} · ${nom}`; b.addEventListener('click', () => geste(id)); ge.append(b); } // au clavier, le chiffre du geste est écrit sur le bouton
  const al = $('#slAller');
  if (al) {
    al.append(new Option('Aller à…', '')); for (const [id, nom] of LIEUX) al.append(new Option(nom, id)); al.addEventListener('change', () => { if (al.value) aller(al.value); al.value = ''; al.blur(); });
    const mes = document.createElement('optgroup'); mes.label = 'Mes commerces'; // ses commerces, dès qu'on en a (commerces.js prévient à chaque changement)
    document.addEventListener('commerces', () => { mes.replaceChildren(...lieuxCommerces().map(c => new Option(c.nom, c.id))); if (mes.children.length) al.append(mes); else mes.remove(); });
  }
  // Clavier : capté avant les raccourcis de l'exploration (qui écoutent window), sauf quand on écrit.
  window.addEventListener('keydown', e => {
    if (!S.actif) return;
    const champ = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (champ) { if (e.key === 'Escape') e.target.blur(); e.stopPropagation(); return; }
    if (e.key === 'Escape' && (document.pointerLockElement || performance.now() - (S.verrouT || 0) < 300)) { document.exitPointerLock?.(); e.preventDefault(); e.stopPropagation(); return; } // Échap libère d'abord la souris
    if (e.key === 'Escape') { // le menu ; si une autre fenêtre est ouverte, c'est elle qu'Échap ferme
      if (S.menu) menu(false); else if (['#choix', '#carteGrande', '#vieFiche', '#boutique'].some(s => $(s) && !$(s).hidden)) return; else menu(true);
      e.preventDefault(); e.stopPropagation(); return;
    }
    if (e.key === 'Enter') { if (document.pointerLockElement) document.exitPointerLock(); $('#slTexte').focus(); e.preventDefault(); e.stopPropagation(); return; }
    const g = /^(Digit|Numpad)([1-5])$/.exec(e.code); // 1 à 5 : les gestes, comme les boutons (touches physiques : pareil en AZERTY)
    if (g) { if (!e.repeat) geste(GESTES[+g[2] - 1][0]); e.preventDefault(); e.stopPropagation(); return; }
    const k = CLAVIER[e.code]; if (k === 'carte') { if (!e.repeat) basculerCarte(); e.preventDefault(); e.stopPropagation(); return; }
    if (k === 'vue') { if (!e.repeat) changerVue(); e.preventDefault(); e.stopPropagation(); } else if (k === 'porte') { if (!e.repeat) porte(); e.preventDefault(); e.stopPropagation(); }
    else if (k === 'action2' || k === 'action3') { if (!e.repeat) S.actions?.[k === 'action2' ? 1 : 2]?.f(); e.preventDefault(); e.stopPropagation(); } else if (k) { S.touches.add(k); e.preventDefault(); e.stopPropagation(); }
  }, true);
  window.addEventListener('keyup', e => { const k = CLAVIER[e.code]; if (k) S.touches.delete(k); }, true);
  window.addEventListener('blur', () => S.touches.clear());
  // Glisser sur la ville pour tourner, molette pour s'approcher ou s'éloigner.
  canvas.addEventListener('pointerdown', e => { if (S.actif) S.glisse = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  window.addEventListener('pointermove', e => { if (S.glisse && e.pointerId === S.glisse.id) { S.orbite -= (e.clientX - S.glisse.x) * .006; S.orbiteT = performance.now(); S.tangage = THREE.MathUtils.clamp(S.tangage + (e.clientY - S.glisse.y) * .005, -.15, 1.48); S.glisse.x = e.clientX; S.glisse.y = e.clientY; } }); // vers le bas : on prend de la hauteur
  window.addEventListener('pointerup', e => { if (S.glisse?.id === e.pointerId) S.glisse = null; });
  // Un clic dans la ville verrouillait le pointeur : la souris dirigeait la caméra sans tenir de bouton, comme
  // dans un jeu installé. Mais le curseur disparaissait au premier clic, le navigateur affichait son bandeau
  // « pour afficher le curseur, appuyez sur Échap », et l'on ne savait plus cliquer sur les boutons —
  // « la souris disparaît lorsque tu bouges », « le dispositif pour bouger la caméra est à revoir » (deux
  // testeurs, 24/10). On garde le glisser, juste au-dessus : on tient le bouton pour tourner, et le curseur
  // reste là. Le code du pointeur verrouillé reste, au cas où le navigateur le prenne autrement.
  document.addEventListener('mousemove', e => {
    if (!S.actif || document.pointerLockElement !== canvas) return;
    S.orbite -= e.movementX * .0032; S.tangage = THREE.MathUtils.clamp(S.tangage + e.movementY * .0028, -.15, 1.48); S.orbiteT = performance.now();
  });
  document.addEventListener('pointerlockchange', () => { S.verrouT = performance.now(); });
  // Une fenêtre qui s'ouvre (choix, menu, garde-robe, carte, fiche) rend la souris : il faut pouvoir cliquer dedans.
  const rendreSouris = () => { if (document.pointerLockElement === canvas) document.exitPointerLock(); };
  const veille = new MutationObserver(() => { if (['#choix', '#garderobe', '#vieFiche', '#carteGrande', '#vieTirage'].some(s => $(s) && !$(s).hidden) || S.menu) rendreSouris(); });
  for (const s of ['#choix', '#garderobe', '#vieFiche', '#carteGrande', '#vieTirage', '#vieHud']) if ($(s)) veille.observe($(s), { attributes: true, attributeFilter: ['hidden', 'class'] });
  canvas.addEventListener('wheel', e => { if (!S.actif) return; S.dist = THREE.MathUtils.clamp(S.dist * (1 + Math.sign(e.deltaY) * .12), 2.5, S.lieu ? 6 : 150); e.preventDefault(); }, { passive: false });
  $('#slCourir')?.addEventListener('click', e => { S.court = !S.court; e.currentTarget.setAttribute('aria-pressed', String(S.court)); }); // téléphone : courir sans pousser le joystick jusqu'au bord
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
