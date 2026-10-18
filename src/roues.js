import * as THREE from 'three';

// ---------- Une moto qui roule, ça se voit : roues qui tournent, fumée du pot, poussière (Zém Run, « Vivre à Cotonou ») ----------
// Les zems scannés (vehicules.js, moto-taxi.glb) sont d'un seul bloc : on pose sur chaque roue, des deux côtés, un disque
// à rayons qui tourne à la vitesse de la moto (flou au-delà de 25 km/h). Le pot crache un peu de fumée quand on accélère,
// et la roue arrière soulève la poussière. Repère du véhicule : l'avant vers +x, le sol à y = 0.

let TEX = null;
function textures() {
  if (TEX) return TEX;
  const dessin = flou => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'), R = 64;
    c.translate(R, R);
    c.beginPath(); c.arc(0, 0, 62, 0, Math.PI * 2); c.arc(0, 0, 47, 0, Math.PI * 2, true); c.fillStyle = '#1a1a1c'; c.fill('evenodd'); // le pneu
    c.beginPath(); c.arc(0, 0, 47, 0, Math.PI * 2); c.arc(0, 0, 42, 0, Math.PI * 2, true); c.fillStyle = '#a9aeb3'; c.fill('evenodd'); // la jante
    if (flou) { const g = c.createRadialGradient(0, 0, 6, 0, 0, 42); g.addColorStop(0, 'rgba(160,165,170,.75)'); g.addColorStop(1, 'rgba(120,125,130,.35)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 42, 0, Math.PI * 2); c.fill(); }
    else { c.strokeStyle = '#c4c8cc'; c.lineWidth = 3.5; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; c.beginPath(); c.moveTo(Math.cos(a) * 8, Math.sin(a) * 8); c.lineTo(Math.cos(a + .25) * 43, Math.sin(a + .25) * 43); c.stroke(); } }
    c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.fillStyle = '#5d6166'; c.fill(); // le moyeu
    c.fillStyle = '#e8e8e4'; c.fillRect(46, -3, 9, 6); // une marque sur le pneu : on la voit tourner
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const fumee = document.createElement('canvas'); fumee.width = fumee.height = 64; const f = fumee.getContext('2d'), g = f.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); f.fillStyle = g; f.fillRect(0, 0, 64, 64);
  TEX = { nette: dessin(false), floue: dessin(true), fumee: new THREE.CanvasTexture(fumee) };
  return TEX;
}

/**
 * Anime une moto (groupe du véhicule, repère ci-dessus). `parent` : où poser la fumée et la poussière (dans le monde).
 * Renvoie { maj(v, dt, gaz), liberer() } : v la vitesse (m/s), gaz true quand on accélère.
 */
export function animerMoto(groupe, { parent, roues = [.66, -.66], y = .31, r = .3, z = .09 } = {}) {
  const T = textures(), disques = [], geo = new THREE.CircleGeometry(r, 24);
  const matN = new THREE.MeshBasicMaterial({ map: T.nette, transparent: true, alphaTest: .4, side: THREE.DoubleSide }), matF = new THREE.MeshBasicMaterial({ map: T.floue, transparent: true, alphaTest: .2, side: THREE.DoubleSide });
  for (const x of roues) for (const s of [-1, 1]) { const m = new THREE.Mesh(geo, matN); m.position.set(x, y, s * z); groupe.add(m); disques.push(m); }
  const parts = [], v3 = new THREE.Vector3(), M = { angle: 0, fumee: 0, poussiere: 0 };
  function emettre(type, lx, ly, lz) {
    let p = parts.find(q => !q.vie); if (!p) { if (parts.length > 36) return; p = { s: new THREE.Sprite(new THREE.SpriteMaterial({ map: T.fumee, transparent: true, depthWrite: false })), vie: 0 }; parts.push(p); parent?.add(p.s); }
    if (parent && !p.s.parent) parent.add(p.s); // le décor a pu être vidé entre-temps
    groupe.updateMatrixWorld(); v3.set(lx, ly, lz).applyMatrix4(groupe.matrixWorld); p.s.position.copy(v3);
    p.type = type; p.vie = type === 'fumee' ? 1.1 : .8; p.t = 0; p.vy = type === 'fumee' ? .6 : .35; p.dx = (Math.random() - .5) * .5; p.dz = (Math.random() - .5) * .5;
    p.s.material.color.set(type === 'fumee' ? '#9a9c9f' : '#c9b48c'); p.s.visible = true;
  }
  return {
    maj(v, dt, gaz = false) {
      M.angle -= v / r * dt; // l'avant vers +x : vue de côté, la roue tourne dans le sens des aiguilles d'une montre
      const flou = Math.abs(v) > 7;
      for (const d of disques) { d.rotation.z = M.angle; d.material = flou ? matF : matN; }
      if (parent) {
        M.fumee -= dt; if (M.fumee <= 0 && (gaz || Math.abs(v) < .5)) { M.fumee = gaz ? .07 : .5; emettre('fumee', -.82, .34, .2); } // au ralenti, un filet ; en accélérant, des bouffées
        M.poussiere -= dt; if (M.poussiere <= 0 && Math.abs(v) > 4) { M.poussiere = .16 - Math.min(.1, Math.abs(v) * .006); emettre('poussiere', roues[1] - r * .6, .05, (Math.random() - .5) * .2); }
      }
      for (const p of parts) {
        if (!p.vie) continue;
        p.t += dt; const k = p.t / p.vie; if (k >= 1) { p.vie = 0; p.s.visible = false; continue; }
        p.s.position.y += p.vy * dt; p.s.position.x += p.dx * dt; p.s.position.z += p.dz * dt;
        const taille = (p.type === 'fumee' ? .25 : .35) + k * (p.type === 'fumee' ? .7 : .9); p.s.scale.set(taille, taille, 1);
        p.s.material.opacity = (p.type === 'fumee' ? .45 : .3) * (1 - k);
      }
    },
    liberer() { for (const d of disques) groupe.remove(d); for (const p of parts) { p.s.parent?.remove(p.s); p.s.material.dispose(); } geo.dispose(); matN.dispose(); matF.dispose(); },
  };
}
