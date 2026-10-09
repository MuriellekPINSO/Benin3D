// Données de la version anglaise : public/donnees/cotonou.en.json.gz = les données françaises, avec les
// noms des lignes de Zém Run et les textes des arrêts traduits (i18n/en-donnees.json). À relancer après
// `npm run donnees`.
import fs from 'fs'; import zlib from 'zlib';
const T = JSON.parse(fs.readFileSync('i18n/en-donnees.json', 'utf8'));
const d = JSON.parse(zlib.gunzipSync(fs.readFileSync('public/donnees/cotonou.json.gz')));
let n = 0;
for (const l of d.L.lignes) { const t = T[l.id]; if (!t) { console.warn('ligne sans traduction', l.id); continue; } l.nom = t.nom; l.arrets.forEach(a => { if (t.arrets[a.nom]) { a.fait = t.arrets[a.nom]; n++; } }); }
fs.writeFileSync('public/donnees/cotonou.en.json.gz', zlib.gzipSync(JSON.stringify(d), { level: 9 }));
console.log('cotonou.en.json.gz :', n, 'textes d’arrêts traduits');
