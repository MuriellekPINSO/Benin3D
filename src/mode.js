import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { $ } from './base.js';
import { son } from './audio.js';
import { JEU, fmtF, sauver } from './jeu.js';
import { chargerTenue, personnage3d } from './personnages.js';
import { paiementReel, payerMoMo, verifierTransaction } from './paiement.js';

// ---------- Boutique de mode (version de test) ----------
// « Joue, trouve ton style, porte-le pour de vrai. » On essaie les tenues sur son personnage dans une
// cabine en 3D, on les porte dans le jeu avec la cagnotte (on se voit alors danser au concert), et on
// peut acheter la vraie pièce, payée par MoMo (FedaPay, voir paiement.js) et livrée dans son quartier.
// Pour ce test, tenues, pagnes, chaussures et ateliers sont des exemples : ni vrais créateurs ni vraies
// marques tant qu'ils n'ont pas donné leur accord. Les tenues sont des personnages Tripo
// (scripts/personnages.mjs, `mode: true`) rangés dans public/modeles/mode/ et chargés à la demande ;
// les chaussures, des objets Tripo (public/modeles/mode/objets/) ; les pagnes sont dessinés ici.

const TAILLES = ['S', 'M', 'L', 'XL', 'XXL'];
const POINTURES = ['38', '39', '40', '41', '42', '43', '44', '45'], POINTURES_F = ['36', '37', '38', '39', '40', '41'];
export const ARTICLES = {
  'robe-wax': { type: 'tenue', femme: true, nom: 'Robe sirène en wax', atelier: 'Atelier démo · Haie Vive', prix: 25000, prixJeu: 900, desc: 'Robe longue ajustée aux manches ballon, avec le foulard assorti noué sur la tête.' },
  kaba: { type: 'tenue', femme: true, nom: 'Ensemble kaba et pagne', atelier: 'Atelier démo · Ganhi', prix: 30000, prixJeu: 1100, desc: 'Le haut aux manches évasées, le pagne noué en jupe et le grand foulard, dans le même tissu.' },
  'urbaine-f': { type: 'tenue', femme: true, nom: 'Veste wax et jean', atelier: 'Atelier démo · Fidjrossè', prix: 22000, prixJeu: 700, desc: 'Veste courte en wax rouge, noir et blanc sur un t-shirt blanc, jean taille haute et baskets.' },
  'chemise-wax': { type: 'tenue', femme: false, nom: 'Chemise en wax', atelier: 'Atelier démo · Haie Vive', prix: 15000, prixJeu: 600, desc: 'Chemise ajustée à manches courtes, pantalon chino beige et mocassins.' },
  bomba: { type: 'tenue', femme: false, nom: 'Bomba en bazin brodé', atelier: 'Atelier démo · Zongo', prix: 45000, prixJeu: 1500, desc: 'Tunique et pantalon en bazin ivoire, broderies dorées au col, bonnet assorti.' },
  'sport-h': { type: 'tenue', femme: false, nom: 'Survêtement', atelier: 'Boutique démo · Cadjèhoun', prix: 18000, prixJeu: 650, desc: 'Veste de sport noire aux bandes jaunes et vertes, jogging et baskets de course.' },
  'pagne-cercles': { type: 'pagne', nom: 'Wax « Cercles »', atelier: 'Marché démo · Dantokpa', prix: 12000, motif: ['cercles', '#1f4fa3', '#f08a24', '#f6c945', '#fff6e0'], desc: '6 yards (5,5 m) de coton imprimé à la cire, de quoi coudre une robe ou un ensemble.' },
  'pagne-feuilles': { type: 'pagne', nom: 'Wax « Feuilles »', atelier: 'Marché démo · Dantokpa', prix: 10000, motif: ['feuilles', '#2f7d3b', '#d6372b', '#f4d35e', '#fff6e0'], desc: '6 yards (5,5 m) de coton imprimé à la cire, de quoi coudre une robe ou un ensemble.' },
  'pagne-losanges': { type: 'pagne', nom: 'Wax « Losanges »', atelier: 'Marché démo · Dantokpa', prix: 14000, motif: ['losanges', '#5b2a86', '#e2b33c', '#2aa198', '#fdf3df'], desc: '6 yards (5,5 m) de coton imprimé à la cire, de quoi coudre une robe ou un ensemble.' },
  'pagne-ecailles': { type: 'pagne', nom: 'Wax « Écailles »', atelier: 'Marché démo · Dantokpa', prix: 9000, motif: ['ecailles', '#15130f', '#f2efe6', '#c62f2f', '#f2efe6'], desc: '6 yards (5,5 m) de coton imprimé à la cire, de quoi coudre une robe ou un ensemble.' },
  baskets: { type: 'chaussure', nom: 'Baskets à bande wax', atelier: 'Boutique démo · Cadjèhoun', prix: 20000, desc: 'Baskets en cuir blanc, avec une fine bande de wax sur le côté.' },
  sandales: { type: 'chaussure', nom: 'Sandales en cuir aux cauris', atelier: 'Artisan démo · Missèbo', prix: 7000, desc: 'Cuir tressé à la main, petits cauris cousus sur les lanières.' },
  escarpins: { type: 'chaussure', femme: true, nom: 'Escarpins en wax', atelier: 'Atelier démo · Ganhi', prix: 16000, desc: 'Talon carré de hauteur moyenne, recouverts de wax orange et bleu.' },
};
const ONGLETS = { tenue: 'Tenues', pagne: 'Pagnes', chaussure: 'Chaussures' };
// Frais de livraison (exemples) selon le quartier.
const LIVRAISON = [['Akpakpa', 1000], ['Agla', 1000], ['Cadjèhoun', 1000], ['Fidjrossè', 1000], ['Ganhi', 1000], ['Gbégamey', 1000], ['Haie Vive', 1000], ['Sainte-Rita', 1000], ['Vèdoko', 1000], ['Zogbo', 1000], ['Godomey', 1500], ['Abomey-Calavi', 1500], ['Sèmè-Podji', 2000], ['Porto-Novo', 2500], ['Ouidah', 2500]];
const taillesDe = A => A.type === 'tenue' ? TAILLES : A.type === 'chaussure' ? (A.femme ? POINTURES_F : POINTURES) : null;

const MD = {
  onglet: 'tenue', filtre: 'tout', choisi: null, etape: 'fiche', taille: null, quartier: '', repere: '', attente: null, msg: ['', ''],
  index: null, objets: null, rendu: null, scene: null, cam: null, vue: null, inst: null, raf: 0, dernier: 0, rotY: 0, glisse: null, jeton: 0,
};
const prog = () => { const p = JEU.prog; p.garderobe ||= []; p.commandes ||= []; return p; };
const fmtR = n => `${Math.round(n).toLocaleString('fr-FR')} F CFA`; // prix réels

// ---------- Les listes de modèles (écrites par les scripts) ----------
async function lireIndex(chemin) {
  try { const r = await fetch(import.meta.env.BASE_URL + chemin); if (r.ok && /json/.test(r.headers.get('content-type') || '')) return await r.json(); } catch { }
  return {};
}
async function index() {
  if (!MD.index) [MD.index, MD.objets] = await Promise.all([lireIndex('modeles/mode/index.json'), lireIndex('modeles/mode/objets/index.json')]);
}

// ---------- Les pagnes, dessinés : motifs wax sur un tissu plié ----------
const TEX = {};
function motifWax([forme, fond, a, b, c]) {
  const cle = forme + fond; if (TEX[cle]) return TEX[cle];
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d');
  x.fillStyle = fond; x.fillRect(0, 0, 256, 256);
  const rond = (cx, cy, r, col) => { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
  if (forme === 'cercles') for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const cx = 43 + i * 85 + (j % 2) * 20, cy = 43 + j * 85; rond(cx, cy, 34, a); rond(cx, cy, 24, c); rond(cx, cy, 15, b); rond(cx, cy, 6, a); }
  else if (forme === 'feuilles') for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.save(); x.translate(32 + i * 64, 32 + j * 64); x.rotate((i + j) % 2 ? .7 : -.7); x.fillStyle = (i + j) % 2 ? a : b; x.beginPath(); x.ellipse(0, 0, 26, 11, 0, 0, Math.PI * 2); x.fill(); x.strokeStyle = c; x.lineWidth = 2.5; x.beginPath(); x.moveTo(-22, 0); x.lineTo(22, 0); x.stroke(); x.restore(); }
  else if (forme === 'losanges') for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const cx = 32 + i * 64, cy = 32 + j * 64; for (const [r, col] of [[30, a], [20, b], [9, c]]) { x.fillStyle = col; x.beginPath(); x.moveTo(cx, cy - r); x.lineTo(cx + r, cy); x.lineTo(cx, cy + r); x.lineTo(cx - r, cy); x.closePath(); x.fill(); } }
  else for (let j = 0; j < 9; j++) for (let i = -1; i < 9; i++) { const cx = i * 32 + (j % 2) * 16, cy = j * 32; x.fillStyle = j % 3 === 1 ? b : a; x.beginPath(); x.arc(cx, cy, 18, 0, Math.PI); x.fill(); x.strokeStyle = fond; x.lineWidth = 3; x.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  TEX[cle] = { t, url: cv.toDataURL('image/png') }; return TEX[cle];
}
function pagneObjet(motif) {
  const { t } = motifWax(motif), g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: t, roughness: .85 });
  for (let k = 0; k < 3; k++) { // trois épaisseurs pliées, un peu décalées
    const m = new THREE.Mesh(new RoundedBoxGeometry(.46, .045, .32, 3, .02), mat);
    m.position.set((k - 1) * .012, .03 + k * .046, (k % 2) * .01); m.rotation.y = (k - 1) * .04; g.add(m);
  }
  const bande = new THREE.Mesh(new THREE.BoxGeometry(.08, .15, .33), new THREE.MeshStandardMaterial({ color: '#f4ead2', roughness: .9 }));
  bande.position.set(.1, .075, 0); g.add(bande);
  return g;
}

// ---------- Les chaussures (objets Tripo) ----------
const OBJ = {};
function chargerObjet(id) {
  const info = MD.objets?.[id]; if (!info) return Promise.resolve(null);
  OBJ[id] ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`${import.meta.env.BASE_URL}modeles/mode/objets/${id}.glb?v=${info.octets}`)
    .then(g => { const s = g.scene, b = new THREE.Box3().setFromObject(s), t = b.getSize(new THREE.Vector3()), e = .36 / Math.max(t.x, t.y, t.z); s.scale.setScalar(e); s.position.set(-(b.min.x + b.max.x) / 2 * e, -b.min.y * e + .09, -(b.min.z + b.max.z) / 2 * e); return s; })
    .catch(e => { delete OBJ[id]; console.warn('objet', id, e.message); return null; });
  return OBJ[id].then(s => { if (!s) return null; const g = new THREE.Group(); g.add(s.clone()); return g; });
}

// ---------- La cabine d'essayage : sa propre petite scène 3D ----------
function initCabine() {
  if (MD.rendu) return;
  const cv = $('#modeVue');
  MD.rendu = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); MD.rendu.setPixelRatio(Math.min(devicePixelRatio, 2));
  MD.rendu.toneMapping = THREE.NeutralToneMapping; MD.rendu.outputColorSpace = THREE.SRGBColorSpace;
  const S = MD.scene = new THREE.Scene();
  S.add(new THREE.HemisphereLight('#fff6e6', '#8a6a48', 1.6));
  const cle = new THREE.DirectionalLight('#ffffff', 2.2); cle.position.set(1.6, 3, 2.6); S.add(cle);
  const contre = new THREE.DirectionalLight('#ffd9a8', 1.2); contre.position.set(-2, 2.2, -2.5); S.add(contre);
  // Le podium : un disque crème cerclé d'or, et une ombre douce posée dessous.
  const socle = new THREE.Mesh(new THREE.CylinderGeometry(.62, .66, .08, 48), new THREE.MeshStandardMaterial({ color: '#efe3cb', roughness: .7 }));
  socle.position.y = .04; S.add(socle);
  const filet = new THREE.Mesh(new THREE.TorusGeometry(.62, .012, 8, 64), new THREE.MeshStandardMaterial({ color: '#c99a3a', metalness: .6, roughness: .35 }));
  filet.rotation.x = Math.PI / 2; filet.position.y = .08; S.add(filet);
  const oc = document.createElement('canvas'); oc.width = oc.height = 64; const o = oc.getContext('2d'), gr = o.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(40,25,10,.45)'); gr.addColorStop(1, 'rgba(40,25,10,0)'); o.fillStyle = gr; o.fillRect(0, 0, 64, 64);
  const ombre = new THREE.Mesh(new THREE.PlaneGeometry(.9, .9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(oc), transparent: true, depthWrite: false }));
  ombre.rotation.x = -Math.PI / 2; ombre.position.y = .082; S.add(ombre);
  MD.cam = new THREE.PerspectiveCamera(28, 1, .05, 50);
  // Glisser pour tourner (souris, doigt) ; flèches gauche/droite au clavier.
  cv.addEventListener('pointerdown', e => { MD.glisse = { x: e.clientX, r: MD.rotY }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (MD.glisse) MD.rotY = MD.glisse.r + (e.clientX - MD.glisse.x) * .012; });
  const lacher = () => { MD.glisse = null; }; cv.addEventListener('pointerup', lacher); cv.addEventListener('pointercancel', lacher);
  cv.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') MD.rotY -= .3; if (e.key === 'ArrowRight') MD.rotY += .3; });
}
function cadrer(type) {
  const cv = $('#modeVue'), w = cv.clientWidth || 300, h = cv.clientHeight || 400;
  MD.rendu.setSize(w, h, false); MD.cam.aspect = w / h;
  const [y, d, vise] = type === 'tenue' ? [1.05, 5.2, .92] : [.55, 1.75, .14];
  MD.cam.position.set(0, y, d); MD.cam.lookAt(0, vise, 0); MD.cam.updateProjectionMatrix();
}
function tourner(now) {
  if ($('#mode').hidden) { MD.raf = 0; return; }
  const dt = Math.min(.1, (now - (MD.dernier || now)) / 1000); MD.dernier = now;
  if (!MD.glisse) MD.rotY += dt * .3; // tourne doucement tout seul
  if (MD.vue) MD.vue.rotation.y = MD.rotY;
  MD.inst?.userData.maj?.(dt);
  MD.rendu.render(MD.scene, MD.cam);
  MD.raf = requestAnimationFrame(tourner);
}
/** Met l'article `id` sur le podium (la tenue sur le personnage, ou le pagne, ou la chaussure). */
async function exposer(id) {
  const A = ARTICLES[id], jeton = ++MD.jeton, charge = $('#modeCharge');
  charge.hidden = false; charge.textContent = A.type === 'tenue' ? 'On prépare la tenue…' : 'Chargement…';
  let vue = null, inst = null;
  if (A.type === 'tenue') {
    if (await chargerTenue(id, MD.index?.[id])) { inst = personnage3d(42, { role: id, manuel: true }); vue = inst; }
  } else if (A.type === 'pagne') vue = pagneObjet(A.motif);
  else vue = await chargerObjet(id);
  if (jeton !== MD.jeton) return; // un autre article a été choisi entre-temps
  charge.hidden = !!vue; if (!vue) charge.textContent = 'Impossible de charger cet article. Vérifie ta connexion, puis choisis-le à nouveau.';
  if (MD.vue) { MD.scene.remove(MD.vue); MD.inst?.userData.liberer?.(); }
  MD.vue = vue; MD.inst = inst;
  cadrer(A.type);
  if (!vue) return;
  vue.position.y = A.type === 'tenue' ? .08 : 0; MD.scene.add(vue);
  if (inst) { inst.userData.jouer('salut', 0); setTimeout(() => { if (MD.inst === inst) inst.userData.jouer('idle'); }, 2600); }
}

// ---------- Le catalogue ----------
function vignette(id, A) {
  if (A.type === 'pagne') return motifWax(A.motif).url;
  return `${import.meta.env.BASE_URL}modeles/mode/vignettes/${id}.webp`;
}
function rendreListe() {
  const p = prog(), box = $('#modeListe'); box.innerHTML = '';
  document.querySelectorAll('#modeOnglets [data-onglet]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.onglet === MD.onglet)));
  $('#modeFiltre').hidden = MD.onglet !== 'tenue';
  document.querySelectorAll('#modeFiltre [data-f]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === MD.filtre)));
  const ids = Object.keys(ARTICLES).filter(id => { const A = ARTICLES[id]; return A.type === MD.onglet && (MD.onglet !== 'tenue' || MD.filtre === 'tout' || A.femme === (MD.filtre === 'femme')); });
  for (const id of ids) {
    const A = ARTICLES[id], b = document.createElement('button'); b.type = 'button'; b.className = 'md-carte' + (MD.choisi === id ? ' actif' : '');
    const etat = p.tenue === id ? '<i class="md-badge">Portée</i>' : p.garderobe.includes(id) ? '<i class="md-badge">À toi</i>' : '';
    b.innerHTML = `<img src="${vignette(id, A)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><b>${A.nom}</b><small>${fmtR(A.prix)}</small>${etat}`;
    b.addEventListener('click', () => choisir(id)); box.append(b);
  }
  $('#modeBourse').textContent = `Ta cagnotte : ${fmtF(p.cagnotte)}${p.commandes.length ? ` · ${p.commandes.length} commande${p.commandes.length > 1 ? 's' : ''}` : ''}`;
}
function message(txt, cls = '') { MD.msg = [txt, cls]; const el = $('#modeMsg'); if (el) { el.textContent = txt; el.className = 'ev-etat ' + cls; el.hidden = !txt; } }
function choisir(id) {
  if (MD.choisi === id && MD.etape === 'fiche') return;
  MD.choisi = id; MD.etape = 'fiche'; MD.taille = null; MD.attente = null; MD.msg = ['', ''];
  rendreListe(); rendreFiche(); exposer(id);
}
function rendreFiche() {
  const id = MD.choisi, A = ARTICLES[id], p = prog(), el = $('#modeFiche'); if (!A) { el.innerHTML = ''; return; }
  if (MD.etape === 'commande') return rendreCommande();
  const aMoi = p.garderobe.includes(id), portee = p.tenue === id;
  el.innerHTML = `<small class="md-atelier">${A.atelier}</small><h4>${A.nom}</h4><p class="md-desc">${A.desc}</p>
    <p class="md-prix"><b>${fmtR(A.prix)}</b> en vrai${A.prixJeu ? ` · ou <b>${fmtF(A.prixJeu)}</b> de cagnotte pour la porter dans le jeu` : ''}</p>
    <div class="md-actions">
      ${A.type === 'tenue' ? `<button type="button" class="jouer" id="mdPorter" ${portee ? 'disabled' : ''}>${portee ? 'Tu la portes' : aMoi ? 'La porter' : `La porter en jeu · ${fmtF(A.prixJeu)}`}</button>` : ''}
      <button type="button" class="jouer ev-btn-momo" id="mdAcheter"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg><span>Acheter pour de vrai</span></button>
    </div>
    <p class="ev-etat" id="modeMsg" role="status" aria-live="polite" hidden></p>`;
  message(...MD.msg);
  $('#mdPorter')?.addEventListener('click', () => porter(id));
  $('#mdAcheter').addEventListener('click', () => { MD.etape = 'commande'; MD.msg = ['', '']; rendreFiche(); });
}
function porter(id) {
  const A = ARTICLES[id], p = prog();
  if (!p.garderobe.includes(id)) {
    if (p.cagnotte < A.prixJeu) { son('bosse'); message(`Il te manque ${fmtF(A.prixJeu - p.cagnotte)} dans ta cagnotte : fais encore quelques courses de zém, puis reviens.`, 'mal'); return; }
    p.cagnotte -= A.prixJeu; p.garderobe.push(id); son('piece');
  }
  p.tenue = id; sauver();
  MD.msg = ['Tu portes ta nouvelle tenue. Va la montrer au concert de l’Esplanade !', 'bien'];
  rendreListe(); rendreFiche();
  MD.inst?.userData.jouer('salut'); setTimeout(() => MD.inst?.userData.jouer('idle'), 2600);
}

// ---------- Acheter pour de vrai : taille, quartier, paiement MoMo ----------
const fraisDe = q => LIVRAISON.find(l => l[0] === q)?.[1] ?? 0;
function rendreCommande() {
  const id = MD.choisi, A = ARTICLES[id], el = $('#modeFiche'), tailles = taillesDe(A), frais = fraisDe(MD.quartier);
  const total = A.prix + frais;
  el.innerHTML = `<small class="md-atelier">Commander · ${A.atelier}</small><h4>${A.nom}</h4>
    ${tailles ? `<p class="md-label" id="mdTailleTitre">${A.type === 'chaussure' ? 'Pointure' : 'Taille'}</p><div class="md-tailles" role="group" aria-labelledby="mdTailleTitre">${tailles.map(t => `<button type="button" data-t="${t}" aria-pressed="${MD.taille === t}">${t}</button>`).join('')}</div>` : ''}
    <label class="md-label" for="mdQuartier">Quartier de livraison</label>
    <select id="mdQuartier"><option value="">Choisis ton quartier</option>${LIVRAISON.map(([q, f]) => `<option value="${q}" ${MD.quartier === q ? 'selected' : ''}>${q} · livraison ${fmtR(f)}</option>`).join('')}</select>
    <label class="md-label" for="mdRepere">Repère pour le livreur (facultatif)</label>
    <input id="mdRepere" maxlength="80" value="${MD.repere.replace(/"/g, '&quot;')}" placeholder="Ex. : en face de la pharmacie, portail bleu">
    <p class="md-total">${fmtR(A.prix)}${frais ? ` + livraison ${fmtR(frais)}` : ''} = <b>${fmtR(total)}</b></p>
    <div class="md-actions">
      <button type="button" class="jouer ev-btn-momo" id="mdPayer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg><span>${MD.attente ? 'Vérifier mon paiement' : `Payer ${fmtR(total)} par MoMo`}</span></button>
      <button type="button" class="btn-ghost" id="mdRetour">Retour</button>
    </div>
    <p class="md-note">Le numéro MoMo qui paie sert aussi au livreur pour t’appeler.</p>
    <p class="ev-etat" id="modeMsg" role="status" aria-live="polite" hidden></p>`;
  message(...MD.msg);
  el.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { MD.taille = b.dataset.t; MD.msg = ['', '']; rendreCommande(); }));
  $('#mdQuartier').addEventListener('change', e => { MD.quartier = e.target.value; MD.msg = ['', '']; rendreCommande(); });
  $('#mdRepere').addEventListener('input', e => { MD.repere = e.target.value; });
  $('#mdRetour').addEventListener('click', () => { MD.etape = 'fiche'; MD.attente = null; MD.msg = ['', '']; rendreFiche(); });
  $('#mdPayer').addEventListener('click', payerCommande);
}
const ETATS = {
  annule: ['Paiement annulé : rien n’a été prélevé.', ''],
  reseau: ['FedaPay ne répond pas. Vérifie ta connexion, puis réessaie.', 'mal'],
  pending: ['Paiement pas encore confirmé. Valide-le sur ton téléphone, puis touche « Vérifier mon paiement ».', ''],
  'non-configure': ['Le paiement MoMo n’est pas encore activé sur ce site.', 'mal'],
};
async function payerCommande() {
  const id = MD.choisi, A = ARTICLES[id], tailles = taillesDe(A), btn = $('#mdPayer');
  if (tailles && !MD.taille) return message(`Choisis d’abord ta ${A.type === 'chaussure' ? 'pointure' : 'taille'}.`, 'mal');
  if (!MD.quartier) { $('#mdQuartier').focus(); return message('Choisis le quartier où te livrer.', 'mal'); }
  if (!paiementReel()) return message('Version de test : le paiement MoMo n’est pas encore activé, aucune commande n’a été envoyée.', 'mal');
  const total = A.prix + fraisDe(MD.quartier);
  btn.disabled = true; btn.classList.add('charge'); $('#mdRetour').disabled = true;
  message(MD.attente ? 'Vérification du paiement…' : 'Ouverture de FedaPay…');
  const infos = { article: id, taille: MD.taille || '', quartier: MD.quartier, repere: MD.repere.slice(0, 80), atelier: A.atelier };
  const r = MD.attente ? await verifierTransaction(MD.attente, total)
    : await payerMoMo({ montant: total, description: `${A.nom}${MD.taille ? ` · ${MD.taille}` : ''} · livraison ${MD.quartier}`, objet: 'boutique', infos });
  MD.attente = r.statut === 'pending' ? r.id : null;
  if (r.paye) {
    const p = prog();
    p.commandes.push({ id, taille: MD.taille, quartier: MD.quartier, total, date: new Date().toISOString().slice(0, 10), transaction: r.id });
    if (A.type === 'tenue' && !p.garderobe.includes(id)) p.garderobe.push(id); // la vraie tenue achetée se porte aussi dans le jeu
    sauver(); son('piece');
    MD.etape = 'fiche'; MD.msg = [`Commande payée ! L’atelier t’appelle au numéro qui a payé pour la livraison à ${MD.quartier}.${A.type === 'tenue' ? ' La tenue est aussi dans ta garde-robe du jeu.' : ''}`, 'bien'];
    rendreListe(); rendreFiche(); return;
  }
  MD.msg = ETATS[r.statut] || ['Le paiement n’a pas abouti : rien n’a été prélevé. Tu peux réessayer.', 'mal'];
  rendreCommande();
}

// ---------- Ouvrir, fermer ----------
export async function ouvrirMode() {
  const el = $('#mode'); el.hidden = false; el.focus();
  initCabine(); await index();
  const p = prog();
  if (!MD.choisi) { MD.choisi = p.tenue || 'robe-wax'; MD.onglet = ARTICLES[MD.choisi].type; }
  rendreListe(); rendreFiche(); cadrer(ARTICLES[MD.choisi].type); exposer(MD.choisi);
  if (!MD.raf) { MD.dernier = 0; MD.raf = requestAnimationFrame(tourner); }
}
export function fermerMode() { $('#mode').hidden = true; }
export function initMode() {
  $('#btnMode')?.addEventListener('click', ouvrirMode);
  $('#modeFermer')?.addEventListener('click', fermerMode);
  $('#mode')?.addEventListener('keydown', e => { if (e.key === 'Escape') fermerMode(); });
  document.querySelectorAll('#modeOnglets [data-onglet]').forEach(b => b.addEventListener('click', () => {
    MD.onglet = b.dataset.onglet; const premier = Object.keys(ARTICLES).find(id => ARTICLES[id].type === MD.onglet);
    if (ARTICLES[MD.choisi]?.type !== MD.onglet) choisir(premier); else rendreListe();
  }));
  document.querySelectorAll('#modeFiltre [data-f]').forEach(b => b.addEventListener('click', () => { MD.filtre = b.dataset.f; rendreListe(); }));
  addEventListener('resize', () => { if (!$('#mode').hidden && MD.choisi) cadrer(ARTICLES[MD.choisi].type); });
}

/** Le personnage du joueur dans la tenue qu'il porte (pour le concert), ou null s'il n'en porte pas. */
export async function avatarPorte() {
  const id = JEU.prog?.tenue; if (!id || !ARTICLES[id]) return null;
  await index();
  if (!(await chargerTenue(id, MD.index?.[id]))) return null;
  return personnage3d(77, { role: id });
}
