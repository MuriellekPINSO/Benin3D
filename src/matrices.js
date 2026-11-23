import * as THREE from 'three';

// ---------- Ne refaire la matrice d'un objet que s'il a bougé ----------
// À chaque image, three.js refait la matrice de chaque objet de la scène (position, rotation, taille → matrice, puis
// matrice du parent × la sienne), même s'il n'a pas bougé depuis le début. La ville en compte 5 400 : c'était le plus gros
// travail du processeur à chaque image (profil du 22/11, à pied à Ganhi : 2 ms sur un Mac, bien plus sur un petit
// téléphone — « ça rame sur le téléphone »). Ici, chaque objet garde sa dernière position, rotation et taille : s'il n'a
// pas bougé, rien n'est refait, ni pour lui ni pour ses enfants. S'il a bougé (ou son parent), tout est refait comme avant.
const O = THREE.Object3D.prototype, composer = O.updateMatrix, ajouter = O.add;
O.updateMatrix = function () {
  const p = this.position, q = this.quaternion, s = this.scale; let c = this._trs;
  if (c && c[0] === p.x && c[1] === p.y && c[2] === p.z && c[3] === q.x && c[4] === q.y && c[5] === q.z && c[6] === q.w && c[7] === s.x && c[8] === s.y && c[9] === s.z) return;
  if (!c) c = this._trs = new Float64Array(10);
  c[0] = p.x; c[1] = p.y; c[2] = p.z; c[3] = q.x; c[4] = q.y; c[5] = q.z; c[6] = q.w; c[7] = s.x; c[8] = s.y; c[9] = s.z;
  composer.call(this); // matrix.compose(…) et matrixWorldNeedsUpdate = true
};
// Changer de parent sans bouger : sa matrice monde est à refaire quand même.
O.add = function (...objets) { for (const o of objets) if (o && o !== this) o._trs = null; return ajouter.apply(this, objets); };
