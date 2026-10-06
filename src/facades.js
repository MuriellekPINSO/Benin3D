import * as THREE from 'three';

// Atlas de façades de Cotonou, d'après les vues Street View (2026) : rez-de-chaussée
// à portes de garage en tôle, rideaux métalliques de boutique, portes et fenêtres à
// barreaux ; étages à persiennes en bois brun, vitres teintées vertes, balcons à
// balustres, loggias, climatiseurs. Chaque case fait 3,3 m de large sur 3,15 m de
// haut (un niveau) ; l'alpha vaut 0 là où la peinture du mur doit apparaître.
//
// Grille 8 × 4 : ligne 0 = rez-de-chaussée, lignes 1 et 2 = étages (deux styles),
// ligne 3 = étage inachevé (poteaux nus, fers à béton).

export const ATLAS = { cols: 8, lignes: 4, case: 256 };
let tex = null;

export function texFacades(anisotropie = 8) {
  if (tex) return tex;
  const C = ATLAS.case, cv = document.createElement('canvas');
  cv.width = C * ATLAS.cols; cv.height = C * ATLAS.lignes;
  const c = cv.getContext('2d');
  let s = 12345; const r = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const bruit = (x, y, w, h, n, cols, a = .25) => { for (let i = 0; i < n; i++) { c.globalAlpha = a * r(); c.fillStyle = cols[i % cols.length]; c.fillRect(x + r() * w, y + r() * h, 2, 2); } c.globalAlpha = 1; };
  const rect = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const cadre = (x, y, w, h, col, e = 6) => { rect(x, y, w, e, col); rect(x, y + h - e, w, e, col); rect(x, y, e, h, col); rect(x + w - e, y, e, h, col); };
  const tole = (x, y, w, h, col, pas = 8) => { rect(x, y, w, h, col); for (let i = 0; i < w; i += pas) { c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x + i, y, 2, h); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x + i + 3, y, 1, h); } };
  const rideau = (x, y, w, h, col) => { rect(x, y, w, h, col); for (let j = 0; j < h; j += 6) { c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(x, y + j, w, 1.5); c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(x, y + j + 2, w, 1); } rect(x - 4, y - 10, w + 8, 10, '#5d6063'); };
  const persienne = (x, y, w, h, col) => { rect(x, y, w, h, col); for (let j = 4; j < h; j += 7) { c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x + 3, y + j, w - 6, 2); } cadre(x, y, w, h, '#3d2a1c', 4); rect(x + w / 2 - 1, y, 2, h, '#3d2a1c'); };
  const vitre = (x, y, w, h, col) => { const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, col); g.addColorStop(.6, '#1e2c2e'); g.addColorStop(1, col); c.fillStyle = g; c.fillRect(x, y, w, h); c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.moveTo(x + w * .15, y + h); c.lineTo(x + w * .45, y); c.lineTo(x + w * .6, y); c.lineTo(x + w * .3, y + h); c.fill(); cadre(x, y, w, h, '#d9d6cf', 5); rect(x + w / 2 - 2, y, 4, h, '#d9d6cf'); };
  const barreaux = (x, y, w, h, col = '#2b2b2b') => { for (let i = 6; i < w; i += 11) rect(x + i, y, 3, h, col); for (const k of [.33, .66]) rect(x, y + h * k, w, 3, col); };
  const balustrade = (x, y, w, h, col = '#ece9e2') => { rect(x, y, w, 8, col); rect(x, y + h - 6, w, 6, col); for (let i = 4; i < w - 6; i += 13) { c.fillStyle = col; c.beginPath(); c.ellipse(x + i + 4, y + h / 2 + 2, 4, h / 2 - 7, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(x + i + 6, y + 9, 2, h - 15); } };
  const ombre = (x, y, w, h, a = .35) => { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x, y, w, h); };
  const salete = (x, y) => { const g = c.createLinearGradient(0, y + C * .78, 0, y + C); g.addColorStop(0, 'rgba(110,70,40,0)'); g.addColorStop(1, 'rgba(110,70,40,.45)'); c.fillStyle = g; c.fillRect(x, y + C * .78, C, C * .22); };
  const enseignes = ['ALIMENTATION', 'COUTURE', 'QUINCAILLERIE', 'BOUTIQUE', 'PHONE SHOP', 'COIFFURE', 'MAQUIS', 'PRESSING', 'ÉLECTRICITÉ', 'MERCERIE', 'PHOTOCOPIE', 'FRIPERIE'];
  const fonds = ['#f2c21b', '#1e40af', '#c8382f', '#15803d', '#f4f1ea', '#7c2d12'];
  // Chaque case : x0, y0 = coin haut gauche ; la ligne 0 du dessin est en HAUT du canevas,
  // mais le shader lit la ligne 0 en bas (texture retournée) : on dessine donc en conséquence.
  const caseXY = (col, ligne) => [col * C, (ATLAS.lignes - 1 - ligne) * C];
  // --- Ligne 0 : rez-de-chaussée ---
  const rdc = [
    (x, y) => { tole(x + 18, y + 70, C - 36, C - 76, '#8f9599'); ombre(x + 18, y + 70, C - 36, 18); },                                   // porte de garage en tôle grise
    (x, y) => { tole(x + 22, y + 74, (C - 44) / 2 - 2, C - 80, '#2f5f86', 7); tole(x + C / 2 + 2, y + 74, (C - 44) / 2 - 2, C - 80, '#2f5f86', 7); ombre(x + 22, y + 74, C - 44, 16); }, // portail bleu à deux battants
    (x, y) => { rideau(x + 24, y + 96, C - 48, C - 100, '#9aa0a3'); const t = enseignes[Math.floor(r() * enseignes.length)], f = fonds[Math.floor(r() * fonds.length)]; rect(x + 8, y + 30, C - 16, 46, f); c.fillStyle = f === '#f4f1ea' || f === '#f2c21b' ? '#1d1a16' : '#ffffff'; c.font = '900 26px Impact, "Arial Black", sans-serif'; c.textAlign = 'center'; c.fillText(t, x + C / 2, y + 63, C - 30); }, // boutique à rideau métallique + enseigne
    (x, y) => { rect(x + 30, y + 80, 70, C - 86, '#5a3a24'); cadre(x + 30, y + 80, 70, C - 86, '#2b2016', 5); vitre(x + 130, y + 96, 90, 92, '#4d6b5e'); barreaux(x + 130, y + 96, 90, 92); },          // porte bois + fenêtre à barreaux
    (x, y) => { rect(x + 14, y + 70, C - 28, C - 74, '#2a2622'); bruit(x + 20, y + 120, C - 40, C - 130, 400, ['#c8382f', '#f2c21b', '#2f6fb0', '#e9e6dc', '#2f8a4a'], .9); rect(x + 6, y + 56, C - 12, 14, '#e6e2da'); }, // boutique ouverte avec marchandises
    (x, y) => { c.fillStyle = '#2b2622'; c.beginPath(); c.moveTo(x + 40, y + C); c.lineTo(x + 40, y + 120); c.arc(x + C / 2, y + 120, C / 2 - 40, Math.PI, 0); c.lineTo(x + C - 40, y + C); c.fill(); },               // arcade
    (x, y) => { tole(x + 26, y + 80, C - 52, C - 86, '#e6e4de', 10); ombre(x + 26, y + 80, C - 52, 14, .25); },                     // porte de garage blanche
    (x, y) => { vitre(x + 30, y + 80, C - 60, C - 120, '#56707a'); barreaux(x + 30, y + 80, C - 60, C - 120, '#1f1f1f'); },      // grande baie à grille
  ];
  // --- Lignes 1 et 2 : étages ---
  const etage = [
    (x, y) => { persienne(x + 36, y + 56, 76, 120, '#8a5a32'); persienne(x + 144, y + 56, 76, 120, '#8a5a32'); },                     // deux fenêtres à persiennes brunes
    (x, y) => { vitre(x + 40, y + 56, C - 80, 120, '#3f8f5a'); },                                                                  // vitre teintée verte
    (x, y) => { rect(x + 50, y + 40, C - 100, 196, '#3c3a36'); vitre(x + 60, y + 50, C - 120, 176, '#4f6670'); balustrade(x + 14, y + 168, C - 28, 70); ombre(x + 14, y + 40, C - 28, 20); }, // balcon à balustres
    (x, y) => { vitre(x + 48, y + 60, C - 96, 116, '#5a6f74'); barreaux(x + 48, y + 60, C - 96, 116, '#e8e6e0'); },               // fenêtre à grille blanche
    (x, y) => { rect(x + 20, y + 30, C - 40, 210, '#33302c'); ombre(x + 20, y + 30, C - 40, 60, .5); balustrade(x + 20, y + 170, C - 40, 70, '#e3ddd2'); }, // loggia
    (x, y) => { persienne(x + 40, y + 70, 80, 100, '#4a6b4c'); rect(x + 150, y + 80, 64, 46, '#e8e8e4'); cadre(x + 150, y + 80, 64, 46, '#9a9a96', 3); c.fillStyle = '#6a6a66'; c.beginPath(); c.arc(x + 182, y + 103, 15, 0, 7); c.fill(); }, // persienne verte + climatiseur
    (x, y) => { vitre(x + 22, y + 40, C - 44, 160, '#35464d'); rect(x + 14, y + 196, C - 28, 6, '#9aa0a3'); for (let i = 18; i < C - 18; i += 26) rect(x + i, y + 170, 3, 30, '#9aa0a3'); rect(x + 14, y + 168, C - 28, 4, '#9aa0a3'); }, // baie vitrée + garde-corps inox
    (x, y) => { persienne(x + 90, y + 70, 76, 110, '#7a4a28'); },                                                                  // une seule fenêtre
  ];
  const etage2 = [
    (x, y) => { c.fillStyle = '#3a3733'; c.beginPath(); c.moveTo(x + 60, y + 190); c.lineTo(x + 60, y + 100); c.arc(x + C / 2, y + 100, C / 2 - 60, Math.PI, 0); c.lineTo(x + C - 60, y + 190); c.fill(); vitre(x + 72, y + 104, C - 144, 82, '#4b6a6f'); }, // fenêtre en arc
    (x, y) => { persienne(x + 40, y + 50, C - 80, 140, '#6b3f22'); },
    (x, y) => { rect(x + 30, y + 30, C - 60, 206, '#3a3733'); vitre(x + 40, y + 40, C - 80, 140, '#41575d'); balustrade(x + 8, y + 172, C - 16, 66, '#f1eee8'); },
    (x, y) => { vitre(x + 40, y + 60, 80, 110, '#3f8f5a'); vitre(x + 140, y + 60, 80, 110, '#3f8f5a'); },
    (x, y) => { persienne(x + 50, y + 60, 70, 120, '#5b4632'); persienne(x + 136, y + 60, 70, 120, '#5b4632'); balustrade(x + 30, y + 170, C - 60, 60, '#efebe3'); },
    (x, y) => { vitre(x + 30, y + 50, C - 60, 130, '#2f3d44'); },
    (x, y) => { persienne(x + 70, y + 60, 116, 120, '#9a6a3a'); },
    (x, y) => { rect(x + 30, y + 40, C - 60, 200, '#2f2c28'); balustrade(x + 30, y + 176, C - 60, 64, '#f2efe8'); },
  ];
  const inacheve = (x, y) => { rect(x, y, C, C, 'rgba(0,0,0,0)'); rect(x + 6, y, 26, C, '#9d9a92'); rect(x + C - 32, y, 26, C, '#9d9a92'); rect(x, y + C - 22, C, 22, '#a7a39a'); for (let i = 0; i < 6; i++) rect(x + 10 + i * 3, y, 1.5, 30, '#6b4a32'); for (let i = 0; i < 6; i++) rect(x + C - 28 + i * 3, y, 1.5, 30, '#6b4a32'); bruit(x + 32, y, C - 64, C, 200, ['#c9c4b8', '#aaa59a'], .6); c.globalAlpha = .55; rect(x + 32, y + 120, C - 64, C - 142, '#b5b0a5'); for (let j = 0; j < 5; j++) for (let k = 0; k < 4; k++) cadre(x + 34 + k * 48, y + 124 + j * 22, 46, 20, '#8f8b82', 2); c.globalAlpha = 1; };
  rdc.forEach((f, i) => { const [x, y] = caseXY(i, 0); f(x, y); salete(x, y); });
  etage.forEach((f, i) => { const [x, y] = caseXY(i, 1); f(x, y); });
  etage2.forEach((f, i) => { const [x, y] = caseXY(i, 2); f(x, y); });
  for (let i = 0; i < 8; i++) { const [x, y] = caseXY(i, 3); inacheve(x, y); }
  tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = anisotropie;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
