// Altitude du sol, en mètres au-dessus du niveau de la mer, pour caler la caméra de
// la vue Google (qui compte les altitudes depuis la mer) sur la maquette (sol à y = 0).
// Source : tuiles « Terrarium » des Terrain Tiles d'AWS (données ouvertes, SRTM et
// autres), zoom 12, soit ~38 m par pixel. On moyenne 3 × 3 pixels pour gommer les
// bâtiments et les arbres que contient le relief satellite.
const Z = 12, N = 2 ** Z, tuiles = new Map();

function charger(x, y) {
  const cle = x + '/' + y;
  if (tuiles.has(cle)) return tuiles.get(cle);
  const t = { h: null };
  tuiles.set(cle, t);
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, 256, 256).data, h = new Float32Array(256 * 256);
    for (let i = 0; i < h.length; i++) h[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
    t.h = h;
  };
  img.onerror = () => { t.h = new Float32Array(256 * 256).fill(5); }; // à défaut : 5 m, l'altitude moyenne de Cotonou
  img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`;
  return t;
}
function pixel(px, py) {
  const x = Math.floor(px / 256), y = Math.floor(py / 256), t = charger(x, y);
  if (!t.h) return null;
  return t.h[(Math.floor(py) - y * 256) * 256 + (Math.floor(px) - x * 256)];
}
/** Altitude (m) du sol en (lat, lon), ou null tant que la tuile n'est pas chargée. */
export function altitudeSol(lat, lon) {
  const px = (lon + 180) / 360 * N * 256, r = lat * Math.PI / 180, py = (1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * N * 256;
  let s = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const h = pixel(px + i, py + j); if (h === null) return null; s += Math.max(0, h); }
  return s / 9;
}
