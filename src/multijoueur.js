import * as THREE from 'three';
import Peer from 'peerjs';
import { $ } from './base.js';
import { son } from './audio.js';
import { scene } from './scene.js';
import { mergeColored } from './ville.js';
import { matVeh, partsTokpa, partsVoiture, partsZem } from './vehicules.js';
import { JEU, lancerLigne, ouvrirJeu, toast } from './jeu.js';

// ---------- Mode deux joueurs (cahier des charges, priorité 4) ----------
// Deux joueurs dans la même ville, sans serveur à nous : connexion directe entre les deux
// navigateurs (WebRTC), mise en relation par le service public de PeerJS. L'un crée la partie et
// envoie le lien d'invitation (ou le code de 4 lettres) ; l'autre clique dessus. Dès que l'un des
// deux choisit une ligne, l'autre part sur la même : chacun voit le véhicule de l'autre (chemise
// bleue, numéro au-dessus), l'écart entre les deux, et qui arrive le premier au terminus.
//
// Entre deux réseaux différents (4G et wifi, par exemple), la connexion directe est souvent bloquée :
// il faut alors un relais TURN. Pour en brancher un, mettre dans les variables d'environnement
// (.env.local, ou Vercel) VITE_TURN_URLS (adresses séparées par des virgules), VITE_TURN_USER et
// VITE_TURN_PASS — un compte gratuit Metered ou Cloudflare en donne. Pour plus de joueurs, des
// salons et un classement, il faudra un vrai serveur temps réel (Colyseus, Socket.io).

const MJ = { peer: null, conn: null, code: '', autre: null, fantome: null, envoi: 0, delai: 0, autreArrive: false, moiArrive: false };
const PREFIXE = 'zemrun-cotonou-', LETTRES = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const env = import.meta.env;
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
if (env.VITE_TURN_URLS) ICE.push({ urls: env.VITE_TURN_URLS.split(',').map(u => u.trim()), username: env.VITE_TURN_USER, credential: env.VITE_TURN_PASS });
const OPTIONS = { config: { iceServers: ICE } };
const codeAleatoire = () => Array.from({ length: 4 }, () => LETTRES[Math.floor(Math.random() * LETTRES.length)]).join('');
const statut = t => { const el = $('#mjStatut'); if (el) el.textContent = t; };
export const multijoueurActif = () => !!MJ.conn?.open;
const lienInvitation = () => `${location.origin}${location.pathname}?duo=${MJ.code}`;
const BLOQUE = 'La connexion directe ne passe pas entre vos deux réseaux (souvent en 4G). Essayez tous les deux sur le même wifi.';

function brancher(conn) {
  MJ.conn = conn; clearTimeout(MJ.delai);
  // Pas de réponse au bout de 15 s : les deux réseaux ne se laissent pas joindre directement.
  MJ.delai = setTimeout(() => { if (!conn.open) statut(BLOQUE + (ICE.length > 1 ? '' : ' (aucun relais TURN configuré)')); }, 15000);
  conn.on('open', () => {
    clearTimeout(MJ.delai);
    statut('Connecté ! Choisissez une ligne : vous partirez ensemble.');
    envoyer({ type: 'bonjour', numero: JEU.numero });
    $('#mjInviter').hidden = true;
  });
  conn.on('iceStateChanged', etat => { if (etat === 'failed' || etat === 'disconnected') statut(etat === 'failed' ? BLOQUE : 'Connexion instable…'); });
  conn.on('data', recevoir);
  conn.on('close', () => { statut('L’autre joueur est parti.'); MJ.conn = null; MJ.autre = null; if (MJ.fantome) MJ.fantome.visible = false; majEcart(null); });
  conn.on('error', e => statut(`Connexion perdue (${e.type || e})`));
}
/** Crée une partie : un code de 4 lettres et un lien d'invitation à envoyer à l'autre joueur. */
export function creerPartie() {
  fermer(); MJ.code = codeAleatoire(); statut('Création de la partie…');
  MJ.peer = new Peer(PREFIXE + MJ.code, OPTIONS);
  MJ.peer.on('open', () => { statut(`Partie créée, code ${MJ.code}. Envoie le lien à ton ami avec « Inviter », puis attends-le ici.`); $('#mjInviter').hidden = false; });
  MJ.peer.on('connection', c => { if (MJ.conn?.open) return c.close(); statut('Ton ami arrive…'); brancher(c); });
  MJ.peer.on('error', e => { if (e.type === 'unavailable-id') creerPartie(); else statut(`Impossible de créer la partie (${e.type})`); });
}
/** Envoie le lien d'invitation (partage du téléphone : WhatsApp, SMS…), ou le copie. */
async function inviter() {
  const url = lienInvitation(), texte = `On joue à Zém Run ensemble ? Clique sur le lien (code ${MJ.code}) :`;
  try { if (navigator.share) { await navigator.share({ title: 'Zém Run à deux', text: texte, url }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${texte} ${url}`); statut(`Lien copié ! Colle-le dans WhatsApp pour ton ami. (Code ${MJ.code})`); }
  catch { statut(`Envoie ce lien à ton ami : ${url}`); }
}
/** Rejoint la partie d'un autre joueur avec son code. */
export function rejoindre(code) {
  code = (code || '').trim().toUpperCase(); if (!/^[A-Z]{4}$/.test(code)) return statut('Le code fait 4 lettres.');
  fermer(); statut('Connexion à la partie…'); MJ.peer = new Peer(OPTIONS);
  MJ.peer.on('open', () => brancher(MJ.peer.connect(PREFIXE + code, { reliable: true })));
  MJ.peer.on('error', e => statut(e.type === 'peer-unavailable' ? 'Partie introuvable : vérifie le code, ou demande à ton ami de recréer la partie.' : `Connexion impossible (${e.type})`));
}
export function fermer() { clearTimeout(MJ.delai); try { MJ.conn?.close(); MJ.peer?.destroy(); } catch { } MJ.conn = null; MJ.peer = null; MJ.autre = null; if (MJ.fantome) MJ.fantome.visible = false; }
function envoyer(o) { if (MJ.conn?.open) MJ.conn.send(o); }
/** Appelé par le klaxon du joueur : l'autre l'entend s'il est près. */
export function envoyerKlaxon() { envoyer({ type: 'klaxon' }); }
/** Le joueur choisit une ligne : à deux, l'autre part sur la même. */
export function annoncerDepart(ligne, veh) { MJ.autreArrive = MJ.moiArrive = false; envoyer({ type: 'depart', ligne, veh }); }
/** Le joueur arrive au terminus : on prévient l'autre ; rend le classement de la course à deux. */
export function arriveeDuo(arrive) {
  if (!multijoueurActif()) return '';
  if (arrive) { MJ.moiArrive = true; envoyer({ type: 'arrive' }); }
  return arrive ? (MJ.autreArrive ? '2e' : '1er') : 'Abandon';
}
function recevoir(d) {
  if (!d || typeof d !== 'object') return;
  if (d.type === 'etat') MJ.autre = d;
  else if (d.type === 'bonjour') statut(`Connecté avec le zém n° ${String(d.numero || '').slice(0, 5)}. Choisissez une ligne : vous partirez ensemble.`);
  else if (d.type === 'klaxon' && MJ.fantome?.visible && JEU.joueur && MJ.fantome.position.distanceTo(JEU.joueur.position) < 120) son('klaxon');
  else if (d.type === 'depart') {
    const L = (JEU.lignes || []).find(l => l.id === d.ligne); if (!L) return;
    MJ.autreArrive = MJ.moiArrive = false;
    if (JEU.actif && JEU.ligne === L && !JEU.fini) return; // déjà dessus
    JEU.fini = false; lancerLigne(L, d.veh === 'tokpa' || L.veh === 'tokpa' ? L.veh : d.veh);
    if (JEU.etat) JEU.etat.file = 1; // à côté de l'autre, sur la file de droite
    toast('Ton ami a choisi la ligne : c’est parti, ensemble !', 2.2, 'bien');
  } else if (d.type === 'arrive') { MJ.autreArrive = true; if (JEU.actif && !JEU.fini && !MJ.moiArrive) toast('Ton ami est déjà au terminus !', 2.2, 'mal'); }
}
// Le véhicule de l'autre joueur : chemise bleue, et son numéro au-dessus.
function etiquette(texte) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const c = cv.getContext('2d');
  c.fillStyle = 'rgba(31,61,107,.92)'; c.beginPath(); c.roundRect(4, 6, 248, 52, 26); c.fill();
  c.fillStyle = '#fff'; c.font = '700 26px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(texte, 128, 33);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); s.scale.set(3.2, .8, 1); s.renderOrder = 30; return s;
}
function fantome(veh, numero) {
  if (MJ.fantome) scene.remove(MJ.fantome);
  const g = new THREE.Group(), parts = veh === 'tokpa' ? partsTokpa() : veh === 'voiture' ? partsVoiture('#2f6fb0') : partsZem({ chemise: '#2f6fb0', passager: false });
  const m = new THREE.Mesh(mergeColored(parts), matVeh); m.castShadow = true; g.add(m);
  const e = etiquette(`Ton ami · n° ${String(numero || '').slice(0, 5)}`); e.position.y = veh === 'tokpa' ? 4.2 : 3; g.add(e);
  g.userData = { veh, numero }; scene.add(g); MJ.fantome = g; return g;
}
// L'écart avec l'autre joueur, en haut de l'écran pendant la course.
function majEcart(A) {
  const el = $('#jhDuo'); if (!el) return;
  const st = JEU.etat, ok = A && A.enJeu && JEU.actif && st;
  el.hidden = !ok; if (!ok) return;
  if (A.ligne !== JEU.ligne?.id) { el.textContent = 'Ton ami roule sur une autre ligne'; return; }
  const d = Math.round(A.s - st.s);
  el.textContent = Math.abs(d) < 8 ? 'Ton ami est à côté de toi' : `Ton ami · ${Math.abs(d)} m ${d > 0 ? 'devant' : 'derrière'}`;
}
/** À chaque image : on envoie sa position (10 fois par seconde) et on place le véhicule de l'autre. */
export function majMultijoueur(dt) {
  if (!MJ.conn?.open) return;
  MJ.envoi -= dt;
  if (MJ.envoi <= 0) {
    MJ.envoi = .1; const j = JEU.actif && JEU.joueur, st = JEU.etat;
    envoyer(j && st ? { type: 'etat', enJeu: true, x: j.position.x, y: j.position.y, z: j.position.z, a: j.rotation.y, veh: JEU.veh, numero: JEU.numero, ligne: JEU.ligne?.id, s: st.s } : { type: 'etat', enJeu: false });
    majEcart(MJ.autre);
  }
  const A = MJ.autre;
  if (!A || !A.enJeu) { if (MJ.fantome) MJ.fantome.visible = false; return; }
  const f = !MJ.fantome || MJ.fantome.userData.veh !== A.veh || MJ.fantome.userData.numero !== A.numero ? fantome(A.veh, A.numero) : MJ.fantome;
  if (!f.visible || f.position.distanceTo(new THREE.Vector3(A.x, A.y, A.z)) > 60) f.position.set(A.x, A.y, A.z); // téléporté ou première image
  const k = 1 - Math.exp(-dt * 10);
  f.visible = true; f.position.x += (A.x - f.position.x) * k; f.position.y += (A.y - f.position.y) * k; f.position.z += (A.z - f.position.z) * k;
  let da = A.a - f.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); f.rotation.y += da * k;
}
/** Boutons du menu de jeu, et lien d'invitation (?duo=CODE) : on ouvre le jeu et on rejoint la partie. */
export function initMultijoueur() {
  $('#mjCreer')?.addEventListener('click', creerPartie);
  $('#mjInviter')?.addEventListener('click', inviter);
  $('#mjRejoindre')?.addEventListener('click', () => rejoindre($('#mjCode').value));
  $('#mjCode')?.addEventListener('keydown', e => { if (e.key === 'Enter') rejoindre(e.target.value); e.stopPropagation(); });
  const code = new URLSearchParams(location.search).get('duo');
  if (code) {
    history.replaceState(null, '', location.pathname); // le lien ne resservira pas au rechargement
    const go = () => { ouvrirJeu(); $('#mjCode').value = code.toUpperCase(); rejoindre(code); $('#mjStatut')?.scrollIntoView({ block: 'center' }); };
    // On attend la ville et l'écran d'accueil (il s'affiche à la fin du chargement), qu'on referme aussitôt.
    let attente = 0;
    const t = setInterval(() => {
      if (!JEU.lignes?.length || !document.querySelector('#loader.done')) return;
      if (document.getElementById('app')?.classList.contains('mode-accueil')) document.querySelector('#acPasser')?.click();
      else if (++attente < 8) return;
      clearInterval(t); go();
    }, 300);
  }
}
