// ---------- L'image du podium du défi de Zém Run (defi.js) ----------
// À 20 h, le podium du jour est figé : chacun peut en tirer une image (nom, avatar, score et pièces des trois premiers),
// que Murielle publie sur TikTok, Instagram et LinkedIn et que les gagnants partagent eux-mêmes. Deux formats :
// « publication » 1080 × 1350 (Instagram, LinkedIn) et « story » 1080 × 1920 (TikTok, statuts WhatsApp).
const POLICE = '"Google Sans", "Plus Jakarta Sans", system-ui, sans-serif';
const VERT = '#1a7d52', VERT_FONCE = '#11593a', JAUNE = '#f5b700', CREME = '#fbf6ea', ENCRE = '#1d1a16';
const nb = n => Math.round(n).toLocaleString('fr-FR');

function chargerImage(src) { return new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }); }
const vignette = av => /^[a-z0-9-]{1,24}$/.test(av || '') ? `${import.meta.env.BASE_URL}modeles/mode/vignettes/${av}.webp` : '';

// Une ligne réduite jusqu'à tenir dans la largeur, puis coupée avec « … » si elle déborde encore.
function ajuster(c, t, max, min = 22) {
  let taille = parseInt(c.font.match(/(\d+)px/)[1], 10);
  while (c.measureText(t).width > max && taille > min) { taille -= 2; c.font = c.font.replace(/\d+px/, `${taille}px`); }
  while (c.measureText(t).width > max && t.length > 2) t = t.slice(0, -2) + '…';
  return t;
}
// Un paragraphe sur plusieurs lignes ; renvoie la hauteur occupée.
function paragraphe(c, t, x, y, max, hl) {
  const mots = t.split(' '), lignes = []; let l = '';
  for (const m of mots) { const essai = l ? `${l} ${m}` : m; if (c.measureText(essai).width > max && l) { lignes.push(l); l = m; } else l = essai; }
  if (l) lignes.push(l);
  lignes.forEach((ln, i) => c.fillText(ln, x, y + i * hl));
  return lignes.length * hl;
}
function piece(c, x, y, r) {
  c.fillStyle = JAUNE; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#c98f00'; c.lineWidth = Math.max(2, r * .18); c.beginPath(); c.arc(x, y, r * .62, 0, Math.PI * 2); c.stroke();
}
// L'avatar : la tenue du joueur dans « Vivre à Cotonou » (cadrée sur le haut du corps), sinon son numéro de zém.
async function avatar(c, g, x, y, r) {
  c.save(); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.closePath();
  c.fillStyle = CREME; c.fill(); c.clip();
  const img = vignette(g.av) ? await chargerImage(vignette(g.av)) : null;
  if (img) { const s = img.width * .56; c.drawImage(img, (img.width - s) / 2, 0, s, s, x - r, y - r, 2 * r, 2 * r); }
  else { // le gilet jaune et son numéro
    c.fillStyle = '#f2c21b'; c.fillRect(x - r, y - r, 2 * r, 2 * r);
    c.fillStyle = '#1d5a2e'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 ${Math.round(r * .24)}px ${POLICE}`; c.fillText('ZÉM', x, y - r * .45);
    c.font = `900 ${Math.round(r * .6)}px ${POLICE}`; c.fillText(ajuster(c, g.z || (g.n || '?').slice(0, 1).toUpperCase(), r * 1.6), x, y + r * .12);
  }
  c.restore();
  c.lineWidth = Math.max(6, r * .07); c.strokeStyle = '#fff'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
}

/**
 * d = { eyebrow, titre, date, mission, gagnants: [{ n, av, z, s, p }] (du 1er au 3e), unite: 'points' }, format 'publication' | 'story'.
 * Rend un PNG (Blob).
 */
export async function dessinerPodium(d, format = 'publication') {
  const W = 1080, H = format === 'story' ? 1920 : 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  try { await Promise.all([document.fonts?.load(`800 60px ${POLICE}`), document.fonts?.load(`600 30px ${POLICE}`)]); } catch { /* police du système */ }
  const story = format === 'story', h0 = story ? 150 : 70; // story : marges du haut et du bas, sous les boutons de TikTok
  // Fond : vert, un grand soleil jaune pâle derrière le podium.
  c.fillStyle = VERT; c.fillRect(0, 0, W, H);
  const halo = c.createRadialGradient(W / 2, H * .62, 40, W / 2, H * .62, W * .7); halo.addColorStop(0, 'rgba(245, 183, 0, .28)'); halo.addColorStop(1, 'rgba(245, 183, 0, 0)');
  c.fillStyle = halo; c.fillRect(0, 0, W, H);
  // En-tête : logo et nom du jeu.
  c.textBaseline = 'middle'; c.textAlign = 'left';
  const logo = await chargerImage(`${import.meta.env.BASE_URL}favicon.svg`);
  if (logo) c.drawImage(logo, 70, h0, 72, 72);
  c.fillStyle = '#fff'; c.font = `800 38px ${POLICE}`; c.fillText('Kutɔnu Vibes', 160, h0 + 24);
  c.fillStyle = 'rgba(255, 255, 255, .78)'; c.font = `700 22px ${POLICE}`; c.fillText('ZÉM RUN · LE JEU DU QUOTIDIEN', 161, h0 + 56);
  // Le titre et la date.
  let y = h0 + (story ? 210 : 165);
  c.textAlign = 'center'; c.fillStyle = JAUNE; c.font = `800 26px ${POLICE}`; c.fillText(d.eyebrow.toUpperCase(), W / 2, y);
  y += story ? 92 : 78; c.fillStyle = '#fff'; c.font = `800 ${story ? 92 : 80}px ${POLICE}`; c.fillText(ajuster(c, d.titre, W - 120), W / 2, y);
  y += story ? 80 : 66; c.fillStyle = 'rgba(255, 255, 255, .9)'; c.font = `600 36px ${POLICE}`; c.fillText(ajuster(c, d.date, W - 140), W / 2, y);
  // La mission, dans un cartouche crème.
  if (d.mission) {
    y += story ? 70 : 52; c.font = `600 ${story ? 31 : 28}px ${POLICE}`; c.textAlign = 'left';
    const hl = story ? 42 : 38, l = 860, x = (W - l) / 2, essai = document.createElement('canvas').getContext('2d'); essai.font = c.font;
    let n = 1, ln = ''; for (const m of d.mission.split(' ')) { const t = ln ? `${ln} ${m}` : m; if (essai.measureText(t).width > l - 64 && ln) { n++; ln = m; } else ln = t; }
    const h = n * hl + 44;
    c.fillStyle = 'rgba(251, 246, 234, .96)'; c.beginPath(); c.roundRect(x, y, l, h, 26); c.fill();
    c.fillStyle = ENCRE; paragraphe(c, d.mission, x + 32, y + 22 + hl / 2, l - 64, hl);
    y += h;
  }
  // Le podium : 2e à gauche, 1er au milieu, 3e à droite.
  const hp = story ? 150 : 110, bas = H - (story ? 260 : 150), marches = [{ i: 1, x: W / 2 - 340, h: story ? 230 : 140 }, { i: 0, x: W / 2, h: story ? 310 : 200 }, { i: 2, x: W / 2 + 340, h: story ? 180 : 100 }];
  const largeur = 316, couleurs = ['#f5b700', '#d9dde1', '#e0a46b'];
  for (const m of marches) {
    const g = d.gagnants[m.i], haut = bas - m.h;
    c.fillStyle = m.i === 0 ? CREME : 'rgba(251, 246, 234, .9)'; c.beginPath(); c.roundRect(m.x - largeur / 2, haut, largeur, H - hp - haut, [22, 22, 0, 0]); c.fill();
    c.fillStyle = VERT; c.font = `900 ${m.i === 0 ? 120 : 96}px ${POLICE}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(m.i + 1), m.x, haut + Math.min(m.h / 2, 90));
    if (!g) continue;
    const r = m.i === 0 ? 112 : 92, cy = haut - (story ? 250 : 190) - r;
    await avatar(c, g, m.x, cy, r);
    c.fillStyle = couleurs[m.i]; c.beginPath(); c.arc(m.x + r * .72, cy - r * .72, 30, 0, Math.PI * 2); c.fill(); // la médaille
    c.fillStyle = ENCRE; c.font = `900 30px ${POLICE}`; c.fillText(String(m.i + 1), m.x + r * .72, cy - r * .72 + 1);
    c.fillStyle = '#fff'; c.font = `800 ${m.i === 0 ? 44 : 38}px ${POLICE}`; c.fillText(ajuster(c, g.n, largeur - 10), m.x, cy + r + 46);
    c.fillStyle = JAUNE; c.font = `800 ${m.i === 0 ? 46 : 40}px ${POLICE}`; c.fillText(`${nb(g.s)} ${d.unite || 'points'}`, m.x, cy + r + 102);
    c.font = `600 28px ${POLICE}`; const tp = `${nb(g.p)} pièce${g.p > 1 ? 's' : ''}`, wp = c.measureText(tp).width;
    piece(c, m.x - wp / 2 - 6, cy + r + 150, 14); c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText(tp, m.x - wp / 2 + 18, cy + r + 151); c.textAlign = 'center';
  }
  // L'invitation.
  c.fillStyle = JAUNE; c.fillRect(0, H - hp, W, hp);
  c.fillStyle = ENCRE; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `800 38px ${POLICE}`; c.fillText(ajuster(c, d.pied || 'Joue au défi du jour sur kotonuvibes.com', W - 100), W / 2, H - hp / 2 - (story ? 22 : 14));
  c.fillStyle = VERT_FONCE; c.font = `700 24px ${POLICE}`; c.fillText('Nouveau podium chaque soir à 20 h', W / 2, H - hp / 2 + (story ? 30 : 24));
  return new Promise(ok => cv.toBlob(ok, 'image/png'));
}

/** Partage l'image (feuille de partage du téléphone), sinon la télécharge. Rend 'partage', 'telecharge' ou 'annule'. */
export async function partagerImage(blob, fichier, texte) {
  const f = new File([blob], fichier, { type: 'image/png' });
  if (navigator.canShare?.({ files: [f] })) {
    try { await navigator.share({ files: [f], text: texte, title: 'Zém Run' }); return 'partage'; } catch (e) { if (e?.name === 'AbortError') return 'annule'; }
  }
  telechargerImage(blob, fichier); return 'telecharge';
}
export function telechargerImage(blob, fichier) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fichier;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
