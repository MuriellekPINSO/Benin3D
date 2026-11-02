import * as THREE from 'three';

// ---------- La chemise jaune du zémidjan ----------
// Comme les vraies (photo de Murielle, 02/11) : chemise jaune à manches courtes, col pointu, boutons devant, poche de
// poitrine à gauche avec le numéro écrit dessus, et le grand numéro au dos. Elle est taillée dans le corps du personnage
// lui-même : on garde le torse et le haut des bras, poussés un peu vers l'extérieur, liés au même squelette. Elle suit
// donc chaque animation (marcher, s'asseoir sur la moto) comme un vrai vêtement, quelle que soit la tenue portée.
const TORSE = ['Waist', 'Spine01', 'Spine02', 'L_Clavicle', 'R_Clavicle'];
const BRAS = ['L_Upperarm', 'R_Upperarm', 'L_UpperarmTwist01', 'R_UpperarmTwist01']; // le haut du bras : la manche courte s'arrête avant UpperarmTwist02
const BASSIN = ['Hip', 'Pelvis'];
const JAUNE = '#f2c623', ENCRE = '#1c1c1c';
const PATRONS = new WeakMap(); // géométrie du corps → patron de la chemise (le même pour tous ceux qui portent ce corps)

/** Les morceaux de la chemise pour ce corps (SkinnedMesh), à ajouter à côté de lui ; null si ce n'est pas un personnage 3D. */
export function chemiseZem(corps, numero) {
  const P = patron(corps); if (!P) return null;
  const tissu = { roughness: .92, metalness: 0 };
  const devant = toile(c => dessinerDevant(c, numero)), dos = toile(c => dessinerDos(c, numero));
  const mats = [new THREE.MeshStandardMaterial({ ...tissu, map: devant }), new THREE.MeshStandardMaterial({ ...tissu, map: dos }), new THREE.MeshStandardMaterial({ ...tissu, color: JAUNE })];
  const col = new THREE.MeshStandardMaterial({ ...tissu, color: JAUNE, side: THREE.DoubleSide });
  const morceaux = [new THREE.SkinnedMesh(P.chemise, mats), new THREE.SkinnedMesh(P.col, col)];
  for (const m of morceaux) { m.bind(corps.skeleton, corps.bindMatrix); m.frustumCulled = false; m.name = 'chemise-zem'; }
  return { morceaux, liberer: () => { devant.dispose(); dos.dispose(); for (const m of [...mats, col]) m.dispose(); } };
}

function patron(corps) {
  if (!corps?.isSkinnedMesh) return null;
  if (PATRONS.has(corps.geometry)) return PATRONS.get(corps.geometry);
  const R = tailler(corps); PATRONS.set(corps.geometry, R); return R;
}

// Tout se mesure sur les sommets au repos et leurs poids d'os : les modèles sont compressés (positions entre −1 et 1),
// et les matrices des os ne sont pas dans le même repère que ces sommets.
function tailler(corps) {
  const os = corps.skeleton.bones.map(b => b.name), G = corps.geometry, P = G.attributes.position, N = G.attributes.normal, SI = G.attributes.skinIndex, SW = G.attributes.skinWeight, n = P.count;
  const famille = os.map(nom => (TORSE.includes(nom) ? 't' : /UpperarmTwist02/.test(nom) ? 'm' : BRAS.includes(nom) ? 'b' : BASSIN.includes(nom) ? 'p' : /Neck|Head/.test(nom) ? 'c' : /Forearm|Hand/.test(nom) ? 'a' : 'j'));
  const poids = [], dominant = new Int32Array(n), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const s = { t: 0, b: 0, m: 0, p: 0, c: 0, a: 0, j: 0 }; let m = -1;
    for (let k = 0; k < 4; k++) { const o = SI.getComponent(i, k), w = SW.getComponent(i, k); s[famille[o] ?? 'j'] += w; if (w > m) { m = w; dominant[i] = o; } }
    poids.push(s);
  }
  const centre = test => { const c = new THREE.Vector3(); let k = 0; for (let i = 0; i < n; i++) if (test(os[dominant[i]] || '')) { c.add(v.fromBufferAttribute(P, i)); k++; } return k ? c.divideScalar(k) : null; };
  const tete = centre(o => o === 'Head'), pieds = centre(o => /Foot|ToeBase/.test(o)), gauche0 = centre(o => /^L_(Clavicle|Upperarm)/.test(o)), droite0 = centre(o => /^R_(Clavicle|Upperarm)/.test(o)), taille0 = centre(o => o === 'Waist' || o === 'Spine01');
  if (!tete || !pieds || !gauche0 || !droite0 || !taille0) return null;
  // Le repère du corps : le haut, la gauche du personnage, l'avant.
  const haut = tete.clone().sub(pieds).normalize(), gauche = gauche0.clone().sub(droite0); gauche.addScaledVector(haut, -gauche.dot(haut)).normalize();
  const avant = new THREE.Vector3().crossVectors(gauche, haut), origine = taille0;
  const loc = q => { const d = q.clone().sub(origine); return [d.dot(gauche), d.dot(haut), d.dot(avant)]; };
  let bas = Infinity, sommet = -Infinity, demiLarg = 0, yTaille = 0, nT = 0; const cous = [];
  const L = []; for (let i = 0; i < n; i++) { const q = loc(v.fromBufferAttribute(P, i)); L.push(q); bas = Math.min(bas, q[1]); sommet = Math.max(sommet, q[1]); }
  for (let i = 0; i < n; i++) {
    const nom = os[dominant[i]] || '', q = L[i];
    if (/Neck/.test(nom)) cous.push(q[1]);
    if (nom === 'Spine01' || nom === 'Waist') demiLarg = Math.max(demiLarg, Math.abs(q[0]));
    if (nom === 'Waist') { yTaille += q[1]; nT++; }
  }
  const H = sommet - bas; yTaille = nT ? yTaille / nT : 0;
  if (!cous.length || !demiLarg) return null;
  const yCou = cous.sort((a, b) => a - b)[Math.floor(cous.length * .3)]; // la base du cou : l'encolure est coupée droit à cette hauteur
  const yOurlet = yTaille - .035 * H; // la chemise tombe un peu sous la ceinture, sur le haut des hanches
  const garde = new Int32Array(n).fill(-1), donnees = [];
  for (let i = 0; i < n; i++) {
    const s = poids[i], q = L[i];
    // Coupée droit en haut (l'encolure) et en bas (l'ourlet) ; les avant-bras, le bas du bras et la tête restent nus.
    if (q[1] < yOurlet || q[1] > yCou + .06 * H || (q[1] > yCou + .045 * H && s.c > .3) || s.a > .25 || s.m > .5 || (os[dominant[i]] || '') === 'Head') continue; // le haut des épaules monte plus haut que la base du cou
    const manche = s.b + s.m > s.t; // la manche s'évase vers le coude, le bas de la chemise tombe un peu
    const ecart = H * (manche ? .01 + .018 * Math.min(1, s.m * 2) : s.j > .3 ? .013 : .009);
    const nrm = new THREE.Vector3().fromBufferAttribute(N, i);
    garde[i] = donnees.length;
    donnees.push({ i, p: v.fromBufferAttribute(P, i).clone().addScaledVector(nrm, ecart), nrm, uv: [.5 + q[0] / (2.4 * demiLarg), (q[1] - yOurlet) / (yCou - yOurlet)] });
  }
  // Les triangles dont les trois sommets sont gardés : devant, dos ou côté selon où ils regardent.
  const tri = G.index ? G.index.array : Array.from({ length: n }, (_, i) => i), groupes = [[], [], []];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let f = 0; f < tri.length; f += 3) {
    const A = garde[tri[f]], B = garde[tri[f + 1]], C = garde[tri[f + 2]]; if (A < 0 || B < 0 || C < 0) continue;
    const pa = donnees[A].p; e1.subVectors(donnees[B].p, pa); e2.subVectors(donnees[C].p, pa); const face = e1.cross(e2).normalize().dot(avant);
    groupes[face > .3 ? 0 : face < -.3 ? 1 : 2].push(A, B, C);
  }
  if (!groupes[0].length) return null;
  const chemise = geometrie(donnees.map(d => ({ p: d.p, nrm: d.nrm, uv: d.uv, si: [0, 1, 2, 3].map(k => SI.getComponent(d.i, k)), sw: [0, 1, 2, 3].map(k => SW.getComponent(d.i, k)) })), groupes);
  // Le col : une bande autour du cou, ouverte devant, et deux pointes couchées sur la poitrine. Il suit le haut du dos.
  const dos2 = Math.max(0, os.indexOf('Spine02'));
  let cx = 0, cz = 0, nb = 0;
  for (let i = 0; i < n; i++) if (/Neck/.test(os[dominant[i]] || '') && Math.abs(L[i][1] - yCou - .035 * H) < .02 * H) { cx += L[i][0]; cz += L[i][2]; nb++; }
  cx /= nb || 1; cz /= nb || 1;
  let rCou = 0; nb = 0;
  for (let i = 0; i < n; i++) if (/Neck/.test(os[dominant[i]] || '') && Math.abs(L[i][1] - yCou - .035 * H) < .02 * H) { rCou += Math.hypot(L[i][0] - cx, L[i][2] - cz); nb++; }
  rCou = (nb ? rCou / nb : .035 * H) * 1.2;
  const surface = (a, b) => { let c = -Infinity; for (const d of donnees) { const q = loc(d.p); if (Math.abs(q[0] - a) < .03 * H && Math.abs(q[1] - b) < .03 * H) c = Math.max(c, q[2]); } return c > -Infinity ? c : cz + rCou; };
  const monde = (a, b, c) => origine.clone().addScaledVector(gauche, a).addScaledVector(haut, b).addScaledVector(avant, c);
  const autour = (phi, b, r) => monde(cx + Math.sin(phi) * r, b, cz + Math.cos(phi) * r);
  const pts = [], faces = [], bas0 = yCou + .015 * H, haut0 = yCou + .055 * H, pas = 16, ouv = .6;
  for (let k = 0; k <= pas; k++) { const phi = ouv + (2 * Math.PI - 2 * ouv) * k / pas; pts.push(autour(phi, bas0, rCou), autour(phi, haut0, rCou * 1.1)); if (k) faces.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k - 1, 2 * k + 1, 2 * k); }
  for (const s of [1, -1]) { // les deux pointes du col
    const o = pts.length, aP = cx + s * .04 * H, bP = yCou - .085 * H;
    pts.push(autour(s * ouv, haut0, rCou * 1.1), autour(s * (ouv + .9), bas0, rCou * 1.12), monde(aP, bP, surface(aP, bP) + .004 * H));
    faces.push(o, o + 1, o + 2);
  }
  const col = geometrie(pts.map(p => ({ p, nrm: avant, uv: [0, 0], si: [dos2, 0, 0, 0], sw: [1, 0, 0, 0] })), [faces]);
  col.computeVertexNormals();
  return { chemise, col };
}

function geometrie(sommets, groupes) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(sommets.flatMap(s => [s.p.x, s.p.y, s.p.z]), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(sommets.flatMap(s => [s.nrm.x, s.nrm.y, s.nrm.z]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(sommets.flatMap(s => s.uv), 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sommets.flatMap(s => s.si), 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sommets.flatMap(s => s.sw), 4));
  const index = []; groupes.forEach((liste, m) => { g.addGroup(index.length, liste.length, m); index.push(...liste); });
  g.setIndex(index); return g;
}

function toile(dessin) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  x.fillStyle = JAUNE; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(${i % 2 ? '255,255,255' : '120,80,0'},.05)`; x.fillRect((i * 97) % 512, 0, 2 + (i % 4), 512); } // le grain du tissu
  dessin(x); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// u = 0,5 au milieu du torse, u croît vers la gauche du personnage ; v = 0 à l'ourlet, 1 au cou (en haut de la toile).
function dessinerDevant(x, numero) {
  x.fillStyle = '#151515'; x.beginPath(); x.moveTo(226, 0); x.lineTo(256, 70); x.lineTo(286, 0); x.fill(); // le tricot noir dans l'encolure
  x.strokeStyle = 'rgba(150,105,0,.55)'; x.lineWidth = 3; for (const d of [-9, 9]) { x.beginPath(); x.moveTo(256 + d, 60); x.lineTo(256 + d, 512); x.stroke(); } // la patte de boutonnage
  for (const y of [110, 200, 290, 380, 465]) { x.fillStyle = '#fbf3cf'; x.beginPath(); x.arc(256, y, 7, 0, 7); x.fill(); x.strokeStyle = 'rgba(120,90,0,.6)'; x.lineWidth = 1.5; x.stroke(); }
  // La poche, sur le cœur, avec le numéro écrit au feutre et le tampon dessous.
  const px = 318, py = 96, pw = 104, ph = 112;
  x.fillStyle = 'rgba(160,110,0,.12)'; x.fillRect(px, py, pw, ph);
  x.setLineDash([6, 5]); x.strokeStyle = 'rgba(140,95,0,.8)'; x.lineWidth = 2.5; x.strokeRect(px + 4, py + 4, pw - 8, ph - 8); x.setLineDash([]);
  x.save(); x.translate(px + pw / 2, py + 48); x.rotate(-.05); x.fillStyle = ENCRE; x.font = '700 40px "Marker Felt", "Comic Sans MS", sans-serif'; x.textAlign = 'center'; x.fillText(numero, 0, 0); x.restore();
  x.strokeStyle = 'rgba(30,90,50,.8)'; x.lineWidth = 3; x.beginPath(); x.arc(px + pw / 2, py + 82, 17, 0, 7); x.stroke(); x.beginPath(); x.arc(px + pw / 2, py + 82, 10, 0, 7); x.stroke();
}
function dessinerDos(x, numero) { // vu de derrière, la gauche du personnage est à gauche : le texte est écrit à l'envers sur la toile
  x.save(); x.translate(512, 0); x.scale(-1, 1);
  x.fillStyle = ENCRE; x.textAlign = 'center'; x.font = '900 150px Impact, "Arial Black", sans-serif'; x.fillText(numero, 256, 280, 360);
  x.restore();
}
