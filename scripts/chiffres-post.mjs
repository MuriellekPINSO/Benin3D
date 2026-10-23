// Carte des chiffres pour un post : lit les vrais compteurs dans Firebase (zem_stats/jours) et
// en fait une image prête à publier. Rien n'est saisi à la main — l'image dit ce que dit la base.
//   node scripts/chiffres-post.mjs [sortie.png]        (par défaut ~/Desktop/kutonuvibes-post.png)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const SORTIE = process.argv[2] || join(homedir(), 'Desktop', 'kutonuvibes-post.png');
const CLI = (() => {
  const base = join(homedir(), '.npm/_npx');
  for (const d of readdirSync(base)) { const p = join(base, d, 'node_modules/.bin/firebase'); try { execFileSync(p, ['--version'], { stdio: 'ignore' }); return p; } catch { /* suivant */ } }
  throw new Error('firebase CLI introuvable');
})();

const brut = execFileSync(CLI, ['database:get', '/zem_stats/jours', '--project', 'zem-run-cotonou'], { encoding: 'utf8', maxBuffer: 1 << 22 });
const jours = JSON.parse(brut.slice(brut.indexOf('{')));
const somme = k => Object.values(jours).reduce((a, j) => a + (j[k] || 0), 0);
const T = { vues: somme('vues'), appareils: somme('nouveaux'), salon: somme('salon'), zemrun: somme('zemrun'), jours: Object.keys(jours).length };
const nb = n => n.toLocaleString('fr-FR').replace(/ | /g, ' ');
console.log(`Depuis le début : ${nb(T.vues)} ouvertures · ${nb(T.appareils)} appareils · ${nb(T.salon)} vies · ${nb(T.zemrun)} courses`);

const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root { --vert: #1d5a2e; --creme: #f7f5ef; --encre: #15241a; }
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: var(--vert); color: var(--creme);
    font: 400 20px/1.4 'Google Sans', system-ui, sans-serif; padding: 56px 64px; display: flex; flex-direction: column; justify-content: space-between; }
  .haut { display: flex; align-items: center; gap: 14px; font-weight: 700; font-size: 26px; letter-spacing: -.01em; }
  .logo { width: 44px; height: 44px; border-radius: 12px; background: var(--creme); color: var(--vert); display: grid; place-items: center; font-weight: 800; font-size: 24px; }
  .grand { font-size: 148px; font-weight: 800; line-height: .95; letter-spacing: -.04em; }
  .grand small { display: block; font-size: 30px; font-weight: 500; letter-spacing: 0; opacity: .82; margin-top: 10px; }
  .bas { display: flex; gap: 48px; align-items: flex-end; justify-content: space-between; }
  .chiffres { display: flex; gap: 44px; }
  .chiffres div b { display: block; font-size: 40px; font-weight: 800; letter-spacing: -.02em; }
  .chiffres div span { font-size: 17px; opacity: .78; }
  .url { font: 700 19px 'JetBrains Mono', monospace; opacity: .9; }
</style></head><body>
  <div class="haut"><span class="logo">K</span>Kutɔnu Vibes · Cotonou en 3D</div>
  <div class="grand">${nb(T.vues)}<small>ouvertures du site en ${T.jours} jours</small></div>
  <div class="bas">
    <div class="chiffres">
      <div><b>${nb(T.appareils)}</b><span>appareils différents</span></div>
      <div><b>${nb(T.salon)}</b><span>vies commencées en ville</span></div>
      <div><b>${nb(T.zemrun)}</b><span>courses de zém</span></div>
    </div>
    <div class="url">kutɔnuvibes.com</div>
  </div>
</body></html>`;

const profil = mkdtempSync(join(tmpdir(), 'kv-post-'));
const page = join(profil, 'carte.html'); writeFileSync(page, html);
try {
  execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', `--user-data-dir=${profil}`, '--no-first-run', '--hide-scrollbars',
    '--window-size=1200,630', '--force-device-scale-factor=2', `--screenshot=${SORTIE}`, `file://${page}`,
  ], { stdio: 'ignore' });
} finally { rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 }); }
console.log(`Image : ${SORTIE}`);
