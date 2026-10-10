import * as THREE from 'three';
import { $, coarse, toXZ } from './base.js';
import { PLACES } from './donnees-lieux.js';
import { personne } from './discussions.js';
import { E } from './etat.js';
import { startFlight } from './interface.js';
import { JEU } from './jeu.js';
import { chargerDanses, chargerTenue, personnage3d, personnagesPrets } from './personnages.js';
import { camera, canvas, controls, scene } from './scene.js';

// ---------- Salon entre amis : se retrouver dans Cotonou ----------
// Jusqu'à 8 amis dans la même ville : chacun se promène à pied avec son personnage, voit les autres,
// discute (chat et bulles au-dessus des têtes), salue, danse, rit, s'assoit, et propose d'aller ensemble
// à l'Amazone, à la Haie Vive, à la plage ou au siège de Moov. On invite ses amis par un lien (WhatsApp).
// En ligne : Firebase Realtime Database du projet zem-run-cotonou, connexion anonyme, règles dans
// database.rules.json. Avec ?salon-local dans l'adresse, les onglets du même navigateur se relient sans
// serveur (BroadcastChannel) : c'est le mode de test.

// Configuration web publique de Firebase : elle est visible par tout visiteur, c'est normal ; la
// sécurité vient des règles de la base.
const FIREBASE = {
  apiKey: 'AIzaSyBICBd5BGAGoLBgjRb78Zq-shfP9oij1rA', authDomain: 'zem-run-cotonou.firebaseapp.com', projectId: 'zem-run-cotonou',
  databaseURL: 'https://zem-run-cotonou-default-rtdb.europe-west1.firebasedatabase.app', appId: '1:655292147870:web:e6d7ab3d39a452adb8338f',
};
const MAX = 8, ENVOI = .2, LETTRES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', CLE = 'cotonou3d.salon';
const AVATARS = [['vendeuse', 'Vendeuse en pagne'], ['etudiante', 'Étudiante'], ['maman', 'Maman'], ['jeune', 'Jeune en maillot'], ['bureau', 'Tenue de bureau'], ['ancien', 'Ancien en boubou']];
const GESTES = [['salut', 'Saluer'], ['danse1', 'Danser'], ['rire', 'Rire'], ['assis', 'S’asseoir'], ['telephone', 'Téléphoner']];
const ANIMS = new Set(['idle', 'marche', 'parle', ...GESTES.map(g => g[0])]);
const PHRASES = ['Ça va ?', 'On y va !', 'On mange où ?', 'Attends-moi !', 'Trop bien ici', 'Viens voir !'];
// Lieux de rendez-vous : id dans PLACES, nom dans le menu, « je vais … », décalage du point d'arrivée (mètres,
// x vers l'est, z vers le sud) et direction du regard (0 = vers le sud). Toujours dans un espace dégagé : la
// caméra se tient 7 m derrière. Haie Vive : rue Les Cocotiers, celle des maquis (Le Lambi's, Cordon Bleu…).
const LIEUX = [['amazone', 'Esplanade de l’Amazone', 'à l’esplanade de l’Amazone', 0, -62, 0], ['haievive', 'Haie Vive (rue des maquis)', 'à la Haie Vive', -65, -153, Math.PI / 2], ['fidjrosse', 'Plage de Fidjrossè', 'à la plage de Fidjrossè', 0, 0, 0], ['moov', 'Siège de Moov Africa', 'au siège de Moov', 5, -22, 0]];
const CLAVIER = { ArrowUp: 'avant', KeyW: 'avant', ArrowDown: 'arriere', KeyS: 'arriere', ArrowLeft: 'gauche', KeyA: 'gauche', ArrowRight: 'droite', KeyD: 'droite', ShiftLeft: 'court', ShiftRight: 'court' }; // touches physiques : WASD en QWERTY = ZQSD en AZERTY

const S = { actif: false, local: false, vueReelle: false, canal: null, code: '', nom: '', modele: 'vendeuse', moi: null, bulle: null, bulleFin: 0, x: 0, z: 0, cap: 0, anim: 'idle', geste: 'idle', gesteFin: 0, touches: new Set(), joy: null, glisse: null, envoi: 0, depuis: 0, dernier: '', dist: 7, saut: false, minDist: 20, autres: new Map(), vus: new Set() };
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
let FB = null; // SDK Firebase chargé seulement à l'ouverture d'un salon
async function canalFirebase(code, R) {
  FB ??= Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/database')]).then(([a, au, d]) => {
    const app = a.initializeApp(FIREBASE, 'salon'); return { au, d, auth: au.getAuth(app), db: d.getDatabase(app) };
  });
  const { au, d, auth, db } = await FB;
  const user = auth.currentUser || (await au.signInAnonymously(auth)).user;
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
  for (let k = 0; k < 40 && !personnagesPrets(); k++) await attendre(250); // les modèles se chargent en tâche de fond
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
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); s.scale.set(1.6, .36, 1); s.position.y = .42; s.renderOrder = 30; return s;
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
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); s.scale.set(2.6, 2.6 * cv.height / 512, 1); s.position.y = .9 + s.scale.y / 2; s.renderOrder = 31;
  qui.g.userData.tete.add(s); qui.bulle = s; qui.bulleFin = performance.now() + 6000;
}
function retirerBulle(qui) { if (!qui.bulle) return; qui.bulle.parent?.remove(qui.bulle); qui.bulle.material.map.dispose(); qui.bulle.material.dispose(); qui.bulle = null; }
function retirer(A) { if (A.g) { retirerBulle(A); scene.remove(A.g); A.g.userData.liberer?.(); A.g = null; } }

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
  S.geste = nom; S.gesteFin = nom === 'salut' || nom === 'rire' ? performance.now() + 3200 : 0; // saluer et rire durent un moment, danser et s'asseoir jusqu'au prochain pas
  if (nom === 'danse1' && personnagesPrets()) chargerDanses();
}
/** Se rend à un lieu de rendez-vous ; `proposer` : prévient les autres, qui peuvent suivre d'un clic. */
function aller(id, proposer = true) {
  const L = LIEUX.find(l => l[0] === id), p = PLACES.find(q => q.id === id); if (!L || !p) return;
  const [x, z] = toXZ(p.lat, p.lon);
  S.x = x + L[3] + (Math.random() - .5) * 4; S.z = z + L[4] + (Math.random() - .5) * 4;
  S.cap = L[5]; S.saut = true; S.geste = 'idle';
  if (proposer) S.canal?.dire({ n: S.nom, txt: `Je vais ${L[2]}, venez !`, lieu: id });
}

// ---------- Entrer, quitter ----------
async function entrer(code) {
  if (S.actif) return;
  const nom = nettoyer($('#slNom').value, 16); if (!nom) { statut('Écris ton nom pour que tes amis te reconnaissent.', 'mal'); $('#slNom').focus(); return; }
  S.nom = nom; try { localStorage.setItem(CLE, JSON.stringify({ nom, modele: S.modele })); } catch { /* navigation privée */ }
  statut('Connexion au salon…');
  S.autres.clear(); S.vus.clear();
  const R = S.R = { etat: surEtat, message: surMessage }; // R.id : mon identifiant, connu avant les premiers messages
  try { S.canal = S.local ? canalLocal(code, R) : await canalFirebase(code, R); }
  catch (e) { console.warn('salon', e); statut(erreur(e), 'mal'); return; }
  S.code = code; S.actif = true; statut('');
  $('#salon').hidden = true; $('#salonHud').hidden = false; $('#slCodeAff').textContent = code; $('#slJoy').hidden = !coarse;
  document.getElementById('app').classList.add('mode-salon');
  // À pied, il faut la ville en 3D autour de soi : la « Vue réelle » (images Google à plat) attendra la sortie.
  S.vueReelle = $('#togGoogle')?.getAttribute('aria-pressed') === 'true'; if (S.vueReelle) $('#togGoogle').click();
  E.flight = null; S.minDist = controls.minDistance; controls.minDistance = 1.5; controls.enabled = false; controls.autoRotate = false;
  aller('amazone', false); majListe();
  ligne(`Bienvenue dans le salon ${code}${S.local ? ' (mode test : seuls les onglets de ce navigateur se voient)' : ''} ! Invite tes amis avec « Inviter ».`);
  if (personnagesPrets()) chargerDanses();
  const g = await creerAvatar(S.modele, graine(S.canal.id));
  if (!S.actif) { g.userData.liberer?.(); return; }
  S.moi = g; S.g = g; g.userData.tete.add(etiquette(S.nom, true)); scene.add(g);
}
function quitter() {
  if (!S.actif) return;
  S.actif = false; S.canal?.quitter(); S.canal = null;
  for (const A of S.autres.values()) retirer(A); S.autres.clear();
  if (S.moi) { retirerBulle(S); scene.remove(S.moi); S.moi.userData.liberer?.(); S.moi = S.g = null; }
  $('#salonHud').hidden = true; $('#slMessages').replaceChildren(); S.touches.clear(); S.joy = null;
  document.getElementById('app').classList.remove('mode-salon');
  controls.enabled = true; controls.minDistance = S.minDist;
  if (S.vueReelle && $('#togGoogle')?.getAttribute('aria-pressed') !== 'true') $('#togGoogle').click();
  startFlight(new THREE.Vector3(S.x, 0, S.z), 160, 1.05, S.cap + Math.PI, 1.6);
}
async function inviter() {
  const url = `${location.origin}${location.pathname}?salon=${S.code}`, texte = `Viens me retrouver à Cotonou dans Zém Run ! Salon ${S.code} :`;
  try { if (navigator.share) { await navigator.share({ title: 'Entre amis à Cotonou', text: texte, url }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${texte} ${url}`)}`, '_blank', 'noopener');
}
async function copier() {
  const url = `${location.origin}${location.pathname}?salon=${S.code}`;
  try { await navigator.clipboard.writeText(url); ligne('Lien copié : colle-le dans WhatsApp pour tes amis.'); } catch { ligne(`Envoie ce lien à tes amis : ${url}`); }
}

// ---------- À chaque image (avant controls.update, qui fait regarder la caméra vers la cible) ----------
export function majSalon(dt) {
  if (!S.actif) return;
  const t = S.touches, j = S.joy;
  const av = THREE.MathUtils.clamp((t.has('avant') ? 1 : 0) - (t.has('arriere') ? 1 : 0) + (j ? j.y : 0), -1, 1);
  const tour = THREE.MathUtils.clamp((t.has('gauche') ? 1 : 0) - (t.has('droite') ? 1 : 0) - (j ? j.x : 0), -1, 1);
  S.cap += tour * 2.4 * dt;
  const v = av * (t.has('court') || (j && Math.hypot(j.x, j.y) > .95) ? 4.6 : 1.7) * (av < 0 ? .55 : 1);
  S.x += Math.sin(S.cap) * v * dt; S.z += Math.cos(S.cap) * v * dt;
  const marche = Math.abs(v) > .05;
  if (marche || Math.abs(tour) > .05) { S.geste = 'idle'; S.gesteFin = 0; }
  else if (S.gesteFin && performance.now() > S.gesteFin) { S.geste = 'idle'; S.gesteFin = 0; }
  S.anim = marche ? 'marche' : S.geste;
  if (S.moi) { S.moi.position.set(S.x, 0, S.z); S.moi.rotation.y = S.cap; S.moi.userData.jouer(S.anim); }
  // Caméra derrière l'épaule.
  cible.set(S.x, 1.55, S.z);
  voulue.set(S.x - Math.sin(S.cap) * S.dist, 1.55 + S.dist * .42, S.z - Math.cos(S.cap) * S.dist);
  if (S.saut) { camera.position.copy(voulue); S.saut = false; } else camera.position.lerp(voulue, 1 - Math.exp(-dt * 7));
  controls.target.copy(cible);
  // Sa position aux autres, cinq fois par seconde (et au moins toutes les 2,5 s pour rester « présent »).
  S.envoi -= dt; S.depuis += dt;
  if (S.envoi <= 0 && S.canal) {
    S.envoi = ENVOI;
    const e = { n: S.nom, m: S.modele, x: r2(S.x), z: r2(S.z), h: r2(S.cap), a: S.anim }, k = JSON.stringify(e);
    if (k !== S.dernier || S.depuis > 2.5) { S.dernier = k; S.depuis = 0; S.canal.envoyer(e); }
  }
  // Les autres, lissés entre deux nouvelles.
  const kk = 1 - Math.exp(-dt * 8), now = performance.now();
  for (const A of S.autres.values()) {
    const e = A.etat; if (!e) continue;
    if (Math.hypot(e.x - A.x, e.z - A.z) > 30) { A.x = e.x; A.z = e.z; } // il vient d'utiliser « Aller à »
    const dx = e.x - A.x, dz = e.z - A.z; A.x += dx * kk; A.z += dz * kk;
    let da = (e.h || 0) - A.cap; da = Math.atan2(Math.sin(da), Math.cos(da)); A.cap += da * kk;
    if (A.g) { A.g.position.set(A.x, 0, A.z); A.g.rotation.y = A.cap; A.g.userData.jouer(Math.hypot(dx, dz) > .2 ? 'marche' : ANIMS.has(e.a) ? e.a : 'idle'); }
    if (A.bulle && now > A.bulleFin) retirerBulle(A);
  }
  if (S.bulle && now > S.bulleFin) retirerBulle(S);
}

// ---------- Interface ----------
function ouvrir() {
  if (JEU.actif) return;
  if (S.actif) { $('#salonHud').hidden = false; return; }
  let p = {}; try { p = JSON.parse(localStorage.getItem(CLE) || '{}'); } catch { /* rien */ }
  if (p.nom && !$('#slNom').value) $('#slNom').value = p.nom;
  const tenue = JEU.prog?.tenue;
  const choix = [...AVATARS, ...(tenue ? [[`t:${tenue}`, 'Ma tenue de la boutique']] : [])];
  S.modele = choix.some(c => c[0] === p.modele) ? p.modele : S.modele;
  const box = $('#slAvatars'); box.replaceChildren();
  for (const [id, nom] of choix) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.textContent = nom; b.setAttribute('aria-checked', String(id === S.modele));
    b.addEventListener('click', () => { S.modele = id; for (const x of box.children) x.setAttribute('aria-checked', String(x === b)); });
    box.append(b);
  }
  statut(''); $('#salon').hidden = false;
}
export function initSalon() {
  S.local = new URLSearchParams(location.search).has('salon-local');
  $('#btnSalon')?.addEventListener('click', ouvrir);
  $('#slFermer')?.addEventListener('click', () => { $('#salon').hidden = true; });
  $('#slCreer')?.addEventListener('click', () => entrer(codeAleatoire()));
  const rejoindre = () => { const c = nettoyer($('#slCode').value, 6).toUpperCase(); if (!/^[A-Z2-9]{6}$/.test(c)) return statut('Le code du salon fait 6 caractères (lettres et chiffres).', 'mal'); entrer(c); };
  $('#slRejoindre')?.addEventListener('click', rejoindre);
  $('#slCode')?.addEventListener('keydown', e => { if (e.key === 'Enter') rejoindre(); });
  $('#slNom')?.addEventListener('keydown', e => { if (e.key === 'Enter') ($('#slCode').value ? rejoindre() : entrer(codeAleatoire())); });
  $('#slInviter')?.addEventListener('click', inviter);
  $('#slCopier')?.addEventListener('click', copier);
  $('#slQuitter')?.addEventListener('click', quitter);
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
    const k = CLAVIER[e.code]; if (k) { S.touches.add(k); e.preventDefault(); e.stopPropagation(); }
  }, true);
  window.addEventListener('keyup', e => { const k = CLAVIER[e.code]; if (k) S.touches.delete(k); }, true);
  window.addEventListener('blur', () => S.touches.clear());
  // Glisser sur la ville pour tourner, molette pour s'approcher ou s'éloigner.
  canvas.addEventListener('pointerdown', e => { if (S.actif) S.glisse = { x: e.clientX, id: e.pointerId }; });
  window.addEventListener('pointermove', e => { if (S.glisse && e.pointerId === S.glisse.id) { S.cap -= (e.clientX - S.glisse.x) * .006; S.glisse.x = e.clientX; } });
  window.addEventListener('pointerup', e => { if (S.glisse?.id === e.pointerId) S.glisse = null; });
  canvas.addEventListener('wheel', e => { if (!S.actif) return; S.dist = THREE.MathUtils.clamp(S.dist * (1 + Math.sign(e.deltaY) * .12), 2.5, 22); e.preventDefault(); }, { passive: false });
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
