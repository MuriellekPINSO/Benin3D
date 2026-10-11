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
  debrouillard: { nom: 'Débrouillard', argent: 2000, faim: 70, logement: 'chambre', vehicule: '', chance: .7, texte: '2 000 F en poche et une chambre à Akpakpa. À toi de te faire une place à Cotonou !' },
  fils: { nom: 'Fils à papa', argent: 150000, faim: 100, logement: 'appartement', vehicule: 'voiture', chance: .3, texte: 'Un compte bien rempli, un appartement à la Haie Vive et une voiture. Ne dépense pas tout d’un coup !' },
};
export const LOGEMENTS = {
  ami: { nom: 'Chez un ami', loyer: 0 },
  chambre: { nom: 'Chambre à Akpakpa', loyer: 500 },
  appartement: { nom: 'Appartement à la Haie Vive', loyer: 5000 },
  villa: { nom: 'Villa à Fidjrossè', loyer: 20000 },
};
export const LOCATION_MOTO = 1500; // F par jour
const RESERVOIRS = { moto: 3, voiture: 6 }; // litres (échelle du jeu, voir conduite.js)
const JOUR = 864e5, FAIM_PAS = 90, CLE_LOCALE = 'cotonou3d.vie'; // un point de faim en moins toutes les 90 s de jeu
export const VIE = { data: null, local: false, faimT: 0, sauveT: 0, alerte: '' };
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;

// ---------- Stockage ----------
async function lire() {
  if (VIE.local) { try { return JSON.parse(localStorage.getItem(CLE_LOCALE) || 'null'); } catch { return null; } }
  const { d, db } = await firebase(), u = await joueur();
  VIE.ref = d.ref(db, `zem_vies/${u.uid}`);
  return (await d.get(VIE.ref)).val();
}
/** Enregistre des changements ; `argent` : la base exige l'heure du serveur avec chaque gain. */
async function ecrire(patch) {
  Object.assign(VIE.data, patch);
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
/** La vie du joueur : chargée, ou créée (tirage) à la première visite. Paie les loyers en retard. */
export async function assurerVie(local, { nom, modele }) {
  VIE.local = local;
  let v = null;
  try { v = await lire(); }
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
  payerLoyers();
  if (VIE.data.vehicule === 'moto' && VIE.data.vehiculeFin && Date.now() > VIE.data.vehiculeFin) { ecrire({ vehicule: '', carburant: 0, vehiculeFin: 0 }); VIE.alerte ||= 'Ta location de moto est terminée : tu peux en relouer une.'; }
  VIE.faimT = 0; rendreVie();
  return VIE.data;
}

// ---------- Argent, loyer, faim ----------
/** Ajoute de l'argent (métiers, étape 2). La base refuse plus de 5 000 F d'un coup, ou deux gains en moins de 3 s. */
export async function gagner(montant, raison = '') {
  if (!VIE.data || !(montant > 0)) return false;
  const ok = await ecrire({ argent: VIE.data.argent + Math.min(5000, montant) });
  if (ok) annonce(`+${fmt(Math.min(5000, montant))}${raison ? ` · ${raison}` : ''}`);
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
/** À chaque image du salon : la faim baisse en jouant (enregistrée toutes les 30 s). */
export function majVie(dt) {
  const v = VIE.data; if (!v) return;
  VIE.faimT += dt;
  if (VIE.faimT >= FAIM_PAS) {
    VIE.faimT -= FAIM_PAS; v.faim = Math.max(0, v.faim - 1); rendreVie();
    if (Math.round(v.faim) === 20) annonce('Tu as faim : va manger un morceau (food court de la Cité, maquis…).');
    if (v.faim <= 0) annonce('Tu as trop faim : tu marches au ralenti tant que tu n’as pas mangé.');
  }
  VIE.sauveT += dt; if (VIE.sauveT > 30) { VIE.sauveT = 0; sauverVie(); }
}
/** Loue une moto pour 24 h (réservoir plein). */
export async function louerMoto() {
  if (!VIE.data || VIE.data.vehicule) return false;
  if (!(await depenser(LOCATION_MOTO, 'location de moto (24 h)'))) { annonce(`Il te faut ${fmt(LOCATION_MOTO)} pour louer une moto.`); return false; }
  await ecrire({ vehicule: 'moto', carburant: RESERVOIRS.moto, vehiculeFin: Date.now() + JOUR }); rendreVie(); return true;
}
export const reservoir = () => RESERVOIRS[VIE.data?.vehicule] || 0;
/** L'essence consommée en roulant (litres), enregistrée de temps en temps. */
export function consommer(litres) { const v = VIE.data; if (!v || !litres) return; v.carburant = Math.max(0, (v.carburant || 0) - litres); rendreVie(); }
export async function faireLePlein(litres) { const v = VIE.data; v.carburant = Math.min(reservoir(), (v.carburant || 0) + litres); await ecrire({ carburant: Math.round(v.carburant * 100) / 100 }); rendreVie(); }
/** Manger : la faim remonte petit à petit (appelé pendant le repas). */
export function manger(points) { const v = VIE.data; if (!v) return; v.faim = Math.min(100, v.faim + points); rendreVie(); }
/** Ralentissement quand on a trop faim. */
export const vitesseFaim = () => (VIE.data && VIE.data.faim <= 0 ? .5 : 1);
export function sauverVie() { if (VIE.data) ecrire({ faim: Math.round(VIE.data.faim), carburant: Math.round((VIE.data.carburant || 0) * 100) / 100 }); }

// ---------- Affichage ----------
let annonceur = null;
export function surAnnonce(f) { annonceur = f; }
function annonce(t) { if (annonceur) annonceur(t); }
export function alerteDuJour() { const a = VIE.alerte; VIE.alerte = ''; return a; }
export function rendreVie() {
  const el = $('#vieHud'), v = VIE.data; if (!el) return;
  el.hidden = !v; if (!v) return;
  const L = LOGEMENTS[v.logement] || LOGEMENTS.ami, h = Math.max(0, Math.ceil(((v.loyerT || Date.now()) + JOUR - Date.now()) / 36e5));
  $('#vhArgent').textContent = fmt(v.argent);
  $('#vhDepart').textContent = DEPARTS[v.depart]?.nom || '';
  const faim = Math.round(v.faim); $('#vhFaim').style.setProperty('--faim', `${faim}%`); $('#vhFaim').classList.toggle('bas', faim <= 20); $('#vhFaimTxt').textContent = `${faim} %`;
  $('#vhLogement').textContent = L.loyer ? `${L.nom} · loyer ${fmt(L.loyer)} dans ${h} h` : L.nom;
  $('#vhMetier').textContent = v.metier ? v.metier : 'Sans métier pour l’instant';
  $('#vhDette').hidden = !v.dette; $('#vhDette').textContent = v.dette ? `Dette : ${fmt(v.dette)}` : '';
  const R = reservoir(), c = v.carburant || 0;
  $('#vhEssenceLigne').hidden = !R;
  if (R) { $('#vhEssence').style.setProperty('--faim', `${Math.round(c / R * 100)}%`); $('#vhEssence').classList.toggle('bas', c / R <= .2); $('#vhEssenceTxt').textContent = `${c.toFixed(1).replace('.', ',')} L / ${R} L`; }
  $('#vhLouer').hidden = !!v.vehicule; $('#vhLouer').textContent = `Louer une moto · ${fmt(LOCATION_MOTO)} / jour`;
}
