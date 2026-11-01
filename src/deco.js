import * as THREE from 'three';
import { $ } from './base.js';
import { son } from './audio.js';
import { fermerFiche } from './commerces.js';
import { K } from './lieux.js';
import { maisonActuelle } from './maison.js';
import { VIE, depenser, ecrireEnPlus, lireEnPlus, signaler } from './vie.js';

// ---------- Ma maison : meubler et décorer son logement ----------
// Ce que Lagos Life a ajouté le 8/10 (35 objets pour la maison), le 12/10 (on regarde dedans) et le 29/10 (des animaux) :
// on dépense ce qu'on gagne pour un chez-soi à son goût. Chaque logement a ses emplacements (au sol, un grand pour le
// canapé, au mur, dans la cour ou le jardin) ; un objet acheté va au premier emplacement libre qui lui convient, et
// « Changer de place » le fait passer au suivant. Les objets restent à soi quand on déménage : ils se reposent dans le
// nouveau logement, ou attendent rangés s'il n'y a plus de place. Ils comptent dans la fortune (echelle.js).
// Enregistré avec la vie (champ `deco` de zem_vies) : { o: [[objet, emplacement]] } (-1 : rangé).

const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const DX_VILLA = -3; // la maison de la villa est l'appartement décalé de 3 m vers l'ouest (maison.js)

// Les emplacements, dans le repère de la pièce (maison.js) : place 'sol' (moins d'un mètre), 'grand' (accepte aussi un
// objet au sol) ou 'mur' (à hauteur y) ; a : vers où l'objet regarde (0 : vers +z). Choisis hors des passages : de la porte
// au lit, à la douche, au fourneau, et dans la villa de la baie au jardin.
const APPART = [
  { nom: 'dans le salon, contre la cloison', place: 'grand', x: -1.45, z: -2.6, a: Math.PI / 2 },
  { nom: 'dans l’entrée, sous la fenêtre', place: 'sol', x: 2.25, z: -3.95, a: 0 },
  { nom: 'dans la chambre, sous la fenêtre', place: 'sol', x: -2.55, z: -3.85, a: 0 },
  { nom: 'dans le coin de la chambre', place: 'sol', x: -2.9, z: .65, a: Math.PI },
  { nom: 'dans le salon, près de la porte de la chambre', place: 'sol', x: -1.4, z: .7, a: Math.PI / 2 },
  { nom: 'dans le séjour, entre le canapé et la table', place: 'sol', x: 3.0, z: 1.0, a: Math.PI },
  { nom: 'sur le mur du salon', place: 'mur', x: -.3, z: -4.36, y: 1.55, a: 0 },
  { nom: 'sur le mur de la chambre', place: 'mur', x: -4.0, z: 1.11, y: 1.55, a: Math.PI },
];
export const EMPLACEMENTS = {
  cour: [
    { nom: 'dans le coin de la chambre, sous la fenêtre', place: 'sol', x: -3.85, z: 1.25, a: 0 },
    { nom: 'dans la chambre, contre la cloison', place: 'sol', x: -1.55, z: 2.7, a: -Math.PI / 2 },
    { nom: 'dans la cour, contre le mur de la chambre', place: 'grand', x: -.45, z: 3.4, a: Math.PI / 2 },
    { nom: 'dans la cour, devant la chambre', place: 'sol', x: -.4, z: 1.6, a: Math.PI / 2 },
    { nom: 'dans la cour, près du portail', place: 'sol', x: 2.5, z: -2.7, a: Math.PI },
    { nom: 'sur le mur de la chambre', place: 'mur', x: -3.1, z: .72, y: 1.55, a: 0 },
    { nom: 'sur le mur du fond de la chambre', place: 'mur', x: -1.11, z: 3.2, y: 1.55, a: -Math.PI / 2 },
  ],
  appart: [...APPART, { nom: 'dans le salon, à côté de la télé', place: 'sol', x: 5.45, z: -.2, a: -Math.PI / 2 }, { nom: 'sur le mur du séjour', place: 'mur', x: 5.86, z: .35, y: 1.55, a: -Math.PI / 2 }],
  villa: [
    ...APPART.map(e => ({ ...e, x: e.x + DX_VILLA })),
    { nom: 'dans le jardin, près de la baie', place: 'sol', x: 4.05, z: 2.2, a: -Math.PI / 2 },
    { nom: 'dans le jardin, face à la piscine', place: 'sol', x: 4.0, z: -2.1, a: Math.PI / 2 },
    { nom: 'dans le jardin, contre la clôture', place: 'grand', x: 4.2, z: -3.85, a: 0 },
  ],
};

// ---------- Le catalogue ----------
// Chaque objet se dessine dans son repère : posé à y = 0 (au mur : centré sur y = 0, le dos contre le mur), face vers +z.
// [w, d, h] : son encombrement au sol (on ne le traverse pas) ; 0 pour un tapis ou ce qui est au mur.
const bois = () => K.mat('#7a5232', { rugosite: .7 }), noir = () => K.mat('#1b1d20', { rugosite: .4 });
function pot(g, r = .2, h = .32) { K.cyl(r, r * .78, h, 14, K.mat('#b5653c', { rugosite: .9 }), 0, h / 2, 0, g); K.cyl(r * .95, r * .95, .02, 14, '#4a3626', 0, h - .02, 0, g); }
// Des palmes qui partent du haut du tronc et retombent : tournées vers l'extérieur (lacet), puis penchées vers le bas.
function feuilles(g, n, y, l) {
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2 + .4, p = .45 + (k % 2) * .25, f = K.boite(.2, .015, l, K.mat(k % 2 ? '#3f7a34' : '#4f8f3c', { rugosite: .9 }), Math.sin(a) * Math.cos(p) * l / 2, y - Math.sin(p) * l / 2, Math.cos(a) * Math.cos(p) * l / 2, g);
    f.rotation.order = 'YXZ'; f.rotation.set(p, a, 0);
  }
}
const CATALOGUE = [
  ['canape', 'salon', 'Canapé en wax', 18000, 'grand', '🛋️', [1.9, .8, .85], g => {
    const tissu = K.tex('pagneWax', 1.2, .5), pied = bois();
    K.boite(1.9, .42, .8, tissu, 0, .3, 0, g); K.boite(1.9, .5, .2, tissu, 0, .75, -.3, g);
    for (const s of [-1, 1]) K.boite(.18, .3, .8, tissu, s * .86, .6, 0, g);
    for (const [a, b] of [[-.85, -.32], [.85, -.32], [-.85, .32], [.85, .32]]) K.boite(.06, .1, .06, pied, a, .05, b, g);
  }],
  ['fauteuil', 'salon', 'Fauteuil en rotin', 6000, 'sol', '🪑', [.8, .75, .9], g => {
    const rotin = K.mat('#c89a5b', { rugosite: .85 });
    K.boite(.75, .12, .65, rotin, 0, .4, .05, g); K.boite(.75, .55, .1, rotin, 0, .72, -.27, g);
    for (const s of [-1, 1]) K.boite(.08, .25, .65, rotin, s * .34, .55, .05, g);
    K.cyl(.32, .36, .34, 16, rotin, 0, .17, .05, g); K.boite(.6, .08, .5, K.tex('pagneWax', .5, .4), 0, .5, .08, g);
  }],
  ['tablebasse', 'salon', 'Table basse en teck', 5000, 'sol', '🪵', [1, .6, .45], g => {
    const b = bois(); K.boite(1, .06, .6, b, 0, .42, 0, g);
    for (const [a, c] of [[-.44, -.24], [.44, -.24], [-.44, .24], [.44, .24]]) K.boite(.06, .39, .06, b, a, .2, c, g);
    K.cyl(.09, .07, .12, 12, '#e9e1cf', .25, .51, 0, g); K.sphere(.07, '#c0392b', .25, .6, 0, g);
  }],
  ['ventilo', 'salon', 'Ventilateur sur pied', 3000, 'sol', '🌀', [.45, .45, 1.3], g => {
    const blanc = K.mat('#eef0f1', { rugosite: .5 });
    K.cyl(.2, .22, .05, 16, blanc, 0, .025, 0, g); K.cyl(.025, .025, 1.05, 8, blanc, 0, .55, 0, g);
    const tete = new THREE.Group(); tete.position.set(0, 1.12, .05); g.add(tete);
    K.cyl(.08, .1, .14, 12, blanc, 0, 0, -.08, tete).rotation.x = Math.PI / 2;
    const helice = new THREE.Group(); helice.position.z = .04; tete.add(helice);
    for (let k = 0; k < 3; k++) { const p = K.boite(.09, .2, .01, K.mat('#9fc3d1', { transparent: .8 }), 0, .1, 0, helice), h = new THREE.Group(); h.rotation.z = k / 3 * Math.PI * 2; helice.add(h); h.add(p); }
    const grille = K.cyl(.24, .24, .08, 20, K.mat('#d6dadc', { transparent: .45 }), 0, 0, .04, tete); grille.rotation.x = Math.PI / 2;
    g.userData.anim = (t, dt) => { helice.rotation.z -= dt * 18; tete.rotation.y = Math.sin(t * .6) * .7; };
  }],
  ['radio', 'salon', 'Poste radio', 2500, 'sol', '📻', [.45, .4, .7], g => {
    K.boite(.4, .5, .36, bois(), 0, .25, 0, g);
    K.boite(.42, .22, .14, K.mat('#2b2f33', { rugosite: .5 }), 0, .62, 0, g); for (const s of [-1, 1]) K.cyl(.06, .06, .01, 16, '#6d7478', s * .12, .62, .075, g).rotation.x = Math.PI / 2;
    K.cyl(.006, .006, .35, 4, '#c9cdd0', .16, .9, -.03, g).rotation.z = -.3;
  }],
  ['tele', 'salon', 'Télévision écran plat', 25000, 'sol', '📺', [1.2, .45, 1.25], g => {
    K.boite(1.2, .45, .45, bois(), 0, .23, 0, g);
    K.boite(1.1, .64, .05, noir(), 0, .9, -.05, g); K.boite(1.02, .56, .01, K.mat('#2a4a6a', { emissif: '#1d3c5a' }), 0, .9, -.02, g); K.boite(.25, .04, .18, noir(), 0, .47, -.05, g);
  }],
  ['frigo', 'salon', 'Petit frigo', 20000, 'sol', '🧊', [.6, .6, 1.2], g => {
    const blanc = K.mat('#f3f4f2', { rugosite: .35 }); K.boite(.58, 1.2, .58, blanc, 0, .6, 0, g);
    K.boite(.56, .01, .01, '#c9cdd0', 0, .82, .295, g); K.boite(.03, .3, .03, '#9aa0a3', .22, .95, .3, g);
    K.boite(.12, .08, .01, K.mat('#1f7a3e'), -.12, 1.0, .295, g);
  }],
  ['lampe', 'salon', 'Lampe sur pied', 3500, 'sol', '💡', [.4, .4, 1.6], g => {
    K.cyl(.16, .18, .04, 16, noir(), 0, .02, 0, g); K.cyl(.015, .015, 1.4, 8, noir(), 0, .72, 0, g);
    K.cyl(.14, .24, .3, 16, K.mat('#f6e7c1', { emissif: '#f0c86a' }), 0, 1.5, 0, g);
  }],
  ['tapis', 'salon', 'Tapis tissé', 4000, 'sol', '🧶', 0, g => {
    K.boite(1.6, .012, 1.1, K.tex('natte', 1, 1), 0, .008, .5, g).castShadow = false;
    K.boite(1.3, .014, .8, K.tex('pagneWax', 1, .6), 0, .01, .5, g).castShadow = false;
  }],
  ['plante', 'deco', 'Plante en pot', 1500, 'sol', '🪴', [.45, .45, 1], g => { pot(g); K.sphere(.32, K.mat('#4f7a3c', { rugosite: .9 }), 0, .7, 0, g).scale.set(1, 1.3, 1); }],
  ['palmier', 'deco', 'Palmier en pot', 4000, 'sol', '🌴', [.5, .5, 1.7], g => {
    pot(g, .24, .38); K.cyl(.04, .06, 1, 8, '#8a6a4a', 0, .85, 0, g); feuilles(g, 8, 1.36, .75);
  }],
  ['statue', 'deco', 'Statuette de l’Amazone', 15000, 'sol', '🗿', [.45, .45, 1.35], g => {
    const bronze = K.mat('#6b4a2a', { metal: .5, rugosite: .4 });
    K.boite(.4, .55, .4, K.mat('#e6dccb'), 0, .28, 0, g); K.cyl(.07, .1, .5, 10, bronze, 0, .8, 0, g); K.sphere(.08, bronze, 0, 1.12, 0, g);
    K.cyl(.012, .012, .7, 6, bronze, .14, .95, 0, g); K.cone(.05, .12, 6, bronze, .14, 1.33, 0, g);
  }],
  ['masque', 'deco', 'Masque en bois', 6000, 'mur', '🎭', 0, g => {
    const b = K.mat('#5a3a22', { rugosite: .6 }); K.boite(.3, .5, .06, b, 0, 0, .03, g);
    for (const s of [-1, 1]) K.boite(.07, .03, .02, '#e9d9b0', s * .07, .06, .07, g); K.boite(.04, .14, .03, b, 0, -.04, .08, g); K.boite(.12, .03, .02, '#c0392b', 0, -.15, .07, g);
  }],
  ['tableau', 'deco', 'Tableau en pagne', 3000, 'mur', '🖼️', 0, g => { K.boite(.9, .62, .04, bois(), 0, 0, .02, g); K.boite(.82, .54, .01, K.tex('pagneWax', .7, .5), 0, 0, .045, g); }],
  ['drapeau', 'deco', 'Drapeau du Bénin', 1000, 'mur', '🇧🇯', 0, g => {
    K.boite(.36, .5, .01, '#1f7a3e', -.36, 0, .02, g); K.boite(.72, .25, .01, '#fcd116', .18, .125, .02, g); K.boite(.72, .25, .01, '#e8112d', .18, -.125, .02, g);
  }],
  ['horloge', 'deco', 'Horloge murale', 2000, 'mur', '🕰️', 0, g => {
    const c = K.cyl(.2, .2, .04, 24, K.mat('#f7f3ea'), 0, 0, .02, g); c.rotation.x = Math.PI / 2; const t = K.cyl(.215, .215, .03, 24, bois(), 0, 0, .01, g); t.rotation.x = Math.PI / 2;
    const aiguille = (l, w) => { const a = new THREE.Group(); a.position.z = .05; g.add(a); K.boite(w, l, .006, '#1b1d20', 0, l / 2, 0, a); return a; };
    const h = aiguille(.1, .02), m = aiguille(.16, .012);
    g.userData.anim = () => { const d = new Date(Date.now() + 36e5), mn = d.getUTCMinutes(), hr = d.getUTCHours() % 12 + mn / 60; m.rotation.z = -mn / 60 * Math.PI * 2; h.rotation.z = -hr / 12 * Math.PI * 2; }; // l'heure de Cotonou
  }],
  ['miroir', 'deco', 'Grand miroir', 5000, 'mur', '🪞', 0, g => { K.boite(.6, 1.1, .04, K.mat('#c9a35a', { metal: .4, rugosite: .4 }), 0, 0, .02, g); K.boite(.52, 1.02, .01, K.mat('#cfe3ee', { metal: .3, rugosite: .05 }), 0, 0, .045, g); }],
  ['chat', 'animaux', 'Chat', 15000, 'sol', '🐈', [.5, .4, .3], g => {
    const poil = K.mat('#d9822b', { rugosite: .95 }); K.boite(.6, .02, .45, K.tex('pagneWax', .4, .3), 0, .01, 0, g).castShadow = false;
    const corps = K.sphere(.13, poil, 0, .12, 0, g); corps.scale.set(1.6, .9, 1); K.sphere(.08, poil, .2, .16, .03, g);
    for (const s of [-1, 1]) K.cone(.025, .05, 4, poil, .21, .25, .03 + s * .04, g);
    const queue = K.cyl(.02, .015, .25, 6, poil, -.24, .08, .08, g); queue.rotation.set(Math.PI / 2, 0, .6);
    g.userData.anim = t => { corps.scale.y = .9 + Math.sin(t * 2.2) * .04; queue.rotation.z = .6 + Math.sin(t * 1.3) * .3; };
  }],
  ['chien', 'animaux', 'Chien', 25000, 'sol', '🐕', [.7, .35, .55], g => {
    const poil = K.mat('#c9a77a', { rugosite: .95 }); const corps = K.boite(.5, .22, .22, poil, 0, .32, 0, g);
    for (const [a, b] of [[-.18, -.07], [.18, -.07], [-.18, .07], [.18, .07]]) K.boite(.06, .22, .06, poil, a, .11, b, g);
    const tete = new THREE.Group(); tete.position.set(.28, .45, 0); g.add(tete); K.boite(.18, .16, .15, poil, 0, 0, 0, tete); K.boite(.1, .08, .1, poil, .12, -.03, 0, tete);
    for (const s of [-1, 1]) K.boite(.03, .1, .05, '#8a6a4a', -.03, .1, s * .06, tete); K.sphere(.02, '#1b1d20', .17, 0, 0, tete);
    const queue = K.cyl(.02, .015, .2, 6, poil, -.3, .42, 0, g); queue.rotation.z = .8;
    g.userData.anim = t => { queue.rotation.x = Math.sin(t * 9) * .5; tete.rotation.z = Math.sin(t * .8) * .1; corps.scale.y = 1 + Math.sin(t * 2.5) * .03; };
  }],
  ['tortue', 'animaux', 'Tortue', 20000, 'sol', '🐢', [.4, .35, .2], g => {
    const vert = K.mat('#4f6b3a', { rugosite: .8 }); const c = K.sphere(.15, K.mat('#6b5a35', { rugosite: .7 }), 0, .06, 0, g); c.scale.set(1.2, .55, 1);
    const tete = K.sphere(.05, vert, .19, .06, 0, g); for (const [a, b] of [[-.1, -.1], [.1, -.1], [-.1, .1], [.1, .1]]) K.sphere(.035, vert, a, .025, b, g);
    g.userData.anim = t => { tete.position.x = .19 + Math.max(0, Math.sin(t * .4)) * .04; };
  }],
  ['aquarium', 'animaux', 'Aquarium', 30000, 'sol', '🐠', [.9, .45, 1.25], g => {
    K.boite(.9, .7, .45, bois(), 0, .35, 0, g);
    K.boite(.86, .5, .4, K.mat('#7fc7e0', { transparent: .45, rugosite: .05, emissif: '#2a7f9c' }), 0, .96, 0, g); K.boite(.88, .04, .42, noir(), 0, 1.23, 0, g);
    K.boite(.82, .04, .36, '#d8c79a', 0, .73, 0, g); for (const x of [-.3, .25]) K.cyl(.01, .01, .25, 4, '#3f7a34', x, .86, -.08, g);
    const poissons = [['#f39c12', .2, 0], ['#e74c3c', .15, 2], ['#f1c40f', .25, 4]].map(([c, r, p]) => { const f = K.sphere(.03, K.mat(c, { emissif: c }), 0, 1, 0, g); f.scale.set(1.8, 1, .6); return [f, r, p]; });
    g.userData.anim = t => { for (const [f, r, p] of poissons) { const a = t * .7 + p; f.position.set(Math.cos(a) * r * 1.4, .95 + Math.sin(a * 1.7) * .08, Math.sin(a) * r * .5); f.rotation.y = -a; } };
  }],
  ['perroquet', 'animaux', 'Perroquet gris en cage', 45000, 'sol', '🦜', [.45, .45, 1.6], g => {
    const metal = K.mat('#c9a35a', { metal: .5, rugosite: .35 }); K.cyl(.2, .22, .04, 16, metal, 0, .02, 0, g); K.cyl(.02, .02, 1, 8, metal, 0, .52, 0, g);
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; K.cyl(.005, .005, .55, 4, metal, Math.sin(a) * .2, 1.3, Math.cos(a) * .2, g); }
    K.cyl(.21, .21, .02, 16, metal, 0, 1.03, 0, g); K.cone(.21, .15, 16, metal, 0, 1.65, 0, g);
    const oiseau = new THREE.Group(); oiseau.position.y = 1.2; g.add(oiseau);
    const corps = K.sphere(.07, K.mat('#8e959b', { rugosite: .9 }), 0, 0, 0, oiseau); corps.scale.set(.9, 1.3, .9); K.sphere(.045, '#9aa1a6', 0, .11, .01, oiseau);
    K.boite(.04, .08, .02, K.mat('#c0392b'), 0, -.1, -.05, oiseau); K.cone(.015, .03, 6, '#1b1d20', 0, .1, .055, oiseau);
    g.userData.anim = t => { oiseau.rotation.y = Math.sin(t * .9) * .6; oiseau.position.y = 1.2 + Math.abs(Math.sin(t * 2.4)) * .015; };
  }],
  ['trone', 'luxe', 'Fauteuil de chef', 60000, 'grand', '👑', [1.1, .9, 1.6], g => {
    const or = K.mat('#c9a035', { metal: .6, rugosite: .3 }), velours = K.mat('#7a1f2b', { rugosite: .9 });
    K.boite(1, .45, .8, or, 0, .23, 0, g); K.boite(.85, .1, .65, velours, 0, .5, .05, g); K.boite(1, 1.1, .15, or, 0, 1.0, -.33, g); K.boite(.8, .9, .02, velours, 0, 1.0, -.25, g);
    for (const s of [-1, 1]) { K.boite(.12, .35, .7, or, s * .46, .62, 0, g); K.sphere(.08, or, s * .46, .82, .32, g); }
    K.sphere(.1, or, 0, 1.62, -.33, g);
  }],
];
export const OBJETS = Object.fromEntries(CATALOGUE.map(([id, cat, nom, prix, place, icone, taille, faire]) => [id, { id, cat, nom, prix, place, icone, taille, faire }]));
const CATEGORIES = [['salon', 'Salon'], ['deco', 'Déco'], ['animaux', 'Animaux'], ['luxe', 'Luxe']];
const convient = (O, E) => O.place === E.place || (O.place === 'sol' && E.place === 'grand');

// ---------- Ce qu'on possède ----------
const D = { o: [], achat: false, charge: false, cle: '', I: null, g: null, obstacles: [], t: 0, ligne: () => { } };
const plan = () => maisonActuelle()?.logis?.plan || 'cour';
const emplacements = () => EMPLACEMENTS[plan()] || [];
/** Ce que valent ses objets (la fortune de l'échelle, echelle.js). */
export const valeurDeco = () => D.o.reduce((s, [id]) => s + (OBJETS[id]?.prix || 0), 0);
function sauver() { ecrireEnPlus('deco', { o: D.o, p: plan() }); }
/** Le premier emplacement libre pour cet objet, en partant de `apres` (« Changer de place ») ; -1 s'il n'y en a pas. */
function libre(O, apres = -1) {
  const E = emplacements(), pris = new Set(D.o.map(x => x[1]));
  for (let k = 1; k <= E.length; k++) { const i = (apres + k + E.length) % E.length; if (!pris.has(i) && convient(O, E[i])) return i; }
  return -1;
}

export function initDeco({ ligne }) { D.ligne = ligne; $('#slMaison')?.addEventListener('click', ouvrirDeco); }
/** À l'entrée dans le salon : ses objets. Ceux d'un autre logement (on a déménagé) se reposent dans celui-ci. */
export function entrerDeco() {
  const d = lireEnPlus('deco'); D.o = (d?.o || []).filter(x => OBJETS[x[0]]); D.charge = true; D.plan = d?.p || plan(); D.cle = '';
  if (D.plan !== plan()) demenager();
}
/** Un autre logement (loué pendant la partie, ou depuis la dernière fois) : chaque objet reprend la première place libre. */
function demenager() {
  // Ce qu'on avait rangé au placard y reste ; le reste cherche une place dans le nouveau logement.
  const ranges = new Set(D.o.filter(x => x[1] < 0).map(x => x[0]));
  D.o = D.o.map(([id]) => [id, -1]); for (const x of D.o) if (!ranges.has(x[0])) x[1] = libre(OBJETS[x[0]]);
  D.plan = plan(); sauver();
}
export function quitterDeco() { D.charge = false; retirer(); }

// ---------- Dans la pièce ----------
function retirer() {
  if (D.g) { D.g.parent?.remove(D.g); D.g = null; } // géométries et matières sont partagées par K (lieux.js) : on ne les libère pas
  if (D.I) for (const o of D.obstacles) { const i = D.I.obstacles.indexOf(o); if (i >= 0) D.I.obstacles.splice(i, 1); }
  D.obstacles = []; D.I = null;
}
function poser(I) {
  retirer();
  const g = new THREE.Group(); g.name = 'deco'; I.g.add(g); D.g = g; D.I = I;
  const E = emplacements();
  for (const [id, i] of D.o) {
    const O = OBJETS[id], e = E[i]; if (!O || !e) continue;
    const o = new THREE.Group(); o.position.set(e.x, e.y || 0, e.z); o.rotation.y = e.a; g.add(o);
    K.into(o, () => O.faire(o));
    if (O.taille) { // on ne le traverse pas : sa boîte, tournée avec lui
      const [w, d, h] = O.taille, tourne = Math.abs(Math.sin(e.a)) > .5, ob = [e.x, e.z, (tourne ? d : w) / 2, (tourne ? w : d) / 2, h];
      I.obstacles.push(ob); D.obstacles.push(ob);
    }
  }
}
/** À chaque image du salon : on reconstruit quand un objet change ou qu'on rentre chez soi ; les animaux bougent. */
export function majDeco(dt) {
  if (!D.charge) return;
  if (plan() !== D.plan) demenager();
  const I = maisonActuelle();
  if (!I?.g) { if (D.g) retirer(); return; }
  const cle = `${I.id}|${JSON.stringify(D.o)}`;
  if (cle !== D.cle || D.I !== I || D.g?.parent !== I.g) { D.cle = cle; poser(I); }
  if (!I.g.visible) return;
  D.t += dt; for (const o of D.g.children) o.userData.anim?.(D.t, dt);
}

// ---------- La fenêtre « Ma maison » ----------
export function ouvrirDeco(onglet = 'salon') {
  const el = $('#vieFiche'); if (!el || !VIE.data) return;
  if (typeof onglet !== 'string') onglet = D.onglet || 'salon';
  D.onglet = onglet;
  const E = emplacements(), poses = D.o.filter(x => x[1] >= 0).length;
  const libres = p => E.filter((e, i) => e.place === p && !D.o.some(x => x[1] === i)).length;
  const mien = id => D.o.find(x => x[0] === id);
  const ligneObjet = O => {
    const x = mien(O.id), ou = x && x[1] >= 0 ? E[x[1]]?.nom : '';
    const actions = !x ? `<button type="button" class="vf-bouton" data-dc="acheter" data-o="${O.id}"${VIE.data.argent < O.prix ? ' disabled' : ''}>Acheter · ${fmt(O.prix)}</button>`
      : x[1] >= 0 ? `<button type="button" class="vf-bouton" data-dc="bouger" data-o="${O.id}">Changer de place</button><button type="button" class="vf-bouton" data-dc="ranger" data-o="${O.id}">Ranger</button>`
        : `<button type="button" class="vf-bouton" data-dc="poser" data-o="${O.id}">Poser chez moi</button>`;
    return `<div class="vf-ligne"><span class="vf-icone">${O.icone}</span><span><b>${esc(O.nom)}</b><small>${x ? (ou ? `Chez toi, ${esc(ou)}` : 'Au placard') : O.place === 'mur' ? 'Au mur' : O.place === 'grand' ? 'Grand : il lui faut de la place' : 'Au sol'}</small></span><span class="vf-deux">${actions}</span></div>`;
  };
  fermerFiche();
  $('#vfContenu').innerHTML = `<div class="dc"><small class="vf-sur">Ma vie</small><h3 id="vfTitre">Ma maison</h3>
    <p class="vf-intro">${esc(maisonActuelle()?.logis?.titre ? `Tu vis ${maisonActuelle().logis.titre}.` : '')} ${poses > 1 ? `${poses} objets posés` : `${poses} objet posé`} · places libres : ${libres('sol') + libres('grand')} au sol, ${libres('mur')} au mur. Tes objets comptent dans ta fortune, et te suivent si tu déménages.</p>
    <div class="pm-onglets" role="tablist">${CATEGORIES.map(([id, nom]) => `<button type="button" role="tab" class="pm-onglet" data-dc-onglet="${id}" aria-selected="${id === onglet}">${nom}</button>`).join('')}</div>
    <div class="vf-liste">${Object.values(OBJETS).filter(O => O.cat === onglet).map(ligneObjet).join('')}</div>
    <div class="vf-pied"><span>${S_PIED()}</span><button type="button" class="vf-bouton" data-dc="aller">Rentrer chez moi</button></div></div>`;
  el.hidden = false;
  for (const b of el.querySelectorAll('[data-dc-onglet]')) b.addEventListener('click', () => ouvrirDeco(b.dataset.dcOnglet));
  for (const b of el.querySelectorAll('[data-dc]')) b.addEventListener('click', () => agir(b.dataset.dc, b.dataset.o));
}
const S_PIED = () => `Tu as ${fmt(VIE.data?.argent || 0)}`;
async function agir(a, id) {
  const O = OBJETS[id];
  if (a === 'aller') { fermerFiche(); D.aller?.(); return; }
  if (!O) return;
  const x = D.o.find(y => y[0] === id);
  if (a === 'acheter' && !x) {
    if (D.achat) return; // un double clic pendant le paiement le faisait payer deux fois
    D.achat = true; const paye = await depenser(O.prix, `pour la maison : ${O.nom}`); D.achat = false;
    if (!paye) { D.ligne(`Il te faut ${fmt(O.prix)} pour : ${O.nom}.`); return; }
    const i = libre(O); D.o.push([id, i]); son('piece'); signaler('deco');
    D.ligne(i >= 0 ? `${O.nom} : à sa place, ${EMPLACEMENTS[plan()][i].nom}. Rentre chez toi pour voir ça !` : `Plus de place chez toi pour : ${O.nom}. Range un autre objet pour lui en faire.`);
  }
  else if (a === 'ranger' && x) { x[1] = -1; D.ligne(`Au placard : ${O.nom}.`); }
  else if ((a === 'poser' || a === 'bouger') && x) {
    const i = libre(O, x[1]);
    if (i < 0) D.ligne(a === 'poser' ? `Plus de place pour : ${O.nom}. Range d’abord un autre objet.` : `Pas d’autre place libre pour : ${O.nom}.`);
    else { x[1] = i; D.ligne(`${O.nom} : maintenant ${EMPLACEMENTS[plan()][i].nom}.`); }
  }
  sauver(); ouvrirDeco(D.onglet);
}
/** Le salon fournit le trajet jusque chez soi (« Rentrer chez moi »). */
export function surAllerChezMoi(f) { D.aller = f; }
