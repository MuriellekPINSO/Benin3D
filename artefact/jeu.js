// ---------- Véhicules : zémidjan, tokpa-tokpa, voitures, chèvres, marchandes ----------
// Zém : moto rouge à selle longue, conducteur en chemise jaune numérotée (Cotonou), casque.
// Tokpa-tokpa : vieux minibus blanc, porte latérale ouverte, apprenti, galerie chargée sous filet.
const B3 = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C3 = (r1, r2, h, s = 10) => new THREE.CylinderGeometry(r1, r2, h, s);
function partsZem(c = {}) {
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
function partsTokpa(c = {}) {
  const P = [], add = (g, hex) => P.push([g, hex]);
  const s = new THREE.Shape();
  s.moveTo(-2.45, 0.42); s.lineTo(2.2, 0.42); s.lineTo(2.45, 0.62); s.lineTo(2.45, 1.05); s.lineTo(2.22, 1.17); s.lineTo(1.72, 2.05); s.lineTo(-2.38, 2.1); s.lineTo(-2.45, 1.92); s.closePath();
  add(new THREE.ExtrudeGeometry(s, { depth: 1.86, bevelEnabled: false }).translate(0, 0, -0.93), c.couleur || '#e9e6dc');
  add(B3(3.5, 0.55, 1.9).translate(-0.4, 1.63, 0), '#27323a');
  add(B3(0.05, 1.02, 1.7).rotateZ(0.507).translate(1.99, 1.6, 0), '#2b3a44');
  add(B3(0.06, 0.5, 1.6).translate(-2.46, 1.6, 0), '#27323a');
  add(B3(1.0, 1.4, 0.05).translate(0.45, 1.18, 0.94), '#121619');
  add(B3(4.9, 0.1, 1.9).translate(0, 0.98, 0), c.bande || '#3d8f5a');
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
  if (c.apprenti !== false) {
    add(B3(0.3, 0.55, 0.3).rotateX(-0.35).translate(0.45, 1.45, 1.12), '#c8382f');
    add(new THREE.SphereGeometry(0.13, 8, 6).translate(0.45, 1.86, 1.25), '#4a2f22');
    add(B3(0.12, 0.6, 0.12).translate(0.4, 0.9, 1.05), '#2d3e5a');
    add(C3(0.04, 0.04, 0.5, 5).rotateX(-1.1).translate(0.55, 1.6, 1.32), '#c8382f');
  }
  for (let x = -1.9; x < 1.2; x += 0.62) add(new THREE.SphereGeometry(0.12, 6, 5).translate(x, 1.66, -0.75), '#4a2f22');
  return P;
}
function partsVoiture(couleur) {
  const P = [], add = (g, hex) => P.push([g, hex]);
  add(B3(4.3, 0.72, 1.8).translate(0, 0.68, 0), couleur); add(B3(2.3, 0.6, 1.62).translate(-0.25, 1.32, 0), '#2e3a40');
  add(B3(2.2, 0.08, 1.66).translate(-0.25, 1.65, 0), couleur);
  for (const x of [1.35, -1.35]) for (const z of [0.86, -0.86]) add(C3(0.33, 0.33, 0.22, 10).rotateX(Math.PI / 2).translate(x, 0.33, z), '#1c1c1e');
  for (const z of [0.6, -0.6]) add(B3(0.05, 0.14, 0.32).translate(2.16, 0.78, z), '#f4efd8');
  return P;
}
function partsChevre() {
  const P = [], add = (g, hex) => P.push([g, hex]);
  add(B3(0.85, 0.38, 0.34).translate(0, 0.62, 0), '#e8e2d4'); add(B3(0.3, 0.38, 0.34).translate(-0.25, 0.62, 0), '#6a4a32');
  add(B3(0.24, 0.28, 0.2).rotateZ(0.5).translate(0.5, 0.9, 0), '#e8e2d4');
  for (const x of [0.32, -0.32]) for (const z of [0.12, -0.12]) add(B3(0.07, 0.45, 0.07).translate(x, 0.22, z), '#6a4a32');
  for (const z of [0.06, -0.06]) add(C3(0.01, 0.03, 0.2, 4).rotateZ(-0.6).translate(0.5, 1.1, z), '#4a3a2a');
  return P;
}
function partsMarchande(pagne) {
  const P = [], add = (g, hex) => P.push([g, hex]);
  add(C3(0.2, 0.3, 1.1, 8).translate(0, 0.56, 0), pagne); add(C3(0.17, 0.2, 0.4, 8).translate(0, 1.3, 0), pagne);
  add(new THREE.SphereGeometry(0.14, 8, 6).translate(0, 1.66, 0), '#4a2f22');
  add(C3(0.42, 0.3, 0.16, 12).translate(0, 1.88, 0), '#c9ccd0');
  for (const [x, z, c] of [[0.12, 0, '#d8432f'], [-0.12, 0.08, '#e9b23a'], [0, -0.14, '#5d9b3a']]) add(new THREE.SphereGeometry(0.11, 6, 5).translate(x, 2.02, z), c);
  return P;
}
const matVeh = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: .05 });

// ---------- Tokpa-tokpa en circulation, aux portes de la ville ----------
// Interdits dans Cotonou depuis 2021 : on les fait rouler vers Calavi, Godomey et la sortie est.
let tokpas = null, tokpaState = [];
function construireTokpas() {
  const paths = []; let total = 0;
  for (const L of roadLines) {
    if (L.bridge || L.cls > 2 || L.pts.length < 2) continue;
    const m = L.pts[Math.floor(L.pts.length / 2)];
    if (!(m[0] < -5200 || (m[1] < -2800 && m[0] < -1500) || m[0] > 8000)) continue;
    const xz = new Float32Array(L.pts.length * 2), cum = new Float32Array(L.pts.length);
    for (let j = 0; j < L.pts.length; j++) { xz[2 * j] = L.pts[j][0]; xz[2 * j + 1] = L.pts[j][1]; if (j) cum[j] = cum[j - 1] + Math.hypot(xz[2 * j] - xz[2 * j - 2], xz[2 * j + 1] - xz[2 * j - 1]); }
    const len = cum[cum.length - 1]; if (len < 60) continue; total += len; paths.push({ xz, cum, len, w: ROAD_W[L.cls], acc: total });
  }
  if (!paths.length) return;
  const n = LITE ? 70 : 160;
  tokpas = new THREE.InstancedMesh(mergeColored(partsTokpa()), matVeh, n);
  tokpas.instanceMatrix.setUsage(THREE.DynamicDrawUsage); tokpas.frustumCulled = false; tokpas.visible = false; tokpas.castShadow = !LITE;
  for (let i = 0; i < n; i++) {
    const r = hash(i, 160) * total; let lo = 0, hi = paths.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (paths[mid].acc < r) lo = mid + 1; else hi = mid; }
    const P = paths[lo]; tokpaState.push({ P, s: hash(i, 161) * P.len, v: 7 + hash(i, 162) * 5, dir: hash(i, 163) < .5 ? 1 : -1, seg: 0, lane: 2.2 + hash(i, 164) * 1.2 });
  }
  scene.add(tokpas);
}
function majTokpas(dt) {
  if (!tokpas) return;
  const A = tokpas.instanceMatrix.array;
  for (let i = 0; i < tokpaState.length; i++) {
    const z = tokpaState[i], P = z.P; z.s += z.v * dt * z.dir;
    if (z.s >= P.len) { z.s = P.len - .01; z.dir = -1; } else if (z.s <= 0) { z.s = .01; z.dir = 1; }
    const cum = P.cum; let k = z.seg; while (k < cum.length - 2 && z.s > cum[k + 1]) k++; while (k > 0 && z.s < cum[k]) k--; z.seg = k;
    const x0 = P.xz[2 * k], z0 = P.xz[2 * k + 1], x1 = P.xz[2 * k + 2], z1 = P.xz[2 * k + 3], sl = cum[k + 1] - cum[k] || 1, t = (z.s - cum[k]) / sl;
    const dx = (x1 - x0) / sl * z.dir, dz = (z1 - z0) / sl * z.dir, x = x0 + (x1 - x0) * t - dz * z.lane, zz = z0 + (z1 - z0) * t + dx * z.lane;
    const th = Math.atan2(-dz, dx), c = Math.cos(th), s = Math.sin(th), o = i * 16;
    A[o] = c; A[o + 1] = 0; A[o + 2] = -s; A[o + 3] = 0; A[o + 4] = 0; A[o + 5] = 1; A[o + 6] = 0; A[o + 7] = 0; A[o + 8] = s; A[o + 9] = 0; A[o + 10] = c; A[o + 11] = 0; A[o + 12] = x; A[o + 13] = 0.05; A[o + 14] = zz; A[o + 15] = 1;
  }
  tokpas.instanceMatrix.needsUpdate = true;
}

// ---------- Nouveaux lieux : UAC, Sèmè One ----------
K.motif('facadeSeme', (c, t) => {
  c.fillStyle = '#b5553f'; c.fillRect(0, 0, t, t);
  for (let f = 0; f < 3; f++) { const y = f * t / 3; c.fillStyle = '#a24a37'; c.fillRect(0, y + t * .3, t, t * .03); c.fillStyle = '#2f3437'; c.fillRect(t * .12, y + t * .08, t * .22, t * .18); c.fillRect(t * .62, y + t * .08, t * .22, t * .18); }
  c.fillStyle = '#c96a4f'; for (let i = 0; i < 4; i++) c.fillRect(i * t / 4 + t * .02, 0, t * .03, t);
  const fins = ['#f2c21b', '#6b4fa3', '#2f6fb0'];
  c.fillStyle = fins[Math.floor(Math.random() * 3)]; c.fillRect(t * .47, 0, t * .035, t);
});
function semeOne(ring) {
  if (!ring) return;
  const c = centroide(ring), o = obb(ring);
  const g = groupeLieu('seme-one', c[0], c[1]);
  K.into(g, () => {
    const loc = ring.map(([x, z]) => [x - c[0], z - c[1]]);
    mursPoly(loc, 0, 12.5, K.tex('facadeSeme', 1, 1), 7.5, 12.5, undefined, K.mat('#c9bfb2'));
    const ang = o.L >= o.W ? o.ang : o.ang + Math.PI / 2, len = Math.max(o.L, o.W), dep = Math.min(o.L, o.W);
    const sx = Math.cos(ang), sz = Math.sin(ang);
    const nx = -sz, nz = sx; // façade : enseigne sur le toit, des deux côtés
    for (const s of [1, -1]) { panneauTexte(['SÈMÈ ONE'], 20, 3, nx * s * (dep / 2 + .3), 14.4, nz * s * (dep / 2 + .3), Math.atan2(nx * s, nz * s), { fond: '#f4f1ea', encre: '#9a3d2b', px: 1024, py: 154, police: '800 118px "Bricolage Grotesque", system-ui, sans-serif' }).material.side = THREE.FrontSide; }
    for (let k = -2; k <= 2; k++) voiture(sx * k * 9 + nx * (dep / 2 + 6), sz * k * 9 + nz * (dep / 2 + 6), ['#1f2326', '#e8e8e4', '#9da3a6', '#3c4a4f', '#e8e8e4'][k + 2], -ang);
  });
  bake(g);
}
function portailUAC(campus) {
  if (!campus) return;
  const [bx, bz] = toXZ(6.4136, 2.3419);
  let best = null, bd = 1e12;
  for (let i = 0; i < campus.length; i++) { const a = campus[i], b = campus[(i + 1) % campus.length]; const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((bx - a[0]) * dx + (bz - a[1]) * dz) / L2)); const px = a[0] + dx * t, pz = a[1] + dz * t, d = (px - bx) ** 2 + (pz - bz) ** 2; if (d < bd) { bd = d; best = [px, pz, Math.atan2(dz, dx)]; } }
  const [px, pz, ang] = best;
  const g = groupeLieu('uac', px, pz, ang);
  K.into(g, () => {
    // Portail aux piliers orangés, bandeau blanc à lettres bleues, guérite blanche à soubassement brun.
    const peche = K.mat('#e8a77a'), blanc = K.mat('#f3efe6');
    for (const x of [-9, 9]) { K.boite(2.2, 7.5, 2.2, peche, x, 3.75, 0); for (const y of [2, 4.2]) K.boite(.7, 1.3, 2.25, '#c98d63', x, y, 0); }
    K.boite(20.5, 1.2, 1.6, peche, 0, 7.2, 0);
    for (const s of [1, -1]) { const p = panneauTexte(['UNIVERSITÉ D\'ABOMEY-CALAVI', 'CAMPUS UNIVERSITAIRE D\'ABOMEY-CALAVI'], 17, 2.2, 0, 6.3, s * .84, s > 0 ? 0 : Math.PI, { fond: '#f6f3ea', encre: '#1f4f9a', px: 1600, py: 207, police: '800 64px system-ui, sans-serif' }); }
    K.cyl(2.6, 2.6, 1.2, 20, '#7a5236', 14, .6, 4); K.cyl(2.5, 2.5, 1.6, 20, blanc, 14, 2, 4); K.cyl(2.9, 2.9, .3, 20, blanc, 14, 2.95, 4);
    for (const x of [-30, -20, 20, 30]) K.boite(10, 2.4, .4, '#e7dccb', x, 1.2, 0);
    K.boite(.12, 8, .12, '#d9d9d6', -12, 4, -3); K.boite(1.4, .06, .8, '#2b3a4a', -12, 8.1, -3);
  });
  bake(g);
}

// ---------- Audio : radio, moteur, effets ----------
const AUDIO = { ctx: null, buf: null, src: null, radio: false, moteur: null, gainR: null };
function audioCtx() { try { if (!AUDIO.ctx) AUDIO.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (AUDIO.ctx.state === 'suspended') AUDIO.ctx.resume(); } catch (e) { } return AUDIO.ctx; }
async function radio(on) {
  const ctx = audioCtx(); if (!ctx) return false;
  AUDIO.radio = on;
  if (!on) { try { AUDIO.src?.stop(); } catch (e) { } AUDIO.src = null; return false; }
  try {
    if (!AUDIO.buf) { const b64 = document.getElementById('radio-mp3')?.textContent.replace(/\s+/g, ''); if (!b64) return false; const bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)); AUDIO.buf = await ctx.decodeAudioData(bin.buffer); }
    if (AUDIO.src || !AUDIO.radio) return true;
    const src = ctx.createBufferSource(); src.buffer = AUDIO.buf; src.loop = true;
    AUDIO.gainR = ctx.createGain(); AUDIO.gainR.gain.value = .55; src.connect(AUDIO.gainR).connect(ctx.destination); src.start(); AUDIO.src = src; return true;
  } catch (e) { console.warn('radio', e); return false; }
}
function moteur(type) {
  const ctx = audioCtx(); if (!ctx) return;
  moteurStop();
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = type === 'tokpa' ? 420 : 700; g.gain.value = 0;
  o.connect(f); o2.connect(f); f.connect(g).connect(ctx.destination); o.start(); o2.start();
  AUDIO.moteur = { o, o2, g, base: type === 'tokpa' ? 42 : 68, k: type === 'tokpa' ? 2.4 : 4.2 };
}
function moteurMaj(v, actif) { const m = AUDIO.moteur; if (!m) return; const t = AUDIO.ctx.currentTime; m.o.frequency.setTargetAtTime(m.base + v * m.k, t, .08); m.o2.frequency.setTargetAtTime((m.base + v * m.k) * .5, t, .08); m.g.gain.setTargetAtTime(actif ? .045 : 0, t, .1); }
function moteurStop() { const m = AUDIO.moteur; if (!m) return; try { m.g.gain.value = 0; m.o.stop(); m.o2.stop(); } catch (e) { } AUDIO.moteur = null; }
function son(nom) {
  const ctx = AUDIO.ctx; if (!ctx || JEU.muet) return; const t = ctx.currentTime;
  const bip = (type, f0, f1, d, v = .12, t0 = 0) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t + t0); o.frequency.exponentialRampToValueAtTime(f1, t + t0 + d); g.gain.setValueAtTime(v, t + t0); g.gain.exponentialRampToValueAtTime(.001, t + t0 + d); o.connect(g).connect(ctx.destination); o.start(t + t0); o.stop(t + t0 + d + .02); };
  if (nom === 'piece') { bip('sine', 1320, 1760, .09, .1); bip('sine', 1760, 2200, .1, .08, .07); }
  else if (nom === 'saut') bip('sine', 300, 700, .18, .1);
  else if (nom === 'klaxon') { bip('square', 430, 425, .16, .07); bip('square', 430, 425, .22, .07, .2); }
  else if (nom === 'arret') { bip('triangle', 880, 880, .25, .14); bip('triangle', 1320, 1320, .35, .12, .18); }
  else if (nom === 'bosse') bip('sine', 120, 50, .2, .25);
  else if (nom === 'choc') { const n = ctx.createBufferSource(), b = ctx.createBuffer(1, ctx.sampleRate * .35, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2; n.buffer = b; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = ctx.createGain(); g.gain.value = .5; n.connect(f).connect(g).connect(ctx.destination); n.start(); }
}

// ---------- Zém Run : le jeu ----------
const VEH = {
  zem: { nom: 'Zémidjan', vmax: 25, accel: 4.4, larg: .75, long: 2.1, places: 1, tarif: [200, 450], cam: [8.2, 3.4] },
  tokpa: { nom: 'Tokpa-tokpa', vmax: 21, accel: 3.2, larg: 1.9, long: 5, places: 14, tarif: [150, 300], cam: [12.5, 5.2] },
};
const QUIZ = {
  centre: [["Où se trouve le plus grand marché à ciel ouvert d'Afrique de l'Ouest ?", ['Dantokpa', 'Ganhi', 'Akpakpa'], 0], ["Dans quel quartier se dresse la cathédrale rayée de rouge et de blanc ?", ['Missèbo', 'Ganhi', 'Étoile Rouge'], 1], ["Combien de ponts relient le centre à Akpakpa ?", ['Deux', 'Trois', 'Cinq'], 1]],
  marina: [["Quel quartier est celui de l'aéroport ?", ['Cadjèhoun', 'Haie Vive', 'Ganhi'], 0], ["Quelle hauteur fait la statue de l'Amazone ?", ['12 mètres', '30 mètres', '60 mètres'], 1], ["Quel bâtiment abrite la présidence de la République ?", ['Le Palais des Congrès', 'Le Palais de la Marina', 'Sèmè One'], 1]],
  calavi: [["En quelle année est née l'Université d'Abomey-Calavi ?", ['1960', '1970', '1990'], 1], ["D'où partent les pirogues pour Ganvié ?", ['Abomey-Calavi', 'Godomey', 'Akpakpa'], 0], ["Depuis 2021, où s'arrêtent les tokpa-tokpa venus de Calavi ?", ['À Dantokpa', 'À Godomey', 'À Ganhi'], 1]],
  plage: [["Le long de quelle route s'étend la plage de Fidjrossè ?", ['La route des Pêches', 'Le boulevard Saint-Michel', 'La route de Calavi'], 0], ["Comment s'appelle l'équipe nationale qui joue au stade de l'Amitié ?", ['Les Écureuils', 'Les Guépards', 'Les Lions'], 1], ["Combien de voies se rejoignent à l'Étoile Rouge ?", ['Trois', 'Cinq', 'Huit'], 1]],
};
const LANE = 2.7;
const JEU = { actif: false, pause: false, muet: false, etat: null, objets: [], decor: null, joueur: null, ligne: null, veh: 'zem', numero: '1234', lignes: [], meilleur: {} };
try { const s = JSON.parse(localStorage.getItem('zemrun') || '{}'); JEU.meilleur = s.meilleur || {}; JEU.numero = s.numero || '1234'; } catch (e) { }
const sauver = () => { try { localStorage.setItem('zemrun', JSON.stringify({ meilleur: JEU.meilleur, numero: JEU.numero })); } catch (e) { } };
const fmtF = n => `${Math.round(n).toLocaleString('fr-FR')} F`;

function cheminDe(pts) {
  let p = pts.map(q => [q[0], q[1]]);
  for (let it = 0; it < 3; it++) { const o = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; o.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } o.push(p[p.length - 1]); p = o; }
  const cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.floor(L) + 1, X = new Float32Array(n), Z = new Float32Array(n);
  let j = 0; for (let d = 0; d < n; d++) { while (j < p.length - 2 && cum[j + 1] < d) j++; const t = (d - cum[j]) / ((cum[j + 1] - cum[j]) || 1); X[d] = p[j][0] + (p[j + 1][0] - p[j][0]) * t; Z[d] = p[j][1] + (p[j + 1][1] - p[j][1]) * t; }
  return { X, Z, n, L: n - 1 };
}
const tmpPose = { x: 0, z: 0, dx: 1, dz: 0, a: 0 };
function pose(C, s, lat = 0, out = tmpPose) {
  const sc = Math.max(0, Math.min(C.n - 1.001, s)), i = Math.floor(sc), t = sc - i;
  const x = C.X[i] + (C.X[i + 1] - C.X[i]) * t, z = C.Z[i] + (C.Z[i + 1] - C.Z[i]) * t;
  const i0 = Math.max(0, i - 3), i1 = Math.min(C.n - 1, i + 4); let dx = C.X[i1] - C.X[i0], dz = C.Z[i1] - C.Z[i0]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  out.x = x - dz * lat; out.z = z + dx * lat; out.dx = dx; out.dz = dz; out.a = Math.atan2(-dz, dx); return out;
}

// Objets du jeu : géométries partagées.
const GJ = {};
function geosJeu() {
  if (GJ.zem) return;
  GJ.zem = mergeColored(partsZem({ passager: '#2f6fb0' }));
  GJ.zemB = mergeColored(partsZem({ chemise: '#f2c21b', carrosserie: '#1d1d22' }));
  GJ.tokpa = mergeColored(partsTokpa());
  GJ.voit = ['#e8e8e4', '#9da3a6', '#c8382f', '#1f2326', '#2f6fb0'].map(c => mergeColored(partsVoiture(c)));
  GJ.chevre = mergeColored(partsChevre());
  GJ.marchande = ['#e2672a', '#2f6fb0', '#8e3c8f', '#2f8a4a'].map(c => mergeColored(partsMarchande(c)));
  GJ.trou = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2).scale(1.3, 1, .8);
  GJ.travaux = mergeColored([[B3(2.2, .9, .3).translate(0, .75, 0), '#e2672a'], [B3(2.2, .22, .32).translate(0, .95, 0), '#f4f1ea'], [C3(.04, .04, .7, 6).translate(-.9, .35, 0), '#555'], [C3(.04, .04, .7, 6).translate(.9, .35, 0), '#555'], [new THREE.ConeGeometry(.22, .6, 8).translate(1.4, .3, .5), '#e2672a'], [new THREE.ConeGeometry(.22, .6, 8).translate(-1.4, .3, -.5), '#e2672a']]);
  GJ.jeton = new THREE.CylinderGeometry(.42, .42, .1, 18).rotateZ(Math.PI / 2);
  GJ.matJeton = new THREE.MeshStandardMaterial({ color: '#f2c21b', metalness: .6, roughness: .3, emissive: '#5a4300' });
  GJ.matTrou = new THREE.MeshStandardMaterial({ color: '#3d3a33', roughness: .3, metalness: .1 });
}
const TYPES = {
  zem: { long: 2.1, larg: .8, saut: false, v: [8, 12.5], p: 30 },
  tokpa: { long: 5, larg: 1.9, saut: false, v: [6, 9], p: 12 },
  voiture: { long: 4.3, larg: 1.8, saut: false, v: [9, 14], p: 14 },
  trou: { long: 2.4, larg: 1.7, saut: true, v: [0, 0], p: 16 },
  travaux: { long: 1.2, larg: 2.4, saut: true, v: [0, 0], p: 9 },
  chevre: { long: 1.1, larg: .6, saut: true, v: [0, 0], p: 9, traverse: 1.6 },
  marchande: { long: .7, larg: .7, saut: false, v: [0, 0], p: 6, traverse: 1.1 },
  jeton: { long: 1, larg: 1.1, saut: false, v: [0, 0], p: 0 },
};
function creerObjet(type, s, file) {
  const T = TYPES[type]; let mesh;
  if (type === 'zem') mesh = new THREE.Mesh(hash(JEU.objets.length + s, 1) < .5 ? GJ.zem : GJ.zemB, matVeh);
  else if (type === 'tokpa') mesh = new THREE.Mesh(GJ.tokpa, matVeh);
  else if (type === 'voiture') mesh = new THREE.Mesh(GJ.voit[Math.floor(hash(s, 2) * 5)], matVeh);
  else if (type === 'chevre') mesh = new THREE.Mesh(GJ.chevre, matVeh);
  else if (type === 'marchande') mesh = new THREE.Mesh(GJ.marchande[Math.floor(hash(s, 3) * 4)], matVeh);
  else if (type === 'trou') mesh = new THREE.Mesh(GJ.trou, GJ.matTrou);
  else if (type === 'travaux') mesh = new THREE.Mesh(GJ.travaux, matVeh);
  else mesh = new THREE.Mesh(GJ.jeton, GJ.matJeton);
  mesh.castShadow = type !== 'trou' && !LITE; JEU.decor.add(mesh);
  const o = { type, T, s, lat: file * LANE, v: T.v[0] + Math.random() * (T.v[1] - T.v[0]), mesh, touche: false, frole: false, dirLat: 0 };
  if (T.traverse) { const cote = Math.random() < .5 ? -1 : 1; o.lat = cote * 7.5; o.dirLat = -cote * T.traverse; }
  JEU.objets.push(o); return o;
}
function retirerObjet(o) { JEU.decor.remove(o.mesh); }

function construireDecorLigne(L, C) {
  // Arrêts : zone jaune sur la file de droite, panneau au nom du quartier, passagers qui attendent.
  const g = JEU.decor;
  for (let k = 1; k < L.arrets.length; k++) {
    const a = L.arrets[k], s = a.s;
    const z = new THREE.Mesh(new THREE.PlaneGeometry(30, LANE * .9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f2c21b', transparent: true, opacity: .55, depthWrite: false }));
    const p = pose(C, s - 12, LANE); z.position.set(p.x, .12, p.z); z.rotation.y = p.a; g.add(z);
    const q = pose(C, s, LANE * 2.2); const post = new THREE.Group(); post.position.set(q.x, 0, q.z); post.rotation.y = q.a + Math.PI / 2;
    const mat = new THREE.Mesh(C3(.08, .08, 3.6, 6), new THREE.MeshStandardMaterial({ color: '#555' })); mat.position.set(0, 1.8, 0); post.add(mat);
    const t = texteToile(['ARRÊT', a.nom.toUpperCase()], 1024, 400, '#1d1a16', '#f2c21b', '800 110px "Bricolage Grotesque", system-ui, sans-serif');
    const pan = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.25), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); pan.position.set(0, 3.9, 0); post.add(pan); g.add(post);
    for (let i = 0; i < (JEU.veh === 'tokpa' ? 5 : 2); i++) { const m = new THREE.Mesh(GJ.marchande[(k + i) % 4], matVeh); const r = pose(C, s - 4 - i * 1.5, LANE * 2.4 + (i % 2) * .6); m.position.set(r.x, 0, r.z); m.rotation.y = r.a + Math.PI / 2; g.add(m); }
  }
}

function lancerLigne(L, veh) {
  geosJeu();
  JEU.ligne = L; JEU.veh = veh; JEU.chemin = cheminDe(L.pts);
  const C = JEU.chemin;
  // Recale les arrêts sur le chemin lissé.
  const tot = L.arrets[L.arrets.length - 1].s || 1; L.arretsJ = L.arrets.map(a => ({ ...a, s: Math.min(C.L - 2, a.s / tot * C.L) }));
  L.arretsJ[0].s = 0;
  if (JEU.decor) scene.remove(JEU.decor);
  JEU.decor = new THREE.Group(); JEU.decor.renderOrder = 11; scene.add(JEU.decor);
  JEU.objets = [];
  construireDecorLigne({ arrets: L.arretsJ }, C);
  const V = VEH[veh];
  const j = new THREE.Mesh(mergeColored(veh === 'zem' ? partsZem({ passager: false }) : partsTokpa()), matVeh); j.castShadow = !LITE;
  const grp = new THREE.Group(); grp.add(j);
  if (veh === 'zem') { // numéro au dos de la chemise
    const t = texteToile([JEU.numero || '0000'], 256, 160, '#f2c21b', '#1d5a2e', '900 120px system-ui, sans-serif');
    const d = new THREE.Mesh(new THREE.PlaneGeometry(.34, .22), new THREE.MeshBasicMaterial({ map: t })); d.position.set(-.27, 1.38, 0); d.rotation.y = -Math.PI / 2; d.rotation.x = .28; grp.add(d);
  }
  JEU.decor.add(grp); JEU.joueur = grp;
  JEU.etat = { s: 4, v: 0, file: 0, lat: 0, y: 0, vy: 0, vies: 3, argent: 0, passagers: veh === 'tokpa' ? 6 : 0, prochain: 1, servis: 0, manques: 0, frolements: 0, invul: 0, service: 0, secousse: 0, frein: false, spawn: 40, quartier: '', temps: 0, carte: 0 };
  JEU.actif = true; JEU.pause = false; flight = null; controls.enabled = false; controls.autoRotate = false;
  camera.near = .4; camera.updateProjectionMatrix();
  if (zems) zems.visible = false; if (tokpas) tokpas.visible = false;
  document.getElementById('app').classList.add('mode-jeu');
  $('#jeuMenu').hidden = true; $('#jeuFin').hidden = true; $('#jeuHud').hidden = false; $('#jeuPause').hidden = true;
  $('#jhNom').textContent = `${L.nom} · ${V.nom}`;
  const bar = $('#jhArrets'); bar.innerHTML = L.arretsJ.map(a => `<i style="left:${(a.s / C.L * 100).toFixed(2)}%" title="${a.nom}"></i>`).join('');
  audioCtx(); moteur(veh); if (AUDIO.radio) radio(true);
  const p = pose(C, 0); camera.position.set(p.x - p.dx * 30, 14, p.z - p.dz * 30); JEU.regard = new THREE.Vector3(p.x, 1, p.z);
  toast(`Départ : ${L.arretsJ[0].nom}`, 2.2);
}
function quitterJeu() {
  JEU.actif = false; moteurStop();
  if (JEU.decor) { scene.remove(JEU.decor); JEU.decor = null; }
  document.getElementById('app').classList.remove('mode-jeu');
  $('#jeu').hidden = true; controls.enabled = true; camera.near = 2; camera.fov = 45; camera.updateProjectionMatrix();
  const p = JEU.joueur ? JEU.joueur.position : controls.target; controls.target.set(p.x, 0, p.z);
  startFlight(new THREE.Vector3(p.x, 0, p.z), 900, 0.95, 0.4, 1.6);
}
let toastT = 0;
function toast(txt, d = 1.6, cls = '') { const el = $('#jhToast'); el.textContent = txt; el.className = 'jh-toast on ' + cls; toastT = d; }
function carteQuartier(a) { const c = $('#jhCarte'); c.querySelector('h3').textContent = a.nom; c.querySelector('p').textContent = a.fait; c.hidden = false; JEU.etat.carte = 4.5; }

const tmpP2 = { x: 0, z: 0, dx: 1, dz: 0, a: 0 };
function majJeu(dt) {
  const st = JEU.etat, C = JEU.chemin, L = JEU.ligne, V = VEH[JEU.veh];
  if (!st || JEU.pause) return;
  st.temps += dt;
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('#jhToast').className = 'jh-toast'; }
  if (st.carte > 0) { st.carte -= dt; if (st.carte <= 0) $('#jhCarte').hidden = true; }
  // Vitesse, file, saut.
  if (st.service > 0) { st.service -= dt; st.v = 0; }
  else if (st.frein) st.v = Math.max(0, st.v - 15 * dt);
  else st.v = Math.min(V.vmax * (1 + Math.min(.15, st.s / C.L * .2)), st.v + V.accel * dt * (st.v < 6 ? 1.6 : 1));
  st.s += st.v * dt;
  const latAv = st.lat; st.lat += (st.file * LANE - st.lat) * Math.min(1, dt * 9);
  if (st.y > 0 || st.vy > 0) { st.vy -= 24 * dt; st.y = Math.max(0, st.y + st.vy * dt); if (st.y === 0) st.vy = 0; }
  if (st.invul > 0) st.invul -= dt;
  if (st.secousse > 0) st.secousse -= dt;
  const p = pose(C, st.s, st.lat);
  const j = JEU.joueur; j.position.set(p.x, st.y, p.z); j.rotation.set(0, p.a, 0);
  j.rotateX(JEU.veh === 'zem' ? Math.max(-.32, Math.min(.32, -(st.lat - latAv) / Math.max(dt, .001) * .014)) : 0);
  j.visible = !(st.invul > 0 && Math.floor(st.temps * 12) % 2);
  controls.target.set(p.x, 0, p.z);
  moteurMaj(st.v, true);
  // Apparition des obstacles et des jetons devant le joueur.
  const diff = Math.min(1, st.s / C.L * 1.3);
  while (st.spawn < st.s + 420 && st.spawn < C.L - 30) {
    const s = st.spawn, dansArret = L.arretsJ.some((a, k) => k && s > a.s - 70 && s < a.s + 25);
    if (!dansArret) {
      if (Math.random() < .3) { const f = Math.floor(Math.random() * 3) - 1; for (let i = 0; i < 6; i++) creerObjet('jeton', s + i * 3.2, f); }
      else {
        const types = Object.keys(TYPES).filter(t => TYPES[t].p && !(JEU.veh === 'tokpa' && t === 'chevre' && Math.random() < .5)); let tot = types.reduce((a, t) => a + TYPES[t].p, 0), r = Math.random() * tot, ty = types[0];
        for (const t of types) { r -= TYPES[t].p; if (r <= 0) { ty = t; break; } }
        const f = Math.floor(Math.random() * 3) - 1; creerObjet(ty, s, f);
        if (Math.random() < .25 + diff * .35) { const f2 = ((f + 2 + Math.floor(Math.random() * 2)) % 3) - 1; if (f2 !== f) creerObjet(Math.random() < .5 ? 'zem' : 'trou', s + 2, f2); }
      }
    }
    st.spawn += 26 + Math.random() * 30 - diff * 12;
  }
  // Mise à jour et collisions.
  const restants = [];
  for (const o of JEU.objets) {
    if (o.T.v[1]) o.s += o.v * dt;
    if (o.dirLat) o.lat += o.dirLat * dt;
    const ds = o.s - st.s;
    if (ds < -25 || Math.abs(o.lat) > 9) { retirerObjet(o); continue; }
    const q = pose(C, o.s, o.lat, tmpP2);
    o.mesh.position.set(q.x, o.type === 'trou' ? .1 : 0, q.z); o.mesh.rotation.y = o.dirLat ? q.a + Math.sign(o.dirLat) * Math.PI / 2 : q.a;
    if (o.type === 'jeton') { o.mesh.position.y = 1.1 + Math.sin(st.temps * 4 + o.s) * .15; o.mesh.rotation.y = st.temps * 3 + o.s; }
    const proche = Math.abs(ds) < (o.T.long + V.long) / 2 && Math.abs(o.lat - st.lat) < (o.T.larg + V.larg) / 2 * .85;
    if (!o.touche && proche) {
      if (o.type === 'jeton') { st.argent += 25; son('piece'); retirerObjet(o); continue; }
      if (o.T.saut && st.y > .55) { /* sauté */ }
      else if (o.type === 'trou') { o.touche = true; st.v *= .5; st.secousse = .35; st.argent = Math.max(0, st.argent - 50); son('bosse'); toast('Nid-de-poule ! −50 F', 1.2, 'mal'); }
      else if (st.invul <= 0) {
        o.touche = true; st.vies--; st.v *= .2; st.invul = 1.8; st.secousse = .5; son('choc');
        const noms = { zem: 'un autre zém', tokpa: 'un tokpa-tokpa', voiture: 'une voiture', chevre: 'une chèvre', marchande: 'une marchande', travaux: 'les travaux' };
        toast(st.vies > 0 ? `Aïe ! Attention à ${noms[o.type]} !` : 'Accident…', 1.6, 'mal');
        if (st.vies <= 0) { majHud(st, C, V); return finJeu(false); }
      }
    }
    if (!o.frole && !o.touche && ds < 0 && ds > -3 && o.T.v[1] && Math.abs(o.lat - st.lat) < (o.T.larg + V.larg) / 2 + 1.1) { o.frole = true; st.frolements++; st.argent += 15; toast('Ça passe ! +15 F', .9, 'bien'); }
    restants.push(o);
  }
  JEU.objets = restants;
  // Arrêts : file de droite, presque à l'arrêt, dans la zone jaune.
  const a = L.arretsJ[st.prochain];
  if (a) {
    const dansZone = st.s > a.s - 32 && st.s < a.s + 6;
    if (dansZone && st.file === 1 && st.v < 7.5 && st.service <= 0) {
      const n = JEU.veh === 'tokpa' ? 2 + Math.floor(Math.random() * 5) : 1;
      const gain = n * (V.tarif[0] + Math.round(Math.random() * (V.tarif[1] - V.tarif[0]) / 25) * 25);
      st.argent += gain; st.servis++; st.passagers = JEU.veh === 'tokpa' ? Math.min(V.places, st.passagers + Math.floor(Math.random() * 4)) : 1;
      st.service = 1.4; son('arret'); toast(`${a.nom} : +${gain} F`, 1.8, 'bien'); carteQuartier(a); st.prochain++;
      if (st.prochain >= L.arretsJ.length) { majHud(st, C, V); return setTimeout(() => finJeu(true), 1500); }
    } else if (st.s > a.s + 6) {
      st.manques++; st.argent = Math.max(0, st.argent - 100); toast(`Arrêt manqué : ${a.nom} −100 F`, 1.8, 'mal'); st.prochain++;
      if (st.prochain >= L.arretsJ.length) { majHud(st, C, V); return finJeu(true); }
    }
  }
  if (st.s >= C.L - 1) return finJeu(true);
  // Caméra de poursuite.
  const [d, h] = V.cam, k = 1 - Math.exp(-dt * 5);
  const sh = st.secousse > 0 ? (Math.random() - .5) * .5 : 0;
  const cx = p.x - p.dx * d, cz = p.z - p.dz * d;
  camera.position.x += (cx - camera.position.x) * k; camera.position.z += (cz - camera.position.z) * k; camera.position.y += (h + st.y * .5 - camera.position.y) * k;
  camera.position.y += sh;
  JEU.regard.x += (p.x + p.dx * 14 - JEU.regard.x) * k; JEU.regard.z += (p.z + p.dz * 14 - JEU.regard.z) * k; JEU.regard.y = 1.3;
  camera.lookAt(JEU.regard);
  camera.fov = 56 + st.v * .7; camera.updateProjectionMatrix();
  // Quartier traversé.
  if (Math.floor(st.temps * 4) !== Math.floor((st.temps - dt) * 4)) {
    let best = null, bd = 650; for (const [n, la, lo] of QUARTIERS_J) { const dd = Math.hypot(p.x - la, p.z - lo); if (dd < bd) { bd = dd; best = n; } }
    if (best && best !== st.quartier) { st.quartier = best; const q = $('#jhQuartier'); q.textContent = `Quartier · ${best}`; q.classList.remove('on'); void q.offsetWidth; q.classList.add('on'); }
  }
  majHud(st, C, V);
}
let QUARTIERS_J = [];
function majHud(st, C, V) {
  $('#jhArgent').textContent = fmtF(st.argent);
  $('#jhVitesse').textContent = `${Math.round(st.v * 3.6)} km/h`;
  $('#jhVies').innerHTML = [0, 1, 2].map(i => `<i class="${i < st.vies ? '' : 'perdu'}"></i>`).join('');
  $('#jhProg').style.width = `${Math.min(100, st.s / C.L * 100).toFixed(1)}%`;
  const a = JEU.ligne.arretsJ[st.prochain];
  $('#jhProchain').textContent = a ? `Prochain arrêt : ${a.nom} · ${Math.max(0, Math.round(a.s - st.s))} m` : 'Terminus';
  $('#jhPassagers').textContent = JEU.veh === 'tokpa' ? `${st.passagers}/${V.places} passagers` : (st.passagers ? '1 client' : 'À vide');
}
function finJeu(arrive) {
  const st = JEU.etat; if (!st || JEU.fini) return; JEU.fini = true; JEU.pause = true; moteurMaj(0, false);
  const L = JEU.ligne, el = $('#jeuFin');
  el.querySelector('h2').textContent = arrive ? 'Terminus !' : 'Fin de la course';
  el.querySelector('.jf-sous').textContent = arrive ? `${L.nom} : ${L.arretsJ[0].nom} → ${L.arretsJ[L.arretsJ.length - 1].nom}` : 'Trois accidents : le casque a servi. Repars quand tu veux.';
  const stats = [['Recette', fmtF(st.argent)], ['Arrêts desservis', `${st.servis}/${L.arretsJ.length - 1}`], ['Frôlements', st.frolements], ['Distance', `${(st.s / 1000).toFixed(1)} km`]];
  el.querySelector('.jf-stats').innerHTML = stats.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
  const qz = el.querySelector('.jf-quiz'), Q = QUIZ[L.id] || []; let i = 0, bonus = 0;
  const finir = () => {
    const total = st.argent + bonus, prev = JEU.meilleur[L.id] || 0; if (total > prev) { JEU.meilleur[L.id] = total; sauver(); }
    qz.innerHTML = `<p class="jf-total">Total : <b>${fmtF(total)}</b>${bonus ? ` (dont ${fmtF(bonus)} de quiz)` : ''}<br><small>${total > prev ? 'Nouveau record sur cette ligne !' : `Record : ${fmtF(prev)}`}</small></p>`;
    remplirLignes();
  };
  const poser = () => {
    if (!arrive || i >= Q.length) return finir();
    const [q, ch, bon] = Q[i];
    qz.innerHTML = `<p class="jf-q"><small>Question ${i + 1} sur ${Q.length} · +500 F par bonne réponse</small>${q}</p><div class="jf-choix">${ch.map((c, k) => `<button type="button" data-k="${k}">${c}</button>`).join('')}</div>`;
    qz.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const k = +b.dataset.k; qz.querySelectorAll('button').forEach(x => x.disabled = true);
      b.classList.add(k === bon ? 'bon' : 'faux'); if (k !== bon) qz.querySelectorAll('button')[bon].classList.add('bon'); else { bonus += 500; son('piece'); }
      setTimeout(() => { i++; poser(); }, 1000);
    }));
  };
  poser();
  el.hidden = false; $('#jeuHud').hidden = true;
}
function remplirLignes() {
  const el = $('#jmLignes'); el.innerHTML = '';
  for (const L of JEU.lignes) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'jm-ligne';
    const km = (L.arrets[L.arrets.length - 1].s / 1000).toFixed(1);
    b.innerHTML = `<span class="jm-veh ${L.veh}">${L.veh === 'zem' ? 'Zém' : 'Tokpa'}</span><b>${L.nom}</b><small>${L.arrets.map(a => a.nom).join(' → ')}</small><span class="jm-meta">${km} km · ${L.arrets.length - 1} arrêts${JEU.meilleur[L.id] ? ` · record ${fmtF(JEU.meilleur[L.id])}` : ''}</span>`;
    b.addEventListener('click', () => { JEU.numero = ($('#jmNumero').value || '1234').slice(0, 5); sauver(); JEU.fini = false; lancerLigne(L, L.veh); });
    el.appendChild(b);
  }
}
function ouvrirJeu() {
  geosJeu(); audioCtx();
  document.getElementById('app').classList.add('mode-jeu');
  $('#jeu').hidden = false; $('#jeuMenu').hidden = false; $('#jeuHud').hidden = true; $('#jeuFin').hidden = true; $('#jeuPause').hidden = true;
  $('#jmNumero').value = JEU.numero;
  remplirLignes();
}
function initJeu(data) {
  JEU.lignes = data.L.lignes || [];
  QUARTIERS_J = [...QUARTIERS, ['Abomey-Calavi', 6.448, 2.355], ['Zogbadjè', 6.4236, 2.3348], ['Godomey', 6.3870, 2.3420], ['Togoudo', 6.4071, 2.3345]].map(([n, la, lo]) => { const [x, z] = toXZ(la, lo); return [n, x, z]; });
  $('#btnJouer').addEventListener('click', ouvrirJeu);
  $('#jmRetour').addEventListener('click', () => { $('#jeu').hidden = true; document.getElementById('app').classList.remove('mode-jeu'); });
  $('#jfRejouer').addEventListener('click', () => { JEU.fini = false; lancerLigne(JEU.ligne, JEU.veh); });
  $('#jfLignes').addEventListener('click', () => { JEU.actif = false; moteurStop(); if (JEU.decor) { scene.remove(JEU.decor); JEU.decor = null; } ouvrirJeu(); });
  $('#jfCarte').addEventListener('click', quitterJeu);
  $('#jpReprendre').addEventListener('click', () => { JEU.pause = false; $('#jeuPause').hidden = true; });
  $('#jpQuitter').addEventListener('click', quitterJeu);
  $('#jhPause').addEventListener('click', () => { if (JEU.fini) return; JEU.pause = true; moteurMaj(0, false); $('#jeuPause').hidden = false; });
  $('#jhSon').addEventListener('click', e => { JEU.muet = !JEU.muet; e.currentTarget.setAttribute('aria-pressed', String(!JEU.muet)); if (JEU.muet) { moteurMaj(0, false); radio(false); } });
  const st = () => JEU.etat;
  const gauche = () => { if (st() && st().file > -1) st().file--; }, droite = () => { if (st() && st().file < 1) st().file++; };
  const sauter = () => { const s = st(); if (s && s.y === 0 && s.service <= 0) { s.vy = 7.8; son('saut'); } };
  window.addEventListener('keydown', e => {
    if (!JEU.actif || JEU.fini) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') { JEU.pause = !JEU.pause; $('#jeuPause').hidden = !JEU.pause; e.preventDefault(); return; }
    if (JEU.pause) return;
    if (k === 'arrowleft' || k === 'a' || k === 'q') gauche();
    else if (k === 'arrowright' || k === 'd') droite();
    else if (k === 'arrowup' || k === ' ' || k === 'w' || k === 'z') sauter();
    else if (k === 'arrowdown' || k === 's') st().frein = true;
    else if (k === 'h') son('klaxon');
    else return;
    e.preventDefault(); e.stopPropagation();
  }, true);
  window.addEventListener('keyup', e => { if (!JEU.actif) return; const k = e.key.toLowerCase(); if ((k === 'arrowdown' || k === 's') && st()) st().frein = false; }, true);
  // Écran tactile : glisser à gauche, à droite, vers le haut ; maintenir le bouton Frein.
  let t0 = null;
  const zone = $('#scene');
  zone.addEventListener('pointerdown', e => { if (JEU.actif) t0 = [e.clientX, e.clientY]; });
  zone.addEventListener('pointerup', e => { if (!JEU.actif || !t0) return; const dx = e.clientX - t0[0], dy = e.clientY - t0[1]; t0 = null; if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; if (Math.abs(dx) > Math.abs(dy)) (dx < 0 ? gauche : droite)(); else if (dy < 0) sauter(); });
  const btn = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
  btn('#jbG', gauche); btn('#jbD', droite); btn('#jbS', sauter); btn('#jbK', () => son('klaxon'));
  const fr = $('#jbF'); fr.addEventListener('pointerdown', e => { e.preventDefault(); if (st()) st().frein = true; }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) fr.addEventListener(ev, () => { if (st()) st().frein = false; });
}

// ---------- Explorer : catégories, radio, présentation ----------
const CATS = { monument: 'Monuments', institution: 'Monuments', culte: 'Monuments', marche: 'Marchés', eau: 'Mer et lagune', plage: 'Mer et lagune', transport: 'Transport', savoir: 'Savoir', quartier: 'Quartiers' };
const catDe = p => p.id === 'stade' ? 'Sport' : CATS[p.k] || 'Autres';
let filtre = 'Tout';
function initCategories() {
  const el = $('#chips'); if (!el) return;
  const noms = ['Tout', ...new Set(PLACES.map(catDe))];
  el.innerHTML = noms.map(n => `<button type="button" class="chip" data-c="${n}" aria-pressed="${n === 'Tout'}">${n}<span>${n === 'Tout' ? PLACES.length : PLACES.filter(p => catDe(p) === n).length}</span></button>`).join('');
  el.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { filtre = b.dataset.c; el.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); appliquerFiltre(); }));
}
function appliquerFiltre() { for (const p of PLACES) { const ok = filtre === 'Tout' || catDe(p) === filtre; p.btn.parentElement.hidden = !ok; if (p.label) p.label.style.display = ok ? '' : 'none'; } }
const PRES = { actif: false };
const attendre = ms => new Promise(r => setTimeout(r, ms));
const finVol = () => new Promise(r => { const chk = () => (!flight || !PRES.actif) ? r() : requestAnimationFrame(chk); chk(); });
async function presentation() {
  if (PRES.actif) return; PRES.actif = true;
  const app = document.getElementById('app'); app.classList.add('mode-pres'); $('#pres').hidden = false;
  const titre = (h, p) => { const t = $('#presTitre'), s = $('#presSous'); t.textContent = h; s.textContent = p; const box = $('#pres .pres-titre'); box.classList.remove('on'); void box.offsetWidth; box.classList.add('on'); };
  const ancien = $('#btnRadio').getAttribute('aria-pressed') === 'true'; if (!ancien) { await radio(true); }
  controls.autoRotate = false;
  const centre = new THREE.Vector3(600, 0, -900);
  camera.position.setFromSpherical(new THREE.Spherical(30000, .35, .42)).add(centre); controls.target.copy(centre);
  titre('COTONOU', 'Bénin · la ville ouverte sur l\'Atlantique');
  startFlight(centre.clone(), 11000, .95, .42, 5); await finVol(); await attendre(1200);
  const seq = ['etoile', 'dantokpa', 'amazone', 'congres', 'cathedrale', 'stade', 'uac', 'ganvie', 'port'];
  for (const id of seq) {
    if (!PRES.actif) break;
    const p = PLACES.find(q => q.id === id); if (!p) continue;
    titre(p.name, p.kind);
    const [d, phi, th] = p.view; startFlight(new THREE.Vector3(p.x, 0, p.z), d, phi, th, 3.2); await finVol();
    controls.autoRotate = true; controls.autoRotateSpeed = -.9; await attendre(2600); controls.autoRotate = false;
  }
  if (PRES.actif) { titre('COTONOU 3D', 'Explore la ville · joue dans ses rues'); startFlight(centre.clone(), 13000, .9, .9, 4); await finVol(); await attendre(3500); }
  finPresentation(ancien);
}
function finPresentation(garderRadio) {
  if (!PRES.actif) return; PRES.actif = false; controls.autoRotate = $('#togTour').getAttribute('aria-pressed') === 'true'; controls.autoRotateSpeed = -.35;
  document.getElementById('app').classList.remove('mode-pres'); $('#pres').hidden = true;
  if (!garderRadio) radio(false);
}
function initExplorer() {
  initCategories();
  $('#btnRadio').addEventListener('click', async e => { const b = e.currentTarget, on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); const ok = await radio(on); if (on && !ok) b.setAttribute('aria-pressed', 'false'); });
  $('#btnPres').addEventListener('click', () => presentation());
  $('#pres').addEventListener('click', () => finPresentation($('#btnRadio').getAttribute('aria-pressed') === 'true'));
  window.addEventListener('keydown', e => { if (PRES.actif && e.key === 'Escape') finPresentation($('#btnRadio').getAttribute('aria-pressed') === 'true'); });
}
