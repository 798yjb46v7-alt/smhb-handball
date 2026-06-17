// SMHB Service Worker v2.0
const CACHE_NAME = 'smhb-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ne pas intercepter les requetes Supabase (WebSocket et API)
  if (event.request.url.includes('supabase.co')) return;
  
  // Pour les autres requetes, reseau d'abord
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
