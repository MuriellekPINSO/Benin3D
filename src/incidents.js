// ---------- Incidents : savoir que le jeu a planté, et ne pas mourir en silence ----------
// Murielle a eu la bannière « cette page a été rechargée car un problème est survenu » sans qu'on sache
// pourquoi, et un testeur résume : « le site bug un peu ». Rien n'écoutait les erreurs. On compte désormais
// trois incidents sur le tableau de bord (public/tableau.html), par le même compteur « +1 » que les visites —
// les règles de la base n'acceptent rien d'autre, donc on ne remonte aucun détail, seulement combien de fois.
// Le détail (message, ligne, navigateur) demanderait un nouveau chemin dans Firebase et ses règles.
import { compter } from './statistiques.js';

const VUS = new Set(); // un même plantage se répète souvent cent fois par seconde : on ne compte qu'une fois par type

function noter(type) { if (VUS.has(type)) return; VUS.add(type); compter(type); }

export function surveillerIncidents(canvas) {
  addEventListener('error', e => { if (e.message) { noter('erreurs'); console.warn('incident', e.message, e.filename, e.lineno); } });
  addEventListener('unhandledrejection', e => { noter('promesses'); console.warn('incident (promesse)', e.reason?.message || e.reason); });
  if (!canvas) return;
  // Perte du contexte WebGL : sur téléphone, le navigateur reprend la carte graphique quand la mémoire manque ou
  // quand on laisse l'onglet de côté. Sans preventDefault, le contexte ne revient jamais et l'écran reste noir —
  // c'est ce que voyait le joueur juste avant la bannière de rechargement.
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault(); noter('webgl_perdu');
    document.getElementById('app')?.classList.add('webgl-perdu');
  });
  canvas.addEventListener('webglcontextrestored', () => { document.getElementById('app')?.classList.remove('webgl-perdu'); });
}
