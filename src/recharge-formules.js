// ---------- Recharger son compte avec du vrai argent : les formules ----------
// Partagé par la page (recharge.js) et le serveur (api/fedapay.js, api/recharge.js) : le serveur fixe lui-même le prix
// payé et l'argent crédité, jamais la page. Tarif voulu par Murielle (28/10) : « 500 c'est 10k, 1 000 15k, ainsi de
// suite » : 5 000 F du jeu offerts, puis 10 F du jeu par franc payé.
// prix : francs CFA payés par Mobile Money ; credit : francs du jeu ajoutés au compte.
export const FORMULES = [
  { id: 'r500', prix: 500, credit: 10000 },
  { id: 'r1000', prix: 1000, credit: 15000 },
  { id: 'r2000', prix: 2000, credit: 25000 },
  { id: 'r5000', prix: 5000, credit: 55000 },
];
export const formule = id => FORMULES.find(f => f.id === id) || null;
