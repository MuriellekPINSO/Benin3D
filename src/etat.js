// État partagé entre les modules : ce qui change en cours de route et que
// plusieurs fichiers lisent ou modifient (vol de caméra, trafic, sélection…).
import { reduceMotion } from './base.js';
export const E = {
  flight: null,
  zems: null, zemsProches: null, zemState: [], zemOn: true,
  tokpas: null, tokpaState: [],
  // Dans « Vivre à Cotonou » : la position du joueur (à pied ou en véhicule), que la circulation laisse passer,
  // et les zems et tokpas proches de lui, qui bloquent sa marche et sa conduite (refaits à chaque image).
  joueur: null, circulation: [],
  lamps: null, foamMat: null,
  showQ: true, selected: null,
  riseDone: reduceMotion, frameN: 0,
};
