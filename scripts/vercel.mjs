// Publie le site sur Vercel (https://benin3d.vercel.app), sans la clé Google ni les musiques
// protégées. À lancer depuis la racine : npm run vercel
import { execSync } from 'child_process';
import fs from 'fs';

const ENV = '.env.local', CACHE = '.env.local.hors-build';
if (fs.existsSync(ENV)) fs.renameSync(ENV, CACHE); // la clé ne doit pas finir dans le code publié
try {
  execSync('npx vite build', { stdio: 'inherit', env: { ...process.env, VITE_GOOGLE_MAPS_KEY: '' } });
} finally { if (fs.existsSync(CACHE)) fs.renameSync(CACHE, ENV); }
for (const f of fs.readdirSync('dist/audio', { withFileTypes: true }).filter(e => e.name.endsWith('.mp3'))) fs.rmSync(`dist/audio/${f.name}`);
const fuite = execSync('grep -rl "AIza" dist || true').toString().trim();
if (fuite) { console.error('Clé Google trouvée dans', fuite, '— publication annulée.'); process.exit(1); }
fs.writeFileSync('dist/vercel.json', JSON.stringify({ headers: [{ source: '/(modeles|donnees|photos|videos)/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }] }] }, null, 2));
fs.cpSync('.vercel', 'dist/.vercel', { recursive: true });
execSync('vercel deploy --prod --yes', { cwd: 'dist', stdio: 'inherit' });
