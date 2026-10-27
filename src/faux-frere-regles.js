// ---------- Le Faux Frère : le déroulé d'une partie, le même pour tous ----------
// Partagé par le jeu (fauxfrere.js) et l'arbitre du serveur (api/faux-frere.js) : chacun refait le même calcul à partir
// de ce que la base contient (les inscrits, l'heure du départ, les indices, les votes, chacun avec l'heure du serveur),
// sans horloge commune ni chef de partie. Ce que le jeu ne sait pas — qui est le faux frère —, seul l'arbitre le sait :
// il le dit vote après vote (`verdicts`), une fois le vote clos.
//
// Une partie : chacun lit son mot (4 s), puis TOURS manches au plus. Une manche : deux passes d'indices, chaque joueur
// encore en jeu à son tour (20 s pour donner un mot, sinon on passe), puis le vote (30 s, ou dès que tout le monde a
// voté). Le plus de voix est éliminé ; à égalité, personne. Les frères gagnent si le faux frère est éliminé ; le faux
// frère gagne s'il reste parmi les trois derniers, ou s'il tient jusqu'à la fin de la dernière manche.

export const MIN_JOUEURS = 4, MAX_JOUEURS = 10, TOURS = 3, PASSES = 2;
export const LECTURE = 4000, INDICE = 20000, VOTE = 30000, PAUSE = 6000, INSCRIPTION = 180000;

/** L'ordre des joueurs : celui de leur arrivée à la table (heure du serveur), puis leur identifiant. */
export const ordreDe = P => Object.entries(P?.joueurs || {}).sort(([a, x], [b, y]) => (x.t - y.t) || (a < b ? -1 : 1)).map(([u]) => u);

/**
 * Où en est la partie `P` (le nœud zem_ff/{partie}) à l'heure `now` (heure du serveur). `verdicts` : { [manche]: bool }
 * (le joueur éliminé à cette manche était-il le faux frère ?), connus du seul arbitre. Renvoie :
 *   { phase: 'inscription' | 'lecture' | 'indice' | 'vote' | 'verdict' | 'resultat' | 'fin', manche, passe, qui, jusqua,
 *     vivants, indices: [{ manche, passe, u, m }], elimines: [{ manche, u }], resultat: { manche, u, faux } | null,
 *     gagnant: 'freres' | 'faux' | null, votants: [u] }
 * 'verdict' : le vote est clos, on attend la réponse de l'arbitre.
 */
export function deroule(P, now, verdicts = {}) {
  const ordre = ordreDe(P);
  const E = { phase: 'inscription', manche: 0, passe: 0, qui: null, jusqua: 0, vivants: ordre, indices: [], elimines: [], resultat: null, gagnant: null, votants: [] };
  if (!P || P.etat === 'inscription' || typeof P.debut !== 'number') return E;
  let t = P.debut + LECTURE, vivants = [...ordre];
  if (now < t) return { ...E, phase: 'lecture', jusqua: t };
  for (let m = 0; m < TOURS; m++) {
    for (let p = 0; p < PASSES; p++) for (const u of vivants) {
      const fin = t + INDICE, i = P.indices?.[m]?.[p]?.[u];
      if (i && typeof i.t === 'number' && i.t <= fin && i.t >= t - 2000) { E.indices.push({ manche: m, passe: p, u, m: String(i.m || '') }); t = Math.max(t, i.t); continue; }
      if (now < fin) return { ...E, phase: 'indice', manche: m, passe: p, qui: u, jusqua: fin, vivants };
      t = fin; // pas d'indice à temps : on passe au suivant
    }
    // Le vote : seuls comptent ceux des joueurs encore en jeu, pour un joueur encore en jeu, arrivés à temps.
    const finVote = t + VOTE, valides = {};
    for (const [u, v] of Object.entries(P.votes?.[m] || {})) if (vivants.includes(u) && vivants.includes(v?.c) && v.c !== u && typeof v.t === 'number' && v.t <= finVote) valides[u] = v;
    const votants = Object.keys(valides), tous = vivants.every(u => valides[u]);
    if (!tous && now < finVote) return { ...E, phase: 'vote', manche: m, jusqua: finVote, vivants, votants };
    const clos = tous ? Math.max(t, ...votants.map(u => valides[u].t)) : finVote;
    const voix = {}; for (const v of Object.values(valides)) voix[v.c] = (voix[v.c] || 0) + 1;
    const max = Math.max(0, ...Object.values(voix)), en_tete = Object.keys(voix).filter(u => voix[u] === max);
    const elimine = max > 0 && en_tete.length === 1 ? en_tete[0] : null;
    let gagnant = null;
    if (elimine) {
      if (!(m in verdicts)) return { ...E, phase: 'verdict', manche: m, vivants, votants };
      E.elimines.push({ manche: m, u: elimine });
      vivants = vivants.filter(u => u !== elimine);
      if (verdicts[m]) gagnant = 'freres'; else if (vivants.length <= 3) gagnant = 'faux';
    }
    if (!gagnant && m === TOURS - 1) gagnant = 'faux';
    const resultat = { manche: m, u: elimine, faux: elimine ? !!verdicts[m] : false, voix };
    t = clos + PAUSE;
    if (gagnant) return { ...E, phase: 'fin', manche: m, vivants, resultat, gagnant, depuis: clos };
    if (now < t) return { ...E, phase: 'resultat', manche: m, jusqua: t, vivants, resultat };
  }
  return { ...E, phase: 'fin', vivants, gagnant: 'faux' };
}

// ---------- Les paires de mots ----------
// Deux mots proches : la plupart des joueurs reçoivent le premier ou le second (tiré au sort), le faux frère l'autre.
export const PAIRES = [
  ['Amiwo', 'Akassa'], ['Gari', 'Tapioca'], ['Zém', 'Taxi'], ['Sodabi', 'Tchoukoutou'], ['Dantokpa', 'Missèbo'],
  ['Pagne', 'Bazin'], ['Agouti', 'Lapin'], ['Igname pilée', 'Pâte rouge'], ['Moyo', 'Piment'], ['Klui-klui', 'Arachide'],
  ['Ablo', 'Beignet'], ['Atassi', 'Riz au gras'], ['Wagashi', 'Fromage'], ['Ganvié', 'Ouidah'], ['Cotonou', 'Porto-Novo'],
  ['Égoungoun', 'Zangbéto'], ['Tam-tam', 'Djembé'], ['Bissap', 'Gingembre'], ['Moto', 'Vélo'], ['Marché', 'Supermarché'],
  ['Mangue', 'Papaye'], ['Ananas', 'Orange'], ['Noix de coco', 'Banane'], ['Pirogue', 'Barque'], ['Lagune', 'Lac'],
  ['Maquis', 'Buvette'], ['Kpayo', 'Essence'], ['Tontine', 'Banque'], ['Bénin', 'Togo'], ['Fon', 'Yoruba'],
  ['Manioc', 'Igname'], ['Poisson braisé', 'Poulet bicyclette'], ['Tchatchanga', 'Soya'], ['Calavi', 'Godomey'], ['Akpan', 'Yaourt'],
  ['Gboma', 'Épinards'], ['Crincrin', 'Gombo'], ['Wassa-wassa', 'Couscous'], ['Kinkéliba', 'Citronnelle'], ['Mobile Money', 'Espèces'],
  ['Hippopotame', 'Éléphant'], ['Tresses', 'Perruque'], ['Taxi-brousse', 'Bus'], ['Lion', 'Panthère'], ['Arachide', 'Noix de cajou'],
  ['Huile rouge', 'Huile d’arachide'], ['Vin de palme', 'Bière'], ['Grand-Popo', 'Ouidah'], ['Fidjrossè', 'Plage'], ['Tokpa-tokpa', 'Minibus'],
];

/** Les mots d'une partie : { mots: { [uid]: mot }, faux: uid }. Tirés d'un HMAC du secret de l'arbitre, de la partie, des
 *  joueurs et de l'heure de départ : sans le secret, personne ne peut les deviner, et l'arbitre les retrouve à chaque appel. */
export async function motsDe(secret, partie, P) {
  const ordre = ordreDe(P), cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(`${partie}|${P.debut}|${ordre.join(',')}`)));
  const n32 = i => ((h[i] << 24) | (h[i + 1] << 16) | (h[i + 2] << 8) | h[i + 3]) >>> 0;
  const paire = PAIRES[n32(0) % PAIRES.length], inverse = h[4] & 1, faux = ordre[n32(8) % ordre.length];
  const [commun, autre] = inverse ? [paire[1], paire[0]] : paire;
  return { mots: Object.fromEntries(ordre.map(u => [u, u === faux ? autre : commun])), faux };
}

/** Un indice valable : un seul mot (lettres, chiffres, trait d'union, apostrophe), et pas le mot secret lui-même. */
const sansAccents = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export function indiceValable(indice, mot) {
  const i = String(indice || '').trim();
  if (!/^[\p{L}\p{N}'’-]{2,20}$/u.test(i)) return 'Un seul mot, sans espace (2 à 20 lettres).';
  const a = sansAccents(i), b = sansAccents(mot).replace(/\s+/g, '');
  if (b && (a === b || a.includes(b) || (b.length >= 4 && b.includes(a)))) return 'Pas ton mot secret ! Donne un autre mot.';
  return '';
}
