import { $ } from './base.js';
import { payerEtRecevoir } from './remise.js';
import { son } from './audio.js';
import { BORD } from './bordure.js';
import { bulle, dialogue, DISC } from './discussions.js';
import { JEU, fmtF, toast } from './jeu.js';
import { progres } from './missions.js';

// ---------- L'essence ----------
// Le réservoir baisse en roulant (1 litre pour 3 km, à l'échelle du jeu). On fait le plein
// en s'arrêtant (frein) devant une station-service (680 F le litre) ou chez un vendeur de
// kpayo au bord de la route (500 F, mais l'essence de contrebande est parfois coupée :
// le moteur tousse). À sec, c'est la panne : on avance au pas jusqu'au prochain vendeur.

export const RESERVOIR = 3, PRIX = { station: 680, kpayo: 500 };
const vivantDe = it => BORD.vivants.find(v => v.s === it.s && v.type === it.type);

/** Réglages de départ d'une course. */
export function essenceDepart(st) { st.essence = 1.2 + Math.random() * .6; st.panne = false; st.toux = 0; st.reserveDite = false; st.plein = -1; }
/** Facteur de vitesse maximale (panne sèche, essence coupée). */
export const facteurEssence = st => (st.panne ? .16 : st.toux > 0 ? .72 : 1);

function payer(st, cout) { // la recette du jour d'abord, puis la cagnotte
  const P = JEU.prog, dispo = Math.max(0, st.argent) + (P?.cagnotte || 0); if (dispo < cout) return false;
  const surRecette = Math.min(Math.max(0, st.argent), cout); st.argent -= surRecette; if (cout > surRecette) P.cagnotte -= cout - surRecette;
  return true;
}
export function servir(st, it) {
  const kpayo = it.type === 'kpayo', prix = PRIX[kpayo ? 'kpayo' : 'station'], v = vivantDe(it);
  const manque = Math.max(0, RESERVOIR - st.essence), plein = Math.round(manque * 10) / 10, cout = Math.ceil(plein * prix / 25) * 25;
  const qui = kpayo ? 'La vendeuse de kpayo' : `Le pompiste${it.nom ? ' · ' + it.nom : ''}`;
  const texte = kpayo ? `« Kpayo ! ${fmtF(prix)} le litre, c’est moins cher qu’à la station ! »` : `« Bonjour zém ! Je te sers combien ? Le litre est à ${fmtF(prix)}. »`;
  if (v) bulle(v.g, kpayo ? 'Kpayo ! Un litre, deux litres ?' : 'Bonjour zém ! On te sert ?', { duree: 2.6 });
  const verser = (l, c) => {
    if (!payer(st, c)) { toast('Pas assez d’argent pour ça', 1.4, 'mal'); if (v) bulle(v.g, 'Il faut payer d’abord hein !'); return; }
    st.essence = Math.min(RESERVOIR, st.essence + l); st.panne = false; st.service = Math.max(st.service, 2.6);
    if (v && JEU.joueur) payerEtRecevoir(JEU.joueur, v.g, 'essence', JEU.joueur, { hautVers: .95, garder: 1.4, verser: true }); // on voit l'essence passer dans le réservoir
    son('piece'); toast(`+${l.toLocaleString('fr-FR')} L d’essence · −${fmtF(c)}`, 1.6, 'bien'); progres('essence', 1);
    if (kpayo && Math.random() < .18) { // essence de contrebande coupée
      st.toux = 25; setTimeout(() => toast('Essence coupée ! Le moteur tousse…', 2, 'mal'), 1300);
      if (DISC.client) bulle(DISC.client.siege, 'Hum… ce kpayo-là n’est pas bon !', { ton: 'fort' });
    } else if (v) bulle(v.g, kpayo ? 'Merci ! Roule bien, mon frère !' : 'Merci, bonne route !');
  };
  dialogue(qui, texte, [
    [`1 litre · ${fmtF(prix)}`, () => verser(1, prix)],
    [`Le plein (${plein.toLocaleString('fr-FR')} L) · ${fmtF(cout)}`, () => verser(plein, cout)],
    ['Rien, merci', () => { if (v) bulle(v.g, kpayo ? 'Une autre fois !' : 'Bonne route !'); }],
  ], { defaut: st.essence < .6 ? 1 : 2, duree: 9, bloquant: true });
}

/** À chaque image pendant la course. */
export function majEssence(st, dt) {
  if (st.essence === undefined) return;
  if (st.toux > 0) st.toux -= dt;
  if (!st.panne) {
    st.essence -= st.v * dt / 3000 * (JEU.veh === 'tokpa' ? 1.4 : 1);
    if (st.essence <= 0) {
      st.essence = 0; st.panne = true; son('bosse'); toast('Panne sèche ! Trouve une station ou un vendeur de kpayo', 2.8, 'mal');
      if (DISC.client) { DISC.client.humeur = Math.max(0, DISC.client.humeur - .3); bulle(DISC.client.siege, 'Eh ! Tu n’as pas mis d’essence ?!', { ton: 'fort' }); }
    } else if (st.essence < .45 && !st.reserveDite) { st.reserveDite = true; toast('Réserve ! Fais le plein au prochain vendeur', 2.2, 'mal'); }
  }
  // Réservoir bas : on signale le prochain vendeur ; c'est au joueur de s'arrêter (E pour le plein).
  if (st.essence < 1 || st.panne) for (const it of BORD.items) {
    if (it.type !== 'station' && it.type !== 'kpayo') continue;
    const ds = it.s - st.s;
    if (ds > 40 && ds < 80 && !it.propose) { it.propose = true; toast(`${it.type === 'station' ? `Station${it.nom ? ' ' + it.nom : ''}` : 'Kpayo'} à ${it.side > 0 ? 'droite' : 'gauche'} : arrête-toi devant, puis E pour le plein`, 2.6); break; }
  }
  // Jauge du HUD.
  const el = $('#jhEssence'); if (el) { el.firstElementChild.style.width = `${Math.max(0, st.essence / RESERVOIR * 100).toFixed(0)}%`; el.classList.toggle('bas', st.essence < .45); el.title = `Essence : ${st.essence.toFixed(1)} L`; }
}
