// État partagé entre les modules : ce qui change en cours de route et que
// plusieurs fichiers lisent ou modifient (vol de caméra, trafic, sélection…).
import { reduceMotion } from './base.js';
export const E = {
  flight: null,
  zems: null, zemsProches: null, zemState: [], zemOn: true,
  tokpas: null, tokpaState: [],
  lamps: null, foamMat: null,
  showQ: true, selected: null,
  riseDone: reduceMotion, frameN: 0,
};
