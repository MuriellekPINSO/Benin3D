import * as THREE from 'three';
import { LITE } from './base.js';
import { chargeurGLB } from './textures.js';

// ---------- Véhicules : zémidjan, tokpa-tokpa, voitures, chèvres, marchandes ----------
// Zém : moto rouge à selle longue, conducteur en chemise jaune numérotée (Cotonou), casque.
// Tokpa-tokpa : vieux minibus blanc, porte latérale ouverte, galerie chargée sous filet. L'apprenti n'est plus dessiné
// accroché dehors : « les aides tokpa-tokpa doivent être dans la voiture » (Carlos, 26/10) ; dans le salon, c'est un
// vrai personnage assis à la porte (metiers.js, assoirApprenti). `apprenti: true` remet l'ancien dessin.
export const B3 = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const C3 = (r1, r2, h, s = 10) => new THREE.CylinderGeometry(r1, r2, h, s);
export function partsZem(c = {}) {
  const P = [], add = (g, hex) => P.push([g, hex]);
  const caro = c.carrosserie || '#a32b26', chemise = c.chemise || '#f2c21b';
  for (const x of [-0.66, 0.68]) { add(new THREE.TorusGeometry(0.29, 0.075, 6, 14).translate(x, 0.33, 0), '#1c1c1e'); add(C3(0.16, 0.16, 0.1, 10).rotateX(Math.PI / 2).translate(x, 0.33, 0), '#b9bdc1'); }
  add(B3(0.62, 0.07, 0.16).translate(0.68, 0.66, 0), caro);
  add(B3(0.5, 0.28, 0.27).translate(0.2, 0.86, 0), caro);
  add(B3(0.42, 0.3, 0.24).translate(-0.02, 0.52, 0), '#6f7377');
  add(C3(0.04, 0.04, 0.8, 6).rotateZ(Math.PI / 2).translate(-0.36, 0.42, 0.17), '#c9ccd0');
  add(B3(0.98, 0.12, 0.3).translate(-0.33, 0.97, 0), c.selle || '#2f5f86');
  add(B3(0.5, 0.05, 0.3).translate(-0.86, 0.92, 0), '#3a3a3c');
  add(B3(0.72, 0.18, 0.2).translate(-0.6, 0.72, 0), caro);
  for (const z of [0.09, -0.09]) add(C3(0.028, 0.028, 0.78, 6).rotateZ(-0.38).translate(0.6, 0.72, z), '#c9ccd0');
  add(C3(0.022, 0.022, 0.74, 6).rotateX(Math.PI / 2).translate(0.47, 1.12, 0), '#c9ccd0');
  add(new THREE.SphereGeometry(0.1, 8, 6).translate(0.66, 1.0, 0), '#f6efd6');
  add(B3(0.05, 0.08, 0.2).translate(-1.1, 0.84, 0), '#d8342a');
  if (c.pilote !== false) {
    for (const z of [0.13, -0.13]) { add(B3(0.44, 0.15, 0.14).rotateZ(-0.25).translate(0.1, 0.98, z), '#2d3e5a'); add(B3(0.12, 0.44, 0.12).translate(0.31, 0.66, z + Math.sign(z) * 0.04), '#2d3e5a'); add(B3(0.2, 0.08, 0.1).translate(0.36, 0.43, z + Math.sign(z) * 0.04), '#1a1a1a'); }
    add(B3(0.28, 0.58, 0.42).rotateZ(-0.28).translate(-0.08, 1.34, 0), chemise);
    for (const z of [0.22, -0.22]) add(C3(0.055, 0.05, 0.52, 6).rotateZ(1.15).translate(0.2, 1.38, z), chemise);
    add(C3(0.06, 0.06, 0.12, 8).translate(0.0, 1.66, 0), '#4a2f22');
    add(new THREE.SphereGeometry(0.17, 10, 8).scale(1.12, 0.95, 1).translate(0.02, 1.8, 0), c.casque || '#1d2733');
    add(new THREE.SphereGeometry(0.176, 10, 3, Math.PI - .9, 1.8, .38 * Math.PI, .2 * Math.PI).scale(1.12, 0.95, 1).translate(0.02, 1.8, 0), '#15181c'); // l'écran fumé d'un casque intégral (avant vers +x)
    add(B3(0.03, 0.08, 0.26).translate(0.19, 1.78, 0), '#0f1418');
  }
  if (c.passager) {
    add(B3(0.32, 0.5, 0.44).rotateZ(-0.1).translate(-0.62, 1.3, 0), c.passager);
    add(B3(0.4, 0.14, 0.42).translate(-0.5, 1.02, 0), c.passager);
    add(new THREE.SphereGeometry(0.13, 8, 6).translate(-0.6, 1.68, 0), '#4a2f22');
    add(new THREE.SphereGeometry(0.15, 8, 6).scale(1, 0.7, 1).translate(-0.6, 1.8, 0), c.foulard || '#e2672a');
  }
  return P;
}
// ---------- Vélo Caï Caï (le loueur du jeu, voir caicai.js) ----------
// Leurs vélos de ville, d'après leurs photos : cadre blanc, jantes bleu ciel, guidon relevé, porte-bagages
// arrière. Le canard orange de leur logo est peint sur le cadre. Le cycliste est en option : sur un vélo
// garé il n'y a personne, et celui que le joueur enfourche le montre, lui, avec son propre personnage.
export const CAI = { cadre: '#f4f6f7', jante: '#0c8fd0', canard: '#f9912b', pneu: '#1c1c1e', acier: '#b9bdc1' };
export function partsVelo(c = {}) {
  const P = [], add = (g, hex) => P.push([g, hex]);
  const cadre = c.cadre || CAI.cadre, jante = c.jante || CAI.jante;
  // Un tube du point (ax, ay) au point (bx, by), vu de côté : le cylindre pointe vers +y, on le couche.
  const tube = (ax, ay, bx, by, r, hex, z = 0) => {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || .001;
    add(C3(r, r, L, 6).rotateZ(Math.atan2(-dx, dy)).translate((ax + bx) / 2, (ay + by) / 2, z), hex);
  };
  for (const x of [-.55, .55]) { // pneu, jante bleue, moyeu
    add(new THREE.TorusGeometry(.34, .042, 5, 18).translate(x, .34, 0), CAI.pneu);
    add(new THREE.TorusGeometry(.295, .022, 4, 18).translate(x, .34, 0), jante);
    add(C3(.05, .05, .09, 6).rotateX(Math.PI / 2).translate(x, .34, 0), CAI.acier);
  }
  tube(-.55, .34, -.02, .33, .028, cadre); tube(-.55, .34, -.3, .88, .026, cadre); // bases et haubans
  tube(-.02, .33, -.3, .9, .034, cadre); tube(-.02, .33, .47, .74, .036, cadre); // tube de selle, tube diagonal
  tube(-.29, .86, .46, .78, .032, cadre); tube(.47, .74, .45, .95, .032, cadre); // tube supérieur, tube de direction
  tube(.46, .9, .55, .34, .027, CAI.acier, .055); tube(.46, .9, .55, .34, .027, CAI.acier, -.055); // fourche
  add(B3(.26, .07, .13).translate(-.3, .95, 0), '#2a2622'); // selle
  tube(-.3, .9, -.3, .96, .026, CAI.acier);
  add(C3(.022, .022, .46, 6).rotateX(Math.PI / 2).translate(.45, 1.02, 0), CAI.acier); // guidon relevé
  for (const z of [.23, -.23]) add(C3(.024, .024, .13, 5).rotateZ(Math.PI / 2).translate(.39, 1.02, z), '#2a2622'); // poignées
  add(C3(.09, .09, .03, 10).rotateX(Math.PI / 2).translate(-.02, .33, .06), '#4a4a4c'); // plateau
  for (const z of [.1, -.1]) add(C3(.016, .016, .34, 5).rotateZ(.5).translate(-.02, .33, z), CAI.acier); // manivelles
  for (const [x, y, z] of [[.1, .21, .12], [-.12, .5, -.12]]) add(B3(.11, .025, .055).translate(x, y, z), '#2a2622'); // pédales, sous les pieds du cycliste
  add(B3(.3, .025, .22).translate(-.5, .78, 0), CAI.acier); // porte-bagages
  for (const z of [.09, -.09]) tube(-.42, .78, -.55, .36, .015, CAI.acier, z);
  if (c.canard !== false) add(new THREE.SphereGeometry(.055, 7, 5).scale(1.5, 1, .35).translate(.16, .56, .035), CAI.canard); // le canard peint sur le tube diagonal
  if (c.pilote) { // en selle, le dos droit et les mains sur le guidon : un vélo de ville, pas un coureur
    const haut = c.haut || '#2f6fb0', peau = c.peau || '#5a3a26', bas = c.bas || '#2b2f36';
    tube(-.26, .97, -.17, 1.44, .145, haut); // le buste, de la selle aux épaules
    for (const z of [.17, -.17]) tube(-.17, 1.42, .38, 1.04, .045, haut, z); // les bras jusqu'aux poignées
    // Une jambe pousse la pédale basse, l'autre remonte : chaque segment va de l'articulation à la suivante,
    // sinon les cuisses flottent à côté du cadre (les pédales sont posées plus haut, aux mêmes points).
    for (const [z, genou, pedale] of [[.11, [.13, .63], [.1, .21]], [-.11, [.1, .7], [-.12, .5]]]) {
      tube(-.22, .95, genou[0], genou[1], .065, bas, z);
      tube(genou[0], genou[1], pedale[0], pedale[1], .05, peau, z);
    }
    add(C3(.05, .05, .1, 7).translate(-.16, 1.5, 0), peau);
    add(new THREE.SphereGeometry(.14, 9, 7).scale(1.05, 1, 1).translate(-.14, 1.62, 0), peau);
    if (c.casque !== false) add(new THREE.SphereGeometry(.155, 9, 6).scale(1.05, .72, 1).translate(-.14, 1.69, 0), c.casque || CAI.jante);
  }
  if (c.panier) { add(B3(.26, .18, .3).translate(.52, .96, 0), '#c9a26b'); add(B3(.24, .03, .28).translate(.52, 1.05, 0), '#8f6f45'); }
  return P;
}
export function partsTokpa(c = {}) {
  const P = [], add = (g, hex) => P.push([g, hex]);
  const s = new THREE.Shape();
  s.moveTo(-2.45, 0.42); s.lineTo(2.2, 0.42); s.lineTo(2.45, 0.62); s.lineTo(2.45, 1.05); s.lineTo(2.22, 1.17); s.lineTo(1.72, 2.05); s.lineTo(-2.38, 2.1); s.lineTo(-2.45, 1.92); s.closePath();
  add(new THREE.ExtrudeGeometry(s, { depth: 1.86, bevelEnabled: false }).translate(0, 0, -0.93), c.couleur || '#e9e6dc');
  add(B3(3.5, 0.55, 1.9).translate(-0.4, 1.63, 0), '#27323a');
  add(B3(0.05, 1.02, 1.7).rotateZ(0.507).translate(1.99, 1.6, 0), '#2b3a44');
  add(B3(0.06, 0.5, 1.6).translate(-2.46, 1.6, 0), '#27323a');
  add(B3(1.0, 1.4, 0.05).translate(0.45, 1.18, 0.94), '#121619');
  // La bande verte, peinte tout autour : quatre lames sur la carrosserie, pas un plateau en travers de l'habitacle (on le
  // voyait passer à travers les genoux de l'apprenti par la porte ouverte, metiers.js).
  for (const z of [0.945, -0.945]) add(B3(4.9, 0.1, 0.03).translate(0, 0.98, z), c.bande || '#3d8f5a');
  for (const x of [2.46, -2.46]) add(B3(0.03, 0.1, 1.9).translate(x, 0.98, 0), c.bande || '#3d8f5a');
  for (const [x, z] of [[1.0, -0.94], [-1.4, 0.94], [-0.2, -0.94]]) add(B3(0.4, 0.2, 0.02).translate(x, 0.65, z), '#9a6a45');
  add(B3(0.14, 0.22, 1.92).translate(2.5, 0.56, 0), '#4a4a4a'); add(B3(0.14, 0.22, 1.92).translate(-2.5, 0.56, 0), '#4a4a4a');
  for (const z of [0.66, -0.66]) { add(B3(0.05, 0.15, 0.3).translate(2.47, 0.86, z), '#f4efd8'); add(B3(0.05, 0.12, 0.2).translate(-2.47, 0.86, z), '#c8382f'); }
  for (const x of [1.55, -1.6]) for (const z of [0.86, -0.86]) { add(C3(0.36, 0.36, 0.24, 12).rotateX(Math.PI / 2).translate(x, 0.36, z), '#1c1c1e'); add(C3(0.18, 0.18, 0.26, 8).rotateX(Math.PI / 2).translate(x, 0.36, z), '#a7abaf'); }
  add(B3(3.4, 0.06, 1.7).translate(-0.5, 2.2, 0), '#3a3a3a');
  for (const z of [0.82, -0.82]) add(B3(3.4, 0.12, 0.05).translate(-0.5, 2.3, z), '#3a3a3a');
  const bag = ['#2f6fb0', '#c8382f', '#e9b62c', '#4a7a3f', '#8e3c8f', '#e2672a', '#f2efe6'];
  let k = 0; for (let x = -2; x < 1.1; x += 0.62) for (const z of [-0.42, 0.4]) { const h = 0.35 + ((k * 7) % 5) * 0.08; add(B3(0.55, h, 0.7).translate(x, 2.25 + h / 2, z), bag[k++ % bag.length]); }
  add(C3(0.4, 0.3, 0.22, 12).translate(0.6, 2.8, 0), '#d9d2c2');
  add(B3(3.3, 0.04, 1.6).translate(-0.5, 2.92, 0), '#3d7a46');
  if (c.apprenti === true) {
    add(B3(0.3, 0.55, 0.3).rotateX(-0.35).translate(0.45, 1.45, 1.12), '#c8382f');
    add(new THREE.SphereGeometry(0.13, 8, 6).translate(0.45, 1.86, 1.25), '#4a2f22');
    add(B3(0.12, 0.6, 0.12).translate(0.4, 0.9, 1.05), '#2d3e5a');
    add(C3(0.04, 0.04, 0.5, 5).rotateX(-1.1).translate(0.55, 1.6, 1.32), '#c8382f');
  }
  if (c.passagers !== false) for (let x = -1.9; x < 1.2; x += 0.62) add(new THREE.SphereGeometry(0.12, 6, 5).translate(x, 1.66, -0.75), '#4a2f22'); // des têtes sans corps : pas dans le minibus dont on ouvre la porte
  return P;
}
export function partsVoiture(couleur) {
  const P = [], add = (g, hex) => P.push([g, hex]);
  add(B3(4.3, 0.72, 1.8).translate(0, 0.68, 0), couleur); add(B3(2.3, 0.6, 1.62).translate(-0.25, 1.32, 0), '#2e3a40');
  add(B3(2.2, 0.08, 1.66).translate(-0.25, 1.65, 0), couleur);
  for (const x of [1.35, -1.35]) for (const z of [0.86, -0.86]) add(C3(0.33, 0.33, 0.22, 10).rotateX(Math.PI / 2).translate(x, 0.33, z), '#1c1c1e');
  for (const z of [0.6, -0.6]) add(B3(0.05, 0.14, 0.32).translate(2.16, 0.78, z), '#f4efd8');
  return P;
}
// La citadine : une petite cinq-portes haute et courte, celles qu'on croise par milliers à Cotonou. Toit
// bombé, grandes vitres, pare-chocs gris, une barre de toit. Dessinée en boîtes, comme les autres.
export function partsCitadine(couleur = '#c9342c') {
  const P = [], add = (g, hex) => P.push([g, hex]);
  const vitre = '#2b343a', gris = '#8d9196';
  add(B3(3.55, .62, 1.68).translate(0, .62, 0), couleur);                       // caisse
  add(B3(2.05, .62, 1.56).translate(-.12, 1.22, 0), vitre);                     // habitacle vitré, haut et court
  add(B3(1.95, .08, 1.6).translate(-.12, 1.55, 0), couleur);                    // toit
  for (const z of [.58, -.58]) add(B3(1.1, .05, .07).translate(-.15, 1.62, z), gris); // barres de toit
  add(B3(.5, .34, 1.66).translate(1.74, .52, 0), gris);                         // pare-chocs avant
  add(B3(.4, .34, 1.66).translate(-1.72, .52, 0), gris);                        // pare-chocs arrière
  for (const x of [1.18, -1.18]) for (const z of [.8, -.8]) add(C3(.3, .3, .2, 10).rotateX(Math.PI / 2).translate(x, .3, z), '#1c1c1e');
  for (const z of [.55, -.55]) add(B3(.05, .15, .3).translate(1.79, .78, z), '#f4efd8'); // phares
  for (const z of [.6, -.6]) add(B3(.05, .14, .26).translate(-1.78, .92, z), '#b8322a'); // feux arrière
  return P;
}
// Le bolide électrique : un coupé bas en coin, verrière sombre d'un seul tenant, bas de caisse noir et
// grandes roues — la silhouette des sportives électriques. Dessiné en boîtes, comme les autres véhicules.
export function partsBolide(couleur = '#eceff2') {
  const P = [], add = (g, hex) => P.push([g, hex]);
  const sombre = '#15181c', vitre = '#222931', jante = '#aab1b8';
  add(B3(3.9, 0.24, 1.66).translate(0, 0.25, 0), sombre);                            // châssis, plus étroit que les roues
  add(B3(4.2, 0.28, 1.76).translate(0, 0.5, 0), couleur);                            // flancs
  add(B3(1.7, 0.3, 1.92).translate(-1.05, 0.54, 0), couleur);                        // épaules arrière, larges
  add(B3(1.8, 0.2, 1.68).rotateZ(-0.075).translate(1.2, 0.72, 0), couleur);          // capot qui plonge
  add(B3(0.66, 0.14, 1.46).rotateZ(-0.26).translate(2.02, 0.58, 0), couleur);        // le museau, en pointe
  add(B3(1.75, 0.28, 1.4).translate(-0.15, 0.82, 0), vitre);                         // verrière basse
  add(B3(1.1, 0.09, 1.26).translate(-0.4, 1.0, 0), couleur);                         // toit fin
  add(B3(0.95, 0.2, 1.34).rotateZ(0.34).translate(-1.2, 0.86, 0), vitre);            // lunette arrière fuyante
  add(B3(0.8, 0.26, 1.88).translate(-1.76, 0.62, 0), couleur);                       // croupe
  add(B3(0.1, 0.09, 1.56).translate(-2.13, 0.68, 0), '#c1272d');                     // bandeau rouge, en travers
  add(B3(0.14, 0.07, 1.18).translate(2.12, 0.6, 0), '#f3f6ff');                      // bandeau de phares
  add(B3(0.44, 0.14, 1.5).translate(-1.92, 0.3, 0), sombre);                         // diffuseur arrière
  for (const z of [0.86, -0.86]) add(B3(1.5, 0.16, 0.1).translate(-0.1, 0.36, z), sombre); // jupes latérales
  for (const x of [1.36, -1.4]) for (const z of [0.93, -0.93]) {
    add(C3(0.36, 0.36, 0.22, 14).rotateX(Math.PI / 2).translate(x, 0.36, z), '#17171a');
    add(C3(0.21, 0.21, 0.24, 10).rotateX(Math.PI / 2).translate(x, 0.36, z), jante);
  }
  return P;
}
// Le Roadster : le coupé électrique d'après la photo que Murielle a envoyée (25/10). Un coin très bas, un museau
// pointu, une verrière sombre d'un seul tenant du pare-brise à la lunette, des ailes larges au-dessus de grandes
// roues, et une arête qui court sur tout le flanc. Dessiné en boîtes, comme les autres véhicules du jeu.
export function partsRoadster(couleur = '#dfe3e7') {
  const P = [], add = (g, hex) => P.push([g, hex]);
  const sombre = '#141619', verre = '#191e24', jante = '#b9c0c6';
  // La carrosserie : trois dalles empilées, de plus en plus courtes, qui dessinent le coin.
  add(B3(4.05, 0.26, 1.66).translate(0, 0.27, 0), sombre);                          // bas de caisse noir
  add(B3(4.30, 0.34, 1.80).translate(0, 0.54, 0), couleur);                         // flancs
  add(B3(3.10, 0.16, 1.74).translate(-0.35, 0.78, 0), couleur);                     // épaulement
  add(B3(1.55, 0.20, 1.60).rotateZ(-0.12).translate(1.30, 0.80, 0), couleur);       // capot qui plonge
  add(B3(0.95, 0.15, 1.26).rotateZ(-0.34).translate(2.05, 0.62, 0), couleur);       // museau en pointe
  // La verrière, d'un seul tenant du pare-brise à la lunette.
  add(B3(0.85, 0.30, 1.42).rotateZ(-0.46).translate(0.86, 0.99, 0), verre);         // pare-brise très couché
  add(B3(1.55, 0.14, 1.46).translate(-0.20, 1.12, 0), verre);                       // toit de verre
  add(B3(1.15, 0.26, 1.44).rotateZ(0.40).translate(-1.22, 0.98, 0), verre);         // lunette fuyante
  add(B3(0.95, 0.20, 1.72).translate(-1.90, 0.76, 0), couleur);                     // croupe coupée net
  // Les ailes : des arches basses et larges, juste au-dessus des roues.
  for (const x of [1.42, -1.46]) add(B3(1.25, 0.30, 1.98).translate(x, 0.60, 0), couleur);
  for (const x of [1.42, -1.46]) add(B3(1.05, 0.06, 2.02).translate(x, 0.74, 0), '#aeb6bd'); // le liseré du passage de roue
  // Les détails : bandeaux, lame avant, diffuseur, jupes.
  add(B3(0.09, 0.07, 1.44).translate(-2.34, 0.82, 0), '#c1272d');                   // bandeau rouge arrière
  add(B3(0.10, 0.06, 1.16).translate(2.26, 0.66, 0), '#eef4ff');                    // bandeau de phares
  add(B3(0.56, 0.09, 1.30).translate(2.18, 0.34, 0), sombre);                       // lame avant, au ras du sol
  add(B3(0.52, 0.18, 1.46).translate(-2.06, 0.36, 0), sombre);                      // diffuseur
  for (const z of [0.86, -0.86]) add(B3(1.9, 0.12, 0.10).translate(-0.1, 0.38, z), sombre); // jupes latérales
  for (const x of [1.42, -1.46]) for (const z of [0.95, -0.95]) {
    add(C3(0.40, 0.40, 0.24, 16).rotateX(Math.PI / 2).translate(x, 0.40, z), '#131316');
    add(C3(0.25, 0.25, 0.27, 12).rotateX(Math.PI / 2).translate(x, 0.40, z), jante);
  }
  return P;
}
export function partsChevre() {
  const P = [], add = (g, hex) => P.push([g, hex]);
  add(B3(0.85, 0.38, 0.34).translate(0, 0.62, 0), '#e8e2d4'); add(B3(0.3, 0.38, 0.34).translate(-0.25, 0.62, 0), '#6a4a32');
  add(B3(0.24, 0.28, 0.2).rotateZ(0.5).translate(0.5, 0.9, 0), '#e8e2d4');
  for (const x of [0.32, -0.32]) for (const z of [0.12, -0.12]) add(B3(0.07, 0.45, 0.07).translate(x, 0.22, z), '#6a4a32');
  for (const z of [0.06, -0.06]) add(C3(0.01, 0.03, 0.2, 4).rotateZ(-0.6).translate(0.5, 1.1, z), '#4a3a2a');
  return P;
}
export function partsMarchande(pagne) {
  const P = [], add = (g, hex) => P.push([g, hex]);
  add(C3(0.2, 0.3, 1.1, 8).translate(0, 0.56, 0), pagne); add(C3(0.17, 0.2, 0.4, 8).translate(0, 1.3, 0), pagne);
  add(new THREE.SphereGeometry(0.14, 8, 6).translate(0, 1.66, 0), '#4a2f22');
  add(C3(0.42, 0.3, 0.16, 12).translate(0, 1.88, 0), '#c9ccd0');
  for (const [x, z, c] of [[0.12, 0, '#d8432f'], [-0.12, 0.08, '#e9b23a'], [0, -0.14, '#5d9b3a']]) add(new THREE.SphereGeometry(0.11, 6, 5).translate(x, 2.02, z), c);
  return P;
}
export const matVeh = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: .05 });


// ---------- Zémidjans détaillés de « 3D monde » ----------
// moto-taxi.glb : conducteur scanné au gilet jaune, casque, moto sombre.
// zem.glb : moto rouge, conducteur en chemise jaune et passagère au chapeau.
// Gabarits : origine au sol au centre du véhicule, avant tourné vers +x.
export const ZEMS_3D = { moto: null, zem: null, motoLod: null };
const chargeur = chargeurGLB({ liberer: true });

/**
 * Remet un véhicule droit sur sa route (repris de Rues.redresser, 3D monde) :
 * l'axe long, mesuré sur les sommets vus de dessus, est aligné sur z par la plus
 * petite rotation, la gîte est annulée, puis le véhicule est reposé au sol, centré.
 */
function redresser(groupe) {
  const points = [], v = new THREE.Vector3();
  groupe.updateMatrixWorld(true);
  groupe.traverse(n => { if (!n.isMesh) return; const pos = n.geometry.getAttribute('position'); const pas = Math.max(1, Math.floor(pos.count / 4000)); for (let i = 0; i < pos.count; i += pas) points.push(v.fromBufferAttribute(pos, i).applyMatrix4(n.matrixWorld).clone()); });
  if (points.length < 10) return;
  const moy = f => points.reduce((a, p) => a + f(p), 0) / points.length;
  const mx = moy(p => p.x), mz = moy(p => p.z);
  const xx = moy(p => (p.x - mx) ** 2), zz = moy(p => (p.z - mz) ** 2), xz = moy(p => (p.x - mx) * (p.z - mz));
  let cap = Math.PI / 2 - .5 * Math.atan2(2 * xz, xx - zz);
  cap = Math.atan2(Math.sin(cap), Math.cos(cap)); if (cap > Math.PI / 2) cap -= Math.PI; if (cap <= -Math.PI / 2) cap += Math.PI;
  groupe.rotation.y = -cap; groupe.updateMatrixWorld(true);
  const droits = points.map(p => p.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -cap));
  const my = droits.reduce((a, p) => a + p.y, 0) / droits.length, lx = droits.reduce((a, p) => a + p.x, 0) / droits.length;
  const yy = droits.reduce((a, p) => a + (p.y - my) ** 2, 0) / droits.length, xy = droits.reduce((a, p) => a + (p.x - lx) * (p.y - my), 0) / droits.length;
  const gite = Math.atan2(xy, yy);
  if (Math.abs(gite) < .5) groupe.rotation.z = gite;
  groupe.updateMatrixWorld(true);
  const boite = new THREE.Box3().setFromObject(groupe), c = boite.getCenter(new THREE.Vector3());
  groupe.position.set(-c.x, -boite.min.y, -c.z);
}
/** La passagère de zem.glb n'a pas de haut : corsage en wax ajusté sur le buste (3D monde). */
function habillerPassagere(gabarit) {
  const toile = document.createElement('canvas'); toile.width = toile.height = 128; const c = toile.getContext('2d');
  c.fillStyle = '#1f4f8f'; c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = i * 32 + (j % 2) * 16 + 16, y = j * 32 + 16; c.fillStyle = '#f0a228'; c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.fill(); c.fillStyle = '#b8322a'; c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill(); }
  const carte = new THREE.CanvasTexture(toile); carte.colorSpace = THREE.SRGBColorSpace; carte.wrapS = carte.wrapT = THREE.RepeatWrapping; carte.repeat.set(3, 1);
  const mat = new THREE.MeshStandardMaterial({ map: carte, roughness: .85, side: THREE.DoubleSide });
  const corsage = new THREE.Mesh(new THREE.CylinderGeometry(.18, .21, .5, 16, 1, true), mat); corsage.scale.set(1.05, 1, .78); corsage.position.set(0, 1.37, -.5);
  const epaules = new THREE.Mesh(new THREE.CylinderGeometry(.08, .185, .09, 16, 1, true), mat); epaules.scale.set(1.05, 1, .78); epaules.position.set(0, 1.665, -.5);
  gabarit.add(corsage, epaules);
}
export function gabaritDe(objet, { largeur, hauteur, passagere }) {
  const s = new THREE.Box3().setFromObject(objet).getSize(new THREE.Vector3());
  objet.scale.multiplyScalar(largeur ? largeur / Math.max(s.x, s.z) : hauteur / s.y);
  const redresse = new THREE.Group(); redresse.add(objet);
  redresser(redresse);
  const avantZ = new THREE.Group(); avantZ.add(redresse);
  if (passagere) habillerPassagere(avantZ);
  const tourne = new THREE.Group(); tourne.add(avantZ); tourne.rotation.y = Math.PI / 2; // avant +z → +x
  const g = new THREE.Group(); g.add(tourne);
  g.traverse(n => { if (n.isMesh) { n.castShadow = !LITE; n.receiveShadow = true; } });
  return g;
}
/** Géométrie unique (transformations appliquées) pour l'instanciation dans la circulation. */
// Les modèles allégés ont des coordonnées compressées (entiers 16 bits normalisés) : on les remet en
// flottants avant de les transformer, sinon tout ce qui dépasse 1 est écrasé.
function enFlottants(geo) {
  for (const [nom, a] of Object.entries(geo.attributes)) {
    if (a.array instanceof Float32Array && !a.normalized) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
    geo.setAttribute(nom, new THREE.BufferAttribute(f, a.itemSize));
  }
  return geo;
}
function geometrieDe(gabarit) {
  gabarit.updateMatrixWorld(true);
  let geo = null, mat = null;
  gabarit.traverse(n => { if (n.isMesh && !geo) { geo = enFlottants(n.geometry.clone()).applyMatrix4(n.matrixWorld); mat = n.material; } });
  return geo ? { geo, mat } : null;
}
// tokpa.glb (Tripo, d'après une description) : le minibus Toyota des lignes de tokpa-tokpa.
export const TOKPA_3D = { geo: null, mat: null };
export async function chargerTokpa(url) {
  try {
    const g = (await chargeur.loadAsync(url)).scene;
    const r = geometrieDe(gabaritDe(g, { largeur: 5 })); if (r) { TOKPA_3D.geo = r.geo; TOKPA_3D.mat = r.mat; }
  } catch (e) { console.warn('modèle tokpa indisponible', e.message); }
  return TOKPA_3D;
}
// ---------- La circulation en 3D (scripts/trafic.mjs) ----------
// « Duplique juste les simples modèles de voiture et moto qu'on a, mais en 3D, en réduisant un peu la qualité ; pour les
// motos des zéms aussi, mais certains ne seront pas en habit de zém » (Murielle, 27/10). La voiture rouge (2 500
// triangles) est repeinte en blanc, argent, noir et bleu ; le taxi jaune et vert ; la moto-taxi de près (3 000) et de
// loin (630) ; et des motos dont le conducteur porte une chemise au lieu du gilet jaune.
export const TRAFIC_3D = { pret: false, echec: false, voitures: [], taxi: null, zem: null, civils: [], loin: null };
const CARROSSERIES = ['#e9e9e4', '#a9adb0', '#25282b', '#34507a', null]; // null : le rouge d'origine
const CHEMISES = ['#f2f0ea', '#2f6fb0', '#c8382f', '#3a7d44'];
/**
 * La texture `tex` repeinte : les pixels que `garde` retient prennent la couleur `hex`, avec leur ombre et leur lumière
 * (la luminosité d'origine, rapportée à celle de `ref`). Une texture glTF ne se retourne pas (flipY faux).
 */
function repeindre(tex, garde, hex, ref) {
  const img = tex.image, cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const c = cv.getContext('2d'); c.drawImage(img, 0, 0); const d = c.getImageData(0, 0, cv.width, cv.height), p = d.data;
  const v = new THREE.Color(hex), [vr, vg, vb] = [v.r * 255, v.g * 255, v.b * 255];
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], g = p[i + 1], b = p[i + 2]; if (!garde(r, g, b)) continue;
    const k = Math.min(1.6, (r + g + b) / ref); p[i] = Math.min(255, vr * k); p[i + 1] = Math.min(255, vg * k); p[i + 2] = Math.min(255, vb * k);
  }
  c.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.anisotropy = 4;
  return t;
}
const rouge = (r, g, b) => r > 90 && r > g * 1.7 && r > b * 1.7; // la carrosserie de la voiture rouge
const gilet = (r, g, b) => r > 140 && g > 120 && r - b > 45 && g - b > 35 && Math.abs(r - g) < 60; // le gilet du zém : un jaune pâle (220, 220, 160), pas la peau
const matTrafic = map => new THREE.MeshStandardMaterial({ map, roughness: .7, metalness: .05 });
let traficEnRoute = null;
export function chargerTrafic() {
  return traficEnRoute ??= (async () => {
    const url = f => import.meta.env.BASE_URL + 'modeles/trafic/' + f;
    try {
      const [voiture, taxi, moto, loin] = await Promise.all(['voiture.glb', 'taxi.glb', 'moto.glb', 'moto-loin.glb'].map(f => chargeur.loadAsync(url(f)).then(g => g.scene)));
      const V = geometrieDe(gabaritDe(voiture, { largeur: 4.3 })), T = geometrieDe(gabaritDe(taxi, { largeur: 4.3 }));
      const M = geometrieDe(gabaritDe(moto, { largeur: 1.95 })), L = geometrieDe(gabaritDe(loin, { largeur: 1.95 }));
      TRAFIC_3D.voitures = CARROSSERIES.map(h => ({ geo: V.geo, mat: matTrafic(h ? repeindre(V.mat.map, rouge, h, 330) : V.mat.map) }));
      TRAFIC_3D.taxi = { geo: T.geo, mat: matTrafic(T.mat.map) };
      TRAFIC_3D.zem = { geo: M.geo, mat: matTrafic(M.mat.map) };
      TRAFIC_3D.civils = CHEMISES.map(h => ({ geo: M.geo, mat: matTrafic(repeindre(M.mat.map, gilet, h, 600)) }));
      TRAFIC_3D.loin = { geo: L.geo, map: L.mat.map };
      TRAFIC_3D.pret = true;
    } catch (e) { console.warn('circulation en 3D indisponible', e.message); TRAFIC_3D.echec = true; }
    return TRAFIC_3D;
  })();
}
// Lancé dès que les données de la ville sont arrivées (main.js) : le téléchargement (1,5 Mo) se fait pendant
// que le téléphone construit la ville, au lieu d'attendre l'étape « Zémidjans ».
let zemsEnRoute = null;
export function prechargerZems() {
  const url = f => import.meta.env.BASE_URL + 'modeles/' + f;
  const charge = f => chargeur.loadAsync(url(f)).then(g => g.scene).catch(e => { console.warn(`modèle ${f} indisponible`, e); return null; });
  return zemsEnRoute ??= Promise.all([charge('moto-taxi.glb'), charge('zem-lod.glb'), charge('moto-taxi-lod.glb')]);
}
export async function chargerZems() {
  const [moto, zem, motoLod] = await prechargerZems();
  if (moto) ZEMS_3D.moto = gabaritDe(moto, { largeur: 1.95 });
  if (zem) ZEMS_3D.zem = gabaritDe(zem, { hauteur: 2.05, passagere: true });
  if (motoLod) ZEMS_3D.motoLod = geometrieDe(gabaritDe(motoLod, { largeur: 1.95 }));
  return ZEMS_3D;
}
