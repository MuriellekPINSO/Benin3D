import { $ } from './base.js';
// ---------- Chargement ----------
export const loadTxt = $('#loadTxt'), loadBar = $('#loadBar');
export const status = (t, p) => { loadTxt.textContent = t; if (p != null) loadBar.style.width = p + '%'; };
export const frame = () => new Promise(r => requestAnimationFrame(() => r()));
// Données de la ville : JSON gzippé produit par `npm run donnees`. Certains hébergeurs
// le décompressent déjà en route ; on ne décompresse que si l'en-tête gzip est là.
export async function decode() {
  const res = await fetch(import.meta.env.BASE_URL + 'donnees/cotonou.json.gz');
  if (!res.ok) throw new Error(`Données introuvables (${res.status}). Lancez « npm run donnees ».`);
  const buf = new Uint8Array(await res.arrayBuffer());
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
