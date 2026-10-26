import * as THREE from 'three';

// Outils communs : sélecteur, préférences de l'appareil, projection locale, couleurs.
export const $ = s => document.querySelector(s);
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const coarse = matchMedia('(pointer: coarse)').matches;
export const small = matchMedia('(max-width: 720px)').matches;
// Version allégée (moins d'ombres, de détails, de gens) : d'office sur téléphone ; sinon au choix (menu Plus,
// voir leger.js), gardé d'une visite à l'autre : '1' léger, '0' complet.
const choixLeger = (() => { try { return localStorage.getItem('cotonou-leger'); } catch { return null; } })();
// Mode de secours : un iPhone que Safari coupe faute de mémoire recharge la page, échoue encore, et finit sur « Un
// problème récurrent est survenu » — le jeu ne démarre plus du tout (iPhone 13 de testeurs, 25 et 26/10). On repart
// alors en version allégée, avec des textures deux fois plus petites encore (textures.js), une image moins fine
// (scene.js), plutôt que de ne rien afficher. « Mode complet » dans le menu Plus passe outre.
// Un plantage ne laisse aucune trace : la page meurt sans pagehide ni visibilitychange. On note donc « ouverte »
// au démarrage et quand elle redevient visible, « fermée » quand on la quitte ou qu'on change d'appli : trouver
// « ouverte » au démarrage suivant, c'est qu'elle a planté sous les yeux du joueur. Jusqu'au 26/10, seul un
// plantage pendant le chargement comptait ; ceux qui suivaient l'arrivée en ville (modèles détaillés, salon)
// passaient inaperçus, et le jeu replantait en boucle. Une fois déclenché, le secours reste : on peut jouer.
// Fermer la fenêtre de WhatsApp ou de Facebook ne passe pas toujours par pagehide non plus : on ne compte donc que
// la page rouverte moins d'une minute et demie après son dernier signe de vie — le rechargement de Safari après
// un plantage, ou le joueur qui réessaie aussitôt. Rouverte plus tard, c'est une nouvelle visite.
const CLE_SESSION = 'cotonou3d.session', CLE_SECOURS = 'cotonou3d.secours', CLE_VU = 'cotonou3d.vu';
const lireLS = k => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } };
// L'ancien compteur (démarrages d'affilée qui n'arrivaient pas à la ville) : deux, c'était déjà un plantage.
const ancien = +lireLS('cotonou3d.demarrages') || 0; try { localStorage.removeItem('cotonou3d.demarrages'); } catch { /* navigation privée */ }
/** Vrai si la visite d'avant a planté : on le dit sur l'écran de chargement (chargement.js). */
export const VIENT_DE_PLANTER = (lireLS(CLE_SESSION) === 'ouverte' && Date.now() - (+lireLS(CLE_VU) || 0) < 90e3) || ancien >= 2;
if (VIENT_DE_PLANTER && choixLeger !== '0') ecrireLS(CLE_SECOURS, '1');
export const SECOURS = choixLeger !== '0' && lireLS(CLE_SECOURS) === '1';
ecrireLS(CLE_SESSION, 'ouverte');
const signe = () => { if (!document.hidden) ecrireLS(CLE_VU, String(Date.now())); }; signe(); setInterval(signe, 3000); // le dernier signe de vie
addEventListener('pagehide', () => ecrireLS(CLE_SESSION, 'fermee')); // quittée ou rechargée : pas un plantage
document.addEventListener('visibilitychange', () => ecrireLS(CLE_SESSION, document.hidden ? 'fermee' : 'ouverte')); // mise de côté, puis reprise
export const LITE = SECOURS || choixLeger === '1' || (choixLeger !== '0' && (coarse || small));

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

