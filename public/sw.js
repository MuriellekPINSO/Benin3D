// Kutɔnu Vibes installé comme une appli (manifest.webmanifest) : ce service worker garde le jeu sur le téléphone pour que
// la visite suivante démarre vite, même sur une connexion lente, et s'ouvre hors ligne.
// - Les pages : réseau d'abord (une mise en ligne se voit tout de suite), la copie gardée si le réseau manque.
// - Les fichiers du jeu au nom versionné (assets/…-hash.js, modèles ?v=taille) : gardés et resservis tels quels.
// - Le reste du site (données, images, sons) : servi depuis la copie gardée, et rafraîchi en arrière-plan.
// - Les fichiers servis par jsDelivr (src/actifs.js, 11/11) : à un commit figé, ils ne changent jamais ; gardés comme les
//   fichiers versionnés. v2 : les copies du site gardées par la v1 ne servent plus, on les libère.
// Jamais : l'API de paiement, le tableau de bord, Firebase, Google, les radios en direct (autres domaines ou /api/).
const CACHE = 'kutonu-v2';
const CDN = 'https://cdn.jsdelivr.net/gh/MuriellekPINSO/Benin3D@';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method === 'GET' && r.url.startsWith(CDN) && r.mode === 'cors' && !r.headers.has('range')) return e.respondWith(gardeDabord(r));
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/tableau') || r.headers.has('range')) return;
  if (r.mode === 'navigate') return e.respondWith(reseauDabord(r));
  if (/^\/assets(-en)?\//.test(u.pathname) || u.searchParams.has('v')) return e.respondWith(gardeDabord(r));
  e.respondWith(gardeEtRafraichit(e, r));
});
async function reseauDabord(r) {
  const c = await caches.open(CACHE);
  try { const rep = await fetch(r); if (rep.ok) c.put(r, rep.clone()); return rep; }
  catch { return (await c.match(r)) || (await c.match('/')) || Response.error(); }
}
async function gardeDabord(r) {
  const c = await caches.open(CACHE), garde = await c.match(r); if (garde) return garde;
  const rep = await fetch(r); if (rep.ok && rep.status === 200) c.put(r, rep.clone()); return rep;
}
async function gardeEtRafraichit(e, r) {
  const c = await caches.open(CACHE), garde = await c.match(r);
  const frais = fetch(r).then(rep => { if (rep.ok && rep.status === 200) c.put(r, rep.clone()); return rep; });
  if (garde) { e.waitUntil(frais.catch(() => { })); return garde; }
  return frais;
}
