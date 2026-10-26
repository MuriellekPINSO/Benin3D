import * as THREE from 'three';
import { bruit, son } from './audio.js';
import { toXZ } from './base.js';
import { personne } from './discussions.js';
import { PLACES, QUARTIERS } from './donnees-lieux.js';
import { INTERIEURS, dansLaPiece, declarerInterieur, etiquette } from './interieurs.js';
import { K, groupeLieu, panneauTexte } from './lieux.js';
import { poserAssis } from './personnages.js';
import { dansBatiment, surChaussee } from './rue.js';
import { scene } from './scene.js';
import { T, choisir, tenirPlat } from './trajets.js';
import { LOGEMENTS, VIE, depenser, louerLogement } from './vie.js';
import { ROAD_W, roadLines } from './ville.js';

// ---------- Chez soi : la journée commence au lit ----------
// En entrant dans le salon, on se réveille chez soi, couché sous son pagne : la chambre d'une maison en cour
// commune à Akpakpa (Débrouillard), l'appartement de la Haie Vive (Fils à papa), ou une natte chez un ami
// quand le propriétaire a repris la chambre. On se lève, on se douche (au seau dans la cabine de la cour, ou
// sous la douche de l'appartement), on cuisine (ingrédients payés avec l'argent de « Ma vie »), on mange à
// table, puis on sort : la porte donne sur une vraie rue du quartier, où une étiquette « Chez toi » permet
// de revenir. Le logement est une pièce comme les autres (interieurs.js), mais privée : les amis du salon ne
// la voient pas, et personne d'autre ne peut y entrer.
// visite : ce qu'on visite avant de le louer (menu « Louer un logement », salon.js) ; le loyer est dans vie.js (LOGEMENTS).
const LOGIS = {
  chambre: { quartier: 'Akpakpa', plan: 'cour', nom: 'ta chambre', entrer: 'Rentrer dans ta chambre', titre: 'dans ta chambre, au fond d’une cour commune d’Akpakpa', visite: 'la chambre' },
  ami: { quartier: 'Gbégamey', plan: 'cour', ami: true, nom: 'chez ton ami', entrer: 'Rentrer chez ton ami', titre: 'chez ton ami, à Gbégamey, sur une natte' },
  appartement: { lieu: 'haievive', plan: 'appart', nom: 'ton appartement', entrer: 'Rentrer dans ton appartement', titre: 'dans ton appartement de la Haie Vive', visite: 'l’appartement' },
  villa: { quartier: 'Fidjrossè', plan: 'villa', nom: 'ta villa', entrer: 'Rentrer dans ta villa', titre: 'dans ta villa de Fidjrossè', visite: 'la villa' },
};
/** Les logements qu'on peut louer, du moins cher au plus cher. */
export const A_LOUER = ['chambre', 'appartement', 'villa'];
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
  const louer = etiquette('À louer'); louer.position.set(0, 3.6, .4); louer.visible = false; g.add(louer);
  declarerInterieur(id, {
    nom: D.nom, entrer: D.entrer, titre: D.titre, logis: D, logement, prive: true, plafond: 2.7, etiquette: etq, aLouer: louer,
    porte: [P.x - P.nx * 1.4, P.z - P.nz * 1.4], dehors, centre: [P.x, 7400], // en mer, plus loin que les autres pièces
    ...(D.plan === 'villa' ? { w: 12 - 2 * DX_VILLA, d: 9, entree: [1 + DX_VILLA, -3.7, 0], construire: I => { villa(I); reperes(I); } } // derrière un portail, comme une vraie villa
      : appart ? { w: 12, d: 9, entree: [1, -3.7, 0], construire: I => { appartement(I); reperes(I); } } : { w: 12, d: 10, entree: [1.5, -4.2, 0], construire: I => { cour(I); reperes(I); } }),
  });
  return INTERIEURS.get(id);
}
/** Le logement du joueur (déclaré à la première demande), ou null sans « Ma vie ». */
export const maisonActuelle = () => (VIE.data ? declarer(VIE.data.logement || 'ami') : null);
/** Un logement à visiter (déclaré à la première demande) : sa porte, puis sa pièce. */
export const logement = id => (LOGIS[id] ? declarer(id) : null);

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
function chaise(I, x, z, cap, couleur = '#f4f2ec', h = .475) { // chaise monobloc en plastique, où l'on peut s'asseoir ; h : dessus de l'assise
  const m = K.mat(couleur, { rugosite: .5 }), g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = cap; K.racine.add(g);
  K.boite(.46, .05, .44, m, 0, h - .025, 0, g); K.boite(.46, .48, .05, m, 0, h + .245, -.22, g);
  for (const [a, b] of [[-.2, -.19], [.2, -.19], [-.2, .19], [.2, .19]]) K.boite(.04, h - .025, .04, m, a, (h - .025) / 2, b, g);
  I.sieges.push({ x, z, cap });
}
// Le petit tabouret de bois des femmes qui lavent le linge à la bassine.
function tabouret(I, x, z, cap, h) {
  const bois = K.mat('#8a6a4a', { rugosite: .8 }), g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = cap; K.racine.add(g);
  K.boite(.38, .04, .32, bois, 0, h - .02, 0, g);
  for (const [a, b] of [[-.15, -.12], [.15, -.12], [-.15, .12], [.15, .12]]) K.boite(.04, h - .04, .04, bois, a, (h - .04) / 2, b, g);
  meuble(I, .38, .32, x, z, h);
}
function table(I, w, d, x, z, couleur, h = .74) {
  const m = K.mat(couleur, { rugosite: .6 });
  K.boite(w, .05, d, m, x, h, z); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.boite(.05, h, .05, m, x + a * (w / 2 - .06), h / 2, z + b * (d / 2 - .06));
  meuble(I, w, d, x, z, h + .05);
}
/**
 * Le lit (ou la natte) : a = direction de la tête vers les pieds. Couché, le pagne est drapé sur le corps jusqu'à la
 * poitrine et l'oreiller prend la hauteur de la nuque (border, plus bas) ; debout, le pagne est plié au pied du lit.
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
  const oreiller = K.boite(1, 1, 1, '#ffffff', 0, y + .05, -long / 2 + .22, g); oreiller.scale.set(Math.min(larg - .2, .56), .1, .32); // à la taille de la tête, au coucher
  const deplie = new THREE.Mesh(new THREE.BufferGeometry(), K.tex('pagneWax', 1, 1, '#ffffff', { face2: true })); deplie.visible = false; deplie.receiveShadow = true; g.add(deplie); // drapé au coucher
  const plie = K.boite(larg - .12, .06, .38, pagne, 0, y + .03, long / 2 - .24, g);
  const droit = Math.abs(Math.sin(a)) < .5; meuble(I, droit ? larg + .1 : long + .1, droit ? long + .1 : larg + .1, x, z, natte ? .05 : .6);
  I.lit = { x, z, a, y, larg, long, g, vue, leve, deplie, plie, oreiller };
}
// Les voisins, debout ou assis. « La maman est encore coincée dans la chaise » (Carlos, 26/10) : son bassin était posé
// à hauteur d'assise, ses fesses 19 cm plus bas, et la chaise lui traversait les cuisses ; au lever du joueur, son salut
// (une animation debout) la relevait même à travers l'assise. Le siège est maintenant fait à sa mesure : les fesses
// dessus, les pieds au sol (pour elle, un tabouret de 29 cm, celui qu'on prend pour laver le linge), et elle reste assise.
function personnes(I, liste) {
  for (const [graine, role, x, z, cap, siege, couleur] of liste) {
    const p = personne(graine, { role, assise: !!siege }); K.racine.add(p); I.pnj = I.pnj || p;
    if (!siege) { p.position.set(x, 0, z); p.rotation.y = cap; continue; }
    p.userData.jouer?.('assis'); // pas la pose du téléphone : les mesures sont celles de « assis »
    const A = p.userData.assise, h = A ? A.pieds - A.fesses : siege === 'tabouret' ? .3 : .475; // hauteur d'assise qui laisse les pieds au sol
    if (siege === 'tabouret') { const ht = THREE.MathUtils.clamp(h, .22, .45); tabouret(I, x, z, cap, ht); poserAssis(p, x, ht, z, cap); }
    else { const hc = THREE.MathUtils.clamp(h, .38, .5); chaise(I, x, z, cap, couleur, hc); I.sieges[I.sieges.length - 1].occupe = true; poserAssis(p, x, hc, z, cap, .195); } // .195 : devant du dossier
  }
}

// ---------- Dehors, à ciel ouvert ----------
// « Un arbre et une corde à linge ne peuvent pas être à l'intérieur d'une maison comme ça » (Carlos, 26/10). Rien ne
// couvrait le manguier ni la corde, mais on ne le voyait pas : la caméra reste sous 2 m, et la cour avait tout d'une
// grande pièce — un soubassement ocre peint sur les quatre murs, un sol lisse, l'auvent de la cuisine juste au-dessus
// de la tête, et pas un coin de ciel. Elle a maintenant l'allure d'une cour d'Akpakpa : sol de sable, clôture de
// parpaings bruts côté rue, plus basse, la chambre et les voisins sous leurs toits de tôle, des cocotiers par-dessus le
// mur. Et ce qui pousse ou sèche dehors est posé par `dehors` : jamais sous un toit, une avancée, l'auvent ni dans la
// cabine de douche (I.toits), quelle que soit la disposition du logement.
function aCielOuvert(I, x, z, rx, rz = rx) {
  if (Math.abs(x) + rx > I.w / 2 - .2 || Math.abs(z) + rz > I.d / 2 - .2) return false; // dans l'enceinte, à 20 cm des murs
  return !I.toits.some(([x0, z0, x1, z1]) => x + rx > x0 && x - rx < x1 && z + rz > z0 && z - rz < z1);
}
/** La place à ciel ouvert la plus proche de (x, z) pour un objet de demi-largeurs rx, rz (sa ramure comprise). */
function dehors(I, x, z, rx, rz = rx) {
  if (aCielOuvert(I, x, z, rx, rz)) return [x, z];
  let best = [x, z], bd = Infinity;
  for (let px = -I.w / 2; px <= I.w / 2; px += .25) for (let pz = -I.d / 2; pz <= I.d / 2; pz += .25) { const d = Math.hypot(px - x, pz - z); if (d < bd && aCielOuvert(I, px, pz, rx, rz)) { bd = d; best = [px, pz]; } }
  return best;
}
K.motif('parpaing', (c, t) => { // parpaings bruts et joints de ciment : la clôture d'une parcelle (un carreau : 2 × 6 blocs de 40 × 20 cm)
  c.fillStyle = '#8f8b83'; c.fillRect(0, 0, t, t);
  const h = t / 6, l = t / 2;
  for (let r = 0; r < 6; r++) for (let k = -1; k < 3; k++) { c.fillStyle = ['#a8a59c', '#a29f96', '#aeaba2', '#9c988f'][(r * 3 + k + 4) % 4]; c.fillRect(k * l + (r % 2 ? l / 2 : 0) + 2, r * h + 2, l - 4, h - 4); }
  for (let i = 0; i < 900; i++) { c.fillStyle = ['#8a867e', '#b8b5ac', '#7d786f'][i % 3]; c.fillRect((i * 37) % t, (i * 91 + i * i) % t, 2, 2); }
});

// ---------- Maison en cour commune (Akpakpa ; chez l'ami, à Gbégamey) ----------
// La cour de sable à ciel ouvert, le manguier, la cabine de douche au seau, le coin cuisine sous l'auvent
// (réchaud à gaz, marmite), une table et deux chaises, les portes des voisins ; la chambre dans un coin, sous son
// toit de tôle : plafond de contreplaqué, ventilateur, lit en bois et drap de pagne.
function cour(I) {
  const W = I.w, D = I.d, Hm = 2.8, Hc = 2.4, ami = !!I.logis.ami;
  const enduit = K.mat('#e6d8bd', { rugosite: .95 }), crepi = K.mat('#9d9585', { rugosite: 1 }), bois = K.mat('#6b4a2f', { rugosite: .7 }), bleu = K.mat('#2f5f8a', { rugosite: .55, metal: .2 });
  const tole = K.tex('tole', 1.8, 1.6, '#c9b8a4', { metal: .3 }), parpaing = n => K.tex('parpaing', n / .8, Hc / 1.2);
  // Sous un toit : la chambre et son avancée, l'avancée des voisins, l'auvent de la cuisine, la cabine de douche.
  I.toits = [[-6.35, .15, -.6, 5.3], [5.35, -5, 6, 5], [2.9, 2.4, 6.1, 5.1], [3.8, -5, 6, -3]];
  // Le sol : du sable, et une dalle de ciment devant la chambre et devant les portes des voisins.
  sansOmbre(K.boite(W, .2, D, K.tex('sable', W / 2.5, D / 2.5), 0, -.1, 0));
  for (const [w, d, x, z] of [[5.1, .9, -3.45, .05], [.9, 5.3, W / 2 - .45, -.3]]) sansOmbre(K.boite(w, .02, d, K.tex('cimentSol', w / 3, d / 3), x, -.005, z));
  // Les murs. Au nord (côté rue, avec le portail) et à l'ouest, la clôture de parpaings, plus basse, sous le ciel ; au sud,
  // le dos de la maison voisine ; à l'est, la façade des voisins ; la chambre a ses propres murs.
  for (const [w, d, x, z] of [[W, .25, 0, -D / 2], [.25, 5.6, -W / 2, -2.2]]) { sansOmbre(K.boite(w, Hc, d, parpaing(Math.max(w, d)), x, Hc / 2, z)); sansOmbre(K.boite(w + .06, .06, d + .06, '#8a867e', x, Hc + .03, z)); } // et leur chaperon
  for (const [w, d, x, z] of [[.25, 4.4, -W / 2, 2.8], [5, .25, -3.5, D / 2], [7, .25, 2.5, D / 2], [.25, D, W / 2, 0]]) sansOmbre(K.boite(w, Hm, d, enduit, x, Hm / 2, z));
  sansOmbre(K.boite(.02, .6, D - .3, crepi, W / 2 - .135, .3, 0)); // soubassement de ciment de la façade des voisins
  K.boite(2.44, 2.3, .06, bleu, 1.5, 1.15, -D / 2 + .16).castShadow = false; // le portail
  // Les toits de tôle : la chambre (pente vers la cour, avancée de 45 cm), les voisins à l'est (avancée de 65 cm), la
  // maison du sud. Rien au-dessus de la clôture : on y voit le ciel, la maison d'en face et deux cocotiers.
  K.boite(5.75, .05, 5.15, tole, -3.475, 3.05, 2.725).rotation.x = -.12;
  K.boite(3.95, .05, D + .5, tole, 7.325, 3.08, 0).rotation.z = .12;
  sansOmbre(K.boite(W + 3, .06, 3, '#8d5a3b', 0, 3.25, D / 2 + 1.8)).rotation.x = .18;
  sansOmbre(K.boite(7, 3.1, 4, K.mat('#d8c9a8', { rugosite: .95 }), -1.5, 1.55, -D / 2 - 4.6)); K.boite(7.6, .05, 4.6, tole, -1.5, 3.25, -D / 2 - 4.6).rotation.x = .1; // la maison d'en face, de l'autre côté de la rue
  for (const [x, z] of [[-W / 2 - 3, -D / 2 - 2.5], [W / 2 - 1, -D / 2 - 7]]) K.cocotier(x, z, false);
  // La chambre (sud-ouest) : cloisons, porte ouverte, plafond, ampoule.
  sansOmbre(K.boite(5, .02, 4.4, K.tex('carreauxSol', 2.5, 2.2), -3.5, .01, 2.8));
  cloison(I, 3.5, .2, -4.25, .6, Hm, enduit); cloison(I, .4, .2, -1.2, .6, Hm, enduit); cloison(I, .2, 4.4, -1, 2.8, Hm, enduit); // porte de 1,1 m
  sansOmbre(K.boite(1.1, .6, .2, enduit, -1.95, 2.5, .6));
  for (const [w, d, x, z] of [[3.5, .02, -4.25, .49], [.4, .02, -1.2, .49], [.02, 4.4, -.89, 2.8]]) sansOmbre(K.boite(w, .6, d, crepi, x, .3, z)); // soubassement de la façade
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
  const auvent = K.boite(3.1, .04, 2.6, tole, 4.5, 2.62, 3.75); auvent.rotation.x = -.1; // assez haut pour ne pas faire plafond au-dessus de la caméra
  for (const z of [2.55, 4.85]) { K.cyl(.04, .04, 2.6, 6, '#6d7478', 3.0, 1.3, z); meuble(I, .1, .1, 3.0, z, 2.6); }
  table(I, 1.5, .7, 4.5, 4.45, '#8a6a4a', .8);
  K.cyl(.2, .2, .08, 14, '#2b2f33', 4.3, .87, 4.45);
  const feu = sansOmbre(K.cyl(.0, .12, .08, 12, K.mat('#4da3ff', { emissif: '#2f7fff', transparent: .8 }), 4.3, .95, 4.45)); feu.visible = false;
  K.cyl(.17, .17, .2, 16, K.mat('#b8bcbf', { metal: .3, rugosite: .35 }), 4.3, 1.01, 4.45); K.cyl(.175, .175, .02, 16, '#9aa0a3', 4.3, 1.12, 4.45);
  K.cyl(.15, .15, .45, 14, K.mat('#1f5fa8', { rugosite: .5 }), 5.6, .23, 4.65); meuble(I, .35, .35, 5.6, 4.65, .5);
  for (const [dx, c] of [[.45, '#c0392b'], [.55, '#d35400'], [.62, '#c0392b'], [.7, '#8e44ad']]) K.sphere(.045, c, 4.3 + dx, .87, 4.35);
  I.fourneau = { x: 4.3, z: 3.75, cap: 0, marmite: [4.3, 1.15, 4.45], feu, plan: 'cour' };
  // Table et chaises de la cour, manguier, banc, corde à linge.
  table(I, .9, .9, 1.0, 1.6, '#f2f0ea', .72); chaise(I, .35, 1.6, Math.PI / 2); if (!ami) chaise(I, 1.65, 1.6, -Math.PI / 2); // chez l'ami, la sienne est faite à sa mesure (personnes)
  // Le manguier : ramure (1,75 m de rayon) au-dessus de 2,6 m, toute à ciel ouvert, et la terre nue à son pied.
  const [mx, mz] = dehors(I, -3, -2.6, 1.75);
  K.cyl(.2, .3, 3, 10, '#6b4a2f', mx, 1.5, mz); meuble(I, .6, .6, mx, mz, 3);
  sansOmbre(K.cyl(1.1, 1.1, .01, 20, '#8a6f4e', mx, .006, mz));
  for (const [dx, dy, dz, r] of [[0, 4.3, 0, 1.7], [1, 4, .6, 1.2], [-.9, 3.9, -.5, 1.2]]) K.sphere(r, K.mat('#3f6e34', { rugosite: .9 }), mx + dx, dy, mz + dz);
  K.boite(1.5, .06, .4, bois, -1.6, .45, -3.4); meuble(I, 1.5, .4, -1.6, -3.4, .5); I.sieges.push({ x: -1.9, z: -3.4, cap: 0 }, { x: -1.3, z: -3.4, cap: 0 });
  // La corde à linge, tendue entre deux poteaux plantés dans le sable, à l'ombre du manguier.
  const [cx, cz] = dehors(I, -3.55, -1.25, 2.05, .15);
  for (const s of [-1, 1]) { K.cyl(.025, .025, 2, 6, '#6d7478', cx + s * 1.95, 1, cz); meuble(I, .12, .12, cx + s * 1.95, cz, 2); }
  K.cable([cx - 1.95, 1.95, cz], [cx + 1.95, 1.95, cz], .008, '#e9e6de');
  for (const [dx, c] of [[-1.45, '#1f3f8a'], [-.6, '#d9661f'], [.25, '#7a1f2b'], [1.1, '#f2c21b']]) K.boite(.75, .85, .01, c, cx + dx, 1.5, cz).castShadow = false;
  // Les portes des voisins, à l'est, et une voisine qui lave le linge dans une bassine.
  for (const z of [-1.4, .9]) { K.boite(.04, 2.1, .9, z < 0 ? bleu : K.mat('#2f6b4f'), W / 2 - .16, 1.05, z); K.boite(.03, .5, .6, K.mat('#9fc3d1', { emissif: '#6f8f9c' }), W / 2 - .15, 1.6, z + 1.05).castShadow = false; }
  K.cyl(.38, .3, .2, 16, K.mat('#9aa5ad', { metal: .3, rugosite: .4 }), 3.3, .1, -.45); meuble(I, .8, .8, 3.3, -.45, .3);
  personnes(I, [...(ami ? [[881, 'jeune', 1.65, 1.6, -Math.PI / 2, 'chaise']] : []), [882, 'maman', 4.1, -.45, -Math.PI / 2, 'tabouret']]);
}

// ---------- Appartement (Haie Vive) ----------
// Séjour avec canapé et télévision, table à manger, cuisine équipée (cuisinière, réfrigérateur), chambre
// avec grand lit et climatiseur, salle de bains avec douche. `baie` : la villa ouvre son séjour sur le jardin.
function appartement(I, { w = I.w, d = I.d, baie = false } = {}) {
  const W = w, D = d, Hm = 2.8;
  const blanc = K.mat('#f2eee6', { rugosite: .9 }), bois = K.mat('#6b4a2f', { rugosite: .6 }), jour = K.mat('#cfe3ee', { emissif: '#9fb9c4' });
  sansOmbre(K.boite(W, .2, D, K.tex('carrelageClair', W / 2, D / 2), 0, -.1, 0));
  sansOmbre(K.boite(W, .1, D, '#f7f5f0', 0, 2.8, 0));
  for (const [w, d, x, z] of [[W, .25, 0, -D / 2], [W, .25, 0, D / 2], [.25, D, -W / 2, 0], ...(baie ? [] : [[.25, D, W / 2, 0]])]) sansOmbre(K.boite(w, Hm, d, blanc, x, Hm / 2, z));
  if (baie) { // le mur est du séjour, percé d'une baie vitrée ouverte de 2,5 m entre la télévision et le réfrigérateur
    cloison(I, .25, 3.3, W / 2, -D / 2 + 1.65, Hm, blanc); cloison(I, .25, 3.2, W / 2, D / 2 - 1.6, Hm, blanc);
    sansOmbre(K.boite(.25, .5, 2.5, blanc, W / 2, 2.55, .05));
    K.boite(.04, 2.3, 1.2, K.mat('#bfe0ea', { transparent: .35, rugosite: .05 }), W / 2 + .16, 1.15, -1.85).castShadow = false; // le vantail repoussé contre le mur
  }
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

// ---------- Villa (Fidjrossè) ----------
// La maison de l'appartement en plus grand train : la même distribution, décalée vers l'ouest, et à l'est, par la baie
// vitrée du séjour, le jardin à ciel ouvert : pelouse, piscine et sa plage carrelée, deux chiliennes, un parasol, des
// cocotiers et le mur de clôture. Le jardin fait 6 m sur 9.
const DX_VILLA = -3;
function villa(I) {
  const n = { o: I.obstacles.length, s: I.sieges.length }, g = new THREE.Group(); g.position.x = DX_VILLA; K.racine.add(g);
  K.into(g, () => appartement(I, { w: 12, d: 9, baie: true }));
  // La maison est construite dans son propre repère : on décale d'autant ce qu'elle a déclaré (murs, meubles, sièges, lit…).
  for (const o of I.obstacles.slice(n.o)) o[0] += DX_VILLA;
  for (const c of I.sieges.slice(n.s)) c.x += DX_VILLA;
  I.douche.x += DX_VILLA; I.fourneau.x += DX_VILLA; I.fourneau.marmite = [I.fourneau.marmite[0] + DX_VILLA, I.fourneau.marmite[1], I.fourneau.marmite[2]];
  I.lit.x += DX_VILLA; I.lit.leve = [I.lit.leve[0] + DX_VILLA, I.lit.leve[1], I.lit.leve[2]];
  // Le jardin : de x = 3 (la baie) à x = 9 (la clôture).
  const x0 = 6 + DX_VILLA, x1 = I.w / 2, D = I.d, cx = (x0 + x1) / 2, Lj = x1 - x0;
  const enduit = K.mat('#efe6d6', { rugosite: .95 }), herbe = K.mat('#5f8f3e', { rugosite: 1 }), dalle = K.tex('carrelageClair', 2, 3);
  sansOmbre(K.boite(Lj, .2, D, herbe, cx, -.1, 0));
  for (const [w, d, x, z] of [[Lj, .25, cx, -D / 2], [Lj, .25, cx, D / 2], [.25, D, x1, 0]]) sansOmbre(K.boite(w, 2.4, d, enduit, x, 1.2, z));
  for (const [w, d, x, z] of [[Lj, .3, cx, -D / 2 + .02], [Lj, .3, cx, D / 2 - .02], [.3, D, x1 - .02, 0]]) sansOmbre(K.boite(w, .08, d, '#d9c7a4', x, 2.44, z)); // chaperon du mur
  // La piscine, dans sa plage de carreaux : on n'y tombe pas (un obstacle bas tout autour de l'eau).
  const px = 6.8, pz = 1.2, pw = 2.6, pd = 4.4;
  sansOmbre(K.boite(pw + 1.2, .04, pd + 1.2, dalle, px, .02, pz));
  sansOmbre(K.boite(pw, .03, pd, '#1b5f78', px, .03, pz)); // le fond, vu à travers l'eau
  sansOmbre(K.boite(pw - .1, .02, pd - .1, K.mat('#3fb6d8', { transparent: .7, rugosite: .05, emissif: '#1d6f8c' }), px, .06, pz));
  for (const [w, d, x, z] of [[pw + .2, .1, px, pz - pd / 2 - .05], [pw + .2, .1, px, pz + pd / 2 + .05], [.1, pd, px - pw / 2 - .05, pz], [.1, pd, px + pw / 2 + .05, pz]]) sansOmbre(K.boite(w, .08, d, '#f4f2ec', x, .07, z)); // margelle
  meuble(I, pw + .2, pd + .2, px, pz, .1);
  K.cyl(.02, .02, .9, 6, '#c9cdd0', px - pw / 2 + .25, .45, pz - pd / 2 + .02); K.cyl(.02, .02, .9, 6, '#c9cdd0', px - pw / 2 + .55, .45, pz - pd / 2 + .02); // l'échelle
  // Deux chiliennes face à l'eau, et le parasol entre elles.
  const toile = K.mat('#e9b23a', { rugosite: .8 }), cadre = K.mat('#f4f2ec', { rugosite: .5 });
  for (const x of [5.2, 7.6]) {
    const c = new THREE.Group(); c.position.set(x, 0, -2.9); K.racine.add(c);
    K.boite(.7, .08, 1.7, cadre, 0, .32, 0, c); K.boite(.62, .04, 1.1, toile, 0, .38, .25, c);
    const dos = K.boite(.62, .04, .7, toile, 0, .58, -.55, c); dos.rotation.x = -.7;
    for (const [a, b] of [[-.3, -.75], [.3, -.75], [-.3, .75], [.3, .75]]) K.boite(.05, .3, .05, cadre, a, .15, b, c);
    meuble(I, .7, 1.7, x, -2.9, .45); I.sieges.push({ x, z: -2.6, cap: 0 }); // le dossier au nord : on regarde la piscine
  }
  K.cyl(.03, .03, 2.2, 8, '#f4f2ec', 6.4, 1.1, -3.4); meuble(I, .2, .2, 6.4, -3.4, 2.2); const para = K.cyl(.02, 1.3, .45, 12, K.mat('#c0392b', { rugosite: .8 }), 6.4, 2.25, -3.4); para.castShadow = false;
  // Cocotiers dans les angles (leurs palmes passent au-dessus du toit, le tronc reste au jardin : dehors), et des massifs le long de la clôture.
  I.toits = [[-I.w / 2 - .2, -D / 2 - .1, x0 + .2, D / 2 + .1]]; // la maison, jusqu’à la baie (x = 3)
  for (const [x0c, z0c, h] of [[8.4, -3.8, 4.6], [3.9, 3.8, 4.2]]) {
    const [x, z] = dehors(I, x0c, z0c, .3);
    const tronc = K.cyl(.12, .17, h, 8, '#8a6a4a', x, h / 2, z); tronc.rotation.z = x > 6 ? -.08 : .08; meuble(I, .4, .4, x, z, h);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, f = sansOmbre(K.boite(.35, .04, 1.8, K.mat('#3f7a34', { rugosite: .9 }), x + Math.sin(a) * .8, h - .1, z + Math.cos(a) * .8)); f.rotation.y = a; f.rotation.x = .35; }
  }
  for (const z of [-1.2, 3.9]) { K.sphere(.45, K.mat('#4f7a3c', { rugosite: .9 }), x1 - .5, .35, z).scale.set(1, .8, 1.6); meuble(I, .8, 1.4, x1 - .5, z, .7); }
}

// ---------- Couché : le corps sur le matelas, la tête sur l'oreiller, le pagne drapé dessus ----------
// « Le personnage déborde du lit, l'oreiller fait une marche, et le pagne est un pavé » (Carlos, 26/10) : le corps était
// posé à une distance fixe du milieu du lit, quelle que soit sa taille, la tête en l'air au-dessus d'un oreiller de 12 cm,
// sous une boîte de 34 cm d'épaisseur. On ne devine plus : une fois couché, on relève sa peau (les sommets du modèle animé,
// dans le repère du lit). Il glisse pour avoir la tête à 6 cm de la tête de lit, le dos 8 mm dans le matelas ; l'oreiller
// prend la hauteur de sa nuque ; le pagne est un drap fin, 1,5 cm au-dessus de ce qui dépasse (pieds, mains, ventre), qui
// retombe sur les bords du matelas. Refait quand le personnage change (tenue, modèle arrivé en retard).
const DRAP = .04; // pas de la grille du pagne (m)
const poserCouche = c => { const m = H.S.moi; m.visible = true; m.rotation.order = 'YXZ'; m.position.set(c.x, c.y, c.z); m.rotation.set(-Math.PI / 2, c.a, 0); };
function border(I, c) {
  const L = I.lit, moi = H.S.moi, ca = Math.cos(L.a), sa = Math.sin(L.a); c.moi = moi;
  poserCouche(c); moi.userData.velo?.(null); moi.userData.jouer?.('dort'); moi.userData.maj?.(0); moi.updateMatrixWorld(true); L.g.updateMatrixWorld(true);
  // La peau dans le repère du lit : u en travers, h au-dessus du matelas, v depuis la tête de lit.
  const U = [], Hh = [], V = [], p = new THREE.Vector3();
  moi.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i += 2) { o.getVertexPosition(i, p).applyMatrix4(o.matrixWorld); L.g.worldToLocal(p); U.push(p.x); Hh.push(p.y - L.y); V.push(p.z + L.long / 2); }
  });
  if (!U.length) return;
  const os = nom => { const b = moi.getObjectByName?.(nom); if (!b) return null; b.getWorldPosition(p); L.g.worldToLocal(p); return [p.x, p.z + L.long / 2]; };
  const bras = [os('L_Upperarm'), os('R_Upperarm')].filter(Boolean); // avant de le déplacer
  // Le décalage : la tête à 6 cm de la tête de lit, le corps au milieu, le point le plus bas du dos 8 mm dans le matelas.
  const min = a => a.reduce((m, x) => Math.min(m, x), Infinity), max = a => a.reduce((m, x) => Math.max(m, x), -Infinity);
  const dv = .06 - min(V), du = -(min(U) + max(U)) / 2, dh = -.008 - min(Hh);
  c.x += ca * du + sa * dv; c.z += -sa * du + ca * dv; c.y += dh; poserCouche(c);
  for (let i = 0; i < U.length; i++) { U[i] += du; V[i] += dv; Hh[i] += dh; }
  // L'oreiller : sous la tête seulement (13 % de la taille depuis le sommet du crâne : les épaules commencent juste
  // après), aussi haut que l'arrière du crâne.
  const nuque = .06 + .13 * (max(V) - min(V)), lo = Math.min(L.larg - .2, .56) / 2;
  let haut = Infinity; for (let i = 0; i < U.length; i++) if (V[i] < nuque && Math.abs(U[i]) < lo) haut = Math.min(haut, Hh[i]);
  haut = THREE.MathUtils.clamp(haut - .004, .02, .14);
  L.oreiller.scale.set(lo * 2, haut, nuque - .02); L.oreiller.position.set(0, L.y + haut / 2, -L.long / 2 + (nuque + .02) / 2);
  // Le pagne : des aisselles au pied du lit, sur toute la largeur du matelas.
  const v0 = bras.length ? bras.reduce((s, b) => s + b[1], 0) / bras.length + dv + .1 : nuque + .3;
  const nu = Math.max(4, Math.round(L.larg / DRAP)), nv = Math.max(4, Math.round((L.long - v0) / DRAP)), du2 = L.larg / nu, dv2 = (L.long - v0) / nv;
  const g = new Float32Array((nu + 1) * (nv + 1)); // hauteur de la peau sous chaque nœud
  for (let i = 0; i < U.length; i++) {
    if (V[i] < v0 - .1) continue;
    const a = Math.round((U[i] + L.larg / 2) / du2), b = Math.round((V[i] - v0) / dv2);
    if (a >= 0 && a <= nu && b >= -2 && b <= nv) { const k = Math.max(0, b) * (nu + 1) + a; g[k] = Math.max(g[k], Hh[i]); }
  }
  // Drapé : le tissu ne colle pas à la peau, il tombe en pente douce depuis ce qui dépasse (pente 0,6 sur 16 cm autour).
  const R = 4, drape = new Float32Array(g.length);
  for (let b = 0; b <= nv; b++) for (let a = 0; a <= nu; a++) {
    let m = 0;
    for (let y = Math.max(0, b - R); y <= Math.min(nv, b + R); y++) for (let x = Math.max(0, a - R); x <= Math.min(nu, a + R); x++) m = Math.max(m, g[y * (nu + 1) + x] - .6 * Math.hypot((x - a) * du2, (y - b) * dv2));
    drape[b * (nu + 1) + a] = m + .015;
  }
  // La nappe, et ses bords qui retombent sur les côtés et au pied du matelas (jusqu'au sol pour une natte). Le motif suit
  // le tissu déplié (longueurs mesurées le long de la nappe) : sinon il s'étirait en rayures sur les pentes et les bords.
  const chute = Math.min(.12, L.y - .002), col = nu + 3, lig = nv + 2, X = new Float32Array(col * lig), Y = new Float32Array(col * lig), Z = new Float32Array(col * lig);
  for (let b = 0; b < lig; b++) for (let a = -1; a <= nu + 1; a++) {
    const k = b * col + a + 1, bord = a < 0 || a > nu || b > nv;
    X[k] = a < 0 ? -L.larg / 2 - .015 : a > nu ? L.larg / 2 + .015 : -L.larg / 2 + a * du2; Z[k] = b > nv ? L.long + .015 : v0 + b * dv2;
    Y[k] = bord ? -chute : Math.max(.008, drape[b * (nu + 1) + a]);
  }
  const pos = [], uv = [], idx = [], m0 = (col - 1) >> 1;
  for (let b = 0; b < lig; b++) for (let a = 0; a < col; a++) {
    const k = b * col + a; let su = 0, sv = 0;
    for (let x = m0; x !== a; x += a > m0 ? 1 : -1) { const q = b * col + x, r = q + (a > m0 ? 1 : -1); su += Math.hypot(X[r] - X[q], Y[r] - Y[q]) * (a > m0 ? 1 : -1); }
    for (let y = 0; y < b; y++) { const q = y * col + a; sv += Math.hypot(Z[q + col] - Z[q], Y[q + col] - Y[q]); }
    pos.push(X[k], L.y + Y[k], Z[k] - L.long / 2); uv.push(su * 2.5, (v0 + sv) * 2.5);
  }
  for (let b = 0; b < lig - 1; b++) for (let a = 0; a < col - 1; a++) { const k = b * col + a; idx.push(k, k + col, k + 1, k + 1, k + col, k + col + 1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  L.deplie.geometry.dispose(); L.deplie.geometry = geo;
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
    if (I.logis?.plan !== 'cour') H.ligne('La douche est dans la salle de bains : en sortant de la chambre, la porte suivante sur ta droite (étiquette jaune « Douche »).');
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
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage)); // réécrite à chaque image : memoire.js ne doit pas la rendre
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
  if (I !== maisonActuelle()) return I.logis.visite ? [{ texte: `Louer ${I.logis.visite} · ${fmt(LOGEMENTS[I.logement].loyer)} par jour`, f: () => louer(I) }] : [];
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

// ---------- Visiter un logement, puis le louer ----------
// « J'ai la possibilité de louer maison ou maquis, donc la possibilité de visiter la maison » (26/10). Le menu « Louer
// un logement » (salon.js) mène devant la porte, marquée « À louer » ; on visite la pièce, le propriétaire attend près
// de l'entrée, et « Louer » paie le premier jour : le logement devient le sien, « Chez moi » y ramène.
function accueillir(I) {
  if (!I.proprio) { // le propriétaire, près de l'entrée, tourné vers qui arrive
    const [ex, ez, r] = I.entree, p = personne(5150 + I.logement.length, { femme: false });
    p.position.set(ex + Math.sin(r) * 1.7 + Math.cos(r) * .7, 0, ez + Math.cos(r) * 1.7 - Math.sin(r) * .7); p.rotation.y = r + Math.PI;
    I.g.add(p); I.proprio = p; I.obstacleProprio = [p.position.x, p.position.z, .22, .22];
  }
  if (!I.obstacles.includes(I.obstacleProprio)) I.obstacles.push(I.obstacleProprio);
  I.proprio.visible = true; I.proprio.userData.jouer?.('salut');
  const L = LOGEMENTS[I.logement];
  H.ligne(`Le propriétaire : « Bonne arrivée ! Fais le tour, prends ton temps. C’est ${fmt(L.loyer)} par jour, le premier jour d’avance. »`);
}
async function louer(I) {
  if (!(await louerLogement(I.logement))) return;
  H.ligne(`Tu as loué ${I.logis.visite} ! Bienvenue chez toi : douche, cuisine et lit sont à toi. « Aller » → « Chez moi » te ramène ici.`);
  I.proprio?.userData.jouer?.('salut');
}

// ---------- À chaque image ----------
/** Renvoie true quand la maison place elle-même le personnage (couché, douche, cuisine) ; false : on marche. */
export function majMaison(dt, av, tour) {
  const S = H.S; if (!S) return false;
  const mien = maisonActuelle();
  for (const I of INTERIEURS.values()) if (I.prive) {
    const loin = S.actif && !S.lieu && Math.hypot(I.porte[0] - S.x, I.porte[1] - S.z) > 6; // vu de la rue (devant la porte, le bouton suffit)
    I.etiquette.visible = loin && I === mien; // « Chez toi » : seulement chez soi, pas sur l'ancien logement
    I.aLouer.visible = loin && I !== mien && !!I.logis.visite;
    I.entrer = I === mien ? I.logis.entrer : I.logis.visite ? `Visiter ${I.logis.visite}` : 'Rendre visite à ton ami';
    if (I.proprio && I === mien && I.proprio.visible) { I.proprio.visible = false; I.obstacles.splice(I.obstacles.indexOf(I.obstacleProprio), 1); } // loué : il s'en va
  }
  if (S.lieu !== H.lieu) { H.lieu = S.lieu; if (S.lieu?.prive && S.lieu !== mien && S.lieu.logis.visite) accueillir(S.lieu); }
  const bouge = Math.abs(av) > .3 || Math.abs(tour) > .3;
  if (S.couche) {
    if (bouge) { lever(); return false; }
    const c = S.couche; S.anim = 'idle';
    if (S.moi) { if (c.moi !== S.moi && S.lieu?.lit) border(S.lieu, c); poserCouche(c); S.moi.userData.jouer('dort'); }
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
