import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// ---------- Le jet de Kutɔnu Vibes, dessiné en code ----------
// Avant, un petit avion de tourisme à hélice (modèle Tripo de 8 m) : « pourquoi mon avion ne ressemble pas à ça ? »
// (Murielle, 03/11, devant le jet de Lagos Life). Ici, un jet d'affaires de taille moyenne, 15,6 m : fuselage blanc et
// brillant, une rangée de hublots, le liseré vert, jaune et rouge, deux réacteurs à l'arrière, l'empennage en T vert,
// un escalier qui se déplie à droite, et dedans une cabine où l'on s'assoit (« puis-je regarder l'intérieur du vol ? »).
// Nez vers +z, gauche de l'avion vers +x, roues au sol (y = 0). La nuit, les hublots s'allument et le feu rouge du
// dessus clignote. Le fuselage fait 2,12 m de large : assez pour tenir debout dans la cabine (1,73 m sous le plafond).

export const LONGUEUR_JET = 15.6;
const Z0 = -7.8, YC = 1.7, R = 1.06, AH = .3; // AH : les hublots, à cet angle au-dessus du milieu du flanc
const VERT = '#1A7D52', JAUNE = '#F5B700', ROUGE = '#d7263d', BLANC = '#f4f5f2';
/** Le plancher de la cabine (hauteur au-dessus du sol). */
export const SOL_CABINE = .98;
/** La porte (à droite, derrière le poste de pilotage) : x, hauteur du seuil, z ; et le pied de l'escalier. */
export const PORTE_JET = [-.8, SOL_CABINE, 3.35], PIED_ESCALIER = [-2.45, 0, 3.35];
/** Le premier hublot de gauche, devant l'aile (pour la vue « Hublot ») : x, y, z. */
export const HUBLOT_JET = [Math.cos(AH) * R + .03, YC + Math.sin(AH) * R, 2.62];

// Le fuselage : un rayon et une hauteur d'axe pour chaque z (nez en ogive, cône de queue relevé).
const rayon = z => {
  const n = 7.8 - z; // depuis la pointe du nez
  if (n < 3.4) return R * Math.pow(Math.sin(n / 3.4 * Math.PI / 2), .62);
  if (z > -3) return R;
  return R - (R - .1) * Math.pow(Math.min(1, (-3 - z) / 4.8), 1.35);
};
const axe = z => (z < -3 ? .52 * Math.pow(Math.min(1, (-3 - z) / 4.8), 1.8) : z > 4.4 ? -.16 * Math.pow((z - 4.4) / 3.4, 1.6) : 0);

function fuselage(mat) {
  const NZ = 96, M = 48, pos = [], uv = [], idx = [];
  for (let i = 0; i <= NZ; i++) {
    const s = (1 - Math.cos(Math.PI * i / NZ)) / 2, z = Z0 + LONGUEUR_JET * s, r = i === 0 ? 0 : rayon(z), yc = YC + axe(z);
    for (let k = 0; k <= M; k++) { const th = 2 * Math.PI * k / M; pos.push(Math.sin(th) * r, yc - Math.cos(th) * r, z); uv.push(s, k / M); }
  }
  for (let i = 0; i < NZ; i++) for (let k = 0; k < M; k++) { const a = i * (M + 1) + k, b = a + 1, c = a + M + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

// La livrée, peinte sur une toile : u le long du fuselage (queue → nez), v autour (0 : dessous, ¼ : flanc gauche,
// ½ : dessus, ¾ : flanc droit). 2048 × 800 : un pixel fait 7,6 mm dans les deux sens. Le flanc gauche se lit à l'envers
// (le nez y est à gauche du regard) et le flanc droit la tête en bas : les textes y sont retournés.
const LT = 2048, HT = 800;
const PORTE_ANGLES = [Math.acos((YC - SOL_CABINE) / R), Math.acos(-.95 / R)]; // la porte, du plancher à 0,95 m au-dessus de l'axe
const px = z => (z - Z0) / LONGUEUR_JET * LT;
const yG = th => (1 - th / (2 * Math.PI)) * HT, yD = th => th / (2 * Math.PI) * HT; // th : angle côté gauche (π/2 = milieu du flanc)
const MI = Math.PI / 2;
const HUBLOTS = Array.from({ length: 7 }, (_, k) => 2.62 - .8 * k);

function toile(l, h) { const cv = document.createElement('canvas'); cv.width = l; cv.height = h; return [cv, cv.getContext('2d')]; }
function bande(c, z1, z2, th1, th2, couleur, pointe = 0) { // de z1 à z2 (z1 < z2), entre les angles th1 < th2, des deux côtés ; pointe : en biseau vers le nez
  c.fillStyle = couleur;
  for (const y of [yG, yD]) {
    const a = y(th1), b = y(th2);
    c.beginPath(); c.moveTo(px(z1), a); c.lineTo(px(z2) - pointe, a); c.lineTo(px(z2), (a + b) / 2); c.lineTo(px(z2) - pointe, b); c.lineTo(px(z1), b); c.closePath(); c.fill();
  }
}
function texte(c, mot, z, th, taille, couleur) {
  c.font = `800 ${taille}px "Arial Black", system-ui, sans-serif`; c.fillStyle = couleur; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.save(); c.translate(px(z), yG(th)); c.scale(-1, 1); c.fillText(mot, 0, 0); c.restore(); // flanc gauche
  c.save(); c.translate(px(z), yD(th)); c.scale(1, -1); c.fillText(mot, 0, 0); c.restore(); // flanc droit
}
function hublots(c, couleur, eclat) {
  const l = .27 / LONGUEUR_JET * LT, h = .3 / R / (2 * Math.PI) * HT;
  for (const z of HUBLOTS) for (const y of [yG, yD]) {
    c.fillStyle = couleur; c.beginPath(); c.roundRect(px(z) - l / 2, y(MI + AH) - h / 2, l, h, l * .45); c.fill();
    if (eclat) { c.fillStyle = eclat; c.beginPath(); c.roundRect(px(z) - l / 2 + 4, y(MI + AH) - h / 2 + 4, l - 8, h * .3, 6); c.fill(); }
  }
}
function livree() {
  const [cv, c] = toile(LT, HT);
  c.fillStyle = BLANC; c.fillRect(0, 0, LT, HT);
  c.fillStyle = '#e4e7e9'; c.fillRect(0, yG(.55), LT, HT - yG(.55)); c.fillRect(0, 0, LT, yD(.55)); // le ventre, un peu plus gris
  bande(c, -6.9, 6.3, MI - .2, MI - .05, VERT, 60); // le liseré sous les hublots : vert, jaune, rouge
  bande(c, -6.6, 5.9, MI - .29, MI - .23, JAUNE, 50);
  bande(c, -6.3, 5.5, MI - .35, MI - .315, ROUGE, 40);
  hublots(c, '#22303a', 'rgba(150, 190, 215, .35)');
  // Le pare-brise sur le dessus du nez (deux vitres et un montant), les vitres latérales du poste de pilotage.
  c.fillStyle = '#1d2830'; c.beginPath(); c.moveTo(px(5.12), yG(Math.PI + .64)); c.lineTo(px(5.12), yG(Math.PI - .64)); c.lineTo(px(5.92), yG(Math.PI - .4)); c.lineTo(px(5.92), yG(Math.PI + .4)); c.closePath(); c.fill();
  c.fillStyle = BLANC; c.fillRect(px(5.12), yG(Math.PI + .03), px(5.92) - px(5.12), yG(Math.PI - .03) - yG(Math.PI + .03));
  c.fillStyle = '#1d2830';
  for (const y of [yG, yD]) { c.beginPath(); c.moveTo(px(4.45), y(MI + .34)); c.lineTo(px(5.02), y(MI + .3)); c.lineTo(px(5.02), y(MI + .66)); c.lineTo(px(4.6), y(MI + .6)); c.closePath(); c.fill(); }
  // La porte, à droite : son contour et sa poignée.
  const [t1, t2] = PORTE_ANGLES;
  c.strokeStyle = '#b9bfc3'; c.lineWidth = 4; c.beginPath(); c.roundRect(px(2.95), yD(t1), px(3.75) - px(2.95), yD(t2) - yD(t1), 18); c.stroke();
  c.fillStyle = '#9aa3a8'; c.fillRect(px(3.6), yD(MI + .02), 14, 6);
  texte(c, 'Kutɔnu Vibes', .9, MI + .72, 50, VERT);
  texte(c, 'TY-KVB', -4.75, MI + .12, 30, '#59636a'); // l'immatriculation : TY, le préfixe du Bénin
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// Les hublots allumés, la nuit (carte d'émission : noir partout, sauf les hublots).
function lumieres() {
  const [cv, c] = toile(LT, HT); c.fillStyle = '#000'; c.fillRect(0, 0, LT, HT); hublots(c, '#fff', null);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// La dérive : vert, une vague jaune et un trait rouge, le rond du logo.
function derive() {
  const [cv, c] = toile(512, 512);
  c.fillStyle = VERT; c.fillRect(0, 0, 512, 512);
  c.fillStyle = JAUNE; c.beginPath(); c.moveTo(0, 150); c.bezierCurveTo(180, 120, 300, 300, 512, 250); c.lineTo(512, 330); c.bezierCurveTo(300, 380, 180, 200, 0, 230); c.closePath(); c.fill();
  c.fillStyle = ROUGE; c.beginPath(); c.moveTo(0, 248); c.bezierCurveTo(180, 218, 300, 398, 512, 348); c.lineTo(512, 372); c.bezierCurveTo(300, 422, 180, 242, 0, 272); c.closePath(); c.fill();
  c.strokeStyle = '#fafaf7'; c.lineWidth = 18; c.beginPath(); c.arc(300, 420, 46, .9, Math.PI * 2 - .9); c.stroke();
  c.fillStyle = JAUNE; c.beginPath(); c.arc(300, 420, 12, 0, Math.PI * 2); c.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- Ailes, dérive, stabilisateur : des profils reliés entre eux ----------
const ep = s => 5 * (.2969 * Math.sqrt(s) - .126 * s - .3516 * s * s + .2843 * s ** 3 - .1036 * s ** 4); // demi-épaisseur NACA 00xx (épaisseur 1)
const PROFIL = (() => { const n = 12, p = []; for (let i = 0; i <= n; i++) { const s = (1 - Math.cos(Math.PI * i / n)) / 2; p.push([s, ep(s)]); } for (let i = n - 1; i >= 1; i--) { const s = (1 - Math.cos(Math.PI * i / n)) / 2; p.push([s, -ep(s)]); } return p; })();
/** stations : { x, y, z (bord d'attaque), c (corde, vers l'arrière), e (épaisseur relative) } ; debout : épaisseur en x (dérive, winglet). */
function surface(stations, debout = false) {
  const P = PROFIL.length, pos = [], idx = [];
  for (const S of stations) for (const [s, e] of PROFIL) {
    const d = S.c * S.e * e;
    pos.push(S.x + (debout ? d : 0), S.y + (debout ? 0 : d), S.z - S.c * s);
  }
  for (let j = 0; j < stations.length - 1; j++) for (let i = 0; i < P; i++) { const a = j * P + i, b = j * P + (i + 1) % P, c = a + P, d = b + P; idx.push(a, b, c, b, d, c); }
  const n = pos.length / 3, last = stations.at(-1); // le bout fermé
  pos.push(last.x, last.y, last.z - last.c * .35); for (let i = 0; i < P; i++) idx.push(n - P + i, n - P + (i + 1) % P, n);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
// Le même objet, de l'autre côté (x → −x).
const miroir = geo => { const g = geo.clone(); g.scale(-1, 1, 1); const i = g.index.array; for (let k = 0; k < i.length; k += 3) [i[k + 1], i[k + 2]] = [i[k + 2], i[k + 1]]; g.computeVertexNormals(); return g; };
// UV à plat (dérive) : u le long de z, v en hauteur.
function uvPlat(geo) {
  geo.computeBoundingBox(); const b = geo.boundingBox, p = geo.attributes.position, uv = [];
  for (let i = 0; i < p.count; i++) uv.push((b.max.z - p.getZ(i)) / (b.max.z - b.min.z), (p.getY(i) - b.min.y) / (b.max.y - b.min.y));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return geo;
}

const MAT = {};
function construire() {
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: .38, metalness: .08, ...o });
  MAT.peau = std({ map: livree(), emissiveMap: lumieres(), emissive: '#ffd49a', emissiveIntensity: 0, roughness: .3 });
  MAT.blanc = std({ color: BLANC, side: THREE.DoubleSide });
  MAT.derive = std({ map: derive(), side: THREE.DoubleSide });
  MAT.metal = std({ color: '#a7aeb3', metalness: .55, roughness: .35, side: THREE.DoubleSide });
  MAT.sombre = std({ color: '#1c1f23', roughness: .7, side: THREE.DoubleSide });
  MAT.pneu = std({ color: '#1a1a1a', roughness: .9 });
  MAT.marche = std({ color: '#d4d8db', roughness: .6 });
  MAT.rouge = new THREE.MeshBasicMaterial({ color: '#ff2a2a' }); MAT.vert = new THREE.MeshBasicMaterial({ color: '#2cff6a' }); MAT.feu = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  MAT.flash = new THREE.MeshBasicMaterial({ color: '#ff3b2f' });
  const g = new THREE.Group(), add = (o, parent = g) => { o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  add(fuselage(MAT.peau));
  // Le carénage sous les ailes.
  add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), MAT.blanc)).scale.set(1, .3, 2.5); g.children.at(-1).position.set(0, .66, -.45); // sous le plancher de la cabine
  // Les ailes (dièdre 3,5°, flèche 17°) et leurs winglets.
  const dz = .3, ay = x => 1.06 + (x - .55) * .061;
  const aile = surface([{ x: .78, y: ay(.78), z: 1.05 - .23 * dz, c: 2.93, e: .13 }, { x: 3.2, y: ay(3.2), z: 1.05 - 2.65 * dz, c: 2.15, e: .115 }, { x: 8, y: ay(8), z: 1.05 - 7.45 * dz, c: 1.05, e: .1 }]);
  const winglet = surface([{ x: 7.93, y: ay(8) - .04, z: -1.2, c: 1.02, e: .08 }, { x: 8.12, y: ay(8) + .78, z: -1.92, c: .5, e: .08 }], true);
  for (const geo of [aile, winglet]) { add(new THREE.Mesh(geo, MAT.blanc)); add(new THREE.Mesh(miroir(geo), MAT.blanc)); }
  // La dérive (en T) et le stabilisateur posé dessus.
  add(new THREE.Mesh(uvPlat(surface([{ x: 0, y: 2.05, z: -4.5, c: 3.15, e: .11 }, { x: 0, y: 4.65, z: -6.55, c: 1.35, e: .1 }], true)), MAT.derive));
  const stab = surface([{ x: 0, y: 4.6, z: -6.5, c: 1.5, e: .09 }, { x: 3, y: 4.72, z: -7.36, c: .72, e: .08 }]);
  add(new THREE.Mesh(stab, MAT.blanc)); add(new THREE.Mesh(miroir(stab), MAT.blanc));
  add(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), MAT.derive)).scale.set(.13, .13, .9); g.children.at(-1).position.set(0, 4.65, -7.15);
  // Les deux réacteurs, à l'arrière du fuselage, et leurs mâts.
  const nacelle = new THREE.LatheGeometry([[.36, -3.22], [.43, -3.32], [.47, -3.7], [.46, -5.2], [.36, -5.95]].map(([r, z]) => new THREE.Vector2(r, z)), 28).rotateX(Math.PI / 2);
  for (const s of [1, -1]) {
    const n = add(new THREE.Mesh(nacelle, MAT.blanc)); n.position.set(1.68 * s, 2.02, 0);
    const entree = add(new THREE.Mesh(new THREE.CircleGeometry(.39, 24), MAT.sombre)); entree.position.set(1.68 * s, 2.02, -3.3);
    const cone = add(new THREE.Mesh(new THREE.ConeGeometry(.12, .3, 12).rotateX(Math.PI / 2), MAT.metal)); cone.position.set(1.68 * s, 2.02, -3.22);
    const tuyere = add(new THREE.Mesh(new THREE.CircleGeometry(.33, 20).rotateY(Math.PI), MAT.sombre)); tuyere.position.set(1.68 * s, 2.02, -5.9);
    const mat = add(new THREE.Mesh(new THREE.BoxGeometry(.85, .14, 1.25), MAT.blanc)); mat.position.set(1.08 * s, 2.02, -4.45);
  }
  // Les feux : rouge à gauche, vert à droite, blanc à la queue ; le feu rouge du dessus et du dessous clignote.
  for (const [m, x, y, z] of [[MAT.rouge, 8.04, ay(8) + .02, -1.32], [MAT.vert, -8.04, ay(8) + .02, -1.32], [MAT.feu, 0, 4.7, -7.95], [MAT.flash, 0, YC + R + .04, -1.1], [MAT.flash, 0, .6, .6]]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(.075, 10, 6), m); f.position.set(x, y, z); g.add(f);
  }
  // Le train d'atterrissage (rentré en l'air).
  const train = new THREE.Group(); train.name = 'train'; g.add(train);
  const roue = (r, l) => new THREE.CylinderGeometry(r, r, l, 18).rotateZ(Math.PI / 2), jambe = h => new THREE.CylinderGeometry(.05, .05, h, 8);
  for (const [x, z, r, l, haut] of [[0, 5, .24, .13, .66], [1.7, -1.05, .33, .2, 1.02], [-1.7, -1.05, .33, .2, 1.02]]) {
    const j = add(new THREE.Mesh(jambe(haut - r), MAT.metal), train); j.position.set(x, r + (haut - r) / 2, z);
    for (const e of [-1, 1]) { const w = add(new THREE.Mesh(roue(r, l), MAT.pneu), train); w.position.set(x + e * (l / 2 + .05), r, z); }
  }
  // L'escalier, déplié quand l'avion est garé, et l'ouverture sombre de la porte.
  const esc = new THREE.Group(); esc.name = 'escalier'; esc.visible = false; g.add(esc);
  const [xp, yp, zp] = PORTE_JET, [xb] = PIED_ESCALIER, N = 5;
  for (let k = 0; k < N; k++) { const f = (k + .5) / N, m = add(new THREE.Mesh(new THREE.BoxGeometry(.34, .06, .74), MAT.marche), esc); m.position.set(xp + (xb + .2 - xp) * f, yp * (1 - f) + .02, zp); }
  const pente = Math.hypot(xb + .2 - xp, yp), ang = Math.atan2(yp, xp - xb - .2);
  for (const e of [-1, 1]) {
    const lim = add(new THREE.Mesh(new THREE.BoxGeometry(pente + .1, .14, .04), MAT.metal), esc); lim.position.set((xp + xb + .2) / 2, yp / 2 + .04, zp + e * .39); lim.rotation.z = ang;
    const rampe = add(new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, pente, 6).rotateZ(Math.PI / 2), MAT.metal), esc); rampe.position.set((xp + xb + .2) / 2, yp / 2 + .82, zp + e * .4); rampe.rotation.z = ang;
  }
  const [t1, t2] = PORTE_ANGLES, ouverture = add(new THREE.Mesh(new THREE.CylinderGeometry(R + .006, R + .006, .78, 10, 1, true, 2 * Math.PI - t2, t2 - t1).rotateX(Math.PI / 2), MAT.sombre), esc);
  ouverture.position.set(0, YC, zp);
  return g;
}

// ---------- La cabine ----------
// Huit places en cuir crème : à l'avant, deux carrés de fauteuils face à face avec une table entre eux ; à l'arrière,
// deux fauteuils à gauche et un divan à droite. Parois crème au-dessus d'un soubassement de bois et d'un filet doré,
// une rampe de lumière au plafond, l'office à l'avant gauche. Les hublots sont de vrais trous : on voit l'aile et la
// côte au travers (la peau de l'avion, vue de l'intérieur, ne se dessine pas). Construite une fois, posée dans l'avion
// où l'on vole quand on choisit la vue « Cabine ».
const RC = R - .05, ZA = -2.55, ZF = 4.25; // rayon intérieur, cloisons arrière et avant
const FENETRES = HUBLOTS.flatMap(z => [[z, MI + AH], [z, 3 * MI - AH]]); // (z, angle) de chaque hublot, à gauche puis à droite
/** Le fauteuil du joueur, côté gauche (x opposé à droite), au premier hublot, dos à l'avant : il voit la cabine. */
export const PLACE_CABINE = { x: .47, z: 2.35, cap: Math.PI };
/** La caméra de la cabine (joueur assis à gauche ; x opposé à droite) : de l'autre côté de l'allée, vers lui et son hublot. */
export const CAMERA_CABINE = { oeil: [-.14, SOL_CABINE + 1.62, -.6], vise: [.45, SOL_CABINE + .82, 2.3] };
/** La lampe de la cabine (au plafond, au-dessus du carré). */
export const LAMPE_CABINE = [0, YC + RC - .25, 1.7];
const MATC = {};
function paroi() {
  const th0 = Math.acos((YC - SOL_CABINE) / RC), dz = .05, dt = .03, tour = 2 * Math.PI - 2 * th0;
  const NZ = Math.round((ZF - ZA) / dz), NT = Math.round(tour / dt), pos = [], groupes = [[], [], []]; // bois en bas, filet doré, crème en haut
  for (let i = 0; i <= NZ; i++) for (let k = 0; k <= NT; k++) { const z = ZA + (ZF - ZA) * i / NZ, th = th0 + tour * k / NT; pos.push(Math.sin(th) * RC, YC - Math.cos(th) * RC, z); }
  for (let i = 0; i < NZ; i++) for (let k = 0; k < NT; k++) {
    const zc = ZA + (ZF - ZA) * (i + .5) / NZ, tc = th0 + tour * (k + .5) / NT;
    if (FENETRES.some(([z, t]) => ((zc - z) / .135) ** 4 + ((tc - t) * RC / .14) ** 4 < 1)) continue; // un hublot
    const y = YC - Math.cos(tc) * RC, a = i * (NT + 1) + k, b = a + 1, c = a + NT + 1, d = c + 1;
    groupes[y < 1.52 ? 0 : y < 1.56 ? 1 : 2].push(a, c, b, b, c, d); // faces tournées vers l'intérieur
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(groupes.flat()); let o = 0; groupes.forEach((g, m) => { geo.addGroup(o, g.length, m); o += g.length; });
  geo.computeVertexNormals(); return geo;
}
const rond = (p, l, h, r) => { p.moveTo(-l / 2 + r, -h / 2); p.lineTo(l / 2 - r, -h / 2); p.quadraticCurveTo(l / 2, -h / 2, l / 2, -h / 2 + r); p.lineTo(l / 2, h / 2 - r); p.quadraticCurveTo(l / 2, h / 2, l / 2 - r, h / 2); p.lineTo(-l / 2 + r, h / 2); p.quadraticCurveTo(-l / 2, h / 2, -l / 2, h / 2 - r); p.lineTo(-l / 2, -h / 2 + r); p.quadraticCurveTo(-l / 2, -h / 2, -l / 2 + r, -h / 2); return p; };
function construireCabine() {
  const lam = (c, e = .42) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(e) }); // l'éclairage de la cabine, même la nuit
  Object.assign(MATC, { creme: lam('#efe7d8'), bois: lam('#7b5537'), or: lam('#c9a227'), cuir: lam('#e8d9bf'), cuir2: lam('#cbb692'), socle: lam('#3a3a40', .3), tapis: lam('#6e675e'), allee: lam('#8d857a'), cadre: lam('#ddd3c1'), rideau: lam('#2f4a5a') });
  MATC.lampe = new THREE.MeshBasicMaterial({ color: '#fff4dc' });
  const g = new THREE.Group(), b = (parent, l, h, p, m, x, y, z, rx = 0, arrondi = 0) => {
    const o = new THREE.Mesh(arrondi ? new RoundedBoxGeometry(l, h, p, 3, arrondi) : new THREE.BoxGeometry(l, h, p), m); o.position.set(x, y, z); o.rotation.x = rx; parent.add(o); return o;
  };
  g.add(new THREE.Mesh(paroi(), [MATC.bois, MATC.or, MATC.creme]));
  // Le cadre crème de chaque hublot, posé à plat contre la paroi, tourné vers la cabine.
  const forme = rond(new THREE.Shape(), .4, .44, .14); forme.holes.push(rond(new THREE.Path(), .25, .27, .11));
  const cadreGeo = new THREE.ShapeGeometry(forme, 6), X = new THREE.Vector3(0, 0, 1);
  for (const [z, t] of FENETRES) {
    const c = new THREE.Mesh(cadreGeo, MATC.cadre), r = RC - .012;
    c.matrix.makeBasis(X, new THREE.Vector3(Math.cos(t), Math.sin(t), 0), new THREE.Vector3(-Math.sin(t), Math.cos(t), 0)).setPosition(Math.sin(t) * r, YC - Math.cos(t) * r, z);
    c.matrixAutoUpdate = false; g.add(c);
  }
  // Le plancher (moquette, allée plus claire), la rampe de lumière, les deux cloisons.
  const lp = 2 * Math.sqrt(RC * RC - (YC - SOL_CABINE) ** 2);
  b(g, lp, .02, ZF - ZA, MATC.tapis, 0, SOL_CABINE - .01, (ZA + ZF) / 2); b(g, .38, .01, ZF - ZA - .1, MATC.allee, 0, SOL_CABINE + .006, (ZA + ZF) / 2);
  b(g, .32, .015, ZF - ZA - .5, MATC.lampe, 0, YC + RC - .03, (ZA + ZF) / 2);
  const arriere = new THREE.Mesh(new THREE.CircleGeometry(RC, 40), MATC.creme); arriere.position.set(0, YC, ZA); g.add(arriere);
  const avant = new THREE.Mesh(new THREE.CircleGeometry(RC, 40).rotateY(Math.PI), MATC.creme); avant.position.set(0, YC, ZF); g.add(avant);
  b(g, .62, 1.62, .03, MATC.bois, 0, SOL_CABINE + .81, ZA + .02); b(g, .03, .16, .03, MATC.or, .22, SOL_CABINE + .95, ZA + .05); // la porte des toilettes
  b(g, .64, 1.62, .03, MATC.rideau, 0, SOL_CABINE + .81, ZF - .02); // le rideau du poste de pilotage
  // Le long du plancher, de chaque côté, une banquette de bois basse (elle cache aussi l'emplanture de l'aile).
  for (const k of [-1, 1]) { b(g, .2, .3, 5.4, MATC.bois, .76 * k, SOL_CABINE + .15, .15); b(g, .22, .02, 5.4, MATC.creme, .75 * k, SOL_CABINE + .31, .15); }
  // L'office, à l'avant gauche : placard de bois, plan crème.
  b(g, .55, 1, 1.05, MATC.bois, .43, SOL_CABINE + .5, 3.68); b(g, .6, .04, 1.1, MATC.creme, .43, SOL_CABINE + 1.02, 3.68);
  // Les fauteuils (dessus de l'assise à 0,47 m, comme les chaises du jeu), les tables, le divan.
  const fauteuil = (x, z, cap) => {
    const f = new THREE.Group(); f.position.set(x, SOL_CABINE, z); f.rotation.y = cap; g.add(f);
    b(f, .42, .33, .42, MATC.socle, 0, .165, -.02); b(f, .54, .15, .54, MATC.cuir, 0, .4, 0, 0, .06);
    b(f, .54, .7, .16, MATC.cuir, 0, .8, -.25, -.1, .07); b(f, .42, .18, .14, MATC.cuir2, 0, 1.2, -.3, -.1, .06);
    for (const s of [-1, 1]) b(f, .09, .17, .52, MATC.cuir2, s * .28, .55, -.01, 0, .04);
  };
  for (const k of [-1, 1]) {
    fauteuil(.47 * k, 2.35, Math.PI); fauteuil(.47 * k, 1.15, 0); // le carré : face à face
    b(g, .5, .04, .5, MATC.bois, .5 * k, SOL_CABINE + .7, 1.75, 0, .015); b(g, .06, .7, .06, MATC.socle, .5 * k, SOL_CABINE + .35, 1.75);
  }
  fauteuil(.47, -.2, 0); fauteuil(.47, -1.3, 0);
  const d = new THREE.Group(); d.position.set(-.55, SOL_CABINE, -1.25); d.rotation.y = Math.PI / 2; g.add(d); // le divan, face à l'allée
  b(d, 1.7, .33, .42, MATC.socle, 0, .165, -.02); b(d, 1.7, .15, .54, MATC.cuir, 0, .4, 0, 0, .06); b(d, 1.7, .56, .15, MATC.cuir, 0, .76, -.25, -.12, .07);
  for (const s of [-1, 1]) b(d, .1, .2, .54, MATC.cuir2, s * .8, .55, 0, 0, .04);
  g.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
  return g;
}
let CABINE = null;
/** La cabine (une seule : on ne vole que dans un avion à la fois), à poser dans le modèle du jet. */
export function cabine() { CABINE ??= construireCabine(); return CABINE; }

let MODELE = null;
/** Un jet neuf (géométries et matières partagées entre tous les jets). userData.train, userData.escalier. */
export function jet() {
  MODELE ??= construire();
  const g = MODELE.clone(); g.userData.train = g.getObjectByName('train'); g.userData.escalier = g.getObjectByName('escalier');
  return g;
}
/** À chaque image : les hublots s'allument avec la nuit (0 à 1), le feu rouge clignote. */
export function majJet(nuit) {
  if (!MODELE) return;
  MAT.peau.emissiveIntensity = nuit * 1.5;
  MAT.flash.visible = performance.now() % 1300 < 140;
  if (CABINE) for (const m of Object.values(MATC)) if (m.emissiveIntensity !== undefined) m.emissiveIntensity = .55 + .6 * nuit;
}
