import * as THREE from 'three';
import Peer from 'peerjs';
import { $ } from './base.js';
import { son } from './audio.js';
import { scene } from './scene.js';
import { mergeColored } from './ville.js';
import { matVeh, partsTokpa, partsVoiture, partsZem } from './vehicules.js';
import { JEU } from './jeu.js';

// ---------- Mode deux joueurs (cahier des charges, priorité 4) ----------
// Deux joueurs dans la même ville, sans serveur à nous : connexion directe entre les deux
// navigateurs (WebRTC), mise en relation par le service public de PeerJS. L'un crée la partie et
// donne un code de 4 lettres, l'autre le saisit. Chacun voit le véhicule de l'autre (chemise bleue,
// numéro au-dessus) là où il roule, et entend son klaxon quand il est près. Pour plus de joueurs,
// des salons et un classement, il faudra un vrai serveur temps réel (Colyseus, Socket.io).

const MJ = { peer: null, conn: null, code: '', autre: null, fantome: null, envoi: 0 };
const PREFIXE = 'zemrun-cotonou-', LETTRES = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const codeAleatoire = () => Array.from({ length: 4 }, () => LETTRES[Math.floor(Math.random() * LETTRES.length)]).join('');
const statut = t => { const el = $('#mjStatut'); if (el) el.textContent = t; };
export const multijoueurActif = () => !!MJ.conn?.open;

function brancher(conn) {
  MJ.conn = conn;
  conn.on('open', () => { statut('Connecté ! Lance une ligne : vous vous verrez dans la ville.'); envoyer({ type: 'bonjour', numero: JEU.numero }); });
  conn.on('data', recevoir);
  conn.on('close', () => { statut('L’autre joueur est parti.'); MJ.conn = null; MJ.autre = null; if (MJ.fantome) MJ.fantome.visible = false; });
  conn.on('error', e => statut(`Connexion perdue (${e.type || e})`));
}
/** Crée une partie : un code de 4 lettres à donner à l'autre joueur. */
export function creerPartie() {
  fermer(); MJ.code = codeAleatoire(); statut('Création de la partie…');
  MJ.peer = new Peer(PREFIXE + MJ.code);
  MJ.peer.on('open', () => statut(`Partie créée. Code à donner à l’autre joueur : ${MJ.code}`));
  MJ.peer.on('connection', c => { if (MJ.conn?.open) return c.close(); brancher(c); });
  MJ.peer.on('error', e => { if (e.type === 'unavailable-id') creerPartie(); else statut(`Impossible de créer la partie (${e.type})`); });
}
/** Rejoint la partie d'un autre joueur avec son code. */
export function rejoindre(code) {
  code = (code || '').trim().toUpperCase(); if (!/^[A-Z]{4}$/.test(code)) return statut('Le code fait 4 lettres.');
  fermer(); statut('Connexion…'); MJ.peer = new Peer();
  MJ.peer.on('open', () => brancher(MJ.peer.connect(PREFIXE + code)));
  MJ.peer.on('error', e => statut(e.type === 'peer-unavailable' ? 'Code inconnu : vérifie les 4 lettres.' : `Connexion impossible (${e.type})`));
}
export function fermer() { try { MJ.conn?.close(); MJ.peer?.destroy(); } catch { } MJ.conn = null; MJ.peer = null; MJ.autre = null; if (MJ.fantome) MJ.fantome.visible = false; }
function envoyer(o) { if (MJ.conn?.open) MJ.conn.send(o); }
/** Appelé par le klaxon du joueur : l'autre l'entend s'il est près. */
export function envoyerKlaxon() { envoyer({ type: 'klaxon' }); }
function recevoir(d) {
  if (!d || typeof d !== 'object') return;
  if (d.type === 'etat') MJ.autre = d;
  else if (d.type === 'bonjour') statut(`Connecté avec le zém n° ${String(d.numero || '').slice(0, 5)}. Lance une ligne : vous vous verrez dans la ville.`);
  else if (d.type === 'klaxon' && MJ.fantome?.visible && JEU.joueur && MJ.fantome.position.distanceTo(JEU.joueur.position) < 120) son('klaxon');
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
  const e = etiquette(`Joueur 2 · n° ${String(numero || '').slice(0, 5)}`); e.position.y = veh === 'tokpa' ? 4.2 : 3; g.add(e);
  g.userData = { veh, numero }; scene.add(g); MJ.fantome = g; return g;
}
/** À chaque image : on envoie sa position (10 fois par seconde) et on place le véhicule de l'autre. */
export function majMultijoueur(dt) {
  if (!MJ.conn?.open) return;
  MJ.envoi -= dt;
  if (MJ.envoi <= 0) {
    MJ.envoi = .1; const j = JEU.actif && JEU.joueur;
    envoyer(j ? { type: 'etat', enJeu: true, x: j.position.x, y: j.position.y, z: j.position.z, a: j.rotation.y, veh: JEU.veh, numero: JEU.numero } : { type: 'etat', enJeu: false });
  }
  const A = MJ.autre;
  if (!A || !A.enJeu) { if (MJ.fantome) MJ.fantome.visible = false; return; }
  const f = !MJ.fantome || MJ.fantome.userData.veh !== A.veh || MJ.fantome.userData.numero !== A.numero ? fantome(A.veh, A.numero) : MJ.fantome;
  if (!f.visible || f.position.distanceTo(new THREE.Vector3(A.x, A.y, A.z)) > 60) f.position.set(A.x, A.y, A.z); // téléporté ou première image
  const k = 1 - Math.exp(-dt * 10);
  f.visible = true; f.position.x += (A.x - f.position.x) * k; f.position.y += (A.y - f.position.y) * k; f.position.z += (A.z - f.position.z) * k;
  let da = A.a - f.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); f.rotation.y += da * k;
}
/** Boutons du menu de jeu. */
export function initMultijoueur() {
  $('#mjCreer')?.addEventListener('click', creerPartie);
  $('#mjRejoindre')?.addEventListener('click', () => rejoindre($('#mjCode').value));
  $('#mjCode')?.addEventListener('keydown', e => { if (e.key === 'Enter') rejoindre(e.target.value); e.stopPropagation(); });
}
