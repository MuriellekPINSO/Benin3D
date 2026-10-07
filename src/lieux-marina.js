import * as THREE from 'three';
import { poserTripo, tripoDispo } from './batiments-tripo.js';
import { toXZ } from './base.js';
import { fresque, kobra } from './fresques.js';
import { K, bake, centroide, groupeLieu, mursPoly, obb, ruban, solPoly } from './lieux.js';

// ---------- Boulevard de la Marina, de l'Amazone à Bio Guéra ----------
// D'après des photos (Wikimedia Commons 2019–2026, gouv.bj, Accor) et des relevés sur
// images satellite récentes, avec les emprises OpenStreetMap quand elles sont justes :
// jardin de l'Amazone et ses pylônes, Cité ministérielle, ambassade des États-Unis,
// Golden Tulip Le Diplomate, Novotel Orisha et Ibis, siège de MTN, ambassade du Nigeria
// (Nigeria House), le Dôme et le Pavillon du Sofitel.

const AMZ = toXZ(6.3489547, 2.40755);
const A = (x, y) => [AMZ[0] + x, AMZ[1] - y]; // relevés : mètres vers l'est (x) et vers le nord (y) depuis la statue
const rect = (x0, y0, x1, y1) => [A(x0, y0), A(x1, y0), A(x1, y1), A(x0, y1)];
// Rectangle orienté : centre, longueur (selon l'angle), largeur, angle en radians (x → z).
function rectO(cx, cz, L, W, ang) { const c = Math.cos(ang), s = Math.sin(ang); return [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]].map(([u, v]) => [cx + u * c - v * s, cz + u * s + v * c]); }
function rectArrondi(cx, cz, L, W, r, ang, n = 5) {
  const pts = [], c = Math.cos(ang), s = Math.sin(ang);
  for (const [qx, qz, a0] of [[L / 2 - r, W / 2 - r, 0], [-L / 2 + r, W / 2 - r, Math.PI / 2], [-L / 2 + r, -W / 2 + r, Math.PI], [L / 2 - r, -W / 2 + r, Math.PI * 1.5]])
    for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2, u = qx + Math.cos(a) * r, v = qz + Math.sin(a) * r; pts.push([cx + u * c - v * s, cz + u * s + v * c]); }
  return pts;
}
const loc = (g, ring) => ring.map(([x, z]) => [x - g.position.x, z - g.position.z]);
// Bâtiment simple : murs d'un polygone, toit plat, acrotère.
function bloc(ring, y0, y1, murs, tu, tv, toit = '#cfcac0') { mursPoly(ring, y0, y1, murs, tu, tv); solPoly([ring], K.mat(toit), y1, 4); }
// Texte sur fond transparent (enseignes en lettres découpées).
function lettres(txt, w, h, x, y, z, rot, encre, police = '900 150px "Bricolage Grotesque", system-ui, sans-serif', fond = null) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = Math.max(64, Math.round(1024 * h / w)); const c = cv.getContext('2d');
  if (fond) { c.fillStyle = fond; c.fillRect(0, 0, cv.width, cv.height); }
  c.fillStyle = encre; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = police;
  const lignes = txt.split('\n'); lignes.forEach((l, i) => c.fillText(l, 512, cv.height * (i + 1) / (lignes.length + 1), 980));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: !fond, alphaTest: fond ? 0 : .35, roughness: .6, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.y = rot; m.userData.garder = true; m.castShadow = false; K.racine.add(m); return m;
}
// Orientation d'un plan (normale +z) pour qu'il regarde vers (dx, dz).
const versRot = (dx, dz) => Math.atan2(dx, dz);

// ---------- Matières ----------
const grille = (c, t, fond, cadre, nx, ny, epais = 3) => { c.fillStyle = fond; c.fillRect(0, 0, t, t); c.fillStyle = cadre; for (let i = 0; i <= nx; i++) c.fillRect(i * t / nx - epais / 2, 0, epais, t); for (let j = 0; j <= ny; j++) c.fillRect(0, j * t / ny - epais / 2, t, epais); };
K.motif('mtnVert', (c, t) => { // mur-rideau vert réfléchissant, petits ouvrants
  const g = c.createLinearGradient(0, 0, t, t); g.addColorStop(0, '#7fa287'); g.addColorStop(.5, '#5f8a70'); g.addColorStop(1, '#2e5a45'); c.fillStyle = g; c.fillRect(0, 0, t, t);
  grille(c, t, 'rgba(0,0,0,0)', '#29463a', 4, 4, 4);
  c.fillStyle = 'rgba(30,55,45,.55)'; for (const [i, j] of [[1, 0], [3, 2], [0, 3], [2, 1]]) c.fillRect(i * t / 4 + 8, j * t / 4 + 8, t / 4 - 16, t / 10);
});
K.motif('mtnJaune', (c, t) => { const g = c.createLinearGradient(0, 0, 0, t); g.addColorStop(0, '#e2c84a'); g.addColorStop(1, '#b0a24c'); c.fillStyle = g; c.fillRect(0, 0, t, t); grille(c, t, 'rgba(0,0,0,0)', '#8b7f33', 4, 4, 4); });
K.motif('mtnSombre', (c, t) => { c.fillStyle = '#203b2d'; c.fillRect(0, 0, t, t); grille(c, t, 'rgba(0,0,0,0)', '#16291f', 2, 4, 4); });
K.motif('nigeria', (c, t) => { // enduit blanc, fenêtres en bandeau derrière des barreaux blancs
  c.fillStyle = '#f0f0ec'; c.fillRect(0, 0, t, t); c.fillStyle = '#3c4a52'; c.fillRect(0, t * .32, t, t * .36);
  c.fillStyle = '#f4f4f0'; for (let i = 0; i < 16; i++) c.fillRect(i * t / 16, t * .32, 3, t * .36); c.fillRect(0, t * .48, t, 3);
});
// Le Dôme : revêtement gris argent (vidéos de drone 2025 : gris clair au soleil, doré seulement de nuit).
K.motif('argentDome', (c, t) => { c.fillStyle = '#a9adaf'; c.fillRect(0, 0, t, t); for (let i = 0; i < 900; i++) { c.fillStyle = ['#b4b8ba', '#9ea2a5', '#babdbf'][i % 3]; c.fillRect(Math.random() * t, Math.random() * t, 3, 2); } c.fillStyle = 'rgba(70,74,78,.35)'; for (let i = 0; i < 4; i++) c.fillRect(i * t / 4 + t / 8, 0, 2, t); });
K.motif('ailettes', (c, t) => { // Pavillon : ailettes verticales bronze et or olive
  c.fillStyle = '#3a3f35'; c.fillRect(0, 0, t, t);
  for (let i = 0; i < 24; i++) { const g = c.createLinearGradient(i * t / 24, 0, (i + 1) * t / 24, 0); g.addColorStop(0, '#b3a26a'); g.addColorStop(1, '#6f6340'); c.fillStyle = g; c.fillRect(i * t / 24 + 2, 0, t / 24 - 5, t); }
});
K.motif('verreBleu', (c, t) => { const g = c.createLinearGradient(0, 0, t, t); g.addColorStop(0, '#4f86a6'); g.addColorStop(1, '#25506b'); c.fillStyle = g; c.fillRect(0, 0, t, t); grille(c, t, 'rgba(0,0,0,0)', '#1f3c50', 3, 2, 3); });
K.motif('citeFacade', (c, t) => { // Cité ministérielle (drone 2025) : épais bandeau blanc en saillie, vitrage sombre en retrait, jardinière en nez de dalle ; un étage par tuile
  c.fillStyle = '#f1efea'; c.fillRect(0, 0, t, t);
  c.fillStyle = '#e4e1da'; c.fillRect(0, t * .3, t, t * .03); c.fillRect(0, t * .06, t, t * .015); // joints du bandeau
  c.fillStyle = '#26363a'; c.fillRect(0, t * .36, t, t * .5); // vitrage en retrait, dans l'ombre du bandeau
  const om = c.createLinearGradient(0, t * .36, 0, t * .5); om.addColorStop(0, 'rgba(0,0,0,.45)'); om.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = om; c.fillRect(0, t * .36, t, t * .14);
  c.fillStyle = '#b9c7c9'; for (let i = 0; i <= 10; i++) c.fillRect(i * t / 10 - 1, t * .36, 2, t * .5);
  c.fillStyle = 'rgba(190,220,225,.22)'; for (let i = 0; i < 10; i++) if (i % 3 === 1) c.fillRect(i * t / 10 + 3, t * .4, t / 10 - 6, t * .42);
  c.fillStyle = '#4f7a3c'; c.fillRect(0, t * .86, t, t * .05); c.fillStyle = '#6d9a52'; for (let i = 0; i < 30; i++) c.fillRect((i * 37) % t, t * .85 + (i % 3) * 2, 6, 5); // jardinière plantée
  c.fillStyle = '#e9e6df'; c.fillRect(0, t * .91, t, t * .09);
});
K.motif('citePignon', (c, t) => { c.fillStyle = '#d8d4cb'; c.fillRect(0, 0, t, t); c.fillStyle = '#8f9496'; for (let i = 0; i < 18; i++) c.fillRect(0, i * t / 18, t, t / 40); });
K.motif('parking', (c, t) => { c.fillStyle = '#f2f0ea'; c.fillRect(0, 0, t, t); c.fillStyle = '#4a4f52'; c.fillRect(0, t * .2, t, t * .62); c.fillStyle = '#e8e6e0'; for (let i = 0; i < 6; i++) c.fillRect(i * t / 6, t * .2, t / 30, t * .62); });
K.motif('usa', (c, t) => { c.fillStyle = '#d9d4c8'; c.fillRect(0, 0, t, t); c.fillStyle = '#41505a'; for (let i = 0; i < 5; i++) c.fillRect(i * t / 5 + t / 20, t * .25, t / 10, t * .5); c.fillStyle = '#c7c1b3'; c.fillRect(0, t * .88, t, t * .12); });
K.motif('murBlocs', (c, t) => { c.fillStyle = '#8f8e88'; c.fillRect(0, 0, t, t); for (let r = 0; r < 8; r++) for (let k = -1; k < 5; k++) { c.fillStyle = ['#9a9993', '#86857f', '#a3a29c', '#7f7e78'][(r * 5 + k + 9) % 4]; c.fillRect(k * t / 4 + (r % 2) * t / 8 + 2, r * t / 8 + 2, t / 4 - 4, t / 8 - 4); } });
K.motif('golden', (c, t) => { c.fillStyle = '#e2e3e0'; c.fillRect(0, 0, t, t); c.fillStyle = '#4a555c'; for (let i = 0; i < 4; i++) c.fillRect(i * t / 4 + t / 12, t * .3, t / 9, t * .38); c.fillStyle = '#cfd1cd'; c.fillRect(0, t * .9, t, t * .1); });
K.motif('goldenGris', (c, t) => { c.fillStyle = '#a8adb0'; c.fillRect(0, 0, t, t); c.fillStyle = '#3f5d70'; c.fillRect(t * .18, 0, t * .14, t); c.fillRect(t * .66, 0, t * .14, t); });
K.motif('novotel', (c, t) => { // enduit crème, panneaux de persiennes brunes, garde-corps noirs
  c.fillStyle = '#e6dcc3'; c.fillRect(0, 0, t, t);
  for (let i = 0; i < 3; i++) { c.fillStyle = '#7a5235'; c.fillRect(i * t / 3 + t / 12, t * .22, t / 6, t * .56); c.fillStyle = 'rgba(0,0,0,.25)'; for (let k = 0; k < 10; k++) c.fillRect(i * t / 3 + t / 12, t * .22 + k * t * .056, t / 6, 2); }
  c.fillStyle = '#1e1e1e'; c.fillRect(0, t * .7, t, 4); for (let i = 0; i < 16; i++) c.fillRect(i * t / 16, t * .7, 2, t * .1);
});
K.motif('ibis', (c, t) => { c.fillStyle = '#c8c1b9'; c.fillRect(0, 0, t, t); c.fillStyle = 'rgba(0,0,0,.12)'; for (let j = 0; j < 8; j++) c.fillRect(0, j * t / 8, t, 2); for (let i = 0; i < 3; i++) { c.fillStyle = '#6b4a35'; c.fillRect(i * t / 3 + t / 10, t * .22, t / 6, t * .07); c.fillStyle = '#39454c'; c.fillRect(i * t / 3 + t / 10, t * .29, t / 6, t * .38); } });
K.motif('erevanOrange', (c, t) => { c.fillStyle = '#ba5b31'; c.fillRect(0, 0, t, t); for (let i = 0; i < 400; i++) { c.fillStyle = Math.random() < .5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.05)'; c.fillRect(Math.random() * t, Math.random() * t, 3, 3); } c.fillStyle = '#a6421a'; c.fillRect(0, t * .9, t, t * .1); });
K.motif('pyramides', (c, t) => { c.fillStyle = '#c4a983'; c.fillRect(0, 0, t, t); const n = 8, s = t / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const x = i * s, y = j * s; c.fillStyle = '#d6bd96'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + s, y); c.lineTo(x + s / 2, y + s / 2); c.fill(); c.fillStyle = '#a88d68'; c.beginPath(); c.moveTo(x, y + s); c.lineTo(x + s, y + s); c.lineTo(x + s / 2, y + s / 2); c.fill(); } });
K.motif('dalleBeige', (c, t) => { c.fillStyle = '#e2d8c4'; c.fillRect(0, 0, t, t); for (let r = 0; r < 6; r++) for (let k = -1; k < 7; k++) { c.fillStyle = ['#e6ddca', '#dcd2bd', '#e9e0ce'][(r + k + 3) % 3]; c.fillRect(k * t / 6 + (r % 2) * t / 12 + 2, r * t / 6 + 2, t / 6 - 4, t / 6 - 4); } });
K.motif('usFlag', (c, t) => { const h = c.canvas.height; for (let i = 0; i < 13; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#b22234'; c.fillRect(0, i * h / 13, t, h / 13 + 1); } c.fillStyle = '#3c3b6e'; c.fillRect(0, 0, t * .4, h * 7 / 13); c.fillStyle = '#ffffff'; for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) c.fillRect(t * .04 + i * t * .075, h * .05 + j * h * .12, 3, 3); }, 256, 136);

// ---------- Jardin de l'Amazone : pelouses en lentilles, allées sinueuses, grands pylônes ----------
function jardin(J) {
  const c = centroide(J.ring), g = groupeLieu('jardin-amazone', c[0], c[1]);
  K.into(g, () => {
    solPoly([loc(g, J.ring)], K.tex('dalleBeige', 1, 1), .04, 6);
    const verts = ['#3e5a2c', '#4b6a33', '#7b3a35'];
    for (const [i, p] of J.pelouses.entries()) {
      const r = loc(g, p); solPoly([r], K.tex('gazon', 1, 1), .07, 5);
      const pc = centroide(r); // massifs d'arbustes taillés et jeunes arbres
      for (let k = 0; k < 3; k++) { const a = i * 2.1 + k * 2.2, d = 2 + k * 1.6; K.sphere(1.1 + (k % 2) * .4, K.mat(verts[(i + k) % 3], { rugosite: .95 }), pc[0] + Math.cos(a) * d, .6, pc[1] + Math.sin(a) * d).scale.set(1.4, .6, 1.2); }
      if (i % 2 === 0) K.arbre(pc[0], pc[1], .55);
    }
    for (const a of J.allees) ruban(loc(g, a), -1.6, 1.6, K.tex('dalleBeige', 1, 1), .09, 3);
    // Façade sur le boulevard : seize pylônes effilés, murets à pointes de diamant, haies.
    const pyl = K.geo('pylone', () => new THREE.CylinderGeometry(.42, .95, 20, 4).rotateY(Math.PI / 4).translate(0, 10, 0)), taupe = K.mat('#8a8578', { rugosite: .7 });
    for (let i = 0; i < 16; i++) {
      const [x, z] = A(-130 + i * 9.9, 154), [lx, lz] = [x - g.position.x, z - g.position.z];
      K.boite(1.9, 1.2, 1.9, '#9c968a', lx, .6, lz); K.maillage(pyl, taupe, lx, 1.2, lz);
      if (i < 15) { K.boite(7.6, 1.1, .6, K.tex('pyramides', 2, 1), lx + 4.95, .55, lz); K.haie(lx + 4.95, lz - 1.4, 7.6, 1.2, .9); }
    }
  });
  bake(g);
}

// ---------- Cité ministérielle : dix bâtiments R+5 et le parking-restaurant ----------
function citeMinisterielle(Cm) {
  const c = centroide(Cm.zone), g = groupeLieu('cite-ministerielle', c[0], c[1]);
  K.into(g, () => {
    solPoly([loc(g, Cm.zone)], K.tex('paves', 1, 1), .04, 5);
    const facade = K.tex('citeFacade', 1, 1);
    for (const b of Cm.bats) {
      const r = loc(g, b);
      mursPoly(r, 0, 3.6, K.mat('#bfb8aa'), 4, 3.6);           // rez-de-chaussée en retrait, sur colonnes
      mursPoly(r, 3.6, 23, facade, 7, 3.9);
      solPoly([r], K.mat('#d8cfbf'), 23.05, 4);
      const o = obb(r); K.boite(o.L + 2, .45, o.W + 2.5, '#efede7', o.cx, 23.5, o.cz).rotation.y = -o.ang; // dalle de toit débordante
      for (let k = -1; k <= 1; k++) K.boite(2.5, 1.6, 2.5, '#8f9496', o.cx + Math.cos(o.ang) * k * 14, 24.6, o.cz + Math.sin(o.ang) * k * 14);
    }
    if (Cm.parking) { const r = loc(g, Cm.parking); mursPoly(r, 0, 16, K.tex('parking', 1, 1), 8, 4); const o = obb(r); K.boite(o.L + 6, .5, o.W + 6, '#f6f5f1', o.cx, 17.2, o.cz).rotation.y = -o.ang; }
    // Cour centrale : bassin et auvent ajouré.
    const [px, pz] = A(-315, 242); const lx = px - g.position.x, lz = pz - g.position.z;
    K.cyl(7, 7, .25, 28, K.mat('#3f9fb6', { rugosite: .15 }), lx, .15, lz).scale.set(1, 1, 3.4);
    for (let k = 0; k < 6; k++) K.boite(16, .35, 4, '#e9e7e1', lx, 22.5, lz - 55 + k * 22);
    // Entrée sur l'avenue Jean-Paul II : mur-signal en béton et lettres.
    const [ex, ez] = A(-311, 470), elx = ex - g.position.x, elz = ez - g.position.z;
    K.boite(18, 4.2, 1.2, '#d6d9e2', elx, 2.1, elz);
    lettres('CITÉ\nMINISTÉRIELLE', 13, 3.2, elx, 2.2, elz - .62, Math.PI, '#5d6366', '800 150px system-ui, sans-serif');
    K.boite(4, 3, 3.5, '#e8e5dd', elx + 13, 1.5, elz + 2);
    // Clôture vert sombre sur le boulevard.
    const [f0x, f0z] = A(-445, 156), [f1x, f1z] = A(-195, 156);
    K.boite(Math.hypot(f1x - f0x, f1z - f0z), 2.4, .2, '#2f4a3a', (f0x + f1x) / 2 - g.position.x, 1.2, (f0z + f1z) / 2 - g.position.z);
  });
  bake(g);
}

// ---------- Ambassade des États-Unis : bâtiment en L, mur de blocs, drapeau ----------
function ambassadeUSA(enceinte) {
  const c = A(-511, 210), g = groupeLieu('ambassade-usa', c[0], c[1]);
  K.into(g, () => {
    if (enceinte) mursPoly(loc(g, enceinte), 0, 3, K.tex('murBlocs', 1, 1), 3, 3);
    const fac = K.tex('usa', 1, 1);
    bloc(loc(g, rect(-547, 186, -476, 218)), 0, 15, fac, 5, 3.8, '#9a9d9f');
    bloc(loc(g, rect(-547, 218, -509, 249)), 0, 15, fac, 5, 3.8, '#9a9d9f');
    for (const [x0, y0, x1, y1] of [[-547, 186, -476, 218], [-547, 218, -509, 249]]) mursPoly(loc(g, rect(x0, y0, x1, y1)), 15, 15.8, K.mat('#f2f1ec'), 4, 1);
    for (const x of [-580, -470]) { const [px, pz] = A(x, 163); K.boite(5, 3.2, 4, '#cfcbc0', px - g.position.x, 1.6, pz - g.position.z); }
    for (let k = 0; k < 4; k++) { const [px, pz] = A(-592, 175 + k * 14); K.boite(40, .2, 6, '#2b3f63', px - g.position.x, 3.2, pz - g.position.z).rotation.x = .12; }
    const [mx, mz] = A(-511, 172); K.cyl(.08, .11, 14, 8, '#e8e6e0', mx - g.position.x, 7, mz - g.position.z);
    const d = K.maillage(K.geo('pl2.6,1.4', () => new THREE.PlaneGeometry(2.6, 1.4)), K.tex('usFlag', 1, 1, '#ffffff', { face2: true }), mx - g.position.x + 1.35, 12.9, mz - g.position.z); d.castShadow = false;
  });
  bake(g);
}

// ---------- Golden Tulip Le Diplomate ----------
function goldenTulip() {
  const c = A(-490, 0), g = groupeLieu('golden-tulip', c[0], c[1]);
  K.into(g, () => {
    const b = (x0, y0, x1, y1, h, m, toit) => bloc(loc(g, rect(x0, y0, x1, y1)), 0, h, m, 4, 3.6, toit);
    b(-540, -23, -460, 2, 18.5, K.tex('golden', 1, 1), '#d9d8d2');
    b(-460, -23, -449, 4, 19.5, K.mat('#7e3537', { rugosite: .8 }), '#6e2d2f');
    b(-448, -24, -437, 8, 19.5, K.tex('goldenGris', 1, 1), '#c9ccce');
    b(-540, 2, -528, 32, 11, K.tex('golden', 1, 1), '#d9d8d2');
    b(-448, 8, -437, 32, 11, K.tex('golden', 1, 1), '#d9d8d2');
    b(-528, 28, -448, 40, 6, K.mat('#efede7'), '#f7f6f2');
    const [px, pz] = A(-490, 15); K.boite(27, .3, 10, K.mat('#3fa7c4', { rugosite: .15 }), px - g.position.x, .15, pz - g.position.z);
    // Cadre tubulaire blanc sur le toit.
    const [tx, tz] = A(-500, -10); K.boite(70, .25, .25, '#f4f4f2', tx - g.position.x, 21, tz - g.position.z - 10); K.boite(70, .25, .25, '#f4f4f2', tx - g.position.x, 21, tz - g.position.z + 10);
    for (let k = 0; k < 8; k++) K.cyl(.12, .12, 2.5, 6, '#f4f4f2', tx - g.position.x - 35 + k * 10, 19.8, tz - g.position.z - 10);
    // Enseignes face au boulevard (au nord).
    const [sx, sz] = A(-442.5, 8.3); lettres('GOLDEN TULIP', 10.5, 2, sx - g.position.x, 17.6, sz - g.position.z - .05, Math.PI, '#1f2a5a', '700 150px Georgia, "Times New Roman", serif', '#ffffff');
    const [s2x, s2z] = A(-525, 2.2); lettres('GOLDEN TULIP LE DIPLOMATE', 14, 1.1, s2x - g.position.x, 16.8, s2z - g.position.z - .05, Math.PI, '#1f2a5a', '700 90px Georgia, serif');
    K.sphere(.7, K.mat('#c9a13a', { metal: .5, rugosite: .35 }), sx - g.position.x, 19.4, sz - g.position.z - .3);
  });
  bake(g);
}

// ---------- Novotel Orisha (en V) et Ibis, même enceinte ----------
function toitDeuxPans(x0, z0, x1, z1, larg, y, h, mat) { // prisme triangulaire le long d'un segment
  const L = Math.hypot(x1 - x0, z1 - z0), s = new THREE.Shape([new THREE.Vector2(-larg / 2, 0), new THREE.Vector2(larg / 2, 0), new THREE.Vector2(0, h)]);
  const geo = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false }).translate(0, 0, -L / 2);
  const m = K.maillage(geo, mat, (x0 + x1) / 2, y, (z0 + z1) / 2); m.rotation.y = Math.atan2(x1 - x0, z1 - z0); return m;
}
function novotelIbis(N) {
  const c = A(-700, -20), g = groupeLieu('novotel-ibis', c[0], c[1]);
  K.into(g, () => {
    const L = ([x, y]) => { const [wx, wz] = A(x, y); return [wx - g.position.x, wz - g.position.z]; };
    if (N.novotelEnceinte) mursPoly(loc(g, N.novotelEnceinte), 0, 2.4, K.mat('#e6dcc3'), 4, 2.4);
    // Novotel : deux ailes en V, pointe au sud, toits gris à deux pans, liseré bleu.
    const P = L([-705, -112]), mur = K.tex('novotel', 1, 1), tole = K.tex('tole', 6, 1, '#8f969a');
    for (const bout of [[-775, -62], [-640, -60]]) {
      const E = L(bout), ang = Math.atan2(E[1] - P[1], E[0] - P[0]), lg = Math.hypot(E[0] - P[0], E[1] - P[1]);
      const r = [[0, -8], [lg, -8], [lg, 8], [0, 8]].map(([u, v]) => [P[0] + u * Math.cos(ang) - v * Math.sin(ang), P[1] + u * Math.sin(ang) + v * Math.cos(ang)]);
      mursPoly(r, 0, 10.5, mur, 6, 3.5); solPoly([r], K.mat('#7d8488'), 10.5, 4);
      toitDeuxPans(P[0], P[1], E[0], E[1], 17, 10.5, 3.2, tole);
      for (const v of [-8.1, 8.1]) { const m = K.boite(lg, .12, .12, K.mat('#2f7bd6', { emissif: '#1f5fb8' }), P[0] + Math.cos(ang) * lg / 2 - Math.sin(ang) * v, 10.4, P[1] + Math.sin(ang) * lg / 2 + Math.cos(ang) * v); m.rotation.y = -ang; m.castShadow = false; }
    }
    // Pignon central au logo, auvent d'entrée sur pilier en Y, enseigne lumineuse.
    K.boite(10, 6, 10, '#e6dcc3', P[0], 9, P[1] - 4);
    lettres('N', 3, 3, P[0], 11.5, P[1] - 9.1, Math.PI, '#ffffff', '900 600px system-ui, sans-serif');
    K.boite(12, .4, 7, '#f2f0ea', P[0], 4.6, P[1] - 12); K.cyl(.25, .25, 4.4, 8, '#3a3f42', P[0], 2.2, P[1] - 13);
    lettres('NOVOTEL', 9, 1.4, P[0], 5.6, P[1] - 15.6, Math.PI, '#e8f2ff', '800 220px system-ui, sans-serif');
    const [qx, qz] = L([-705, -130]); K.boite(26, .3, 11, K.mat('#3fa7c4', { rugosite: .15 }), qx, .15, qz); K.boite(32, .2, 17, '#e9e5dc', qx, .06, qz);
    for (let i = 0; i < 6; i++) K.palmierRoyal(qx - 18 + i * 7, qz + 12);
    // Ibis : barre de trois niveaux, toit plat débordant au sous-face bordeaux, enseigne rouge.
    if (N.ibis) {
      const r = loc(g, N.ibis), ic = centroide(r);
      mursPoly(r, 0, 10, K.tex('ibis', 1, 1), 6, 3.4);
      K.boite(25, .35, 79, '#efeae4', ic[0], 10.4, ic[1]); K.boite(24.6, .1, 78.6, K.mat('#7a2420'), ic[0], 10.18, ic[1]);
      for (let k = 0; k < 8; k++) for (const dx of [-11.6, 11.6]) K.cyl(.12, .12, 10, 6, '#e8e4dc', ic[0] + dx, 5, ic[1] - 36 + k * 10.3);
      lettres('ibis\nHOTEL', 6, 3, ic[0], 12.6, ic[1] - 37, Math.PI, '#d6232a', '900 260px system-ui, sans-serif');
    }
    // Étang à l'ouest de l'allée, pavillon au toit rouge.
    const [ex, ez] = L([-757, 28]); K.cyl(1, 1, .2, 32, K.mat('#4f8f8a', { rugosite: .2 }), ex, .1, ez).scale.set(30, 1, 55);
    const [vx, vz] = L([-727, 80]); K.boite(5, 2.8, 5, '#efe9dc', vx, 1.4, vz); K.cone(4.6, 2, 4, '#a43b2c', vx, 3.8, vz).rotation.y = Math.PI / 4;
  });
  bake(g);
}

// ---------- Siège de MTN Bénin : verre vert, pan jaune, pylône sur le toit ----------
function mtn(M) {
  const c = centroide(M.mtn), g = groupeLieu('mtn', c[0], c[1]);
  K.into(g, () => {
    if (M.mtnEnceinte) { const r = loc(g, M.mtnEnceinte); mursPoly(r, 0, 1.2, K.mat('#e8e0c8'), 4, 1.2); mursPoly(r, 1.2, 2.5, K.mat('#243728', { transparent: .55 }), 4, 1.3); }
    mursPoly(loc(g, M.mtn), 0, 9, K.tex('mtnSombre', 1, 1), 4, 4.5); solPoly([loc(g, M.mtn)], K.mat('#7f8a84'), 9, 4);
    // Le corps principal (40 × 34 m, 27 m) : verre vert au nord, au sud et à l'est, jaune MTN à l'ouest.
    const W = 40, D = 34, H = 27, v = K.tex('mtnVert', W / 6, H / 4), j = K.tex('mtnJaune', D / 6, H / 4);
    const pan = (w, h, x, y, z, ry, m) => { const p = K.maillage(K.geo(`pl${w},${h}`, () => new THREE.PlaneGeometry(w, h)), m, x, y, z); p.rotation.y = ry; return p; };
    pan(W, H, 0, H / 2, -D / 2, Math.PI, v); pan(W, H, 0, H / 2, D / 2, 0, v); pan(D, H, W / 2, H / 2, 0, Math.PI / 2, v); pan(D * .62, H, -W / 2, H / 2, D * .19, -Math.PI / 2, j);
    pan(D * .38, H, -W / 2, H / 2, -D * .31, -Math.PI / 2, K.tex('mtnSombre', 2, 6));
    K.boite(W, .5, D, '#a9c4a0', 0, H, 0);
    // Pylône de télécommunication rouge et blanc, paraboles.
    for (let k = 0; k < 6; k++) K.cyl(.45 - k * .05, .5 - k * .05, 3, 4, k % 2 ? '#f2f2ee' : '#c8382f', 6, H + 1.5 + k * 3, 4);
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, 1]]) { const p = K.cyl(.7, .7, .25, 14, '#e4e4e0', 6 + dx * 1.1, H + 12 + dz, 4 + dz * 1.1); p.rotation.z = Math.PI / 2; p.rotation.y = Math.atan2(dz, dx); }
    // Totem jaune MTN à l'entrée (angle nord-ouest).
    K.boite(2.4, 7, .6, '#ffcc00', -W / 2 - 6, 3.5, -D / 2 - 9);
    lettres('MTN', 2.2, 1.4, -W / 2 - 6, 5.6, -D / 2 - 9.32, Math.PI, '#111111', '900 300px system-ui, sans-serif');
    K.boite(4, 3, 4, '#e8e0c8', -W / 2 - 10, 1.5, -D / 2 - 6);
  });
  bake(g);
}

// ---------- Nigeria House : bloc blanc, tour d'escalier, portail vert ----------
function nigeria(ring) {
  const c = centroide(ring), g = groupeLieu('nigeria-house', c[0], c[1]);
  K.into(g, () => {
    const r = loc(g, ring); mursPoly(r, 0, 11, K.tex('nigeria', 1, 1), 5, 3.6); solPoly([r], K.mat('#dcd8cf'), 11, 4);
    K.cyl(3, 3, 13, 20, '#f2f2ee', 0, 6.5, 8); K.boite(10, 3, 7, '#c9b48f', 4, 12.5, -1); K.cyl(.06, .06, 8, 5, '#9a9a9a', -12, 15, 0);
    // Mur d'enceinte (60 × 40), portail au sud sous un linteau « NIGERIA HOUSE ».
    const blanc = K.mat('#f0f0ec');
    for (const [w, d, x, z] of [[60, .3, 0, -22], [60, .3, 0, 22], [.3, 44, -30, 0], [.3, 44, 30, 0]]) if (z !== 22) K.boite(w, 2.5, d, blanc, x, 1.25, z);
    K.boite(25, 2.5, .3, blanc, -17.5, 1.25, 22); K.boite(25, 2.5, .3, blanc, 17.5, 1.25, 22);
    K.boite(10, 2.4, .2, '#13473c', 0, 1.2, 22); K.boite(12, 1.4, .8, blanc, 0, 3.5, 22);
    lettres('NIGERIA HOUSE', 9, 1, 0, 3.5, 22.45, 0, '#111111', '800 170px system-ui, sans-serif');
    K.sphere(.6, '#2f7d4a', 0, 4.9, 22.1);
    for (const x of [-6.5, 6.5]) K.lanterneGlobe(x, 23.2);
    K.boite(3, 2.6, 2.6, '#f0f0ec', 9, 1.3, 20); K.boite(3.6, .15, 3.2, '#67a89f', 9, 2.75, 21.3);
  });
  bake(g);
}

// ---------- Le Dôme (ancien Centre international de conférences) ----------
function dome() {
  const [x, z] = toXZ(6.34980, 2.39668), g = groupeLieu('le-dome', x, z);
  K.into(g, () => {
    // Cône à facettes, revêtement gris argent, nervures rayonnantes ; brèche en V tournée vers le boulevard.
    const dessine = !tripoDispo('dome'); if (!dessine) poserTripo('dome', g, { hauteur: 26 });
    const cone = dessine && K.maillage(K.geo('domeCone', () => new THREE.CylinderGeometry(2.5, 24, 22, 14, 1)), K.tex('argentDome', 6, 2, '#ffffff', { metal: .35 }), 0, 11, 0);
    if (cone) cone.rotation.y = .1;
    const cap = 25 * Math.PI / 180, ux = Math.sin(cap), uz = -Math.cos(cap); // direction NNE
    // Nervures en dents de scie sur la moitié est, du pied vers le sommet.
    const pente = (a, r0, y0, r1, y1, ep, m) => { const b = new THREE.Vector3(Math.cos(a) * r0, y0, Math.sin(a) * r0), t = new THREE.Vector3(Math.cos(a) * r1, y1, Math.sin(a) * r1), mid = b.clone().add(t).multiplyScalar(.5); const n = K.boite(ep, ep, b.distanceTo(t), m, mid.x, mid.y, mid.z); n.lookAt(t.clone().add(g.position)); return n; };
    if (dessine) for (let i = 0; i < 12; i++) pente(Math.atan2(uz, ux) + Math.PI * .45 + i * .14, 24.3, .5, 3.2, 21.6, .7, '#80868a');
    const sable = K.mat('#bdb9b0', { rugosite: .8 });
    if (dessine) for (const s of [-1, 1]) { const a = Math.atan2(uz, ux) + s * .32, p = K.boite(.8, 21, 14, sable, Math.cos(a) * 17, 10.5, Math.sin(a) * 17); p.rotation.y = -a; }
    if (dessine) K.boite(16, .5, 7, '#f6f5f1', ux * 25, 4.4, uz * 25).rotation.y = -Math.atan2(uz, ux) + Math.PI / 2;
    for (let i = 0; i < 10; i++) K.drapeauBenin(ux * 42 + (-uz) * (i - 4.5) * 5, uz * 42 + ux * (i - 4.5) * 5, 8);
    // Guirlandes de lumière le long des pentes.
    if (dessine) for (let i = 0; i < 14; i++) pente(i / 14 * Math.PI * 2 + .2, 24.5, .3, 2.9, 22, .14, K.mat('#fff3d6', { emissif: '#a8874a' })).castShadow = false;
  });
  bake(g);
}

// ---------- Le Pavillon : ailettes bronze en vague, verrière bleue courbe ----------
function pavillon() {
  const [x, z] = toXZ(6.35037, 2.39581), g = groupeLieu('le-pavillon', x, z);
  K.into(g, () => {
    const ang = (105 - 90) * Math.PI / 180; // grand axe au cap 105°, parallèle au boulevard
    const r = rectArrondi(0, 0, 48, 32, 7, ang, 6);
    K.boite(48.5, .8, 32.5, '#8c8d89', 0, .4, 0).rotation.y = -ang;
    // Côté ouest et angle nord-ouest en verre bleu, le reste en ailettes.
    const n = r.length, verre = [], ail = [];
    r.forEach((p, i) => { const a = Math.atan2(p[1], p[0]) - ang; (Math.cos(a) < -.35 || (Math.cos(a) < .1 && Math.sin(a) < -.4) ? verre : ail).push(i); });
    const seg = (ids, mat, h) => { for (const i of ids) { const a = r[i], b = r[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); const p = K.maillage(K.geo(`pv${L.toFixed(2)},${h}`, () => new THREE.PlaneGeometry(L, h)), mat, (a[0] + b[0]) / 2, .8 + h / 2, (a[1] + b[1]) / 2); p.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2; } };
    seg(ail, K.tex('ailettes', 3, 1, '#ffffff', { face2: true }), 10.5);
    seg(verre, K.tex('verreBleu', 2, 1, '#ffffff', { face2: true }), 10.5);
    solPoly([r], K.mat('#4a4b47'), 11.3, 4);
    for (const s of [-1, 1]) K.boite(9, 2.4, 5, '#8a4e2c', s * 10, 12.5, 0).rotation.y = -ang;
    const [wx, wz] = [Math.cos(ang + Math.PI) * 24.3, Math.sin(ang + Math.PI) * 24.3];
    lettres('Le Pavillon', 7, 1.6, wx, 7.5, wz, versRot(wx, wz), '#c9a13a', 'italic 700 180px Georgia, serif');
  });
  bake(g);
}

// ---------- Mur du port : 1,5 km de fresques face au boulevard ----------
// Effet Graff 2022 (« The New Bénin ») de 2,4121 à 2,4179 E, « Coexistence » de Kobra sur
// l'ancien Hôtel du Port (2,4179–2,4188 E, 8,8 m de haut, panneau central jusqu'à 14 m),
// puis la Marina Boulev'art Gallery jusqu'à 2,4241 E. Mur de 4,5 m, fresques côté nord.
function murDuPort(pts) {
  const c = centroide(pts), g = groupeLieu('mur-du-port', c[0], c[1]);
  const xa = toXZ(6.35, 2.41206)[0], xk0 = toXZ(6.35, 2.41793)[0], xk1 = toXZ(6.35, 2.41875)[0], xb = toXZ(6.35, 2.42414)[0], zJog = toXZ(6.3498, 2.418)[1];
  K.into(g, () => {
    const beton = K.mat('#cfc8ba', { rugosite: .9 }), chaperon = K.mat('#e8e3d8');
    let n = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < .5) continue;
      const mx = (a[0] + b[0]) / 2, ang = Math.atan2(dz, dx), nx = dz / L, nz = -dx / L; // normale vers le nord (le boulevard)
      const peint = mx > xa && mx < xb && !(mx > xk0 && mx < xk1) && Math.abs(dx) > 2 * Math.abs(dz) && Math.max(a[1], b[1]) < zJog;
      const H = peint ? 4.5 : 3.2;
      K.boite(L + .3, H, .3, beton, mx - c[0], H / 2, (a[1] + b[1]) / 2 - c[1]).rotation.y = -ang;
      K.boite(L + .3, .15, .45, chaperon, mx - c[0], H + .07, (a[1] + b[1]) / 2 - c[1]).rotation.y = -ang;
      if (!peint) continue;
      const nb = Math.max(1, Math.round(L / 18)), lc = L / nb;
      for (let k = 0; k < nb; k++) {
        const t = (k + .5) / nb, px = a[0] + dx * t + nx * .17 - c[0], pz = a[1] + dz * t + nz * .17 - c[1];
        const p = K.maillage(K.geo(`fr${lc.toFixed(1)}`, () => new THREE.PlaneGeometry(lc, 4.4)), fresque(n++, a[0] + dx * t < xk0), px, 2.25, pz); p.rotation.y = Math.atan2(nx, nz); p.castShadow = false;
      }
    }
    // « Coexistence » : mur de 53 m sur 8,8 m, panneau central jusqu'à 14 m.
    const [k0x, k0z] = toXZ(6.350114, 2.417934), [k1x, k1z] = toXZ(6.35018, 2.41875), kd = [k1x - k0x, k1z - k0z], kl = Math.hypot(...kd), ka = Math.atan2(kd[1], kd[0]);
    const knx = kd[1] / kl, knz = -kd[0] / kl, kmx = (k0x + k1x) / 2 - c[0], kmz = (k0z + k1z) / 2 - c[1];
    K.boite(kl, 8.8, .5, beton, kmx, 4.4, kmz).rotation.y = -ka;
    K.boite(10.7, 5.2, .5, beton, kmx, 11.4, kmz).rotation.y = -ka;
    const p = K.maillage(K.geo(`fr${kl.toFixed(1)}k`, () => new THREE.PlaneGeometry(kl, 8.6)), kobra(), kmx + knx * .28, 4.4, kmz + knz * .28); p.rotation.y = Math.atan2(knx, knz); p.castShadow = false;
    const top = K.maillage(K.geo('frKtop', () => new THREE.PlaneGeometry(10.5, 5.2)), K.mat('#2b4c94'), kmx + knx * .28, 11.4, kmz + knz * .28); top.rotation.y = Math.atan2(knx, knz);
    for (const [r, col, y] of [[2.2, '#2f8fb0', 11.6], [1.1, '#2f8a4a', 11.6]]) { const d = K.maillage(K.geo(`disq${r}`, () => new THREE.CircleGeometry(r, 24)), K.mat(col), kmx + knx * (.3 + r * .01), y, kmz + knz * (.3 + r * .01)); d.rotation.y = Math.atan2(knx, knz); }
  });
  bake(g);
}

// ---------- Siège d'AGL (ex-Bolloré), face au port : deux blocs de verre bleu cadrés de blanc ----------
function agl(ring) {
  const o = obb(ring); let ang = o.L >= o.W ? o.ang : o.ang + Math.PI / 2; while (ang > Math.PI / 2) ang -= Math.PI; while (ang <= -Math.PI / 2) ang += Math.PI;
  const g = groupeLieu('agl', o.cx, o.cz, ang); // x local : est, z local : sud (façade principale, vers le port)
  K.into(g, () => {
    const Lg = Math.max(o.L, o.W), Wd = Math.min(o.L, o.W), H = 29, blanc = K.mat('#e9ecef', { rugosite: .6 }), verre = K.tex('verreBleu', 4, 7);
    const blocs = [[-Lg / 2, -Lg / 2 + Lg * .56], [-Lg / 2 + Lg * .64, Lg / 2]];
    for (const [x0, x1] of blocs) {
      const w = x1 - x0, cx = (x0 + x1) / 2;
      K.boite(w - 1.2, H - 2, Wd - 1.2, verre, cx, (H - 2) / 2 + 1, 0);
      // cadre blanc épais, débord en haut
      K.boite(w + .6, 1.6, Wd + 1.2, blanc, cx, H - .8, 0);
      for (const sx of [-1, 1]) K.boite(1, H, Wd + .4, blanc, cx + sx * (w / 2 - .2), H / 2, 0);
      K.boite(w, 1.2, Wd + .2, blanc, cx, .6, 0);
    }
    K.boite(Lg * .1, H - 4, Wd - 5, K.tex('verreBleu', 1, 6), (blocs[0][1] + blocs[1][0]) / 2, (H - 4) / 2, -1.5);
    // Auvent en vague devant l'entrée.
    const vague = K.geo('aglVague', () => { const p = new THREE.PlaneGeometry(16, 5, 24, 1); p.rotateX(-Math.PI / 2); const a = p.attributes.position; for (let i = 0; i < a.count; i++) a.setY(i, Math.sin(a.getX(i) / 16 * Math.PI * 2) * .5); p.computeVertexNormals(); return p; });
    K.maillage(vague, K.mat('#f6f6f4', { face2: true }), (blocs[0][1] + blocs[1][0]) / 2, 4.2, Wd / 2 + 2.6);
    for (const dx of [-6, 0, 6]) K.cyl(.15, .15, 4.2, 8, '#d9dcdf', (blocs[0][1] + blocs[1][0]) / 2 + dx, 2.1, Wd / 2 + 4.6);
    // Logo AGL sur le cadre blanc du bloc ouest, face au boulevard.
    const lx = (blocs[0][0] + blocs[0][1]) / 2;
    lettres('AGL', 7, 1.5, lx, H - .8, Wd / 2 + .62, 0, '#192f4b', '900 300px "Arial Black", system-ui, sans-serif');
    lettres('AFRICA GLOBAL LOGISTICS', 9, .6, lx + 10, H - .8, Wd / 2 + .62, 0, '#192f4b', '700 110px system-ui, sans-serif');
    // Parking devant, clôture noire et haies.
    const couleurs = ['#e8e8e4', '#1f2326', '#9da3a6', '#3c4a4f', '#ffffff'];
    for (let k = 0; k < 12; k++) K.boite(1.8, 1.4, 4.3, couleurs[k % 5], -Lg / 2 + 3 + k * 3.4, .7, Wd / 2 + 12);
    K.boite(Lg + 10, 1.6, .08, K.mat('#1f2326', { transparent: .7 }), 0, .8, Wd / 2 + 22); K.haie(0, Wd / 2 + 21, Lg + 10, 1.2, .9);
  });
  bake(g);
}

/** Construit les lieux du boulevard de la Marina (données L.marinaLieux). */
export function construireLieuxMarina(L) {
  const M = L.marinaLieux; if (!M) return;
  if (M.jardin?.ring) jardin(M.jardin);
  if (M.cite?.zone) citeMinisterielle(M.cite);
  ambassadeUSA(M.usa);
  goldenTulip();
  novotelIbis(M);
  if (M.mtn) mtn(M);
  if (M.nigeria) nigeria(M.nigeria);
  dome(); pavillon();
  if (M.murPort) murDuPort(M.murPort);
  if (M.agl) agl(M.agl);
}
