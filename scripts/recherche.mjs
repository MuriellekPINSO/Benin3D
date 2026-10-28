// npm run recherche [dossier osm] : l'index de la recherche de la grande carte (carte-salon.js), dans
// public/donnees/recherche.json. Il n'est téléchargé qu'à la première recherche : rien de plus au démarrage.
//  - rues : les voies nommées d'OpenStreetMap, un point tous les 40 m au plus (pour trouver le bout de la rue le plus
//    proche de soi, et la surligner sur la carte), en mètres du jeu (base.js : toXZ) ;
//  - lieux : commerces, écoles, églises, hôtels, monuments… [nom, type, x, z] ; les quartiers et villages aussi.
// Les données OSM ne sont pas dans git (osm/ est ignoré) : on lit celles du dossier principal.
import fs from 'node:fs';

const OSM = process.argv[2] || 'osm';
const LAT0 = 6.37, LON0 = 2.415, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110574; // comme src/base.js
const P = (lat, lon) => [Math.round((lon - LON0) * KX), Math.round((LAT0 - lat) * KZ)];
const load = f => { try { return JSON.parse(fs.readFileSync(`${OSM}/${f}.json`, 'utf8')).elements || []; } catch { console.warn('absent :', f); return []; } };

// ---------- Les rues nommées ----------
const rues = new Map();
for (const e of [...load('roads'), ...load('roads2')]) {
  const n = e.tags?.name?.trim(); if (!n || !e.geometry || /^(footway|path|steps|track|cycleway)$/.test(e.tags.highway)) continue;
  const pts = []; let prev = null;
  for (const g of e.geometry) {
    const q = P(g.lat, g.lon);
    if (prev) { const d = Math.hypot(q[0] - prev[0], q[1] - prev[1]), k = Math.ceil(d / 40); for (let i = 1; i < k; i++) pts.push(Math.round(prev[0] + (q[0] - prev[0]) * i / k), Math.round(prev[1] + (q[1] - prev[1]) * i / k)); }
    pts.push(q[0], q[1]); prev = q;
  }
  let r = rues.get(n); if (!r) rues.set(n, r = []);
  if (!r.some(a => a.length === pts.length && a.every((v, i) => v === pts[i]))) r.push(pts); // roads2 recopie des voies de roads
}

// ---------- Les lieux ----------
const TYPE = t => {
  const a = t.amenity, s = t.shop;
  if (t.place) return /^(neighbourhood|quarter|suburb|village|town|hamlet|city|locality)$/.test(t.place) ? 'quartier' : null;
  if (a === 'pharmacy' || t.healthcare === 'pharmacy') return 'pharmacie';
  if (a === 'bank' || a === 'atm' || a === 'bureau_de_change' || a === 'money_transfer') return 'banque';
  if (a === 'fuel') return 'station';
  if (/^(hotel|guest_house|apartment|hostel|motel)$/.test(t.tourism || '')) return 'hotel';
  if (/^(museum|attraction|artwork|gallery|viewpoint)$/.test(t.tourism || '') || t.historic) return 'monument';
  if (/restaurant|fast_food|food_court|cafe/.test(a || '')) return 'restaurant';
  if (/bar|pub|nightclub/.test(a || '')) return 'bar';
  if (/school|college|university|kindergarten|library/.test(a || '')) return 'ecole';
  if (a === 'place_of_worship') return t.religion === 'muslim' ? 'mosquee' : 'eglise';
  if (/clinic|hospital|doctors|dentist/.test(a || '') || t.healthcare) return 'sante';
  if (/supermarket|convenience|mall|department_store/.test(s || '')) return 'supermarche';
  if (/hairdresser|beauty/.test(s || '')) return 'coiffure';
  if (/clothes|boutique|shoes|fabric|tailor|bag|fashion/.test(s || '') || t.craft === 'tailor') return 'mode';
  if (/mobile_phone|electronics|computer|telecommunication/.test(s || '') || t.office === 'telecommunication') return 'telephone';
  if (/car_repair|tyres|car|motorcycle|car_parts/.test(s || '') || a === 'car_wash') return 'garage';
  if (a === 'post_office') return 'poste';
  if (a === 'police') return 'police';
  if (a === 'marketplace') return 'marche';
  if (a === 'bus_station' || a === 'taxi') return 'gare';
  if (/hardware|doityourself/.test(s || '')) return 'quincaillerie';
  if (t.office || t.amenity === 'townhall' || t.amenity === 'embassy') return 'bureau';
  if (t.leisure) return 'loisirs';
  if (s) return 'boutique';
  return a ? 'lieu' : null;
};
const lieux = [];
for (const e of ['commerces', 'commerces_ouidah', 'poi', 'calavi_poi', 'ouidah_poi'].flatMap(load)) {
  const c = e.center || e, n = e.tags?.name?.trim(); if (!c?.lat || !n || n.length > 60) continue;
  const ty = TYPE(e.tags); if (!ty) continue;
  const [x, z] = P(c.lat, c.lon);
  if (lieux.some(l => l[0] === n && Math.hypot(l[2] - x, l[3] - z) < 150)) continue; // le même, dans deux fichiers
  lieux.push([n, ty, x, z]);
}

const out = { v: 1, rues: [...rues].map(([n, p]) => ({ n, p })).sort((a, b) => a.n.localeCompare(b.n, 'fr')), lieux };
fs.writeFileSync('public/donnees/recherche.json', JSON.stringify(out));
const taille = fs.statSync('public/donnees/recherche.json').size;
console.log(`${out.rues.length} rues, ${lieux.length} lieux, ${(taille / 1024).toFixed(0)} Ko`);
