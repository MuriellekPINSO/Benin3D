// Version anglaise du site, construite à partir du même code : pendant `LANGUE=en vite build`, les textes
// français du code (src/), de la page (index.html) et de la feuille de style sont remplacés par leur
// traduction (i18n/en-*.json). Le français reste la langue du code source.
import fs from 'fs';
import path from 'path';
import { traduire } from './jetons.mjs';

const lire = f => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
// Un texte « humain » (espace, accent, ponctuation) peut servir d'un fichier à l'autre ; un mot-clé non.
const humain = s => /[\s À-ÿ’'«»!?:,.]/.test(s.slice(1, -1)) && s.length > 4;

export function dictionnaires() {
  const textes = lire('i18n/en-textes.json'), plus = lire('i18n/en-complement.json');
  const commun = {};
  for (const d of Object.values(textes)) for (const [k, v] of Object.entries(d)) if (humain(k) && !(k in commun)) commun[k] = v;
  Object.assign(commun, plus['*'] || {});
  const html = { ...lire('i18n/en-html.json'), ...(plus['index.html'] || {}) };
  return { textes, plus, commun, html };
}
export function traduireHtml(h, html) {
  const t = s => html[s.trim()] !== undefined ? s.replace(s.trim(), html[s.trim()]) : s;
  return h
    .replace(/<html lang="fr">/, '<html lang="en">')
    .replace(/\b(title|aria-label|placeholder|alt|content)="([^"]*)"/g, (m, a, v) => html[v] !== undefined ? `${a}="${html[v]}"` : m)
    .replace(/>([^<]+)</g, (m, x) => `>${t(x)}<`)
    // le bouton de langue ramène au français
    .replace(/<a class="langue" id="btnLangue" href="en\/" hreflang="en"([^>]*)>EN<\/a>/, '<a class="langue" id="btnLangue" href="/" hreflang="fr" title="Lire en français">FR</a>');
}
export function langue(code) {
  if (code !== 'en') return { name: 'langue' };
  const { textes, plus, commun, html } = dictionnaires();
  return {
    name: 'langue', enforce: 'pre',
    transform(src, id) {
      const rel = path.relative(process.cwd(), id.split('?')[0]).replace(/\\/g, '/');
      if (rel.startsWith('src/') && /\.m?js$/.test(rel)) return { code: traduire(src, { ...(textes[rel] || {}), ...(plus[rel] || {}) }, commun), map: null };
      if (rel === 'src/style.css') { let c = src; for (const [a, b] of Object.entries(plus[rel] || {})) c = c.split(a).join(b); return { code: c, map: null }; }
    },
    transformIndexHtml: h => traduireHtml(h, html),
  };
}
