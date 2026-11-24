// ---------- Accidents, état du véhicule et garages (« Vivre à Cotonou ») ----------
// « Je prends la moto, je cogne un truc, accident, la moto ou la voiture a des problèmes, je pars au garage, je répare ça, ou je
// rachète un autre, et je continue la vie » (Murielle, 23/11). Chaque choc abîme le véhicule selon la vitesse (conduite.js
// signale le choc, trajets.js nous passe la vitesse d'avant) ; au-delà de 40 km/h, c'est un accident. Sous 60 %, il fume et
// perd du nerf ; sous 25 %, le moteur tousse et il n'avance plus qu'au pas ; à 0, c'est une épave. Les garages sont ceux de la
// carte (OpenStreetMap, 92 dans la ville) : le mécanicien travaille au bord de la rue, devant son atelier, comme à Cotonou.
// On y fait réparer (prix selon les dégâts), ou l'on rachète un autre véhicule. L'état de son véhicule à soi (acheté ou loué)
// est retenu sur l'appareil, comme sa peinture ; celui d'une voiture empruntée ou volée s'oublie avec elle.
import * as THREE from 'three';
import { bulle, personne } from './discussions.js';
import { K, panneauTexte } from './lieux.js';
import { personnagesPrets } from './personnages.js';
import { chargerRecherche } from './recherche.js';
import { dansBatiment, dansObstacleRue } from './rue.js';
import { scene } from './scene.js';
import { pointDeRoute } from './trajets.js';
import { VIE, depenser } from './vie.js';

const G = { S: null, T: null, ligne: () => { }, choisir: () => { }, liste: null, prop: null, rep: null, fumees: [], fumeeT: 0 };
const CLE = 'kutonu.etatVehicules';
const ETATS = (() => { try { return JSON.parse(localStorage.getItem(CLE) || '{}'); } catch { return {}; } })();
const sauver = () => { try { localStorage.setItem(CLE, JSON.stringify(ETATS)); } catch { } };
const fmtF = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const aMoi = V => !!V && V === G.T?.veh && VIE.data?.vehicule === V.type;
const sansMoteur = V => !V || V.D.pedale;
const nomV = V => (V.D.cache ? 'ta voiture' : 'ta moto');
const Maj = t => t[0].toUpperCase() + t.slice(1);
// Le prix d'un point d'état chez le mécanicien : une moto, une voiture ordinaire, une voiture de luxe.
const TARIF = { moto: 25, zem: 25, roadster: 150, supercar: 150, jetour: 80 };
const tarif = V => TARIF[V.type] ?? (V.D.cache ? 60 : 25);

export function etatDe(V) { if (sansMoteur(V)) return 100; return aMoi(V) ? (ETATS[V.type] ?? 100) : (V.etat ?? 100); }
function fixer(V, e) { e = Math.max(0, Math.min(100, Math.round(e))); if (aMoi(V)) { ETATS[V.type] = e; sauver(); } else V.etat = e; }

/** Appelé par le salon au démarrage : trajets.js appelle ces crochets pendant la conduite. */
export function initGarages(ctx) {
  Object.assign(G, ctx);
  Object.assign(G.T, { surChoc, casse: V => !sansMoteur(V) && etatDe(V) < 25, etatTexte, majEtat, majGarages });
  chargerRecherche().then(d => { G.liste = (d?.lieux || []).filter(l => l[1] === 'garage' && !/lavage|car ?wash/i.test(l[0])).map(([nom, , x, z]) => ({ nom, x, z })); }); // un mécanicien, pas une station de lavage
}

// ---------- Les chocs ----------
function surChoc(V, v0) {
  if (sansMoteur(V) || v0 < 4) return;
  const avant = etatDe(V), perte = Math.min(65, Math.round((v0 - 3.5) * (V.D.cache ? 2.6 : 4))), apres = Math.max(0, avant - perte);
  fixer(V, apres);
  if (v0 > 11) { document.dispatchEvent(new CustomEvent('vibrer', { detail: 'choc' })); G.ligne(`Accident à ${Math.round(v0 * 3.6)} km/h ! ${Maj(nomV(V))} est abîmée : état ${apres} %.${V.D.cache ? '' : ' Tu te relèves, rien de cassé.'}`); }
  if (apres === 0 && avant > 0) G.ligne(`${Maj(nomV(V))} est une épave : elle ne roule plus qu’au pas. Fais-la réparer au garage, ou rachètes-en une autre (« Aller » → « Garage le plus proche »).`);
  else if (avant >= 25 && apres < 25) G.ligne(`Le moteur tousse : ${nomV(V)} n’avance plus qu’au pas. Va au garage (« Aller » → « Garage le plus proche »).`);
  else if (avant >= 60 && apres < 60) G.ligne(`${Maj(nomV(V))} fume et perd du nerf (état ${apres} %) : passe au garage.`);
}
function etatTexte(V) {
  if (sansMoteur(V)) return ''; const e = etatDe(V); if (e >= 100) return '';
  return ` · <b style="color:${e < 25 ? '#ff6b5a' : e < 60 ? '#ffb02e' : '#a6e38a'}">état ${e} %</b>`;
}
// La fumée : une vingtaine de bouffées réutilisées, grises sous 60 %, noires sous 25 %.
const bouffee = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), d = g.createRadialGradient(32, 32, 2, 32, 32, 30); d.addColorStop(0, 'rgba(255,255,255,.9)'); d.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = d; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
function majEtat(V, dt) {
  if (sansMoteur(V)) return;
  const e = etatDe(V);
  if (e < 60 && e >= 25) { V.bonus = -V.D.vmax * .35; V.bonusDegats = true; } else if (V.bonusDegats) { delete V.bonus; delete V.bonusDegats; }
  if (e >= 60) return;
  G.fumeeT -= dt; if (G.fumeeT > 0) return; G.fumeeT = e < 25 ? .07 : .14;
  let f = G.fumees.find(b => b.t <= 0);
  if (!f) { if (G.fumees.length > 28) return; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bouffee, transparent: true, depthWrite: false, opacity: 0 })); scene.add(sp); f = { sp, t: 0 }; G.fumees.push(f); }
  const arr = -(V.D.long || 2) * .5; f.t = 1.6; f.sp.visible = true; f.sp.material.color.set(e < 25 ? '#2b2b2b' : '#9a9a9a');
  f.sp.position.set(V.x + Math.sin(V.cap) * arr, (V.y || 0) + (V.D.cache ? .7 : .6), V.z + Math.cos(V.cap) * arr); f.sp.scale.setScalar(.5);
}

// ---------- Les garages ----------
/** Où le mécanicien travaille : au bord de la rue, devant son atelier (le point de la carte est souvent dans le bâtiment). */
function poste(g) {
  if (g.pose !== undefined) return g.pose;
  let x = g.x, z = g.z; const r = pointDeRoute(g.x, g.z, 0, 40);
  // Depuis la rue vers l'atelier, on s'arrête devant le premier mur (bâtiment ou mur de parcelle), pas derrière.
  if (r) {
    const d = Math.hypot(g.x - r[0], g.z - r[1]) || 1, ux = (g.x - r[0]) / d, uz = (g.z - r[1]) / d; let t = 4;
    for (; t < d; t += .5) if (dansBatiment(r[0] + ux * t, r[1] + uz * t) || dansObstacleRue(r[0] + ux * t, r[1] + uz * t, .4)) break;
    t = Math.max(4, t - 1.8); x = r[0] + ux * t; z = r[1] + uz * t; g.pose = { x, z, cap: Math.atan2(-ux, -uz) };
  }
  else g.pose = { x, z, cap: 0 };
  return g.pose;
}
/** Le garage le plus proche de (x, z) : { nom, x, z, cap } (« Aller » → « Garage le plus proche »). */
export function garageLePlusProche(x, z) {
  if (!G.liste?.length) return null;
  let best = null, bd = Infinity; for (const g of G.liste) { const d = (g.x - x) ** 2 + (g.z - z) ** 2; if (d < bd) { bd = d; best = g; } }
  const p = poste(best); return { nom: best.nom, ...p };
}
function construireAtelier(g) {
  const p = poste(g), grp = new THREE.Group(); grp.name = 'garage-mecanicien'; grp.position.set(p.x, 0, p.z); grp.rotation.y = p.cap; scene.add(grp);
  K.into(grp, () => {
    const bleu = '#1f4f8a', pneu = K.mat('#1b1b1b', { rugosite: .9 });
    for (const x of [-1.6, 1.6]) K.cyl(.06, .06, 2.6, 6, '#6b6f72', x, 1.3, -1.2);
    panneauTexte(['GARAGE · ' + (g.nom.length < 24 ? g.nom.toUpperCase() : 'MÉCANIQUE'), 'Réparation auto · moto'], 3.6, .9, 0, 2.3, -1.15, 0, { fond: bleu, encre: '#ffd23b', px: 1024, py: 256, police: '800 64px "Google Sans", system-ui, sans-serif' });
    for (let k = 0; k < 4; k++) { const t = K.maillage(K.geo('pneuGarage', () => new THREE.TorusGeometry(.3, .12, 8, 16)), pneu, -2.4, .12 + k * .24, .3); t.rotation.x = Math.PI / 2; }
    K.cyl(.3, .3, .9, 14, '#2f6fb0', 2.3, .45, .4); K.boite(1.6, .08, .7, '#8a6a46', 1.4, .85, -.6); for (const [x, z] of [[.7, -.9], [2.1, -.9], [.7, -.3], [2.1, -.3]]) K.boite(.06, .82, .06, '#5a4a3a', x, .41, z);
    K.boite(.5, .25, .25, '#c8382f', 1.2, 1.02, -.6); K.boite(.35, .12, .9, '#c9c9c9', -.6, .07, .9);
  });
  const meca = personnagesPrets() ? personne(7300 + Math.floor(g.x) % 50, { femme: false }) : null;
  if (meca) { meca.position.set(p.x + Math.sin(p.cap) * .6, 0, p.z + Math.cos(p.cap) * .6); meca.rotation.y = p.cap; scene.add(meca); }
  return { g, grp, meca, p };
}
function majGarages(dt) {
  for (const f of G.fumees) { if (f.t <= 0) continue; f.t -= dt; const k = 1 - f.t / 1.6; f.sp.position.y += dt * .9; f.sp.scale.setScalar(.5 + k * 1.6); f.sp.material.opacity = Math.max(0, .55 * (1 - k)); if (f.t <= 0) f.sp.visible = false; }
  const S = G.S; if (!S || !G.liste) return;
  // L'atelier le plus proche, bâti quand on approche (à 90 m) et retiré quand on s'éloigne.
  if (!S.lieu && (G.chercheT = (G.chercheT || 0) - dt) <= 0) {
    G.chercheT = 1;
    let best = null, bd = 90 * 90; for (const g of G.liste) { const d = (g.x - S.x) ** 2 + (g.z - S.z) ** 2; if (d < bd) { bd = d; best = g; } }
    if (G.prop && G.prop.g !== best && (G.prop.p.x - S.x) ** 2 + (G.prop.p.z - S.z) ** 2 > 150 * 150) { scene.remove(G.prop.grp); if (G.prop.meca) { scene.remove(G.prop.meca); G.prop.meca.userData.liberer?.(); } G.prop = null; }
    if (best && G.prop?.g !== best && !G.prop) G.prop = construireAtelier(best);
  }
  const R = G.rep; if (!R) return;
  R.t += dt; if (G.prop?.meca) G.prop.meca.userData.jouer?.('parle');
  if (R.t < R.duree) return;
  fixer(R.V, 100); G.rep = null; if (G.prop?.meca) { G.prop.meca.userData.jouer?.('idle'); bulle(G.prop.meca, 'C’est réparé, elle est comme neuve !', { duree: 3 }); }
  G.ligne(`Réparée ! ${Maj(nomV(R.V))} est comme neuve (état 100 %). Bonne route !`);
}
function reparer(V) {
  const e = etatDe(V), prix = Math.max(500, Math.ceil((100 - e) * tarif(V) / 50) * 50);
  G.choisir(`${Maj(nomV(V))} : état ${e} %`, [
    { texte: `Réparer · ${fmtF(prix)}`, sous: (VIE.data?.argent ?? 0) < prix ? 'Tu n’as pas assez d’argent' : 'Le mécanicien s’y met tout de suite', desactive: (VIE.data?.argent ?? 0) < prix,
      f: async () => { if (!(await depenser(prix, `garage · réparation de ${nomV(V)}`))) return; G.rep = { V, t: 0, duree: 7 }; if (G.prop?.meca) bulle(G.prop.meca, 'Je m’en occupe, patiente un peu…', { duree: 3 }); G.ligne(`Le mécanicien répare ${nomV(V)}… (quelques secondes)`); } },
    { texte: 'Acheter un autre véhicule', sous: 'Il remplace le tien', f: () => document.querySelector('#vhAcheter')?.click() },
  ], { annuler: 'Pas maintenant' });
}
/** Les boutons du garage (salon.js) : près de l'atelier, avec son véhicule à côté (ou dessus, arrêté). */
export function actionsGarages() {
  const S = G.S, T = G.T, P = G.prop; if (!S || !T || !P || S.lieu || G.rep) return [];
  if (Math.hypot(P.p.x - S.x, P.p.z - S.z) > 10) return [];
  const V = T.veh; if (!V || sansMoteur(V) || (T.mode === 'conduit' && Math.abs(V.v) > .5) || Math.hypot(V.x - S.x, V.z - S.z) > 15) return [];
  if (!aMoi(V)) return [{ texte: 'Le mécanicien ne répare que ton véhicule à toi', f: () => G.ligne('Ce véhicule n’est pas à toi : le garage ne répare que le tien.') }];
  const e = etatDe(V);
  return e < 100 ? [{ texte: `Faire réparer ${nomV(V)} · état ${e} %`, f: () => reparer(V) }] : [{ texte: 'Parler au mécanicien', f: () => { if (P.meca) bulle(P.meca, 'Elle roule bien, ta machine ! Reviens si tu cognes.', { duree: 3 }); } }];
}
