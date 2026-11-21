import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LITE } from './base.js';
import { bulle, personne } from './discussions.js';
import { INTERIEURS, declarerInterieur } from './interieurs.js';
import { K, panneauTexte } from './lieux.js';
import { poserAssis } from './personnages.js';

// ---------- Entrer dans la cathédrale et dans la mosquée de Zongo ----------
// « On doit pouvoir entrer dans la cathédrale et voir la messe, l'église, le prêtre ; pareil pour la mosquée de Zongo »
// (Murielle, 21/11). Deux intérieurs comme le Dôme ou la salle de jeux (interieurs.js) : on entre par la porte de la
// façade, la pièce est bâtie à part. Dedans, la vie ne s'arrête pas : à la cathédrale, la messe (le prêtre à l'autel,
// les servants, la chorale et son tam-tam, l'assemblée sur les bancs, où l'on peut s'asseoir) ; à la mosquée, la prière
// en commun (l'imam devant le mihrab, les fidèles en rangs qui s'inclinent, se prosternent et s'assoient avec lui).
// Les gestes de la prière et du prêtre sont des poses (personnages.js, poserCulte). Tout reste sobre et respectueux :
// on regarde, on s'assoit, on ne dérange personne.

const bloc = (I, w, d, x, z, h = 1) => I.obstacles.push([x, z, w / 2, d / 2, h]);
let motifsPrets = false;
function motifs() {
  if (motifsPrets) return; motifsPrets = true;
  // Vitrail en plein cintre : verres de couleur sertis de plomb ; hors de l'arc, transparent (alphaTest).
  K.motif('vitrail', (c, t) => {
    const h = c.canvas.height * t / c.canvas.width; c.clearRect(0, 0, t, h);
    c.save(); c.beginPath(); c.moveTo(0, h); c.lineTo(0, t / 2); c.arc(t / 2, t / 2, t / 2, Math.PI, 0); c.lineTo(t, h); c.closePath(); c.clip();
    const verres = ['#2f5fb3', '#3f7fd0', '#b8322a', '#e0a526', '#2f8f57', '#7a3fa0', '#e8d9a8', '#1f3f80'];
    for (let y = 0; y < h; y += t / 6) for (let x = 0; x < t; x += t / 4) { c.fillStyle = verres[Math.floor(K.alea() * verres.length)]; c.fillRect(x, y, t / 4 + 1, t / 6 + 1); }
    c.fillStyle = '#f2e3b0'; c.beginPath(); c.arc(t / 2, h * .42, t * .2, 0, Math.PI * 2); c.fill(); // le médaillon clair du milieu
    c.fillStyle = '#b8322a'; c.fillRect(t * .47, h * .3, t * .06, h * .24); c.fillRect(t * .38, h * .37, t * .24, t * .06); // une croix
    c.strokeStyle = '#1d1a18'; c.lineWidth = 3;
    for (let y = 0; y < h; y += t / 6) { c.beginPath(); c.moveTo(0, y); c.lineTo(t, y); c.stroke(); }
    for (let x = 0; x <= t; x += t / 4) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    c.restore(); c.lineWidth = 6; c.strokeStyle = '#3a2a22'; c.beginPath(); c.moveTo(3, h); c.lineTo(3, t / 2); c.arc(t / 2, t / 2, t / 2 - 3, Math.PI, 0); c.lineTo(t - 3, h); c.stroke();
  }, 128, 320);
  K.motif('plafondBois', (c, t) => { for (let i = 0; i < 16; i++) { c.fillStyle = ['#7b5131', '#8a5d39', '#6f4729', '#94663f'][i % 4]; c.fillRect(0, i * t / 16, t, t / 16); c.fillStyle = 'rgba(25,14,6,.45)'; c.fillRect(0, i * t / 16, t, 2); } });
  // Le devant d'autel, blanc et or (le Christ Roi, dernier dimanche avant l'Avent : les ornements sont blancs).
  K.motif('antependium', (c, t) => {
    const h = c.canvas.height * t / c.canvas.width; c.fillStyle = '#f7f3e8'; c.fillRect(0, 0, t, h);
    c.fillStyle = '#c9a227'; c.fillRect(0, 0, t, h * .08); c.fillRect(0, h * .92, t, h * .08); c.fillRect(t * .47, h * .2, t * .06, h * .6); c.fillRect(t * .38, h * .36, t * .24, h * .1);
    c.strokeStyle = '#c9a227'; c.lineWidth = 3; c.strokeRect(t * .04, h * .14, t * .92, h * .72);
  }, 512, 200);
  K.motif('chasuble', (c, t) => { // autour du corps (u = 0 : devant, u = .5 : dos) : une bande d'or devant et derrière, l'ourlet doré
    c.fillStyle = '#f6f2e6'; c.fillRect(0, 0, t, t);
    c.fillStyle = '#c9a227'; for (const u of [0, .5, 1]) c.fillRect(t * u - t * .035, 0, t * .07, t); c.fillRect(0, t * .93, t, t * .07);
    c.fillRect(t * .5 - t * .12, t * .3, t * .24, t * .06); c.fillRect(-t * .12, t * .3, t * .24, t * .06); c.fillRect(t * .88, t * .3, t * .24, t * .06); // la croix, devant et derrière
  });
  // Le fond du chœur : un ciel doré qui rayonne derrière le crucifix.
  K.motif('choeur', (c, t) => {
    const h = c.canvas.height * t / c.canvas.width, g = c.createRadialGradient(t / 2, h * .38, 10, t / 2, h * .38, t * .7);
    g.addColorStop(0, '#fff3c4'); g.addColorStop(.35, '#e9c46a'); g.addColorStop(1, '#3f5f8f'); c.fillStyle = g; c.fillRect(0, 0, t, h);
    c.strokeStyle = 'rgba(255,240,190,.35)'; c.lineWidth = 4; for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; c.beginPath(); c.moveTo(t / 2, h * .38); c.lineTo(t / 2 + Math.cos(a) * t, h * .38 + Math.sin(a) * t); c.stroke(); }
  }, 512, 512);
  // Tapis de prière : rangs de niches (une par fidèle), vert et rouge, liserés d'or.
  K.motif('tapisPriere', (c, t) => {
    c.fillStyle = '#1f6b4a'; c.fillRect(0, 0, t, t);
    c.fillStyle = '#8f2d2a'; c.beginPath(); c.moveTo(t * .1, t * .95); c.lineTo(t * .1, t * .35); c.arc(t * .5, t * .35, t * .4, Math.PI, 0); c.lineTo(t * .9, t * .95); c.closePath(); c.fill();
    c.strokeStyle = '#d9b44a'; c.lineWidth = 5; c.stroke();
    c.fillStyle = '#d9b44a'; c.beginPath(); c.arc(t * .5, t * .5, t * .08, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#174f37'; c.fillRect(0, t * .96, t, t * .04);
  });
  // Le mihrab : niche en arc, mosaïque verte et dorée, cadre blanc.
  K.motif('mihrab', (c, t) => {
    const h = c.canvas.height * t / c.canvas.width; c.fillStyle = '#f2efe6'; c.fillRect(0, 0, t, h);
    c.save(); c.beginPath(); c.moveTo(t * .14, h); c.lineTo(t * .14, h * .38); c.arc(t * .5, h * .38, t * .36, Math.PI, 0); c.lineTo(t * .86, h); c.closePath(); c.clip();
    c.fillStyle = '#1f5e46'; c.fillRect(0, 0, t, h);
    for (let y = 0; y < h; y += 22) for (let x = (y / 22) % 2 ? 11 : 0; x < t; x += 22) { c.fillStyle = '#d9b44a'; c.beginPath(); c.moveTo(x, y + 11); c.lineTo(x + 11, y); c.lineTo(x + 22, y + 11); c.lineTo(x + 11, y + 22); c.closePath(); c.fill(); c.fillStyle = '#2f7d5c'; c.fillRect(x + 8, y + 8, 6, 6); }
    c.restore(); c.strokeStyle = '#d9b44a'; c.lineWidth = 8; c.beginPath(); c.moveTo(t * .14, h); c.lineTo(t * .14, h * .38); c.arc(t * .5, h * .38, t * .36, Math.PI, 0); c.lineTo(t * .86, h); c.stroke();
    c.strokeStyle = '#3f6fb0'; c.lineWidth = 10; c.strokeRect(t * .05, h * .05, t * .9, h * .95);
  }, 256, 400);
  K.motif('baieMosquee', (c, t) => { // fenêtre en arc, verre clair bleuté
    const h = c.canvas.height * t / c.canvas.width; c.clearRect(0, 0, t, h);
    c.beginPath(); c.moveTo(0, h); c.lineTo(0, t / 2); c.arc(t / 2, t / 2, t / 2, Math.PI, 0); c.lineTo(t, h); c.closePath(); c.fillStyle = '#cfe4f2'; c.fill();
    c.strokeStyle = '#3f6fb0'; c.lineWidth = 6; c.stroke(); c.lineWidth = 3; c.beginPath(); c.moveTo(t / 2, t * .1); c.lineTo(t / 2, h); c.moveTo(0, h * .6); c.lineTo(t, h * .6); c.stroke();
  }, 128, 256);
}
/** Plan lumineux (vitrail, baie) : la couleur de la toile, éclairée de l'intérieur comme par le soleil du dehors. */
function verriere(nom, w, h, x, y, z, rot, force = .85) {
  const t = new THREE.CanvasTexture(K.toile(nom)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: force, roughness: .3, alphaTest: .5, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.y = rot; m.userData.garder = true; K.racine.add(m); return m;
}
/** Une personne debout (x, z, regard), animée en pose de culte si elle sait le faire. */
function debout(I, id, x, z, cap, o = {}, y = 0) {
  const p = personne(id, o); p.position.set(x, y, z); p.rotation.y = cap; K.racine.add(p); return p;
}
/** Un vêtement liturgique qui suit le corps posé (personnages.js, E.habit) : aube jusqu'aux pieds ou chasuble jusqu'aux genoux. */
function vetir(p, { long = false, matiere }) {
  if (!p.userData.habiller) return;
  // Un profil tourné autour du corps : le col, les épaules couvertes, puis le tissu qui tombe et s'évase ; assez large pour
  // que le corps (la chemise, l'uniforme) ne passe pas au travers. Les bras sortent par les côtés.
  const prof = long ? [[.1, .07], [.2, .02], [.25, -.1], [.27, -.6], [.31, -1.25]] : [[.11, .08], [.23, .03], [.3, -.1], [.36, -.5], [.43, -.98]];
  const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  const m = new THREE.Mesh(geo, matiere); m.scale.z = long ? .8 : .72; m.castShadow = !LITE; p.add(m);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), hb = new THREE.Vector3(), haut = new THREE.Vector3(), q = new THREE.Quaternion(), qg = new THREE.Quaternion();
  p.userData.habiller((E, os) => {
    os.L_Upperarm.getWorldPosition(a); os.R_Upperarm.getWorldPosition(b); a.add(b).multiplyScalar(.5); // le milieu des épaules
    os.Hip.getWorldPosition(hb); haut.subVectors(a, hb).normalize();
    p.getWorldQuaternion(qg).invert(); haut.applyQuaternion(qg); // le haut du buste, dans le repère du personnage
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), haut); m.quaternion.copy(q);
    m.position.copy(p.worldToLocal(a.addScaledVector(new THREE.Vector3(0, 1, 0), long ? .05 : .07)));
  });
}

// ---------- La cathédrale Notre-Dame de Miséricorde ----------
const CW = 20, CD = 42, CH = 12, SANCT = 9.4; // largeur, longueur, hauteur ; z du bord du chœur
function cathedrale(I) {
  motifs();
  const W = CW, D = CD, H = CH;
  K.boite(W, .2, D, K.tex('terrazzo', W / 3, D / 3), 0, -.1, 0).castShadow = false;
  K.boite(W, .2, D, K.tex('plafondBois', W / 4, D / 4), 0, H + .1, 0).castShadow = false;
  const creme = K.mat('#efe7da', { rugosite: .9 }), raye = K.tex('rayuresPleines', 1, 6);
  for (const [w, d, x, z] of [[W, .3, 0, -D / 2], [W, .3, 0, D / 2], [.3, D, -W / 2, 0], [.3, D, W / 2, 0]]) K.boite(w, H, d, creme, x, H / 2, z).castShadow = false;
  // Pilastres rayés rouge et blanc (comme les murs du dehors), vitraux entre eux.
  for (let z = -D / 2 + 2.5; z < D / 2 - 1; z += 5) for (const s of [-1, 1]) K.boite(.7, H, .45, raye, s * (W / 2 - .35), H / 2, z).castShadow = false;
  for (let z = -D / 2 + 5; z < D / 2 - 3; z += 5) for (const s of [-1, 1]) verriere('vitrail', 1.7, 4.25, s * (W / 2 - .17), 6, z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  // Deux rangs de colonnes (bas-côtés), arcs rayés entre elles.
  const blanc = K.mat('#f4f0e6', { rugosite: .7 }), rouge = K.mat('#b8352c', { rugosite: .7 });
  const arc = K.geo('arcNef', () => new THREE.TorusGeometry(2.5, .22, 6, 18, Math.PI));
  for (const s of [-1, 1]) for (let z = -D / 2 + 6; z <= SANCT; z += 5) {
    K.cyl(.36, .42, 7.6, 14, blanc, s * 6.2, 3.8, z); K.cyl(.48, .48, .5, 14, rouge, s * 6.2, .25, z); K.cyl(.5, .4, .4, 14, rouge, s * 6.2, 7.8, z);
    bloc(I, 1, 1, s * 6.2, z, 8);
    if (z + 5 <= SANCT) { const a = K.maillage(arc, raye, s * 6.2, 7.6, z + 2.5); a.rotation.y = Math.PI / 2; }
  }
  // L'allée centrale, tapis rouge jusqu'au chœur.
  K.boite(1.5, .02, SANCT + D / 2 - 1, K.mat('#8f2525', { rugosite: .95 }), 0, .01, (SANCT - D / 2) / 2 + .5).castShadow = false;
  // Les bancs : deux rangées de part et d'autre de l'allée ; cinq places par banc.
  const bois = K.mat('#6b4426', { rugosite: .55 }), LB = 4.3;
  const banc = mergeGeometries([
    new THREE.BoxGeometry(LB, .07, .42).translate(0, .45, 0), new THREE.BoxGeometry(LB, .48, .05).translate(0, .73, -.22),
    new THREE.BoxGeometry(.06, .9, .55).translate(-LB / 2, .45, -.03), new THREE.BoxGeometry(.06, .9, .55).translate(LB / 2, .45, -.03),
    new THREE.BoxGeometry(LB, .07, .14).translate(0, .14, .42), // l'agenouilloir du banc de devant
  ]);
  const rangs = []; for (let z = -D / 2 + 5.5; z <= SANCT - 3.3; z += 1.15) rangs.push(z);
  const bancs = new THREE.InstancedMesh(banc, bois, rangs.length * 2), m4 = new THREE.Matrix4(); let n = 0;
  for (const z of rangs) for (const s of [-1, 1]) {
    const x = s * (.95 + LB / 2); bancs.setMatrixAt(n++, m4.makeTranslation(x, 0, z)); bloc(I, LB, .5, x, z - .02, .9);
    for (let k = 0; k < 5; k++) I.sieges.push({ x: x - 1.72 + k * .86, z: z + .03, cap: 0 });
  }
  bancs.castShadow = !LITE; bancs.receiveShadow = true; K.racine.add(bancs);
  // Le chœur : estrade et marches, autel blanc, cierges, crucifix, tabernacle, ambon, siège, la Vierge.
  const marbre = K.tex('travertin', 4, 2), hE = .75;
  K.boite(W - .6, hE, D / 2 - SANCT, marbre, 0, hE / 2, (SANCT + D / 2) / 2).castShadow = false;
  for (let k = 0; k < 3; k++) K.boite(10, (k + 1) * .25, .3, marbre, 0, (k + 1) * .125, SANCT - .9 + k * .3).castShadow = false;
  bloc(I, W, D / 2 - SANCT + .2, 0, (SANCT + D / 2) / 2 + .1, 1); // on regarde le chœur depuis les marches, on n'y monte pas pendant la messe
  const za = 13.2, yA = hE;
  K.boite(2.6, 1, 1.1, K.mat('#ece6da', { rugosite: .5 }), 0, yA + .5, za);
  K.boite(2.75, .03, 1.2, K.mat('#ffffff', { rugosite: .8 }), 0, yA + 1.015, za);
  const devant = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(K.toile('antependium')), roughness: .8 }));
  devant.material.map.colorSpace = THREE.SRGBColorSpace; devant.position.set(0, yA + .5, za - .56); devant.rotation.y = Math.PI; K.racine.add(devant);
  const or = K.mat('#c9a227', { metal: .7, rugosite: .3 }), cire = K.mat('#f8f2e2'), flamme = K.mat('#ffd27a', { emissif: '#ffb640' });
  for (const x of [-1.15, -.85, .85, 1.15]) { K.cyl(.05, .07, .3, 8, or, x, yA + 1.18, za - .3); K.cyl(.025, .025, .25, 8, cire, x, yA + 1.45, za - .3); K.sphere(.025, flamme, x, yA + 1.6, za - .3).scale.set(1, 1.8, 1); } // aux deux bouts : on voit le prêtre entre eux
  for (const x of [-2.4, 2.4]) { K.cyl(.06, .2, 1.4, 10, or, x, yA + .7, za); K.cyl(.04, .04, .4, 8, cire, x, yA + 1.6, za); K.sphere(.035, flamme, x, yA + 1.84, za).scale.set(1, 1.8, 1); }
  // Le fond du chœur, le crucifix.
  const fond = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(K.toile('choeur')), emissive: '#ffe9b0', emissiveIntensity: .15, roughness: .9 }));
  fond.material.map.colorSpace = THREE.SRGBColorSpace; fond.position.set(0, 5.5, D / 2 - .17); fond.rotation.y = Math.PI; K.racine.add(fond);
  const croix = K.mat('#5a3a22', { rugosite: .6 }), corps = K.mat('#e7dccb', { rugosite: .7 }), zc = D / 2 - .35;
  K.boite(.32, 5, .2, croix, 0, 6, zc); K.boite(2.8, .3, .2, croix, 0, 7.4, zc);
  K.boite(.34, .95, .14, corps, 0, 6.75, zc - .17); K.sphere(.14, corps, 0, 7.42, zc - .19); K.boite(.24, .95, .12, corps, 0, 5.85, zc - .17);
  for (const s of [-1, 1]) { const b = K.boite(1.05, .11, .11, corps, s * .62, 7.3, zc - .17); b.rotation.z = s * -.12; }
  K.boite(.5, .07, .04, K.mat('#f1ead8'), 0, 8.45, zc - .1); // l'écriteau
  K.boite(.9, 1.2, .6, K.mat('#efe7da'), 0, yA + .6, D / 2 - 1.6); K.boite(.6, .7, .5, or, 0, yA + 1.55, D / 2 - 1.6); // le tabernacle
  K.cyl(.09, .09, .14, 10, K.mat('#c0392b', { emissif: '#a01e12' }), .8, yA + 1.3, D / 2 - 1.6); // la lampe du sanctuaire
  // L'ambon (à gauche) et le siège du prêtre (à droite).
  K.boite(.9, 1.15, .6, K.mat('#6b4426'), -4, yA + .58, SANCT + 2.2); K.boite(.85, .65, .02, K.mat('#f6f2e6'), -4, yA + .8, SANCT + 1.89);
  K.boite(.75, .5, .7, K.mat('#7a1f1f'), 4.2, yA + .25, za + 2.4); K.boite(.75, 1.2, .1, K.mat('#5a3a22'), 4.2, yA + .9, za + 2.75);
  // La Vierge, à droite du chœur : manteau bleu, robe blanche, auréole dorée ; des fleurs à ses pieds.
  const xv = W / 2 - 2.2, zv = SANCT - 1.4;
  K.boite(1, 1.1, 1, K.mat('#e9e2d4'), xv, .55, zv); bloc(I, 1.2, 1.2, xv, zv, 2.5);
  K.cyl(.22, .3, 1.5, 14, K.mat('#f6f4ee'), xv, 1.85, zv); K.cone(.36, 1.45, 14, K.mat('#3f6fb7', { rugosite: .6 }), xv, 1.95, zv - .03);
  K.sphere(.16, K.mat('#e7dccb'), xv, 2.78, zv); K.maillage(new THREE.TorusGeometry(.22, .025, 6, 20), or, xv, 2.95, zv + .02);
  for (const dx of [-.35, .35]) { K.cyl(.15, .12, .3, 10, K.mat('#d9d2c4'), xv + dx, 1.25, zv - .55); K.sphere(.2, K.mat('#e8e4f0'), xv + dx, 1.5, zv - .55); }
  // Les ventilateurs du plafond (ils tournent : majCulte).
  I.ventilos = [];
  for (let z = -D / 2 + 8; z < SANCT; z += 8) {
    K.cyl(.03, .03, 1.2, 6, '#3a3a3a', 0, H - .6, z);
    const v = new THREE.Group(); v.position.set(0, H - 1.2, z); K.racine.add(v);
    for (let k = 0; k < 3; k++) { const p = K.boite(1.3, .02, .18, K.mat('#efe9dd'), Math.cos(k * 2.09) * .65, 0, Math.sin(k * 2.09) * .65, v); p.rotation.y = -k * 2.09; }
    I.ventilos.push(v);
  }
  // Les portes du fond (on ressort par là) et le panneau.
  for (const s of [-1, 1]) K.boite(1.5, 3.6, .12, K.mat('#5a3a22', { rugosite: .6 }), s * .78, 1.8, -D / 2 + .2).castShadow = false;
  panneauTexte(['SORTIE'], 1.4, .4, 0, 4, -D / 2 + .19, 0, { fond: '#1f7a3e', encre: '#ffffff', px: 512, py: 146 });
  // Les personnes : le prêtre à l'autel, face à l'assemblée ; deux servants ; la chorale et son tam-tam ; l'assemblée.
  let id = 1400;
  const aube = K.mat('#f7f5ee', { rugosite: .85, face2: true }), chas = K.tex('chasuble', 1, 1, '#ffffff', { face2: true });
  const pretre = debout(I, id++, 0, za + .95, Math.PI, { role: 'bureau' }, yA); // tête nue (l'ancien porte sa calotte)
  vetir(pretre, { long: true, matiere: aube }); vetir(pretre, { matiere: chas });
  const servants = [-1.7, 1.7].map(x => { const p = debout(I, id++, x, za + .7, Math.PI, { role: 'eleve-garcon' }, yA); vetir(p, { long: true, matiere: aube }); return p; });
  const chorale = [];
  for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) chorale.push(debout(I, id++, -W / 2 + 1.6 + r * .9, SANCT - 1.2 - k * .8, Math.PI / 2, { femme: r === 0 || k % 2 === 0 }));
  K.cyl(.22, .17, .75, 14, K.mat('#6b4426'), -W / 2 + 3.4, .38, SANCT - 2.4); K.cyl(.23, .23, .02, 14, K.mat('#e6d7b8'), -W / 2 + 3.4, .76, SANCT - 2.4); // le tam-tam
  const tambour = debout(I, id++, -W / 2 + 3.4, SANCT - 1.9, Math.PI, { femme: false });
  bloc(I, 3.2, 4.2, -W / 2 + 2.2, SANCT - 2.4, 1.6);
  const part = LITE ? .3 : .52;
  I.sieges.forEach((s, i) => { if (((i * 7 + 3) % 10) / 10 < part) { const p = personne(id + i, { assise: true }); p.userData.jouer?.('assis'); /* pas de téléphone pendant la messe */ poserAssis(p, s.x, .45, s.z, s.cap, .19); K.racine.add(p); s.occupe = true; } });
  const assis = K.racine.children.filter(o => (o.userData?.jouer || o.userData?.pnj) && o.position.z > SANCT - 8 && o.position.z < SANCT - 3 && o !== tambour);
  I.culte = { type: 'messe', pretre, servants, chorale, tambour, t: 0, etape: -1, fidele: assis };
  for (const p of [pretre, ...servants]) p.userData.culte?.('mains-jointes');
}
// La messe, en boucle : le prêtre dit, l'assemblée répond ; la chorale chante entre deux.
const MESSE = [
  ['orant', 'Le Seigneur soit avec vous.', 'Et avec votre esprit.'],
  ['mains-jointes', null, null, '♪ Gloire à Dieu au plus haut des cieux ♪'],
  ['orant', 'Élevons notre cœur.', 'Nous le tournons vers le Seigneur.'],
  ['orant', 'Rendons grâce au Seigneur notre Dieu.', 'Cela est juste et bon.'],
  ['mains-jointes', null, null, '♪ Saint, saint, saint le Seigneur ♪'],
  ['orant', 'Que la paix du Seigneur soit toujours avec vous.', 'Et avec votre esprit.'],
  ['mains-jointes', null, null, '♪ Alléluia, alléluia ! ♪'],
  ['orant', 'Allez, dans la paix du Christ.', 'Nous rendons grâce à Dieu.'],
];
function majMesse(I, dt) {
  const C = I.culte; C.t += dt;
  for (const v of I.ventilos || []) v.rotation.y += dt * 4;
  if (C.reponse && (C.reponse.t -= dt) <= 0) { const f = C.fidele[Math.floor(Math.random() * C.fidele.length)]; if (f) bulle(f, C.reponse.texte, { duree: 3 }); C.reponse = null; }
  if (C.etape >= 0 && C.t < 9) return;
  C.t = 0; C.etape = (C.etape + 1) % MESSE.length;
  const [pose, dit, repond, chant] = MESSE[C.etape];
  C.pretre.userData.culte?.(pose);
  for (const s of C.servants) s.userData.culte?.('mains-jointes');
  if (dit) { bulle(C.pretre, dit, { duree: 3.4 }); C.reponse = { t: 2.6, texte: repond }; }
  if (chant) { for (const c of C.chorale) c.userData.jouer?.('parle'); bulle(C.chorale[1] || C.pretre, chant, { duree: 4, muet: true }); }
  else for (const c of C.chorale) c.userData.jouer?.('idle');
  if (C.tambour) C.tambour.userData.jouer?.(chant ? 'parle' : 'idle');
}

// ---------- La mosquée de Zongo ----------
const MW = 26, MD = 24, MH = 9;
function mosquee(I) {
  motifs();
  const W = MW, D = MD, H = MH;
  K.boite(W, .2, D, K.tex('tapisPriere', W / 1, D / 1.2), 0, -.1, 0).castShadow = false;
  K.boite(W, .2, D, K.mat('#f6f4ee', { rugosite: .9 }), 0, H + .1, 0).castShadow = false;
  const blanc = K.mat('#f3f1ea', { rugosite: .85 }), bleu = K.mat('#3f6fb0', { rugosite: .6 }), vert = K.mat('#1f6b4a', { rugosite: .6 });
  for (const [w, d, x, z] of [[W, .3, 0, -D / 2], [W, .3, 0, D / 2], [.3, D, -W / 2, 0], [.3, D, W / 2, 0]]) { K.boite(w, H, d, blanc, x, H / 2, z).castShadow = false; K.boite(w + .02, .4, d + .02, bleu, x, H - .8, z).castShadow = false; K.boite(w + .02, 1.1, d + .02, vert, x, .55, z).castShadow = false; }
  // Baies en arc sur les côtés.
  for (let z = -D / 2 + 3; z < D / 2 - 2; z += 4) for (const s of [-1, 1]) verriere('baieMosquee', 1.4, 2.8, s * (W / 2 - .17), 4.2, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, .7);
  // Colonnes et arcs ; la coupole au milieu, vue du dedans.
  const arc = K.geo('arcMosquee', () => new THREE.TorusGeometry(3, .25, 6, 18, Math.PI));
  for (const x of [-9, -3, 3, 9]) for (const z of [-3.5, 3.5]) { K.boite(.7, 6.2, .7, blanc, x, 3.1, z); K.boite(.8, .4, .8, vert, x, .2, z); bloc(I, .9, .9, x, z, 6); }
  for (const z of [-3.5, 3.5]) for (const x of [-6, 0, 6]) K.maillage(arc, blanc, x, 6.2, z);
  const coupole = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: (() => { const t = new THREE.CanvasTexture(K.toile('domeZongo')); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(4, 1); return t; })(), side: THREE.BackSide, roughness: .8 }));
  coupole.position.set(0, H, 0); K.racine.add(coupole);
  // Le lustre : un anneau doré, ses ampoules.
  const or = K.mat('#d9b44a', { metal: .7, rugosite: .3 }), lampe = K.mat('#fff4d6', { emissif: '#ffe7b0' });
  K.cyl(.02, .02, 4, 6, or, 0, H + 1, 0); K.maillage(new THREE.TorusGeometry(1.6, .05, 6, 32), or, 0, H - 1, 0).rotation.x = Math.PI / 2;
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; K.sphere(.08, lampe, Math.cos(a) * 1.6, H - .9, Math.sin(a) * 1.6); }
  // Le mihrab, au milieu du mur de la qibla (+z), et le minbar à sa droite.
  const t = new THREE.CanvasTexture(K.toile('mihrab')); t.colorSpace = THREE.SRGBColorSpace;
  const mih = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 4.4), new THREE.MeshStandardMaterial({ map: t, roughness: .6, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: .12 }));
  mih.position.set(0, 2.2, D / 2 - .17); mih.rotation.y = Math.PI; K.racine.add(mih);
  K.boite(3.2, .25, .5, or, 0, 4.5, D / 2 - .3);
  const boisM = K.mat('#6b4426', { rugosite: .55 }), xm = 2.6;
  for (let k = 0; k < 7; k++) K.boite(1, (k + 1) * .25, .38, boisM, xm, (k + 1) * .125, D / 2 - 3.6 + k * .38);
  for (const s of [-1, 1]) K.boite(.06, 2.4, 2.7, boisM, xm + s * .52, 1.2, D / 2 - 2.5);
  K.cone(.7, .9, 4, or, xm, 3.9, D / 2 - 1.2).rotation.y = Math.PI / 4; for (const dx of [-.45, .45]) K.cyl(.04, .04, 1.4, 6, or, xm + dx, 2.9, D / 2 - 1.2);
  bloc(I, 1.2, 3.2, xm, D / 2 - 2.2, 3);
  // Au fond à gauche, derrière une claustra, les rangs des femmes ; à l'entrée, les chaussures rangées.
  const xs = -2.6, zs = -D / 2 + 5.6;
  K.boite(W / 2 + xs, 1.9, .08, K.tex('claustra', 6, 1), (-W / 2 + xs) / 2, .95, zs).castShadow = false; bloc(I, W / 2 + xs, .2, (-W / 2 + xs) / 2, zs, 1.9);
  K.boite(.08, 1.9, zs + D / 2 - 1.6, K.tex('claustra', 3, 1), xs, .95, (zs - D / 2 + 1.6) / 2 + .8).castShadow = false; bloc(I, .2, zs + D / 2 - 1.6, xs, (zs - D / 2 + 1.6) / 2 + .8, 1.9);
  K.boite(2.4, .9, .4, boisM, 5, .45, -D / 2 + .45); bloc(I, 2.4, .5, 5, -D / 2 + .45, 1);
  const tons = ['#2b2b2b', '#6b4426', '#8f2d2a', '#1f3f80', '#d9b44a', '#3a3a3a'];
  for (let k = 0; k < 14; k++) K.boite(.11, .05, .26, K.mat(tons[k % tons.length]), 3.95 + (k % 7) * .3, k < 7 ? .92 : .5, -D / 2 + .45);
  for (const s of [-1, 1]) K.boite(1.5, 3.4, .12, K.mat('#2f5f88', { rugosite: .5 }), s * .78, 1.7, -D / 2 + .2).castShadow = false;
  panneauTexte(['SORTIE'], 1.4, .4, 0, 3.8, -D / 2 + .19, 0, { fond: '#1f7a3e', encre: '#ffffff', px: 512, py: 146 });
  // L'imam devant le mihrab ; les rangs des hommes derrière lui ; les femmes au fond. Tous tournés vers la qibla (+z).
  let id = 1700;
  const imam = debout(I, id++, 0, D / 2 - 2.3, 0, { role: 'ancien' });
  const fideles = [], rangsH = LITE ? [D / 2 - 3.8, D / 2 - 5.1] : [D / 2 - 3.8, D / 2 - 5.1, D / 2 - 6.4, D / 2 - 7.7];
  const libre = x => ![-9, -3, 3, 9].some(c => Math.abs(x - c) < .55);
  for (const z of rangsH) {
    for (let x = -8.4; x <= 8.4; x += .8) if (libre(x) && !(z > D / 2 - 4.5 && Math.abs(x - xm) < .8)) fideles.push(debout(I, id++, x, z, 0, { femme: false }));
    bloc(I, 17.6, .9, 0, z + .2, 1.2);
  }
  for (const z of LITE ? [-D / 2 + 2.6] : [-D / 2 + 2.6, -D / 2 + 3.9]) for (let x = -W / 2 + 1.4; x <= xs - .7; x += .85) fideles.push(debout(I, id++, x, z, 0, { femme: true }));
  I.culte = { type: 'priere', imam, fideles: fideles.map(p => ({ p, retard: .25 + Math.random() * .6 })), t: 0, etape: -1, attente: [] };
  imam.userData.culte?.('qiyam'); for (const f of fideles) f.userData.culte?.('qiyam');
}
// Une rak'a, en boucle : l'imam dit « Allâhu akbar » à chaque mouvement, les fidèles le suivent un instant après.
const PRIERE = [
  ['qiyam', 9, 'Allâhu akbar'], ['ruku', 5, 'Allâhu akbar'], ['debout', 3.5, 'Sami‘a Llâhu liman hamidah'],
  ['sujud', 5, 'Allâhu akbar'], ['jalsa', 3.5, 'Allâhu akbar'], ['sujud', 5, 'Allâhu akbar'], ['jalsa', 4, 'Allâhu akbar'],
];
function majPriere(I, dt) {
  const C = I.culte; C.t += dt;
  for (let i = C.attente.length - 1; i >= 0; i--) { const a = C.attente[i]; if ((a.t -= dt) <= 0) { a.p.userData.culte?.(a.pose); C.attente.splice(i, 1); } }
  if (C.etape >= 0 && C.t < PRIERE[C.etape][1]) return;
  C.t = 0; C.etape = (C.etape + 1) % PRIERE.length;
  const [pose, , dit] = PRIERE[C.etape];
  C.imam.userData.culte?.(pose);
  bulle(C.imam, dit, { duree: 2.4, muet: true });
  for (const f of C.fideles) C.attente.push({ p: f.p, pose, t: f.retard });
}

/** À chaque image (trajets.js) : la messe et la prière, quand on est dedans. */
export function majCulte(dt) {
  for (const id of ['cathedrale', 'mosquee-zongo']) {
    const I = INTERIEURS.get(id); if (!I?.g?.visible || !I.culte) continue;
    if (I.culte.type === 'messe') majMesse(I, dt); else majPriere(I, dt);
  }
}
/** La porte de la cathédrale, sur le parvis devant la façade (lieux.js) : x, z en ville, `dehors` : le regard en sortant. */
export function declarerCathedrale(porte, dehors) {
  declarerInterieur('cathedrale', { nom: 'la cathédrale Notre-Dame', porte, dehors, w: CW, d: CD, plafond: CH - .5, lampe: 2.6, entree: [0, -CD / 2 + 3, 0], entrer: 'Entrer dans la cathédrale', construire: cathedrale });
}
/** La porte de la mosquée de Zongo (lieux-videos.js). */
export function declarerMosquee(porte, dehors) {
  declarerInterieur('mosquee-zongo', { nom: 'la mosquée de Zongo', porte, dehors, w: MW, d: MD, plafond: MH - .5, lampe: 2.3, entree: [0, -MD / 2 + 2.6, 0], entrer: 'Entrer dans la mosquée', construire: mosquee });
}
