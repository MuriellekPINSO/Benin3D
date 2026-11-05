// ---------- Repères de Cotonou posés à leur vraie place (modèles Tripo d'après photo, 05/11) ----------
// Coordonnées relevées dans OpenStreetMap (Overpass, 05/11). Le bâtiment que la carte avait là est retiré avant de
// construire la ville (zones.js, `vider` mètres autour du centre), puis le modèle est posé par ville-tripo.js.
//  - Église Sainte-Trinité d'Avotrou (Akpakpa) : bâtiment OSM 496497812, 48 m nord-sud sur 23 m ; la photo (Saliousoft)
//    est prise depuis le sud, devant la façade à la croix.
//  - Pharmacie Haie Vive : la seule pharmacie d'OSM à Haie Vive, boulevard de France (nœud 2782366114, sans nom) ;
//    l'adresse est à confirmer avec Murielle. Façade tournée vers la rue la plus proche.
//  - Passerelle du marché Dantokpa : pont piéton OSM 241552001, 47 m (dessiné au ras de la chaussée par ville.js, comme
//    tous les ponts de moins de 60 m) ; le modèle se pose au-dessus, dans l'axe.
export const REPERES = [
  { id: 'eglise-akpakpa', centre: [6.377376, 2.475805], face: [6.376862, 2.475893], longueur: 48, largeur: 24, vider: 18 },
  { id: 'pharmacie-haievive', centre: [6.3569121, 2.4008066], versRoute: true, hauteur: 15, vider: 12 },
  { id: 'passerelle-dantokpa', de: [6.370034, 2.433094], a: [6.369692, 2.433345], hauteur: 9, epaisseur: 6 },
];
