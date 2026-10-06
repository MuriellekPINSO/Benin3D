import * as THREE from 'three';
import { LITE } from './base.js';
import { groupeLieu } from './lieux.js';
import { chargerMasques, creerEgungun, creerZangbeto, masque } from './egungun.js';

// Ouidah : la Porte du Non-Retour, au bout de la Route des Esclaves, et l'Arène de
// Ouidah voisine (celle des Vodun Days). L'arène reprend la maquette de l'artifact
// « Arène de Ouidah » (gradins, sièges rouges, voiles tendues, tribune officielle),
// portée sur three r180, sans son sol, son océan ni son ciel : la ville fournit les siens.

// +z local regarde la mer.
const V3 = THREE.Vector3, D2R = Math.PI / 180;
let s0 = 11; const rnd = (a = 0, b = 1) => a + ((s0 = (s0 * 1103515245 + 12345) >>> 0) / 4294967296) * (b - a);
const polar = (r, th, y = 0) => { const t = th * D2R; return new V3(r * Math.sin(t), y, r * Math.cos(t)); };
function tex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t;
}
const speckle = (base, cols, n, size) => (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.globalAlpha = rnd() * .5 + .1; const s = rnd() * size + 1; g.fillRect(rnd() * w, rnd() * h, s, s); }
  g.globalAlpha = 1;
};
const std = o => new THREE.MeshStandardMaterial({ roughness: .92, metalness: 0, ...o });
function merge(geos) {
  const pos = [], nor = [];
  for (const g of geos) { const n = g.index ? g.toNonIndexed() : g; if (!n.attributes.normal) n.computeVertexNormals(); pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return out;
}

// ---------- Arène de Ouidah ----------
function arene() {
  const G = new THREE.Group();
  const add = (m, cast, recv = true) => { m.castShadow = !!cast && !LITE; m.receiveShadow = recv; G.add(m); return m; };
  const T = {
    sand: tex(512, 512, (g, w, h) => {
      speckle('#D6A35E', ['#E7BC7A', '#B98646', '#C99553', '#F0CD92'], 9000, 2.2)(g, w, h);
      g.strokeStyle = 'rgba(120,80,30,.08)'; g.lineWidth = 2;
      for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(0, i * 13 + rnd(-3, 3)); g.bezierCurveTo(w * .3, i * 13 + rnd(-6, 6), w * .7, i * 13 + rnd(-6, 6), w, i * 13); g.stroke(); }
    }, 10, 10),
    concrete: tex(512, 512, (g, w, h) => {
      speckle('#D3CCC0', ['#E2DCD2', '#BDB5A8', '#C9C1B4'], 7000, 2)(g, w, h);
      g.strokeStyle = 'rgba(90,80,70,.18)'; g.lineWidth = 2;
      for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
    }, 14, 14),
    steps: tex(256, 256, speckle('#BDB6AA', ['#CFC8BC', '#A9A194'], 2500, 2)),
    roof: tex(256, 64, (g, w, h) => { g.fillStyle = '#F1F0EC'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#E4E3DE'); gr.addColorStop(.5, '#FFFFFF'); gr.addColorStop(1, '#D9D8D2'); g.fillStyle = gr; g.fillRect(x, 0, 16, h); } }, 10, 1),
    wall: tex(512, 256, (g, w, h) => {
      g.fillStyle = '#DDB77A'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(120,80,40,.10)'; for (let x = 0; x < w; x += 128) g.fillRect(x, 0, 3, h);
      g.fillStyle = '#8A6A45'; for (let x = 16; x < w; x += 32) g.fillRect(x, 38, 10, 10);
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, h - 26, w, 4);
    }),
  };
  const facadeTex = portes => tex(1408, 336, (g, w, h) => {
    g.fillStyle = '#E2C185'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(150,105,55,.10)'; for (let y = 0; y < h; y += 28) g.fillRect(0, y, w, 2);
    g.fillStyle = '#7A5A36';
    for (let r = 0; r < 3; r++) for (let x = 40; x < w - 30; x += 30) if ((x / 30 + r) % 2 < 1) g.fillRect(x, 26 + r * 26, 12, 12);
    g.fillStyle = '#E9CB92'; g.fillRect(0, 112, w, 52);
    g.fillStyle = '#4A3020'; g.font = '800 40px "Bricolage Grotesque", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (g.letterSpacing !== undefined) g.letterSpacing = '10px';
    g.fillText('ARÈNE DE OUIDAH', w / 2, 139);
    if (portes) {
      g.fillStyle = '#3A2A1C'; const dw = 64, gap = 40, n = 5, x0 = w / 2 - (n * dw + (n - 1) * gap) / 2;
      for (let i = 0; i < n; i++) g.fillRect(x0 + i * (dw + gap), h - 104, dw, 104);
      g.fillStyle = '#CFAE72'; g.fillRect(x0 - 30, h - 116, n * dw + (n - 1) * gap + 60, 10);
    } else { g.fillStyle = '#8A6A45'; for (let x = 60; x < w - 40; x += 90) g.fillRect(x, h - 120, 34, 60); }
  });

  // Sol de l'arène : dalle de béton, parvis, piste de sable et son liseré blanc.
  const plan = (w, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat); m.position.set(x, y, z); return m; };
  // Proportions recalées sur la vue Google : piste de 32 m de rayon, gradins jusqu'à 55 m,
  // déambulatoire jusqu'au mur d'enceinte (77 m), esplanade au sud-ouest, parking au nord.
  const tc = T.concrete.clone(); tc.needsUpdate = true; tc.repeat.set(20, 20);
  add(new THREE.Mesh(new THREE.CircleGeometry(77, 140).rotateX(-Math.PI / 2), std({ map: tc })), false).position.y = .03;
  const tf = T.concrete.clone(); tf.needsUpdate = true; tf.repeat.set(10, 4);
  add(plan(72, 22, std({ map: tf }), 0, .025, -84), false);
  const te = T.concrete.clone(); te.needsUpdate = true; te.repeat.set(8, 10);
  add(plan(55, 68, std({ map: te, color: 0xEDE7DB }), -89, .02, 36), false);
  add(new THREE.Mesh(new THREE.CircleGeometry(32.6, 160).rotateX(-Math.PI / 2), std({ map: T.sand, roughness: 1 })), false).position.y = .06;
  add(new THREE.Mesh(new THREE.RingGeometry(32.5, 32.95, 160).rotateX(-Math.PI / 2), std({ color: 0xEDE6D8 })), false).position.y = .07;

  // Gradins : deux secteurs tournés vers la piste, ouverts côté mer.
  const NR = 24, R = i => 33 + i * 0.9, Y = i => 1.2 + i * 0.45, RO = R(NR - 1) + 1.3, TOPW = Y(NR - 1) + 1;
  // Secteurs (degrés depuis +z, la mer, vers +x, l'est) : ouverts au sud-sud-est, bâtiment au nord.
  const SECT = [[41, 159], [-158, -27]];
  const prof = [[RO, 0], [RO, TOPW], [RO - .8, TOPW], [RO - .8, Y(NR - 1)]];
  for (let i = NR - 1; i >= 0; i--) { prof.push([R(i), Y(i)]); prof.push([R(i), i > 0 ? Y(i - 1) : 0]); }
  const profV = []; prof.forEach((q, i) => { profV.push(new THREE.Vector2(q[0], q[1])); if (i > 0 && i < prof.length - 1) profV.push(new THREE.Vector2(q[0], q[1])); });
  const stepM = std({ map: T.steps, side: THREE.DoubleSide }), wallM = std({ color: 0xDDB77A, side: THREE.DoubleSide }), redM = std({ color: 0xB3262E, roughness: .7 });
  const shape = new THREE.Shape(); prof.forEach((q, i) => (i ? shape.lineTo(q[0], q[1]) : shape.moveTo(q[0], q[1])));
  const capG = new THREE.ShapeGeometry(shape);
  for (const [a, b] of SECT) {
    add(new THREE.Mesh(new THREE.LatheGeometry(profV, 90, a * D2R, (b - a) * D2R), stepM), true);
    const fT = T.wall.clone(); fT.needsUpdate = true; fT.repeat.set(Math.round(RO * (b - a) * D2R / 9), 1);
    add(new THREE.Mesh(new THREE.CylinderGeometry(RO + .05, RO + .05, TOPW, 90, 1, true, a * D2R, (b - a) * D2R), std({ map: fT })), true).position.y = TOPW / 2;
    add(new THREE.Mesh(new THREE.LatheGeometry([[32.95, 0], [32.95, 1.45], [32.95, 1.45], [33.25, 1.45], [33.25, 1.45], [33.25, 1.2]].map(([x, y]) => new THREE.Vector2(x, y)), 90, a * D2R, (b - a) * D2R), wallM), true);
    for (const th of [a, b]) { const c = add(new THREE.Mesh(capG, wallM), true); c.rotation.y = th * D2R - Math.PI / 2; }
  }
  // Muret côté mer, blocs de remplissage et panneaux rouges.
  add(new THREE.Mesh(new THREE.LatheGeometry([[RO - 2, 0], [RO - 2, 1.1], [RO - 2, 1.1], [RO - 1.55, 1.1], [RO - 1.55, 1.1], [RO - 1.55, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 60, -27 * D2R, 68 * D2R), wallM), true);
  for (const s of [-1, 1]) for (const th of [95, 120]) { const b = add(new THREE.Mesh(new THREE.BoxGeometry(5, 5.5, .25), redM), false); b.position.copy(polar(RO + .2, s * th, 4.8)); b.rotation.y = s * th * D2R; }
  // Mur d'enceinte et ses pavillons ronds.
  add(new THREE.Mesh(new THREE.LatheGeometry([[77, 0], [77, 1.4], [77, 1.4], [77.4, 1.4], [77.4, 1.4], [77.4, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 120, -170 * D2R, 318 * D2R), wallM), true);
  for (const [th, r] of [[110, 82], [89, 80], [58, 78], [-46, 75], [-94, 78]]) {
    const p = polar(r, th);
    add(new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 3.2, 24), std({ color: 0xEDE9E1 })), true).position.set(p.x, 1.6, p.z);
    add(new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.6, 24), std({ color: 0xD9D4C8 })), true).position.set(p.x, 4, p.z);
  }

  // Sièges rouges (instanciés) et tribune officielle.
  const seatG = merge([new THREE.BoxGeometry(.46, .07, .42).translate(0, .44, -.02), new THREE.BoxGeometry(.46, .42, .06).translate(0, .66, .2)]);
  const seatMx = [], o = new THREE.Object3D();
  for (const [a, b] of SECT) {
    const span = (b - a) * D2R;
    for (let i = 0; i < NR - 1; i++) {
      const rs = R(i) + 0.48, n = Math.floor(rs * span / 0.55);
      for (let j = 0; j < n; j++) {
        const f = (j + .5) / n, arc = f * span * rs;
        let skip = arc < 0.6 || arc > span * rs - 0.6;
        for (let k = 1; k <= 3; k++) if (Math.abs(arc - k / 4 * span * rs) < 0.75) skip = true; // allées
        if (skip) continue;
        const th = a * D2R + f * span; o.position.set(rs * Math.sin(th), Y(i), rs * Math.cos(th)); o.rotation.set(0, th, 0); o.updateMatrix(); seatMx.push(o.matrix.clone());
      }
    }
  }
  const VR = 6, VZ = i => -32.4 - i * 1.55, VY = i => 1.4 + i * 0.55;
  for (let i = 0; i < VR; i++) for (let x = -20.4; x <= 20.4; x += 0.6) { if (Math.abs(x) < 0.5) continue; o.position.set(x, VY(i), VZ(i) - .75); o.rotation.set(0, Math.PI, 0); o.updateMatrix(); seatMx.push(o.matrix.clone()); }
  const seats = new THREE.InstancedMesh(seatG, std({ color: 0xB31E2B, roughness: .55 }), seatMx.length);
  seatMx.forEach((m, i) => seats.setMatrixAt(i, m)); seats.receiveShadow = true; seats.castShadow = !LITE; seats.computeBoundingSphere(); G.add(seats);

  // Voiles tendues sur mâts, haubans et guirlande d'ampoules.
  const memM = std({ color: 0xF4F1EA, side: THREE.DoubleSide, roughness: .75 }), steelM = std({ color: 0xE8E6E1, roughness: .45, metalness: .3 });
  const cablePts = [], bulbPos = [];
  const CB = { rB: RO + 2, rF: 34.5, yB: TOPW + 3.1, yF: TOPW + 5.1, peak: 3.6 }, RM = RO + 3, HM = TOPW + 10.2;
  const membrane = (t0, t1) => {
    const nu = 12, nv = 12, pos = [], idx = [];
    for (let iv = 0; iv <= nv; iv++) for (let iu = 0; iu <= nu; iu++) {
      const u = iu / nu, v = iv / nv, th = (t0 + (t1 - t0) * u) * D2R, r = CB.rB + (CB.rF - CB.rB) * v;
      const y = CB.yB + (CB.yF - CB.yB) * v + CB.peak * Math.pow(Math.sin(Math.PI * u), 2) * Math.pow(1 - v, 2.2) - .55 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
      pos.push(r * Math.sin(th), y, r * Math.cos(th));
    }
    for (let iv = 0; iv < nv; iv++) for (let iu = 0; iu < nu; iu++) { const a = iv * (nu + 1) + iu, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); } // normales vers le ciel : les voiles restent blanches vues d'en haut
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  const beam = (p, q, w, h, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, p.distanceTo(q)), mat); m.position.copy(p).add(q).multiplyScalar(.5); m.lookAt(q); return add(m, true); };
  for (const [a, b] of SECT) {
    const nb = 10, dt = (b - a) / nb;
    for (let k = 0; k < nb; k++) {
      add(new THREE.Mesh(membrane(a + k * dt, a + (k + 1) * dt), memM), true);
      const apex = polar(CB.rB, a + (k + .5) * dt, CB.yB + CB.peak);
      cablePts.push(polar(RM, a + k * dt, HM), apex, polar(RM, a + (k + 1) * dt, HM), apex);
    }
    for (let k = 0; k <= nb; k++) {
      const th = a + k * dt, B = polar(CB.rB, th, CB.yB), F = polar(CB.rF, th, CB.yF);
      beam(B, F, .28, .45, steelM);
      add(new THREE.Mesh(new THREE.CylinderGeometry(.22, .3, HM, 8), steelM), true).position.copy(polar(RM, th, HM / 2));
      const T0 = polar(RM, th, HM);
      cablePts.push(T0, F, T0, polar(CB.rB + (CB.rF - CB.rB) * .5, th, CB.yB + 1), T0, polar(RM + 6, th, 0), polar(RM, th, CB.yB), B);
    }
    const cpts = []; for (let i = 0; i <= 40; i++) cpts.push(polar(CB.rF, a + (b - a) * i / 40, CB.yF));
    add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cpts), 120, .24, 6, false), steelM), true);
    const nbul = Math.floor(CB.rF * (b - a) * D2R / 2.4); for (let i = 0; i <= nbul; i++) bulbPos.push(polar(CB.rF - .4, a + (b - a) * i / nbul, CB.yF - .5));
  }
  G.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cablePts), new THREE.LineBasicMaterial({ color: 0x8E918F })));

  // Bâtiment principal : façade « ARÈNE DE OUIDAH », tribune couverte, toiture cintrée.
  const beigeM = std({ color: 0xE2C185 });
  add(new THREE.Mesh(new THREE.BoxGeometry(40, 12, 14), [beigeM, beigeM, beigeM, beigeM, std({ map: facadeTex(false) }), std({ map: facadeTex(true) })]), true).position.set(0, 6, -52);
  for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(.7, 10.5, 10), beigeM), true).position.set(s * 21.65, 5.25, -37);
  const vipM = std({ map: T.steps });
  for (let i = 0; i < VR; i++) { const h = VY(i); add(new THREE.Mesh(new THREE.BoxGeometry(42.6, h, 1.55), vipM), true).position.set(0, h / 2, VZ(i) - .775); }
  G.add(new THREE.Mesh(new THREE.BoxGeometry(42.6, .35, .22), std({ color: 0xD8D8D2, metalness: .4, roughness: .3, transparent: true, opacity: .6 }))).children.at(-1).position.set(0, 2.0, -32.35);
  for (const x of [-19.5, -13, -6.5, 6.5, 13, 19.5]) add(new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, 10.5, 12), beigeM), true).position.set(x, 5.25, -32.25);
  add(new THREE.Mesh(new THREE.BoxGeometry(44, 1, .8), beigeM), true).position.set(0, 10.1, -32.25);
  const rg = new THREE.PlaneGeometry(40, 34, 40, 24); rg.rotateX(-Math.PI / 2);
  { const p = rg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), t = (z + 17) / 34; p.setY(i, 11 + 1.8 * Math.sin(Math.PI * t) - 0.0025 * x * x + (t > .9 ? -(t - .9) * 4 : 0)); } rg.computeVertexNormals(); }
  add(new THREE.Mesh(rg, std({ map: T.roof, side: THREE.DoubleSide, roughness: .5, metalness: .15 })), true).position.set(0, 0, -48);
  for (let x = -18; x <= 18; x += 4) bulbPos.push(new V3(x, 10.4, -33.2));
  add(new THREE.Mesh(new THREE.BoxGeometry(26, .4, 4), std({ color: 0xEFE9DD })), true).position.set(0, 4.6, -61);
  add(new THREE.Mesh(new THREE.BoxGeometry(30, .3, 3), std({ map: T.steps })), false).position.set(0, .15, -60.5);
  const bulbM = new THREE.MeshBasicMaterial({ color: 0xFFE7B0 });
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(.2, 8, 6), bulbM, bulbPos.length);
  bulbPos.forEach((p, i) => { o.position.copy(p); o.rotation.set(0, 0, 0); o.updateMatrix(); bulbs.setMatrixAt(i, o.matrix); }); bulbs.computeBoundingSphere(); G.add(bulbs);

  // Parvis côté ville : voitures garées, jardinières, murets, kiosques.
  const carG = merge([new THREE.BoxGeometry(1.9, .95, 4.5).translate(0, .72, 0), new THREE.BoxGeometry(1.72, .7, 2.5).translate(0, 1.5, -.2)]);
  const carCols = ['#1d1f22', '#2b2d31', '#E9E9E7', '#3b3f46', '#101a2a', '#5b5f66', '#c8382f'];
  const carPos = []; for (const z of [-79, -89]) for (let x = -33; x <= 33; x += 2.8) { if (Math.abs(x) < 8 || rnd() < .3) continue; carPos.push([x, z]); }
  const cars = new THREE.InstancedMesh(carG, std({ roughness: .35, metalness: .4 }), carPos.length);
  carPos.forEach(([x, z], i) => { o.position.set(x, 0, z); o.rotation.set(0, rnd() < .5 ? 0 : Math.PI, 0); o.updateMatrix(); cars.setMatrixAt(i, o.matrix); cars.setColorAt(i, new THREE.Color(carCols[i % carCols.length])); });
  cars.castShadow = !LITE; cars.computeBoundingSphere(); G.add(cars);
  for (const x of [-9, 9]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, .5, 32), std({ color: 0xE8E2D6 })), true).position.set(x, .25, -67);
    add(new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, .1, 32), std({ color: 0x4E8A34 })), false).position.set(x, .52, -67);
  }
  const lowWallM = std({ color: 0xE6DFD2 });
  for (const [x, z, w, d] of [[-21, -95.5, 30, 1.2], [21, -95.5, 30, 1.2], [-36, -84, 1.2, 22], [36, -84, 1.2, 22]]) add(new THREE.Mesh(new THREE.BoxGeometry(w, 1.3, d), lowWallM), true).position.set(x, .65, z);
  for (const [x, z] of [[-30, -70], [30, -70]]) add(new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 4), std({ color: 0xF1EEE8 })), true).position.set(x, 1.6, z);

  // Cocotiers proches : arc côté mer et entrée (les autres viennent de la ville).
  const trunkG = new THREE.CylinderGeometry(.17, .28, 1, 7, 6).translate(0, .5, 0);
  { const p = trunkG.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + .9 * y * y); } trunkG.computeVertexNormals(); }
  const fpos = [];
  for (let l = 0; l < 9; l++) {
    const a = l / 9 * Math.PI * 2 + rnd(-.2, .2), L = rnd(3.2, 4), seg = 8, dir = new V3(Math.cos(a), 0, Math.sin(a)), side = new V3(-Math.sin(a), 0, Math.cos(a)), pts = [];
    for (let s = 0; s <= seg; s++) { const t = s / seg, c = dir.clone().multiplyScalar(L * t); c.y = .7 * t - 2.0 * t * t; const w = .6 * Math.pow(Math.sin(Math.PI * Math.min(t * 1.05, 1)), .8); pts.push([c.clone().addScaledVector(side, w).add(new V3(0, -.12 * w, 0)), c.clone().add(new V3(0, .05, 0)), c.clone().addScaledVector(side, -w).add(new V3(0, -.12 * w, 0))]); }
    for (let s = 0; s < seg; s++) { const A = pts[s], B = pts[s + 1]; for (const tr of [[A[0], A[1], B[0]], [B[0], A[1], B[1]], [A[1], A[2], B[1]], [B[1], A[2], B[2]]]) for (const v of tr) fpos.push(v.x, v.y, v.z); }
  }
  const frondG = new THREE.BufferGeometry(); frondG.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3)); frondG.computeVertexNormals();
  const palms = [];
  for (let th = -30; th <= 62; th += 7) { const p = polar(84 + rnd(-3, 3), th); palms.push([p.x, p.z, rnd(6, 8)]); }
  palms.push([-9, -67, 6], [9, -67, 6]);
  for (let th = 70; th <= 150; th += 9) { const p = polar(90 + rnd(-4, 6), th); palms.push([p.x, p.z, rnd(7, 10)]); }
  const trunks = new THREE.InstancedMesh(trunkG, std({ color: 0x7C5E3E }), palms.length), fronds = new THREE.InstancedMesh(frondG, std({ color: 0x3F7A2E, side: THREE.DoubleSide, roughness: .8 }), palms.length);
  palms.forEach(([x, z, h], i) => {
    const yaw = rnd(0, Math.PI * 2), s = rnd(.7, 1.1), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    trunks.setMatrixAt(i, new THREE.Matrix4().compose(new V3(x, 0, z), q, new V3(s, h, s)));
    const top = new V3(.9 * s, h, 0).applyQuaternion(q).add(new V3(x, 0, z));
    fronds.setMatrixAt(i, new THREE.Matrix4().compose(top, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw * 1.7, 0)), new V3(s, s, s)));
    fronds.setColorAt(i, new THREE.Color().setHSL(.27 + rnd(-.03, .03), .45, .28 + rnd(-.05, .06)));
  });
  for (const m of [trunks, fronds]) { m.castShadow = !LITE; m.receiveShadow = true; m.computeBoundingSphere(); G.add(m); }
  return G;
}

// ---------- Porte du Non-Retour ----------
// Mémorial de 1995 sur la plage (architecte Yves Ahouangnimon) : arche de béton peinte
// en blanc, rouge et jaune. Côté ville, la frise montre deux files de captifs liés et
// enchaînés qui marchent vers les navires ; les piliers portent des captifs agenouillés ;
// côté mer, les villages natals. Deux Egungun se dressent devant, des statues de cuivre
// la flanquent. +z local regarde la mer.
function captif(c, x, y, h, sens, pose = 0) { // de profil : 0 en marche, 1 bras levés, 2 agenouillé
  const k = h / 100;
  const dy = pose === 2 ? 30 * k : 0; // à genoux : le buste descend
  c.beginPath(); c.arc(x + 4 * k * sens, y - 88 * k + dy, 9 * k, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(x - 9 * k, y - 76 * k + dy); c.lineTo(x + 11 * k, y - 76 * k + dy); c.lineTo(x + 8 * k, y - 38 * k + dy); c.lineTo(x - 7 * k, y - 38 * k + dy); c.closePath(); c.fill();
  c.lineCap = 'round'; c.lineWidth = 7 * k;
  if (pose === 2) { c.beginPath(); c.moveTo(x, y - 10 * k); c.lineTo(x + 18 * k * sens, y - 6 * k); c.lineTo(x + 20 * k * sens, y); c.stroke(); c.beginPath(); c.moveTo(x, y - 10 * k); c.lineTo(x - 16 * k * sens, y); c.stroke(); }
  else {
    c.beginPath(); c.moveTo(x, y - 40 * k); c.lineTo(x + 12 * k * sens, y - 18 * k); c.lineTo(x + 16 * k * sens, y); c.stroke();
    c.beginPath(); c.moveTo(x, y - 40 * k); c.lineTo(x - 8 * k * sens, y - 19 * k); c.lineTo(x - 14 * k * sens, y); c.stroke();
  }
  c.lineWidth = 6 * k; c.beginPath(); c.moveTo(x + 2 * k, y - 72 * k + dy);
  if (pose === 1) { c.lineTo(x + 8 * k * sens, y - 98 * k); c.lineTo(x + 6 * k * sens, y - 118 * k); }
  else { c.lineTo(x + 12 * k * sens, y - 54 * k + dy); c.lineTo(x + 15 * k * sens, y - 50 * k + dy); } // mains liées devant
  c.stroke();
}
const ocre = (c, x0, y0, x1, y1) => { const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#f4cf5a'); g.addColorStop(.55, '#d9a12c'); g.addColorStop(1, '#9a6a1a'); return g; };
function porte() {
  const G = new THREE.Group();
  const add = (m, cast = true) => { m.castShadow = cast && !LITE; m.receiveShadow = true; G.add(m); return m; };
  const fond = (c, w, h) => { c.fillStyle = '#a3321f'; c.fillRect(0, 0, w, h); for (let i = 0; i < 1600; i++) { c.fillStyle = `rgba(60,10,0,${rnd() * .14})`; c.fillRect(rnd() * w, rnd() * h, 3, 3); } c.fillStyle = '#f0c440'; c.fillRect(0, 0, w, 10); c.fillRect(0, h - 10, w, 10); };
  // Côté ville : deux files de captifs enchaînés, mains liées, qui marchent vers la mer (le centre).
  const friseVille = tex(2048, 256, (c, w, h) => {
    fond(c, w, h);
    for (const sens of [1, -1]) {
      const xs = [];
      for (let i = 0; i < 13; i++) { const x = sens > 0 ? 70 + i * 72 : w - 70 - i * 72; xs.push(x); c.fillStyle = ocre(c, x - 20, 40, x + 20, 230); c.strokeStyle = c.fillStyle; captif(c, x, 232, 172, sens, i % 6 === 3 ? 1 : 0); }
      c.strokeStyle = '#2a160a'; c.lineWidth = 5; c.setLineDash([8, 5]); c.beginPath(); xs.forEach((x, i) => (i ? c.lineTo(x + 2 * sens, 112) : c.moveTo(x + 2 * sens, 112))); c.stroke(); c.setLineDash([]);
    }
  });
  // Côté mer : les villages natals (cases rondes, greniers, palmiers).
  const friseMer = tex(2048, 256, (c, w, h) => {
    fond(c, w, h); c.fillStyle = '#f0c440'; c.strokeStyle = '#f0c440';
    for (let x = 60; x < w - 40; x += 150 + rnd() * 60) {
      const t = rnd();
      if (t < .55) { c.fillRect(x - 30, 150, 60, 80); c.beginPath(); c.moveTo(x - 46, 154); c.lineTo(x, 80); c.lineTo(x + 46, 154); c.closePath(); c.fill(); c.fillStyle = '#a3321f'; c.fillRect(x - 9, 192, 18, 38); c.fillStyle = '#f0c440'; }
      else if (t < .8) { c.lineWidth = 6; c.beginPath(); c.moveTo(x, 230); c.quadraticCurveTo(x + 10, 150, x + 4, 90); c.stroke(); for (let f = 0; f < 6; f++) { const a = -Math.PI / 2 + (f - 2.5) * .5; c.beginPath(); c.moveTo(x + 4, 90); c.quadraticCurveTo(x + 4 + Math.cos(a) * 30, 90 + Math.sin(a) * 30 - 8, x + 4 + Math.cos(a) * 52, 90 + Math.sin(a) * 52 + 18); c.stroke(); } }
      else { c.beginPath(); c.ellipse(x, 190, 26, 40, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(x - 30, 160); c.lineTo(x, 112); c.lineTo(x + 30, 160); c.fill(); }
    }
  });
  // Piliers : captifs agenouillés, liés, qui attendent dans les forts.
  const pilier = tex(512, 1024, (c, w, h) => {
    c.fillStyle = '#f2ede2'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f0c440'; c.fillRect(28, 28, w - 56, h - 56);
    c.fillStyle = '#a3321f'; c.fillRect(44, 44, w - 88, h - 88);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) { const x = 120 + k * 136, y = 262 + r * 225; c.fillStyle = ocre(c, x - 30, y - 200, x + 30, y); c.strokeStyle = c.fillStyle; captif(c, x, y, 190, k % 2 ? -1 : 1, (r + k) % 3 === 1 ? 1 : 2); }
  });
  const beton = tex(512, 512, speckle('#f4efe6', ['#fbf8f1', '#e6dfd1', '#ece5d7'], 6000, 2.2));
  const betonM = std({ map: beton, roughness: .85 }), jauneM = std({ color: '#e8b830', roughness: .7 }), rougeM = std({ color: '#a3321f', roughness: .75 });
  // Arche : bloc de 24 × 8 m (emprise lue sur la vue Google) percé d'une baie en plein cintre.
  const W = 24, H = 12.4, ow = 6.4, oh = 6.2, D = 8;
  const sh = new THREE.Shape(); sh.moveTo(-W / 2, 0); sh.lineTo(-ow / 2, 0); sh.lineTo(-ow / 2, oh); sh.absarc(0, oh, ow / 2, Math.PI, 0, true); sh.lineTo(ow / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(W / 2, H); sh.lineTo(-W / 2, H); sh.closePath();
  const arche = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -D / 2);
  { // UV en mètres pour la texture de béton
    const p = arche.attributes.position, uv = arche.attributes.uv, n = arche.attributes.normal;
    for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)) > .5 ? p.getZ(i) : p.getX(i), ay = Math.abs(n.getY(i)) > .5 ? p.getZ(i) : p.getY(i); uv.setXY(i, ax / 6, ay / 6); }
  }
  add(new THREE.Mesh(arche, betonM));
  // Cintre de la baie souligné de jaune et de rouge.
  for (const [r0, r1, m, z] of [[ow / 2, ow / 2 + .45, jauneM, D / 2 + .03], [ow / 2 + .45, ow / 2 + .8, rougeM, D / 2 + .03]]) for (const s of [-1, 1]) {
    const a = add(new THREE.Mesh(new THREE.RingGeometry(r0, r1, 32, 1, 0, Math.PI), m), false); a.position.set(0, oh, s * z); if (s < 0) a.rotation.y = Math.PI;
  }
  // Attique en gradins, bandeaux rouge et jaune.
  add(new THREE.Mesh(new THREE.BoxGeometry(W + 1.2, .7, D + .8), betonM)).position.set(0, H + .35, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(W + 1.25, .22, D + .85), jauneM)).position.set(0, H + .05, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(W - 3, .9, D - 1.4), betonM)).position.set(0, H + 1.15, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(W - 2.96, .5, D - 1.36), rougeM), false).position.set(0, H + 1.05, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(W - 2.9, .14, D - 1.3), jauneM), false).position.set(0, H + 1.45, 0);
  // Frises, côté ville et côté mer.
  for (const [s, t] of [[-1, friseVille], [1, friseMer]]) { const f = add(new THREE.Mesh(new THREE.PlaneGeometry(W - .6, 2.6), std({ map: t, roughness: .6, metalness: .15 })), false); f.position.set(0, H - 1.75, s * (D / 2 + .02)); if (s < 0) f.rotation.y = Math.PI; }
  // Panneaux sculptés des piliers.
  const pilM = std({ map: pilier, roughness: .65, metalness: .1 });
  for (const s of [-1, 1]) for (const x of [-1, 1]) { const p = add(new THREE.Mesh(new THREE.PlaneGeometry(5.6, 7.6), pilM), false); p.position.set(x * (ow / 2 + (W - ow) / 4), 4.6, s * (D / 2 + .02)); if (s < 0) p.rotation.y = Math.PI; }
  // Panneaux des flancs, et soubassement rouge.
  for (const s of [-1, 1]) { const p = add(new THREE.Mesh(new THREE.PlaneGeometry(D - 2, 7.6), pilM), false); p.position.set(s * (W / 2 + .02), 4.6, 0); p.rotation.y = s * Math.PI / 2; }
  for (const s of [-1, 1]) {
    for (const x of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry((W - ow) / 2, .5, .1), rougeM), false).position.set(x * (ow / 2 + (W - ow) / 4), .25, s * (D / 2 + .03));
    add(new THREE.Mesh(new THREE.BoxGeometry(.1, .5, D + .1), rougeM), false).position.set(s * (W / 2 + .03), .25, 0);
  }
  // Esplanade pavée et marches vers la plage.
  const pave = tex(512, 512, (c, w, h) => {
    c.fillStyle = '#b9ab92'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = -1; x < 9; x++) { c.fillStyle = ['#cfc2a8', '#c3b59a', '#d6caaf', '#bcae93'][Math.floor(rnd() * 4)]; c.fillRect(x * 64 + (y % 2) * 32 + 2, y * 64 + 2, 60, 60); }
  }, 10, 8);
  // Esplanade en trapèze, du parking (au nord) jusqu'à la porte, comme sur la vue Google.
  const esp = new THREE.Shape([[-32, -14], [16, -14], [-15, 55], [-28, 55]].map(([x, y]) => new THREE.Vector2(x, y)));
  const espG = new THREE.ShapeGeometry(esp).rotateX(Math.PI / 2); // y de la forme → z vers le nord (négatif)
  { const p = espG.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, -p.getZ(i)); espG.computeVertexNormals(); const uv = espG.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 6.4, p.getZ(i) / 6.4); }
  add(new THREE.Mesh(espG, std({ map: pave, side: THREE.DoubleSide })), false).position.set(0, .04, 0);
  for (let i = 0; i < 4; i++) add(new THREE.Mesh(new THREE.BoxGeometry(W - i * 2, .18, 1.2), betonM), false).position.set(0, .09 + (3 - i) * .18, D / 2 + .6 + i * 1.2);
  // Deux Egungun sur socle devant l'arche, côté ville (les « esprits des esclaves »).
  for (const s of [-1, 1]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 2.2), betonM)).position.set(s * 6.2, .6, -D / 2 - 3.6);
    add(new THREE.Mesh(new THREE.BoxGeometry(2.26, .2, 2.26), rougeM), false).position.set(s * 6.2, 1.1, -D / 2 - 3.6);
    const e = creerEgungun(s > 0 ? 0 : 3, 3.1); e.position.set(s * 6.2, 1.2, -D / 2 - 3.6); e.rotation.y = Math.PI; e.traverse(o => { if (o.isMesh) o.castShadow = !LITE; }); G.add(e);
  }
  // Statues de cuivre qui flanquent la porte : silhouettes debout, bras levés ou liés.
  const cuivreM = std({ color: '#9a5b34', roughness: .4, metalness: .7 });
  const corpsG = new THREE.LatheGeometry([[0, 0], [.3, 0], [.26, .9], [.34, 1.5], [.2, 1.85], [.1, 1.92], [0, 1.95]].map(([x, y]) => new THREE.Vector2(x, y)), 12);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x = s * (15.5 + i * 2.6), z = -9 + i * 1.6;
    add(new THREE.Mesh(new THREE.BoxGeometry(1.3, .6, 1.3), betonM)).position.set(x, .3, z);
    add(new THREE.Mesh(corpsG, cuivreM)).position.set(x, .6, z);
    add(new THREE.Mesh(new THREE.SphereGeometry(.17, 12, 8), cuivreM)).position.set(x, 2.72, z);
    if (i % 2 === 0) for (const b of [-1, 1]) { const br = add(new THREE.Mesh(new THREE.CylinderGeometry(.055, .065, .95, 6), cuivreM)); br.position.set(x + b * .28, 2.65, z); br.rotation.z = -b * .32; }
  }
  return G;
}

// ---------- Le spectacle dans l'arène ----------
// Sur la piste, face à la tribune officielle (-z) : les quatre Egungun accroupis, des
// Egungun qui dansent en cercle, la paire aux masques sculptés, et les Zangbeto de
// raphia qui tournoient. Les modèles 3D ne se chargent qu'à l'approche de Ouidah.
const SP = { arene: null, groupe: null, acteurs: [], charge: false };
function monterSpectacle() {
  const G = new THREE.Group(), k = 1.2; // un peu plus grands que nature, pour qu'on les voie depuis les gradins
  const place = (o, x, z, ry, anim) => { if (!o) return; o.position.set(x, .06, z); o.rotation.y = ry; o.scale.multiplyScalar(k); G.add(o); SP.acteurs.push({ o, anim, x, z }); };
  place(masque('groupe'), 0, -9, Math.PI);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; place(masque('danseur'), Math.sin(a) * 6, Math.cos(a) * 6 + 2, 0, 'ronde'); }
  for (const s of [-1, 1]) place(masque('paire'), s * 10, -2, Math.PI + s * .5, 'balance');
  for (let i = 0; i < 5; i++) { const a = (i / 5 - .5) * 2.2; place(creerZangbeto(i, 2.5 + (i % 2) * .4), Math.sin(a) * 13, Math.cos(a) * 13 + 2, 0, 'zangbeto'); }
  SP.arene.add(G); SP.groupe = G;
}
/** Anime le spectacle ; charge les masques quand la caméra s'approche de l'arène. */
export function animerOuidah(t, cam) {
  if (!SP.arene) return;
  const centre = SP.arene.parent.userData.centre, d = cam.distanceTo(centre);
  if (!SP.charge && d < 4000) { SP.charge = true; chargerMasques().then(monterSpectacle); }
  if (!SP.groupe || d > 1500 || !SP.arene.parent.visible) return;
  for (const [i, a] of SP.acteurs.entries()) {
    const o = a.o;
    if (a.anim === 'ronde') { // tournent autour du centre de la piste en virevoltant
      const ang = Math.atan2(a.x, a.z - 2) + t * .25, r = 6 + Math.sin(t * .8 + i) * .6;
      o.position.x = Math.sin(ang) * r; o.position.z = Math.cos(ang) * r + 2; o.rotation.y = ang + Math.PI / 2 + Math.sin(t * 3 + i) * 1.2;
      o.position.y = .06 + Math.abs(Math.sin(t * 5 + i)) * .12;
    } else if (a.anim === 'balance') o.rotation.y = Math.PI + Math.sign(a.x) * .5 + Math.sin(t * 1.3 + i) * .35;
    else if (a.anim === 'zangbeto') { o.userData.anim(t); o.position.x = a.x + Math.sin(t * .6 + i * 2) * 1.6; o.position.z = a.z + Math.cos(t * .45 + i) * 1.2; }
  }
}

/** Construit la Porte du Non-Retour et l'Arène de Ouidah (données L.ouidah, en mètres). */
export function construireOuidah(L) {
  if (!L.ouidah) return;
  const [px, pz] = L.ouidah.porte, [ax, az] = L.ouidah.arene;
  const gp = groupeLieu('Porte du Non-Retour', px, pz + 1.6, -0.035); gp.userData.portee = 7000;
  const p = porte(); gp.add(p);
  // Orientation et position lues sur la vue Google (bâtiment au nord, ouverture au sud-sud-est).
  const ga = groupeLieu('Arène de Ouidah', ax + 1.4, az, -0.14); ga.userData.portee = 9000;
  const a = arene(); ga.add(a);
  SP.arene = a;
}
