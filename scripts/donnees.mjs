// Construit le jeu de données compact de Cotonou 3D à partir des extraits OpenStreetMap (Overpass).
// Sortie : public/donnees/cotonou.json.gz, coordonnées en décimètres autour de (LAT0, LON0).
// À lancer depuis la racine du projet : npm run donnees
import fs from 'fs';
import zlib from 'zlib';

const LAT0 = 6.37, LON0 = 2.415;
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110574;
const P = (lat, lon) => [Math.round((lon - LON0) * KX * 10), Math.round((LAT0 - lat) * KZ * 10)];
const load = f => JSON.parse(fs.readFileSync('osm/' + f + '.json', 'utf8')).elements;

// Hash déterministe 0..1 à partir d'un id OSM
function rnd(id, salt = 0) {
  let h = (id * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
let seed = 12345;
const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

// ---------- Outils géométriques ----------
const area2 = r => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s; };
function dedupe(r) { const o = []; for (const p of r) { const q = o[o.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) o.push(p); } return o; }
function openRing(r) { r = dedupe(r); if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop(); return r; }
function dropCollinear(r, tol) {
  let changed = true;
  while (changed && r.length > 3) {
    changed = false;
    for (let i = 0; i < r.length && r.length > 3; i++) {
      const a = r[(i - 1 + r.length) % r.length], b = r[i], c = r[(i + 1) % r.length];
      const ab = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      const d = Math.abs((c[0] - a[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (c[1] - a[1])) / ab;
      if (d < tol) { r.splice(i, 1); changed = true; i--; }
    }
  }
  return r;
}
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [i0, i1] = st.pop(); const a = pts[i0], b = pts[i1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let md = -1, mi = -1;
    for (let i = i0 + 1; i < i1; i++) { const p = pts[i]; const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([i0, mi], [mi, i1]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const dpRing = (r, tol) => { if (r.length < 8) return r; const s = dp([...r, r[0]], tol); s.pop(); return s.length >= 3 ? s : r; };
function pip(pt, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
const inPoly = (pt, poly) => pip(pt, poly[0]) && !poly.slice(1).some(h => pip(pt, h));
const bbox = r => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return [x0, z0, x1, z1]; };

// Assemble des anneaux fermés à partir de tronçons de chemins (multipolygones)
function assemble(lines) {
  const k = p => p[0] + ',' + p[1];
  let segs = lines.map(l => l.slice()).filter(l => l.length > 1);
  const rings = [];
  while (segs.length) {
    let cur = segs.shift();
    let grown = true;
    while (k(cur[0]) !== k(cur[cur.length - 1]) && grown) {
      grown = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i], e = cur[cur.length - 1];
        if (k(s[0]) === k(e)) { cur = cur.concat(s.slice(1)); }
        else if (k(s[s.length - 1]) === k(e)) { cur = cur.concat(s.slice(0, -1).reverse()); }
        else if (k(s[s.length - 1]) === k(cur[0])) { cur = s.slice(0, -1).concat(cur); }
        else if (k(s[0]) === k(cur[0])) { cur = s.slice(1).reverse().concat(cur); }
        else continue;
        segs.splice(i, 1); grown = true; break;
      }
    }
    const r = openRing(cur);
    if (r.length >= 3) rings.push(r);
  }
  return rings;
}

// ---------- Repères détaillés : emprises OSM ----------
const LM = load('landmarks');
const lmById = id => LM.find(e => e.id === id);
const lmRing = id => openRing(lmById(id).geometry.map(p => P(p.lat, p.lon)));
const lakeRel = load('rels').find(e => e.id === 3971451);
const lakeOuter = assemble(lakeRel.members.filter(m => m.role === 'outer' && m.geometry).map(m => m.geometry.map(p => P(p.lat, p.lon))));
const lakeBB = lakeOuter.map(bbox);
const inLake = (x, z) => lakeOuter.some((r, i) => { const b = lakeBB[i]; return x > b[0] && x < b[2] && z > b[1] && z < b[3] && pip([x, z], r); });
const EXCLUDE = new Set([520665863, 443576927, 272739399, 418388596, 418074887]); // + marché Ganhi (hall et ancien toit rond) // étoile, cathédrale, Marina : reconstruits en détail
// Boulevard de la Marina : bâtiments reconstruits en détail (src/lieux-marina.js), d'après les photos
// et les relevés sur images satellite (osm/marina.json : emprises extraites d'OSM pour ces lieux).
const MAR = fs.existsSync('osm/marina.json') ? new Map(JSON.parse(fs.readFileSync('osm/marina.json', 'utf8')).elements.map(e => [e.id, e])) : new Map();
const marRing = id => { const e = MAR.get(id); return e?.geometry ? openRing(e.geometry.map(p => P(p.lat, p.lon))) : null; };
const CITE_BATIS = Array.from({ length: 11 }, (_, i) => 1475569326 + i);
for (const id of [418092830, 418092848, 272739650, 418199686, 418199685, 418199703, 418199726, 824870670, 418199684, ...CITE_BATIS, 822608986, 538816990]) EXCLUDE.add(id);
const PARVIS_BCEAO = P(6.35300, 2.42680); // fontaine et allée devant la tour
const ringsMarina = {}; // tour BCEAO (822608986), siège d'AGL (538816990)
// Zones où les emprises Google ne sont pas posées (les lieux y sont dessinés à la main).
const ZONES_MARINA = { poly: [418092822, 1475569343, 1475569350, 824888822, 824944706].map(marRing).filter(Boolean), cercles: [] };
{
  const usa = MAR.get(6217216);
  if (usa) { const o = assemble(usa.members.filter(m => m.role === 'outer' && m.geometry).map(m => m.geometry.map(p => P(p.lat, p.lon)))); if (o[0]) ZONES_MARINA.poly.push(o[0]); ZONES_MARINA.usa = o[0]; }
  for (const [la, lo, r] of [[6.35058, 2.39921, 38], [6.34980, 2.39668, 42], [6.35037, 2.39581, 32], [6.3490205, 2.4032908, 60], [6.3508342, 2.4030206, 55], [6.3496, 2.3871, 72], [6.35300, 2.42680, 32], [6.35085, 2.41977, 30]]) ZONES_MARINA.cercles.push([...P(la, lo), r * 10]);
}
const inMarina = (x, z) => ZONES_MARINA.cercles.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r) || ZONES_MARINA.poly.some(r => pip([x, z], r));
// Bâtiments vus dans les vidéos de drone, reconstruits en détail : Sofitel, tour BCEAO, Erevan, mosquée de Zongo.
const DETAILLES = { 272739400: 'sofitel', 539986464: 'bceao', 81766299: 'erevan', 361292644: 'zongo' };
const ringsDetailles = {};
const ETOILE_C = (() => { const r = lmRing(264916649); return [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]; })();
const PITCH = lmRing(815467297), PITCH_C = [PITCH.reduce((s, p) => s + p[0], 0) / 4, PITCH.reduce((s, p) => s + p[1], 0) / 4];
const marketRings = [lmRing(241551999), lmRing(443598145)];
const amazonePlace = lmRing(1213287112);
const congresRel = lmById(11289109);
const congresOuter = assemble(congresRel.members.filter(m => m.role === 'outer').map(m => m.geometry.map(p => P(p.lat, p.lon))));
const congresInner = assemble(congresRel.members.filter(m => m.role === 'inner').map(m => m.geometry.map(p => P(p.lat, p.lon))));
const TERMINALS = new Set([1188157148, 1188158768, 1188158769, 273487965, 418135815]);
const inStade = (x, z) => ((x - PITCH_C[0]) / 800) ** 2 + ((z - PITCH_C[1]) / 1080) ** 2 < 1;
const RONDS_POINTS = [P(6.35015, 2.38752), P(6.35231, 2.38605)]; // Bio Guéra, aéroport
// Ouidah : esplanade de la Porte du Non-Retour et Arène (positions relevées sur l'imagerie satellite).
const PORTE = P(6.32414, 2.08918), ARENE = P(6.32425, 2.09095);
const inOuidahZone = (x, z) => Math.hypot(x - PORTE[0], z - PORTE[1]) < 700 || Math.hypot(x - ARENE[0], z - ARENE[1]) < 1050;
const inZone = (x, z) => inOuidahZone(x, z) || Math.hypot(x - ETOILE_C[0], z - ETOILE_C[1]) < 950 || RONDS_POINTS.some(([rx, rz]) => Math.hypot(x - rx, z - rz) < 300) || inStade(x, z) || pip([x, z], amazonePlace) || congresOuter.some(r => pip([x, z], r));
function obbOf(r) {
  let best = null;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang);
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const [x, z] of r) { const u = x * c + z * s, v = -x * s + z * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const A = (u1 - u0) * (v1 - v0);
    if (!best || A < best.A) { const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2; best = { A, L: u1 - u0, W: v1 - v0, ang, cx: uc * c - vc * s, cz: uc * s + vc * c }; }
  }
  return best;
}
const campusUAC = openRing(load('campus').find(e => e.id === 347214829).geometry.map(p => P(p.lat, p.lon)));
const SEME_ONE = 418200810; let semeRing = null;
const G = []; // maisons sur pilotis : cx, cz, longueur, largeur (dm), angle (mrad), graine

// ---------- Bâtiments ----------
const seen = new Set();
const bRaw = [];
for (const f of ['b1', 'b2', 'b3', 'b4', 'ganvie', 'b5', 'ouidah_b']) for (const e of load(f)) if (!seen.has(e.id)) { seen.add(e.id); bRaw.push(e); }

const CENTRE = P(6.3605, 2.4275); // Ganhi / Jonquet / Dantokpa
const CAT = t => {
  const b = t.building, a = t.amenity || '';
  if (b === 'stilt_house' || b === 'hut') return 5;
  if (b === 'construction' || b === 'ruins') return 7;
  if (/church|mosque|cathedral|chapel|temple|shrine/.test(b) || a === 'place_of_worship') return 3;
  if (/school|college|university|kindergarten/.test(b) || /school|college|university/.test(a)) return 2;
  if (/hospital/.test(b) || /hospital|clinic/.test(a)) return 6;
  if (/industrial|warehouse|hangar|shed|garage|roof|transformer|greenhouse|service/.test(b)) return 4;
  if (/commercial|office|hotel|retail|public|civic|government|cinema|supermarket/.test(b)) return 1;
  return 0;
};
const B = { n: [], h: [], c: [], x: [], z: [], p: [] };
const ringsExclus = [];
// Palais des Congrès dessiné à la main, avec son parvis et son parking au nord (unités : dm) : Google n’y ajoute rien.
const CONGRES_BB = bbox(congresOuter.flat()), dansCongres = (x, z) => x > CONGRES_BB[0] - 300 && x < CONGRES_BB[2] + 300 && z > CONGRES_BB[1] - 600 && z < CONGRES_BB[3] + 200;
const bIndex = new Map(); // grille 100 m -> boîtes englobantes (pour éviter de planter des palmiers dans les maisons)
let stats = { levels: 0 };
for (const e of bRaw) {
  let r = openRing(e.geometry.map(p => P(p.lat, p.lon)));
  if (r.length < 3) continue;
  r = dropCollinear(r, 2); // 0,2 m
  if (r.length < 3) continue;
  let A = area2(r); if (A < 0) { r.reverse(); A = -A; }
  const m2 = A / 2 / 100;
  if (m2 < 4) continue;
  if (r.length > 255) r = dpRing(r, 3).slice(0, 255);
  const t = e.tags; let cat = CAT(t);
  const u = rnd(e.id), v = rnd(e.id, 7);
  if (EXCLUDE.has(e.id) || DETAILLES[e.id] || e.id === SEME_ONE) ringsExclus.push([r, bbox(r)]); // lieux dessinés à la main : Google ne doit pas les doubler
  if (e.id === 822608986) ringsMarina.bceaoTour = r;
  { const qx = r.reduce((t, p) => t + p[0], 0) / r.length, qz = r.reduce((t, p) => t + p[1], 0) / r.length; if (!EXCLUDE.has(e.id) && !DETAILLES[e.id] && Math.hypot(qx - PARVIS_BCEAO[0], qz - PARVIS_BCEAO[1]) < 300) continue; }
  if (e.id === 538816990) ringsMarina.agl = r;
  if (EXCLUDE.has(e.id)) continue;
  if (DETAILLES[e.id]) { ringsDetailles[DETAILLES[e.id]] = r; continue; }
  if (e.id === SEME_ONE) { semeRing = r; continue; }
  {
    const qx = r.reduce((s, p) => s + p[0], 0) / r.length, qz = r.reduce((s, p) => s + p[1], 0) / r.length;
    if (inZone(qx, qz)) continue;
    if (cat === 5 || inLake(qx, qz)) {
      const o = obbOf(r);
      G.push(Math.round(o.cx), Math.round(o.cz), Math.round(Math.max(o.L, 30)), Math.round(Math.max(o.W, 25)), Math.round(o.ang * 1000), e.id % 997);
      const bb = bbox(r), key = Math.floor(qx / 1000) + ',' + Math.floor(qz / 1000);
      if (!bIndex.has(key)) bIndex.set(key, []); bIndex.get(key).push(bb);
      continue;
    }
    if (marketRings.some(m => pip([qx, qz], m))) cat = m2 > 1200 ? 10 : 8;
    if (TERMINALS.has(e.id)) cat = 9;
    if (pip([qx, qz], campusUAC) && cat !== 3) cat = 11;
  }
  let h;
  const lv = parseFloat(t['building:levels']);
  if (cat === 8) h = 3 + u * 1.6;
  else if (cat === 10) h = 9.5 + u * 3;
  else if (cat === 9) h = e.id === 1188157148 ? 13 : 9;
  else if (cat === 11) h = m2 < 60 ? 3.4 : 6.6 + Math.floor(u * 3) * 3.2;
  else if (t.height && !isNaN(parseFloat(t.height))) h = parseFloat(t.height);
  else if (!isNaN(lv)) { h = Math.max(1, lv) * 3.2 + 0.6; stats.levels++; }
  else {
    const cx0 = r.reduce((s, p) => s + p[0], 0) / r.length, cz0 = r.reduce((s, p) => s + p[1], 0) / r.length;
    const dC = Math.hypot(cx0 - CENTRE[0], cz0 - CENTRE[1]) / 10; // m
    const boost = dC < 1800 ? 0.22 : dC < 3500 ? 0.1 : 0;
    let lev;
    if (cat === 5) h = 3.6 + u * 1.2;
    else if (cat === 7) h = 2.6 + u * 4;
    else if (cat === 4) h = t.building === 'roof' ? 3.4 + u : 5.5 + u * 5;
    else if (cat === 3) h = 9 + u * 7;
    else if (cat === 2) h = u < 0.55 ? 4.2 : 7.6;
    else if (cat === 6) h = 3.6 + Math.floor(u * 3) * 3.3;
    else {
      const big = m2 > 600 ? 0.35 : m2 > 220 ? 0.2 : m2 > 90 ? 0.08 : 0;
      const pUp = Math.min(0.85, (m2 < 40 ? 0.03 : 0.16) + big + boost + (cat === 1 ? 0.25 : 0));
      lev = 1;
      while (lev < 9 && rnd(e.id, lev * 13) < pUp * Math.pow(0.62, lev - 1)) lev++;
      h = lev * 3.15 + 0.5 + v * 0.7;
      if (m2 > 1500 && cat === 0) h = Math.max(h, 6 + v * 4); // grandes emprises : entrepôts, marchés
    }
  }
  h = Math.min(63.5, Math.max(2.4, h));
  const cx = Math.round(r.reduce((s, p) => s + p[0], 0) / r.length), cz = Math.round(r.reduce((s, p) => s + p[1], 0) / r.length);
  B.n.push(r.length); B.h.push(Math.round(h * 4)); B.c.push(cat); B.x.push(cx); B.z.push(cz);
  for (const [x, z] of r) B.p.push(x - cx, z - cz);
  const bb = bbox(r); const key = Math.floor(cx / 1000) + ',' + Math.floor(cz / 1000);
  if (!bIndex.has(key)) bIndex.set(key, []); bIndex.get(key).push(bb);
}
const nearBuilding = (x, z, pad = 15) => { // en dm
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const l = bIndex.get((Math.floor(x / 1000) + i) + ',' + (Math.floor(z / 1000) + j)); if (!l) continue;
    for (const b of l) if (x > b[0] - pad && x < b[2] + pad && z > b[1] - pad && z < b[3] + pad) return true;
  } return false;
};
console.log('bâtiments', B.n.length, 'points', B.p.length / 2, 'avec niveaux OSM', stats.levels);

// ---------- Bâtiments Google Open Buildings (CC BY 4.0) ----------
// Les emprises détectées par Google sur ses images satellite (osm/google_open_buildings.csv.gz,
// extrait des tuiles S2 1023, 1025 et 103d par l'outil de filtrage). On garde celles qu'OSM n'a
// pas, et on les range en tuiles de 1 km (public/donnees/batiments/) que la page charge autour
// de la caméra : il y en a trop pour les dessiner toutes à la fois.
const GOB = 'osm/google_open_buildings.csv.gz';
if (fs.existsSync(GOB)) {
  // Grille des bâtiments OSM (anneaux absolus) pour ne pas dessiner deux fois la même maison.
  const offO = [0]; for (let i = 0; i < B.n.length; i++) offO.push(offO[i] + B.n[i] * 2);
  const gO = new Map(), gC = new Map(), K = 1000;
  for (let i = 0; i < B.n.length; i++) {
    let x0 = 1e12, z0 = 1e12, x1 = -1e12, z1 = -1e12;
    for (let j = 0; j < B.n[i]; j++) { const x = B.x[i] + B.p[offO[i] + 2 * j], z = B.z[i] + B.p[offO[i] + 2 * j + 1]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let cx = Math.floor(x0 / K); cx <= Math.floor(x1 / K); cx++) for (let cz = Math.floor(z0 / K); cz <= Math.floor(z1 / K); cz++) { const k = cx + ',' + cz; if (!gO.has(k)) gO.set(k, []); gO.get(k).push([i, x0, z0, x1, z1]); }
    const kc = Math.floor(B.x[i] / K) + ',' + Math.floor(B.z[i] / K); if (!gC.has(kc)) gC.set(kc, []); gC.get(kc).push(i);
  }
  const dansOSM = (x, z) => (gO.get(Math.floor(x / K) + ',' + Math.floor(z / K)) || []).some(([i, x0, z0, x1, z1]) => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return false;
    const r = []; for (let j = 0; j < B.n[i]; j++) r.push([B.x[i] + B.p[offO[i] + 2 * j], B.z[i] + B.p[offO[i] + 2 * j + 1]]);
    return pip([x, z], r);
  });
  const couvreOSM = (r, bb) => { for (let cx = Math.floor(bb[0] / K); cx <= Math.floor(bb[2] / K); cx++) for (let cz = Math.floor(bb[1] / K); cz <= Math.floor(bb[3] / K); cz++) for (const i of gC.get(cx + ',' + cz) || []) if (B.x[i] > bb[0] && B.x[i] < bb[2] && B.z[i] > bb[1] && B.z[i] < bb[3] && pip([B.x[i], B.z[i]], r)) return true; return false; };
  const TUILE = 10000, tuiles = new Map();
  let lus = 0, gardes = 0, doublons = 0;
  const lignes = zlib.gunzipSync(fs.readFileSync(GOB)).toString('utf8').split('\n');
  for (const l of lignes) {
    const m = l.match(/^([-\d.]+),([-\d.]+),([\d.]+),([\d.]+),"?(?:MULTI)?POLYGON\s*\(\(+(.+?)\)/); if (!m) continue;
    lus++;
    if (+m[4] < .7 || +m[3] < 12) continue;
    let r = m[5].split(',').map(t => { const [lo, la] = t.trim().split(/\s+/).map(Number); return P(la, lo); });
    r = openRing(r); if (r.length < 3) continue;
    r = dropCollinear(r, 2); if (r.length < 3) continue;
    if (r.length > 12) r = dpRing(r, 4).slice(0, 12);
    let A = area2(r); if (A < 0) { r.reverse(); A = -A; } const m2 = A / 200;
    const qx = r.reduce((t, p) => t + p[0], 0) / r.length, qz = r.reduce((t, p) => t + p[1], 0) / r.length;
    if (inZone(qx, qz) || inLake(qx, qz) || inMarina(qx, qz)) continue;
    const bb = bbox(r);
    if (dansOSM(qx, qz) || couvreOSM(r, bb)) { doublons++; continue; }
    if (ringsExclus.some(([er, eb]) => qx > eb[0] && qx < eb[2] && qz > eb[1] && qz < eb[3] && pip([qx, qz], er)) || ringsExclus.some(([er, eb]) => { const ec = [(eb[0] + eb[2]) / 2, (eb[1] + eb[3]) / 2]; return ec[0] > bb[0] && ec[0] < bb[2] && ec[1] > bb[1] && ec[1] < bb[3] && pip(ec, r); })) { doublons++; continue; }
    const id = 10000000 + gardes, u = rnd(id), v = rnd(id, 7);
    if (dansCongres(qx, qz)) { gardes++; continue; } // après la numérotation : les autres bâtiments gardent leur graine
    let cat = m2 > 1500 ? 4 : 0, h;
    if (marketRings.some(mr => pip([qx, qz], mr))) { cat = m2 > 1200 ? 10 : 8; h = cat === 10 ? 9.5 + u * 3 : 3 + u * 1.6; }
    else if (pip([qx, qz], campusUAC)) { cat = 11; h = m2 < 60 ? 3.4 : 6.6 + Math.floor(u * 3) * 3.2; }
    else if (cat === 4) h = 5.5 + u * 5;
    else {
      const dC = Math.hypot(qx - CENTRE[0], qz - CENTRE[1]) / 10, boost = dC < 1800 ? .22 : dC < 3500 ? .1 : 0;
      const big = m2 > 600 ? .35 : m2 > 220 ? .2 : m2 > 90 ? .08 : 0, pUp = Math.min(.85, (m2 < 40 ? .03 : .16) + big + boost);
      let lev = 1; while (lev < 6 && rnd(id, lev * 13) < pUp * Math.pow(.62, lev - 1)) lev++;
      h = lev * 3.15 + .5 + v * .7;
    }
    h = Math.min(40, Math.max(2.6, h));
    const cx = Math.round(qx), cz = Math.round(qz), k = Math.floor(cx / TUILE) + '_' + Math.floor(cz / TUILE);
    if (!tuiles.has(k)) tuiles.set(k, { n: [], h: [], c: [], x: [], z: [], p: [] });
    const T = tuiles.get(k); T.n.push(r.length); T.h.push(Math.round(h * 4)); T.c.push(cat); T.x.push(cx); T.z.push(cz);
    for (const [x, z] of r) T.p.push(x - cx, z - cz);
    const key = Math.floor(cx / 1000) + ',' + Math.floor(cz / 1000); if (!bIndex.has(key)) bIndex.set(key, []); bIndex.get(key).push(bb);
    gardes++;
  }
  fs.rmSync('public/donnees/batiments', { recursive: true, force: true }); fs.mkdirSync('public/donnees/batiments', { recursive: true });
  const index = {}; let octets = 0;
  for (const [k, T] of tuiles) { const gz = zlib.gzipSync(JSON.stringify(T), { level: 9 }); fs.writeFileSync(`public/donnees/batiments/${k}.json.gz`, gz); index[k] = T.n.length; octets += gz.length; }
  fs.writeFileSync('public/donnees/batiments/index.json', JSON.stringify({ taille: TUILE, tuiles: index }));
  console.log(`Google Open Buildings : ${lus} lus, ${doublons} déjà dans OSM, ${gardes} ajoutés en ${tuiles.size} tuiles (${(octets / 1e6).toFixed(1)} Mo)`);
}

// ---------- Routes, voies ferrées, pistes ----------
const CLS = { trunk: 0, trunk_link: 0, motorway: 0, primary: 1, primary_link: 1, secondary: 2, secondary_link: 2, tertiary: 3, tertiary_link: 3, residential: 4, unclassified: 4, living_street: 4, construction: 4, service: 5, track: 5, footway: 6, path: 6, pedestrian: 6, steps: 6, cycleway: 6 };
const R = { c: [], f: [], n: [], p: [] };
const roadLines = []; // pour les palmiers et le trafic (non exporté)
function pushLine(cls, flags, pts, tol = 5) {
  pts = dedupe(pts); if (pts.length < 2) return;
  pts = dp(pts, tol);
  R.c.push(cls); R.f.push(flags); R.n.push(pts.length);
  let px = 0, pz = 0; for (const [x, z] of pts) { R.p.push(x - px, z - pz); px = x; pz = z; }
}
const roadSeen = new Set(), roadsAll = [];
for (const f of ['roads', 'roads2', 'ouidah_r']) for (const e of load(f)) if (!roadSeen.has(e.id)) { roadSeen.add(e.id); roadsAll.push(e); }
for (const e of roadsAll) {
  const t = e.tags; let cls;
  if (t.railway === 'rail') cls = 7; else cls = CLS[t.highway]; if (cls === undefined) continue;
  const s = t.surface || '';
  let surf;
  if (/asphalt|concrete|paved$|chipseal/.test(s)) surf = 0; else if (/paving_stones|sett|cobblestone/.test(s)) surf = 1;
  else if (s) surf = 2; else surf = cls <= 2 ? 0 : cls === 3 ? 1 : 2;
  const flags = surf | (t.bridge ? 4 : 0);
  const pts = e.geometry.map(p => P(p.lat, p.lon));
  pushLine(cls, flags, pts);
  roadLines.push({ cls, pts });
}
// Lignes aéroportuaires et jetées
for (const e of load('aero')) {
  const t = e.tags; const pts = e.geometry.map(p => P(p.lat, p.lon));
  const closed = pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
  if (t.aeroway === 'runway' || t.aeroway === 'stopway') pushLine(10, 0, pts);
  else if (t.aeroway === 'taxiway') pushLine(11, 0, pts);
  else if (t.man_made && !closed) pushLine(9, 0, pts);
}
console.log('voies', R.c.length, 'points', R.p.length / 2);

// ---------- Surfaces (eau, verdure, port…) ----------
const polys = []; // {k, rings}
const KIND = { ocean: 0, lake: 1, water: 2, wetland: 3, beach: 4, park: 5, wood: 6, farm: 7, pitch: 8, cemetery: 9, industrial: 10, apron: 11, airfield: 12, concrete: 13 };
function kindOf(t) {
  if (t.natural === 'water' || t.waterway === 'riverbank') return /lagoon|lake/.test(t.water || '') && !t.name?.includes('Codomey') ? KIND.lake : KIND.water;
  if (t.natural === 'wetland') return KIND.wetland;
  if (/beach|sand/.test(t.natural || '')) return KIND.beach;
  if (/wood|forest/.test(t.natural || t.landuse || '') || t.landuse === 'orchard' || t.natural === 'scrub') return KIND.wood;
  if (t.landuse === 'farmland') return KIND.farm;
  if (/pitch|stadium/.test(t.leisure || '')) return KIND.pitch;
  if (t.landuse === 'cemetery') return KIND.cemetery;
  if (/park|garden|golf_course/.test(t.leisure || '') || /grass|meadow|recreation_ground/.test(t.landuse || '') || t.natural === 'grassland') return KIND.park;
  if (/industrial|port|harbour/.test(t.landuse || '')) return KIND.industrial;
  if (t.aeroway === 'apron') return KIND.apron;
  if (t.aeroway === 'aerodrome') return KIND.airfield;
  if (/groyne|breakwater|pier/.test(t.man_made || '')) return KIND.concrete;
  return -1;
}
const relSeenWays = new Set();
const relsOuidah = load('ouidah_e').filter(e => e.type === 'relation' && e.tags);
for (const rel of [...load('rels'), ...relsOuidah]) {
  const k = kindOf(rel.tags); if (k < 0) continue;
  const outer = [], inner = [];
  for (const m of rel.members || []) if (m.type === 'way' && m.geometry) { relSeenWays.add(m.ref); (m.role === 'inner' ? inner : outer).push(m.geometry.map(p => P(p.lat, p.lon))); }
  const tol = k <= 3 ? 15 : 8;
  const outs = assemble(outer).map(r => dpRing(r, tol)), ins = assemble(inner).map(r => dpRing(r, tol));
  for (const o of outs) {
    const holes = ins.filter(h => pip(h[0], o));
    polys.push({ k, rings: [o, ...holes], name: rel.tags.name || '' });
  }
}
{
  const V = load('videos');
  for (const rel of V.filter(e => e.type === 'relation' && e.tags.landuse === 'cemetery')) {
    const outer = rel.members.filter(m => m.role === 'outer' && m.geometry).map(m => { relSeenWays.add(m.ref); return m.geometry.map(p => P(p.lat, p.lon)); });
    for (const o of assemble(outer)) polys.push({ k: KIND.cemetery, rings: [dpRing(o, 6)], name: rel.tags.name || '' });
  }
}
const waySeen = new Set();
for (const f of ['water', 'green', 'aero', 'videos', 'ouidah_e']) for (const e of load(f)) {
  if (e.type !== 'way' || relSeenWays.has(e.id) || waySeen.has(e.id)) continue;
  waySeen.add(e.id);
  const t = e.tags || {}; if (t.natural === 'coastline' || /Aire marine/i.test(t.name || '')) continue;
  const k = kindOf(t); if (k < 0) continue;
  const pts = e.geometry.map(p => P(p.lat, p.lon));
  const closed = pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
  if (!closed) continue;
  const r = dpRing(openRing(pts), k <= 3 ? 15 : 6); if (r.length < 3) continue;
  polys.push({ k, rings: [r], name: t.name || '' });
}
// Océan : trait de côte (terre à gauche, donc mer au sud) fermé par deux coins lointains
{
  const coSeen = new Set();
  const co = [...load('water'), ...load('ouidah_e')].filter(e => e.type === 'way' && e.tags?.natural === 'coastline' && !coSeen.has(e.id) && coSeen.add(e.id)).map(e => e.geometry.map(p => P(p.lat, p.lon)));
  const k = p => p[0] + ',' + p[1];
  let chains = co; let merged = true;
  while (merged) { merged = false; outer: for (let i = 0; i < chains.length; i++) for (let j = 0; j < chains.length; j++) { if (i !== j && k(chains[i][chains[i].length - 1]) === k(chains[j][0])) { chains[i] = chains[i].concat(chains[j].slice(1)); chains.splice(j, 1); merged = true; break outer; } } }
  const chain = dp(dedupe(chains.sort((a, b) => b.length - a.length)[0]), 15);
  console.log('trait de côte : chaîne de', (chain[0][0] / 10 / KX + LON0).toFixed(3), 'à', (chain[chain.length - 1][0] / 10 / KX + LON0).toFixed(3), '°E,', chains.length, 'morceaux');
  const s = chain[0], e = chain[chain.length - 1];
  const ring = [[-700000, s[1]], ...chain, [700000, e[1]], [700000, 700000], [-700000, 700000]];
  polys.unshift({ k: 0, rings: [ring], name: 'Océan Atlantique' });
  globalThis.COAST = chain;
}
const counts = {}; for (const p of polys) counts[p.k] = (counts[p.k] || 0) + p.rings.reduce((s, r) => s + r.length, 0);
console.log('surfaces', polys.length, 'points par type', counts);

const S = { k: [], r: [], n: [], p: [] }; // type, nb d'anneaux, longueur de chaque anneau, points en delta
for (const { k, rings } of polys) {
  S.k.push(k); S.r.push(rings.length);
  for (const r of rings) { S.n.push(r.length); let px = 0, pz = 0; for (const [x, z] of r) { S.p.push(x - px, z - pz); px = x; pz = z; } }
}

// ---------- Palmiers ----------
const palms = [];
const lake = polys.filter(p => p.k === KIND.lake).sort((a, b) => b.rings[0].length - a.rings[0].length)[0];
const waterPolys = polys.filter(p => p.k <= 2);
const inWater = (x, z) => waterPolys.some(p => { const b = p.bb || (p.bb = bbox(p.rings[0])); return x > b[0] && x < b[2] && z > b[1] && z < b[3] && inPoly([x, z], p.rings); });
{
  const C = globalThis.COAST;
  let acc = 0;
  for (let i = 1; i < C.length; i++) {
    const a = C[i - 1], b = C[i]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L; // vers la terre (nord)
    for (let d = acc; d < L; d += 90) { // tous les 9 m
      const x0 = a[0] + (b[0] - a[0]) * d / L, z0 = a[1] + (b[1] - a[1]) * d / L;
      const xm = x0 / 10;
      if (xm < -9500 || xm > 9800 || (xm > -300 && xm < 2700)) continue; // pas dans le port ni hors zone
      const reps = rand() < 0.6 ? 2 : 1;
      for (let r = 0; r < reps; r++) {
        const off = -(400 + Math.pow(rand(), 1.6) * 2600); // 40 à 300 m dans les terres
        const x = Math.round(x0 + nx * -off + (rand() - 0.5) * 60), z = Math.round(z0 + nz * -off + (rand() - 0.5) * 60);
        if (!nearBuilding(x, z, 25) && !inWater(x, z)) palms.push(x, z);
      }
    }
    acc = 0;
  }
  for (const p of polys) if (p.k === KIND.wood || p.k === KIND.park) {
    const bb = bbox(p.rings[0]); const a = (bb[2] - bb[0]) * (bb[3] - bb[1]) / 100; // m²
    const n = Math.min(400, Math.round(a / (p.k === KIND.wood ? 260 : 900)));
    for (let i = 0; i < n; i++) { const x = Math.round(bb[0] + rand() * (bb[2] - bb[0])), z = Math.round(bb[1] + rand() * (bb[3] - bb[1])); if (inPoly([x, z], p.rings) && !nearBuilding(x, z, 20)) palms.push(x, z); }
  }
}
console.log('palmiers', palms.length / 2);

// ---------- Conteneurs du port ----------
const containers = []; // x, z (dm), angle*1000, hauteur de pile, couleur
{
  const yards = polys.filter(p => p.k === KIND.industrial && /Port Autonome|Containers/.test(p.name));
  for (const y of yards) {
    const ring = y.rings[0];
    // axe principal : arête la plus longue
    let best = 0, ang = 0; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > best) { best = L; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); } }
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const bb = bbox(ring); const cx = (bb[0] + bb[2]) / 2, cz = (bb[1] + bb[3]) / 2; const R0 = Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) / 2;
    for (let u = -R0; u < R0; u += 135) for (let v = -R0; v < R0; v += 28) {
      const blockV = Math.floor((v + R0) / 28) % 8; if (blockV === 7) continue; // allées tous les 7 rangs
      const blockU = Math.floor((u + R0) / 135) % 6; if (blockU === 5) continue;
      const x = Math.round(cx + u * ca - v * sa), z = Math.round(cz + u * sa + v * ca);
      if (!inPoly([x, z], y.rings) || nearBuilding(x, z, 30) || rand() < 0.8) continue;
      containers.push(x, z, Math.round(ang * 1000), 1 + Math.floor(Math.pow(rand(), 0.8) * 4), Math.floor(rand() * 7));
    }
  }
}
console.log('conteneurs', containers.length / 5);

// ---------- Arbres des rues et des parcelles ----------
const isOpenGround = (x, z) => !inWater(x, z) && !inZone(x, z) && !marketRings.some(m => pip([x, z], m)) &&
  !polys.some(p => (p.k === KIND.industrial || p.k === KIND.apron || p.k === KIND.airfield || p.k === KIND.pitch) && (() => { const b = p.bb || (p.bb = bbox(p.rings[0])); return x > b[0] && x < b[2] && z > b[1] && z < b[3] && inPoly([x, z], p.rings); })());
const trees = []; // x, z (dm), type, échelle*10
{
  const RW = { 1: 65, 2: 52, 3: 40, 4: 30 };
  const type = () => { const q = rand(); return q < 0.58 ? 0 : q < 0.76 ? 1 : 2; };
  for (const L of roadLines) {
    if (!(L.cls >= 1 && L.cls <= 4)) continue;
    const step = L.cls <= 2 ? 150 : 230, p = L.cls <= 2 ? 0.55 : L.cls === 3 ? 0.4 : 0.2;
    let carry = rand() * step;
    for (let i = 1; i < L.pts.length; i++) {
      const a = L.pts[i - 1], b = L.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); if (!len) continue;
      const nx = -dz / len, nz = dx / len;
      for (let d = carry; d < len; d += step) for (const sg of [-1, 1]) {
        if (rand() > p) continue;
        const off = RW[L.cls] + 22 + rand() * 18;
        const x = Math.round(a[0] + dx * d / len + nx * off * sg), z = Math.round(a[1] + dz * d / len + nz * off * sg);
        if (!nearBuilding(x, z, 8) && isOpenGround(x, z)) trees.push(x, z, type(), Math.round(8 + rand() * 6));
      }
      carry = (carry - len) % step; if (carry < 0) carry += step;
    }
  }
  { // Ouidah : x ≈ -40 à -33 km
    const cible = trees.length / 4 + 2500; let essais = 0;
    while (trees.length / 4 < cible && essais++ < 120000) {
      const x = Math.round(-410000 + rand() * 90000), z = Math.round(-30000 + rand() * 90000);
      if (nearBuilding(x, z, 25) || !nearBuilding(x, z, 220) || !isOpenGround(x, z)) continue;
      trees.push(x, z, type(), Math.round(8 + rand() * 7));
    }
  }
  const target = trees.length / 4 + 16000; let tries = 0;
  while (trees.length / 4 < target && tries++ < 500000) {
    const x = Math.round(-112000 + rand() * 207000), z = Math.round(-118000 + rand() * 152000);
    if (nearBuilding(x, z, 25) || !nearBuilding(x, z, 220) || !isOpenGround(x, z)) continue;
    trees.push(x, z, type(), Math.round(8 + rand() * 7));
  }
}
console.log('arbres', trees.length / 4);

// ---------- Lac Nokoué : acadjas, jacinthes ----------
const GANVIE = P(6.4681, 2.3900);
const acadjas = []; // x, z, longueur, largeur (dm), angle (mrad)
{
  let tries = 0;
  while (acadjas.length < 5 * 190 && tries++ < 40000) {
    const a = rand() * Math.PI * 2, d = 2200 + Math.sqrt(rand()) * 75000;
    const x = Math.round(GANVIE[0] + Math.cos(a) * d), z = Math.round(GANVIE[1] + Math.sin(a) * d * 0.7);
    const L = Math.round(220 + rand() * 520), W = Math.round(110 + rand() * 300), ang = rand() * Math.PI;
    const ok = [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]].every(([i, j]) => { const px = x + Math.cos(ang) * L / 2 * i - Math.sin(ang) * W / 2 * j, pz = z + Math.sin(ang) * L / 2 * i + Math.cos(ang) * W / 2 * j; return inLake(px, pz) && !nearBuilding(px, pz, 120); });
    if (ok) acadjas.push(x, z, L, W, Math.round(ang * 1000));
  }
}
const hyacinths = []; // x, z, rayon (dm)
{
  let tries = 0;
  while (hyacinths.length < 3 * 700 && tries++ < 60000) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 26000;
    const x = Math.round(GANVIE[0] + Math.cos(a) * d), z = Math.round(GANVIE[1] + Math.sin(a) * d);
    if (inLake(x, z) && !nearBuilding(x, z, 12) && nearBuilding(x, z, 160)) hyacinths.push(x, z, Math.round(15 + rand() * 45));
  }
}
console.log('acadjas', acadjas.length / 5, 'jacinthes', hyacinths.length / 3);

// ---------- Pirogues ----------
const boats = []; // x, z (dm), angle (mrad), type : 0 lac, 1 mer peinte, 2 marché flottant
{
  const add = (n, gen, test, type, maxTries = 40000) => { let k = 0, t = 0; while (k < n && t++ < maxTries) { const [x, z] = gen(); if (test(x, z)) { boats.push(Math.round(x), Math.round(z), Math.round(rand() * 6283), type); k++; } } };
  // Chenaux de Ganvié : entre les maisons
  add(380, () => { const a = rand() * 6.283, d = Math.sqrt(rand()) * 22000; return [GANVIE[0] + Math.cos(a) * d, GANVIE[1] + Math.sin(a) * d]; }, (x, z) => inLake(x, z) && !nearBuilding(x, z, 18) && nearBuilding(x, z, 300), 0);
  // Marché flottant : grappe dans un chenal près du centre
  let mk = null; for (let t = 0; t < 4000 && !mk; t++) { const a = rand() * 6.283, d = rand() * 2500; const x = GANVIE[0] + Math.cos(a) * d, z = GANVIE[1] + Math.sin(a) * d; if (inLake(x, z) && !nearBuilding(x, z, 70) && nearBuilding(x, z, 250)) mk = [x, z]; }
  if (mk) add(30, () => [mk[0] + (rand() - 0.5) * 500, mk[1] + (rand() - 0.5) * 500], (x, z) => inLake(x, z) && !nearBuilding(x, z, 15), 2);
  globalThis.MARCHE_FLOTTANT = mk;
  // Pêcheurs au large sur le lac
  add(140, () => { const a = rand() * 6.283, d = 3000 + Math.sqrt(rand()) * 60000; return [GANVIE[0] + Math.cos(a) * d, GANVIE[1] + Math.sin(a) * d * 0.7]; }, (x, z) => inLake(x, z) && !nearBuilding(x, z, 60), 0);
  // Lagune : rive de Dantokpa et chenal
  const DK = P(6.3727, 2.4352);
  add(70, () => [DK[0] + (rand() - 0.5) * 3000, DK[1] + (rand() - 0.5) * 9000], (x, z) => inWater(x, z) && !inLake(x, z) && !nearBuilding(x, z, 20), 0);
  // Embarcadère d'Abomey-Calavi : pirogues à quai pour Ganvié
  const EMB = P(6.4476, 2.3622);
  add(40, () => [EMB[0] + (rand() - 0.2) * 3000, EMB[1] + (rand() - 0.5) * 3000], (x, z) => inLake(x, z) && !nearBuilding(x, z, 20), 0, 80000);
  // Port de pêche : grandes pirogues peintes, à l'est du bassin
  const PP = [23200, 25600];
  add(80, () => [PP[0] + (rand() - 0.5) * 5000, PP[1] + (rand() - 0.5) * 4000], (x, z) => inWater(x, z) && !nearBuilding(x, z, 25), 1);
}
console.log('pirogues', boats.length / 4);

// ---------- Marché Dantokpa : parasols, sacs, foule ----------
const market = { par: [], ppl: [] };
{
  const bbs = marketRings.map(bbox); let tries = 0;
  while ((market.par.length < 2 * 2200 || market.ppl.length < 2 * 4200) && tries++ < 200000) {
    const i = rand() < 0.75 ? 0 : 1, b = bbs[i];
    const x = Math.round(b[0] + rand() * (b[2] - b[0])), z = Math.round(b[1] + rand() * (b[3] - b[1]));
    if (!pip([x, z], marketRings[i]) || inWater(x, z) || nearBuilding(x, z, 12)) continue;
    if (rand() < 0.4) { if (market.par.length < 2 * 2200) market.par.push(x, z); }
    else if (market.ppl.length < 2 * 4200) market.ppl.push(x, z);
  }
}
console.log('parasols', market.par.length / 2, 'passants', market.ppl.length / 2);

// ---------- Plage de Fidjrossè : paillotes, pirogues tirées au sec, promeneurs ----------
const beach = { pai: [], pir: [], ppl: [] };
{
  const C = globalThis.COAST;
  for (let i = 1; i < C.length; i++) {
    const a = C[i - 1], b = C[i]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!L) continue;
    if (a[0] < -72000 || a[0] > -34000) continue;
    const nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L; // vers la terre
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (let d = 0; d < L; d += 60) {
      const x0 = a[0] + (b[0] - a[0]) * d / L, z0 = a[1] + (b[1] - a[1]) * d / L;
      const r = rand();
      if (r < 0.32) { const off = 350 + rand() * 450, x = Math.round(x0 + nx * off), z = Math.round(z0 + nz * off); if (!nearBuilding(x, z, 30) && !inWater(x, z)) beach.pai.push(x, z, rand() < 0.15 ? 1 : 0, Math.round(ang * 1000)); }
      if (r > 0.86) for (let k = 0; k < 3; k++) { const off = 120 + rand() * 80, s = (k - 1) * 45; const x = Math.round(x0 + Math.cos(ang) * s + nx * off), z = Math.round(z0 + Math.sin(ang) * s + nz * off); beach.pir.push(x, z, Math.round((ang + Math.PI / 2 + (rand() - 0.5) * 0.3) * 1000)); }
      if (rand() < 0.5) { const off = 30 + rand() * 600, x = Math.round(x0 + nx * off + (rand() - 0.5) * 60), z = Math.round(z0 + nz * off); if (!inWater(x, z)) beach.ppl.push(x, z); }
    }
  }
}
console.log('plage', beach.pai.length / 4, 'paillotes', beach.pir.length / 3, 'pirogues', beach.ppl.length / 2, 'promeneurs');

// ---------- Repères pour les constructions détaillées (mètres) ----------
const M = pts => pts.map(([x, z]) => [Math.round(x) / 10, Math.round(z) / 10]);
const ptM = (la, lo) => { const [x, z] = P(la, lo); return [Math.round(x) / 10, Math.round(z) / 10]; };
function chainOf(lines) {
  const k = p => p[0] + ',' + p[1]; let segs = lines.map(l => l.slice()); const out = [];
  while (segs.length) { let cur = segs.shift(), grown = true; while (grown) { grown = false; for (let i = 0; i < segs.length; i++) { const s = segs[i]; if (k(s[0]) === k(cur[cur.length - 1])) cur = cur.concat(s.slice(1)); else if (k(s[s.length - 1]) === k(cur[0])) cur = s.slice(0, -1).concat(cur); else if (k(s[s.length - 1]) === k(cur[cur.length - 1])) cur = cur.concat(s.slice(0, -1).reverse()); else if (k(s[0]) === k(cur[0])) cur = s.slice(1).reverse().concat(cur); else continue; segs.splice(i, 1); grown = true; break; } } out.push(cur); }
  return out.sort((a, b) => b.length - a.length)[0];
}
const cornicheRoad = dp(chainOf(load('roads').filter(e => e.tags.name === 'Route des Pêches Est').map(e => e.geometry.map(p => P(p.lat, p.lon)))), 8);
const epis = [];
{
  const C = globalThis.COAST; let acc = 0;
  for (let i = 1; i < cornicheRoad.length; i++) {
    const a = cornicheRoad[i - 1], b = cornicheRoad[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = (1800 - acc) % 1800; d < L; d += 1800) {
      const x = a[0] + (b[0] - a[0]) * d / L, z = a[1] + (b[1] - a[1]) * d / L;
      let best = null, bd = 1e12; for (let j = 1; j < C.length; j++) { const q = C[j], dd = (q[0] - x) ** 2 + (q[1] - z) ** 2; if (dd < bd) { bd = dd; best = j; } }
      const q0 = C[best - 1], q1 = C[best]; const ang = Math.atan2(q1[1] - q0[1], q1[0] - q0[0]);
      epis.push([Math.round(C[best][0]) / 10, Math.round(C[best][1]) / 10, Math.round(ang * 1000) / 1000]);
    }
    acc = (acc + L) % 1800;
  }
}
// ---------- Lignes du jeu : par les grands axes, devant les monuments ----------
// Chaque ligne alterne arrêts (où l'on prend des passagers) et points de passage
// (devant un monument). Les grands axes coûtent moins cher que les rues de
// quartier : le trajet suit les boulevards que tout Cotonois reconnaît.
const lignes = [];
{
  const F = { trunk: 1, trunk_link: 1, primary: 1, primary_link: 1, secondary: 1.05, secondary_link: 1.05, tertiary: 1.3, tertiary_link: 1.3, unclassified: 2.6, residential: 3, living_street: 3, service: 6 };
  const PRINC = /^(trunk|primary|secondary|tertiary)/;
  const key = p => p.lat.toFixed(7) + ',' + p.lon.toFixed(7);
  const nodes = new Map(), adj = new Map(), princ = new Set(), noms = new Map();
  for (const e of roadsAll) {
    const f = F[e.tags.highway]; if (!f || e.tags.access === 'private') continue;
    const g = e.geometry, nom = e.tags.name || '';
    for (let i = 0; i < g.length; i++) { const k = key(g[i]); if (!nodes.has(k)) { nodes.set(k, P(g[i].lat, g[i].lon)); adj.set(k, []); } if (PRINC.test(e.tags.highway)) princ.add(k); }
    for (let i = 1; i < g.length; i++) {
      const a = key(g[i - 1]), b = key(g[i]), pa = nodes.get(a), pb = nodes.get(b), w = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / 10 * f;
      adj.get(a).push([b, w]); adj.get(b).push([a, w]);
      noms.set(a + '|' + b, nom); noms.set(b + '|' + a, nom);
    }
  }
  const proche = (la, lo, principal) => { const q = P(la, lo); let best = null, bd = 1e18; for (const [k, p] of nodes) { if (adj.get(k).length < 2 || (principal && !princ.has(k))) continue; const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; if (d < bd) { bd = d; best = k; } } return best; };
  function dijkstra(src, dst) {
    const dist = new Map([[src, 0]]), prev = new Map(), heap = [[0, src]];
    const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) { const [d, u] = pop(); if (u === dst) break; if (d > (dist.get(u) ?? Infinity)) continue; for (const [v, w] of adj.get(u)) { const nd = d + w; if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); push([nd, v]); } } }
    const path = []; let u = dst; if (!prev.has(dst) && src !== dst) return null; while (u !== undefined) { path.push(u); u = prev.get(u); } return path.reverse();
  }
  // [nom, lat, lon, texte] = arrêt ; [null, lat, lon] = point de passage
  const DEF = [
    { id: 'centre', nom: 'Le cœur de Cotonou', veh: 'zem', etapes: [
      ["Étoile Rouge", 6.3702, 2.4100, "Le grand carrefour où se rejoignent cinq voies, autour du monument à l'étoile rouge."],
      [null, 6.3620, 2.4223], // boulevard Saint-Michel
      ["Dantokpa", 6.3705, 2.4343, "Le plus grand marché à ciel ouvert d'Afrique de l'Ouest, au bord de la lagune."],
      ["Missèbo", 6.3650, 2.4346, "Le marché des tissus et de la friperie, juste au sud de Dantokpa."],
      ["Zongo", 6.3571, 2.4268, "Le quartier de la grande mosquée aux deux minarets blancs."],
      [null, 6.3527, 2.4267], // tour BCEAO
      ["Ganhi", 6.3563, 2.4386, "Les banques, les commerces et la cathédrale Notre-Dame, rayée de rouge et de blanc."],
      [null, 6.3594, 2.4404], // pont sur la lagune
      ["Akpakpa", 6.3661, 2.4558, "La rive est de la lagune, reliée au centre par trois ponts."]] },
    { id: 'marina', nom: 'Sur la Marina', veh: 'zem', etapes: [
      ["Haie Vive", 6.3536, 2.3975, "Restaurants, maquis et terrasses : c'est là que Cotonou sort le soir."],
      [null, 6.3523, 2.3861], // rond-point de l'aéroport
      ["Erevan", 6.3502, 2.3875, "Le carrefour de la statue de Bio Guéra et du grand magasin Erevan."],
      [null, 6.3505, 2.3945], // Sofitel
      ["Palais des Congrès", 6.3500, 2.4050, "Les tambours blancs inspirés des tata somba, ouverts en 2003."],
      [null, 6.3497, 2.4075], // Amazone
      ["Palais de la Marina", 6.3500, 2.4100, "La présidence de la République, face à l'océan."],
      [null, 6.3527, 2.4267], // tour BCEAO
      ["Ganhi", 6.3563, 2.4386, "Les banques, les commerces et la cathédrale Notre-Dame de Miséricorde."]] },
    { id: 'calavi', nom: 'Calavi – Godomey', veh: 'tokpa', etapes: [
      ["Carrefour Kpota", 6.4458, 2.3540, "Le grand carrefour d'Abomey-Calavi, d'où partent les pirogues pour Ganvié."],
      ["UAC", 6.4136, 2.3420, "L'Université d'Abomey-Calavi, la plus grande du pays, née en 1970."],
      ["IITA", 6.4055, 2.3418, "L'institut international d'agriculture tropicale et sa forêt."],
      ["Échangeur de Godomey", 6.3902, 2.3545, "La porte ouest de Cotonou. Depuis 2021, les tokpa-tokpa s'arrêtent ici."]] },
    { id: 'plage', nom: 'De la plage au stade', veh: 'zem', etapes: [
      ["Plage de Fidjrossè", 6.3487, 2.3655, "La plage de l'ouest, le long de la route des Pêches."],
      ["Fidjrossè", 6.3555, 2.3700, "Le quartier des buvettes et des cocotiers, entre l'aéroport et la mer."],
      ["Agla", 6.3758, 2.3690, "Un grand quartier résidentiel du nord-ouest de la ville."],
      ["Stade de l'Amitié", 6.3842, 2.3803, "Le stade Général Mathieu Kérékou, à Kouhounou."],
      ["Étoile Rouge", 6.3712, 2.4090, "Le rond-point du monument, au cœur de la ville."]] },
    { id: 'ouidah', nom: 'Ouidah · Route des Esclaves', veh: 'zem', etapes: [
      ["Temple des Pythons", 6.35997, 2.08504, "Le temple de Dangbé, le dieu python, face à la basilique de l'Immaculée Conception."],
      ["Place Chacha", 6.35647, 2.08501, "L'ancienne place des enchères, où commence la Route des Esclaves, longue de près de 4 km jusqu'à la mer."],
      ["Arbre de l'Oubli", 6.34810, 2.08688, "Les captifs devaient en faire le tour pour oublier leur pays : neuf fois pour les hommes, sept fois pour les femmes."],
      ["Zoungbodji", 6.33984, 2.08938, "Le mémorial de la fosse commune et l'Arbre du Retour, dont on faisait le tour pour que l'âme revienne un jour."],
      ["Porte du Non-Retour", 6.32414, 2.08918, "Le mémorial face à l'océan, au bout de la Route des Esclaves. À côté, l'Arène de Ouidah, celle des Vodun Days."]] },
    { id: 'corniche', nom: 'Ganhi – Corniche Est', veh: 'zem', etapes: [
      ["Ganhi", 6.3563, 2.4386, "Le centre des affaires, au pied de la cathédrale."],
      [null, 6.3594, 2.4404], // pont sur la lagune
      ["Akpakpa", 6.3661, 2.4558, "La rive est, ses marchés et ses ateliers."],
      ["Corniche Est", 6.3554, 2.4508, "La promenade au bord de l'Atlantique, sa piste de jogging et ses cocotiers."],
      ["Donaten", 6.3610, 2.4700, "Le bord de mer d'Akpakpa et ses nouvelles villas."]] },
  ];
  const PROPRE = n => n && !/^(Rue|Ruelle|Von)\s*[\d.]+/i.test(n) && !/^\d/.test(n);
  for (const L of DEF) {
    const ks = L.etapes.map(a => proche(a[1], a[2], true));
    let path = [], ok = true; const idx = [0];
    for (let i = 1; i < ks.length; i++) { const p = dijkstra(ks[i - 1], ks[i]); if (!p) { ok = false; break; } path = path.length ? path.concat(p.slice(1)) : p; idx.push(path.length - 1); }
    if (!ok) { console.log('ligne impossible', L.id); continue; }
    const pts = path.map(k => nodes.get(k));
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) / 10);
    // Noms de rues : tronçons nommés de plus de 120 m.
    const rues = []; let cur = null;
    for (let i = 1; i < path.length; i++) {
      const n = noms.get(path[i - 1] + '|' + path[i]) || '';
      if (!cur || cur.nom !== n) { cur = { nom: n, i0: i - 1, l: 0 }; rues.push(cur); }
      cur.l += cum[i] - cum[i - 1];
    }
    const legs = rues.filter(r => PROPRE(r.nom) && r.l > 120).map(r => ({ x: Math.round(pts[r.i0][0]) / 10, z: Math.round(pts[r.i0][1]) / 10, nom: r.nom }));
    const legs2 = legs.filter((r, i) => i === 0 || r.nom !== legs[i - 1].nom);
    // Commerces et services nommés à moins de 55 m du trajet.
    const TYPE = t => {
      const a = t.amenity, s = t.shop;
      if (a === 'pharmacy' || t.healthcare === 'pharmacy') return 'pharmacie';
      if (a === 'bank' || a === 'atm' || a === 'bureau_de_change') return 'banque';
      if (a === 'fuel') return 'station';
      if (t.tourism === 'hotel' || t.tourism === 'guest_house' || t.tourism === 'apartment') return 'hotel';
      if (/restaurant|fast_food|food_court|cafe/.test(a || '')) return 'restaurant';
      if (/bar|pub|nightclub/.test(a || '')) return 'bar';
      if (/school|college|university|kindergarten/.test(a || '')) return 'ecole';
      if (a === 'place_of_worship') return t.religion === 'muslim' ? 'mosquee' : 'eglise';
      if (/clinic|hospital|doctors|dentist/.test(a || '') || t.healthcare) return 'sante';
      if (/supermarket|convenience|mall|department_store/.test(s || '')) return 'supermarche';
      if (/hairdresser|beauty/.test(s || '')) return 'coiffure';
      if (/clothes|boutique|shoes|fabric|tailor|bag/.test(s || '') || t.craft === 'tailor') return 'mode';
      if (/mobile_phone|electronics|computer|telecommunication/.test(s || '') || t.office === 'telecommunication') return 'telephone';
      if (/car_repair|tyres|car|motorcycle|car_parts/.test(s || '') || a === 'car_wash') return 'garage';
      if (a === 'post_office') return 'poste';
      if (a === 'police') return 'police';
      if (a === 'marketplace') return 'marche';
      if (a === 'bus_station') return 'gare';
      if (/hardware|doityourself/.test(s || '')) return 'quincaillerie';
      if (t.office) return 'bureau';
      if (s) return 'boutique';
      return null;
    };
    const proches = [];
    for (const e of [...load('commerces'), ...load('commerces_ouidah')]) {
      const c = e.center || e; if (!c.lat) continue;
      const ty = TYPE(e.tags); if (!ty || e.tags.name.length > 48) continue;
      const q = P(c.lat, c.lon);
      let bd = 1e12; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / l2)); bd = Math.min(bd, (a[0] + dx * t - q[0]) ** 2 + (a[1] + dz * t - q[1]) ** 2); }
      if (bd > 550 * 550) continue;
      if (proches.some(p => p.nom === e.tags.name && Math.hypot(p.x * 10 - q[0], p.z * 10 - q[1]) < 400)) continue;
      proches.push({ x: Math.round(q[0]) / 10, z: Math.round(q[1]) / 10, nom: e.tags.name.trim(), t: ty });
    }
    lignes.push({ id: L.id, nom: L.nom, veh: L.veh, pts: M(pts), rues: legs2, commerces: proches,
      arrets: L.etapes.map((a, i) => a[0] ? { nom: a[0], fait: a[3], s: Math.round(cum[idx[i]]) } : null).filter(Boolean) });
    console.log('ligne', L.id, Math.round(cum[cum.length - 1]), 'm ·', legs2.length, 'rues ·', proches.length, 'commerces ·', legs2.map(r => r.nom).join(' → '));
  }
}
const aeroEls = load('aero');
// ---------- Tombes blanches des cimetières (vues au bord de la lagune) ----------
const tombes = [];
for (const p of polys) if (p.k === KIND.cemetery) {
  const bb = bbox(p.rings[0]); const ang = rand() * 0.2;
  for (let x = bb[0]; x < bb[2]; x += 32) for (let z = bb[1]; z < bb[3]; z += 22) {
    const px = Math.round(x + (rand() - .5) * 8), pz = Math.round(z + (rand() - .5) * 6);
    if (rand() < .12 || !inPoly([px, pz], p.rings) || nearBuilding(px, pz, 5)) continue;
    tombes.push(px, pz, Math.round(ang * 1000));
  }
}
console.log('tombes', tombes.length / 3);

const LMK = {
  etoile: { ring: M(lmRing(264916649)), star: M(lmRing(520665863)) },
  amazone: { place: M(amazonePlace), pt: ptM(6.34895, 2.40755) },
  marina: M(lmRing(272739399)),
  congres: { outer: congresOuter.map(M), inner: congresInner.map(M) },
  cathedrale: M(lmRing(443576927)),
  stade: { pitch: M(PITCH) },
  dantokpa: marketRings.map(M),
  aero: {
    terminals: [...TERMINALS].map(id => M(lmRing(id))),
    stands: aeroEls.filter(e => e.tags.aeroway === 'parking_position').map(e => ({ ref: e.tags.ref || '', pts: M(e.geometry.map(p => P(p.lat, p.lon))) })),
    runway: M(aeroEls.find(e => e.tags.aeroway === 'runway').geometry.map(p => P(p.lat, p.lon))),
  },
  corniche: { road: M(cornicheRoad), epis },
  port: { cranes: [ptM(6.34817, 2.42046), ptM(6.34838, 2.42308)], mole: [[282, 2775], [798, 2728], [1013, 2710], [1271, 2690]], nord: [[295, 2461], [983, 2405], [1802, 2354]] },
  campus: M(campusUAC),
  ouidah: { porte: [Math.round(PORTE[0]) / 10, Math.round(PORTE[1]) / 10], arene: [Math.round(ARENE[0]) / 10, Math.round(ARENE[1]) / 10] },
  detailles: Object.fromEntries(Object.entries(ringsDetailles).map(([k, r]) => [k, M(r)])),
  marinaLieux: MAR.size ? {
    mtn: M(marRing(418092830)), mtnEnceinte: marRing(418092822) && M(marRing(418092822)), nigeria: M(marRing(418092848)),
    golden: M(marRing(418199686)), novotel: [418199685, 418199703, 418199726, 824870670].map(marRing).filter(Boolean).map(M), ibis: M(marRing(418199684)),
    novotelEnceinte: marRing(824888822) && M(marRing(824888822)),
    cite: { zone: M(marRing(1475569343)), bats: CITE_BATIS.slice(0, 10).map(marRing).filter(Boolean).map(M), parking: marRing(1475569336) && M(marRing(1475569336)) },
    jardin: {
      ring: M(marRing(1475569350)),
      pelouses: [...MAR.values()].filter(e => e.tags?.landuse === 'grass' && e.geometry).map(e => M(openRing(e.geometry.map(p => P(p.lat, p.lon))))),
      allees: [...MAR.values()].filter(e => /footway|path/.test(e.tags?.highway || '') && e.geometry).map(e => M(e.geometry.map(p => P(p.lat, p.lon)))),
    },
    usa: ZONES_MARINA.usa ? M(ZONES_MARINA.usa) : null,
    bceaoTour: ringsMarina.bceaoTour ? M(ringsMarina.bceaoTour) : null,
    agl: ringsMarina.agl ? M(ringsMarina.agl) : null,
    // Mur du port (OSM 825868103, 823394372, 823394373, 822615529), côté boulevard : fresques.
    murPort: fs.existsSync('osm/mur_port.json') ? M(JSON.parse(fs.readFileSync('osm/mur_port.json', 'utf8')).map(([la, lo]) => P(la, lo))) : null,
  } : null,
  semeOne: semeRing ? M(semeRing) : null,
  lignes,
  marcheFlottant: globalThis.MARCHE_FLOTTANT ? [Math.round(globalThis.MARCHE_FLOTTANT[0]) / 10, Math.round(globalThis.MARCHE_FLOTTANT[1]) / 10] : null,
};
console.log('maisons sur pilotis', G.length / 6, 'corniche', cornicheRoad.length, 'pts', epis.length, 'épis');

const out = { v: 3, lat0: LAT0, lon0: LON0, B, R, S, G, palms, containers, boats, trees, acadjas, hyacinths, market, beach, tombes, L: LMK };
const json = JSON.stringify(out);
const gz = zlib.gzipSync(json, { level: 9 });
fs.mkdirSync('public/donnees', { recursive: true });
fs.writeFileSync('public/donnees/cotonou.json.gz', gz);
console.log('JSON', (json.length / 1e6).toFixed(2), 'Mo · gzip', (gz.length / 1e6).toFixed(2), 'Mo · base64', (gz.length * 4 / 3 / 1e6).toFixed(2), 'Mo');
