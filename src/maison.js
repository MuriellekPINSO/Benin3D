import * as THREE from 'three';
import { bruit, son } from './audio.js';
import { toXZ } from './base.js';
import { personne } from './discussions.js';
import { PLACES, QUARTIERS } from './donnees-lieux.js';
import { INTERIEURS, dansLaPiece, declarerInterieur, etiquette } from './interieurs.js';
import { K, groupeLieu, panneauTexte } from './lieux.js';
import { dansBatiment, surChaussee } from './rue.js';
import { scene } from './scene.js';
import { T, choisir, tenirPlat } from './trajets.js';
import { VIE, depenser } from './vie.js';
import { ROAD_W, roadLines } from './ville.js';

// ---------- Chez soi : la journée commence au lit ----------
// En entrant dans le salon, on se réveille chez soi, couché sous son pagne : la chambre d'une maison en cour
// commune à Akpakpa (Débrouillard), l'appartement de la Haie Vive (Fils à papa), ou une natte chez un ami
// quand le propriétaire a repris la chambre. On se lève, on se douche (au seau dans la cabine de la cour, ou
// sous la douche de l'appartement), on cuisine (ingrédients payés avec l'argent de « Ma vie »), on mange à
// table, puis on sort : la porte donne sur une vraie rue du quartier, où une étiquette « Chez toi » permet
// de revenir. Le logement est une pièce comme les autres (interieurs.js), mais privée : les amis du salon ne
// la voient pas, et personne d'autre ne peut y entrer.
const LOGIS = {
  chambre: { quartier: 'Akpakpa', plan: 'cour', nom: 'ta chambre', entrer: 'Rentrer dans ta chambre', titre: 'dans ta chambre, au fond d’une cour commune d’Akpakpa' },
  ami: { quartier: 'Gbégamey', plan: 'cour', ami: true, nom: 'chez ton ami', entrer: 'Rentrer chez ton ami', titre: 'chez ton ami, à Gbégamey, sur une natte' },
  appartement: { lieu: 'haievive', plan: 'appart', nom: 'ton appartement', entrer: 'Rentrer dans ton appartement', titre: 'dans ton appartement de la Haie Vive' },
  villa: { quartier: 'Fidjrossè', plan: 'appart', nom: 'ta villa', entrer: 'Rentrer dans ta villa', titre: 'dans ta villa de Fidjrossè' },
};
// Ce qu'on cuisine chez soi : [plat, prix des ingrédients (F), faim rendue]. Moins cher qu'au maquis, mais il faut le temps de le préparer.
const RECETTES = {
  cour: [['Bouillie de maïs et beignets', 150, 15], ['Haricots, gari et huile rouge', 250, 25], ['Riz sauce tomate', 300, 28], ['Pâte de maïs, sauce gombo', 400, 35]],
  appart: [['Omelette et pain', 400, 20], ['Spaghetti sauce tomate', 600, 32], ['Igname pilée, sauce arachide', 1200, 45], ['Poulet braisé et aloko', 2500, 55]],
};
const DUREE_DOUCHE = 8, DUREE_CUISSON = 12;
const H = { S: null, ligne: () => { }, geste: () => { }, eau: null, vapeur: null, brume: null, arreterBruit: null, gobelet: null };
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;

export function initMaison(ctx) { H.S = ctx.S; H.ligne = ctx.ligne; H.geste = ctx.geste; H.guide = ctx.guide; }

// ---------- La porte : sur une rue de quartier, près du centre du quartier ----------
// Dans un mur de parcelle pour une maison en cour commune (rue.js y bâtit la clôture), sur la façade d'un
// immeuble pour un appartement. Toujours au même endroit d'une partie à l'autre (bâtiments OSM et rues).
const TROTTOIR = { 3: 2.2, 4: 1.3, 5: .9 }; // comme rue.js : de la chaussée jusqu'aux murs des parcelles
function chercherPorte(x0, z0, facade, classes = [4, 5]) {
  let best = null, bd = 520;
  for (const L of roadLines) {
    if (L.bridge || !classes.includes(L.cls) || L.pts.length < 2) continue;
    const front = (L.w ?? ROAD_W[L.cls]) / 2 + TROTTOIR[L.cls];
    for (let i = 1; i < L.pts.length; i++) {
      const [ax, az] = L.pts[i - 1], [bx, bz] = L.pts[i], l = Math.hypot(bx - ax, bz - az);
      if (l < 16 || Math.min(Math.hypot(ax - x0, az - z0), Math.hypot(bx - x0, bz - z0)) > bd + l) continue;
      const ux = (bx - ax) / l, uz = (bz - az) / l;
      for (let s = 7; s < l - 7; s += 2) {
        const cx = ax + ux * s, cz = az + uz * s, d = Math.hypot(cx - x0, cz - z0); if (d >= bd) continue;
        for (const cote of [1, -1]) {
          const nx = -uz * cote, nz = ux * cote, px = cx + nx * front, pz = cz + nz * front, B = (k, u = 0) => dansBatiment(px + nx * k + ux * u, pz + nz * k + uz * u);
          let f = 0;
          if (facade) { f = -1; for (let k = 0; k <= 3; k += .25) if (B(k)) { f = k; break; } if (f < 0 || !B(f + .4, 1.2) || !B(f + .4, -1.2)) continue; } // la façade, de part et d'autre de la porte
          else if (B(0) || B(.8) || B(1.6) || B(.5, 1.5) || B(.5, -1.5)) continue; // une parcelle sans bâtiment au bord de la rue : le mur et le portail
          if (B(f - 1.4) || B(f - 3.9) || dansBatiment(cx, cz)) continue; // la rue devant la porte est dégagée
          if (surChaussee(px + nx * (f + 2.5), pz + nz * (f + 2.5), 0) || surChaussee(px + ux * 6 + nx * .6, pz + uz * 6 + nz * .6, 0) || surChaussee(px - ux * 6 + nx * .6, pz - uz * 6 + nz * .6, 0)) continue; // ni carrefour ni autre rue
          bd = d; best = { x: px + nx * (f - .05), z: pz + nz * (f - .05), nx, nz, facade };
        }
      }
    }
  }
  return best;
}
// Repères au-dessus de la douche et du fourneau, vus à travers les cloisons : la douche de l'appartement est
// dans la salle de bains, derrière une porte, et on ne la trouvait pas.
function reperes(I) {
  for (const [texte, p] of [['Douche', I.douche], ['Cuisine', I.fourneau]]) if (p) { const e = etiquette(texte); e.position.set(p.x, 1.9, p.z); K.racine.add(e); }
}
// Portail bleu dans le mur de la parcelle (repère local : la rue vers +z), numéro de lot peint à la main.
function portail(P) {
  const bleu = K.mat('#2f5f8a', { rugosite: .55, metal: .2 }), enduit = K.mat('#e6d8bd', { rugosite: .95 });
  for (const s of [-1, 1]) { K.boite(.42, 2.75, .42, enduit, s * 1.45, 1.37, -.05); K.boite(1.6, 2.5, .24, enduit, s * 2.45, 1.25, -.12); } // piliers et bouts de mur
  K.boite(1.22, 2.3, .06, bleu, -.62, 1.17, .06); K.boite(1.22, 2.3, .06, bleu, .62, 1.17, .06);
  for (const y of [.5, 1.2, 1.9]) K.boite(2.44, .05, .02, K.mat('#24496b'), 0, y, .1); // renforts
  panneauTexte([`C/${100 + Math.abs(Math.round(P.x * 7 + P.z * 3)) % 900}`], .5, .26, 1.45, 2.2, .17, 0, { fond: '#e6d8bd', encre: '#2f5f8a', px: 256, py: 133, police: '800 90px system-ui, sans-serif' });
}
// Entrée d'immeuble : porte vitrée, auvent, interphone.
function entreeImmeuble() {
  K.boite(1.7, 2.4, .08, K.mat('#4d6f7e', { transparent: .75, rugosite: .1, metal: .2 }), 0, 1.2, .04).castShadow = false;
  K.boite(1.9, .12, .1, '#c9cdd0', 0, 2.46, .05); K.boite(2.6, .12, 1.2, '#efede7', 0, 2.8, .6);
  K.boite(.14, .22, .04, '#2b2f33', 1.15, 1.35, .06);
  panneauTexte(['RÉSIDENCE'], 1.4, .3, 0, 3.05, 1.21, 0, { fond: '#1f3d4a', encre: '#f5c21b', px: 1024, py: 220, police: '800 140px system-ui, sans-serif' });
}
function declarer(logement) {
  const id = `maison-${logement}`; if (INTERIEURS.has(id)) return INTERIEURS.get(id);
  const D = LOGIS[logement] || LOGIS.ami, appart = D.plan === 'appart', lieu = D.lieu && PLACES.find(p => p.id === D.lieu), q = QUARTIERS.find(r => r[0] === D.quartier);
  const [x0, z0] = lieu ? toXZ(lieu.lat, lieu.lon) : toXZ(q[1], q[2]);
  const P = (appart && chercherPorte(x0, z0, true)) || chercherPorte(x0, z0, false) || chercherPorte(x0, z0, false, [3, 4, 5]); if (!P) return null;
  const dehors = Math.atan2(-P.nx, -P.nz), g = groupeLieu(`porte-${id}`, P.x, P.z); g.rotation.y = dehors;
  K.into(g, () => (P.facade ? entreeImmeuble : portail)(P));
  const etq = etiquette('Chez toi'); etq.position.set(0, 3.6, .4); etq.visible = false; g.add(etq);
  declarerInterieur(id, {
    nom: D.nom, entrer: D.entrer, titre: D.titre, logis: D, prive: true, plafond: 2.7, etiquette: etq,
    porte: [P.x - P.nx * 1.4, P.z - P.nz * 1.4], dehors, centre: [P.x, 7400], // en mer, plus loin que les autres pièces
    ...(appart ? { w: 12, d: 9, entree: [1, -3.7, 0], construire: I => { appartement(I); reperes(I); } } : { w: 12, d: 10, entree: [1.5, -4.2, 0], construire: I => { cour(I); reperes(I); } }),
  });
  return INTERIEURS.get(id);
}
/** Le logement du joueur (déclaré à la première demande), ou null sans « Ma vie ». */
export const maisonActuelle = () => (VIE.data ? declarer(VIE.data.logement || 'ami') : null);

// ---------- Matières ----------
K.motif('pagneWax', (c, t) => { // tissu wax : grands ronds concentriques sur fond orange
  c.fillStyle = '#d9661f'; c.fillRect(0, 0, t, t);
  for (const [x, y] of [[64, 64], [192, 192], [192, 64], [64, 192]]) for (let r = 54, k = 0; r > 6; r -= 12, k++) { c.fillStyle = ['#1f3f8a', '#f2c21b', '#7a1f2b', '#f6efe2'][k % 4]; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#2b5a3a'; for (let i = 0; i < 4; i++) c.fillRect(i * 64 + 26, 124, 12, 8);
});
K.motif('carreauxSol', (c, t) => { c.fillStyle = '#b9b2a6'; c.fillRect(0, 0, t, t); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#d8cfbf' : '#cfc4b1'; c.fillRect(i * 64 + 2, j * 64 + 2, 60, 60); } });
K.motif('carrelageClair', (c, t) => { c.fillStyle = '#d9d2c5'; c.fillRect(0, 0, t, t); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { c.fillStyle = '#efe9de'; c.fillRect(i * 128 + 2, j * 128 + 2, 124, 124); c.fillStyle = 'rgba(190,175,150,.18)'; c.fillRect(i * 128 + 20, j * 128 + 30, 70, 3); } });
K.motif('faience', (c, t) => { c.fillStyle = '#c9d6db'; c.fillRect(0, 0, t, t); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { c.fillStyle = (i * 3 + j) % 7 ? '#f3f6f7' : '#dceaf0'; c.fillRect(i * 32 + 1, j * 32 + 1, 30, 30); } });
K.motif('cimentSol', (c, t) => {
  c.fillStyle = '#b8ab95'; c.fillRect(0, 0, t, t);
  for (let i = 0; i < 900; i++) { c.fillStyle = ['#a99c86', '#c6baa5', '#9d917c'][i % 3]; c.fillRect((i * 97) % t, (i * 57 + i * i) % t, 2, 2); }
  c.strokeStyle = 'rgba(90,80,65,.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(20, 40); c.lineTo(90, 70); c.lineTo(120, 150); c.stroke();
});
K.motif('natte', (c, t) => { for (let i = 0; i < 32; i++) { c.fillStyle = i % 2 ? '#d8b878' : '#c7a05e'; c.fillRect(0, i * 8, t, 8); } for (let i = 0; i < 8; i++) { c.fillStyle = 'rgba(120,40,30,.55)'; c.fillRect(0, i * 32 + 12, t, 4); } });

// ---------- Aides de construction (repère de la pièce) ----------
const sansOmbre = m => { m.castShadow = false; return m; };
/** Cloison : ne se traverse pas, et la caméra ne passe pas au travers (murEntre). */
function cloison(I, w, d, x, z, h, mat) { sansOmbre(K.boite(w, h, d, mat, x, h / 2, z)); I.obstacles.push([x, z, w / 2, d / 2, h]); }
const meuble = (I, w, d, x, z, h = .8) => I.obstacles.push([x, z, w / 2, d / 2, h]);
function chaise(I, x, z, cap, couleur = '#f4f2ec') { // chaise monobloc en plastique, où l'on peut s'asseoir
  const m = K.mat(couleur, { rugosite: .5 }), g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = cap; K.racine.add(g);
  K.boite(.46, .05, .44, m, 0, .45, 0, g); K.boite(.46, .48, .05, m, 0, .72, -.22, g);
  for (const [a, b] of [[-.2, -.19], [.2, -.19], [-.2, .19], [.2, .19]]) K.boite(.04, .45, .04, m, a, .22, b, g);
  I.sieges.push({ x, z, cap });
}
function table(I, w, d, x, z, couleur, h = .74) {
  const m = K.mat(couleur, { rugosite: .6 });
  K.boite(w, .05, d, m, x, h, z); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.boite(.05, h, .05, m, x + a * (w / 2 - .06), h / 2, z + b * (d / 2 - .06));
  meuble(I, w, d, x, z, h + .05);
}
/**
 * Le lit (ou la natte) : a = direction de la tête vers les pieds. Le pagne déplié couvre le joueur couché
 * jusqu'à la poitrine ; debout, il est plié au pied du lit.
 */
function lit(I, { x, z, a, larg, long, natte = false, vue, leve }) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = a; K.racine.add(g);
  const bois = K.mat('#6b4a2f', { rugosite: .7 }), pagne = K.tex('pagneWax', larg * 2.5, long * 2.5); // motifs d'une vingtaine de centimètres
  let y;
  if (natte) { K.boite(larg, .03, long, K.tex('natte', 1, 2), 0, .015, 0, g); y = .03; }
  else {
    K.boite(larg + .08, .3, long + .06, bois, 0, .2, 0, g); K.boite(larg + .08, .95, .07, bois, 0, .55, -long / 2 - .03, g);
    K.boite(larg, .16, long, '#f3efe6', 0, .43, 0, g); y = .51;
    K.boite(larg + .01, .012, long - .5, pagne, 0, y + .006, .25, g); // drap de pagne
  }
  K.boite(Math.min(larg - .2, .6), .12, .32, '#ffffff', 0, y + .06, -long / 2 + .25, g); // oreiller
  const deplie = K.boite(larg - .04, .34, long * .6, pagne, 0, y + .17, long / 2 - long * .3 - .02, g); deplie.visible = false; // assez épaisse pour couvrir le corps couché
  const plie = K.boite(larg - .12, .1, .38, pagne, 0, y + .05, long / 2 - .24, g);
  const droit = Math.abs(Math.sin(a)) < .5; meuble(I, droit ? larg + .1 : long + .1, droit ? long + .1 : larg + .1, x, z, natte ? .05 : .6);
  I.lit = { x, z, a, y, vue, leve, deplie, plie };
}
function personnes(I, liste) { for (const [graine, role, x, z, cap, assise] of liste) { const p = personne(graine, { role, assise }); p.position.set(x, assise ? .47 : 0, z); p.rotation.y = cap; K.racine.add(p); I.pnj = I.pnj || p; } }

// ---------- Maison en cour commune (Akpakpa ; chez l'ami, à Gbégamey) ----------
// La cour cimentée à ciel ouvert, le manguier, la cabine de douche au seau, le coin cuisine sous l'auvent
// (réchaud à gaz, marmite), une table et deux chaises, les portes des voisins ; la chambre dans un coin,
// plafond de contreplaqué, ventilateur, lit en bois et drap de pagne.
function cour(I) {
  const W = I.w, D = I.d, Hm = 2.8, ami = !!I.logis.ami;
  const enduit = K.mat('#e6d8bd', { rugosite: .95 }), ocre = K.mat('#c98a52', { rugosite: .95 }), bois = K.mat('#6b4a2f', { rugosite: .7 }), bleu = K.mat('#2f5f8a', { rugosite: .55, metal: .2 });
  sansOmbre(K.boite(W, .2, D, K.tex('cimentSol', W / 3, D / 3), 0, -.1, 0));
  for (const [w, d, x, z] of [[W, .25, 0, -D / 2], [W, .25, 0, D / 2], [.25, D, -W / 2, 0], [.25, D, W / 2, 0]]) sansOmbre(K.boite(w, Hm, d, enduit, x, Hm / 2, z));
  for (const [w, d, x, z] of [[W - .3, .02, 0, -D / 2 + .135], [W - .3, .02, 0, D / 2 - .135], [.02, D - .3, -W / 2 + .135, 0], [.02, D - .3, W / 2 - .135, 0]]) sansOmbre(K.boite(w, .9, d, ocre, x, .45, z)); // soubassement peint
  // Le portail, côté rue, et les toits de tôle des voisins par-dessus les murs.
  K.boite(2.44, 2.3, .06, bleu, 1.5, 1.15, -D / 2 + .16).castShadow = false;
  for (const [w, d, x, z, c] of [[W + 3, 3, 0, -D / 2 - 1.8, '#8a8f93'], [W + 3, 3, 0, D / 2 + 1.8, '#8d5a3b'], [3, D, -W / 2 - 1.8, 0, '#7f8488'], [3, D, W / 2 + 1.8, 0, '#94643f']]) { const r = sansOmbre(K.boite(w, .06, d, c, x, 3.25, z)); if (w > d) r.rotation.x = z > 0 ? .18 : -.18; else r.rotation.z = x > 0 ? -.18 : .18; }
  // La chambre (sud-ouest) : cloisons, porte ouverte, plafond, ampoule.
  sansOmbre(K.boite(5, .02, 4.4, K.tex('carreauxSol', 2.5, 2.2), -3.5, .01, 2.8));
  cloison(I, 3.5, .2, -4.25, .6, Hm, enduit); cloison(I, .4, .2, -1.2, .6, Hm, enduit); cloison(I, .2, 4.4, -1, 2.8, Hm, enduit); // porte de 1,1 m
  sansOmbre(K.boite(1.1, .6, .2, enduit, -1.95, 2.5, .6));
  K.boite(.05, 2.1, .85, bois, -1.45, 1.05, 1.15);
  sansOmbre(K.boite(5, .05, 4.4, '#d9c7a4', -3.5, 2.72, 2.8));
  K.sphere(.06, K.mat('#fff6d8', { emissif: '#ffe9a8' }), -3.5, 2.6, 2.8);
  for (const s of [-1, 1]) K.boite(1, .9, .01, K.mat('#9fc3d1', { emissif: '#6f8f9c' }), -4.2, 1.6, .6 + s * .105).castShadow = false; // fenêtre à lames (naco)
  if (ami) lit(I, { x: -5.0, z: 3.9, a: Math.PI, larg: .95, long: 1.9, natte: true, vue: -Math.PI / 2, leve: [-3.9, 3.4, Math.PI / 2] });
  else {
    lit(I, { x: -5.2, z: 3.98, a: Math.PI, larg: 1.4, long: 1.95, vue: -Math.PI / 2, leve: [-3.9, 3.4, Math.PI / 2] });
  }
  K.cyl(.18, .2, .04, 12, '#2b2f33', -5.55, .02, 1.25); K.cyl(.02, .02, 1.1, 6, '#2b2f33', -5.55, .57, 1.25); K.cyl(.22, .22, .08, 16, K.mat('#e9e6de'), -5.55, 1.15, 1.32).rotation.x = Math.PI / 2; meuble(I, .45, .45, -5.55, 1.25); // ventilateur
  table(I, .6, .5, -2.0, 4.45, '#8a6a4a'); chaise(I, -2.0, 3.8, 0, '#c23b2a');
  K.boite(.8, .45, .5, bleu, -3.15, .23, 4.65); meuble(I, .8, .5, -3.15, 4.65, .5); // cantine métallique
  panneauTexte(['ALLEZ', 'LES GUÉPARDS !'], .9, .65, -5.86, 1.75, 2.1, Math.PI / 2, { fond: '#1f7a3e', encre: '#fcd116', px: 512, py: 370, police: '800 96px system-ui, sans-serif' });
  // La douche (nord-est) : cabine à ciel ouvert, seau et gobelet, rideau de pagne.
  cloison(I, .2, 1.9, 3.9, -4.05, 2, enduit); cloison(I, .9, .2, 5.55, -3.1, 2, enduit);
  sansOmbre(K.boite(1.9, .04, 1.7, '#9aa1a3', 4.95, .02, -4.05));
  K.boite(.12, 1.5, .02, K.tex('pagneWax', .3, 1), 4.08, 1.15, -3.05);
  K.cyl(.17, .13, .32, 14, K.mat('#2a6fb0', { rugosite: .4 }), 5.55, .16, -4.6); K.cyl(.05, .04, .1, 8, '#e9c046', 5.3, .05, -4.65);
  panneauTexte(['DOUCHE'], .7, .2, 5.55, 1.65, -2.99, 0, { fond: '#e6d8bd', encre: '#2f5f8a', px: 512, py: 146, police: '800 100px system-ui, sans-serif' });
  I.douche = { x: 4.95, z: -4.1, cap: Math.PI, jet: 2.05, seau: true };
  K.cyl(.03, .03, .9, 6, '#7d868b', 3.4, .45, -4.7); K.cyl(.32, .25, .6, 14, K.mat('#a0522d', { rugosite: .9 }), 2.85, .3, -4.55); meuble(I, .7, .7, 2.85, -4.55, .6); // robinet et canari
  // Le coin cuisine (sud-est) sous l'auvent : table, réchaud à gaz, bouteille, marmite.
  const auvent = sansOmbre(K.boite(3.1, .04, 2.6, '#8a8f93', 4.5, 2.35, 3.75)); auvent.rotation.x = -.1;
  for (const z of [2.55, 4.85]) K.cyl(.04, .04, 2.35, 6, '#6d7478', 3.0, 1.17, z);
  table(I, 1.5, .7, 4.5, 4.45, '#8a6a4a', .8);
  K.cyl(.2, .2, .08, 14, '#2b2f33', 4.3, .87, 4.45);
  const feu = sansOmbre(K.cyl(.0, .12, .08, 12, K.mat('#4da3ff', { emissif: '#2f7fff', transparent: .8 }), 4.3, .95, 4.45)); feu.visible = false;
  K.cyl(.17, .17, .2, 16, K.mat('#b8bcbf', { metal: .3, rugosite: .35 }), 4.3, 1.01, 4.45); K.cyl(.175, .175, .02, 16, '#9aa0a3', 4.3, 1.12, 4.45);
  K.cyl(.15, .15, .45, 14, K.mat('#1f5fa8', { rugosite: .5 }), 5.6, .23, 4.65); meuble(I, .35, .35, 5.6, 4.65, .5);
  for (const [dx, c] of [[.45, '#c0392b'], [.55, '#d35400'], [.62, '#c0392b'], [.7, '#8e44ad']]) K.sphere(.045, c, 4.3 + dx, .87, 4.35);
  I.fourneau = { x: 4.3, z: 3.75, cap: 0, marmite: [4.3, 1.15, 4.45], feu, plan: 'cour' };
  // Table et chaises de la cour, manguier, banc, corde à linge.
  table(I, .9, .9, 1.0, 1.6, '#f2f0ea', .72); chaise(I, .35, 1.6, Math.PI / 2); chaise(I, 1.65, 1.6, -Math.PI / 2);
  K.cyl(.22, .3, 2.8, 10, '#6b4a2f', -3, 1.4, -2.6); meuble(I, .6, .6, -3, -2.6, 2.8);
  for (const [dx, dy, dz, r] of [[0, 3.7, 0, 1.7], [1, 3.4, .6, 1.2], [-.9, 3.3, -.5, 1.2]]) K.sphere(r, K.mat('#3f6e34', { rugosite: .9 }), -3 + dx, dy, -2.6 + dz);
  K.boite(1.5, .06, .4, bois, -1.6, .45, -3.4); meuble(I, 1.5, .4, -1.6, -3.4, .5); I.sieges.push({ x: -1.9, z: -3.4, cap: 0 }, { x: -1.3, z: -3.4, cap: 0 });
  const corde = K.cyl(.01, .01, 4.2, 4, '#e9e6de', -3.7, 1.95, -1.1); corde.rotation.z = Math.PI / 2;
  for (const [x, c] of [[-5.2, '#1f3f8a'], [-4.3, '#d9661f'], [-3.4, '#7a1f2b'], [-2.5, '#f2c21b']]) K.boite(.75, .85, .01, c, x, 1.5, -1.1).castShadow = false;
  // Les portes des voisins, à l'est, et une voisine qui lave le linge dans une bassine.
  for (const z of [-1.4, .9]) { K.boite(.04, 2.1, .9, z < 0 ? bleu : K.mat('#2f6b4f'), W / 2 - .16, 1.05, z); K.boite(.03, .5, .6, K.mat('#9fc3d1', { emissif: '#6f8f9c' }), W / 2 - .15, 1.6, z + 1.05).castShadow = false; }
  K.cyl(.38, .3, .2, 16, K.mat('#9aa5ad', { metal: .3, rugosite: .4 }), 3.3, .1, -.45); meuble(I, .8, .8, 3.3, -.45, .3);
  chaise(I, 4.1, -.45, -Math.PI / 2, '#2a6fb0'); I.sieges[I.sieges.length - 1].occupe = true;
  personnes(I, ami ? [[881, 'jeune', 1.65, 1.6, -Math.PI / 2, true], [882, 'maman', 4.1, -.45, -Math.PI / 2, true]] : [[882, 'maman', 4.1, -.45, -Math.PI / 2, true]]);
  if (ami) I.sieges.find(s => s.x === 1.65).occupe = true;
}

// ---------- Appartement (Haie Vive ; villa de Fidjrossè) ----------
// Séjour avec canapé et télévision, table à manger, cuisine équipée (cuisinière, réfrigérateur), chambre
// avec grand lit et climatiseur, salle de bains avec douche.
function appartement(I) {
  const W = I.w, D = I.d, Hm = 2.8;
  const blanc = K.mat('#f2eee6', { rugosite: .9 }), bois = K.mat('#6b4a2f', { rugosite: .6 }), jour = K.mat('#cfe3ee', { emissif: '#9fb9c4' });
  sansOmbre(K.boite(W, .2, D, K.tex('carrelageClair', W / 2, D / 2), 0, -.1, 0));
  sansOmbre(K.boite(W, .1, D, '#f7f5f0', 0, 2.8, 0));
  for (const [w, d, x, z] of [[W, .25, 0, -D / 2], [W, .25, 0, D / 2], [.25, D, -W / 2, 0], [.25, D, W / 2, 0]]) sansOmbre(K.boite(w, Hm, d, blanc, x, Hm / 2, z));
  const led = K.mat('#ffffff', { emissif: '#fff4e0' });
  for (const [x, z] of [[-4, -1.6], [1.5, -2.2], [1, 2.6], [4.3, 3], [-4, 2.9]]) sansOmbre(K.cyl(.22, .22, .03, 18, led, x, 2.73, z));
  K.boite(1, 2.15, .06, bois, 1, 1.07, -D / 2 + .16); // porte d'entrée
  // Cloisons : chambre (nord-ouest), salle de bains (sud-ouest).
  cloison(I, .15, 3.2, -2, -2.9, Hm, blanc); cloison(I, .15, 1.4, -2, .5, Hm, blanc); cloison(I, .15, 1.1, -2, 1.75, Hm, blanc); cloison(I, .15, 1.1, -2, 3.95, Hm, blanc); cloison(I, 4, .15, -4, 1.2, Hm, blanc); // portes de 1,1 m
  // Chambre : grand lit, chevets, armoire, climatiseur, fenêtre et rideaux.
  lit(I, { x: -4.95, z: -2.2, a: Math.PI / 2, larg: 1.6, long: 2, vue: Math.PI, leve: [-4.6, -.85, Math.PI / 2] });
  for (const z of [-3.3, -1.1]) { K.boite(.4, .5, .4, bois, -5.7, .25, z); meuble(I, .4, .4, -5.7, z, .5); K.cyl(.1, .14, .3, 12, '#f1e6c8', -5.7, .65, z); }
  K.boite(1.8, 2.1, .6, bois, -4, 1.05, -4.1); meuble(I, 1.8, .6, -4, -4.1, 2.1);
  K.boite(.2, .3, .9, '#f4f4f2', -5.85, 2.3, -2.2);
  K.boite(1.4, 1.1, .02, jour, -2.9, 1.6, -D / 2 + .14).castShadow = false; for (const s of [-1, 1]) K.boite(.4, 1.6, .03, K.tex('pagneWax', .5, 1), -2.9 + s * .85, 1.55, -D / 2 + .17);
  // Salle de bains : douche vitrée, lavabo, toilettes.
  sansOmbre(K.boite(3.85, .02, 3.15, K.tex('faience', 2, 1.6), -4, .012, 2.85));
  K.boite(.9, .06, .9, '#e9eef0', -5.45, .03, 3.75); K.boite(.95, 2, .02, K.mat('#bfe0ea', { transparent: .35, rugosite: .05 }), -5.45, 1, 3.28).castShadow = false; meuble(I, .95, .05, -5.45, 3.28, 2);
  K.cyl(.015, .015, 1.3, 6, '#c9cdd0', -5.92, 1.5, 3.75); const pomme = K.cyl(.09, .09, .03, 16, '#c9cdd0', -5.78, 2.15, 3.75); pomme.rotation.z = Math.PI / 2.4;
  I.douche = { x: -5.4, z: 3.75, cap: -Math.PI / 2, jet: 2.12 };
  K.boite(.6, .16, .45, '#f7f7f5', -3.1, .85, 4.2); K.boite(.12, .8, .12, '#f7f7f5', -3.1, .4, 4.25); meuble(I, .6, .45, -3.1, 4.2, .9);
  K.boite(.6, .8, .02, K.mat('#cfe3ee', { rugosite: .05, metal: .2 }), -3.1, 1.65, D / 2 - .14).castShadow = false; // miroir
  K.boite(.38, .4, .55, '#f7f7f5', -5.5, .2, 1.65); K.boite(.38, .4, .16, '#f7f7f5', -5.5, .55, 1.4); meuble(I, .4, .6, -5.5, 1.7, .6);
  // Cuisine (sud-est) : plan de travail, cuisinière à gaz, évier, réfrigérateur, placards.
  K.boite(3.4, .9, .6, '#e9e3d8', 4.3, .45, 4.2); K.boite(3.4, .04, .62, K.mat('#3a3f44', { rugosite: .35 }), 4.3, .92, 4.2); meuble(I, 3.4, .6, 4.3, 4.2, .95);
  K.boite(.6, .02, .5, '#1d2024', 4.4, .95, 4.2); for (const [a, b] of [[-.15, -.12], [.15, -.12], [-.15, .12], [.15, .12]]) K.cyl(.07, .07, .02, 12, '#2b2f33', 4.4 + a, .965, 4.2 + b);
  const feu = sansOmbre(K.cyl(0, .1, .07, 12, K.mat('#4da3ff', { emissif: '#2f7fff', transparent: .8 }), 4.25, 1.0, 4.08)); feu.visible = false;
  K.cyl(.15, .15, .16, 16, K.mat('#c9cdd0', { metal: .4, rugosite: .3 }), 4.25, 1.06, 4.08);
  K.boite(.5, .03, .4, K.mat('#b8bcbf', { metal: .4, rugosite: .3 }), 3.2, .94, 4.2);
  K.boite(3.4, .7, .35, '#ffffff', 4.3, 1.95, 4.3);
  K.boite(.7, 1.8, .7, '#f0f0ee', 5.6, .9, 1.9); K.boite(.03, .5, .03, '#9aa0a3', 5.23, 1.2, 1.7); meuble(I, .7, .7, 5.6, 1.9, 1.8);
  I.fourneau = { x: 4.25, z: 3.45, cap: 0, marmite: [4.25, 1.16, 4.08], feu, plan: 'appart' };
  // Table à manger et ses quatre chaises.
  table(I, 1.5, .9, 1, 2.6, '#8a5a35', .76);
  for (const [x, z, cap] of [[.65, 1.95, 0], [1.35, 1.95, 0], [.65, 3.25, Math.PI], [1.35, 3.25, Math.PI]]) chaise(I, x, z, cap, '#5a3a22');
  // Séjour : canapé (on peut s'y asseoir), table basse, télévision, plantes, tableaux en pagne, grande fenêtre.
  K.boite(.9, .45, 2.2, '#3d5a73', 3.2, .23, -2.2); K.boite(.25, .5, 2.2, '#3d5a73', 2.8, .65, -2.2); meuble(I, 1, 2.2, 3.15, -2.2, .6);
  for (const z of [-2.85, -2.2, -1.55]) I.sieges.push({ x: 3.3, z, cap: Math.PI / 2 });
  K.boite(.5, .35, 1, bois, 4.5, .18, -2.2); meuble(I, .5, 1, 4.5, -2.2, .4);
  K.boite(.06, .72, 1.3, '#111316', 5.85, 1.5, -2.2); K.boite(.4, .5, 1.6, bois, 5.65, .25, -2.2); meuble(I, .4, 1.6, 5.65, -2.2, .5);
  for (const [x, z] of [[-1.5, -4], [5.5, -4], [-1.4, 4]]) { K.cyl(.25, .2, .45, 12, '#d9d2c4', x, .23, z); K.sphere(.45, K.mat('#4f7a3c', { rugosite: .9 }), x, .95, z).scale.set(1, 1.4, 1); meuble(I, .5, .5, x, z, 1); }
  for (const x of [.2, 1.6]) K.boite(.8, .6, .03, K.tex('pagneWax', .6, .5), x, 1.7, D / 2 - .14);
  K.boite(2.4, 1.3, .02, jour, 3.6, 1.6, -D / 2 + .14).castShadow = false;
}

// ---------- Couché, debout, sous la douche, aux fourneaux ----------
/** Se coucher dans son lit (au réveil : sans message). */
export function coucher(I) {
  const S = H.S, L = I.lit, p = dansLaPiece(I, L.x, L.z);
  finActivite();
  S.couche = { x: p.x + Math.sin(L.a) * .85, y: p.y + L.y + .17, z: p.z + Math.cos(L.a) * .85, a: L.a }; // le dos posé sur le matelas (à +0,1, épaules et bras passaient au travers)
  S.x = p.x; S.z = p.z; S.cap = L.vue; S.tangage = .42; S.saut = true; S.geste = 'idle'; // 0,7 rad : la caméra montait sous le plafond et cadrait le mur d'en face plutôt que la chambre
  L.deplie.visible = true; L.plie.visible = false;
}
function lever() {
  const S = H.S, I = S.lieu; if (!S.couche || !I?.lit) return;
  const L = I.lit, [x, z, cap] = L.leve, p = dansLaPiece(I, x, z);
  S.couche = null; S.leveT = performance.now(); L.deplie.visible = false; L.plie.visible = true;
  if (S.moi) S.moi.rotation.set(0, cap, 0);
  S.x = p.x; S.z = p.z; S.cap = cap; S.tangage = .4; S.saut = true;
  if (H.reveil) {
    H.reveil = false;
    const faim = VIE.data?.faim ?? 100;
    if (!H.guide?.()) H.ligne(`Bonjour ! Ici, tu peux te doucher, cuisiner et manger à table. Quand tu es prêt, « Sortir » pour aller en ville.${faim < 60 ? ' Tu as faim : prépare quelque chose avant de sortir.' : ''}`); // sinon le guide le dit
    else if (faim < 60) H.ligne('Tu as faim : prépare quelque chose avant de sortir.');
    if (I.logis?.plan === 'appart') H.ligne('La douche est dans la salle de bains : en sortant de la chambre, la porte suivante sur ta droite (étiquette jaune « Douche »).');
    I.pnj?.userData.jouer?.('salut');
  }
}
/** Au début de la partie : on se réveille chez soi, couché. */
export function reveil(I) {
  H.reveil = true; coucher(I);
  H.ligne(`Tu te réveilles ${I.titre}.${H.guide?.() ? '' : ' « Se lever » (ou avance) pour commencer ta journée.'}`);
}
let rond = null; // gouttes et vapeur : des points ronds et flous, pas des carrés
const texRonde = () => rond ??= (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.45, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
function particules(n, couleur, taille, opacite) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: couleur, map: texRonde(), size: taille, transparent: true, opacity: opacite, depthWrite: false }));
  p.frustumCulled = false; p.userData.graines = Array.from({ length: n }, () => [Math.random(), Math.random() * 2 - 1, Math.random() * 2 - 1]); scene.add(p); return p;
}
function retirerParticules(p) { if (!p) return; scene.remove(p); p.geometry.dispose(); p.material.dispose(); }
function finActivite() {
  const S = H.S, A = S?.activite; if (!A) return;
  S.activite = null; H.arreterBruit?.(); H.arreterBruit = null;
  retirerParticules(H.eau); retirerParticules(H.vapeur); retirerParticules(H.brume); H.eau = H.vapeur = H.brume = null;
  if (H.gobelet) { H.gobelet.parent?.remove(H.gobelet); H.gobelet = null; }
  if (A.I.fourneau?.feu) A.I.fourneau.feu.visible = false;
}
function demarrer(type, spot, duree, fin) {
  const S = H.S, I = S.lieu, p = dansLaPiece(I, spot.x, spot.z);
  S.x = p.x; S.z = p.z; S.cap = spot.cap; S.geste = 'idle';
  S.activite = { type, t: 0, duree, fin, I, spot };
}
function doucher() {
  const S = H.S, I = S.lieu; if (!I?.douche || S.activite) return;
  demarrer('douche', I.douche, DUREE_DOUCHE, () => { son('piece'); H.ligne(`Ah, ça fait du bien ! Tu es ${VIE.femme ? 'toute fraîche' : 'tout frais'}.`); });
  H.eau = particules(90, '#bfe3ff', .06, .9); H.arreterBruit = bruit('eau', DUREE_DOUCHE);
  H.brume = particules(72, '#eef4f8', 1.25, 0); // la buée, qui cache le corps jusqu'aux épaules
  if (I.douche.seau && S.moi) { const g = K.cyl(.05, .04, .1, 10, K.mat('#e9c046'), 0, .05, .05, S.moi.userData.main || S.moi); H.gobelet = g; } // on se verse l'eau au gobelet
  H.ligne(I.douche.seau ? 'Un seau d’eau, un gobelet : à la douche !' : 'Sous la douche…');
}
function cuisiner() {
  const S = H.S, I = S.lieu, F = I?.fourneau; if (!F || S.activite) return;
  const argent = VIE.data?.argent ?? 0;
  choisir(F.plan === 'cour' ? 'Cuisiner au réchaud · Que prépares-tu ?' : 'Cuisiner · Que prépares-tu ?', RECETTES[F.plan].map(([nom, prix, faim]) => ({
    texte: nom, sous: `Ingrédients ${fmt(prix)} · faim +${faim}`, desactive: argent < prix, f: async () => {
      if (!(await depenser(prix, `ingrédients · ${nom}`))) { H.ligne(`Il te faut ${fmt(prix)} pour les ingrédients.`); return; }
      if (S.lieu !== I || S.activite) return;
      demarrer('cuisine', F, DUREE_CUISSON, () => { son('piece'); tenirPlat(nom, faim); });
      F.feu.visible = true; H.vapeur = particules(40, '#ffffff', .22, .4); H.arreterBruit = bruit('friture', DUREE_CUISSON);
      H.ligne(`${nom} : ça mijote… Reste au fourneau.`);
    },
  })));
}
function arreter() {
  const A = H.S.activite; if (!A) return;
  finActivite(); H.ligne(A.type === 'cuisine' ? 'Tu as quitté le fourneau : le plat a brûlé !' : 'Tu sors de la douche.');
}
/** Une fin de séjour chez soi (on sort, « Aller à », on quitte le salon) : on n'est plus couché ni occupé. */
export function quitterMaison() {
  const S = H.S; if (!S) return;
  finActivite();
  if (S.couche) { const L = S.lieu?.lit; S.couche = null; if (L) { L.deplie.visible = false; L.plie.visible = true; } if (S.moi) S.moi.rotation.set(0, S.cap, 0); }
}
/** Le joueur est-il couché ou occupé (douche, cuisine) ? Alors seules les actions de la maison sont proposées. */
export const occupe = () => !!(H.S?.couche || H.S?.activite);

// ---------- Actions de la maison (boutons du salon) ----------
export function actionsMaison() {
  const S = H.S, I = S.lieu; if (!I?.prive || T.mode !== 'pied') return [];
  if (S.couche) return [{ texte: 'Se lever', f: lever }];
  if (S.activite) return [{ texte: S.activite.type === 'cuisine' ? 'Arrêter la cuisson' : 'Sortir de la douche', f: arreter }];
  const pres = (p, r) => p && Math.hypot(S.x - (I.centre[0] + p.x), S.z - (I.centre[1] + p.z)) < r, out = [];
  if (T.plat && !T.repas && S.anim !== 'assis') out.push({ texte: 'S’asseoir pour manger', f: () => H.geste('assis') });
  if (pres(I.douche, 1.9)) out.push({ texte: 'Se doucher', f: doucher });
  if (pres(I.fourneau, 1.9) && !T.plat) out.push({ texte: 'Cuisiner', f: cuisiner });
  // Pas tout de suite après le lever : E, E recouchait le joueur.
  if (pres(I.lit, 2.2) && performance.now() - (S.leveT || 0) > 4000) out.push({ texte: 'Se coucher', f: () => { coucher(I); H.ligne('Petite sieste… Avance pour te lever.'); } });
  return out;
}

// ---------- À chaque image ----------
/** Renvoie true quand la maison place elle-même le personnage (couché, douche, cuisine) ; false : on marche. */
export function majMaison(dt, av, tour) {
  const S = H.S; if (!S) return false;
  for (const I of INTERIEURS.values()) if (I.prive) I.etiquette.visible = S.actif && !S.lieu && Math.hypot(I.porte[0] - S.x, I.porte[1] - S.z) > 6; // « Chez toi », vu de la rue (devant la porte, le bouton « Rentrer » suffit)
  const bouge = Math.abs(av) > .3 || Math.abs(tour) > .3;
  if (S.couche) {
    if (bouge) { lever(); return false; }
    const c = S.couche; S.anim = 'idle';
    if (S.moi) { S.moi.visible = true; S.moi.rotation.order = 'YXZ'; S.moi.position.set(c.x, c.y, c.z); S.moi.rotation.set(-Math.PI / 2, c.a, 0); S.moi.userData.jouer('idle'); }
    return true;
  }
  const A = S.activite; if (!A) return false;
  if (bouge) { arreter(); return false; }
  A.t += dt; S.anim = A.type === 'cuisine' ? 'parle' : 'idle';
  if (S.moi) { S.moi.visible = true; S.moi.position.set(S.x, S.y, S.z); S.moi.rotation.set(0, S.cap, 0); S.moi.userData.jouer(S.anim); }
  if (H.eau) { // l'eau tombe d'au-dessus de la tête jusqu'au sol
    const a = H.eau.geometry.attributes.position, haut = S.y + A.spot.jet;
    H.eau.userData.graines.forEach(([u, ox, oz], i) => { const f = (u + A.t * 1.6) % 1; a.setXYZ(i, S.x + ox * .28, haut - f * A.spot.jet, S.z + oz * .28); });
    a.needsUpdate = true;
  }
  if (H.brume) { // la buée s'épaissit en 1,5 s, tourne doucement autour de soi et s'efface à la fin
    const a = H.brume.geometry.attributes.position, t = A.t;
    H.brume.material.opacity = .85 * Math.max(0, Math.min(1, t / 1.5, (A.duree - t) / 1.2));
    H.brume.userData.graines.forEach(([u, ox, oz], i) => { const ang = ox * Math.PI + t * (.25 + .15 * oz), r = .12 + .3 * Math.abs(oz); a.setXYZ(i, S.x + Math.cos(ang) * r, S.y + .15 + u * 1.3 + Math.sin(t * .8 + i) * .06, S.z + Math.sin(ang) * r); });
    a.needsUpdate = true;
  }
  if (H.vapeur) { // la vapeur monte de la marmite
    const a = H.vapeur.geometry.attributes.position, [mx, my, mz] = A.spot.marmite, p = dansLaPiece(A.I, mx, mz);
    H.vapeur.userData.graines.forEach(([u, ox, oz], i) => { const f = (u + A.t * .35) % 1; a.setXYZ(i, p.x + ox * (.06 + f * .18), p.y + my + f * .9, p.z + oz * (.06 + f * .18)); });
    a.needsUpdate = true;
  }
  if (A.t >= A.duree) { const fin = A.fin; finActivite(); fin(); }
  return true;
}
