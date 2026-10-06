import * as THREE from 'three';

// Outils communs : sélecteur, préférences de l'appareil, projection locale, couleurs.
export const $ = s => document.querySelector(s);
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const coarse = matchMedia('(pointer: coarse)').matches;
export const small = matchMedia('(max-width: 720px)').matches;
export const LITE = coarse || small;

// Projection locale (mètres) autour de 6,37° N / 2,415° E : x vers l'est, z vers le sud
export const LAT0 = 6.37, LON0 = 2.415, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110574;
export const toXZ = (lat, lon) => [(lon - LON0) * KX, (LAT0 - lat) * KZ];
export const toLL = (x, z) => [LAT0 - z / KZ, LON0 + x / KX];
export const dms = (v, pos, neg) => { const s = v >= 0 ? pos : neg; v = Math.abs(v); const d = Math.floor(v), mf = (v - d) * 60, m = Math.floor(mf), sec = Math.round((mf - m) * 60); return `${d}°${String(m).padStart(2, '0')}′${String(sec === 60 ? 59 : sec).padStart(2, '0')}″ ${s}`; };
export const fmtLL = (x, z) => { const [la, lo] = toLL(x, z); return `${dms(la, 'N', 'S')} · ${dms(lo, 'E', 'O')}`; };

export const hash = (i, s = 0) => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(s + 1, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
export const lin = hex => new THREE.Color(hex); // converti en linéaire par three
export const u8c = hex => { const c = lin(hex); return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]; };
export const pal = arr => arr.map(u8c);

