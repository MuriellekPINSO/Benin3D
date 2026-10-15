// ---------- Musique du Bénin : les clips officiels des artistes, dans un petit lecteur YouTube ----------
// Ces chansons sont protégées : on ne peut pas en mettre les fichiers sur le site. Les clips publiés par les artistes
// eux-mêmes sur YouTube peuvent en revanche être lus ailleurs avec le lecteur YouTube, qui doit rester visible pendant
// la lecture (au moins 200 × 200 pixels, règles de YouTube). D'où le petit lecteur en coin, avec « suivante » et
// « arrêter ». Pas de lecteur pendant une course de Zém Run : la musique reprend en revenant.
import { $ } from './base.js';

/** [identifiant YouTube, titre, artiste] : chaînes officielles des artistes (vérifiées le 14 octobre 2026). */
export const CHANSONS = [
  ['dlgESq5FAx4', 'Agolo', 'Angélique Kidjo'],
  ['MyMDHccQhzo', 'Wombo Lombo', 'Angélique Kidjo'],
  ['A-bWhuIFZ3U', 'Batonga', 'Angélique Kidjo'],
  ['uuTLqLzHhAY', 'Malaika', 'Angélique Kidjo et Florent Pagny'],
  ['nmLjz86cTOY', 'Africa, One Of A Kind', 'Angélique Kidjo'],
  ['0h3OP4viDVo', 'Yemonoh', 'Gangbé Brass Band'],
  ['PTbrF6ngwo0', 'Laisse-moi t’aimer', 'Zeynab et Axel Merryl'],
  ['XCmATeUgXug', 'Folies', 'Fanicko'],
  ['prO4vJ5Vcj0', 'Fana Fana', 'Sessimè et Rico Amaj'],
  ['dzwhDF4g8CA', 'Fidé', 'Sessimè'],
  ['QbstAWxoU24', 'Bô Ébi', 'Vano Baby'],
  ['CXBaJrd2U3A', 'Mamacita', 'Dibi Dobo et Mr May D'],
  ['jHUh9uXoBBo', 'Aye', 'Blaaz'],
  ['f-_boJirke8', 'Papa Millions', 'Blaaz'],
];
const L = { api: null, joueur: null, i: -1, pause: false };

function api() {
  L.api ??= new Promise((ok, ko) => {
    if (window.YT?.Player) return ok(window.YT);
    const avant = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { avant?.(); ok(window.YT); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => { L.api = null; ko(new Error('YouTube injoignable')); }; document.head.append(s);
  });
  return L.api;
}
function afficher() {
  const c = CHANSONS[L.i], el = $('#lecteur'); if (!el) return;
  el.hidden = L.i < 0 || L.pause;
  if (c) { el.querySelector('b').textContent = c[1]; el.querySelector('small').textContent = c[2]; }
}
/** Joue la chanson n° i (et enchaîne sur la suivante à la fin) ; renvoie false si YouTube ne répond pas. */
export async function jouerChanson(i) {
  L.i = (i + CHANSONS.length) % CHANSONS.length; L.pause = false; afficher();
  document.dispatchEvent(new CustomEvent('chanson', { detail: CHANSONS[L.i] })); // le bouton Musique affiche le titre
  try {
    const YT = await api(), id = CHANSONS[L.i][0];
    if (L.joueur) L.joueur.loadVideoById(id);
    else L.joueur = new YT.Player('lecteurYT', { width: 200, height: 200, videoId: id, playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
      events: { onReady: e => e.target.playVideo(), onStateChange: e => { if (e.data === YT.PlayerState.ENDED) jouerChanson(L.i + 1); } } });
    return true;
  } catch (e) { console.warn('musique', e.message); arreterChanson(); return false; }
}
export function arreterChanson() { L.joueur?.stopVideo?.(); L.i = -1; afficher(); }
export const chansonActive = () => L.i;
/** Une course de Zém Run : le lecteur se cache (il recouvrirait la conduite), la musique reprend après. */
export function suspendreChanson(oui) {
  if (L.i < 0) return; L.pause = oui;
  if (oui) L.joueur?.pauseVideo?.(); else L.joueur?.playVideo?.();
  afficher();
}
export function initLecteur() {
  $('#lecteurSuivante')?.addEventListener('click', () => jouerChanson(L.i + 1));
  $('#lecteurArreter')?.addEventListener('click', () => { arreterChanson(); document.dispatchEvent(new CustomEvent('musique-arretee')); });
}
