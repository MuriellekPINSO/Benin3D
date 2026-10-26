// ---------- Prise en main guidée : une consigne à la fois, la première fois ----------
// Le joueur découvre le salon ou Zém Run sans mode d'emploi : chaque étape s'affiche quand elle devient utile (`quand`)
// et disparaît dès qu'elle est faite (`fait`). Les étapes faites sont retenues dans le navigateur ; « Masquer » arrête
// le guide pour de bon. Dans le texte, [E] devient une touche dessinée : celle du clavier, ou le bouton de la manette
// quand on joue avec (saisie.js) — « appuie sur [E] » se lit « appuie sur Y » dans Zém Run, « sur A » à pied.
import { kbd } from './saisie.js';

const lire = cle => { try { return JSON.parse(localStorage.getItem(cle) || '{}'); } catch { return {}; } };
const ecrire = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* navigation privée */ } };
const touches = t => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(/\[([^\]]{1,12})\]/g, (_, k) => kbd(k));

/**
 * `etapes` : [{ id, texte (chaîne ou fonction), quand: () => bool, fait: () => bool, duree? }], dans l'ordre où on les
 * propose ; une étape qui n'est qu'un conseil (`duree`) est faite après être restée affichée tant de secondes.
 * Renvoie { maj(dt), actif(), masquer(), revoir() } ; maj() s'appelle à chaque image (ce qui est fait est noté).
 * Une étape faite avant d'avoir été montrée (sortir de chez soi avant la consigne de la maison) est notée « sautée » :
 * elle sort de la numérotation, qui passait sinon de 2/5 à 4/5. Les autres sont numérotées dans l'ordre où elles apparaissent.
 */
export function creerGuide({ cle, el, titre, etapes }) {
  let etat = lire(cle), affiche = '', courante = null, vu = 0; const vues = new Set();
  const faites = () => etapes.filter(e => etat[e.id]).length;
  const masquer = () => { etat.fini = true; ecrire(cle, etat); el.hidden = true; affiche = ''; };
  el.addEventListener('click', e => { if (e.target.closest('[data-masquer]')) masquer(); });
  function maj(dt = 0) {
    if (etat.fini) { if (!el.hidden) el.hidden = true; return; }
    let change = false;
    for (const e of etapes) if (!etat[e.id] && (e.fait() || (e === courante && e.duree && vu >= e.duree))) { etat[e.id] = e === courante || vues.has(e.id) ? true : 'sautee'; change = true; }
    if (change) { if (faites() === etapes.length) etat.fini = true; ecrire(cle, etat); }
    const e = !etat.fini && etapes.find(x => !etat[x.id] && x.quand());
    if (e !== courante) { courante = e || null; vu = 0; if (e) vues.add(e.id); } else vu += dt;
    // Numéro dans l'ordre d'apparition (les étapes de Zém Run viennent selon la route, pas dans l'ordre de la liste).
    const sautees = etapes.filter(x => etat[x.id] === 'sautee').length, rang = etapes.filter(x => (etat[x.id] && etat[x.id] !== 'sautee') || vues.has(x.id)).length;
    const html = e ? `<small>${titre} · ${rang}/${etapes.length - sautees}</small><p>${touches(typeof e.texte === 'function' ? e.texte() : e.texte)}</p><button type="button" data-masquer>Masquer le guide</button>` : '';
    if (html !== affiche) { affiche = html; el.innerHTML = html; el.hidden = !html; }
  }
  return { maj, actif: () => !etat.fini, masquer, revoir: () => { etat = {}; vues.clear(); ecrire(cle, etat); affiche = ''; } };
}
