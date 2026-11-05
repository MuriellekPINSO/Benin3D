// Les textures photographiques de la ville (public/textures/ia/), tirées d'images générées avec Higgsfield
// (Seedream, 31/10, demande de Murielle : « pourquoi nos villes ne sont pas si réalistes ? »). Les originaux, en
// 4096 px, sont dans sources/textures-ia/ (non versionnés). À lancer depuis la racine : npm run textures
//
// 1. Enduit des murs, sol de sable, tôle, tuiles, dalle : rendus raccordables (on les répète sur des kilomètres)
//    et ramenés à un « détail » autour du gris moyen : le jeu garde ses couleurs (la peinture de chaque maison, la
//    tôle grise ou rouillée) et la photo n'apporte que le grain, les coulures, la rouille, les cailloux.
// 2. Atlas des façades : fenêtres, balcons, portails et boutiques photographiés sur un mur magenta, détourés,
//    puis rangés à leur taille réelle dans les cases de facades.js (3,3 m de large sur 3,15 m de haut, un niveau).
//    L'ombre portée sur le magenta (sous les appuis, sous le climatiseur) devient une ombre sur la peinture.
import fs from 'fs';
import sharp from 'sharp';

const SRC = 'sources/textures-ia', OUT = 'public/textures/ia';
fs.mkdirSync(OUT, { recursive: true });
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const lisse = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };

async function lire(fichier, w, h) {
  const { data, info } = await sharp(`${SRC}/${fichier}`).resize(w, h, { fit: h ? 'fill' : 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { d: new Float32Array(data), w: info.width, h: info.height };
}

// ---------- 1. Textures qui se répètent ----------

/** Période d'un motif régulier (ondes de la tôle, rangs de tuiles), en pixels, le long de x ou de y. */
function periode({ d, w, h }, axe) {
  const n = axe === 'x' ? w : h, m = new Float64Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 3; m[axe === 'x' ? x : y] += lum(d[o], d[o + 1], d[o + 2]); }
  let moy = 0; for (const v of m) moy += v / n; for (let i = 0; i < n; i++) m[i] -= moy;
  const ac = l => { let s = 0; for (let i = 0; i + l < n; i++) s += m[i] * m[i + l]; return s / (n - l); };
  const a0 = ac(0); let l = 1;
  while (l < n / 4 && ac(l) > 0) l++;                            // premier passage sous zéro
  let best = l, bv = -Infinity;
  for (let k = l; k < Math.min(n / 3, l * 4); k++) { const v = ac(k); if (v > bv) { bv = v; best = k; } }
  return { p: best, force: bv / a0 };
}
/** Garde un nombre entier de périodes, pour que le motif se referme sur lui-même. */
function recadrer(img, px, py) {
  const cw = px ? Math.floor(img.w / px) * px : img.w, ch = py ? Math.floor(img.h / py) * py : img.h;
  const d = new Float32Array(cw * ch * 3);
  for (let y = 0; y < ch; y++) d.set(img.d.subarray(y * img.w * 3, (y * img.w + cw) * 3), y * cw * 3);
  return { d, w: cw, h: ch };
}
/** Raccord en deux passes (x puis y) : au bord, l'image décalée d'une demi-largeur, dont le milieu est continu ;
 *  au milieu, l'image d'origine, qui cache la couture de la copie décalée. `rx`, `ry` : décalages, en multiples
 *  de la période quand le motif est régulier (sinon les ondes de la copie tomberaient entre celles de l'image). */
function raccord({ d, w, h }, rx, ry) {
  const passe = (src, axe, dec) => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = axe === 'x' ? x / w : y / h, k = lisse(0, 0.22, Math.min(t, 1 - t));
      const x2 = axe === 'x' ? (x + dec) % w : x, y2 = axe === 'y' ? (y + dec) % h : y;
      const o = (y * w + x) * 3, o2 = (y2 * w + x2) * 3;
      for (let c = 0; c < 3; c++) out[o + c] = src[o + c] * k + src[o2 + c] * (1 - k);
    }
    return out;
  };
  return { d: passe(passe(d, 'x', rx), 'y', ry), w, h };
}
/** Le détail autour du gris moyen : 128 = la couleur du jeu telle quelle (le shader multiplie par 2 × texel).
 *  `teinte` : part de la couleur de la photo qu'on garde (0 = gris seul, 1 = toute la couleur). */
function detail({ d, w, h }, teinte) {
  const moy = [0, 0, 0], n = w * h;
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) moy[c] += d[i * 3 + c] / n;
  const out = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const r = d[i * 3] / moy[0], g = d[i * 3 + 1] / moy[1], b = d[i * 3 + 2] / moy[2], l = lum(r, g, b);
    for (const [c, v] of [[0, r], [1, g], [2, b]]) out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(128 * (l + (v - l) * teinte))));
  }
  return out;
}
async function repetee(nom, { motifX = false, motifY = false, teinte = 0.5, haut = 0, bas = 0 }) {
  let img = await lire(`${nom}.jpg`, 2048, 2048);
  if (haut || bas) { // bandes à écarter (la terre au pied du mur, la crasse sous la toiture)
    const y0 = Math.round(img.h * haut), y1 = Math.round(img.h * (1 - bas));
    img = { d: img.d.slice(y0 * img.w * 3, y1 * img.w * 3), w: img.w, h: y1 - y0 };
  }
  const px = motifX ? periode(img, 'x') : null, py = motifY ? periode(img, 'y') : null;
  img = recadrer(img, px?.p, py?.p);
  const nx = px ? img.w / px.p : 0, ny = py ? img.h / py.p : 0;
  img = raccord(img, px ? Math.round(nx / 2) * px.p : img.w >> 1, py ? Math.round(ny / 2) * py.p : img.h >> 1);
  const buf = detail(img, teinte);
  for (const [cote, suffixe] of [[1024, ''], [512, '-leger']]) {
    await sharp(buf, { raw: { width: img.w, height: img.h, channels: 3 } }).resize(cote, cote, { fit: 'fill' }).jpeg({ quality: 84, mozjpeg: true }).toFile(`${OUT}/${nom}${suffixe}.jpg`);
  }
  console.log(nom, img.w + '×' + img.h, px ? `${nx} ondes` : '', py ? `${ny} rangs` : '');
}

// ---------- 2. Atlas des façades ----------

/** Une planche sur fond magenta : couleur détourée, alpha, et les éléments trouvés (de gauche à droite, de haut en bas).
 *  `sol` : la planche du rez-de-chaussée, dont le bas (trottoir, terre) est coupé au pied des portes.
 *  `coupes` : abscisses (fractions de la largeur) où séparer deux éléments qu'un détail relie (le tuyau du climatiseur). */
async function planche(fichier, largeur, sol = false, coupes = []) {
  let { d, w, h } = await lire(fichier, largeur);
  const N = w * h, mur = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = d[i * 3] / 255, g = d[i * 3 + 1] / 255, b = d[i * 3 + 2] / 255, mn = Math.min(r, b);
    mur[i] = mn - g > 0.1 && g < 0.65 * mn && mn > 0.12 ? 1 : 0;
  }
  if (sol) { // en remontant depuis le bas, la première ligne où le magenta revient (entre les portes) = le pied du mur
    let y = h - 1;
    for (; y > 0; y--) { let m = 0; for (let x = 0; x < w; x++) m += mur[y * w + x]; if (m > 0.2 * w) break; }
    h = y + 1;
  }
  // Luminosité locale du mur (par blocs de 48 px), pour lire l'ombre comme un assombrissement de la peinture.
  const B = 48, bw = Math.ceil(w / B), bh = Math.ceil(h / B), somme = new Float64Array(bw * bh), nb = new Float64Array(bw * bh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!mur[i]) continue; const k = Math.floor(y / B) * bw + Math.floor(x / B); somme[k] += lum(d[i * 3], d[i * 3 + 1], d[i * 3 + 2]); nb[k]++; }
  const ref = new Float64Array(bw * bh).fill(NaN);
  for (let k = 0; k < ref.length; k++) if (nb[k] > B * B * 0.3) ref[k] = somme[k] / nb[k];
  for (let tour = 0; tour < 60 && ref.some(Number.isNaN); tour++) { // blocs pleins d'éléments : la moyenne des voisins
    const r2 = ref.slice();
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      if (!Number.isNaN(ref[by * bw + bx])) continue; let s = 0, n = 0;
      for (const [u, v] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = bx + u, Y = by + v; if (X >= 0 && Y >= 0 && X < bw && Y < bh && !Number.isNaN(ref[Y * bw + X])) { s += ref[Y * bw + X]; n++; } }
      if (n) r2[by * bw + bx] = s / n;
    }
    ref.set(r2);
  }
  // Les blocs les plus sombres du mur sont eux-mêmes dans l'ombre : la référence est le mur éclairé autour.
  const refAt = (x, y) => { const fx = Math.min(bw - 1.001, Math.max(0, x / B - .5)), fy = Math.min(bh - 1.001, Math.max(0, y / B - .5)), X = Math.floor(fx), Y = Math.floor(fy), u = fx - X, v = fy - Y;
    let m = 0; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const a = Math.min(bw - 1, Math.max(0, X + i)), c = Math.min(bh - 1, Math.max(0, Y + j)); m = Math.max(m, ref[c * bw + a]); }
    const l = (ref[Y * bw + X] * (1 - u) + ref[Y * bw + X + 1] * u) * (1 - v) + (ref[(Y + 1) * bw + X] * (1 - u) + ref[(Y + 1) * bw + X + 1] * u) * v;
    return Math.max(l, m * 0.97); };
  // Élément = pas du magenta ; on rogne d'un pixel le liseré, et on retire la teinte magenta qui y reste.
  const plein = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let ok = 1; for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1; i++) if (mur[(y + j) * w + x + i]) { ok = 0; break; }
    plein[y * w + x] = ok;
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4; let r = d[i * 3], g = d[i * 3 + 1], b = d[i * 3 + 2];
    if (mur[i]) { // ombre sur le mur : noir, d'autant plus opaque que le mur est sombre
      const s = lum(r, g, b) / refAt(x, y), a = Math.min(0.82, Math.max(0, (0.93 - s) * 1.15));
      rgba[o + 3] = Math.round(a * 255);
      continue;
    }
    const sp = Math.max(0, Math.min(r, b) - g); r -= sp * 0.9; b -= sp * 0.9;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = plein[i] ? 255 : 150;
  }
  // Les éléments : bandes horizontales, puis colonnes dans chaque bande.
  const segments = (frac, n, seuil, trou, min, coupe = () => false) => {
    const s = []; let a = -1, fin = -1;
    for (let i = 0; i <= n; i++) {
      if (coupe(i) && a >= 0) { s.push([a, fin]); a = -1; continue; }
      const on = i < n && frac(i) > seuil;
      if (on) { if (a < 0) a = i; else if (i - fin > trou) { s.push([a, fin]); a = i; } fin = i; }
    }
    if (a >= 0) s.push([a, fin]);
    return s.filter(([u, v]) => v - u >= min);
  };
  const elems = [];
  const lignes = segments(y => { let m = 0; for (let x = 0; x < w; x++) m += plein[y * w + x]; return m / w; }, h, 0.004, h * 0.012, h * 0.04);
  for (const [y0, y1] of lignes) {
    const coupe = x => coupes.some(c => x === Math.round(c * w));
    const cols = segments(x => { let m = 0; for (let y = y0; y <= y1; y++) m += plein[y * w + x]; return m / (y1 - y0 + 1); }, w, 0.02, w * 0.006, w * 0.02, coupe);
    for (const [x0, x1] of cols) {
      let t = y1, bb = y0; // la hauteur exacte de cet élément dans sa bande
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (plein[y * w + x]) { t = Math.min(t, y); bb = Math.max(bb, y); }
      if (bb - t >= 0.3 * (y1 - y0)) elems.push({ x0, x1, y0: t, y1: bb }); // pas les miettes (le bout du trottoir)
    }
  }
  console.log(fichier, w + '×' + h, elems.length, 'éléments', elems.map(e => `${e.x0}-${e.x1}×${e.y0}-${e.y1}`).join(' '));
  return { rgba, w, h, elems };
}

const C = 512, CASE = { l: 3.3, h: 3.15 }, PXM = { x: C / CASE.l, y: C / CASE.h }; // pixels par mètre dans une case
const HAUTEURS = { // hauteur réelle de chaque élément trouvé (m), dans l'ordre de la planche
  fenetres1: [1.45, 1.45, 1.45, 1.45, 1.75, 1.75], // persiennes, vitre verte, barreaux noirs, naco à grille, cintrée brune, cintrée à grille
  fenetres2: [2.55, 1.6, 1.55, 2.5, 1.3, 2.5],     // balcon à balustres, persiennes bleu-vert + climatiseur, fenêtre en retrait, balcon inox, naco à barreaux, persiennes + balustrade
  rdc1: [2.35, 2.6, 2.4, 2.45],                    // portail bleu, rideau métallique, porte en bois, porte de garage crème
  rdc2: [2.45, 2.45, 2.3, 2.2],                    // boutique ouverte, vitrine, portail vert, porte en tôle rouge
};
// Les cases : [colonne, ligne, [planche, numéro, centre (m depuis la gauche), bas (m)]…]. Mêmes rôles que les
// dessins de facades.js : la case 2 du rez-de-chaussée est la boutique à enseigne, les cases 0 et 6 les portes
// d'entrepôt ; ligne 1 = étages sobres, ligne 2 = étages à balcons et à arcs ; deux fenêtres par case quand elles sont petites.
const CASES = [
  [0, 0, [['rdc1', 1, 1.65, 0]]], [1, 0, [['rdc1', 0, 1.65, 0]]], [2, 0, [['rdc1', 1, 1.65, 0]]], [3, 0, [['rdc1', 2, 1.0, 0], ['fenetres1', 2, 2.4, 0.9]]],
  [4, 0, [['rdc2', 0, 1.65, 0]]], [5, 0, [['rdc2', 2, 1.65, 0]]], [6, 0, [['rdc1', 3, 1.65, 0]]], [7, 0, [['rdc2', 1, 1.65, 0]]],
  [0, 1, [['fenetres1', 0, 1.65, 0.85]]], [1, 1, [['fenetres1', 0, 0.9, 0.85], ['fenetres1', 0, 2.4, 0.85]]], [2, 1, [['fenetres1', 1, 1.65, 0.85]]], [3, 1, [['fenetres1', 2, 1.65, 0.85]]],
  [4, 1, [['fenetres1', 3, 1.65, 0.85]]], [5, 1, [['fenetres2', 1, 1.65, 0.8]]], [6, 1, [['fenetres2', 2, 1.65, 0.85]]], [7, 1, [['fenetres2', 4, 0.9, 1.0], ['fenetres2', 4, 2.4, 1.0]]],
  [0, 2, [['fenetres1', 4, 1.65, 0.85]]], [1, 2, [['fenetres1', 5, 1.65, 0.85]]], [2, 2, [['fenetres2', 0, 1.65, 0]]], [3, 2, [['fenetres2', 3, 1.65, 0]]],
  [4, 2, [['fenetres2', 5, 1.65, 0]]], [5, 2, [['fenetres1', 1, 0.9, 0.85], ['fenetres1', 1, 2.4, 0.85]]], [6, 2, [['fenetres1', 2, 0.9, 0.85], ['fenetres1', 2, 2.4, 0.85]]], [7, 2, [['fenetres1', 4, 0.9, 0.85], ['fenetres1', 4, 2.4, 0.85]]],
];

async function atlas() {
  const P = {
    fenetres1: await planche('fenetres1.jpg', 2560), fenetres2: await planche('fenetres2.jpg', 2560, false, [0.693]),
    rdc1: await planche('rdc1.jpg', 3072, true), rdc2: await planche('rdc2.jpg', 3072, true),
  };
  for (const [nom, p] of Object.entries(P)) if (p.elems.length !== HAUTEURS[nom].length) throw new Error(`${nom} : ${p.elems.length} éléments trouvés, ${HAUTEURS[nom].length} attendus`);
  const W = 8 * C, H = 3 * C, A = new Float32Array(W * H * 4); // lignes 0 à 2 ; la ligne 3 (étage inachevé) reste dessinée par facades.js
  const poser = (buf, bw, bh, left, top) => { // « par-dessus », alpha non prémultiplié
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const X = left + x, Y = top + y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const s = (y * bw + x) * 4, o = (Y * W + X) * 4, a = buf[s + 3] / 255; if (!a) continue;
      const ad = A[o + 3], ao = a + ad * (1 - a);
      for (let c = 0; c < 3; c++) A[o + c] = (buf[s + c] * a + A[o + c] * ad * (1 - a)) / ao;
      A[o + 3] = ao;
    }
  };
  for (const [col, ligne, poses] of CASES) for (const [nom, n, centre, bas] of poses) {
    const p = P[nom], e = p.elems[n], ew = e.x1 - e.x0 + 1, eh = e.y1 - e.y0 + 1;
    let sy = HAUTEURS[nom][n] * PXM.y / eh; const sx0 = sy * PXM.x / PXM.y;
    if (ew * sx0 > 3.15 * PXM.x) sy *= 3.15 * PXM.x / (ew * sx0); // trop large pour la case
    const sx = sy * PXM.x / PXM.y;
    // Marges autour de l'élément : l'ombre de l'appui en dessous, un peu d'air sur les côtés.
    const mx = Math.round(ew * 0.04), mh = Math.round(eh * 0.02), mb = Math.round(eh * 0.14);
    const x0 = Math.max(0, e.x0 - mx), x1 = Math.min(p.w - 1, e.x1 + mx), y0 = Math.max(0, e.y0 - mh), y1 = Math.min(p.h - 1, e.y1 + (nom.startsWith('rdc') ? 0 : mb));
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1, crop = Buffer.alloc(cw * ch * 4);
    for (let y = 0; y < ch; y++) p.rgba.copy(crop, y * cw * 4, ((y0 + y) * p.w + x0) * 4, ((y0 + y) * p.w + x1 + 1) * 4);
    const tw = Math.max(1, Math.round(cw * sx)), th = Math.max(1, Math.round(ch * sy));
    const { data } = await sharp(crop, { raw: { width: cw, height: ch, channels: 4 } }).resize(tw, th, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
    // Position : le bas de l'élément (sans la marge) à `bas` m du bas de la case, son milieu à `centre` m du bord gauche.
    const caseX = col * C, caseBas = (3 - ligne) * C; // la ligne 0 est en bas de l'image
    const left = Math.round(caseX + centre * PXM.x - ((e.x0 + e.x1) / 2 - x0) * sx);
    const top = Math.round(caseBas - bas * PXM.y - (e.y1 + 1 - y0) * sy);
    poser(data, tw, th, left, top);
  }
  // L'enseigne de la boutique (case 2 du rez-de-chaussée), au-dessus du rideau.
  const ens = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${C - 24}" height="70"><rect width="100%" height="100%" rx="3" fill="#f2c21b"/><rect x="3" y="3" width="${C - 30}" height="64" fill="none" stroke="#1d1a16" stroke-width="2" opacity=".35"/><text x="50%" y="52" text-anchor="middle" font-family="Impact, Arial Black, sans-serif" font-size="46" fill="#1d1a16">ALIMENTATION</text></svg>`);
  const { data: ed, info: ei } = await sharp(ens).raw().toBuffer({ resolveWithObject: true });
  poser(ed, ei.width, ei.height, 2 * C + 12, 3 * C - Math.round(3.1 * PXM.y));
  const buf = Buffer.alloc(W * H * 4); for (let i = 0; i < A.length; i++) buf[i] = Math.round(A[i] * (i % 4 === 3 ? 255 : 1));
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 86, alphaQuality: 90, effort: 5 }).toFile(`${OUT}/facades.webp`);
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).resize(W / 2, H / 2).webp({ quality: 86, alphaQuality: 90, effort: 5 }).toFile(`${OUT}/facades-leger.webp`);
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).flatten({ background: '#d9c9b0' }).resize(W / 2, H / 2).jpeg({ quality: 80 }).toFile(`sources/textures-ia/apercu-atlas.jpg`);
  console.log('atlas', W + '×' + H);
  // Le portail des murs de parcelle (rue.js) : le portail bleu en tôle, en gris (le jeu le teinte, un par parcelle).
  const pr = P.rdc1, e = pr.elems[0], pw = e.x1 - e.x0 + 1, ph = e.y1 - e.y0 + 1, gris = Buffer.alloc(pw * ph);
  let moy = 0;
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) { const o = ((e.y0 + y) * pr.w + e.x0 + x) * 4; moy += lum(pr.rgba[o], pr.rgba[o + 1], pr.rgba[o + 2]) / (pw * ph); }
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) { const o = ((e.y0 + y) * pr.w + e.x0 + x) * 4; gris[y * pw + x] = Math.min(255, Math.round(lum(pr.rgba[o], pr.rgba[o + 1], pr.rgba[o + 2]) * 0.8 * 255 / moy)); }
  for (const [cote, suffixe] of [[512, ''], [256, '-leger']]) await sharp(gris, { raw: { width: pw, height: ph, channels: 1 } }).resize(cote, cote, { fit: 'fill' }).jpeg({ quality: 84 }).toFile(`${OUT}/portail${suffixe}.jpg`);
}

// ---------- 3. Feuillages des arbres (lieux.js) : un bouquet de feuilles détouré, posé sur chaque carte de la couronne ----------
async function feuillage(nom) {
  const { d, w, h } = await lire(`${nom}.jpg`, 1024, 1024), N = w * h, a = new Uint8Array(N);
  let x0 = w, x1 = 0, y0 = h, y1 = 0; const moy = [0, 0, 0]; let n = 0;
  for (let i = 0; i < N; i++) {
    const r = d[i * 3] / 255, g = d[i * 3 + 1] / 255, b = d[i * 3 + 2] / 255, mn = Math.min(r, b);
    const fond = mn - g > 0.1 && g < 0.65 * mn && mn > 0.12;
    if (!fond) { a[i] = 255; const x = i % w, y = (i / w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); moy[0] += d[i * 3]; moy[1] += d[i * 3 + 1]; moy[2] += d[i * 3 + 2]; n++; }
  }
  // Autour des feuilles, la couleur moyenne du feuillage (pas du noir) : les mipmaps n'y font pas de liseré sombre.
  const rgba = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    const sp = a[i] ? Math.max(0, Math.min(d[i * 3], d[i * 3 + 2]) - d[i * 3 + 1]) * 0.9 : 0;
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = a[i] ? (c === 1 ? d[i * 3 + 1] : d[i * 3 + c] - sp) : moy[c] / n;
    rgba[i * 4 + 3] = a[i];
  }
  const cote = Math.max(x1 - x0, y1 - y0) + 8, cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1;
  const left = Math.max(0, cx - (cote >> 1)), top = Math.max(0, cy - (cote >> 1)), cw = Math.min(cote, w - left), ch = Math.min(cote, h - top);
  const base = sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).extract({ left, top, width: cw, height: ch });
  const buf = await base.raw().toBuffer();
  await sharp(buf, { raw: { width: cw, height: ch, channels: 4 } }).resize(512, 512, { fit: 'fill' }).webp({ quality: 85, alphaQuality: 90 }).toFile(`${OUT}/${nom}.webp`); // ordinateur seulement (lieux.js)
  console.log(nom, cw + '×' + ch);
}

await repetee('enduit', { teinte: 0.45, haut: 0.08, bas: 0.08 });
await repetee('sol', { teinte: 0.6 });
await repetee('tole', { motifX: true, teinte: 0.7 });
await repetee('tuiles', { motifX: true, motifY: true, teinte: 0.5 });
await repetee('dalle', { teinte: 0.35 });
await atlas();
await feuillage('feuillage');
await feuillage('flamboyant');
