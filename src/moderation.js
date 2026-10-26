// ---------- Les gros mots, masqués ----------
// Partagé par la discussion de la ville (salon.js) et les noms du défi de Zém Run (defi.js) : un nom du podium part sur
// une image que l'on publie sur TikTok, Instagram et LinkedIn.
const GROS_MOTS = /(^|[^\p{L}])(con(ne|nard|nasse)?s?|sal(ope|aud)s?|putes?|putain|encul[eé]\p{L}*|b[aâ]tard[es]*|fdp|ntm|niqu\p{L}*|tg|pd|merdes?|ta gueule|fils de pute|fuck\p{L}*|bitch\p{L}*|nigg\p{L}*|n[eè]gres?)(?=$|[^\p{L}])/giu;
/** Le texte, gros mots remplacés par des points. */
export const filtrer = t => String(t || '').replace(GROS_MOTS, (m, avant, mot) => avant + '•'.repeat(Math.min(6, mot.length)));
/** Vrai si le texte contient un gros mot. */
export const grossier = t => filtrer(t) !== String(t || '');
