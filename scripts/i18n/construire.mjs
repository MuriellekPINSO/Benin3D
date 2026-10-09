// Construit le site dans les deux langues : le français dans dist/, l'anglais dans dist/en/ (mêmes
// modèles, données et images, servis depuis la racine : l'anglais n'en garde pas de copie).
import { build } from 'vite';
import fs from 'fs';
await build({ logLevel: 'warn' });
process.env.LANGUE = 'en';
await build({ logLevel: 'warn', base: '/', publicDir: false, build: { outDir: 'dist-en', emptyOutDir: true, assetsDir: 'assets-en', chunkSizeWarningLimit: 1600 } });
fs.mkdirSync('dist/en', { recursive: true });
fs.renameSync('dist-en/index.html', 'dist/en/index.html');
fs.rmSync('dist/assets-en', { recursive: true, force: true }); fs.renameSync('dist-en/assets-en', 'dist/assets-en');
fs.rmSync('dist-en', { recursive: true, force: true });
console.log('dist/ (français) et dist/en/ (anglais) prêts');
