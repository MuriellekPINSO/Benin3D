// Les stickers de la discussion (salon.js) : un gros dessin et trois mots d'ici, comme sur WhatsApp. Un sticker part
// comme un message ordinaire, avec en plus son identifiant (`st`) : un joueur qui n'a pas encore rechargé la page lit
// le texte (« 😂 Ehéé ! »), les autres voient le sticker, dans le fil et en bulle au-dessus de la tête.
export const STICKERS = [
  { id: 'arrivee', e: '👋', t: 'Bonne arrivée !', c: '#1a7d52' },
  { id: 'ehe', e: '😂', t: 'Ehéé !', c: '#e8a400' },
  { id: 'akpe', e: '🙏', t: 'Akpé !', c: '#6c4bb4' },
  { id: 'chaud', e: '🔥', t: 'C’est chaud !', c: '#d4421e' },
  { id: 'ambiance', e: '💃', t: 'Ambiance !', c: '#c2185b' },
  { id: 'zem', e: '🛵', t: 'Zém !', c: '#c99a00' },
  { id: 'manger', e: '🍛', t: 'On mange quoi ?', c: '#b5651d' },
  { id: 'ensemble', e: '🤝', t: 'On est ensemble !', c: '#0f6e8c' },
  { id: 'arrive', e: '🏃', t: 'J’arrive !', c: '#2e7d32' },
  { id: 'hum', e: '🤔', t: 'Hum…', c: '#5d6470' },
  { id: 'tchip', e: '😒', t: 'Tchuiiip !', c: '#8d3b2f' },
  { id: 'bravo', e: '🎉', t: 'Bravo !', c: '#d81b60' },
  { id: 'coeur', e: '❤️', t: 'Mon cœur !', c: '#c62828' },
  { id: 'dodo', e: '😴', t: 'Je vais dormir', c: '#3949ab' },
  { id: 'aller', e: '💪', t: 'Ça va aller !', c: '#00897b' },
];
const PAR_ID = new Map(STICKERS.map(s => [s.id, s]));
export const stickerDe = id => PAR_ID.get(String(id || '')) || null;
/** Le texte qui accompagne le sticker : ce que lisent les joueurs restés sur l'ancienne page. */
export const texteSticker = s => `${s.e} ${s.t}`;

/** Le sticker dans le fil de discussion (et dans le tiroir où on le choisit). */
export function elementSticker(s) {
  const el = document.createElement('span'); el.className = 'sticker'; el.style.setProperty('--st', s.c);
  const e = document.createElement('i'); e.textContent = s.e; e.setAttribute('aria-hidden', 'true');
  const t = document.createElement('b'); t.textContent = s.t;
  el.append(e, t); return el;
}

/** Le sticker dessiné pour la bulle au-dessus de la tête : découpé dans du blanc, légèrement penché. */
export function toileSticker(s) {
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 300; const c = cv.getContext('2d');
  c.translate(160, 150); c.rotate(-.06);
  c.shadowColor = 'rgba(0, 0, 0, .28)'; c.shadowBlur = 14; c.shadowOffsetY = 5;
  c.fillStyle = '#fff'; c.beginPath(); c.roundRect(-138, -130, 276, 252, 46); c.fill();
  c.shadowColor = 'transparent';
  c.font = '120px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(s.e, 0, -38);
  c.font = '800 34px system-ui, sans-serif'; const w = Math.min(256, c.measureText(s.t).width + 36);
  c.fillStyle = s.c; c.beginPath(); c.roundRect(-w / 2, 52, w, 54, 27); c.fill();
  c.fillStyle = '#fff'; c.fillText(s.t, 0, 80, 236);
  return cv;
}
