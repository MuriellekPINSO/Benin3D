import * as THREE from 'three';
import { $, toXZ } from './base.js';
import { son } from './audio.js';
import { controls, scene } from './scene.js';
import { E } from './etat.js';
import { startFlight } from './interface.js';
import { setMood } from './ambiances.js';
import { JEU, fmtF, sauver } from './jeu.js';
import { PLACES } from './donnees-lieux.js';
import { musiqueEvenement } from './musique.js';
import { fouleCorps, fouleTete, fouleTissus } from './lieux.js';
import { chargerDanses, personnage3d, personnagesPrets } from './personnages.js';
import { LITE } from './base.js';
import { paiementReel, payerMoMo, verifierTransaction } from './paiement.js';
import { avatarPorte } from './mode.js';

// ---------- Événement en 3D : concert sur l'esplanade de l'Amazone (priorité 4) ----------
// Une scène face à la statue, un grand écran, des lumières qui balaient, une foule qui danse et une
// musique de concert composée par le jeu. Entrée : 50 F, payés avec la cagnotte du jeu ou, comme le
// demande le cahier des charges, pour de vrai par MTN MoMo ou Moov Money (FedaPay, voir paiement.js ;
// le billet payé vaut pour la journée). Le nom reste générique : utiliser celui d'un vrai festival
// demande l'accord de ses organisateurs.

export const PRIX_ENTREE = 50;
const EV = { moi: null, enAttente: null, groupe: null, actif: false, ecran: null, ctx: null, foule: null, tetes: null, places: [], spots: [], t: 0, raf: 0, scene: null, sx: 0, sz: 0, danseurs: null };

function construire() {
  const p = PLACES.find(q => q.id === 'amazone'); const [ax, az] = toXZ(p.lat, p.lon);
  const sx = ax, sz = az + 42; EV.scene = new THREE.Vector3(sx, 4, sz); EV.sx = sx; EV.sz = sz;
  const g = new THREE.Group(); g.name = 'evenement'; g.visible = false; scene.add(g); EV.groupe = g;
  const noir = new THREE.MeshStandardMaterial({ color: '#16181c', roughness: .7 }), acier = new THREE.MeshStandardMaterial({ color: '#8c949a', metalness: .6, roughness: .35 });
  const boite = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
  boite(26, 1.6, 12, noir, sx, .8, sz);                                    // plancher de la scène
  for (const x of [-12.5, 12.5]) boite(.6, 13, .6, acier, sx + x, 6.5, sz + 4); // tours de structure
  boite(25.6, .6, .6, acier, sx, 12.7, sz + 4); boite(25.6, .6, .6, acier, sx, 12.7, sz - 4); // ponts lumière
  for (const x of [-14.5, 14.5]) boite(2.2, 4.5, 1.6, noir, sx + x, 3.8, sz - 3);              // enceintes
  // Écran géant : dessiné à la volée (motifs, égaliseur, nom du concert).
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; EV.ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; EV.ecran = tex;
  const ecran = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), new THREE.MeshBasicMaterial({ map: tex }));
  ecran.position.set(sx, 7.2, sz + 5.4); ecran.rotation.y = Math.PI; g.add(ecran); // tourné vers la statue (au nord)
  // Projecteurs : cônes de lumière qui balaient la foule.
  const lum = ['#ff3b6b', '#3bd1ff', '#ffd23b', '#9b5bff', '#3bff8a', '#ff8a3b'];
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(2.6, 16, 18, 1, true).translate(0, -8, 0), new THREE.MeshBasicMaterial({ color: lum[i], transparent: true, opacity: .18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    c.position.set(sx - 10 + i * 4, 12.4, sz - 4); g.add(c); EV.spots.push(c);
  }
  // La foule : silhouettes en tissus wax, tournées vers la scène, qui sautent en rythme (derrière les danseurs des premiers rangs).
  const n = 520, corps = new THREE.InstancedMesh(fouleCorps, new THREE.MeshLambertMaterial(), n), tetes = new THREE.InstancedMesh(fouleTete, new THREE.MeshLambertMaterial({ color: '#4a2f22' }), n);
  for (let i = 0; i < n; i++) { const x = sx + (Math.random() - .5) * 46, z = az + 6 + Math.random() * 20; EV.places.push([x, z, Math.random() * 6.28, .8 + Math.random() * .5]); corps.setColorAt(i, fouleTissus[i % fouleTissus.length]); }
  corps.frustumCulled = tetes.frustumCulled = false; // positions mises à jour à chaque image
  g.add(corps, tetes); EV.foule = corps; EV.tetes = tetes;
}
// Les premiers rangs : de vrais personnages (personnages.js) qui dansent et acclament, chacun à son rythme.
const DANSES = ['danse1', 'danse2', 'acclame'];
function danseurs() {
  if (EV.danseurs || !personnagesPrets()) return;
  EV.danseurs = [];
  const n = LITE ? 14 : 40;
  for (let i = 0; i < n; i++) {
    const m = personnage3d(7000 + i * 13, { enfant: i % 9 === 4 }) || personnage3d(7000 + i * 13); if (!m) break;
    const rang = Math.floor(i / 10);
    m.position.set(EV.sx + ((i % 10) - 4.5) * 2.1 + (Math.random() - .5) * .8, 0, EV.sz - 6 - rang * 2.2 - Math.random() * .6);
    m.rotation.y = (Math.random() - .5) * .5; // face à la scène
    m.userData.jouer(DANSES[(i * 7) % 3], 0); EV.groupe.add(m); EV.danseurs.push(m);
  }
}
function dessinerEcran(t) {
  const c = EV.ctx, w = 512, h = 256, teinte = (t * 40) % 360;
  const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, `hsl(${teinte},80%,35%)`); gr.addColorStop(1, `hsl(${(teinte + 120) % 360},80%,22%)`);
  c.fillStyle = gr; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 32; i++) { const v = (Math.sin(t * 6 + i * .7) * .5 + .5) * (Math.sin(t * 2.3 + i) * .3 + .7); c.fillStyle = `hsla(${(teinte + i * 8) % 360},90%,62%,.9)`; c.fillRect(8 + i * 15.6, h - 16 - v * 120, 11, v * 120); }
  c.fillStyle = '#fff'; c.font = '800 36px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('CONCERT DE L’ESPLANADE', w / 2, 66, w - 30);
  c.font = '600 22px system-ui, sans-serif'; c.fillText('Cotonou · ce soir', w / 2, 102);
  EV.ecran.needsUpdate = true;
}
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
function boucle(now) {
  if (!EV.actif) return;
  const t = now / 1000, temps = 60 / 118; // pulsation du morceau
  EV.places.forEach(([x, z, ph, f], i) => {
    const saut = Math.max(0, Math.sin((t / temps) * Math.PI + ph)) * .35 * f;
    m4.compose(v.set(x, saut, z), q.setFromAxisAngle(Y, Math.PI + Math.sin(t + ph) * .2), s1); EV.foule.setMatrixAt(i, m4); EV.tetes.setMatrixAt(i, m4);
  });
  EV.foule.instanceMatrix.needsUpdate = true; EV.tetes.instanceMatrix.needsUpdate = true;
  EV.spots.forEach((c, i) => { c.rotation.x = Math.sin(t * .9 + i) * .55 - .35; c.rotation.z = Math.cos(t * .7 + i * 1.3) * .5; });
  if (Math.floor(t * 12) !== Math.floor((t - .016) * 12)) dessinerEcran(t);
  EV.raf = requestAnimationFrame(boucle);
}
function entrer() {
  if (EV.actif) return; // déjà au concert
  if (!EV.groupe) construire();
  if (personnagesPrets()) chargerDanses().then(() => { if (EV.actif) danseurs(); }); // les danses arrivent en quelques secondes
  EV.groupe.visible = true; EV.actif = true; setMood('nuit'); musiqueEvenement(true);
  EV.minDist = controls.minDistance; controls.minDistance = 5; // au concert, on peut s'approcher de la foule
  startFlight(EV.scene.clone(), 32, 1.2, Math.PI - .65, 2.6); // derrière la foule, en biais (la statue est dans l'axe de la scène)
  $('#evQuitter').hidden = false; $('#evenement').hidden = true;
  EV.raf = requestAnimationFrame(boucle);
  // Le joueur danse au premier rang dans la tenue qu'il porte (boutique de mode), avec « Toi » au-dessus.
  avatarPorte().then(m => {
    if (!m || !EV.actif || EV.moi) return;
    m.position.set(EV.sx, 0, EV.sz - 7.1); m.userData.jouer('danse1', 0); // au milieu, entre le 1er et le 2e rang
    m.userData.tete.add(etiquetteToi()); m.add(halo()); EV.groupe.add(m); EV.moi = m;
    // La caméra se pose au bord de la scène, face au joueur : on voit sa tenue, la foule derrière lui.
    startFlight(m.position.clone().setY(1), 7.5, 1.0, .91, 2.4);
  });
}
// Un rond de lumière au sol sous le joueur (sans vraie lampe : en ajouter une recompilerait les matériaux
// de toute la scène, d'où une saccade, surtout sur les ordinateurs lents).
function halo() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,226,150,.85)'); g.addColorStop(.55, 'rgba(255,200,90,.35)'); g.addColorStop(1, 'rgba(255,190,80,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.y = .03; m.renderOrder = 3; return m;
}
function etiquetteToi() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const c = cv.getContext('2d');
  c.fillStyle = '#f2b705'; c.beginPath(); c.roundRect(8, 8, 112, 40, 20); c.fill();
  c.beginPath(); c.moveTo(56, 48); c.lineTo(64, 60); c.lineTo(72, 48); c.fill();
  c.fillStyle = '#17130c'; c.font = '800 26px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Toi', 64, 29);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); s.scale.set(.62, .31, 1); s.position.y = .5; s.renderOrder = 20;
  return s;
}
export function quitterEvenement() {
  if (!EV.actif) return; EV.actif = false; cancelAnimationFrame(EV.raf);
  musiqueEvenement(false); EV.groupe.visible = false; $('#evQuitter').hidden = true;
  if (EV.moi) { EV.moi.userData.liberer(); EV.groupe.remove(EV.moi); EV.moi = null; }
  if (EV.minDist) controls.minDistance = EV.minDist;
}
// Billet payé en MoMo : gardé pour la journée sur cet appareil (on ne paie pas deux fois le même soir).
const CLE_BILLET = 'cotonou3d-billet-concert', aujourdhui = () => new Date().toISOString().slice(0, 10);
const billetDuJour = () => { try { return localStorage.getItem(CLE_BILLET) === aujourdhui(); } catch { return false; } };
const garderBillet = () => { try { localStorage.setItem(CLE_BILLET, aujourdhui()); } catch { /* navigation privée */ } };

/** Fenêtre d'entrée : 50 F pris sur la cagnotte du jeu, ou payés par MoMo. */
function ouvrir() {
  if (billetDuJour()) return entrer();
  const el = $('#evenement'), P = JEU.prog, assez = (P?.cagnotte || 0) >= PRIX_ENTREE, momo = paiementReel();
  el.querySelector('.ev-solde').textContent = `Ta cagnotte : ${fmtF(P?.cagnotte || 0)}`;
  el.querySelector('#evPayer').disabled = !assez;
  el.querySelector('.ev-manque').hidden = assez;
  el.querySelector('#evMomo').hidden = el.querySelector('.ev-momo').hidden = !momo;
  if (!EV.enAttente) etatMomo('');
  el.hidden = false;
}

// ---------- Paiement MoMo (FedaPay) ----------
function etatMomo(txt, cls = '') {
  const p = $('#evEtat'); p.textContent = txt; p.className = 'ev-etat ' + cls; p.hidden = !txt;
}
const MESSAGES = {
  annule: ['Paiement annulé : rien n’a été prélevé.', ''],
  reseau: ['FedaPay ne répond pas. Vérifie ta connexion, puis réessaie.', 'mal'],
  pending: ['Paiement pas encore confirmé. Valide-le sur ton téléphone, puis touche « Vérifier mon paiement ».', ''],
  'non-configure': ['Le paiement MoMo n’est pas encore activé sur ce site.', 'mal'],
};
async function payerEnMoMo() {
  const btn = $('#evMomo'), autres = [$('#evPayer'), $('#evAnnuler')];
  if (btn.disabled) return;
  const dispo = autres.map(b => b.disabled);
  btn.disabled = true; autres.forEach(b => { b.disabled = true; }); btn.classList.add('charge');
  etatMomo(EV.enAttente ? 'Vérification du paiement…' : 'Ouverture de FedaPay…');
  const r = EV.enAttente ? await verifierTransaction(EV.enAttente, PRIX_ENTREE) : await payerMoMo({ montant: PRIX_ENTREE, description: 'Entrée au concert de l’Esplanade', objet: 'concert' });
  btn.disabled = false; autres.forEach((b, i) => { b.disabled = dispo[i]; }); btn.classList.remove('charge');
  EV.enAttente = r.statut === 'pending' ? r.id : null;
  btn.querySelector('span').textContent = EV.enAttente ? 'Vérifier mon paiement' : `Payer ${PRIX_ENTREE} F par MoMo`;
  if (r.paye) {
    garderBillet(); son('piece'); etatMomo('Paiement reçu, bon concert !', 'bien');
    setTimeout(() => { etatMomo(''); entrer(); }, 1100);
    return;
  }
  const [txt, cls] = MESSAGES[r.statut] || ['Le paiement n’a pas abouti : rien n’a été prélevé. Tu peux réessayer.', 'mal'];
  etatMomo(txt, cls);
}
export function initEvenement() {
  $('#btnConcert')?.addEventListener('click', ouvrir);
  $('#evAnnuler')?.addEventListener('click', () => { $('#evenement').hidden = true; });
  $('#evPayer')?.addEventListener('click', () => {
    const P = JEU.prog; if (!P || P.cagnotte < PRIX_ENTREE) return;
    P.cagnotte -= PRIX_ENTREE; sauver(); son('piece'); entrer();
  });
  $('#evMomo')?.addEventListener('click', payerEnMoMo);
  $('#evQuitter')?.addEventListener('click', quitterEvenement);
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && EV.actif) quitterEvenement(); });
}
export const evenementActif = () => EV.actif;
void E;
