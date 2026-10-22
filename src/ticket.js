// ---------- Le billet de fin de course, à partager (comme le « Danfo ticket » de Danfo Run) ----------
// Au bilan de Zém Run, une image façon billet du syndicat (logo, recette, clients, distance, frôlements, numéro du billet)
// part sur WhatsApp ou ailleurs en un geste : partage de fichier quand le téléphone le permet, sinon le texte seul,
// sinon un lien WhatsApp. L'image est préparée dès l'arrivée du bilan : le partage doit suivre le clic sans attendre.
const SITE = 'https://kutɔnuvibes.com';
const fmt = n => `${Math.round(n).toLocaleString('fr-FR')} F`;
const POLICE = '"Google Sans", "Plus Jakarta Sans", system-ui, sans-serif', MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

function chargerImage(src) { return new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }); }

/** Dessine le billet : 1080 × 1350 (format portrait des statuts et des publications). */
async function dessiner(d) {
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#1a7d52'; c.fillRect(0, 0, W, H);
  // Le billet : un rectangle crème, entaillé des deux côtés au niveau du pointillé.
  const x = 90, y = 110, w = W - 180, h = H - 220, r = 36, coupe = 760;
  c.fillStyle = '#fbf6ea'; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
  c.fillStyle = '#1a7d52'; for (const cx of [x, x + w]) { c.beginPath(); c.arc(cx, y + coupe, 34, 0, Math.PI * 2); c.fill(); } // les encoches, couleur du fond
  c.setLineDash([14, 14]); c.strokeStyle = '#d9cfbb'; c.lineWidth = 4; c.beginPath(); c.moveTo(x + 56, y + coupe); c.lineTo(x + w - 56, y + coupe); c.stroke(); c.setLineDash([]);
  // En-tête : logo, nom, numéro du billet.
  const logo = await chargerImage(`${import.meta.env.BASE_URL}favicon.svg`);
  if (logo) c.drawImage(logo, x + 60, y + 60, 96, 96);
  c.fillStyle = '#242824'; c.font = `800 52px ${POLICE}`; c.textBaseline = 'middle'; c.fillText('Kutɔnu Vibes', x + 180, y + 92);
  c.fillStyle = '#6b6457'; c.font = `700 26px ${POLICE}`; c.fillText('ZÉM RUN · BILLET DE COURSE', x + 182, y + 140);
  c.textAlign = 'right'; c.font = `600 30px ${MONO}`; c.fillStyle = '#242824'; c.fillText(`N° ${String(d.billet).padStart(6, '0')}`, x + w - 60, y + 92);
  c.font = `500 24px ${MONO}`; c.fillStyle = '#6b6457'; c.fillText(`Zém n° ${d.numero}`, x + w - 60, y + 140); c.textAlign = 'left';
  // La ligne, le résultat, la recette.
  c.fillStyle = '#6b6457'; c.font = `700 30px ${POLICE}`; c.fillText(d.arrive ? 'TERMINUS ATTEINT' : 'COURSE ARRÊTÉE', x + 60, y + 250);
  c.fillStyle = '#242824'; c.font = `800 46px ${POLICE}`; ligne(c, d.trajet, x + 60, y + 312, w - 120);
  c.fillStyle = '#1a7d52'; c.font = `800 150px ${POLICE}`; c.fillText(fmt(d.total), x + 52, y + 470);
  c.fillStyle = '#6b6457'; c.font = `600 30px ${POLICE}`; c.fillText(d.record ? 'Nouveau record sur cette ligne !' : 'de recette', x + 62, y + 570);
  if (d.record) { c.fillStyle = '#f5b700'; c.beginPath(); c.roundRect(x + 56, y + 600, 300, 54, 27); c.fill(); c.fillStyle = '#1d1a16'; c.font = `800 28px ${POLICE}`; c.fillText('★ RECORD', x + 140, y + 628); }
  // Les chiffres, sous le pointillé.
  const cases = [['Clients', String(d.clients)], ['Distance', `${d.km} km`], ['Frôlements', String(d.frolements)], ['Durée', d.duree]];
  cases.forEach(([k, v], i) => {
    const cx = x + 60 + (i % 2) * (w - 120) / 2, cy = y + coupe + 90 + Math.floor(i / 2) * 150;
    c.fillStyle = '#6b6457'; c.font = `700 26px ${POLICE}`; c.fillText(k.toUpperCase(), cx, cy);
    c.fillStyle = '#242824'; c.font = `800 60px ${POLICE}`; c.fillText(v, cx, cy + 64);
  });
  // L'invitation.
  c.fillStyle = '#f5b700'; c.fillRect(0, H - 110, W, 110);
  c.fillStyle = '#1d1a16'; c.font = `800 40px ${POLICE}`; c.textAlign = 'center'; c.fillText('Fais mieux sur kutɔnuvibes.com', W / 2, H - 55); c.textAlign = 'left';
  return new Promise(ok => cv.toBlob(ok, 'image/png'));
}
// Une ligne de texte réduite jusqu'à tenir dans la largeur.
function ligne(c, t, x, y, max) {
  let taille = parseInt(c.font.match(/(\d+)px/)[1], 10);
  while (c.measureText(t).width > max && taille > 24) { taille -= 2; c.font = c.font.replace(/\d+px/, `${taille}px`); }
  c.fillText(t, x, y);
}

/**
 * Prépare le billet d'une course : d = { billet, numero, trajet, arrive, total, record, clients, km, frolements, duree }.
 * Rend { partager() } : à appeler dans le clic du joueur.
 */
export function preparerTicket(d) {
  const texte = `Zém Run · ${d.trajet} : ${fmt(d.total)} de recette, ${d.clients} client${d.clients > 1 ? 's' : ''}, ${d.km} km${d.record ? ', nouveau record' : ''}. Fais mieux sur ${SITE}`;
  const image = dessiner(d).catch(() => null);
  return {
    texte,
    async partager() {
      const blob = await image;
      if (blob) {
        const f = new File([blob], `zem-run-billet-${d.billet}.png`, { type: 'image/png' });
        if (navigator.canShare?.({ files: [f] })) {
          try { await navigator.share({ files: [f], text: texte, title: 'Zém Run' }); return 'partage'; } catch (e) { if (e?.name === 'AbortError') return 'annule'; }
        }
      }
      if (navigator.share) { try { await navigator.share({ title: 'Zém Run', text: texte, url: SITE }); return 'partage'; } catch (e) { if (e?.name === 'AbortError') return 'annule'; } }
      window.open(`https://wa.me/?text=${encodeURIComponent(texte)}`, '_blank', 'noopener');
      return 'whatsapp';
    },
    image,
  };
}
