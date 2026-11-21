// Textures scannées de Poly Haven (polyhaven.com, licence CC0 : libres, sans attribution obligatoire), 21/11 :
// « on peut utiliser ça pour améliorer nos textures ? j'espère que ça ne pèse pas » (Murielle).
// Originaux en 2K (couleur + relief « nor_gl ») dans sources/polyhaven/ (non versionnés). À lancer depuis la racine :
//   node scripts/textures-polyhaven.mjs
//
// Sortie : public/textures/ph/
// - sol, enduit : remplacent les « détails » de textures/ia (même rôle, même poids, téléphones compris en -leger) ;
// - bitume : détail du goudron (haute qualité seulement) ;
// - *-n : reliefs (normal maps OpenGL) du goudron, du sable et des pavés (haute qualité seulement) ;
// - trottoir : couleur des pavés autobloquants (haute qualité seulement).
// Les détails sont ramenés autour du gris moyen (128 = la couleur du jeu telle quelle, voir scripts/textures-ia.mjs),
// avec le même contraste que les anciennes images, pour que le jeu garde ses couleurs.
import fs from 'fs';
import sharp from 'sharp';

const SRC = 'sources/polyhaven', OUT = 'public/textures/ph';
fs.mkdirSync(OUT, { recursive: true });
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

async function lire(fichier, cote) {
  const { data, info } = await sharp(fichier).resize(cote, cote, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { d: new Float32Array(data), w: info.width, h: info.height };
}
/** Écart type de la luminosité relative (1 = la moyenne) d'une image. */
function contraste({ d, w, h }) {
  const n = w * h; let m = 0; for (let i = 0; i < n; i++) m += lum(d[i * 3], d[i * 3 + 1], d[i * 3 + 2]) / n;
  let v = 0; for (let i = 0; i < n; i++) { const x = lum(d[i * 3], d[i * 3 + 1], d[i * 3 + 2]) / m - 1; v += x * x / n; }
  return Math.sqrt(v);
}
/** Le détail autour du gris moyen, au contraste `cible` ; `teinte` : part de la couleur de la photo gardée. */
function detail({ d, w, h }, cible, teinte) {
  const n = w * h, moy = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) moy[c] += d[i * 3 + c] / n;
  const k = cible / contraste({ d, w, h });
  const out = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const r = d[i * 3] / moy[0], g = d[i * 3 + 1] / moy[1], b = d[i * 3 + 2] / moy[2], l = lum(r, g, b);
    for (const [c, v] of [[0, r], [1, g], [2, b]]) out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(128 * (1 + (l - 1) * k + (v - l) * teinte * k))));
  }
  return out;
}
const ecrire = (buf, cote, nom, q = 84) => sharp(buf, { raw: { width: cote, height: cote, channels: 3 } }).jpeg({ quality: q, mozjpeg: true }).toFile(`${OUT}/${nom}.jpg`);

async function detailDe(id, nom, ancien, { teinte = 0.5, leger = true, gain = 1 } = {}) {
  const cible = contraste(await lire(ancien, 512)) * gain;
  for (const [cote, suffixe] of leger ? [[1024, ''], [512, '-leger']] : [[1024, '']]) {
    const img = await lire(`${SRC}/${id}_diff_2k.jpg`, cote);
    await ecrire(detail(img, cible, teinte), cote, nom + suffixe);
  }
  console.log(nom, '←', id, 'contraste', cible.toFixed(3));
}
async function relief(id, nom, cote = 1024) {
  await sharp(`${SRC}/${id}_nor_2k.jpg`).resize(cote, cote).removeAlpha().jpeg({ quality: 88, mozjpeg: true }).toFile(`${OUT}/${nom}-n.jpg`);
  console.log(nom + '-n', '←', id);
}

await detailDe('playground_sand', 'sol', 'public/textures/ia/sol.jpg'); // sable piétiné, traces de pas (2,1 m)
await detailDe('white_stucco_02', 'enduit', 'public/textures/ia/enduit.jpg', { teinte: 0.3 });
await detailDe('asphalt_02', 'bitume', 'public/textures/ia/sol.jpg', { teinte: 0.2, leger: false, gain: 1.15 });
await relief('asphalt_02', 'bitume');
await relief('playground_sand', 'sol');
await relief('concrete_pavers_03', 'trottoir');
// Les pavés en couleur, ramenés au gris clair des pavés de Cotonou (pâlis par le soleil ; la photo est brune) :
// moyenne fixée au gris du dessin d'avant (#a3a49f), variations de la photo gardées, peu de couleur.
{
  const img = await lire(`${SRC}/concrete_pavers_03_diff_2k.jpg`, 1024), n = img.w * img.h, moy = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) moy[c] += img.d[i * 3 + c] / n;
  const cible = [0xa6, 0xa7, 0xa1], out = Buffer.alloc(n * 3), lm = lum(...moy);
  for (let i = 0; i < n; i++) {
    const l = lum(img.d[i * 3], img.d[i * 3 + 1], img.d[i * 3 + 2]) / lm;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(cible[c] * (l + (img.d[i * 3 + c] / moy[c] - l) * 0.25))));
  }
  await ecrire(out, 1024, 'trottoir');
}
console.log('trottoir ← concrete_pavers_03');
for (const f of fs.readdirSync(OUT).sort()) console.log(' ', f, Math.round(fs.statSync(`${OUT}/${f}`).size / 1024), 'Ko');
