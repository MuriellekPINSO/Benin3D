// Affiches des annonceurs pour les panneaux de la ville (public/pubs/).
// Les visuels d'origine, de formats variés, sont dans sources/pubs/<marque>/ (non versionnés). On les
// met au format des panneaux : 4:3 pour les panneaux 4 × 3 (rue.js, bordure.js), 2:1 pour les grands
// panneaux sur mât (lieux.js, grandPanneau). Les affiches sont posées côte à côte sans être coupées,
// sur un fond flou tiré de la première. À lancer depuis la racine : npm run pubs
import fs from 'fs';
import sharp from 'sharp';

const SOURCES = 'sources/pubs', SORTIE = 'public/pubs';
const P43 = [1024, 768], P21 = [1600, 800];
const AFFICHES = [
  // Moov Africa (visuels fournis par l'utilisatrice, octobre 2026)
  { id: 'moov-sayaa', src: ['moov/sayaa.jpg'] },
  { id: 'moov-meilleur', src: ['moov/meilleur.jpg'] },
  { id: 'moov-199', src: ['moov/199.jpg'] },
  { id: 'moov-canal', src: ['moov/canal.jpg'] },
  { id: 'moov-fidelis', src: ['moov/fidelis.jpg'] },
  { id: 'moov-depistage', src: ['moov/depistage.jpg'] },
  { id: 'moov-gaming', src: ['moov/gaming.jpg'] },
  { id: 'moov-vacances', src: ['moov/vacances.jpg'] },
  // Grands panneaux sur mât (place de l'Amazone, siège Moov) : deux visuels par face.
  { id: 'moov-grand-1', src: ['moov/meilleur.jpg', 'moov/199.jpg'], format: P21 },
  { id: 'moov-grand-2', src: ['moov/sayaa.jpg', 'moov/canal.jpg'], format: P21 },
  { id: 'moov-grand-3', src: ['moov/fidelis.jpg', 'moov/depistage.jpg'], format: P21 },
  { id: 'moov-grand-4', src: ['moov/vacances.jpg', 'moov/gaming.jpg'], format: P21 },
  { id: 'moov-grand-5', src: ['moov/199.jpg', 'moov/fidelis.jpg'], format: P21 },
  { id: 'moov-grand-6', src: ['moov/depistage.jpg', 'moov/sayaa.jpg'], format: P21 },
];

async function composer({ id, src, format = P43 }) {
  const [W, H] = format, marge = Math.round(H * .03), ecart = Math.round(H * .03);
  const imgs = await Promise.all(src.map(async f => { const b = fs.readFileSync(`${SOURCES}/${f}`), m = await sharp(b).metadata(); return { b, a: m.width / m.height }; }));
  // Hauteur commune la plus grande qui laisse tout tenir en largeur.
  const h = Math.floor(Math.min(H - 2 * marge, (W - 2 * marge - ecart * (imgs.length - 1)) / imgs.reduce((s, i) => s + i.a, 0)));
  const largeurs = imgs.map(i => Math.round(i.a * h)), total = largeurs.reduce((s, w) => s + w, 0) + ecart * (imgs.length - 1);
  const fond = await sharp(imgs[0].b).resize(W, H, { fit: 'cover' }).blur(H / 25).modulate({ brightness: .72 }).toBuffer();
  let x = Math.round((W - total) / 2); const calques = [];
  for (let k = 0; k < imgs.length; k++) { calques.push({ input: await sharp(imgs[k].b).resize(largeurs[k], h, { fit: 'fill' }).toBuffer(), left: x, top: Math.round((H - h) / 2) }); x += largeurs[k] + ecart; }
  await sharp(fond).composite(calques).jpeg({ quality: 84, mozjpeg: true }).toFile(`${SORTIE}/${id}.jpg`);
  console.log(`${id}.jpg ${W}×${H}, ${(fs.statSync(`${SORTIE}/${id}.jpg`).size / 1024).toFixed(0)} ko`);
}

fs.mkdirSync(SORTIE, { recursive: true });
for (const a of AFFICHES) await composer(a);
