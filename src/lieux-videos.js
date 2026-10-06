import * as THREE from 'three';
import { LITE, hash, toXZ } from './base.js';
import { scene } from './scene.js';
import { K, bake, centroide, detailsProches, groupeLieu, local, mursPoly, obb, panneauTexte, solPoly, voiture } from './lieux.js';
import { construireLieuxMarina } from './lieux-marina.js';

// Lieux relevés sur les vidéos de drone de Cotonou (octobre 2026) : Sofitel Marina,
// tour BCEAO, Erevan et la statue de Bio Guéra, rond-point de l'aéroport, mosquée de
// Zongo, pelouses en triangles de l'Amazone, cimetière au bord de la lagune.

// ---------- Matières ----------
K.motif('balcons', (c, t) => { // un étage : dalle blanche, bandeau vitré, garde-corps
  c.fillStyle = '#f3f1ec'; c.fillRect(0, 0, t, t);
  c.fillStyle = '#5d7480'; c.fillRect(0, t * .3, t, t * .48);
  c.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 6; i++) c.fillRect(i * t / 6 + 2, t * .32, t / 14, t * .44);
  c.fillStyle = '#e6e3dc'; c.fillRect(0, t * .78, t, t * .05);
  c.fillStyle = '#d9d6cf'; for (let i = 0; i <= 6; i++) c.fillRect(i * t / 6 - 2, t * .3, 4, t * .48);
});
K.motif('terrasse', (c, t) => { // jardinières des terrasses du Sofitel
  c.fillStyle = '#e4e1d9'; c.fillRect(0, 0, t, t);
  for (let i = 0; i < 40; i++) { c.fillStyle = ['#4f7f3c', '#5f8f44', '#3f6f36'][i % 3]; const x = (i * 53) % t, y = (i * 97) % t; c.beginPath(); c.arc(x, y, 10 + (i % 5) * 3, 0, Math.PI * 2); c.fill(); }
});
K.motif('tourBceao', (c, t) => { // béton beige, colonnes de fenêtres étroites, un étage par tuile
  c.fillStyle = '#ddd0b4'; c.fillRect(0, 0, t, t);
  c.fillStyle = '#3b4a52'; for (let i = 0; i < 8; i++) c.fillRect(i * t / 8 + t / 32, t * .2, t / 16, t * .62);
  c.fillStyle = '#cbbd9f'; c.fillRect(0, t * .9, t, t * .1);
});
K.motif('erevan', (c, t) => { // centre commercial Erevan (Super U) : enduit orange brûlé, vitrines au rez-de-chaussée
  c.fillStyle = '#ba5b31'; c.fillRect(0, 0, t, t);
  c.fillStyle = '#a6421a'; c.fillRect(0, t * .92, t, t * .08);
  c.fillStyle = '#3e4a50'; c.fillRect(t * .08, t * .62, t * .84, t * .3);
  c.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 8; i++) c.fillRect(i * t / 8, 0, 2, t * .6);
});
K.motif('mosquee', (c, t) => { // enduit blanc, baies en arc vert bouteille
  c.fillStyle = '#f2f0ea'; c.fillRect(0, 0, t, t);
  for (const x of [.15, .55]) { c.fillStyle = '#2f5d4a'; c.beginPath(); c.moveTo(t * x, t * .82); c.lineTo(t * x, t * .45); c.arc(t * (x + .15), t * .45, t * .15, Math.PI, 0); c.lineTo(t * (x + .3), t * .82); c.closePath(); c.fill(); }
  c.fillStyle = '#d8d4ca'; c.fillRect(0, t * .9, t, t * .1); c.fillRect(0, 0, t, t * .06);
});
K.motif('triangles', (c, t) => { // pelouses triangulaires séparées d'allées blanches (vue zénithale)
  const W = t, H = c.canvas.height;
  const vert = ['#5f8f45', '#4f7f3a', '#6a9a4c', '#567f3f'];
  for (let r = 0; r < 2; r++) for (let k = -1; k < 3; k++) {
    const y0 = r * H / 2, y1 = y0 + H / 2, x0 = k * W + (r % 2 ? W / 2 : 0);
    c.fillStyle = vert[(k + r * 2 + 4) % 4]; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + W, y0); c.lineTo(x0 + W / 2, y1); c.closePath(); c.fill();
    c.fillStyle = vert[(k + r * 2 + 5) % 4]; c.beginPath(); c.moveTo(x0 + W / 2, y1); c.lineTo(x0 + W * 1.5, y1); c.lineTo(x0 + W, y0); c.closePath(); c.fill();
  }
  c.strokeStyle = '#f2efe6'; c.lineWidth = t * .03;
  for (const y of [0, H / 2, H]) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(k * W, 0); c.lineTo(k * W + W, H); c.stroke(); c.beginPath(); c.moveTo(k * W, 0); c.lineTo(k * W - W, H); c.stroke(); }
}, 256, Math.round(256 * Math.sqrt(3)));
K.motif('fleurRouge', (c, t) => { // rond-point de l'aéroport : grande fleur rouge et verte
  c.fillStyle = '#5c8f3e'; c.fillRect(0, 0, t, t);
  const m = t / 2;
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; c.save(); c.translate(m, m); c.rotate(a); c.fillStyle = i % 2 ? '#b8232a' : '#d23a2c'; c.beginPath(); c.ellipse(t * .2, 0, t * .2, t * .075, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
  c.fillStyle = '#7a1b20'; c.beginPath(); c.arc(m, m, t * .07, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#3f6f30'; c.lineWidth = t * .04; c.beginPath(); c.arc(m, m, t * .45, 0, Math.PI * 2); c.stroke();
});

// Décalage d'un polygone vers l'intérieur (biseau limité), pour les étages en retrait.
function retrait(ring, d) {
  let A = 0; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; A += a[0] * b[1] - b[0] * a[1]; }
  const s = A > 0 ? 1 : -1, n = ring.length;
  return ring.map((p, i) => {
    const a = ring[(i - 1 + n) % n], b = ring[(i + 1) % n];
    const d1 = [p[0] - a[0], p[1] - a[1]], d2 = [b[0] - p[0], b[1] - p[1]], l1 = Math.hypot(...d1) || 1, l2 = Math.hypot(...d2) || 1;
    const n1 = [-d1[1] / l1 * s, d1[0] / l1 * s], n2 = [-d2[1] / l2 * s, d2[0] / l2 * s];
    let m = [n1[0] + n2[0], n1[1] + n2[1]]; const ml = Math.hypot(...m) || 1; m = [m[0] / ml, m[1] / ml];
    const k = Math.min(2.2, 1 / Math.max(.3, m[0] * n2[0] + m[1] * n2[1]));
    return [p[0] + m[0] * d * k, p[1] + m[1] * d * k];
  });
}

// ---------- Sofitel Cotonou Marina ----------
// Barre courbe en gradins, terrasses plantées à chaque niveau ; devant, une allée
// couverte d'auvents blancs aux formes de galets qui serpente dans les jardins.
function sofitel(ring0) {
  // L'emprise OSM est décalée : on la recentre sur l'image satellite (6.3495 N, 2.3936 E).
  const c0 = centroide(ring0), [mx, mz] = toXZ(6.3495, 2.3936), ring = Math.hypot(mx - c0[0], mz - c0[1]) > 8 ? ring0.map(([x, z]) => [x + mx - c0[0], z + mz - c0[1]]) : ring0;
  const c = centroide(ring), g = groupeLieu('sofitel', c[0], c[1]);
  K.into(g, () => {
    let r = ring.map(([x, z]) => [x - c[0], z - c[1]]);
    const verre = K.tex('balcons', 1, 1), terrasse = K.tex('terrasse', 1, 1);
    for (let n = 0; n < 7; n++) {
      mursPoly(r, n * 3.6, (n + 1) * 3.6, verre, 7, 3.6);
      solPoly([r], terrasse, (n + 1) * 3.6 + .02, 6);
      r = retrait(r, 1.25);
    }
    // Allée couverte de « nuages » blancs, de l'entrée de l'hôtel jusqu'au Dôme (≈ 360 m vers l'est).
    const blanc = K.mat('#f4f2ec', { rugosite: .6 }), [e0x, e0z] = toXZ(6.34994, 2.39344), [e1x, e1z] = toXZ(6.34980, 2.39640);
    const nb = Math.floor(Math.hypot(e1x - e0x, e1z - e0z) / 14);
    for (let i = 0; i < nb; i++) {
      const t = i / (nb - 1), x = e0x + (e1x - e0x) * t - c[0], z = e0z + (e1z - e0z) * t - c[1] + Math.sin(i * .8) * 6, f = new THREE.Shape();
      const R = 6.5 + (i % 3), pts = 14;
      for (let k = 0; k <= pts; k++) { const a = k / pts * Math.PI * 2, rr = R * (1 + .18 * Math.sin(a * 2 + i) + .08 * Math.cos(a * 3)); const px = Math.cos(a) * rr * 1.25, pz = Math.sin(a) * rr * .8; k ? f.lineTo(px, pz) : f.moveTo(px, pz); }
      const geo = new THREE.ExtrudeGeometry(f, { depth: .4, bevelEnabled: true, bevelSize: .2, bevelThickness: .15, bevelSegments: 2 }); geo.rotateX(Math.PI / 2);
      const m = K.maillage(geo, blanc, x, 4.6, z); m.rotation.y = i * .5;
      for (const [dx, dz] of [[-3, 0], [3, 0], [0, 2.5]]) K.cyl(.12, .12, 4.4, 8, '#e8e6e0', x + dx, 2.2, z + dz);
    }
    // Enseigne en haut de la façade nord, et l'entrée sur le boulevard : auvent blanc, bassin.
    const zn = Math.min(...ring.map(p => p[1] - c[1]));
    panneauTexte(['SOFITEL'], 22, 3, 0, 23.4, zn + 6 * 1.25 - .35, Math.PI, { fond: '#e3d8c3', encre: '#1d1a16', px: 1024, py: 140, police: '400 104px Georgia, "Times New Roman", serif' });
    const [gx, gz] = toXZ(6.35105, 2.39373);
    K.boite(18, .5, 9, '#f6f5f1', gx - c[0], 5, gz - c[1]); for (const dx of [-7, 7]) K.boite(.8, 5, .8, '#f6f5f1', gx - c[0] + dx, 2.5, gz - c[1]);
    for (const dx of [-3.2, 3.2]) K.boite(5.8, 2.4, .15, K.mat('#c9bba0', { metal: .4, rugosite: .4 }), gx - c[0] + dx, 1.2, gz - c[1]);
    K.boite(7, .25, Math.abs(gz - c[1] - zn) - 12, K.mat('#5fa9c0', { rugosite: .15 }), gx - c[0], .12, (gz - c[1] + zn) / 2);
    // Piscine côté mer.
    const zs = Math.max(...ring.map(p => p[1] - c[1]));
    K.boite(34, .25, 12, K.mat('#3fa7c4', { rugosite: .15 }), 10, .12, zs + 14).castShadow = false;
    K.boite(38, .2, 16, '#e9e5dc', 10, .06, zs + 14).castShadow = false;
    for (let i = 0; i < 6; i++) K.palmierRoyal(-30 + i * 14, zs + 26);
  });
  bake(g);
}

// ---------- Tour BCEAO : 64 m, R+16, le plus haut immeuble du Bénin (1994) ----------
// D'après les photos (Commons 2019–2024, Skyscraper Center, Flickr 2012–2013) et le musée de
// la monnaie de la BCEAO : sur chaque façade, quatre lignes verticales de treize cauris dorés
// dans des bandes sombres, et une rangée de cinq cauris au dernier étage ; pilastres de
// marbre clair, travée centrale en verre bronze ; socle de deux niveaux aux bas-reliefs dorés.
// Façade dessinée pour une largeur w (m) et 64 m de haut : pilastre, bande, pilastre, bande, travée.
const F_BCEAO = [.10, .06, .085, .06]; // fractions de largeur, de chaque bord vers le centre
function faceBceao(w) {
  const cle = 'bceaoFace' + w.toFixed(1);
  K.motif(cle, (c, t) => {
    const H = c.canvas.height, px = t / w, etage = H / 17;
    c.fillStyle = '#e4dfd5'; c.fillRect(0, 0, t, H);
    for (let i = 0; i < 260; i++) { c.strokeStyle = 'rgba(160,150,135,.18)'; c.lineWidth = 1; c.beginPath(); const x = Math.random() * t, y = Math.random() * H; c.moveTo(x, y); c.lineTo(x + 18, y + 9); c.stroke(); }
    const a1 = F_BCEAO[0] * w, b1 = a1 + F_BCEAO[1] * w, a2 = b1 + F_BCEAO[2] * w, b2 = a2 + F_BCEAO[3] * w;
    for (const [u0, u1] of [[a1, b1], [a2, b2], [w - b1, w - a1], [w - b2, w - a2]]) { c.fillStyle = '#282018'; c.fillRect(u0 * px, etage * 1.2, (u1 - u0) * px, H - etage * 2.2); c.strokeStyle = 'rgba(120,95,60,.6)'; c.lineWidth = 2; for (let y = etage * 1.2; y < H - etage; y += 10) { c.beginPath(); c.moveTo(u0 * px, y); c.lineTo(u1 * px, y + 10); c.stroke(); } }
    // Travée centrale : verre bronze, cinq colonnes, ailettes grises, lignes d'étage.
    const g0 = b2 * px, g1 = (w - b2) * px, g = c.createLinearGradient(g0, 0, g1, H); g.addColorStop(0, '#6a5038'); g.addColorStop(.5, '#584535'); g.addColorStop(1, '#3e3024'); c.fillStyle = g; c.fillRect(g0, etage * .9, g1 - g0, H - etage * 2.3);
    c.fillStyle = '#c8c4bc'; for (let k = 0; k <= 5; k++) c.fillRect(g0 + k * (g1 - g0) / 5 - 2, etage * .9, 4, H - etage * 2.3);
    c.fillStyle = 'rgba(30,22,15,.6)'; for (let k = 1; k < 17; k++) c.fillRect(g0, k * etage, g1 - g0, 2);
    c.fillStyle = '#e4dfd5'; c.fillRect(g0, 0, g1 - g0, etage * .9); // allège pleine au sommet
    c.fillStyle = '#5a4630'; for (let k = 0; k < 10; k++) c.fillRect(g0 + k * (g1 - g0) / 10 + 2, 2, (g1 - g0) / 10 - 4, etage * .25); // acrotère de panneaux bronze
    c.fillStyle = '#d6d0c4'; c.fillRect(0, H - etage * 1.4, t, 3);
  }, 512, 1536);
  return K.tex(cle, 1, 1);
}
K.motif('bceaoSocle', (c, t) => { // socle : marbre blanc, pilastres, fenêtres bronze à grilles, bas-reliefs dorés
  c.fillStyle = '#e8e4dc'; c.fillRect(0, 0, t, t);
  c.fillStyle = '#3a2e22'; c.fillRect(t * .1, t * .2, t * .3, t * .55); c.fillRect(t * .6, t * .2, t * .3, t * .55);
  c.strokeStyle = '#cfc9bd'; c.lineWidth = 3; for (const x0 of [.1, .6]) for (let k = 1; k < 6; k++) { c.beginPath(); c.moveTo(t * (x0 + k * .05), t * .2); c.lineTo(t * (x0 + k * .05), t * .75); c.stroke(); }
  c.fillStyle = '#c9a24a'; c.beginPath(); c.ellipse(t * .5, t * .45, t * .05, t * .09, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(t * .46, t * .36); c.lineTo(t * .43, t * .26); c.lineTo(t * .48, t * .34); c.fill(); c.beginPath(); c.moveTo(t * .54, t * .36); c.lineTo(t * .57, t * .26); c.lineTo(t * .52, t * .34); c.fill();
  c.fillStyle = '#d8d2c6'; c.fillRect(0, t * .9, t, t * .1);
});
function tourBceao(podium, tourRing) {
  const [tx, tz] = tourRing ? centroide(tourRing) : toXZ(6.353497, 2.4267);
  const g = groupeLieu('bceao', tx, tz);
  K.into(g, () => {
    if (podium) mursPoly(podium.map(([x, z]) => [x - tx, z - tz]), 0, 9, K.tex('bceaoSocle', 1, 1), 7, 9, undefined, K.mat('#d8d2c4'));
    // Tour : plan presque carré (25,4 m est-ouest × 23,2 m nord-sud), angles abattus, 64 m.
    const a = 12.7, b = 11.6, ch = 1.3, H = 64, marbre = K.mat('#e4dfd5', { rugosite: .5 });
    const faces = [[0, b, 2 * (a - ch), 0], [0, -b, 2 * (a - ch), Math.PI], [a, 0, 2 * (b - ch), Math.PI / 2], [-a, 0, 2 * (b - ch), -Math.PI / 2]]; // x, z, largeur, orientation (normale)
    const or = K.mat('#c8a65a', { metal: .65, rugosite: .32 }), fente = K.mat('#3a2a18');
    const cauri = K.geo('cauri', () => new THREE.SphereGeometry(1, 14, 10)), fenteG = K.geo('cauriFente', () => new THREE.BoxGeometry(.14, 1.25, .1));
    for (const [fx, fz, w, rot] of faces) {
      const p = K.maillage(K.geo(`pl${w.toFixed(1)},${H}`, () => new THREE.PlaneGeometry(w, H)), faceBceao(w), fx, H / 2, fz); p.rotation.y = rot;
      // Cauris : 4 lignes de 13 (un par étage) et 5 au dernier étage, en relief.
      const ux = Math.cos(rot), uz = -Math.sin(rot), nx = Math.sin(rot), nz = Math.cos(rot), etage = H / 17;
      const pose = (u, y) => { const x = fx + ux * u + nx * .35, z = fz + uz * u + nz * .35; const m = K.maillage(cauri, or, x, y, z); m.scale.set(.55, .9, .32); m.rotation.y = rot; const s = K.maillage(fenteG, fente, x + nx * .3, y, z + nz * .3); s.rotation.y = rot; };
      const a1 = F_BCEAO[0] * w, b1 = a1 + F_BCEAO[1] * w, a2 = b1 + F_BCEAO[2] * w, b2 = a2 + F_BCEAO[3] * w;
      for (const c of [(a1 + b1) / 2, (a2 + b2) / 2]) for (const s of [-1, 1]) for (let k = 0; k < 13; k++) pose(s * (w / 2 - c), (k + 2.6) * etage);
      for (let k = 0; k < 5; k++) pose(-w / 2 + b2 + (k + .5) * (w - 2 * b2) / 5, 15.55 * etage);
    }
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const p = K.maillage(K.geo(`pl${(ch * Math.SQRT2).toFixed(2)},${H}`, () => new THREE.PlaneGeometry(ch * Math.SQRT2, H)), marbre, sx * (a - ch / 2), H / 2, sz * (b - ch / 2)); p.rotation.y = Math.atan2(sx, sz); }
    const plan = [[a - ch, b], [-(a - ch), b], [-a, b - ch], [-a, -(b - ch)], [-(a - ch), -b], [a - ch, -b], [a, -(b - ch)], [a, b - ch]];
    solPoly([plan], K.mat('#cdc7ba'), H, 4); mursPoly(plan, H, H + 1, marbre, 4, 1);
    K.boite(6, 3, 5, '#d8d2c4', -4, H + 1.5, 2); K.cyl(.12, .12, 10, 6, '#c9ccd0', 5, H + 5, -3);
    // L'écriteau (position à confirmer sur photo) : lettres dorées au-dessus de l'entrée du socle,
    // et le monolithe de marbre à la grille d'entrée sur l'avenue Jean-Paul II.
    const [ex, ez] = toXZ(6.35328, 2.42685);
    panneauTexte(["BANQUE CENTRALE DES ÉTATS DE L'AFRIQUE DE L'OUEST"], 26, 1.4, ex - tx, 7.6, ez - tz + .4, 0, { fond: '#e8e4dc', encre: '#a8842e', px: 2048, py: 110, police: '700 64px Georgia, "Times New Roman", serif' });
    K.boite(30, .4, 5, '#efebe3', ex - tx, 4.6, ez - tz + 2.6); for (const dx of [-13, 13]) K.boite(.8, 4.6, .8, '#efebe3', ex - tx + dx, 2.3, ez - tz + 4.6);
    const [gx, gz] = toXZ(6.35283, 2.42677);
    K.boite(7, 3, .8, '#efebe3', gx - tx - 12, 1.5, gz - tz);
    panneauTexte(['BCEAO', "Banque Centrale des États de l'Afrique de l'Ouest", 'Agence principale de Cotonou'], 6.6, 2.6, gx - tx - 12, 1.6, gz - tz + .42, 0, { fond: '#efebe3', encre: '#1f3d5a', px: 1024, py: 404, police: '800 70px system-ui, sans-serif' });
    K.boite(4, 3.2, 4, '#f0eee8', gx - tx + 8, 1.6, gz - tz); // poste de garde
    // Fontaine : bassin en D de 22 m, vasque à trois étages, sept bassins ronds lilas.
    const [fx, fz] = toXZ(6.35303, 2.42676), lx = fx - tx, lz = fz - tz, eau = K.mat('#5fa9c0', { rugosite: .12 });
    // Pelouse en D (côté plat au sud) bordée d'une allée claire, comme sur la vue Google.
    K.cyl(12, 12, .3, 48, '#e8e4dc', lx, .15, lz); K.boite(24, .3, 8, '#e8e4dc', lx, .15, lz + 4);
    K.cyl(11.2, 11.2, .32, 48, K.tex('gazon', 4, 4), lx, .17, lz); K.boite(22.4, .32, 7.4, K.tex('gazon', 4, 2), lx, .17, lz + 4);
    for (const [r, y] of [[3.6, .55], [2.4, 1.15], [1.2, 1.75]]) { K.cyl(r, r * .85, .35, 28, '#d9d6d2', lx, y, lz); K.cyl(r * .88, r * .88, .1, 28, eau, lx, y + .2, lz); }
    for (let k = 0; k < 7; k++) { const an = -Math.PI / 2 + k * Math.PI * 2 / 7, bx = lx + Math.cos(an) * 7.3, bz = lz + Math.sin(an) * 7.3; K.cyl(2.25, 2.25, .45, 24, '#e8e4dc', bx, .3, bz); K.cyl(2, 2, .1, 24, K.mat('#c9a3c4', { rugosite: .2 }), bx, .55, bz); }
    // Sculpture dorée devant l'entrée : masques superposés sur un socle sombre.
    K.boite(1.6, 1.4, 1.6, '#2b2a28', ex - tx + 9, .7, ez - tz + 7);
    for (let k = 0; k < 3; k++) K.sphere(.5, or, ex - tx + 9, 1.8 + k * .85, ez - tz + 7).scale.set(.85, .9, .6);
  });
  bake(g);
}

// ---------- Erevan et la statue de Bio Guéra ----------
function erevan(ring, versRondPoint) {
  const c = centroide(ring), g = groupeLieu('erevan', c[0], c[1]);
  K.into(g, () => {
    const loc = ring.map(([x, z]) => [x - c[0], z - c[1]]);
    mursPoly(loc, 0, 9, K.tex('erevan', 1, 1), 9, 9, undefined, K.mat('#e9e6df', { rugosite: .7 }));
    const d = [versRondPoint[0] - c[0], versRondPoint[1] - c[1]], l = Math.hypot(...d) || 1, ux = d[0] / l, uz = d[1] / l;
    // Façade la plus proche du rond-point : enseigne sur le bandeau rouge.
    let best = null, bd = -1e9;
    for (let i = 0; i < loc.length; i++) { const a = loc[i], b = loc[(i + 1) % loc.length], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, s = mx * ux + mz * uz, L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > 25 && s > bd) { bd = s; best = [mx, mz, Math.atan2(b[1] - a[1], b[0] - a[0])]; } }
    if (best) {
      // Façade : « Centre Commercial EREVAN » à gauche, « SUPER » et le logo U à droite (vus du rond-point).
      const [mx, mz, a] = best, nx = ux * .4, nz = uz * .4, ex = Math.cos(a), ez = Math.sin(a), sens = (Math.sin(-a) * ux + Math.cos(-a) * uz) < 0 ? Math.PI : 0;
      const pose = (p, d) => { p.position.x += ex * d; p.position.z += ez * d; p.rotation.y = -a + sens; p.material.side = THREE.FrontSide; return p; };
      const g2 = sens ? -1 : 1; // à gauche ou à droite selon le sens de la façade
      pose(panneauTexte(['Centre Commercial EREVAN'], 30, 2.6, mx + nx, 7.2, mz + nz, -a, { fond: '#ba5b31', encre: '#1c699d', px: 1536, py: 132, police: '800 96px system-ui, sans-serif' }), -g2 * 24);
      pose(panneauTexte(['SUPER'], 16, 3.4, mx + nx, 7, mz + nz, -a, { fond: '#ba5b31', encre: '#1c699d', px: 1024, py: 218, police: '900 190px system-ui, sans-serif' }), g2 * 20);
      const logo = pose(panneauTexte(['U'], 4, 4, mx + nx * 1.2, 7.2, mz + nz * 1.2, -a, { fond: '#ffffff', encre: '#d61f26', px: 256, py: 256, police: '900 200px system-ui, sans-serif' }), g2 * 32);
      logo.scale.set(1, 1, 1);
      pose(panneauTexte(['Cotonou'], 6, 1.1, mx + nx, 4.6, mz + nz, -a, { fond: '#ba5b31', encre: '#1c699d', px: 512, py: 94, police: 'italic 700 70px system-ui, sans-serif' }), g2 * 32);
      // Poteaux décoratifs inclinés, jaune-vert, le long de la façade.
      for (let k = -8; k <= 8; k++) { const p = K.cyl(.12, .12, 6, 6, '#b5c43a', mx + nx * 3 + ex * k * 7, 3, mz + nz * 3 + ez * k * 7); p.rotation.z = .25; }
      // Totem noir surmonté d'un tambour blanc « EREVAN ».
      const tx = mx + ux * 40, tz = mz + uz * 40; K.cyl(.35, .35, 12, 10, '#1f2326', tx, 6, tz); K.cyl(2.2, 2.2, 2.4, 24, '#f4f4f2', tx, 13, tz);
      for (let k = 0; k < 4; k++) { const ang = k * Math.PI / 2; panneauTexte(['EREVAN'], 3.6, 1, tx + Math.sin(ang) * 2.25, 13, tz + Math.cos(ang) * 2.25, ang, { fond: '#f4f4f2', encre: '#1d1a16', px: 512, py: 142, police: '900 100px system-ui, sans-serif' }); }
    }
    // Parking devant le magasin.
    const couleurs = ['#e8e8e4', '#1f2326', '#9da3a6', '#3c4a4f', '#c9c9c4', '#7b2a2a'];
    for (let k = 0; k < 26; k++) { const t = (k % 13 - 6) * 3.2, row = Math.floor(k / 13); voiture(ux * (bd + 12 + row * 7) - uz * t, uz * (bd + 12 + row * 7) + ux * t, couleurs[k % 6], Math.atan2(ux, uz)); }
  });
  bake(g);
}
function bioGuera(cx, cz, rIle) {
  const g = groupeLieu('bio-guera', cx, cz);
  K.into(g, () => {
    K.cyl(rIle, rIle, .35, 64, '#4c4d4f', 0, .17, 0).castShadow = false;
    K.cyl(rIle + .5, rIle + .5, .45, 64, '#e8e5dc', 0, .2, 0, undefined, true);
    K.cyl(rIle * .45, rIle * .45, .5, 48, K.tex('gazon', 6, 6), 0, .25, 0).castShadow = false;
    // Socle de pierre noire, plaque, puis le cavalier de bronze sur son cheval cabré.
    K.boite(8, 4.6, 4.8, '#26282a', 0, 2.3, 0); K.boite(8.6, .4, 5.4, '#3a3c3e', 0, 4.8, 0);
    K.boite(3.4, 1, .08, '#b98a3d', 0, 2.4, 2.43);
    const st = new THREE.Group(); st.position.set(0, 5, 0); st.rotation.y = .6; st.scale.setScalar(3.6); K.racine.add(st);
    const bronze = K.mat('#3f3a33', { rugosite: .55, metal: .35 });
    const caps = (r, l, x, y, z, rx = 0, rz = 0) => { const m = K.maillage(K.geo(`cap${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 10)), bronze, x, y, z, st); m.rotation.set(rx, 0, rz); return m; };
    caps(.32, .95, 0, 1.25, 0, 0, Math.PI / 2 - .35);            // corps, avant relevé
    caps(.16, .55, .62, 1.75, 0, 0, -.55);                        // encolure
    caps(.12, .32, .88, 2.02, 0, 0, Math.PI / 2 + .3);            // tête
    for (const z of [.14, -.14]) { caps(.07, .5, .55, 1.3, z, 0, .9); caps(.065, .45, .78, 1.08, z, 0, -.4); } // antérieurs levés
    for (const z of [.15, -.15]) caps(.08, .75, -.42, .5, z, 0, .25);  // postérieurs
    caps(.06, .5, -.75, .95, 0, 0, -.8);                          // queue
    caps(.13, .38, .02, 1.85, 0, 0, -.15);                        // buste du cavalier
    K.sphere(.11, bronze, .08, 2.25, 0, st);
    for (const z of [.17, -.17]) caps(.055, .4, .12, 1.45, z, 0, 1.2);  // jambes
    const bras = caps(.045, .42, .25, 2.2, -.16, 0, -1); bras.rotation.x = .4;
    K.boite(.04, .75, .02, bronze, .55, 2.55, -.25, st).rotation.z = -.5; // sabre levé
  });
  bake(g);
}

// ---------- Rond-point de l'aéroport : fleur rouge sur gazon ----------
function rondPointAeroport(cx, cz, r) {
  const g = groupeLieu('rond-point-aeroport', cx, cz);
  K.into(g, () => {
    K.cyl(r + .4, r + .4, .45, 64, '#e8e5dc', 0, .2, 0, undefined, true);
    const disque = new THREE.Mesh(new THREE.CircleGeometry(r, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(K.toile('fleurRouge')), roughness: .95 }));
    disque.material.map.colorSpace = THREE.SRGBColorSpace; disque.position.y = .42; disque.receiveShadow = true; K.racine.add(disque);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + .2; K.palmierRoyal(Math.cos(a) * (r - 2), Math.sin(a) * (r - 2)); }
  });
  bake(g);
}

// ---------- Mosquée de Zongo : salle blanche à baies en arc, deux minarets ----------
function mosqueeZongo(ring) {
  const c = centroide(ring), g = groupeLieu('zongo', c[0], c[1]);
  K.into(g, () => {
    const loc = ring.map(([x, z]) => [x - c[0], z - c[1]]);
    mursPoly(loc, 0, 10, K.tex('mosquee', 1, 1), 5, 10, undefined, K.mat('#ecebe6'));
    let best = null, bl = 0;
    for (let i = 0; i < loc.length; i++) { const a = loc[i], b = loc[(i + 1) % loc.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > bl) { bl = L; best = [a, b]; } }
    const [a, b] = best, ux = (b[0] - a[0]) / bl, uz = (b[1] - a[1]) / bl;
    for (const f of [.3, .7]) {
      const x = a[0] + ux * bl * f, z = a[1] + uz * bl * f, blanc = K.mat('#f4f2ec'), vert = K.mat('#3f7a5a', { rugosite: .4 });
      K.cyl(1.7, 1.9, 30, 8, blanc, x, 15, z);
      for (const y of [16, 26]) { K.cyl(2.5, 2.3, .6, 8, blanc, x, y, z); K.cyl(2.4, 2.4, 1.1, 8, K.mat('#d8d4ca'), x, y + .9, z, undefined, true); }
      K.cyl(1.3, 1.5, 4, 8, blanc, x, 32, z); K.cyl(1.45, 1.45, .8, 8, vert, x, 34.4, z);
      K.cone(1.4, 4.2, 8, vert, x, 36.9, z); K.cyl(.05, .05, 1.4, 6, '#c8a468', x, 39.5, z);
    }
    K.sphere(5, K.mat('#3f7a5a', { rugosite: .4 }), 0, 10, 0).scale.set(1, .7, 1);
  });
  bake(g);
}

// ---------- Cimetière : tombes blanches serrées ----------
function tombes(arr) {
  const n = arr.length / 3; if (!n) return;
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, .55, 2.2).translate(0, .28, 0), new THREE.MeshLambertMaterial(), n);
  const blancs = ['#f2f0ea', '#e8e6e0', '#dcdad3', '#f6f5f1', '#cfd3d6'].map(h => new THREE.Color(h));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    q.setFromAxisAngle(Y, arr[3 * i + 2] / 1000 + (hash(i, 120) - .5) * .1);
    m4.compose(p.set(arr[3 * i] / 10, 0, arr[3 * i + 1] / 10), q, s.set(1, .7 + hash(i, 121) * .9, 1));
    m.setMatrixAt(i, m4); m.setColorAt(i, blancs[Math.floor(hash(i, 122) * blancs.length)]);
  }
  m.castShadow = !LITE; m.receiveShadow = true; m.userData.proche = 3500; detailsProches.push(m); scene.add(m);
}

export function construireLieuxVideos(data) {
  construireLieuxMarina(data.L);
  const D = data.L.detailles || {};
  if (D.sofitel) sofitel(D.sofitel);
  tourBceao(D.bceao, data.L.marinaLieux?.bceaoTour);
  const [bx, bz] = toXZ(6.35015, 2.38752);
  if (D.erevan) erevan(D.erevan, [bx, bz]);
  bioGuera(bx, bz, 19);
  const [ax, az] = toXZ(6.35231, 2.38605);
  rondPointAeroport(ax, az, 17);
  if (D.zongo) mosqueeZongo(D.zongo);
  tombes(data.tombes || []);
}
