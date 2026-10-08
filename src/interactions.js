import * as THREE from 'three';
import { $ } from './base.js';
import { moteurMaj, son } from './audio.js';
import { BORD } from './bordure.js';
import { DISC, bulle, causerGroupe, dialogue, passantDemande, prendreSigne } from './discussions.js';
import { servir } from './essence.js';
import { etalPres, ouvrirBoutique } from './artisans.js';
import { JEU, fmtF, pose, toast } from './jeu.js';

// ---------- Interagir avec ce qui est à côté (touche E) ----------
// Le joueur conduit : quand il s'arrête, tout ce qui est à moins de ~11 m devient
// accessible — vendeur d'essence, vendeuse, kiosque MoMo, vulcanisateur, station de zém,
// boutiques aux vrais noms, gens qui causent, quelqu'un qui fait signe, marché artisanal.
// S'il attend garé sans client, un passant finit par venir lui demander une course.

const P = { x: 0, y: 0, z: 0, dx: 1, dz: 0, a: 0 }, Q = new THREE.Vector3();
const choisir = l => l[Math.floor(Math.random() * l.length)];
const payer = (st, n) => { if (st.argent + (JEU.prog?.cagnotte || 0) < n) { toast('Pas assez d’argent', 1.2, 'mal'); return false; } const r = Math.min(Math.max(0, st.argent), n); st.argent -= r; if (n > r) JEU.prog.cagnotte -= n - r; son('piece'); return true; };
const NOMS_VIVANT = { vendeuse: 'La vendeuse', momo: 'Le kiosque MoMo', vulca: 'Le vulcanisateur', zems: 'Les zémidjans', station: 'La station', kpayo: 'Le kpayo', enseigne: 'La boutique' };

function actionsObjet(st, o) {
  const it = o.it || o; const t = o.type;
  if (t === 'station' || t === 'kpayo') return { label: t === 'station' ? `Faire le plein${it.nom ? ' · ' + it.nom : ''}` : 'Acheter du kpayo', go: () => servir(st, it) };
  if (t === 'vendeuse') return { label: 'Parler à la vendeuse', go: () => {
    // D'abord on se salue, ensuite on discute le prix, enfin on achète (cahier des charges, priorité 2).
    let remise = 1;
    const eau = () => { if (DISC.client) { DISC.client.humeur = Math.min(1, DISC.client.humeur + .15); bulle(DISC.client.siege, 'Ah, de l’eau fraîche ! Merci, zém !'); } else bulle(o.g, 'Merci ! Bonne route !'); };
    const prix = n => Math.max(25, Math.round(n * remise / 25) * 25);
    const acheter = () => dialogue('La vendeuse', remise < 1 ? '« Bon, pour toi j’enlève un peu. Tu prends quoi ? »' : '« Pure water, akassa, beignets ! Tu prends quoi ? »', [
      [`Une pure water · ${prix(50)} F`, () => { if (payer(st, prix(50))) eau(); }],
      [`Des beignets · ${prix(200)} F`, () => { if (payer(st, prix(200))) bulle(o.g, 'Ils sont chauds, attention !'); }],
      ...(remise === 1 ? [['C’est cher, diminue un peu', () => {
        if (Math.random() < .6) { remise = .8; bulle(o.g, 'Hum… bon, parce que c’est toi !'); setTimeout(acheter, 900); }
        else { remise = .99; bulle(o.g, 'Mon fils, c’est déjà le bon prix !'); setTimeout(acheter, 900); }
      }]] : [['Rien, merci', () => bulle(o.g, 'Une autre fois !')]]),
    ], { defaut: -1, duree: 12, prioritaire: true });
    bulle(o.g, 'Bonne arrivée, zém ! Ça va ?', { duree: 2.4 });
    dialogue('La vendeuse', '« Bonne arrivée, zém ! Ça va, ce matin ? »', [
      ['Bonjour maman, ça va et toi ?', () => { bulle(o.g, 'On est là, Dieu merci !'); setTimeout(acheter, 900); }],
      ['On dit quoi, tantie ?', () => { bulle(o.g, 'On est ensemble ! Tu veux quoi ?'); setTimeout(acheter, 900); }],
      ['Rien, je passais saluer', () => bulle(o.g, 'Bonne route, mon fils !')],
    ], { defaut: -1, duree: 10 });
  } };
  if (t === 'momo') return { label: 'Kiosque MoMo', go: () => {
    const P2 = JEU.prog;
    dialogue('Le kiosque MoMo', `« Dépôt, retrait, crédit ! Ta cagnotte : ${fmtF(P2.cagnotte)}. »`, [
      ['Retirer 1 000 F (frais 50 F)', () => { if (P2.cagnotte < 1050) return toast('Cagnotte insuffisante', 1.2, 'mal'); P2.cagnotte -= 1050; st.argent += 1000; son('piece'); bulle(o.g, 'Voilà tes 1 000 F !'); }],
      ['Déposer ma recette', () => { if (st.argent <= 0) return toast('Rien à déposer', 1.2); P2.cagnotte += st.argent; toast(`+${fmtF(st.argent)} dans la cagnotte`, 1.4, 'bien'); st.argent = 0; son('piece'); }],
      ['Du crédit téléphone · 200 F', () => { if (payer(st, 200)) bulle(o.g, 'Crédit envoyé !'); }],
    ], { defaut: -1, duree: 10 });
  } };
  if (t === 'vulca') return { label: 'Le vulcanisateur', go: () => {
    dialogue('Le vulcanisateur', st.vies < 3 ? '« Eh, ta moto a pris des coups ! Je la répare ? »' : '« Gonflage, réparation, je fais tout ! »', [
      ...(st.vies < 3 ? [['Réparer la moto · 500 F (+1 vie)', () => { if (!payer(st, 500)) return; st.vies++; toast('Moto réparée : +1 vie', 1.6, 'bien'); bulle(o.g, 'C’est bon, elle est comme neuve !'); }]] : []),
      ['Gonfler les pneus · 100 F', () => { if (!payer(st, 100)) return; st.pneus = 120; toast('Pneus gonflés : les nids-de-poule font moins mal', 1.8, 'bien'); }],
      ['Rien, merci', () => bulle(o.g, 'Bonne route !')],
    ], { defaut: -1, duree: 10 });
  } };
  if (t === 'zems') return { label: 'Causer avec les zémidjans', go: () => {
    const conseil = choisir(['Mets ton casque, la police contrôle vers l’Étoile Rouge.', 'Le kpayo de la vieille du carrefour est coupé, fais attention.', 'Les clients de Dantokpa paient bien le samedi.', 'Évite le pont à 18 h, c’est bouché.', 'Le Vulcanisateur d’à côté répare vite et pas cher.']);
    bulle(o.g, conseil, { duree: 3.4 });
    dialogue('Les zémidjans', `« ${conseil} »`, [['Merci, mon frère !', () => bulle(o.g, 'On est ensemble !')], ['Tu as eu combien aujourd’hui ?', () => bulle(o.g, 'Hum… pas grand-chose. Et toi ?')]], { defaut: -1, duree: 9 });
  } };
  if (t === 'enseigne') return { label: `Entrer chez ${it.nom || 'le commerçant'}`, go: () => {
    const nom = it.nom || 'la boutique', ty = it.t || '';
    const offre = /pharmac/.test(ty) ? ['Du paracétamol · 500 F', 500, 'Prends-le avec de l’eau !'] : /restau|maquis|bar|fast/.test(ty) ? ['Un plat de riz · 1 000 F', 1000, 'Bon appétit !'] : /coiff/.test(ty) ? ['Une coupe · 1 500 F', 1500, 'Te voilà beau !'] : ['Une boisson fraîche · 300 F', 300, 'Merci, à bientôt !'];
    dialogue(nom, `« Bonne arrivée chez ${nom} ! Tu veux quoi ? »`, [[offre[0], () => { if (payer(st, offre[1])) toast(offre[2], 1.6, 'bien'); }], ['Juste dire bonjour', () => toast('« Bonne journée à toi ! »', 1.4)]], { defaut: -1, duree: 10 });
  } };
  return null;
}

/** Liste de ce qui est à portée (le zém arrêté), du plus proche au plus loin. */
function aPortee(st, C) {
  const j = JEU.joueur?.position; if (!j) return [];
  const out = [], d = (x, z) => Math.hypot(x - j.x, z - j.z);
  for (const o of BORD.vivants) {
    if (!NOMS_VIVANT[o.type]) continue;
    const it = BORD.items.find(i => i.s === o.s && i.type === o.type);
    o.g.getWorldPosition(Q); const dd = d(Q.x, Q.z); if (dd > 12) continue;
    const a = actionsObjet(st, { ...o, it }); if (a) out.push({ ...a, d: dd });
  }
  for (const h of DISC.signes) if (h.m && h.m.visible && h.etat !== 'monte' && !DISC.client) { const dd = d(h.m.position.x, h.m.position.z); if (dd < 11) out.push({ label: 'Prendre ce client', go: () => prendreSigne(h), d: dd - 3 }); }
  for (const g of DISC.vivants) { g.g.getWorldPosition(Q); const dd = d(Q.x, Q.z); if (dd < 12) out.push({ label: 'Causer avec eux', go: () => causerGroupe(g), d: dd }); }
  pose(C, st.s, 0, P); const et = etalPres(P.x, P.z, 60);
  if (et) out.push({ label: 'Marché artisanal', go: () => { JEU.pause = true; moteurMaj(0, false); ouvrirBoutique(et, () => { JEU.pause = false; }); }, d: 8 });
  return out.sort((a, b) => a.d - b.d).slice(0, 3);
}

const I = { liste: [], t: 0, attente: 0, prochaineDemande: 7 };
/** À chaque image : met à jour l'invite « E · … » et gère l'attente garé. */
export function majInteractions(st, C, dt) {
  I.t -= dt;
  if (I.t <= 0) {
    I.t = .25;
    I.liste = st.v < 1.2 && !(DISC.courant && DISC.courant.prioritaire) ? aPortee(st, C) : [];
    const el = $('#jhAction');
    if (el) { el.hidden = !I.liste.length; if (I.liste.length) el.querySelector('span').textContent = I.liste.length > 1 ? `${I.liste[0].label} · ${I.liste.length - 1} autre${I.liste.length > 2 ? 's' : ''}` : I.liste[0].label; }
  }
  // Attendre garé : sans client, arrêté sur le côté, un passant finit par venir.
  if (JEU.veh === 'zem' && st.v < .3 && !DISC.client && !DISC.courant && st.service <= 0 && Math.abs(st.lat) > 1) {
    I.attente += dt;
    if (I.attente > I.prochaineDemande) { I.attente = 0; I.prochaineDemande = 6 + Math.random() * 8; passantDemande(C); }
  } else I.attente = 0;
}
/** Touche E (ou bouton « Interagir ») : une seule chose à côté → on la fait ; plusieurs → on choisit. */
export function interagir() {
  const st = JEU.etat; if (!st || !I.liste.length) return;
  if (st.v > 1.2) return toast('Arrête-toi d’abord', 1);
  // Ce que le joueur demande passe devant la causerie du client (qui reprendra après).
  const faire = f => () => { DISC.forcer = true; try { f(); } finally { DISC.forcer = false; } };
  if (I.liste.length === 1) return faire(I.liste[0].go)();
  dialogue('Que veux-tu faire ?', 'Il y a plusieurs choses à côté de toi.', I.liste.map(a => [a.label, faire(a.go)]), { defaut: -1, duree: 10, prioritaire: true });
}
