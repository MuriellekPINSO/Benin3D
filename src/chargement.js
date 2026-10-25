import { $, SECOURS } from './base.js';
// ---------- Chargement ----------
export const loadTxt = $('#loadTxt'), loadBar = $('#loadBar');
export const status = (t, p) => { loadTxt.textContent = t; if (p != null) loadBar.style.width = p + '%'; };

// Conseils pendant le chargement : sur une connexion lente, la ville met dix à vingt secondes à venir et l'on
// regardait une barre avancer sans rien apprendre (« afficher une barre de progression et des conseils sur
// l'écran de chargement, pour les connexions lentes » — un testeur, 24/10). Ils changent toutes les 4,5 s.
const CONSEILS = [
  'Glisse dans la ville pour tourner la caméra, et marche avec les flèches ou ZQSD.',
  'Le bouton « Aller · gestes » ouvre « Aller à », « Prendre un zém » et la garde-robe.',
  'Un zém coûte 200 F au départ : c’est plus rapide que la marche jusqu’à Fidjrossè.',
  'En ville, tu croises de vrais joueurs. Dis-leur bonjour dans la discussion.',
  'Tu as faim ? Commande au food court de la Cité ministérielle, puis assieds-toi pour manger.',
  '« Travailler », en haut à gauche, te trouve un métier : zémidjan, tokpa-tokpa, vendeuse…',
  'Tu peux prendre l’avion pour Ouidah depuis l’aéroport Cardinal Bernardin Gantin.',
  'La musique et les radios béninoises en direct sont dans le menu Musique.',
];
let conseilT = 0;
export function conseils() {
  const el = document.getElementById('loadConseil'); if (!el || conseilT) return;
  // Mode de secours (base.js) : on le dit, sinon on croirait le jeu moins beau sans savoir pourquoi.
  if (SECOURS) { el.textContent = 'Le jeu n’a pas réussi à démarrer deux fois de suite : il repart en version simplifiée. « Mode complet » dans le menu Plus pour réessayer.'; return; }
  let i = Math.floor(Math.random() * CONSEILS.length);
  const poser = () => { el.textContent = CONSEILS[i % CONSEILS.length]; i++; };
  poser(); conseilT = setInterval(poser, 4500);
}
export function arreterConseils() { clearInterval(conseilT); conseilT = 0; }
export const frame = () => new Promise(r => requestAnimationFrame(() => r()));
// Données de la ville : JSON gzippé produit par `npm run donnees`. Certains hébergeurs
// le décompressent déjà en route ; on ne décompresse que si l'en-tête gzip est là.
// Sur une connexion mobile faible, une requête coupée tuait tout le chargement : on réessaie deux fois.
async function fetchTenace(url, essais = 3) {
  for (let k = 1; ; k++) { try { return await fetch(url); } catch (e) { if (k >= essais) throw e; await new Promise(r => setTimeout(r, 1500 * k)); } }
}
/** `progres(lu, total)` : octets reçus et taille annoncée (0 si le serveur ne la donne pas). */
export async function decode(progres) {
  const res = await fetchTenace(import.meta.env.BASE_URL + 'donnees/cotonou.json.gz');
  if (!res.ok) throw new Error(`Données introuvables (${res.status}). Lancez « npm run donnees ».`);
  // On lit le fichier morceau par morceau pour montrer où en est le téléchargement : sur une 4G lente, ses 2,8 Mo
  // prennent dix à vingt secondes, et un écran figé sur « Décompression » faisait partir les joueurs.
  // Décompressé en route par le serveur (Content-Encoding) : on lit des octets décompressés, la taille annoncée ne s'y compare pas.
  const total = res.headers.get('content-encoding') ? 0 : +(res.headers.get('content-length') || 0);
  let buf;
  if (res.body && progres) {
    const lecteur = res.body.getReader(), morceaux = []; let lu = 0;
    for (;;) { const { done, value } = await lecteur.read(); if (done) break; morceaux.push(value); lu += value.length; progres(lu, total); }
    buf = new Uint8Array(lu); let o = 0; for (const m of morceaux) { buf.set(m, o); o += m.length; }
  } else buf = new Uint8Array(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    if (!('DecompressionStream' in window)) throw new Error('Ce navigateur ne sait pas décompresser les données (DecompressionStream).');
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }
  return JSON.parse(new TextDecoder().decode(buf));
}
/** JSON gzippé (ou déjà décompressé par le serveur, selon l'en-tête Content-Encoding). */
export async function lireJsonGz(url) {
  const res = await fetch(url); if (!res.ok) throw new Error(`${url} : ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  return JSON.parse(new TextDecoder().decode(buf));
}
