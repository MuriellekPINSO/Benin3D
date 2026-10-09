// Vignettes du catalogue de la boutique de mode : les aperçus de Tripo (sources/, non versionnés),
// détourés puis posés sur un fond crème, en 240 × 240 (public/modeles/mode/vignettes/<id>.webp).
//   node scripts/vignettes-mode.mjs
import fs from 'fs';
import sharp from 'sharp';
const SORTIE = 'public/modeles/mode/vignettes';
const sources = id => [`sources/personnages/${id}-apercu.webp`, `sources/tripo/${id}-apercu.png`].find(f => fs.existsSync(f));
const ids = [...Object.keys(JSON.parse(fs.readFileSync('public/modeles/mode/index.json', 'utf8'))),
  ...Object.keys(fs.existsSync('public/modeles/mode/objets/index.json') ? JSON.parse(fs.readFileSync('public/modeles/mode/objets/index.json', 'utf8')) : {})];
fs.mkdirSync(SORTIE, { recursive: true });
for (const id of ids) {
  const f = sources(id); if (!f) { console.log(`${id} : pas d'aperçu`); continue; }
  const detoure = await sharp(f).trim({ threshold: 12 }).toBuffer();
  await sharp(detoure).resize(220, 220, { fit: 'contain', background: '#f6ecd9' }).extend({ top: 10, bottom: 10, left: 10, right: 10, background: '#f6ecd9' }).flatten({ background: '#f6ecd9' }).webp({ quality: 82 }).toFile(`${SORTIE}/${id}.webp`);
  console.log(`${id}.webp`);
}
