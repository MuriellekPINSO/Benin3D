// ---------- Boutiques à louer : les emplacements (Vivre à Cotonou, « devenir patron », commerces.js) ----------
// Une parcelle au bord d'une rue, sans bâtiment (OpenStreetMap ni Google), loin des carrefours : relevées dans la ville
// avec un script (frontage des rues, 10 m × 7 m libres). x, z : centre de la parcelle ; cap : la façade regarde la rue
// (sin cap, cos cap) ; trottoir : sa largeur devant la parcelle (rue.js n'en dessine pas devant une boutique).
// Repère d'une parcelle : x le long de la rue (−5 à 5 m), z vers la rue (façade à z = 3, fond à z = −4).
// zones.js y interdit les murs et les maisons générés ; affluence : les clients viennent plus souvent ; atout : les
// commerces qui marchent mieux ici (vitesse des ventes multipliée).
export const EMPLACEMENTS = [
  { id: 'dantokpa', nom: 'Dantokpa', x: 2262.7, z: -97.2, cap: .201, trottoir: 3.5, affluence: 1.3, loyer: 1500, atout: { pagnes: 1.3, momo: 1.2 }, texte: 'À deux pas du plus grand marché d’Afrique de l’Ouest : du monde toute la journée.' },
  { id: 'ganhi', nom: 'Ganhi', x: 2455.4, z: 1730.3, cap: .034, trottoir: 1.3, affluence: 1.15, loyer: 1500, atout: { couture: 1.3, coiffure: 1.2 }, texte: 'Le quartier des banques et du marché Ganhi : des clients pressés qui veulent être beaux.' },
  { id: 'haievive', nom: 'Haie Vive', x: -1990.6, z: 1476.2, cap: -.028, trottoir: 1.3, affluence: 1.15, loyer: 2500, atout: { maquis: 1.3, coiffure: 1.1 }, texte: 'Le quartier des maquis et des sorties : on y mange et on y boit jusque tard.' },
  { id: 'fidjrosse', nom: 'Fidjrossè', x: -5345.3, z: 2333.8, cap: 2.996, trottoir: 3, affluence: 1, loyer: 1500, atout: { maquis: 1.25 }, texte: 'Près de la plage : le week-end, tout Cotonou vient s’y détendre.' },
  { id: 'etoile', nom: 'Étoile Rouge', x: -654.2, z: -185.6, cap: -2.599, trottoir: 1.3, affluence: 1.1, loyer: 1200, atout: { garage: 1.2, momo: 1.2 }, texte: 'Près du grand carrefour de l’Étoile Rouge : les zems et les voitures passent sans arrêt.' },
  { id: 'akpakpa', nom: 'Akpakpa', x: 4972.8, z: -130.9, cap: -1.512, trottoir: 1.3, affluence: .9, loyer: 700, atout: { garage: 1.3, momo: 1.1 }, texte: 'Un quartier populaire, plein de zems : le loyer le moins cher de la ville.' },
];
export const LOT = { demi: 5, avant: 3, fond: -4 };
