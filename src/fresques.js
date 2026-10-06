import * as THREE from 'three';

// ---------- Fresques du mur du port (boulevard de la Marina) ----------
// Évocations dessinées des grandes fresques relevées sur les photos (2022–2026) : la
// section « The New Bénin » du festival Effet Graff 2022 (bandeau gris à dents de scie,
// soubassement noir), « Coexistence » d'Eduardo Kobra (2023), et la « Marina Boulev'art
// Gallery » (2024–2026), panneaux cernés de blanc. Ce sont des interprétations, pas des
// copies des œuvres.

const W = 1024, H = 256; // un panneau ≈ 18 m × 4,5 m
const cache = new Map();
function toile(cle, f, w = W, h = H) {
  if (cache.has(cle)) return cache.get(cle);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
  let s = cle.split('').reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7); const r = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  f(c, w, h, r);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: .9 }); cache.set(cle, m); return m;
}
const disque = (c, x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
const ellipse = (c, x, y, rx, ry, col, a = 0) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); c.fill(); };
const poly = (c, pts, col) => { c.fillStyle = col; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); };
function cauri(c, x, y, s, col = '#f2e2b0') { ellipse(c, x, y, s * .6, s, col); c.strokeStyle = '#5a4020'; c.lineWidth = s * .12; c.beginPath(); c.moveTo(x, y - s * .7); c.lineTo(x, y + s * .7); c.stroke(); }
function visage(c, x, y, s, peau, profil = 0) { // tête stylisée, de face ou de profil
  ellipse(c, x, y, s * .72, s, peau);
  c.fillStyle = '#1d1410'; ellipse(c, x - s * .28 + profil * s * .2, y - s * .1, s * .1, s * .06, '#1d1410'); if (!profil) ellipse(c, x + s * .28, y - s * .1, s * .1, s * .06, '#1d1410');
  c.fillStyle = '#7a2a22'; ellipse(c, x + profil * s * .2, y + s * .45, s * .2, s * .07, '#7a2a22');
}
// Effet Graff 2022 : soubassement noir, bandeau gris à dents de scie et pointillés.
function cadreEffetGraff(c, w, h) {
  c.fillStyle = '#141414'; c.fillRect(0, h * .78, w, h * .22);
  c.fillStyle = '#635f5f'; c.fillRect(0, 0, w, h * .12);
  c.fillStyle = '#141414'; for (let x = 0; x < w; x += 24) poly(c, [[x, h * .12], [x + 12, 0], [x + 24, h * .12]], '#141414');
  c.fillStyle = '#f2f0ea'; for (let x = 6; x < w; x += 24) disque(c, x + 6, h * .085, 2.5, '#f2f0ea');
}
// Galerie 2024–2026 : chaque panneau cerné de blanc.
function cadreGalerie(c, w, h) { c.strokeStyle = '#f6f4ef'; c.lineWidth = 12; c.strokeRect(6, 6, w - 12, h - 12); }

const PANNEAUX = {
  // --- Effet Graff 2022 ---
  poing(c, w, h, r) { // femme au poing levé, collier de cauris ; bande turquoise aux cauris jaunes ; signé CHIMÈRE
    c.fillStyle = '#e9b23a'; c.fillRect(0, 0, w, h);
    poly(c, [[w * .45, h], [w * .62, 0], [w * .78, 0], [w * .61, h]], '#1fa5a0');
    for (let i = 0; i < 9; i++) cauri(c, w * .47 + i * w * .017, h * .95 - i * h * .11, 9, '#f6d64a');
    ellipse(c, w * .22, h * .78, w * .09, h * .3, '#7a2f3a'); visage(c, w * .22, h * .42, 34, '#5a3524');
    poly(c, [[w * .3, h * .62], [w * .34, h * .62], [w * .36, h * .2], [w * .32, h * .2]], '#5a3524'); disque(c, w * .34, h * .17, 16, '#5a3524');
    for (let i = 0; i < 7; i++) cauri(c, w * .17 + i * 13, h * .62 + Math.sin(i / 6 * Math.PI) * 10, 5);
    visage(c, w * .86, h * .45, 30, '#7b4a32'); ellipse(c, w * .86, h * .2, 34, 16, '#c8382f');
    c.fillStyle = '#1d1a16'; c.font = 'italic 900 22px system-ui'; c.fillText('CHIMÈRE', w * .66, h * .74);
    cadreEffetGraff(c, w, h);
  },
  port(c, w, h, r) { // enfants à la casquette de capitaine, porte-conteneurs « BENIN », grues
    c.fillStyle = '#f2c21b'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2f6fb0'; c.fillRect(w * .35, h * .55, w * .6, h * .23);
    poly(c, [[w * .4, h * .55], [w * .9, h * .55], [w * .86, h * .72], [w * .44, h * .72]], '#c8382f');
    for (let i = 0; i < 10; i++) c.fillStyle = ['#2f8a4a', '#e2672a', '#2f6fb0', '#f4efe6'][i % 4], c.fillRect(w * .46 + i * 26, h * .43, 24, h * .12);
    c.fillStyle = '#ffffff'; c.font = '900 26px system-ui'; c.fillText('BENIN', w * .6, h * .68);
    for (const x of [.82, .93]) { c.fillStyle = '#1d1a16'; c.fillRect(w * x, h * .15, 6, h * .4); c.fillRect(w * x - 40, h * .15, 70, 6); }
    visage(c, w * .12, h * .5, 32, '#6b412b'); poly(c, [[w * .07, h * .26], [w * .17, h * .26], [w * .16, h * .2], [w * .08, h * .2]], '#ffffff'); c.fillStyle = '#1d1a16'; c.fillRect(w * .07, h * .26, w * .1, 5);
    visage(c, w * .25, h * .55, 26, '#7b4a32'); ellipse(c, w * .25, h * .34, 34, 9, '#d9b56a');
    cadreEffetGraff(c, w, h);
  },
  cosmos(c, w, h, r) { // femme afrofuturiste sur fond cosmique, triple visage, créature cornue bleue
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#2a1a5e'); g.addColorStop(.5, '#5b2a86'); g.addColorStop(1, '#1d3d7a'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) disque(c, r() * w, r() * h, r() * 2 + .5, '#ffffff');
    for (const [x, y, rr, col] of [[.15, .35, 30, '#e2672a'], [.75, .25, 18, '#f2c21b'], [.9, .6, 26, '#9fd0e8']]) disque(c, w * x, h * y, rr, col);
    for (let k = -1; k <= 1; k++) visage(c, w * .45 + k * 46, h * .45, 30, ['#7b4a32', '#5a3524', '#8e5a3a'][k + 1], k);
    ellipse(c, w * .45, h * .2, 70, 22, '#1fa5a0');
    ellipse(c, w * .7, h * .55, 30, 40, '#2f6fb0'); poly(c, [[w * .68, h * .3], [w * .66, h * .12], [w * .7, h * .28]], '#cfe3f1'); poly(c, [[w * .72, h * .28], [w * .76, h * .12], [w * .74, h * .3]], '#cfe3f1');
    cadreEffetGraff(c, w, h);
  },
  // --- Galerie 2024–2026 ---
  savane(c, w, h, r) { // lion, éléphants, baobabs, rollier, enfant souriant, sur rinceaux orange, noir et or
    c.fillStyle = '#e2672a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#1d1a16'; c.lineWidth = 5; for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(r() * w, r() * h, 20 + r() * 30, 0, Math.PI * 1.4); c.stroke(); }
    c.strokeStyle = '#d9b56a'; c.lineWidth = 3; for (let i = 0; i < 10; i++) { c.beginPath(); c.arc(r() * w, r() * h, 12 + r() * 20, 0, Math.PI); c.stroke(); }
    ellipse(c, w * .2, h * .55, 55, 40, '#c8902f'); disque(c, w * .2, h * .45, 34, '#7a4a20'); disque(c, w * .2, h * .47, 22, '#d9a24c');
    for (const x of [.45, .58]) { ellipse(c, w * x, h * .55, 45, 35, '#7c7f86'); poly(c, [[w * x - 40, h * .55], [w * x - 55, h * .85], [w * x - 45, h * .85]], '#7c7f86'); }
    c.fillStyle = '#5a3a22'; c.fillRect(w * .8, h * .3, 22, h * .5); ellipse(c, w * .81, h * .25, 60, 22, '#3f6b3c');
    visage(c, w * .92, h * .55, 26, '#6b412b'); ellipse(c, w * .7, h * .2, 18, 10, '#2f9fd6');
    cadreGalerie(c, w, h);
  },
  livres(c, w, h, r) { // une bibliothèque
    c.fillStyle = '#3b2a20'; c.fillRect(0, 0, w, h);
    for (let rang = 0; rang < 3; rang++) { const y0 = 20 + rang * 76; c.fillStyle = '#8a5a32'; c.fillRect(0, y0 + 64, w, 8); for (let x = 10; x < w - 20;) { const bw = 12 + r() * 16, bh = 40 + r() * 22; c.fillStyle = ['#c8382f', '#2f6fb0', '#2f8a4a', '#f2c21b', '#e2672a', '#f4efe6', '#7a2f5a'][Math.floor(r() * 7)]; c.fillRect(x, y0 + 64 - bh, bw, bh); x += bw + 2; } }
    cadreGalerie(c, w, h);
  },
  echassiers(c, w, h, r) { // huit danseurs sur échasses, rouges et verts
    c.fillStyle = '#f4efe6'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { const x = 70 + i * 120, col = i % 2 ? '#c8382f' : '#2f8a4a'; c.fillStyle = '#5a3a22'; c.fillRect(x - 12, h * .55, 5, h * .38); c.fillRect(x + 8, h * .55, 5, h * .38); poly(c, [[x - 30, h * .6], [x + 30, h * .6], [x + 14, h * .2], [x - 14, h * .2]], col); disque(c, x, h * .15, 13, '#5a3524'); poly(c, [[x - 30, h * .3], [x - 60, h * .12], [x - 52, h * .1]], col); }
    cadreGalerie(c, w, h);
  },
  mer(c, w, h, r) { // l'océan, les pirogues
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9fd0e8'); g.addColorStop(.45, '#f6d9a8'); g.addColorStop(.46, '#2f8fb0'); g.addColorStop(1, '#14506a'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    disque(c, w * .8, h * .3, 34, '#f2a93a');
    c.strokeStyle = '#ffffff'; c.lineWidth = 3; for (let i = 0; i < 20; i++) { const y = h * .55 + r() * h * .4, x = r() * w; c.beginPath(); c.arc(x, y, 18, Math.PI, Math.PI * 2); c.stroke(); }
    for (let i = 0; i < 4; i++) { const x = 100 + i * 230, y = h * .62 + (i % 2) * 30; poly(c, [[x - 70, y], [x + 70, y], [x + 50, y + 18], [x - 50, y + 18]], ['#c8382f', '#f2c21b', '#2f8a4a', '#2f6fb0'][i]); c.fillStyle = '#1d1a16'; c.fillRect(x - 3, y - 50, 4, 50); }
    cadreGalerie(c, w, h);
  },
  peuls(c, w, h, r) { // bergers peuls et zébus, gris et pêche
    c.fillStyle = '#e9a87a'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { const x = 140 + i * 200; ellipse(c, x, h * .55, 60, 32, '#7d7f84'); ellipse(c, x - 20, h * .38, 18, 16, '#6a6c70'); disque(c, x - 64, h * .5, 16, '#6a6c70'); poly(c, [[x - 70, h * .4], [x - 90, h * .28], [x - 66, h * .36]], '#e6e2d9'); for (const d of [-40, 40]) c.fillStyle = '#6a6c70', c.fillRect(x + d, h * .62, 7, h * .2); }
    for (const x of [.08, .55]) { poly(c, [[w * x - 16, h * .85], [w * x + 16, h * .85], [w * x + 8, h * .35], [w * x - 8, h * .35]], '#4d5357'); disque(c, w * x, h * .28, 13, '#5a3524'); poly(c, [[w * x - 30, h * .24], [w * x + 30, h * .24], [w * x, h * .08]], '#d9b56a'); }
    cadreGalerie(c, w, h);
  },
  mains(c, w, h, r) { // des mains tenant une calebasse, un hochet, des coupes
    c.fillStyle = '#6b5a32'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { const x = 120 + i * 240; ellipse(c, x, h * .55, 50, 26, '#7b4a32', -.3); ellipse(c, x + 10, h * .38, 34, 30, ['#d9a24c', '#a65a2c', '#c8902f', '#8a5a32'][i]); c.strokeStyle = '#3b2a1a'; c.lineWidth = 3; c.beginPath(); c.arc(x + 10, h * .38, 22, 0, Math.PI); c.stroke(); }
    cadreGalerie(c, w, h);
  },
  manga(c, w, h, r) { // grand visage manga, magenta et turquoise
    c.fillStyle = '#1fa5a0'; c.fillRect(0, 0, w, h);
    poly(c, [[0, 0], [w * .4, 0], [w * .25, h]], '#d9548a');
    ellipse(c, w * .55, h * .5, 120, 110, '#8e5a3a'); for (const dx of [-45, 45]) { ellipse(c, w * .55 + dx, h * .45, 28, 34, '#ffffff'); disque(c, w * .55 + dx, h * .47, 16, '#1d1a16'); disque(c, w * .55 + dx + 5, h * .42, 5, '#ffffff'); }
    ellipse(c, w * .55, h * .75, 30, 10, '#c8382f'); poly(c, [[w * .42, h * .1], [w * .7, h * .05], [w * .66, h * .3], [w * .44, h * .28]], '#1d1a16');
    cadreGalerie(c, w, h);
  },
  perles(c, w, h, r) { // prêtresse vodun parmi de grosses perles de verre
    c.fillStyle = '#f6f4ef'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) disque(c, r() * w, r() * h, 10 + r() * 22, ['#2f6fb0', '#c8382f', '#f2c21b', '#1fa5a0', '#7a2f5a'][Math.floor(r() * 5)]);
    poly(c, [[w * .45, h], [w * .55, h], [w * .54, h * .45], [w * .46, h * .45]], '#f4efe6'); visage(c, w * .5, h * .32, 30, '#5a3524'); ellipse(c, w * .5, h * .12, 38, 16, '#f4efe6');
    for (let i = 0; i < 9; i++) disque(c, w * .465 + i * 9, h * .52 + Math.sin(i / 8 * Math.PI) * 12, 5, '#c8382f');
    cadreGalerie(c, w, h);
  },
  procession(c, w, h, r) { // procession en rouge
    c.fillStyle = '#9d1f1f'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) { const x = 40 + i * 82, s = .8 + r() * .3; poly(c, [[x - 20 * s, h * .9], [x + 20 * s, h * .9], [x + 12 * s, h * .4], [x - 12 * s, h * .4]], ['#f4efe6', '#e2672a', '#3b1a1a'][i % 3]); disque(c, x, h * .32, 12 * s, '#3b1a1a'); }
    cadreGalerie(c, w, h);
  },
};
const ORDRE_EFFET = ['poing', 'port', 'cosmos'];
const ORDRE_GALERIE = ['savane', 'livres', 'echassiers', 'mer', 'peuls', 'mains', 'manga', 'perles', 'procession'];
/** Matière du panneau n° i : la section Effet Graff à l'ouest, la galerie à l'est. */
export function fresque(i, effet) { const nom = effet ? ORDRE_EFFET[i % ORDRE_EFFET.length] : ORDRE_GALERIE[i % ORDRE_GALERIE.length]; return toile(nom, PANNEAUX[nom]); }

// « Coexistence » (Kobra, 2023) : fond bleu étoilé, symboles blancs, douze figures de dos,
// bras sur les épaules, en facettes multicolores ; au centre, la Terre et la carte du Bénin.
export function kobra() {
  return toile('kobra', (c, w, h, r) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2b4c94'); g.addColorStop(1, '#3f578b'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#ffffff'; c.lineWidth = 3;
    for (let i = 0; i < 16; i++) { const x = 40 + i * 62, y = 40 + (i % 3) * 18; c.beginPath(); if (i % 4 === 0) { c.moveTo(x, y - 12); c.lineTo(x + 11, y + 8); c.lineTo(x - 11, y + 8); c.closePath(); c.moveTo(x, y + 14); c.lineTo(x + 11, y - 6); c.lineTo(x - 11, y - 6); c.closePath(); } else if (i % 4 === 1) { c.arc(x, y, 12, .6, Math.PI * 2 - .6); } else if (i % 4 === 2) { c.arc(x, y, 12, 0, Math.PI * 2); c.moveTo(x, y - 12); c.lineTo(x, y + 12); } else { c.moveTo(x - 12, y); c.lineTo(x + 12, y); c.moveTo(x, y - 12); c.lineTo(x, y + 12); } c.stroke(); }
    const cols = ['#f2c21b', '#c8382f', '#2f8a4a', '#e2672a', '#1fa5a0', '#7a2f5a', '#f4efe6'];
    for (let i = 0; i < 12; i++) {
      const x = 50 + i * 82 + (i > 5 ? 60 : 0), y0 = h * .38;
      if (Math.abs(x - w / 2) < 70) continue;
      for (let k = 0; k < 10; k++) { const a = r(), b = r(); poly(c, [[x - 30 + a * 60, y0 + b * 100], [x - 30 + r() * 60, y0 + r() * 110], [x - 30 + r() * 60, y0 + r() * 110]], cols[Math.floor(r() * cols.length)]); }
      disque(c, x, y0 - 14, 18, cols[(i + 2) % cols.length]);
      c.strokeStyle = cols[i % cols.length]; c.lineWidth = 9; c.beginPath(); c.moveTo(x - 30, y0 + 10); c.lineTo(x + 52, y0 + 4); c.stroke();
    }
    disque(c, w / 2, h * .48, 62, '#2f8fb0'); poly(c, [[w / 2 - 14, h * .3], [w / 2 + 14, h * .3], [w / 2 + 12, h * .66], [w / 2 - 8, h * .66]], '#2f8a4a');
    c.fillStyle = '#f2c21b'; c.fillRect(w / 2 - 4, h * .36, 16, h * .14); c.fillStyle = '#c8382f'; c.fillRect(w / 2 - 4, h * .5, 16, h * .14);
    disque(c, w / 2, h * .16, 18, '#5a3524'); c.fillStyle = '#5a3524'; c.fillRect(w / 2 - 6, h * .2, 12, h * .12);
    c.fillStyle = '#ffffff'; c.font = '700 14px system-ui'; c.fillText('KOBRA', w - 80, h - 16);
  }, 1024, 256);
}
