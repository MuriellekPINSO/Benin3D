// ---------- La salle de jeux (05/11) ----------
// « Ils ont leur espace, ils gèrent tout, je valide, et après c'est disponible sur Kutɔnu Vibes » (Murielle) : les jeux
// des créateurs, web ou mobiles, présentés dans un bâtiment de la ville (Haie Vive, reperes.js → SALLE_JEUX), comme
// Lagos Life le fait pour ses partenaires. Les fiches viennent de /api/jeux (api/jeux.js) : un jeu validé dans le
// tableau de bord apparaît ici en une minute, sans mise à jour du site.
//   - jeu web : il se joue dans une fenêtre de Kutɔnu Vibes (cadre isolé), la ville en pause derrière ;
//   - jeu mobile : sa vitrine, et un bouton vers le bon magasin (Play Store, App Store) ; sur ordinateur, un QR code ;
//   - jeu d'ordinateur (Windows, Linux, Mac) : un bouton vers sa page de téléchargement ; sur téléphone, le lien à s'envoyer.
// Rien ne part avant qu'on entre : ni la liste, ni les affiches (celles de la façade arrivent après la ville).
// Depuis le 06/11, on entre d'abord dans la salle, un cyber café (cyber-cafe.js) : à pied dans « Vivre à Cotonou », par la
// porte (interieurs.js), puis assis à un ordinateur ; depuis la fiche du lieu, la caméra entre et va jusqu'à un écran.
// La liste des jeux ne s'ouvre qu'ensuite (« Pourquoi je ne rentre pas dans la salle avant qu'on me montre le menu des
// jeux ? », Murielle, 06/11).
import * as THREE from 'three';
import qrcode from 'qrcode-generator';
import { $, LITE, SECOURS, toXZ } from './base.js';
import { camera, controls, scene } from './scene.js';
import { E } from './etat.js';
import { SALLE_JEUX } from './reperes.js';
import { rueProche } from './ville-tripo.js';
import { ajouterEmprise, ajouterZoneLibre } from './rue.js';
import { plusTard } from './telechargements.js';
import { INTERIEURS, cacherInterieurs, dansLaPiece, declarerInterieur, ouvrirInterieur } from './interieurs.js';
import { CYBER, construireCyber } from './cyber-cafe.js';
import { chargerPersonnages } from './personnages.js';
import { startFlight } from './interface.js';
import { salonActif } from './salon.js';

const API = `${import.meta.env.BASE_URL}api/jeux`;
const S = { liste: null, groupe: null, affiches: [], el: null };
const telephone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const compter = (id, quoi) => fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'compter', id, quoi }), keepalive: true }).catch(() => { });
const imageJeu = (j, k = 'a') => `${API}?img=${encodeURIComponent(j.id)}&k=${k}&v=${j.v || 0}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** La liste des jeux en ligne (une fois par visite, relue si l'on revient plus de 5 minutes après). */
async function lireListe() {
  if (S.liste && Date.now() - S.liste.t < 300e3) return S.liste.jeux;
  const r = await fetch(`${API}?liste`); if (!r.ok) throw new Error(r.status);
  const { jeux } = await r.json(); S.liste = { t: Date.now(), jeux }; return jeux;
}

// ---------- Le bâtiment ----------
// Une boutique R+1 de 16 × 11 m, peinte en violet, sa façade tournée vers la rue la plus proche : vitrine, enseigne
// lumineuse, auvent jaune, néon rose sous le toit, et à l'étage les affiches des quatre derniers jeux validés.
function enseigne() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const g = c.getContext('2d');
  const d = g.createLinearGradient(0, 0, 1024, 0); d.addColorStop(0, '#2a1d52'); d.addColorStop(1, '#4a2477'); g.fillStyle = d; g.fillRect(0, 0, 1024, 160);
  g.fillStyle = '#ffd23b'; g.font = '800 92px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SALLE DE JEUX', 512, 70);
  g.fillStyle = '#ffffff'; g.font = '600 30px system-ui, sans-serif'; g.fillText('Les jeux des créateurs, d’ici et d’ailleurs', 512, 132);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function afficheVide(i) {
  const c = document.createElement('canvas'); c.width = 192; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = ['#1a7d52', '#d6452f', '#2f6fb0', '#e9b62c'][i % 4]; g.fillRect(0, 0, 192, 256);
  g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '700 26px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('BIENTÔT', 96, 120); g.font = '500 18px system-ui, sans-serif'; g.fillText('ton jeu ici', 96, 150);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Pose le bâtiment (main.js, après la construction de la ville). */
export function construireSalle() {
  if (SECOURS) return;
  const [cx, cz] = toXZ(...SALLE_JEUX.centre), rue = rueProche(cx, cz);
  let dx = 1, dz = 0; if (rue) { const l = Math.hypot(rue[0] - cx, rue[1] - cz) || 1; dx = (rue[0] - cx) / l; dz = (rue[1] - cz) / l; }
  const W = 16, D = 11, H = 7, recul = (rue ? rue[2] : 4) + 1.5 + D / 2; // la vitrine à 1,5 m du bord de la chaussée
  const px = rue ? rue[0] - dx * recul : cx, pz = rue ? rue[1] - dz * recul : cz;
  const g = new THREE.Group(); g.name = 'salle-de-jeux'; g.position.set(px, 0, pz); g.rotation.y = Math.atan2(dx, dz); // +z local = la façade
  const mur = new THREE.MeshLambertMaterial({ color: '#3b2d5c' });
  const ajout = (geo, mat, x, y, z, ombre = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = ombre && !LITE; m.receiveShadow = true; g.add(m); return m; };
  const crepi = new THREE.MeshLambertMaterial({ color: '#cfc6b8' });
  ajout(new THREE.BoxGeometry(W, H, D), [crepi, crepi, mur, crepi, mur, crepi], 0, H / 2, 0); // façade (+z) violette, côtés et arrière crépis
  ajout(new THREE.BoxGeometry(W + .3, .5, D + .3), new THREE.MeshLambertMaterial({ color: '#2a2142' }), 0, H + .25, 0);
  const f = D / 2 + .03;
  ajout(new THREE.PlaneGeometry(W - 3, 2.7), new THREE.MeshLambertMaterial({ color: '#16222e', emissive: '#0b2233' }), 0, 1.65, f, false); // vitrine
  ajout(new THREE.PlaneGeometry(2, 2.5), new THREE.MeshLambertMaterial({ color: '#0d141b' }), 0, 1.25, f + .01, false); // porte
  ajout(new THREE.PlaneGeometry(W - 1, 1.55), new THREE.MeshBasicMaterial({ map: enseigne() }), 0, 4.05, f, false); // enseigne : elle brille la nuit
  ajout(new THREE.BoxGeometry(7, .16, 1.7), new THREE.MeshLambertMaterial({ color: '#f2b705' }), 0, 3.2, D / 2 + .85); // auvent
  ajout(new THREE.BoxGeometry(W + .1, .14, .14), new THREE.MeshBasicMaterial({ color: '#ff3fb4' }), 0, H - .25, f + .05, false); // néon
  S.affiches = [0, 1, 2, 3].map(i => {
    const m = ajout(new THREE.PlaneGeometry(1.4, 1.85), new THREE.MeshBasicMaterial({ map: afficheVide(i) }), (i - 1.5) * 3.4, 5.85, f, false);
    return m;
  });
  scene.add(g); S.groupe = g;
  // Devant la porte, sur le trottoir, face à la vitrine (« Aller… » de Vivre à Cotonou, salon.js) : le regard 0 = vers le sud.
  const fx = Math.sin(g.rotation.y), fz = Math.cos(g.rotation.y), porte = [px + fx * D / 2, pz + fz * D / 2];
  S.devant = [porte[0] + fx * 3.5, porte[1] + fz * 3.5, g.rotation.y + Math.PI]; S.porte = porte;
  // Dedans : le cyber café (cyber-cafe.js), bâti à la première visite. Devant la porte, le salon propose « Entrer dans la salle de jeux ».
  declarerInterieur('salle-jeux', {
    nom: 'la salle de jeux', porte: [porte[0] + fx * 1.4, porte[1] + fz * 1.4], dehors: g.rotation.y,
    w: CYBER.W, d: CYBER.D, entree: [0, -CYBER.D / 2 + 1.5, 0], plafond: CYBER.H, lampe: 1.9, // murs sombres : une lampe plus forte
    bienvenue: 'Bienvenue au cyber de la salle de jeux ! Assieds-toi à un ordinateur libre (étiquette « Joue ici ») pour voir les jeux.',
    construire: I => { S.cyber = construireCyber(I); affichesDedans(); },
  });
  // On ne la traverse pas, et rue.js ne pose pas de mur de parcelle devant sa vitrine.
  const coin = (u, v) => [px + u * Math.cos(g.rotation.y) + v * Math.sin(g.rotation.y), pz - u * Math.sin(g.rotation.y) + v * Math.cos(g.rotation.y)];
  ajouterEmprise([coin(-W / 2, -D / 2), coin(W / 2, -D / 2), coin(W / 2, D / 2), coin(-W / 2, D / 2)]);
  const devant = [coin(-W / 2 - 2, -D / 2), coin(W / 2 + 2, -D / 2), coin(W / 2 + 2, D / 2 + 6), coin(-W / 2 - 2, D / 2 + 6)];
  ajouterZoneLibre([Math.min(...devant.map(p => p[0])), Math.min(...devant.map(p => p[1])), Math.max(...devant.map(p => p[0])), Math.max(...devant.map(p => p[1]))]);
  // Les affiches des derniers jeux, une fois la ville affichée.
  plusTard(() => lireListe().then(jeux => Promise.all(jeux.slice(0, 4).map((j, i) => new THREE.TextureLoader().loadAsync(imageJeu(j)).then(t => {
    t.colorSpace = THREE.SRGBColorSpace; const m = S.affiches[i].material; m.map?.dispose(); m.map = t; m.needsUpdate = true;
  }))))).catch(() => { });
  return { x: px, z: pz };
}

/** Où « Aller… » dépose le joueur : [x, z, regard], devant la porte. */
export const devantSalle = () => S.devant || null;
/** Le joueur est-il devant la salle (à moins de 9 m de la porte) ? */
export const presDeSalle = (x, z) => !!S.porte && Math.hypot(x - S.porte[0], z - S.porte[1]) < 9;

// ---------- La salle : la liste des jeux, la fiche d'un jeu ----------
function fenetre() {
  if (S.el) return S.el;
  const el = document.createElement('div'); el.className = 'salle-jeux'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Salle de jeux');
  el.innerHTML = `<div class="sj-panneau"><div class="sj-tete"><div><small>Haie Vive</small><h2>Salle de jeux</h2></div><button type="button" class="sj-fermer" aria-label="Fermer">×</button></div><div class="sj-corps"></div></div>`;
  el.querySelector('.sj-fermer').addEventListener('click', fermerSalle);
  el.addEventListener('click', e => { if (e.target === el) fermerSalle(); });
  document.body.appendChild(el); S.el = el; return el;
}
const corps = () => S.el.querySelector('.sj-corps');
const sur = window.addEventListener.bind(window);
sur('keydown', e => { if (e.key !== 'Escape') return; if (S.el && !S.el.hidden) { if (S.jeu) fermerJeu(); else fermerSalle(); } else if (V.actif && !e.target.closest?.('input, textarea')) sortirDeLaSalle(); });
// Salle ouverte : les touches restent à elle (sinon ZQSD faisait marcher le personnage de Vivre à Cotonou derrière).
sur('keydown', e => { if (((S.el && !S.el.hidden) || S.jeu) && e.key !== 'Escape') e.stopImmediatePropagation(); }, true);

/** Ouvre la salle (bouton de la fiche du lieu, interface.js). */
export async function ouvrirSalle() {
  const el = fenetre(); el.hidden = false;
  corps().innerHTML = '<p class="sj-doux">Chargement des jeux…</p>';
  let jeux; try { jeux = await lireListe(); } catch { corps().innerHTML = '<p class="sj-doux">La salle ne répond pas. Vérifie ta connexion, puis réessaie.</p>'; return; }
  const invitation = '<p class="sj-invitation">Tu crées des jeux ? <a href="/createurs.html" target="_blank" rel="noopener">Mets le tien dans la salle</a>, web ou mobile. C’est gratuit.</p>';
  if (!jeux.length) { corps().innerHTML = `<p class="sj-doux">Les premiers jeux arrivent bientôt.</p>${invitation}`; return; }
  corps().innerHTML = `<p class="sj-doux">Les jeux des créateurs, d’ici et d’ailleurs. Touche un jeu pour le découvrir.</p><div class="sj-grille">${jeux.map(j => `
    <button type="button" class="sj-carte" data-id="${esc(j.id)}"><img src="${imageJeu(j)}" alt="" loading="lazy"><b>${esc(j.nom)}</b><small>${esc(j.accroche || j.createurs || '')}</small><span class="sj-type">${j.type === 'web' ? 'Joue ici' : j.type === 'pc' ? 'Sur ordinateur' : 'Sur mobile'}</span></button>`).join('')}</div>${invitation}`;
  corps().querySelectorAll('.sj-carte').forEach(b => b.addEventListener('click', () => ouvrirFiche(b.dataset.id)));
}
export function fermerSalle() { fermerJeu(); if (S.el && !S.el.hidden) { S.el.hidden = true; if (V.actif) vueDEnsemble(); } }

async function ouvrirFiche(id) {
  corps().innerHTML = '<p class="sj-doux">Chargement…</p>';
  let j; try { const r = await fetch(`${API}?id=${encodeURIComponent(id)}`); if (!r.ok) throw 0; j = (await r.json()).jeu; } catch { corps().innerHTML = '<p class="sj-doux">Ce jeu n’est plus disponible.</p>'; return; }
  compter(id, 'fiche');
  const images = [imageJeu(j), ...Array.from({ length: j.captures || 0 }, (_, i) => imageJeu(j, i))];
  const magasin = `${API}?aller=${encodeURIComponent(j.id)}`, android = !!j.android, ios = !!j.ios, surIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  let action;
  const systemes = (j.plateformes || []).map(p => ({ windows: 'Windows', linux: 'Linux', mac: 'Mac' })[p]).filter(Boolean).join(', ');
  if (j.type === 'web') action = '<button type="button" class="jouer sj-jouer">Jouer</button>';
  else if (j.type === 'pc') action = telephone()
    ? `<p class="sj-doux">Ce jeu se joue sur ordinateur (${esc(systemes)}).</p><a class="btn-ghost" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`${j.nom}, à télécharger sur ordinateur : ${new URL(magasin, location.href).href}`)}">M’envoyer le lien sur WhatsApp</a>`
    : `<a class="jouer" href="${magasin}" target="_blank" rel="noopener">Télécharger le jeu</a><span class="sj-doux">${esc(systemes)}</span>`;
  else if (telephone()) action = (surIos && !ios) ? '<p class="sj-doux">Ce jeu n’existe que sur Android pour l’instant.</p>' : (!surIos && !android) ? '<p class="sj-doux">Ce jeu n’existe que sur iPhone pour l’instant.</p>' : `<a class="jouer" href="${magasin}" target="_blank" rel="noopener">${surIos ? 'Jouer : ouvrir l’App Store' : 'Jouer : ouvrir le Play Store'}</a>`;
  else action = '<button type="button" class="jouer sj-qr-montrer">Jouer sur mon téléphone</button><div class="sj-qr" hidden></div>';
  corps().innerHTML = `
    <button type="button" class="sj-retour">‹ Tous les jeux</button>
    <div class="sj-images">${images.map(u => `<img src="${u}" alt="" loading="lazy">`).join('')}</div>
    <h3 class="sj-nom">${esc(j.nom)}</h3>
    <p class="sj-par">${j.type === 'web' ? 'Jeu web' : j.type === 'pc' ? `Jeu pour ${esc(systemes)}` : 'Jeu mobile'}${j.createurs ? ` · par ${esc(j.createurs)}` : ''}</p>
    <p class="sj-desc">${esc(j.description)}</p>
    <div class="sj-actions">${action}${j.video ? '<button type="button" class="btn-ghost sj-video">Voir la vidéo</button>' : ''}</div>
    <div class="sj-lecteur" hidden></div>
    ${j.code ? `<div class="sj-code"><span>Code cadeau dans le jeu : <b>${esc(j.code)}</b></span><button type="button" class="btn-ghost sj-copier">Copier</button><a class="btn-ghost" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`${j.nom} : le code cadeau ${j.code}, trouvé dans la salle de jeux de Kutɔnu Vibes. https://kotonuvibes.com`)}">WhatsApp</a></div>` : ''}`;
  const c = corps();
  c.querySelector('.sj-retour').addEventListener('click', ouvrirSalle);
  c.querySelector('.sj-jouer')?.addEventListener('click', () => ouvrirJeu(j));
  c.querySelector('.sj-qr-montrer')?.addEventListener('click', e => {
    const q = c.querySelector('.sj-qr'); if (!q.hidden) return;
    const code = qrcode(0, 'M'); code.addData(new URL(magasin, location.href).href); code.make();
    q.innerHTML = `${code.createSvgTag({ cellSize: 5, margin: 2, scalable: true })}<p>Scanne ce code avec ton téléphone : il ouvre ${android && ios ? 'le Play Store ou l’App Store' : android ? 'le Play Store' : 'l’App Store'}.</p>`;
    q.hidden = false; e.currentTarget.hidden = true; compter(j.id, 'qr');
  });
  c.querySelector('.sj-video')?.addEventListener('click', e => {
    const l = c.querySelector('.sj-lecteur'); e.currentTarget.hidden = true; l.hidden = false; compter(j.id, 'video');
    l.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(j.video)}?autoplay=1&rel=0" title="Vidéo de ${esc(j.nom)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  });
  c.querySelector('.sj-copier')?.addEventListener('click', async e => { try { await navigator.clipboard.writeText(j.code); e.currentTarget.textContent = 'Copié !'; } catch { } compter(j.id, 'code'); });
}

// ---------- Un jeu web, dans une fenêtre ----------
// Un cadre isolé : le jeu ne voit ni le compte du joueur ni la page de Kutɔnu Vibes. La ville s'arrête derrière
// (main.js, E.pauseRendu) : le téléphone ne fait pas tourner deux jeux à la fois.
function ouvrirJeu(j) {
  fermerJeu();
  const f = document.createElement('div'); f.className = 'sj-jeu';
  f.innerHTML = `<div class="sj-jeu-barre"><b>${esc(j.nom)}</b><button type="button" class="jouer">Quitter le jeu</button></div><iframe title="${esc(j.nom)}" sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox" allow="fullscreen; autoplay; gamepad; accelerometer; gyroscope" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  f.querySelector('iframe').src = j.web;
  f.querySelector('button').addEventListener('click', fermerJeu);
  document.body.appendChild(f); S.jeu = f; E.pauseRendu = true;
  compter(j.id, 'partie');
}
function fermerJeu() { if (!S.jeu) return; S.jeu.remove(); S.jeu = null; E.pauseRendu = false; }

// ---------- Dedans : les affiches, s'asseoir à un ordinateur (Vivre à Cotonou) ----------
/** Les affiches des derniers jeux validés, sur les murs, l'écran géant et quelques écrans de joueurs. */
function affichesDedans() {
  lireListe().then(jeux => Promise.all(jeux.slice(0, 5).map(j => new Promise(ok => {
    const img = new Image();
    img.onload = () => { const tex = new THREE.Texture(img); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true; ok({ nom: j.nom, img, tex }); };
    img.onerror = () => ok(null); img.src = imageJeu(j);
  })))).then(l => { const ok = l.filter(Boolean); if (ok.length) S.cyber?.poser(ok); }).catch(() => { });
}
const surPlace = (I, p) => [I.centre[0] + p.x, I.centre[1] + p.z];
/** Les actions dans la salle (salon.js) : s'asseoir à un ordinateur libre ; assis, revoir les jeux ou se lever. J : le joueur. */
export function actionsSalle(J, T) {
  const I = J.lieu, C = S.cyber; if (T.mode !== 'pied' || I?.id !== 'salle-jeux' || !C) return [];
  const [lx, lz] = surPlace(I, C.libre); C.repere.visible = Math.hypot(J.x - lx, J.z - lz) > 2.2; // l'étiquette « Joue ici » s'efface quand on y est
  const assis = (J.geste === 'assis' || J.geste === 'telephone') && C.postes.find(p => { const [x, z] = surPlace(I, p); return Math.hypot(J.x - x, J.z - z) < .3; });
  if (assis) return [{ texte: 'Voir les jeux', f: () => ouvrirSalle() }, { texte: 'Me lever', f: () => { const [x, z] = surPlace(I, assis); J.geste = 'idle'; J.x = x; J.z = z - .75; J.saut = true; } }];
  let poste = null, d0 = 1.7;
  for (const p of C.postes) { if (p.occupe) continue; const [x, z] = surPlace(I, p), d = Math.hypot(J.x - x, J.z - z); if (d < d0) { d0 = d; poste = p; } }
  return poste ? [{ texte: 'Jouer sur cet ordinateur', f: () => installer(J, I, poste) }] : [];
}
// On s'assoit face à l'écran, la caméra se rapproche par-dessus l'épaule, puis la liste des jeux s'ouvre.
function installer(J, I, p) {
  const [x, z] = surPlace(I, p);
  J.x = x; J.z = z; J.cap = p.cap; J.geste = 'assis'; J.gesteFin = 0; J.saut = true; J.dist = Math.min(J.dist, 3);
  setTimeout(() => { if (J.geste === 'assis' && Math.hypot(J.x - x, J.z - z) < .3) ouvrirSalle(); }, 700);
}

// ---------- Depuis la fiche du lieu (exploration) : la caméra entre dans la salle ----------
// Pas de personnage ici : la caméra passe la porte (fondu au noir : la pièce est bâtie en mer, loin de la ville, comme
// toutes les pièces), regarde la salle, puis s'approche d'un ordinateur libre, et la liste des jeux s'ouvre. Fermée, on
// reste dans la salle et l'on peut regarder autour de soi ; « Sortir » ramène la caméra où elle était.
const V = { actif: false, I: null, avant: null, raf: 0, barre: null, voile: null, minuterie: 0 };
/** La pièce visitée depuis la fiche du lieu (main.js n'y dessine que ses abords, comme pour le salon). */
export const pieceVisitee = () => (V.actif ? V.I : null);
function voile() {
  if (V.voile) return V.voile;
  const v = document.createElement('div'); v.className = 'sj-voile'; document.body.appendChild(v); V.voile = v; return v;
}
const attendre = ms => new Promise(r => setTimeout(r, ms));
async function fondu(faire) { const v = voile(); v.classList.add('noir'); await attendre(380); try { await faire(); } finally { requestAnimationFrame(() => requestAnimationFrame(() => v.classList.remove('noir'))); } }
function barre() {
  if (V.barre) return V.barre;
  const b = document.createElement('div'); b.className = 'sj-visite'; b.hidden = true;
  b.innerHTML = '<b>Salle de jeux</b><button type="button" class="jouer" data-v="jeux">Voir les jeux</button><button type="button" class="btn-ghost" data-v="sortir">Sortir</button>';
  b.addEventListener('click', e => { const a = e.target.closest('[data-v]')?.dataset.v; if (a === 'jeux') allerAuPoste(); else if (a === 'sortir') sortirDeLaSalle(); });
  document.body.appendChild(b); V.barre = b; return b;
}
// Le point regardé : le milieu de la salle (vue d'ensemble), ou l'écran du poste libre.
const milieu = I => { const p = dansLaPiece(I, 0, 1); return new THREE.Vector3(p.x, p.y + 1.3, p.z); };
// Téléphone en hauteur : l'angle de la caméra s'ouvre pour voir les rangées (sinon, rien que l'écran géant). `hor` :
// l'angle voulu de gauche à droite, en degrés ; sur un écran large, l'angle habituel (45°) le donne déjà.
function angle(hor) {
  const fov = THREE.MathUtils.clamp(2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(hor / 2)) / camera.aspect)), V.avant?.fov || 45, 100);
  if (Math.abs(camera.fov - fov) > .1) { camera.fov = fov; camera.updateProjectionMatrix(); }
}
function vueDEnsemble(duree = 1.6) {
  if (!V.actif) return;
  angle(72);
  startFlight(milieu(V.I), 4.3, 1.27, Math.PI, duree); if (E.flight) E.flight.lift = 0; // sans le saut des longs vols : on resterait sous le plafond
  barre().hidden = false; if (S.cyber) S.cyber.repere.visible = true;
}
function allerAuPoste() {
  const C = S.cyber; if (!V.actif || !C) { ouvrirSalle(); return; }
  barre().hidden = true; C.repere.visible = false; angle(52); // on y est : l'étiquette « Joue ici » flotterait devant l'écran
  const p = dansLaPiece(V.I, C.libre.x, C.libre.rangee + .18);
  startFlight(new THREE.Vector3(p.x, p.y + 1.04, p.z), 1.5, 1.08, Math.PI, 2); // au-dessus du dossier de la chaise, les yeux sur l'écran if (E.flight) E.flight.lift = 0;
  clearTimeout(V.minuterie); V.minuterie = setTimeout(() => { if (V.actif) ouvrirSalle(); }, 2100);
}
/** « Entrer dans la salle » de la fiche du lieu (interface.js). Dans « Vivre à Cotonou », on y va à pied : la liste seule. */
export async function visiterSalle() {
  const I = INTERIEURS.get('salle-jeux');
  if (!I || salonActif()) { ouvrirSalle(); return; }
  if (V.actif) { allerAuPoste(); return; }
  await fondu(async () => {
    if (!I.g) await Promise.race([chargerPersonnages(), attendre(5000)]).catch(() => { }); // de vrais joueurs aux ordinateurs, pas des silhouettes
    ouvrirInterieur(I);
    V.actif = true; V.I = I; $('#app')?.classList.add('salle-visite'); // les panneaux de la carte s'effacent, comme au ciné
    V.avant = { t: controls.target.clone(), cam: camera.position.clone(), min: controls.minDistance, max: controls.maxDistance, minPol: controls.minPolarAngle, maxPol: controls.maxPolarAngle, pan: controls.enablePan, curseur: controls.zoomToCursor, tourne: controls.autoRotate, near: camera.near, fov: camera.fov };
    // La caméra reste dans la pièce : 4,6 m au plus du milieu, ni sous le sol ni dans le plafond, sans glisser de côté.
    Object.assign(controls, { minDistance: .4, maxDistance: 4.6, minPolarAngle: 1.05, maxPolarAngle: 1.8, enablePan: false, zoomToCursor: false, autoRotate: false });
    camera.near = .3; camera.updateProjectionMatrix(); angle(72); // la carte ne dessine rien à moins de 2 m : l'écran et la chaise auraient disparu
    E.flight = null;
    const m = milieu(I); controls.target.copy(m); camera.position.set(m.x, m.y + .5, m.z - 4.25); camera.lookAt(m); controls.update();
    cancelAnimationFrame(V.raf); V.raf = requestAnimationFrame(surveiller);
  });
  setTimeout(allerAuPoste, 700);
}
/** Sortir de la salle ; `revenir` : la caméra retrouve sa place d'avant (sinon, un autre vol l'emmène déjà ailleurs). */
export function sortirDeLaSalle(revenir = true) {
  if (!V.actif) return;
  const fin = () => {
    V.actif = false; cancelAnimationFrame(V.raf); clearTimeout(V.minuterie);
    if (S.el && !S.el.hidden) { fermerJeu(); S.el.hidden = true; }
    barre().hidden = true; cacherInterieurs(); $('#app')?.classList.remove('salle-visite');
    const A = V.avant; Object.assign(controls, { minDistance: A.min, maxDistance: A.max, minPolarAngle: A.minPol, maxPolarAngle: A.maxPol, enablePan: A.pan, zoomToCursor: A.curseur, autoRotate: A.tourne });
    camera.near = A.near; camera.fov = A.fov; camera.updateProjectionMatrix();
    if (revenir) { E.flight = null; controls.target.copy(A.t); camera.position.copy(A.cam); controls.update(); }
  };
  if (revenir) fondu(fin); else fin();
}
// Un autre lieu choisi dans la liste, la recherche, la boussole : la caméra s'en va, la visite s'arrête.
function surveiller() {
  if (!V.actif) return;
  if (controls.target.distanceTo(milieu(V.I)) > 40) { sortirDeLaSalle(false); return; }
  V.raf = requestAnimationFrame(surveiller);
}
// La vie en ville, le concert, le ciné, la course… prennent toute la scène : on sort d'abord (comme le ciné).
for (const id of ['#btnConcert', '#btnSalon', '#btnVivre', '#btnJouer', '#btnPres', '#btnMode', '#btnCine']) document.querySelector(id)?.addEventListener('click', () => sortirDeLaSalle(), true);
