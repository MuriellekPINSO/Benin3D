import { toXZ } from './base.js';
import { QUARTIERS } from './donnees-lieux.js';

// ---------- Chercher un lieu, une rue, un quartier (grande carte du salon) ----------
// « Je dois pouvoir rechercher un itinéraire et avoir la localisation » (Murielle, 28/10). L'index vient d'OpenStreetMap
// (scripts/recherche.mjs) : 320 rues nommées, 4 000 commerces, écoles, églises, hôtels, monuments, quartiers. Il n'est
// téléchargé qu'à la première ouverture de la grande carte (120 Ko), jamais au démarrage.

const TYPES = {
  pharmacie: 'Pharmacie', banque: 'Banque', station: 'Station-service', hotel: 'Hôtel', monument: 'Monument', restaurant: 'Restaurant',
  bar: 'Bar, maquis', ecole: 'École', mosquee: 'Mosquée', eglise: 'Église', sante: 'Santé', supermarche: 'Supermarché', coiffure: 'Coiffure, beauté',
  mode: 'Mode', telephone: 'Téléphones', garage: 'Garage', poste: 'Poste', police: 'Police', marche: 'Marché', gare: 'Gare', quincaillerie: 'Quincaillerie',
  bureau: 'Bureau', loisirs: 'Loisirs', boutique: 'Boutique', lieu: 'Lieu', quartier: 'Quartier', rue: 'Rue',
};
const R = { index: null, charge: null, entrees: [] };
/** Sans accents, sans ponctuation, en minuscules : « Cadjèhoun » se trouve en tapant « cadjehoun ». */
export const normaliser = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ɔ/g, 'o').replace(/ɛ/g, 'e').replace(/[’'`´-]/g, ' ').replace(/[^a-z0-9.]+/g, ' ').trim();

/** Télécharge l'index une fois (les appels suivants attendent le même). */
export function chargerRecherche() {
  R.charge ??= fetch(`${import.meta.env.BASE_URL}donnees/recherche.json`).then(r => (r.ok ? r.json() : null)).then(d => {
    if (!d) return null;
    R.index = d;
    const vus = new Set(QUARTIERS.map(q => normaliser(q[0])));
    R.entrees = [
      ...QUARTIERS.map(([nom, la, lo]) => { const [x, z] = toXZ(la, lo); return { nom, type: 'quartier', x, z }; }),
      ...d.lieux.filter(l => l[1] !== 'quartier' || !vus.has(normaliser(l[0]))).map(([nom, type, x, z]) => ({ nom, type, x, z })),
      ...d.rues.map(r => ({ nom: r.n, type: 'rue', rue: r.p, x: r.p[0][0], z: r.p[0][1] })),
    ];
    for (const e of R.entrees) e.n = normaliser(e.nom);
    return d;
  }).catch(() => { R.charge = null; return null; }); // hors ligne : on réessaiera à la prochaine ouverture
  return R.charge;
}

/** Le point d'une rue le plus proche de (x, z) : c'est là qu'on va quand on cherche une rue. */
function pointDeRue(rue, x, z) {
  let m = null, d = Infinity;
  for (const p of rue) for (let i = 0; i < p.length; i += 2) { const e = (p[i] - x) ** 2 + (p[i + 1] - z) ** 2; if (e < d) { d = e; m = [p[i], p[i + 1]]; } }
  return m;
}
/** Le libellé d'un résultat : son type, ou ce qu'il est dans le jeu. */
export const typeDe = t => TYPES[t] || (t === 'maison' ? 'Chez toi' : t === 'commerce' ? 'Ton commerce' : t === 'jeu' ? 'À visiter dans le jeu' : 'Lieu');

/**
 * Les meilleurs résultats pour `texte`, autour de (x, z). `jeu` : les lieux du jeu ({ id, nom, x, z, type }), en tête à
 * égalité. Chaque mot tapé doit se trouver dans le nom : au début d'un mot, il compte double.
 */
export function chercher(texte, x, z, jeu = [], max = 8) {
  const mots = normaliser(texte).split(' ').filter(Boolean); if (!mots.length) return [];
  const q = mots.join(' '), out = [];
  const noter = e => {
    const n = e.n ?? (e.n = normaliser(e.nom)), debuts = ` ${n}`; let s = 0;
    for (const m of mots) { if (debuts.includes(` ${m}`)) s += 2; else if (n.includes(m)) s += 1; else return 0; }
    return s + (n.startsWith(q) ? 3 : 0); // à égalité, le plus proche d'abord : « pharmacie » donne celle du quartier
  };
  for (const L of jeu) { const s = noter(L); if (s) out.push({ ...L, type: L.type === 'lieu' ? 'jeu' : L.type, s: s + 1, d: Math.hypot(L.x - x, L.z - z) }); }
  for (const e of R.entrees) {
    const s = noter(e); if (!s) continue;
    const p = e.rue ? pointDeRue(e.rue, x, z) : [e.x, e.z], d = Math.hypot(p[0] - x, p[1] - z);
    if (out.some(o => o.n === e.n && Math.hypot(o.x - p[0], o.z - p[1]) < 300)) continue; // déjà là, comme lieu du jeu
    out.push({ nom: e.nom, n: e.n, type: e.type, rue: e.rue, x: p[0], z: p[1], s, d });
  }
  return out.sort((a, b) => b.s - a.s || a.d - b.d).slice(0, max);
}

/** Le quartier le plus proche (à 2 km près), pour situer un résultat : « Pharmacie · Akpakpa · 1,2 km ». */
export function quartierDe(x, z) {
  let q = '', d = 2000 * 2000;
  for (const e of R.entrees) if (e.type === 'quartier') { const k = (e.x - x) ** 2 + (e.z - z) ** 2; if (k < d) { d = k; q = e.nom; } }
  return q;
}
/** Où est-on : la rue (à 35 m près) et le quartier le plus proche (à 2 km près). Sans index, le quartier seul. */
export function ouEstCe(x, z) {
  let rue = '', dr = 35 * 35, quartier = '', dq = 2000 * 2000;
  for (const e of R.entrees.length ? R.entrees : QUARTIERS.map(([nom, la, lo]) => { const [qx, qz] = toXZ(la, lo); return { nom, type: 'quartier', x: qx, z: qz }; })) {
    if (e.type === 'quartier') { const d = (e.x - x) ** 2 + (e.z - z) ** 2; if (d < dq) { dq = d; quartier = e.nom; } }
    else if (e.type === 'rue') for (const p of e.rue) for (let i = 0; i < p.length; i += 2) { const d = (p[i] - x) ** 2 + (p[i + 1] - z) ** 2; if (d < dr) { dr = d; rue = e.nom; } }
  }
  return { rue, quartier };
}
/** « Rue du Dahomey, Missèbo » ; « Akpakpa, rue sans nom » : à Cotonou, la plupart des rues n'en ont pas. */
export function texteOu({ rue, quartier }) {
  if (rue && quartier) return `${rue}, ${quartier}`;
  return rue || (quartier ? `${quartier}, rue sans nom` : 'Hors des quartiers connus');
}
/** Distance lisible : « 450 m », « 2,3 km ». */
export const texteDistance = m => (m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
/** Durée lisible : « 4 min », « 1 h 05 ». */
export const texteDuree = s => { const m = Math.max(1, Math.round(s / 60)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
