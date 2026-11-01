import { A_VENDRE, VIE } from './vie.js';
import { valeurCommerces } from './commerces.js';
import { valeurDeco } from './deco.js';

// ---------- L'échelle de Cotonou : dix titres, du nouveau venu à la légende ----------
// Comme l'échelle de Lagos Life (de Mushin à Banana Island, 26/10), mais en titres plutôt qu'en quartiers : classer les
// quartiers de Cotonou du plus pauvre au plus riche aurait vexé ceux qui y vivent. Le titre se lit sous le nom de chacun,
// dans la rue : c'est ce qu'on montre aux autres. Il suit la fortune (l'argent, plus ce qu'on possède : son épargne, sa voiture,
// ses commerces, les objets de sa maison), pas l'argent seul, sinon s'acheter une voiture ferait descendre d'un barreau.
// Les quatre titres d'après les chapitres (chapitres.js, du 22/10) gardent leur seuil : les joueurs les connaissent.
export const ECHELLE = [
  [0, 'Nouveau venu', 'Nouvelle venue'],
  [5000, 'Débrouillard', 'Débrouillarde'],
  [15000, 'Bosseur', 'Bosseuse'],
  [30000, 'Connu du quartier', 'Connue du quartier'],
  [50000, 'Petit patron', 'Petite patronne'],
  [100000, 'Patron', 'Patronne'],
  [150000, 'Commerçant reconnu', 'Commerçante reconnue'],
  [400000, 'Magnat de Dantokpa', 'Magnate de Dantokpa'],
  [1000000, 'Roi de Cotonou', 'Reine de Cotonou'],
  [5000000, 'Légende de Cotonou', 'Légende de Cotonou'],
];
/** Ce que vaut le joueur : son argent, son épargne, la voiture achetée (pas une location), ses commerces au prix de l'installation, les objets de sa maison. */
export function fortune() {
  const v = VIE.data; if (!v) return 0;
  const auto = !v.vehiculeFin ? A_VENDRE.find(a => a.id === v.vehicule)?.prix || 0 : 0;
  return Math.round((v.argent || 0) + (v.epargne || 0) + auto + valeurCommerces() + valeurDeco());
}
export const rangDe = f => ECHELLE.reduce((r, [seuil], i) => (f >= seuil ? i : r), 0);
/** Le titre du barreau `i` ; `femme` : accordé. */
export const titreRang = (i, femme = VIE.femme) => ECHELLE[Math.max(0, Math.min(ECHELLE.length - 1, i | 0))][femme ? 2 : 1];
