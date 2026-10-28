// ---------- Le Faux Frère : l'arbitre ----------
// La fonction du serveur (api/faux-frere.js) et, en mode test (?salon-local), son imitation dans la page : le même code.
// Tout ce qui touche au contenu du jeu se décide ici, jamais chez un joueur, pas même l'hôte : la paire de mots et son
// sens, les rôles, la composition, l'ordre de parole, les minuteurs, la validation des indices, le dépouillement des
// votes, le mot proposé par l'Ignorant. Les règles elles-mêmes sont dans faux-frere-regles.js.
//
// `base` : la base vue en administrateur, au-dessus des règles — { lire(chemin) → { val, etag }, ecrireSi(chemin, val,
// etag) → vrai si personne n'a écrit entre-temps, supprimer(chemin) }. Trois nœuds par salon :
//   zem_ff2/{partie}          ce que tout le monde lit : pub (écrit ici seulement), joueurs, reglages, ms (chat du salon),
//                             mp (chat de partie) — voir database.rules.json et fauxfrere.js ;
//   zem_ff2_secret/{partie}   la seule vérité, illisible pour les joueurs : la salle et la partie avec ses secrets ;
//   zem_ff2_morts/{partie}    la discussion des éliminés (eux seuls la lisent).
// Chaque demande relit le secret avec son ETag, calcule, et ne l'écrit que si personne ne l'a changé (sinon on recommence) :
// deux demandes en même temps ne comptent qu'une fois. Puis on publie pub, la copie sans les secrets, jamais plus ancienne
// que celle en place (rev). Les minuteurs sont paresseux : une échéance passée s'applique à la demande suivante
// (« avancer », que les joueurs envoient dès qu'ils la voient passée), avec l'heure du serveur.
import { FIN_CHAT, MAX_JOUEURS, MIN_JOUEURS, PARTI, avancer, cleDe, deviner, donnerIndice, hasard, indiceRefuse, nouvellePartie, publique, reparer, retirer, voter } from './faux-frere-regles.js';

export const DEMANDES = ['lancer', 'rejouer', 'mot', 'mots', 'indice', 'voter', 'deviner', 'avancer', 'quitter', 'fermer'];
const attendre = ms => new Promise(r => setTimeout(r, ms));
const refus = (code, erreur) => ({ code, corps: { erreur } });
const nomDe = j => String(j?.n || '').slice(0, 16) || '?';

/** La salle telle que le secret la garde, ou, la première fois, d'après ce que l'hôte a écrit en créant le salon. */
function salleDe(secret, pub) {
  const T = secret && typeof secret === 'object' ? secret : { rev: Number(pub?.rev) || 0, hote: String(pub?.hote || ''), etat: 'salon', n: 0 };
  return { rev: Number(T.rev) || 0, hote: T.hote || '', etat: T.etat === 'jeu' && T.jeu ? 'jeu' : 'salon', n: Number(T.n) || 0, jeu: reparer(T.jeu), recap: T.recap || null, deja: Array.isArray(T.deja) ? T.deja : Object.values(T.deja || {}), finT: Number(T.finT) || 0 };
}
/** Ce que les joueurs lisent (zem_ff2/{partie}/pub). */
const pubDe = T => ({ rev: T.rev, hote: T.hote, etat: T.etat, n: T.n, jeu: publique(T.jeu), recap: T.recap, finT: T.finT });
/** La partie est finie : retour au salon, avec son récapitulatif (les mots, les rôles), jusqu'à la suivante. */
function auSalon(T, t) { T.recap = publique(T.jeu); T.jeu = null; T.etat = 'salon'; T.finT = t; }

/**
 * Une demande d'un joueur `uid` (identité déjà vérifiée) : q = { partie, quoi, ... }. Rend { code, corps }.
 * Options : now (l'horloge du serveur), alea (le tirage), min (joueurs pour lancer : 4, ou 3 en test).
 */
export async function arbitrer(q, uid, base, { now = Date.now, alea = hasard, min = MIN_JOUEURS } = {}) {
  const p = String(q.partie || ''), quoi = String(q.quoi || '');
  if (!/^[a-z0-9]{6,24}$/.test(p) || !DEMANDES.includes(quoi) || !uid) return refus(400, 'demande-invalide');
  for (let essai = 0; essai < 8; essai++) {
    const [Rp, Rs, Rj, Rr] = await Promise.all([base.lire(`zem_ff2/${p}/pub`), base.lire(`zem_ff2_secret/${p}`), base.lire(`zem_ff2/${p}/joueurs`), base.lire(`zem_ff2/${p}/reglages`)]);
    if (!Rp.val) { if (Rs.val) await base.supprimer(`zem_ff2_secret/${p}`); return refus(404, 'salon-introuvable'); }
    const T = salleDe(Rs.val, Rp.val), avant = JSON.stringify(T), E = { retirer: new Set(), viderChat: false, viderMorts: false, fermer: false };
    const r = traiter(T, quoi, q, uid, { joueurs: Rj.val || {}, reglages: Rr.val || {}, t: now(), alea, min, E });
    if (JSON.stringify(T) === avant && !E.fermer) {
      if (E.retirer.size) await Promise.all([...E.retirer].map(u => base.supprimer(`zem_ff2/${p}/joueurs/${u}`)));
      if (T.rev > (Number(Rp.val.rev) || 0)) await publier(base, p, T, Rp); // publié avant une coupure : on recommence
      return quoi === 'avancer' && r.code === 200 ? { code: 200, corps: { ...r.corps, rien: true } } : r;
    }
    T.rev++;
    if (!(await base.ecrireSi(`zem_ff2_secret/${p}`, E.fermer ? null : T, Rs.etag))) { await attendre(15 + alea(60)); continue; } // quelqu'un est passé avant : on relit
    // Ce qui suit la décision : le ménage d'abord (personne ne peut plus écrire dans le chat qu'on vide), puis la publication.
    if (E.fermer) { await Promise.all([base.supprimer(`zem_ff2/${p}`), base.supprimer(`zem_ff2_morts/${p}`)]); return r; }
    await Promise.all([...[...E.retirer].map(u => base.supprimer(`zem_ff2/${p}/joueurs/${u}`)), E.viderChat && base.supprimer(`zem_ff2/${p}/mp`), E.viderMorts && base.supprimer(`zem_ff2_morts/${p}`)].filter(Boolean));
    await publier(base, p, T, Rp);
    return r;
  }
  return refus(409, 'occupe');
}
/** Publie pub, sauf si une version plus récente est déjà en place (deux demandes publient dans le désordre). */
async function publier(base, p, T, R0) {
  const pub = pubDe(T);
  for (let k = 0; k < 6; k++) {
    const R = k ? await base.lire(`zem_ff2/${p}/pub`) : R0;
    if (!R.val || (Number(R.val.rev) || 0) >= pub.rev) return; // salon fermé, ou déjà plus à jour
    if (await base.ecrireSi(`zem_ff2/${p}/pub`, pub, R.etag)) return;
  }
}

/** Le calcul, sans rien lire ni écrire : la salle `T` est modifiée sur place ; `E` dit le ménage à faire. */
function traiter(T, quoi, q, uid, { joueurs, reglages, t, alea, min, E }) {
  const vus = Object.fromEntries(Object.entries(joueurs).map(([u, j]) => [u, Number(j?.vu) || 0]));
  const present = u => t - (vus[u] || 0) <= PARTI;
  const arrivee = Object.entries(joueurs).sort(([a, x], [b, y]) => ((Number(x?.t) || 0) - (Number(y?.t) || 0)) || (a < b ? -1 : 1)).map(([u]) => u);
  const J = T.jeu;
  // 1. Le temps qui passe : les échéances, les absents (au salon comme en partie, partis depuis une minute).
  if (T.etat === 'jeu') {
    avancer(J, t, vus, alea);
    for (const u of J.joueurs) if (J.morts[u] && J.morts[u].c !== 'vote' && joueurs[u]) E.retirer.add(u);
  } else {
    for (const u of arrivee) if (!present(u)) E.retirer.add(u);
    if (T.finT && t - T.finT > FIN_CHAT) { E.viderChat = true; T.finT = 0; } // le chat de la partie finie
  }
  // 2. La demande.
  const r = demande(T, quoi, q, uid, { joueurs, reglages, t, alea, min, E, vus, arrivee, present });
  if (T.jeu && T.jeu.phase === 'fin') auSalon(T, t);
  // 3. L'hôte parti (ou retiré) : le suivant dans l'ordre d'arrivée. Plus personne : on ferme.
  const restent = arrivee.filter(u => present(u) && !E.retirer.has(u));
  if (!restent.length) E.fermer = true;
  else if (!restent.includes(T.hote)) { const i = arrivee.indexOf(T.hote); T.hote = [...arrivee.slice(i + 1), ...arrivee.slice(0, Math.max(0, i))].find(u => restent.includes(u)) || restent[0]; }
  return r;
}
function demande(T, quoi, q, uid, { joueurs, reglages, t, alea, min, E, vus, arrivee, present }) {
  const J = T.jeu, ok = (plus = {}) => ({ code: 200, corps: { ok: true, ...plus } });
  if (quoi === 'avancer') return ok();
  if (quoi === 'lancer' || quoi === 'rejouer') { // « Rejouer » : le même salon, une nouvelle paire, de nouveaux rôles, une nouvelle composition
    if (T.etat !== 'salon') return refus(409, 'deja-en-jeu');
    if (uid !== T.hote) return refus(403, 'pas-l-hote');
    const qui = arrivee.filter(u => present(u) && !E.retirer.has(u)).slice(0, MAX_JOUEURS);
    if (!qui.includes(uid)) return refus(409, 'pas-au-salon');
    if (qui.length < min) return refus(409, 'pas-assez');
    T.n++;
    T.jeu = nouvellePartie({ joueurs: qui, noms: Object.fromEntries(qui.map(u => [u, nomDe(joueurs[u])])), duree: Number(reglages.duree), theme: String(reglages.theme || ''), n: T.n, deja: T.deja }, t, alea);
    T.deja = [...T.deja, cleDe(T.jeu.s.paire)].slice(-15);
    T.etat = 'jeu'; T.recap = null; T.finT = 0; E.viderChat = true; E.viderMorts = true;
    return ok({ n: T.n });
  }
  if (quoi === 'fermer') {
    if (T.etat !== 'salon') return refus(409, 'deja-en-jeu');
    if (uid !== T.hote) return refus(403, 'pas-l-hote');
    E.fermer = true; return ok();
  }
  if (quoi === 'quitter') {
    E.retirer.add(uid);
    if (J && J.joueurs.includes(uid)) { retirer(J, uid, 'parti', t); avancer(J, t, vus, alea); }
    return ok();
  }
  // Le reste se passe pendant une partie, entre ses joueurs.
  if (!J) return refus(409, 'pas-de-partie');
  if (!J.joueurs.includes(uid)) return refus(403, 'pas-a-la-table');
  if (quoi === 'mot') return ok(J.s.roles[uid] === 'ignorant' ? { n: J.n, ignorant: true } : { n: J.n, mot: J.s.mots[uid] }); // jamais son rôle : le faux frère ne sait pas qu'il l'est
  if (quoi === 'mots') return J.morts[uid] ? ok({ n: J.n, mots: J.s.mots }) : refus(403, 'pas-elimine');
  let e = '';
  if (quoi === 'indice') {
    if (J.phase !== 'indice' || J.ordre[J.tour] !== uid) return refus(409, 'pas-ton-tour');
    const m = String(q.m ?? '').trim(), pourquoi = indiceRefuse(m, J.s.roles[uid] === 'ignorant' ? '' : J.s.mots[uid]);
    if (pourquoi) return ok({ refus: pourquoi }); // rien ne change : il peut proposer un autre mot
    e = donnerIndice(J, uid, m, t);
  } else if (quoi === 'voter') e = voter(J, uid, String(q.c ?? ''), t);
  else if (quoi === 'deviner') e = deviner(J, uid, String(q.m ?? ''), t);
  if (e) return refus(409, e);
  avancer(J, t, vus, alea);
  return ok();
}
