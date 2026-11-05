import * as THREE from 'three';
import { $, LITE } from './base.js';
import { son } from './audio.js';
import { vibrer } from './manette.js';
import { feuDevant } from './regles.js';
import { texteToile } from './lieux.js';
import { ZEMS_3D, matVeh, partsZem } from './vehicules.js';
import { mergeColored } from './ville.js';
import { JEU, LANE, NUMERO_DOS, fmtF, latJeu, limiteVirage, pose, sauver, toast } from './jeu.js';

// ---------- Zém Run : la course de motos ----------
// « Pourquoi pas, dans Zém Run, on ajoute les courses à moto : toi et des motos déjà là, vous faites des courses, on
// verra si tu gagnes ou s'il te bat » (Murielle, 05/11). Sur le début d'une ligne (1,8 km environ), le joueur part au
// milieu de quatre zémidjans conduits par le jeu, chacun avec son nom et sa façon de rouler. Pas de clients : la vitesse.
// Les rivales roulent sur le même chemin que lui (abscisse `s`, écart latéral `lat`, comme les obstacles de jeu.js) :
// elles freinent dans les virages, s'arrêtent au feu rouge, changent de file devant un obstacle, sautent les trous,
// tombent quand elles le prennent de plein fouet, et ne traversent ni le joueur ni les autres. Un peu d'élastique garde
// la course serrée ; chaque victoire les rend un peu plus fortes.

const DISTANCE = 1800; // m, la longueur d'une course
const PRIX = [1500, 800, 400]; // F, aux trois premières places
const LIGNES = ['marina', 'corniche', 'centre', 'plage'];
const STYLES = [
  // vmax en m/s (le zém du joueur : 25), virage : × la vitesse de virage prudente, reflexe : s d'anticipation,
  // erreur : la part des obstacles qu'elle ne voit pas venir, bloque : elle se met devant le joueur qui la serre.
  { nom: 'Koffi', titre: 'la fusée', couleur: '#e53935', numero: '0007', vmax: 25.6, accel: 5.4, virage: 1.14, reflexe: .7, erreur: .32, saute: true },
  { nom: 'Sèna', titre: 'la maligne', couleur: '#8e24aa', numero: '2412', vmax: 24.4, accel: 4.8, virage: 1.02, reflexe: 1, erreur: .12, saute: true, bloque: true },
  { nom: 'Fifamè', titre: 'la prudente', couleur: '#1e88e5', numero: '1960', vmax: 23.4, accel: 4.3, virage: .9, reflexe: 1.45, erreur: 0, saute: false },
  { nom: 'Tonton Codjo', titre: 'le vieux zém', couleur: '#2e7d32', numero: '0001', vmax: 24, accel: 4.1, virage: 1.06, reflexe: 1.2, erreur: .05, saute: true },
];
const LONG = 2.1, LARG = .75; // la moto (VEH.zem)

/** Les pistes : le début de chaque ligne de zém, jusqu'à l'arrêt le plus proche de 1,8 km. */
export function pistesCourse(lignes) {
  return LIGNES.map(id => lignes.find(l => l.id === id && (l.veh || 'zem') === 'zem')).filter(Boolean).map(L => {
    const tot = L.arrets[L.arrets.length - 1].s, proche = L.arrets.slice(1).reduce((m, a) => (Math.abs(a.s - DISTANCE) < Math.abs(m.s - DISTANCE) ? a : m), { s: Infinity });
    const fin = Math.abs(proche.s - DISTANCE) < 400 ? proche : { nom: 'Ligne d’arrivée', s: Math.min(tot, DISTANCE) };
    return { ...L, id: `course-${L.id}`, nom: `Course · ${L.nom}`, ligneDe: L.nom, course: true, pts: morceauPts(L.pts, fin.s), arrets: [L.arrets[0], { ...fin, s: fin.s }] };
  });
}
function morceauPts(pts, s1) {
  const out = [pts[0]]; let cum = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
    if (cum + l >= s1) { const t = (s1 - cum) / l; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); break; }
    out.push(b); cum += l;
  }
  return out;
}
/** Dans le menu de Zém Run : la carte des courses, une pastille par piste. */
export function menuCourses(el, partir) {
  if (!JEU.courses?.length) return;
  const v = JEU.prog?.victoires || 0, c = document.createElement('div'); c.className = 'jm-ligne jm-groupe jm-course';
  c.innerHTML = `<span class="jm-veh zem">Zém</span><b>Course de motos</b><span class="jm-meta">Toi contre 4 zémidjans · 1,8 km · le premier arrivé gagne ${fmtF(PRIX[0])}</span><div class="jm-etapes jm-pistes" role="group"></div><small class="jm-etape-txt">${v ? `${v} victoire${v > 1 ? 's' : ''} : les rivales sont plus fortes` : 'Koffi, Sèna, Fifamè et Tonton Codjo t’attendent'}</small>`;
  const rang = c.querySelector('.jm-pistes');
  for (const L of JEU.courses) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = L.ligneDe.replace(/^(Sur la |Sur le |La |Le )/, '').replace(/^./, m => m.toUpperCase());
    b.title = `${L.arrets[0].nom} → ${L.arrets[1].nom}`; b.classList.toggle('fait', !!JEU.meilleur[L.id]);
    b.addEventListener('click', () => partir(L)); rang.appendChild(b);
  }
  el.prepend(c);
}

// ---------- La course ----------
/** Appelé par lancerLigne pour une piste de course. */
export function nouvelleCourse() { return { rivaux: [], depart: 0, arrivees: [], niveau: Math.min(6, JEU.prog?.victoires || 0), dit: {} }; }
/** La grille de départ (le joueur au milieu de la seconde ligne) et le compte à rebours. */
export function departCourse(st) {
  const K = JEU.course, C = JEU.chemin; K.rivaux.forEach(r => JEU.decor.remove(r.mesh)); K.rivaux = [];
  const places = [[7, -1], [7, 1], [2.6, -1], [2.6, 1]], f = 1 + K.niveau * .016;
  STYLES.forEach((S, i) => {
    const mesh = moto(S), [s, file] = places[i];
    JEU.decor.add(mesh);
    K.rivaux.push({ ...S, vmax: S.vmax * f, erreur: S.erreur * Math.max(.2, 1 - K.niveau * .12), s, lat: file * LANE, latCible: file * LANE, file, v: 0, y: 0, vy: 0, chute: 0, mesh, vus: new WeakSet(), bloqueT: 0, fini: null });
  });
  st.s = 2.6; st.file = 0; st.lat = 0; st.service = 3.6; K.depart = st.temps + 3.6;
  ligneArrivee(C);
  for (const [t, txt] of [[0, '3'], [1, '2'], [2, '1'], [3, 'Partez !']]) setTimeout(() => { if (JEU.course !== K || !JEU.actif) return; toast(txt, t === 3 ? 1.2 : .9, t === 3 ? 'bien' : ''); son(t === 3 ? 'piece' : 'arret'); if (t === 3) vibrer('piece'); }, 400 + t * 1000);
  barreRivaux(true);
}
function moto(S) {
  const g = new THREE.Group();
  const m = LITE && ZEMS_3D.motoLod ? new THREE.Mesh(ZEMS_3D.motoLod.geo, ZEMS_3D.motoLod.mat) : ZEMS_3D.moto ? ZEMS_3D.moto.clone() : new THREE.Mesh(mergeColored(partsZem({ chemise: S.couleur, passager: false })), matVeh);
  m.castShadow = !LITE; g.add(m);
  const dos = new THREE.Mesh(new THREE.PlaneGeometry(.3, .19), new THREE.MeshBasicMaterial({ map: texteToile([S.numero], 256, 160, S.couleur, '#ffffff', '900 120px system-ui, sans-serif') }));
  dos.rotation.y = -Math.PI / 2; dos.position.set(NUMERO_DOS.x, NUMERO_DOS.y, 0); g.add(dos); // son numéro au dos, dans sa couleur
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 72; const c = cv.getContext('2d');
  c.fillStyle = S.couleur; c.beginPath(); c.roundRect(4, 6, 312, 60, 30); c.fill();
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '800 30px system-ui, sans-serif'; c.fillText(S.nom, 160, 38, 296);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  // Une taille fixe à l'écran : à la grille de départ, à deux mètres de la caméra, les noms couvraient la moitié de l'image.
  const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false })); e.scale.set(.15, .034, 1); e.position.y = 2.3; e.renderOrder = 30; g.add(e);
  return g;
}
/** L'arche d'arrivée, en damier, en travers de la route. */
function ligneArrivee(C) {
  const s = C.L - 3, q = pose(C, s, 0, { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 }), g = new THREE.Group(), l = 2 * LANE + 3.4;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const c = cv.getContext('2d');
  for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#fff'; c.fillRect(i * 16, j * 16, 16, 16); c.fillRect(i * 16, 64 + j * 16, 16, 16); }
  c.fillStyle = '#f2c21b'; c.fillRect(0, 32, 512, 32); c.fillStyle = '#111'; c.font = '900 28px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ARRIVÉE', 256, 49);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const banniere = new THREE.Mesh(new THREE.PlaneGeometry(l, 1.1), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); banniere.position.y = 4.4; g.add(banniere);
  const poteau = new THREE.MeshLambertMaterial({ color: '#d9d4c7' });
  for (const k of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.12, .14, 5, 8), poteau); p.position.set(k * l / 2, 2.5, 0); g.add(p); }
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(l, .9), new THREE.MeshBasicMaterial({ map: t, polygonOffset: true, polygonOffsetFactor: -2 })); sol.rotation.x = -Math.PI / 2; sol.position.y = .04; g.add(sol);
  g.position.set(q.x, q.y, q.z); g.rotation.y = q.a - Math.PI / 2; JEU.decor.add(g); // face à ceux qui arrivent (de l'autre côté, « ARRIVÉE » se lisait à l'envers)
}

/** À chaque image, après le joueur et les obstacles (jeu.js, majJeu). */
export function majCourse(st, C, dt) {
  const K = JEU.course; if (!K) return;
  const parti = st.temps >= K.depart, latJ = st.latM ?? st.lat;
  for (const r of K.rivaux) {
    if (r.fini !== null) { r.latCible = (r.lat >= 0 ? 2.2 : -2.2) * LANE; r.v = Math.max(0, r.v - 6 * dt); avancer(r, C, dt); continue; } // arrivée : elle se range sur le bas-côté (garée sur la ligne, elle bloquait celles de derrière)
    if (!parti) { avancer(r, C, 0); continue; }
    if (r.chute > 0) { r.chute -= dt; r.v = Math.max(0, r.v - 14 * dt); avancer(r, C, dt); continue; }
    // La vitesse voulue : son maximum, les virages, l'élastique (loin devant, elle souffle ; loin derrière, elle force).
    const ecart = r.s - st.s, elastique = ecart > 50 ? Math.max(.9, 1 - (ecart - 50) / 900) : ecart < -50 ? Math.min(1.1, 1 + (-ecart - 50) / 700) : 1;
    let voulue = Math.min(r.vmax * elastique, limiteVirage(C, r.s) * r.virage);
    const feu = feuDevant(r.s, 70, st.temps); // au rouge (et à l'orange de loin) : on s'arrête avant la ligne, comme le joueur
    if (feu && (feu.etat === 'rouge' || (feu.etat === 'orange' && feu.s - r.s > 25))) voulue = Math.min(voulue, Math.sqrt(2 * 8 * Math.max(0, feu.s - 4 - r.s)));
    voulue = Math.min(voulue, eviter(r, st, C, latJ, K));
    r.coince = r.v < 1 && voulue < 2 ? (r.coince || 0) + dt : 0; // arrêtée derrière un obstacle qui ne bouge pas
    if (Math.abs(r.lat) > LANE * 1.5 && !r.coince) r.latCible = Math.sign(r.lat) * LANE; // sortie du bas-côté : elle revient sur la route
    r.v = r.v < voulue ? Math.min(voulue, r.v + r.accel * dt * (r.v < 6 ? 1.5 : 1)) : Math.max(voulue, r.v - 16 * dt);
    if (r.bloque && st.service <= 0) bloquer(r, st, dt);
    avancer(r, C, dt);
    chocs(r, st, C);
    if (r.s >= C.L - 3) { r.fini = st.temps - K.depart; K.arrivees.push(r); if (K.arrivees.length === 1 && st.s < C.L - 3) toast(`${r.nom} a gagné… Termine la course !`, 2, 'mal'); }
  }
  entreRivaux(K.rivaux);
  hud(st, C, K);
}
/** La file la plus sûre et la vitesse permise par ce qu'il y a devant (obstacles, joueur, autres rivales). */
function eviter(r, st, C, latJ, K) {
  const voit = 8 + r.v * r.reflexe; let limite = 99, gene = null;
  const devant = (lat, d0, d1, sauf) => { // ce qui occupe la file `lat` entre s + d0 et s + d1 : [distance, vitesse, sautable]
    let best = null;
    for (const o of JEU.objets) {
      if (o.type === 'jeton' || o === sauf) continue;
      const d = o.s - r.s; if (d < d0 || d > d1) continue;
      if (Math.abs((o.latM ?? o.lat) - lat) > (o.T.larg + LARG) / 2 + .35) continue;
      if (!best || d < best[0]) best = [d, o.T.v[1] ? o.v : 0, !!o.T.saut, o];
    }
    const dj = st.s - r.s; if (dj > d0 && dj < d1 && Math.abs(latJ - lat) < LARG + .35 && (!best || dj < best[0])) best = [dj, Math.max(0, st.v), false, null];
    for (const q of K.rivaux) { if (q === r || q.fini !== null) continue; const d = q.s - r.s; if (d > d0 && d < d1 && Math.abs(q.lat - lat) < LARG + .35 && (!best || d < best[0])) best = [d, q.v, false, null]; }
    return best;
  };
  gene = devant(r.lat, -1, voit);
  if (gene) {
    const [d, vo, sautable, o] = gene;
    // Elle ne l'a pas vu venir (une fois par obstacle) : elle fonce dedans.
    if (o && !r.vus.has(o)) { r.vus.add(o); if (Math.random() < r.erreur) { o.surprise = o.surprise || new WeakSet(); o.surprise.add(r); } }
    if (o?.surprise?.has(r)) return 99;
    if (sautable && (r.saute || r.coince > 4) && d < 6 && r.y === 0 && (r.v > 7 || r.coince > 4)) { r.vy = 7.2; return 99; } // elle saute le trou (même la prudente, coincée)
    // Une file libre à côté ? On change (la plus proche du milieu d'abord).
    if (r.latCible === r.lat || Math.abs(r.latCible - r.lat) < .05) {
      const files = (r.coince > 2 ? [-2, -1, 0, 1, 2] : [-1, 0, 1]).map(f => f * LANE) // coincée : le bas-côté aussi.filter(l => Math.abs(l - r.lat) > .1).sort((a, b) => Math.abs(a - r.lat) - Math.abs(b - r.lat) || Math.abs(a) - Math.abs(b));
      for (const l of files) if (!devant(l, -3.5, voit + 6) && libreACote(r, l, st, latJ, K)) { r.latCible = l; return 99; }
    }
    limite = vo + Math.max(0, d - LONG - 1.5) * 1.2; // derrière lui : on le suit
  }
  return limite;
}
const libreACote = (r, l, st, latJ, K) => !(Math.abs(st.s - r.s) < LONG + 1.2 && Math.abs(latJ - l) < LARG + .4) && !K.rivaux.some(q => q !== r && q.fini === null && Math.abs(q.s - r.s) < LONG + 1.2 && Math.abs(q.lat - l) < LARG + .4);
/** Sèna se met devant le joueur qui la colle de près, pour l'empêcher de doubler. */
function bloquer(r, st, dt) {
  r.bloqueT -= dt; const d = r.s - st.s, file = Math.round((st.latM ?? st.lat) / LANE);
  if (r.bloqueT > 0 || d < 3 || d > 18 || Math.abs(file) > 1 || Math.abs(file * LANE - r.lat) < .1 || Math.random() > .5) return;
  r.bloqueT = 3.5; r.latCible = file * LANE;
  if (!JEU.course.dit[r.nom]) { JEU.course.dit[r.nom] = true; toast(`${r.nom} te barre la route !`, 1.4); }
}
function avancer(r, C, dt) {
  const e = r.latCible - r.lat; r.lat += Math.sign(e) * Math.min(Math.abs(e), 3.4 * dt);
  if (r.y > 0 || r.vy > 0) { r.vy -= 24 * dt; r.y = Math.max(0, r.y + r.vy * dt); if (r.y === 0) r.vy = 0; }
  r.s = Math.min(C.L - .5, r.s + r.v * dt);
  const latM = r.latM = latJeu(C, r.s, r.lat, LARG / 2 + .25), q = pose(C, r.s, latM, { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 });
  r.mesh.position.set(q.x, q.y + r.y, q.z); r.mesh.rotation.set(0, q.a, 0);
  r.mesh.rotateX(Math.max(-.3, Math.min(.3, -e * .12))); // elle penche en changeant de file
  if (r.chute > 0) r.mesh.rotateX(Math.sin(r.chute * 9) * .25); // elle vacille après un choc
}
/** Ses chocs : un trou la freine, un véhicule ou un obstacle pris de face la fait tomber ; le joueur, d'égal à égal. */
function chocs(r, st, C) {
  for (const o of JEU.objets) {
    if (o.type === 'jeton') continue;
    const ds = o.s - r.s, sepL = (o.T.long + LONG) / 2, sepT = (o.T.larg + LARG) / 2;
    if (Math.abs(ds) >= sepL || Math.abs((o.latM ?? o.lat) - r.latM) >= sepT) continue;
    if (o.T.saut && r.y > .55) continue;
    if (o.type === 'trou') { if (!(o.trous ||= new WeakSet()).has(r)) { o.trous.add(r); r.v *= .5; } continue; }
    o.surprise?.delete(r); // au contact, elle l'a vu : elle cherche à passer (sinon elle poussait contre lui sans fin)
    if (ds > 0) { // devant elle
      if (r.v - (o.T.v[1] ? o.v : 0) > 4) { r.chute = 1.3; r.v *= .15; if (Math.abs(r.s - st.s) < 60) toast(`${r.nom} est tombée !`, 1.2, 'bien'); }
      r.s = o.s - sepL - .05; r.v = Math.min(r.v, o.T.v[1] ? o.v : 0);
    }
  }
  // Avec le joueur : celui de derrière bute contre celui de devant ; de côté, on se bouscule.
  const ds = st.s - r.s, ecart = (st.latM ?? st.lat) - r.latM, sepL = LONG + .1, sepT = LARG + .1;
  if (Math.abs(ds) < sepL && Math.abs(ecart) < sepT) {
    if (sepT - Math.abs(ecart) < (sepL - Math.abs(ds)) * .6) { // de côté
      const cote = Math.sign(ecart) || 1;
      st.file = THREE.MathUtils.clamp(Math.round(st.lat / LANE) + cote, -2, 2); r.latCible = THREE.MathUtils.clamp(Math.round(r.lat / LANE) - cote, -1, 1) * LANE;
      if (st.temps - (st.bousculeT ?? -9) > 1.5) { st.bousculeT = st.temps; st.v *= .85; st.secousse = .3; son('bosse'); vibrer('choc'); toast(`${r.nom} te bouscule !`, 1.1, 'mal'); }
    } else if (ds > 0) { r.s = st.s - sepL - .02; r.v = Math.min(r.v, Math.max(0, st.v)); } // elle arrive derrière : elle freine
    else { st.s = r.s - sepL - .02; st.v = Math.min(st.v, r.v); } // le joueur bute contre elle
  }
}
/** Deux rivales ne se traversent pas : celle de derrière reste derrière. */
function entreRivaux(R) {
  for (const a of R) for (const b of R) {
    if (a === b || a.fini !== null || b.fini !== null) continue;
    const ds = b.s - a.s; if (ds <= 0 || ds >= LONG + .1 || Math.abs(b.lat - a.lat) >= LARG + .1) continue;
    a.s = b.s - LONG - .12; a.v = Math.min(a.v, b.v);
  }
}

// ---------- Le classement en direct ----------
const RANGS = ['1er', '2e', '3e', '4e', '5e'], ORD = n => RANGS[n - 1] || `${n}e`; // en toutes lettres : l'anglais les traduit un par un (1st, 2nd…)
function classement(st, K) {
  const tous = [...K.arrivees.map(r => ({ r, fini: r.fini })), ...K.rivaux.filter(r => r.fini === null).map(r => ({ r, s: r.s })), { moi: true, s: st.s, fini: st.finCourse ?? null }];
  return tous.sort((a, b) => (a.fini !== null && a.fini !== undefined ? a.fini : 1e6 - a.s) - (b.fini !== null && b.fini !== undefined ? b.fini : 1e6 - b.s));
}
function hud(st, C, K) {
  const cl = classement(st, K), i = cl.findIndex(x => x.moi), place = i + 1;
  const devant = cl[i - 1], derriere = cl[i + 1], m = x => Math.max(1, Math.round(Math.abs((x.r.fini !== null ? C.L : x.r.s) - st.s)));
  const txt = st.temps < K.depart ? 'Prêt ? La course part dans un instant' : `${ORD(place)} sur 5 · ${devant ? `${devant.r.nom} à ${m(devant)} m devant` : derriere ? `${derriere.r.nom} à ${m(derriere)} m derrière` : ''}`;
  const el = $('#jhProchain'); if (el && el.textContent !== txt) { el.textContent = txt; } el?.classList.toggle('alerte', place > 1 && !!devant && m(devant) < 12);
  $('#jhDemi')?.setAttribute('hidden', '');
  barreRivaux(false, C);
}
/** Les rivales sur la barre de progression : un point de leur couleur. */
function barreRivaux(creer, C = JEU.chemin) {
  const b = $('#jhProg')?.parentElement; if (!b) return;
  let box = b.querySelector('.jh-rivaux');
  if (creer) { box?.remove(); box = document.createElement('div'); box.className = 'jh-rivaux'; box.setAttribute('aria-hidden', 'true'); for (const r of JEU.course.rivaux) { const p = document.createElement('i'); p.style.background = r.couleur; box.appendChild(p); } b.appendChild(box); return; }
  if (!box) return;
  JEU.course.rivaux.forEach((r, k) => { const p = box.children[k]; if (p) p.style.left = `${Math.min(100, r.s / C.L * 100).toFixed(1)}%`; });
}
export function retirerBarreRivaux() { $('#jhProg')?.parentElement?.querySelector('.jh-rivaux')?.remove(); }

// ---------- L'arrivée ----------
const duree = t => `${Math.floor(t / 60)} min ${String(Math.floor(t % 60)).padStart(2, '0')} s`;
/** Le bilan d'une course (jeu.js, finJeu) : le classement, le prix, et la course suivante plus dure si l'on a gagné. */
export function finCourse(arrive) {
  const st = JEU.etat, K = JEU.course, C = JEU.chemin, L = JEU.ligne, el = $('#jeuFin');
  if (arrive) st.finCourse = st.temps - K.depart;
  const cl = classement(st, K), place = cl.findIndex(x => x.moi) + 1, gagne = arrive ? (PRIX[place - 1] || 0) : 0, total = gagne + Math.max(0, st.argent);
  el.querySelector('h2').textContent = !arrive ? 'Course abandonnée' : place === 1 ? 'Tu as gagné la course !' : `${ORD(place)} place`;
  el.querySelector('.jf-sous').textContent = `${L.nom} : ${L.arretsJ[0].nom} → ${L.arretsJ[L.arretsJ.length - 1].nom}`;
  const lignes = cl.map((x, k) => {
    const t = x.moi ? (arrive ? duree(st.finCourse) : 'abandon') : x.r.fini !== null ? duree(x.r.fini) : `à ${Math.max(1, Math.round(C.L - x.r.s))} m de l’arrivée`;
    return `<div${x.moi ? ' class="jf-moi"' : ''}><small>${ORD(k + 1)}</small><b>${x.moi ? 'Toi' : `${x.r.nom} <em>${x.r.titre}</em>`}</b><span>${t}</span></div>`;
  });
  el.querySelector('.jf-stats').innerHTML = `<div class="jf-classement">${lignes.join('')}</div>`;
  $('#jfDefi').hidden = true; $('#jfMarche').hidden = true; $('#jfSuivante').hidden = true; $('#jfPartager').hidden = true;
  const P = JEU.prog, record = arrive && place === 1 && (!JEU.meilleur[L.id] || st.finCourse < JEU.meilleur[L.id]);
  if (arrive && place === 1) P.victoires = (P.victoires || 0) + 1;
  if (record) JEU.meilleur[L.id] = Math.round(st.finCourse);
  P.cagnotte += total; P.courses = (P.courses || 0) + 1; P.km = (P.km || 0) + st.parcouru / 1000; sauver();
  el.querySelector('.jf-quiz').innerHTML = `<p class="jf-total">${gagne ? `Prix de la ${place === 1 ? '1re' : ORD(place)} place : <b>${fmtF(gagne)}</b>` : arrive ? 'Pas de prix cette fois : il faut finir dans les trois premiers.' : 'Pas de prix : la course n’est pas finie.'}${st.argent > 0 ? `<br><small>+ ${fmtF(st.argent)} ramassés en route</small>` : ''}<br><small>${record ? 'Ton meilleur temps sur cette course ! ' : ''}${place === 1 && arrive ? 'La prochaine fois, les rivales seront plus fortes. ' : ''}Versé dans ta cagnotte (${fmtF(P.cagnotte)}).</small></p>`;
  if (arrive) son(place === 1 ? 'piece' : 'arret');
  retirerBarreRivaux();
  el.hidden = false; $('#jeuHud').hidden = true;
}
