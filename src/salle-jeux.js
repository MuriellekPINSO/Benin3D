// ---------- La salle de jeux (05/11) ----------
// « Ils ont leur espace, ils gèrent tout, je valide, et après c'est disponible sur Kutɔnu Vibes » (Murielle) : les jeux
// des créateurs, web ou mobiles, présentés dans un bâtiment de la ville (Haie Vive, reperes.js → SALLE_JEUX), comme
// Lagos Life le fait pour ses partenaires. Les fiches viennent de /api/jeux (api/jeux.js) : un jeu validé dans le
// tableau de bord apparaît ici en une minute, sans mise à jour du site.
//   - jeu web : il se joue dans une fenêtre de Kutɔnu Vibes (cadre isolé), la ville en pause derrière ;
//   - jeu mobile : sa vitrine, et un bouton vers le bon magasin (Play Store, App Store) ; sur ordinateur, un QR code.
// Rien ne part avant qu'on entre : ni la liste, ni les affiches (celles de la façade arrivent après la ville).
import * as THREE from 'three';
import qrcode from 'qrcode-generator';
import { $, LITE, SECOURS, toXZ } from './base.js';
import { scene } from './scene.js';
import { E } from './etat.js';
import { SALLE_JEUX } from './reperes.js';
import { rueProche } from './ville-tripo.js';
import { ajouterEmprise, ajouterZoneLibre } from './rue.js';
import { plusTard } from './telechargements.js';

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
  g.fillStyle = '#ffffff'; g.font = '600 30px system-ui, sans-serif'; g.fillText('Les jeux des créateurs béninois', 512, 132);
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
sur('keydown', e => { if (e.key === 'Escape' && S.el && !S.el.hidden) { if (S.jeu) fermerJeu(); else fermerSalle(); } });
// Salle ouverte : les touches restent à elle (sinon ZQSD faisait marcher le personnage de Vivre à Cotonou derrière).
sur('keydown', e => { if (((S.el && !S.el.hidden) || S.jeu) && e.key !== 'Escape') e.stopImmediatePropagation(); }, true);

/** Ouvre la salle (bouton de la fiche du lieu, interface.js). */
export async function ouvrirSalle() {
  const el = fenetre(); el.hidden = false;
  corps().innerHTML = '<p class="sj-doux">Chargement des jeux…</p>';
  let jeux; try { jeux = await lireListe(); } catch { corps().innerHTML = '<p class="sj-doux">La salle ne répond pas. Vérifie ta connexion, puis réessaie.</p>'; return; }
  const invitation = '<p class="sj-invitation">Tu crées des jeux ? <a href="/createurs.html" target="_blank" rel="noopener">Mets le tien dans la salle</a>, web ou mobile. C’est gratuit.</p>';
  if (!jeux.length) { corps().innerHTML = `<p class="sj-doux">Les premiers jeux arrivent bientôt.</p>${invitation}`; return; }
  corps().innerHTML = `<p class="sj-doux">Les jeux des créateurs béninois. Touche un jeu pour le découvrir.</p><div class="sj-grille">${jeux.map(j => `
    <button type="button" class="sj-carte" data-id="${esc(j.id)}"><img src="${imageJeu(j)}" alt="" loading="lazy"><b>${esc(j.nom)}</b><small>${esc(j.accroche || j.createurs || '')}</small><span class="sj-type">${j.type === 'web' ? 'Joue ici' : 'Sur mobile'}</span></button>`).join('')}</div>${invitation}`;
  corps().querySelectorAll('.sj-carte').forEach(b => b.addEventListener('click', () => ouvrirFiche(b.dataset.id)));
}
export function fermerSalle() { fermerJeu(); if (S.el) S.el.hidden = true; }

async function ouvrirFiche(id) {
  corps().innerHTML = '<p class="sj-doux">Chargement…</p>';
  let j; try { const r = await fetch(`${API}?id=${encodeURIComponent(id)}`); if (!r.ok) throw 0; j = (await r.json()).jeu; } catch { corps().innerHTML = '<p class="sj-doux">Ce jeu n’est plus disponible.</p>'; return; }
  compter(id, 'fiche');
  const images = [imageJeu(j), ...Array.from({ length: j.captures || 0 }, (_, i) => imageJeu(j, i))];
  const magasin = `${API}?aller=${encodeURIComponent(j.id)}`, android = !!j.android, ios = !!j.ios, surIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  let action;
  if (j.type === 'web') action = '<button type="button" class="jouer sj-jouer">Jouer</button>';
  else if (telephone()) action = (surIos && !ios) ? '<p class="sj-doux">Ce jeu n’existe que sur Android pour l’instant.</p>' : (!surIos && !android) ? '<p class="sj-doux">Ce jeu n’existe que sur iPhone pour l’instant.</p>' : `<a class="jouer" href="${magasin}" target="_blank" rel="noopener">${surIos ? 'Jouer : ouvrir l’App Store' : 'Jouer : ouvrir le Play Store'}</a>`;
  else action = '<button type="button" class="jouer sj-qr-montrer">Jouer sur mon téléphone</button><div class="sj-qr" hidden></div>';
  corps().innerHTML = `
    <button type="button" class="sj-retour">‹ Tous les jeux</button>
    <div class="sj-images">${images.map(u => `<img src="${u}" alt="" loading="lazy">`).join('')}</div>
    <h3 class="sj-nom">${esc(j.nom)}</h3>
    <p class="sj-par">${j.type === 'web' ? 'Jeu web' : 'Jeu mobile'}${j.createurs ? ` · par ${esc(j.createurs)}` : ''}</p>
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
