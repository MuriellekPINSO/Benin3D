// Copie anglaise du dépôt (pour MuriellekPINSO/3dmonde) : tous les fichiers suivis par git, avec les
// textes et les commentaires traduits par les dictionnaires de i18n/.
//   node scripts/i18n/exporter.mjs <dossier-destination>
import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
import { traduire } from './jetons.mjs';
import { dictionnaires, traduireHtml } from './vite-langue.mjs';
const dest = process.argv[2]; if (!dest) throw new Error('dossier de destination ?');
const { textes, plus, commun, html } = dictionnaires(), coms = JSON.parse(fs.readFileSync('i18n/en-commentaires.json', 'utf8'));
const comsCommun = Object.assign({}, ...Object.values(coms));
let n = 0;
for (const f of execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean)) {
  const out = path.join(dest, f); fs.mkdirSync(path.dirname(out), { recursive: true });
  if (/^(src|scripts)\/[^/]+\.m?js$/.test(f)) { fs.writeFileSync(out, traduire(fs.readFileSync(f, 'utf8'), { ...(textes[f] || {}), ...(plus[f] || {}) }, commun, { ...comsCommun, ...(coms[f] || {}) })); n++; }
  else if (f === 'index.html') fs.writeFileSync(out, traduireHtml(fs.readFileSync(f, 'utf8'), html));
  else fs.copyFileSync(f, out);
}
console.log(`${dest} : ${n} fichiers de code traduits`);
