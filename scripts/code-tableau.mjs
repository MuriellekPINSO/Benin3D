// Empreinte du code du tableau de bord (middleware.js). Le dépôt est public : on n'y met jamais le code, seulement
// son empreinte PBKDF2 (lente à calculer, donc lente à deviner).
//   node scripts/code-tableau.mjs <nouveau code>   puis recopier SEL et EMPREINTE dans middleware.js
import { pbkdf2Sync, randomBytes } from 'crypto';

const code = process.argv[2];
if (!code) { console.error('usage : node scripts/code-tableau.mjs <nouveau code>'); process.exit(1); }
const SEL = randomBytes(12).toString('hex'), TOURS = 100000;
console.log(`const SEL = '${SEL}', EMPREINTE = '${pbkdf2Sync(code.trim(), SEL, TOURS, 32, 'sha256').toString('hex')}';`);
