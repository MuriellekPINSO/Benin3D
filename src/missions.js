import { $ } from './base.js';
import { son } from './audio.js';
import { JEU, fmtF, sauver, remplirLignes } from './jeu.js';
import { souvenirsHTML } from './artisans.js';

// ---------- Missions, cagnotte, série de jours et garage (à la manière de Danfo Run) ----------
// Trois missions à la fois ; chacune rapporte une prime versée dans la cagnotte, qui sert
// au garage (klaxons, casque neuf, super saut). La recette de chaque course y va aussi.

const CATALOGUE = {
  klaxons: { txt: n => `Klaxonne ${n} piétons ou chèvres pour qu’ils dégagent`, n: [5, 8, 12, 16], cumul: true, prime: 250 },
  frolements: { txt: n => `Fais ${n} frôlements dans une même course`, n: [4, 6, 9, 12], prime: 300 },
  pieces: { txt: n => `Ramasse ${n} pièces dans une même course`, n: [20, 35, 50, 70], prime: 250 },
  negos: { txt: n => `Négocie ${n} courses au juste prix ou plus`, n: [3, 5, 8, 12], cumul: true, prime: 300 },
  ravis: { txt: n => `Dépose ${n} clients de bonne humeur`, n: [2, 4, 6, 9], cumul: true, prime: 350 },
  egungun: { txt: n => `Freine devant ${n} sortie${n > 1 ? 's' : ''} d’Egungun`, n: [1, 2, 3, 5], cumul: true, prime: 300 },
  quartiers: { txt: n => `Réponds juste ${n} fois à « On est où là ? »`, n: [2, 3, 5, 8], cumul: true, prime: 300 },
  lignes: { txt: n => `Termine ${n} ligne${n > 1 ? 's' : ''} sans perdre de vie`, n: [1, 2, 3, 5], cumul: true, prime: 400 },
  cotisation: { txt: () => 'Paie ta cotisation au collecteur du syndicat', n: [1, 1, 1, 1], cumul: true, prime: 150 },
  essence: { txt: n => `Fais le plein ${n} fois (station ou kpayo)`, n: [1, 2, 4, 6], cumul: true, prime: 200 },
};
export const KLAXONS = {
  classique: { nom: 'Klaxon d’origine', prix: 0 },
  trompette: { nom: 'Trompette à deux tons', prix: 1500 },
  sifflet: { nom: 'Sifflet de l’apprenti', prix: 3000 },
  tamtam: { nom: 'Tam-tam parleur', prix: 5000 },
};
export const BONUS = {
  casque: { nom: 'Casque neuf', txt: 'encaisse un accident pendant la prochaine course', prix: 800 },
  saut: { nom: 'Super saut', txt: 'sauts plus hauts pendant la prochaine course', prix: 600 },
};
export const progDefaut = () => ({ missions: [], niveaux: {}, cagnotte: 0, klaxon: 'classique', achetes: ['classique'], serie: { jour: '', n: 0 }, dette: 0, bonus: { casque: 0, saut: 0 } });

function tirer(p, exclus) {
  const ids = Object.keys(CATALOGUE).filter(id => !exclus.includes(id)), id = ids[Math.floor(Math.random() * ids.length)];
  return { id, n: CATALOGUE[id].n[Math.min(p.niveaux[id] ?? 0, 3)], fait: 0 };
}
/** Retire les missions accomplies et complète à trois. */
export function assurerMissions() {
  const p = JEU.prog; p.missions = p.missions.filter(m => m.fait < m.n);
  while (p.missions.length < 3) p.missions.push(tirer(p, p.missions.map(m => m.id)));
}
/** Avance une mission : `valeur` s'ajoute (missions cumulées) ou sert de record de la course. */
export function progres(id, valeur = 1) {
  const p = JEU.prog; if (!p) return;
  for (const m of p.missions) {
    if (m.id !== id || m.fait >= m.n) continue;
    const C = CATALOGUE[id];
    m.fait = C.cumul ? m.fait + valeur : Math.max(m.fait, valeur);
    if (m.fait >= m.n) { m.fait = m.n; p.cagnotte += C.prime; p.niveaux[id] = (p.niveaux[id] ?? 0) + 1; annonce(`Mission accomplie · +${fmtF(C.prime)}`, C.txt(m.n)); son('arret'); }
    sauver();
  }
}
let annonceT = 0;
function annonce(titre, sous) {
  const el = $('#jhMission'); if (!el) return;
  el.querySelector('b').textContent = titre; el.querySelector('small').textContent = sous;
  el.classList.add('on'); clearTimeout(annonceT); annonceT = setTimeout(() => el.classList.remove('on'), 3200);
}
/** Série de jours de jeu : un bonus dans la cagnotte au premier départ de la journée. */
export function serieDuJour() {
  const p = JEU.prog, auj = new Date().toISOString().slice(0, 10), hier = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  if (p.serie.jour === auj) return;
  p.serie.n = p.serie.jour === hier ? p.serie.n + 1 : 1; p.serie.jour = auj;
  const b = 50 * Math.min(10, p.serie.n); p.cagnotte += b; sauver();
  setTimeout(() => annonce(`Série : ${p.serie.n} jour${p.serie.n > 1 ? 's' : ''} de suite`, `Bonus du jour : +${fmtF(b)} dans la cagnotte`), 2600);
}

// Taxi à débloquer : prix d'exemple donné par le cahier des charges (5 F), montant final à définir.
export const PRIX_VOITURE = 5;
// ---------- Menu : cagnotte, missions, garage ----------
export function rendreProgression() {
  const el = $('#jmProg'); if (!el) return;
  assurerMissions();
  const p = JEU.prog;
  el.innerHTML = `
    <div class="jp-tete"><div><small>Cagnotte</small><b>${fmtF(p.cagnotte)}</b></div><div><small>Série</small><b>${p.serie.n || 0} j</b></div><div><small>Dette au syndicat</small><b>${p.dette ? fmtF(p.dette) : '—'}</b></div></div>
    <div class="jp-missions">${p.missions.map(m => `<div class="jp-m"><span>${CATALOGUE[m.id].txt(m.n)}</span><i style="--p:${(m.fait / m.n * 100).toFixed(0)}%"></i><small>${m.fait}/${m.n} · +${fmtF(CATALOGUE[m.id].prime)}</small></div>`).join('')}</div>
    ${souvenirsHTML()}
    <details class="jp-garage"><summary>Garage</summary>
      <div class="jp-g">${Object.entries(KLAXONS).map(([k, K]) => {
        const a = p.achetes.includes(k), actif = p.klaxon === k;
        return `<button type="button" data-k="${k}" class="${actif ? 'actif' : ''}" ${!a && p.cagnotte < K.prix ? 'disabled' : ''}><b>${K.nom}</b><small>${actif ? 'Monté sur ton zém' : a ? 'Choisir' : fmtF(K.prix)}</small></button>`;
      }).join('')}
      ${Object.entries(BONUS).map(([k, B]) => `<button type="button" data-b="${k}" ${p.cagnotte < B.prix ? 'disabled' : ''}><b>${B.nom}${p.bonus[k] ? ` · ${p.bonus[k]} en réserve` : ''}</b><small>${B.txt} · ${fmtF(B.prix)}</small></button>`).join('')}</div>
      <button type="button" data-v="voiture" class="${p.voiture ? 'actif' : ''}" ${!p.voiture && p.cagnotte < PRIX_VOITURE ? 'disabled' : ''}><b>Taxi (voiture)</b><small>${p.voiture ? (p.vehicule === 'voiture' ? 'Choisi pour les lignes de zém · retour au zém' : 'Débloqué · le choisir') : `Débloquer · ${fmtF(PRIX_VOITURE)}`}</small></button>
    </details>`;
  el.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k, K = KLAXONS[k];
    if (!p.achetes.includes(k)) { if (p.cagnotte < K.prix) return; p.cagnotte -= K.prix; p.achetes.push(k); }
    p.klaxon = k; sauver(); son('klaxon', k); rendreProgression(); el.querySelector('details').open = true;
  }));
  el.querySelector('[data-v]')?.addEventListener('click', () => {
    if (!p.voiture) { if (p.cagnotte < PRIX_VOITURE) return; p.cagnotte -= PRIX_VOITURE; p.voiture = true; p.vehicule = 'voiture'; son('piece'); }
    else p.vehicule = p.vehicule === 'voiture' ? 'zem' : 'voiture';
    sauver(); rendreProgression(); remplirLignes(); el.querySelector('details').open = true;
  });
  el.querySelectorAll('[data-b]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.b; if (p.cagnotte < BONUS[k].prix) return;
    p.cagnotte -= BONUS[k].prix; p.bonus[k]++; sauver(); son('piece'); rendreProgression(); el.querySelector('details').open = true;
  }));
}
