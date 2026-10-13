// ---------- Prise en main guidée : une consigne à la fois, la première fois ----------
// Le joueur découvre le salon ou Zém Run sans mode d'emploi : chaque étape s'affiche quand elle devient utile (`quand`)
// et disparaît dès qu'elle est faite (`fait`). Les étapes faites sont retenues dans le navigateur ; « Masquer » arrête
// le guide pour de bon. Dans le texte, [E] devient une touche dessinée.

const lire = cle => { try { return JSON.parse(localStorage.getItem(cle) || '{}'); } catch { return {}; } };
const ecrire = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* navigation privée */ } };
const touches = t => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(/\[([^\]]{1,12})\]/g, '<kbd>$1</kbd>');

/**
 * `etapes` : [{ id, texte (chaîne ou fonction), quand: () => bool, fait: () => bool, duree? }], dans l'ordre où on les
 * propose ; une étape qui n'est qu'un conseil (`duree`) est faite après être restée affichée tant de secondes.
 * Renvoie { maj(dt), actif(), masquer(), revoir() } ; maj() s'appelle à chaque image (ce qui est fait est noté).
 */
export function creerGuide({ cle, el, titre, etapes }) {
  let etat = lire(cle), affiche = '', courante = null, vu = 0;
  const faites = () => etapes.filter(e => etat[e.id]).length;
  const masquer = () => { etat.fini = true; ecrire(cle, etat); el.hidden = true; affiche = ''; };
  el.addEventListener('click', e => { if (e.target.closest('[data-masquer]')) masquer(); });
  function maj(dt = 0) {
    if (etat.fini) { if (!el.hidden) el.hidden = true; return; }
    let change = false;
    for (const e of etapes) if (!etat[e.id] && (e.fait() || (e === courante && e.duree && vu >= e.duree))) { etat[e.id] = true; change = true; }
    if (change) { if (faites() === etapes.length) etat.fini = true; ecrire(cle, etat); }
    const e = !etat.fini && etapes.find(x => !etat[x.id] && x.quand());
    if (e !== courante) { courante = e || null; vu = 0; } else vu += dt;
    const html = e ? `<small>${titre} · ${etapes.indexOf(e) + 1}/${etapes.length}</small><p>${touches(typeof e.texte === 'function' ? e.texte() : e.texte)}</p><button type="button" data-masquer>Masquer le guide</button>` : '';
    if (html !== affiche) { affiche = html; el.innerHTML = html; el.hidden = !html; }
  }
  return { maj, actif: () => !etat.fini, masquer, revoir: () => { etat = {}; ecrire(cle, etat); affiche = ''; } };
}
