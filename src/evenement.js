import * as THREE from 'three';
import { $, toXZ } from './base.js';
import { son } from './audio.js';
import { scene } from './scene.js';
import { E } from './etat.js';
import { startFlight } from './interface.js';
import { setMood } from './ambiances.js';
import { JEU, fmtF, sauver } from './jeu.js';
import { PLACES } from './donnees-lieux.js';
import { musiqueEvenement } from './musique.js';
import { fouleCorps, fouleTete, fouleTissus } from './lieux.js';
import { chargerDanses, personnage3d, personnagesPrets } from './personnages.js';
import { LITE } from './base.js';

// ---------- Événement en 3D : concert sur l'esplanade de l'Amazone (priorité 4) ----------
// Une scène face à la statue, un grand écran, des lumières qui balaient, une foule qui danse et une
// musique de concert composée par le jeu. Entrée : 50 F, payés avec la cagnotte du jeu (monnaie
// virtuelle, comme le recommande le cahier des charges ; un vrai paiement MoMo demanderait l'API MTN
// et un compte marchand). Le nom reste générique : utiliser celui d'un vrai festival demande l'accord
// de ses organisateurs.

export const PRIX_ENTREE = 50;
const EV = { groupe: null, actif: false, ecran: null, ctx: null, foule: null, tetes: null, places: [], spots: [], t: 0, raf: 0, scene: null, sx: 0, sz: 0, danseurs: null };

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
  if (!EV.groupe) construire();
  if (personnagesPrets()) chargerDanses().then(() => { if (EV.actif) danseurs(); }); // les danses arrivent en quelques secondes
  EV.groupe.visible = true; EV.actif = true; setMood('nuit'); musiqueEvenement(true);
  startFlight(EV.scene.clone(), 32, 1.2, Math.PI - .65, 2.6); // derrière la foule, en biais (la statue est dans l'axe de la scène)
  $('#evQuitter').hidden = false; $('#evenement').hidden = true;
  EV.raf = requestAnimationFrame(boucle);
}
export function quitterEvenement() {
  if (!EV.actif) return; EV.actif = false; cancelAnimationFrame(EV.raf);
  musiqueEvenement(false); EV.groupe.visible = false; $('#evQuitter').hidden = true;
}
/** Fenêtre d'entrée : 50 F pris sur la cagnotte du jeu. */
function ouvrir() {
  const el = $('#evenement'), P = JEU.prog, assez = (P?.cagnotte || 0) >= PRIX_ENTREE;
  el.querySelector('.ev-solde').textContent = `Ta cagnotte : ${fmtF(P?.cagnotte || 0)}`;
  el.querySelector('#evPayer').disabled = !assez;
  el.querySelector('.ev-manque').hidden = assez;
  el.hidden = false;
}
export function initEvenement() {
  $('#btnConcert')?.addEventListener('click', ouvrir);
  $('#evAnnuler')?.addEventListener('click', () => { $('#evenement').hidden = true; });
  $('#evPayer')?.addEventListener('click', () => {
    const P = JEU.prog; if (!P || P.cagnotte < PRIX_ENTREE) return;
    P.cagnotte -= PRIX_ENTREE; sauver(); son('piece'); entrer();
  });
  $('#evQuitter')?.addEventListener('click', quitterEvenement);
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && EV.actif) quitterEvenement(); });
}
export const evenementActif = () => EV.actif;
void E;
