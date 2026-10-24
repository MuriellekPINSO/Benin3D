import { $ } from './base.js';
import { firebase, joueur } from './firebase.js';

// ---------- Ma vie : vivre à Cotonou (étape 1) ----------
// Chaque joueur a une vie : un départ tiré au sort (Débrouillard ou Fils à papa, comme le « Nepo / Lapo »
// de Lagos Life), un portefeuille, la faim, un logement et son loyer de chaque jour. Les métiers (étape 2)
// rempliront le portefeuille, manger (étape 3) remplira la faim.
// Enregistrée dans Firebase (zem_vies/{uid}) : les règles de la base (database.rules.json) refusent qu'on
// se donne de l'argent (gain plafonné, délai minimum entre deux gains). Avec ?salon-local : dans le
// navigateur (mode test, sans serveur).

export const DEPARTS = {
  debrouillard: { nom: 'Débrouillard', argent: 2000, faim: 70, logement: 'chambre', vehicule: '', chance: .7, texte: '2 000 F en poche et une chambre à Akpakpa. À toi de te faire une place à Cotonou !' },
  fils: { nom: 'Fils à papa', argent: 150000, faim: 100, logement: 'appartement', vehicule: 'voiture', chance: .3, texte: 'Un compte bien rempli, un appartement à la Haie Vive et une voiture. Ne dépense pas tout d’un coup !' },
};
export const LOGEMENTS = {
  ami: { nom: 'Chez un ami', loyer: 0 },
  chambre: { nom: 'Chambre à Akpakpa', loyer: 500 },
  appartement: { nom: 'Appartement à la Haie Vive', loyer: 5000 },
  villa: { nom: 'Villa à Fidjrossè', loyer: 20000 },
};
export const LOCATION_MOTO = 1500; // F par jour
// Les loueurs de Cotonou demandent 4 000 F le vélo pour 1 à 2 heures. Dans le jeu c'est 2 000 F : un joueur
// « Débrouillard » commence avec 2 000 F, et à 4 000 F personne ne voyait jamais la boutique ni les balades.
export const LOCATION_VELO = 2000, HEURES_VELO = 2;
const RESERVOIRS = { moto: 3, voiture: 6, taxi: 6, tokpa: 10, velo: 0 }; // litres (échelle du jeu, voir conduite.js) ; le vélo ne boit rien
// Les métiers du transport (étape 2, première vague) : metiers.js. Sans véhicule à soi, on travaille avec celui
// d'un patron, qu'on lui rembourse par un versement en fin de journée (comme les vrais zémidjans).
// nomF : au féminin, quand le personnage est une femme (VIE.femme, tenu à jour par le salon).
export const METIERS = {
  zem: { famille: 'transport', nom: 'Zémidjan', veh: 'moto', propre: 'moto', versement: 1000 },
  taxi: { famille: 'transport', nom: 'Chauffeur de taxi', nomF: 'Chauffeuse de taxi', veh: 'taxi', propre: 'voiture', versement: 3000 },
  chauffeur: { famille: 'transport', nom: 'Chauffeur de tokpa-tokpa', nomF: 'Chauffeuse de tokpa-tokpa', veh: 'tokpa', versement: 3000 },
  apprenti: { famille: 'transport', nom: 'Apprenti de tokpa-tokpa', nomF: 'Apprentie de tokpa-tokpa', veh: '', versement: 0 },
  marche: { famille: 'commerce', nom: 'Vendeur à Dantokpa', nomF: 'Vendeuse à Dantokpa', veh: '', versement: 0 },
  cuisinier: { famille: 'commerce', nom: 'Cuisinier au food court', nomF: 'Cuisinière au food court', veh: '', versement: 0 },
  serveur: { famille: 'commerce', nom: 'Serveur au food court', nomF: 'Serveuse au food court', veh: '', versement: 0 },
  mtn: { famille: 'entreprise', nom: 'Agent MTN', nomF: 'Agente MTN', entreprise: 'MTN', veh: '', versement: 0 },
  moov: { famille: 'entreprise', nom: 'Conseiller Moov', nomF: 'Conseillère Moov', entreprise: 'Moov', veh: '', versement: 0 },
  cite: { famille: 'entreprise', nom: 'Agent à la Cité ministérielle', nomF: 'Agente à la Cité ministérielle', entreprise: 'la Cité', veh: '', versement: 0 },
};
export const nomMetier = M => (VIE.femme && M.nomF) || M.nom;
// La carrière en entreprise : des clients bien servis, et l'on monte jusqu'à DG (salaire par client multiplié).
export const CARRIERE = [[0, 'Agent', 'Agente', 1], [10, 'Superviseur', 'Superviseure', 1.5], [25, 'Chef de service', 'Cheffe de service', 2], [50, 'Directeur', 'Directrice', 3], [90, 'DG', 'DG', 5]];
export const carriere = id => Number(((VIE.data?.carrieres || '').match(new RegExp(`(?:^|;)${id}:(\\d+)`)) || [])[1] || 0);
export const posteDe = n => CARRIERE.reduce((g, c, i) => (n >= c[0] ? i : g), 0);
export const titrePoste = i => (VIE.femme ? CARRIERE[i][2] : CARRIERE[i][1]);
/** Le titre dans une phrase (« tu es cheffe de service », mais « tu es DG »). */
export const titreDans = i => { const t = titrePoste(i); return t === 'DG' ? t : t.toLowerCase(); };
// L'expérience (une course, un arrêt servi) fait monter en grade : 10 % de recette en plus par grade.
export const GRADES = [[0, 'Débutant'], [10, 'Habitué'], [30, 'Confirmé'], [70, 'As de la route']];
export const gradeDe = xp => GRADES.reduce((g, [seuil], i) => (xp >= seuil ? i : g), 0);
const JOUR = 864e5, CLE_LOCALE = 'cotonou3d.vie';
// La faim : un point en moins toutes les 60 s de jeu, puis toutes les 40 s sous 40 (à 90 s, elle ne bougeait presque pas
// en une partie et ne créait aucune envie d'aller manger) : de 100 à 0 en moins d'une heure et demie.
const FAIM_PAS = () => (VIE.data?.faim ?? 100) > 40 ? 60 : 40;
export const VIE = { data: null, local: false, faimT: 0, sauveT: 0, alerte: '', travail: null, mission: '', prochainGain: 0, tArgent: 0 }; // travail : véhicule du patron { type, carburant } (le temps de la partie)
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;

// ---------- Stockage ----------
async function lire() {
  if (VIE.local) { try { return JSON.parse(localStorage.getItem(CLE_LOCALE) || 'null'); } catch { return null; } }
  const { d, db } = await firebase(), u = await joueur();
  VIE.ref = d.ref(db, `zem_vies/${u.uid}`);
  return (await d.get(VIE.ref)).val();
}
/** Enregistre des changements ; `argent` : la base exige l'heure du serveur avec chaque gain. */
export async function ecrire(patch) {
  Object.assign(VIE.data, patch); if ('argent' in patch) VIE.tArgent = Date.now();
  if (VIE.local) { try { localStorage.setItem(CLE_LOCALE, JSON.stringify(VIE.data)); } catch { /* navigation privée */ } return true; }
  const { d } = await firebase();
  const p = { ...patch }; if ('argent' in p) p.t = d.serverTimestamp();
  try { await d.update(VIE.ref, p); return true; } catch (e) { console.warn('vie', e.message); return false; }
}

// ---------- Créer sa vie : le tirage du départ ----------
// Le sort est tiré et enregistré AVANT l'animation : recharger la page pendant qu'elle tourne ne permet pas de retenter sa chance.
function tirage(sort) {
  return new Promise(fin => {
    const el = $('#vieTirage'), cartes = [...el.querySelectorAll('[data-depart]')], txt = $('#vtTexte'), go = $('#vtCommencer');
    el.hidden = false; go.hidden = true; txt.textContent = 'Le destin choisit ton départ…';
    let k = 0, pas = 90, t0 = performance.now();
    const tour = () => { // la lumière passe d'une carte à l'autre, de plus en plus lentement, puis s'arrête
      cartes.forEach((c, i) => c.classList.toggle('choisie', i === k % 2));
      if (performance.now() - t0 < 2400 || cartes[k % 2].dataset.depart !== sort) { k++; pas *= 1.12; setTimeout(tour, pas); return; }
      txt.textContent = DEPARTS[sort].texte; go.hidden = false; go.focus();
      go.onclick = () => { el.hidden = true; fin(); };
    };
    tour();
  });
}
// La première connexion à Firebase prend plusieurs secondes (compte anonyme, puis la base) : elle commence dès
// l'ouverture de la fenêtre du salon, pendant qu'on écrit son nom et qu'on choisit sa tenue.
const AVANCE = { p: null, t: 0, local: false };
const avanceFraiche = local => AVANCE.p && AVANCE.local === local && performance.now() - AVANCE.t < 60000;
export function prechargerVie(local) {
  if (avanceFraiche(local)) return;
  VIE.local = local; AVANCE.local = local; AVANCE.t = performance.now(); AVANCE.p = lire(); AVANCE.p.catch(() => { });
}
/** La vie du joueur : chargée, ou créée (tirage) à la première visite. Paie les loyers en retard. */
export async function assurerVie(local, { nom, modele }) {
  const avance = avanceFraiche(local) ? AVANCE.p : null; AVANCE.p = null;
  VIE.local = local;
  let v = null;
  try { v = await (avance || lire()); }
  catch (e) { // base pas encore prête (règles), ou hors ligne : la vie est gardée dans ce navigateur, le salon reste utilisable
    console.warn('vie', e.message); VIE.local = true; VIE.alerte = 'Ta vie est enregistrée sur cet appareil pour l’instant (serveur indisponible).';
    try { v = await lire(); } catch { v = null; }
  }
  if (!v) {
    const depart = Math.random() < DEPARTS.fils.chance ? 'fils' : 'debrouillard', D = DEPARTS[depart];
    const carburant = RESERVOIRS[D.vehicule] || 0;
    if (VIE.local) v = { nom, modele, depart, argent: D.argent, faim: D.faim, logement: D.logement, vehicule: D.vehicule, carburant, metier: '', grade: 0, xp: 0, dette: 0, loyerT: Date.now(), cree: Date.now(), t: Date.now() };
    else {
      const { d } = await firebase(), maintenant = d.serverTimestamp();
      v = { nom, modele, depart, argent: D.argent, faim: D.faim, logement: D.logement, vehicule: D.vehicule, carburant, metier: '', grade: 0, xp: 0, dette: 0, loyerT: maintenant, cree: maintenant, t: maintenant };
      try { await d.set(VIE.ref, v); v = (await d.get(VIE.ref)).val(); }
      catch (e) { console.warn('vie', e.message); VIE.local = true; v = { ...v, loyerT: Date.now(), cree: Date.now(), t: Date.now() }; } // pas de serveur : dans ce navigateur
    }
    VIE.data = v; if (VIE.local) await ecrire({});
    await tirage(depart);
  } else {
    VIE.data = v;
    if (v.nom !== nom || v.modele !== modele) await ecrire({ nom, modele });
  }
  payerLoyers(); await versementEchu();
  if (VIE.data.vehiculeFin && Date.now() > VIE.data.vehiculeFin && (VIE.data.vehicule === 'moto' || VIE.data.vehicule === 'velo')) {
    const velo = VIE.data.vehicule === 'velo'; ecrire({ vehicule: '', carburant: 0, vehiculeFin: 0 });
    VIE.alerte ||= velo ? 'Ton vélo Caï Caï est rendu : les deux heures sont passées.' : 'Ta location de moto est terminée : tu peux en relouer une.';
  }
  VIE.faimT = 0; rendreVie();
  return VIE.data;
}

// ---------- Argent, loyer, faim ----------
/**
 * Ajoute de l'argent (métiers, commerces). La base refuse plus de 5 000 F d'un coup, ou un gain moins de 3 s après le
 * dernier changement d'argent (gain ou dépense) : les gains attendent leur tour. `source` : 'travail' (métiers),
 * 'commerce' (ventes des commerces), 'prime' (chapitres)… ; `silencieux` : pas de ligne dans le fil du salon.
 */
export async function gagner(montant, raison = '', { source = 'travail', silencieux = false } = {}) {
  if (!VIE.data || !(montant > 0)) return false;
  const quand = Math.max(Date.now(), VIE.prochainGain, VIE.tArgent + 3200);
  VIE.prochainGain = quand + 3200;
  if (quand > Date.now()) await new Promise(r => setTimeout(r, quand - Date.now()));
  if (Date.now() - VIE.tArgent < 3100) await new Promise(r => setTimeout(r, 3200 - (Date.now() - VIE.tArgent))); // une dépense entre-temps
  const m = Math.min(5000, montant), ok = await ecrire({ argent: VIE.data.argent + m });
  if (ok && !silencieux) annonce(`+${fmt(m)}${raison ? ` · ${raison}` : ''}`);
  if (ok) signaler(source, m); // chapitres.js : 'travail', 'commerce'…
  rendreVie(); return ok;
}
/** Dépense de l'argent ; false s'il n'y en a pas assez. */
export async function depenser(montant, raison = '') {
  if (!VIE.data || VIE.data.argent < montant) return false;
  const ok = await ecrire({ argent: VIE.data.argent - montant });
  if (ok && raison) annonce(`−${fmt(montant)} · ${raison}`);
  rendreVie(); return ok;
}
/** Un loyer par jour depuis le dernier payé ; sans argent, il s'ajoute à la dette ; trois jours de dette : on dort chez un ami. */
function payerLoyers() {
  const v = VIE.data, L = LOGEMENTS[v.logement] || LOGEMENTS.ami, jours = Math.floor((Date.now() - (v.loyerT || Date.now())) / JOUR);
  if (jours < 1 || !L.loyer) return;
  let argent = v.argent, dette = v.dette || 0, paye = 0;
  for (let j = 0; j < Math.min(jours, 30); j++) { if (argent >= L.loyer) { argent -= L.loyer; paye += L.loyer; } else dette += L.loyer; }
  const patch = { argent, dette, loyerT: (v.loyerT || Date.now()) + jours * JOUR };
  if (dette >= 3 * L.loyer) { patch.logement = 'ami'; patch.dette = 0; VIE.alerte = `Trois jours de loyer impayés : le propriétaire a repris ton logement (${L.nom}). Tu dors chez un ami en attendant.`; }
  else if (dette) VIE.alerte = `Loyer impayé : tu dois ${fmt(dette)} au propriétaire.`;
  else VIE.alerte = `Loyer payé : −${fmt(paye)}.`;
  ecrire(patch);
}
/** La journée de travail avec le véhicule d'un patron est finie (24 h) : il passe prendre son versement. */
async function versementEchu() {
  const v = VIE.data; if (!(v.versement > 0) || !v.journeeFin || Date.now() < v.journeeFin) return;
  const paye = Math.min(v.argent, v.versement);
  if (paye > 0) await depenser(paye);
  await ecrire({ versement: v.versement - paye, journeeFin: 0 });
  VIE.alerte = v.versement > 0 ? `Ton patron est passé prendre son versement : il te reste ${fmt(v.versement)} à lui rendre.` : `Ton patron est passé prendre son versement : −${fmt(paye)}.`;
}
/** À chaque image du salon : la faim baisse en jouant (enregistrée toutes les 30 s). */
export function majVie(dt) {
  const v = VIE.data; if (!v) return;
  VIE.faimT += dt;
  if (VIE.faimT >= FAIM_PAS()) {
    VIE.faimT -= FAIM_PAS(); v.faim = Math.max(0, v.faim - 1); rendreVie();
    if (Math.round(v.faim) === 40) annonce('Ton ventre gronde : pense à manger bientôt (maquis, food court de la Cité, chez toi).');
    if (Math.round(v.faim) === 20) annonce('Tu as faim : va manger un morceau (food court de la Cité, maquis…).');
    if (v.faim <= 0) annonce('Tu as trop faim : tu marches au ralenti tant que tu n’as pas mangé.');
  }
  VIE.sauveT += dt; if (VIE.sauveT > 30) { VIE.sauveT = 0; sauverVie(); }
}
/** Loue un vélo chez Caï Caï Vélo, pour deux heures. */
export async function louerVelo() {
  if (!VIE.data || VIE.data.vehicule) return false;
  if (!(await depenser(LOCATION_VELO, `location d’un vélo Caï Caï (${HEURES_VELO} h)`))) { annonce(`Il te faut ${fmt(LOCATION_VELO)} pour louer un vélo.`); return false; }
  await ecrire({ vehicule: 'velo', carburant: 0, vehiculeFin: Date.now() + HEURES_VELO * 36e5 }); rendreVie(); return true;
}
/** Rend le véhicule loué avant la fin (vélo rapporté au comptoir) : rien n'est remboursé. */
export async function rendreLocation() { if (!VIE.data?.vehicule) return false; await ecrire({ vehicule: '', carburant: 0, vehiculeFin: 0 }); rendreVie(); return true; }
/** Loue une moto pour 24 h (réservoir plein). */
export async function louerMoto() {
  if (!VIE.data || VIE.data.vehicule) return false;
  if (!(await depenser(LOCATION_MOTO, 'location de moto (24 h)'))) { annonce(`Il te faut ${fmt(LOCATION_MOTO)} pour louer une moto.`); return false; }
  await ecrire({ vehicule: 'moto', carburant: RESERVOIRS.moto, vehiculeFin: Date.now() + JOUR }); rendreVie(); return true;
}
// Le véhicule du patron (VIE.travail) a son propre réservoir : il le confie plein, l'essence ajoutée en route est pour soi.
export const reservoir = () => RESERVOIRS[VIE.travail?.type || VIE.data?.vehicule] || 0;
export const carburant = () => (VIE.travail ? VIE.travail.carburant : VIE.data?.carburant || 0);
/** L'essence consommée en roulant (litres), enregistrée de temps en temps. */
export function consommer(litres) {
  const v = VIE.data; if (!v || !litres) return;
  if (VIE.travail) VIE.travail.carburant = Math.max(0, VIE.travail.carburant - litres); else v.carburant = Math.max(0, (v.carburant || 0) - litres);
  rendreVie();
}
export async function faireLePlein(litres) {
  if (VIE.travail) { VIE.travail.carburant = Math.min(reservoir(), VIE.travail.carburant + litres); signaler('plein'); rendreVie(); return; }
  const v = VIE.data; v.carburant = Math.min(reservoir(), (v.carburant || 0) + litres); await ecrire({ carburant: Math.round(v.carburant * 100) / 100 }); signaler('plein'); rendreVie();
}
/** Manger : la faim remonte petit à petit (appelé pendant le repas). */
export function manger(points) { const v = VIE.data; if (!v) return; v.faim = Math.min(100, v.faim + points); signaler('mange'); rendreVie(); }
/** Ralentissement quand on a trop faim. */
export const vitesseFaim = () => (VIE.data && VIE.data.faim <= 0 ? .5 : 1);
/** Billet d'avion (vol découverte, vol.js) : payé, puis gardé jusqu'à l'embarquement. Le premier vol est offert. */
export async function acheterBillet(vers, prix, nom) {
  if (!VIE.data) return false;
  if (prix > 0 && !(await depenser(prix, `billet d’avion pour ${nom}`))) return false;
  return ecrire({ billet: vers });
}
export const billet = () => VIE.data?.billet || '';
export const premierVol = () => !(VIE.data?.vols > 0);
/** Le billet est composté à la montée dans l'avion. */
export function composterBillet() { if (VIE.data) ecrire({ billet: '', vols: (VIE.data.vols || 0) + 1 }); }
export function sauverVie() { if (VIE.data) ecrire({ faim: Math.round(VIE.data.faim), carburant: Math.round((VIE.data.carburant || 0) * 100) / 100 }); }

// ---------- Ce qui se passe dans la vie du joueur (chapitres.js compte les étapes) ----------
const ecouteurs = [];
export function surSignal(f) { ecouteurs.push(f); }
export function signaler(evt, n = 1) { for (const f of ecouteurs) f(evt, n); }

// ---------- Données en plus : chapitres, commerces ----------
// Gardées dans ce navigateur, et dans Firebase quand les règles de la base les acceptent (champs `chapitres`,
// `commerces` de database.rules.json) : la copie la plus récente l'emporte au chargement.
const cleEnPlus = c => `cotonou3d.${c}${VIE.local ? '.local' : ''}`;
const refuses = new Set();
/** Lit un texte JSON enregistré (`c` : 'chapitres' ou 'commerces'), le plus récent des deux endroits. */
export function lireEnPlus(c) {
  let l = null; try { l = JSON.parse(localStorage.getItem(cleEnPlus(c)) || 'null'); } catch { /* navigation privée */ }
  let f = null; try { f = JSON.parse(VIE.data?.[c] || 'null'); } catch { /* rien */ }
  return !f ? l : !l ? f : (f.maj || 0) >= (l.maj || 0) ? f : l;
}
export function ecrireEnPlus(c, valeur) {
  const t = JSON.stringify({ ...valeur, maj: Date.now() });
  try { localStorage.setItem(cleEnPlus(c), t); } catch { /* navigation privée */ }
  if (VIE.local || refuses.has(c) || !VIE.ref) return;
  firebase().then(({ d }) => d.update(VIE.ref, { [c]: t })).catch(() => refuses.add(c)); // règles pas encore déployées : on n'insiste pas
}

// ---------- Affichage ----------
let annonceur = null;
export function surAnnonce(f) { annonceur = f; }
function annonce(t) { if (annonceur) annonceur(t); }
// « Bonjour de Cotonou » : la première entrée de la journée dans le salon. Une phrase du quartier, la série de jours (comme
// la série de Zém Run et le « day streak » de Danfo Run) et un petit cadeau qui grandit avec elle (100 F par jour, 7 jours
// au plus). Gardé sur l'appareil.
const PHRASES_DU_JOUR = [
  'Dantokpa est plein dès le matin : les commerçantes t’attendent.',
  'Le soleil tape fort sur la Marina : un jus de bissap au maquis ?',
  'On dit que le food court de la Cité a un nouveau plat du jour.',
  'La plage de Fidjrossè sera belle ce soir : passe avec tes amis.',
  'Les zéms de l’Étoile Rouge cherchent du monde pour la journée.',
  'Ton voisin a préparé de l’amiwo : passe le saluer.',
  'Il paraît que l’avion pour Ouidah a encore des places.',
];
export async function bonjourDuJour() {
  const auj = new Date(Date.now() + 36e5).toISOString().slice(0, 10), hier = new Date(Date.now() + 36e5 - JOUR).toISOString().slice(0, 10);
  let s = {}; try { s = JSON.parse(localStorage.getItem('kutonu.salon.serie') || '{}'); } catch { /* navigation privée */ }
  if (s.jour === auj) return null;
  const n = s.jour === hier ? (s.n || 0) + 1 : 1, cadeau = 100 * Math.min(7, n);
  try { localStorage.setItem('kutonu.salon.serie', JSON.stringify({ jour: auj, n })); } catch { /* navigation privée */ }
  await gagner(cadeau, 'cadeau du jour', { source: 'prime', silencieux: true });
  const phrase = PHRASES_DU_JOUR[Math.floor(Date.now() / JOUR) % PHRASES_DU_JOUR.length];
  return `Bonjour de Cotonou ! ${phrase} ${n > 1 ? `${n} jours de suite : cadeau du jour` : 'Cadeau du jour'}, +${fmt(cadeau)}.${n < 7 ? ' Reviens demain, il sera plus gros.' : ''}`;
}
export function alerteDuJour() { const a = VIE.alerte; VIE.alerte = ''; return a; }
export function rendreVie() {
  const el = $('#vieHud'), v = VIE.data; if (!el) return;
  el.hidden = !v; if (!v) return;
  const L = LOGEMENTS[v.logement] || LOGEMENTS.ami, h = Math.max(0, Math.ceil(((v.loyerT || Date.now()) + JOUR - Date.now()) / 36e5));
  $('#vhArgent').textContent = fmt(v.argent);
  $('#vhDepart').textContent = DEPARTS[v.depart]?.nom || '';
  const faim = Math.round(v.faim); $('#vhFaim').style.setProperty('--faim', `${faim}%`); $('#vhFaim').classList.toggle('bas', faim <= 20); $('#vhFaimTxt').textContent = `${faim} %`;
  $('#vhLogement').textContent = L.loyer ? `${L.nom} · loyer ${fmt(L.loyer)} dans ${h} h` : L.nom;
  const M = METIERS[v.metier], g = GRADES[gradeDe(v.xp || 0)][1];
  $('#vhMetier').textContent = !M ? 'Sans métier pour l’instant' : M.famille === 'entreprise' ? `${M.entreprise} · ${titrePoste(posteDe(carriere(v.metier)))} · ${carriere(v.metier)} client${carriere(v.metier) > 1 ? 's' : ''}`
    : M.famille === 'transport' ? `${nomMetier(M)} · ${g}${v.courses ? ` · ${v.courses} ${v.metier === 'zem' || v.metier === 'taxi' ? 'course' : 'arrêt'}${v.courses > 1 ? 's' : ''}` : ''}` : `${nomMetier(M)} · ${g}`;
  $('#vhDette').hidden = !v.dette && !(v.versement > 0);
  $('#vhDette').textContent = [v.dette ? `Dette : ${fmt(v.dette)}` : '', v.versement > 0 ? `Versement au patron : ${fmt(v.versement)}` : ''].filter(Boolean).join(' · ');
  $('#vhMission').hidden = !VIE.mission; $('#vhMission').textContent = VIE.mission;
  $('#vhTravail').textContent = VIE.service ? 'Mon travail' : 'Travailler';
  $('#vhPause').hidden = $('#vhFinir').hidden = !VIE.service; $('#vhPause').textContent = VIE.pause ? 'Reprendre le travail' : 'Pause'; // en service : la pause et la fin de journée en vue
  const R = reservoir(), c = carburant();
  $('#vhEssenceLigne').hidden = !R;
  if (R) { $('#vhEssence').style.setProperty('--faim', `${Math.round(c / R * 100)}%`); $('#vhEssence').classList.toggle('bas', c / R <= .2); $('#vhEssenceTxt').textContent = `${c.toFixed(1).replace('.', ',')} L / ${R} L`; }
  $('#vhLouer').hidden = !!v.vehicule || !!VIE.travail || !!VIE.service; $('#vhLouer').textContent = `Louer une moto · ${fmt(LOCATION_MOTO)} / jour`;
}
